"""
OpenAI embeddings for the knowledge base (text-embedding-3-small).
"""
import structlog
from openai import AsyncOpenAI

from backend.config import settings

log = structlog.get_logger()

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536


async def embed_texts(texts: list[str], call_id: str = "") -> list[list[float]]:
    """Embed a batch of texts. Returns one vector per input.

    When call_id is provided, the embedding cost is recorded against that call
    (used for per-call KB query cost; document ingestion passes no call_id).
    """
    if not texts:
        return []
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    # OpenAI allows large batches; chunk to be safe on payload size
    out: list[list[float]] = []
    BATCH = 96
    for i in range(0, len(texts), BATCH):
        batch = [t[:8000] for t in texts[i:i + BATCH]]  # guard against oversized inputs
        resp = await client.embeddings.create(model=EMBED_MODEL, input=batch)
        if call_id:
            try:
                from backend.core import cost_meter
                cost_meter.record_embedding(call_id, "kb_embedding", getattr(resp, "usage", None))
            except Exception:
                pass
        out.extend([d.embedding for d in resp.data])
    return out


async def embed_query(text: str, call_id: str = "") -> list[float]:
    vecs = await embed_texts([text], call_id=call_id)
    return vecs[0] if vecs else []
