"""
Per-call auxiliary AI cost meter.

Accumulates the USD cost of *auxiliary* model calls (gpt-4.1-mini, gpt-4o-mini,
whisper-1, tts-1, embeddings) keyed by call_id, so a call's TRUE total cost can
be recorded alongside the realtime audio cost.

The realtime call audio cost is tracked separately in openai_realtime._persist_cost.
This meter covers everything else: speculation, sentiment, evaluation, memory
extraction, summary, backchannel TTS, and knowledge-base embeddings.

Every function here is exception-safe — cost tracking must NEVER break a call.
"""
import structlog

from backend.config import settings

log = structlog.get_logger()

# call_id -> {"total_usd": float, "components": {name: {"usd","calls",...}}}
_costs: dict[str, dict] = {}
# Safety cap so a crashed call (that never calls pop) can't leak unbounded memory.
_MAX_TRACKED = 5000


def _safe_int(v) -> int:
    try:
        return int(v or 0)
    except Exception:
        return 0


def record(call_id: str, component: str, usd: float, **detail) -> None:
    """Accumulate a single cost event for a call. No-ops on bad input."""
    try:
        if not call_id or usd is None:
            return
        usd = float(usd)
        bucket = _costs.get(call_id)
        if bucket is None:
            if len(_costs) >= _MAX_TRACKED:
                _costs.clear()  # last-resort guard against leaks
            bucket = {"total_usd": 0.0, "components": {}}
            _costs[call_id] = bucket
        bucket["total_usd"] = round(bucket["total_usd"] + usd, 8)
        comp = bucket["components"].setdefault(component, {"usd": 0.0, "calls": 0})
        comp["usd"] = round(comp["usd"] + usd, 8)
        comp["calls"] += 1
        for k, v in detail.items():
            comp[k] = comp.get(k, 0) + v
    except Exception:
        pass


def pop(call_id: str) -> dict:
    """Remove and return accumulated costs for a call (call once, at finalize)."""
    try:
        return _costs.pop(call_id, {"total_usd": 0.0, "components": {}})
    except Exception:
        return {"total_usd": 0.0, "components": {}}


# ── Cost calculators ────────────────────────────────────────────────────────

def _chat_usd(usage, in_per_m: float, out_per_m: float, cached_per_m: float) -> float:
    """USD for a chat.completions `usage` object (handles cached input tokens)."""
    try:
        prompt = _safe_int(getattr(usage, "prompt_tokens", 0))
        completion = _safe_int(getattr(usage, "completion_tokens", 0))
        cached = 0
        details = getattr(usage, "prompt_tokens_details", None)
        if details is not None:
            cached = _safe_int(getattr(details, "cached_tokens", 0))
        uncached = max(prompt - cached, 0)
        return (
            uncached * in_per_m / 1_000_000
            + cached * cached_per_m / 1_000_000
            + completion * out_per_m / 1_000_000
        )
    except Exception:
        return 0.0


def record_mini(call_id: str, component: str, usage) -> None:
    """Record a gpt-4.1-mini chat.completions call."""
    usd = _chat_usd(
        usage,
        settings.LLM_MINI_IN_COST_PER_M,
        settings.LLM_MINI_OUT_COST_PER_M,
        settings.LLM_MINI_IN_CACHED_COST_PER_M,
    )
    record(call_id, component, usd,
           tokens_in=_safe_int(getattr(usage, "prompt_tokens", 0)),
           tokens_out=_safe_int(getattr(usage, "completion_tokens", 0)))


def record_4o_mini(call_id: str, component: str, usage) -> None:
    """Record a gpt-4o-mini chat.completions call (speculation pre-generation)."""
    usd = _chat_usd(
        usage,
        settings.LLM_4O_MINI_IN_COST_PER_M,
        settings.LLM_4O_MINI_OUT_COST_PER_M,
        settings.LLM_4O_MINI_IN_CACHED_COST_PER_M,
    )
    record(call_id, component, usd,
           tokens_in=_safe_int(getattr(usage, "prompt_tokens", 0)),
           tokens_out=_safe_int(getattr(usage, "completion_tokens", 0)))


def record_tts(call_id: str, component: str, chars) -> None:
    """Record a tts-1 call, priced per character."""
    usd = max(_safe_int(chars), 0) * settings.TTS_COST_PER_M_CHARS / 1_000_000
    record(call_id, component, usd, chars=_safe_int(chars))


def embedding_usd(usage_or_tokens) -> float:
    """USD for a text-embedding-3-small call (accepts a usage object or a token count)."""
    try:
        if hasattr(usage_or_tokens, "total_tokens"):
            tokens = _safe_int(getattr(usage_or_tokens, "total_tokens", 0))
        else:
            tokens = _safe_int(usage_or_tokens)
    except Exception:
        tokens = 0
    return tokens * settings.EMBED_COST_PER_M / 1_000_000


def record_embedding(call_id: str, component: str, usage_or_tokens) -> None:
    """Record a text-embedding-3-small call (accepts a usage object or a token count)."""
    try:
        if hasattr(usage_or_tokens, "total_tokens"):
            tokens = _safe_int(getattr(usage_or_tokens, "total_tokens", 0))
        else:
            tokens = _safe_int(usage_or_tokens)
    except Exception:
        tokens = 0
    usd = tokens * settings.EMBED_COST_PER_M / 1_000_000
    record(call_id, component, usd, tokens=tokens)
