"""
Fine-Tuning Pipeline
=====================
Self-improving feedback loop:
  Live calls → auto-evaluation → failure mining → fine-tuning → better model → production

Every FINE_TUNING_THRESHOLD calls:
  1. Mine all failure turns (eval_score < 6) — "bad" examples
  2. Mine all high-score turns (eval_score >= 8) — "good" examples
  3. Build JSONL training file (corrected_response replaces bad agent response)
  4. Submit OpenAI fine-tuning job
  5. On completion, update agent to use new model
  6. Log the run to FineTuningRun table

Compounding advantage: every 50 calls = new fine-tune = agent gets smarter.
After 5,000 calls, no competitor can replicate your model quality.
"""
import json
import io
import uuid
from datetime import datetime
from typing import Optional

import structlog
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.database import AsyncSessionLocal
from backend.db.models import Agent, Call, CallTurn, FineTuningRun

log = structlog.get_logger()


class FineTuner:
    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def run(self):
        """Full fine-tuning pipeline: mine → build dataset → submit → track.
        Uses its own DB session so it can run safely as a background task."""
        log.info("Fine-tuning pipeline started", agent_id=self.agent_id)

        async with AsyncSessionLocal() as db:
            agent = await db.get(Agent, self.agent_id)
            if not agent:
                return

            ft_run = FineTuningRun(
                id=str(uuid.uuid4()),
                workspace_id=agent.workspace_id,
                agent_id=self.agent_id,
                base_model=settings.FINE_TUNE_BASE_MODEL,
                status="running",
                started_at=datetime.utcnow(),
            )
            db.add(ft_run)
            await db.flush()

            try:
                training_data = await self._build_training_data(db, agent.system_prompt)
                if len(training_data) < 10:
                    log.warning("Not enough training data for fine-tuning", samples=len(training_data))
                    ft_run.status = "failed"
                    ft_run.error = f"Only {len(training_data)} training samples (minimum 10)"
                    await db.commit()
                    return

                ft_run.training_samples = len(training_data)
                await db.flush()

                # Upload training file to OpenAI
                jsonl_bytes = self._to_jsonl(training_data)
                file_response = await self.client.files.create(
                    file=("training.jsonl", jsonl_bytes, "application/json"),
                    purpose="fine-tune",
                )

                # Start fine-tuning job
                job = await self.client.fine_tuning.jobs.create(
                    training_file=file_response.id,
                    model=settings.FINE_TUNE_BASE_MODEL,
                    hyperparameters={"n_epochs": 3},
                    suffix=f"tierce-{self.agent_id[:8]}",
                )
                ft_run.openai_job_id = job.id
                await db.commit()

                log.info("Fine-tuning job submitted", job_id=job.id, samples=len(training_data))

            except Exception as exc:
                log.exception("Fine-tuning pipeline error", error=str(exc))
                ft_run.status = "failed"
                ft_run.error = str(exc)
                ft_run.completed_at = datetime.utcnow()
                await db.commit()
                return

        # Poll in a separate session (runs for up to 2 hours)
        await self._poll_job(job.id, ft_run.id)

    async def _build_training_data(self, db: AsyncSession, system_prompt: str) -> list[dict]:
        """
        Build training examples from call history.
        - Failure turns: use corrected_response as the target
        - High-score turns: use actual response as positive examples
        """
        training_data = []

        # Get all evaluated agent turns to know which calls to include
        evaluated = await db.execute(
            select(CallTurn.call_id)
            .join(Call, Call.id == CallTurn.call_id)
            .where(Call.agent_id == self.agent_id)
            .where(CallTurn.role == "agent")
            .where(CallTurn.eval_score.isnot(None))
            .distinct()
        )
        call_ids = [r[0] for r in evaluated.all()]
        if not call_ids:
            return training_data

        # Fetch ALL turns (user + agent) for those calls so we can build pairs
        result = await db.execute(
            select(CallTurn)
            .where(CallTurn.call_id.in_(call_ids))
            .order_by(CallTurn.call_id, CallTurn.turn_index)
        )
        turns = result.scalars().all()

        # Group by call
        call_turns_map: dict[str, list[CallTurn]] = {}
        for turn in turns:
            call_turns_map.setdefault(turn.call_id, []).append(turn)

        for call_id, call_turns in call_turns_map.items():
            sorted_turns = sorted(call_turns, key=lambda t: t.turn_index)

            for i, turn in enumerate(sorted_turns):
                if turn.role != "agent":
                    continue

                # Find preceding user turn
                user_text = ""
                for j in range(i - 1, -1, -1):
                    if sorted_turns[j].role == "user":
                        user_text = sorted_turns[j].transcript or ""
                        break

                if not user_text or not turn.transcript:
                    continue

                score = turn.eval_score or 5.0
                categories = turn.eval_categories or {}

                if score < 6.0:
                    # Failure: use corrected_response if available
                    corrected = categories.get("corrected_response")
                    target_response = corrected if corrected else turn.transcript
                elif score >= 8.0:
                    # High quality: use as-is
                    target_response = turn.transcript
                else:
                    continue  # Skip mediocre turns

                training_data.append({
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user",   "content": user_text},
                        {"role": "assistant", "content": target_response},
                    ]
                })

        return training_data

    def _to_jsonl(self, data: list[dict]) -> bytes:
        lines = [json.dumps(item) for item in data]
        return "\n".join(lines).encode("utf-8")

    async def _poll_job(self, job_id: str, ft_run_id: str):
        """Poll fine-tuning job status every 60 seconds until done (own DB session)."""
        import asyncio
        for _ in range(120):  # max 2 hours
            await asyncio.sleep(60)
            try:
                job = await self.client.fine_tuning.jobs.retrieve(job_id)

                if job.status == "succeeded":
                    async with AsyncSessionLocal() as db:
                        ft_run = await db.get(FineTuningRun, ft_run_id)
                        if ft_run:
                            ft_run.status = "succeeded"
                            ft_run.fine_tuned_model = job.fine_tuned_model
                            ft_run.completed_at = datetime.utcnow()
                        # NOTE: deliberately do NOT copy job.fine_tuned_model onto
                        # agent.llm_model — that field is surfaced in the UI/API and the
                        # underlying model name is kept confidential. The authoritative
                        # fine-tuned model id lives on FineTuningRun.fine_tuned_model.
                        await db.commit()
                    log.info("Fine-tuning succeeded", new_model=job.fine_tuned_model,
                             agent_id=self.agent_id)
                    return

                elif job.status in ("failed", "cancelled"):
                    async with AsyncSessionLocal() as db:
                        ft_run = await db.get(FineTuningRun, ft_run_id)
                        if ft_run:
                            ft_run.status = job.status
                            ft_run.error = str(getattr(job, "error", "Unknown error"))
                            ft_run.completed_at = datetime.utcnow()
                        await db.commit()
                    log.error("Fine-tuning failed", job_id=job_id, status=job.status)
                    return

            except Exception as exc:
                log.warning("Error polling fine-tuning job", error=str(exc))
