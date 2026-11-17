"""The knowledge pipeline: materials -> digests -> knowledge map -> concept breakdowns ->
exam pattern kits + scaffolded problems -> independent verification.

Every stage saves as it goes, so a failed or interrupted run can be resumed without paying
for finished work again.
"""
from __future__ import annotations

import json
import re
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable

from . import config, ingest, llm, prompts, schemas, storage

_running: set[str] = set()
_running_lock = threading.Lock()


# ====================================================================== job bookkeeping

class Job:
    def __init__(self, course_id: str, kind: str, opts: dict):
        self.course_id = course_id
        self.usage = llm.Usage()
        self._lock = threading.Lock()
        self.state: dict[str, Any] = {
            "id": storage.new_id("j"),
            "kind": kind,
            "status": "running",
            "stage": "starting",
            "progress": {"done": 0, "total": 0},
            "log": [],
            "errors": 0,
            "started_at": storage.now(),
            "finished_at": None,
            "error": None,
            "usage": {},
            "opts": opts,
        }
        self.save()

    def save(self) -> None:
        with self._lock:
            self.state["usage"] = self.usage.as_dict()
            storage.save_job(self.course_id, self.state)

    def log(self, msg: str, level: str = "info") -> None:
        with self._lock:
            self.state["log"].append({"t": storage.now(), "level": level, "msg": msg})
            self.state["log"] = self.state["log"][-500:]
            if level == "error":
                self.state["errors"] += 1
        self.save()

    def stage(self, name: str, total: int) -> None:
        with self._lock:
            self.state["stage"] = name
            self.state["progress"] = {"done": 0, "total": total}
        self.log(f"▶ {name}")

    def tick(self) -> None:
        with self._lock:
            self.state["progress"]["done"] += 1
        self.save()

    def finish(self, status: str, error: str | None = None) -> None:
        with self._lock:
            self.state["status"] = status
            self.state["error"] = error
            self.state["finished_at"] = storage.now()
            self.state["stage"] = "done" if status != "failed" else "failed"
        u = self.usage.as_dict()
        self.log(f"Finished ({status}). {u['calls']} Claude calls, ≈ ${u['approx_cost_usd']:.2f}.",
                 "error" if status == "failed" else "info")


def is_running(course_id: str) -> bool:
    with _running_lock:
        return course_id in _running


def job_status(course_id: str) -> dict | None:
    job = storage.get_job(course_id)
    if job and job.get("status") == "running" and not is_running(course_id):
        job["status"] = "interrupted"
        job["error"] = "The server stopped while this job was running. Start it again to resume."
        storage.save_job(course_id, job)
    return job


def start_job(course_id: str, kind: str, opts: dict) -> dict:
    storage.get_course(course_id)  # raises KeyError if missing
    with _running_lock:
        if course_id in _running:
            raise RuntimeError("A job is already running for this course.")
        _running.add(course_id)
    job = Job(course_id, kind, opts)
    target = {"analyze": run_analysis, "more_problems": run_more_problems}[kind]

    def runner() -> None:
        try:
            target(job, opts)
            job.finish("completed_with_errors" if job.state["errors"] else "completed")
        except Exception as e:  # noqa: BLE001 - report every failure to the UI
            job.log(traceback.format_exc(limit=3), "error")
            job.finish("failed", str(e))
        finally:
            with _running_lock:
                _running.discard(course_id)

    threading.Thread(target=runner, daemon=True, name=f"job-{course_id}").start()
    return job.state


def run_parallel(job: Job, items: list, fn: Callable[[Any], None], label: Callable[[Any], str],
                 warm_first: bool = True) -> None:
    """Run fn over items with bounded concurrency. The first item runs alone so the prompt
    cache is written once before the parallel calls read it."""
    items = list(items)
    if not items:
        return

    def safe(item: Any) -> None:
        try:
            fn(item)
        except Exception as e:  # noqa: BLE001
            job.log(f"✗ {label(item)}: {e}", "error")
        finally:
            job.tick()

    rest = items
    if warm_first:
        safe(items[0])
        rest = items[1:]
    with ThreadPoolExecutor(max_workers=max(1, config.CONCURRENCY)) as pool:
        for f in as_completed([pool.submit(safe, it) for it in rest]):
            f.result()


# ====================================================================== helpers

def norm_qnum(n: str) -> str:
    s = str(n).strip().lower()
    s = re.sub(r"^(question|ques|q)\s*\.?\s*", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def slug_id(prefix: str, raw: str) -> str:
    raw = (raw or "").strip().lower()
    if raw.startswith(prefix):
        raw = raw[len(prefix):]
    s = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")[:60] or "x"
    return prefix + s


def merge_digest(a: dict | None, b: dict, page_offset: int = 0) -> dict:
    if a is None:
        return b
    a["summary"] = (a.get("summary", "") + "\n\n" + b.get("summary", "")).strip()
    a["sections"] += b.get("sections", [])
    seen = {c["name"].lower() for c in a["concepts"]}
    a["concepts"] += [c for c in b.get("concepts", []) if c["name"].lower() not in seen]
    a["questions"] += b.get("questions", [])
    return a


def load_digests(course_id: str, meta: dict) -> list[dict]:
    out = []
    for m in meta["materials"]:
        d = storage.get_digest(course_id, m["id"])
        if d:
            d["kind"] = m["kind"]  # the student's label wins
            d["filename"] = m["filename"]
            out.append(d)
    return out


def build_corpus(digests: list[dict]) -> str:
    parts = [prompts.CORPUS_HEADER]
    for d in digests:
        parts.append(f'<material id="{d["material_id"]}" kind="{d["kind"]}" file="{d["filename"]}" '
                     f'label="{d.get("label", "")}">')
        parts.append(f"# {d.get('title', '')}\n{d.get('summary', '')}")
        for s in d.get("sections", []):
            parts.append(f"## {s['heading']} (pages {s['pages']})\n{s['content_md']}")
        if d.get("questions"):
            parts.append("## Questions")
            for q in d["questions"]:
                block = f"### Q{q['number']} [{q['marks']} marks] ({q['question_type']})\n{q['text_md']}"
                if q.get("solution_md"):
                    block += f"\n\n**Solution:**\n{q['solution_md']}"
                parts.append(block)
        parts.append("</material>")
    return "\n\n".join(parts)


def question_index(digests: list[dict]) -> dict[tuple[str, str], dict]:
    idx = {}
    for d in digests:
        for q in d.get("questions", []):
            idx[(d["material_id"], norm_qnum(q["number"]))] = {
                "material_id": d["material_id"], "number": q["number"], "text_md": q["text_md"],
                "marks": q.get("marks", ""), "solution_md": q.get("solution_md", ""),
                "material_label": d.get("label") or d.get("filename", ""),
                "is_exam": d["kind"] == "past_paper" or d.get("kind_detected") == "past_paper",
            }
    return idx


def remove_cycles(concepts: list[dict]) -> None:
    by_id = {c["id"]: c for c in concepts}
    state: dict[str, int] = {}

    def visit(cid: str) -> None:
        state[cid] = 1
        c = by_id[cid]
        keep = []
        for p in c["prerequisites"]:
            if state.get(p) == 1:
                continue  # back edge -> drop it
            if state.get(p) is None:
                visit(p)
            keep.append(p)
        c["prerequisites"] = keep
        state[cid] = 2

    for cid in list(by_id):
        if state.get(cid) is None:
            visit(cid)


def topo_order(concepts: list[dict], preferred: list[str]) -> list[str]:
    by_id = {c["id"]: c for c in concepts}
    rank = {cid: i for i, cid in enumerate(preferred)}
    order: list[str] = []
    done: set[str] = set()

    def add(cid: str) -> None:
        if cid in done or cid not in by_id:
            return
        done.add(cid)
        for p in sorted(by_id[cid]["prerequisites"], key=lambda x: rank.get(x, 10 ** 6)):
            add(p)
        order.append(cid)

    for cid in sorted(by_id, key=lambda x: rank.get(x, 10 ** 6)):
        add(cid)
    return order


def clean_mcq(q: dict, concept_ids: list[str], qid: str) -> dict | None:
    opts = [str(o) for o in q.get("options", []) if str(o).strip()]
    if len(opts) < 2:
        return None
    correct = q.get("correct", 0)
    if not isinstance(correct, int) or not (0 <= correct < len(opts)):
        return None
    expl = list(q.get("option_explanations", []))[:len(opts)]
    expl += [""] * (len(opts) - len(expl))
    return {
        "id": qid,
        "concept_ids": concept_ids,
        "type": q.get("type", "application"),
        "question_md": q.get("question_md", ""),
        "options": opts,
        "correct": correct,
        "option_explanations": expl,
        "difficulty": min(3, max(1, int(q.get("difficulty", 2) or 2))),
    }


def clean_problem(p: dict, pattern: dict, pid: str, known_concepts: set[str]) -> dict:
    parts = []
    for pi, part in enumerate(p.get("parts", [])):
        steps = []
        for si, s in enumerate(part.get("steps", [])):
            at = s.get("answer_type", "text")
            choices = [str(c) for c in s.get("choices", [])]
            correct = [i for i in s.get("correct_choices", []) if isinstance(i, int) and 0 <= i < len(choices)]
            if at in ("choice", "multi") and (len(choices) < 2 or not correct):
                at = "text"  # unusable choice step -> fall back to a self-graded text step
                if not s.get("text_answer_md"):
                    s["text_answer_md"] = s.get("explanation_md", "")
            if at == "choice":
                correct = correct[:1]
            cids = [c for c in s.get("concept_ids", []) if c in known_concepts] or pattern["concept_ids"][:3]
            steps.append({
                "id": f"{pid}-{pi}-{si}",
                "kind": s.get("kind", "compute"),
                "prompt_md": s.get("prompt_md", ""),
                "answer_type": at,
                "choices": choices if at in ("choice", "multi") else [],
                "correct_choices": correct if at in ("choice", "multi") else [],
                "numeric_answer": s.get("numeric_answer", 0) if at == "numeric" else None,
                "tolerance_pct": max(0.1, float(s.get("tolerance_pct", 1) or 1)) if at == "numeric" else None,
                "unit": s.get("unit", ""),
                "text_answer_md": s.get("text_answer_md", ""),
                "hint_md": s.get("hint_md", ""),
                "explanation_md": s.get("explanation_md", ""),
                "concept_ids": cids,
            })
        parts.append({
            "label": part.get("label", ""),
            "prompt_md": part.get("prompt_md", ""),
            "marks": part.get("marks", ""),
            "final_answer_md": part.get("final_answer_md", ""),
            "steps": steps,
        })
    return {
        "id": pid,
        "pattern_id": pattern["id"],
        "source": p.get("source", "variant"),
        "source_ref": p.get("source_ref", ""),
        "title": p.get("title", ""),
        "statement_md": p.get("statement_md", ""),
        "parts": parts,
        "verified": None,
        "verify_note": "",
    }


def _j(x: Any) -> str:
    return json.dumps(x, ensure_ascii=False, indent=1)


def _questions_text(qs: list[dict]) -> str:
    out = []
    for q in qs:
        s = f"--- {q['material_id']} Q{q['number']} ({q.get('material_label', '')}) [{q.get('marks', '')} marks]\n{q['text_md']}"
        if q.get("solution_md"):
            s += f"\n\nOfficial solution:\n{q['solution_md']}"
        out.append(s)
    return "\n\n".join(out) or "(no past-paper questions recorded; build problems from the course's worked examples)"


def _next_problem_number(kn: dict, pattern_id: str) -> int:
    nums = [int(m.group(1)) for p in kn["problems"] if p["pattern_id"] == pattern_id
            for m in [re.search(r"-(\d+)$", p["id"])] if m]
    return max(nums, default=0) + 1


# ====================================================================== the analysis job

def run_analysis(job: Job, opts: dict) -> None:
    cid = job.course_id
    force_digest = bool(opts.get("force_digest"))
    force_deep = bool(opts.get("force_deep"))
    n_variants = int(opts.get("variants", 3))
    verify = bool(opts.get("verify", True))

    meta = storage.get_course(cid)
    if not meta["materials"]:
        raise RuntimeError("Upload some materials first.")

    # ---------------- Stage 1: digest every material
    todo = [m for m in meta["materials"] if force_digest or not storage.get_digest(cid, m["id"])]
    job.stage(f"Reading materials ({len(todo)} to read, {len(meta['materials']) - len(todo)} cached)", len(todo))

    def digest(m: dict) -> None:
        path = storage.material_path(cid, m)
        merged = None
        for ch in ingest.material_chunks(path, m["filename"]):
            content = ch["blocks"] + [{"type": "text", "text": (
                f"Material id: {m['id']}\nFile: {ch['label']}\nKind (labelled by the student): {m['kind']}\n\n"
                + prompts.digest_instruction(m["kind"]))}]
            d = llm.structured(prompts.BASE_SYSTEM, content, schemas.DIGEST,
                               effort=config.EFFORT_EXTRACT, usage=job.usage)
            merged = merge_digest(merged, d)
        merged.update({"material_id": m["id"], "kind": m["kind"], "filename": m["filename"]})
        storage.save_digest(cid, m["id"], merged)
        storage.update_material(cid, m["id"], digested=True, digest_error=None)
        job.log(f"✓ Read {m['filename']}: {len(merged['sections'])} sections, "
                f"{len(merged['concepts'])} concepts, {len(merged['questions'])} questions")

    def digest_safe(m: dict) -> None:
        try:
            digest(m)
        except Exception as e:
            storage.update_material(cid, m["id"], digest_error=str(e))
            raise

    run_parallel(job, todo, digest_safe, lambda m: f"read {m['filename']}", warm_first=False)

    meta = storage.get_course(cid)
    digests = load_digests(cid, meta)
    if not digests:
        raise RuntimeError("No material could be read.")
    corpus = build_corpus(digests)
    system = llm.cached_system(prompts.BASE_SYSTEM, corpus)
    qidx = question_index(digests)

    # ---------------- Stage 2: knowledge map
    job.stage("Building the knowledge map", 1)
    syn = llm.structured(system, prompts.SYNTHESIS_TASK, schemas.SYNTHESIS,
                         effort=config.EFFORT_EXTRACT, usage=job.usage)
    job.tick()

    old = storage.get_knowledge(cid)
    kn = build_knowledge_from_synthesis(syn, qidx, old, keep_details=not force_deep, log=job.log)

    # coverage repair: every past-paper question must belong to an exam pattern
    uncovered = uncovered_questions(kn, qidx)
    if uncovered:
        job.log(f"{len(uncovered)} past-paper question(s) were not mapped to a pattern; fixing…", "warn")
        try:
            repair_coverage(kn, uncovered, qidx, system, job)
        except Exception as e:  # noqa: BLE001
            job.log(f"Coverage repair failed: {e}", "error")
    kn["uncovered_questions"] = [{"material_id": q["material_id"], "number": q["number"]}
                                 for q in uncovered_questions(kn, qidx)]
    compute_frequencies(kn, qidx)
    kn["model"] = config.MODEL
    storage.save_knowledge(cid, kn)
    job.log(f"✓ Map: {len(kn['topics'])} topics, {len(kn['concepts'])} concepts, "
            f"{len(kn['patterns'])} exam patterns; {len(kn['uncovered_questions'])} past-paper questions uncovered")

    save_lock = threading.Lock()
    concepts_by_id = {c["id"]: c for c in kn["concepts"]}
    known = set(concepts_by_id)

    # ---------------- Stage 3: concept breakdowns
    todo_c = [c for c in kn["concepts"] if not c.get("detail")]
    job.stage(f"Breaking down concepts ({len(todo_c)})", len(todo_c))

    def deep_concept(c: dict) -> None:
        pats = [p for p in kn["patterns"] if c["id"] in p["concept_ids"]]
        qs = sorted({f"{q['material_id']} Q{q['number']}" for p in pats for q in p["source_questions"]})
        prereqs = [concepts_by_id[p]["name"] for p in c["prerequisites"] if p in concepts_by_id]
        task = prompts.CONCEPT_TASK.format(
            concept=_j({k: c[k] for k in ("id", "name", "topic_id", "one_liner", "importance", "source_refs")}),
            patterns=", ".join(p["name"] for p in pats) or "none",
            questions=", ".join(qs) or "none", prereqs=", ".join(prereqs) or "none")
        out = llm.structured(system, task, schemas.CONCEPT_DETAIL, effort=config.EFFORT_EXTRACT, usage=job.usage)
        mcqs = [m for i, q in enumerate(out.pop("mcqs", []))
                if (m := clean_mcq(q, [c["id"]], f"q-{c['id'][2:]}-{i + 1}"))]
        guided = out.pop("guided", [])
        with save_lock:
            c["detail"] = out
            kn["mcqs"] = [q for q in kn["mcqs"] if q["concept_ids"] != [c["id"]]] + mcqs
            kn["guided"][c["id"]] = guided
            storage.save_knowledge(cid, kn)
        job.log(f"✓ {c['name']}: {len(out['atomic_steps'])} atomic steps, {len(mcqs)} MCQs")

    run_parallel(job, todo_c, deep_concept, lambda c: c["name"])

    # ---------------- Stage 4: exam pattern kits + scaffolded problems
    todo_p = [p for p in kn["patterns"] if not p.get("guide")]
    job.stage(f"Building exam pattern kits and practice problems ({len(todo_p)})", len(todo_p))

    def deep_pattern(p: dict) -> None:
        srcs = p["source_questions"]
        first, rest = srcs[:3], srcs[3:]
        pinfo = _j({k: p[k] for k in ("id", "name", "description", "calc", "concept_ids")})
        cids = ", ".join(p["concept_ids"]) or ", ".join(sorted(known))
        out = llm.structured(system, prompts.PATTERN_TASK.format(
            pattern=pinfo, concept_ids=cids, questions=_questions_text(first),
            n_variants=n_variants, rules=prompts.SCAFFOLD_RULES),
            schemas.PATTERN_GUIDE, effort=config.EFFORT_EXTRACT, usage=job.usage)
        raw_problems = out.pop("problems", [])
        for i in range(0, len(rest), 3):
            batch = rest[i:i + 3]
            more = llm.structured(system, prompts.SCAFFOLD_TASK.format(
                pattern=pinfo, concept_ids=cids, questions=_questions_text(batch), rules=prompts.SCAFFOLD_RULES),
                schemas.PROBLEMS_ONLY, effort=config.EFFORT_EXTRACT, usage=job.usage)
            raw_problems += more.get("problems", [])
        with save_lock:
            kn["problems"] = [x for x in kn["problems"] if x["pattern_id"] != p["id"]]
            problems = [clean_problem(rp, p, f"{p['id']}-{i + 1}", known) for i, rp in enumerate(raw_problems)]
            kn["problems"] += problems
            p["guide"] = out
            storage.save_knowledge(cid, kn)
        job.log(f"✓ {p['name']}: {len(problems)} problems "
                f"({sum(1 for x in problems if x['source'] == 'past_paper')} past-paper, "
                f"{sum(1 for x in problems if x['source'] == 'variant')} variants)")
        if verify and problems:
            verify_problems(problems, system, job, save=lambda: storage.save_knowledge(cid, kn), lock=save_lock)

    run_parallel(job, todo_p, deep_pattern, lambda p: p["name"])

    kn["generated_at"] = storage.now()
    storage.save_knowledge(cid, kn)


def build_knowledge_from_synthesis(syn: dict, qidx: dict, old: dict, keep_details: bool,
                                   log: Callable[..., None]) -> dict:
    kn = storage.empty_knowledge()
    kn["course"] = {"title": syn.get("course_title", ""), "overview_md": syn.get("overview_md", "")}

    topics, tids = [], set()
    for t in syn.get("topics", []):
        tid = slug_id("t-", t.get("id") or t.get("name", ""))
        if tid in tids:
            continue
        tids.add(tid)
        topics.append({"id": tid, "name": t.get("name", tid), "summary": t.get("summary", "")})

    raw_to_id: dict[str, str] = {}
    concepts, cids = [], set()
    for c in syn.get("concepts", []):
        cid = slug_id("c-", c.get("id") or c.get("name", ""))
        base, n = cid, 2
        while cid in cids:
            cid, n = f"{base}-{n}", n + 1
        cids.add(cid)
        raw_to_id[c.get("id", "")] = cid
        raw_to_id[slug_id("c-", c.get("id", ""))] = cid
        concepts.append({
            "id": cid, "name": c.get("name", cid), "topic_id": slug_id("t-", c.get("topic_id", "")),
            "one_liner": c.get("one_liner", ""), "prerequisites": c.get("prerequisites", []),
            "related": c.get("related", []), "importance": c.get("importance", "supporting"),
            "source_refs": c.get("source_refs", []), "exam_frequency": 0, "detail": None,
        })

    def resolve(ids: list[str]) -> list[str]:
        out = []
        for x in ids:
            r = raw_to_id.get(x) or raw_to_id.get(slug_id("c-", x))
            if r and r not in out:
                out.append(r)
        return out

    for c in concepts:
        c["prerequisites"] = [p for p in resolve(c["prerequisites"]) if p != c["id"]]
        c["related"] = [p for p in resolve(c["related"]) if p != c["id"]]
        if c["topic_id"] not in tids:
            if "t-other" not in tids:
                tids.add("t-other")
                topics.append({"id": "t-other", "name": "Other", "summary": ""})
            c["topic_id"] = "t-other"
    remove_cycles(concepts)

    patterns, pids = [], set()
    for p in syn.get("patterns", []):
        pid = slug_id("p-", p.get("id") or p.get("name", ""))
        base, n = pid, 2
        while pid in pids:
            pid, n = f"{base}-{n}", n + 1
        pids.add(pid)
        srcs, seen = [], set()
        for ref in p.get("source_questions", []):
            key = (ref.get("material_id", ""), norm_qnum(ref.get("number", "")))
            if key in qidx and key not in seen:
                seen.add(key)
                srcs.append(qidx[key])
            elif key not in qidx:
                log(f"Pattern {pid}: unknown question reference {ref}", "warn")
        patterns.append({
            "id": pid, "name": p.get("name", pid), "description": p.get("description", ""),
            "calc": bool(p.get("calc")), "concept_ids": resolve(p.get("concept_ids", [])),
            "source_questions": srcs, "frequency": 0, "guide": None,
        })

    kn["topics"], kn["concepts"], kn["patterns"] = topics, concepts, patterns
    kn["learning_path"] = topo_order(concepts, resolve(syn.get("learning_path", [])))

    if keep_details and old:
        old_c = {c["id"]: c for c in old.get("concepts", [])}
        for c in concepts:
            if c["id"] in old_c and old_c[c["id"]].get("detail"):
                c["detail"] = old_c[c["id"]]["detail"]
        kn["mcqs"] = [q for q in old.get("mcqs", []) if all(x in cids for x in q["concept_ids"])]
        kn["guided"] = {k: v for k, v in old.get("guided", {}).items() if k in cids}
        old_p = {p["id"]: p for p in old.get("patterns", [])}
        for p in patterns:
            if p["id"] in old_p and old_p[p["id"]].get("guide"):
                p["guide"] = old_p[p["id"]]["guide"]
        kept = {p["id"] for p in patterns if p["guide"]}
        kn["problems"] = [x for x in old.get("problems", []) if x["pattern_id"] in kept]
    return kn


def uncovered_questions(kn: dict, qidx: dict) -> list[dict]:
    covered = {(q["material_id"], norm_qnum(q["number"])) for p in kn["patterns"] for q in p["source_questions"]}
    return [q for key, q in qidx.items() if q["is_exam"] and key not in covered]


def repair_coverage(kn: dict, uncovered: list[dict], qidx: dict, system: list[dict], job: Job) -> None:
    pats = "\n".join(f"- {p['id']}: {p['name']} — {p['description']}" for p in kn["patterns"]) or "(none)"
    task = prompts.COVERAGE_TASK.format(patterns=pats, questions=_questions_text(uncovered))
    out = llm.structured(system, task, schemas.COVERAGE_REPAIR, effort=config.EFFORT_EXTRACT, usage=job.usage)
    known_c = {c["id"] for c in kn["concepts"]}
    by_id = {p["id"]: p for p in kn["patterns"]}
    for np in out.get("new_patterns", []):
        pid = slug_id("p-", np.get("id") or np.get("name", ""))
        if pid in by_id:
            continue
        by_id[pid] = {"id": pid, "name": np.get("name", pid), "description": np.get("description", ""),
                      "calc": bool(np.get("calc")),
                      "concept_ids": [c for c in np.get("concept_ids", []) if c in known_c],
                      "source_questions": [], "frequency": 0, "guide": None}
        kn["patterns"].append(by_id[pid])
    for a in out.get("assignments", []):
        key = (a.get("material_id", ""), norm_qnum(a.get("number", "")))
        pid = slug_id("p-", a.get("pattern_id", ""))
        if key in qidx and pid in by_id and qidx[key] not in by_id[pid]["source_questions"]:
            by_id[pid]["source_questions"].append(qidx[key])


def compute_frequencies(kn: dict, qidx: dict) -> None:
    per_concept: dict[str, set] = {c["id"]: set() for c in kn["concepts"]}
    for p in kn["patterns"]:
        p["frequency"] = sum(1 for q in p["source_questions"] if q.get("is_exam", True))
        for cid in p["concept_ids"]:
            if cid in per_concept:
                per_concept[cid].update((q["material_id"], q["number"]) for q in p["source_questions"])
    for c in kn["concepts"]:
        c["exam_frequency"] = len(per_concept.get(c["id"], ()))
    kn["patterns"].sort(key=lambda p: -p["frequency"])


def problem_for_verification(i: int, p: dict) -> str:
    lines = [f"=== problem_index {i} ===", f"Statement:\n{p['statement_md']}"]
    for part in p["parts"]:
        lines.append(f"\nPart {part['label']}: {part['prompt_md']}  (final answer given: {part['final_answer_md']})")
        for s in part["steps"]:
            if s["answer_type"] == "numeric":
                ans = f"{s['numeric_answer']} {s['unit']}"
            elif s["answer_type"] in ("choice", "multi"):
                ans = "; ".join(f"[{'x' if k in s['correct_choices'] else ' '}] {c}" for k, c in enumerate(s["choices"]))
            else:
                ans = s["text_answer_md"]
            lines.append(f"  - ({s['kind']}) {s['prompt_md']} -> {ans}")
    return "\n".join(lines)


def verify_problems(problems: list[dict], system: list[dict], job: Job, save: Callable[[], None],
                    lock: threading.Lock) -> None:
    text = "\n\n".join(problem_for_verification(i, p) for i, p in enumerate(problems))
    out = llm.structured(system, prompts.VERIFY_TASK.format(problems=text), schemas.VERIFY,
                         effort=config.EFFORT_EXTRACT, usage=job.usage)
    bad = 0
    with lock:
        for r in out.get("results", []):
            i = r.get("problem_index")
            if isinstance(i, int) and 0 <= i < len(problems):
                problems[i]["verified"] = bool(r.get("agrees"))
                if not r.get("agrees"):
                    bad += 1
                    problems[i]["verify_note"] = (r.get("issues_md", "") + "\n\nIndependent answer: "
                                                  + r.get("independent_final_answers_md", "")).strip()
        save()
    if bad:
        job.log(f"⚠ Verification flagged {bad} of {len(problems)} problem(s) in {problems[0]['pattern_id']}", "warn")


# ====================================================================== "more problems" job

def run_more_problems(job: Job, opts: dict) -> None:
    cid = job.course_id
    pattern_id = opts["pattern_id"]
    n = int(opts.get("n", 3))
    kn = storage.get_knowledge(cid)
    pattern = next((p for p in kn["patterns"] if p["id"] == pattern_id), None)
    if not pattern:
        raise RuntimeError("Unknown pattern")
    meta = storage.get_course(cid)
    system = llm.cached_system(prompts.BASE_SYSTEM, build_corpus(load_digests(cid, meta)) if meta["materials"] else None)
    known = {c["id"] for c in kn["concepts"]}
    existing = [x for x in kn["problems"] if x["pattern_id"] == pattern_id]
    job.stage(f"Generating {n} more problems for {pattern['name']}", 1)
    out = llm.structured(system, prompts.MORE_PROBLEMS_TASK.format(
        n=n, pattern=_j({k: pattern[k] for k in ("id", "name", "description", "calc", "concept_ids")}),
        concept_ids=", ".join(pattern["concept_ids"]), questions=_questions_text(pattern["source_questions"][:3]),
        existing="\n".join(f"- {x['title']}: {x['statement_md'][:300]}" for x in existing) or "(none)",
        rules=prompts.SCAFFOLD_RULES), schemas.PROBLEMS_ONLY, effort=config.EFFORT_EXTRACT, usage=job.usage)
    start = _next_problem_number(kn, pattern_id)
    new = [clean_problem(rp, pattern, f"{pattern_id}-{start + i}", known) for i, rp in enumerate(out.get("problems", []))]
    job.tick()
    lock = threading.Lock()

    def save() -> None:
        with storage.lock_for(cid):
            fresh = storage.get_knowledge(cid)
            fresh["problems"] = [x for x in fresh["problems"] if x["id"] not in {p["id"] for p in new}] + new
            storage.save_knowledge(cid, fresh)

    save()
    job.log(f"✓ Added {len(new)} problems")
    if opts.get("verify", True) and new:
        job.stage("Verifying the new problems", 1)
        verify_problems(new, system, job, save=save, lock=lock)
        job.tick()


# ====================================================================== quick synchronous helpers

def _concept_brief(kn: dict, concept_id: str) -> dict:
    c = next((c for c in kn["concepts"] if c["id"] == concept_id), None)
    if not c:
        raise KeyError(concept_id)
    return c


def explain_simpler(course_id: str, concept_id: str, snippet: str, message: str) -> str:
    kn = storage.get_knowledge(course_id)
    c = _concept_brief(kn, concept_id)
    task = prompts.EXPLAIN_SIMPLER_TASK.format(
        concept=f"{c['name']}: {c['one_liner']}", snippet=snippet[:4000] or "(the whole concept)",
        message=message[:1000])
    return llm.call(prompts.BASE_SYSTEM, task, effort=config.EFFORT_TUTOR, max_tokens=16000)


def grade_text(context: str, prompt: str, model: str, answer: str) -> dict:
    task = prompts.GRADE_TASK.format(context=context[:6000], prompt=prompt[:2000],
                                     model=model[:4000], answer=answer[:4000])
    return llm.structured(prompts.BASE_SYSTEM, task, schemas.GRADE, effort=config.EFFORT_GRADE, max_tokens=8000)


def more_mcqs(course_id: str, concept_id: str, n: int = 6) -> list[dict]:
    kn = storage.get_knowledge(course_id)
    c = _concept_brief(kn, concept_id)
    existing = [q for q in kn["mcqs"] if concept_id in q["concept_ids"]]
    meta = storage.get_course(course_id)
    system = llm.cached_system(prompts.BASE_SYSTEM, build_corpus(load_digests(course_id, meta)) if meta["materials"] else None)
    out = llm.structured(system, prompts.MORE_MCQS_TASK.format(
        n=n, concept=_j({k: c[k] for k in ("id", "name", "one_liner")}),
        existing="\n".join(f"- {q['question_md'][:200]}" for q in existing) or "(none)"),
        schemas.MORE_MCQS, effort=config.EFFORT_TUTOR)
    with storage.lock_for(course_id):
        kn = storage.get_knowledge(course_id)
        taken = {q["id"] for q in kn["mcqs"]}
        new, k = [], 1
        for q in out.get("mcqs", []):
            while f"q-{concept_id[2:]}-x{k}" in taken:
                k += 1
            m = clean_mcq(q, [concept_id], f"q-{concept_id[2:]}-x{k}")
            if m:
                taken.add(m["id"])
                new.append(m)
        kn["mcqs"] += new
        storage.save_knowledge(course_id, kn)
    return new
