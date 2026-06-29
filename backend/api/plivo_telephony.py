"""
Plivo telephony webhook endpoints.
  POST /telephony/plivo/inbound          — inbound call (returns Plivo XML)
  GET  /telephony/plivo/answer           — answer URL for outbound calls
  POST /telephony/plivo/status-callback  — hangup / status events
"""
import asyncio
import uuid
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Form, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from backend.config import settings
from backend.db.database import AsyncSessionLocal
from backend.db.models import Agent, Call, Contact, PhoneNumber, Workspace
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


async def _fetch_and_save_recording(call_uuid: str):
    """After a call ends, pull its recording URL from Plivo's Recordings API and save it
    onto the Call. Retries a few times since the recording finalizes shortly after hangup."""
    handler = PlivoHandler()
    for delay in (6, 12, 25):
        await asyncio.sleep(delay)
        try:
            resp = await asyncio.get_event_loop().run_in_executor(
                None, lambda: handler.client.recordings.list(call_uuid=call_uuid))
            url = ""
            for o in (getattr(resp, "objects", None) or []):
                url = (getattr(o, "__dict__", {}) or {}).get("recording_url") or ""
                if url:
                    break
            if not url:
                continue
            async with AsyncSessionLocal() as db:
                call = (await db.execute(select(Call).where(Call.telephony_sid == call_uuid))).scalar_one_or_none()
                if call and not call.recording_url:
                    call.recording_url = url
                    await db.commit()
                    log.info("Plivo recording saved (post-hangup fetch)", call_id=call.id)
            return
        except Exception as exc:
            log.warning("Plivo recording fetch attempt failed", call_uuid=call_uuid, error=str(exc))


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

        ws = await db.get(Workspace, workspace_id) if workspace_id else None

        # Inbound calling is a PAID feature — free-plan workspaces can only make outbound
        # trial calls, not receive inbound.
        if ws and ws.plan == "free":
            log.warning("Plivo inbound rejected — free plan (inbound is paid-only)",
                        workspace_id=workspace_id)
            return PlainTextResponse(
                '<?xml version="1.0" encoding="UTF-8"?>'
                "<Response><Speak>Inbound calling is available on a paid plan. "
                "Please upgrade to receive calls.</Speak></Response>",
                media_type="application/xml",
            )

        # Out of call credits → do NOT connect the agent (it would run the balance further
        # negative). Same threshold as outbound (initiate/bulk reject at <= 0).
        if ws and (ws.credits_balance or 0.0) <= 0:
            log.warning("Plivo inbound rejected — workspace out of call credits",
                        workspace_id=workspace_id, balance=ws.credits_balance)
            return PlainTextResponse(
                '<?xml version="1.0" encoding="UTF-8"?>'
                "<Response><Speak>Your account balance is low. Please top up your "
                "credits to continue.</Speak></Response>",
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
        # Record the call (Plivo POSTs the URL to /recording-status when it ends).
        asyncio.create_task(PlivoHandler().start_recording(CallUUID))
        return _xml(ws_url)


@router.get("/answer")
async def plivo_answer(ws_url: str = Query(...), CallUUID: str = Query(default="")):
    """Answer URL for outbound Plivo calls — returns Plivo XML with WebSocket stream."""
    from urllib.parse import unquote
    # Record the call (Plivo POSTs the URL to /recording-status when it ends).
    if CallUUID:
        asyncio.create_task(PlivoHandler().start_recording(CallUUID))
    return _xml(unquote(ws_url))


@router.get("/transfer-xml")
async def plivo_transfer_xml(to: str, call_id: str = ""):
    """Plivo fetches this when the transfer_call tool redirects the caller leg — returns
    Plivo XML that dials the human agent and records the post-transfer conversation."""
    record_cb = f"{settings.BASE_URL}/telephony/plivo/recording-status"
    # Plivo's <Number> must have NO spaces — strip whitespace from the configured number.
    dial_to = "".join((to or "").split())
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        f'<Dial record="true" recordType="mp3" callbackUrl="{record_cb}" callbackMethod="POST">'
        f"<Number>{dial_to}</Number>"
        "</Dial>"
        "</Response>"
    )
    return PlainTextResponse(xml, media_type="application/xml")


@router.post("/recording-status")
async def plivo_recording_status(request: Request):
    """Plivo posts here when a call recording finishes — save the URL on the call. Read
    the raw form and accept the field-name variants Plivo uses across its record APIs."""
    form = await request.form()
    d = {k: str(v) for k, v in form.items()}
    record_url = d.get("RecordUrl") or d.get("RecordingUrl") or d.get("record_url") or ""
    call_uuid = d.get("CallUUID") or d.get("call_uuid") or ""
    if not record_url or not call_uuid:
        log.info("Plivo recording callback — no url/uuid", keys=list(d.keys()))
        return PlainTextResponse("OK")
    async with AsyncSessionLocal() as db:
        call = (await db.execute(select(Call).where(Call.telephony_sid == call_uuid))).scalar_one_or_none()
        if call and not call.recording_url:
            call.recording_url = record_url
            await db.commit()
            log.info("Plivo recording URL saved", call_id=call.id,
                     recording_id=d.get("RecordingID") or d.get("recording_id"))
    return PlainTextResponse("OK")


@router.post("/status-callback")
async def plivo_status_callback(
    CallUUID: str = Form(default=""),
    Event: str = Form(default=""),
    Duration: str = Form(default="0"),
    BillDuration: str = Form(default=""),
    HangupCause: str = Form(default=""),
    HangupSource: str = Form(default=""),
):
    """
    Plivo posts here on every call state change.
    Event values: Ringing | InProgress | Hangup
    HangupCause (on Hangup): NORMAL_CLEARING | USER_BUSY | NO_ANSWER |
                              ORIGINATOR_CANCEL | NO_ROUTE_DESTINATION | INVALID_NUMBER_FORMAT | ...
    HangupSource (on Hangup): Caller | Callee | Platform | API
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

    # Plivo's ACTUAL call duration (matches the caller's phone). Prefer Duration over the
    # rounded-up BillDuration — and treat it as authoritative for what we display.
    dur_str = Duration or BillDuration
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

            # Post-transfer (human handoff): Plivo's full duration far exceeds the AI portion
            # we already billed → bill the extra once. The >30s guard avoids mistaking the
            # engine's session-estimate vs Plivo rounding for a real handoff.
            ai_secs = call.duration_seconds or 0
            if duration_sec is not None and duration_sec > ai_secs + 30:
                extra_secs = duration_sec - ai_secs
                _ed = dict(call.extra_data or {})
                if not _ed.get("post_transfer_billed"):
                    try:
                        from backend.billing.credits import deduct_credits
                        if call.workspace_id:
                            await deduct_credits(db, call.workspace_id, extra_secs, call.id)
                        _ed["post_transfer_billed"] = True
                        from sqlalchemy.orm.attributes import flag_modified
                        call.extra_data = _ed
                        flag_modified(call, "extra_data")
                        log.info("Billed extra post-transfer minutes (plivo)",
                                 call_id=call.id, extra_seconds=extra_secs, full_seconds=duration_sec)
                    except Exception as exc:
                        log.warning("Post-transfer billing failed (plivo)", call_id=call.id, error=str(exc))

            # Plivo's reported duration is the source of truth for what we DISPLAY — it
            # matches the caller's phone. Override the engine's session estimate (which can
            # over-count by the post-call WebSocket teardown).
            if duration_sec is not None:
                call.duration_seconds = duration_sec
                if call.started_at:
                    call.ended_at = call.started_at + timedelta(seconds=duration_sec)

            # Infer started_at from ended_at - duration if missing
            if call.ended_at and call.duration_seconds and not call.started_at:
                call.started_at = call.ended_at - timedelta(seconds=call.duration_seconds)

            # Record who ended the call (unless the engine already set it on a clean hangup).
            extra = dict(call.extra_data or {})
            if not extra.get("ended_by"):
                src = HangupSource.upper()
                if cause in _not_answered:
                    extra["ended_by"] = "caller"
                elif our_status == "failed":
                    extra["ended_by"] = "system"
                elif src in ("API", "PLATFORM"):
                    extra["ended_by"] = "agent"      # we hung up (end_call tool / platform)
                elif src in ("CALLER", "CALLEE"):
                    extra["ended_by"] = "caller"      # the human hung up
                if extra.get("ended_by"):
                    from sqlalchemy.orm.attributes import flag_modified
                    call.extra_data = extra
                    flag_modified(call, "extra_data")

            await db.commit()

    log.info("Plivo hangup", call_uuid=CallUUID, cause=HangupCause, status=our_status,
             duration=duration_sec)

    # The record-callback payload shape is unreliable, so fetch the recording URL straight
    # from Plivo's API a few seconds after hangup (once it's finalized) and save it.
    asyncio.create_task(_fetch_and_save_recording(CallUUID))
    return PlainTextResponse("OK")
