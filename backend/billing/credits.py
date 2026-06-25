"""
Core credit operations — add/deduct credits on a workspace.
Razorpay handlers call these after payment confirmation.
"""
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.models import CreditTransaction, Workspace

log = structlog.get_logger()

# ── Pack definitions ──────────────────────────────────────────────────────────

PACKS_INR = {
    "starter":  {"minutes": 105,   "price_inr": 999,   "label": "Starter"},
    "growth":   {"minutes": 278,   "price_inr": 2499,  "label": "Growth"},
    "pro":      {"minutes": 588,   "price_inr": 4999,  "label": "Pro"},
    "scale":    {"minutes": 1250,  "price_inr": 9999,  "label": "Scale"},
}

PAYG_RATE_INR = 10.0   # ₹ per minute
PAYG_RATE_USD = 0.12   # $ per minute — used for number-rental cost conversion only
# USD→INR rate — configurable via the USD_TO_INR env var (default 95.61).
# Used for number-rental pricing and the admin revenue calculation.
USD_TO_INR = float(settings.USD_TO_INR)


async def add_credits(
    db: AsyncSession,
    workspace_id: str,
    minutes: float,
    tx_type: str,            # purchase | free_trial
    description: str,
    payment_provider: str | None = None,
    payment_id: str | None = None,
    pack_id: str | None = None,
    amount_paid: float | None = None,
    currency: str | None = None,
) -> float:
    """Add credits to workspace. Returns new balance."""
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError(f"Workspace {workspace_id} not found")

    new_balance = round(workspace.credits_balance + minutes, 4)
    workspace.credits_balance = new_balance

    tx = CreditTransaction(
        workspace_id=workspace_id,
        type=tx_type,
        minutes=minutes,
        balance_after=new_balance,
        description=description,
        payment_provider=payment_provider,
        payment_id=payment_id,
        pack_id=pack_id,
        amount_paid=amount_paid,
        currency=currency,
    )
    db.add(tx)
    await db.flush()

    log.info("Credits added",
             workspace_id=workspace_id,
             minutes=minutes,
             new_balance=new_balance,
             provider=payment_provider,
             pack=pack_id)
    return new_balance


async def add_number_credits(
    db: AsyncSession,
    workspace_id: str,
    amount_inr: float,
    payment_provider: str | None = None,
    payment_id: str | None = None,
) -> float:
    """Add INR to the number rental wallet. Returns new number_balance_inr."""
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError(f"Workspace {workspace_id} not found")
    new_bal = round((getattr(workspace, "number_balance_inr", 0.0) or 0.0) + amount_inr, 2)
    workspace.number_balance_inr = new_bal
    tx = CreditTransaction(
        workspace_id=workspace_id,
        type="number_topup",
        minutes=0,
        balance_after=workspace.credits_balance,
        description=f"Number wallet top-up: ₹{amount_inr:.0f}",
        payment_provider=payment_provider,
        payment_id=payment_id,
        amount_paid=amount_inr,
        currency="INR",
    )
    db.add(tx)
    await db.flush()
    log.info("Number wallet topped up", workspace_id=workspace_id,
             amount_inr=amount_inr, new_balance=new_bal)
    return new_bal


async def deduct_credits_for_number(
    db: AsyncSession,
    workspace_id: str,
    phone_number: str,
    monthly_cost_usd: float = 0.0,
) -> float:
    """Deduct one month's number rental from the INR number wallet (NOT call-minute
    credits). Charges the flat platform price settings.NUMBER_PRICE_INR (₹250),
    independent of Plivo's per-number USD rate. Raises ValueError if insufficient."""
    amount_inr = round(float(settings.NUMBER_PRICE_INR), 2)
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError(f"Workspace {workspace_id} not found")
    current = getattr(workspace, "number_balance_inr", 0.0) or 0.0
    if current < amount_inr:
        raise ValueError(
            f"Insufficient number wallet balance. This number costs ₹{amount_inr:.0f}/month. "
            f"Your number wallet: ₹{current:.0f}. Please top up your number wallet."
        )
    new_bal = round(current - amount_inr, 2)
    workspace.number_balance_inr = new_bal
    tx = CreditTransaction(
        workspace_id=workspace_id,
        type="number_rental",
        minutes=0,
        balance_after=workspace.credits_balance,
        description=f"Number rental: {phone_number} — ₹{amount_inr:.0f}/month",
        amount_paid=-amount_inr,
        currency="INR",
    )
    db.add(tx)
    await db.flush()
    log.info("Number rental deducted from INR wallet",
             workspace_id=workspace_id, phone_number=phone_number,
             amount_inr=amount_inr, new_balance=new_bal)
    return new_bal


async def deduct_credits_for_number_renewal(
    db: AsyncSession,
    workspace_id: str,
    phone_number: str,
    monthly_cost_usd: float,
) -> float:
    """
    Deduct one month's number rental from call-minute credits.
    Converts USD cost → equivalent minutes at PAYG rate ($0.12/min).
    Raises ValueError if insufficient balance.
    """
    minutes_cost = round(monthly_cost_usd / PAYG_RATE_USD, 4)
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError(f"Workspace {workspace_id} not found")

    current = workspace.credits_balance or 0.0
    if current < minutes_cost:
        raise ValueError(
            f"Insufficient balance for auto-renewal of {phone_number}. "
            f"Need {minutes_cost:.1f} min (≈${monthly_cost_usd}/mo), have {current:.1f} min."
        )

    new_balance = round(current - minutes_cost, 4)
    workspace.credits_balance = new_balance

    tx = CreditTransaction(
        workspace_id=workspace_id,
        type="number_rental",
        minutes=-minutes_cost,
        balance_after=new_balance,
        description=f"Auto-renewal: {phone_number} — ${monthly_cost_usd:.2f}/mo",
        amount_paid=monthly_cost_usd,
        currency="USD",
    )
    db.add(tx)
    await db.flush()

    log.info("Number auto-renewal deducted",
             workspace_id=workspace_id,
             phone_number=phone_number,
             minutes_deducted=minutes_cost,
             new_balance=new_balance)
    return new_balance


async def deduct_credits(
    db: AsyncSession,
    workspace_id: str,
    duration_seconds: int,
    call_id: str,
) -> float:
    """Deduct call credits. Returns new balance (may go negative)."""
    minutes = round(duration_seconds / 60.0, 4)
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError(f"Workspace {workspace_id} not found")

    new_balance = round(workspace.credits_balance - minutes, 4)
    workspace.credits_balance = new_balance

    tx = CreditTransaction(
        workspace_id=workspace_id,
        type="deduction",
        minutes=-minutes,
        balance_after=new_balance,
        description=f"Call {call_id[:8]}… — {duration_seconds}s",
        call_id=call_id,
    )
    db.add(tx)
    await db.flush()

    log.info("Credits deducted",
             workspace_id=workspace_id,
             minutes=minutes,
             call_id=call_id,
             new_balance=new_balance)
    return new_balance
