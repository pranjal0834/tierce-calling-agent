"""
Text chunking — split long documents into overlapping passages for embedding.
"""
import re

CHUNK_SIZE = 1000        # target characters per chunk
CHUNK_OVERLAP = 150      # characters of overlap between consecutive chunks


def clean_text(text: str) -> str:
    """Normalize whitespace while preserving paragraph breaks."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse 3+ newlines to 2, and runs of spaces/tabs to one space
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Split text into chunks of ~`size` chars, breaking on paragraph/sentence
    boundaries where possible, with `overlap` chars carried between chunks.
    """
    text = clean_text(text)
    if not text:
        return []
    if len(text) <= size:
        return [text]

    # Split into paragraphs first, then pack into chunks
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    buf = ""

    def flush():
        nonlocal buf
        if buf.strip():
            chunks.append(buf.strip())
        buf = ""

    for para in paragraphs:
        if len(para) > size:
            # Paragraph itself is too big — hard-split it by sentences/length
            flush()
            sentences = re.split(r"(?<=[.!?])\s+", para)
            for sent in sentences:
                if len(buf) + len(sent) + 1 > size:
                    flush()
                    # carry overlap
                    if chunks and overlap > 0:
                        buf = chunks[-1][-overlap:] + " "
                buf += sent + " "
            flush()
        else:
            if len(buf) + len(para) + 2 > size:
                flush()
                if chunks and overlap > 0:
                    buf = chunks[-1][-overlap:] + "\n\n"
            buf += para + "\n\n"
    flush()

    return [c for c in chunks if c.strip()]
