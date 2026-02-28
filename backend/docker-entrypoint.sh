#!/bin/bash
set -e

echo "Running Alembic migrations..."
alembic upgrade head

echo "Starting FastAPI server..."
exec fastapi run app/main.py --host 0.0.0.0 --port 8000
