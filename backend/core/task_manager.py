"""
TaskManager — orchestrates a single call session.
Supports two pipeline modes:
  - native: raw audio ↔ GPT-4o Realtime / Gemini Live  (no STT/TTS)
  - classic: audio → STT → LLM → TTS → audio (Bolna-style)
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
from backend.features.predictive_engine.speculation_engine import SpeculationEngine
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
        self.speculation_engine = SpeculationEngine(
            redis=redis,
            agent_id=agent.id,
            enabled=self.config.get("predictive_engine", True),
        )
        self.call_logger = CallLogger(db=db, call_id=call.id)
        self.memory_retriever = MemoryRetriever(db=db)

        self.conversation_history: list[dict] = []
        self.turn_index = 0
        self._running = True

        self.pipeline_mode = agent.pipeline_mode  # "native" | "classic"

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

        if self.pipeline_mode == "native":
            await self._run_native_pipeline()
        else:
            await self._run_classic_pipeline()

        await self.call_logger.finalize()

    # ── System prompt ────────────────────────────────────────────────────────

    def _build_system_prompt(self, memory_context: str) -> str:
        base = self.agent.system_prompt
        if memory_context:
            base = f"{base}\n\n## Contact Memory\n{memory_context}"
        return base

    # ── Native pipeline (GPT-4o Realtime / Gemini Live) ──────────────────────

    async def _run_native_pipeline(self):
        from backend.features.native_audio.openai_realtime import OpenAIRealtimeHandler

        handler = OpenAIRealtimeHandler(
            agent=self.agent,
            call=self.call,
            websocket=self.ws,
            system_prompt=self.conversation_history[0]["content"],
            interruption_manager=self.interruption_manager,
            emotion_engine=self.emotion_engine,
            backchannel_engine=self.backchannel_engine,
            speculation_engine=self.speculation_engine,
            call_logger=self.call_logger,
            db=self.db,
        )
        await handler.run()

    # ── Classic pipeline (STT → LLM → TTS) ───────────────────────────────────

    async def _run_classic_pipeline(self):
        from backend.features.native_audio.classic_pipeline import ClassicPipelineHandler

        handler = ClassicPipelineHandler(
            agent=self.agent,
            call=self.call,
            websocket=self.ws,
            conversation_history=self.conversation_history,
            interruption_manager=self.interruption_manager,
            emotion_engine=self.emotion_engine,
            backchannel_engine=self.backchannel_engine,
            speculation_engine=self.speculation_engine,
            call_logger=self.call_logger,
            config=self.config,
        )
        await handler.run()

    def stop(self):
        self._running = False
