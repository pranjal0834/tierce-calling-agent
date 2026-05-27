"""
Call Scheduling API
POST /api/scheduling        — schedule a single call
POST /api/scheduling/bulk   — schedule multiple contacts
GET  /api/scheduling        — list scheduled calls (filter: status)
DELETE /api/scheduling/{id} — cancel a pending scheduled call
"""
import uuid
from datetime import timezone as _tz
from typing import List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_workspace, get_current_user
from backend.db.database import get_db
from backend.db.models import Agent, ScheduledCall, User, Workspace
from backend.models.schemas import (
    BulkScheduleRequest,
    ScheduleCallRequest,
    ScheduledCallOut,
)
from backend.utils.phone import normalize_phone

log = structlog.get_logger()
router = APIRouter()


@router.post("", response_model=ScheduledCallOut, status_code=201)
async def schedule_call(
    payload: ScheduleCallRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await db.get(Agent, payload.agent_id)
    if not agent or not agent.is_active or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.is_personal and agent.created_by != user.id:
        raise HTTPException(status_code=403, detail="Cannot schedule calls with another member's personal agent")

    phone = normalize_phone(payload.phone_number)
    # Convert to naive UTC — PostgreSQL TIMESTAMP WITHOUT TIME ZONE rejects aware datetimes
    scheduled_at = payload.scheduled_at.astimezone(_tz.utc).replace(tzinfo=None)
    sc = ScheduledCall(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        agent_id=payload.agent_id,
        phone_number=phone,
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        scheduled_at=scheduled_at,
        timezone=payload.timezone,
        notes=payload.notes,
        status="pending",
    )
    db.add(sc)
    await db.commit()
    await db.refresh(sc)
    log.info("Call scheduled", id=sc.id, phone=phone, scheduled_at=str(sc.scheduled_at))
    return sc


@router.post("/bulk", status_code=201)
async def bulk_schedule(
    payload: BulkScheduleRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await db.get(Agent, payload.agent_id)
    if not agent or not agent.is_active or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.is_personal and agent.created_by != user.id:
        raise HTTPException(status_code=403, detail="Cannot schedule calls with another member's personal agent")

    scheduled_at = payload.scheduled_at.astimezone(_tz.utc).replace(tzinfo=None)
    created = 0
    for contact in payload.contacts:
        phone = normalize_phone(contact.phone_number)
        if not phone:
            continue
        sc = ScheduledCall(
            id=str(uuid.uuid4()),
            workspace_id=workspace.id,
            agent_id=payload.agent_id,
            phone_number=phone,
            contact_name=contact.name,
            contact_email=contact.email,
            scheduled_at=scheduled_at,
            timezone=payload.timezone,
            notes=payload.notes,
            status="pending",
        )
        db.add(sc)
        created += 1

    await db.commit()
    log.info("Bulk calls scheduled", count=created, agent_id=payload.agent_id)
    return {"scheduled": created, "agent_id": payload.agent_id}


@router.get("", response_model=List[ScheduledCallOut])
async def list_scheduled_calls(
    status: Optional[str] = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import or_, and_
    q = (
        select(ScheduledCall)
        .join(Agent, ScheduledCall.agent_id == Agent.id, isouter=True)
        .where(
            ScheduledCall.workspace_id == workspace.id,
            or_(
                Agent.is_personal == False,
                Agent.is_personal == None,
                and_(Agent.is_personal == True, Agent.created_by == user.id),
            ),
        )
        .order_by(desc(ScheduledCall.scheduled_at))
        .limit(limit)
    )
    if status:
        q = q.where(ScheduledCall.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.delete("/{sc_id}", status_code=204)
async def cancel_scheduled_call(
    sc_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    sc = await db.get(ScheduledCall, sc_id)
    if not sc or sc.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Scheduled call not found")
    if sc.status != "pending":
        raise HTTPException(status_code=409, detail=f"Cannot cancel a call with status '{sc.status}'")
    sc.status = "cancelled"
    await db.commit()
    log.info("Scheduled call cancelled", id=sc_id)
