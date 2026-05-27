"""
Webhook endpoints API.

GET    /api/webhooks                         list endpoints
POST   /api/webhooks                         create endpoint (secret returned once)
PATCH  /api/webhooks/{id}                    update url/events/is_active
DELETE /api/webhooks/{id}                    delete endpoint
GET    /api/webhooks/{id}/deliveries         delivery log
POST   /api/webhooks/{id}/test               send test ping
"""
import secrets
import uuid
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user, require_workspace
from backend.db.database import get_db
from backend.db.models import User, Workspace, WebhookEndpoint, WebhookDelivery

log = structlog.get_logger()
router = APIRouter()

SUPPORTED_EVENTS = [
    "call.started",
    "call.completed",
    "call.failed",
]


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateEndpointRequest(BaseModel):
    url: str
    events: list[str]

class UpdateEndpointRequest(BaseModel):
    url: str | None = None
    events: list[str] | None = None
    is_active: bool | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ep_row(ep: WebhookEndpoint, include_secret: bool = False) -> dict:
    return {
        "id": ep.id,
        "url": ep.url,
        "events": ep.events,
        "is_active": ep.is_active,
        "created_at": ep.created_at.isoformat() if ep.created_at else None,
        **({"secret": ep.secret} if include_secret else {}),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_endpoints(
    workspace: Workspace = Depends(require_workspace),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WebhookEndpoint)
        .where(WebhookEndpoint.workspace_id == workspace.id)
        .order_by(desc(WebhookEndpoint.created_at))
    )
    return [_ep_row(ep) for ep in result.scalars().all()]


@router.post("", status_code=201)
async def create_endpoint(
    payload: CreateEndpointRequest,
    workspace: Workspace = Depends(require_workspace),
    db: AsyncSession = Depends(get_db),
):
    invalid = [e for e in payload.events if e not in SUPPORTED_EVENTS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown events: {invalid}")
    if not payload.url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    ep = WebhookEndpoint(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        url=payload.url,
        events=payload.events,
        secret=secrets.token_hex(32),
    )
    db.add(ep)
    await db.commit()
    log.info("Webhook endpoint created", workspace_id=workspace.id, url=payload.url)
    # Return secret only on creation
    return _ep_row(ep, include_secret=True)


@router.patch("/{ep_id}")
async def update_endpoint(
    ep_id: str,
    payload: UpdateEndpointRequest,
    workspace: Workspace = Depends(require_workspace),
    db: AsyncSession = Depends(get_db),
):
    ep = await db.get(WebhookEndpoint, ep_id)
    if not ep or ep.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    if payload.url is not None:
        if not payload.url.startswith("http"):
            raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
        ep.url = payload.url
    if payload.events is not None:
        invalid = [e for e in payload.events if e not in SUPPORTED_EVENTS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Unknown events: {invalid}")
        ep.events = payload.events
    if payload.is_active is not None:
        ep.is_active = payload.is_active

    await db.commit()
    return _ep_row(ep)


@router.delete("/{ep_id}", status_code=204)
async def delete_endpoint(
    ep_id: str,
    workspace: Workspace = Depends(require_workspace),
    db: AsyncSession = Depends(get_db),
):
    ep = await db.get(WebhookEndpoint, ep_id)
    if not ep or ep.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    await db.delete(ep)
    await db.commit()


@router.get("/{ep_id}/deliveries")
async def list_deliveries(
    ep_id: str,
    limit: int = 50,
    workspace: Workspace = Depends(require_workspace),
    db: AsyncSession = Depends(get_db),
):
    ep = await db.get(WebhookEndpoint, ep_id)
    if not ep or ep.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    result = await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.endpoint_id == ep_id)
        .order_by(desc(WebhookDelivery.created_at))
        .limit(limit)
    )
    rows = []
    for d in result.scalars().all():
        rows.append({
            "id": d.id,
            "event_type": d.event_type,
            "response_status": d.response_status,
            "response_body": d.response_body,
            "attempt_count": d.attempt_count,
            "delivered_at": d.delivered_at.isoformat() if d.delivered_at else None,
            "next_retry_at": d.next_retry_at.isoformat() if d.next_retry_at else None,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        })
    return rows


@router.post("/{ep_id}/test", status_code=202)
async def test_endpoint(
    ep_id: str,
    workspace: Workspace = Depends(require_workspace),
    db: AsyncSession = Depends(get_db),
):
    ep = await db.get(WebhookEndpoint, ep_id)
    if not ep or ep.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    from backend.webhooks.dispatcher import dispatch
    await dispatch(
        workspace_id=workspace.id,
        event_type="call.completed",
        payload={
            "test": True,
            "call_id": "test-" + str(uuid.uuid4())[:8],
            "phone_number": "+10000000000",
            "duration_seconds": 42,
            "status": "completed",
            "message": "This is a test webhook delivery from Tierce.",
        },
    )
    return {"message": "Test webhook queued"}
