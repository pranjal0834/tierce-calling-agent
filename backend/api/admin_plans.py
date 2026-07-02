"""
Super Admin — Plan Management API.
CRUD for pricing plans, feature flags, and rate limits per plan tier.
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_superadmin
from backend.db.database import get_db
from backend.db.models import Plan, Workspace

log = structlog.get_logger()
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class PlanCreate(BaseModel):
    slug: str
    label: str
    description: str = ""
    price_inr: float = 0.0
    price_usd: float = 0.0
    minutes: float | None = None
    is_active: bool = True
    sort_order: int = 0
    features: dict = {}
    rate_limits: dict = {}


class PlanUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    price_inr: float | None = None
    price_usd: float | None = None
    minutes: float | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    features: dict | None = None
    rate_limits: dict | None = None


class WorkspacePlanChange(BaseModel):
    plan_slug: str


# ── Helpers ───────────────────────────────────────────────────────────────────

DEFAULT_PLANS = [
    {"slug": "free",    "label": "Free",    "description": "Free trial tier — limited features and rate limits.",
     "price_inr": 0, "price_usd": 0, "minutes": 0, "sort_order": 0,
     "features": {"can_buy_phone_numbers": False, "can_inbound_call": False, "bulk_campaign": False, "can_export_data": True, "can_use_whatsapp": False, "can_create_webhooks": False},
     "rate_limits": {"max_bulk_contacts": 3, "max_agents": 3, "max_concurrent_calls": 1, "free_trial_minutes": 20}},
    {"slug": "starter", "label": "Starter",  "description": "105 minutes at ₹999. Unlocks inbound calling and phone numbers.",
     "price_inr": 999, "price_usd": 10.45, "minutes": 105, "sort_order": 1,
     "features": {"can_buy_phone_numbers": True, "can_inbound_call": True, "bulk_campaign": True, "can_export_data": True, "can_use_whatsapp": False, "can_create_webhooks": True},
     "rate_limits": {"max_bulk_contacts": 99999, "max_agents": 10, "max_concurrent_calls": 5, "free_trial_minutes": 0}},
    {"slug": "payg",    "label": "Pay-as-you-go", "description": "Custom minutes at ₹10/min. Flexible and no expiry.",
     "price_inr": 0, "price_usd": 0, "minutes": None, "sort_order": 1,
     "features": {"can_buy_phone_numbers": True, "can_inbound_call": True, "bulk_campaign": True, "can_export_data": True, "can_use_whatsapp": False, "can_create_webhooks": True},
     "rate_limits": {"max_bulk_contacts": 99999, "max_agents": 10, "max_concurrent_calls": 5, "free_trial_minutes": 0, "payg_min_minutes": 10, "payg_max_minutes": 5000}},
    {"slug": "growth",  "label": "Growth",   "description": "278 minutes at ₹2,499. Best for growing teams.",
     "price_inr": 2499, "price_usd": 26.14, "minutes": 278, "sort_order": 2,
     "features": {"can_buy_phone_numbers": True, "can_inbound_call": True, "bulk_campaign": True, "can_export_data": True, "can_use_whatsapp": True, "can_create_webhooks": True},
     "rate_limits": {"max_bulk_contacts": 99999, "max_agents": 25, "max_concurrent_calls": 10, "free_trial_minutes": 0}},
    {"slug": "pro",     "label": "Pro",      "description": "588 minutes at ₹4,999. For professional operations.",
     "price_inr": 4999, "price_usd": 52.29, "minutes": 588, "sort_order": 3,
     "features": {"can_buy_phone_numbers": True, "can_inbound_call": True, "bulk_campaign": True, "can_export_data": True, "can_use_whatsapp": True, "can_create_webhooks": True},
     "rate_limits": {"max_bulk_contacts": 99999, "max_agents": 50, "max_concurrent_calls": 25, "free_trial_minutes": 0}},
    {"slug": "scale",   "label": "Scale",    "description": "1,250 minutes at ₹9,999. For high-volume call centres.",
     "price_inr": 9999, "price_usd": 104.58, "minutes": 1250, "sort_order": 4,
     "features": {"can_buy_phone_numbers": True, "can_inbound_call": True, "bulk_campaign": True, "can_export_data": True, "can_use_whatsapp": True, "can_create_webhooks": True},
     "rate_limits": {"max_bulk_contacts": 99999, "max_agents": 999, "max_concurrent_calls": 50, "free_trial_minutes": 0}},
]


async def seed_plans(db: AsyncSession):
    """Seed default plans if the plans table is empty."""
    result = await db.execute(select(Plan).limit(1))
    if result.scalar_one_or_none():
        return
    for data in DEFAULT_PLANS:
        plan = Plan(**data)
        db.add(plan)
    await db.flush()
    log.info("Seeded default plans", count=len(DEFAULT_PLANS))


# ── CRUD Endpoints ────────────────────────────────────────────────────────────

@router.get("/plans")
async def list_plans(
    db: AsyncSession = Depends(get_db),
    _: Workspace = Depends(require_superadmin),
):
    await seed_plans(db)
    result = await db.execute(select(Plan).order_by(Plan.sort_order, Plan.label))
    plans = result.scalars().all()
    return {
        "items": [
            {
                "id": p.id,
                "slug": p.slug,
                "label": p.label,
                "description": p.description or "",
                "price_inr": p.price_inr,
                "price_usd": p.price_usd,
                "minutes": p.minutes,
                "is_active": p.is_active,
                "sort_order": p.sort_order,
                "features": p.features or {},
                "rate_limits": p.rate_limits or {},
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in plans
        ]
    }


@router.post("/plans")
async def create_plan(
    payload: PlanCreate,
    db: AsyncSession = Depends(get_db),
    _: Workspace = Depends(require_superadmin),
):
    existing = (await db.execute(select(Plan).where(Plan.slug == payload.slug))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Plan with slug '{payload.slug}' already exists")
    plan = Plan(**payload.model_dump())
    db.add(plan)
    await db.flush()
    await db.commit()
    log.info("Admin created plan", slug=payload.slug, label=payload.label)
    return {"id": plan.id, "slug": plan.slug, "label": plan.label}


@router.get("/plans/{plan_id}")
async def get_plan(
    plan_id: str,
    db: AsyncSession = Depends(get_db),
    _: Workspace = Depends(require_superadmin),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return {
        "id": plan.id,
        "slug": plan.slug,
        "label": plan.label,
        "description": plan.description or "",
        "price_inr": plan.price_inr,
        "price_usd": plan.price_usd,
        "minutes": plan.minutes,
        "is_active": plan.is_active,
        "sort_order": plan.sort_order,
        "features": plan.features or {},
        "rate_limits": plan.rate_limits or {},
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
    }


@router.put("/plans/{plan_id}")
async def update_plan(
    plan_id: str,
    payload: PlanUpdate,
    db: AsyncSession = Depends(get_db),
    _: Workspace = Depends(require_superadmin),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(plan, key, value)
    await db.flush()
    await db.commit()
    log.info("Admin updated plan", plan_id=plan_id, slug=plan.slug)
    return {"ok": True, "id": plan.id, "slug": plan.slug}


@router.delete("/plans/{plan_id}")
async def delete_plan(
    plan_id: str,
    db: AsyncSession = Depends(get_db),
    _: Workspace = Depends(require_superadmin),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.slug in ("free", "starter", "payg", "growth", "pro", "scale"):
        raise HTTPException(status_code=400, detail="Cannot delete built-in plans")
    await db.delete(plan)
    await db.commit()
    log.info("Admin deleted plan", plan_id=plan_id, slug=plan.slug)
    return {"ok": True}


@router.put("/workspaces/{ws_id}/plan")
async def change_workspace_plan(
    ws_id: str,
    payload: WorkspacePlanChange,
    db: AsyncSession = Depends(get_db),
    _: Workspace = Depends(require_superadmin),
):
    ws = await db.get(Workspace, ws_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    plan = (await db.execute(select(Plan).where(Plan.slug == payload.plan_slug))).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=400, detail=f"Plan '{payload.plan_slug}' not found")
    ws.plan = payload.plan_slug
    await db.commit()
    log.info("Admin changed workspace plan", ws_id=ws_id, plan=payload.plan_slug)
    return {"ok": True, "workspace_id": ws_id, "plan": ws.plan}
