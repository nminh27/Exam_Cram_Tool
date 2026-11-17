"""File ingestion and HTTP API tests (no API key needed)."""
from __future__ import annotations

import io
import json

import pytest
from fastapi.testclient import TestClient

from app import config, ingest


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "COURSES_DIR", tmp_path / "courses")
    monkeypatch.setattr(config, "SETTINGS_FILE", tmp_path / "settings.json")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    from app.main import app
    return TestClient(app)


def _pdf(pages: int) -> bytes:
    from pypdf import PdfWriter
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def test_pdf_chunking(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PDF_CHUNK_PAGES", 50)
    small = tmp_path / "small.pdf"
    small.write_bytes(_pdf(10))
    big = tmp_path / "big.pdf"
    big.write_bytes(_pdf(120))
    assert ingest.page_count(big) == 120
    assert len(ingest.material_chunks(small, "small")) == 1
    chunks = ingest.material_chunks(big, "big")
    assert [c["label"] for c in chunks] == ["big (pages 1-50)", "big (pages 51-100)", "big (pages 101-120)"]
    assert chunks[0]["blocks"][0]["source"]["media_type"] == "application/pdf"


def test_docx_and_pptx_text(tmp_path):
    import docx
    from pptx import Presentation
    from pptx.util import Inches

    d = docx.Document()
    d.add_paragraph("Newton's second law: F = ma")
    d.save(tmp_path / "n.docx")
    text = ingest.material_chunks(tmp_path / "n.docx", "n")[0]["blocks"][0]["source"]["data"]
    assert "F = ma" in text

    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[5])
    s.shapes.title.text = "Projectile motion"
    s.shapes.add_textbox(Inches(1), Inches(2), Inches(4), Inches(1)).text_frame.text = "x = u t"
    prs.save(tmp_path / "s.pptx")
    text = ingest.material_chunks(tmp_path / "s.pptx", "s")[0]["blocks"][0]["source"]["data"]
    assert "Slide 1" in text and "Projectile motion" in text and "x = u t" in text


def test_api_flow(client):
    h = client.get("/api/health").json()
    assert h["ai_available"] is False and h["mode"] == "claude_code"
    assert client.get("/api/settings").json()["providers"] == []
    c = client.post("/api/courses", json={"name": "Calculus I"}).json()
    cid = c["id"]
    r = client.post(f"/api/courses/{cid}/materials", data={"kind": "past_paper"},
                    files=[("files", ("final 2023.pdf", _pdf(3), "application/pdf"))])
    assert r.status_code == 200, r.text
    m = r.json()[0]
    assert m["kind"] == "past_paper" and m["pages"] == 3
    # unsupported type rejected
    r = client.post(f"/api/courses/{cid}/materials", data={"kind": "notes"},
                    files=[("files", ("virus.exe", b"MZ", "application/octet-stream"))])
    assert r.status_code == 400
    # analysis refuses without a key
    assert client.post(f"/api/courses/{cid}/analyze", json={}).status_code == 400
    # kind change resets "digested"
    assert client.patch(f"/api/courses/{cid}/materials/{m['id']}", json={"kind": "notes"}).json()["kind"] == "notes"
    # progress round-trip
    client.post(f"/api/courses/{cid}/progress", json={"events": [{"kind": "mcq", "item_id": "q1", "concept_ids": ["c-x"], "score": 1, "evil": "dropped"}]})
    ev = client.get(f"/api/courses/{cid}/progress").json()["events"]
    assert len(ev) == 1 and "evil" not in ev[0] and "ts" in ev[0]
    # export / import
    pack = client.get(f"/api/courses/{cid}/export").json()
    assert pack["format"] == "finalforge-pack"
    r = client.post("/api/import", files=[("file", ("p.json", json.dumps(pack).encode(), "application/json"))])
    assert r.status_code == 200
    # demo pack loads
    demo = client.post("/api/demo").json()
    kn = client.get(f"/api/courses/{demo['id']}/knowledge").json()
    assert len(kn["concepts"]) == 7 and len(kn["problems"]) == 8
    # bad ids are rejected, not used as paths
    assert client.get("/api/courses/..%2F..%2Fetc").status_code == 404
    assert client.delete(f"/api/courses/{cid}").json() == {"deleted": cid}


def test_demo_pack_integrity():
    pack = json.loads((config.SAMPLES_DIR / "demo_pack.json").read_text(encoding="utf-8"))
    kn = pack["knowledge"]
    cids = {c["id"] for c in kn["concepts"]}
    for p in kn["problems"]:
        for part in p["parts"]:
            for s in part["steps"]:
                assert set(s["concept_ids"]) <= cids, s["id"]
                if s["answer_type"] in ("choice", "multi"):
                    assert s["correct_choices"] and max(s["correct_choices"]) < len(s["choices"])
                if s["answer_type"] == "numeric":
                    assert isinstance(s["numeric_answer"], float | int)
    for q in kn["mcqs"]:
        assert 0 <= q["correct"] < len(q["options"]) == len(q["option_explanations"])
        assert set(q["concept_ids"]) <= cids
