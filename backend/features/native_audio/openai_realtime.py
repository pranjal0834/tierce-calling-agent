"""
Feature 1: Native Audio Pipeline — GPT-4o Realtime API
=========================================================
Raw audio IN → GPT-4o Realtime WebSocket → Raw audio OUT
Eliminates STT + TTS entirely for ~300 ms lower latency.

OpenAI Realtime API flow:
  telephony WS → [this handler] → openai WS → [this handler] → telephony WS

Events from telephony:
  {"event": "media",  "media": {"payload": "<base64 mulaw>"}}
  {"event": "start",  "start": {"callSid": "...", "streamSid": "..."}}
  {"event": "stop"}

Events from OpenAI Realtime:
  session.created, session.updated
  input_audio_buffer.speech_started
  input_audio_buffer.speech_stopped
  conversation.item.input_audio_transcription.completed   (transcript)
  response.output_audio.delta                             (audio chunk)
  response.output_audio.done
  response.done
"""
import asyncio
import base64
import json
import time
import uuid
from typing import Optional

import structlog
import websockets
from fastapi import WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.core.interruption_manager import InterruptionManager, AudioSendStatus
from backend.db.models import Agent, Call, Contact
from backend.telephony.twilio_handler import TwilioHandler
from backend.utils.phone import normalize_phone
from backend.features.emotional_intelligence.fusion import EmotionFusionEngine
from backend.features.backchannel.engine import BackchannelEngine
from backend.features.feedback_loop.call_logger import CallLogger
from backend.features.tools.executor import execute_tool

log = structlog.get_logger()

OPENAI_WS_URL = (
    f"wss://api.openai.com/v1/realtime?model={settings.OPENAI_REALTIME_MODEL}"
)

# Whisper hallucinates these phrases on silence or low-quality audio — not real caller speech
_WHISPER_HALLUCINATIONS = {
    "...", "…", ".", ",", " ",
    "thank you for watching", "thank you for watching.",
    "thanks for watching", "thanks for watching!",
    "please subscribe", "like and subscribe",
    "subtitles by", "captions by",
    # Very common Whisper hallucinations on short silence / noise bursts
    "bye", "bye everyone", "bye, everyone", "goodbye everyone",
    "see you", "see you soon", "see you next time", "see you later",
    "take care", "take care everyone", "take care, everyone", "taker care everyone",
    "have a nice day", "have a good day", "have a great day",
    "have a nice day and be well", "be well",
    "you're welcome", "you are welcome",
    "ok", "okay",
    "sure", "sure thing", "of course", "no problem",
    "all right", "alright",
    "hello", "hi", "hey",
    "good morning", "good evening", "good night", "good afternoon",
    "see you in the next one", "stay tuned",
}

# Voicemail / answering machine indicator phrases (Whisper transcription of machine greeting)
# Matched as case-insensitive substrings against the transcript, so keep them
# specific enough that a real human would not say them mid-conversation.
_VOICEMAIL_PHRASES = (
    # ── Generic voicemail ──
    "please leave a message",
    "leave a message after the",
    "leave your message after the",
    "record your message after the",
    "not available to take your call",
    "not available right now",
    "you have reached the voicemail",
    "you have reached the mailbox",
    "your call has been forwarded to",
    "this is the voicemail",
    "mailbox is full",
    "at the tone, please record",
    "after the tone",
    "after the beep",
    "press any key to accept",     # call-screening / carrier voicemail
    "to accept this call, press",
    "this call may be recorded",
    # ── Indian carrier / IVR greetings (Airtel, Jio, Vi, BSNL) ──
    "the person you are trying to call",
    "the number you are trying to call",
    "the subscriber you are trying to call",
    "the customer you are trying to reach",
    "the person you have called",
    "is not answering",
    "is not reachable",
    "is currently not reachable",
    "is currently switched off",
    "is switched off",
    "is currently out of coverage",
    "out of coverage area",
    "cannot be reached at the moment",
    "unable to take your call",
    "unable to receive your call",
    "please try again later",
    "please try after some time",
    "please call after some time",
    "do not disturb service",        # carrier DND auto-reject message
    "is busy on another call",
    "all lines to this route are busy",
    "you can record your message",
    "record your message and",
    "to record a message",
    "leave a voice message",
    "is currently engaged",
)

# OpenAI Realtime transcription accepts ISO-639-1 codes from this set only.
# (session.audio.input.transcription.language) — anything else is rejected and
# breaks the whole session, so we must never send an unsupported value.
_OPENAI_TRANSCRIBE_LANGS = {
    "af", "ar", "az", "be", "bg", "bs", "ca", "cs", "cy", "da", "de", "el", "en",
    "es", "et", "fa", "fi", "fr", "gl", "he", "hi", "hr", "hu", "hy", "id", "is",
    "it", "iw", "ja", "kk", "kn", "ko", "lt", "lv", "mi", "mk", "mr", "ms", "ne",
    "nl", "no", "pl", "pt", "ro", "ru", "sk", "sl", "sr", "sv", "sw", "ta", "th",
    "tl", "tr", "uk", "ur", "vi", "zh",
}

# Map full language names (as stored on the agent) to ISO-639-1 codes.
_LANG_NAME_TO_CODE = {
    "english": "en", "british english": "en", "australian english": "en",
    "hindi": "hi", "marathi": "mr", "tamil": "ta", "kannada": "kn",
    "urdu": "ur", "nepali": "ne", "bengali": "bn", "gujarati": "gu",
    "punjabi": "pa", "telugu": "te", "malayalam": "ml", "odia": "or",
    "assamese": "as", "spanish": "es", "french": "fr", "german": "de",
    "italian": "it", "portuguese": "pt", "russian": "ru", "japanese": "ja",
    "korean": "ko", "chinese": "zh", "mandarin": "zh", "arabic": "ar",
    "dutch": "nl", "polish": "pl", "turkish": "tr", "indonesian": "id",
    "vietnamese": "vi", "thai": "th", "hebrew": "he", "ukrainian": "uk",
}


def _transcription_language_code(name: str) -> str | None:
    """Resolve an agent language name to a code OpenAI's transcriber supports.

    Returns the ISO-639-1 code if (and only if) it's in the supported set,
    otherwise None — in which case the caller should omit the language param
    and let Whisper auto-detect (sending an unsupported value breaks the session).
    """
    
    key = (name or "").strip().lower()
    code = _LANG_NAME_TO_CODE.get(key, key)  # accept either a name or a raw code
    return code if code in _OPENAI_TRANSCRIBE_LANGS else None


# Phrases / words that signal the caller wants to end the call
_END_OF_CALL_PHRASES = {
    "bye", "bye bye", "goodbye", "good bye",
    "have a good day", "have a nice day", "have a great day",
    "talk to you later", "talk to you soon", "ttyl",
    "that's all", "that's all i needed", "that is all", "that is all i needed",
    "that'll be all", "that will be all",
    "we're done", "we are done", "i'm done", "i am done",
    "disconnect", "hang up", "end the call", "please hang up",
    "ok thanks bye", "okay thanks bye", "ok thank you bye", "okay thank you bye",
    "thanks bye", "thank you bye",
    "no thank you", "no thanks", "not interested",
    "nothing else", "nothing more", "nothing else thanks", "nothing more thanks",
    "i don't need anything else", "i don't need anything more",
    "take care", "take care bye", "take care goodbye",
}


class OpenAIRealtimeHandler:
    def __init__(
        self,
        agent: Agent,
        call: Call,
        websocket: WebSocket,
        system_prompt: str,
        interruption_manager: InterruptionManager,
        emotion_engine: EmotionFusionEngine,
        backchannel_engine: BackchannelEngine,
        call_logger: CallLogger,
        db: AsyncSession,
    ):
        self.agent = agent
        self.call = call
        self.telephony_ws = websocket
        self.system_prompt = system_prompt
        self.im = interruption_manager
        self.emotion_engine = emotion_engine
        self.backchannel_engine = backchannel_engine
        self.call_logger = call_logger
        self.db = db

        self.openai_ws: Optional[websockets.WebSocketClientProtocol] = None
        self.stream_sid: Optional[str] = None
        self.call_sid: Optional[str] = None

        self._turn_index = 0
        self._current_user_audio: list[bytes] = []   # buffer for emotion analysis
        self._response_start_time: float = 0.0
        self._running = True
        self._pending_hangup = False  # set when caller signals end-of-call
        self._backchannel_task: Optional[asyncio.Task] = None
        self._pending_tool_calls: dict[str, dict] = {}  # call_id → {name, args_buf}

        # Token usage accumulators — populated from response.done usage events
        self._audio_in_tokens: int = 0        # total audio input tokens (cached + uncached)
        self._audio_in_cached_tokens: int = 0  # subset served from cache (charged at the cached rate)
        self._audio_out_tokens: int = 0
        self._text_in_tokens: int = 0        # total text input tokens (cached + uncached)
        self._text_in_cached_tokens: int = 0  # subset served from cache (charged at the cached rate)
        self._text_out_tokens: int = 0
        # Whisper transcription metering: sum the duration of caller speech segments
        # (whisper-1 is billed per minute of transcribed audio).
        self._transcription_seconds: float = 0.0
        self._speech_seg_start: float = 0.0

        # Response gating — prevents "conversation_already_has_active_response" errors
        self._response_active: bool = False
        self._response_pending: bool = False  # user spoke while agent was talking
        self._agent_speaking: bool = False    # suppress input audio while agent speaks

    # ── Main run loop ────────────────────────────────────────────────────────

    async def run(self):
        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        }
        # Generate backchannel audio in the background — don't block the call start.
        # maybe_play() returns None until _initialized=True so this is safe.
        voice = self.agent.voice_id or "alloy"
        asyncio.create_task(self.backchannel_engine.initialize(voice=voice, call_id=self.call.id))

        try:
            async with websockets.connect(OPENAI_WS_URL, extra_headers=headers) as openai_ws:
                self.openai_ws = openai_ws
                await self._configure_session()

                # Run telephony↔OpenAI bridging concurrently
                await asyncio.gather(
                    self._receive_from_telephony(),
                    self._receive_from_openai(),
                )
        finally:
            # Commit self.db before _persist_cost() so the row lock acquired by
            # _link_call_to_contact() and _hangup() flushes is released.
            # Without this, _persist_cost()'s fresh session UPDATE blocks on the
            # locked row (self.db never commits until AssistantManager.finally,
            # which only runs after _persist_cost() returns) — deadlock.
            try:
                await self.db.commit()
            except Exception as exc:
                log.warning("Pre-finalize commit failed", error=str(exc))
            await self._persist_cost()

    # ── Session configuration ────────────────────────────────────────────────

    async def _configure_session(self):
        """Send session.update with system prompt, voice, and audio formats."""
        voice = self.agent.voice_id or "alloy"
        cfg = self.agent.config or {}

        # Build speech-style injection from agent config
        speech_style_block = ""
        accent = cfg.get("accent")
        speech_pace = cfg.get("speech_pace")
        if accent or speech_pace:
            lines = ["\n\nSPEECH STYLE RULE:"]
            if accent:
                lines.append(f"Speak with a {accent} accent throughout the entire call. Maintain it consistently.")
            if speech_pace:
                lines.append(f"Speech pace: speak {speech_pace}.")
            speech_style_block = " ".join(lines)

        # Build language instruction from agent config
        languages: list = cfg.get("languages") or []
        _english_variants = {"english", "british english", "australian english"}
        if len(languages) == 1:
            lang = languages[0]
            if lang.lower() in _english_variants:
                language_block = (
                    f"\n\nLANGUAGE RULE: Conduct this entire conversation in {lang} only. "
                    "Do not switch to any other language regardless of what the caller speaks."
                )
            else:
                language_block = (
                    f"\n\nLANGUAGE RULE: Conduct this conversation primarily in {lang}. "
                    f"Start your opening greeting in {lang} — do NOT open in English. "
                    f"You may naturally mix in common English words and short phrases where they feel natural and human "
                    f"(for example 'Good morning' instead of a formal {lang} equivalent, or everyday words like 'okay', 'actually', 'basically', 'no problem') — "
                    f"this makes the conversation sound authentic, like a real person speaks. "
                    f"However, the bulk of every sentence must remain in {lang}. "
                    "Do not switch entirely to English or hold full sentences in English."
                )
        elif len(languages) > 1:
            lang_list = ", ".join(languages)
            primary = languages[0]
            if primary.lower() in _english_variants:
                start_instruction = f"Begin the conversation in {primary}."
            else:
                start_instruction = (
                    f"Begin the conversation in {primary} — your opening greeting must be in {primary}, not in English. "
                    f"You may naturally mix in common English words and short phrases where they feel natural "
                    f"(e.g. 'Good morning', 'okay', 'actually', 'no problem'), but the bulk of each sentence must stay in the active language."
                )
            language_block = (
                f"\n\nLANGUAGE RULE: You support the following languages: {lang_list}. "
                f"{start_instruction} "
                "Switch to whichever supported language the caller speaks — stay within the supported languages only. "
                "Never switch to a language not in this list."
            )
        else:
            language_block = (
                "\n\nLANGUAGE RULE: Always begin the conversation in English. "
                "If the caller speaks in a different language, switch to that language and stay in it for the rest of the call. "
                "Never randomly switch languages on your own. Be consistent."
            )

        # Build transcription config. Only send a language hint when the agent
        # uses a single language AND OpenAI's transcriber supports its code.
        # An unsupported value (e.g. 'gujarati'/'gu') is rejected by the API and
        # breaks the whole session, so in that case we omit it and let Whisper
        # auto-detect — the Realtime model itself can still speak the language.
        transcription_cfg = {"model": "whisper-1"}
        try:
            if len(languages) == 1:
                code = _transcription_language_code(languages[0])
                if code and code != "en":
                    transcription_cfg["language"] = code
        except Exception:
            pass

        kb_block = ""
        if (self.agent.config or {}).get("knowledge_base_ids"):
            kb_block = (
                "\n\nKNOWLEDGE BASE RULE: You have access to a company knowledge base via the "
                "query_knowledge_base tool. Whenever the caller asks anything not explicitly covered "
                "in your instructions above (products, pricing, policies, services, company details, etc.), "
                "call query_knowledge_base with their question BEFORE answering. Base your answer on what it "
                "returns. Only say you don't have the information if the tool returns nothing relevant."
            )

        # Self-improving feedback loop: guidance distilled from automated reviews of
        # past calls (failures + their corrections + good examples). Injected into the
        # prompt so improvements actually feed back into native-audio calls.
        learned = (cfg.get("learned_guidance") or "").strip()
        learned_block = (
            "\n\nLEARNED GUIDANCE (from automated review of your past calls — follow these):\n" + learned
        ) if learned else ""

        instructions = (
            self.system_prompt
            + speech_style_block
            + language_block
            + kb_block
            + learned_block
            + "\n\nFOCUS RULE: You are on a phone call. Only respond to the primary caller speaking directly to you. "
            "Completely ignore any background noise, TV audio, music, other people talking nearby, or any voice that is not directly addressing you. "
            "If the audio is unclear or sounds like background noise rather than a direct question or statement, do not respond — wait for the caller to speak clearly."
            "\n\nEND-OF-CALL RULE: When the caller signals they want to end the conversation (says bye, goodbye, that's all, take care, not interested, etc.), "
            "give a brief warm closing (one or two sentences maximum), then stop speaking. Do not ask follow-up questions or extend the conversation."
            "\n\nCALLBACK RULE: Only schedule a callback when the caller EXPLICITLY and clearly asks to be "
            "called back later (e.g. 'call me tomorrow', 'call me in an hour', 'I'm busy, call me this evening'). "
            "Do NOT schedule a callback just because the caller is hesitant, silent, confused, or you misheard. "
            "If you are not certain they asked for a callback, do NOT call the tool — keep talking or ask a clarifying question. "
            "NEVER invent or assume a time the caller did not say, and NEVER default to '2 minutes'. "
            "If the caller wants a callback but did not give a time, ASK 'When would be a good time to call you back?' "
            "and use only the time they actually state. "
            "(Note: phrases like 'a quick 2-minute call' describe the call's LENGTH, not when to call back — do not "
            "schedule a 2-minute callback for that.) "
            "Only once you have an explicit time, call schedule_callback with relative_minutes (for durations the caller "
            "stated, e.g. 'in an hour' → 60) or datetime_iso (for specific times, e.g. 'tomorrow 5 PM'). "
            "Then give ONE short confirmation in the caller's language and say goodbye."
            "\n\nAPPOINTMENT RULE: To book, schedule, reschedule, set up, or change an appointment or MEETING, you MUST "
            "use your calendar tool — NEVER use schedule_callback for this. Step 1: call the calendar tool with "
            "action='check_availability' for the caller's requested date to get the open slots. Step 2: offer ONLY "
            "those returned slots; if the caller's requested time is not among them, say it's unavailable and suggest "
            "the nearest open slots. Step 3: once the caller confirms an AVAILABLE slot, call the calendar tool with "
            "action='book' and that exact datetime_iso to create the appointment, then confirm it briefly. "
            "Remember: schedule_callback only arranges for YOU to phone the caller again later — it does NOT create a "
            "calendar appointment. Words like 'book', 'reschedule', 'set up a meeting', 'appointment' always mean the "
            "calendar tool, not schedule_callback."
        )
        # Remember the base prompt so we can re-send it with the contact's memory graph
        # appended once the contact is resolved (Twilio strips the call_id from the WS
        # URL, so the contact isn't known yet at session-config time).
        self._base_instructions = instructions
        from backend.features.tools.executor import CALENDAR_BOOKING_PARAMS, SCHEDULE_CALLBACK_PARAMS
        raw_tools = cfg.get("tools") or []
        openai_tools = [
            {
                "type": "function",
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": (
                    CALENDAR_BOOKING_PARAMS
                    if t.get("type") == "calendar_booking"
                    else (t.get("parameters") or {"type": "object", "properties": {}})
                ),
            }
            for t in raw_tools
            if t.get("enabled", True)
        ]
        # Always inject the built-in schedule_callback tool
        openai_tools.append({
            "type": "function",
            "name": "schedule_callback",
            "description": (
                "Schedule an outbound callback ONLY when the caller has EXPLICITLY asked to be called back at a "
                "specific time they stated themselves. Do NOT call this tool on a guess, on hesitation/silence, or "
                "if you are unsure — when in doubt, do not schedule. NEVER default to or invent a time; in particular "
                "NEVER use 2 minutes unless the caller literally said 'two minutes'. A phrase like 'a quick 2-minute "
                "call' refers to the call's length, not a callback time — do not schedule from it. Set relative_minutes "
                "only from a duration the caller stated (e.g. 'in an hour' → 60), or datetime_iso for a specific time "
                "they gave (e.g. 'tomorrow at 5 PM'). The caller's number is already known — do not ask for it. "
                "This only arranges another PHONE CALL to the caller — it does NOT book a meeting or appointment. "
                "For booking, rescheduling, or setting up an appointment/meeting, use the calendar booking tool "
                "(check_availability then action='book'), never this tool."
            ),
            "parameters": SCHEDULE_CALLBACK_PARAMS,
        })

        # Inject the WhatsApp tool when a WhatsApp system is configured, so the agent
        # can text the caller information/links on request during the call.
        from backend.integrations.whatsapp import is_configured as _wa_configured
        if _wa_configured():
            openai_tools.append({
                "type": "function",
                "name": "send_whatsapp",
                "description": (
                    "Send a WhatsApp message to the caller's own phone with information they asked for — "
                    "details, a link, an address, pricing, a summary, next steps, etc. Use whenever the caller "
                    "asks you to send, share, or text them something on WhatsApp. The message goes to their "
                    "number automatically — do NOT ask for their number. Put the full text in 'message'."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "message": {"type": "string", "description": "The exact text to send to the caller on WhatsApp."},
                    },
                    "required": ["message"],
                },
            })

        # Inject knowledge-base retrieval tool when the agent has KBs attached
        kb_ids = cfg.get("knowledge_base_ids") or []
        if kb_ids:
            openai_tools.append({
                "type": "function",
                "name": "query_knowledge_base",
                "description": (
                    "Search the company knowledge base for information to answer the caller's question. "
                    "Use this whenever the caller asks something that isn't covered in your instructions — "
                    "about products, pricing, policies, services, company details, etc. "
                    "Pass the caller's question (or a concise version of it) as the query. "
                    "Always call this before saying you don't know something."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The caller's question or the key information to look up.",
                        },
                    },
                    "required": ["query"],
                },
            })
        session_update = {
            "type": "session.update",
            "session": {
                "type": "realtime",
                "model": settings.OPENAI_REALTIME_MODEL,
                "output_modalities": ["audio"],
                "audio": {
                    "input": {
                        "format": {"type": "audio/pcmu"},
                        # Noise suppression — filters background noise + the agent's own echo
                        # BEFORE it reaches turn detection. Essential on a telephony line with
                        # no echo cancellation; without it, background voices/echo start false
                        # turns and derail the conversation. near_field = caller-on-handset.
                        "noise_reduction": {"type": "near_field"},
                        # Predictive turn-taking: a semantic classifier predicts when the caller
                        # has actually finished their thought (vs a fixed silence gap), so the
                        # agent replies at natural moments — like a human.
                        "turn_detection": {
                            "type": "semantic_vad",
                            "eagerness": "auto",          # balanced: responsive but won't cut callers off
                            "interrupt_response": False,  # agent finishes its sentence — echo can't self-interrupt it
                            "create_response": False,     # we fire response.create manually to avoid conflicts
                        },
                        # Prefer a language hint for Whisper when the agent is configured to use
                        # a single non-English language — helps reduce mis-transcription.
                        "transcription": transcription_cfg,
                    },
                    "output": {
                        "format": {"type": "audio/pcmu"},
                        "voice": voice,
                    },
                },
                "instructions": instructions,
                "tools": openai_tools,
                "tool_choice": "auto",
                "max_output_tokens": 300,
            },
        }
        await self.openai_ws.send(json.dumps(session_update))
        log.info("OpenAI Realtime session configured", call_id=self.call.id, voice=voice)

    # ── Telephony → OpenAI ───────────────────────────────────────────────────

    async def _receive_from_telephony(self):
        """Forward telephony audio to OpenAI Realtime."""
        try:
            async for message in self.telephony_ws.iter_text():
                if not self._running:
                    break
                data = json.loads(message)
                event = data.get("event")

                if event == "start":
                    start = data.get("start", {})
                    # Plivo uses streamId / callUUID; Twilio uses streamSid / callSid
                    self._is_plivo = "streamId" in start
                    self.stream_sid = start.get("streamSid") or start.get("streamId")
                    self.call_sid = start.get("callSid") or start.get("callUUID")
                    log.info("Telephony stream started", stream_sid=self.stream_sid,
                             call_sid=self.call_sid, provider="plivo" if self._is_plivo else "twilio")
                    if self.call_sid:
                        asyncio.create_task(self._link_call_to_contact(self.call_sid))

                elif event == "media":
                    payload = data["media"]["payload"]
                    # Buffer audio for emotion analysis
                    raw = base64.b64decode(payload)
                    self._current_user_audio.append(raw)

                    # Skip forwarding to OpenAI while agent is speaking — saves ~30-40% input tokens.
                    # Safe because interrupt_response=False means we ignore speech during agent turns anyway.
                    if not self._agent_speaking:
                        await self.openai_ws.send(json.dumps({
                            "type": "input_audio_buffer.append",
                            "audio": payload,
                        }))

                elif event == "stop":
                    self._running = False
                    # Caller hung up — record who ended the call
                    try:
                        from sqlalchemy.orm.attributes import flag_modified
                        extra = dict(self.call.extra_data or {})
                        extra["ended_by"] = "caller"
                        self.call.extra_data = extra
                        flag_modified(self.call, "extra_data")
                        await self.db.flush()
                    except Exception:
                        pass
                    await self.openai_ws.send(json.dumps({"type": "input_audio_buffer.clear"}))
                    break

        except Exception as exc:
            log.exception("Error receiving from telephony", error=str(exc))
            self._running = False

    # ── OpenAI → Telephony ───────────────────────────────────────────────────

    async def _receive_from_openai(self):
        """Forward OpenAI audio responses back to telephony."""
        try:
            async for raw_message in self.openai_ws:
                if not self._running:
                    break
                event = json.loads(raw_message)
                await self._handle_openai_event(event)
        except Exception as exc:
            log.exception("Error receiving from OpenAI", error=str(exc))
            self._running = False

    async def _handle_openai_event(self, event: dict):
        etype = event.get("type", "")

        if etype == "session.created":
            log.info("OpenAI Realtime session created")

        elif etype == "session.updated":
            log.info("OpenAI Realtime session updated", session=event.get("session", {}))

        elif etype == "input_audio_buffer.speech_started":
            self.im.on_user_speech_started()
            self._speech_seg_start = time.monotonic()
            self._current_user_audio = []
            # Only clear Twilio's playback buffer if the agent is NOT mid-utterance.
            # Clearing while it speaks would cut its sentence off — and with barge-in
            # disabled (echo can falsely trigger this), the agent should finish first.
            if not self._agent_speaking:
                await self._clear_telephony_audio()
            # Start backchannel loop — plays short fillers while user speaks
            self.backchannel_engine.on_speech_start()
            if self._backchannel_task is None or self._backchannel_task.done():
                self._backchannel_task = asyncio.create_task(self._backchannel_loop())

        elif etype == "input_audio_buffer.speech_stopped":
            self.im.on_user_speech_ended()
            if self._speech_seg_start > 0:
                self._transcription_seconds += max(time.monotonic() - self._speech_seg_start, 0.0)
                self._speech_seg_start = 0.0
            self.backchannel_engine.on_speech_end()
            if self._backchannel_task and not self._backchannel_task.done():
                self._backchannel_task.cancel()
                self._backchannel_task = None
            if self._current_user_audio:
                asyncio.create_task(self._analyze_emotion(self._current_user_audio.copy()))
            self._current_user_audio = []
            # Fire response only if agent is idle; otherwise mark pending so response.done picks it up
            if not self._response_active:
                self._response_active = True
                await self.openai_ws.send(json.dumps({"type": "response.create"}))
            else:
                self._response_pending = True

        elif etype == "conversation.item.input_audio_transcription.completed":
            transcript = event.get("transcript", "").strip()
            if not transcript or len(transcript) < 3:
                return
            # Drop known Whisper hallucinations (noise/silence transcribed as fake speech)
            t_norm = transcript.lower().strip().rstrip("!?.,")
            if t_norm in _WHISPER_HALLUCINATIONS:
                log.debug("Whisper hallucination filtered", transcript=transcript)
                return
            # Also check after stripping punctuation variants like "Bye, everyone"
            t_no_comma = t_norm.replace(",", "").replace("  ", " ")
            if t_no_comma in _WHISPER_HALLUCINATIONS:
                log.debug("Whisper hallucination filtered (punctuation variant)", transcript=transcript)
                return
            self._turn_index += 1
            await self.call_logger.log_turn(
                turn_index=self._turn_index,
                role="user",
                transcript=transcript,
                latency_ms=None,
            )
            # Emotional Intelligence: classify the caller's emotion/intent from the
            # actual transcript (the acoustic pass at speech_stopped has no text, so
            # this is where real emotion/intent gets determined). Runs in the
            # background so it never delays the agent's reply. (Native audio already
            # adapts the agent's behavior to tone; this powers emotion analytics.)
            if (self.agent.config or {}).get("emotion_detection", True):
                asyncio.create_task(self._classify_sentiment(transcript, f"turn_{self._turn_index}"))
            # Check if this is a voicemail/answering machine (transcript fallback for AMD).
            # Collapse repeated whitespace so "after  the   tone" still matches.
            t_lower = " ".join(transcript.lower().split())
            if any(phrase in t_lower for phrase in _VOICEMAIL_PHRASES):
                log.info("Voicemail detected via transcript — hanging up", transcript=transcript)
                asyncio.create_task(self._hangup_voicemail())
                return

            # Check if caller wants to end the call
            if self._is_end_of_call(transcript):
                self._pending_hangup = True
                log.info("End-of-call intent detected", transcript=transcript)

        elif etype == "response.created":
            self._response_active = True
            self._agent_speaking = True
            self._response_start_time = time.monotonic()
            seq_id = self.im.get_next_sequence_id()
            self.im.on_agent_speech_started()
            event["_seq_id"] = seq_id  # store for downstream use

        elif etype == "response.output_audio.delta":
            # Stream audio chunk to telephony (gated by interruption manager)
            seq_id = event.get("_seq_id", self.im._current_sequence_id)
            status = self.im.get_audio_send_status(seq_id)
            # DEBUG: log keys and status once per call
            if not hasattr(self, "_audio_delta_logged"):
                self._audio_delta_logged = True
                log.info("DEBUG audio delta", keys=list(event.keys()), status=status,
                         seq_valid=self.im.is_sequence_valid(seq_id),
                         seq_id=seq_id, cur_seq=self.im._current_sequence_id,
                         stream_sid=self.stream_sid)
            if status == AudioSendStatus.SEND:
                delta = event.get("delta", "")
                if delta:
                    await self._send_audio_to_telephony(delta)
            elif status == AudioSendStatus.BLOCK:
                pass  # Dropped — user interrupted

        elif etype == "response.output_audio.done":
            self._agent_speaking = False
            self.im.on_agent_speech_ended()

        elif etype == "response.done":
            latency_ms = int((time.monotonic() - self._response_start_time) * 1000)
            response = event.get("response", {})

            # Accumulate token usage for cost tracking
            usage = response.get("usage", {})
            if usage:
                din = usage.get("input_token_details", {})
                dout = usage.get("output_token_details", {})
                audio_in = din.get("audio_tokens", 0)
                text_in = din.get("text_tokens", 0)
                self._audio_in_tokens  += audio_in
                self._audio_out_tokens += dout.get("audio_tokens", 0)
                # Use text_tokens from details; fall back to (total - audio) only when details
                # are absent. Never use raw input_tokens/output_tokens as text — they include
                # audio tokens and would cause double-counting.
                if din:
                    self._text_in_tokens += text_in
                    # Split the cached input into its audio + text parts so each is billed at
                    # the cached rate. cached_tokens is the TOTAL (audio+text) cached; the
                    # per-modality split is in cached_tokens_details. Critically, cached audio
                    # must NOT be counted as full-price audio — that was the main overcharge.
                    ctd = din.get("cached_tokens_details") or {}
                    if ctd:
                        self._audio_in_cached_tokens += ctd.get("audio_tokens", 0)
                        self._text_in_cached_tokens  += ctd.get("text_tokens", 0)
                    else:
                        # No per-modality split: attribute cached to text first, remainder to audio.
                        cached = din.get("cached_tokens", 0)
                        c_text = min(cached, text_in)
                        self._text_in_cached_tokens  += c_text
                        self._audio_in_cached_tokens += min(max(cached - c_text, 0), audio_in)
                else:
                    self._text_in_tokens += max(0, usage.get("input_tokens", 0) - audio_in)
                if dout:
                    self._text_out_tokens += dout.get("text_tokens", 0)
                else:
                    self._text_out_tokens += max(0, usage.get("output_tokens", 0) - dout.get("audio_tokens", 0))

            output = response.get("output", [])
            agent_text = ""
            for item in output:
                for part in item.get("content", []):
                    if part.get("type") in ("text", "output_text"):
                        agent_text += part.get("text", "")
                    elif part.get("type") in ("audio", "output_audio"):
                        agent_text += part.get("transcript", "")

            self._turn_index += 1
            await self.call_logger.log_turn(
                turn_index=self._turn_index,
                role="agent",
                transcript=agent_text,
                latency_ms=latency_ms,
            )
            self.im.on_successful_response_delivered()

            # Hang up after the farewell response if caller signalled end-of-call
            if self._pending_hangup and self.call_sid:
                self._running = False
                log.info("Hanging up after farewell", call_sid=self.call_sid)
                asyncio.create_task(self._hangup())

            # Clear active flag; fire queued response if user spoke while agent was talking
            self._response_active = False
            if self._response_pending and not self._pending_hangup:
                self._response_pending = False
                self._response_active = True
                await self.openai_ws.send(json.dumps({"type": "response.create"}))

        elif etype == "response.cancelled":
            self._response_active = False
            self._agent_speaking = False
            self.im.on_agent_speech_ended()

        elif etype == "response.output_item.added":
            item = event.get("item", {})
            if item.get("type") == "function_call":
                call_id = item.get("call_id", "")
                self._pending_tool_calls[call_id] = {"name": item.get("name", ""), "args_buf": ""}
                log.info("Tool call started", tool=item.get("name"), call_id=call_id)

        elif etype == "response.function_call_arguments.delta":
            call_id = event.get("call_id", "")
            if call_id in self._pending_tool_calls:
                self._pending_tool_calls[call_id]["args_buf"] += event.get("delta", "")

        elif etype == "response.function_call_arguments.done":
            call_id = event.get("call_id", "")
            if call_id not in self._pending_tool_calls:
                return
            pending = self._pending_tool_calls.pop(call_id)
            try:
                arguments = json.loads(pending["args_buf"] or "{}")
            except json.JSONDecodeError:
                arguments = {}
            log.info("Tool call executing", tool=pending["name"], arguments=arguments)
            asyncio.create_task(self._execute_and_respond(call_id, pending["name"], arguments))

        elif etype == "error":
            log.error("OpenAI Realtime error", error=event.get("error"))

    # ── Send audio to telephony ──────────────────────────────────────────────

    async def _send_audio_to_telephony(self, audio_b64: str):
        """Send a base64 mulaw audio chunk to Twilio or Plivo via WebSocket."""
        if not self.stream_sid:
            return
        if getattr(self, "_is_plivo", False):
            await self.telephony_ws.send_json({
                "event": "playAudio",
                "media": {
                    "contentType": "audio/x-mulaw;rate=8000",
                    "sampleRate": 8000,
                    "payload": audio_b64,
                },
            })
        else:
            await self.telephony_ws.send_json({
                "event": "media",
                "streamSid": self.stream_sid,
                "media": {"payload": audio_b64},
            })

    async def _clear_telephony_audio(self):
        """Tell the provider to stop playing buffered agent audio immediately."""
        if not self.stream_sid:
            return
        if getattr(self, "_is_plivo", False):
            await self.telephony_ws.send_json({
                "event": "clearAudio",
                "streamId": self.stream_sid,
            })
        else:
            await self.telephony_ws.send_json({
                "event": "clear",
                "streamSid": self.stream_sid,
            })

    async def _backchannel_loop(self):
        """Play short filler audio (mm-hmm, uh-huh…) while the user is speaking."""
        try:
            while self._running:
                await asyncio.sleep(0.5)
                audio = await self.backchannel_engine.maybe_play()
                if audio:
                    await self._send_audio_to_telephony(audio)
        except asyncio.CancelledError:
            pass  # speech ended — normal exit

    # ── Emotion analysis (async, non-blocking) ───────────────────────────────

    async def _analyze_emotion(self, audio_chunks: list[bytes]):
        combined = b"".join(audio_chunks)
        emotion_state = await self.emotion_engine.analyze(audio_bytes=combined, call_id=self.call.id)
        # Update latest call emotion profile (best-effort, not blocking call)
        if emotion_state:
            self.call.emotion_profile = {
                **self.call.emotion_profile,
                f"turn_{self._turn_index}": emotion_state,
            }
            log.debug("Emotion analyzed", turn=self._turn_index, emotion=emotion_state)

    async def _classify_sentiment(self, transcript: str, turn_key: str):
        """Classify caller emotion/intent from the transcript and merge it into the
        call's emotion profile (real values vs the acoustic-only defaults). Powers
        emotion analytics; never blocks the conversation."""
        try:
            result = await self.emotion_engine.sentiment.classify(transcript, call_id=self.call.id)
            if not result:
                return
            existing = dict((self.call.emotion_profile or {}).get(turn_key, {}))
            for k in ("emotion", "intent", "urgency", "engagement", "reasoning"):
                if result.get(k) is not None:
                    existing[k] = result[k]
            self.call.emotion_profile = {**(self.call.emotion_profile or {}), turn_key: existing}
            log.debug("Sentiment classified", turn=turn_key,
                      emotion=result.get("emotion"), intent=result.get("intent"))
        except Exception as exc:
            log.debug("Sentiment classification failed", error=str(exc))

    async def _link_call_to_contact(self, call_sid: str):
        """
        1. If a pre-created outbound Call with this telephony_sid exists, switch to it
           (Twilio strips query params from WebSocket URLs so the placeholder call_id is wrong).
        2. Resolve the caller's phone number and link to a Contact.
        """
        try:
            # Check if there is a pre-created Call matching this CallSid
            from sqlalchemy import select as _select
            result = await self.db.execute(
                _select(Call).where(Call.telephony_sid == call_sid)
            )
            real_call = result.scalars().first()

            if real_call and real_call.id != self.call.id:
                # Switch to the real call and clean up the placeholder.
                # IMPORTANT: migrate any turns already flushed under the placeholder to the
                # real call BEFORE deleting it — otherwise the FK constraint fails, which
                # corrupts the SQLAlchemy session and silently kills extraction/summary saving.
                placeholder_id = self.call.id
                self.call = real_call
                self.call_logger.call_id = real_call.id

                # Update in-memory turn objects so SQLAlchemy flushes them with the real call_id
                from backend.db.models import CallTurn as _CallTurn
                for turn in self.call_logger._turns:
                    if turn.call_id == placeholder_id:
                        turn.call_id = real_call.id

                placeholder = await self.db.get(Call, placeholder_id)
                if placeholder:
                    await self.db.delete(placeholder)
                await self.db.flush()
                log.info("Switched to pre-created outbound call", call_id=real_call.id,
                         turns_migrated=sum(1 for t in self.call_logger._turns if t.call_id == real_call.id))

            if getattr(self, "_is_plivo", False):
                # Plivo: phone already set on the Call record when the call was created
                phone = self.call.phone_number or ""
            else:
                twilio = TwilioHandler()
                twilio_call = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: twilio.client.calls(call_sid).fetch()
                )
                # Inbound: caller is .from_   Outbound: callee is .to
                raw_phone = twilio_call.from_ if self.call.direction == "inbound" else twilio_call.to
                phone = normalize_phone(raw_phone)

            result = await self.db.execute(
                select(Contact).where(
                    Contact.phone_number == phone,
                    Contact.workspace_id == self.call.workspace_id,
                )
            )
            contact = result.scalars().first()
            if not contact:
                contact = Contact(
                    id=str(uuid.uuid4()),
                    phone_number=phone,
                    workspace_id=self.call.workspace_id,
                )
                self.db.add(contact)
                await self.db.flush()

            self.call.phone_number = phone
            self.call.contact_id = contact.id
            await self.db.flush()
            log.info("Call linked to contact", phone=phone, contact_id=contact.id,
                     call_id=self.call.id)

            # Deep Memory Graph: now that we know who we're talking to, inject their
            # memory (past calls, preferences, open items) into the live session so the
            # agent is personalized from its first reply.
            await self._inject_memory_context(contact.id)
        except Exception as exc:
            log.warning("Could not link call to contact", call_sid=call_sid, error=str(exc))

    async def _inject_memory_context(self, contact_id: str):
        """Fetch the contact's memory graph and append it to the agent's live
        instructions via session.update. Runs once, right after the contact is
        resolved and before the agent's first response."""
        try:
            if not (self.agent.config or {}).get("memory_graph", True):
                return
            if not getattr(self, "_base_instructions", None):
                return
            from backend.features.memory_graph.retriever import MemoryRetriever
            context = await MemoryRetriever(self.db).get_context_for_call(contact_id)
            if not context:
                return
            instructions = (
                self._base_instructions
                + "\n\n## Contact Memory (from previous calls — use it to personalize)\n"
                + context
            )
            await self.openai_ws.send(json.dumps({
                "type": "session.update",
                "session": {"type": "realtime", "instructions": instructions},
            }))
            log.info("Memory context injected", contact_id=contact_id, chars=len(context))
        except Exception as exc:
            log.warning("Memory injection failed", contact_id=contact_id, error=str(exc))

    async def _persist_cost(self):
        """Finalize the call record: cost + status via a dedicated fresh session.

        Using self.db would cause a row-level lock deadlock: self.db flushes an
        UPDATE (acquiring the lock) and then the fresh session also tries to UPDATE
        the same row — the fresh session blocks waiting for self.db to commit, but
        self.db.commit() runs in AssistantManager.finally which only executes after
        this method returns. Deadlock. Solution: skip self.db entirely for this row.
        """
        from datetime import datetime as _dt
        from sqlalchemy.orm.attributes import flag_modified
        from backend.db.database import AsyncSessionLocal

        try:
            # Audio input: cached context tokens are billed at the much cheaper cached rate
            # ($0.30/1M vs $10/1M). In a multi-turn call most audio input is cached, so NOT
            # discounting it overstates cost massively.
            audio_in_uncached = max(self._audio_in_tokens - self._audio_in_cached_tokens, 0)
            audio_in_cost = (
                audio_in_uncached              * settings.REALTIME_AUDIO_IN_COST_PER_M        / 1_000_000
                + self._audio_in_cached_tokens * settings.REALTIME_AUDIO_IN_CACHED_COST_PER_M / 1_000_000
            )
            audio_out_cost = self._audio_out_tokens * settings.REALTIME_AUDIO_OUT_COST_PER_M / 1_000_000
            # Cached text tokens are charged at the cached rate ($0.30/1M vs $0.60/1M).
            text_in_uncached = max(self._text_in_tokens - self._text_in_cached_tokens, 0)
            text_in_cost = (
                text_in_uncached           * settings.REALTIME_TEXT_IN_COST_PER_M        / 1_000_000
                + self._text_in_cached_tokens * settings.REALTIME_TEXT_IN_CACHED_COST_PER_M / 1_000_000
            )
            text_out_cost  = self._text_out_tokens  * settings.REALTIME_TEXT_OUT_COST_PER_M  / 1_000_000
            # Whisper transcription of caller speech (whisper-1, billed per minute).
            # Flush any speech segment still open when the call ended.
            if self._speech_seg_start > 0:
                self._transcription_seconds += max(time.monotonic() - self._speech_seg_start, 0.0)
                self._speech_seg_start = 0.0
            transcription_cost = self._transcription_seconds / 60.0 * settings.WHISPER_COST_PER_MIN
            total = audio_in_cost + audio_out_cost + text_in_cost + text_out_cost + transcription_cost

            cost_breakdown = {
                "audio_in_tokens":        self._audio_in_tokens,
                "audio_in_cached_tokens": self._audio_in_cached_tokens,
                "audio_out_tokens":       self._audio_out_tokens,
                "text_in_tokens":        self._text_in_tokens,
                "text_in_cached_tokens": self._text_in_cached_tokens,
                "text_out_tokens":       self._text_out_tokens,
                "transcription_seconds": round(self._transcription_seconds, 1),
                "audio_in_usd":          round(audio_in_cost, 6),
                "audio_out_usd":         round(audio_out_cost, 6),
                "text_in_usd":           round(text_in_cost, 6),
                "text_out_usd":          round(text_out_cost, 6),
                "transcription_usd":     round(transcription_cost, 6),
                "total_usd":             round(total, 6),
            }

            call_id = self.call.id
            _terminal = {"completed", "voicemail", "not_answered", "failed", "cancelled"}

            async with AsyncSessionLocal() as fresh_db:
                real_call = await fresh_db.get(Call, call_id)
                if real_call:
                    real_call.cost_usd = round(total, 6)
                    extra = dict(real_call.extra_data or {})
                    extra["cost_breakdown"] = cost_breakdown
                    real_call.extra_data = extra
                    flag_modified(real_call, "extra_data")

                    if real_call.status not in _terminal:
                        real_call.status = "completed"
                    now = _dt.utcnow()
                    if not real_call.ended_at:
                        real_call.ended_at = now
                    if real_call.started_at and real_call.ended_at and not real_call.duration_seconds:
                        real_call.duration_seconds = int(
                            (real_call.ended_at - real_call.started_at).total_seconds()
                        )
                    await fresh_db.commit()
                    log.info(
                        "Call finalized",
                        call_id=call_id,
                        cost_usd=round(total, 6),
                        status=real_call.status,
                        audio_in=self._audio_in_tokens,
                        audio_out=self._audio_out_tokens,
                        text_in=self._text_in_tokens,
                        text_in_cached=self._text_in_cached_tokens,
                        text_out=self._text_out_tokens,
                    )
        except Exception as exc:
            log.warning("Could not finalize call", call_id=self.call.id, error=str(exc))

    def _is_end_of_call(self, transcript: str) -> bool:
        """Return True if the transcript signals the caller wants to hang up."""
        t = transcript.lower().strip().rstrip("!?.")
        if t in _END_OF_CALL_PHRASES:
            return True
        # Also check if a known multi-word end phrase appears anywhere in a longer sentence
        for phrase in _END_OF_CALL_PHRASES:
            if len(phrase) > 5 and phrase in t:
                return True
        return False

    async def _hangup(self):
        """Hang up the Twilio call gracefully after the farewell response."""
        try:
            from sqlalchemy.orm.attributes import flag_modified
            extra = dict(self.call.extra_data or {})
            extra["ended_by"] = "agent"
            self.call.extra_data = extra
            flag_modified(self.call, "extra_data")
            await self.db.flush()
        except Exception:
            pass
        try:
            await asyncio.sleep(1.5)  # small buffer so audio finishes playing
            handler = TwilioHandler()
            await handler.end_call(self.call_sid)
        except Exception as exc:
            log.exception("Failed to hang up call", call_sid=self.call_sid, error=str(exc))

    async def _hangup_voicemail(self):
        """Hang up immediately — no farewell — when voicemail is detected."""
        try:
            self._running = False
            self.call.status = "voicemail"
            from sqlalchemy.orm.attributes import flag_modified
            extra = dict(self.call.extra_data or {})
            extra["ended_by"] = "agent"
            self.call.extra_data = extra
            flag_modified(self.call, "extra_data")
            await self.db.commit()
            handler = TwilioHandler()
            await handler.end_call(self.call_sid)
            log.info("Voicemail hangup complete", call_sid=self.call_sid)
        except Exception as exc:
            log.exception("Failed to hang up voicemail call", call_sid=self.call_sid, error=str(exc))

    async def _execute_and_respond(self, call_id: str, tool_name: str, arguments: dict):
        """Execute a tool call and send the result back to OpenAI Realtime."""
        # Built-in: knowledge-base retrieval (RAG)
        if tool_name == "query_knowledge_base":
            from backend.knowledge.retrieval import search_knowledge
            kb_ids = (self.agent.config or {}).get("knowledge_base_ids") or []
            query = arguments.get("query", "")
            passages = await search_knowledge(kb_ids, query, call_id=self.call.id)
            result = passages or "No relevant information was found in the knowledge base for that question."
            log.info("KB query", query=query[:80], found=bool(passages))
        elif tool_name == "send_whatsapp":
            from backend.integrations.whatsapp import send_info
            msg = arguments.get("message", "")
            to = self.call.phone_number or ""
            name = getattr(self.call, "caller_name", "") or ""
            business = (self.agent.config or {}).get("business_name") or self.agent.name or ""
            ok = await send_info(to, msg, name, business) if (msg and to) else False
            result = ("Done — I've sent that to your WhatsApp."
                      if ok else "Sorry, I couldn't send the WhatsApp message right now.")
            log.info("WhatsApp tool", to=to, ok=ok)
        else:
            cfg_tools = (self.agent.config or {}).get("tools") or []
            tool = next((t for t in cfg_tools if t.get("name") == tool_name), None)
            # Built-in tools not stored in agent config
            if tool is None and tool_name == "schedule_callback":
                tool = {"type": "schedule_callback", "name": "schedule_callback"}
            # Always use the call's real E.164 number for booking/WhatsApp — the model
            # sometimes passes caller_phone without the country code, which WhatsApp rejects.
            if self.call.phone_number and not str(arguments.get("caller_phone", "")).startswith("+"):
                arguments["caller_phone"] = self.call.phone_number
            result = await execute_tool(tool, arguments, call=self.call) if tool else f"Tool '{tool_name}' not found"
            log.info("Tool result", tool=tool_name, result=result[:100])

        if result == "__END_CALL__":
            self._pending_hangup = True
        elif result.startswith("__TRANSFER__:"):
            phone = result.split(":", 1)[1].strip()
            if phone and self.call_sid:
                try:
                    from backend.config import settings as _s
                    from urllib.parse import quote as _quote
                    handler = TwilioHandler()
                    twiml_url = f"{_s.BASE_URL}/telephony/twilio/transfer-twiml?to={_quote(phone)}&call_id={self.call.id}"
                    await asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda: handler.client.calls(self.call_sid).update(
                            url=twiml_url,
                            method="GET",
                        ),
                    )
                    result = "Transferring you to a human agent now."
                except Exception as exc:
                    log.warning("Transfer failed", error=str(exc))
                    result = "Transfer unavailable at the moment."

        await self.openai_ws.send(json.dumps({
            "type": "conversation.item.create",
            "item": {"type": "function_call_output", "call_id": call_id, "output": result},
        }))
        if not self._response_active:
            self._response_active = True
            await self.openai_ws.send(json.dumps({"type": "response.create"}))
        else:
            self._response_pending = True
