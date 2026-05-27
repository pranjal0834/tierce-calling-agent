from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, Integer, case
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_workspace, get_current_user
from backend.db.database import get_db
from backend.db.models import Agent, Call, CallTurn, FineTuningRun, User, Workspace
from backend.models.schemas import AgentAnalytics

router = APIRouter()


def _since(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


def _parse_range(days: int, start_date: str | None, end_date: str | None):
    """Returns (since, until). until=None means no upper bound."""
    if start_date and end_date:
        try:
            since = datetime.fromisoformat(start_date)
            until = datetime.fromisoformat(end_date) + timedelta(days=1)
            return since, until
        except ValueError:
            pass
    return _since(days), None


@router.get("/agent/{agent_id}", response_model=AgentAnalytics)
async def get_agent_analytics(
    agent_id: str,
    days: int = Query(default=30, ge=1, le=365),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await db.get(Agent, agent_id)
    if not agent or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.is_personal and agent.created_by != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")

    since, until = _parse_range(days, start_date, end_date)
    date_conds = [Call.created_at >= since]
    if until:
        date_conds.append(Call.created_at < until)

    call_stats = await db.execute(
        select(
            func.count(Call.id).label("total"),
            func.avg(Call.duration_seconds).label("avg_duration"),
            func.avg(Call.sentiment_score).label("avg_sentiment"),
        ).where(
            Call.agent_id == agent_id,
            Call.workspace_id == workspace.id,
            *date_conds,
        )
    )
    row = call_stats.one()
    total_calls = row.total or 0
    avg_duration = float(row.avg_duration or 0)
    avg_sentiment = float(row.avg_sentiment or 0)

    eval_stats = await db.execute(
        select(func.avg(CallTurn.eval_score).label("avg_eval"))
        .join(Call, Call.id == CallTurn.call_id)
        .where(
            Call.agent_id == agent_id,
            Call.workspace_id == workspace.id,
            *date_conds,
            CallTurn.eval_score.isnot(None),
        )
    )
    avg_eval = float(eval_stats.scalar() or 0)

    cache_stats = await db.execute(
        select(
            func.count(CallTurn.id).label("total"),
            func.sum(CallTurn.from_prediction_cache.cast(Integer)).label("hits"),
        )
        .join(Call, Call.id == CallTurn.call_id)
        .where(
            Call.agent_id == agent_id,
            Call.workspace_id == workspace.id,
            *date_conds,
            CallTurn.role == "agent",
        )
    )
    cs = cache_stats.one()
    cache_hit_rate = float((cs.hits or 0)) / max(float(cs.total or 1), 1)

    # Calls + avg sentiment per day
    calls_per_day_q = await db.execute(
        select(
            func.date(Call.created_at).label("day"),
            func.count(Call.id).label("count"),
            func.avg(Call.sentiment_score).label("avg_sentiment"),
        )
        .where(
            Call.agent_id == agent_id,
            Call.workspace_id == workspace.id,
            *date_conds,
        )
        .group_by(func.date(Call.created_at))
        .order_by(func.date(Call.created_at))
    )
    calls_per_day = [
        {
            "day": str(r.day),
            "count": r.count,
            "avg_sentiment": round(float(r.avg_sentiment or 0), 2),
        }
        for r in calls_per_day_q
    ]

    ft_result = await db.execute(
        select(FineTuningRun)
        .where(FineTuningRun.agent_id == agent_id, FineTuningRun.workspace_id == workspace.id)
        .order_by(desc(FineTuningRun.created_at))
        .limit(1)
    )
    latest_ft = ft_result.scalar_one_or_none()

    ft_count_result = await db.execute(
        select(func.count(FineTuningRun.id)).where(
            FineTuningRun.agent_id == agent_id,
            FineTuningRun.workspace_id == workspace.id,
        )
    )
    ft_count = ft_count_result.scalar() or 0

    return AgentAnalytics(
        agent_id=agent_id,
        total_calls=total_calls,
        avg_duration_s=avg_duration,
        avg_sentiment_score=avg_sentiment,
        avg_eval_score=avg_eval,
        cache_hit_rate=cache_hit_rate,
        emotion_distribution={},
        calls_per_day=calls_per_day,
        fine_tuning_runs=ft_count,
        latest_model=latest_ft.fine_tuned_model if latest_ft else None,
    )


@router.get("/workspace")
async def get_workspace_analytics(
    days: int = Query(default=30, ge=1, le=365),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    """Workspace-wide analytics: totals, trends, per-agent breakdown, status distribution."""
    from sqlalchemy import or_, and_

    since, until = _parse_range(days, start_date, end_date)
    date_conds = [Call.created_at >= since]
    if until:
        date_conds.append(Call.created_at < until)

    _personal_filter = or_(
        Agent.is_personal == False,
        Agent.is_personal == None,
        and_(Agent.is_personal == True, Agent.created_by == user.id),
    )

    # ── KPI totals ────────────────────────────────────────────────────────────
    totals = await db.execute(
        select(
            func.count(Call.id).label("total"),
            func.avg(Call.duration_seconds).label("avg_duration"),
            func.avg(Call.sentiment_score).label("avg_sentiment"),
            func.sum(Call.cost_usd).label("total_cost"),
        )
        .join(Agent, Call.agent_id == Agent.id, isouter=True)
        .where(Call.workspace_id == workspace.id, *date_conds, _personal_filter)
    )
    t = totals.one()

    # ── Status distribution ───────────────────────────────────────────────────
    status_q = await db.execute(
        select(Call.status, func.count(Call.id).label("count"))
        .join(Agent, Call.agent_id == Agent.id, isouter=True)
        .where(Call.workspace_id == workspace.id, *date_conds, _personal_filter)
        .group_by(Call.status)
    )
    status_dist = [{"status": r.status or "unknown", "count": r.count} for r in status_q]

    # ── Direction distribution ────────────────────────────────────────────────
    dir_q = await db.execute(
        select(Call.direction, func.count(Call.id).label("count"))
        .join(Agent, Call.agent_id == Agent.id, isouter=True)
        .where(Call.workspace_id == workspace.id, *date_conds, _personal_filter)
        .group_by(Call.direction)
    )
    direction_dist = [{"direction": r.direction or "unknown", "count": r.count} for r in dir_q]

    # ── Calls per day trend ───────────────────────────────────────────────────
    trend_q = await db.execute(
        select(
            func.date(Call.created_at).label("day"),
            func.count(Call.id).label("count"),
            func.avg(Call.sentiment_score).label("avg_sentiment"),
            func.avg(Call.duration_seconds).label("avg_duration"),
        )
        .join(Agent, Call.agent_id == Agent.id, isouter=True)
        .where(Call.workspace_id == workspace.id, *date_conds, _personal_filter)
        .group_by(func.date(Call.created_at))
        .order_by(func.date(Call.created_at))
    )
    trend = [
        {
            "day": str(r.day),
            "count": r.count,
            "avg_sentiment": round(float(r.avg_sentiment or 0), 2),
            "avg_duration": round(float(r.avg_duration or 0), 1),
        }
        for r in trend_q
    ]

    # ── Calls by agent ────────────────────────────────────────────────────────
    _personal_filter_no_null = or_(
        Agent.is_personal == False,
        and_(Agent.is_personal == True, Agent.created_by == user.id),
    )
    by_agent_q = await db.execute(
        select(
            Agent.id.label("agent_id"),
            Agent.name.label("agent_name"),
            func.count(Call.id).label("count"),
            func.avg(Call.sentiment_score).label("avg_sentiment"),
        )
        .join(Call, Call.agent_id == Agent.id)
        .where(Call.workspace_id == workspace.id, *date_conds, _personal_filter_no_null)
        .group_by(Agent.id, Agent.name)
        .order_by(desc(func.count(Call.id)))
        .limit(8)
    )
    by_agent = [
        {
            "agent_id": r.agent_id,
            "agent_name": r.agent_name,
            "count": r.count,
            "avg_sentiment": round(float(r.avg_sentiment or 0), 2),
        }
        for r in by_agent_q
    ]

    # ── Calls per day broken down by status (for stacked chart) ─────────────
    stacked_q = await db.execute(
        select(
            func.date(Call.created_at).label("day"),
            Call.status,
            func.count(Call.id).label("count"),
        )
        .join(Agent, Call.agent_id == Agent.id, isouter=True)
        .where(Call.workspace_id == workspace.id, *date_conds, _personal_filter)
        .group_by(func.date(Call.created_at), Call.status)
        .order_by(func.date(Call.created_at))
    )
    # Reshape into [{day, completed, failed, initiated, ...}, ...]
    stacked_map: dict = {}
    all_statuses: set = set()
    for r in stacked_q:
        day = str(r.day)
        status = r.status or "unknown"
        all_statuses.add(status)
        if day not in stacked_map:
            stacked_map[day] = {"day": day}
        stacked_map[day][status] = r.count
    calls_by_status_per_day = list(stacked_map.values())

    # ── Hourly heatmap: calls per (day-of-week, hour) ────────────────────────
    hourly_q = await db.execute(
        select(
            func.extract("dow", Call.created_at).label("dow"),
            func.extract("hour", Call.created_at).label("hour"),
            func.count(Call.id).label("count"),
        )
        .join(Agent, Call.agent_id == Agent.id, isouter=True)
        .where(Call.workspace_id == workspace.id, *date_conds, _personal_filter)
        .group_by(func.extract("dow", Call.created_at), func.extract("hour", Call.created_at))
    )
    hourly_heatmap = [
        {"dow": int(r.dow), "hour": int(r.hour), "count": r.count}
        for r in hourly_q
    ]

    # ── First call resolution ─────────────────────────────────────────────────
    fcr_q = await db.execute(
        select(Call.contact_id, func.count(Call.id).label("call_count"))
        .join(Agent, Call.agent_id == Agent.id, isouter=True)
        .where(
            Call.workspace_id == workspace.id,
            *date_conds,
            Call.contact_id.isnot(None),
            _personal_filter,
        )
        .group_by(Call.contact_id)
    )
    fcr_rows = fcr_q.all()
    single_call_contacts = sum(1 for r in fcr_rows if r.call_count == 1)
    multi_call_contacts = sum(1 for r in fcr_rows if r.call_count > 1)
    total_contacts = len(fcr_rows)
    fcr_rate = round(single_call_contacts / max(total_contacts, 1), 3)

    # ── Active agents count ───────────────────────────────────────────────────
    active_agents_q = await db.execute(
        select(func.count(Agent.id)).where(
            Agent.workspace_id == workspace.id,
            Agent.is_active == True,
            or_(
                Agent.is_personal == False,
                and_(Agent.is_personal == True, Agent.created_by == user.id),
            ),
        )
    )
    active_agents = active_agents_q.scalar() or 0

    return {
        "days": days,
        "total_calls": t.total or 0,
        "active_agents": active_agents,
        "avg_duration_s": round(float(t.avg_duration or 0), 1),
        "avg_sentiment_score": round(float(t.avg_sentiment or 0), 2),
        "total_cost_usd": round(float(t.total_cost or 0), 4),
        "status_distribution": status_dist,
        "direction_distribution": direction_dist,
        "calls_per_day": trend,
        "calls_by_agent": by_agent,
        "calls_by_status_per_day": calls_by_status_per_day,
        "all_statuses": sorted(all_statuses),
        "hourly_heatmap": hourly_heatmap,
        "first_call_resolution": {
            "single_call_contacts": single_call_contacts,
            "multi_call_contacts": multi_call_contacts,
            "total_contacts": total_contacts,
            "rate": fcr_rate,
        },
    }
