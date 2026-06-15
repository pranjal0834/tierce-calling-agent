"""
WhatsApp message templates — defined in code now, registered in Meta later.

Each template defines:
  meta_name : the template name you'll register in Meta WhatsApp Manager for production.
  text(...) : free-form rendering used in dev mode / inside the 24h customer window.
  params(...): the ORDERED body variables Meta expects ({{1}}, {{2}}, ...).

In dev (WHATSAPP_USE_TEMPLATES=false) we send text(...). In production
(WHATSAPP_USE_TEMPLATES=true) we send the Meta template by meta_name with params(...).
When you create the Meta template, match its body to the text below, e.g.:

  appointment_confirmation:
    "Hello {{1}}! Your appointment with {{2}} is confirmed for {{3}}. "
    "We look forward to speaking with you. Reply here if you need to reschedule."
"""


class AppointmentConfirmation:
    meta_name = "appointment_confirmation"

    @staticmethod
    def text(name: str = "", when: str = "", business: str = "") -> str:
        return (
            f"Hello {name or 'there'}! Your appointment with {business or 'us'} is confirmed "
            f"for {when}. We look forward to speaking with you. Reply here if you need to reschedule."
        )

    @staticmethod
    def params(name: str = "", when: str = "", business: str = "") -> list[str]:
        # Order must match the Meta template body placeholders {{1}}, {{2}}, {{3}}
        return [name or "there", business or "us", when]


class InfoMessage:
    """Generic 'here is the info you asked for' template — used by the in-call
    send_whatsapp tool. Business-initiated messages must be templates, so the
    caller-requested content goes into a body variable ({{3}}).

    Meta template to register (utility category):
      info_message:
        "Hi {{1}}, here is the information you requested from {{2}}:\n\n{{3}}"
    """
    meta_name = "info_message"

    @staticmethod
    def text(content: str = "", name: str = "", business: str = "") -> str:
        return content or ""

    @staticmethod
    def params(content: str = "", name: str = "", business: str = "") -> list[str]:
        # Order must match the Meta template body placeholders {{1}}, {{2}}, {{3}}
        return [name or "there", business or "us", content]
