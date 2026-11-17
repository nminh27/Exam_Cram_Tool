"""AI provider settings.

Cramtoolfinal can run in two modes:
  * API mode: one or more AI providers are configured (Anthropic Claude natively, or any
    OpenAI-compatible API: OpenAI, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together,
    or a local model through Ollama / LM Studio). The app analyzes materials by itself.
  * Claude Code mode: no provider; Claude Code builds courses (docs/CLAUDE_CODE_WORKFLOW.md).

Provider records live in data/settings.json (git-ignored). API keys never go there: each key is an
environment variable in .env (also git-ignored) and is never sent back to the browser.
"""
from __future__ import annotations

import copy
import os
import re
import threading

from . import config, storage

_lock = threading.RLock()

PRESETS: list[dict] = [
    {"preset": "anthropic", "label": "Anthropic Claude", "type": "anthropic", "base_url": "",
     "model": "claude-opus-5-5", "needs_key": True, "concurrency": 4,
     "note": "Recommended. Cramtoolfinal's prompts are written for Claude, and it reads PDFs (formulas, diagrams) natively."},
    {"preset": "openai", "label": "OpenAI", "type": "openai", "base_url": "https://api.openai.com/v1",
     "needs_key": True, "concurrency": 4, "note": "Use a vision-capable model so scanned pages can be read."},
    {"preset": "gemini", "label": "Google Gemini", "type": "openai",
     "base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "needs_key": True, "concurrency": 4,
     "note": "Key from Google AI Studio. Uses Gemini's OpenAI-compatible endpoint."},
    {"preset": "openrouter", "label": "OpenRouter (many models, one key)", "type": "openai",
     "base_url": "https://openrouter.ai/api/v1", "needs_key": True, "concurrency": 4,
     "note": "One key for models from many companies, including some free ones."},
    {"preset": "groq", "label": "Groq", "type": "openai", "base_url": "https://api.groq.com/openai/v1",
     "needs_key": True, "concurrency": 2},
    {"preset": "deepseek", "label": "DeepSeek", "type": "openai", "base_url": "https://api.deepseek.com/v1",
     "needs_key": True, "concurrency": 4, "note": "Text-only models: scanned (image-only) PDF pages can't be read."},
    {"preset": "mistral", "label": "Mistral", "type": "openai", "base_url": "https://api.mistral.ai/v1",
     "needs_key": True, "concurrency": 4},
    {"preset": "xai", "label": "xAI Grok", "type": "openai", "base_url": "https://api.x.ai/v1",
     "needs_key": True, "concurrency": 4},
    {"preset": "together", "label": "Together AI", "type": "openai", "base_url": "https://api.together.xyz/v1",
     "needs_key": True, "concurrency": 4},
    {"preset": "ollama", "label": "Ollama (local, free)", "type": "openai", "base_url": "http://localhost:11434/v1",
     "needs_key": False, "concurrency": 1,
     "note": "Runs on your computer, no key or cost. Small local models give much weaker breakdowns."},
    {"preset": "lmstudio", "label": "LM Studio (local, free)", "type": "openai", "base_url": "http://localhost:1234/v1",
     "needs_key": False, "concurrency": 1, "note": "Start LM Studio's local server first."},
    {"preset": "custom", "label": "Other OpenAI-compatible API", "type": "openai", "base_url": "",
     "needs_key": True, "concurrency": 2, "note": "Any service with an OpenAI-style /chat/completions endpoint."},
]
PRESETS_BY_ID = {p["preset"]: p for p in PRESETS}

FIELDS = ("id", "preset", "type", "label", "base_url", "model", "pdf_mode", "max_output_tokens",
          "reasoning", "concurrency", "price_in", "price_out")


def _default() -> dict:
    s = {"providers": [], "main": None, "quick": None}
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        s["providers"].append(_normalize({"id": "anthropic", "preset": "anthropic", "model": config.MODEL}))
        s["main"] = "anthropic"
    return s


def _normalize(rec: dict) -> dict:
    preset = PRESETS_BY_ID.get(rec.get("preset") or "custom", PRESETS_BY_ID["custom"])
    out = {
        "id": rec.get("id") or preset["preset"],
        "preset": preset["preset"],
        "type": preset["type"],
        "label": (rec.get("label") or preset["label"]).strip()[:60],
        "base_url": (rec.get("base_url") if rec.get("base_url") is not None else preset["base_url"]).strip().rstrip("/"),
        "model": (rec.get("model") or preset.get("model") or "").strip(),
        "pdf_mode": rec.get("pdf_mode") if rec.get("pdf_mode") in ("auto", "text", "images") else "auto",
        "max_output_tokens": max(0, int(rec.get("max_output_tokens") or 0)),
        "reasoning": bool(rec.get("reasoning")),
        "concurrency": max(1, min(16, int(rec.get("concurrency") or preset.get("concurrency", 2)))),
        "price_in": max(0.0, float(rec.get("price_in") or 0)),
        "price_out": max(0.0, float(rec.get("price_out") or 0)),
    }
    return out


def load() -> dict:
    with _lock:
        s = storage.read_json(config.SETTINGS_FILE)
        if not s or not s.get("providers"):
            return _default()  # also picks up an ANTHROPIC_API_KEY added to .env by hand
        s["providers"] = [_normalize(p) for p in s.get("providers", [])]
        ids = {p["id"] for p in s["providers"]}
        if s.get("main") not in ids:
            s["main"] = None
        if s.get("quick") not in ids:
            s["quick"] = None
        return s


def save(s: dict) -> None:
    with _lock:
        storage.write_json(config.SETTINGS_FILE, s)


def key_var(rec: dict) -> str:
    if rec["type"] == "anthropic" and rec["id"] == "anthropic":
        return "ANTHROPIC_API_KEY"
    return "FINALFORGE_KEY_" + re.sub(r"[^A-Z0-9]", "_", rec["id"].upper())


def get_key(rec: dict) -> str | None:
    return os.environ.get(key_var(rec)) or None


def needs_key(rec: dict) -> bool:
    return PRESETS_BY_ID.get(rec["preset"], {}).get("needs_key", True)


def is_ready(rec: dict | None) -> bool:
    if not rec or not rec.get("model") or (rec["type"] == "openai" and not rec.get("base_url")):
        return False
    if key_var(rec) == "ANTHROPIC_API_KEY" and os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return True
    return bool(get_key(rec)) or not needs_key(rec)


def resolve(role: str = "main") -> dict | None:
    """The provider record to use for a role: 'main' (analysis) or 'quick' (marking, explanations)."""
    s = load()
    by_id = {p["id"]: p for p in s["providers"]}
    pid = s.get("quick") if role == "quick" and s.get("quick") else s.get("main")
    rec = by_id.get(pid)
    return rec if is_ready(rec) else None


def public() -> dict:
    """Settings for the browser: no keys, only whether one is stored and its last 4 characters."""
    s = load()
    provs = []
    for p in s["providers"]:
        k = get_key(p)
        provs.append({**p, "has_key": bool(k), "key_hint": f"…{k[-4:]}" if k else "", "ready": is_ready(p),
                      "needs_key": needs_key(p)})
    return {"providers": provs, "main": s["main"], "quick": s["quick"], "presets": PRESETS,
            "mode": "api" if resolve("main") else "claude_code"}


def upsert(data: dict) -> dict:
    with _lock:
        s = load()
        existing = next((p for p in s["providers"] if p["id"] == data.get("id")), None)
        if existing:
            rec = _normalize({**existing, **{k: v for k, v in data.items() if k in FIELDS and k not in ("id", "preset", "type")}})
        else:
            preset = data.get("preset") or "custom"
            base = re.sub(r"[^a-z0-9]+", "-", preset.lower()).strip("-") or "provider"
            pid, n = base, 2
            taken = {p["id"] for p in s["providers"]}
            while pid in taken:
                pid, n = f"{base}-{n}", n + 1
            rec = _normalize({**{k: v for k, v in data.items() if k in FIELDS}, "id": pid, "preset": preset})
            s["providers"].append(rec)
        s["providers"] = [rec if p["id"] == rec["id"] else p for p in s["providers"]]
        key = data.get("api_key")
        if isinstance(key, str) and key.strip():
            config.set_env_var(key_var(rec), key.strip())
        if s.get("main") is None:
            s["main"] = rec["id"]
        save(s)
        return rec


def remove(pid: str) -> None:
    with _lock:
        s = load()
        rec = next((p for p in s["providers"] if p["id"] == pid), None)
        if not rec:
            raise KeyError(pid)
        s["providers"] = [p for p in s["providers"] if p["id"] != pid]
        if s.get("main") == pid:
            s["main"] = None
        if s.get("quick") == pid:
            s["quick"] = None
        config.set_env_var(key_var(rec), None)
        save(s)


def set_roles(main: str | None, quick: str | None) -> dict:
    with _lock:
        s = load()
        ids = {p["id"] for p in s["providers"]}
        s["main"] = main if main in ids else None
        s["quick"] = quick if quick in ids else None
        save(s)
        return s


def get(pid: str) -> dict:
    rec = next((p for p in load()["providers"] if p["id"] == pid), None)
    if not rec:
        raise KeyError(pid)
    return copy.deepcopy(rec)
