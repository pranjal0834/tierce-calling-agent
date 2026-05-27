"""
Phone number normalization to E.164 format.
Assumes Indian (+91) numbers when no country code is present.
"""
import re


def normalize_phone(raw: str) -> str:
    """
    Convert any phone number string to E.164 format.

    Examples (Indian numbers):
        7572900482        → +917572900482
        +91 7572900482    → +917572900482
        +917572900482     → +917572900482
        07572900482       → +917572900482
        917572900482      → +917572900482
    """
    if not raw:
        return raw

    # Strip everything except digits and leading +
    cleaned = re.sub(r"[^\d+]", "", raw.strip())

    if cleaned.startswith("+"):
        # Already has country code prefix — just remove whitespace/formatting
        return "+" + re.sub(r"\D", "", cleaned)

    digits = re.sub(r"\D", "", cleaned)

    if len(digits) == 10:
        # Bare 10-digit number — assume India
        return f"+91{digits}"

    if len(digits) == 11 and digits.startswith("0"):
        # Indian trunk prefix (0XXXXXXXXXX)
        return f"+91{digits[1:]}"

    if len(digits) == 12 and digits.startswith("91"):
        # 91XXXXXXXXXX — India without +
        return f"+{digits}"

    # Unknown format — return as-is with + prefix if no + present
    return f"+{digits}" if digits else raw
