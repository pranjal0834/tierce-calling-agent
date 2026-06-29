"""Tracks which calls actually fired a SUCCESSFUL calendar `book` tool call during
the live conversation.

The native-audio models (esp. Gemini Live) sometimes *narrate* a booking — telling
the caller "I've booked it, you'll get an email" — without ever emitting the
`action='book'` function call. The post-call safety net in CallLogger auto-books
from the extracted transcript when that happens; this registry lets it skip the
auto-book when the agent genuinely booked in-call, so we never double-book.

In-memory + same-process: the executor (during the call) and CallLogger.finalize
(seconds after hangup) run in the same backend process. The only loss window is a
backend reload between the book and finalize — acceptable (worst case: one extra
calendar event), and reloads already tear the call down.
"""
from __future__ import annotations

_booked: set[str] = set()


def mark_booked(call_id) -> None:
    if call_id:
        _booked.add(str(call_id))


def was_booked(call_id) -> bool:
    return bool(call_id) and str(call_id) in _booked


def pop(call_id) -> None:
    if call_id:
        _booked.discard(str(call_id))


def booking_succeeded(result: str) -> bool:
    """Heuristic: did a calendar book_appointment call return success?
    The integrations return human-readable strings; failures start with a known
    error prefix."""
    if not result:
        return False
    low = result.strip().lower()
    bad_prefixes = (
        "error", "could not", "cannot", "unsupported", "please ask",
        "calendar not configured", "failed", "no available",
    )
    return not any(low.startswith(p) for p in bad_prefixes)
