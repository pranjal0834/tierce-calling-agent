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
            # _persist_cost() already set status/duration via a
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

            # ── Billing ───────────────────────────────────────────────────────
            # Twilio strips WS query params, so `call` above is a placeholder whose
            # duration spans WS-connect → finalize-complete (it includes post-call
            # AI processing time and would OVER-bill the customer). The handler
            # switches to the real pre-created call; its id lives in the call_logger,
            # and its duration_seconds comes straight from Twilio's CallDuration.
            # Bill on that real, accurate duration.
            from backend.db.database import AsyncSessionLocal
            from backend.db.models import Call as _Call

            real_call_id = self.call_id
            try:
                real_call_id = task_manager.call_logger.call_id or self.call_id
            except Exception:
                pass

            bill_seconds = call.duration_seconds or 0
            bill_workspace_id = call.workspace_id
            try:
                async with AsyncSessionLocal() as _rdb:
                    rc = await _rdb.get(_Call, real_call_id)
                    if rc:
                        bill_workspace_id = rc.workspace_id
                        if rc.duration_seconds and rc.duration_seconds > 0:
                            bill_seconds = rc.duration_seconds
                        elif rc.started_at and rc.ended_at:
                            bill_seconds = int((rc.ended_at - rc.started_at).total_seconds())
            except Exception as exc:
                log.warning("Could not resolve real call for billing",
                            call_id=real_call_id, error=str(exc))

            # Deduct credits — retry once on transient failure
            if bill_seconds and bill_seconds > 0:
                import asyncio as _asyncio
                from backend.billing.credits import deduct_credits
                for _attempt in range(2):
                    try:
                        async with AsyncSessionLocal() as billing_db:
                            await deduct_credits(
                                db=billing_db,
                                workspace_id=bill_workspace_id,
                                duration_seconds=bill_seconds,
                                call_id=real_call_id,
                            )
                            await billing_db.commit()
                        break  # success
                    except Exception as exc:
                        if _attempt == 0:
                            await _asyncio.sleep(2)
                        else:
                            log.error(
                                "Credit deduction failed after retry — balance not updated",
                                call_id=real_call_id,
                                workspace_id=bill_workspace_id,
                                duration_seconds=bill_seconds,
                                error=str(exc),
                            )

            log.info("WebSocket session closed", call_id=self.call_id)
