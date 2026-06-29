"""
Tool executor — dispatches tool calls to their implementation.

Supported tool types:
  webhook           — POST to a configured HTTP endpoint
  end_call          — signals the realtime handler to hang up
  transfer_call     — signals the realtime handler to transfer to a human
  calendar_booking  — check availability and book via Cal.com or Calendly
  schedule_callback — built-in: schedule an outbound callback to the caller
"""
import httpx
import json

# Standard OpenAI function parameter schema for calendar_booking tools.
# Injected by openai_realtime.py when building the session tool list so the
# agent always receives the correct schema regardless of what's stored in the DB.
CALENDAR_BOOKING_PARAMS = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "enum": ["check_availability", "book"],
            "description": (
                "check_availability: get open time slots for a specific date. "
                "book: create the appointment after confirming all details with the caller."
            ),
        },
        "date": {
            "type": "string",
            "description": "Date to check availability, format YYYY-MM-DD (e.g. '2026-05-20'). Required for check_availability.",
        },
        "datetime_iso": {
            "type": "string",
            "description": "Exact ISO datetime for the booking (e.g. '2026-05-20T10:00:00+05:30'). Required for book action.",
        },
        "caller_name": {
            "type": "string",
            "description": "Caller's full name. Required for book action.",
        },
        "caller_email": {
            "type": "string",
            "description": "Caller's email address. Required for book action.",
        },
        "caller_phone": {
            "type": "string",
            "description": "Caller's phone number.",
        },
        "notes": {
            "type": "string",
            "description": "Additional notes or reason for the appointment.",
        },
    },
    "required": ["action"],
}


async def execute_tool(tool: dict, arguments: dict, **ctx) -> str:
    tool_type = tool.get("type")
    if tool_type == "webhook":
        return await _execute_webhook(tool, arguments)
    elif tool_type == "end_call":
        return "__END_CALL__"
    elif tool_type == "transfer_call":
        cfg = tool.get("config") or {}
        phone = cfg.get("transfer_to") or cfg.get("phone_number", "")
        return "__TRANSFER__:" + phone
    elif tool_type == "calendar_booking":
        return await _execute_calendar_booking(tool, arguments, ctx.get("call"))
    elif tool_type == "schedule_callback":
        return await _execute_schedule_callback(arguments, ctx.get("call"))
    return f"Unknown tool type: {tool_type}"


async def _execute_webhook(tool: dict, arguments: dict) -> str:
    cfg = tool.get("config") or {}
    url = cfg.get("url", "")
    headers = cfg.get("headers") or {}
    timeout = float(cfg.get("timeout_seconds", 10))

    if not url:
        return "Error: webhook URL not configured"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                json={"tool": tool.get("name"), "arguments": arguments},
                headers={"Content-Type": "application/json", **headers},
                timeout=timeout,
            )
            if resp.status_code < 300:
                try:
                    data = resp.json()
                    if isinstance(data, dict) and "result" in data:
                        return str(data["result"])
                    return json.dumps(data)
                except Exception:
                    return resp.text[:500] or "Success"
            return f"Webhook error {resp.status_code}: {resp.text[:200]}"
    except httpx.TimeoutException:
        return "Error: webhook timed out"
    except Exception as exc:
        return f"Error: {str(exc)}"


async def _execute_calendar_booking(tool: dict, arguments: dict, call=None) -> str:
    cfg = tool.get("config") or {}
    integration = cfg.get("integration", "calcom")
    api_key = cfg.get("api_key", "")
    timezone = cfg.get("timezone", "Asia/Kolkata")
    action = arguments.get("action", "check_availability")

    result = await _dispatch_calendar(integration, cfg, api_key, timezone, action, arguments)
    # Record a genuine in-call booking so the post-call safety net never double-books.
    if action == "book":
        from backend.features.tools import booking_state
        if booking_state.booking_succeeded(result):
            booking_state.mark_booked(getattr(call, "id", None))
    return result


async def _dispatch_calendar(integration, cfg, api_key, timezone, action, arguments) -> str:

    if integration == "calcom":
        event_type_id = cfg.get("event_type_id", "")
        if action == "check_availability":
            from backend.integrations.calcom import check_availability
            date = arguments.get("date", "")
            if not date:
                return "Please ask the caller for their preferred date before checking availability."
            return await check_availability(api_key, event_type_id, date, timezone)
        elif action == "book":
            from backend.integrations.calcom import book_appointment
            return await book_appointment(
                api_key,
                event_type_id,
                arguments.get("datetime_iso", ""),
                arguments.get("caller_name", ""),
                arguments.get("caller_email", ""),
                arguments.get("caller_phone", ""),
                arguments.get("notes", ""),
                timezone,
            )

    elif integration == "calendly":
        event_type_uri = cfg.get("event_type_uri", "")
        if action == "check_availability":
            from backend.integrations.calendly import check_availability
            date = arguments.get("date", "")
            if not date:
                return "Please ask the caller for their preferred date before checking availability."
            return await check_availability(api_key, event_type_uri, date, timezone)
        elif action == "book":
            from backend.integrations.calendly import create_scheduling_link
            return await create_scheduling_link(api_key, event_type_uri)

    elif integration == "google_calendar":
        if action == "check_availability":
            from backend.integrations.google_calendar import check_availability
            date = arguments.get("date", "")
            if not date:
                return "Please ask the caller for their preferred date before checking availability."
            return await check_availability(cfg, date)
        elif action == "book":
            from backend.integrations.google_calendar import book_appointment
            return await book_appointment(
                cfg,
                arguments.get("datetime_iso", ""),
                arguments.get("caller_name", ""),
                arguments.get("caller_email", ""),
                arguments.get("caller_phone", ""),
                arguments.get("notes", ""),
            )

    return f"Unsupported calendar integration: {integration}"


# ── Built-in: Schedule Callback ─────────────────────────────────────────────

SCHEDULE_CALLBACK_PARAMS = {
    "type": "object",
    "properties": {
        "relative_minutes": {
            "type": "integer",
            "description": (
                "Minutes from now, taken ONLY from a duration the caller explicitly stated "
                "(e.g. 'in 30 minutes' → 30, 'in an hour' → 60, 'in 2 hours' → 120). "
                "Do NOT invent or default a value — if the caller did not say a duration, leave this empty "
                "and ask them when to call back. Never use 2 unless they literally said 'two minutes'."
            ),
        },
        "datetime_iso": {
            "type": "string",
            "description": (
                "Absolute callback datetime as ISO 8601 with timezone offset "
                "(e.g. '2026-05-22T17:00:00+05:30'). "
                "Use only for specific future times like 'tomorrow at 5 PM' or 'Monday at 3 PM'. "
                "Do NOT use for relative expressions — use relative_minutes instead."
            ),
        },
        "notes": {
            "type": "string",
            "description": "One-line reason for the callback (e.g. 'Caller busy, requested callback').",
        },
    },
}


async def _execute_schedule_callback(arguments: dict, call) -> str:
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    import uuid as _uuid
    from zoneinfo import ZoneInfo
    from backend.db.database import AsyncSessionLocal
    from backend.db.models import ScheduledCall

    relative_minutes = arguments.get("relative_minutes")
    datetime_iso = (arguments.get("datetime_iso") or "").strip()
    notes = arguments.get("notes", "")

    if not call or not getattr(call, "phone_number", None):
        return "Unable to schedule callback — caller phone number is not available yet."

    try:
        if relative_minutes is not None:
            mins = int(relative_minutes)
            dt_utc_naive = _dt.utcnow() + _td(minutes=mins)
            friendly_label = f"in {mins} minute{'s' if mins != 1 else ''}"
        elif datetime_iso:
            dt_aware = _dt.fromisoformat(datetime_iso.replace("Z", "+00:00"))
            if dt_aware.tzinfo is None:
                dt_aware = dt_aware.replace(tzinfo=_tz.utc)
            dt_utc_naive = dt_aware.astimezone(_tz.utc).replace(tzinfo=None)
            dt_ist = dt_utc_naive.replace(tzinfo=_tz.utc).astimezone(ZoneInfo("Asia/Kolkata"))
            friendly_label = "at " + dt_ist.strftime("%I:%M %p on %A").lstrip("0").replace(" 0", " ")
        else:
            return "Callback time not provided."
    except (ValueError, TypeError):
        return "Could not parse the callback time."

    try:
        async with AsyncSessionLocal() as db:
            sc = ScheduledCall(
                id=str(_uuid.uuid4()),
                workspace_id=call.workspace_id,
                agent_id=call.agent_id,
                phone_number=call.phone_number,
                notes=notes or "Callback requested by caller during live call",
                scheduled_at=dt_utc_naive,
                timezone="Asia/Kolkata",
                status="pending",
            )
            db.add(sc)
            await db.commit()
        return f"Scheduled {friendly_label}."
    except Exception as exc:
        return f"Failed: {str(exc)}"
