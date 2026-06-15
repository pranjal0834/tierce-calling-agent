
"""
Google Calendar integration — availability check + appointment booking.

Auth: a Google Cloud **service account** (Calendar API enabled) whose email has
been granted access to the target calendar ("Make changes to events"). This
avoids per-user OAuth/refresh-token flows — ideal for a business booking calendar.

Tool config (tool["config"]) expected keys:
  integration = "google_calendar"
  service_account_json : the service-account key, as a JSON string or dict
  calendar_id          : target calendar id (often the calendar owner's email)
  timezone             : IANA tz for events, e.g. "Asia/Kolkata" (default)
  utc_offset           : fixed offset for slot math, e.g. "+05:30" (default)
  work_start_hour, work_end_hour, slot_minutes : optional (default 10, 18, 30)

Unlike Cal.com, booking does NOT require the caller's email — the event is
created on the business calendar from voice alone (email added as an invitee
only if provided).
"""
import asyncio
import json
from datetime import datetime, timedelta, time, timezone as _tz

import structlog

log = structlog.get_logger()
SCOPES = ["https://www.googleapis.com/auth/calendar"]


def _parse_offset(s: str) -> _tz:
    """Parse '+05:30' / '-04:00' into a tzinfo (avoids needing system tzdata)."""
    try:
        s = (s or "+05:30").strip()
        sign = -1 if s[0] == "-" else 1
        s = s.lstrip("+-")
        h, m = (s.split(":") + ["0"])[:2]
        return _tz(timedelta(hours=sign * int(h), minutes=sign * int(m)))
    except Exception:
        return _tz(timedelta(hours=5, minutes=30))


def _build_service(cfg: dict):
    """Build a Calendar API client from either OAuth (refresh token) or a
    service-account key — whichever the tool config provides."""
    from googleapiclient.discovery import build
    refresh_token = cfg.get("refresh_token")
    if refresh_token:
        # OAuth: user-authorized access (no service-account key needed)
        from google.oauth2.credentials import Credentials
        from backend.config import settings
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            client_id=cfg.get("client_id") or settings.GOOGLE_CLIENT_ID,
            client_secret=cfg.get("client_secret") or settings.GOOGLE_CLIENT_SECRET,
            token_uri="https://oauth2.googleapis.com/token",
            scopes=SCOPES,
        )
    else:
        from google.oauth2 import service_account
        raw = cfg.get("service_account_json")
        if not raw:
            raise ValueError("Missing Google Calendar credentials (refresh_token or service_account_json)")
        info = json.loads(raw) if isinstance(raw, str) else raw
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _freebusy_sync(service, calendar_id, time_min, time_max, tz):
    resp = service.freebusy().query(body={
        "timeMin": time_min, "timeMax": time_max, "timeZone": tz,
        "items": [{"id": calendar_id}],
    }).execute()
    return resp.get("calendars", {}).get(calendar_id, {}).get("busy", [])


async def check_availability(cfg: dict, date_str: str, slot_minutes: int = 30) -> str:
    """Return open slots on date_str (YYYY-MM-DD) within working hours."""
    calendar_id = cfg.get("calendar_id")
    if not calendar_id:
        return "Calendar not configured (missing calendar_id)."
    tz_name = cfg.get("timezone", "Asia/Kolkata")
    offset = _parse_offset(cfg.get("utc_offset", "+05:30"))
    work_start = int(cfg.get("work_start_hour", 10))
    work_end = int(cfg.get("work_end_hour", 18))
    slot_minutes = int(cfg.get("slot_minutes", slot_minutes))
    try:
        day = datetime.strptime(date_str, "%Y-%m-%d").date()
        start = datetime.combine(day, time(work_start, 0), offset)
        end = datetime.combine(day, time(work_end, 0), offset)
        loop = asyncio.get_event_loop()
        service = await loop.run_in_executor(None, _build_service, cfg)
        busy = await loop.run_in_executor(
            None, _freebusy_sync, service, calendar_id, start.isoformat(), end.isoformat(), tz_name
        )
        busy_ranges = []
        for b in busy:
            try:
                bs = datetime.fromisoformat(b["start"].replace("Z", "+00:00")).astimezone(offset)
                be = datetime.fromisoformat(b["end"].replace("Z", "+00:00")).astimezone(offset)
                busy_ranges.append((bs, be))
            except Exception:
                continue
        now = datetime.now(offset)
        slots = []
        cur = start
        while cur + timedelta(minutes=slot_minutes) <= end:
            slot_end = cur + timedelta(minutes=slot_minutes)
            overlaps = any(cur < be and slot_end > bs for bs, be in busy_ranges)
            if not overlaps and cur > now:
                slots.append(cur.strftime("%I:%M %p").lstrip("0"))
            cur = slot_end
        if not slots:
            return f"No available slots on {date_str}. Please suggest another date."
        return f"Available slots on {date_str}: {', '.join(slots[:8])}."
    except Exception as exc:
        log.warning("Google Calendar availability error", error=str(exc))
        return f"Error checking availability: {str(exc)[:120]}"


def _insert_event_sync(service, calendar_id, body):
    return service.events().insert(calendarId=calendar_id, body=body, sendUpdates="all").execute()


async def book_appointment(cfg: dict, datetime_iso: str, caller_name: str = "",
                           caller_email: str = "", caller_phone: str = "",
                           notes: str = "", slot_minutes: int = 30) -> str:
    """Create an event on the business calendar. Email is optional."""
    calendar_id = cfg.get("calendar_id")
    if not calendar_id:
        return "Calendar not configured (missing calendar_id)."
    if not datetime_iso:
        return "Cannot book — appointment date and time were not provided."
    tz_name = cfg.get("timezone", "Asia/Kolkata")
    slot_minutes = int(cfg.get("slot_minutes", slot_minutes))
    try:
        start_dt = datetime.fromisoformat(datetime_iso.replace("Z", "+00:00"))
        end_dt = start_dt + timedelta(minutes=slot_minutes)
        who = caller_name or caller_phone or "Caller"
        desc = [p for p in (
            f"Name: {caller_name}" if caller_name else "",
            f"Phone: {caller_phone}" if caller_phone else "",
            f"Notes: {notes}" if notes else "",
            "Booked by Vaaniq voice agent.",
        ) if p]
        body = {
            "summary": f"Appointment: {who}",
            "description": "\n".join(desc),
            "start": {"dateTime": start_dt.isoformat(), "timeZone": tz_name},
            "end": {"dateTime": end_dt.isoformat(), "timeZone": tz_name},
        }
        if caller_email:
            body["attendees"] = [{"email": caller_email, "displayName": caller_name or ""}]
        loop = asyncio.get_event_loop()
        service = await loop.run_in_executor(None, _build_service, cfg)
        await loop.run_in_executor(None, _insert_event_sync, service, calendar_id, body)
        when = start_dt.strftime("%A, %d %B at %I:%M %p").replace(" 0", " ")

        biz = cfg.get("business_name") or "us"
        # Send a branded confirmation email to the caller (best-effort, non-blocking).
        if caller_email:
            try:
                from backend.notifications.email import send_email
                from backend.notifications import templates as tmpl
                subject, html = tmpl.appointment_confirmation(
                    caller_name, when, cfg.get("business_name", ""), notes,
                )
                await send_email(caller_email, subject, html)
            except Exception as exc:
                log.warning("Appointment confirmation email failed", error=str(exc))

        # Send a WhatsApp confirmation to the caller's number (best-effort).
        # Uses the Meta template in production, or free-form text in dev — driven by
        # the WhatsApp templates module so the wording stays in one place.
        if caller_phone:
            try:
                from backend.integrations.whatsapp import send_appointment_confirmation, is_configured
                if is_configured():
                    await send_appointment_confirmation(caller_phone, caller_name, when, biz)
            except Exception as exc:
                log.warning("Appointment confirmation WhatsApp failed", error=str(exc))

        return f"Appointment booked for {when}. It has been added to the calendar."
    except Exception as exc:
        log.warning("Google Calendar booking error", error=str(exc))
        return f"Could not book the appointment: {str(exc)[:120]}"
