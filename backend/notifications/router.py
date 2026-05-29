"""
Notifications API — preferences management and admin announcements.
"""
import asyncio
from pydantic import BaseModel

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user
from backend.config import settings
from backend.db.database import get_db
from backend.db.models import NotificationPreference, User
from backend.notifications import email as mailer
from backend.notifications import templates as tmpl

log = structlog.get_logger()
router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PreferenceOut(BaseModel):
    announcement_emails: bool
    low_credits_alert: bool
    call_summary_emails: bool

    model_config = {"from_attributes": True}


class PreferenceUpdate(BaseModel):
    announcement_emails: bool | None = None
    low_credits_alert: bool | None = None
    call_summary_emails: bool | None = None


class AnnouncePayload(BaseModel):
    subject: str
    headline: str
    body: str
    features: list[dict] | None = None
    cta_label: str = ""
    cta_url: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create_prefs(user_id: str, db: AsyncSession) -> NotificationPreference:
    result = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == user_id)
    )
    prefs = result.scalar_one_or_none()
    if not prefs:
        prefs = NotificationPreference(user_id=user_id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)
    return prefs


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/preferences", response_model=PreferenceOut)
async def get_preferences(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = await _get_or_create_prefs(user.id, db)
    return prefs


@router.put("/preferences", response_model=PreferenceOut)
async def update_preferences(
    payload: PreferenceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = await _get_or_create_prefs(user.id, db)
    if payload.announcement_emails is not None:
        prefs.announcement_emails = payload.announcement_emails
    if payload.low_credits_alert is not None:
        prefs.low_credits_alert = payload.low_credits_alert
    if payload.call_summary_emails is not None:
        prefs.call_summary_emails = payload.call_summary_emails
    await db.commit()
    await db.refresh(prefs)
    return prefs


@router.post("/announce")
async def send_announcement(
    payload: AnnouncePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Super-admin only: send a feature announcement to all opted-in users."""
    admin_emails = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]
    if user.email.lower() not in admin_emails:
        raise HTTPException(status_code=403, detail="Super admin only")

    # Fetch all opted-in users
    result = await db.execute(
        select(User, NotificationPreference)
        .join(NotificationPreference, NotificationPreference.user_id == User.id, isouter=True)
        .where(User.is_active == True)
    )
    rows = result.all()

    recipients = []
    for u, prefs in rows:
        if prefs is None or prefs.announcement_emails:
            recipients.append(u.email)

    if not recipients:
        return {"sent": 0, "message": "No opted-in recipients found"}

    subject, html = tmpl.announcement(
        subject=payload.subject,
        headline=payload.headline,
        body=payload.body,
        features=payload.features or [],
        cta_label=payload.cta_label,
        cta_url=payload.cta_url,
        frontend_url=settings.FRONTEND_URL or "",
    )

    asyncio.create_task(mailer.send_bulk(recipients, subject, html))

    log.info("Announcement queued", recipients=len(recipients), subject=payload.subject)
    return {"sent": len(recipients), "message": f"Announcement queued for {len(recipients)} users"}


@router.post("/test")
async def send_test_email(
    user: User = Depends(get_current_user),
):
    """Send a test email to yourself to verify SMTP config."""
    admin_emails = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]
    if user.email.lower() not in admin_emails:
        raise HTTPException(status_code=403, detail="Super admin only")

    subject, html = tmpl.welcome("Test Workspace", user.email, settings.FRONTEND_URL or "")
    ok = await mailer.send_email(user.email, f"[Test] {subject}", html)
    if ok:
        return {"ok": True, "message": f"Test email sent to {user.email}"}
    raise HTTPException(status_code=500, detail="SMTP send failed — check SMTP_* env vars")
