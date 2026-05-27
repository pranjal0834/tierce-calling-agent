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


async def create_order(amount_paise: int, receipt: str) -> dict:
    """Create a Razorpay order. amount_paise = INR amount × 100."""
    payload = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
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
