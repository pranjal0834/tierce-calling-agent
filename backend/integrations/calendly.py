"""
Calendly API integration — availability check and one-time scheduling link.
Note: Calendly does not support direct booking without user interaction.
The booking action generates a one-time scheduling link for the caller.
"""
import httpx
from datetime import datetime, timedelta

CALENDLY_BASE = "https://api.calendly.com"


async def check_availability(
    api_key: str, event_type_uri: str, date_str: str, timezone: str = "Asia/Kolkata"
) -> str:
    if not api_key or not event_type_uri:
        return "Calendly not configured. Please check the tool settings."
    try:
        date = datetime.strptime(date_str.strip(), "%Y-%m-%d")
    except ValueError:
        return f"Invalid date '{date_str}'. Please use YYYY-MM-DD format."

    start_time = date.strftime("%Y-%m-%dT00:00:00.000000Z")
    end_time = (date + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00.000000Z")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{CALENDLY_BASE}/event_type_available_times",
                params={
                    "event_type": event_type_uri,
                    "start_time": start_time,
                    "end_time": end_time,
                },
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
        if resp.status_code != 200:
            return f"Could not fetch Calendly availability (HTTP {resp.status_code})."

        collection = resp.json().get("collection", [])
        if not collection:
            return f"No available slots on {date_str}. Please suggest another date."

        formatted = []
        for item in collection[:8]:
            try:
                dt = datetime.fromisoformat(item["start_time"].replace("Z", "+00:00"))
                formatted.append(dt.strftime("%I:%M %p").lstrip("0"))
            except Exception:
                formatted.append(item.get("start_time", ""))

        return (
            f"Available slots on {date_str}: {', '.join(formatted)}. "
            "Ask the caller which time works best."
        )

    except httpx.TimeoutException:
        return "Calendly request timed out."
    except Exception as exc:
        return f"Error checking Calendly availability: {str(exc)[:100]}"


async def create_scheduling_link(api_key: str, event_type_uri: str) -> str:
    """Create a one-time Calendly scheduling link to send to the caller."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{CALENDLY_BASE}/scheduling_links",
                json={
                    "max_event_count": 1,
                    "owner": event_type_uri,
                    "owner_type": "EventType",
                },
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                timeout=10,
            )
        if resp.status_code == 201:
            link = resp.json().get("resource", {}).get("booking_url", "")
            return (
                "I've created a personal booking link for you. "
                "You'll receive it shortly on your phone or email to confirm the appointment. "
                f"Booking link: {link}"
            )
        return "Could not generate a Calendly booking link. Please try again."
    except Exception as exc:
        return f"Error creating Calendly link: {str(exc)[:100]}"
