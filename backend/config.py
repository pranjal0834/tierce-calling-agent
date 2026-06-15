import os
from dotenv import load_dotenv

load_dotenv()

_DEFAULTS = {
    "ALGORITHM": "HS256",
    # ── Email / SMTP ──────────────────────────────────────────────────────────
    "SMTP_HOST":      "smtp.gmail.com",
    "SMTP_PORT":      587,
    "SMTP_USER":      "",
    "SMTP_PASSWORD":  "",
    "SMTP_FROM_NAME": "Vaaniq Voice",
    # Super admin — comma-separated email whitelist
    "ADMIN_EMAILS": "",
    # WhatsApp (external automation system) — POST text messages via its API
    "WHATSAPP_API_URL": "",
    "WHATSAPP_ACCESS_TOKEN": "",
    "WHATSAPP_PHONE_NUMBER_ID": "",
    # Production: send via Meta-approved templates instead of free-form text.
    # Flip on once templates are registered + the template endpoint is set.
    "WHATSAPP_USE_TEMPLATES": False,
    "WHATSAPP_TEMPLATE_API_URL": "",   # e.g. .../api/v1/messages/send/template
    "WHATSAPP_TEMPLATE_LANG": "en",
    # Billing — Razorpay (India/INR)
    "RAZORPAY_KEY_ID": "",
    "RAZORPAY_KEY_SECRET": "",
    "RAZORPAY_WEBHOOK_SECRET": "",
    # When true, "Buy Now" simulates a successful payment and credits minutes
    # WITHOUT calling Razorpay. For local testing only — turn OFF in production.
    "BILLING_TEST_MODE": False,
    # USD→INR conversion rate (used for number-rental pricing + admin revenue calc).
    # Update this when the exchange rate moves materially.
    "USD_TO_INR": 95.61,
    # Free-trial credits given on signup
    "FREE_TRIAL_MINUTES": 20.0,
    "ACCESS_TOKEN_EXPIRE_MINUTES": 60 * 24 * 7,  # 7 days
    "HOST": "0.0.0.0",
    "PORT": 8000,
    "DEBUG": False,
    "AWS_REGION": "us-east-1",
    "FINE_TUNING_THRESHOLD": 50,
    "AUTO_FINE_TUNE": True,
    # Set to True to skip real provider calls when buying/releasing numbers (for testing)
    "MOCK_PHONE_NUMBERS": False,
    "FINE_TUNE_BASE_MODEL": "gpt-4o-mini-2024-07-18",
    "OPENAI_REALTIME_URL": "wss://api.openai.com/v1/realtime",
    "OPENAI_REALTIME_MODEL": "gpt-realtime-mini",
    "GEMINI_LIVE_MODEL": "gemini-2.5-flash-native-audio-latest",
    # Native-audio engine: "openai" (gpt-realtime-mini, default) or "gemini" (Gemini Live).
    # Per-agent override via agent.config["engine"]; this is the global fallback so all
    # calls can be flipped to Gemini for testing regional-language quality.
    "NATIVE_AUDIO_ENGINE": "openai",
    # Gemini Live pricing (USD per 1M tokens) — gemini-2.5-flash native audio. Estimates;
    # verify on https://ai.google.dev/gemini-api/docs/pricing before relying on for billing.
    "GEMINI_AUDIO_IN_COST_PER_M":  3.00,
    "GEMINI_AUDIO_OUT_COST_PER_M": 12.00,
    "GEMINI_TEXT_IN_COST_PER_M":   0.50,
    "GEMINI_TEXT_OUT_COST_PER_M":  2.00,
    # Gemini tokenizes audio at ~25 tokens/sec — used to estimate cost (the 1.0.0
    # Live API gives no usage_metadata, so we meter audio seconds and estimate).
    "GEMINI_AUDIO_TOKENS_PER_SEC": 25,
    # Local barge-in (telephony has no echo cancellation): while the agent is speaking
    # we don't feed its echo to Gemini; instead we detect the caller interrupting by
    # audio energy. RMS above this for BARGE_FRAMES consecutive 20ms frames = barge-in.
    # Raise RMS if the agent cuts itself off on its own echo; lower it if it ignores you.
    "GEMINI_BARGE_RMS": 1500,
    "GEMINI_BARGE_FRAMES": 8,      # ~160ms of speech to declare the caller is talking
    "GEMINI_SILENCE_FRAMES": 40,   # ~800ms of quiet to declare the caller finished
    # OpenAI Realtime API pricing (USD per 1M tokens) — gpt-realtime-mini rates
    "REALTIME_AUDIO_IN_COST_PER_M":          10.0,   # $10   per 1M audio input tokens (uncached)
    "REALTIME_AUDIO_IN_CACHED_COST_PER_M":    0.30,  # $0.30 per 1M audio input tokens (cached context)
    "REALTIME_AUDIO_OUT_COST_PER_M":         20.0,   # $20   per 1M audio output tokens
    "REALTIME_TEXT_IN_COST_PER_M":            0.60,  # $0.60 per 1M text input tokens (uncached)
    "REALTIME_TEXT_IN_CACHED_COST_PER_M":     0.06,  # $0.06 per 1M text input tokens (cached)
    "REALTIME_TEXT_OUT_COST_PER_M":           2.40,  # $2.40 per 1M text output tokens
    # gpt-4.1-mini pricing (used by evaluator, sentiment, extractor, speculator, call_logger)
    "LLM_MINI_IN_COST_PER_M":        0.40,
    "LLM_MINI_IN_CACHED_COST_PER_M": 0.10,   # cached input is 1/4 price
    "LLM_MINI_OUT_COST_PER_M":       1.60,
    # gpt-4o-mini pricing (speculation pre-generation uses FINE_TUNE_BASE_MODEL = gpt-4o-mini)
    "LLM_4O_MINI_IN_COST_PER_M":        0.15,
    "LLM_4O_MINI_IN_CACHED_COST_PER_M": 0.075,
    "LLM_4O_MINI_OUT_COST_PER_M":       0.60,
    # whisper-1 transcription — billed per minute of audio
    "WHISPER_COST_PER_MIN":     0.006,
    # tts-1 (backchannel fillers) — billed per 1M characters
    "TTS_COST_PER_M_CHARS":     15.0,
    # text-embedding-3-small (knowledge base) — billed per 1M tokens
    "EMBED_COST_PER_M":         0.02,
}


class _Settings:
    def __getattr__(self, name: str):
        val = os.getenv(name)
        if val is not None:
            default = _DEFAULTS.get(name)
            if isinstance(default, bool):
                return val.lower() in ("1", "true", "yes")
            if isinstance(default, int):
                return int(val)
            return val
        if name in _DEFAULTS:
            return _DEFAULTS[name]
        return ""


settings = _Settings()
