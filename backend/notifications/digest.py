"""
Scheduled admin digest — a daily/weekly platform summary emailed to every
ADMIN_EMAILS address (HTML body + CSV attachment). Controlled by
ADMIN_DIGEST_FREQ / ADMIN_DIGEST_HOUR_UTC. Reuses the SMTP sender.
"""
import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta

import structlog
from sqlalchemy import func, select

from backend.billing.credits import USD_TO_INR
from backend.config import settings
from backend.db.database import AsyncSessionLocal
from backend.db.models import Call, CreditTransaction, User, Workspace
from backend.notifications.email import send_report

log = structlog.get_logger()

_last_sent_key: str | None = None


async def _gather(db) -> dict:
    now = datetime.utcnow()
    w1 = now - timedelta(days=7)
    since30 = now - timedelta(days=30)

    total_ws = (await db.execute(select(func.count(Workspace.id)))).scalar() or 0
    total_users = (await db.execute(select(func.count(User.id)).where(User.deleted_at.is_(None)))).scalar() or 0
    total_calls = (await db.execute(select(func.count(Call.id)))).scalar() or 0
    calls_7d = (await db.execute(select(func.count(Call.id)).where(Call.created_at >= w1))).scalar() or 0
    users_7d = (await db.execute(select(func.count(User.id)).where(User.created_at >= w1))).scalar() or 0
    cost_7d = float((await db.execute(select(func.coalesce(func.sum(Call.cost_usd), 0.0)).where(Call.created_at >= w1))).scalar() or 0.0)

    tx = (await db.execute(
        select(CreditTransaction.amount_paid, CreditTransaction.currency)
        .where(CreditTransaction.created_at >= w1, CreditTransaction.type == "purchase")
    )).all()
    rev_7d_inr = sum((float(a or 0) if (c or "INR") == "INR" else float(a or 0) * USD_TO_INR) for a, c in tx)

    # Daily series (last 30 days) for the CSV.
    calls30 = (await db.execute(select(Call.created_at, Call.cost_usd).where(Call.created_at >= since30))).all()
    signups30 = (await db.execute(select(User.created_at).where(User.created_at >= since30))).all()
    tx30 = (await db.execute(
        select(CreditTransaction.created_at, CreditTransaction.amount_paid, CreditTransaction.currency)
        .where(CreditTransaction.created_at >= since30, CreditTransaction.type == "purchase")
    )).all()
    d_calls, d_cogs, d_users, d_rev = defaultdict(int), defaultdict(float), defaultdict(int), defaultdict(float)
    for cat, cost in calls30:
        if cat:
            k = cat.strftime("%Y-%m-%d"); d_calls[k] += 1; d_cogs[k] += float(cost or 0)
    for (uat,) in signups30:
        if uat:
            d_users[uat.strftime("%Y-%m-%d")] += 1
    for cat, amt, cur in tx30:
        if cat:
            k = cat.strftime("%Y-%m-%d")
            d_rev[k] += float(amt or 0) if (cur or "INR") == "INR" else float(amt or 0) * USD_TO_INR
    series = []
    for i in range(30, -1, -1):
        k = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        series.append({
            "date": k, "calls": d_calls.get(k, 0), "new_users": d_users.get(k, 0),
            "revenue_inr": round(d_rev.get(k, 0.0), 2), "cogs_inr": round(d_cogs.get(k, 0.0) * USD_TO_INR, 2),
        })

    # Top workspaces by calls this week.
    top_rows = (await db.execute(
        select(Call.workspace_id, func.count(Call.id))
        .where(Call.created_at >= w1).group_by(Call.workspace_id)
        .order_by(func.count(Call.id).desc()).limit(5)
    )).all()
    names = {}
    if top_rows:
        for wid, name in (await db.execute(select(Workspace.id, Workspace.name).where(Workspace.id.in_([r[0] for r in top_rows])))).all():
            names[wid] = name
    top = [{"name": names.get(wid, "—"), "calls": n} for wid, n in top_rows]

    return {
        "total_ws": total_ws, "total_users": total_users, "total_calls": total_calls,
        "calls_7d": calls_7d, "users_7d": users_7d, "cost_7d": cost_7d, "rev_7d_inr": rev_7d_inr,
        "series": series, "top": top,
    }


def _html(d: dict, period: str) -> str:
    rows = "".join(
        f"<tr><td style='padding:6px 10px;border-bottom:1px solid #eee'>{t['name']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:right'>{t['calls']}</td></tr>"
        for t in d["top"]
    ) or "<tr><td style='padding:6px 10px' colspan='2'>No calls this week.</td></tr>"
    def kpi(label, val):
        return (f"<td style='padding:12px 14px;background:#f8fafc;border-radius:10px'>"
                f"<div style='font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em'>{label}</div>"
                f"<div style='font-size:20px;font-weight:600;color:#0f172a'>{val}</div></td>")
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 4px">Vaaniq {period} Admin Digest</h2>
      <p style="color:#64748b;margin:0 0 18px">Platform summary — last 7 days · {datetime.utcnow():%d %b %Y}</p>
      <table style="width:100%;border-collapse:separate;border-spacing:8px 0"><tr>
        {kpi("Calls (7d)", d["calls_7d"])}{kpi("New users (7d)", d["users_7d"])}
      </tr><tr>
        {kpi("Revenue (7d)", f"₹{d['rev_7d_inr']:,.0f}")}{kpi("AI cost (7d)", f"${d['cost_7d']:.2f}")}
      </tr></table>
      <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin-top:8px"><tr>
        {kpi("Workspaces", d["total_ws"])}{kpi("Users", d["total_users"])}{kpi("Total calls", d["total_calls"])}
      </tr></table>
      <h3 style="margin:22px 0 6px;font-size:14px">Top workspaces by calls (7d)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">{rows}</table>
      <p style="color:#94a3b8;font-size:12px;margin-top:20px">Full 30-day daily breakdown attached as CSV. This is an internal admin report.</p>
    </div>"""


def _csv(series: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["date", "calls", "new_users", "revenue_inr", "cogs_inr"])
    for p in series:
        w.writerow([p["date"], p["calls"], p["new_users"], p["revenue_inr"], p["cogs_inr"]])
    return buf.getvalue()


async def send_admin_digest(period: str = "Daily") -> int:
    """Build + email the digest to every admin. Returns the number sent."""
    admins = [e.strip() for e in (settings.ADMIN_EMAILS or "").split(",") if e.strip()]
    if not admins:
        return 0
    async with AsyncSessionLocal() as db:
        data = await _gather(db)
    subject = f"Vaaniq {period} Admin Digest — {datetime.utcnow():%d %b %Y}"
    html = _html(data, period)
    csv_content = _csv(data["series"])
    csv_name = f"vaaniq-digest-{datetime.utcnow():%Y%m%d}.csv"
    sent = 0
    for a in admins:
        if await send_report(a, subject, html, csv_name, csv_content):
            sent += 1
    log.info("Admin digest sent", recipients=len(admins), sent=sent, period=period)
    return sent


async def maybe_send_admin_digest() -> None:
    """Called on an interval; fires at most once per day/week at the configured hour."""
    global _last_sent_key
    freq = (settings.ADMIN_DIGEST_FREQ or "off").lower()
    if freq not in ("daily", "weekly"):
        return
    now = datetime.utcnow()
    if now.hour != int(settings.ADMIN_DIGEST_HOUR_UTC or 6):
        return
    if freq == "weekly" and now.weekday() != 0:  # Mondays only
        return
    key = now.strftime("%Y-W%W") if freq == "weekly" else now.strftime("%Y-%m-%d")
    if _last_sent_key == key:
        return
    _last_sent_key = key
    await send_admin_digest("Weekly" if freq == "weekly" else "Daily")
