"""AI provider adapters. Every adapter turns the same request (system blocks, user content blocks,
optional JSON schema, effort) into one model call and returns the text output.

* AnthropicProvider: official Anthropic SDK; PDFs are sent natively; prompt caching; structured outputs.
* OpenAICompatProvider: any OpenAI-style /chat/completions API (OpenAI, Gemini, OpenRouter, Groq,
  DeepSeek, Mistral, xAI, Together, Ollama, LM Studio...). PDFs are converted to page text and page
  images before sending. JSON output degrades gracefully: json_schema -> json_object -> instructions.
"""
from __future__ import annotations

import base64
import json
import re
import threading
import time
from typing import Any

import anthropic
import httpx

from . import config


class LLMError(Exception):
    pass


class Usage:
    """Thread-safe token counter with an approximate dollar cost (None when prices are unknown)."""

    def __init__(self, prices: dict | None = None) -> None:
        self._lock = threading.Lock()
        self.prices = prices  # {"in", "out", "cache_read", "cache_write"} USD per million tokens
        self.input = self.output = self.cache_read = self.cache_write = self.calls = 0

    def add_counts(self, input_: int = 0, output: int = 0, cache_read: int = 0, cache_write: int = 0) -> None:
        with self._lock:
            self.calls += 1
            self.input += input_ or 0
            self.output += output or 0
            self.cache_read += cache_read or 0
            self.cache_write += cache_write or 0

    def add(self, u: Any) -> None:  # an Anthropic usage object
        self.add_counts(getattr(u, "input_tokens", 0), getattr(u, "output_tokens", 0),
                        getattr(u, "cache_read_input_tokens", 0), getattr(u, "cache_creation_input_tokens", 0))

    def cost(self) -> float | None:
        p = self.prices
        if not p or not (p.get("in") or p.get("out")):
            return None
        return (self.input * p["in"] + self.output * p["out"] + self.cache_read * p.get("cache_read", p["in"])
                + self.cache_write * p.get("cache_write", p["in"])) / 1_000_000

    def as_dict(self) -> dict:
        c = self.cost()
        return {"calls": self.calls, "input_tokens": self.input, "output_tokens": self.output,
                "cache_read_tokens": self.cache_read, "cache_write_tokens": self.cache_write,
                "approx_cost_usd": round(c, 4) if c is not None else None}


def _texts(system: list[dict] | str) -> str:
    if isinstance(system, str):
        return system
    return "\n\n".join(b.get("text", "") for b in system)


class BaseProvider:
    native_pdf = False

    def __init__(self, rec: dict, key: str | None):
        self.rec = rec
        self.key = key
        self.model = rec["model"]
        self.concurrency = rec.get("concurrency", 2)
        self.pdf_mode = rec.get("pdf_mode", "auto")

    @property
    def label(self) -> str:
        return f"{self.rec['label']} · {self.model}"

    def prices(self) -> dict | None:
        if self.rec.get("price_in") or self.rec.get("price_out"):
            return {"in": self.rec["price_in"], "out": self.rec["price_out"]}
        return None

    def call(self, system, content, *, schema: dict | None, effort: str, max_tokens: int,
             usage: Usage | None) -> str:
        raise NotImplementedError

    def list_models(self) -> list[str]:
        raise NotImplementedError


# ====================================================================== Anthropic

_anthropic_clients: dict[str, anthropic.Anthropic] = {}
_anthropic_lock = threading.Lock()
_fallbacks_ok = True  # flipped off if the API rejects the refusal-fallback parameter


class AnthropicProvider(BaseProvider):
    native_pdf = True

    def client(self) -> anthropic.Anthropic:
        with _anthropic_lock:
            k = self.key or ""
            if k not in _anthropic_clients:
                _anthropic_clients[k] = anthropic.Anthropic(api_key=self.key, max_retries=5) if self.key \
                    else anthropic.Anthropic(max_retries=5)
            return _anthropic_clients[k]

    def prices(self) -> dict | None:
        p = super().prices()
        if p:
            return {**p, "cache_read": p["in"] * 0.1, "cache_write": p["in"] * 2}
        if self.model == "claude-opus-5-5":
            return {"in": config.PRICE_INPUT, "out": config.PRICE_OUTPUT,
                    "cache_read": config.PRICE_CACHE_READ, "cache_write": config.PRICE_CACHE_WRITE}
        return None

    def call(self, system, content, *, schema, effort, max_tokens, usage):
        global _fallbacks_ok
        output_config: dict[str, Any] = {"effort": effort}
        if schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": schema}
        kwargs: dict[str, Any] = dict(model=self.model, max_tokens=max_tokens, system=system,
                                      messages=[{"role": "user", "content": content}], output_config=output_config)
        try:
            if config.USE_FALLBACKS and _fallbacks_ok:
                try:
                    with self.client().beta.messages.stream(
                            betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs) as stream:
                        msg = stream.get_final_message()
                except anthropic.BadRequestError:
                    # Retry once without the refusal fallback; if that works, stop sending it.
                    with self.client().messages.stream(**kwargs) as stream:
                        msg = stream.get_final_message()
                    _fallbacks_ok = False
            else:
                with self.client().messages.stream(**kwargs) as stream:
                    msg = stream.get_final_message()
        except anthropic.AuthenticationError as e:
            raise LLMError("Anthropic rejected the API key. Check it in Settings.") from e
        except anthropic.NotFoundError as e:
            raise LLMError(f"Model '{self.model}' was not found. Pick another in Settings.") from e
        except anthropic.BadRequestError as e:
            raise LLMError(f"Bad request: {e.message}") from e
        except anthropic.RateLimitError as e:
            raise LLMError("Rate limited by the API even after retries. Lower the parallel calls in Settings or try later.") from e
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

    def list_models(self) -> list[str]:
        try:
            return [m.id for m in self.client().models.list()]
        except anthropic.AuthenticationError as e:
            raise LLMError("Anthropic rejected the API key.") from e
        except anthropic.APIError as e:
            raise LLMError(f"Could not list models: {e}") from e


# ====================================================================== OpenAI-compatible

_json_mode_cache: dict[tuple[str, str], str] = {}
JSON_MODES = ["json_schema", "json_object", "prompt"]


def _effort_to_reasoning(effort: str) -> str:
    return {"low": "low", "medium": "medium"}.get(effort, "high")


class OpenAICompatProvider(BaseProvider):
    native_pdf = False

    def __init__(self, rec: dict, key: str | None, transport: httpx.BaseTransport | None = None):
        super().__init__(rec, key)
        self.base_url = rec["base_url"].rstrip("/")
        self._transport = transport

    def _client(self, timeout: float = 900.0) -> httpx.Client:
        headers = {"Content-Type": "application/json"}
        if self.key:
            headers["Authorization"] = f"Bearer {self.key}"
        return httpx.Client(base_url=self.base_url, headers=headers, timeout=timeout, transport=self._transport)

    @staticmethod
    def convert_content(content: list[dict] | str) -> list[dict] | str:
        """Anthropic-style content blocks -> OpenAI chat content parts."""
        if isinstance(content, str):
            return content
        parts: list[dict] = []
        for b in content:
            t = b.get("type")
            if t == "text":
                parts.append({"type": "text", "text": b["text"]})
            elif t == "image" and b["source"].get("type") == "base64":
                parts.append({"type": "image_url", "image_url": {
                    "url": f"data:{b['source']['media_type']};base64,{b['source']['data']}"}})
            elif t == "document":
                src = b["source"]
                title = b.get("title", "document")
                if src.get("type") == "text":
                    parts.append({"type": "text", "text": f"<document title=\"{title}\">\n{src['data']}\n</document>"})
                elif src.get("media_type") == "application/pdf":
                    from .ingest import pdf_bytes_to_text  # rare: a native PDF reached a non-native provider
                    parts.append({"type": "text", "text": f"<document title=\"{title}\">\n"
                                  f"{pdf_bytes_to_text(base64.b64decode(src['data']))}\n</document>"})
        if all(p["type"] == "text" for p in parts):
            return "\n\n".join(p["text"] for p in parts)  # plain string: works with text-only models too
        return parts

    def _body(self, system: str, content, schema: dict | None, mode: str, effort: str) -> dict:
        sys_text = system
        if schema is not None and mode != "json_schema":
            sys_text += ("\n\nRespond with ONLY one JSON object, no prose and no code fences, that matches "
                         "this JSON Schema exactly (every property present):\n" + json.dumps(schema))
        body: dict[str, Any] = {"model": self.model, "messages": [
            {"role": "system", "content": sys_text},
            {"role": "user", "content": self.convert_content(content)},
        ]}
        if schema is not None and mode == "json_schema":
            body["response_format"] = {"type": "json_schema",
                                       "json_schema": {"name": "output", "schema": schema, "strict": True}}
        elif schema is not None and mode == "json_object":
            body["response_format"] = {"type": "json_object"}
        if self.rec.get("max_output_tokens"):
            key = "max_completion_tokens" if "api.openai.com" in self.base_url else "max_tokens"
            body[key] = self.rec["max_output_tokens"]
        if self.rec.get("reasoning"):
            body["reasoning_effort"] = _effort_to_reasoning(effort)
        return body

    def _post(self, body: dict) -> httpx.Response:
        delay = 2.0
        for attempt in range(5):
            try:
                with self._client() as c:
                    r = c.post("/chat/completions", json=body)
            except httpx.ConnectError as e:
                raise LLMError(f"Could not reach {self.base_url}. Is the service running / the URL right?") from e
            except httpx.TimeoutException as e:
                if attempt == 4:
                    raise LLMError(f"{self.rec['label']} timed out.") from e
                time.sleep(delay)
                delay *= 2
                continue
            if r.status_code in (429, 500, 502, 503, 504, 529) and attempt < 4:
                ra = r.headers.get("retry-after")
                time.sleep(min(60.0, float(ra)) if ra and ra.replace(".", "", 1).isdigit() else delay)
                delay *= 2
                continue
            return r
        return r

    @staticmethod
    def _error_text(r: httpx.Response) -> str:
        try:
            j = r.json()
            e = j.get("error", j) if isinstance(j, dict) else j
            if isinstance(e, list) and e:
                e = e[0].get("error", e[0]) if isinstance(e[0], dict) else e[0]
            return (e.get("message") if isinstance(e, dict) else str(e)) or r.text[:300]
        except ValueError:
            return r.text[:300]

    def call(self, system, content, *, schema, effort, max_tokens, usage):
        sys_text = _texts(system)
        cache_key = (self.base_url, self.model)
        modes = JSON_MODES[JSON_MODES.index(_json_mode_cache.get(cache_key, "json_schema")):] if schema else ["none"]
        last_err = ""
        for mode in modes:
            r = self._post(self._body(sys_text, content, schema, mode, effort))
            if r.status_code in (401, 403):
                raise LLMError(f"{self.rec['label']} rejected the API key ({r.status_code}): {self._error_text(r)}")
            if r.status_code == 404:
                raise LLMError(f"{self.rec['label']}: model '{self.model}' or endpoint not found: {self._error_text(r)}")
            if r.status_code in (400, 422) and schema is not None and mode != "prompt":
                last_err = self._error_text(r)
                continue  # this API doesn't take this JSON mode: try the next, simpler one
            if r.status_code >= 400:
                raise LLMError(f"{self.rec['label']} error {r.status_code}: {self._error_text(r)}")
            if schema is not None:
                _json_mode_cache[cache_key] = mode
            return self._parse(r, usage)
        raise LLMError(f"{self.rec['label']} refused every JSON output mode. Last error: {last_err}")

    def _parse(self, r: httpx.Response, usage: Usage | None) -> str:
        data = r.json()
        u = data.get("usage") or {}
        if usage is not None:
            cached = ((u.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)
            usage.add_counts(max(0, (u.get("prompt_tokens") or 0) - cached), u.get("completion_tokens") or 0, cached, 0)
        choices = data.get("choices") or []
        if not choices:
            raise LLMError(f"{self.rec['label']} returned no answer: {str(data)[:300]}")
        ch = choices[0]
        msg = ch.get("message") or {}
        if msg.get("refusal"):
            raise LLMError(f"The model declined: {msg['refusal']}")
        if ch.get("finish_reason") == "length":
            raise LLMError("Output was cut off (length limit). Raise 'max output tokens' in Settings or use a model with a larger output.")
        c = msg.get("content")
        if isinstance(c, list):
            c = "".join(p.get("text", "") for p in c if isinstance(p, dict))
        return c or ""

    def list_models(self) -> list[str]:
        try:
            with self._client(timeout=30) as c:
                r = c.get("/models")
        except httpx.HTTPError as e:
            raise LLMError(f"Could not reach {self.base_url}: {e}") from e
        if r.status_code >= 400:
            raise LLMError(f"Could not list models ({r.status_code}): {self._error_text(r)}")
        data = r.json()
        items = data.get("data", data.get("models", [])) if isinstance(data, dict) else data
        ids = [(m.get("id") or m.get("name", "")) if isinstance(m, dict) else str(m) for m in items]
        return sorted(i.removeprefix("models/") for i in ids if i)


# ====================================================================== JSON helpers

def extract_json(text: str) -> Any:
    """Parse JSON from a model answer, tolerating code fences or a sentence around it."""
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    start = t.find("{")
    end = t.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(t[start:end + 1])
        except json.JSONDecodeError as e:
            raise LLMError(f"The model's answer was not valid JSON: {e}") from e
    raise LLMError("The model's answer contained no JSON object.")


def conform(value: Any, schema: dict) -> Any:
    """Fill in anything a less strict model left out so downstream code always sees the full shape."""
    t = schema.get("type")
    if "enum" in schema:
        return value if value in schema["enum"] else schema["enum"][0]
    if t == "object":
        v = value if isinstance(value, dict) else {}
        return {k: conform(v.get(k), sub) for k, sub in schema.get("properties", {}).items()}
    if t == "array":
        return [conform(x, schema["items"]) for x in value] if isinstance(value, list) else []
    if t == "string":
        return value if isinstance(value, str) else ("" if value is None else str(value))
    if t == "integer":
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0
    if t == "number":
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0
    if t == "boolean":
        return value if isinstance(value, bool) else str(value).lower() in ("true", "1", "yes")
    return value


def make_provider(rec: dict, key: str | None) -> BaseProvider:
    if rec["type"] == "anthropic":
        return AnthropicProvider(rec, key)
    return OpenAICompatProvider(rec, key)
