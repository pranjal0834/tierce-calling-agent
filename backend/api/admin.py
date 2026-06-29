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
GET  /api/admin/costs                         — AI cost (COGS) rollup — owner only
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


# ── Delete user ───────────────────────────────────────────────────────────────

@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    """
    Permanently delete a user account.
    If they are the sole member of their workspace, the workspace is also
    deleted (agents, calls, transactions removed in dependency order).
    Super admins cannot delete themselves.
    """
    from sqlalchemy import text

    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own super admin account")

    ws_id = target.workspace_id
    members_count = (await db.execute(
        select(func.count(User.id)).where(User.workspace_id == ws_id)
    )).scalar() or 0

    is_sole_member = members_count <= 1

    if is_sole_member:
        # Delete in FK dependency order so no constraint violations
        await db.execute(text("DELETE FROM notification_preferences WHERE user_id = :uid"), {"uid": user_id})
        await db.execute(text("DELETE FROM api_keys WHERE workspace_id = :ws"), {"ws": ws_id})
        await db.execute(text("DELETE FROM credit_transactions WHERE workspace_id = :ws"), {"ws": ws_id})
        await db.execute(text("DELETE FROM calls WHERE workspace_id = :ws"), {"ws": ws_id})
        await db.execute(text("DELETE FROM agents WHERE workspace_id = :ws"), {"ws": ws_id})
        await db.execute(text("DELETE FROM users WHERE workspace_id = :ws"), {"ws": ws_id})
        await db.execute(text("DELETE FROM workspaces WHERE id = :ws"), {"ws": ws_id})
    else:
        # Multi-member workspace — remove only this user and their prefs
        await db.execute(text("DELETE FROM notification_preferences WHERE user_id = :uid"), {"uid": user_id})
        await db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": user_id})

    await db.commit()
    log.info("User deleted by admin", user_id=user_id, email=target.email,
             workspace_deleted=is_sole_member, admin=admin.email)


# ── Cost analytics (COGS) — owner only ────────────────────────────────────────

@router.get("/costs")
async def cost_analytics(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """
    Platform AI cost rollup over the last `days`. Splits the realtime audio cost
    from the auxiliary models (speculation, sentiment, evaluation, extraction,
    summary, TTS, embeddings) and compares against approximate revenue.
    Visible to super admins only — never exposed to tenants.
    """
    days = max(int(days or 30), 1)
    since = datetime.utcnow() - timedelta(days=days)

    rows = (await db.execute(
        select(Call.workspace_id, Call.cost_usd, Call.duration_seconds, Call.extra_data)
        .where(Call.created_at >= since, Call.cost_usd.isnot(None))
    )).all()

    total_calls = 0
    total_seconds = 0
    total_cost = 0.0
    total_aux = 0.0
    components: dict[str, dict] = {}
    ws_cost: dict[str, float] = {}
    ws_calls: dict[str, int] = {}

    for ws_id, cost_usd, duration, extra in rows:
        cost_usd = float(cost_usd or 0.0)
        if cost_usd <= 0:
            continue
        total_calls += 1
        total_seconds += int(duration or 0)
        total_cost += cost_usd
        cb = (extra or {}).get("cost_breakdown") or {}
        aux = float(cb.get("auxiliary_usd") or 0.0)
        total_aux += aux
        for name, comp in (cb.get("auxiliary") or {}).items():
            c = components.setdefault(name, {"usd": 0.0, "calls": 0})
            c["usd"] += float((comp or {}).get("usd") or 0.0)
            c["calls"] += int((comp or {}).get("calls") or 0)
        ws_cost[ws_id] = ws_cost.get(ws_id, 0.0) + cost_usd
        ws_calls[ws_id] = ws_calls.get(ws_id, 0) + 1

    realtime = total_cost - total_aux
    total_minutes = round(total_seconds / 60.0, 1)

    # One-time KB document-ingestion embedding cost (not tied to any call).
    from sqlalchemy import func as _func
    from backend.db.models import KnowledgeDocument
    kb_ingestion_usd = float((await db.execute(
        select(_func.coalesce(_func.sum(KnowledgeDocument.embedding_cost_usd), 0.0))
        .where(KnowledgeDocument.created_at >= since)
    )).scalar() or 0.0)

    # Approximate revenue (USD) from purchases in the same window.
    from backend.billing.credits import USD_TO_INR
    rev_rows = (await db.execute(
        select(CreditTransaction.amount_paid, CreditTransaction.currency).where(
            CreditTransaction.type == "purchase",
            CreditTransaction.amount_paid.isnot(None),
            CreditTransaction.created_at >= since,
        )
    )).all()
    revenue_usd = 0.0
    for amt, cur in rev_rows:
        amt = float(amt or 0.0)
        revenue_usd += amt / USD_TO_INR if (cur or "INR") == "INR" else amt

    # Resolve workspace names for the top spenders.
    ws_names: dict[str, str] = {}
    for ws_id in ws_cost:
        ws = await db.get(Workspace, ws_id)
        ws_names[ws_id] = ws.name if ws else "—"
    top_workspaces = sorted(
        ({"workspace": ws_names[w], "cost_usd": round(c, 4), "calls": ws_calls[w]}
         for w, c in ws_cost.items()),
        key=lambda x: x["cost_usd"], reverse=True,
    )[:10]

    comp_list = sorted(
        ({"name": k, "usd": round(v["usd"], 4), "calls": v["calls"]}
         for k, v in components.items()),
        key=lambda x: x["usd"], reverse=True,
    )

    return {
        "range_days": days,
        "usd_to_inr": USD_TO_INR,
        "total_calls": total_calls,
        "total_minutes": total_minutes,
        "total_cost_usd": round(total_cost, 4),
        "realtime_cost_usd": round(realtime, 4),
        "auxiliary_cost_usd": round(total_aux, 4),
        "kb_ingestion_usd": round(kb_ingestion_usd, 4),
        "grand_total_cost_usd": round(total_cost + kb_ingestion_usd, 4),
        "avg_cost_per_call_usd": round(total_cost / total_calls, 4) if total_calls else 0.0,
        "avg_cost_per_min_usd": round(total_cost / total_minutes, 4) if total_minutes else 0.0,
        "revenue_usd": round(revenue_usd, 2),
        "gross_margin_usd": round(revenue_usd - total_cost - kb_ingestion_usd, 2),
        "auxiliary_components": comp_list,
        "top_workspaces": top_workspaces,
    }


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
        cb = (c.extra_data or {}).get("cost_breakdown") or {}
        rows.append({
            "id": c.id,
            "workspace_name": ws.name if ws else "—",
            "phone_number": c.phone_number,
            "direction": c.direction,
            "status": c.status,
            "duration_seconds": c.duration_seconds,
            "pipeline_mode": c.pipeline_mode,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "cost_usd": round(float(c.cost_usd), 6) if c.cost_usd is not None else None,
            "cost_breakdown": {
                "realtime_usd": cb.get("realtime_usd"),
                "auxiliary_usd": cb.get("auxiliary_usd"),
                "audio_in_usd": cb.get("audio_in_usd"),
                "audio_out_usd": cb.get("audio_out_usd"),
                "text_in_usd": cb.get("text_in_usd"),
                "text_out_usd": cb.get("text_out_usd"),
                "transcription_usd": cb.get("transcription_usd"),
                "auxiliary": cb.get("auxiliary") or {},
            },
        })
    return rows
