"""
Compliance helpers shared by the API and the call-dialing flow:
  - DNC / suppression-list lookups + writes
  - calling-window (quiet-hours) check
  - per-workspace monitoring stats (opt-out / short-call rates)
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Call, DncEntry

# Accounts whose opt-out rate exceeds this are blocked from launching new campaigns.
OPT_OUT_BLOCK_PCT = 8.0


def within_calling_window(workspace) -> bool:
    """True if outbound dialing is allowed right now for this workspace."""
    if not getattr(workspace, "calling_window_enabled", False):
        return True
    try:
        tz = ZoneInfo(getattr(workspace, "calling_timezone", None) or "Asia/Kolkata")
    except Exception:
        tz = ZoneInfo("Asia/Kolkata")
    hour = datetime.now(tz).hour
    start = int(getattr(workspace, "calling_start_hour", 9) or 9)
    end = int(getattr(workspace, "calling_end_hour", 21) or 21)
    if start <= end:
        return start <= hour < end
    return hour >= start or hour < end   # window wraps midnight (e.g. 21–6)


def calling_window_label(workspace) -> str:
    s = int(getattr(workspace, "calling_start_hour", 9) or 9)
    e = int(getattr(workspace, "calling_end_hour", 21) or 21)
    tz = getattr(workspace, "calling_timezone", None) or "Asia/Kolkata"
    return f"{s:02d}:00–{e:02d}:00 {tz}"


async def dnc_subset(db: AsyncSession, workspace_id: str, phones) -> set[str]:
    """Return the subset of `phones` that are on the workspace DNC list."""
    phones = [p for p in set(phones) if p]
    if not phones:
        return set()
    rows = (await db.execute(
        select(DncEntry.phone_number).where(
            DncEntry.workspace_id == workspace_id,
            DncEntry.phone_number.in_(phones),
        )
    )).scalars().all()
    return set(rows)


async def is_dnc(db: AsyncSession, workspace_id: str, phone: str) -> bool:
    if not phone:
        return False
    row = (await db.execute(
        select(DncEntry.id).where(
            DncEntry.workspace_id == workspace_id,
            DncEntry.phone_number == phone,
        )
    )).first()
    return row is not None


async def add_to_dnc(db: AsyncSession, workspace_id: str, phone: str,
                     reason: str | None = None, source: str = "manual") -> bool:
    """Add a number to the DNC list. Returns True if newly added."""
    if not phone:
        return False
    existing = (await db.execute(
        select(DncEntry.id).where(
            DncEntry.workspace_id == workspace_id,
            DncEntry.phone_number == phone,
        )
    )).first()
    if existing:
        return False
    db.add(DncEntry(workspace_id=workspace_id, phone_number=phone,
                    reason=reason, source=source))
    return True


async def compliance_stats(db: AsyncSession, workspace_id: str, days: int = 30) -> dict:
    """Opt-out / short-call rates over the last `days`, plus a health flag."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    calls = (await db.execute(
        select(Call).where(
            Call.workspace_id == workspace_id,
            Call.direction == "outbound",
            Call.created_at >= cutoff,
        )
    )).scalars().all()

    total = len(calls)
    completed = [c for c in calls if c.status == "completed"]
    opt_outs = sum(1 for c in calls if (c.extra_data or {}).get("opt_out"))
    short = sum(1 for c in completed if (c.duration_seconds or 0) < 10)

    dnc_count = (await db.execute(
        select(func.count()).select_from(DncEntry).where(DncEntry.workspace_id == workspace_id)
    )).scalar() or 0

    opt_out_rate = round(opt_outs / total * 100, 1) if total else 0.0
    short_rate = round(short / len(completed) * 100, 1) if completed else 0.0
    flagged = opt_out_rate >= 5.0 or short_rate >= 40.0
    blocked = opt_out_rate >= OPT_OUT_BLOCK_PCT

    return {
        "window_days": days,
        "total_calls": total,
        "completed_calls": len(completed),
        "opt_outs": opt_outs,
        "opt_out_rate": opt_out_rate,
        "short_calls": short,
        "short_call_rate": short_rate,
        "dnc_count": dnc_count,
        "flagged": flagged,
        "blocked_from_campaigns": blocked,
    }
