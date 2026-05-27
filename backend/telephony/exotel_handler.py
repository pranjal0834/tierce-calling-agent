"""
Exotel telephony handler — India-focused provider.
ExoML is Twilio-compatible so the existing WebSocket audio pipeline works unchanged.
"""
from urllib.parse import quote

import httpx
import structlog

from backend.config import settings

log = structlog.get_logger()


class ExotelHandler:
    def __init__(self, api_key: str, api_token: str, account_sid: str,
                 virtual_number: str, subdomain: str = "api.exotel.in"):
        self.api_key = api_key
        self.api_token = api_token
        self.account_sid = account_sid
        self.virtual_number = virtual_number
        self.base_url = f"https://{subdomain}/v1/Accounts/{account_sid}"

    async def make_call(self, to: str, websocket_url: str, call_id: str,
                        caller_id: str | None = None) -> str:
        """Initiate an outbound call. Returns Exotel CallSid."""
        exoml_url = (
            f"{settings.BASE_URL}/telephony/exotel/exoml"
            f"?ws_url={quote(websocket_url, safe='')}"
        )
        status_url = f"{settings.BASE_URL}/telephony/exotel/status-callback"

        payload = {
            "From": caller_id or self.virtual_number,
            "To": to,
            "CallerId": caller_id or self.virtual_number,
            "Url": exoml_url,
            "Method": "POST",
            "StatusCallback": status_url,
            "StatusCallbackMethod": "POST",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/Calls/connect",
                data=payload,
                auth=(self.api_key, self.api_token),
            )
            response.raise_for_status()
            data = response.json()
            sid = data.get("Call", {}).get("Sid", "")
            log.info("Exotel call initiated", to=to, call_sid=sid, call_id=call_id)
            return sid

    def build_exoml(self, websocket_url: str) -> str:
        """ExoML to stream call audio to our WebSocket — identical structure to Twilio TwiML."""
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<Response>"
            "<Connect>"
            f'<Stream url="{websocket_url}" />'
            "</Connect>"
            "</Response>"
        )

    async def end_call(self, call_sid: str) -> None:
        """Hang up an active Exotel call."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{self.base_url}/Calls/{call_sid}",
                data={"Status": "completed"},
                auth=(self.api_key, self.api_token),
            )
