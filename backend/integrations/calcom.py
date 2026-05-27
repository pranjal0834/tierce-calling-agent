"""Cal.com API v2 integration — availability check and appointment booking."""
import httpx
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

CALCOM_BASE = "https://api.cal.com/v2"


def _headers(api_key: str, version: str = "2024-09-04") -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "cal-api-version": version,
    }


def _parse_event_type_id(raw: str) -> str:
    """Accept either a plain ID ('5707375') or a full URL and return just the numeric ID."""
    raw = raw.strip().rstrip("/")
    return raw.rsplit("/", 1)[-1]


async def check_availability(
    api_key: str, event_type_id: str, date_str: str, timezone: str = "Asia/Kolkata"
) -> str:
    if not api_key or not event_type_id:
        return "Cal.com not configured. Please check the tool settings."
    try:
        date = datetime.strptime(date_str.strip(), "%Y-%m-%d")
    except ValueError:
        return f"Invalid date '{date_str}'. Please use YYYY-MM-DD format."

    event_type_id = _parse_event_type_id(event_type_id)
    start_time = date.strftime("%Y-%m-%dT00:00:00.000Z")
    end_time = (date + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00.000Z")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{CALCOM_BASE}/slots",
                params={
                    "start": start_time,
                    "end": end_time,
                    "eventTypeId": event_type_id,
                    "timeZone": timezone,
                },
                headers=_headers(api_key),
                timeout=10,
            )
        if resp.status_code != 200:
            body = resp.text[:300] if resp.content else ""
            return f"Could not fetch availability (HTTP {resp.status_code}): {body}"

        # v2 response: { "data": { "2026-05-21": [ { "start": "..." }, ... ] } }
        slots_by_date = resp.json().get("data", {})
        all_slots = [slot["start"] for day in slots_by_date.values() for slot in day]

        if not all_slots:
            return f"No available slots on {date_str}. Please suggest another date."

        formatted = []
        for iso in all_slots[:8]:
            try:
                dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                formatted.append(dt.strftime("%I:%M %p").lstrip("0"))
            except Exception:
                formatted.append(iso)

        return (
            f"Available slots on {date_str}: {', '.join(formatted)}. "
            "Ask the caller which time works best."
        )

    except httpx.TimeoutException:
        return "Calendar request timed out. Please try again."
    except Exception as exc:
        return f"Error checking availability: {str(exc)[:100]}"


async def book_appointment(
    api_key: str,
    event_type_id: str,
    datetime_iso: str,
    caller_name: str,
    caller_email: str,
    caller_phone: str = "",
    notes: str = "",
    timezone: str = "Asia/Kolkata",
) -> str:
    if not api_key or not event_type_id:
        return "Cal.com not configured."
    if not caller_name or not caller_email:
        return "Cannot book — please collect the caller's name and email first."
    if not datetime_iso:
        return "Cannot book — appointment date and time not specified."

    event_type_id = _parse_event_type_id(event_type_id)
    try:
        body: dict = {
            "eventTypeId": int(event_type_id),
            "start": datetime_iso,
            "attendee": {
                "name": caller_name,
                "email": caller_email,
                "timeZone": timezone,
            },
            "metadata": {},
        }
        if notes:
            body["metadata"]["notes"] = notes
        if caller_phone:
            body["attendee"]["phoneNumber"] = caller_phone

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{CALCOM_BASE}/bookings",
                json=body,
                headers=_headers(api_key, version="2024-08-13"),
                timeout=15,
            )

        if resp.status_code in (200, 201):
            booking = resp.json().get("data", {})
            uid = booking.get("uid", "")
            start_raw = booking.get("start", datetime_iso)
            try:
                dt = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
                dt_local = dt.astimezone(ZoneInfo(timezone))
                confirmed_time = dt_local.strftime("%A, %B %-d at %I:%M %p").lstrip("0").replace(" 0", " ")
            except Exception:
                confirmed_time = start_raw
            return (
                f"Appointment confirmed for {caller_name} on {confirmed_time}. "
                f"A confirmation email has been sent to {caller_email}. "
                f"Reference: {uid[:8] if uid else 'confirmed'}."
            )
        else:
            error = (resp.json() if resp.content else {}).get("message", resp.text[:150])
            return f"Booking failed: {error}. The slot may no longer be available."

    except httpx.TimeoutException:
        return "Booking request timed out. Please try again."
    except Exception as exc:
        return f"Error creating booking: {str(exc)[:100]}"
