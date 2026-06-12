"""
Google Calendar OAuth connect flow (no service-account key required).

The agent owner authorizes their Google Calendar once; we store the resulting
refresh token on the agent's calendar tools so the booking integration can
check availability and create events on their behalf.

  GET /auth/google/calendar/connect?agent_id=...&token=<JWT>
        → redirect to Google consent (calendar scope, offline access)
  GET /auth/google/calendar/callback?code=...&state=...
        → exchange code, save refresh token to the agent's calendar_booking tools

These are public routes (browser redirects can't send auth headers): /connect
authenticates via the ?token JWT, /callback via the signed state + Google's code.
"""
import base64
import json

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from jose import jwt, JWTError
from sqlalchemy.orm.attributes import flag_modified

from backend.config import settings
from backend.db.database import AsyncSessionLocal
from backend.db.models import Agent, User

log = structlog.get_logger()
router = APIRouter()

_SCOPE = "https://www.googleapis.com/auth/calendar"
_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"


def _redirect_uri() -> str:
    return f"{settings.BASE_URL}/auth/google/calendar/callback"


@router.get("/connect")
async def calendar_connect(agent_id: str, token: str = ""):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    # Authenticate the initiating user via their JWT, and confirm they own the agent.
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or missing token")

    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id) if user_id else None
        agent = await db.get(Agent, agent_id) if agent_id else None
        if not user or not agent or agent.workspace_id != user.workspace_id:
            raise HTTPException(status_code=403, detail="Agent not found for this account")

    state = base64.urlsafe_b64encode(json.dumps({"agent_id": agent_id}).encode()).decode().rstrip("=")
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": _SCOPE,
        "access_type": "offline",      # request a refresh token
        "prompt": "consent",           # force refresh-token issuance every time
        "include_granted_scopes": "true",
        "state": state,
    }
    from urllib.parse import urlencode
    return RedirectResponse(f"{_AUTH_URL}?{urlencode(params)}")


@router.get("/callback")
async def calendar_callback(code: str = "", state: str = ""):
    if not code:
        return HTMLResponse("<h3>Google Calendar connection failed (no code).</h3>", status_code=400)
    try:
        padded = state + "=" * (-len(state) % 4)
        agent_id = json.loads(base64.urlsafe_b64decode(padded).decode()).get("agent_id")
    except Exception:
        return HTMLResponse("<h3>Invalid state.</h3>", status_code=400)

    # Exchange the authorization code for tokens (incl. refresh token).
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": _redirect_uri(),
            "grant_type": "authorization_code",
        })
    if not resp.is_success:
        log.error("Calendar token exchange failed", body=resp.text[:300])
        return HTMLResponse("<h3>Could not connect Google Calendar. Please try again.</h3>", status_code=400)

    tokens = resp.json()
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return HTMLResponse(
            "<h3>No refresh token returned.</h3><p>Remove this app's access at "
            "myaccount.google.com/permissions and connect again.</p>", status_code=400)

    # Save the refresh token onto the agent's calendar_booking tools.
    updated = 0
    async with AsyncSessionLocal() as db:
        agent = await db.get(Agent, agent_id)
        if not agent:
            return HTMLResponse("<h3>Agent not found.</h3>", status_code=404)
        cfg = dict(agent.config or {})
        tools = list(cfg.get("tools") or [])
        for tool in tools:
            if tool.get("type") == "calendar_booking":
                tc = dict(tool.get("config") or {})
                tc["integration"] = "google_calendar"
                tc["refresh_token"] = refresh_token
                tc["calendar_id"] = tc.get("calendar_id") or "primary"
                tool["config"] = tc
                updated += 1
        cfg["tools"] = tools
        agent.config = cfg
        flag_modified(agent, "config")
        await db.commit()

    log.info("Google Calendar connected", agent_id=agent_id, tools_updated=updated)
    return HTMLResponse(
        f"<h2>✅ Google Calendar connected</h2>"
        f"<p>{updated} calendar tool(s) on this agent now use your Google Calendar.</p>"
        f"<p>You can close this tab and make a test call.</p>"
    )
