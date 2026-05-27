import asyncio
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from backend.auth.dependencies import require_workspace, get_current_user
from backend.db.database import get_db, AsyncSessionLocal
from backend.db.models import Agent, Call, Contact, CallTurn, User, Workspace
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
    if (workspace.credits_balance or 0.0) <= 0:
        raise HTTPException(
            status_code=402,
            detail="Insufficient balance. Please top up your account to make calls.",
        )

    agent = await db.get(Agent, payload.agent_id)
    if not agent or not agent.is_active or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")

    phone = normalize_phone(payload.phone_number)

    # Reject if an active call to this number is already in flight
    active_check = await db.execute(
        select(Call).where(
            Call.workspace_id == workspace.id,
            Call.phone_number == phone,
            Call.status.in_(["initiated", "ringing", "in_progress"]),
        )
    )
    if active_check.scalar_one_or_none():
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


async def _make_provider_call(phone_number: str, ws_url: str, call_id: str,
                               workspace_id: str | None = None) -> str | None:
    """Dispatch the call through Twilio or Exotel based on workspace TelephonyConfig."""
    if workspace_id:
        from sqlalchemy import select as _sel
        from backend.db.models import TelephonyConfig
        async with AsyncSessionLocal() as cfg_db:
            result = await cfg_db.execute(
                _sel(TelephonyConfig).where(TelephonyConfig.workspace_id == workspace_id)
            )
            cfg = result.scalar_one_or_none()
        if cfg and cfg.provider == "plivo":
            from backend.telephony.plivo_handler import PlivoHandler
            return await PlivoHandler().make_call(to=phone_number, websocket_url=ws_url, call_id=call_id)
        if cfg and cfg.provider == "exotel":
            from backend.telephony.exotel_handler import ExotelHandler
            raw = cfg.config or {}
            handler = ExotelHandler(
                api_key=raw.get("api_key", ""),
                api_token=raw.get("api_token", ""),
                account_sid=raw.get("account_sid", ""),
                virtual_number=raw.get("virtual_number", ""),
                subdomain=raw.get("subdomain", "api.exotel.in"),
            )
            return await handler.make_call(to=phone_number, websocket_url=ws_url, call_id=call_id)

    handler = TwilioHandler()
    return await handler.make_call(to=phone_number, websocket_url=ws_url, call_id=call_id)


# ── Bulk calling ─────────────────────────────────────────────────────────────

@router.post("/bulk", response_model=BulkCallResponse, status_code=202)
async def bulk_call(
    payload: BulkCallRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    if (workspace.credits_balance or 0.0) <= 0:
        raise HTTPException(
            status_code=402,
            detail="Insufficient balance. Please top up your account to make calls.",
        )

    agent = await db.get(Agent, payload.agent_id)
    if not agent or not agent.is_active or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")

    base_ws = settings.BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
    contacts_data = [c.model_dump() for c in payload.contacts]

    background_tasks.add_task(
        _dial_bulk_background,
        contacts=contacts_data,
        agent_id=payload.agent_id,
        workspace_id=workspace.id,
        base_ws=base_ws,
        calls_per_second=payload.calls_per_second,
    )

    return BulkCallResponse(
        queued=len(contacts_data),
        agent_id=payload.agent_id,
        agent_name=agent.name,
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
                elif cfg and cfg.provider == "exotel":
                    pass  # Exotel doesn't support mid-call termination via API
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
