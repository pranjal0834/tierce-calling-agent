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

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_superadmin
from backend.config import settings
from backend.db.database import get_db
from backend.db.models import (
    Agent, Call, CreditTransaction, User, Workspace,
    PhoneNumber, DncEntry, ConsentAttestation,
    WebhookEndpoint, WebhookDelivery, ScheduledCall,
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
            "has_recording": bool(c.recording_url),
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


# ── Phone number inventory (global) ───────────────────────────────────────────

@router.get("/phone-numbers")
async def admin_phone_numbers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Every purchased number across all workspaces, with monthly cost liability."""
    rows = (await db.execute(
        select(PhoneNumber).order_by(desc(PhoneNumber.purchased_at))
    )).scalars().all()
    price = float(settings.NUMBER_PRICE_INR)
    out, active, suspended = [], 0, 0
    for n in rows:
        ws = await db.get(Workspace, n.workspace_id)
        if n.is_suspended:
            suspended += 1
        elif n.is_active:
            active += 1
        base = n.last_billed_at or n.purchased_at
        out.append({
            "id": n.id,
            "phone_number": n.phone_number,
            "workspace_name": ws.name if ws else "—",
            "workspace_id": n.workspace_id,
            "provider": n.provider,
            "is_active": n.is_active,
            "is_suspended": n.is_suspended,
            "auto_renew": n.auto_renew,
            "monthly_cost_inr": price,
            "purchased_at": n.purchased_at.isoformat() if n.purchased_at else None,
            "renews_at": (base + timedelta(days=30)).isoformat() if base else None,
        })
    return {
        "numbers": out,
        "summary": {
            "total": len(rows),
            "active": active,
            "suspended": suspended,
            "number_price_inr": price,
            "monthly_liability_inr": round(active * price, 2),
        },
    }


# ── Transaction browser + revenue ─────────────────────────────────────────────

@router.get("/transactions")
async def admin_transactions(
    limit: int = 100,
    q: str = "",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Recent credit/payment transactions across the platform, with revenue rollup."""
    from backend.billing.credits import USD_TO_INR
    txs = (await db.execute(
        select(CreditTransaction).order_by(desc(CreditTransaction.created_at)).limit(500)
    )).scalars().all()

    ws_cache: dict[str, str] = {}
    async def wsname(wid: str) -> str:
        if wid not in ws_cache:
            w = await db.get(Workspace, wid)
            ws_cache[wid] = w.name if w else "—"
        return ws_cache[wid]

    rows, total_rev, ws_rev = [], 0.0, {}
    for t in txs:
        name = await wsname(t.workspace_id)
        amt = float(t.amount_paid or 0.0)
        amt_inr = amt if (t.currency or "INR") == "INR" else amt * USD_TO_INR
        if t.type == "purchase" and amt_inr:
            total_rev += amt_inr
            ws_rev[name] = ws_rev.get(name, 0.0) + amt_inr
        rows.append({
            "id": t.id,
            "workspace_name": name,
            "type": t.type,
            "minutes": t.minutes,
            "amount_inr": round(amt_inr, 2) if amt_inr else None,
            "balance_after": t.balance_after,
            "description": t.description,
            "payment_provider": t.payment_provider,
            "payment_id": t.payment_id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in (f"{r['workspace_name']} {r['type']} {r['description'] or ''}").lower()]
    rows = rows[:limit]

    top = sorted(
        ({"workspace": k, "revenue_inr": round(v, 2)} for k, v in ws_rev.items()),
        key=lambda x: x["revenue_inr"], reverse=True,
    )[:10]
    return {"transactions": rows, "summary": {"total_revenue_inr": round(total_rev, 2), "top_workspaces": top}}


# ── Compliance audit (per workspace) ──────────────────────────────────────────

@router.get("/compliance")
async def admin_compliance(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """DNC lists, opt-outs, consent attestations, and calling windows per workspace."""
    workspaces = (await db.execute(select(Workspace))).scalars().all()
    out, tot_dnc, tot_opt, tot_consent = [], 0, 0, 0
    for w in workspaces:
        dnc = (await db.execute(select(func.count()).select_from(DncEntry).where(DncEntry.workspace_id == w.id))).scalar() or 0
        opt = (await db.execute(select(func.count()).select_from(DncEntry).where(DncEntry.workspace_id == w.id, DncEntry.source == "opt_out"))).scalar() or 0
        consent = (await db.execute(select(func.count()).select_from(ConsentAttestation).where(ConsentAttestation.workspace_id == w.id))).scalar() or 0
        tot_dnc += dnc; tot_opt += opt; tot_consent += consent
        if dnc == 0 and consent == 0 and not w.calling_window_enabled:
            continue
        out.append({
            "workspace": w.name,
            "workspace_id": w.id,
            "dnc_count": dnc,
            "opt_out_count": opt,
            "consent_attestations": consent,
            "calling_window_enabled": bool(w.calling_window_enabled),
            "calling_window": (f"{int(w.calling_start_hour):02d}:00–{int(w.calling_end_hour):02d}:00 {w.calling_timezone}"
                               if w.calling_window_enabled else None),
        })
    out.sort(key=lambda x: (x["dnc_count"] + x["consent_attestations"]), reverse=True)
    return {"workspaces": out, "summary": {"total_dnc": tot_dnc, "total_opt_outs": tot_opt, "total_consent_attestations": tot_consent}}


# ── Admin call recording playback (any call) ──────────────────────────────────

@router.get("/calls/{call_id}/recording")
async def admin_call_recording(
    call_id: str,
    request: Request,
    token: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Stream any call's recording for QA. Token in the query param so an <audio>
    element can play it. Requires the token to belong to a super admin."""
    from jose import JWTError, jwt
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        uid = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.get(User, uid) if uid else None
    admin_emails = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]
    if not user or user.email.lower() not in admin_emails:
        raise HTTPException(status_code=403, detail="Forbidden")

    call = await db.get(Call, call_id)
    if not call or not call.recording_url:
        raise HTTPException(status_code=404, detail="No recording available")

    upstream_headers = {}
    if request.headers.get("range"):
        upstream_headers["Range"] = request.headers["range"]
    rec_url = call.recording_url
    get_kwargs = dict(timeout=60, follow_redirects=True, headers=upstream_headers)
    if "twilio.com" in rec_url:
        get_kwargs["auth"] = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    elif "plivo.com" in rec_url:
        get_kwargs["auth"] = (settings.PLIVO_AUTH_ID, settings.PLIVO_AUTH_TOKEN)
    async with httpx.AsyncClient() as client:
        up = await client.get(rec_url, **get_kwargs)
    if up.status_code not in (200, 206):
        raise HTTPException(status_code=502, detail="Recording unavailable from provider")
    headers = {"Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600"}
    for k in ("Content-Length", "Content-Range"):
        if k in up.headers:
            headers[k] = up.headers[k]
    return Response(content=up.content, status_code=up.status_code, headers=headers)


# ── Global agent browser ──────────────────────────────────────────────────────

class AgentStatusRequest(BaseModel):
    is_active: bool


@router.get("/agents")
async def admin_agents(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Every agent across all workspaces, with call volume and total AI cost."""
    agents = (await db.execute(select(Agent).order_by(desc(Agent.created_at)))).scalars().all()
    stat_rows = (await db.execute(
        select(Call.agent_id, func.count(Call.id), func.coalesce(func.sum(Call.cost_usd), 0.0))
        .group_by(Call.agent_id)
    )).all()
    stats = {r[0]: (int(r[1]), float(r[2] or 0.0)) for r in stat_rows}
    out = []
    for a in agents:
        ws = await db.get(Workspace, a.workspace_id)
        cc, cost = stats.get(a.id, (0, 0.0))
        out.append({
            "id": a.id,
            "name": a.name,
            "workspace_name": ws.name if ws else "—",
            "workspace_id": a.workspace_id,
            "pipeline_mode": a.pipeline_mode,
            "is_active": a.is_active,
            "call_count": cc,
            "cost_usd": round(cost, 4),
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })
    return out


@router.put("/agents/{agent_id}/status")
async def admin_agent_status(
    agent_id: str,
    payload: AgentStatusRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    a = await db.get(Agent, agent_id)
    if not a:
        raise HTTPException(status_code=404, detail="Agent not found")
    a.is_active = payload.is_active
    await db.commit()
    return {"id": a.id, "is_active": a.is_active}


# ── Webhook health ────────────────────────────────────────────────────────────

@router.get("/webhooks")
async def admin_webhooks(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Webhook endpoints across the platform with delivery success/failure stats."""
    endpoints = (await db.execute(
        select(WebhookEndpoint).order_by(desc(WebhookEndpoint.created_at))
    )).scalars().all()
    out, tot_deliv, tot_failed = [], 0, 0
    for e in endpoints:
        ws = await db.get(Workspace, e.workspace_id)
        delivs = (await db.execute(
            select(WebhookDelivery).where(WebhookDelivery.endpoint_id == e.id)
        )).scalars().all()
        total = len(delivs)
        failed = sum(1 for d in delivs if d.delivered_at is None or (d.response_status or 0) >= 400)
        last = max((d.created_at for d in delivs if d.created_at), default=None)
        tot_deliv += total
        tot_failed += failed
        # Most recent deliveries (newest first) with status + truncated response body.
        recent = sorted(delivs, key=lambda d: d.created_at or datetime.min, reverse=True)[:8]
        recent_out = [{
            "event_type": d.event_type,
            "status": d.response_status,
            "ok": bool(d.delivered_at) and (d.response_status or 0) < 400,
            "attempt_count": d.attempt_count,
            "body": (d.response_body or "")[:200],
            "created_at": d.created_at.isoformat() if d.created_at else None,
        } for d in recent]
        last_fail = next((r for r in recent_out if not r["ok"]), None)
        out.append({
            "id": e.id,
            "workspace_name": ws.name if ws else "—",
            "url": e.url,
            "events": e.events or [],
            "is_active": e.is_active,
            "total_deliveries": total,
            "failed_deliveries": failed,
            "success_rate": round((total - failed) / total * 100, 1) if total else None,
            "last_delivery": last.isoformat() if last else None,
            "last_error": (f"{last_fail['status'] or 'no response'}: {last_fail['body']}".strip()
                           if last_fail else None),
            "recent_deliveries": recent_out,
        })
    return {
        "endpoints": out,
        "summary": {
            "total_endpoints": len(endpoints),
            "total_deliveries": tot_deliv,
            "total_failed": tot_failed,
        },
    }


# ── Scheduled calls overview ──────────────────────────────────────────────────

@router.get("/scheduled-calls")
async def admin_scheduled_calls(
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Upcoming and failed scheduled calls platform-wide."""
    rows = (await db.execute(
        select(ScheduledCall).order_by(desc(ScheduledCall.scheduled_at)).limit(limit)
    )).scalars().all()
    out, counts = [], {}
    for s in rows:
        ws = await db.get(Workspace, s.workspace_id)
        counts[s.status] = counts.get(s.status, 0) + 1
        out.append({
            "id": s.id,
            "workspace_name": ws.name if ws else "—",
            "phone_number": s.phone_number,
            "contact_name": s.contact_name,
            "scheduled_at": s.scheduled_at.isoformat() if s.scheduled_at else None,
            "status": s.status,
            "error_message": s.error_message,
            "call_id": s.call_id,
        })
    return {"scheduled": out, "summary": counts}


# ── WhatsApp usage (per workspace) ────────────────────────────────────────────

@router.get("/whatsapp")
async def admin_whatsapp(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Which workspaces have WhatsApp connected, and how many agents use it."""
    workspaces = (await db.execute(select(Workspace))).scalars().all()
    out, connected = [], 0
    for w in workspaces:
        has_wa = bool(getattr(w, "whatsapp_api_key", None))
        agents = (await db.execute(select(Agent).where(Agent.workspace_id == w.id))).scalars().all()
        enabled = sum(1 for a in agents if (a.config or {}).get("whatsapp_enabled"))
        if not has_wa and enabled == 0:
            continue
        if has_wa:
            connected += 1
        out.append({
            "workspace": w.name, "workspace_id": w.id,
            "connected": has_wa, "enabled_agents": enabled, "total_agents": len(agents),
        })
    out.sort(key=lambda x: (x["connected"], x["enabled_agents"]), reverse=True)
    return {"workspaces": out, "summary": {"connected_workspaces": connected, "shown": len(out)}}


# ── Knowledge base storage audit ──────────────────────────────────────────────

@router.get("/knowledge")
async def admin_knowledge(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """KB count, documents, chunks, characters, and embedding cost per workspace."""
    from backend.db.models import KnowledgeBase, KnowledgeDocument
    kbs = (await db.execute(select(KnowledgeBase))).scalars().all()
    docs = (await db.execute(select(KnowledgeDocument))).scalars().all()
    by_ws: dict[str, dict] = {}
    def bucket(wid):
        return by_ws.setdefault(wid, {"kbs": 0, "docs": 0, "chunks": 0, "chars": 0, "embed_usd": 0.0})
    for kb in kbs:
        bucket(kb.workspace_id)["kbs"] += 1
    for d in docs:
        b = bucket(d.workspace_id)
        b["docs"] += 1
        b["chunks"] += int(d.chunk_count or 0)
        b["chars"] += int(d.char_count or 0)
        b["embed_usd"] += float(d.embedding_cost_usd or 0.0)
    out, tot_embed, tot_docs = [], 0.0, 0
    for wid, b in by_ws.items():
        ws = await db.get(Workspace, wid)
        tot_embed += b["embed_usd"]; tot_docs += b["docs"]
        out.append({"workspace": ws.name if ws else "—", "workspace_id": wid, **b, "embed_usd": round(b["embed_usd"], 4)})
    out.sort(key=lambda x: x["docs"], reverse=True)
    return {"workspaces": out, "summary": {"total_docs": tot_docs, "total_embed_usd": round(tot_embed, 4), "workspaces": len(out)}}


# ── Trends (time series for charts) ───────────────────────────────────────────

@router.get("/trends")
async def admin_trends(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Daily calls, revenue (INR), and COGS (INR) over the last N days."""
    from collections import defaultdict
    from backend.billing.credits import USD_TO_INR
    days = max(min(int(days or 30), 90), 7)
    since = datetime.utcnow() - timedelta(days=days)
    calls = (await db.execute(select(Call.created_at, Call.cost_usd).where(Call.created_at >= since))).all()
    txs = (await db.execute(
        select(CreditTransaction.created_at, CreditTransaction.amount_paid, CreditTransaction.currency)
        .where(CreditTransaction.created_at >= since, CreditTransaction.type == "purchase")
    )).all()
    day_calls, day_cogs, day_rev = defaultdict(int), defaultdict(float), defaultdict(float)
    for cat, cost in calls:
        if not cat:
            continue
        k = cat.strftime("%Y-%m-%d")
        day_calls[k] += 1
        day_cogs[k] += float(cost or 0.0)
    for cat, amt, cur in txs:
        if not cat:
            continue
        k = cat.strftime("%Y-%m-%d")
        a = float(amt or 0.0)
        day_rev[k] += a if (cur or "INR") == "INR" else a * USD_TO_INR
    series = []
    for i in range(days, -1, -1):
        d = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
        series.append({
            "date": d,
            "calls": day_calls.get(d, 0),
            "cogs_inr": round(day_cogs.get(d, 0.0) * USD_TO_INR, 2),
            "revenue_inr": round(day_rev.get(d, 0.0), 2),
        })
    return {"days": days, "series": series}


# ── Official template management ───────────────────────────────────────────────

class TemplateUpsert(BaseModel):
    name: str
    category: str = "Custom"
    description: str = ""
    system_prompt: str
    voice_id: str | None = None
    pipeline_mode: str = "native"
    tags: list = []


@router.get("/templates")
async def admin_list_templates(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    from backend.db.models import AgentTemplate
    rows = (await db.execute(select(AgentTemplate).order_by(desc(AgentTemplate.created_at)))).scalars().all()
    return [{
        "id": t.id, "name": t.name, "category": t.category, "description": t.description,
        "voice_id": t.voice_id, "pipeline_mode": t.pipeline_mode, "tags": t.tags or [],
        "is_official": t.is_official, "created_at": t.created_at.isoformat() if t.created_at else None,
    } for t in rows]


@router.post("/templates", status_code=201)
async def admin_create_template(
    payload: TemplateUpsert,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    from backend.db.models import AgentTemplate
    t = AgentTemplate(
        name=payload.name, category=payload.category, description=payload.description,
        system_prompt=payload.system_prompt, voice_id=payload.voice_id,
        pipeline_mode=payload.pipeline_mode, tags=payload.tags, is_official=True,
        created_by=admin.id,
    )
    db.add(t)
    await db.commit()
    return {"id": t.id, "name": t.name}


@router.delete("/templates/{template_id}", status_code=204)
async def admin_delete_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    from backend.db.models import AgentTemplate
    t = await db.get(AgentTemplate, template_id)
    if t:
        await db.delete(t)
        await db.commit()
    return Response(status_code=204)
