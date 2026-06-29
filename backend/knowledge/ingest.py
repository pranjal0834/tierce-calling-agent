"""
Ingestion pipeline: extract text → chunk → embed → store chunks.
Runs as a background task; updates the document's status as it progresses.
"""
import structlog
from sqlalchemy import delete

from backend.db.database import AsyncSessionLocal
from backend.db.models import KnowledgeChunk, KnowledgeDocument
from backend.knowledge.chunking import chunk_text
from backend.knowledge.embeddings import embed_texts
from backend.knowledge.extract import extract_pdf, crawl_url
from backend.config import settings

log = structlog.get_logger()


async def ingest_document(doc_id: str, *, pdf_bytes: bytes | None = None,
                          url: str | None = None, raw_text: str | None = None):
    """
    Process a knowledge document end-to-end. Designed to be launched via
    asyncio.create_task — opens its own DB session.
    """
    async with AsyncSessionLocal() as db:
        doc = await db.get(KnowledgeDocument, doc_id)
        if not doc:
            return
        try:
            # 1. Extract text
            if pdf_bytes is not None:
                text = extract_pdf(pdf_bytes)
            elif url is not None:
                # Crawl the whole site (same-domain internal links), not just the one page,
                # so the KB can answer about services/contact/about pages too.
                title, text = await crawl_url(url, max_pages=settings.KB_CRAWL_MAX_PAGES)
                if title and (not doc.title or doc.title == url):
                    doc.title = title[:500]
            else:
                text = raw_text or ""

            text = (text or "").strip()
            if not text:
                doc.status = "failed"
                if doc.source_type == "pdf":
                    doc.error_message = (
                        "No selectable text found — this PDF looks scanned or image-based. "
                        "Upload a text PDF, or paste the content using the Text tab."
                    )
                elif doc.source_type == "url":
                    doc.error_message = "Could not extract readable text from that page (it may require login or use heavy JavaScript)."
                else:
                    doc.error_message = "No readable text could be extracted from this source."
                await db.commit()
                return

            # 2. Chunk
            chunks = chunk_text(text)
            if not chunks:
                doc.status = "failed"
                doc.error_message = "Document produced no usable text chunks."
                await db.commit()
                return

            # 3. Embed
            vectors, embed_cost = await embed_texts(chunks)

            # 4. Replace any existing chunks for this doc, then store
            await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == doc.id))
            for i, (content, vec) in enumerate(zip(chunks, vectors)):
                db.add(KnowledgeChunk(
                    document_id=doc.id,
                    kb_id=doc.kb_id,
                    workspace_id=doc.workspace_id,
                    idx=i,
                    content=content,
                    embedding=vec,
                ))

            doc.char_count = len(text)
            doc.chunk_count = len(chunks)
            doc.embedding_cost_usd = round(float(embed_cost or 0), 8)
            doc.status = "ready"
            doc.error_message = None
            await db.commit()
            log.info("KB document ingested", doc_id=doc.id, chunks=len(chunks), chars=len(text))

        except Exception as exc:
            log.error("KB ingestion failed", doc_id=doc_id, error=str(exc))
            try:
                doc.status = "failed"
                doc.error_message = str(exc)[:500]
                await db.commit()
            except Exception:
                pass
