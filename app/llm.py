"""Routes model calls to the configured AI provider (see app/settings.py and app/providers.py).

Roles: "main" does the analysis (reading materials, building the course); "quick" handles short
interactive tasks (marking a written answer, "break it down further"). Quick falls back to main.
"""
from __future__ import annotations

from typing import Any

from . import settings
from .providers import BaseProvider, LLMError, Usage, conform, extract_json, make_provider

__all__ = ["LLMError", "Usage", "provider", "ai_available", "cached_system", "call", "structured", "usage_for"]


def provider(role: str = "main") -> BaseProvider | None:
    rec = settings.resolve(role)
    if rec is None:
        return None
    return make_provider(rec, settings.get_key(rec))


def ai_available() -> bool:
    return settings.resolve("main") is not None


def require(role: str = "main") -> BaseProvider:
    p = provider(role)
    if p is None:
        raise LLMError("No AI provider is set up. Add one in Settings, or ask Claude Code to build the course.")
    return p


def usage_for(role: str = "main") -> Usage:
    p = provider(role)
    return Usage(p.prices() if p else None)


def cached_system(base: str, corpus: str | None = None) -> list[dict]:
    """System prompt as blocks. The (large, stable) corpus gets a 1h cache breakpoint so the many
    per-concept / per-pattern calls in one analysis run reuse it cheaply (Anthropic; other providers
    receive the same text and apply their own automatic prefix caching where they have it)."""
    blocks: list[dict] = [{"type": "text", "text": base}]
    if corpus:
        blocks.append({"type": "text", "text": corpus, "cache_control": {"type": "ephemeral", "ttl": "1h"}})
    return blocks


def call(system: list[dict] | str, content: list[dict] | str, *, schema: dict | None = None,
         effort: str = "high", max_tokens: int = 64000, usage: Usage | None = None, role: str = "main",
         prov: BaseProvider | None = None) -> str:
    p = prov or require(role)
    return p.call(system, content, schema=schema, effort=effort, max_tokens=max_tokens, usage=usage)


def structured(system, content, schema: dict, **kw: Any) -> dict:
    text = call(system, content, schema=schema, **kw)
    return conform(extract_json(text), schema)
