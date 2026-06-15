"""
Gemini Live engine — alternative native-audio pipeline (better Hindi/Gujarati).
================================================================================
Runs ALONGSIDE the OpenAI mini pipeline, which is left completely untouched.
GeminiLiveHandler subclasses OpenAIRealtimeHandler purely to REUSE the
telephony-side helpers (audio send/clear, contact linking, hangup, emotion,
sentiment classification, end-of-call detection). Everything Gemini-specific is
overridden here:

  * connect to the Gemini Live API (google-genai) instead of the OpenAI WS
  * resample audio both ways — Twilio is μ-law 8 kHz, Gemini wants 16 kHz PCM in
    and emits 24 kHz PCM out (OpenAI accepted μ-law natively; Gemini does not)
  * Gemini server-side VAD + barge-in (no manual turn_detection needed)
  * caller transcripts via Whisper on the side (this Live API version returns no
    input transcription), keeping transcript/sentiment/end-of-call features alive
  * cost estimated from audio seconds (the 1.0.0 Live API gives no usage_metadata)

Engine is selected per-agent (agent.config["engine"] == "gemini") or globally via
settings.NATIVE_AUDIO_ENGINE.
"""
import asyncio
import audioop
import base64
import io
import time
import wave

import structlog
from google import genai
from google.genai import types

from backend.config import settings
from backend.features.tools.executor import execute_tool
from backend.telephony.twilio_handler import TwilioHandler
from backend.features.native_audio.openai_realtime import (
    OpenAIRealtimeHandler,
    _VOICEMAIL_PHRASES,
    _WHISPER_HALLUCINATIONS,
    _transcription_language_code,
)

log = structlog.get_logger()

# Gemini Live prebuilt voices. Map common OpenAI voice ids → the nearest Gemini one.
_GEMINI_VOICES = {"Puck", "Charon", "Kore", "Fenrir", "Aoede"}
_VOICE_MAP = {
    "alloy": "Aoede", "echo": "Charon", "shimmer": "Kore", "ash": "Puck",
    "ballad": "Charon", "coral": "Kore", "sage": "Aoede", "verse": "Fenrir",
}

_JSON_TO_GEMINI_TYPE = {
    "object": "OBJECT", "string": "STRING", "number": "NUMBER",
    "integer": "INTEGER", "boolean": "BOOLEAN", "array": "ARRAY",
}


def _to_schema(js: dict):
    """Convert a JSON-schema dict (as used by the OpenAI tools) into a genai Schema."""
    if not isinstance(js, dict):
        return None
    t = _JSON_TO_GEMINI_TYPE.get((js.get("type") or "string").lower(), "STRING")
    kwargs = {"type": t}
    if js.get("description"):
        kwargs["description"] = js["description"]
    if js.get("enum"):
        kwargs["enum"] = [str(e) for e in js["enum"]]
    if t == "OBJECT":
        props = {}
        for k, v in (js.get("properties") or {}).items():
            s = _to_schema(v)
            if s is not None:
                props[k] = s
        if props:
            kwargs["properties"] = props
        if js.get("required"):
            kwargs["required"] = list(js["required"])
    if t == "ARRAY" and js.get("items"):
        it = _to_schema(js["items"])
        if it is not None:
            kwargs["items"] = it
    return types.Schema(**kwargs)


class GeminiLiveHandler(OpenAIRealtimeHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.session = None
        # ratecv resampler states (must persist across chunks)
        self._in_state = None    # caller μ-law/PCM 8k → 16k
        self._out_state = None   # agent PCM 24k → 8k
        # audio-second meters (1.0.0 Live API returns no token usage)
        self._gemini_in_bytes = 0    # PCM16 @16k bytes sent to Gemini
        self._gemini_out_bytes = 0   # PCM16 @24k bytes received from Gemini
        self._user_turn_audio: list[bytes] = []  # μ-law buffer for Whisper transcription
        self._agent_text_buf = ""
        # Paced playback: Gemini generates a whole turn almost instantly, so we must
        # NOT dump it into Twilio at once (it becomes an uninterruptible monologue).
        # Queue μ-law 20ms frames and meter them out at real time; flush on barge-in.
        self._out_queue: asyncio.Queue = asyncio.Queue()
        self._out_buf = b""          # leftover PCM8k bytes between frames
        self._pacer_task = None
        self._greeted = False
        # Local VAD-driven turn-taking (the line has clean echo separation, so our own
        # energy detection is faster + more reliable than Gemini's turn events).
        self._user_speaking = False  # caller currently talking (drives barge-in + recovery)
        self._voice_frames = 0       # consecutive loud frames
        self._silence_frames = 0     # consecutive quiet frames

    # ── Main run loop ────────────────────────────────────────────────────────

    async def run(self):
        if not settings.GOOGLE_API_KEY:
            log.error("Gemini engine selected but GOOGLE_API_KEY is empty")
            return
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        config = self._build_config()
        try:
            async with client.aio.live.connect(
                model=settings.GEMINI_LIVE_MODEL, config=config
            ) as session:
                self.session = session
                log.info("Gemini Live connected", call_id=self.call.id,
                         model=settings.GEMINI_LIVE_MODEL)
                self._pacer_task = asyncio.create_task(self._pace_output())
                # NOTE: no text greeting trigger — mixing a client_content text turn
                # with the realtime audio stream made Gemini interrupt itself and then
                # never reply. The agent responds once the caller speaks first.
                #
                # Use wait(FIRST_COMPLETED), NOT gather: when the caller hangs up the
                # telephony loop ends, but session.receive() would block forever waiting
                # for Gemini — leaving the call stuck "live". So when either side ends,
                # cancel the other and fall through to finalize.
                tel = asyncio.create_task(self._receive_from_telephony())
                gem = asyncio.create_task(self._receive_from_gemini())
                done, pending = await asyncio.wait(
                    {tel, gem}, return_when=asyncio.FIRST_COMPLETED
                )
                self._running = False
                for t in pending:
                    t.cancel()
                    try:
                        await t
                    except asyncio.CancelledError:
                        pass
        except Exception as exc:
            log.exception("Gemini Live session error", call_id=self.call.id, error=str(exc))
        finally:
            self._running = False
            if self._pacer_task:
                self._pacer_task.cancel()
            try:
                await self.db.commit()
            except Exception as exc:
                log.warning("Pre-finalize commit failed", error=str(exc))
            await self._persist_cost()

    # ── Session configuration ────────────────────────────────────────────────

    def _gemini_voice(self) -> str:
        v = self.agent.voice_id or ""
        if v in _GEMINI_VOICES:
            return v
        return _VOICE_MAP.get(v.lower(), "Aoede")

    def _build_config(self) -> types.LiveConnectConfig:
        return types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=self._gemini_voice()
                    )
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=self._build_instructions())]
            ),
            tools=self._build_tools(),
        )

    def _build_instructions(self) -> str:
        """Replicates the OpenAI handler's prompt assembly (kept self-contained so
        the mini code stays untouched). The LANGUAGE RULE is the crux for regional
        quality, so it mirrors the mini exactly."""
        cfg = self.agent.config or {}

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

        languages = cfg.get("languages") or []
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

        kb_block = ""
        if cfg.get("knowledge_base_ids"):
            kb_block = (
                "\n\nKNOWLEDGE BASE RULE: You have access to a company knowledge base via the "
                "query_knowledge_base tool. Whenever the caller asks anything not explicitly covered "
                "in your instructions above (products, pricing, policies, services, company details, etc.), "
                "call query_knowledge_base with their question BEFORE answering. Base your answer on what it "
                "returns. Only say you don't have the information if the tool returns nothing relevant."
            )

        learned = (cfg.get("learned_guidance") or "").strip()
        learned_block = (
            "\n\nLEARNED GUIDANCE (from automated review of your past calls — follow these):\n" + learned
        ) if learned else ""

        return (
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
            "called back later (e.g. 'call me tomorrow', 'call me in an hour'). Do NOT schedule a callback just "
            "because the caller is hesitant, silent, or you misheard. NEVER invent or assume a time the caller did "
            "not say, and NEVER default to '2 minutes'. If the caller wants a callback but did not give a time, ASK "
            "'When would be a good time to call you back?' and use only the time they state. Only once you have an "
            "explicit time, call schedule_callback with relative_minutes (durations, e.g. 'in an hour' → 60) or "
            "datetime_iso (specific times). Then give ONE short confirmation in the caller's language and say goodbye."
            "\n\nAPPOINTMENT RULE: To book, schedule, reschedule, or change an appointment or MEETING, you MUST use "
            "your calendar tool — NEVER use schedule_callback for this. Step 1: call the calendar tool with "
            "action='check_availability' for the requested date. Step 2: offer ONLY the returned slots. Step 3: once "
            "the caller confirms an AVAILABLE slot, call the calendar tool with action='book' and that exact "
            "datetime_iso, then confirm briefly. schedule_callback only arranges for YOU to phone the caller again — "
            "it does NOT create a calendar appointment."
        )

    def _build_tools(self):
        from backend.features.tools.executor import CALENDAR_BOOKING_PARAMS, SCHEDULE_CALLBACK_PARAMS
        cfg = self.agent.config or {}
        decls = []
        for t in (cfg.get("tools") or []):
            if not t.get("enabled", True):
                continue
            params = (
                CALENDAR_BOOKING_PARAMS if t.get("type") == "calendar_booking"
                else (t.get("parameters") or {"type": "object", "properties": {}})
            )
            decls.append(types.FunctionDeclaration(
                name=t["name"], description=t.get("description", ""),
                parameters=_to_schema(params),
            ))
        decls.append(types.FunctionDeclaration(
            name="schedule_callback",
            description=(
                "Schedule an outbound callback ONLY when the caller explicitly asked to be called back at a time "
                "they themselves stated. Never guess or default to a time; the caller's number is already known."
            ),
            parameters=_to_schema(SCHEDULE_CALLBACK_PARAMS),
        ))
        from backend.integrations.whatsapp import is_configured as _wa_configured
        if _wa_configured():
            decls.append(types.FunctionDeclaration(
                name="send_whatsapp",
                description=(
                    "Send a WhatsApp message to the caller's own phone with information they asked for — details, "
                    "a link, an address, pricing, a summary, next steps. Use whenever the caller asks you to send, "
                    "share, or text them something on WhatsApp. Do NOT ask for their number. Put the full text in 'message'."
                ),
                parameters=_to_schema({
                    "type": "object",
                    "properties": {"message": {"type": "string", "description": "The exact text to send to the caller on WhatsApp."}},
                    "required": ["message"],
                }),
            ))
        if cfg.get("knowledge_base_ids"):
            decls.append(types.FunctionDeclaration(
                name="query_knowledge_base",
                description="Look up company information (products, pricing, policies, services) before answering.",
                parameters=_to_schema({
                    "type": "object",
                    "properties": {"query": {"type": "string", "description": "The caller's question or key info to look up."}},
                    "required": ["query"],
                }),
            ))
        return [types.Tool(function_declarations=decls)] if decls else None

    # Gemini Live (1.0.0) cannot update system_instruction mid-session, so contact
    # memory injection is skipped here (the OpenAI engine still does it). Tracked as
    # a follow-up; the core conversation is unaffected.
    async def _inject_memory_context(self, contact_id: str):
        log.info("Gemini engine: skipping mid-session memory injection", contact_id=contact_id)

    # ── Telephony → Gemini ───────────────────────────────────────────────────

    async def _receive_from_telephony(self):
        try:
            async for message in self.telephony_ws.iter_text():
                if not self._running:
                    break
                import json
                data = json.loads(message)
                event = data.get("event")

                if event == "start":
                    start = data.get("start", {})
                    self._is_plivo = "streamId" in start
                    self.stream_sid = start.get("streamSid") or start.get("streamId")
                    self.call_sid = start.get("callSid") or start.get("callUUID")
                    log.info("Telephony stream started (gemini)", stream_sid=self.stream_sid,
                             call_sid=self.call_sid, provider="plivo" if self._is_plivo else "twilio")
                    if self.call_sid:
                        asyncio.create_task(self._link_call_to_contact(self.call_sid))

                elif event == "media":
                    raw = base64.b64decode(data["media"]["payload"])
                    self._current_user_audio.append(raw)   # emotion analysis buffer
                    self._user_turn_audio.append(raw)       # Whisper transcription buffer
                    pcm8 = audioop.ulaw2lin(raw, 2)

                    # Fast LOCAL barge-in — only stops PLAYBACK so the agent goes quiet
                    # instantly when the caller talks over it. We do NOT change what we send
                    # to Gemini: the audio below always flows, so Gemini keeps managing its
                    # own turns + native interruption (that's what stays stable across turns).
                    if self._agent_audible() and audioop.rms(pcm8, 2) >= settings.GEMINI_BARGE_RMS:
                        self._voice_frames += 1
                        if self._voice_frames >= settings.GEMINI_BARGE_FRAMES:
                            self._voice_frames = 0
                            self._agent_speaking = False
                            self._flush_agent_audio()
                            await self._clear_telephony_audio()
                            log.info("Barge-in: stopped agent playback", call_id=self.call.id)
                    else:
                        self._voice_frames = max(0, self._voice_frames - 1)

                    # ALWAYS forward to Gemini (echo is ~RMS 8 — negligible, so it won't
                    # self-interrupt; real speech is loud and triggers Gemini's own VAD).
                    pcm16k, self._in_state = audioop.ratecv(pcm8, 2, 1, 8000, 16000, self._in_state)
                    self._gemini_in_bytes += len(pcm16k)
                    try:
                        await self.session.send(input=types.LiveClientRealtimeInput(
                            media_chunks=[types.Blob(data=pcm16k, mime_type="audio/pcm;rate=16000")]
                        ))
                    except Exception as exc:
                        log.warning("Gemini audio send failed", error=str(exc), call_id=self.call.id)

                elif event == "stop":
                    self._running = False
                    try:
                        from sqlalchemy.orm.attributes import flag_modified
                        extra = dict(self.call.extra_data or {})
                        extra["ended_by"] = "caller"
                        self.call.extra_data = extra
                        flag_modified(self.call, "extra_data")
                        await self.db.flush()
                    except Exception:
                        pass
                    break
        except Exception as exc:
            log.exception("Error receiving from telephony (gemini)", error=str(exc))
            self._running = False

    # ── Gemini → Telephony ───────────────────────────────────────────────────

    async def _receive_from_gemini(self):
        # CRITICAL: session.receive() yields messages for ONE turn then the generator
        # ends. We must re-call it for each subsequent turn, otherwise the agent speaks
        # exactly once and then goes silent. The outer loop keeps the conversation alive.
        try:
            while self._running:
                got = False
                async for msg in self.session.receive():
                    got = True
                    if not self._running:
                        break
                    await self._handle_gemini_message(msg)
                log.info("Gemini turn stream ended — re-subscribing", got_messages=got,
                         call_id=self.call.id)
                if not got:
                    await asyncio.sleep(0.1)  # avoid a tight spin if it returns empty
        except Exception as exc:
            log.exception("Error receiving from gemini", error=str(exc))
            self._running = False

    async def _handle_gemini_message(self, msg):
        if getattr(msg, "setup_complete", None) is not None:
            log.info("Gemini Live session ready", call_id=self.call.id)
            return

        sc = getattr(msg, "server_content", None)
        if sc is not None:
            if getattr(sc, "interrupted", None):
                # Gemini's own barge signal (backup to our local VAD).
                self._agent_speaking = False
                self._flush_agent_audio()
                await self._clear_telephony_audio()

            mt = getattr(sc, "model_turn", None)
            if mt and getattr(mt, "parts", None):
                for part in mt.parts:
                    inline = getattr(part, "inline_data", None)
                    if inline is not None and getattr(inline, "data", None):
                        if not self._agent_speaking:
                            # New agent turn — drop any stale leftover audio first.
                            self._flush_agent_audio()
                            await self._clear_telephony_audio()
                            self._agent_speaking = True
                            self._response_start_time = time.monotonic()
                            self._flush_user_turn()  # caller's turn ended → transcribe it
                            log.info("Agent turn started (gemini)", call_id=self.call.id)
                        audio = inline.data
                        if isinstance(audio, str):
                            audio = base64.b64decode(audio)
                        self._gemini_out_bytes += len(audio)
                        self._enqueue_agent_audio(audio)
                    txt = getattr(part, "text", None)
                    if txt:
                        self._agent_text_buf += txt

            if getattr(sc, "turn_complete", None):
                await self._on_agent_turn_complete()

        tc = getattr(msg, "tool_call", None)
        if tc and getattr(tc, "function_calls", None):
            self._flush_user_turn()
            for fc in tc.function_calls:
                asyncio.create_task(self._handle_tool_call(fc))

    def _enqueue_agent_audio(self, pcm24k: bytes):
        """PCM16 24k (Gemini) → PCM16 8k → μ-law, framed into 20ms chunks and queued
        for paced playback. Gemini emits a whole turn at once; the pacer meters it out."""
        try:
            pcm8k, self._out_state = audioop.ratecv(pcm24k, 2, 1, 24000, 8000, self._out_state)
            self._out_buf += pcm8k
            # 20ms @ 8kHz = 160 samples = 320 bytes PCM16 → 160 bytes μ-law
            while len(self._out_buf) >= 320:
                chunk, self._out_buf = self._out_buf[:320], self._out_buf[320:]
                self._out_queue.put_nowait(audioop.lin2ulaw(chunk, 2))
        except Exception as exc:
            log.debug("Gemini audio downsample failed", error=str(exc))

    async def _pace_output(self):
        """Send queued μ-law frames to telephony at real time (one 20ms frame / 20ms)
        so the agent's speech plays naturally AND can be cut off mid-sentence."""
        next_t = time.monotonic()
        try:
            while self._running:
                frame = await self._out_queue.get()
                if frame is None:  # flush sentinel
                    next_t = time.monotonic()
                    continue
                await self._send_audio_to_telephony(base64.b64encode(frame).decode())
                next_t += 0.02
                delay = next_t - time.monotonic()
                if delay > 0:
                    await asyncio.sleep(delay)
                elif delay < -0.5:
                    next_t = time.monotonic()  # fell far behind — resync
        except asyncio.CancelledError:
            pass

    def _agent_audible(self) -> bool:
        """True while the agent is generating OR queued audio is still playing out —
        i.e. the caller is currently hearing the agent (so expect echo on the line)."""
        return self._agent_speaking or not self._out_queue.empty()

    def _flush_agent_audio(self):
        """Drop all queued + buffered agent audio (barge-in / new turn replaces old)."""
        self._out_buf = b""
        try:
            while True:
                self._out_queue.get_nowait()
        except asyncio.QueueEmpty:
            pass

    async def _on_agent_turn_complete(self):
        text = self._agent_text_buf.strip()
        self._agent_text_buf = ""
        self._agent_speaking = False
        if text:
            self._turn_index += 1
            latency = int((time.monotonic() - self._response_start_time) * 1000) if self._response_start_time else None
            await self.call_logger.log_turn(
                turn_index=self._turn_index, role="agent", transcript=text, latency_ms=latency,
            )
        if self._pending_hangup and self.call_sid:
            log.info("Hanging up after farewell (gemini)", call_sid=self.call_sid)
            asyncio.create_task(self._drain_then_hangup())

    async def _trigger_greeting(self):
        """Make the agent speak first so there's no dead air at call start."""
        try:
            await self.session.send(
                input="The call has just connected. Greet the caller now and begin the "
                      "conversation in the configured language.",
                end_of_turn=True,
            )
            self._greeted = True
        except Exception as exc:
            log.debug("Gemini greeting trigger failed", error=str(exc))

    async def _drain_then_hangup(self):
        """Let the queued farewell audio finish playing before ending the call."""
        for _ in range(250):  # up to ~5s
            if self._out_queue.empty():
                break
            await asyncio.sleep(0.02)
        await asyncio.sleep(0.3)
        await self._hangup()

    # ── Caller transcription (Whisper side-channel) ──────────────────────────

    def _flush_user_turn(self):
        if not self._user_turn_audio:
            return
        mulaw = b"".join(self._user_turn_audio)
        self._user_turn_audio = []
        # Buffer used for emotion analysis too
        if self._current_user_audio:
            asyncio.create_task(self._analyze_emotion(self._current_user_audio.copy()))
        self._current_user_audio = []
        asyncio.create_task(self._transcribe_user_turn(mulaw))

    async def _transcribe_user_turn(self, mulaw: bytes):
        if len(mulaw) < 1600:  # < ~0.2s — ignore noise blips
            return
        try:
            self._transcription_seconds += len(mulaw) / 8000.0
            pcm = audioop.ulaw2lin(mulaw, 2)
            buf = io.BytesIO()
            w = wave.open(buf, "wb")
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(8000)
            w.writeframes(pcm)
            w.close()
            buf.seek(0)
            data = buf.read()

            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            langs = (self.agent.config or {}).get("languages") or []
            code = _transcription_language_code(langs[0]) if len(langs) == 1 else None
            kwargs = {"model": "whisper-1", "file": ("turn.wav", data, "audio/wav")}
            if code and code != "en":
                kwargs["language"] = code
            tr = await client.audio.transcriptions.create(**kwargs)
            await self._on_user_transcript((tr.text or "").strip())
        except Exception as exc:
            log.debug("Gemini caller transcription failed", error=str(exc))

    async def _on_user_transcript(self, transcript: str):
        if not transcript or len(transcript) < 3:
            return
        t_norm = transcript.lower().strip().rstrip("!?.,")
        if t_norm in _WHISPER_HALLUCINATIONS:
            return
        if t_norm.replace(",", "").replace("  ", " ") in _WHISPER_HALLUCINATIONS:
            return
        self._turn_index += 1
        await self.call_logger.log_turn(
            turn_index=self._turn_index, role="user", transcript=transcript, latency_ms=None,
        )
        if (self.agent.config or {}).get("emotion_detection", True):
            asyncio.create_task(self._classify_sentiment(transcript, f"turn_{self._turn_index}"))
        t_lower = " ".join(transcript.lower().split())
        if any(phrase in t_lower for phrase in _VOICEMAIL_PHRASES):
            log.info("Voicemail detected via transcript (gemini) — hanging up", transcript=transcript)
            asyncio.create_task(self._hangup_voicemail())
            return
        if self._is_end_of_call(transcript):
            self._pending_hangup = True
            log.info("End-of-call intent detected (gemini)", transcript=transcript)

    # ── Tool execution ───────────────────────────────────────────────────────

    async def _handle_tool_call(self, fc):
        name = getattr(fc, "name", "")
        args = dict(getattr(fc, "args", None) or {})
        # Always use the call's real E.164 number for booking/WhatsApp.
        if self.call.phone_number and not str(args.get("caller_phone", "")).startswith("+"):
            args["caller_phone"] = self.call.phone_number
        log.info("Tool call executing (gemini)", tool=name, arguments=args)
        result = await self._run_tool(name, args)

        if result == "__END_CALL__":
            self._pending_hangup = True
            result = "Ending the call now."
        elif result.startswith("__TRANSFER__:"):
            phone = result.split(":", 1)[1].strip()
            result = await self._do_transfer(phone)

        try:
            await self.session.send(input=types.LiveClientToolResponse(
                function_responses=[types.FunctionResponse(
                    id=getattr(fc, "id", None), name=name, response={"result": result},
                )]
            ))
        except Exception as exc:
            log.warning("Gemini tool response failed", tool=name, error=str(exc))

    async def _run_tool(self, name: str, args: dict) -> str:
        if name == "query_knowledge_base":
            from backend.knowledge.retrieval import search_knowledge
            kb_ids = (self.agent.config or {}).get("knowledge_base_ids") or []
            passages = await search_knowledge(kb_ids, args.get("query", ""), call_id=self.call.id)
            return passages or "No relevant information was found in the knowledge base for that question."
        if name == "send_whatsapp":
            from backend.integrations.whatsapp import send_info
            msg = args.get("message", "")
            to = self.call.phone_number or ""
            nm = getattr(self.call, "caller_name", "") or ""
            biz = (self.agent.config or {}).get("business_name") or self.agent.name or ""
            ok = await send_info(to, msg, nm, biz) if (msg and to) else False
            return ("Done — I've sent that to your WhatsApp." if ok
                    else "Sorry, I couldn't send the WhatsApp message right now.")
        cfg_tools = (self.agent.config or {}).get("tools") or []
        tool = next((t for t in cfg_tools if t.get("name") == name), None)
        if tool is None and name == "schedule_callback":
            tool = {"type": "schedule_callback", "name": "schedule_callback"}
        if not tool:
            return f"Tool '{name}' not found"
        return await execute_tool(tool, args, call=self.call)

    async def _do_transfer(self, phone: str) -> str:
        if not (phone and self.call_sid):
            return "Transfer unavailable at the moment."
        try:
            from urllib.parse import quote as _quote
            handler = TwilioHandler()
            twiml_url = f"{settings.BASE_URL}/telephony/twilio/transfer-twiml?to={_quote(phone)}&call_id={self.call.id}"
            await asyncio.get_event_loop().run_in_executor(
                None, lambda: handler.client.calls(self.call_sid).update(url=twiml_url, method="GET"),
            )
            return "Transferring you to a human agent now."
        except Exception as exc:
            log.warning("Transfer failed (gemini)", error=str(exc))
            return "Transfer unavailable at the moment."

    # ── Cost (estimated from audio seconds) ──────────────────────────────────

    async def _persist_cost(self):
        from datetime import datetime as _dt
        from sqlalchemy.orm.attributes import flag_modified
        from backend.db.database import AsyncSessionLocal
        try:
            tps = settings.GEMINI_AUDIO_TOKENS_PER_SEC
            in_secs = self._gemini_in_bytes / 32000.0    # 16kHz * 2 bytes
            out_secs = self._gemini_out_bytes / 48000.0   # 24kHz * 2 bytes
            audio_in_tokens = int(in_secs * tps)
            audio_out_tokens = int(out_secs * tps)
            audio_in_cost = audio_in_tokens * settings.GEMINI_AUDIO_IN_COST_PER_M / 1_000_000
            audio_out_cost = audio_out_tokens * settings.GEMINI_AUDIO_OUT_COST_PER_M / 1_000_000
            transcription_cost = self._transcription_seconds / 60.0 * settings.WHISPER_COST_PER_MIN
            total = audio_in_cost + audio_out_cost + transcription_cost

            cost_breakdown = {
                "engine": "gemini",
                "estimated": True,
                "model": settings.GEMINI_LIVE_MODEL,
                "audio_in_seconds": round(in_secs, 1),
                "audio_out_seconds": round(out_secs, 1),
                "audio_in_tokens": audio_in_tokens,
                "audio_out_tokens": audio_out_tokens,
                "transcription_seconds": round(self._transcription_seconds, 1),
                "audio_in_usd": round(audio_in_cost, 6),
                "audio_out_usd": round(audio_out_cost, 6),
                "transcription_usd": round(transcription_cost, 6),
                "total_usd": round(total, 6),
            }
            call_id = self.call.id
            _terminal = {"completed", "voicemail", "not_answered", "failed", "cancelled"}
            async with AsyncSessionLocal() as fresh_db:
                real_call = await fresh_db.get(type(self.call), call_id)
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
                    log.info("Call finalized (gemini)", call_id=call_id, cost_usd=round(total, 6),
                             status=real_call.status, audio_in_s=round(in_secs, 1), audio_out_s=round(out_secs, 1))
        except Exception as exc:
            log.warning("Could not finalize call (gemini)", call_id=self.call.id, error=str(exc))
