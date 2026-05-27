#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting Tierce Voice Agent..."
exec uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
