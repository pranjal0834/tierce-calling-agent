"""
Stripe integration — create checkout sessions and verify webhooks.
Uses raw httpx + form-encoded calls to avoid the heavy stripe SDK.
"""
import hashlib
import hmac
import time

import httpx
import structlog

from backend.config import settings

log = structlog.get_logger()

STRIPE_BASE = "https://api.stripe.com/v1"


def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {settings.STRIPE_SECRET_KEY}"}


async def create_checkout_session(
    pack_id: str,
    price_usd_cents: int,
    minutes: float,
    workspace_id: str,
    success_url: str,
    cancel_url: str,
) -> dict:
    """Create a Stripe Checkout session for a one-time credit pack purchase."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{STRIPE_BASE}/checkout/sessions",
            headers=_auth_headers(),
            data={
                "mode": "payment",
                "line_items[0][price_data][currency]": "usd",
                "line_items[0][price_data][unit_amount]": str(price_usd_cents),
                "line_items[0][price_data][product_data][name]": f"Tierce Credits — {minutes:.0f} minutes",
                "line_items[0][quantity]": "1",
                "metadata[workspace_id]": workspace_id,
                "metadata[pack_id]": pack_id,
                "metadata[minutes]": str(minutes),
                "success_url": success_url,
                "cancel_url": cancel_url,
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()


def verify_webhook(payload: bytes, sig_header: str) -> dict:
    """Verify Stripe webhook signature and return the event dict."""
    secret = settings.STRIPE_WEBHOOK_SECRET
    if not secret:
        raise ValueError("STRIPE_WEBHOOK_SECRET not configured")

    parts = {kv.split("=")[0]: kv.split("=")[1] for kv in sig_header.split(",") if "=" in kv}
    timestamp = parts.get("t", "")
    v1 = parts.get("v1", "")

    signed_payload = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, v1):
        raise ValueError("Stripe webhook signature mismatch")

    tolerance = 300
    if abs(time.time() - int(timestamp)) > tolerance:
        raise ValueError("Stripe webhook timestamp too old")

    import json
    return json.loads(payload)
