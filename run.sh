#!/usr/bin/env sh
# FinalForge launcher for macOS / Linux / Git Bash.
set -e
cd "$(dirname "$0")"
PY=".venv/bin/python"
[ -x "$PY" ] || PY=".venv/Scripts/python.exe"
if [ ! -x "$PY" ]; then
  python3 -m venv .venv 2>/dev/null || python -m venv .venv
  PY=".venv/bin/python"; [ -x "$PY" ] || PY=".venv/Scripts/python.exe"
  "$PY" -m pip install --upgrade pip
  "$PY" -m pip install -r requirements.txt
fi
PORT="${1:-8000}"
echo "FinalForge: http://localhost:$PORT"
exec "$PY" -m uvicorn app.main:app --port "$PORT"
