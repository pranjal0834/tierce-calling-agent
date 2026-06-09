"""
Auto-Evaluation Engine
========================
After every call:
  1. LLM grades each agent turn (1-10) on: relevance, empathy, clarity, goal alignment
  2. Identifies failure turns (score < 6)
  3. Triggers fine-tuning if enough failures accumulated (every N calls)

Grading criteria:
  - relevance:      Did the agent directly address what the user said?
  - empathy:        Did the agent match the emotional context?
  - clarity:        Was the response clear and easy to understand?
  - goal_alignment: Did the response move toward the call's objective?
"""
import json
from typing import Optional

import structlog
from openai import AsyncOpenAI
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.models import Call, CallTurn, Agent, FineTuningRun

log = structlog.get_logger()

_EVAL_SYSTEM_PROMPT = """You are an expert quality evaluator for AI voice call agents.
Grade the AGENT response on 4 criteria (each 1-10):
- relevance: how directly it addresses what the user said
- empathy: how well it matches user's emotional state
- clarity: how clear and natural it sounds in a voice call
- goal_alignment: how well it advances the call's objective

Also identify if this is a FAILURE turn (any score < 6).
If failure, provide a corrected response.

Respond ONLY with valid JSON:
{
  "relevance": 8, "empathy": 7, "clarity": 9, "goal_alignment": 8,
  "overall": 8.0,
  "is_failure": false,
  "failure_category": null,
  "corrected_response": null,
  "feedback": "one sentence"
}"""


class CallEvaluator:
    def __init__(self, db: AsyncSession, call_id: str):
        self.db = db
        self.call_id = call_id
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def evaluate_call(self, turns: list[CallTurn]):
        """Evaluate all agent turns in a call. Save scores. Check fine-tuning threshold."""
        log.info("Evaluating call", call_id=self.call_id, turns=len(turns))

        call = await self.db.get(Call, self.call_id)
        if not call:
            return

        # Build turn pairs for context
        turn_pairs = self._build_turn_pairs(turns)

        failure_count = 0
        total_score = 0.0
        agent_turns = 0

        for user_text, agent_text, agent_turn in turn_pairs:
            if not agent_text:
                continue

            eval_result = await self._grade_turn(
                user_text=user_text,
                agent_text=agent_text,
                call_objective=call.extra_data.get("objective", "Complete the call successfully"),
            )

            agent_turn.eval_score = eval_result.get("overall", 5.0)
            agent_turn.eval_feedback = eval_result.get("feedback", "")
            agent_turn.eval_categories = {
                "relevance":      eval_result.get("relevance", 5),
                "empathy":        eval_result.get("empathy", 5),
                "clarity":        eval_result.get("clarity", 5),
                "goal_alignment": eval_result.get("goal_alignment", 5),
            }

            if eval_result.get("is_failure"):
                failure_count += 1
                agent_turn.eval_categories["failure_category"] = eval_result.get("failure_category")
                agent_turn.eval_categories["corrected_response"] = eval_result.get("corrected_response")

            total_score += agent_turn.eval_score
            agent_turns += 1

        # Update call-level sentiment score (repurposing as quality score)
        if agent_turns > 0:
            call.sentiment_score = total_score / agent_turns

        await self.db.flush()
        log.info(
            "Call evaluation complete",
            call_id=self.call_id,
            avg_score=call.sentiment_score,
            failures=failure_count,
        )

        # Check if we should trigger fine-tuning
        await self._maybe_trigger_fine_tuning(call.agent_id)

    async def _grade_turn(
        self,
        user_text: str,
        agent_text: str,
        call_objective: str,
    ) -> dict:
        prompt = (
            f"Call objective: {call_objective}\n\n"
            f"User said: \"{user_text}\"\n"
            f"Agent responded: \"{agent_text}\""
        )
        try:
            response = await self.client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[
                    {"role": "system", "content": _EVAL_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=200,
                temperature=0,
                response_format={"type": "json_object"},
            )
            try:
                from backend.core import cost_meter
                cost_meter.record_mini(self.call_id, "evaluation", response.usage)
            except Exception:
                pass
            return json.loads(response.choices[0].message.content)
        except Exception as exc:
            log.warning("Turn evaluation failed", error=str(exc))
            return {"overall": 5.0, "is_failure": False}

    def _build_turn_pairs(
        self, turns: list[CallTurn]
    ) -> list[tuple[str, str, CallTurn]]:
        """Return (user_text, agent_text, agent_turn) pairs for evaluation."""
        pairs = []
        sorted_turns = sorted(turns, key=lambda t: t.turn_index)
        for i, turn in enumerate(sorted_turns):
            if turn.role == "agent":
                prev_user = ""
                for j in range(i - 1, -1, -1):
                    if sorted_turns[j].role == "user":
                        prev_user = sorted_turns[j].transcript or ""
                        break
                pairs.append((prev_user, turn.transcript or "", turn))
        return pairs

    async def _maybe_trigger_fine_tuning(self, agent_id: str):
        """Trigger a fine-tuning run every N calls with enough failure data."""
        if not settings.AUTO_FINE_TUNE:
            return

        # Count calls since last fine-tuning run
        ft_result = await self.db.execute(
            select(FineTuningRun)
            .where(FineTuningRun.agent_id == agent_id)
            .where(FineTuningRun.status == "succeeded")
            .order_by(FineTuningRun.created_at.desc())
            .limit(1)
        )
        last_run = ft_result.scalar_one_or_none()

        # Count calls since last run
        call_count_q = select(func.count(Call.id)).where(Call.agent_id == agent_id)
        if last_run and last_run.completed_at:
            call_count_q = call_count_q.where(Call.created_at > last_run.completed_at)
        total_since = (await self.db.execute(call_count_q)).scalar() or 0

        if total_since >= settings.FINE_TUNING_THRESHOLD:
            log.info(
                "Self-improvement threshold reached",
                agent_id=agent_id,
                calls_since_last=total_since,
            )
            # Commit so the learner's fresh session can see the eval scores.
            await self.db.commit()
            # Prompt-based learning (works on native audio) instead of fine-tuning
            # (a fine-tuned text model can't run in the Realtime API).
            from backend.features.feedback_loop.prompt_learner import PromptLearner
            import asyncio
            asyncio.create_task(PromptLearner(agent_id=agent_id).run())
