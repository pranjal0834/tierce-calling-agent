"""
KYC / Regulatory Bundle API.
  GET  /api/kyc              — list workspace bundles
  GET  /api/kyc/{country}    — get bundle for a specific country (e.g. IN)
  POST /api/kyc              — submit KYC and create Plivo regulatory bundle
  POST /api/kyc/{id}/refresh — re-check live Plivo bundle status
"""
import uuid
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_workspace, get_current_user
from backend.db.database import get_db
from backend.db.models import RegulatoryBundle, Workspace, User

log = structlog.get_logger()
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class KYCRequest(BaseModel):
    country: str = "IN"
    business_name: str
    business_type: str = "company"    # company | individual
    gstin: str = ""
    cin: str = ""
    address_line: str
    city: str
    state: str
    postal_code: str
    authorized_name: str
    authorized_pan: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(b: RegulatoryBundle) -> dict:
    return {
        "id": b.id,
        "country": b.country,
        "plivo_bundle_sid": b.plivo_bundle_sid,
        "status": b.status,
        "business_name": b.business_name,
        "business_type": b.business_type,
        "gstin": b.gstin,
        "cin": b.cin,
        "address_line": b.address_line,
        "city": b.city,
        "state": b.state,
        "postal_code": b.postal_code,
        "authorized_name": b.authorized_name,
        "authorized_pan": b.authorized_pan,
        "error_message": b.error_message,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_bundles(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RegulatoryBundle).where(RegulatoryBundle.workspace_id == workspace.id)
    )
    return [_serialize(b) for b in result.scalars().all()]


@router.get("/{country}")
async def get_bundle_by_country(
    country: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RegulatoryBundle).where(
            RegulatoryBundle.workspace_id == workspace.id,
            RegulatoryBundle.country == country.upper(),
        )
    )
    bundle = result.scalar_one_or_none()
    return _serialize(bundle) if bundle else None


@router.post("")
async def submit_kyc(
    body: KYCRequest,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    country = body.country.upper()

    # Load or create the bundle record for this workspace+country
    result = await db.execute(
        select(RegulatoryBundle).where(
            RegulatoryBundle.workspace_id == workspace.id,
            RegulatoryBundle.country == country,
        )
    )
    bundle = result.scalar_one_or_none()

    if bundle and bundle.status == "approved":
        raise HTTPException(status_code=400, detail="KYC already approved for this country — no need to resubmit")

    if not bundle:
        bundle = RegulatoryBundle(id=str(uuid.uuid4()), workspace_id=workspace.id, country=country)
        db.add(bundle)

    # Persist the KYC data
    bundle.business_name = body.business_name
    bundle.business_type = body.business_type
    bundle.gstin = body.gstin or None
    bundle.cin = body.cin or None
    bundle.address_line = body.address_line
    bundle.city = body.city
    bundle.state = body.state
    bundle.postal_code = body.postal_code
    bundle.authorized_name = body.authorized_name
    bundle.authorized_pan = body.authorized_pan or None
    bundle.status = "pending"
    bundle.error_message = None
    bundle.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(bundle)

    # Submit to Plivo — pass existing IDs so resubmission skips re-creating objects
    existing_end_user_id = bundle.plivo_end_user_id
    existing_bundle_sid = bundle.plivo_bundle_sid

    try:
        from backend.telephony.plivo_handler import PlivoHandler
        handler = PlivoHandler()
        plivo_result = await handler.create_regulatory_bundle(
            country=country,
            business_name=body.business_name,
            business_type=body.business_type,
            address_line=body.address_line,
            city=body.city,
            state=body.state,
            postal_code=body.postal_code,
            authorized_name=body.authorized_name,
            existing_end_user_id=existing_end_user_id,
            existing_application_id=existing_bundle_sid,
        )
        bundle.plivo_bundle_sid = plivo_result.get("bundle_sid")
        bundle.plivo_end_user_id = plivo_result.get("end_user_id")
        bundle.plivo_address_id = plivo_result.get("address_id")
        bundle.status = plivo_result.get("status", "submitted")
        await db.commit()
        log.info("KYC bundle submitted to Plivo",
                 workspace_id=workspace.id, country=country,
                 bundle_sid=bundle.plivo_bundle_sid)
    except RuntimeError:
        # Plivo creds not configured (Twilio workspace) — auto-approve as internal KYC record
        bundle.status = "approved"
        bundle.error_message = None
        await db.commit()
        log.info("KYC auto-approved (Twilio workspace)", workspace_id=workspace.id, country=country)
    except Exception as exc:
        bundle.status = "failed"
        bundle.error_message = str(exc)[:500]
        await db.commit()
        log.error("KYC bundle creation failed", workspace_id=workspace.id, error=str(exc))
        raise HTTPException(status_code=400, detail=f"Plivo bundle error: {exc}")

    return _serialize(bundle)


@router.post("/{bundle_id}/refresh")
async def refresh_bundle_status(
    bundle_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    _user: User = Depends(get_current_user),
):
    bundle = await db.get(RegulatoryBundle, bundle_id)
    if not bundle or bundle.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Bundle not found")

    if not bundle.plivo_bundle_sid:
        raise HTTPException(status_code=400, detail="No Plivo bundle SID — please resubmit KYC")

    try:
        from backend.telephony.plivo_handler import PlivoHandler
        status = PlivoHandler().get_bundle_status(bundle.plivo_bundle_sid)
        bundle.status = status
        bundle.updated_at = datetime.utcnow()
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return _serialize(bundle)
