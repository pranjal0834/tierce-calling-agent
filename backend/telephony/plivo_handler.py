"""
Plivo telephony handler — multi-country alternative to Twilio.
Supports Indian numbers and 70+ other countries.
Platform-managed: uses Tierce's own Plivo account (PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN in env).
"""
import asyncio
from typing import Optional

import structlog
import plivo

from backend.config import settings

log = structlog.get_logger()


class PlivoHandler:
    def __init__(self):
        auth_id = settings.PLIVO_AUTH_ID or ""
        auth_token = settings.PLIVO_AUTH_TOKEN or ""
        if not auth_id or not auth_token:
            raise RuntimeError(
                "PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN must be set in your environment "
                "to use Plivo as your telephony provider."
            )
        self.client = plivo.RestClient(auth_id=auth_id, auth_token=auth_token)

    # ── Outbound call ─────────────────────────────────────────────────────────

    async def make_call(self, to: str, websocket_url: str, call_id: str,
                        caller_id: Optional[str] = None) -> str:
        """Initiate an outbound Plivo call. Returns request_uuid."""
        from urllib.parse import quote
        answer_url = (
            f"{settings.BASE_URL}/telephony/plivo/answer"
            f"?ws_url={quote(websocket_url, safe='')}"
        )
        status_callback = f"{settings.BASE_URL}/telephony/plivo/status-callback"

        def _call():
            response = self.client.calls.create(
                from_=caller_id or settings.PLIVO_PHONE_NUMBER,
                to_=to,
                answer_url=answer_url,
                answer_method="GET",
                hangup_url=status_callback,
                hangup_method="POST",
            )
            return response[1].get("request_uuid", "")

        call_uuid = await asyncio.get_event_loop().run_in_executor(None, _call)
        log.info("Plivo call initiated", to=to, call_uuid=call_uuid, call_id=call_id)
        return call_uuid

    def build_xml(self, websocket_url: str) -> str:
        """Plivo XML to stream call audio to our WebSocket."""
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<Response>"
            '<Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">'
            f"{websocket_url}"
            "</Stream>"
            "</Response>"
        )

    async def end_call(self, call_uuid: str) -> None:
        """Hang up an active Plivo call."""
        def _hangup():
            try:
                self.client.calls.hangup(call_uuid)
            except Exception:
                pass

        await asyncio.get_event_loop().run_in_executor(None, _hangup)

    # ── Number management ─────────────────────────────────────────────────────

    @staticmethod
    def _plivo_objects(response) -> tuple[list, str]:
        """Extract objects list and error message from any Plivo SDK response shape."""
        # Old SDK: (status_code, body) tuple
        if isinstance(response, (list, tuple)) and len(response) >= 2:
            data = response[1] if isinstance(response[1], dict) else response[1].__dict__
        # New SDK: ResponseObject — .get() doesn't exist, data lives in __dict__
        elif hasattr(response, "__dict__"):
            data = response.__dict__
        elif isinstance(response, dict):
            data = response
        else:
            return [], "Unexpected response format"

        objects = data.get("objects", []) or []
        error = data.get("error", "") or ""
        return objects, error

    def search_available(self, area_code: str = "", country: str = "US",
                         limit: int = 15) -> list[dict]:
        """Search Plivo for available phone numbers. Tries local → mobile → tollfree."""
        clean_area = area_code.lstrip("+").strip()

        # Country-specific preferred type order
        _TYPE_PREF: dict[str, list[str]] = {
            "IN": ["local", "mobile"],
            "US": ["local", "tollfree"],
            "CA": ["local", "tollfree"],
            "GB": ["mobile", "local"],
            "AU": ["local", "mobile"],
            "DE": ["local", "mobile"],
            "FR": ["local", "mobile"],
        }
        type_order = _TYPE_PREF.get(country.upper(), ["local", "mobile", "tollfree"])

        def _n(obj, key, default=""):
            d = obj if isinstance(obj, dict) else obj.__dict__
            return d.get(key, default)

        last_error = ""
        for num_type in type_order:
            try:
                kwargs: dict = {"type": num_type, "limit": limit}
                if clean_area:
                    kwargs["pattern"] = clean_area

                response = self.client.numbers.search(country_iso=country, **kwargs)
                objects, error = self._plivo_objects(response)

                log.info("Plivo number search", country=country, type=num_type,
                         area_code=clean_area or None, found=len(objects), plivo_error=error or None)

                if objects:
                    return [
                        {
                            "phone_number": "+" + str(_n(n, "number")).lstrip("+"),
                            "friendly_name": "+" + str(_n(n, "number")).lstrip("+"),
                            "locality": _n(n, "city") or "",
                            "region": _n(n, "region") or "",
                            "iso_country": country,
                            "number_type": num_type,
                            "capabilities": {
                                "voice": _n(n, "voice_enabled") or True,
                                "sms": _n(n, "sms_enabled") or False,
                                "mms": _n(n, "mms_enabled") or False,
                            },
                            "monthly_rate_usd": float(_n(n, "monthly_rental_rate") or 1.0),
                            "restriction_text": _n(n, "restriction_text") or "",
                        }
                        for n in objects
                    ]

                if error:
                    last_error = error

            except Exception as exc:
                last_error = str(exc)
                log.warning("Plivo search attempt failed", country=country,
                            type=num_type, error=last_error)

        # All types exhausted — no numbers found
        _account_restricted = (
            "unable to offer" in last_error.lower() or
            "not in coverage" in last_error.lower()
        )
        if _account_restricted:
            raise ValueError(
                f"Your Plivo account does not have {country} numbers enabled. "
                "Only India (IN) is currently available. To buy international numbers, "
                "switch to Twilio as your telephony provider."
            )
        if last_error:
            raise ValueError(f"Plivo: no numbers available for {country} — {last_error}")
        return []

    def provision(self, phone_number: str, bundle_sid: str | None = None) -> dict:
        """Buy a Plivo number and wire it to our inbound webhook."""
        if settings.MOCK_PHONE_NUMBERS:
            log.info("MOCK: skipping Plivo number purchase", phone_number=phone_number)
            return {
                "provider_sid": f"MOCK_{phone_number.lstrip('+')}",
                "phone_number": phone_number,
                "friendly_name": phone_number,
                "capabilities": {"voice": True, "sms": True, "mms": False},
            }

        inbound_url = f"{settings.BASE_URL}/telephony/plivo/inbound"
        number_path = phone_number.lstrip("+")

        try:
            buy_kwargs: dict = {"number": number_path, "app_id": None}
            if bundle_sid:
                buy_kwargs["regulatory_bundle_id"] = bundle_sid
            self.client.numbers.buy(**buy_kwargs)
        except Exception as exc:
            raise RuntimeError(f"Plivo provision failed: {exc}") from exc

        try:
            self.client.numbers.update(
                number=number_path,
                app_id=None,
                answer_url=inbound_url,
                answer_method="POST",
                hangup_url=f"{settings.BASE_URL}/telephony/plivo/status-callback",
                hangup_method="POST",
            )
        except Exception as exc:
            log.warning("Could not set Plivo answer URL", number=phone_number, error=str(exc))

        return {
            "provider_sid": phone_number,
            "phone_number": phone_number,
            "friendly_name": phone_number,
            "capabilities": {"voice": True, "sms": True, "mms": False},
        }

    def release(self, number_or_sid: str) -> None:
        """Release a Plivo number from the account."""
        if settings.MOCK_PHONE_NUMBERS or number_or_sid.startswith("MOCK_"):
            log.info("MOCK: skipping Plivo number release", number=number_or_sid)
            return
        number_path = number_or_sid.lstrip("+")
        self.client.numbers.unrent(number=number_path)

    # ── Regulatory compliance ─────────────────────────────────────────────────

    async def create_regulatory_bundle(
        self,
        country: str,
        business_name: str,
        business_type: str,
        address_line: str,
        city: str,
        state: str,
        postal_code: str,
        authorized_name: str,
        existing_end_user_id: str | None = None,
        existing_application_id: str | None = None,
    ) -> dict:
        """
        Create (or reuse) a Plivo compliance application for regulatory KYC.
        On resubmission, pass existing_end_user_id / existing_application_id to
        skip recreating objects Plivo already has.
        Uses Plivo SDK v4.55+ flat attribute API.
        """
        def _r(resp_obj) -> dict:
            if hasattr(resp_obj, "__dict__"):
                return resp_obj.__dict__
            if isinstance(resp_obj, dict):
                return resp_obj
            return {}

        def _unpack(result):
            """Plivo SDK returns (status, body) or just body — handle both."""
            if isinstance(result, (tuple, list)):
                return result[1] if len(result) >= 2 else result[0]
            return result

        def _create():
            end_user_type = "business" if business_type == "company" else "individual"

            # Step 1: Reuse existing end_user, or create one, or find by name if already exists
            end_user_id = existing_end_user_id or ""
            if not end_user_id:
                try:
                    eu = _r(_unpack(self.client.end_users.create(
                        name=business_name,
                        last_name="",
                        end_user_type=end_user_type,
                    )))
                    end_user_id = eu.get("end_user_id") or eu.get("api_id") or eu.get("id") or ""
                    log.info("Plivo end_user created", end_user_id=end_user_id)
                except Exception as create_exc:
                    log.warning("end_user create failed, searching by name", error=str(create_exc))
                    try:
                        lst = _r(_unpack(self.client.end_users.list(
                            name=business_name,
                            end_user_type=end_user_type,
                        )))
                        objects = lst.get("objects") or lst.get("end_users") or []
                        if objects:
                            first = objects[0]
                            if not isinstance(first, dict):
                                first = _r(first)
                            end_user_id = first.get("end_user_id") or first.get("id") or ""
                            log.info("Reusing existing Plivo end_user", end_user_id=end_user_id)
                    except Exception as list_exc:
                        log.warning("Could not list end_users", error=str(list_exc))

            if not end_user_id:
                raise ValueError("Could not create or locate a Plivo end_user. Please try again.")

            # Step 2: If we already have an application, just re-submit it
            if existing_application_id:
                try:
                    _unpack(self.client.compliance_applications.submit(
                        compliance_application_id=existing_application_id
                    ))
                    log.info("Resubmitted existing compliance application",
                             app_id=existing_application_id)
                    return {
                        "bundle_sid": existing_application_id,
                        "end_user_id": end_user_id,
                        "address_id": "",
                        "status": "submitted",
                    }
                except Exception as exc:
                    log.warning("Resubmit of existing application failed — creating new one",
                                app_id=existing_application_id, error=str(exc))

            # Step 3: Try each number_type variant until one works
            # Plivo compliance requirements differ by country — try mobile then local then tollfree
            _TYPE_ORDER = {"IN": ["mobile", "local"], "AU": ["local", "mobile"],
                           "GB": ["local", "mobile"], "DE": ["local", "mobile"]}
            type_attempts = _TYPE_ORDER.get(country, ["local", "mobile"])

            app_id = ""
            last_exc = None
            for num_type in type_attempts:
                try:
                    app = _r(_unpack(self.client.compliance_applications.create(
                        end_user_id=end_user_id,
                        alias=f"{business_name} KYC - {country}",
                        end_user_type=end_user_type,
                        country_iso2=country,
                        number_type=num_type,
                    )))
                    app_id = app.get("compliance_application_id") or app.get("id") or app.get("api_id") or ""
                    if app_id:
                        log.info("Plivo compliance application created",
                                 app_id=app_id, number_type=num_type)
                        break
                except Exception as exc:
                    err_str = str(exc)
                    last_exc = exc
                    log.warning("compliance_applications.create failed",
                                number_type=num_type, error=err_str)
                    if "Could not find any requirement" not in err_str:
                        # Unexpected error — don't retry
                        break

            if not app_id:
                # Plivo has no API-managed compliance requirement for this country.
                # Raise RuntimeError so kyc.py auto-approves the record locally and
                # the user can proceed to buy numbers. Actual Plivo dashboard KYC
                # (if required) can be handled separately.
                raise RuntimeError(
                    f"No Plivo compliance requirement found for {country} — "
                    "KYC auto-approved locally. Submit documents via Plivo dashboard if needed."
                )

            # Step 4: Submit for review
            try:
                _unpack(self.client.compliance_applications.submit(
                    compliance_application_id=app_id
                ))
                status = "submitted"
            except Exception as exc:
                log.warning("Compliance application submit failed", app_id=app_id, error=str(exc))
                status = "pending"

            return {
                "bundle_sid": app_id,
                "end_user_id": end_user_id,
                "address_id": "",
                "status": status,
            }

        return await asyncio.get_event_loop().run_in_executor(None, _create)

    def get_bundle_status(self, bundle_sid: str) -> str:
        """Fetch live status from Plivo and map to our internal status."""
        _, resp = self.client.compliance_applications.get(compliance_application_id=bundle_sid)
        resp_dict = resp.__dict__ if hasattr(resp, "__dict__") else (resp if isinstance(resp, dict) else {})
        plivo_status = resp_dict.get("status", "pending")
        return {
            "draft": "submitted",
            "pending-review": "submitted",
            "under-review": "submitted",
            "action-required": "pending",
            "completed": "approved",
            "twilio_approved": "approved",
            "failed": "rejected",
            "rejected": "rejected",
        }.get(plivo_status, "submitted")
