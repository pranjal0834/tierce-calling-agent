"""
Twilio phone number management: search available, provision, release.
"""
import structlog
from twilio.rest import Client

from backend.config import settings

log = structlog.get_logger()

# Twilio local number monthly rates (USD) by country ISO code.
# Source: https://www.twilio.com/en-us/sms/pricing
TWILIO_MONTHLY_RATE: dict[str, float] = {
    "US": 1.00, "CA": 1.00, "GB": 1.15, "AU": 3.00,
    "DE": 1.15, "FR": 1.15, "SE": 1.15, "SG": 5.50,
    "NL": 1.15, "ES": 1.15, "IT": 1.15, "NO": 1.15,
    "DK": 1.15, "FI": 1.15, "BE": 1.15, "AT": 1.15,
    "CH": 1.15, "HK": 5.50, "NZ": 3.00,
}


class PhoneNumberManager:
    def __init__(self):
        self.client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    def search_available(self, area_code: str = "", country: str = "US", limit: int = 15) -> list[dict]:
        """Search Twilio for available local phone numbers."""
        # Strip leading + or country-dial-code prefix if the user typed it by mistake
        clean_area = area_code.lstrip("+").strip()
        try:
            kwargs: dict = {"limit": limit, "voice_enabled": True}
            if clean_area:
                kwargs["area_code"] = clean_area
            numbers = self.client.available_phone_numbers(country).local.list(**kwargs)
            rate = TWILIO_MONTHLY_RATE.get(country.upper(), 1.15)
            return [
                {
                    "phone_number": n.phone_number,
                    "friendly_name": n.friendly_name,
                    "locality": getattr(n, "locality", "") or "",
                    "region": getattr(n, "region", "") or "",
                    "iso_country": getattr(n, "iso_country", country) or country,
                    "capabilities": dict(n.capabilities) if n.capabilities else {},
                    "monthly_rate_usd": rate,
                }
                for n in numbers
            ]
        except Exception as exc:
            error_str = str(exc)
            log.error("Twilio number search failed", country=country, error=error_str)
            # Twilio 404 → this country/region isn't supported for direct provisioning
            if "20404" in error_str or "was not found" in error_str:
                raise ValueError(
                    f"Twilio does not support direct local number provisioning for '{country}'. "
                    "Try US, GB, CA, AU, DE, or FR. For other regions, purchase numbers directly "
                    "in the Twilio Console and configure them to point to this webhook."
                )
            raise

    def provision(self, phone_number: str) -> dict:
        """Buy a Twilio number and wire it to our inbound webhook."""
        if settings.MOCK_PHONE_NUMBERS:
            log.info("MOCK: skipping Twilio number purchase", phone_number=phone_number)
            return {
                "twilio_sid": f"MOCK_{phone_number.lstrip('+')}",
                "phone_number": phone_number,
                "friendly_name": phone_number,
                "capabilities": {"voice": True, "sms": True, "mms": False},
            }

        voice_url = f"{settings.BASE_URL}/telephony/twilio/inbound"
        status_callback = f"{settings.BASE_URL}/telephony/twilio/status-callback"

        number = self.client.incoming_phone_numbers.create(
            phone_number=phone_number,
            voice_url=voice_url,
            voice_method="POST",
            status_callback=status_callback,
            status_callback_method="POST",
        )
        return {
            "twilio_sid": number.sid,
            "phone_number": number.phone_number,
            "friendly_name": number.friendly_name,
            "capabilities": dict(number.capabilities) if number.capabilities else {},
        }

    def release(self, twilio_sid: str) -> None:
        """Release a number from the Twilio account."""
        if settings.MOCK_PHONE_NUMBERS or twilio_sid.startswith("MOCK_"):
            log.info("MOCK: skipping Twilio number release", sid=twilio_sid)
            return
        self.client.incoming_phone_numbers(twilio_sid).delete()

    def update_webhook(self, twilio_sid: str) -> None:
        """Re-point an existing number's inbound webhook to the current BASE_URL."""
        self.client.incoming_phone_numbers(twilio_sid).update(
            voice_url=f"{settings.BASE_URL}/telephony/twilio/inbound",
            voice_method="POST",
        )
