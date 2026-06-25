@echo off
REM Resumable voice-sample generator — fills any missing <Voice>.<lang>.wav clips.
REM Skips clips that already exist (zero TTS API calls once complete), so it's safe
REM to run daily until all 30 Gemini voices x 3 languages (90 clips) are present.
REM Created to finish the ~20 clips left after the Gemini TTS daily quota was hit.
echo ==== %DATE% %TIME% : resume run start >> "C:\Tierce Calling Agent\tierce-voice\voice_samples_resume.log"
docker exec tierce_backend python -u -m backend.scripts.generate_voice_samples >> "C:\Tierce Calling Agent\tierce-voice\voice_samples_resume.log" 2>&1
echo ==== %DATE% %TIME% : resume run end >> "C:\Tierce Calling Agent\tierce-voice\voice_samples_resume.log"
