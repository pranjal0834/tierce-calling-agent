"""
Exotel telephony webhook endpoints.
  POST /telephony/exotel/inbound          — inbound call webhook (returns ExoML)
  GET  /telephony/exotel/exoml            — ExoML for outbound calls
  POST /telephony/exotel/status-callback  — call status/end events
"""
import uuid
from urllib.parse import unquote

import structlog
from fastapi import APIRouter, Form, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from backend.config import settings
from backend.db.database import AsyncSessionLocal
from backend.db.models import Agent, Call, Contact, TelephonyConfig
from backend.telephony.exotel_handler import ExotelHandler
from backend.utils.phone import normalize_phone

log = structlog.get_logger()
router = APIRouter()

_DUMMY_EXOTEL = ExotelHandler("", "", "", "")  # stateless — only needed for build_exoml


def _exoml(ws_url: str) -> PlainTextResponse:
    return PlainTextResponse(_DUMMY_EXOTEL.build_exoml(ws_url), media_type="application/xml")


@router.post("/inbound")
async def exotel_inbound(
    From: str = Form(default=""),
    To: str = Form(default=""),
    CallSid: str = Form(default=""),
):
    """Exotel calls this when someone dials our virtual number. Returns ExoML to stream audio."""
    async with AsyncSessionLocal() as db:
        to_norm = normalize_phone(To) if To else To
        workspace_id = None
        agent_id = None

        # Match workspace by virtual_number in TelephonyConfig
        result = await db.execute(
            select(TelephonyConfig).where(TelephonyConfig.provider == "exotel")
        )
        for cfg in result.scalars().all():
            vn = (cfg.config or {}).get("virtual_number", "")
            if vn and normalize_phone(vn) == to_norm:
                workspace_id = cfg.workspace_id
                break

        # Fallback: INBOUND_AGENT_ID env var
        if not workspace_id and settings.INBOUND_AGENT_ID:
            agent = await db.get(Agent, settings.INBOUND_AGENT_ID)
            if agent:
                workspace_id = agent.workspace_id
                agent_id = agent.id

        if workspace_id and not agent_id:
            agent_result = await db.execute(
                select(Agent).where(
                    Agent.workspace_id == workspace_id,
                    Agent.is_active == True,
                ).limit(1)
            )
            ag = agent_result.scalar_one_or_none()
            if ag:
                agent_id = ag.id

        if not agent_id:
            log.warning("Exotel inbound: no agent found", to=To)
            return PlainTextResponse(
                '<?xml version="1.0" encoding="UTF-8"?>'
                "<Response><Say>Sorry, this number is not configured.</Say></Response>",
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
            telephony_sid=CallSid,
        )
        db.add(call)
        await db.commit()

        base_ws = settings.BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        ws_url = f"{base_ws}/ws/call/{agent_id}?call_id={call.id}"
        log.info("Exotel inbound call", from_=From, to=To, call_id=call.id)
        return _exoml(ws_url)


@router.get("/exoml")
async def exotel_exoml(ws_url: str = Query(...)):
    """Returns ExoML for outbound calls. Exotel fetches this after dialling."""
    return _exoml(unquote(ws_url))


@router.post("/status-callback")
async def exotel_status_callback(
    CallSid: str = Form(default=""),
    Status: str = Form(default=""),
    Duration: str = Form(default="0"),
):
    """Exotel status/end event — update our Call record."""
    status_map = {
        "completed": "completed",
        "failed": "failed",
        "busy": "no-answer",
        "no-answer": "no-answer",
        "canceled": "cancelled",
        "in-progress": "in_progress",
    }
    our_status = status_map.get(Status.lower(), Status.lower())
    if our_status in ("completed", "failed", "no-answer", "cancelled"):
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Call).where(Call.telephony_sid == CallSid)
            )
            call = result.scalar_one_or_none()
            if call:
                call.status = our_status
                try:
                    call.duration_seconds = int(Duration)
                except ValueError:
                    pass
                await db.commit()
    log.info("Exotel status callback", call_sid=CallSid, status=Status)
    return PlainTextResponse("OK")
