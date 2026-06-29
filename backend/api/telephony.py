"""
Twilio telephony webhooks.
  POST /telephony/twilio/twiml        — outbound: returns streaming TwiML given ws_url
  POST /telephony/twilio/inbound      — inbound: creates Call record, picks agent, returns TwiML
"""
import uuid

import structlog
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.database import get_db
from backend.db.models import Agent, Call, Contact, PhoneNumber, Workspace
from sqlalchemy import select as sa_select
from backend.telephony.twilio_handler import TwilioHandler
from backend.utils.phone import normalize_phone

log = structlog.get_logger()
router = APIRouter()


@router.post("/twilio/amd-status")
async def twilio_amd_status(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Twilio posts here asynchronously after Answering Machine Detection finishes.
    AnsweredBy values: human | machine_start | machine_end_beep |
                       machine_end_silence | machine_end_other | fax
    """
    form = await request.form()
    call_sid = str(form.get("CallSid", ""))
    answered_by = str(form.get("AnsweredBy", "")).lower()

    log.info("AMD result received", call_sid=call_sid, answered_by=answered_by)

    # Only hang up on definitive voicemail — machine_start is too often a false positive
    definitive_voicemail = answered_by in ("machine_end_beep", "machine_end_silence",
                                            "machine_end_other", "fax")
    if definitive_voicemail:
        # Look up the call by Twilio SID and mark as voicemail
        result = await db.execute(
            sa_select(Call).where(Call.telephony_sid == call_sid)
        )
        call = result.scalars().first()
        if call:
            from sqlalchemy.orm.attributes import flag_modified
            call.status = "voicemail"
            extra = dict(call.extra_data or {})
            extra["ended_by"] = "agent"
            call.extra_data = extra
            flag_modified(call, "extra_data")
            await db.commit()
            log.info("Voicemail detected — hanging up", call_id=call.id, call_sid=call_sid)

        # Hang up the call via Twilio
        try:
            handler = TwilioHandler()
            await handler.end_call(call_sid)
        except Exception as exc:
            log.warning("Could not hang up voicemail call", call_sid=call_sid, error=str(exc))

    return Response(content="", status_code=204)


@router.post("/twilio/status-callback")
async def twilio_status_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Twilio posts every call state change here.
    CallStatus values: initiated | ringing | in-progress | completed | busy | no-answer | failed | canceled
    """
    from datetime import datetime

    form = await request.form()
    call_sid = str(form.get("CallSid", ""))
    twilio_status = str(form.get("CallStatus", "")).lower()
    call_duration = form.get("CallDuration")  # seconds, present on completed
    recording_url = str(form.get("RecordingUrl", ""))   # present on completed when record=True
    recording_sid = str(form.get("RecordingSid", ""))

    # Map Twilio statuses → our statuses
    status_map = {
        "initiated":    "initiated",
        "ringing":      "ringing",
        "in-progress":  "in_progress",
        "completed":    "completed",
        "busy":         "not_answered",
        "no-answer":    "not_answered",
        "failed":       "failed",
        "canceled":     "cancelled",
    }
    new_status = status_map.get(twilio_status)
    if not new_status:
        return Response(content="", status_code=204)

    result = await db.execute(
        sa_select(Call).where(Call.telephony_sid == call_sid)
    )
    call = result.scalar_one_or_none()
    if not call:
        return Response(content="", status_code=204)

    # Never downgrade a terminal status (voicemail/completed/not_answered/failed/cancelled)
    _terminal = {"completed", "voicemail", "not_answered", "failed", "cancelled"}
    if call.status in _terminal and new_status not in _terminal:
        return Response(content="", status_code=204)

    call.status = new_status

    # Set timestamps from Twilio — most reliable source
    now = datetime.utcnow()
    if new_status == "in_progress" and not call.started_at:
        call.started_at = now
    elif new_status in _terminal:
        if not call.ended_at:
            call.ended_at = now
        full_dur = None
        if call_duration:
            try:
                full_dur = int(call_duration)
            except (ValueError, TypeError):
                full_dur = None
        if full_dur is not None and not call.duration_seconds:
            call.duration_seconds = full_dur
        elif full_dur is not None and full_dur > (call.duration_seconds or 0) + 2:
            # Twilio's full duration exceeds the AI portion we already finalized + billed —
            # this is the post-transfer (human handoff) time. Correct the call's duration to
            # the true full length and bill ONLY the extra minutes, exactly once.
            extra_secs = full_dur - (call.duration_seconds or 0)
            call.duration_seconds = full_dur
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
                    log.info("Billed extra post-transfer minutes",
                             call_id=call.id, extra_seconds=extra_secs, full_seconds=full_dur)
                except Exception as exc:
                    log.warning("Post-transfer billing failed", call_id=call.id, error=str(exc))
        if call.started_at and call.ended_at and not call.duration_seconds:
            call.duration_seconds = int((call.ended_at - call.started_at).total_seconds())

        # Capture recording URL — Twilio embeds it in the completed callback
        if recording_url and not call.recording_url:
            call.recording_url = f"{recording_url}.mp3" if not recording_url.endswith(".mp3") else recording_url
            log.info("Recording URL saved via status callback",
                     call_id=call.id, recording_sid=recording_sid)

        # Record who ended the call if not already set
        extra = dict(call.extra_data or {})
        if not extra.get("ended_by"):
            if twilio_status in ("busy", "no-answer"):
                # Caller actively rejected or didn't pick up
                extra["ended_by"] = "caller"
            elif twilio_status == "failed":
                extra["ended_by"] = "system"
            elif twilio_status == "canceled":
                extra["ended_by"] = "agent"
            # "completed" — ended_by already set by openai_realtime handler
            if extra.get("ended_by"):
                from sqlalchemy.orm.attributes import flag_modified
                call.extra_data = extra
                flag_modified(call, "extra_data")

    await db.commit()
    log.info("Call status updated via Twilio callback",
             call_sid=call_sid, twilio_status=twilio_status, new_status=new_status)
    return Response(content="", status_code=204)


@router.post("/twilio/recording-status")
async def twilio_recording_status(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Twilio posts here when a call recording is ready.
    Saves the recording URL to the call record.
    """
    form = await request.form()
    call_sid = str(form.get("CallSid", ""))
    recording_sid = str(form.get("RecordingSid", ""))
    recording_status = str(form.get("RecordingStatus", "")).lower()

    log.info("Recording status received", call_sid=call_sid, recording_sid=recording_sid, status=recording_status)

    if recording_status != "completed" or not recording_sid:
        return Response(content="", status_code=204)

    result = await db.execute(
        sa_select(Call).where(Call.telephony_sid == call_sid)
    )
    call = result.scalar_one_or_none()
    if call:
        # Construct the MP3 download URL (requires Twilio auth — served via our proxy)
        call.recording_url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Recordings/{recording_sid}.mp3"
        await db.commit()
        log.info("Recording URL saved", call_id=call.id, recording_sid=recording_sid)

    return Response(content="", status_code=204)


@router.post("/twilio/twiml")
async def twilio_twiml(request: Request):
    """Outbound: Twilio calls this to get streaming TwiML (ws_url passed as query param)."""
    params = dict(request.query_params)
    ws_url = params.get("ws_url", "")
    handler = TwilioHandler()
    twiml = handler.build_twiml(ws_url)
    return Response(content=twiml, media_type="application/xml")


@router.get("/twilio/transfer-twiml")
async def transfer_twiml(to: str, call_id: str = ""):
    """Return TwiML to dial a number — used by the transfer_call tool.
    Streams both audio tracks to /ws/transfer/{call_id} so the post-transfer
    conversation is transcribed and saved. Also records the Dial leg.
    """
    from fastapi.responses import Response as FastAPIResponse
    recording_cb = f"{settings.BASE_URL}/telephony/twilio/recording-status"

    stream_block = ""
    if call_id:
        ws_base = settings.BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        stream_url = f"{ws_base}/ws/transfer/{call_id}"
        stream_block = f'<Start><Stream url="{stream_url}" track="both_tracks"/></Start>'

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<Response>'
        f'{stream_block}'
        f'<Dial record="record-from-answer" recordingStatusCallback="{recording_cb}" recordingStatusCallbackMethod="POST">'
        f'{to}'
        f'</Dial>'
        f'</Response>'
    )
    return FastAPIResponse(content=twiml, media_type="application/xml")


@router.post("/twilio/inbound")
async def twilio_inbound(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Inbound: Twilio POSTs here when someone calls the Twilio number.
    Creates a Call record, selects an agent, returns TwiML to start streaming.
    Configure this URL in the Twilio console as the Voice webhook for your number.
    """
    form = await request.form()
    call_sid = form.get("CallSid", "")
    from_number = normalize_phone(str(form.get("From", "")))
    to_number = str(form.get("To", ""))

    log.info("Inbound call received", call_sid=call_sid, from_number=from_number,
             to_number=to_number)

    # Inbound is served ONLY on a number the workspace has purchased. A workspace
    # with no purchased number is outbound-only and cannot receive inbound calls.
    #   1. PhoneNumber matching the To number → assigned agent, else workspace's first active agent
    #   2. Platform's own env number → INBOUND_AGENT_ID (demo line only)
    #   3. Otherwise → not in service
    agent: Agent | None = None
    workspace_id_override: str | None = None

    pn_result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.phone_number == normalize_phone(to_number),
            PhoneNumber.is_active == True,
        )
    )
    phone_record = pn_result.scalar_one_or_none()

    # Suspended (rental lapsed) → number can't receive calls until renewed.
    if phone_record and getattr(phone_record, "is_suspended", False):
        log.warning("Twilio inbound rejected — number suspended (rental lapsed)", to=to_number)
        return Response(
            content="<Response><Say>This number is temporarily inactive. Please try again later.</Say><Hangup/></Response>",
            media_type="application/xml",
        )

    if phone_record:
        workspace_id_override = phone_record.workspace_id
        if phone_record.agent_id:
            agent = await db.get(Agent, phone_record.agent_id)
            if agent and not agent.is_active:
                agent = None
        if not agent:
            result = await db.execute(
                select(Agent).where(
                    Agent.workspace_id == phone_record.workspace_id,
                    Agent.is_active == True,
                ).limit(1)
            )
            agent = result.scalar_one_or_none()
    elif (settings.INBOUND_AGENT_ID and to_number and settings.TWILIO_PHONE_NUMBER
          and normalize_phone(to_number) == normalize_phone(settings.TWILIO_PHONE_NUMBER)):
        # Platform's own demo number (env) → configured demo agent.
        agent = await db.get(Agent, settings.INBOUND_AGENT_ID)
        if agent and not agent.is_active:
            agent = None

    if not agent:
        twiml = "<Response><Say>This number is not in service.</Say><Hangup/></Response>"
        return Response(content=twiml, media_type="application/xml")

    effective_workspace_id = workspace_id_override or agent.workspace_id

    workspace = await db.get(Workspace, effective_workspace_id)

    # Inbound calling is a PAID feature — free-plan workspaces can only make outbound
    # trial calls, not receive inbound.
    if workspace and workspace.plan == "free":
        log.info("Inbound call rejected — free plan (inbound is paid-only)",
                 call_sid=call_sid, workspace_id=effective_workspace_id)
        twiml = ("<Response><Say>Inbound calling is available on a paid plan. "
                 "Please upgrade to receive calls.</Say><Hangup/></Response>")
        return Response(content=twiml, media_type="application/xml")

    # Balance gate: don't answer inbound calls for an out-of-credit workspace
    # (matches the outbound HTTP 402 gate). Otherwise inbound usage is uncapped
    # and bills the workspace into the negative.
    if not workspace or (workspace.credits_balance or 0.0) <= 0:
        log.info("Inbound call rejected — insufficient credits",
                 call_sid=call_sid, workspace_id=effective_workspace_id)
        twiml = ("<Response><Say>Your account balance is low. Please top up your "
                 "credits to continue.</Say><Hangup/></Response>")
        return Response(content=twiml, media_type="application/xml")

    # Upsert contact for the caller scoped to workspace
    result = await db.execute(
        select(Contact).where(
            Contact.workspace_id == effective_workspace_id,
            Contact.phone_number == from_number,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        contact = Contact(
            id=str(uuid.uuid4()),
            workspace_id=effective_workspace_id,
            phone_number=from_number,
        )
        db.add(contact)
        await db.flush()

    # Create Call record
    call = Call(
        id=str(uuid.uuid4()),
        workspace_id=effective_workspace_id,
        agent_id=agent.id,
        contact_id=contact.id,
        phone_number=from_number,
        direction="inbound",
        status="in-progress",
        pipeline_mode=agent.pipeline_mode,
        telephony_sid=call_sid,
    )
    db.add(call)
    await db.flush()

    # Build WebSocket URL so Twilio streams audio to our handler
    base_ws = settings.BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{base_ws}/ws/call/{agent.id}?call_id={call.id}"

    handler = TwilioHandler()
    twiml = handler.build_twiml(ws_url)

    log.info("Inbound call routed", call_id=call.id, agent_id=agent.id,
             from_number=from_number)
    return Response(content=twiml, media_type="application/xml")
