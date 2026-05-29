import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.database import create_tables, get_db, AsyncSessionLocal
from backend.api import agents, calls, analytics, memory, telephony, tools as tools_api
from backend.api import exotel_telephony as exotel_telephony_api
from backend.api import plivo_telephony as plivo_telephony_api
from backend.api import scheduling as scheduling_api
from backend.api import admin as admin_api
from backend.api import webhooks as webhooks_api
from backend.api import phone_numbers as phone_numbers_api
from backend.api import kyc as kyc_api
from backend.auth import router as auth_router
from backend.billing import router as billing_router
from backend.notifications import router as notifications_router
from backend.auth.middleware import WorkspaceScopeMiddleware
from backend.core.assistant_manager import AssistantManager

log = structlog.get_logger()

redis_client: aioredis.Redis | None = None


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
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE"
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
        await asyncio.sleep(3600 * 6)  # check every 6 hours


async def _bill_due_numbers():
    from datetime import datetime as _dt, timedelta as _td
    from sqlalchemy import select as _sel
    from backend.db.models import PhoneNumber as _PN
    from backend.billing.credits import deduct_credits_for_number

    cutoff = _dt.utcnow() - _td(days=30)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            _sel(_PN).where(
                _PN.is_active == True,
                (_PN.last_billed_at == None) | (_PN.last_billed_at <= cutoff),
            )
        )
        due = result.scalars().all()

    for pn in due:
        async with AsyncSessionLocal() as db:
            fresh = await db.get(_PN, pn.id)
            if not fresh or not fresh.is_active:
                continue
            monthly_cost = getattr(fresh, "monthly_cost_usd", 1.0) or 1.0
            auto_renew = getattr(fresh, "auto_renew", True)

            if auto_renew:
                try:
                    from backend.billing.credits import deduct_credits_for_number_renewal
                    new_bal = await deduct_credits_for_number_renewal(
                        db=db,
                        workspace_id=fresh.workspace_id,
                        phone_number=fresh.phone_number,
                        monthly_cost_usd=monthly_cost,
                    )
                    fresh.last_billed_at = _dt.utcnow()
                    await db.commit()
                    log.info("Number auto-renewed successfully",
                             phone_number=fresh.phone_number,
                             workspace_id=fresh.workspace_id,
                             monthly_cost_usd=monthly_cost,
                             new_credits_balance=new_bal)
                except ValueError as exc:
                    # Insufficient balance — log and skip (don't release number)
                    await db.commit()
                    log.warning("Number auto-renewal failed — insufficient balance",
                                phone_number=fresh.phone_number,
                                workspace_id=fresh.workspace_id,
                                reason=str(exc))
            else:
                fresh.last_billed_at = _dt.utcnow()
                await db.commit()
                log.info("Number renewal due — auto-renew disabled, manual renewal required",
                         phone_number=fresh.phone_number,
                         workspace_id=fresh.workspace_id,
                         monthly_cost_usd=monthly_cost)


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
app.include_router(kyc_api.router, prefix="/api/kyc", tags=["KYC"])
app.include_router(notifications_router.router)
app.include_router(exotel_telephony_api.router, prefix="/telephony/exotel", tags=["ExotelTelephony"])
app.include_router(plivo_telephony_api.router, prefix="/telephony/plivo", tags=["PlivoTelephony"])


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
    AssistantManager picks native-audio or classic pipeline based on agent config.
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
