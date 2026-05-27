"""
AssistantManager — entry point for each WebSocket call connection.
Loads the agent + contact from DB, creates a TaskManager, and runs it.
"""
import uuid
from datetime import datetime
from typing import Optional

import structlog
from fastapi import WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Agent, Call, Contact
from backend.core.task_manager import TaskManager

log = structlog.get_logger()


class AssistantManager:
    def __init__(
        self,
        agent_id: str,
        call_id: str,
        websocket: WebSocket,
        db: AsyncSession,
        redis,
    ):
        self.agent_id = agent_id
        self.call_id = call_id
        self.ws = websocket
        self.db = db
        self.redis = redis

    async def run(self):
        agent = await self.db.get(Agent, self.agent_id)
        if not agent or not agent.is_active:
            await self.ws.send_json({"event": "error", "data": "Agent not found"})
            await self.ws.close()
            return

        # Resolve or create the Call record
        call = await self.db.get(Call, self.call_id)
        if not call:
            call = Call(
                id=self.call_id,
                workspace_id=agent.workspace_id,
                agent_id=agent.id,
                phone_number="unknown",
                direction="inbound",
                status="in_progress",
                pipeline_mode=agent.pipeline_mode,
                started_at=datetime.utcnow(),
            )
            self.db.add(call)
            await self.db.flush()

        # Try to find contact by phone (set after telephony start event)
        contact: Optional[Contact] = None

        log.info(
            "AssistantManager.run",
            agent_id=agent.id,
            call_id=call.id,
            pipeline=agent.pipeline_mode,
        )

        task_manager = TaskManager(
            agent=agent,
            call=call,
            contact=contact,
            websocket=self.ws,
            db=self.db,
            redis=self.redis,
        )

        try:
            call.status = "in_progress"
            call.started_at = datetime.utcnow()
            await self.db.flush()

            await task_manager.run()

        finally:
            # For the classic pipeline: finalize the call record.
            # For the native pipeline: _persist_cost() already set status/duration via a
            # fresh session; this commit flushes any remaining self.db changes (evaluator
            # scores, extraction merge). The 'call' object here may be the placeholder
            # (detached) for outbound calls — setting attributes on it is harmless.
            _terminal = {"completed", "voicemail", "not_answered", "failed", "cancelled"}
            if call.status not in _terminal:
                call.status = "completed"
            call.ended_at = datetime.utcnow()
            if call.started_at:
                call.duration_seconds = int(
                    (call.ended_at - call.started_at).total_seconds()
                )
            try:
                await self.db.commit()
            except Exception as exc:
                log.warning("Final call commit failed", call_id=self.call_id, error=str(exc))

            # Deduct credits for this call
            if call.duration_seconds and call.duration_seconds > 0:
                try:
                    from backend.db.database import AsyncSessionLocal
                    from backend.billing.credits import deduct_credits
                    async with AsyncSessionLocal() as billing_db:
                        await deduct_credits(
                            db=billing_db,
                            workspace_id=call.workspace_id,
                            duration_seconds=call.duration_seconds,
                            call_id=call.id,
                        )
                        await billing_db.commit()
                except Exception as exc:
                    log.warning("Credit deduction failed", call_id=self.call_id, error=str(exc))

            log.info("WebSocket session closed", call_id=self.call_id)
