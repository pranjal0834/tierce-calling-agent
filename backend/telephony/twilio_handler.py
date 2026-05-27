"""
Twilio Telephony Handler
Initiates outbound calls and provides TwiML for streaming audio to our WebSocket.
"""
from typing import Optional

import structlog
from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse, Connect

from backend.config import settings

log = structlog.get_logger()


class TwilioHandler:
    def __init__(self):
        self.client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    async def make_call(
        self,
        to: str,
        websocket_url: str,
        call_id: str,
        caller_id: Optional[str] = None,
    ) -> str:
        """
        Initiate an outbound call with async AMD (Answering Machine Detection).
        Returns the Twilio CallSid.
        """
        from urllib.parse import quote
        twiml_url = f"{settings.BASE_URL}/telephony/twilio/twiml?ws_url={quote(websocket_url, safe='')}"
        amd_url = f"{settings.BASE_URL}/telephony/twilio/amd-status"
        status_url = f"{settings.BASE_URL}/telephony/twilio/status-callback"
        recording_url = f"{settings.BASE_URL}/telephony/twilio/recording-status"
        call = self.client.calls.create(
            to=to,
            from_=caller_id or settings.TWILIO_PHONE_NUMBER,
            url=twiml_url,
            method="POST",
            record=True,
            recording_status_callback=recording_url,
            recording_status_callback_method="POST",
            # Status callback — Twilio reports every state change (ringing, answered, completed, no-answer, busy, failed)
            status_callback=status_url,
            status_callback_method="POST",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
            # Async AMD — detects voicemail without delaying call connection
            machine_detection="Enable",
            async_amd=True,
            async_amd_status_callback=amd_url,
            async_amd_status_callback_method="POST",
        )
        log.info("Twilio call initiated", to=to, call_sid=call.sid, call_id=call_id)
        return call.sid

    def build_twiml(self, websocket_url: str) -> str:
        """Build TwiML response that streams audio to our WebSocket."""
        response = VoiceResponse()
        connect = Connect()
        connect.stream(url=websocket_url)
        response.append(connect)
        return str(response)

    async def end_call(self, call_sid: str):
        self.client.calls(call_sid).update(status="completed")
        log.info("Twilio call ended", call_sid=call_sid)
