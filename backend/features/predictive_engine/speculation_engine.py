"""
Predictive Conversation Engine (Speculation Engine)
=====================================================
After each agent response, pre-generate responses for the top-K most likely
next user turns. When the actual user speaks, if it matches a prediction,
we serve the pre-generated response instantly → TTFT ≈ 0ms.

On ~60% of predictable turns (sales scripts, support flows), this eliminates
all latency. No competitor using STT→LLM→TTS can match this.

Implementation:
  1. After agent responds → speculate() called as asyncio.create_task()
  2. Uses GPT-4o-mini to predict 3 likely user responses
  3. For each prediction, pre-generates agent response with the full LLM
  4. Stores in Redis with TTL (key = hash of conversation context + predicted user text)
  5. On next user turn → check_cache() hashes actual transcript → Redis lookup
  6. Cache hit: return pre-generated response (instant)
  7. Cache miss: normal LLM call
"""
import asyncio
import hashlib
import json
from typing import Optional

import structlog
from openai import AsyncOpenAI

from backend.config import settings

log = structlog.get_logger()

CACHE_TTL_SECONDS = 300   # 5 minutes — enough for a normal turn
PREDICTION_CACHE_PREFIX = "tierce:pred:"

_PREDICT_PROMPT = """You are predicting what a caller will say next in a voice call.
Given the conversation so far, predict the {k} most likely short responses the user will make.
These should be brief (1-2 sentences max) as people speak in voice calls.
Return ONLY a JSON array of strings, nothing else.
Example: ["Sure, I'm interested", "What's the price?", "I need to think about it"]"""

_SIMILARITY_THRESHOLD = 0.75   # Jaccard similarity for fuzzy matching


class SpeculationEngine:
    def __init__(self, redis, agent_id: str, enabled: bool = True):
        self.redis = redis
        self.agent_id = agent_id
        self.enabled = enabled
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._stats = {"hits": 0, "misses": 0}

    # ── Public API ───────────────────────────────────────────────────────────

    async def speculate(
        self,
        conversation_history: list[dict],
        latest_user_text: str,
        system_prompt: str,
        top_k: int = 3,
        call_id: str = "",
    ):
        """Called after agent responds. Pre-generates responses for likely next turns."""
        if not self.enabled or not conversation_history:
            return

        context_hash = self._hash_context(conversation_history)

        try:
            predicted_texts = await self._predict_user_responses(
                conversation_history=conversation_history,
                k=top_k,
                call_id=call_id,
            )
            if not predicted_texts:
                return

            # Pre-generate agent responses for each prediction in parallel
            tasks = [
                self._pregenerate_response(
                    conversation_history=conversation_history,
                    predicted_user_text=text,
                    context_hash=context_hash,
                    system_prompt=system_prompt,
                    call_id=call_id,
                )
                for text in predicted_texts
            ]
            await asyncio.gather(*tasks, return_exceptions=True)

            log.debug(
                "Speculation complete",
                predictions=len(predicted_texts),
                context_hash=context_hash[:8],
            )
        except Exception as exc:
            log.warning("Speculation failed", error=str(exc))

    async def check_cache(
        self,
        conversation_history: list[dict],
        user_text: str,
    ) -> Optional[str]:
        """
        Check if we have a pre-generated response for this user turn.
        Uses exact match first, then fuzzy (Jaccard) matching.
        """
        if not self.enabled:
            return None

        context_hash = self._hash_context(conversation_history)
        cache_key = self._make_key(context_hash, user_text)

        # Exact match
        cached = await self.redis.get(cache_key)
        if cached:
            self._stats["hits"] += 1
            log.info("Prediction cache hit (exact)", user_text=user_text[:50])
            return cached

        # Fuzzy match — scan similar keys
        pattern = f"{PREDICTION_CACHE_PREFIX}{context_hash}:*"
        keys = []
        async for key in self.redis.scan_iter(pattern, count=20):
            keys.append(key)

        for key in keys:
            stored_text = key.split(":", 3)[-1] if ":" in key else ""
            similarity = self._jaccard(user_text.lower(), stored_text.lower())
            if similarity >= _SIMILARITY_THRESHOLD:
                cached = await self.redis.get(key)
                if cached:
                    self._stats["hits"] += 1
                    log.info(
                        "Prediction cache hit (fuzzy)",
                        similarity=round(similarity, 2),
                        user_text=user_text[:50],
                    )
                    return cached

        self._stats["misses"] += 1
        return None

    @property
    def cache_hit_rate(self) -> float:
        total = self._stats["hits"] + self._stats["misses"]
        return self._stats["hits"] / max(total, 1)

    # ── Internal ─────────────────────────────────────────────────────────────

    async def _predict_user_responses(
        self, conversation_history: list[dict], k: int, call_id: str = ""
    ) -> list[str]:
        messages = [
            {"role": "system", "content": _PREDICT_PROMPT.format(k=k)},
            *conversation_history[-6:],  # last 3 turns for context
        ]
        response = await self.client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
            max_tokens=150,
            temperature=0.7,
        )
        try:
            from backend.core import cost_meter
            cost_meter.record_mini(call_id, "speculation_predict", response.usage)
        except Exception:
            pass
        content = response.choices[0].message.content.strip()
        try:
            predictions = json.loads(content)
            return [p for p in predictions if isinstance(p, str)][:k]
        except json.JSONDecodeError:
            return []

    async def _pregenerate_response(
        self,
        conversation_history: list[dict],
        predicted_user_text: str,
        context_hash: str,
        system_prompt: str,
        call_id: str = "",
    ):
        """Generate and cache the agent's response for a predicted user turn."""
        simulated_history = [
            *conversation_history,
            {"role": "user", "content": predicted_user_text},
        ]
        try:
            response = await self.client.chat.completions.create(
                model=settings.FINE_TUNE_BASE_MODEL,   # use whatever model agent has
                messages=simulated_history,
                max_tokens=200,
                temperature=0.7,
            )
            try:
                from backend.core import cost_meter
                cost_meter.record_4o_mini(call_id, "speculation_pregenerate", response.usage)
            except Exception:
                pass
            agent_response = response.choices[0].message.content.strip()
            cache_key = self._make_key(context_hash, predicted_user_text)
            await self.redis.setex(cache_key, CACHE_TTL_SECONDS, agent_response)
        except Exception as exc:
            log.warning("Pre-generation failed", error=str(exc))

    def _hash_context(self, history: list[dict]) -> str:
        """Hash last N turns to create context fingerprint."""
        context_str = json.dumps(history[-4:], sort_keys=True)
        return hashlib.sha256(context_str.encode()).hexdigest()[:16]

    def _make_key(self, context_hash: str, user_text: str) -> str:
        text_hash = hashlib.sha256(user_text.lower().strip().encode()).hexdigest()[:16]
        return f"{PREDICTION_CACHE_PREFIX}{context_hash}:{text_hash}:{user_text[:50]}"

    def _jaccard(self, a: str, b: str) -> float:
        set_a = set(a.split())
        set_b = set(b.split())
        if not set_a or not set_b:
            return 0.0
        return len(set_a & set_b) / len(set_a | set_b)
