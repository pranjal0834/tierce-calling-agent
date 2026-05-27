import asyncio
import time
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional


class AudioSendStatus(str, Enum):
    SEND = "send"
    BLOCK = "block"
    WAIT = "wait"


@dataclass
class InterruptionManager:
    """
    Controls when the agent is allowed to send audio back to the caller.
    Handles barge-in detection, grace periods, and false-interruption filtering.
    """
    incremental_delay_ms: int = 400
    interruption_word_threshold: int = 3

    # state
    callee_speaking: bool = False
    agent_speaking: bool = False
    utterance_end_time: float = 0.0
    interruption_count: int = 0
    recovery_count: int = 0
    _sequence_ids: set = field(default_factory=set)
    _current_sequence_id: int = 0

    # ── Sequence management ─────────────────────────────────────────────────

    def get_next_sequence_id(self) -> int:
        self._current_sequence_id += 1
        self._sequence_ids.add(self._current_sequence_id)
        return self._current_sequence_id

    def retire_sequence_id(self, seq_id: int):
        self._sequence_ids.discard(seq_id)

    def invalidate_pending_responses(self):
        self._sequence_ids.clear()

    def is_sequence_valid(self, seq_id: int) -> bool:
        return seq_id in self._sequence_ids

    # ── Audio gate ──────────────────────────────────────────────────────────

    def get_audio_send_status(self, sequence_id: int) -> AudioSendStatus:
        if not self.is_sequence_valid(sequence_id):
            return AudioSendStatus.BLOCK

        # If user is actively speaking → wait (don't interrupt them)
        if self.callee_speaking:
            return AudioSendStatus.WAIT

        # Grace period after user finished utterance
        if self.utterance_end_time > 0:
            elapsed_ms = (time.monotonic() - self.utterance_end_time) * 1000
            if elapsed_ms < self.incremental_delay_ms:
                return AudioSendStatus.WAIT

        return AudioSendStatus.SEND

    # ── Speech lifecycle ────────────────────────────────────────────────────

    def on_user_speech_started(self):
        self.callee_speaking = True

    def on_user_speech_ended(self):
        self.callee_speaking = False
        self.utterance_end_time = time.monotonic()

    def on_agent_speech_started(self):
        self.agent_speaking = True

    def on_agent_speech_ended(self):
        self.agent_speaking = False

    def on_successful_response_delivered(self):
        self.recovery_count += 1
        self.utterance_end_time = 0.0

    # ── Interruption logic ──────────────────────────────────────────────────

    def should_trigger_interruption(self, interim_words: int) -> bool:
        return (
            self.callee_speaking
            and self.agent_speaking
            and interim_words >= self.interruption_word_threshold
        )

    def is_false_interruption(self, word_count: int) -> bool:
        """Short utterances while agent is speaking are likely accidental."""
        return self.agent_speaking and word_count < self.interruption_word_threshold

    def on_interruption_triggered(self):
        self.interruption_count += 1
        self.invalidate_pending_responses()
        self.agent_speaking = False
