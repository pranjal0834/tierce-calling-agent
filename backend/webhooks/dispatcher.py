"""
Webhook dispatcher — fire-and-forget with HMAC-SHA256 signing and retry.

Retry schedule (attempt_count → delay before next try):
  1st attempt  → immediate
  2nd attempt  → 30 seconds after failure
  3rd attempt  → 5 minutes after failure
  Give up after 3 failed attempts.

Signature header:
  X-Tierce-Signature: sha256=<hex>
  X-Tierce-Timestamp: <unix epoch seconds>
  Signed payload:  "<timestamp>.<json_body>"
"""
import asyncio
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timedelta

import httpx
import structlog
from sqlalchemy import select

from backend.db.database import AsyncSessionLocal
from backend.db.models import WebhookDelivery, WebhookEndpoint

log = structlog.get_logger()

# Retry delays in seconds: attempt 0 fires immediately, then waits before attempt 1/2
_RETRY_DELAYS = [30, 300]   # 30s, 5 min


def _sign(secret: str, timestamp: int, body: str) -> str:
    msg = f"{timestamp}.{body}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


async def dispatch(workspace_id: str, event_type: str, payload: dict) -> None:
    """
    Find all active endpoints subscribed to `event_type` in this workspace
    and schedule delivery for each. Non-blocking — runs in background tasks.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(WebhookEndpoint).where(
                WebhookEndpoint.workspace_id == workspace_id,
                WebhookEndpoint.is_active == True,
            )
        )
        endpoints = result.scalars().all()
        subscribed = [ep for ep in endpoints if event_type in (ep.events or [])]

        delivery_ids = []
        for ep in subscribed:
            delivery = WebhookDelivery(
                id=str(uuid.uuid4()),
                endpoint_id=ep.id,
                workspace_id=workspace_id,
                event_type=event_type,
                payload=payload,
                attempt_count=0,
            )
            db.add(delivery)
            delivery_ids.append((delivery.id, ep.id))
        await db.commit()

    for delivery_id, _ in delivery_ids:
        asyncio.create_task(_deliver(delivery_id, attempt=0))

    if delivery_ids:
        log.info("Webhook dispatch scheduled",
                 workspace_id=workspace_id,
                 event_type=event_type,
                 count=len(delivery_ids))


async def _deliver(delivery_id: str, attempt: int) -> None:
    """Attempt one HTTP delivery; schedule retry on failure."""
    async with AsyncSessionLocal() as db:
        delivery = await db.get(WebhookDelivery, delivery_id)
        if not delivery:
            return
        endpoint = await db.get(WebhookEndpoint, delivery.endpoint_id)
        if not endpoint or not endpoint.is_active:
            return

        body = json.dumps({
            "id": delivery.id,
            "event": delivery.event_type,
            "created_at": delivery.created_at.isoformat(),
            "data": delivery.payload,
        }, default=str)

        ts = int(time.time())
        sig = _sign(endpoint.secret, ts, body)

        headers = {
            "Content-Type": "application/json",
            "X-Tierce-Signature": f"sha256={sig}",
            "X-Tierce-Timestamp": str(ts),
            "User-Agent": "Tierce-Webhooks/1.0",
        }

        delivery.attempt_count = attempt + 1
        status = None
        resp_body = None

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(endpoint.url, content=body, headers=headers)
            status = resp.status_code
            resp_body = resp.text[:500]
            success = 200 <= status < 300
        except Exception as exc:
            success = False
            resp_body = str(exc)[:500]
            log.warning("Webhook delivery error", delivery_id=delivery_id, attempt=attempt, error=resp_body)

        delivery.response_status = status
        delivery.response_body = resp_body

        if success:
            delivery.delivered_at = datetime.utcnow()
            log.info("Webhook delivered", delivery_id=delivery_id, url=endpoint.url, status=status)
        else:
            next_attempt = attempt + 1
            if next_attempt < len(_RETRY_DELAYS) + 1:   # max 3 total attempts
                delay = _RETRY_DELAYS[attempt] if attempt < len(_RETRY_DELAYS) else None
                if delay:
                    delivery.next_retry_at = datetime.utcnow() + timedelta(seconds=delay)
                    log.info("Webhook retry scheduled",
                             delivery_id=delivery_id, delay_s=delay, next_attempt=next_attempt)
            else:
                log.warning("Webhook delivery giving up", delivery_id=delivery_id, url=endpoint.url)

        await db.commit()

    # Schedule retry outside the DB session
    if not success and attempt < len(_RETRY_DELAYS):
        delay = _RETRY_DELAYS[attempt]
        await asyncio.sleep(delay)
        asyncio.create_task(_deliver(delivery_id, attempt + 1))
