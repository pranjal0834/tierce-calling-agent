#!/bin/sh
set -e

echo "Running database migrations..."
python ./backend/wait_for_db.py
alembic upgrade head

echo "Starting Tierce Voice Agent..."
exec uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
