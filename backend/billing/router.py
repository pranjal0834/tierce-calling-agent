"""
Billing API
POST /billing/razorpay/order        — create Razorpay order
POST /billing/razorpay/verify       — verify payment + add credits
POST /billing/razorpay/webhook      — Razorpay webhook (payment.captured)
GET  /billing/balance               — workspace credit balance
GET  /billing/transactions          — credit transaction history
GET  /billing/packs                 — list available packs + pricing
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_workspace, get_current_user
from backend.billing.credits import (
    PACKS_INR, PAYG_RATE_INR, USD_TO_INR,
    add_credits, add_number_credits,
)
from backend.config import settings
from backend.db.database import get_db, AsyncSessionLocal
from backend.db.models import CreditTransaction, User, Workspace


async def _email_credits_purchased(to_email: str, pack: dict, new_balance: float):
    """Send the call-credits purchase receipt. Best-effort (SMTP optional)."""
    try:
        from backend.notifications.email import send_email
        from backend.notifications import templates
        subject, html = templates.credits_purchased(
            pack["label"], pack["minutes"], pack["price_inr"], new_balance, settings.FRONTEND_URL)
        await send_email(to_email, subject, html)
    except Exception as exc:
        log.warning("Credits purchase email failed", to=to_email, error=str(exc))


async def _email_wallet_topup(to_email: str, amount_inr: float, new_balance: float):
    """Send the number-wallet top-up receipt. Best-effort (SMTP optional)."""
    try:
        from backend.notifications.email import send_email
        from backend.notifications import templates
        subject, html = templates.number_wallet_topup(
            amount_inr, new_balance, float(settings.NUMBER_PRICE_INR), settings.FRONTEND_URL)
        await send_email(to_email, subject, html)
    except Exception as exc:
        log.warning("Wallet top-up email failed", to=to_email, error=str(exc))

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


class NumberWalletOrderRequest(BaseModel):
    amount_inr: float


class NumberWalletTopupRequest(BaseModel):
    amount_inr: float
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None
    razorpay_signature: str | None = None


# Allowed top-up amounts (INR) — keeps the amount server-controlled.
_WALLET_TOPUP_AMOUNTS = {250.0, 500.0, 1000.0, 2500.0, 5000.0}


# ── Packs (public) ────────────────────────────────────────────────────────────

@router.get("/packs")
async def get_packs():
    return {
        "inr": {
            "payg": {"rate_per_min": PAYG_RATE_INR, "currency": "INR"},
            "packs": PACKS_INR,
        },
        # Frontend uses this to switch "Buy Now" to a simulated purchase. The simulate
        # path is only used when Razorpay is NOT configured — once test/live keys are set,
        # purchases always go through the Razorpay checkout (test keys = no real money).
        "test_mode": bool(settings.BILLING_TEST_MODE) and not settings.RAZORPAY_KEY_ID,
    }


# ── Test mode (simulated purchase, no real payment) ─────────────────────────────

@router.post("/test/purchase")
async def test_purchase(
    payload: RazorpayOrderRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    """
    Simulate a successful purchase and credit minutes — no Razorpay involved.
    Only available when BILLING_TEST_MODE is enabled AND Razorpay is not configured
    (once Razorpay keys exist, all purchases must go through the real checkout).
    """
    if not settings.BILLING_TEST_MODE or settings.RAZORPAY_KEY_ID:
        raise HTTPException(status_code=403, detail="Test billing mode is disabled — use Razorpay checkout")

    pack = PACKS_INR.get(payload.pack_id)
    if not pack:
        raise HTTPException(status_code=400, detail="Invalid pack_id")

    import uuid as _uuid
    new_balance = await add_credits(
        db=db,
        workspace_id=workspace.id,
        minutes=pack["minutes"],
        tx_type="purchase",
        description=f"[TEST] {pack['label']} pack — {pack['minutes']} min",
        payment_provider="test",
        payment_id=f"test_{_uuid.uuid4().hex}",
        pack_id=payload.pack_id,
        amount_paid=pack["price_inr"],
        currency="INR",
    )
    if workspace.plan == "free":
        workspace.plan = "starter"
    await db.commit()

    log.info("TEST purchase credited", workspace_id=workspace.id,
             pack=payload.pack_id, minutes=pack["minutes"], new_balance=new_balance)
    return {"status": "ok", "minutes_added": pack["minutes"], "balance": new_balance, "test": True}


# ── Balance + transactions ────────────────────────────────────────────────────

@router.get("/balance")
async def get_balance(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    from sqlalchemy import func
    from backend.db.models import PhoneNumber
    num_count = (await db.execute(
        select(func.count()).select_from(PhoneNumber).where(
            PhoneNumber.workspace_id == workspace.id,
            PhoneNumber.is_active == True,
        )
    )).scalar() or 0

    # Call-credit usage: total minutes ever added vs. consumed → % used.
    added = (await db.execute(
        select(func.coalesce(func.sum(CreditTransaction.minutes), 0.0)).where(
            CreditTransaction.workspace_id == workspace.id,
            CreditTransaction.minutes > 0,
        )
    )).scalar() or 0.0
    used = -((await db.execute(
        select(func.coalesce(func.sum(CreditTransaction.minutes), 0.0)).where(
            CreditTransaction.workspace_id == workspace.id,
            CreditTransaction.minutes < 0,
        )
    )).scalar() or 0.0)
    credits_used_pct = round(min(100.0, max(0.0, (used / added * 100.0))) , 0) if added > 0 else 0

    return {
        "credits_balance": workspace.credits_balance,
        "credits_total_minutes": round(float(added), 1),
        "credits_used_minutes": round(float(used), 1),
        "credits_used_pct": int(credits_used_pct),
        "number_balance_inr": getattr(workspace, "number_balance_inr", 0.0) or 0.0,
        "number_price_inr": float(settings.NUMBER_PRICE_INR),
        "phone_number_count": int(num_count),
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
    # Stash identifiers in notes so the webhook can credit the right workspace
    order = await create_order(
        amount_paise, receipt,
        notes={"workspace_id": workspace.id, "pack_id": payload.pack_id},
    )

    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": "INR",
        "key_id": settings.RAZORPAY_KEY_ID,
        "pack": pack,
    }


# ── Number wallet (top up → pays via Razorpay, funds renewals) ─────────────────

@router.post("/number-wallet/order")
async def create_number_wallet_order(
    payload: NumberWalletOrderRequest,
    workspace: Workspace = Depends(require_workspace),
):
    """Create a Razorpay order to top up the number wallet by the chosen amount."""
    amount = round(float(payload.amount_inr), 2)
    if amount not in _WALLET_TOPUP_AMOUNTS:
        raise HTTPException(status_code=400, detail="Invalid top-up amount")

    # No Razorpay configured: mock order (so mock/dev can fund the wallet too).
    if not settings.RAZORPAY_KEY_ID:
        if settings.MOCK_PHONE_NUMBERS:
            return {"order_id": "MOCK_ORDER", "amount": 0, "currency": "INR",
                    "key_id": "MOCK", "amount_inr": amount, "mock": True}
        raise HTTPException(status_code=501, detail="Razorpay not configured")

    from backend.billing.razorpay_client import create_order
    order = await create_order(
        int(amount * 100), f"{workspace.id[:8]}-numwallet",
        notes={"workspace_id": workspace.id, "purpose": "number_wallet_topup", "amount_inr": amount},
    )
    return {"order_id": order["id"], "amount": order["amount"], "currency": "INR",
            "key_id": settings.RAZORPAY_KEY_ID, "amount_inr": amount}


@router.post("/number-wallet/topup")
async def topup_number_wallet(
    payload: NumberWalletTopupRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    """Verify the Razorpay payment and credit the number wallet by amount_inr."""
    amount = round(float(payload.amount_inr), 2)
    if amount not in _WALLET_TOPUP_AMOUNTS:
        raise HTTPException(status_code=400, detail="Invalid top-up amount")

    # Verify signature whenever a real payment was made (test keys included).
    if payload.razorpay_order_id and payload.razorpay_payment_id and payload.razorpay_signature:
        if settings.RAZORPAY_KEY_SECRET:
            from backend.billing.razorpay_client import verify_signature
            if not verify_signature(payload.razorpay_order_id, payload.razorpay_payment_id,
                                    payload.razorpay_signature):
                raise HTTPException(status_code=400, detail="Invalid payment signature")

    new_bal = await add_number_credits(
        db=db, workspace_id=workspace.id, amount_inr=amount,
        payment_provider="razorpay", payment_id=payload.razorpay_payment_id,
    )
    await db.commit()
    log.info("Number wallet topped up", workspace_id=workspace.id, amount_inr=amount, new_balance=new_bal)

    # Top-up receipt email (best-effort, non-blocking).
    import asyncio as _asyncio
    _asyncio.create_task(_email_wallet_topup(user.email, amount, new_bal))

    return {"number_balance_inr": new_bal, "added_inr": amount}


@router.post("/razorpay/verify")
async def verify_razorpay_payment(
    payload: RazorpayVerifyRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    if not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=501, detail="Razorpay not configured")

    from backend.billing.razorpay_client import verify_signature, fetch_payment_status
    ok = verify_signature(
        payload.razorpay_order_id,
        payload.razorpay_payment_id,
        payload.razorpay_signature,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    # Verify the payment is actually captured (not just signed)
    try:
        pmt_status = await fetch_payment_status(payload.razorpay_payment_id)
        if pmt_status != "captured":
            raise HTTPException(
                status_code=402,
                detail=f"Payment not captured (status: {pmt_status}). Please retry.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("Could not verify Razorpay payment status — proceeding",
                    payment_id=payload.razorpay_payment_id, error=str(exc))

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

    # Purchase receipt email (best-effort, non-blocking).
    import asyncio as _asyncio
    _asyncio.create_task(_email_credits_purchased(user.email, pack, new_balance))

    return {"status": "ok", "minutes_added": pack["minutes"], "balance": new_balance}


@router.post("/razorpay/webhook")
async def razorpay_webhook(request: Request):
    """
    Server-side safety net. Razorpay calls this on `payment.captured`.
    Credits the workspace even if the customer's browser closed before the
    frontend /verify call ran. Idempotent — never double-credits.
    """
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=501, detail="Razorpay webhook not configured")

    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    from backend.billing.razorpay_client import verify_webhook_signature
    if not verify_webhook_signature(body, signature):
        log.warning("Razorpay webhook rejected — bad signature")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    import json as _json
    try:
        event = _json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    if event.get("event") != "payment.captured":
        return {"received": True}

    try:
        payment = event["payload"]["payment"]["entity"]
    except (KeyError, TypeError):
        return {"received": True}

    payment_id = payment.get("id")
    notes = payment.get("notes") or {}
    workspace_id = notes.get("workspace_id")
    pack_id = notes.get("pack_id")
    amount_paid = round((payment.get("amount", 0)) / 100, 2)

    if not payment_id or not workspace_id or not pack_id:
        return {"received": True}

    pack = PACKS_INR.get(pack_id)
    if not pack:
        return {"received": True}

    async with AsyncSessionLocal() as db:
        # Idempotency — frontend /verify may have already credited this payment
        existing = await db.execute(
            select(CreditTransaction).where(CreditTransaction.payment_id == payment_id)
        )
        if existing.scalar_one_or_none():
            return {"received": True}

        await add_credits(
            db=db,
            workspace_id=workspace_id,
            minutes=pack["minutes"],
            tx_type="purchase",
            description=f"{pack['label']} pack — {pack['minutes']} min",
            payment_provider="razorpay",
            payment_id=payment_id,
            pack_id=pack_id,
            amount_paid=amount_paid or pack["price_inr"],
            currency="INR",
        )
        ws = await db.get(Workspace, workspace_id)
        if ws and ws.plan == "free":
            ws.plan = "starter"
        await db.commit()

    log.info("Razorpay webhook credited", workspace_id=workspace_id,
             pack=pack_id, payment_id=payment_id)
    return {"received": True}
