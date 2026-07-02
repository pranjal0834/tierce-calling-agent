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
from sqlalchemy import select, func, desc, asc, or_
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

@router.get("/anomalies")
async def admin_anomalies(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """
    Lightweight heuristic anomaly flags for the overview dashboard. Each flag has
    a level (critical | warning | info), a short title, and a detail string.
    """
    now = datetime.utcnow()
    w1, w4 = now - timedelta(days=7), now - timedelta(days=28)
    flags: list[dict] = []

    # 1. AI cost spike — this week vs the average of the prior 3 weeks.
    week_cost = (await db.execute(
        select(func.coalesce(func.sum(Call.cost_usd), 0.0)).where(Call.created_at >= w1)
    )).scalar() or 0.0
    prior_cost = (await db.execute(
        select(func.coalesce(func.sum(Call.cost_usd), 0.0))
        .where(Call.created_at >= w4, Call.created_at < w1)
    )).scalar() or 0.0
    prior_weekly_avg = float(prior_cost) / 3.0
    if prior_weekly_avg > 0.5 and float(week_cost) > 3 * prior_weekly_avg:
        flags.append({
            "level": "critical",
            "title": f"AI cost spike — {float(week_cost) / prior_weekly_avg:.1f}× normal",
            "detail": f"${float(week_cost):.2f} in AI cost this week vs a ${prior_weekly_avg:.2f}/week recent average.",
        })

    # 1b. Negative gross margin this week — AI cost exceeded revenue.
    from backend.billing.credits import USD_TO_INR as _U2R
    rev_rows_wk = (await db.execute(
        select(CreditTransaction.amount_paid, CreditTransaction.currency).where(
            CreditTransaction.type == "purchase",
            CreditTransaction.amount_paid.isnot(None),
            CreditTransaction.created_at >= w1,
        )
    )).all()
    revenue_wk = sum((float(a or 0) if (c or "INR") == "INR" else float(a or 0) * _U2R) for a, c in rev_rows_wk)
    cost_wk_inr = float(week_cost) * _U2R
    if (revenue_wk + cost_wk_inr) > 0 and revenue_wk < cost_wk_inr:
        flags.append({
            "level": "critical",
            "title": "Negative gross margin this week",
            "detail": f"AI cost ₹{cost_wk_inr:,.0f} exceeded revenue ₹{revenue_wk:,.0f} over the last 7 days.",
        })

    # 2. Zero calls platform-wide in the last 7 days (but there is history).
    calls_7d = (await db.execute(select(func.count(Call.id)).where(Call.created_at >= w1))).scalar() or 0
    total_calls = (await db.execute(select(func.count(Call.id)))).scalar() or 0
    if total_calls > 0 and calls_7d == 0:
        flags.append({
            "level": "warning",
            "title": "No calls in the last 7 days",
            "detail": "The platform has processed zero calls this week.",
        })

    # 3. Quiet workspaces — had calls before, but none in the last 7 days.
    last_call_rows = (await db.execute(
        select(Call.workspace_id, func.max(Call.created_at)).group_by(Call.workspace_id)
    )).all()
    quiet = [wid for wid, last in last_call_rows if wid and last and last < w1]
    if quiet:
        flags.append({
            "level": "info",
            "title": f"{len(quiet)} workspace{'s' if len(quiet) != 1 else ''} went quiet",
            "detail": "Had calls previously but none in the last 7 days — possible churn.",
        })

    # 4. Signup spike — new users this week vs prior 3-week average.
    users_7d = (await db.execute(select(func.count(User.id)).where(User.created_at >= w1))).scalar() or 0
    users_prior = (await db.execute(
        select(func.count(User.id)).where(User.created_at >= w4, User.created_at < w1)
    )).scalar() or 0
    prior_users_avg = float(users_prior) / 3.0
    if prior_users_avg >= 1 and users_7d > 3 * prior_users_avg:
        flags.append({
            "level": "info",
            "title": f"Signup spike — {users_7d} new users",
            "detail": f"{users_7d} signups this week vs a {prior_users_avg:.1f}/week average. Verify they're legitimate.",
        })

    return {"anomalies": flags, "checked_at": now.isoformat()}


@router.post("/digest/send")
async def admin_send_digest_now(
    admin: User = Depends(require_superadmin),
):
    """Manually send the admin digest now (also used to preview/test the scheduled report)."""
    from backend.notifications.digest import send_admin_digest
    sent = await send_admin_digest("Manual")
    if sent == 0:
        raise HTTPException(status_code=400, detail="No digest sent — check ADMIN_EMAILS and SMTP settings")
    return {"ok": True, "sent": sent, "frequency": (settings.ADMIN_DIGEST_FREQ or "off")}


@router.get("/search")
async def admin_global_search(
    q: str = "",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """One query across workspaces, users, calls, and phone numbers."""
    q = (q or "").strip()
    if len(q) < 2:
        return {"workspaces": [], "users": [], "calls": [], "phone_numbers": []}
    like = f"%{q}%"
    LIM = 6

    ws_rows = (await db.execute(
        select(Workspace.id, Workspace.name).where(Workspace.name.ilike(like)).limit(LIM)
    )).all()
    user_rows = (await db.execute(
        select(User.id, User.email).where(User.email.ilike(like), User.deleted_at.is_(None)).limit(LIM)
    )).all()
    call_rows = (await db.execute(
        select(Call.id, Call.phone_number, Call.workspace_id)
        .where(Call.phone_number.ilike(like)).order_by(desc(Call.created_at)).limit(LIM)
    )).all()
    pn_rows = (await db.execute(
        select(PhoneNumber.id, PhoneNumber.phone_number, PhoneNumber.workspace_id)
        .where(PhoneNumber.phone_number.ilike(like)).limit(LIM)
    )).all()

    ws_ids = {r[2] for r in call_rows} | {r[2] for r in pn_rows}
    ws_names: dict[str, str] = {}
    if ws_ids:
        for wid, name in (await db.execute(
            select(Workspace.id, Workspace.name).where(Workspace.id.in_(ws_ids))
        )).all():
            ws_names[wid] = name

    return {
        "workspaces": [{"id": i, "name": n} for i, n in ws_rows],
        "users": [{"id": i, "email": e} for i, e in user_rows],
        "calls": [{"id": i, "phone_number": p, "workspace_name": ws_names.get(w, "—")} for i, p, w in call_rows],
        "phone_numbers": [{"id": i, "phone_number": p, "workspace_name": ws_names.get(w, "—")} for i, p, w in pn_rows],
    }


# E.164 dial-code → (country, flag). Longest-prefix match; NANP (+1) is bucketed.
_DIAL_CODES: dict[str, tuple[str, str]] = {
    "1": ("US / Canada", "🇺🇸"), "44": ("United Kingdom", "🇬🇧"), "91": ("India", "🇮🇳"),
    "61": ("Australia", "🇦🇺"), "49": ("Germany", "🇩🇪"), "33": ("France", "🇫🇷"),
    "971": ("UAE", "🇦🇪"), "65": ("Singapore", "🇸🇬"), "81": ("Japan", "🇯🇵"),
    "86": ("China", "🇨🇳"), "92": ("Pakistan", "🇵🇰"), "880": ("Bangladesh", "🇧🇩"),
    "234": ("Nigeria", "🇳🇬"), "27": ("South Africa", "🇿🇦"), "55": ("Brazil", "🇧🇷"),
    "52": ("Mexico", "🇲🇽"), "34": ("Spain", "🇪🇸"), "39": ("Italy", "🇮🇹"),
    "31": ("Netherlands", "🇳🇱"), "7": ("Russia / KZ", "🇷🇺"), "60": ("Malaysia", "🇲🇾"),
    "62": ("Indonesia", "🇮🇩"), "63": ("Philippines", "🇵🇭"), "66": ("Thailand", "🇹🇭"),
    "84": ("Vietnam", "🇻🇳"), "82": ("South Korea", "🇰🇷"), "20": ("Egypt", "🇪🇬"),
    "254": ("Kenya", "🇰🇪"), "94": ("Sri Lanka", "🇱🇰"), "977": ("Nepal", "🇳🇵"),
    "966": ("Saudi Arabia", "🇸🇦"), "353": ("Ireland", "🇮🇪"), "64": ("New Zealand", "🇳🇿"),
}


def _country_for(number: str) -> tuple[str, str] | None:
    n = (number or "").lstrip("+").strip()
    if not n or not n[0].isdigit():
        return None
    for length in (4, 3, 2, 1):
        if len(n) >= length and n[:length] in _DIAL_CODES:
            return _DIAL_CODES[n[:length]]
    return None


# ── India regional breakdown (drill-down under "India") ───────────────────────
# Landline STD codes → city (deterministic, accurate).
_IN_STD: dict[str, str] = {
    "11": "Delhi", "22": "Mumbai", "33": "Kolkata", "44": "Chennai", "20": "Pune",
    "40": "Hyderabad", "79": "Ahmedabad", "80": "Bengaluru", "141": "Jaipur",
    "522": "Lucknow", "172": "Chandigarh", "484": "Kochi", "471": "Thiruvananthapuram",
    "422": "Coimbatore", "361": "Guwahati", "674": "Bhubaneswar", "731": "Indore",
    "712": "Nagpur", "265": "Vadodara", "532": "Prayagraj", "512": "Kanpur",
    "281": "Rajkot", "183": "Amritsar", "755": "Bhopal", "612": "Patna",
    "821": "Mysuru", "824": "Mangaluru", "413": "Puducherry", "751": "Gwalior",
}
# Mobile first-4-digits → telecom circle. APPROXIMATE: reflects the number's
# ORIGINAL allocation circle, not the caller's live location (mobile number
# portability breaks the link). Extend/correct this with your own ranges — it's
# just a lookup table. Unmapped mobiles fall into "Other circle".
_IN_MOBILE_CIRCLE: dict[str, str] = {
    "9845": "Karnataka", "9880": "Karnataka", "9886": "Karnataka", "7899": "Karnataka",
    "9820": "Mumbai", "9821": "Mumbai", "9833": "Mumbai", "9930": "Mumbai",
    "9811": "Delhi", "9810": "Delhi", "9871": "Delhi", "9999": "Delhi",
    "9840": "Chennai", "9841": "Chennai", "9884": "Tamil Nadu", "9944": "Tamil Nadu",
    "9825": "Gujarat", "9898": "Gujarat", "9909": "Gujarat", "8511": "Gujarat",
    "9849": "Andhra/Telangana", "9848": "Andhra/Telangana", "9959": "Andhra/Telangana",
    "9830": "Kolkata", "9831": "Kolkata", "9903": "West Bengal",
    "9822": "Maharashtra", "9890": "Maharashtra", "9421": "Maharashtra",
    "9829": "Rajasthan", "9950": "Rajasthan", "9414": "Rajasthan",
    "9891": "UP (West)", "9897": "UP (West)", "9838": "UP (East)", "9935": "UP (East)",
    "9895": "Kerala", "9847": "Kerala", "9539": "Kerala",
    "9815": "Punjab", "9872": "Punjab", "9425": "Madhya Pradesh", "9424": "Madhya Pradesh",
    "9437": "Odisha", "9438": "Odisha", "9835": "Bihar/Jharkhand", "9431": "Bihar/Jharkhand",
}


def _india_region(number: str) -> str:
    """Best-effort Indian region for a +91 number (landline = city, mobile = circle)."""
    n = (number or "").lstrip("+").strip()
    if not n.startswith("91"):
        return "Other"
    local = n[2:]
    if not local:
        return "Unknown"
    if len(local) >= 10 and local[0] in "6789":   # mobile
        return _IN_MOBILE_CIRCLE.get(local[:4], "Other circle")
    for length in (4, 3, 2):                        # landline STD
        if local[:length] in _IN_STD:
            return _IN_STD[local[:length]]
    return "Other"


@router.get("/geo")
async def admin_geo(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """
    Call volume grouped by destination country (from the E.164 prefix). The India
    entry also includes a `regions` breakdown (city for landlines, telecom circle
    for mobiles — approximate, see _IN_MOBILE_CIRCLE).
    """
    from collections import Counter
    days = max(min(int(days or 30), 90), 1)
    since = datetime.utcnow() - timedelta(days=days)
    rows = (await db.execute(select(Call.phone_number).where(Call.created_at >= since))).all()
    counts: Counter = Counter()
    india_regions: Counter = Counter()
    flags: dict[str, str] = {}
    for (num,) in rows:
        c = _country_for(num or "")
        key = c[0] if c else "Other"
        counts[key] += 1
        if c:
            flags[c[0]] = c[1]
            if c[0] == "India":
                india_regions[_india_region(num or "")] += 1
    total = sum(counts.values())
    countries = []
    for k, v in counts.most_common(12):
        entry = {"country": k, "flag": flags.get(k, "🌐"), "calls": v,
                 "pct": round(v / total * 100, 1) if total else 0.0}
        if k == "India" and india_regions:
            rtot = sum(india_regions.values())
            entry["regions"] = [
                {"region": rk, "calls": rv, "pct": round(rv / rtot * 100, 1) if rtot else 0.0}
                for rk, rv in india_regions.most_common(10)
            ]
        countries.append(entry)
    return {"days": days, "total": total, "countries": countries}


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
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    conditions = []
    if search:
        conditions.append(Workspace.name.ilike(f"%{search}%"))

    count_q = select(func.count(Workspace.id))
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    sort_col = getattr(Workspace, sort_by, Workspace.created_at)
    order = desc(sort_col) if sort_dir == "desc" else asc(sort_col)

    result = await db.execute(
        select(Workspace).where(*conditions).order_by(order).limit(limit).offset(offset)
    )
    workspaces = result.scalars().all()

    rows = []
    for ws in workspaces:
        mc = (await db.execute(
            select(func.count(User.id)).where(User.workspace_id == ws.id)
        )).scalar() or 0
        cc = (await db.execute(
            select(func.count(Call.id)).where(Call.workspace_id == ws.id)
        )).scalar() or 0
        ac = (await db.execute(
            select(func.count(Agent.id)).where(Agent.workspace_id == ws.id)
        )).scalar() or 0
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
    return {"items": rows, "total": total}


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

# Soft-deleted accounts are recoverable for this many days, then purged.
DELETED_RETENTION_DAYS = 30


def _display_email(email: str) -> str:
    """Un-mangle a soft-deleted email ('deleted_<ts>_user@x.com' → 'user@x.com')."""
    parts = email.split("_", 2)
    if len(parts) == 3 and parts[0] == "deleted" and parts[1].isdigit():
        return parts[2]
    return email


@router.get("/users")
async def list_all_users(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    deleted_only: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    q = select(User).join(Workspace, User.workspace_id == Workspace.id, isouter=True)
    conditions = []
    if search:
        conditions.append(or_(User.email.ilike(f"%{search}%"), Workspace.name.ilike(f"%{search}%")))
    # Main list hides soft-deleted accounts; the "Recently Deleted" view shows only them.
    conditions.append(User.deleted_at.isnot(None) if deleted_only else User.deleted_at.is_(None))
    q = q.where(*conditions)

    count_q = (
        select(func.count(User.id)).select_from(User)
        .join(Workspace, User.workspace_id == Workspace.id, isouter=True)
        .where(*conditions)
    )
    total = (await db.execute(count_q)).scalar() or 0

    sort_col = getattr(User, sort_by, User.created_at)
    order = desc(sort_col) if sort_dir == "desc" else asc(sort_col)
    q = q.order_by(order).limit(limit).offset(offset)

    users = (await db.execute(q)).scalars().all()

    now = datetime.utcnow()
    rows = []
    for u in users:
        ws = await db.get(Workspace, u.workspace_id)
        days_left = None
        if u.deleted_at:
            days_left = max(0, DELETED_RETENTION_DAYS - (now - u.deleted_at).days)
        rows.append({
            "id": u.id,
            "email": _display_email(u.email),   # show the real address, not the mangled one
            "role": u.role,
            "is_active": u.is_active,
            "workspace_id": u.workspace_id,
            "workspace_name": ws.name if ws else "—",
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "deleted_at": u.deleted_at.isoformat() if u.deleted_at else None,
            "days_left": days_left,
        })
    return {"items": rows, "total": total}


# ── Soft-delete / restore (30-day recovery window) ────────────────────────────

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    """
    Soft-delete a user: deactivate, stamp deleted_at (starts the 30-day recovery
    window), and free the email (mangled, recoverable). A background job purges
    accounts once the window elapses. Super admins cannot delete themselves.
    """
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own super admin account")
    if target.deleted_at is not None:
        raise HTTPException(status_code=400, detail="User is already deleted")

    original = _display_email(target.email)
    now = datetime.utcnow()
    target.deleted_at = now
    target.is_active = False
    if not target.email.startswith("deleted_"):
        target.email = f"deleted_{now.strftime('%Y%m%d%H%M%S')}_{original}"

    await db.commit()
    log.info("User soft-deleted by admin", user_id=user_id, email=original, admin=admin.email)
    return {
        "ok": True, "user_id": user_id, "email": original,
        "recover_by": (now + timedelta(days=DELETED_RETENTION_DAYS)).isoformat(),
    }


@router.post("/users/{user_id}/restore")
async def restore_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    """Restore a soft-deleted user within the 30-day window (re-activates + restores email)."""
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.deleted_at is None:
        raise HTTPException(status_code=400, detail="User is not deleted")
    if (datetime.utcnow() - target.deleted_at).days >= DELETED_RETENTION_DAYS:
        raise HTTPException(status_code=410, detail="The 30-day recovery window has expired — this account can no longer be restored")

    original = _display_email(target.email)
    # The freed email may have been claimed by a new signup — block the collision.
    existing = (await db.execute(
        select(User).where(User.email == original, User.id != target.id)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Cannot restore: {original} is now used by another account")

    target.email = original
    target.is_active = True
    target.deleted_at = None
    await db.commit()
    log.info("User restored by admin", user_id=user_id, email=original, admin=admin.email)
    return {"ok": True, "user_id": user_id, "email": original}


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

    # Approximate revenue (USD) from purchases in the same window, per workspace.
    from backend.billing.credits import USD_TO_INR
    rev_rows = (await db.execute(
        select(CreditTransaction.workspace_id, CreditTransaction.amount_paid, CreditTransaction.currency).where(
            CreditTransaction.type == "purchase",
            CreditTransaction.amount_paid.isnot(None),
            CreditTransaction.created_at >= since,
        )
    )).all()
    revenue_usd = 0.0
    ws_rev: dict[str, float] = {}
    for wsid, amt, cur in rev_rows:
        amt = float(amt or 0.0)
        usd = amt / USD_TO_INR if (cur or "INR") == "INR" else amt
        revenue_usd += usd
        if wsid:
            ws_rev[wsid] = ws_rev.get(wsid, 0.0) + usd

    # Per-workspace profitability (revenue vs AI cost). Union of spenders + buyers.
    ws_keys = set(ws_cost) | set(ws_rev)
    ws_names: dict[str, str] = {}
    for wid in ws_keys:
        ws = await db.get(Workspace, wid)
        ws_names[wid] = ws.name if ws else "—"
    top_workspaces = sorted(
        ({"workspace": ws_names[w],
          "cost_usd": round(ws_cost.get(w, 0.0), 4),
          "calls": ws_calls.get(w, 0),
          "revenue_usd": round(ws_rev.get(w, 0.0), 2),
          "margin_usd": round(ws_rev.get(w, 0.0) - ws_cost.get(w, 0.0), 2)}
         for w in ws_keys),
        key=lambda x: x["cost_usd"], reverse=True,
    )[:12]

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
    offset: int = 0,
    search: str = "",
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    q = select(Call).join(Workspace, Call.workspace_id == Workspace.id, isouter=True)
    conditions = []
    if search:
        conditions.append(or_(Call.phone_number.ilike(f"%{search}%"), Workspace.name.ilike(f"%{search}%")))
    if conditions:
        q = q.where(*conditions)

    count_q = select(func.count(Call.id)).select_from(Call).join(Workspace, Call.workspace_id == Workspace.id, isouter=True)
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    sort_col = getattr(Call, sort_by, Call.created_at)
    order = desc(sort_col) if sort_dir == "desc" else asc(sort_col)
    q = q.order_by(order).limit(limit).offset(offset)

    result = await db.execute(q)
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
    return {"items": rows, "total": total}


# ── Phone number inventory (global) ───────────────────────────────────────────

@router.get("/phone-numbers")
async def admin_phone_numbers(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "purchased_at",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Every purchased number across all workspaces, with monthly cost liability."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    q = select(PhoneNumber).join(Workspace, PhoneNumber.workspace_id == Workspace.id, isouter=True)
    conditions = []
    if search:
        conditions.append(or_(PhoneNumber.phone_number.ilike(f"%{search}%"), Workspace.name.ilike(f"%{search}%")))
    if conditions:
        q = q.where(*conditions)

    count_q = select(func.count(PhoneNumber.id)).select_from(PhoneNumber).join(Workspace, PhoneNumber.workspace_id == Workspace.id, isouter=True)
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    sort_col = getattr(PhoneNumber, sort_by, PhoneNumber.purchased_at)
    order = desc(sort_col) if sort_dir == "desc" else asc(sort_col)
    q = q.order_by(order).limit(limit).offset(offset)

    rows = (await db.execute(q)).scalars().all()
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
        "items": out,
        "total": total,
    }


# ── Transaction browser + revenue ─────────────────────────────────────────────

@router.get("/transactions")
async def admin_transactions(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Recent credit/payment transactions across the platform."""
    from backend.billing.credits import USD_TO_INR
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    q = select(CreditTransaction).join(Workspace, CreditTransaction.workspace_id == Workspace.id, isouter=True)
    conditions = []
    if search:
        conditions.append(or_(
            Workspace.name.ilike(f"%{search}%"),
            CreditTransaction.type.ilike(f"%{search}%"),
            CreditTransaction.description.ilike(f"%{search}%"),
        ))
    if conditions:
        q = q.where(*conditions)

    count_q = select(func.count(CreditTransaction.id)).select_from(CreditTransaction).join(Workspace, CreditTransaction.workspace_id == Workspace.id, isouter=True)
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    sort_col = getattr(CreditTransaction, sort_by, CreditTransaction.created_at)
    order = desc(sort_col) if sort_dir == "desc" else asc(sort_col)
    q = q.order_by(order).limit(limit).offset(offset)

    txs = (await db.execute(q)).scalars().all()

    ws_cache: dict[str, str] = {}
    async def wsname(wid: str) -> str:
        if wid not in ws_cache:
            w = await db.get(Workspace, wid)
            ws_cache[wid] = w.name if w else "—"
        return ws_cache[wid]

    rows = []
    for t in txs:
        name = await wsname(t.workspace_id)
        amt = float(t.amount_paid or 0.0)
        amt_inr = amt if (t.currency or "INR") == "INR" else amt * USD_TO_INR
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

    return {"items": rows, "total": total}


# ── Compliance audit (per workspace) ──────────────────────────────────────────

@router.get("/compliance")
async def admin_compliance(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "workspace",
    sort_dir: str = "desc",
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

    if search:
        ql = search.lower()
        out = [r for r in out if ql in r["workspace"].lower()]

    valid_sorts = {"workspace", "dnc_count", "opt_out_count", "consent_attestations"}
    if sort_by not in valid_sorts:
        sort_by = "workspace"
    reverse = sort_dir == "desc"
    out.sort(key=lambda x: (x.get(sort_by) or 0) if sort_by != "workspace" else (x.get(sort_by) or "").lower(), reverse=reverse)

    total = len(out)
    out = out[offset:offset + limit]

    return {"items": out, "total": total}


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
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Every agent across all workspaces, with call volume and total AI cost."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    q = select(Agent).join(Workspace, Agent.workspace_id == Workspace.id, isouter=True)
    conditions = []
    if search:
        conditions.append(or_(Agent.name.ilike(f"%{search}%"), Workspace.name.ilike(f"%{search}%")))
    if conditions:
        q = q.where(*conditions)

    count_q = select(func.count(Agent.id)).select_from(Agent).join(Workspace, Agent.workspace_id == Workspace.id, isouter=True)
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    sort_col = getattr(Agent, sort_by, Agent.created_at)
    order = desc(sort_col) if sort_dir == "desc" else asc(sort_col)
    q = q.order_by(order).limit(limit).offset(offset)

    agents = (await db.execute(q)).scalars().all()
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
    return {"items": out, "total": total}


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
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Webhook endpoints across the platform with delivery success/failure stats."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    q = select(WebhookEndpoint).join(Workspace, WebhookEndpoint.workspace_id == Workspace.id, isouter=True)
    conditions = []
    if search:
        conditions.append(or_(WebhookEndpoint.url.ilike(f"%{search}%"), Workspace.name.ilike(f"%{search}%")))
    if conditions:
        q = q.where(*conditions)

    count_q = select(func.count(WebhookEndpoint.id)).select_from(WebhookEndpoint).join(Workspace, WebhookEndpoint.workspace_id == Workspace.id, isouter=True)
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    sort_col = getattr(WebhookEndpoint, sort_by, WebhookEndpoint.created_at)
    order = desc(sort_col) if sort_dir == "desc" else asc(sort_col)
    q = q.order_by(order).limit(limit).offset(offset)

    endpoints = (await db.execute(q)).scalars().all()
    out, tot_deliv, tot_failed = [], 0, 0
    for e in endpoints:
        ws = await db.get(Workspace, e.workspace_id)
        delivs = (await db.execute(
            select(WebhookDelivery).where(WebhookDelivery.endpoint_id == e.id)
        )).scalars().all()
        total_del = len(delivs)
        failed = sum(1 for d in delivs if d.delivered_at is None or (d.response_status or 0) >= 400)
        last = max((d.created_at for d in delivs if d.created_at), default=None)
        tot_deliv += total_del
        tot_failed += failed
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
            "total_deliveries": total_del,
            "failed_deliveries": failed,
            "success_rate": round((total_del - failed) / total_del * 100, 1) if total_del else None,
            "last_delivery": last.isoformat() if last else None,
            "last_error": (f"{last_fail['status'] or 'no response'}: {last_fail['body']}".strip()
                           if last_fail else None),
            "recent_deliveries": recent_out,
        })
    return {"items": out, "total": total}


# ── Scheduled calls overview ──────────────────────────────────────────────────

@router.get("/scheduled-calls")
async def admin_scheduled_calls(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "scheduled_at",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Upcoming and failed scheduled calls platform-wide."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    conditions = []
    if search:
        conditions.append(or_(
            ScheduledCall.phone_number.ilike(f"%{search}%"),
            ScheduledCall.contact_name.ilike(f"%{search}%"),
        ))

    count_q = select(func.count(ScheduledCall.id))
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    sort_col = getattr(ScheduledCall, sort_by, ScheduledCall.scheduled_at)
    order = desc(sort_col) if sort_dir == "desc" else asc(sort_col)

    q = select(ScheduledCall)
    if conditions:
        q = q.where(*conditions)
    q = q.order_by(order).limit(limit).offset(offset)

    rows = (await db.execute(q)).scalars().all()
    out = []
    for s in rows:
        ws = await db.get(Workspace, s.workspace_id)
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
    return {"items": out, "total": total}


# ── WhatsApp usage (per workspace) ────────────────────────────────────────────

@router.get("/whatsapp")
async def admin_whatsapp(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "workspace",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Which workspaces have WhatsApp connected, and how many agents use it."""
    workspaces = (await db.execute(select(Workspace))).scalars().all()
    out = []
    for w in workspaces:
        has_wa = bool(getattr(w, "whatsapp_api_key", None))
        agents = (await db.execute(select(Agent).where(Agent.workspace_id == w.id))).scalars().all()
        enabled = sum(1 for a in agents if (a.config or {}).get("whatsapp_enabled"))
        if not has_wa and enabled == 0:
            continue
        out.append({
            "workspace": w.name, "workspace_id": w.id,
            "connected": has_wa, "enabled_agents": enabled, "total_agents": len(agents),
        })

    if search:
        ql = search.lower()
        out = [r for r in out if ql in r["workspace"].lower()]

    valid_sorts = {"workspace", "connected", "enabled_agents", "total_agents"}
    if sort_by not in valid_sorts:
        sort_by = "workspace"
    reverse = sort_dir == "desc"
    out.sort(key=lambda x: (x.get(sort_by) or 0) if sort_by != "workspace" else (x.get(sort_by) or "").lower(), reverse=reverse)

    total = len(out)
    out = out[offset:offset + limit]

    return {"items": out, "total": total}


# ── Knowledge base storage audit ──────────────────────────────────────────────

@router.get("/knowledge")
async def admin_knowledge(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "docs",
    sort_dir: str = "desc",
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
    out = []
    for wid, b in by_ws.items():
        ws = await db.get(Workspace, wid)
        out.append({"workspace": ws.name if ws else "—", "workspace_id": wid, **b, "embed_usd": round(b["embed_usd"], 4)})

    if search:
        ql = search.lower()
        out = [r for r in out if ql in r["workspace"].lower()]

    valid_sorts = {"workspace", "kbs", "docs", "chunks", "chars", "embed_usd"}
    if sort_by not in valid_sorts:
        sort_by = "docs"
    reverse = sort_dir == "desc"
    out.sort(key=lambda x: (x.get(sort_by) or 0) if sort_by != "workspace" else (x.get(sort_by) or "").lower(), reverse=reverse)

    total = len(out)
    out = out[offset:offset + limit]

    return {"items": out, "total": total}


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
    signups = (await db.execute(select(User.created_at).where(User.created_at >= since))).all()
    day_calls, day_cogs, day_rev, day_users = defaultdict(int), defaultdict(float), defaultdict(float), defaultdict(int)
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
    for (uat,) in signups:
        if uat:
            day_users[uat.strftime("%Y-%m-%d")] += 1
    series = []
    for i in range(days, -1, -1):
        d = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
        series.append({
            "date": d,
            "calls": day_calls.get(d, 0),
            "cogs_inr": round(day_cogs.get(d, 0.0) * USD_TO_INR, 2),
            "revenue_inr": round(day_rev.get(d, 0.0), 2),
            "new_users": day_users.get(d, 0),
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
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    from backend.db.models import AgentTemplate
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    conditions = []
    if search:
        conditions.append(or_(
            AgentTemplate.name.ilike(f"%{search}%"),
            AgentTemplate.category.ilike(f"%{search}%"),
        ))

    count_q = select(func.count(AgentTemplate.id))
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    sort_col = getattr(AgentTemplate, sort_by, AgentTemplate.created_at)
    order = desc(sort_col) if sort_dir == "desc" else asc(sort_col)

    q = select(AgentTemplate)
    if conditions:
        q = q.where(*conditions)
    q = q.order_by(order).limit(limit).offset(offset)

    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [{
            "id": t.id, "name": t.name, "category": t.category, "description": t.description,
            "voice_id": t.voice_id, "pipeline_mode": t.pipeline_mode, "tags": t.tags or [],
            "is_official": t.is_official, "created_at": t.created_at.isoformat() if t.created_at else None,
        } for t in rows],
        "total": total,
    }


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
