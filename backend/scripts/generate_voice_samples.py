"""
One-time generator for voice-preview samples used by the agent Voice picker.

For every Gemini prebuilt voice it creates one short WAV PER LANGUAGE under
backend/static/voice-samples/, named <Voice>.<lang>.wav (e.g. Kore.en.wav). The
backend serves them at /voice-samples/<Voice>.<lang>.wav (see main.py mount), and
the Voice picker has an English / Hindi / Gujarati toggle that picks the clip — so
a user hears a short, single-language sample instead of one long trilingual one.

The Hindi/Gujarati lines use gender-neutral subjunctives ("करूँ"/"કરું") so they
fit any voice regardless of its perceived gender.

Run inside the backend container:
    python -m backend.scripts.generate_voice_samples
Add --force to regenerate files that already exist.
"""
import os
import struct
import sys
import time

from google import genai
from google.genai import types

from backend.config import settings
from backend.features.native_audio.gemini_live import _GEMINI_VOICES

# lang code -> short, single-language preview line.
LANG_SAMPLES = {
    "en": "Hi! This is your AI assistant. How can I help you today?",
    "hi": "नमस्ते! बताइए, मैं आपकी कैसे मदद करूँ?",
    "gu": "નમસ્તે! બોલો, હું તમારી કેવી રીતે મદદ કરું?",
}
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "voice-samples")
# Tried in order per clip. Each TTS model has its OWN per-day quota, so if the
# flash model is exhausted (429) we fall back to the pro model automatically.
TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"]


def pcm_to_wav(pcm: bytes, rate=24000, ch=1, width=2) -> bytes:
    n = len(pcm)
    header = b"RIFF" + struct.pack("<I", 36 + n) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, ch, rate, rate * ch * width, ch * width, width * 8)
    header += b"data" + struct.pack("<I", n)
    return header + pcm


def _synth_once(client, model: str, voice: str, text: str) -> bytes:
    resp = client.models.generate_content(
        model=model,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                )
            ),
        ),
    )
    return resp.candidates[0].content.parts[0].inline_data.data


def synth(client, voice: str, text: str) -> bytes:
    """Try each model; on a 429 (quota/rate) move to the next, then back off and retry."""
    last_exc = None
    for attempt in range(4):
        for model in TTS_MODELS:
            try:
                return _synth_once(client, model, voice, text)
            except Exception as exc:
                last_exc = exc
                if "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc):
                    continue          # this model is rate/quota limited — try the next
                raise                 # a real error — surface it
        time.sleep(5 * (attempt + 1))  # every model was limited — wait, then retry
    raise last_exc


def _cleanup_legacy(voices):
    """Remove the old single combined <Voice>.wav files (superseded by per-language)."""
    removed = 0
    for v in voices:
        old = os.path.join(OUT_DIR, f"{v}.wav")
        if os.path.exists(old):
            os.remove(old)
            removed += 1
    if removed:
        print(f"Removed {removed} legacy combined sample(s).\n")


def main():
    force = "--force" in sys.argv
    os.makedirs(OUT_DIR, exist_ok=True)
    client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    voices = sorted(_GEMINI_VOICES)
    _cleanup_legacy(voices)
    total = len(voices) * len(LANG_SAMPLES)
    made, skipped, failed = 0, 0, []
    n = 0

    for voice in voices:
        for lang, text in LANG_SAMPLES.items():
            n += 1
            tag = f"{voice}.{lang}"
            path = os.path.join(OUT_DIR, f"{tag}.wav")
            if os.path.exists(path) and not force:
                skipped += 1
                print(f"[{n:3}/{total}] {tag:18} skip (exists)")
                continue
            for attempt in range(3):
                try:
                    pcm = synth(client, voice, text)
                    with open(path, "wb") as f:
                        f.write(pcm_to_wav(pcm))
                    made += 1
                    print(f"[{n:3}/{total}] {tag:18} OK  {len(pcm)//1024} KB")
                    break
                except Exception as exc:
                    if attempt == 2:
                        failed.append((tag, str(exc)[:120]))
                        print(f"[{n:3}/{total}] {tag:18} FAILED: {str(exc)[:120]}")
                    else:
                        time.sleep(2 * (attempt + 1))
            time.sleep(2.5)  # be gentle with the TTS preview per-minute rate limit

    print(f"\nDone. generated={made} skipped={skipped} failed={len(failed)}")
    if failed:
        for t, e in failed:
            print(f"  - {t}: {e}")
    print(f"Output dir: {os.path.abspath(OUT_DIR)}")


if __name__ == "__main__":
    main()
