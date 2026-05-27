"""
Post-transfer audio stream handler.
When a call is transferred, Twilio keeps streaming audio here via <Start><Stream>.
We buffer both tracks, transcribe with Whisper, and save turns to DB marked as from_transfer=True.
"""
import asyncio
import base64
import io
import json
import time
import uuid
import wave

import httpx
import structlog
from fastapi import WebSocket
from sqlalchemy import func, select

from backend.config import settings
from backend.db.database import AsyncSessionLocal
from backend.db.models import CallTurn

log = structlog.get_logger()

_CHUNK_SECONDS = 8    # accumulate this many seconds per track before transcribing
_MIN_BYTES = 8000     # skip transcription if buffer is too small (~1s at 8kHz)
_SAMPLE_RATE = 8000


def _ulaw_to_pcm16(ulaw_bytes: bytes) -> bytes:
    """G.711 μ-law → 16-bit linear PCM."""
    try:
        import audioop  # available in Python ≤ 3.12
        return audioop.ulaw2lin(ulaw_bytes, 2)
    except ImportError:
        import numpy as np
        u = np.frombuffer(ulaw_bytes, dtype=np.uint8).astype(np.int32)
        inv = ~u & 0xFF
        exp = (inv >> 4) & 0x07
        mant = inv & 0x0F
        linear = ((mant << 1 | 0x21) << (exp + 2)) - 33
        sign = u >> 7
        linear = np.where(sign, -linear, linear).astype(np.int16)
        return linear.tobytes()


def _make_wav(pcm16: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(_SAMPLE_RATE)
        wf.writeframes(pcm16)
    return buf.getvalue()


async def _whisper(ulaw_bytes: bytes) -> str:
    if len(ulaw_bytes) < _MIN_BYTES:
        return ""
    wav = _make_wav(_ulaw_to_pcm16(ulaw_bytes))
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                files={"file": ("audio.wav", wav, "audio/wav")},
                data={"model": "whisper-1"},
                timeout=30,
            )
        if resp.status_code == 200:
            return resp.json().get("text", "").strip()
        log.warning("Whisper failed", status=resp.status_code)
    except Exception as exc:
        log.warning("Whisper error", error=str(exc))
    return ""


async def _save_turn(call_id: str, role: str, transcript: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(func.max(CallTurn.turn_index)).where(CallTurn.call_id == call_id)
        )
        max_idx = result.scalar() or 0
        turn = CallTurn(
            id=str(uuid.uuid4()),
            call_id=call_id,
            turn_index=max_idx + 1,
            role=role,
            transcript=transcript,
            from_transfer=True,
        )
        db.add(turn)
        await db.commit()
    log.info("Transfer turn saved", call_id=call_id, role=role, chars=len(transcript))


class TransferStreamHandler:
    def __init__(self, call_id: str):
        self.call_id = call_id
        self._inbound = bytearray()   # caller's voice
        self._outbound = bytearray()  # human agent's voice
        self._last_flush = time.time()

    async def handle(self, websocket: WebSocket):
        await websocket.accept()
        log.info("Transfer stream connected", call_id=self.call_id)
        try:
            async for raw in websocket.iter_text():
                data = json.loads(raw)
                event = data.get("event")
                if event == "media":
                    media = data["media"]
                    audio = base64.b64decode(media.get("payload", ""))
                    if media.get("track", "inbound") == "inbound":
                        self._inbound.extend(audio)
                    else:
                        self._outbound.extend(audio)
                    if time.time() - self._last_flush >= _CHUNK_SECONDS:
                        await self._flush()
                        self._last_flush = time.time()
                elif event == "stop":
                    await self._flush()
                    break
        except Exception as exc:
            log.warning("Transfer stream error", call_id=self.call_id, error=str(exc))
        finally:
            await self._flush()
            log.info("Transfer stream ended", call_id=self.call_id)

    async def _flush(self):
        tasks = []
        if len(self._inbound) > _MIN_BYTES:
            tasks.append(("user", bytes(self._inbound)))
            self._inbound.clear()
        if len(self._outbound) > _MIN_BYTES:
            tasks.append(("agent", bytes(self._outbound)))
            self._outbound.clear()
        for role, audio in tasks:
            text = await _whisper(audio)
            if text:
                await _save_turn(self.call_id, role, text)
