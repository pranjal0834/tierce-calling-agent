"""
Knowledge Base API.
  GET    /api/knowledge                          — list knowledge bases
  POST   /api/knowledge                          — create a knowledge base
  GET    /api/knowledge/{kb_id}                  — KB detail + documents
  PATCH  /api/knowledge/{kb_id}                  — rename / edit a KB (name, description)
  DELETE /api/knowledge/{kb_id}                  — delete a KB (and its docs/chunks)
  POST   /api/knowledge/{kb_id}/documents/text   — add a pasted-text document
  POST   /api/knowledge/{kb_id}/documents/url    — add a website URL document
  POST   /api/knowledge/{kb_id}/documents/upload — upload a PDF
  PATCH  /api/knowledge/{kb_id}/documents/{doc_id} — edit a document (title; text content re-ingests)
  DELETE /api/knowledge/{kb_id}/documents/{doc_id} — delete a document
"""
import asyncio

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user
from backend.db.database import get_db
from backend.db.models import KnowledgeBase, KnowledgeDocument, KnowledgeChunk, User
from backend.knowledge.ingest import ingest_document

log = structlog.get_logger()
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class KBCreate(BaseModel):
    name: str
    description: str = ""


class KBUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class TextDocCreate(BaseModel):
    title: str
    content: str


class UrlDocCreate(BaseModel):
    url: str
    title: str = ""


class DocUpdate(BaseModel):
    title: str | None = None
    content: str | None = None   # re-ingests; text documents only


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_kb(kb_id: str, workspace_id: str, db: AsyncSession) -> KnowledgeBase:
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb or kb.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


def _doc_out(d: KnowledgeDocument, uploader: str | None = None) -> dict:
    return {
        "id": d.id,
        "source_type": d.source_type,
        "title": d.title,
        "source_ref": d.source_ref,
        "status": d.status,
        "error_message": d.error_message,
        "char_count": d.char_count,
        "chunk_count": d.chunk_count,
        "created_by": d.created_by,
        "uploaded_by": uploader,   # email of the user who added it
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


# ── Knowledge bases ─────────────────────────────────────────────────────────────

@router.get("")
async def list_kbs(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.workspace_id == user.workspace_id)
        .order_by(KnowledgeBase.created_at.desc())
    )
    kbs = result.scalars().all()
    rows = []
    for kb in kbs:
        doc_count = (await db.execute(
            select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.kb_id == kb.id)
        )).scalar() or 0
        ready_count = (await db.execute(
            select(func.count(KnowledgeDocument.id)).where(
                KnowledgeDocument.kb_id == kb.id, KnowledgeDocument.status == "ready"
            )
        )).scalar() or 0
        rows.append({
            "id": kb.id,
            "name": kb.name,
            "description": kb.description,
            "document_count": doc_count,
            "ready_count": ready_count,
            "created_at": kb.created_at.isoformat() if kb.created_at else None,
        })
    return rows


@router.post("", status_code=201)
async def create_kb(payload: KBCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    kb = KnowledgeBase(
        workspace_id=user.workspace_id,
        name=payload.name.strip(),
        description=payload.description.strip() or None,
        created_by=user.id,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return {"id": kb.id, "name": kb.name, "description": kb.description,
            "document_count": 0, "ready_count": 0,
            "created_at": kb.created_at.isoformat() if kb.created_at else None}


@router.patch("/{kb_id}")
async def update_kb(
    kb_id: str, payload: KBUpdate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    kb = await _get_kb(kb_id, user.workspace_id, db)
    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        kb.name = payload.name.strip()
    if payload.description is not None:
        kb.description = payload.description.strip() or None
    await db.commit()
    await db.refresh(kb)
    doc_count = (await db.execute(
        select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.kb_id == kb.id)
    )).scalar() or 0
    ready_count = (await db.execute(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.kb_id == kb.id, KnowledgeDocument.status == "ready"
        )
    )).scalar() or 0
    return {"id": kb.id, "name": kb.name, "description": kb.description,
            "document_count": doc_count, "ready_count": ready_count,
            "created_at": kb.created_at.isoformat() if kb.created_at else None}


@router.get("/{kb_id}")
async def get_kb(kb_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    kb = await _get_kb(kb_id, user.workspace_id, db)
    docs_res = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.kb_id == kb.id)
        .order_by(KnowledgeDocument.created_at.desc())
    )
    docs = docs_res.scalars().all()
    # Resolve uploader emails for the documents.
    uploader_ids = {d.created_by for d in docs if d.created_by}
    emails: dict[str, str] = {}
    if uploader_ids:
        urows = await db.execute(select(User.id, User.email).where(User.id.in_(uploader_ids)))
        emails = {uid: em for uid, em in urows.all()}
    documents = [_doc_out(d, emails.get(d.created_by)) for d in docs]
    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "created_at": kb.created_at.isoformat() if kb.created_at else None,
        "documents": documents,
    }


@router.get("/{kb_id}/documents/{doc_id}/content")
async def get_document_content(
    kb_id: str, doc_id: str,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """Return a document's extracted text (joined chunks) for previewing what was added."""
    await _get_kb(kb_id, user.workspace_id, db)
    doc = await db.get(KnowledgeDocument, doc_id)
    if not doc or doc.kb_id != kb_id:
        raise HTTPException(status_code=404, detail="Document not found")
    chunks_res = await db.execute(
        select(KnowledgeChunk.content).where(KnowledgeChunk.document_id == doc_id)
        .order_by(KnowledgeChunk.idx)
    )
    content = "\n\n".join(c for (c,) in chunks_res.all())
    uploader = None
    if doc.created_by:
        urow = await db.execute(select(User.email).where(User.id == doc.created_by))
        uploader = urow.scalar()
    return {
        "id": doc.id,
        "title": doc.title,
        "source_type": doc.source_type,
        "source_ref": doc.source_ref,
        "status": doc.status,
        "char_count": doc.char_count,
        "chunk_count": doc.chunk_count,
        "uploaded_by": uploader,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "content": content,
    }


@router.delete("/{kb_id}", status_code=204)
async def delete_kb(kb_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    kb = await _get_kb(kb_id, user.workspace_id, db)
    await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.kb_id == kb.id))
    await db.execute(delete(KnowledgeDocument).where(KnowledgeDocument.kb_id == kb.id))
    await db.delete(kb)
    await db.commit()


# ── Documents ───────────────────────────────────────────────────────────────────

@router.post("/{kb_id}/documents/text", status_code=201)
async def add_text_document(
    kb_id: str, payload: TextDocCreate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_kb(kb_id, user.workspace_id, db)
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Content is required")
    doc = KnowledgeDocument(
        kb_id=kb_id, workspace_id=user.workspace_id,
        source_type="text", title=(payload.title.strip() or "Untitled note")[:500],
        status="processing", created_by=user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    asyncio.create_task(ingest_document(doc.id, raw_text=payload.content))
    return _doc_out(doc)


@router.post("/{kb_id}/documents/url", status_code=201)
async def add_url_document(
    kb_id: str, payload: UrlDocCreate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_kb(kb_id, user.workspace_id, db)
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    doc = KnowledgeDocument(
        kb_id=kb_id, workspace_id=user.workspace_id,
        source_type="url", title=(payload.title.strip() or url)[:500], source_ref=url,
        status="processing", created_by=user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    asyncio.create_task(ingest_document(doc.id, url=url))
    return _doc_out(doc)


@router.post("/{kb_id}/documents/upload", status_code=201)
async def upload_pdf_document(
    kb_id: str, file: UploadFile = File(...),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_kb(kb_id, user.workspace_id, db)
    filename = file.filename or "document.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF too large (max 20 MB)")

    doc = KnowledgeDocument(
        kb_id=kb_id, workspace_id=user.workspace_id,
        source_type="pdf", title=filename[:500], source_ref=filename,
        status="processing", created_by=user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    asyncio.create_task(ingest_document(doc.id, pdf_bytes=data))
    return _doc_out(doc)


@router.patch("/{kb_id}/documents/{doc_id}")
async def update_document(
    kb_id: str, doc_id: str, payload: DocUpdate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """
    Rename any document (title). For **text** documents, editing `content`
    re-ingests it (re-chunks + re-embeds, replacing the old chunks). Content of
    PDF/URL documents can't be edited — re-upload or re-add the URL instead.
    """
    await _get_kb(kb_id, user.workspace_id, db)
    doc = await db.get(KnowledgeDocument, doc_id)
    if not doc or doc.kb_id != kb_id:
        raise HTTPException(status_code=404, detail="Document not found")

    if payload.title is not None and payload.title.strip():
        doc.title = payload.title.strip()[:500]

    reingest = False
    if payload.content is not None:
        if doc.source_type != "text":
            raise HTTPException(
                status_code=400,
                detail="Only text documents can have their content edited.",
            )
        if not payload.content.strip():
            raise HTTPException(status_code=400, detail="Content cannot be empty")
        doc.status = "processing"
        doc.error_message = None
        reingest = True

    await db.commit()
    await db.refresh(doc)

    if reingest:
        asyncio.create_task(ingest_document(doc.id, raw_text=payload.content))

    uploader = None
    if doc.created_by:
        urow = await db.execute(select(User.email).where(User.id == doc.created_by))
        uploader = urow.scalar()
    return _doc_out(doc, uploader)


@router.delete("/{kb_id}/documents/{doc_id}", status_code=204)
async def delete_document(
    kb_id: str, doc_id: str,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_kb(kb_id, user.workspace_id, db)
    doc = await db.get(KnowledgeDocument, doc_id)
    if not doc or doc.kb_id != kb_id:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == doc_id))
    await db.delete(doc)
    await db.commit()
