"""
KYC / Regulatory compliance — in-app document collection + admin approval.

Plivo does NOT expose India regulatory compliance for programmatic per-number
self-serve, so customers collect their details + documents here; a platform admin
relays them to Plivo (Console) once and pastes back the approved bundle SID.

Customer:
  GET  /api/kyc                       — list this workspace's bundles
  GET  /api/kyc/doc-types/{country}   — required document types for a country
  GET  /api/kyc/{country}             — get this workspace's bundle for a country
  POST /api/kyc                       — create/update KYC details (status → pending)
  POST /api/kyc/{id}/documents        — upload a document (multipart)
  GET  /api/kyc/{id}/documents        — list uploaded documents (metadata)
  GET  /api/kyc/{id}/documents/{d}/download
  DELETE /api/kyc/{id}/documents/{d}
  POST /api/kyc/{id}/finalize         — submit for review (status → submitted)

Admin (superadmin only):
  GET  /api/kyc/admin/list
  GET  /api/kyc/admin/documents/{d}/download
  POST /api/kyc/admin/{id}/approve    — body {plivo_bundle_sid}
  POST /api/kyc/admin/{id}/reject     — body {reason}
"""
import asyncio
import uuid
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_workspace, get_current_user, require_superadmin
from backend.config import settings
from backend.db.database import get_db
from backend.db.models import RegulatoryBundle, KycDocument, Workspace, User
from backend.notifications.email import send_bulk

log = structlog.get_logger()
router = APIRouter()

MAX_DOC_BYTES = 10 * 1024 * 1024  # 10 MB per document

# Required document set per country (Plivo's India requirements).
DOC_TYPES: dict[str, list[dict]] = {
    "IN": [
        {"id": "business_pan",  "label": "Business PAN card", "required": True},
        {"id": "incorporation", "label": "Certificate of Incorporation / Registration", "required": True},
        {"id": "address_proof", "label": "Proof of business address (utility bill / rental agreement)", "required": True},
        {"id": "director_id",   "label": "Authorized signatory ID (PAN / Aadhaar / Passport)", "required": True},
        {"id": "loa",           "label": "Letter of Authorization", "required": False},
        {"id": "use_case",      "label": "Use-case declaration", "required": False},
    ],
}
DEFAULT_DOC_TYPES = [
    {"id": "business_id",   "label": "Business registration / ID", "required": True},
    {"id": "address_proof", "label": "Proof of address", "required": True},
    {"id": "authorized_id", "label": "Authorized signatory ID", "required": True},
]


def _doc_types(country: str) -> list[dict]:
    return DOC_TYPES.get(country.upper(), DEFAULT_DOC_TYPES)


# ── Schemas ───────────────────────────────────────────────────────────────────

class KYCRequest(BaseModel):
    country: str = "IN"
    business_name: str
    business_type: str = "company"
    gstin: str = ""
    cin: str = ""
    address_line: str
    city: str
    state: str
    postal_code: str
    authorized_name: str
    authorized_pan: str = ""


class ApproveRequest(BaseModel):
    plivo_bundle_sid: str


class RejectRequest(BaseModel):
    reason: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(b: RegulatoryBundle) -> dict:
    return {
        "id": b.id, "country": b.country, "plivo_bundle_sid": b.plivo_bundle_sid,
        "status": b.status, "business_name": b.business_name, "business_type": b.business_type,
        "gstin": b.gstin, "cin": b.cin, "address_line": b.address_line, "city": b.city,
        "state": b.state, "postal_code": b.postal_code, "authorized_name": b.authorized_name,
        "authorized_pan": b.authorized_pan, "error_message": b.error_message,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }


def _doc_meta(d: KycDocument) -> dict:
    return {"id": d.id, "doc_type": d.doc_type, "file_name": d.file_name,
            "content_type": d.content_type, "size_bytes": d.size_bytes,
            "created_at": d.created_at.isoformat() if d.created_at else None}


async def _bundle_for_ws(db, bundle_id, workspace) -> RegulatoryBundle:
    b = await db.get(RegulatoryBundle, bundle_id)
    if not b or b.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Bundle not found")
    return b


async def _notify_admins_kyc(info: dict):
    """Email platform admins that a KYC packet is ready for review (best-effort)."""
    admins = [e.strip() for e in (settings.ADMIN_EMAILS or "").split(",") if e.strip()]
    if not admins:
        return
    html = (
        "<h2 style='font-family:sans-serif'>New KYC submission to review</h2>"
        f"<p><b>{info['business_name']}</b> ({info['country']}) has submitted a compliance packet.</p>"
        "<ul style='font-family:sans-serif;font-size:14px'>"
        f"<li><b>Workspace:</b> {info['workspace_name']}</li>"
        f"<li><b>Entity type:</b> {info['business_type']}</li>"
        f"<li><b>Authorized signatory:</b> {info['authorized_name']}</li>"
        f"<li><b>Documents:</b> {info['doc_count']}</li>"
        "</ul>"
        "<p style='font-family:sans-serif;font-size:14px'>Open the <b>KYC Review</b> screen in the admin panel to "
        "download the documents, relay them to Plivo, and approve with the bundle ID.</p>"
    )
    try:
        await send_bulk(admins, f"KYC submitted — {info['business_name']} ({info['country']})", html)
    except Exception as exc:
        log.warning("Admin KYC notification failed", error=str(exc))


# ── Customer endpoints ──────────────────────────────────────────────────────────

@router.get("")
async def list_bundles(db: AsyncSession = Depends(get_db),
                       workspace: Workspace = Depends(require_workspace),
                       _u: User = Depends(get_current_user)):
    rows = (await db.execute(select(RegulatoryBundle).where(
        RegulatoryBundle.workspace_id == workspace.id))).scalars().all()
    return [_serialize(b) for b in rows]


@router.get("/doc-types/{country}")
async def get_doc_types(country: str, _u: User = Depends(get_current_user)):
    return {"country": country.upper(), "doc_types": _doc_types(country)}


@router.get("/{country}")
async def get_bundle_by_country(country: str, db: AsyncSession = Depends(get_db),
                                workspace: Workspace = Depends(require_workspace),
                                _u: User = Depends(get_current_user)):
    b = (await db.execute(select(RegulatoryBundle).where(
        RegulatoryBundle.workspace_id == workspace.id,
        RegulatoryBundle.country == country.upper()))).scalar_one_or_none()
    return _serialize(b) if b else None


@router.post("")
async def submit_kyc(body: KYCRequest, db: AsyncSession = Depends(get_db),
                     workspace: Workspace = Depends(require_workspace),
                     _u: User = Depends(get_current_user)):
    country = body.country.upper()
    b = (await db.execute(select(RegulatoryBundle).where(
        RegulatoryBundle.workspace_id == workspace.id,
        RegulatoryBundle.country == country))).scalar_one_or_none()
    if b and b.status == "approved":
        raise HTTPException(status_code=400, detail="KYC already approved for this country")
    if not b:
        b = RegulatoryBundle(id=str(uuid.uuid4()), workspace_id=workspace.id, country=country)
        db.add(b)
    b.business_name = body.business_name
    b.business_type = body.business_type
    b.gstin = body.gstin or None
    b.cin = body.cin or None
    b.address_line = body.address_line
    b.city = body.city
    b.state = body.state
    b.postal_code = body.postal_code
    b.authorized_name = body.authorized_name
    b.authorized_pan = body.authorized_pan or None
    b.status = "pending"       # collecting documents — not yet submitted for review
    b.error_message = None
    b.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(b)
    return _serialize(b)


@router.post("/{bundle_id}/documents", status_code=201)
async def upload_document(bundle_id: str, doc_type: str = Form(...), file: UploadFile = File(...),
                          db: AsyncSession = Depends(get_db),
                          workspace: Workspace = Depends(require_workspace),
                          _u: User = Depends(get_current_user)):
    b = await _bundle_for_ws(db, bundle_id, workspace)
    valid = {t["id"] for t in _doc_types(b.country)}
    if doc_type not in valid:
        raise HTTPException(status_code=400, detail="Unknown document type")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")
    # Replace any existing document of this type (one current file per type).
    existing = (await db.execute(select(KycDocument).where(
        KycDocument.bundle_id == bundle_id, KycDocument.doc_type == doc_type))).scalars().all()
    for e in existing:
        await db.delete(e)
    doc = KycDocument(id=str(uuid.uuid4()), bundle_id=bundle_id, workspace_id=workspace.id,
                      doc_type=doc_type, file_name=file.filename or "document",
                      content_type=file.content_type or "application/octet-stream",
                      size_bytes=len(data), data=data)
    db.add(doc)
    # Re-uploading after a rejection puts the bundle back into collection.
    if b.status in ("rejected", "submitted"):
        b.status = "pending"
        b.updated_at = datetime.utcnow()
    await db.commit()
    return _doc_meta(doc)


@router.get("/{bundle_id}/documents")
async def list_documents(bundle_id: str, db: AsyncSession = Depends(get_db),
                         workspace: Workspace = Depends(require_workspace),
                         _u: User = Depends(get_current_user)):
    await _bundle_for_ws(db, bundle_id, workspace)
    rows = (await db.execute(select(KycDocument).where(
        KycDocument.bundle_id == bundle_id).order_by(desc(KycDocument.created_at)))).scalars().all()
    return [_doc_meta(d) for d in rows]


@router.get("/{bundle_id}/documents/{doc_id}/download")
async def download_document(bundle_id: str, doc_id: str, db: AsyncSession = Depends(get_db),
                            workspace: Workspace = Depends(require_workspace),
                            _u: User = Depends(get_current_user)):
    await _bundle_for_ws(db, bundle_id, workspace)
    d = await db.get(KycDocument, doc_id)
    if not d or d.bundle_id != bundle_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return Response(content=d.data, media_type=d.content_type,
                    headers={"Content-Disposition": f'attachment; filename="{d.file_name}"'})


@router.delete("/{bundle_id}/documents/{doc_id}", status_code=204)
async def delete_document(bundle_id: str, doc_id: str, db: AsyncSession = Depends(get_db),
                          workspace: Workspace = Depends(require_workspace),
                          _u: User = Depends(get_current_user)):
    await _bundle_for_ws(db, bundle_id, workspace)
    d = await db.get(KycDocument, doc_id)
    if not d or d.bundle_id != bundle_id:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(d)
    await db.commit()


@router.post("/{bundle_id}/finalize")
async def finalize_kyc(bundle_id: str, db: AsyncSession = Depends(get_db),
                       workspace: Workspace = Depends(require_workspace),
                       _u: User = Depends(get_current_user)):
    b = await _bundle_for_ws(db, bundle_id, workspace)
    if not b.business_name:
        raise HTTPException(status_code=400, detail="Complete your business details first")
    present = set((await db.execute(select(KycDocument.doc_type).where(
        KycDocument.bundle_id == bundle_id))).scalars().all())
    required = [t["id"] for t in _doc_types(b.country) if t.get("required")]
    missing = [t for t in required if t not in present]
    if missing:
        labels = {t["id"]: t["label"] for t in _doc_types(b.country)}
        raise HTTPException(status_code=400,
                            detail="Missing documents: " + ", ".join(labels.get(m, m) for m in missing))
    b.status = "submitted"
    b.error_message = None
    b.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(b)
    # Notify platform admins (best-effort, non-blocking).
    asyncio.create_task(_notify_admins_kyc({
        "business_name": b.business_name, "country": b.country,
        "business_type": b.business_type, "authorized_name": b.authorized_name,
        "workspace_name": workspace.name, "doc_count": len(present),
    }))
    return _serialize(b)


# ── Admin endpoints (superadmin) ──────────────────────────────────────────────────

@router.get("/admin/pending-count")
async def admin_pending_count(db: AsyncSession = Depends(get_db), _: User = Depends(require_superadmin)):
    n = (await db.execute(select(func.count()).select_from(RegulatoryBundle).where(
        RegulatoryBundle.status == "submitted"))).scalar() or 0
    return {"count": n}


@router.get("/admin/list")
async def admin_list(db: AsyncSession = Depends(get_db), _: User = Depends(require_superadmin)):
    rows = (await db.execute(select(RegulatoryBundle).order_by(desc(RegulatoryBundle.updated_at)))).scalars().all()
    out = []
    for b in rows:
        ws = await db.get(Workspace, b.workspace_id)
        ndocs = (await db.execute(select(func.count()).select_from(KycDocument).where(
            KycDocument.bundle_id == b.id))).scalar() or 0
        docs = (await db.execute(select(KycDocument).where(KycDocument.bundle_id == b.id))).scalars().all()
        out.append({**_serialize(b), "workspace_name": ws.name if ws else None,
                    "doc_count": ndocs, "documents": [_doc_meta(d) for d in docs]})
    return out


@router.get("/admin/doc/{doc_id}")
async def admin_download(doc_id: str, db: AsyncSession = Depends(get_db),
                         _: User = Depends(require_superadmin)):
    d = await db.get(KycDocument, doc_id)
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return Response(content=d.data, media_type=d.content_type,
                    headers={"Content-Disposition": f'attachment; filename="{d.file_name}"'})


@router.post("/admin/{bundle_id}/approve")
async def admin_approve(bundle_id: str, body: ApproveRequest, db: AsyncSession = Depends(get_db),
                        _: User = Depends(require_superadmin)):
    b = await db.get(RegulatoryBundle, bundle_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bundle not found")
    b.plivo_bundle_sid = body.plivo_bundle_sid.strip()
    b.status = "approved"
    b.error_message = None
    b.updated_at = datetime.utcnow()
    await db.commit()
    log.info("KYC approved by admin", bundle_id=bundle_id, bundle_sid=b.plivo_bundle_sid)
    return _serialize(b)


@router.post("/admin/{bundle_id}/reject")
async def admin_reject(bundle_id: str, body: RejectRequest, db: AsyncSession = Depends(get_db),
                       _: User = Depends(require_superadmin)):
    b = await db.get(RegulatoryBundle, bundle_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bundle not found")
    b.status = "rejected"
    b.error_message = (body.reason or "Rejected").strip()[:500]
    b.updated_at = datetime.utcnow()
    await db.commit()
    return _serialize(b)


@router.delete("/admin/{bundle_id}", status_code=204)
async def admin_delete(bundle_id: str, db: AsyncSession = Depends(get_db),
                       _: User = Depends(require_superadmin)):
    """Permanently delete a KYC bundle and all its uploaded documents (any status)."""
    b = await db.get(RegulatoryBundle, bundle_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bundle not found")
    docs = (await db.execute(select(KycDocument).where(KycDocument.bundle_id == bundle_id))).scalars().all()
    for d in docs:
        await db.delete(d)
    await db.delete(b)
    await db.commit()
    log.info("KYC bundle deleted by admin", bundle_id=bundle_id, status=b.status)
    return Response(status_code=204)
