"""
Super Admin API — platform-level visibility and control.
All endpoints require the caller's email to be in ADMIN_EMAILS env var.

GET  /api/admin/stats                        — platform overview KPIs
GET  /api/admin/workspaces                   — all workspaces with stats
GET  /api/admin/workspaces/{id}              — single workspace detail
POST /api/admin/workspaces/{id}/credits      — manually add/deduct credits
PUT  /api/admin/workspaces/{id}/status       — enable / disable workspace
GET  /api/admin/users                        — all users across platform
GET  /api/admin/calls                        — recent calls across platform
"""
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_superadmin
from backend.db.database import get_db
from backend.db.models import (
    Agent, Call, CreditTransaction, User, Workspace,
)

log = structlog.get_logger()
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreditAdjustRequest(BaseModel):
    minutes: float          # positive = add, negative = deduct
    reason: str = ""


class WorkspaceStatusRequest(BaseModel):
    is_active: bool


# ── Platform stats ────────────────────────────────────────────────────────────

@router.get("/stats")
async def platform_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    total_workspaces = (await db.execute(func.count(Workspace.id).select())).scalar() or 0
    total_users      = (await db.execute(func.count(User.id).select())).scalar() or 0
    total_calls      = (await db.execute(func.count(Call.id).select())).scalar() or 0
    total_agents     = (await db.execute(func.count(Agent.id).select())).scalar() or 0

    # Revenue — sum of purchase transactions
    rev_result = await db.execute(
        select(func.sum(CreditTransaction.amount_paid)).where(
            CreditTransaction.type == "purchase",
            CreditTransaction.amount_paid.isnot(None),
        )
    )
    total_revenue = rev_result.scalar() or 0.0

    # Calls in last 24h
    since = datetime.utcnow() - timedelta(hours=24)
    calls_24h = (await db.execute(
        select(func.count(Call.id)).where(Call.created_at >= since)
    )).scalar() or 0

    # New workspaces in last 7 days
    since7 = datetime.utcnow() - timedelta(days=7)
    new_workspaces_7d = (await db.execute(
        select(func.count(Workspace.id)).where(Workspace.created_at >= since7)
    )).scalar() or 0

    return {
        "total_workspaces": total_workspaces,
        "total_users": total_users,
        "total_calls": total_calls,
        "total_agents": total_agents,
        "total_revenue_usd": round(float(total_revenue), 2),
        "calls_last_24h": calls_24h,
        "new_workspaces_7d": new_workspaces_7d,
    }


# ── Workspaces ────────────────────────────────────────────────────────────────

@router.get("/workspaces")
async def list_workspaces(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    result = await db.execute(
        select(Workspace).order_by(desc(Workspace.created_at)).limit(limit)
    )
    workspaces = result.scalars().all()

    rows = []
    for ws in workspaces:
        # member count
        mc = (await db.execute(
            select(func.count(User.id)).where(User.workspace_id == ws.id)
        )).scalar() or 0

        # call count
        cc = (await db.execute(
            select(func.count(Call.id)).where(Call.workspace_id == ws.id)
        )).scalar() or 0

        # agent count
        ac = (await db.execute(
            select(func.count(Agent.id)).where(Agent.workspace_id == ws.id)
        )).scalar() or 0

        # total purchased minutes
        purchased = (await db.execute(
            select(func.sum(CreditTransaction.minutes)).where(
                CreditTransaction.workspace_id == ws.id,
                CreditTransaction.type == "purchase",
            )
        )).scalar() or 0.0

        rows.append({
            "id": ws.id,
            "name": ws.name,
            "plan": ws.plan,
            "is_active": ws.is_active,
            "credits_balance": ws.credits_balance,
            "member_count": mc,
            "call_count": cc,
            "agent_count": ac,
            "total_purchased_minutes": round(float(purchased), 1),
            "created_at": ws.created_at.isoformat() if ws.created_at else None,
        })
    return rows


@router.get("/workspaces/{ws_id}")
async def get_workspace_detail(
    ws_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    ws = await db.get(Workspace, ws_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    members_res = await db.execute(select(User).where(User.workspace_id == ws_id))
    members = [
        {"id": u.id, "email": u.email, "role": u.role, "is_active": u.is_active,
         "created_at": u.created_at.isoformat() if u.created_at else None}
        for u in members_res.scalars().all()
    ]

    agents_res = await db.execute(
        select(Agent).where(Agent.workspace_id == ws_id).order_by(desc(Agent.created_at)).limit(20)
    )
    agents = [
        {"id": a.id, "name": a.name, "pipeline_mode": a.pipeline_mode, "is_active": a.is_active}
        for a in agents_res.scalars().all()
    ]

    calls_res = await db.execute(
        select(Call).where(Call.workspace_id == ws_id).order_by(desc(Call.created_at)).limit(10)
    )
    calls = [
        {"id": c.id, "phone_number": c.phone_number, "status": c.status,
         "duration_seconds": c.duration_seconds,
         "created_at": c.created_at.isoformat() if c.created_at else None}
        for c in calls_res.scalars().all()
    ]

    txs_res = await db.execute(
        select(CreditTransaction).where(CreditTransaction.workspace_id == ws_id)
        .order_by(desc(CreditTransaction.created_at)).limit(20)
    )
    transactions = [
        {"id": t.id, "type": t.type, "minutes": t.minutes, "balance_after": t.balance_after,
         "description": t.description, "amount_paid": t.amount_paid, "currency": t.currency,
         "created_at": t.created_at.isoformat() if t.created_at else None}
        for t in txs_res.scalars().all()
    ]

    return {
        "id": ws.id,
        "name": ws.name,
        "plan": ws.plan,
        "is_active": ws.is_active,
        "credits_balance": ws.credits_balance,
        "created_at": ws.created_at.isoformat() if ws.created_at else None,
        "members": members,
        "agents": agents,
        "recent_calls": calls,
        "transactions": transactions,
    }


@router.post("/workspaces/{ws_id}/credits")
async def adjust_credits(
    ws_id: str,
    payload: CreditAdjustRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    from backend.billing.credits import add_credits
    if payload.minutes == 0:
        raise HTTPException(status_code=400, detail="minutes cannot be zero")

    tx_type = "purchase" if payload.minutes > 0 else "deduction"
    new_balance = await add_credits(
        db=db,
        workspace_id=ws_id,
        minutes=payload.minutes,
        tx_type=tx_type,
        description=f"Manual adjustment by admin: {payload.reason or 'no reason given'}",
    )
    await db.commit()
    log.info("Admin credit adjustment", ws_id=ws_id, minutes=payload.minutes, admin=admin.email)
    return {"new_balance": new_balance, "adjusted_minutes": payload.minutes}


@router.put("/workspaces/{ws_id}/status")
async def set_workspace_status(
    ws_id: str,
    payload: WorkspaceStatusRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    ws = await db.get(Workspace, ws_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ws.is_active = payload.is_active
    await db.commit()
    log.info("Workspace status changed", ws_id=ws_id, is_active=payload.is_active, admin=admin.email)
    return {"id": ws_id, "is_active": ws.is_active}


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_all_users(
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    result = await db.execute(
        select(User).order_by(desc(User.created_at)).limit(limit)
    )
    users = result.scalars().all()

    rows = []
    for u in users:
        ws = await db.get(Workspace, u.workspace_id)
        rows.append({
            "id": u.id,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "workspace_id": u.workspace_id,
            "workspace_name": ws.name if ws else "—",
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })
    return rows


# ── Calls ─────────────────────────────────────────────────────────────────────

@router.get("/calls")
async def list_all_calls(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    result = await db.execute(
        select(Call).order_by(desc(Call.created_at)).limit(limit)
    )
    calls = result.scalars().all()

    rows = []
    for c in calls:
        ws = await db.get(Workspace, c.workspace_id)
        rows.append({
            "id": c.id,
            "workspace_name": ws.name if ws else "—",
            "phone_number": c.phone_number,
            "direction": c.direction,
            "status": c.status,
            "duration_seconds": c.duration_seconds,
            "pipeline_mode": c.pipeline_mode,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    return rows
