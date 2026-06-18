#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# refresh-tunnel.sh — one command to recover from a dead/rotated Cloudflare tunnel.
#
# The free Cloudflare quick tunnel drops/rotates often. Because the frontend now
# talks to the backend at http://localhost:8001 (tunnel-independent), only the
# backend's BASE_URL (used by Twilio webhooks + Google OAuth redirect) needs the
# new tunnel URL. This script:
#   1. recreates cloudflared (fresh, working tunnel)
#   2. waits for the new URL and for it to actually serve
#   3. updates BASE_URL + GOOGLE_REDIRECT_URI in .env
#   4. recreates the backend so it loads the new URL
#
# Usage:  bash refresh-tunnel.sh
# After it runs, if you use Google login/calendar, add the printed
# <URL>/auth/google/callback (and /auth/google/calendar/callback) in Google Console.
# ─────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

echo "↻ Recreating Cloudflare tunnel..."
docker compose up -d --force-recreate cloudflared >/dev/null

echo "⏳ Waiting for a new tunnel URL..."
URL=""
for i in $(seq 1 30); do
  URL=$(docker compose logs cloudflared 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1)
  [ -n "$URL" ] && break
  sleep 2
done
if [ -z "$URL" ]; then echo "✗ Could not find a tunnel URL in cloudflared logs."; exit 1; fi

echo "⏳ Waiting for $URL to serve..."
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "$URL/api/calls" || true)
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then echo "✓ Tunnel is live ($code)"; break; fi
  sleep 3
done

python - "$URL" <<'PY'
import re, sys
NEW = sys.argv[1]
s = open(".env", encoding="utf-8").read()
s = re.sub(r'BASE_URL=https://[^\s]+', f'BASE_URL={NEW}', s)
s = re.sub(r'GOOGLE_REDIRECT_URI=https://[^\s]+/auth/google/callback',
           f'GOOGLE_REDIRECT_URI={NEW}/auth/google/callback', s)
open(".env", "w", encoding="utf-8").write(s)
print("✓ .env updated: BASE_URL + GOOGLE_REDIRECT_URI ->", NEW)
PY

echo "↻ Recreating backend to load the new URL..."
docker compose up -d backend >/dev/null

echo ""
echo "✅ Done. Tunnel: $URL"
echo "   (Frontend uses localhost:8001, so no frontend rebuild / browser refresh needed.)"
echo "   If you use Google login/calendar, add in Google Console:"
echo "     $URL/auth/google/callback"
echo "     $URL/auth/google/calendar/callback"
