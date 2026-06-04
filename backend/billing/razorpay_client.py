"""
Razorpay integration — create orders and verify payment signatures.
No external razorpay SDK dependency — uses raw HMAC + httpx calls.
"""
import hashlib
import hmac
import uuid

import httpx
import structlog

from backend.config import settings

log = structlog.get_logger()

RAZORPAY_BASE = "https://api.razorpay.com/v1"


def _auth() -> tuple[str, str]:
    return (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)


async def create_order(amount_paise: int, receipt: str, notes: dict | None = None) -> dict:
    """Create a Razorpay order. amount_paise = INR amount × 100.

    `notes` are echoed back on the payment/webhook payload — we stash
    workspace_id + pack_id there so the webhook can credit the right account.
    """
    payload = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
        "notes": notes or {},
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{RAZORPAY_BASE}/orders",
            json=payload,
            auth=_auth(),
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Verify Razorpay webhook/payment signature."""
    body = f"{order_id}|{payment_id}"
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """Verify a Razorpay webhook using the X-Razorpay-Signature header."""
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def fetch_payment_status(payment_id: str) -> str:
    """Fetch live payment status from Razorpay. Returns 'captured', 'failed', etc."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{RAZORPAY_BASE}/payments/{payment_id}",
            auth=_auth(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("status", "unknown")
