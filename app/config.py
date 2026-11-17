"""Runtime configuration. Values come from environment variables or the project's .env file."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
load_dotenv(ENV_FILE)

APP_NAME = "FinalForge"

# Claude model used for every stage. Opus 5.5 is the current default Opus model.
MODEL = os.environ.get("FINALFORGE_MODEL", "claude-opus-5-5")

# Effort per stage (low | medium | high | xhigh | max). Extraction and problem generation
# are accuracy-critical, so they run at "high". Grading free-text answers is quick work.
EFFORT_EXTRACT = os.environ.get("FINALFORGE_EFFORT_EXTRACT", "high")
EFFORT_TUTOR = os.environ.get("FINALFORGE_EFFORT_TUTOR", "medium")
EFFORT_GRADE = os.environ.get("FINALFORGE_EFFORT_GRADE", "low")

# How many Claude calls may run in parallel during analysis.
CONCURRENCY = int(os.environ.get("FINALFORGE_CONCURRENCY", "4"))

# Server-side refusal fallback (re-runs a declined request on a fallback model).
USE_FALLBACKS = os.environ.get("FINALFORGE_FALLBACKS", "1") not in ("0", "false", "no")

DATA_DIR = Path(os.environ.get("FINALFORGE_DATA_DIR", ROOT / "data"))
COURSES_DIR = DATA_DIR / "courses"
WEB_DIR = ROOT / "web"
SAMPLES_DIR = ROOT / "samples"

# PDFs larger than this many pages are split into chunks before being sent to Claude.
PDF_CHUNK_PAGES = int(os.environ.get("FINALFORGE_PDF_CHUNK_PAGES", "60"))
PDF_MAX_BYTES_PER_REQUEST = 24 * 1024 * 1024

# Approximate Opus 5.5 prices (USD per million tokens) for the cost meter.
PRICE_INPUT = 4.0
PRICE_OUTPUT = 20.0
PRICE_CACHE_READ = 0.20
PRICE_CACHE_WRITE = 8.0  # 1-hour TTL writes


def api_key_configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def save_api_key(key: str) -> None:
    """Persist the key the user typed in Settings to .env (never committed: .env is gitignored)."""
    key = key.strip()
    lines: list[str] = []
    if ENV_FILE.exists():
        lines = [ln for ln in ENV_FILE.read_text(encoding="utf-8").splitlines()
                 if not ln.startswith("ANTHROPIC_API_KEY=")]
    lines.append(f"ANTHROPIC_API_KEY={key}")
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.environ["ANTHROPIC_API_KEY"] = key
