"""
Classic Pipeline — STT → LLM → TTS
Fallback when native audio models aren't available or agent is configured for it.
Adapted from Bolna's architecture with emotional intelligence + all 6 features integrated.
"""
import asyncio
import base64
import json
import time
from typing import Optional

import structlog
from fastapi import WebSocket
from openai import AsyncOpenAI

from backend.config import settings
from backend.core.interruption_manager import InterruptionManager, AudioSendStatus
from backend.db.models import Agent, Call
from backend.features.emotional_intelligence.fusion import EmotionFusionEngine
from backend.features.backchannel.engine import BackchannelEngine
from backend.features.predictive_engine.speculation_engine import SpeculationEngine
from backend.features.feedback_loop.call_logger import CallLogger

log = structlog.get_logger()


class ClassicPipelineHandler:
    def __init__(
        self,
        agent: Agent,
        call: Call,
        websocket: WebSocket,
        conversation_history: list[dict],
        interruption_manager: InterruptionManager,
        emotion_engine: EmotionFusionEngine,
        backchannel_engine: BackchannelEngine,
        speculation_engine: SpeculationEngine,
        call_logger: CallLogger,
        config: dict,
    ):
        self.agent = agent
        self.call = call
        self.ws = websocket
        self.history = conversation_history
        self.im = interruption_manager
        self.emotion_engine = emotion_engine
        self.backchannel_engine = backchannel_engine
        self.speculation_engine = speculation_engine
        self.call_logger = call_logger
        self.config = config

        self.openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._turn_index = 0
        self._stream_sid: Optional[str] = None
        self._running = True
        self._audio_buffer: list[bytes] = []

        # Queues connecting STT → LLM → TTS stages
        self._transcript_queue: asyncio.Queue[str] = asyncio.Queue()
        self._audio_out_queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def run(self):
        await asyncio.gather(
            self._receive_telephony(),
            self._llm_loop(),
            self._tts_output_loop(),
        )

    # ── Stage 1: Receive telephony audio + Deepgram STT ─────────────────────

    async def _receive_telephony(self):
        """
        Receive audio from telephony, run it through Deepgram streaming STT,
        put final transcripts into _transcript_queue.
        """
        try:
            import websockets as ws_lib
            deepgram_url = (
                f"wss://api.deepgram.com/v1/listen"
                f"?model={self.config.get('classic_stt_model', 'nova-2')}"
                f"&encoding=mulaw&sample_rate=8000&channels=1"
                f"&interim_results=true&vad_events=true&endpointing=400"
            )
            headers = {"Authorization": f"Token {settings.DEEPGRAM_API_KEY}"}

            async with ws_lib.connect(deepgram_url, extra_headers=headers) as dg_ws:
                await asyncio.gather(
                    self._forward_audio_to_deepgram(dg_ws),
                    self._read_deepgram_results(dg_ws),
                )
        except Exception as exc:
            log.exception("Classic pipeline STT error", error=str(exc))
            self._running = False

    async def _forward_audio_to_deepgram(self, dg_ws):
        try:
            async for message in self.ws.iter_text():
                if not self._running:
                    break
                data = json.loads(message)
                event = data.get("event")
                if event == "start":
                    self._stream_sid = data["start"].get("streamSid")
                elif event == "media":
                    raw = base64.b64decode(data["media"]["payload"])
                    self._audio_buffer.append(raw)
                    await dg_ws.send(raw)
                elif event == "stop":
                    self._running = False
                    break
        except Exception as exc:
            log.exception("Error forwarding to Deepgram", error=str(exc))
            self._running = False

    async def _read_deepgram_results(self, dg_ws):
        try:
            async for raw_msg in dg_ws:
                msg = json.loads(raw_msg)
                msg_type = msg.get("type")

                if msg_type == "SpeechStarted":
                    self.im.on_user_speech_started()
                    asyncio.create_task(self.backchannel_engine.maybe_play())

                elif msg_type == "Results":
                    channel = msg.get("channel", {})
                    alternatives = channel.get("alternatives", [])
                    if not alternatives:
                        continue
                    transcript = alternatives[0].get("transcript", "")
                    is_final = msg.get("is_final", False)

                    if is_final and transcript.strip():
                        # Check for false interruption
                        word_count = len(transcript.split())
                        if self.im.is_false_interruption(word_count):
                            continue

                        if self.im.should_trigger_interruption(word_count):
                            self.im.on_interruption_triggered()
                            # Clear the audio output queue (stop current TTS)
                            while not self._audio_out_queue.empty():
                                self._audio_out_queue.get_nowait()
                            if self._stream_sid:
                                await self.ws.send_json({
                                    "event": "clear",
                                    "streamSid": self._stream_sid,
                                })

                        self.im.on_user_speech_ended()

                        # Emotion analysis on buffered audio
                        if self._audio_buffer:
                            asyncio.create_task(
                                self._analyze_emotion(self._audio_buffer.copy())
                            )
                            self._audio_buffer = []

                        await self._transcript_queue.put(transcript)

        except Exception as exc:
            log.exception("Error reading from Deepgram", error=str(exc))

    # ── Stage 2: LLM ─────────────────────────────────────────────────────────

    async def _llm_loop(self):
        while self._running:
            try:
                transcript = await asyncio.wait_for(
                    self._transcript_queue.get(), timeout=30.0
                )
            except asyncio.TimeoutError:
                continue

            self._turn_index += 1
            t0 = time.monotonic()

            # Check speculation cache first
            cached = await self.speculation_engine.check_cache(
                conversation_history=self.history,
                user_text=transcript,
            )

            if cached:
                log.info("Prediction cache hit", turn=self._turn_index)
                self.history.append({"role": "user", "content": transcript})
                self.history.append({"role": "assistant", "content": cached})
                await self.call_logger.log_turn(
                    turn_index=self._turn_index,
                    role="user",
                    transcript=transcript,
                    from_cache=True,
                )
                self._turn_index += 1
                await self.call_logger.log_turn(
                    turn_index=self._turn_index,
                    role="agent",
                    transcript=cached,
                    latency_ms=int((time.monotonic() - t0) * 1000),
                    from_cache=True,
                )
                await self._tts_text_to_queue(cached)
                continue

            # Standard LLM call
            self.history.append({"role": "user", "content": transcript})
            await self.call_logger.log_turn(
                turn_index=self._turn_index,
                role="user",
                transcript=transcript,
            )

            full_response = ""
            seq_id = self.im.get_next_sequence_id()
            self.im.on_agent_speech_started()

            try:
                stream = await self.openai.chat.completions.create(
                    model=self.agent.llm_model or "gpt-4o",
                    messages=self.history,
                    stream=True,
                    max_tokens=200,
                    temperature=0.7,
                )
                async for chunk in stream:
                    delta = chunk.choices[0].delta.content or ""
                    full_response += delta
            except Exception as exc:
                log.error("LLM error", error=str(exc))
                full_response = "I'm sorry, I had a technical issue. Could you repeat that?"

            latency_ms = int((time.monotonic() - t0) * 1000)
            self.history.append({"role": "assistant", "content": full_response})
            self._turn_index += 1
            await self.call_logger.log_turn(
                turn_index=self._turn_index,
                role="agent",
                transcript=full_response,
                latency_ms=latency_ms,
            )
            self.im.retire_sequence_id(seq_id)

            # TTS
            await self._tts_text_to_queue(full_response)

            # Speculation for next turn
            asyncio.create_task(
                self.speculation_engine.speculate(
                    conversation_history=self.history,
                    latest_user_text=transcript,
                    system_prompt=self.history[0]["content"],
                )
            )

    # ── Stage 3: TTS → telephony ──────────────────────────────────────────────

    async def _tts_text_to_queue(self, text: str):
        """Stream ElevenLabs TTS and put base64 mulaw chunks into the output queue."""
        import aiohttp
        voice_id = self.agent.voice_id or "21m00Tcm4TlvDq8ikWAM"
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
        headers = {
            "xi-api-key": settings.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
        }
        payload = {
            "text": text,
            "model_id": "eleven_turbo_v2",
            "output_format": "ulaw_8000",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as resp:
                async for chunk in resp.content.iter_chunked(512):
                    if chunk:
                        await self._audio_out_queue.put(base64.b64encode(chunk).decode())
        await self._audio_out_queue.put(None)  # sentinel

    async def _tts_output_loop(self):
        """Drain audio queue and send to telephony."""
        while self._running:
            try:
                chunk = await asyncio.wait_for(self._audio_out_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            if chunk is None:
                self.im.on_agent_speech_ended()
                self.im.on_successful_response_delivered()
                continue
            if self._stream_sid:
                await self.ws.send_json({
                    "event": "media",
                    "streamSid": self._stream_sid,
                    "media": {"payload": chunk},
                })

    async def _analyze_emotion(self, audio_chunks: list[bytes]):
        combined = b"".join(audio_chunks)
        emotion_state = await self.emotion_engine.analyze(audio_bytes=combined)
        if emotion_state:
            self.call.emotion_profile = {
                **self.call.emotion_profile,
                f"turn_{self._turn_index}": emotion_state,
            }
