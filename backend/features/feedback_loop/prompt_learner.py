"""
Prompt-based Self-Improvement (native-audio feedback loop)
==========================================================
Closes the self-improving loop WITHOUT fine-tuning. A fine-tuned text model
cannot run in the Realtime (native audio) API, so instead of retraining a model
we distill what the evaluator learned into the agent's own instructions:

  Live calls → per-turn evaluation (scores + corrected_response) → mine failures
  + good examples → distill into concise coaching guidance → store on the agent
  → injected into every future call's system prompt → better calls.

Because the guidance lives in the system prompt, it DOES feed back into native
audio calls (unlike fine-tuning). Runs as a background task every N calls.
"""
import structlog
from datetime import datetime
from typing import Optional

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from backend.config import settings
from backend.db.database import AsyncSessionLocal
from backend.db.models import Agent, Call, CallTurn, FineTuningRun

log = structlog.get_logger()

_MAX_FAILURES = 30
_MAX_POSITIVES = 10

_DISTILL_SYSTEM = """You are a coach improving a voice AI agent based on reviews of its past calls.
You are given: (a) the agent's current learned guidance (may be empty), (b) mistakes it made
with the better response it should have given, and (c) examples of responses that scored well.

Write CONCISE, ACTIONABLE guidance the agent should follow on future calls — refine and extend
the current guidance, don't just repeat it. Rules:
- 5-12 short bullet points, imperative voice ("Do X", "Avoid Y").
- Focus on recurring patterns, not one-off wording.
- Capture what the good examples do right and what the mistakes got wrong.
- No preamble, no numbering — just the bullets. Keep the whole thing under 200 words."""


class PromptLearner:
    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def run(self):
        log.info("Prompt-learning started", agent_id=self.agent_id)
        async with AsyncSessionLocal() as db:
            agent = await db.get(Agent, self.agent_id)
            if not agent:
                return

            run = FineTuningRun(
                workspace_id=agent.workspace_id,
                agent_id=self.agent_id,
                base_model="prompt-learning",
                status="running",
                started_at=datetime.utcnow(),
            )
            db.add(run)
            await db.flush()

            try:
                failures, positives = await self._mine(db)
                if len(failures) + len(positives) < 5:
                    run.status = "failed"
                    run.error = f"Not enough evaluated examples ({len(failures)+len(positives)})"
                    await db.commit()
                    log.info("Prompt-learning skipped — too little data", agent_id=self.agent_id)
                    return

                current = (agent.config or {}).get("learned_guidance", "")
                guidance = await self._distill(current, failures, positives)
                if not guidance:
                    run.status = "failed"
                    run.error = "Distillation returned empty guidance"
                    await db.commit()
                    return

                cfg = dict(agent.config or {})
                cfg["learned_guidance"] = guidance
                cfg["learned_guidance_updated_at"] = datetime.utcnow().isoformat()
                agent.config = cfg
                flag_modified(agent, "config")

                run.status = "succeeded"
                run.training_samples = len(failures) + len(positives)
                run.fine_tuned_model = "prompt-guidance"
                run.completed_at = datetime.utcnow()
                await db.commit()
                log.info("Prompt-learning complete", agent_id=self.agent_id,
                         failures=len(failures), positives=len(positives),
                         guidance_chars=len(guidance))
            except Exception as exc:
                log.exception("Prompt-learning error", agent_id=self.agent_id, error=str(exc))
                try:
                    run.status = "failed"
                    run.error = str(exc)[:500]
                    run.completed_at = datetime.utcnow()
                    await db.commit()
                except Exception:
                    pass

    async def _mine(self, db) -> tuple[list[dict], list[dict]]:
        """Return (failures, positives) from this agent's evaluated turns."""
        # Calls for this agent that have evaluated turns
        call_ids = [r[0] for r in (await db.execute(
            select(CallTurn.call_id)
            .join(Call, Call.id == CallTurn.call_id)
            .where(Call.agent_id == self.agent_id)
            .where(CallTurn.role == "agent")
            .where(CallTurn.eval_score.isnot(None))
            .distinct()
        )).all()]
        if not call_ids:
            return [], []

        turns = (await db.execute(
            select(CallTurn)
            .where(CallTurn.call_id.in_(call_ids))
            .order_by(CallTurn.call_id, CallTurn.turn_index)
        )).scalars().all()

        by_call: dict[str, list[CallTurn]] = {}
        for t in turns:
            by_call.setdefault(t.call_id, []).append(t)

        failures, positives = [], []
        for call_turns in by_call.values():
            ordered = sorted(call_turns, key=lambda t: t.turn_index)
            for i, turn in enumerate(ordered):
                if turn.role != "agent" or not turn.transcript:
                    continue
                user_text = ""
                for j in range(i - 1, -1, -1):
                    if ordered[j].role == "user":
                        user_text = ordered[j].transcript or ""
                        break
                if not user_text:
                    continue
                score = turn.eval_score or 5.0
                cats = turn.eval_categories or {}
                if score < 6.0:
                    failures.append({
                        "user": user_text,
                        "bad": turn.transcript,
                        "corrected": cats.get("corrected_response") or "",
                        "feedback": turn.eval_feedback or cats.get("failure_category") or "",
                    })
                elif score >= 8.0:
                    positives.append({"user": user_text, "good": turn.transcript})

        # Most recent first, capped
        return failures[-_MAX_FAILURES:], positives[-_MAX_POSITIVES:]

    async def _distill(self, current: str, failures: list[dict], positives: list[dict]) -> Optional[str]:
        parts = []
        if current:
            parts.append(f"CURRENT GUIDANCE:\n{current}\n")
        if failures:
            parts.append("MISTAKES (caller → what agent said [bad] → better response → why):")
            for f in failures:
                line = f'- Caller: "{f["user"][:200]}" | Agent said: "{f["bad"][:200]}"'
                if f["corrected"]:
                    line += f' | Better: "{f["corrected"][:200]}"'
                if f["feedback"]:
                    line += f' | Issue: {f["feedback"][:150]}'
                parts.append(line)
        if positives:
            parts.append("\nGOOD EXAMPLES (caller → strong agent response):")
            for p in positives:
                parts.append(f'- Caller: "{p["user"][:200]}" | Agent: "{p["good"][:200]}"')

        user_content = "\n".join(parts)
        try:
            resp = await self.client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[
                    {"role": "system", "content": _DISTILL_SYSTEM},
                    {"role": "user", "content": user_content},
                ],
                max_tokens=400,
                temperature=0.3,
            )
            return (resp.choices[0].message.content or "").strip()
        except Exception as exc:
            log.warning("Distillation call failed", agent_id=self.agent_id, error=str(exc))
            return None
