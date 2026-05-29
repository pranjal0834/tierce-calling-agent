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
    # Billing — Razorpay (India/INR)
    "RAZORPAY_KEY_ID": "",
    "RAZORPAY_KEY_SECRET": "",
    # Billing — Stripe (International/USD)
    "STRIPE_SECRET_KEY": "",
    "STRIPE_WEBHOOK_SECRET": "",
    "STRIPE_PUBLISHABLE_KEY": "",
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
    "GEMINI_LIVE_MODEL": "gemini-2.0-flash-live-001",
    # OpenAI Realtime API pricing (USD per 1M tokens) — gpt-realtime-mini rates
    "REALTIME_AUDIO_IN_COST_PER_M":          10.0,   # $10   per 1M audio input tokens
    "REALTIME_AUDIO_OUT_COST_PER_M":         20.0,   # $20   per 1M audio output tokens
    "REALTIME_TEXT_IN_COST_PER_M":            0.60,  # $0.60 per 1M text input tokens (uncached)
    "REALTIME_TEXT_IN_CACHED_COST_PER_M":     0.30,  # $0.30 per 1M text input tokens (cached — half price)
    "REALTIME_TEXT_OUT_COST_PER_M":           2.40,  # $2.40 per 1M text output tokens
    # gpt-4.1-mini pricing (used by evaluator, sentiment, extractor, speculator, call_logger)
    "LLM_MINI_IN_COST_PER_M":   0.40,
    "LLM_MINI_OUT_COST_PER_M":  1.60,
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
