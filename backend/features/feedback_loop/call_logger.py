"""
CallLogger — records every turn of a call to the database.
Triggers the auto-evaluation pipeline after call ends.
"""
import uuid
from datetime import datetime
from typing import Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import CallTurn

log = structlog.get_logger()


def _apply_whatsapp_vars(text: str, cfg: dict, contact) -> str:
    """Substitute [Placeholder] tokens in the WhatsApp message — agent-defined variables
    plus the caller's name for [Customer Name]/[Name]/etc. Mirrors task_manager._apply_variables."""
    import re
    if not text:
        return text
    raw = (cfg or {}).get("variables") or []
    items = raw.items() if isinstance(raw, dict) else [
        (d.get("name"), d.get("value")) for d in raw if isinstance(d, dict)
    ]
    variables = {str(k).strip().lower(): str(v) for k, v in items if k and str(v).strip()}
    cust = (contact.name if (contact and getattr(contact, "name", None)) else "").strip()
    for key in ("customer name", "lead name", "name", "customer", "client name"):
        variables.setdefault(key, cust)

    def repl(m):
        inner = m.group(1).strip().lower()
        if inner in variables:
            val = variables[inner]
            if val:
                return val
            if any(w in inner for w in ("name", "customer", "client")):
                return "there"
        return m.group(0)

    return re.sub(r"\[([^\[\]]+)\]", repl, text)


class CallLogger:
    def __init__(self, db: AsyncSession, call_id: str):
        self.db = db
        self.call_id = call_id
        self._turns: list[CallTurn] = []

    async def log_turn(
        self,
        turn_index: int,
        role: str,                    # "user" | "agent"
        transcript: Optional[str] = None,
        emotion_state: Optional[dict] = None,
        paralinguistic: Optional[dict] = None,
        sentiment: Optional[str] = None,
        intent: Optional[str] = None,
        latency_ms: Optional[int] = None,
        tokens_used: Optional[int] = None,
        from_cache: bool = False,
    ):
        turn = CallTurn(
            id=str(uuid.uuid4()),
            call_id=self.call_id,
            turn_index=turn_index,
            role=role,
            transcript=transcript,
            emotion_state=emotion_state or {},
            paralinguistic=paralinguistic or {},
            sentiment=sentiment,
            intent=intent,
            latency_ms=latency_ms,
            tokens_used=tokens_used,
            from_prediction_cache=from_cache,
            created_at=datetime.utcnow(),
        )
        self.db.add(turn)
        self._turns.append(turn)

        try:
            await self.db.flush()
        except Exception as exc:
            log.warning("CallLogger flush failed", error=str(exc))

    async def _maybe_send_whatsapp(self):
        """Auto-send the agent's WhatsApp message after the call, from the customer's own
        number (per-workspace api_key). No-op unless enabled + connected + message set."""
        from backend.db.models import Call, Agent, Workspace, Contact
        from backend.integrations import whatsapp as wa
        if not wa.system_configured():
            return
        call = await self.db.get(Call, self.call_id)
        if not call or not call.phone_number or not call.workspace_id or not call.agent_id:
            return
        agent = await self.db.get(Agent, call.agent_id)
        cfg = (agent.config if agent else {}) or {}
        if not cfg.get("whatsapp_enabled"):
            return
        message = (cfg.get("whatsapp_message") or "").strip()
        if not message:
            return
        ws = await self.db.get(Workspace, call.workspace_id)
        api_key = getattr(ws, "whatsapp_api_key", None) if ws else None
        if not api_key:
            return
        contact = await self.db.get(Contact, call.contact_id) if call.contact_id else None
        text = _apply_whatsapp_vars(message, cfg, contact)
        ok = await wa.send_message(api_key=api_key, to=call.phone_number, text=text)
        log.info("WhatsApp after-call send", call_id=self.call_id, to=call.phone_number, ok=ok)

    async def finalize(self):
        """Called when call ends. Runs evaluation + memory extraction before the DB session closes."""
        log.info("Call finalize started", call_id=self.call_id, turn_count=len(self._turns))
        await self.db.flush()
        if self._turns:
            from backend.features.feedback_loop.evaluator import CallEvaluator
            evaluator = CallEvaluator(db=self.db, call_id=self.call_id)
            try:
                await evaluator.evaluate_call(self._turns)
            except Exception as exc:
                log.warning("Call evaluation failed", call_id=self.call_id, error=str(exc))

            # Commit self.db to release the PG row lock acquired by evaluator's flush.
            # Without this, the extraction fresh session deadlocks: it tries to UPDATE
            # the same call row that self.db has locked (flush sends the SQL, PG locks
            # the row, but the lock isn't released until commit).
            try:
                await self.db.commit()
                log.info("Post-evaluation commit done", call_id=self.call_id)
            except Exception as exc:
                log.warning("Post-evaluation commit failed", call_id=self.call_id, error=str(exc))

        # Extract memories — needs contact_id from the call record
        try:
            from backend.db.models import Call
            from backend.features.memory_graph.extractor import MemoryExtractor
            call = await self.db.get(Call, self.call_id)
            if call and call.contact_id:
                extractor = MemoryExtractor(db=self.db)
                await extractor.extract_and_store(
                    call_id=self.call_id,
                    contact_id=call.contact_id,
                )
        except Exception as exc:
            log.warning("Memory extraction failed", call_id=self.call_id, error=str(exc))

        # Extract structured data: summary, appointment, key info
        if self._turns:
            try:
                await self._extract_call_data()
            except Exception as exc:
                log.exception("Call data extraction failed", call_id=self.call_id, error=str(exc))

        # WhatsApp: auto-send the agent's configured message after the call (if the agent
        # has it enabled AND the workspace connected WhatsApp). Sends from the customer's
        # own number via their per-workspace api_key.
        try:
            await self._maybe_send_whatsapp()
        except Exception as exc:
            log.warning("WhatsApp after-call send failed", call_id=self.call_id, error=str(exc))

        # Dispatch outbound webhook events
        try:
            from backend.db.models import Call
            from backend.webhooks.dispatcher import dispatch
            call = await self.db.get(Call, self.call_id)
            if call and call.workspace_id:
                status = call.status or "completed"
                event = "call.failed" if status == "failed" else "call.completed"
                await dispatch(
                    workspace_id=call.workspace_id,
                    event_type=event,
                    payload={
                        "call_id": call.id,
                        "phone_number": call.phone_number,
                        "direction": call.direction,
                        "status": status,
                        "duration_seconds": call.duration_seconds,
                        "pipeline_mode": call.pipeline_mode,
                        "summary": call.summary,
                        "sentiment_score": call.sentiment_score,
                        "agent_id": call.agent_id,
                        "contact_id": call.contact_id,
                        "created_at": call.created_at.isoformat() if call.created_at else None,
                    },
                )
        except Exception as exc:
            log.warning("Webhook dispatch failed", call_id=self.call_id, error=str(exc))

        # Fold accumulated auxiliary AI costs into the call's total. Runs last so
        # all during-call (speculation/sentiment/backchannel/KB) and post-call
        # (evaluation/extraction/summary) costs are already recorded.
        await self._persist_auxiliary_cost()

    async def _persist_auxiliary_cost(self):
        """Add auxiliary model costs to the call's cost_usd + record the breakdown.

        Written through self.db — the SAME session that AssistantManager.finally
        commits last. A previous version used a separate session, but that session's
        write to extra_data got clobbered when self.db committed afterward with a
        stale snapshot of the row. Using self.db makes it the single authoritative
        writer, so the auxiliary breakdown can't be overwritten.
        """
        from backend.core import cost_meter
        from backend.db.models import Call
        from sqlalchemy.orm.attributes import flag_modified

        aux = cost_meter.pop(self.call_id)
        aux_total = round(float(aux.get("total_usd", 0.0)), 6)
        if aux_total <= 0:
            return
        try:
            call = await self.db.get(Call, self.call_id)
            if not call:
                return
            # Pull the latest committed values (realtime breakdown + appointment data
            # written by earlier fresh sessions) before merging the auxiliary in.
            await self.db.refresh(call)
            realtime_usd = round(call.cost_usd or 0.0, 6)
            extra = dict(call.extra_data or {})
            cb = dict(extra.get("cost_breakdown") or {})
            cb["realtime_usd"] = realtime_usd
            cb["auxiliary_usd"] = aux_total
            cb["auxiliary"] = aux.get("components", {})
            cb["grand_total_usd"] = round(realtime_usd + aux_total, 6)
            extra["cost_breakdown"] = cb
            call.extra_data = extra
            call.cost_usd = round(realtime_usd + aux_total, 6)
            flag_modified(call, "extra_data")
            await self.db.commit()
            log.info("Auxiliary cost recorded", call_id=self.call_id,
                     auxiliary_usd=aux_total, grand_total_usd=realtime_usd + aux_total)
        except Exception as exc:
            log.warning("Could not persist auxiliary cost", call_id=self.call_id, error=str(exc))

    async def _extract_call_data(self):
        """Use GPT to extract summary, appointment details, and key info from the transcript."""
        from backend.db.database import AsyncSessionLocal

        all_turns = len(self._turns)
        transcript_lines = [
            f"{'Caller' if t.role == 'user' else 'Agent'}: {t.transcript}"
            for t in self._turns if t.transcript
        ]
        log.info("Call data extraction started",
                 call_id=self.call_id,
                 total_turns=all_turns,
                 turns_with_transcript=len(transcript_lines))

        if not transcript_lines:
            log.warning("No turn transcripts available — skipping extraction", call_id=self.call_id)
            return
        transcript_text = "\n".join(transcript_lines)

        # Use a fresh session so any stale/bad session state from the call never blocks saving.
        async with AsyncSessionLocal() as fresh_db:
            await self._save_extracted_data(fresh_db, transcript_text)

    async def _save_extracted_data(self, db, transcript_text: str):
        """Run GPT extraction and save results using the provided DB session."""
        import json
        from openai import AsyncOpenAI
        from backend.config import settings
        from backend.db.models import Call
        from sqlalchemy.orm.attributes import flag_modified

        # Load call to get date for relative date resolution
        call_for_date = await db.get(Call, self.call_id)
        if not call_for_date:
            log.warning("Call not found in fresh session for extraction",
                        call_id=self.call_id)
            return
        call_date_str = ""
        if call_for_date.created_at:
            call_date_str = call_for_date.created_at.strftime("%A, %d %B %Y")

        log.info("Running GPT extraction", call_id=self.call_id,
                 call_date=call_date_str,
                 transcript_chars=len(transcript_text))

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model="gpt-4.1-mini",
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a call analysis assistant. Given a call transcript, extract structured data and respond ONLY with valid JSON.\n"
                        "Return this exact structure:\n"
                        '{{"summary": "2-3 sentence summary of the call", '
                        '"appointment_booked": true or false, '
                        '"appointment_datetime": "ISO datetime string or null", '
                        '"caller_email": "email address if clearly stated or null", '
                        '"caller_name": "name if mentioned or null", '
                        '"caller_interest": "high/medium/low/not_interested", '
                        '"key_points": ["list of up to 5 key points from the call"], '
                        '"next_steps": "what was agreed next, or null", '
                        '"opt_out": true or false, '
                        '"language_used": "primary language of the conversation"}}\n\n'
                        "RULES:\n"
                        "- Set opt_out to true ONLY if the caller explicitly asked not to be contacted again — "
                        "e.g. 'remove me', 'don't call me', 'stop calling', 'unsubscribe', 'take me off your list'. "
                        "Otherwise set it to false.\n"
                        "- Set appointment_booked to true if the caller expressed a clear intent to book an appointment "
                        "AND the agent acknowledged, agreed, or confirmed it — even if a specific date/time was not set. "
                        "Set it to false only if no appointment was discussed or the caller declined.\n"
                        "- Set appointment_datetime ONLY if a specific date AND time were both clearly stated in the conversation. "
                        "If only a date was mentioned (no time), or only a time (no date), or neither, set appointment_datetime to null. "
                        "Never guess, infer, or default to midnight/00:00. If uncertain, use null.\n"
                        "- caller_email: if the caller stated an email address (often spoken, e.g. 'name at gmail dot com' "
                        "or 'name dot surname at gmail dot com'), normalize it to standard form like name@gmail.com "
                        "(convert spoken 'at'->@, 'dot'->., remove spaces). If no email was clearly given, set it to null.\n"
                        "- TIMEZONE: All times in this conversation are in Indian Standard Time (IST, UTC+05:30). "
                        "Always include the +05:30 offset in appointment_datetime, e.g. '2026-05-15T10:00:00+05:30'.\n"
                        "- RELATIVE DATES: The call took place on {call_date}. "
                        "Resolve relative expressions like 'tomorrow', 'next Monday', 'day after tomorrow' using this date as today. "
                        "Do NOT use any other date as the reference point."
                    ).format(call_date=call_date_str or "an unknown date"),
                },
                {"role": "user", "content": f"Transcript:\n{transcript_text}"},
            ],
        )

        try:
            from backend.core import cost_meter
            cost_meter.record_mini(self.call_id, "summary_extraction", resp.usage)
        except Exception:
            pass

        raw = resp.choices[0].message.content or "{}"
        log.info("GPT extraction response received", call_id=self.call_id, raw_length=len(raw))
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("GPT returned invalid JSON", call_id=self.call_id, raw=raw[:200])
            return

        if not isinstance(data, dict):
            log.warning("GPT extraction returned non-dict JSON", call_id=self.call_id,
                        type=type(data).__name__, raw=raw[:200])
            return

        # call_for_date is the same object in the same session — reuse it
        call = call_for_date
        if data.get("summary"):
            call.summary = data["summary"]

        extra = dict(call.extra_data or {})
        extra["appointment_booked"] = data.get("appointment_booked", False)
        extra["appointment_datetime"] = data.get("appointment_datetime")
        extra["caller_email"] = data.get("caller_email")
        extra["caller_name"] = data.get("caller_name")
        extra["caller_interest"] = data.get("caller_interest")
        extra["key_points"] = data.get("key_points", [])
        extra["next_steps"] = data.get("next_steps")
        extra["language_used"] = data.get("language_used")
        extra["opt_out"] = bool(data.get("opt_out"))
        call.extra_data = extra
        flag_modified(call, "extra_data")
        # Caller asked not to be contacted again → add to the Do-Not-Call list.
        if extra["opt_out"]:
            try:
                from backend.core.compliance import add_to_dnc
                await add_to_dnc(db, call.workspace_id, call.phone_number,
                                 reason="Caller opted out during call", source="opt_out")
            except Exception as exc:
                log.warning("Could not DNC opted-out caller", call_id=self.call_id, error=str(exc))
        await db.commit()
        log.info("Call data extracted and committed", call_id=self.call_id,
                 summary_len=len(data.get("summary") or ""),
                 appointment=extra.get("appointment_booked"),
                 language=extra.get("language_used"),
                 interest=extra.get("caller_interest"))

        # SAFETY NET: if an appointment was agreed but the agent never actually fired a
        # `book` tool call during the call (the model sometimes only narrates it),
        # book it server-side now so the caller still gets the invite + email.
        try:
            await self._auto_book_if_needed(db, call, data, extra)
        except Exception as exc:
            log.warning("Post-call auto-book failed", call_id=self.call_id, error=str(exc))

        # Safety: also write extracted fields into the old WebSocket session so
        # AssistantManager's final commit cannot overwrite them with stale None values.
        try:
            old_call = await self.db.get(Call, self.call_id)
            if old_call:
                if data.get("summary"):
                    old_call.summary = data["summary"]
                old_extra = dict(old_call.extra_data or {})
                old_extra.update(extra)
                old_call.extra_data = old_extra
                flag_modified(old_call, "extra_data")
        except Exception as merge_exc:
            log.warning("Could not merge extracted data into main session",
                        call_id=self.call_id, error=str(merge_exc))

    async def _auto_book_if_needed(self, db, call, data, extra):
        """Deterministic fallback for when the model agreed to an appointment but never
        actually fired the `book` tool call during the call (native-audio models
        sometimes only narrate it). Books server-side so the caller still gets the
        calendar invite + confirmation email. Provider-agnostic: runs for Twilio and
        Plivo alike (shared post-call path). Idempotent — skips if a real booking fired."""
        from backend.features.tools import booking_state
        from backend.features.tools.executor import execute_tool
        from backend.db.models import Agent
        from sqlalchemy.orm.attributes import flag_modified

        if not data.get("appointment_booked"):
            return
        # The agent genuinely booked in-call (real tool call succeeded) — don't double-book.
        if booking_state.was_booked(self.call_id) or extra.get("calendar_event_created"):
            booking_state.pop(self.call_id)
            log.info("Auto-book skipped — agent already booked in-call", call_id=self.call_id)
            return
        dt = data.get("appointment_datetime")
        if not dt:
            log.info("Auto-book skipped — appointment agreed but no concrete date+time extracted",
                     call_id=self.call_id)
            return

        agent = await db.get(Agent, call.agent_id) if call.agent_id else None
        tools = ((agent.config or {}).get("tools") if agent else None) or []
        tool = next(
            (t for t in tools
             if t.get("type") == "calendar_booking" and t.get("enabled", True)
             and (t.get("config") or {}).get("integration") in ("google_calendar", "calcom")),
            None,
        )
        if not tool:
            log.info("Auto-book skipped — agent has no bookable calendar tool", call_id=self.call_id)
            return

        # Paid add-on: only when the workspace has WhatsApp enabled + connected (its own
        # api_key) does the booking also send a WhatsApp confirmation from their number.
        # Otherwise email stays the only channel. Copy the tool so we don't mutate config.
        if (agent.config or {}).get("whatsapp_enabled"):
            from backend.db.models import Workspace
            ws = await db.get(Workspace, call.workspace_id) if call.workspace_id else None
            wa_key = getattr(ws, "whatsapp_api_key", None) if ws else None
            if wa_key:
                tool = {**tool, "config": {**(tool.get("config") or {}), "whatsapp_api_key": wa_key}}

        args = {
            "action": "book",
            "datetime_iso": dt,
            "caller_name": data.get("caller_name") or "",
            "caller_email": data.get("caller_email") or "",
            "caller_phone": call.phone_number or "",
            # Keep the customer-facing event/email clean — the "auto-booked" status is internal
            # (logged + stored in extra_data.auto_booked), never shown to the caller.
            "notes": "",
        }
        result = await execute_tool(tool, args)
        if booking_state.booking_succeeded(result):
            extra["calendar_event_created"] = True
            extra["auto_booked"] = True
            call.extra_data = extra
            flag_modified(call, "extra_data")
            await db.commit()
            log.info("Post-call auto-book SUCCEEDED", call_id=self.call_id, appointment=dt,
                     emailed=bool(data.get("caller_email")), result=result[:120])
        else:
            log.warning("Post-call auto-book did not succeed", call_id=self.call_id, result=result[:160])
        booking_state.pop(self.call_id)

    @property
    def turn_count(self) -> int:
        return len(self._turns)
