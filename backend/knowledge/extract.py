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


_SKIP_EXT = re.compile(
    r"\.(pdf|jpe?g|png|gif|svg|webp|ico|zip|rar|gz|mp4|mp3|wav|avi|mov|css|js|woff2?|ttf|eot|xml|json)(\?|$)",
    re.I,
)


async def crawl_url(start_url: str, max_pages: int = 20) -> tuple[str, str]:
    """
    Crawl a website starting at `start_url`, following SAME-DOMAIN internal links
    (breadth-first) up to `max_pages`, and return (title, combined_text) where each
    page's text is under a "# <page title>" heading. This is what lets the knowledge
    base actually answer about services/contact/about pages, not just the homepage.
    Raises only if the FIRST page fails (so the doc is marked failed); later page
    failures are skipped silently.
    """
    from urllib.parse import urljoin, urlparse, urldefrag

    if not start_url.startswith(("http://", "https://")):
        start_url = "https://" + start_url
    base_host = urlparse(start_url).netloc.lower().replace("www.", "")

    def _norm(u: str) -> str:
        return urldefrag(u)[0].rstrip("/")

    seen: set[str] = set()
    queue: list[str] = [start_url]
    pages: list[str] = []
    first_title = None
    headers = {"User-Agent": "Mozilla/5.0 (compatible; VaaniqBot/1.0; +knowledge-base)"}

    async with httpx.AsyncClient(follow_redirects=True, timeout=20, headers=headers) as client:
        while queue and len(pages) < max_pages:
            url = queue.pop(0)
            n = _norm(url)
            if n in seen:
                continue
            seen.add(n)
            try:
                resp = await client.get(url)
                if resp.status_code != 200 or "html" not in resp.headers.get("content-type", "").lower():
                    continue
                html = resp.text
            except Exception as exc:
                if first_title is None:   # first page failed → let caller mark it failed
                    raise
                log.debug("crawl: skipping page", url=url, error=str(exc)[:80])
                continue

            tm = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
            ptitle = (tm.group(1).strip() if tm else url)[:200]
            if first_title is None:
                first_title = ptitle
            text = _strip_html(html).strip()
            if len(text) > 50:
                pages.append(f"# {ptitle}\n{text}")

            # Enqueue same-domain internal links.
            for href in re.findall(r'(?is)href=["\']([^"\']+)["\']', html):
                link = urljoin(url, href.strip())
                p = urlparse(link)
                if p.scheme not in ("http", "https"):
                    continue
                if p.netloc.lower().replace("www.", "") != base_host:
                    continue
                if _SKIP_EXT.search(link):
                    continue
                if _norm(link) not in seen:
                    queue.append(link)

    combined = "\n\n".join(pages)
    log.info("crawl complete", start=start_url, pages=len(pages), chars=len(combined))
    return (first_title or start_url), combined
