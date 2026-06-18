"""
Retrieval — semantic search over an agent's attached knowledge bases.
Uses in-app cosine similarity (numpy) over stored chunk embeddings.
"""
import numpy as np
import structlog
from sqlalchemy import select

from backend.db.database import AsyncSessionLocal
from backend.db.models import KnowledgeChunk
from backend.knowledge.embeddings import embed_query

log = structlog.get_logger()

TOP_K = 8           # broader coverage now that KBs span whole sites (multi-page crawl)
MIN_SCORE = 0.25    # ignore weakly-related chunks


async def search_knowledge(kb_ids: list[str], query: str, top_k: int = TOP_K, call_id: str = "") -> str:
    """
    Embed `query`, cosine-search across all chunks in the given knowledge bases,
    and return the most relevant passages joined as plain text for the agent.
    Returns an empty string if nothing relevant is found.
    """
    if not kb_ids or not query.strip():
        return ""

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(KnowledgeChunk).where(KnowledgeChunk.kb_id.in_(kb_ids))
            )
            chunks = result.scalars().all()

        if not chunks:
            return ""

        qvec = np.array(await embed_query(query, call_id=call_id), dtype=np.float32)
        if qvec.size == 0:
            return ""
        qnorm = np.linalg.norm(qvec) or 1.0

        scored: list[tuple[float, str]] = []
        for ch in chunks:
            emb = ch.embedding
            if not emb:
                continue
            v = np.array(emb, dtype=np.float32)
            denom = (np.linalg.norm(v) * qnorm) or 1.0
            score = float(np.dot(v, qvec) / denom)
            scored.append((score, ch.content))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = [c for s, c in scored[:top_k] if s >= MIN_SCORE]

        if not top:
            return ""

        return "\n\n---\n\n".join(top)

    except Exception as exc:
        log.error("KB search failed", error=str(exc))
        return ""
