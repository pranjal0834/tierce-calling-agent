FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source, alembic migration folder, and ini from project root
COPY backend/ ./backend/
COPY alembic/ ./alembic/
COPY alembic.ini .

RUN chmod +x ./backend/start.sh

EXPOSE 8000
CMD ["sh", "./backend/start.sh"]
