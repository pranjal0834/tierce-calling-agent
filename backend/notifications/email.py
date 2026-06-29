"""
Async email sender — uses smtplib in a thread pool so it never blocks
the FastAPI event loop. Works with Gmail App Password, Outlook, or any SMTP.
"""
import asyncio
import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import structlog

from backend.config import settings

log = structlog.get_logger()


async def send_email(to: str, subject: str, html: str, ics: str | None = None,
                     ics_method: str = "REQUEST") -> bool:
    """Send a single HTML email. Optionally attach a calendar event (`ics`) so the email
    doubles as a calendar invite — the recipient can add it to their calendar (with the
    reminder baked into the .ics). Returns True on success, False on failure/skip."""
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        log.warning("SMTP not configured — skipping email", to=to, subject=subject)
        return False

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _send_sync, to, subject, html, ics, ics_method)


async def send_bulk(recipients: list[str], subject: str, html: str) -> int:
    """Send email to multiple recipients. Returns count of successful sends."""
    results = await asyncio.gather(
        *[send_email(r, subject, html) for r in recipients],
        return_exceptions=True,
    )
    return sum(1 for r in results if r is True)


def _send_sync(to: str, subject: str, html: str, ics: str | None = None,
               ics_method: str = "REQUEST") -> bool:
    try:
        msg = MIMEMultipart("mixed")
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME or 'Vaaniq Voice'} <{settings.SMTP_USER}>"
        msg["To"] = to

        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(html, "html", "utf-8"))
        if ics:
            # Inline calendar part — Gmail/Outlook render the event card + "Add to calendar".
            cal = MIMEText(ics, "calendar", "utf-8")
            cal.replace_header("Content-Type", f'text/calendar; charset="utf-8"; method={ics_method}')
            alt.attach(cal)
        msg.attach(alt)

        if ics:
            # Also attach as a downloadable .ics for clients that don't render the inline part.
            part = MIMEBase("text", "calendar")
            part.set_payload(ics.encode("utf-8"))
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", 'attachment; filename="appointment.ics"')
            msg.attach(part)

        with smtplib.SMTP(settings.SMTP_HOST, int(settings.SMTP_PORT or 587)) as srv:
            srv.ehlo()
            srv.starttls()
            srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            srv.sendmail(settings.SMTP_USER, [to], msg.as_string())

        log.info("Email sent", to=to, subject=subject)
        return True
    except Exception as exc:
        log.error("Email send failed", to=to, subject=subject, error=str(exc))
        return False
