"""
WhatsApp connection settings (per-workspace).

The customer connects their OWN (official) WhatsApp by pasting the API key they get
from the Vaaniq WhatsApp automation system. The platform stores that key on the
workspace and relays messages through settings.WHATSAPP_API_URL using it — so every
message goes out from the customer's own number.

  GET  /api/whatsapp/config   → connection status (key is masked, never returned raw)
  PUT  /api/whatsapp/config   → save / clear the workspace's api key
  POST /api/whatsapp/test     → send a test message to a number to verify it works
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_workspace
from backend.db.database import get_db
from backend.db.models import Workspace
from backend.integrations import whatsapp as wa

log = structlog.get_logger()
router = APIRouter()


class WhatsAppConfigIn(BaseModel):
    api_key: str = ""   # empty string disconnects


class WhatsAppTestIn(BaseModel):
    to: str
    message: str = "✅ Your Vaaniq WhatsApp is connected and working."


def _mask(key: str | None) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "••••"
    return f"{key[:4]}…{key[-4:]}"


@router.get("/config")
async def get_config(workspace: Workspace = Depends(require_workspace)):
    key = getattr(workspace, "whatsapp_api_key", None)
    return {
        "connected": bool(key),
        "api_key_masked": _mask(key),
        # Whether the platform's WhatsApp relay endpoint is configured at all.
        "system_available": wa.system_configured(),
    }


@router.put("/config")
async def save_config(
    payload: WhatsAppConfigIn,
    workspace: Workspace = Depends(require_workspace),
    db: AsyncSession = Depends(get_db),
):
    workspace.whatsapp_api_key = (payload.api_key or "").strip() or None
    await db.commit()
    log.info("WhatsApp config saved", workspace_id=workspace.id,
             connected=bool(workspace.whatsapp_api_key))
    return {"connected": bool(workspace.whatsapp_api_key),
            "api_key_masked": _mask(workspace.whatsapp_api_key)}


@router.post("/test")
async def test_config(
    payload: WhatsAppTestIn,
    workspace: Workspace = Depends(require_workspace),
):
    key = getattr(workspace, "whatsapp_api_key", None)
    if not key:
        raise HTTPException(status_code=400, detail="WhatsApp is not connected. Paste your API key first.")
    if not wa.system_configured():
        raise HTTPException(status_code=400, detail="WhatsApp relay is not configured on the platform.")
    if not payload.to.strip():
        raise HTTPException(status_code=400, detail="Recipient number is required.")
    ok = await wa.send_message(api_key=key, to=payload.to.strip(), text=payload.message)
    if not ok:
        raise HTTPException(status_code=502, detail="Send failed. Check the API key and recipient number.")
    return {"ok": True}
