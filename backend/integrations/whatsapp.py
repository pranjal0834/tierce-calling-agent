"""
WhatsApp sender — posts messages through the customer's own WhatsApp automation
system (not Twilio). Configured via env:

  WHATSAPP_API_URL           free-text endpoint (only usable inside the 24h window)
  WHATSAPP_TEMPLATE_API_URL  template endpoint, e.g. https://wa.example.com/api/v1/send/template
  WHATSAPP_ACCESS_TOKEN      API key, sent as the `X-API-Key` header
  WHATSAPP_PHONE_NUMBER_ID   optional — leave empty when the system infers the
                             sender from the API key (e.g. the Railway deployment)
  WHATSAPP_USE_TEMPLATES     true in production — send Meta-approved templates

NOTE on the Railway deployment: the only API-key-accessible send is the TEMPLATE
endpoint (/api/v1/send/template). Free-form text via /api/v1/messages/send/text
needs a logged-in session, so in production every proactive message must be a
template (WhatsApp's own rule for business-initiated messages). Keep
WHATSAPP_USE_TEMPLATES=true and register the templates in Meta.

Best-effort: never raises — a WhatsApp failure must not break a call or a booking.
"""
import httpx
import structlog

from backend.config import settings

log = structlog.get_logger()


def system_configured() -> bool:
    """The platform's WhatsApp relay endpoint is set (global). Per-customer sending also
    requires that workspace's own api_key (passed explicitly to the send functions)."""
    return bool(settings.WHATSAPP_API_URL)


def is_configured() -> bool:
    # Legacy global check (endpoint + a global key). New per-workspace sending passes
    # an explicit api_key instead — see system_configured().
    return bool(settings.WHATSAPP_API_URL and settings.WHATSAPP_ACCESS_TOKEN)


def _headers(api_key: str = "") -> dict:
    return {
        "X-API-Key": api_key or settings.WHATSAPP_ACCESS_TOKEN,
        "Content-Type": "application/json",
    }


async def _post(url: str, payload: dict, to: str, api_key: str = "") -> bool:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, headers=_headers(api_key), json=payload)
        if resp.is_success:
            log.info("WhatsApp message sent", to=to)
            return True
        log.warning("WhatsApp send failed", to=to, status=resp.status_code, body=resp.text[:200])
        return False
    except Exception as exc:
        log.warning("WhatsApp send error", to=to, error=str(exc))
        return False


async def send_message(api_key: str, to: str, text: str) -> bool:
    """Per-workspace send: relay a message through the platform's WhatsApp system using
    the WORKSPACE's own api_key, so it goes out from that customer's connected number."""
    if not system_configured():
        log.warning("WhatsApp system endpoint not configured — skipping", to=to)
        return False
    if not (api_key and to and text):
        return False
    return await send_text(to, text, api_key=api_key)


async def send_text(to: str, body: str, api_key: str = "") -> bool:
    """Send a free-form WhatsApp text message. Returns True on success."""
    if not system_configured():
        log.warning("WhatsApp not configured — skipping", to=to)
        return False
    if not to or not body:
        return False
    payload = {"to": to, "body": body}
    if settings.WHATSAPP_PHONE_NUMBER_ID:
        payload["phone_number_id"] = settings.WHATSAPP_PHONE_NUMBER_ID
    return await _post(settings.WHATSAPP_API_URL, payload, to, api_key=api_key)


async def send_template(to: str, template_name: str, params: list[str], language: str = "", api_key: str = "") -> bool:
    """Send a Meta-approved WhatsApp template via the system's /send/template endpoint.
    `params` are the ordered body variables ({{1}}, {{2}}, ...). Payload matches the
    system's TemplateSendRequest schema: to, template_name, language_code, components."""
    if not system_configured() or not settings.WHATSAPP_TEMPLATE_API_URL:
        return False
    lang = language or settings.WHATSAPP_TEMPLATE_LANG or "en"
    payload = {
        "to": to,
        "template_name": template_name,
        "language_code": lang,
        "components": [{
            "type": "body",
            "parameters": [{"type": "text", "text": str(p)} for p in params],
        }],
    }
    if settings.WHATSAPP_PHONE_NUMBER_ID:
        payload["phone_number_id"] = settings.WHATSAPP_PHONE_NUMBER_ID
    return await _post(settings.WHATSAPP_TEMPLATE_API_URL, payload, to, api_key=api_key)


async def send_appointment_confirmation(to: str, name: str, when: str, business: str = "", api_key: str = "") -> bool:
    """Send the appointment confirmation — Meta template in production, text in dev."""
    from backend.notifications.whatsapp_templates import AppointmentConfirmation as AC
    if settings.WHATSAPP_USE_TEMPLATES:
        return await send_template(to, AC.meta_name, AC.params(name, when, business), api_key=api_key)
    return await send_text(to, AC.text(name, when, business), api_key=api_key)


async def send_info(to: str, content: str, name: str = "", business: str = "", api_key: str = "") -> bool:
    """Send caller-requested info (the in-call send_whatsapp tool).
    Uses the Meta `info_message` template in production (content goes in {{3}}),
    or free-form text in dev / inside the 24h window."""
    from backend.notifications.whatsapp_templates import InfoMessage as IM
    if settings.WHATSAPP_USE_TEMPLATES:
        return await send_template(to, IM.meta_name, IM.params(content, name, business), api_key=api_key)
    return await send_text(to, IM.text(content, name, business), api_key=api_key)
