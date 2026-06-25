import asyncio
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from backend.auth.dependencies import require_workspace, get_current_user
from backend.db.database import get_db, AsyncSessionLocal
from backend.db.models import Agent, Call, Contact, CallTurn, PhoneNumber, User, Workspace
from backend.models.schemas import InitiateCallRequest, CallOut, TurnOut, BulkCallRequest, BulkCallResponse
from backend.telephony.twilio_handler import TwilioHandler
from backend.config import settings
from backend.utils.phone import normalize_phone

import structlog
log = structlog.get_logger()

router = APIRouter()


@router.post("/initiate", response_model=CallOut, status_code=201)
async def initiate_call(
    payload: InitiateCallRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    agent = await db.get(Agent, payload.agent_id)
    if not agent or not agent.is_active or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")

    if (workspace.credits_balance or 0.0) <= 0:
        raise HTTPException(
            status_code=402,
            detail="Insufficient balance. Please top up your account to make calls.",
        )

    if await _workspace_calling_blocked(db, workspace.id):
        raise HTTPException(
            status_code=403,
            detail="Your phone number rental has expired. Renew your number to resume making calls.",
        )

    phone = normalize_phone(payload.phone_number)

    # Compliance: calling window (quiet hours) + DNC suppression.
    from backend.core import compliance
    if not compliance.within_calling_window(workspace):
        raise HTTPException(
            status_code=403,
            detail=f"Outside allowed calling hours ({compliance.calling_window_label(workspace)}).",
        )
    if await compliance.is_dnc(db, workspace.id, phone):
        raise HTTPException(status_code=403, detail="This number is on your Do-Not-Call list.")

    # Reject if a *recent* active call to this number is already in flight.
    # Only consider calls started in the last 30 min — older "active" rows are
    # orphaned (call ended but status never finalized) and must not block forever.
    recent_cutoff = datetime.utcnow() - timedelta(minutes=30)
    active_check = await db.execute(
        select(Call).where(
            Call.workspace_id == workspace.id,
            Call.phone_number == phone,
            Call.status.in_(["initiated", "ringing", "in_progress"]),
            Call.created_at >= recent_cutoff,
        )
    )
    if active_check.scalars().first():
        raise HTTPException(
            status_code=409,
            detail="A call to this number is already in progress.",
        )

    # Upsert contact scoped to workspace
    result = await db.execute(
        select(Contact).where(
            Contact.workspace_id == workspace.id,
            Contact.phone_number == phone,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        contact = Contact(
            id=str(uuid.uuid4()),
            workspace_id=workspace.id,
            phone_number=phone,
            **(payload.contact_data or {}),
        )
        db.add(contact)
        await db.flush()
    elif payload.contact_data:
        # Enrich existing contact with any newly-provided details.
        for field in ("name", "email", "company"):
            val = (payload.contact_data or {}).get(field)
            if val and str(val).strip():
                setattr(contact, field, str(val).strip())

    call = Call(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        agent_id=agent.id,
        contact_id=contact.id,
        phone_number=phone,
        direction="outbound",
        status="initiated",
        pipeline_mode=agent.pipeline_mode,
    )
    db.add(call)
    await db.flush()
    await db.commit()

    base_ws = settings.BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{base_ws}/ws/call/{agent.id}?call_id={call.id}"
    background_tasks.add_task(_dial, phone, ws_url, call.id, workspace.id)

    return call


async def _dial(phone_number: str, ws_url: str, call_id: str, workspace_id: str | None = None):
    call_sid = await _make_provider_call(phone_number, ws_url, call_id, workspace_id)
    if call_sid:
        async with AsyncSessionLocal() as fresh_db:
            call = await fresh_db.get(Call, call_id)
            if call:
                call.telephony_sid = call_sid
                await fresh_db.commit()


async def _workspace_caller_id(workspace_id: str | None, provider: str) -> str | None:
    """The workspace's own purchased number for this provider, used as the outbound
    caller ID so EVERY agent in the workspace dials out from the workspace's bought
    number. Excludes suspended (rental-lapsed) numbers. Returns None (→ provider's env
    default) if the workspace owns no usable number yet."""
    if not workspace_id:
        return None
    from sqlalchemy import select as _sel, desc as _desc
    from backend.db.models import PhoneNumber
    async with AsyncSessionLocal() as num_db:
        pn = (await num_db.execute(
            _sel(PhoneNumber).where(
                PhoneNumber.workspace_id == workspace_id,
                PhoneNumber.is_active == True,
                PhoneNumber.is_suspended == False,
                PhoneNumber.provider == provider,
            ).order_by(_desc(PhoneNumber.purchased_at)).limit(1)
        )).scalar_one_or_none()
    return pn.phone_number if pn else None


async def _workspace_calling_blocked(db: AsyncSession, workspace_id: str) -> bool:
    """True when the workspace owns phone number(s) but ALL of them are suspended
    (rental lapsed) — so it can't make calls until a number is renewed. A workspace
    that never bought a number is NOT blocked (it dials out via the platform default)."""
    from sqlalchemy import select as _sel
    nums = (await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.workspace_id == workspace_id,
            PhoneNumber.is_active == True,
        )
    )).scalars().all()
    if not nums:
        return False
    return all(getattr(n, "is_suspended", False) for n in nums)


async def _make_provider_call(phone_number: str, ws_url: str, call_id: str,
                               workspace_id: str | None = None) -> str | None:
    """Dispatch the call through the workspace's telephony provider, using the
    workspace's own purchased number as the caller ID (shared by all agents)."""
    provider = "twilio"
    cfg = None
    if workspace_id:
        from sqlalchemy import select as _sel
        from backend.db.models import TelephonyConfig
        async with AsyncSessionLocal() as cfg_db:
            result = await cfg_db.execute(
                _sel(TelephonyConfig).where(TelephonyConfig.workspace_id == workspace_id)
            )
            cfg = result.scalar_one_or_none()
        if cfg:
            provider = cfg.provider

    # Caller ID = the workspace's own bought number for this provider (else env default).
    caller_id = await _workspace_caller_id(workspace_id, provider)

    if provider == "plivo":
        from backend.telephony.plivo_handler import PlivoHandler
        return await PlivoHandler().make_call(to=phone_number, websocket_url=ws_url,
                                              call_id=call_id, caller_id=caller_id)

    handler = TwilioHandler()
    return await handler.make_call(to=phone_number, websocket_url=ws_url,
                                   call_id=call_id, caller_id=caller_id)


# ── Bulk calling ─────────────────────────────────────────────────────────────

@router.post("/bulk", response_model=BulkCallResponse, status_code=202)
async def bulk_call(
    payload: BulkCallRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await db.get(Agent, payload.agent_id)
    if not agent or not agent.is_active or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")

    if (workspace.credits_balance or 0.0) <= 0:
        raise HTTPException(
            status_code=402,
            detail="Insufficient balance. Please top up your account to make calls.",
        )

    if await _workspace_calling_blocked(db, workspace.id):
        raise HTTPException(
            status_code=403,
            detail="Your phone number rental has expired. Renew your number to resume making calls.",
        )

    from backend.core import compliance
    from backend.db.models import ConsentAttestation

    # Consent attestation is mandatory before launching a campaign.
    if not payload.consent_attested:
        raise HTTPException(
            status_code=400,
            detail="You must confirm you have consent to call these contacts before starting a campaign.",
        )

    # Calling window (quiet hours).
    if not compliance.within_calling_window(workspace):
        raise HTTPException(
            status_code=403,
            detail=f"Outside allowed calling hours ({compliance.calling_window_label(workspace)}).",
        )

    # Abuse guard — block new campaigns when the opt-out rate is too high.
    stats = await compliance.compliance_stats(db, workspace.id, days=30)
    if stats["blocked_from_campaigns"]:
        raise HTTPException(
            status_code=429,
            detail=(f"Campaigns paused: your opt-out rate ({stats['opt_out_rate']}%) exceeds the "
                    f"{compliance.OPT_OUT_BLOCK_PCT}% safety limit. Clean your list and try again."),
        )

    # Scrub the DNC / suppression list before dialing.
    contacts_data = [c.model_dump() for c in payload.contacts]
    phones = {normalize_phone(c.get("phone_number", "")) for c in contacts_data}
    dnc = await compliance.dnc_subset(db, workspace.id, phones)
    kept = [c for c in contacts_data if normalize_phone(c.get("phone_number", "")) not in dnc]
    suppressed = len(contacts_data) - len(kept)

    # Record the consent attestation for the audit trail.
    db.add(ConsentAttestation(
        workspace_id=workspace.id, user_id=getattr(user, "id", None),
        agent_id=payload.agent_id, contact_count=len(kept),
    ))
    await db.commit()

    base_ws = settings.BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
    if kept:
        background_tasks.add_task(
            _dial_bulk_background,
            contacts=kept,
            agent_id=payload.agent_id,
            workspace_id=workspace.id,
            base_ws=base_ws,
            calls_per_second=payload.calls_per_second,
        )

    return BulkCallResponse(
        queued=len(kept),
        agent_id=payload.agent_id,
        agent_name=agent.name,
        suppressed=suppressed,
    )


async def _dial_bulk_background(
    contacts: list[dict],
    agent_id: str,
    workspace_id: str,
    base_ws: str,
    calls_per_second: float,
):
    delay = 1.0 / max(calls_per_second, 0.1)
    tasks = []
    for contact in contacts:
        task = asyncio.create_task(
            _initiate_single_bulk_call(contact, agent_id, workspace_id, base_ws)
        )
        tasks.append(task)
        await asyncio.sleep(delay)

    results = await asyncio.gather(*tasks, return_exceptions=True)
    failed = sum(1 for r in results if isinstance(r, Exception))
    log.info(
        "Bulk campaign completed",
        total=len(contacts),
        failed=failed,
        succeeded=len(contacts) - failed,
    )


async def _initiate_single_bulk_call(contact: dict, agent_id: str, workspace_id: str, base_ws: str):
    phone = normalize_phone(contact.get("phone_number", ""))
    if not phone:
        return

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(Contact).where(
                    Contact.workspace_id == workspace_id,
                    Contact.phone_number == phone,
                )
            )
            existing = result.scalar_one_or_none()
            if not existing:
                existing = Contact(
                    id=str(uuid.uuid4()),
                    workspace_id=workspace_id,
                    phone_number=phone,
                    name=contact.get("name"),
                    email=contact.get("email"),
                    company=contact.get("company"),
                )
                db.add(existing)
                await db.flush()
            else:
                # Contact already exists — enrich it with any details from the
                # uploaded sheet (e.g. a name we didn't have before).
                for field in ("name", "email", "company"):
                    val = contact.get(field)
                    if val and str(val).strip():
                        setattr(existing, field, str(val).strip())

            call = Call(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                agent_id=agent_id,
                contact_id=existing.id,
                phone_number=phone,
                direction="outbound",
                status="initiated",
                pipeline_mode="native",
            )
            db.add(call)
            await db.flush()

            ws_url = f"{base_ws}/ws/call/{agent_id}?call_id={call.id}"
            sid = await _make_provider_call(phone, ws_url, call.id, workspace_id)
            if sid:
                call.telephony_sid = sid

            await db.commit()
            log.info("Bulk call initiated", phone=phone, call_id=call.id)
        except Exception as exc:
            await db.rollback()
            log.error("Bulk call failed", phone=phone, error=str(exc))
            raise


@router.get("", response_model=List[CallOut])
async def list_calls(
    agent_id: Optional[str] = None,
    limit: int = 500,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import or_, and_
    q = (
        select(Call)
        .join(Agent, Call.agent_id == Agent.id, isouter=True)
        .where(
            Call.workspace_id == workspace.id,
            or_(
                Agent.is_personal == False,
                Agent.is_personal == None,
                and_(Agent.is_personal == True, Agent.created_by == user.id),
            ),
        )
        .order_by(desc(Call.created_at))
        .limit(limit)
    )
    if agent_id:
        q = q.where(Call.agent_id == agent_id)
    result = await db.execute(q)
    return result.scalars().all()



@router.get("/{call_id}", response_model=CallOut)
async def get_call(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    call = await db.get(Call, call_id)
    if not call or call.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.agent_id:
        agent = await db.get(Agent, call.agent_id)
        if agent and agent.is_personal and agent.created_by != user.id:
            raise HTTPException(status_code=404, detail="Call not found")
    return call


@router.get("/{call_id}/turns", response_model=List[TurnOut])
async def get_call_turns(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    call = await db.get(Call, call_id)
    if not call or call.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Call not found")
    result = await db.execute(
        select(CallTurn).where(CallTurn.call_id == call_id).order_by(CallTurn.turn_index)
    )
    return result.scalars().all()


@router.get("/{call_id}/recording")
async def get_call_recording(
    call_id: str,
    request: Request,
    token: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Proxy the Twilio recording through our backend.
    Accepts token as a query param so <audio src=...> can play it directly.
    Forwards Range headers so browsers can seek and determine duration correctly.
    """
    from fastapi import Response as FastAPIResponse
    from jose import JWTError, jwt

    # Validate token from query param (audio element can't send headers)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Verify the authenticated user owns the workspace that owns this call
    from backend.db.models import User as UserModel
    user = await db.get(UserModel, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")

    call = await db.get(Call, call_id)
    if not call or call.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="Call not found")
    if not call.recording_url:
        raise HTTPException(status_code=404, detail="No recording available")

    # Forward Range header so Twilio returns a partial response (206) when the browser
    # needs to seek or determine duration without downloading the full file.
    upstream_headers = {}
    range_header = request.headers.get("range")
    if range_header:
        upstream_headers["Range"] = range_header

    async with httpx.AsyncClient() as client:
        twilio_resp = await client.get(
            call.recording_url,
            auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            timeout=60,
            follow_redirects=True,
            headers=upstream_headers,
        )
    if twilio_resp.status_code not in (200, 206):
        raise HTTPException(status_code=502, detail="Recording unavailable from provider")

    resp_headers = {
        "Content-Type": "audio/mpeg",
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
    }
    for key in ("Content-Length", "Content-Range"):
        if key in twilio_resp.headers:
            resp_headers[key] = twilio_resp.headers[key]

    return FastAPIResponse(
        content=twilio_resp.content,
        status_code=twilio_resp.status_code,
        media_type="audio/mpeg",
        headers=resp_headers,
    )


@router.post("/{call_id}/hangup")
async def hangup_call(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    """Terminate an in-progress call."""
    call = await db.get(Call, call_id)
    if not call or call.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Call not found")

    if call.status not in ("initiated", "ringing", "in_progress"):
        raise HTTPException(status_code=400, detail="Call is not active")

    telephony_sid = call.telephony_sid
    workspace_id = call.workspace_id

    # Mark ended in DB immediately so the UI updates right away
    from datetime import datetime as _dt
    call.status = "cancelled"
    call.ended_at = _dt.utcnow()
    await db.commit()

    # Tell the telephony provider to hang up (best-effort, non-blocking)
    if telephony_sid:
        async def _hangup_provider():
            try:
                from sqlalchemy import select as _sel
                from backend.db.models import TelephonyConfig
                async with AsyncSessionLocal() as cfg_db:
                    result = await cfg_db.execute(
                        _sel(TelephonyConfig).where(TelephonyConfig.workspace_id == workspace_id)
                    )
                    cfg = result.scalar_one_or_none()
                if cfg and cfg.provider == "plivo":
                    from backend.telephony.plivo_handler import PlivoHandler
                    await PlivoHandler().end_call(telephony_sid)
                else:
                    handler = TwilioHandler()
                    await handler.end_call(telephony_sid)
            except Exception as exc:
                log.warning("Provider hangup failed", call_id=call_id, error=str(exc))

        asyncio.create_task(_hangup_provider())

    return {"ok": True, "call_id": call_id, "status": "cancelled"}


@router.get("/{call_id}/detail")
async def get_call_detail(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    """Return full call detail: call + contact + agent + turns + call history count."""
    from sqlalchemy import func

    call = await db.get(Call, call_id)
    if not call or call.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Call not found")

    # Turns
    turns_result = await db.execute(
        select(CallTurn).where(CallTurn.call_id == call_id).order_by(CallTurn.turn_index)
    )
    turns = turns_result.scalars().all()

    # Contact + call history count
    contact = await db.get(Contact, call.contact_id) if call.contact_id else None
    history_count = 0
    recent_history: list = []
    if contact:
        cnt = await db.execute(
            select(func.count()).where(
                Call.contact_id == contact.id,
                Call.workspace_id == workspace.id,
            )
        )
        history_count = cnt.scalar() or 0
        hist_result = await db.execute(
            select(Call)
            .where(Call.contact_id == contact.id, Call.workspace_id == workspace.id, Call.id != call_id)
            .order_by(desc(Call.created_at))
            .limit(5)
        )
        recent_history = [
            {
                "id": c.id,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "status": c.status,
                "duration_seconds": c.duration_seconds,
                "direction": c.direction,
            }
            for c in hist_result.scalars().all()
        ]

    # Agent
    agent = await db.get(Agent, call.agent_id)

    def _dt(d):
        return d.isoformat() if d else None

    return {
        "call": {
            "id": call.id,
            "phone_number": call.phone_number,
            "direction": call.direction,
            "status": call.status,
            "duration_seconds": call.duration_seconds,
            "pipeline_mode": call.pipeline_mode,
            "summary": call.summary,
            "sentiment_score": call.sentiment_score,
            "emotion_profile": call.emotion_profile or {},
            "extra_data": call.extra_data or {},
            "has_recording": bool(call.recording_url),
            "cost_usd": call.cost_usd,
            "created_at": _dt(call.created_at),
            "started_at": _dt(call.started_at),
            "ended_at": _dt(call.ended_at),
        },
        "contact": {
            "id": contact.id if contact else None,
            "name": contact.name if contact else None,
            "phone_number": contact.phone_number if contact else call.phone_number,
            "email": contact.email if contact else None,
            "company": contact.company if contact else None,
            "total_calls": history_count,
        },
        "agent": {
            "id": agent.id if agent else None,
            "name": agent.name if agent else None,
            "languages": (agent.config or {}).get("languages", ["English"]) if agent else ["English"],
        },
        "turns": [
            {
                "id": t.id,
                "turn_index": t.turn_index,
                "role": t.role,
                "transcript": t.transcript,
                "sentiment": t.sentiment,
                "latency_ms": t.latency_ms,
                "eval_score": t.eval_score,
                "eval_feedback": t.eval_feedback,
                "from_prediction_cache": t.from_prediction_cache,
                "created_at": _dt(t.created_at),
            }
            for t in turns
        ],
        "call_history": recent_history,
    }
