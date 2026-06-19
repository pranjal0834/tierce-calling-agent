"""
TaskManager — orchestrates a single call session.
Uses the native audio pipeline: raw audio ↔ GPT-4o Realtime / Gemini Live (no STT/TTS)
"""
import asyncio
import time
import uuid
from typing import Optional

import structlog
from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.core.interruption_manager import InterruptionManager, AudioSendStatus
from backend.db.models import Agent, Call, CallTurn, Contact
from backend.features.emotional_intelligence.fusion import EmotionFusionEngine
from backend.features.memory_graph.retriever import MemoryRetriever
from backend.features.backchannel.engine import BackchannelEngine
from backend.features.feedback_loop.call_logger import CallLogger

log = structlog.get_logger()


class TaskManager:
    def __init__(
        self,
        agent: Agent,
        call: Call,
        contact: Optional[Contact],
        websocket: WebSocket,
        db: AsyncSession,
        redis,
    ):
        self.agent = agent
        self.call = call
        self.contact = contact
        self.ws = websocket
        self.db = db
        self.redis = redis
        self.config = agent.config or {}

        self.interruption_manager = InterruptionManager(
            incremental_delay_ms=self.config.get("incremental_delay_ms", 400),
            interruption_word_threshold=self.config.get("interruption_word_threshold", 3),
        )
        self.emotion_engine = EmotionFusionEngine()
        self.backchannel_engine = BackchannelEngine(
            enabled=self.config.get("backchannel_enabled", True),
            rate_limit_s=self.config.get("backchannel_rate_limit_s", 12.0),
        )
        self.call_logger = CallLogger(db=db, call_id=call.id)
        self.memory_retriever = MemoryRetriever(db=db)

        self.conversation_history: list[dict] = []
        self.turn_index = 0
        self._running = True

        self.pipeline_mode = agent.pipeline_mode

    # ── Entry point ─────────────────────────────────────────────────────────

    async def run(self):
        """Load memory context, build enriched system prompt, then dispatch to correct pipeline."""
        memory_context = ""
        if self.contact and self.config.get("memory_graph", True):
            memory_context = await self.memory_retriever.get_context_for_call(
                contact_id=self.contact.id
            )

        enriched_prompt = self._build_system_prompt(memory_context)
        self.conversation_history = [{"role": "system", "content": enriched_prompt}]

        log.info(
            "TaskManager.run",
            call_id=self.call.id,
            pipeline=self.pipeline_mode,
            memory_context_chars=len(memory_context),
        )

        # Native audio is the only supported pipeline
        await self._run_native_pipeline()

        await self.call_logger.finalize()

    # ── System prompt ────────────────────────────────────────────────────────

    def _build_system_prompt(self, memory_context: str) -> str:
        base = self._apply_variables(self.agent.system_prompt)
        if memory_context:
            base = f"{base}\n\n## Contact Memory\n{memory_context}"
        return base

    def _apply_variables(self, text: str) -> str:
        """Replace [Placeholder] tokens in the prompt with real values:
          - agent-defined variables (config['variables'], e.g. Agent Name → Pranjal)
          - the lead/contact's name (from the uploaded sheet) for [Customer Name]/[Name]/etc.
        So the agent says 'Hi Ravi, this is Pranjal…' instead of 'Hi [Customer Name]…'.
        Unknown placeholders are left untouched."""
        import re
        if not text:
            return text
        # agent-defined variables — accept either a list of {name,value} or a dict
        raw = self.config.get("variables") or []
        items = raw.items() if isinstance(raw, dict) else [
            (d.get("name"), d.get("value")) for d in raw if isinstance(d, dict)
        ]
        variables = {str(k).strip().lower(): str(v) for k, v in items if k and str(v).strip()}
        # dynamic: the lead's name from the sheet/contact
        cust = (self.contact.name if (self.contact and self.contact.name) else "").strip()
        for key in ("customer name", "lead name", "name", "customer", "client name"):
            variables.setdefault(key, cust)

        def repl(m):
            inner = m.group(1).strip().lower()
            if inner in variables:
                val = variables[inner]
                if val:
                    return val
                # name-type placeholder with no value → friendly fallback
                if any(w in inner for w in ("name", "customer", "client")):
                    return "there"
                return ""
            return m.group(0)  # leave placeholders we don't have a value for

        return re.sub(r"\[([^\[\]]{1,40})\]", repl, text)

    # ── Native pipeline (GPT-4o Realtime / Gemini Live) ──────────────────────

    async def _run_native_pipeline(self):
        # Engine selection: per-agent override (agent.config["engine"]) else the
        # global default (settings.NATIVE_AUDIO_ENGINE). "gemini" → Gemini Live
        # (better Hindi/Gujarati); anything else → OpenAI gpt-realtime-mini.
        from backend.config import settings
        engine = ((self.agent.config or {}).get("engine")
                  or settings.NATIVE_AUDIO_ENGINE or "openai").lower()
        if engine.startswith("gemini"):
            from backend.features.native_audio.gemini_live import GeminiLiveHandler as Handler
        else:
            from backend.features.native_audio.openai_realtime import OpenAIRealtimeHandler as Handler
        log.info("Native pipeline engine selected", call_id=self.call.id, engine=engine)

        handler = Handler(
            agent=self.agent,
            call=self.call,
            websocket=self.ws,
            system_prompt=self.conversation_history[0]["content"],
            interruption_manager=self.interruption_manager,
            emotion_engine=self.emotion_engine,
            backchannel_engine=self.backchannel_engine,
            call_logger=self.call_logger,
            db=self.db,
        )
        await handler.run()

    def stop(self):
        self._running = False
