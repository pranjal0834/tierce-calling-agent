"""
Phone number management API.
  GET    /api/phone-numbers/config        — get workspace telephony config
  PUT    /api/phone-numbers/config        — save workspace telephony config
  GET    /api/phone-numbers               — list workspace numbers
  GET    /api/phone-numbers/available     — search available numbers
  POST   /api/phone-numbers               — provision (buy) a number
  PATCH  /api/phone-numbers/{id}          — update agent routing
  DELETE /api/phone-numbers/{id}          — release number
"""
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_workspace, get_current_user
from backend.billing.credits import USD_TO_INR
from backend.config import settings
from backend.db.database import get_db
from backend.db.models import Agent, PhoneNumber, RegulatoryBundle, TelephonyConfig, User, Workspace
from backend.telephony.phone_number_manager import PhoneNumberManager
from backend.telephony.plivo_handler import PlivoHandler

log = structlog.get_logger()
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TelephonyConfigRequest(BaseModel):
    provider: str               # "twilio" | "plivo"


class NumberOrderRequest(BaseModel):
    phone_number: str
    monthly_cost_usd: float = 1.0


class ProvisionRequest(BaseModel):
    phone_number: str
    agent_id: str | None = None
    friendly_name: str | None = None
    monthly_cost_usd: float = 1.0
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None
    razorpay_signature: str | None = None


class UpdateRoutingRequest(BaseModel):
    agent_id: str | None = None
    auto_renew: bool | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _serialize(pn: PhoneNumber, db: AsyncSession) -> dict:
    agent_name = None
    if pn.agent_id:
        agent = await db.get(Agent, pn.agent_id)
        agent_name = agent.name if agent else None
    monthly_cost_usd = getattr(pn, "monthly_cost_usd", 1.0) or 1.0
    # Flat platform price (₹250) — what the customer is actually billed, regardless
    # of Plivo's per-number USD rate. Billed from the number wallet, not call credits.
    monthly_cost_inr = round(float(settings.NUMBER_PRICE_INR), 0)
    # Renewal lifecycle: due date = (last_billed_at or purchased_at) + cycle days.
    cycle = int(settings.NUMBER_RENEWAL_CYCLE_DAYS)
    anchor = pn.last_billed_at or pn.purchased_at
    next_renewal = (anchor + timedelta(days=cycle)) if anchor else None
    days_until = None
    if next_renewal:
        days_until = (next_renewal - datetime.utcnow()).days
    return {
        "id": pn.id,
        "phone_number": pn.phone_number,
        "friendly_name": pn.friendly_name,
        "twilio_sid": pn.twilio_sid,
        "provider": getattr(pn, "provider", "twilio"),
        "monthly_cost_usd": monthly_cost_usd,
        "monthly_cost_inr": monthly_cost_inr,
        "capabilities": pn.capabilities or {},
        "agent_id": pn.agent_id,
        "agent_name": agent_name,
        "is_active": pn.is_active,
        "is_suspended": getattr(pn, "is_suspended", False),
        "auto_renew": getattr(pn, "auto_renew", True),
        "purchased_at": pn.purchased_at.isoformat() if pn.purchased_at else None,
        "next_renewal_at": next_renewal.isoformat() if next_renewal else None,
        "days_until_renewal": days_until,
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _get_telephony_config(workspace_id: str, db: AsyncSession) -> TelephonyConfig | None:
    from sqlalchemy import select as _sel
    result = await db.execute(
        _sel(TelephonyConfig).where(TelephonyConfig.workspace_id == workspace_id)
    )
    return result.scalar_one_or_none()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/config")
async def get_telephony_config(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    cfg = await _get_telephony_config(workspace.id, db)
    return {"provider": cfg.provider if cfg else "twilio"}


@router.put("/config")
async def save_telephony_config(
    body: TelephonyConfigRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    cfg = await _get_telephony_config(workspace.id, db)
    if not cfg:
        cfg = TelephonyConfig(workspace_id=workspace.id)
        db.add(cfg)
    cfg.provider = body.provider
    cfg.config = {}
    await db.commit()
    log.info("Telephony config saved", workspace_id=workspace.id, provider=body.provider)
    return {"ok": True, "provider": cfg.provider}


@router.get("/available")
async def search_available(
    area_code: str = Query(default="", description="Area code e.g. 415"),
    country: str = Query(default="US", description="ISO country code e.g. US, GB, IN"),
    limit: int = Query(default=20, description="Page size (Plivo caps at 20)"),
    offset: int = Query(default=0, description="Pagination offset for 'load more'"),
    contains: str = Query(default="", description="Vanity digit sequence to find in the number e.g. 555"),
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    cfg = await _get_telephony_config(workspace.id, db)
    provider = cfg.provider if cfg else "twilio"
    try:
        price_inr = round(float(settings.NUMBER_PRICE_INR), 0)
        if provider == "plivo":
            handler = PlivoHandler()
            page = handler.search_available(area_code=area_code, country=country,
                                            limit=limit, offset=offset, contains=contains)
            return {"provider": provider, "number_price_inr": price_inr, **page}
        else:
            manager = PhoneNumberManager()
            numbers = manager.search_available(area_code=area_code, country=country)
            return {"provider": provider, "number_price_inr": price_inr,
                    "numbers": numbers, "total": len(numbers),
                    "offset": 0, "has_more": False}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Provider search failed: {exc}")


@router.get("/cities")
async def list_available_cities(
    country: str = Query(default="IN", description="ISO country code"),
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    """Auto-detected list of cities that currently have provider inventory.

    Only meaningful for Plivo (which has city-level DID pools). Returns
    [{code, city, count}] so the dashboard can show live, accurate STD-code hints.
    """
    cfg = await _get_telephony_config(workspace.id, db)
    provider = cfg.provider if cfg else "twilio"
    if provider != "plivo":
        return {"country": country, "cities": []}
    try:
        cities = await PlivoHandler().available_cities(country=country)
        return {"country": country, "cities": cities}
    except Exception as exc:
        log.warning("City detection failed", country=country, error=str(exc))
        return {"country": country, "cities": []}


@router.get("")
async def list_numbers(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PhoneNumber)
        .where(PhoneNumber.workspace_id == workspace.id, PhoneNumber.is_active == True)
        .order_by(PhoneNumber.purchased_at.desc())
    )
    numbers = result.scalars().all()
    return [await _serialize(n, db) for n in numbers]


# Countries where Plivo requires a regulatory bundle before buying a number
_KYC_REQUIRED_COUNTRIES = {"IN", "DE", "GB", "AU"}

# Map E.164 prefix → ISO country code
def _country_from_number(phone: str) -> str:
    phone = phone.lstrip("+")
    if phone.startswith("91"):   return "IN"
    if phone.startswith("49"):   return "DE"
    if phone.startswith("44"):   return "GB"
    if phone.startswith("61"):   return "AU"
    return "US"


@router.post("/order")
async def create_number_order(
    body: NumberOrderRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    """Create a Razorpay order for the first month's number rental."""
    if workspace.plan == "free":
        raise HTTPException(status_code=403, detail="upgrade_required")

    # Use Razorpay whenever it's configured — including TEST keys (rzp_test_…) — so the
    # real payment flow can be exercised even while Plivo provisioning stays mocked
    # (MOCK_PHONE_NUMBERS only governs the actual Plivo buy, not the payment). Only when
    # Razorpay isn't configured at all do we return a fake order to skip checkout.
    if not settings.RAZORPAY_KEY_ID:
        if settings.MOCK_PHONE_NUMBERS:
            return {"order_id": "MOCK_ORDER", "amount": 0, "currency": "INR",
                    "key": "MOCK", "amount_inr": 0, "mock": True}
        raise HTTPException(status_code=501, detail="Razorpay not configured")

    # Flat platform price (₹250) — paid via Razorpay, separate from call credits.
    amount_inr = round(float(settings.NUMBER_PRICE_INR), 2)
    try:
        import razorpay  # type: ignore
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        order = client.order.create({
            "amount": int(amount_inr * 100),
            "currency": "INR",
            "notes": {
                "workspace_id": workspace.id,
                "phone_number": body.phone_number,
                "purpose": "number_purchase",
            },
        })
        return {"order_id": order["id"], "amount": order["amount"], "currency": "INR",
                "key": settings.RAZORPAY_KEY_ID, "amount_inr": amount_inr}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not create order: {exc}")


@router.post("")
async def provision_number(
    body: ProvisionRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    # Free plan cannot buy numbers
    if workspace.plan == "free":
        raise HTTPException(status_code=403, detail="upgrade_required")

    # Verify the Razorpay signature whenever a payment was made (works for test keys
    # too). Independent of MOCK_PHONE_NUMBERS so the payment is validated even when the
    # Plivo buy is mocked.
    if body.razorpay_order_id and body.razorpay_payment_id and body.razorpay_signature:
        if settings.RAZORPAY_KEY_SECRET:
            import hmac as _hmac, hashlib as _hashlib
            generated = _hmac.new(
                settings.RAZORPAY_KEY_SECRET.encode(),
                f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
                _hashlib.sha256,
            ).hexdigest()
            if generated != body.razorpay_signature:
                raise HTTPException(status_code=400, detail="Invalid payment signature")

    # Validate agent ownership
    if body.agent_id:
        agent = await db.get(Agent, body.agent_id)
        if not agent or agent.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail="Agent not found")

    # Prevent duplicates
    dup = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.workspace_id == workspace.id,
            PhoneNumber.phone_number == body.phone_number,
            PhoneNumber.is_active == True,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Number already in your workspace")

    cfg = await _get_telephony_config(workspace.id, db)
    provider = cfg.provider if cfg else "twilio"

    # KYC check — required for regulated countries regardless of provider, but ONLY
    # for real purchases. In mock mode no real DID is bought, so there's no regulatory
    # requirement (lets the payment flow be tested without a KYC bundle).
    bundle_sid: str | None = None
    number_country = _country_from_number(body.phone_number)
    if number_country in _KYC_REQUIRED_COUNTRIES and not settings.MOCK_PHONE_NUMBERS:
        result = await db.execute(
            select(RegulatoryBundle).where(
                RegulatoryBundle.workspace_id == workspace.id,
                RegulatoryBundle.country == number_country,
            )
        )
        kyc = result.scalar_one_or_none()
        if not kyc or kyc.status != "approved":
            raise HTTPException(
                status_code=451,
                detail=f"KYC required for {number_country} numbers. Please complete KYC before purchasing.",
            )
        if provider == "plivo":
            bundle_sid = kyc.plivo_bundle_sid

    try:
        if provider == "plivo":
            handler = PlivoHandler()
            provisioned = handler.provision(body.phone_number, bundle_sid=bundle_sid)
            provider_sid = provisioned["provider_sid"]
        else:
            manager = PhoneNumberManager()
            provisioned = manager.provision(body.phone_number)
            provider_sid = provisioned["twilio_sid"]
    except Exception as exc:
        log.error("Provision failed", phone_number=body.phone_number, error=str(exc))
        raise HTTPException(status_code=400, detail=f"Provider error: {exc}")

    # Store the USD-equivalent of the flat ₹250 platform price so internal
    # USD accounting stays coherent; the customer is always billed ₹250.
    monthly_cost = round(float(settings.NUMBER_PRICE_INR) / USD_TO_INR, 4)
    pn = PhoneNumber(
        workspace_id=workspace.id,
        phone_number=provisioned["phone_number"],
        twilio_sid=provider_sid,
        friendly_name=body.friendly_name or provisioned["friendly_name"],
        capabilities=provisioned["capabilities"],
        provider=provider,
        monthly_cost_usd=monthly_cost,
        last_billed_at=datetime.utcnow(),
        agent_id=body.agent_id,
        is_active=True,
        purchased_at=datetime.utcnow(),
    )
    db.add(pn)
    await db.commit()
    await db.refresh(pn)
    log.info("Phone number provisioned", phone_number=pn.phone_number,
             workspace_id=workspace.id, provider=provider, monthly_cost_usd=monthly_cost)

    # Purchase confirmation email (best-effort, non-blocking).
    import asyncio as _asyncio
    _asyncio.create_task(_email_number_purchased(_user.email, pn.phone_number, pn.purchased_at))

    return await _serialize(pn, db)


async def _email_number_purchased(to_email: str, phone: str, purchased_at: datetime):
    """Send the 'number purchased' confirmation. Swallows errors (SMTP optional)."""
    try:
        from backend.notifications.email import send_email
        from backend.notifications import templates
        cycle = int(settings.NUMBER_RENEWAL_CYCLE_DAYS)
        renewal = (purchased_at + timedelta(days=cycle)).strftime("%d %b %Y")
        subject, html = templates.number_purchased(
            phone, float(settings.NUMBER_PRICE_INR), renewal, settings.FRONTEND_URL)
        await send_email(to_email, subject, html)
    except Exception as exc:
        log.warning("Number purchase email failed", to=to_email, error=str(exc))


@router.patch("/{number_id}")
async def update_routing(
    number_id: str,
    body: UpdateRoutingRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    pn = await db.get(PhoneNumber, number_id)
    if not pn or pn.workspace_id != workspace.id or not pn.is_active:
        raise HTTPException(status_code=404, detail="Phone number not found")

    if body.agent_id:
        agent = await db.get(Agent, body.agent_id)
        if not agent or agent.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail="Agent not found")

    pn.agent_id = body.agent_id  # None = unassigned
    if body.auto_renew is not None:
        pn.auto_renew = body.auto_renew
    await db.commit()
    return await _serialize(pn, db)


@router.delete("/{number_id}")
async def release_number(
    number_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    pn = await db.get(PhoneNumber, number_id)
    if not pn or pn.workspace_id != workspace.id or not pn.is_active:
        raise HTTPException(status_code=404, detail="Phone number not found")

    pn_provider = getattr(pn, "provider", "twilio")
    try:
        if pn_provider == "plivo":
            PlivoHandler().release(pn.twilio_sid)
        else:
            PhoneNumberManager().release(pn.twilio_sid)
    except Exception as exc:
        log.warning("Provider release failed — marking inactive anyway",
                    sid=pn.twilio_sid, provider=pn_provider, error=str(exc))

    pn.is_active = False
    await db.commit()
    return {"message": "Number released"}


# ── Renewal ───────────────────────────────────────────────────────────────────

class RenewRequest(BaseModel):
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None
    razorpay_signature: str | None = None


@router.post("/{number_id}/renew/order")
async def create_renewal_order(
    number_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    """Create a Razorpay order to renew an existing number for another cycle (₹250)."""
    pn = await db.get(PhoneNumber, number_id)
    if not pn or pn.workspace_id != workspace.id or not pn.is_active:
        raise HTTPException(status_code=404, detail="Phone number not found")

    if not settings.RAZORPAY_KEY_ID:
        if settings.MOCK_PHONE_NUMBERS:
            return {"order_id": "MOCK_ORDER", "amount": 0, "currency": "INR",
                    "key": "MOCK", "amount_inr": 0, "mock": True}
        raise HTTPException(status_code=501, detail="Razorpay not configured")

    amount_inr = round(float(settings.NUMBER_PRICE_INR), 2)
    try:
        import razorpay  # type: ignore
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        order = client.order.create({
            "amount": int(amount_inr * 100),
            "currency": "INR",
            "notes": {"workspace_id": workspace.id, "phone_number": pn.phone_number,
                      "purpose": "number_renewal"},
        })
        return {"order_id": order["id"], "amount": order["amount"], "currency": "INR",
                "key": settings.RAZORPAY_KEY_ID, "amount_inr": amount_inr}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not create order: {exc}")


@router.post("/{number_id}/renew")
async def renew_number(
    number_id: str,
    body: RenewRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    """Renew a number for another cycle: verify payment, extend, and lift any suspension."""
    pn = await db.get(PhoneNumber, number_id)
    if not pn or pn.workspace_id != workspace.id or not pn.is_active:
        raise HTTPException(status_code=404, detail="Phone number not found")

    # Verify the Razorpay signature when a payment was made (test keys included).
    if body.razorpay_order_id and body.razorpay_payment_id and body.razorpay_signature:
        if settings.RAZORPAY_KEY_SECRET:
            import hmac as _hmac, hashlib as _hashlib
            generated = _hmac.new(
                settings.RAZORPAY_KEY_SECRET.encode(),
                f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
                _hashlib.sha256,
            ).hexdigest()
            if generated != body.razorpay_signature:
                raise HTTPException(status_code=400, detail="Invalid payment signature")

    pn.last_billed_at = datetime.utcnow()
    pn.is_suspended = False
    pn.renewal_reminder_sent_at = None
    await db.commit()
    await db.refresh(pn)
    log.info("Number renewed", phone_number=pn.phone_number, workspace_id=workspace.id)

    import asyncio as _asyncio
    cycle = int(settings.NUMBER_RENEWAL_CYCLE_DAYS)
    nxt = (pn.last_billed_at + timedelta(days=cycle)).strftime("%d %b %Y")
    _asyncio.create_task(_email_number_renewed(_user.email, pn.phone_number, nxt))
    return await _serialize(pn, db)


async def _email_number_renewed(to_email: str, phone: str, renewal_date: str):
    try:
        from backend.notifications.email import send_email
        from backend.notifications import templates
        subject, html = templates.number_renewed(phone, renewal_date, settings.FRONTEND_URL)
        await send_email(to_email, subject, html)
    except Exception as exc:
        log.warning("Number renewed email failed", to=to_email, error=str(exc))
