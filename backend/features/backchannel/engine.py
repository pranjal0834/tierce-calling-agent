"""
Backchannel Engine — makes the agent sound human, not robotic.
===================================================================
While the user is speaking, the agent occasionally plays short filler audio:
  "mm-hmm", "uh-huh", "I see", "right", "yes", "okay"

This is the #1 indicator of a robotic call — dead silence while the agent
"listens" feels unnatural. Real humans give backchannels constantly.

Rules:
  - Only play when user IS speaking (not during agent turns)
  - Rate limit: no more than 1 backchannel per {rate_limit_s} seconds
  - Don't start too early (wait > 1.5 seconds into user speech)
  - Don't interrupt end of utterance (stop if VAD silence detected)
  - Vary the filler (don't repeat "uh-huh" 10 times)

Audio: pre-generated via OpenAI TTS at call start using the agent's own voice,
then converted to 8kHz μ-law for Twilio Media Streams.
Falls back to pre-recorded .ulaw files in assets/backchannels/ if present.
"""
import asyncio
import base64
import random
import struct
import time
from pathlib import Path
from typing import Optional

import structlog

from backend.config import settings

log = structlog.get_logger()

BACKCHANNEL_FILLERS: dict[str, str] = {
    "mm_hmm": "mm-hmm",
    "uh_huh": "uh-huh",
    "i_see": "I see",
    "right": "right",
    "yes": "yes",
    "okay": "okay",
    "got_it": "got it",
    "sure": "sure",
}

ASSETS_DIR = Path(__file__).parent / "assets"


def _pcm24k_to_mulaw8k(pcm_bytes: bytes) -> bytes:
    """Convert 24kHz 16-bit signed little-endian PCM to 8kHz 8-bit G.711 μ-law."""
    # Try stdlib audioop first (available Python ≤ 3.12)
    try:
        import audioop  # type: ignore[import]
        pcm_8k, _ = audioop.ratecv(pcm_bytes, 2, 1, 24000, 8000, None)
        return audioop.lin2ulaw(pcm_8k, 2)
    except ImportError:
        pass

    # Pure-Python fallback: simple 3:1 decimation + μ-law encoding
    n = len(pcm_bytes) // 2
    samples = struct.unpack(f"<{n}h", pcm_bytes[: n * 2])
    downsampled = samples[::3]

    def _lin2ulaw(s: int) -> int:
        BIAS, CLIP = 132, 32635
        s = max(-CLIP, min(CLIP, s))
        sign = 0x80 if s < 0 else 0
        s = abs(s) + BIAS
        exp = 7
        mask = 0x4000
        while exp > 0 and not (s & mask):
            exp -= 1
            mask >>= 1
        mantissa = (s >> (exp + 3)) & 0x0F
        return (~(sign | (exp << 4) | mantissa)) & 0xFF

    return bytes(_lin2ulaw(s) for s in downsampled)


class BackchannelEngine:
    def __init__(
        self,
        enabled: bool = True,
        rate_limit_s: float = 12.0,
    ):
        self.enabled = enabled
        self.rate_limit_s = rate_limit_s
        self._last_played: float = 0.0
        self._speech_started_at: float = 0.0
        self._cached_audio: dict[str, str] = {}   # name → base64 mulaw
        self._filler_names = list(BACKCHANNEL_FILLERS.keys())
        random.shuffle(self._filler_names)
        self._queue_pos = 0
        self._initialized = False

        self._load_assets()

    # ── Startup ──────────────────────────────────────────────────────────────

    def _load_assets(self):
        """Load pre-recorded .ulaw files from assets/ (fastest path)."""
        for name in BACKCHANNEL_FILLERS:
            path = ASSETS_DIR / f"{name}.ulaw"
            if path.exists():
                with open(path, "rb") as f:
                    self._cached_audio[name] = base64.b64encode(f.read()).decode()
        if self._cached_audio:
            self._initialized = True
            log.info("Backchannel: loaded pre-recorded assets", count=len(self._cached_audio))

    async def initialize(self, voice: str = "alloy", call_id: str = ""):
        """Generate backchannel audio via OpenAI TTS using the agent's voice."""
        if self._initialized or not self.enabled:
            return
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            generated = 0
            for name, text in BACKCHANNEL_FILLERS.items():
                if name in self._cached_audio:
                    continue
                try:
                    response = await client.audio.speech.create(
                        model="tts-1",
                        voice=voice,  # type: ignore[arg-type]
                        input=text,
                        response_format="pcm",  # 24kHz 16-bit signed LE mono
                    )
                    try:
                        from backend.core import cost_meter
                        cost_meter.record_tts(call_id, "backchannel_tts", len(text))
                    except Exception:
                        pass
                    mulaw = _pcm24k_to_mulaw8k(response.content)
                    self._cached_audio[name] = base64.b64encode(mulaw).decode()
                    generated += 1
                except Exception as exc:
                    err_str = str(exc)
                    # Quota exceeded — no point retrying the remaining fillers
                    if "insufficient_quota" in err_str or "429" in err_str:
                        log.warning("Backchannel TTS quota exceeded — disabling backchannels")
                        self.enabled = False
                        return
                    log.warning("Backchannel TTS failed for filler", name=name, error=err_str)

            if generated > 0:
                self._initialized = True
                log.info("Backchannel: TTS-generated audio ready", count=generated, voice=voice)
            else:
                log.warning("Backchannel: no audio generated — backchannels disabled")
                self.enabled = False
        except Exception as exc:
            log.warning("Backchannel initialization failed", error=str(exc))

    # ── Runtime ───────────────────────────────────────────────────────────────

    def on_speech_start(self):
        """Call when VAD detects user speech started."""
        self._speech_started_at = time.monotonic()

    def on_speech_end(self):
        """Call when VAD detects user speech stopped."""
        self._speech_started_at = 0.0

    async def maybe_play(self) -> Optional[str]:
        """
        Return base64 μ-law audio to send to Twilio, or None if not appropriate.
        Call this periodically while user is speaking.
        """
        if not self.enabled or not self._initialized or not self._cached_audio:
            return None

        now = time.monotonic()

        if now - self._last_played < self.rate_limit_s:
            return None

        if self._speech_started_at <= 0:
            return None
        if now - self._speech_started_at < 1.5:
            return None

        name = self._filler_names[self._queue_pos % len(self._filler_names)]
        self._queue_pos += 1
        audio = self._cached_audio.get(name)
        if audio:
            self._last_played = now
        return audio
