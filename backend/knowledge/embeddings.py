"""
OpenAI embeddings for the knowledge base (text-embedding-3-small).
"""
import structlog
from openai import AsyncOpenAI

from backend.config import settings

log = structlog.get_logger()

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536


async def embed_texts(texts: list[str], call_id: str = "") -> tuple[list[list[float]], float]:
    """Embed a batch of texts. Returns (one vector per input, total embedding cost in USD).

    When call_id is provided, the cost is ALSO recorded against that call (per-call KB
    query cost). Document ingestion passes no call_id but uses the returned cost to store
    a per-document ingestion cost.
    """
    if not texts:
        return [], 0.0
    from backend.core import cost_meter
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    # OpenAI allows large batches; chunk to be safe on payload size
    out: list[list[float]] = []
    cost_usd = 0.0
    BATCH = 96
    for i in range(0, len(texts), BATCH):
        batch = [t[:8000] for t in texts[i:i + BATCH]]  # guard against oversized inputs
        resp = await client.embeddings.create(model=EMBED_MODEL, input=batch)
        usage = getattr(resp, "usage", None)
        try:
            cost_usd += cost_meter.embedding_usd(usage)
            if call_id:
                cost_meter.record_embedding(call_id, "kb_embedding", usage)
        except Exception:
            pass
        out.extend([d.embedding for d in resp.data])
    return out, round(cost_usd, 8)


async def embed_query(text: str, call_id: str = "") -> list[float]:
    vecs, _ = await embed_texts([text], call_id=call_id)
    return vecs[0] if vecs else []
