"""
Plivo telephony webhook endpoints.
  POST /telephony/plivo/inbound          — inbound call (returns Plivo XML)
  GET  /telephony/plivo/answer           — answer URL for outbound calls
  POST /telephony/plivo/status-callback  — hangup / status events
"""
import uuid
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Form, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from backend.config import settings
from backend.db.database import AsyncSessionLocal
from backend.db.models import Agent, Call, Contact, PhoneNumber
from backend.telephony.plivo_handler import PlivoHandler
from backend.utils.phone import normalize_phone

log = structlog.get_logger()
router = APIRouter()


def _xml(ws_url: str) -> PlainTextResponse:
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        '<Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">'
        f"{ws_url}"
        "</Stream>"
        "</Response>"
    )
    return PlainTextResponse(xml, media_type="application/xml")


@router.post("/inbound")
async def plivo_inbound(
    From: str = Form(default=""),
    To: str = Form(default=""),
    CallUUID: str = Form(default=""),
):
    """Plivo calls this when someone dials our number. Returns XML to stream audio."""
    async with AsyncSessionLocal() as db:
        to_norm = normalize_phone(To) if To else To

        # Inbound is served ONLY on a number the workspace has purchased. A workspace
        # with no purchased number is outbound-only and cannot receive inbound calls.
        pn_result = await db.execute(
            select(PhoneNumber).where(
                PhoneNumber.phone_number == to_norm,
                PhoneNumber.is_active == True,
            )
        )
        phone_record = pn_result.scalar_one_or_none()
        workspace_id = None
        agent_id = None

        # Suspended (rental lapsed) → number can't receive calls until renewed.
        if phone_record and getattr(phone_record, "is_suspended", False):
            log.warning("Plivo inbound rejected — number suspended (rental lapsed)", to=To)
            return PlainTextResponse(
                '<?xml version="1.0" encoding="UTF-8"?>'
                "<Response><Speak>This number is temporarily inactive. "
                "Please try again later.</Speak></Response>",
                media_type="application/xml",
            )

        if phone_record:
            workspace_id = phone_record.workspace_id
            agent = None
            if phone_record.agent_id:
                agent = await db.get(Agent, phone_record.agent_id)
                if agent and not agent.is_active:
                    agent = None
            if not agent:
                # Workspace's default answerer: its first active agent.
                res = await db.execute(
                    select(Agent).where(
                        Agent.workspace_id == phone_record.workspace_id,
                        Agent.is_active == True,
                    ).limit(1)
                )
                agent = res.scalar_one_or_none()
            if agent:
                agent_id = agent.id
        elif (settings.INBOUND_AGENT_ID and to_norm and settings.PLIVO_PHONE_NUMBER
              and to_norm == normalize_phone(settings.PLIVO_PHONE_NUMBER)):
            # Platform's own demo number (env) → configured demo agent.
            agent = await db.get(Agent, settings.INBOUND_AGENT_ID)
            if agent and agent.is_active:
                workspace_id = agent.workspace_id
                agent_id = agent.id

        if not agent_id:
            log.warning("Plivo inbound rejected — number not purchased by any workspace", to=To)
            return PlainTextResponse(
                '<?xml version="1.0" encoding="UTF-8"?>'
                "<Response><Speak>This number is not in service.</Speak></Response>",
                media_type="application/xml",
            )

        phone = normalize_phone(From) if From else From
        contact_result = await db.execute(
            select(Contact).where(
                Contact.workspace_id == workspace_id,
                Contact.phone_number == phone,
            )
        )
        contact = contact_result.scalar_one_or_none()
        if not contact:
            contact = Contact(id=str(uuid.uuid4()), workspace_id=workspace_id, phone_number=phone)
            db.add(contact)
            await db.flush()

        call = Call(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            agent_id=agent_id,
            contact_id=contact.id,
            phone_number=phone,
            direction="inbound",
            status="in_progress",
            pipeline_mode="native",
            telephony_sid=CallUUID,
        )
        db.add(call)
        await db.commit()

        base_ws = settings.BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        ws_url = f"{base_ws}/ws/call/{agent_id}?call_id={call.id}"
        log.info("Plivo inbound call", from_=From, to=To, call_id=call.id)
        return _xml(ws_url)


@router.get("/answer")
async def plivo_answer(ws_url: str = Query(...)):
    """Answer URL for outbound Plivo calls — returns Plivo XML with WebSocket stream."""
    from urllib.parse import unquote
    return _xml(unquote(ws_url))


@router.post("/status-callback")
async def plivo_status_callback(
    CallUUID: str = Form(default=""),
    Event: str = Form(default=""),
    Duration: str = Form(default="0"),
    BillDuration: str = Form(default=""),
    HangupCause: str = Form(default=""),
):
    """
    Plivo posts here on every call state change.
    Event values: Ringing | InProgress | Hangup
    HangupCause (on Hangup): NORMAL_CLEARING | USER_BUSY | NO_ANSWER |
                              ORIGINATOR_CANCEL | NO_ROUTE_DESTINATION | INVALID_NUMBER_FORMAT | ...
    """
    event_lower = Event.lower()

    # Only process terminal events
    if event_lower not in ("hangup",):
        # For InProgress events, mark call as in_progress and set started_at
        if event_lower == "inprogress":
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Call).where(Call.telephony_sid == CallUUID))
                call = result.scalar_one_or_none()
                if call and not call.started_at:
                    call.started_at = datetime.utcnow()
                    call.status = "in_progress"
                    await db.commit()
        log.info("Plivo status event (non-terminal)", call_uuid=CallUUID, event=Event)
        return PlainTextResponse("OK")

    # Map HangupCause → our status
    cause = HangupCause.upper()
    _not_answered = {"USER_BUSY", "NO_ANSWER", "NO_USER_RESPONSE", "SUBSCRIBER_ABSENT",
                     "CALL_REJECTED", "UNALLOCATED_NUMBER"}
    _cancelled = {"ORIGINATOR_CANCEL", "LOSE_RACE"}

    if cause in _not_answered:
        our_status = "not_answered"
    elif cause in _cancelled:
        our_status = "cancelled"
    elif cause in ("NORMAL_CLEARING", "NORMAL_CALL_CLEARING", ""):
        our_status = "completed"
    else:
        our_status = "failed"

    # Prefer BillDuration (Plivo's billed seconds) over Duration
    dur_str = BillDuration or Duration
    duration_sec: int | None = None
    try:
        duration_sec = int(dur_str) if dur_str else None
    except ValueError:
        pass

    ended_at = datetime.utcnow()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Call).where(Call.telephony_sid == CallUUID))
        call = result.scalar_one_or_none()
        if call:
            _terminal = {"completed", "voicemail", "not_answered", "failed", "cancelled"}
            if call.status not in _terminal:
                call.status = our_status

            if not call.ended_at:
                call.ended_at = ended_at

            if duration_sec is not None and not call.duration_seconds:
                call.duration_seconds = duration_sec

            # Infer started_at from ended_at - duration if missing
            if call.ended_at and call.duration_seconds and not call.started_at:
                call.started_at = call.ended_at - timedelta(seconds=call.duration_seconds)

            await db.commit()

    log.info("Plivo hangup", call_uuid=CallUUID, cause=HangupCause, status=our_status,
             duration=duration_sec)
    return PlainTextResponse("OK")
