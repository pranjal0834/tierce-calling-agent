"""
Billing API
POST /billing/razorpay/order        — create Razorpay order
POST /billing/razorpay/verify       — verify payment + add credits
POST /billing/stripe/checkout       — create Stripe checkout session
POST /billing/stripe/webhook        — Stripe webhook (checkout.session.completed)
GET  /billing/balance               — workspace credit balance
GET  /billing/transactions          — credit transaction history
GET  /billing/packs                 — list available packs + pricing
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_workspace
from backend.billing.credits import (
    PACKS_INR, PACKS_USD, PAYG_RATE_INR, PAYG_RATE_USD, USD_TO_INR,
    add_credits,
)
from backend.config import settings
from backend.db.database import get_db, AsyncSessionLocal
from backend.db.models import CreditTransaction, Workspace

log = structlog.get_logger()
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RazorpayOrderRequest(BaseModel):
    pack_id: str   # starter | growth | pro | scale


class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    pack_id: str


class StripeCheckoutRequest(BaseModel):
    pack_id: str


# ── Packs (public) ────────────────────────────────────────────────────────────

@router.get("/packs")
async def get_packs():
    return {
        "inr": {
            "payg": {"rate_per_min": PAYG_RATE_INR, "currency": "INR"},
            "packs": PACKS_INR,
        },
        "usd": {
            "payg": {"rate_per_min": PAYG_RATE_USD, "currency": "USD"},
            "packs": PACKS_USD,
        },
    }


# ── Balance + transactions ────────────────────────────────────────────────────

@router.get("/balance")
async def get_balance(
    workspace: Workspace = Depends(require_workspace),
):
    return {
        "credits_balance": workspace.credits_balance,
        "plan": workspace.plan,
        "usd_to_inr": USD_TO_INR,
    }



@router.get("/transactions")
async def list_transactions(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    result = await db.execute(
        select(CreditTransaction)
        .where(CreditTransaction.workspace_id == workspace.id)
        .order_by(desc(CreditTransaction.created_at))
        .limit(limit)
    )
    txs = result.scalars().all()
    return [
        {
            "id": t.id,
            "type": t.type,
            "minutes": t.minutes,
            "balance_after": t.balance_after,
            "description": t.description,
            "payment_provider": t.payment_provider,
            "pack_id": t.pack_id,
            "amount_paid": t.amount_paid,
            "currency": t.currency,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in txs
    ]


# ── Razorpay ──────────────────────────────────────────────────────────────────

@router.post("/razorpay/order")
async def create_razorpay_order(
    payload: RazorpayOrderRequest,
    workspace: Workspace = Depends(require_workspace),
):
    if not settings.RAZORPAY_KEY_ID:
        raise HTTPException(status_code=501, detail="Razorpay not configured")

    pack = PACKS_INR.get(payload.pack_id)
    if not pack:
        raise HTTPException(status_code=400, detail="Invalid pack_id")

    from backend.billing.razorpay_client import create_order
    amount_paise = int(pack["price_inr"] * 100)
    receipt = f"{workspace.id[:8]}-{payload.pack_id}"
    order = await create_order(amount_paise, receipt)

    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": "INR",
        "key_id": settings.RAZORPAY_KEY_ID,
        "pack": pack,
    }


@router.post("/razorpay/verify")
async def verify_razorpay_payment(
    payload: RazorpayVerifyRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    if not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=501, detail="Razorpay not configured")

    from backend.billing.razorpay_client import verify_signature
    ok = verify_signature(
        payload.razorpay_order_id,
        payload.razorpay_payment_id,
        payload.razorpay_signature,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    pack = PACKS_INR.get(payload.pack_id)
    if not pack:
        raise HTTPException(status_code=400, detail="Invalid pack_id")

    # Idempotency: check if this payment_id already credited
    existing = await db.execute(
        select(CreditTransaction).where(
            CreditTransaction.payment_id == payload.razorpay_payment_id
        )
    )
    if existing.scalar_one_or_none():
        return {"status": "already_credited", "balance": workspace.credits_balance}

    new_balance = await add_credits(
        db=db,
        workspace_id=workspace.id,
        minutes=pack["minutes"],
        tx_type="purchase",
        description=f"{pack['label']} pack — {pack['minutes']} min",
        payment_provider="razorpay",
        payment_id=payload.razorpay_payment_id,
        pack_id=payload.pack_id,
        amount_paid=pack["price_inr"],
        currency="INR",
    )

    # Upgrade plan from free on first purchase
    if workspace.plan == "free":
        workspace.plan = "starter"

    await db.commit()

    log.info("Razorpay payment credited",
             workspace_id=workspace.id,
             pack=payload.pack_id,
             minutes=pack["minutes"],
             new_balance=new_balance)

    return {"status": "ok", "minutes_added": pack["minutes"], "balance": new_balance}


# ── Stripe ────────────────────────────────────────────────────────────────────

@router.post("/stripe/checkout")
async def create_stripe_checkout(
    payload: StripeCheckoutRequest,
    workspace: Workspace = Depends(require_workspace),
):
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=501, detail="Stripe not configured")

    pack = PACKS_USD.get(payload.pack_id)
    if not pack:
        raise HTTPException(status_code=400, detail="Invalid pack_id")

    from backend.billing.stripe_client import create_checkout_session
    frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    session = await create_checkout_session(
        pack_id=payload.pack_id,
        price_usd_cents=int(pack["price_usd"] * 100),
        minutes=pack["minutes"],
        workspace_id=workspace.id,
        success_url=f"{frontend_url}/billing?payment=success",
        cancel_url=f"{frontend_url}/billing?payment=cancelled",
    )

    return {"checkout_url": session["url"]}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """Stripe sends this when checkout.session.completed fires."""
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=501, detail="Stripe webhook not configured")

    body = await request.body()
    sig = request.headers.get("stripe-signature", "")

    from backend.billing.stripe_client import verify_webhook
    try:
        event = verify_webhook(body, sig)
    except ValueError as exc:
        log.warning("Stripe webhook rejected", reason=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))

    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        metadata = session.get("metadata", {})
        workspace_id = metadata.get("workspace_id")
        pack_id = metadata.get("pack_id")
        minutes = float(metadata.get("minutes", 0))
        payment_intent = session.get("payment_intent", "")
        amount_total = session.get("amount_total", 0)  # cents

        if not workspace_id or not minutes:
            return {"received": True}

        async with AsyncSessionLocal() as db:
            # Idempotency check
            existing = await db.execute(
                select(CreditTransaction).where(
                    CreditTransaction.payment_id == payment_intent
                )
            )
            if existing.scalar_one_or_none():
                return {"received": True}

            pack = PACKS_USD.get(pack_id or "")
            await add_credits(
                db=db,
                workspace_id=workspace_id,
                minutes=minutes,
                tx_type="purchase",
                description=f"{pack['label'] if pack else pack_id} pack — {minutes:.0f} min",
                payment_provider="stripe",
                payment_id=payment_intent,
                pack_id=pack_id,
                amount_paid=round(amount_total / 100, 2),
                currency="USD",
            )

            # Upgrade plan from free on first purchase
            ws = await db.get(Workspace, workspace_id)
            if ws and ws.plan == "free":
                ws.plan = "starter"

            await db.commit()

        log.info("Stripe payment credited",
                 workspace_id=workspace_id,
                 pack=pack_id,
                 minutes=minutes)

    return {"received": True}
