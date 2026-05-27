"""
Paralinguistic Analyzer — extracts acoustic emotion signals from raw audio.
Signals: pitch (fundamental frequency), energy (loudness), speaking rate, pause duration.
Uses librosa locally — no external API needed.
"""
import io
import numpy as np
import structlog

log = structlog.get_logger()


class ParalinguisticAnalyzer:
    """
    Extracts:
      - pitch_mean / pitch_std  (Hz)  — high pitch → nervous/excited
      - energy_mean             (RMS) — high energy → excited/angry
      - speaking_rate           (syllables/sec estimate) — fast → excited
      - pause_ratio             (silence fraction) — high → confused/thinking
      - pitch_range             (max-min Hz) — high range → emotional
    """

    def analyze(self, audio_bytes: bytes, sample_rate: int = 8000) -> dict:
        try:
            return self._analyze_librosa(audio_bytes, sample_rate)
        except Exception as exc:
            log.warning("Paralinguistic analysis failed", error=str(exc))
            return {}

    def _analyze_librosa(self, audio_bytes: bytes, sample_rate: int) -> dict:
        import librosa

        # Decode mulaw 8-bit → float32 PCM
        audio_np = self._mulaw_to_float(audio_bytes)
        if audio_np is None or len(audio_np) < sample_rate * 0.1:
            return {}

        # Fundamental frequency (pitch) using YIN algorithm
        f0 = librosa.yin(audio_np, fmin=80, fmax=400, sr=sample_rate)
        voiced = f0[f0 > 0]

        pitch_mean = float(np.mean(voiced)) if len(voiced) > 0 else 0.0
        pitch_std = float(np.std(voiced)) if len(voiced) > 0 else 0.0
        pitch_range = float(np.ptp(voiced)) if len(voiced) > 0 else 0.0

        # RMS energy
        rms = librosa.feature.rms(y=audio_np, frame_length=512, hop_length=256)[0]
        energy_mean = float(np.mean(rms))

        # Speaking rate estimate (onset strength as syllable proxy)
        onset_env = librosa.onset.onset_strength(y=audio_np, sr=sample_rate)
        onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sample_rate)
        duration_s = len(audio_np) / sample_rate
        speaking_rate = len(onsets) / max(duration_s, 0.1)

        # Pause ratio (fraction of frames below energy threshold)
        silence_threshold = 0.01
        pause_ratio = float(np.mean(rms < silence_threshold))

        return {
            "pitch_mean_hz": round(pitch_mean, 1),
            "pitch_std_hz": round(pitch_std, 1),
            "pitch_range_hz": round(pitch_range, 1),
            "energy_mean": round(energy_mean, 4),
            "speaking_rate_per_sec": round(speaking_rate, 2),
            "pause_ratio": round(pause_ratio, 3),
        }

    def _mulaw_to_float(self, data: bytes) -> np.ndarray | None:
        """Convert 8-bit mulaw bytes to float32 in [-1, 1]."""
        try:
            import audioop
            pcm16 = audioop.ulaw2lin(data, 2)  # mulaw → 16-bit PCM
            samples = np.frombuffer(pcm16, dtype=np.int16).astype(np.float32)
            return samples / 32768.0
        except Exception:
            # Fallback: treat as raw int16 little-endian
            try:
                samples = np.frombuffer(data, dtype=np.int16).astype(np.float32)
                return samples / 32768.0
            except Exception:
                return None
