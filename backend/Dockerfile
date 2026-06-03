FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Knowledge-base PDF extraction + OCR (separate layers to keep heavy deps cached)
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir pymupdf==1.24.14 pytesseract==0.3.13 pillow==11.0.0

# Copy backend source, alembic migration folder, and ini from project root
COPY backend/ ./backend/
COPY alembic/ ./alembic/
COPY alembic.ini .

RUN chmod +x ./backend/start.sh

EXPOSE 8000
CMD ["sh", "./backend/start.sh"]
