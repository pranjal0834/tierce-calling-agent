"""
Compliance API:
  GET    /api/compliance/dnc          — list DNC / suppression entries
  POST   /api/compliance/dnc          — add number(s) to DNC
  DELETE /api/compliance/dnc/{id}     — remove a DNC entry
  GET    /api/compliance/settings     — calling-window (quiet hours) settings
  PUT    /api/compliance/settings     — update calling-window settings
  GET    /api/compliance/stats        — opt-out / short-call monitoring
"""
import uuid
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_workspace, get_current_user
from backend.core import compliance
from backend.db.database import get_db
from backend.db.models import DncEntry, User, Workspace
from backend.utils.phone import normalize_phone

log = structlog.get_logger()
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class DncAddRequest(BaseModel):
    numbers: list[str]
    reason: str | None = None


class CallingWindowRequest(BaseModel):
    calling_window_enabled: bool
    calling_start_hour: int = 9
    calling_end_hour: int = 21
    calling_timezone: str = "Asia/Kolkata"


# ── DNC list ──────────────────────────────────────────────────────────────────

@router.get("/dnc")
async def list_dnc(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(DncEntry).where(DncEntry.workspace_id == workspace.id)
        .order_by(desc(DncEntry.created_at))
    )).scalars().all()
    return [
        {"id": r.id, "phone_number": r.phone_number, "reason": r.reason,
         "source": r.source, "created_at": r.created_at.isoformat() if r.created_at else None}
        for r in rows
    ]


@router.post("/dnc", status_code=201)
async def add_dnc(
    body: DncAddRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    added, skipped = 0, 0
    for raw in body.numbers:
        phone = normalize_phone(raw or "")
        if not phone:
            skipped += 1
            continue
        if await compliance.add_to_dnc(db, workspace.id, phone, reason=body.reason, source="manual"):
            added += 1
        else:
            skipped += 1
    await db.commit()
    log.info("DNC numbers added", workspace_id=workspace.id, added=added, skipped=skipped)
    return {"added": added, "skipped": skipped}


@router.delete("/dnc/{entry_id}", status_code=204)
async def remove_dnc(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    row = await db.get(DncEntry, entry_id)
    if not row or row.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(row)
    await db.commit()


# ── Calling window ──────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    return {
        "calling_window_enabled": getattr(workspace, "calling_window_enabled", False),
        "calling_start_hour": getattr(workspace, "calling_start_hour", 9),
        "calling_end_hour": getattr(workspace, "calling_end_hour", 21),
        "calling_timezone": getattr(workspace, "calling_timezone", "Asia/Kolkata"),
    }


@router.put("/settings")
async def save_settings(
    body: CallingWindowRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    start = max(0, min(23, int(body.calling_start_hour)))
    end = max(0, min(24, int(body.calling_end_hour)))
    ws = await db.get(Workspace, workspace.id)
    ws.calling_window_enabled = bool(body.calling_window_enabled)
    ws.calling_start_hour = start
    ws.calling_end_hour = end
    ws.calling_timezone = (body.calling_timezone or "Asia/Kolkata").strip()
    await db.commit()
    return {"ok": True}


# ── Monitoring ──────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    days = max(1, min(int(days or 30), 180))
    return await compliance.compliance_stats(db, workspace.id, days=days)
