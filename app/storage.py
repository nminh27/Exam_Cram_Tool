"""File-based storage. One folder per course:

data/courses/<course_id>/
    course.json        metadata + material list
    materials/         uploaded files
    digests/<mid>.json per-material extraction (cached so re-analysis is cheap)
    knowledge.json     the "knowledge pack": concepts, patterns, MCQs, problems
    progress.json      the learner's attempt history
    job.json           latest analysis job state
"""
from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import threading
import time
from pathlib import Path
from typing import Any

from . import config

_locks: dict[str, threading.RLock] = {}
_locks_guard = threading.Lock()


def lock_for(course_id: str) -> threading.RLock:
    with _locks_guard:
        if course_id not in _locks:
            _locks[course_id] = threading.RLock()
        return _locks[course_id]


def now() -> float:
    return time.time()


def slugify(text: str, max_len: int = 40) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return (s[:max_len].strip("-")) or "course"


def new_id(prefix: str) -> str:
    return f"{prefix}{secrets.token_hex(4)}"


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".{secrets.token_hex(3)}.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def _safe_id(course_id: str) -> str:
    if not re.fullmatch(r"[a-z0-9-]{1,80}", course_id or ""):
        raise KeyError("invalid course id")
    return course_id


def course_dir(course_id: str) -> Path:
    return config.COURSES_DIR / _safe_id(course_id)


# ---------------------------------------------------------------- courses

def list_courses() -> list[dict]:
    out = []
    if not config.COURSES_DIR.exists():
        return out
    for d in sorted(config.COURSES_DIR.iterdir()):
        meta = read_json(d / "course.json")
        if not meta:
            continue
        kn = read_json(d / "knowledge.json") or {}
        meta = dict(meta)
        meta["stats"] = knowledge_stats(kn)
        out.append(meta)
    out.sort(key=lambda m: m.get("created_at", 0), reverse=True)
    return out


def knowledge_stats(kn: dict) -> dict:
    return {
        "concepts": len(kn.get("concepts", [])),
        "patterns": len(kn.get("patterns", [])),
        "mcqs": len(kn.get("mcqs", [])),
        "problems": len(kn.get("problems", [])),
    }


def create_course(name: str, description: str = "") -> dict:
    base = slugify(name)
    cid = f"{base}-{secrets.token_hex(2)}"
    meta = {
        "id": cid,
        "name": name.strip() or "Untitled course",
        "description": description.strip(),
        "created_at": now(),
        "materials": [],
    }
    write_json(course_dir(cid) / "course.json", meta)
    return meta


def get_course(course_id: str) -> dict:
    meta = read_json(course_dir(course_id) / "course.json")
    if meta is None:
        raise KeyError(course_id)
    return meta


def save_course(meta: dict) -> None:
    write_json(course_dir(meta["id"]) / "course.json", meta)


def update_course(course_id: str, **fields) -> dict:
    with lock_for(course_id):
        meta = get_course(course_id)
        for k, v in fields.items():
            if k in ("name", "description") and isinstance(v, str):
                meta[k] = v
        save_course(meta)
        return meta


def delete_course(course_id: str) -> None:
    d = course_dir(course_id)
    if d.exists():
        shutil.rmtree(d)


# ---------------------------------------------------------------- materials

MATERIAL_KINDS = ["notes", "slides", "textbook", "past_paper", "solutions", "problem_set", "other"]


def add_material(course_id: str, filename: str, data: bytes, kind: str) -> dict:
    from .ingest import page_count  # local import to keep storage dependency-light

    if kind not in MATERIAL_KINDS:
        kind = "other"
    safe_name = re.sub(r"[^\w.\- ()]+", "_", Path(filename).name)[:120] or "file"
    mid = new_id("m")
    with lock_for(course_id):
        meta = get_course(course_id)
        mdir = course_dir(course_id) / "materials"
        mdir.mkdir(parents=True, exist_ok=True)
        stored = f"{mid}__{safe_name}"
        (mdir / stored).write_bytes(data)
        entry = {
            "id": mid,
            "filename": safe_name,
            "stored_as": stored,
            "kind": kind,
            "size": len(data),
            "pages": page_count(mdir / stored),
            "uploaded_at": now(),
            "digested": False,
        }
        meta["materials"].append(entry)
        save_course(meta)
        return entry


def update_material(course_id: str, material_id: str, **fields) -> dict:
    with lock_for(course_id):
        meta = get_course(course_id)
        for m in meta["materials"]:
            if m["id"] == material_id:
                if "kind" in fields and fields["kind"] in MATERIAL_KINDS:
                    if m["kind"] != fields["kind"]:
                        m["kind"] = fields["kind"]
                        m["digested"] = False  # kind changes how the file is read
                for k in ("digested", "digest_error"):
                    if k in fields:
                        m[k] = fields[k]
                save_course(meta)
                return m
        raise KeyError(material_id)


def delete_material(course_id: str, material_id: str) -> None:
    with lock_for(course_id):
        meta = get_course(course_id)
        keep = []
        for m in meta["materials"]:
            if m["id"] == material_id:
                p = course_dir(course_id) / "materials" / m["stored_as"]
                if p.exists():
                    p.unlink()
                dg = course_dir(course_id) / "digests" / f"{material_id}.json"
                if dg.exists():
                    dg.unlink()
            else:
                keep.append(m)
        meta["materials"] = keep
        save_course(meta)


def material_path(course_id: str, material: dict) -> Path:
    return course_dir(course_id) / "materials" / material["stored_as"]


def get_digest(course_id: str, material_id: str) -> dict | None:
    return read_json(course_dir(course_id) / "digests" / f"{material_id}.json")


def save_digest(course_id: str, material_id: str, digest: dict) -> None:
    write_json(course_dir(course_id) / "digests" / f"{material_id}.json", digest)


# ---------------------------------------------------------------- knowledge / progress / jobs

def get_knowledge(course_id: str) -> dict:
    return read_json(course_dir(course_id) / "knowledge.json") or empty_knowledge()


def empty_knowledge() -> dict:
    return {
        "version": 1,
        "course": {"title": "", "overview_md": ""},
        "topics": [],
        "concepts": [],
        "patterns": [],
        "mcqs": [],
        "guided": {},
        "problems": [],
        "learning_path": [],
        "uncovered_questions": [],
        "generated_at": None,
        "model": None,
    }


def save_knowledge(course_id: str, kn: dict) -> None:
    with lock_for(course_id):
        write_json(course_dir(course_id) / "knowledge.json", kn)


def get_progress(course_id: str) -> dict:
    return read_json(course_dir(course_id) / "progress.json") or {"events": []}


def add_events(course_id: str, events: list[dict]) -> int:
    with lock_for(course_id):
        prog = get_progress(course_id)
        for e in events:
            e = {k: e[k] for k in e if k in (
                "ts", "kind", "item_id", "concept_ids", "pattern_id", "result", "score", "meta")}
            e.setdefault("ts", now())
            prog["events"].append(e)
        write_json(course_dir(course_id) / "progress.json", prog)
        return len(prog["events"])


def reset_progress(course_id: str) -> None:
    with lock_for(course_id):
        write_json(course_dir(course_id) / "progress.json", {"events": []})


def get_job(course_id: str) -> dict | None:
    return read_json(course_dir(course_id) / "job.json")


def save_job(course_id: str, job: dict) -> None:
    write_json(course_dir(course_id) / "job.json", job)
