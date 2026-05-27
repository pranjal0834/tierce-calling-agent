"""
Google OAuth 2.0 — exchange authorization code for user info.
"""
import httpx
import structlog

from backend.config import settings

log = structlog.get_logger()

_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def get_google_auth_url(state: str = "") -> str:
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": state,
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"


async def exchange_code_for_user(code: str) -> dict:
    """Exchange OAuth code → access token → user info dict."""
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(_GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        if not token_resp.is_success:
            log.error("Google token exchange failed",
                      status=token_resp.status_code,
                      body=token_resp.text[:500])
            token_resp.raise_for_status()

        token_data = token_resp.json()
        if "access_token" not in token_data:
            log.error("No access_token in Google response", body=str(token_data)[:500])
            raise ValueError(f"Google returned no access_token: {token_data.get('error', 'unknown')}")

        info_resp = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        info_resp.raise_for_status()
        return info_resp.json()
        # Returns: {"sub": "...", "email": "...", "name": "...", "picture": "..."}
