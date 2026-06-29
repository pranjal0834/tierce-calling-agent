import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.database import create_tables, get_db, AsyncSessionLocal
from backend.api import agents, calls, analytics, memory, telephony, tools as tools_api
from backend.api import plivo_telephony as plivo_telephony_api
from backend.api import scheduling as scheduling_api
from backend.api import admin as admin_api
from backend.api import webhooks as webhooks_api
from backend.api import phone_numbers as phone_numbers_api
from backend.api import kyc as kyc_api
from backend.api import knowledge as knowledge_api
from backend.api import templates as templates_api
from backend.api import whatsapp as whatsapp_api
from backend.api import compliance as compliance_api
from backend.auth import router as auth_router
from backend.billing import router as billing_router
from backend.notifications import router as notifications_router
from backend.auth.middleware import WorkspaceScopeMiddleware
from backend.core.assistant_manager import AssistantManager

log = structlog.get_logger()

redis_client: aioredis.Redis | None = None


async def _reap_orphaned_calls():
    """
    Mark calls stuck in an active status as ended.

    A backend restart or crash kills every live WebSocket session, so any call
    still in 'initiated'/'ringing'/'in_progress' at startup is orphaned and can
    never finalize itself. Without this, such calls show as "live" forever in the
    dashboard. Answered calls (started_at set) are marked completed; calls that
    never connected are marked failed.
    """
    from backend.db.database import AsyncSessionLocal
    from sqlalchemy import text
    async with AsyncSessionLocal() as db:
        result = await db.execute(text("""
            UPDATE calls
            SET status = CASE WHEN started_at IS NOT NULL THEN 'completed' ELSE 'failed' END,
                ended_at = COALESCE(ended_at, now())
            WHERE status IN ('initiated', 'ringing', 'in_progress')
        """))
        await db.commit()
        if result.rowcount:
            log.info("Reaped orphaned calls on startup", count=result.rowcount)


async def _repair_null_jsonb():
    """Fix any calls that have NULL JSONB fields and add new columns that may be missing."""
    from backend.db.database import AsyncSessionLocal
    from sqlalchemy import text
    async with AsyncSessionLocal() as db:
        await db.execute(text(
            "UPDATE calls SET emotion_profile = '{}' WHERE emotion_profile IS NULL"
        ))
        await db.execute(text(
            "UPDATE calls SET extra_data = '{}' WHERE extra_data IS NULL"
        ))
        try:
            await db.execute(text(
                "ALTER TABLE calls ADD COLUMN IF NOT EXISTS cost_usd FLOAT"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS embedding_cost_usd FLOAT DEFAULT 0.0"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE call_turns ADD COLUMN IF NOT EXISTS from_transfer BOOLEAN DEFAULT FALSE"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS credits_balance FLOAT DEFAULT 0.0"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS number_balance_inr FLOAT DEFAULT 0.0"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at TIMESTAMP"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS number_wallet_low_email_at TIMESTAMP"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS whatsapp_api_key VARCHAR(255)"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT FALSE"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_by VARCHAR(36)"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS created_by VARCHAR(36)"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'twilio'"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS monthly_cost_usd FLOAT DEFAULT 1.0"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS last_billed_at TIMESTAMP"
            ))
        except Exception:
            pass
        try:
            await db.execute(text(
                "ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT TRUE"
            ))
        except Exception:
            pass
        # Compliance — calling-window (quiet-hours) settings on workspaces
        for _col, _ddl in [
            ("calling_window_enabled", "BOOLEAN DEFAULT FALSE"),
            ("calling_start_hour", "INTEGER DEFAULT 9"),
            ("calling_end_hour", "INTEGER DEFAULT 21"),
            ("calling_timezone", "VARCHAR(64) DEFAULT 'Asia/Kolkata'"),
        ]:
            try:
                await db.execute(text(f"ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS {_col} {_ddl}"))
            except Exception:
                pass

        # Regulatory bundles table (KYC)
        try:
            await db.execute(text("""
                CREATE TABLE IF NOT EXISTS regulatory_bundles (
                    id VARCHAR(36) PRIMARY KEY,
                    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
                    country VARCHAR(2) NOT NULL,
                    plivo_bundle_sid VARCHAR(100),
                    plivo_end_user_id VARCHAR(100),
                    plivo_address_id VARCHAR(100),
                    status VARCHAR(20) DEFAULT 'pending',
                    business_name VARCHAR(200) NOT NULL DEFAULT '',
                    business_type VARCHAR(20) DEFAULT 'company',
                    gstin VARCHAR(20),
                    cin VARCHAR(30),
                    address_line VARCHAR(300) NOT NULL DEFAULT '',
                    city VARCHAR(100) NOT NULL DEFAULT '',
                    state VARCHAR(100) NOT NULL DEFAULT '',
                    postal_code VARCHAR(10) NOT NULL DEFAULT '',
                    authorized_name VARCHAR(200) NOT NULL DEFAULT '',
                    authorized_pan VARCHAR(10),
                    error_message VARCHAR(500),
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(workspace_id, country)
                )
            """))
        except Exception:
            pass
        await db.commit()


async def _repair_workspace_ids():
    """
    Add workspace_id column to legacy tables that predate multi-tenancy,
    then assign all NULL rows to the first workspace in the database.
    Safe to run on every start — ADD COLUMN IF NOT EXISTS is idempotent.
    """
    from backend.db.database import AsyncSessionLocal
    from sqlalchemy import text
    async with AsyncSessionLocal() as db:
        # Step 1: add column as nullable to tables that may be missing it
        for table in ("agents", "calls", "contacts", "fine_tuning_runs"):
            try:
                await db.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36)"
                ))
            except Exception as exc:
                log.warning("Could not add workspace_id column", table=table, error=str(exc))
        await db.commit()

        # Step 2: find the first workspace (the user's own workspace)
        result = await db.execute(text(
            "SELECT id FROM workspaces ORDER BY created_at LIMIT 1"
        ))
        row = result.fetchone()
        if not row:
            return  # No workspace yet — nothing to reassign

        workspace_id = row[0]

        # Step 3: assign orphaned rows to that workspace
        for table in ("agents", "calls", "contacts", "fine_tuning_runs"):
            try:
                r = await db.execute(text(
                    f"UPDATE {table} SET workspace_id = :wid WHERE workspace_id IS NULL"
                ), {"wid": workspace_id})
                if r.rowcount:
                    log.info("Assigned legacy rows to workspace",
                             table=table, count=r.rowcount, workspace_id=workspace_id)
            except Exception as exc:
                log.warning("Could not repair workspace_id", table=table, error=str(exc))
        await db.commit()


async def _number_billing_poller():
    """Background task: deducts monthly rental credits for active phone numbers."""
    await asyncio.sleep(30)  # startup delay
    while True:
        try:
            await _bill_due_numbers()
        except Exception as exc:
            log.error("Number billing poller error", error=str(exc))
        try:
            await _check_low_number_wallets()
        except Exception as exc:
            log.error("Low number-wallet check error", error=str(exc))
        await asyncio.sleep(3600 * 6)  # check every 6 hours


async def _ws_owner_email(db, workspace_id: str) -> str | None:
    """The workspace owner's email (falls back to any member)."""
    from sqlalchemy import select as _sel
    from backend.db.models import User as _U
    users = (await db.execute(_sel(_U).where(_U.workspace_id == workspace_id))).scalars().all()
    if not users:
        return None
    owner = next((u for u in users if (u.role or "") == "owner"), None)
    return (owner or users[0]).email


async def _send_number_email(to_email: str | None, rendered):
    """rendered = (subject, html). Best-effort send."""
    if not to_email:
        return
    try:
        from backend.notifications.email import send_email
        await send_email(to_email, rendered[0], rendered[1])
    except Exception as exc:
        log.warning("Number lifecycle email failed", to=to_email, error=str(exc))


async def _bill_due_numbers():
    """Per number: send renewal reminders inside the reminder window, auto-renew from
    the number wallet when due, and suspend (block calls) when the rental lapses
    without renewal. Suspended numbers are restored on a successful renewal."""
    from datetime import datetime as _dt, timedelta as _td
    from math import ceil as _ceil
    from sqlalchemy import select as _sel
    from backend.db.models import PhoneNumber as _PN
    from backend.billing.credits import deduct_credits_for_number
    from backend.notifications import templates

    cycle = int(settings.NUMBER_RENEWAL_CYCLE_DAYS)
    remind_days = int(settings.NUMBER_RENEWAL_REMINDER_DAYS)
    price = float(settings.NUMBER_PRICE_INR)
    furl = settings.FRONTEND_URL or ""
    now = _dt.utcnow()

    async with AsyncSessionLocal() as db:
        active = (await db.execute(_sel(_PN).where(_PN.is_active == True))).scalars().all()
        ids = [p.id for p in active]

    for pid in ids:
        async with AsyncSessionLocal() as db:
            pn = await db.get(_PN, pid)
            if not pn or not pn.is_active:
                continue
            anchor = pn.last_billed_at or pn.purchased_at or now
            due = anchor + _td(days=cycle)
            remind_start = due - _td(days=remind_days)
            auto_renew = getattr(pn, "auto_renew", True)
            email = await _ws_owner_email(db, pn.workspace_id)

            # ── Overdue → renew or suspend ──
            if now >= due:
                renewed = False
                if auto_renew:
                    try:
                        await deduct_credits_for_number(
                            db=db, workspace_id=pn.workspace_id, phone_number=pn.phone_number)
                        renewed = True
                    except ValueError:
                        renewed = False
                if renewed:
                    was_suspended = pn.is_suspended
                    ws_id_renewed = pn.workspace_id
                    pn.last_billed_at = now
                    pn.is_suspended = False
                    pn.renewal_reminder_sent_at = None
                    await db.commit()
                    log.info("Number auto-renewed", phone_number=pn.phone_number,
                             workspace_id=pn.workspace_id)
                    if was_suspended:
                        nxt = (now + _td(days=cycle)).strftime("%d %b %Y")
                        await _send_number_email(email, templates.number_renewed(pn.phone_number, nxt, furl))
                    # Immediate: this deduction may have tipped the wallet under the next
                    # cycle's cost → notify right away rather than waiting for the sweep.
                    await _notify_if_wallet_low(ws_id_renewed)
                else:
                    # Could not renew (auto-renew off, or wallet empty) → block it.
                    if not pn.is_suspended:
                        pn.is_suspended = True
                        await db.commit()
                        log.warning("Number blocked — rental lapsed without renewal",
                                    phone_number=pn.phone_number, workspace_id=pn.workspace_id)
                        await _send_number_email(email, templates.number_blocked(pn.phone_number, price, furl))
                continue

            # ── In reminder window → remind (at most once/day), if not already blocked ──
            if now >= remind_start and not pn.is_suspended:
                last = pn.renewal_reminder_sent_at
                if last is None or (now - last) >= _td(hours=20):
                    days_left = max(1, _ceil((due - now).total_seconds() / 86400))
                    pn.renewal_reminder_sent_at = now
                    await db.commit()
                    log.info("Number renewal reminder sent", phone_number=pn.phone_number,
                             days_left=days_left, workspace_id=pn.workspace_id)
                    await _send_number_email(
                        email,
                        templates.number_renewal_reminder(
                            pn.phone_number, days_left, due.strftime("%d %b %Y"), price, furl))


async def _notify_if_wallet_low(workspace_id: str):
    """For ONE workspace: if its number wallet can't cover the next auto-renewal of all
    its auto-renewing numbers, email the owner (throttled once/3 days). Resets the throttle
    when the wallet recovers. Safe to call inline right after a wallet deduction."""
    from datetime import datetime as _dt, timedelta as _td
    from sqlalchemy import select as _sel, func as _func
    from backend.db.models import PhoneNumber as _PN, Workspace as _WS
    from backend.notifications import templates

    price = float(settings.NUMBER_PRICE_INR)
    furl = settings.FRONTEND_URL or ""
    now = _dt.utcnow()
    throttle = _td(days=3)

    async with AsyncSessionLocal() as db:
        count = (await db.execute(_sel(_func.count()).select_from(_PN).where(
            _PN.workspace_id == workspace_id, _PN.is_active == True,
            _PN.auto_renew == True))).scalar() or 0
        if count <= 0:
            return
        ws = await db.get(_WS, workspace_id)
        if not ws:
            return
        required = price * int(count)
        balance = getattr(ws, "number_balance_inr", 0.0) or 0.0
        if balance < required:
            last = ws.number_wallet_low_email_at
            if last is None or (now - last) >= throttle:
                ws.number_wallet_low_email_at = now
                await db.commit()
                email = await _ws_owner_email(db, workspace_id)
                log.info("Low number-wallet email", workspace_id=workspace_id,
                         balance=balance, required=required, count=int(count))
                await _send_number_email(
                    email, templates.number_wallet_low(balance, required, int(count), price, furl))
        elif ws.number_wallet_low_email_at is not None:
            ws.number_wallet_low_email_at = None
            await db.commit()


async def _check_low_number_wallets():
    """Periodic sweep: run the low-wallet check for every workspace with auto-renew numbers
    (catch-all in case a balance is low without a fresh deduction)."""
    from sqlalchemy import select as _sel
    from backend.db.models import PhoneNumber as _PN

    async with AsyncSessionLocal() as db:
        nums = (await db.execute(_sel(_PN.workspace_id).where(
            _PN.is_active == True, _PN.auto_renew == True))).scalars().all()
    for ws_id in set(nums):
        await _notify_if_wallet_low(ws_id)


async def _schedule_poller():
    """Background task: fires pending ScheduledCalls when their time arrives."""
    await asyncio.sleep(10)  # brief startup delay
    while True:
        try:
            await _execute_due_scheduled_calls()
        except Exception as exc:
            log.error("Schedule poller error", error=str(exc))
        await asyncio.sleep(60)


async def _execute_due_scheduled_calls():
    from datetime import datetime as _dt
    from sqlalchemy import select as _sel
    from backend.db.models import ScheduledCall

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            _sel(ScheduledCall).where(
                ScheduledCall.status == "pending",
                ScheduledCall.scheduled_at <= _dt.utcnow(),
            )
        )
        due = result.scalars().all()
        for sc in due:
            sc.status = "running"
        await db.commit()
        due_ids = [sc.id for sc in due]

    for sc_id in due_ids:
        asyncio.create_task(_fire_scheduled_call(sc_id))


async def _fire_scheduled_call(sc_id: str):
    from datetime import datetime as _dt
    from backend.db.models import ScheduledCall, Agent, Contact, Call
    from backend.api.calls import _dial
    from backend.utils.phone import normalize_phone

    async with AsyncSessionLocal() as db:
        sc = await db.get(ScheduledCall, sc_id)
        if not sc:
            return
        try:
            agent = await db.get(Agent, sc.agent_id)
            if not agent or not agent.is_active:
                raise ValueError(f"Agent {sc.agent_id} not found or inactive")

            phone = normalize_phone(sc.phone_number)

            # Upsert contact
            from sqlalchemy import select as _sel
            result = await db.execute(
                _sel(Contact).where(
                    Contact.workspace_id == sc.workspace_id,
                    Contact.phone_number == phone,
                )
            )
            contact = result.scalar_one_or_none()
            if not contact:
                contact = Contact(
                    id=str(uuid.uuid4()),
                    workspace_id=sc.workspace_id,
                    phone_number=phone,
                    name=sc.contact_name,
                    email=sc.contact_email,
                )
                db.add(contact)
                await db.flush()

            # Create Call record
            call = Call(
                id=str(uuid.uuid4()),
                workspace_id=sc.workspace_id,
                agent_id=sc.agent_id,
                contact_id=contact.id,
                phone_number=phone,
                direction="outbound",
                status="initiated",
                pipeline_mode=agent.pipeline_mode,
            )
            db.add(call)
            await db.flush()

            sc.call_id = call.id
            sc.status = "completed"
            await db.commit()

            base_ws = settings.BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
            ws_url = f"{base_ws}/ws/call/{sc.agent_id}?call_id={call.id}"
            log.info("Firing scheduled call", sc_id=sc_id, phone=phone, call_id=call.id)
            await _dial(phone, ws_url, call.id, sc.workspace_id)

        except Exception as exc:
            log.error("Scheduled call failed", sc_id=sc_id, error=str(exc))
            sc.status = "failed"
            sc.error_message = str(exc)[:500]
            await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    await create_tables()
    await _repair_workspace_ids()
    await _repair_null_jsonb()
    await _reap_orphaned_calls()
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    app.state.redis = redis_client
    asyncio.create_task(_schedule_poller())
    asyncio.create_task(_number_billing_poller())
    log.info("Tierce Voice Agent started", version="1.0.0")
    yield
    await redis_client.aclose()
    log.info("Tierce Voice Agent stopped")


app = FastAPI(
    title="Tierce Voice Agent",
    description="Next-generation AI voice calling platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(WorkspaceScopeMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth Router ───────────────────────────────────────────────────────────────

app.include_router(auth_router.router, prefix="/auth", tags=["Auth"])
from backend.api import google_calendar_oauth as _gcal_oauth
app.include_router(_gcal_oauth.router, prefix="/auth/google/calendar", tags=["GoogleCalendar"])

# ─── REST Routers ──────────────────────────────────────────────────────────────

app.include_router(agents.router,     prefix="/api/agents",    tags=["Agents"])
app.include_router(calls.router,      prefix="/api/calls",     tags=["Calls"])
app.include_router(analytics.router,  prefix="/api/analytics", tags=["Analytics"])
app.include_router(memory.router,     prefix="/api/memory",    tags=["Memory"])
app.include_router(telephony.router,  prefix="/telephony",     tags=["Telephony"])
app.include_router(tools_api.router,  prefix="/api/agents",    tags=["Tools"])
app.include_router(scheduling_api.router, prefix="/api/scheduling", tags=["Scheduling"])
app.include_router(billing_router.router, prefix="/billing", tags=["Billing"])
app.include_router(admin_api.router,    prefix="/api/admin",  tags=["Admin"])
app.include_router(webhooks_api.router, prefix="/api/webhooks", tags=["Webhooks"])
app.include_router(phone_numbers_api.router, prefix="/api/phone-numbers", tags=["PhoneNumbers"])
app.include_router(compliance_api.router, prefix="/api/compliance", tags=["Compliance"])
app.include_router(kyc_api.router, prefix="/api/kyc", tags=["KYC"])
app.include_router(knowledge_api.router, prefix="/api/knowledge", tags=["Knowledge"])
app.include_router(templates_api.router, prefix="/api/templates", tags=["Templates"])
app.include_router(whatsapp_api.router, prefix="/api/whatsapp", tags=["WhatsApp"])
app.include_router(notifications_router.router)
app.include_router(plivo_telephony_api.router, prefix="/telephony/plivo", tags=["PlivoTelephony"])

# Voice-preview samples for the agent Voice picker (one short WAV per Gemini voice).
# Pre-generated via backend/scripts/generate_voice_samples.py; served at /voice-samples/<Voice>.wav
_VOICE_SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "static", "voice-samples")
os.makedirs(_VOICE_SAMPLES_DIR, exist_ok=True)
app.mount("/voice-samples", StaticFiles(directory=_VOICE_SAMPLES_DIR), name="voice-samples")


# ─── WebSocket — Main Call Handler ────────────────────────────────────────────

@app.websocket("/ws/call/{agent_id}")
async def call_websocket(
    websocket: WebSocket,
    agent_id: str,
    call_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Telephony providers (Twilio/Plivo) stream audio here.
    AssistantManager handles the call via the native audio pipeline.
    """
    await websocket.accept()
    if not call_id:
        call_id = str(uuid.uuid4())
    log.info("WebSocket call connected", agent_id=agent_id, call_id=call_id)

    try:
        manager = AssistantManager(
            agent_id=agent_id,
            call_id=call_id,
            websocket=websocket,
            db=db,
            redis=app.state.redis,
        )
        await manager.run()
    except WebSocketDisconnect:
        log.info("WebSocket disconnected", call_id=call_id)
    except Exception as exc:
        log.exception("WebSocket error", call_id=call_id, error=str(exc))
    finally:
        log.info("WebSocket call ended", call_id=call_id)


@app.websocket("/ws/transfer/{call_id}")
async def transfer_websocket(websocket: WebSocket, call_id: str):
    """
    Receives the post-transfer audio stream from Twilio (<Start><Stream>).
    Transcribes both tracks (caller + human agent) and saves turns to DB.
    """
    from backend.features.native_audio.transfer_stream import TransferStreamHandler
    handler = TransferStreamHandler(call_id)
    await handler.handle(websocket)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "tierce-voice-agent"}
