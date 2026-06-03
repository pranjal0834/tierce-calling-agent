"""
OpenAI embeddings for the knowledge base (text-embedding-3-small).
"""
import structlog
from openai import AsyncOpenAI

from backend.config import settings

log = structlog.get_logger()

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Returns one vector per input."""
    if not texts:
        return []
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    # OpenAI allows large batches; chunk to be safe on payload size
    out: list[list[float]] = []
    BATCH = 96
    for i in range(0, len(texts), BATCH):
        batch = [t[:8000] for t in texts[i:i + BATCH]]  # guard against oversized inputs
        resp = await client.embeddings.create(model=EMBED_MODEL, input=batch)
        out.extend([d.embedding for d in resp.data])
    return out


async def embed_query(text: str) -> list[float]:
    vecs = await embed_texts([text])
    return vecs[0] if vecs else []
