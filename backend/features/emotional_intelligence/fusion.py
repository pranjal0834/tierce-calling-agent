"""
Emotion Fusion Engine
=====================
Combines three parallel streams from raw audio:
  1. Paralinguistic analysis  (pitch, energy, rate, pauses)
  2. Sentiment/intent classification (LLM-based)
  3. Conversation context (history pattern)

→ Produces a fused EmotionState injected into the LLM system prompt
  to enable adaptive, emotionally-aware responses.

Example injection:
  "User emotional state: excited (high speaking rate, elevated pitch).
   Intent: interested. Respond enthusiastically but don't overwhelm."
"""
import asyncio
from dataclasses import dataclass, field
from typing import Optional

import structlog

from backend.features.emotional_intelligence.paralinguistic import ParalinguisticAnalyzer
from backend.features.emotional_intelligence.sentiment import SentimentClassifier

log = structlog.get_logger()


EMOTION_GUIDANCE = {
    "frustrated": "Speak calmly and empathetically. Acknowledge frustration first before solving. Keep responses short.",
    "excited":    "Match their energy. Be enthusiastic. Move the conversation forward quickly.",
    "confused":   "Slow down. Be very clear and simple. Offer to repeat or clarify. Ask if they understand.",
    "engaged":    "They're interested — provide more detail, move toward the goal.",
    "neutral":    "Maintain a professional, friendly tone.",
    "sad":        "Be warm and supportive. Don't rush. Acknowledge feelings.",
    "angry":      "Stay calm and professional. De-escalate. Don't be defensive.",
}

INTENT_GUIDANCE = {
    "interested":      "Capitalize on interest — provide value immediately.",
    "objecting":       "Acknowledge the objection before countering. Use 'I understand' framing.",
    "asking_question": "Answer the question directly and completely before moving on.",
    "agreeing":        "Confirm agreement and advance the conversation.",
    "ending_call":     "Wrap up gracefully with a clear next step or summary.",
    "unclear":         "Ask a clarifying question.",
}


@dataclass
class EmotionState:
    emotion: str = "neutral"
    intent: str = "unclear"
    urgency: float = 0.0
    engagement: float = 0.5
    pitch_mean_hz: float = 0.0
    energy_mean: float = 0.0
    speaking_rate: float = 0.0
    pause_ratio: float = 0.0
    reasoning: str = ""

    def to_prompt_injection(self) -> str:
        """Returns a short string to inject into the system prompt for this turn."""
        emotion_guide = EMOTION_GUIDANCE.get(self.emotion, "")
        intent_guide = INTENT_GUIDANCE.get(self.intent, "")
        acoustic = ""
        if self.pitch_mean_hz > 200:
            acoustic = "speaking with high pitch (nervous/excited)"
        elif self.speaking_rate > 4.0:
            acoustic = "speaking fast (excited/rushed)"
        elif self.pause_ratio > 0.4:
            acoustic = "with long pauses (confused/thinking)"
        elif self.energy_mean < 0.01:
            acoustic = "speaking quietly (hesitant/uncertain)"

        parts = [f"[Emotional context: user is {self.emotion}"]
        if acoustic:
            parts.append(f", {acoustic}")
        parts.append(f". Intent: {self.intent}.")
        if emotion_guide:
            parts.append(f" {emotion_guide}")
        if intent_guide:
            parts.append(f" {intent_guide}")
        parts.append("]")
        return " ".join(parts)

    def to_dict(self) -> dict:
        return {
            "emotion": self.emotion,
            "intent": self.intent,
            "urgency": self.urgency,
            "engagement": self.engagement,
            "pitch_mean_hz": self.pitch_mean_hz,
            "energy_mean": self.energy_mean,
            "speaking_rate": self.speaking_rate,
            "pause_ratio": self.pause_ratio,
            "reasoning": self.reasoning,
        }


class EmotionFusionEngine:
    """
    Runs paralinguistic analysis and sentiment classification in parallel,
    then fuses results into an EmotionState.
    """

    def __init__(self):
        self.paralinguistic = ParalinguisticAnalyzer()
        self.sentiment = SentimentClassifier()

    async def analyze(
        self,
        audio_bytes: bytes,
        transcript: Optional[str] = None,
        sample_rate: int = 8000,
        call_id: str = "",
    ) -> dict:
        """
        Full fusion pipeline. Returns EmotionState.to_dict() for storage.
        Non-blocking — meant to run as asyncio.create_task().
        """
        # Run acoustic analysis FIRST (CPU-bound, in a thread) so the caller's TONE
        # can actually inform the emotion label. Without this the label comes from the
        # transcribed WORDS alone — so an angry voice with plain words reads as
        # neutral/confused. We're off the reply critical path (background task), so the
        # extra few ms of serializing acoustic→sentiment costs the conversation nothing.
        loop = asyncio.get_event_loop()
        acoustic = await loop.run_in_executor(
            None, self.paralinguistic.analyze, audio_bytes, sample_rate
        )

        # LLM sentiment, now fed the acoustic signals so tone is weighed with the words.
        sentiment = {}
        if transcript:
            sentiment = await self.sentiment.classify(
                transcript, paralinguistic=acoustic, call_id=call_id
            )

        state = EmotionState(
            emotion=sentiment.get("emotion", "neutral"),
            intent=sentiment.get("intent", "unclear"),
            urgency=sentiment.get("urgency", 0.0),
            engagement=sentiment.get("engagement", 0.5),
            pitch_mean_hz=acoustic.get("pitch_mean_hz", 0.0),
            energy_mean=acoustic.get("energy_mean", 0.0),
            speaking_rate=acoustic.get("speaking_rate_per_sec", 0.0),
            pause_ratio=acoustic.get("pause_ratio", 0.0),
            reasoning=sentiment.get("reasoning", ""),
        )

        log.debug("Emotion fused", state=state.to_dict())
        return state.to_dict()

    def build_prompt_injection(self, emotion_dict: dict) -> str:
        """Convert stored emotion dict back to prompt string."""
        state = EmotionState(**{k: v for k, v in emotion_dict.items() if k in EmotionState.__dataclass_fields__})
        return state.to_prompt_injection()
