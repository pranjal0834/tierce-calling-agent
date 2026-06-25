"""
Plivo telephony handler — multi-country alternative to Twilio.
Supports Indian numbers and 70+ other countries.
Platform-managed: uses Tierce's own Plivo account (PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN in env).
"""
import asyncio
import time
from typing import Optional

import structlog
import plivo

from backend.config import settings

log = structlog.get_logger()

# Major Indian STD (area) codes → city. Plivo has no "list available cities" API,
# so to auto-detect which cities currently have inventory we probe each code's
# total_count and surface whatever has > 0. This list is the detection net — add
# codes here to widen coverage; the live counts come straight from Plivo.
_IN_STD_CODES: dict[str, str] = {
    "11": "Delhi", "22": "Mumbai", "33": "Kolkata", "44": "Chennai", "40": "Hyderabad",
    "80": "Bengaluru", "20": "Pune", "79": "Ahmedabad", "141": "Jaipur", "522": "Lucknow",
    "712": "Nagpur", "755": "Bhopal", "731": "Indore", "422": "Coimbatore", "484": "Kochi",
    "471": "Thiruvananthapuram", "821": "Mysuru", "832": "Goa", "172": "Chandigarh",
    "120": "Noida", "124": "Gurugram", "161": "Ludhiana", "183": "Amritsar", "261": "Surat",
    "265": "Vadodara", "281": "Rajkot", "361": "Guwahati", "612": "Patna", "651": "Ranchi",
    "657": "Jamshedpur", "674": "Bhubaneswar", "671": "Cuttack", "562": "Agra", "512": "Kanpur",
    "542": "Varanasi", "452": "Madurai", "431": "Tiruchirappalli", "413": "Puducherry",
    "866": "Vijayawada", "891": "Visakhapatnam", "836": "Hubballi", "744": "Kota", "751": "Gwalior",
}

# Per-country STD-code detection sets.
_STD_CODES: dict[str, dict[str, str]] = {"IN": _IN_STD_CODES}

# Short-lived cache of detected cities so we don't re-probe Plivo on every modal open.
_CITIES_CACHE: dict[str, tuple[float, list]] = {}
_CITIES_TTL = 1800  # seconds (30 min) — reflects Plivo add/remove within this window


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
                         limit: int = 20, offset: int = 0, contains: str = "") -> dict:
        """Search Plivo for available phone numbers — ONE page at a time.

        A country can list tens of thousands of numbers (India local alone is
        ~15k) and Plivo caps each request at 20, so we never fetch them all at
        once. We return a single page plus the REAL `total` and a `has_more`
        flag; the dashboard loads further pages on demand by passing `offset`.

        `area_code` is a leading STD/area prefix; `contains` is a vanity digit
        sequence to find anywhere in the number (Plivo wildcard `*<digits>*`).
        Returns: {numbers, total, offset, has_more, number_type}
        """
        clean_area = area_code.lstrip("+").strip()
        digits = "".join(c for c in (contains or "") if c.isdigit())
        # Build the Plivo `pattern`: bare digits must be wrapped in wildcards to
        # mean "contains"; an area code alone is a prefix match.
        if digits:
            pattern = (f"{clean_area}*" if clean_area else "*") + digits + "*"
        elif clean_area:
            pattern = clean_area
        else:
            pattern = ""
        limit = max(1, min(int(limit or 20), 20))      # Plivo's hard per-request cap
        start = max(0, int(offset or 0))

        # Country-specific preferred type order; we paginate the first type that
        # actually has inventory so `offset` stays stable across pages.
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

        def _meta(resp):
            d = resp.__dict__ if hasattr(resp, "__dict__") else (resp if isinstance(resp, dict) else {})
            m = d.get("meta") or {}
            # Plivo's new SDK returns meta as a ResponseObject, not a dict.
            if not isinstance(m, dict) and hasattr(m, "__dict__"):
                m = m.__dict__
            return m if isinstance(m, dict) else {}

        last_error = ""
        for num_type in type_order:
            try:
                kwargs: dict = {"type": num_type, "limit": limit, "offset": start}
                if pattern:
                    kwargs["pattern"] = pattern
                response = self.client.numbers.search(country_iso=country, **kwargs)
                objects, error = self._plivo_objects(response)
                meta = _meta(response)
                total = int(meta.get("total_count") or 0)
            except Exception as exc:
                last_error = str(exc)
                log.warning("Plivo search attempt failed", country=country,
                            type=num_type, offset=start, error=last_error)
                continue

            if error:
                last_error = error

            # This type has inventory → return this page of it.
            if total > 0 or objects:
                numbers = [
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
                has_more = bool(meta.get("next")) or (start + len(numbers) < total)
                log.info("Plivo number search", country=country, type=num_type,
                         offset=start, returned=len(numbers), total=total)
                return {
                    "numbers": numbers,
                    "total": total or len(numbers),
                    "offset": start,
                    "has_more": has_more,
                    "number_type": num_type,
                }

        # No inventory in any type
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
        return {"numbers": [], "total": 0, "offset": start, "has_more": False, "number_type": ""}

    async def available_cities(self, country: str = "IN", force: bool = False) -> list[dict]:
        """Auto-detect which cities currently have Plivo inventory.

        Probes every STD code in the detection set CONCURRENTLY and returns those
        with a live count > 0, e.g. [{"code": "22", "city": "Mumbai", "count": 7796}].
        Cached for `_CITIES_TTL` so it auto-reflects Plivo adding/removing numbers
        without re-probing on every request.
        """
        key = country.upper()
        codes = _STD_CODES.get(key)
        if not codes:
            return []

        now = time.time()
        cached = _CITIES_CACHE.get(key)
        if cached and not force and (now - cached[0] < _CITIES_TTL):
            return cached[1]

        loop = asyncio.get_event_loop()

        def _count(code: str) -> int:
            try:
                r = self.client.numbers.search(country_iso=country, type="local", limit=1, offset=0, pattern=code)
                d = r.__dict__ if hasattr(r, "__dict__") else (r if isinstance(r, dict) else {})
                m = d.get("meta") or {}
                if not isinstance(m, dict) and hasattr(m, "__dict__"):
                    m = m.__dict__
                return int((m or {}).get("total_count") or 0)
            except Exception:
                return 0

        counts = await asyncio.gather(*[loop.run_in_executor(None, _count, c) for c in codes])
        cities = [
            {"code": code, "city": city, "count": cnt}
            for (code, city), cnt in zip(codes.items(), counts) if cnt > 0
        ]
        cities.sort(key=lambda c: -c["count"])
        _CITIES_CACHE[key] = (now, cities)
        log.info("Plivo available cities detected", country=key,
                 cities=[c["code"] for c in cities])
        return cities

    def _ensure_inbound_app(self) -> str | None:
        """Ensure a shared 'Vaaniq Inbound' Plivo Application points at our inbound webhook
        and return its app_id. Plivo routes incoming calls to a number via its assigned
        Application's answer_url (one app serves all numbers; our handler routes by the
        dialed `To`). URLs are refreshed each call so a rotated BASE_URL is picked up."""
        answer_url = f"{settings.BASE_URL}/telephony/plivo/inbound"
        hangup_url = f"{settings.BASE_URL}/telephony/plivo/status-callback"
        try:
            existing = self.client.applications.list(app_name="Vaaniq_Inbound", limit=1)
            objs = getattr(existing, "objects", None) or []
            if objs:
                app_id = objs[0].__dict__.get("app_id")
                self.client.applications.update(
                    app_id, answer_url=answer_url, answer_method="POST",
                    hangup_url=hangup_url, hangup_method="POST")
                return app_id
            created = self.client.applications.create(
                "Vaaniq_Inbound", answer_url=answer_url, answer_method="POST",
                hangup_url=hangup_url, hangup_method="POST")
            cd = getattr(created, "__dict__", {}) or {}
            return cd.get("app_id") or getattr(created, "app_id", None)
        except Exception as exc:
            log.warning("Could not ensure Plivo inbound application", error=str(exc))
            return None

    def provision(self, phone_number: str, bundle_sid: str | None = None) -> dict:
        """Buy a Plivo number and wire it to our inbound webhook.

        `bundle_sid` is Plivo's **compliance_application_id** (an ACCEPTED
        `operation_type=buy_number` application). Per Plivo's Buy-a-Number REST API the
        compliance app is passed as a TOP-LEVEL `compliance_application_id`; if omitted
        Plivo auto-selects your most recent applicable accepted application. The typed
        SDK `numbers.buy()` doesn't expose this field, so we call the request layer.
        """
        if settings.MOCK_PHONE_NUMBERS:
            log.info("MOCK: skipping Plivo number purchase", phone_number=phone_number)
            return {
                "provider_sid": f"MOCK_{phone_number.lstrip('+')}",
                "phone_number": phone_number,
                "friendly_name": phone_number,
                "capabilities": {"voice": True, "sms": True, "mms": False},
            }

        number_path = phone_number.lstrip("+")

        try:
            params: dict = {}
            if bundle_sid:
                params["compliance_application_id"] = bundle_sid
            # POST /Account/{id}/PhoneNumber/{number}/ — same call the SDK's buy() makes,
            # but lets us pass compliance_application_id (empty params => Plivo auto-selects).
            self.client.request('POST', ('PhoneNumber', number_path), params)
        except Exception as exc:
            raise RuntimeError(f"Plivo provision failed: {exc}") from exc

        # Route inbound calls to us: Plivo dispatches incoming calls via an Application
        # (answer_url), NOT via answer_url on the number. Point the number at our shared
        # "Vaaniq_Inbound" app.
        app_id = self._ensure_inbound_app()
        if app_id:
            try:
                self.client.numbers.update(number=number_path, app_id=app_id)
            except Exception as exc:
                log.warning("Could not assign inbound app to Plivo number",
                            number=phone_number, error=str(exc))

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
