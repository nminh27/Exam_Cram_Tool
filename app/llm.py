"""Thin wrapper around the Anthropic SDK: streamed calls, structured JSON output, usage/cost tracking."""
from __future__ import annotations

import json
import threading
from typing import Any

import anthropic

from . import config


class LLMError(Exception):
    pass


_client: anthropic.Anthropic | None = None
_client_lock = threading.Lock()
_fallbacks_ok = True  # flipped off if the API rejects the refusal-fallback parameter


def client() -> anthropic.Anthropic:
    global _client
    with _client_lock:
        if _client is None:
            if not config.api_key_configured():
                raise LLMError("No Anthropic API key configured. Add it in Settings (or set ANTHROPIC_API_KEY in .env).")
            _client = anthropic.Anthropic(max_retries=5)
        return _client


def reset_client() -> None:
    global _client
    with _client_lock:
        _client = None


class Usage:
    """Thread-safe token counter with an approximate dollar cost."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.input = 0
        self.output = 0
        self.cache_read = 0
        self.cache_write = 0
        self.calls = 0

    def add(self, u: Any) -> None:
        with self._lock:
            self.calls += 1
            self.input += getattr(u, "input_tokens", 0) or 0
            self.output += getattr(u, "output_tokens", 0) or 0
            self.cache_read += getattr(u, "cache_read_input_tokens", 0) or 0
            self.cache_write += getattr(u, "cache_creation_input_tokens", 0) or 0

    def cost(self) -> float:
        return (self.input * config.PRICE_INPUT + self.output * config.PRICE_OUTPUT
                + self.cache_read * config.PRICE_CACHE_READ
                + self.cache_write * config.PRICE_CACHE_WRITE) / 1_000_000

    def as_dict(self) -> dict:
        return {"calls": self.calls, "input_tokens": self.input, "output_tokens": self.output,
                "cache_read_tokens": self.cache_read, "cache_write_tokens": self.cache_write,
                "approx_cost_usd": round(self.cost(), 4)}


def cached_system(base: str, corpus: str | None = None) -> list[dict]:
    """System prompt as blocks. The (large, stable) corpus gets a 1h cache breakpoint so the
    many per-concept / per-pattern calls in one analysis run reuse it cheaply."""
    blocks: list[dict] = [{"type": "text", "text": base}]
    if corpus:
        blocks.append({"type": "text", "text": corpus, "cache_control": {"type": "ephemeral", "ttl": "1h"}})
    return blocks


def call(system: list[dict] | str, content: list[dict] | str, *, schema: dict | None = None,
         effort: str = "high", max_tokens: int = 64000, usage: Usage | None = None) -> str:
    """One streamed request. Returns the concatenated text output.

    Streaming is used for every call so long outputs never hit HTTP timeouts.
    """
    output_config: dict[str, Any] = {"effort": effort}
    if schema is not None:
        output_config["format"] = {"type": "json_schema", "schema": schema}
    kwargs: dict[str, Any] = dict(
        model=config.MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": content}],
        output_config=output_config,
    )
    global _fallbacks_ok
    try:
        if config.USE_FALLBACKS and _fallbacks_ok:
            try:
                with client().beta.messages.stream(
                        betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs) as stream:
                    msg = stream.get_final_message()
            except anthropic.BadRequestError:
                # Retry once without the refusal fallback; if that works, stop sending it.
                with client().messages.stream(**kwargs) as stream:
                    msg = stream.get_final_message()
                _fallbacks_ok = False
        else:
            with client().messages.stream(**kwargs) as stream:
                msg = stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise LLMError("Anthropic rejected the API key. Check it in Settings.") from e
    except anthropic.BadRequestError as e:
        raise LLMError(f"Bad request: {e.message}") from e
    except anthropic.RateLimitError as e:
        raise LLMError("Rate limited by the API even after retries. Lower FINALFORGE_CONCURRENCY or try later.") from e
    except anthropic.APIStatusError as e:
        raise LLMError(f"API error {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise LLMError("Could not reach the Anthropic API (network).") from e

    if usage is not None:
        usage.add(msg.usage)
    if msg.stop_reason == "refusal":
        details = getattr(msg, "stop_details", None)
        raise LLMError(f"Claude declined this request ({getattr(details, 'category', None) or 'no category'}).")
    if msg.stop_reason == "max_tokens":
        raise LLMError("Output was cut off at max_tokens; the material chunk is too large for one call.")
    return "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")


def structured(system, content, schema: dict, **kw) -> dict:
    text = call(system, content, schema=schema, **kw)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise LLMError(f"Claude returned invalid JSON: {e}") from e
