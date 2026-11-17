"""Provider layer tests: OpenAI-compatible adapter against a fake server, settings store, portable PDFs."""
from __future__ import annotations

import io
import json
import os

import httpx
import pytest

from app import config, ingest, providers, settings
from app.providers import LLMError, OpenAICompatProvider, Usage, conform, extract_json

SCHEMA = {"type": "object", "additionalProperties": False, "required": ["answer", "items", "n"],
          "properties": {"answer": {"type": "string"}, "items": {"type": "array", "items": {"type": "string"}},
                         "n": {"type": "integer"}}}


def rec(**kw):
    base = {"id": "fake", "preset": "custom", "type": "openai", "label": "Fake", "base_url": "http://fake/v1",
            "model": "m1", "pdf_mode": "auto", "max_output_tokens": 0, "reasoning": False, "concurrency": 1,
            "price_in": 1.0, "price_out": 2.0}
    base.update(kw)
    return base


def reply(content, usage=None, finish="stop"):
    return httpx.Response(200, json={"choices": [{"message": {"content": content}, "finish_reason": finish}],
                                     "usage": usage or {"prompt_tokens": 100, "completion_tokens": 20,
                                                        "prompt_tokens_details": {"cached_tokens": 40}}})


@pytest.fixture(autouse=True)
def clear_mode_cache():
    providers._json_mode_cache.clear()


def test_json_schema_mode_and_content_conversion():
    seen = []

    def handler(req: httpx.Request):
        seen.append(json.loads(req.content))
        assert req.headers["authorization"] == "Bearer k123"
        return reply('{"answer": "ok", "items": ["a"], "n": 3}')

    p = OpenAICompatProvider(rec(), "k123", transport=httpx.MockTransport(handler))
    u = Usage(p.prices())
    content = [{"type": "text", "text": "hi"},
               {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}},
               {"type": "document", "source": {"type": "text", "media_type": "text/plain", "data": "notes"}, "title": "L1"}]
    sysblocks = [{"type": "text", "text": "base"}, {"type": "text", "text": "corpus", "cache_control": {"type": "ephemeral"}}]
    out = p.call(sysblocks, content, schema=SCHEMA, effort="high", max_tokens=1000, usage=u)
    assert json.loads(out)["n"] == 3
    body = seen[0]
    assert body["response_format"]["type"] == "json_schema"
    assert body["messages"][0] == {"role": "system", "content": "base\n\ncorpus"}
    parts = body["messages"][1]["content"]
    assert parts[1] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}}
    assert "notes" in parts[2]["text"]
    assert "reasoning_effort" not in body and "max_tokens" not in body
    assert (u.input, u.output, u.cache_read) == (60, 20, 40)
    assert u.as_dict()["approx_cost_usd"] == pytest.approx((60 * 1 + 20 * 2 + 40 * 1) / 1e6, abs=1e-4)


def test_falls_back_to_prompt_json_and_remembers():
    modes = []

    def handler(req: httpx.Request):
        body = json.loads(req.content)
        mode = body.get("response_format", {}).get("type", "prompt")
        modes.append(mode)
        if mode != "prompt":
            return httpx.Response(400, json={"error": {"message": f"{mode} not supported"}})
        assert "JSON Schema" in body["messages"][0]["content"]
        assert isinstance(body["messages"][1]["content"], str)  # text-only content is sent as a plain string
        return reply('Sure! ```json\n{"answer": "ok"}\n```')

    p = OpenAICompatProvider(rec(reasoning=True, max_output_tokens=500), None, transport=httpx.MockTransport(handler))
    out = conform(extract_json(p.call("s", "q", schema=SCHEMA, effort="low", max_tokens=1, usage=None)), SCHEMA)
    assert out == {"answer": "ok", "items": [], "n": 0}
    assert modes == ["json_schema", "json_object", "prompt"]
    p.call("s", "q", schema=SCHEMA, effort="low", max_tokens=1, usage=None)
    assert modes[-1] == "prompt" and len(modes) == 4  # remembered: no more failing attempts


def test_errors_are_explained():
    p = OpenAICompatProvider(rec(), "bad", transport=httpx.MockTransport(
        lambda r: httpx.Response(401, json={"error": {"message": "invalid key"}})))
    with pytest.raises(LLMError, match="rejected the API key"):
        p.call("s", "q", schema=None, effort="high", max_tokens=1, usage=None)
    p = OpenAICompatProvider(rec(), "k", transport=httpx.MockTransport(lambda r: reply("{", finish="length")))
    with pytest.raises(LLMError, match="cut off"):
        p.call("s", "q", schema=None, effort="high", max_tokens=1, usage=None)


def test_list_models():
    p = OpenAICompatProvider(rec(), "k", transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"data": [{"id": "z-model"}, {"id": "models/a-model"}]})))
    assert p.list_models() == ["a-model", "z-model"]


def test_extract_json_and_conform():
    assert extract_json('noise {"a": 1} trailing') == {"a": 1}
    with pytest.raises(LLMError):
        extract_json("no json here")
    s = {"type": "object", "properties": {"k": {"type": "string", "enum": ["x", "y"]}, "b": {"type": "boolean"}},
         "required": ["k", "b"], "additionalProperties": False}
    assert conform({"k": "nope", "b": "true", "extra": 1}, s) == {"k": "x", "b": True}


@pytest.fixture()
def tmp_settings(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "SETTINGS_FILE", tmp_path / "settings.json")
    monkeypatch.setattr(config, "ENV_FILE", tmp_path / ".env")
    for k in list(os.environ):
        if k.startswith("FINALFORGE_KEY_") or k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
            monkeypatch.delenv(k)
    return tmp_path


def test_settings_store(tmp_settings):
    assert settings.public()["mode"] == "claude_code"
    r1 = settings.upsert({"preset": "openrouter", "model": "some/model", "api_key": "sk-or-secret-1234"})
    assert r1["id"] == "openrouter" and r1["base_url"] == "https://openrouter.ai/api/v1"
    pub = settings.public()
    assert pub["mode"] == "api" and pub["main"] == "openrouter"
    assert pub["providers"][0]["key_hint"] == "…1234"
    assert "secret" not in json.dumps(pub) and "secret" not in (tmp_settings / "settings.json").read_text()
    assert "FINALFORGE_KEY_OPENROUTER=sk-or-secret-1234" in (tmp_settings / ".env").read_text()

    r2 = settings.upsert({"preset": "ollama", "model": "llama3"})  # local: no key needed
    assert settings.is_ready(r2)
    settings.set_roles("openrouter", r2["id"])
    assert settings.resolve("quick")["id"] == "ollama" and settings.resolve("main")["id"] == "openrouter"

    settings.upsert({"id": "openrouter", "model": "other/model"})  # edit keeps the key
    assert settings.get_key(settings.get("openrouter")) == "sk-or-secret-1234"
    settings.remove("openrouter")
    assert settings.resolve("main") is None and "FINALFORGE_KEY_OPENROUTER" not in (tmp_settings / ".env").read_text()


def test_settings_default_from_env(tmp_settings, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-x")
    s = settings.public()
    assert s["main"] == "anthropic" and s["providers"][0]["model"] == "claude-opus-5-5"


def _text_pdf_plus_blank() -> bytes:
    stream = b"BT /F1 14 Tf 20 100 Td (Newton second law: F equals m times a, always.) Tj ET"
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    raw, offsets = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offsets.append(len(raw))
        raw += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(raw)
    raw += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    raw += b"".join(b"%010d 00000 n \n" % off for off in offsets)
    raw += b"trailer << /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    from pypdf import PdfReader, PdfWriter
    w = PdfWriter()
    w.add_page(PdfReader(io.BytesIO(raw)).pages[0])
    w.add_blank_page(width=200, height=200)  # a "scanned" page with no text layer
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def test_portable_pdf(tmp_path):
    f = tmp_path / "paper.pdf"
    f.write_bytes(_text_pdf_plus_blank())
    blocks = ingest.material_chunks(f, "paper", native_pdf=False, pdf_mode="auto")[0]["blocks"]
    assert blocks[0]["type"] == "text" and "Newton second law" in blocks[0]["text"]
    assert blocks[1]["text"].endswith("(image) ===") and blocks[2]["type"] == "image"
    text_only = ingest.material_chunks(f, "paper", native_pdf=False, pdf_mode="text")[0]["blocks"]
    assert all(b["type"] == "text" for b in text_only)
    native = ingest.material_chunks(f, "paper", native_pdf=True)[0]["blocks"]
    assert native[0]["type"] == "document"
