"""
Extract plain text from different document sources: PDF bytes, web URLs, raw text.
"""
import io
import re

import httpx
import structlog

log = structlog.get_logger()


def extract_pdf(data: bytes) -> str:
    """
    Extract text from PDF bytes. Tries PyMuPDF (best quality), falls back to pypdf.
    Returns "" for scanned/image-only PDFs that have no text layer.
    """
    # 1. PyMuPDF (fitz) — strongest text extraction
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=data, filetype="pdf")
        parts = [page.get_text("text") or "" for page in doc]
        doc.close()
        text = "\n\n".join(parts).strip()
        if text:
            return text
    except Exception as exc:
        log.warning("PyMuPDF extraction failed, falling back to pypdf", error=str(exc))

    # 2. Fallback: pypdf
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                continue
        text = "\n\n".join(parts).strip()
        if text:
            return text
    except Exception as exc:
        log.warning("pypdf extraction failed", error=str(exc))

    # 3. OCR fallback — for scanned / image-only PDFs (no text layer)
    return _ocr_pdf(data)


OCR_MAX_PAGES = 50   # cap to avoid runaway OCR on huge scans
OCR_DPI = 200


def _ocr_pdf(data: bytes) -> str:
    """Render each page to an image and OCR it with Tesseract."""
    try:
        import fitz  # PyMuPDF for rendering
        import pytesseract
        from PIL import Image

        doc = fitz.open(stream=data, filetype="pdf")
        parts: list[str] = []
        for i, page in enumerate(doc):
            if i >= OCR_MAX_PAGES:
                break
            pix = page.get_pixmap(dpi=OCR_DPI)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            try:
                parts.append(pytesseract.image_to_string(img) or "")
            except Exception as exc:
                log.warning("OCR failed on page", page=i, error=str(exc))
        doc.close()
        text = "\n\n".join(parts).strip()
        if text:
            log.info("PDF extracted via OCR", pages=len(parts), chars=len(text))
        return text
    except Exception as exc:
        log.warning("OCR extraction failed", error=str(exc))
        return ""


def _strip_html(html: str) -> str:
    """Very small HTML → text cleaner (no extra deps)."""
    # Drop script/style/head/nav/footer blocks entirely
    html = re.sub(r"(?is)<(script|style|head|nav|footer|noscript)[^>]*>.*?</\1>", " ", html)
    # Convert common block tags to newlines
    html = re.sub(r"(?i)<(/?(p|div|br|li|h[1-6]|tr|section|article))[^>]*>", "\n", html)
    # Remove all remaining tags
    html = re.sub(r"(?s)<[^>]+>", " ", html)
    # Decode a few common entities
    for ent, ch in {"&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
                    "&quot;": '"', "&#39;": "'", "&rsquo;": "’", "&mdash;": "—"}.items():
        html = html.replace(ent, ch)
    html = re.sub(r"&#\d+;", " ", html)
    return html


async def extract_url(url: str) -> tuple[str, str]:
    """
    Fetch a URL and return (title, text).
    Raises on network/HTTP errors so the caller can mark the doc failed.
    """
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        resp = await client.get(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; VaaniqBot/1.0; +knowledge-base)"
        })
        resp.raise_for_status()
        html = resp.text

    title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    title = (title_match.group(1).strip() if title_match else url)[:300]
    text = _strip_html(html)
    return title, text
