"""
Sentiment & Intent Classifier
Classifies the user's emotional state and intent from a transcript using GPT-4o-mini.

Emotions:  frustrated | excited | confused | engaged | neutral | sad | angry
Intents:   interested | objecting | asking_question | agreeing | ending_call | unclear
"""
import json
from typing import Optional

import structlog
from openai import AsyncOpenAI

from backend.config import settings

log = structlog.get_logger()

_CLASSIFY_PROMPT = """You are an emotional intelligence analyzer for voice AI calls.
Given a user's spoken transcript and acoustic signals, classify:
1. emotion: one of [frustrated, excited, confused, engaged, neutral, sad, angry]
2. intent: one of [interested, objecting, asking_question, agreeing, ending_call, unclear]
3. urgency: float 0.0-1.0 (0=calm, 1=urgent)
4. engagement: float 0.0-1.0 (0=disengaged, 1=highly engaged)
5. brief reasoning (1 sentence)

Respond ONLY with valid JSON:
{"emotion":"...", "intent":"...", "urgency":0.5, "engagement":0.7, "reasoning":"..."}"""


class SentimentClassifier:
    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def classify(
        self,
        transcript: str,
        paralinguistic: Optional[dict] = None,
    ) -> dict:
        if not transcript.strip():
            return {"emotion": "neutral", "intent": "unclear", "urgency": 0.0, "engagement": 0.5}

        acoustic_context = ""
        if paralinguistic:
            p = paralinguistic
            acoustic_context = (
                f"\nAcoustic signals: pitch={p.get('pitch_mean_hz', 0):.0f}Hz, "
                f"energy={p.get('energy_mean', 0):.3f}, "
                f"speaking_rate={p.get('speaking_rate_per_sec', 0):.1f}/s, "
                f"pause_ratio={p.get('pause_ratio', 0):.2f}"
            )

        user_content = f'Transcript: "{transcript}"{acoustic_context}'

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[
                    {"role": "system", "content": _CLASSIFY_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                max_tokens=120,
                temperature=0,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
            return result
        except Exception as exc:
            log.warning("Sentiment classification failed", error=str(exc))
            return {"emotion": "neutral", "intent": "unclear", "urgency": 0.0, "engagement": 0.5}
