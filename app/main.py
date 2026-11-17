"""FinalForge HTTP API + static web UI.

Run with:  python -m uvicorn app.main:app --port 8000   (or run.bat / run.ps1)
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config, ingest, llm, packkit, pipeline, settings, storage
from .providers import make_provider

app = FastAPI(title=config.APP_NAME)

MAX_UPLOAD_BYTES = 150 * 1024 * 1024


@app.exception_handler(KeyError)
async def _not_found(_: Request, exc: KeyError):
    return JSONResponse({"detail": f"Not found: {exc}"}, status_code=404)


@app.exception_handler(llm.LLMError)
async def _llm_error(_: Request, exc: llm.LLMError):
    return JSONResponse({"detail": str(exc)}, status_code=502)


@app.exception_handler(RuntimeError)
async def _conflict(_: Request, exc: RuntimeError):
    return JSONResponse({"detail": str(exc)}, status_code=409)


# ------------------------------------------------------------------ settings

@app.get("/api/health")
def health() -> dict:
    p = llm.provider("main")
    q = llm.provider("quick")
    return {"ok": True, "app": config.APP_NAME,
            "ai_available": p is not None,
            "api_key_configured": p is not None,  # kept for older UI code
            "mode": "api" if p else "claude_code",
            "provider": p.rec["label"] if p else None, "model": p.model if p else None,
            "quick_provider": q.label if q else None,
            "native_pdf": p.native_pdf if p else None}


@app.get("/api/settings")
def get_settings() -> dict:
    return settings.public()


@app.post("/api/settings/providers")
def save_provider(payload: dict = Body(...)) -> dict:
    if payload.get("preset") and payload["preset"] not in settings.PRESETS_BY_ID:
        raise HTTPException(400, "Unknown provider preset")
    rec = settings.upsert(payload)
    return {"saved": rec["id"], "settings": settings.public()}


@app.delete("/api/settings/providers/{pid}")
def delete_provider(pid: str) -> dict:
    settings.remove(pid)
    return settings.public()


@app.post("/api/settings/roles")
def set_roles(payload: dict = Body(...)) -> dict:
    settings.set_roles(payload.get("main") or None, payload.get("quick") or None)
    return settings.public()


@app.post("/api/settings/models")
def list_models(payload: dict = Body(...)) -> dict:
    """Models available to a saved provider, or to an unsaved one described in the payload."""
    if payload.get("id"):
        rec = settings.get(payload["id"])
        key = str(payload.get("api_key") or "") or settings.get_key(rec)
    else:
        rec = settings._normalize({k: v for k, v in payload.items() if k in settings.FIELDS})
        key = str(payload.get("api_key") or "") or None
    if rec["type"] == "openai" and not rec["base_url"]:
        raise HTTPException(400, "Enter the API base URL first.")
    return {"models": make_provider(rec, key).list_models()}


@app.post("/api/settings/providers/{pid}/test")
def test_provider(pid: str) -> dict:
    rec = settings.get(pid)
    if not settings.is_ready(rec):
        raise HTTPException(400, "Add a model (and a key, if this provider needs one) first.")
    prov = make_provider(rec, settings.get_key(rec))
    t0 = time.time()
    out = llm.structured("You are a connection test.", "Reply with answer = \"ok\" and the number 2+2 as sum.",
                         TEST_SCHEMA, effort="low", max_tokens=2000, prov=prov)
    return {"ok": out.get("answer", "").strip().lower() == "ok" and int(out.get("sum", 0)) == 4,
            "reply": out, "seconds": round(time.time() - t0, 1), "label": prov.label}


TEST_SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}, "sum": {"type": "integer"}},
               "required": ["answer", "sum"], "additionalProperties": False}


# ------------------------------------------------------------------ courses

@app.get("/api/courses")
def courses() -> list[dict]:
    return storage.list_courses()


@app.post("/api/courses")
def create_course(payload: dict = Body(...)) -> dict:
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(400, "Course name is required")
    return storage.create_course(name, str(payload.get("description", "")))


@app.get("/api/courses/{cid}")
def course(cid: str) -> dict:
    meta = storage.get_course(cid)
    kn = storage.get_knowledge(cid)
    meta["stats"] = storage.knowledge_stats(kn)
    meta["job"] = pipeline.job_status(cid)
    meta["analyzed_at"] = kn.get("generated_at")
    return meta


@app.patch("/api/courses/{cid}")
def patch_course(cid: str, payload: dict = Body(...)) -> dict:
    return storage.update_course(cid, **payload)


@app.delete("/api/courses/{cid}")
def delete_course(cid: str) -> dict:
    if pipeline.is_running(cid):
        raise HTTPException(409, "Wait for the running job to finish first.")
    storage.delete_course(cid)
    return {"deleted": cid}


# ------------------------------------------------------------------ materials

@app.post("/api/courses/{cid}/materials")
async def upload(cid: str, files: list[UploadFile] = File(...), kind: str = Form("notes")) -> list[dict]:
    storage.get_course(cid)
    added = []
    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        if ext not in ingest.SUPPORTED_EXT:
            raise HTTPException(400, f"{f.filename}: unsupported type. Use PDF, images, DOCX, PPTX or text.")
        data = await f.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(400, f"{f.filename} is larger than 150 MB")
        added.append(storage.add_material(cid, f.filename or "file", data, kind))
    return added


@app.patch("/api/courses/{cid}/materials/{mid}")
def patch_material(cid: str, mid: str, payload: dict = Body(...)) -> dict:
    return storage.update_material(cid, mid, **{k: v for k, v in payload.items() if k == "kind"})


@app.delete("/api/courses/{cid}/materials/{mid}")
def delete_material(cid: str, mid: str) -> dict:
    storage.delete_material(cid, mid)
    return {"deleted": mid}


@app.get("/api/courses/{cid}/materials/{mid}/file")
def material_file(cid: str, mid: str):
    meta = storage.get_course(cid)
    m = next((m for m in meta["materials"] if m["id"] == mid), None)
    if not m:
        raise KeyError(mid)
    return FileResponse(storage.material_path(cid, m), filename=m["filename"])


@app.get("/api/courses/{cid}/materials/{mid}/digest")
def material_digest(cid: str, mid: str) -> dict:
    d = storage.get_digest(cid, mid)
    if d is None:
        raise KeyError(mid)
    return d


# ------------------------------------------------------------------ analysis jobs

def _require_key() -> None:
    if not llm.ai_available():
        raise HTTPException(400, "No AI provider is set up. Add one in Settings, or ask Claude Code to build the course.")


@app.post("/api/courses/{cid}/analyze")
def analyze(cid: str, payload: dict = Body(default={})) -> dict:
    _require_key()
    opts = {
        "force_digest": bool(payload.get("force_digest", False)),
        "force_deep": bool(payload.get("force_deep", False)),
        "variants": max(0, min(8, int(payload.get("variants", 3)))),
        "verify": bool(payload.get("verify", True)),
    }
    return pipeline.start_job(cid, "analyze", opts)


@app.get("/api/courses/{cid}/job")
def job(cid: str) -> dict:
    return pipeline.job_status(cid) or {}


@app.post("/api/courses/{cid}/problems/more")
def more_problems(cid: str, payload: dict = Body(...)) -> dict:
    _require_key()
    return pipeline.start_job(cid, "more_problems", {
        "pattern_id": str(payload["pattern_id"]), "n": max(1, min(6, int(payload.get("n", 3)))),
        "verify": bool(payload.get("verify", True))})


# ------------------------------------------------------------------ knowledge + tutoring

@app.get("/api/courses/{cid}/knowledge")
def knowledge(cid: str) -> dict:
    storage.get_course(cid)
    return storage.get_knowledge(cid)


@app.post("/api/courses/{cid}/explain")
def explain(cid: str, payload: dict = Body(...)) -> dict:
    _require_key()
    md = pipeline.explain_simpler(cid, str(payload["concept_id"]), str(payload.get("snippet", "")),
                                  str(payload.get("message", "")))
    return {"markdown": md}


@app.post("/api/courses/{cid}/grade")
def grade(cid: str, payload: dict = Body(...)) -> dict:
    _require_key()
    storage.get_course(cid)
    return pipeline.grade_text(str(payload.get("context", "")), str(payload.get("prompt", "")),
                               str(payload.get("model", "")), str(payload.get("answer", "")))


@app.post("/api/courses/{cid}/mcqs/more")
def more_mcqs(cid: str, payload: dict = Body(...)) -> dict:
    _require_key()
    new = pipeline.more_mcqs(cid, str(payload["concept_id"]), max(2, min(12, int(payload.get("n", 6)))))
    return {"added": new}


# ------------------------------------------------------------------ progress

@app.get("/api/courses/{cid}/progress")
def progress(cid: str) -> dict:
    storage.get_course(cid)
    return storage.get_progress(cid)


@app.post("/api/courses/{cid}/progress")
def add_progress(cid: str, payload: dict = Body(...)) -> dict:
    storage.get_course(cid)
    events = payload.get("events", [])
    if not isinstance(events, list):
        raise HTTPException(400, "events must be a list")
    return {"count": storage.add_events(cid, events)}


@app.delete("/api/courses/{cid}/progress")
def reset_progress(cid: str) -> dict:
    storage.reset_progress(cid)
    return {"reset": True}


# ------------------------------------------------------------------ import / export packs

PACK_FORMAT = packkit.PACK_FORMAT


@app.get("/api/courses/{cid}/export")
def export_pack(cid: str):
    meta = storage.get_course(cid)
    pack = {"format": PACK_FORMAT, "version": 1, "name": meta["name"],
            "description": meta.get("description", ""), "knowledge": storage.get_knowledge(cid)}
    return JSONResponse(pack, headers={
        "Content-Disposition": f'attachment; filename="{storage.slugify(meta["name"])}.finalforge.json"'})


def _import_pack(pack: dict[str, Any], name: str | None = None) -> dict:
    if pack.get("format") != PACK_FORMAT or "knowledge" not in pack:
        raise HTTPException(400, "Not a FinalForge knowledge pack")
    errors, _ = packkit.validate(pack)
    if errors:
        raise HTTPException(400, "Pack has errors: " + "; ".join(errors[:5]) + (" …" if len(errors) > 5 else ""))
    meta = storage.create_course(name or pack.get("name") or "Imported course", pack.get("description", ""))
    kn = storage.empty_knowledge()
    kn.update(packkit.finalize(pack["knowledge"]))
    storage.save_knowledge(meta["id"], kn)
    return meta


@app.post("/api/import")
async def import_pack(file: UploadFile = File(...)) -> dict:
    try:
        pack = json.loads((await file.read()).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise HTTPException(400, f"Could not read pack: {e}") from e
    return _import_pack(pack)


@app.post("/api/demo")
def load_demo() -> dict:
    pack = json.loads((config.SAMPLES_DIR / "demo_pack.json").read_text(encoding="utf-8"))
    return _import_pack(pack)


# ------------------------------------------------------------------ static UI (must be last)

app.mount("/", StaticFiles(directory=config.WEB_DIR, html=True), name="web")
