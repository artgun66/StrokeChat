#!/usr/bin/env bash
set -e
SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SERVICE_DIR/.venv"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "Creating venv…"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip --quiet
  "$VENV/bin/pip" install -r "$SERVICE_DIR/requirements.txt" --quiet
  echo "Dependencies installed."
fi

exec "$VENV/bin/uvicorn" app:app --host 127.0.0.1 --port 8001 --app-dir "$SERVICE_DIR"
