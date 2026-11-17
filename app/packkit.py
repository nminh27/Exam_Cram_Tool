"""Helpers for writing, checking and merging knowledge packs by hand (or by Claude Code)
without the API pipeline. See docs/PACK_FORMAT.md and docs/CLAUDE_CODE_WORKFLOW.md.

Typical build script (inbox/<course>/build_pack.py):

    import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
    from app.packkit import *
    pack = make_pack("MATH1010", topics=[...], concepts=[...], patterns=[...], mcqs=[...], problems=[...])
    write_pack(pathlib.Path(__file__).with_name("pack.json"), pack)
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any, Iterable

PACK_FORMAT = "finalforge-pack"
STEP_KINDS = {"given", "unknown", "concept", "formula", "rearrange", "substitute", "compute",
              "units", "check", "interpret", "explain", "final"}
ANSWER_TYPES = {"numeric", "choice", "multi", "text"}
MCQ_TYPES = {"intuition", "misconception", "application", "pattern", "map"}
DETAIL_KEYS = ["why_exists_md", "what_it_does_md", "how_it_works_md", "everyday_analogy_md", "visualize_md",
               "diagram_svg", "atomic_steps", "formulas", "patterns_to_spot", "common_traps", "tips_tricks",
               "mini_example_md", "self_check"]


# ====================================================================== builders

def topic(tid: str, name: str, summary: str = "") -> dict:
    return {"id": tid, "name": name, "summary": summary}


def concept(cid, name, topic_id, one_liner, prereq=(), related=(), importance="core", detail=None, refs=()) -> dict:
    return {"id": cid, "name": name, "topic_id": topic_id, "one_liner": one_liner, "prerequisites": list(prereq),
            "related": list(related), "importance": importance, "source_refs": list(refs) or ["course notes"],
            "exam_frequency": 0, "detail": detail}


def det(why, what, how, analogy, visual, steps, formulas=(), spot=(), traps=(), tips=(), example="", check=(), svg="") -> dict:
    """steps: [(step_md, everyday_link)]; formulas: [(latex, name, meaning_md, [(symbol, meaning, unit)], when_md)];
    spot: [(cue, signals_md)]; traps: [(trap_md, fix_md)]; tips: [(tip_md, source)]."""
    return {"why_exists_md": why, "what_it_does_md": what, "how_it_works_md": how, "everyday_analogy_md": analogy,
            "visualize_md": visual, "diagram_svg": svg,
            "atomic_steps": [{"step_md": s, "everyday_link": e} for s, e in steps],
            "formulas": [{"latex": l, "name": n, "meaning_md": m,
                          "symbols": [{"symbol": a, "meaning": b, "unit": c} for a, b, c in sy], "when_to_use_md": w}
                         for l, n, m, sy, w in formulas],
            "patterns_to_spot": [{"cue": c, "signals_md": s} for c, s in spot],
            "common_traps": [{"trap_md": t, "fix_md": f} for t, f in traps],
            "tips_tricks": [{"tip_md": t, "source": s} for t, s in tips],
            "mini_example_md": example, "self_check": list(check)}


def mcq(qid, cids, qtype, question, options, correct, explanations, difficulty=2) -> dict:
    return {"id": qid, "concept_ids": list(cids), "type": qtype, "question_md": question, "options": list(options),
            "correct": correct, "option_explanations": list(explanations), "difficulty": difficulty}


def guided_step(question, options, correct, explanation) -> dict:
    return {"question_md": question, "options": list(options), "correct": correct, "explanation_md": explanation}


def source_q(material_id, number, text_md, label="", marks="", solution_md="", is_exam=True) -> dict:
    return {"material_id": material_id, "number": str(number), "text_md": text_md, "marks": str(marks),
            "solution_md": solution_md, "material_label": label, "is_exam": is_exam}


def guide(cues, recipe, tricks=(), traps=(), examiner_wants="") -> dict:
    """recipe: [(step_md, why_md, everyday_link)]"""
    return {"recognition_cues": list(cues),
            "recipe": [{"step_md": s, "why_md": w, "everyday_link": e} for s, w, e in recipe],
            "tricks": list(tricks), "traps": list(traps), "examiner_wants_md": examiner_wants}


def pattern(pid, name, description, concept_ids, source_questions=(), calc=True, guide_=None) -> dict:
    return {"id": pid, "name": name, "description": description, "calc": calc, "concept_ids": list(concept_ids),
            "frequency": 0, "source_questions": list(source_questions), "guide": guide_}


def step(kind, prompt, answer_type, *, choices=(), correct=(), num=None, tol=1, unit="", text="",
         hint="", expl="", cids=()) -> dict:
    return {"kind": kind, "prompt_md": prompt, "answer_type": answer_type, "choices": list(choices),
            "correct_choices": list(correct), "numeric_answer": num,
            "tolerance_pct": tol if answer_type == "numeric" else None,
            "unit": unit, "text_answer_md": text, "hint_md": hint, "explanation_md": expl, "concept_ids": list(cids)}


def part(label, prompt, marks, final, steps) -> dict:
    return {"label": label, "prompt_md": prompt, "marks": str(marks), "final_answer_md": final, "steps": list(steps)}


def problem(pid, pattern_id, source, ref, title, statement, parts, verified=True, note="") -> dict:
    for pi, pt in enumerate(parts):
        for si, s in enumerate(pt["steps"]):
            s["id"] = f"{pid}-{pi}-{si}"
    return {"id": pid, "pattern_id": pattern_id, "source": source, "source_ref": ref, "title": title,
            "statement_md": statement, "parts": list(parts), "verified": verified, "verify_note": note}


# ====================================================================== assembling

def topo_order(concepts: list[dict], preferred: Iterable[str] = ()) -> list[str]:
    by_id = {c["id"]: c for c in concepts}
    rank = {cid: i for i, cid in enumerate(preferred)}
    order: list[str] = []
    seen: set[str] = set()

    def add(cid: str, stack: tuple = ()) -> None:
        if cid in seen or cid not in by_id or cid in stack:
            return
        for p in sorted(by_id[cid]["prerequisites"], key=lambda x: rank.get(x, 10 ** 6)):
            add(p, stack + (cid,))
        if cid not in seen:
            seen.add(cid)
            order.append(cid)

    for cid in sorted(by_id, key=lambda x: rank.get(x, 10 ** 6)):
        add(cid)
    return order


def finalize(kn: dict) -> dict:
    """Recompute derived fields: pattern frequency, concept exam_frequency, learning path, step ids."""
    for p in kn.get("patterns", []):
        p["frequency"] = sum(1 for q in p.get("source_questions", []) if q.get("is_exam", True))
    for c in kn.get("concepts", []):
        qs = {(q["material_id"], q["number"]) for p in kn.get("patterns", []) if c["id"] in p["concept_ids"]
              for q in p.get("source_questions", []) if q.get("is_exam", True)}
        c["exam_frequency"] = len(qs)
    kn["patterns"] = sorted(kn.get("patterns", []), key=lambda p: -p["frequency"])
    kn["learning_path"] = topo_order(kn.get("concepts", []), kn.get("learning_path", []))
    for pr in kn.get("problems", []):
        for pi, pt in enumerate(pr["parts"]):
            for si, s in enumerate(pt["steps"]):
                s.setdefault("id", f"{pr['id']}-{pi}-{si}")
    return kn


def make_pack(name: str, *, description: str = "", course_title: str = "", overview_md: str = "",
              topics=(), concepts=(), patterns=(), mcqs=(), guided=None, problems=(), learning_path=(),
              uncovered=(), model: str = "Claude Code (no API)") -> dict:
    kn = {
        "version": 1,
        "course": {"title": course_title or name, "overview_md": overview_md},
        "topics": list(topics), "concepts": list(concepts), "patterns": list(patterns), "mcqs": list(mcqs),
        "guided": dict(guided or {}), "problems": list(problems), "learning_path": list(learning_path),
        "uncovered_questions": list(uncovered), "generated_at": None, "model": model,
    }
    return {"format": PACK_FORMAT, "version": 1, "name": name, "description": description, "knowledge": finalize(kn)}


def write_pack(path: Path | str, pack: dict) -> None:
    """Validate, print the report, and write the pack. Raises on errors."""
    errors, warnings = validate(pack)
    for w in warnings:
        print("warning:", w)
    if errors:
        for e in errors:
            print("ERROR:", e)
        raise SystemExit(f"{len(errors)} error(s); pack not written")
    Path(path).write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding="utf-8")
    kn = pack["knowledge"]
    print(f"wrote {path}: {len(kn['concepts'])} concepts, {len(kn['patterns'])} patterns, "
          f"{len(kn['mcqs'])} MCQs, {len(kn['problems'])} problems")


# ====================================================================== validation

def _unbalanced_dollars(text: str) -> bool:
    s = re.sub(r"\\\$", "", text or "")
    s = re.sub(r"\$\$[\s\S]*?\$\$", "", s)
    return s.count("$") % 2 == 1


def _md_fields(obj: Any, path: str = ""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str) and (k.endswith("_md") or k in ("cue", "step_md")):
                yield f"{path}.{k}", v
            else:
                yield from _md_fields(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            if isinstance(v, str):
                yield f"{path}[{i}]", v
            else:
                yield from _md_fields(v, f"{path}[{i}]")


def validate(pack_or_kn: dict) -> tuple[list[str], list[str]]:
    """Return (errors, warnings). Errors would break the UI; warnings are quality issues."""
    errors: list[str] = []
    warns: list[str] = []
    if "knowledge" in pack_or_kn:
        if pack_or_kn.get("format") != PACK_FORMAT:
            errors.append(f"format must be '{PACK_FORMAT}'")
        kn = pack_or_kn["knowledge"]
    else:
        kn = pack_or_kn

    def uniq(items: list[dict], what: str) -> set[str]:
        ids: set[str] = set()
        for it in items:
            if not it.get("id"):
                errors.append(f"{what} without id: {str(it)[:80]}")
            elif it["id"] in ids:
                errors.append(f"duplicate {what} id {it['id']}")
            ids.add(it.get("id"))
        return ids

    topics = uniq(kn.get("topics", []), "topic")
    concepts = uniq(kn.get("concepts", []), "concept")
    patterns = uniq(kn.get("patterns", []), "pattern")
    uniq(kn.get("mcqs", []), "mcq")
    uniq(kn.get("problems", []), "problem")

    for c in kn.get("concepts", []):
        if c.get("topic_id") not in topics:
            errors.append(f"concept {c['id']}: unknown topic {c.get('topic_id')}")
        for k in ("prerequisites", "related"):
            for x in c.get(k, []):
                if x not in concepts:
                    errors.append(f"concept {c['id']}: unknown {k} id {x}")
        if c.get("importance") not in ("core", "supporting", "peripheral"):
            errors.append(f"concept {c['id']}: importance must be core/supporting/peripheral")
        d = c.get("detail")
        if d is None:
            warns.append(f"concept {c['id']} has no breakdown (detail) yet")
        else:
            missing = [k for k in DETAIL_KEYS if k not in d]
            if missing:
                errors.append(f"concept {c['id']}: detail missing {missing}")
            elif len(d["atomic_steps"]) < 3:
                warns.append(f"concept {c['id']}: only {len(d['atomic_steps'])} atomic steps")
            if d and d.get("diagram_svg") and not d["diagram_svg"].lstrip().startswith("<svg"):
                errors.append(f"concept {c['id']}: diagram_svg must start with <svg")
    # cycles
    by_id = {c["id"]: c for c in kn.get("concepts", [])}
    state: dict[str, int] = {}

    def visit(cid: str) -> None:
        state[cid] = 1
        for p in by_id[cid].get("prerequisites", []):
            if p in by_id:
                if state.get(p) == 1:
                    errors.append(f"prerequisite cycle through {cid} -> {p}")
                elif p not in state:
                    visit(p)
        state[cid] = 2

    for cid in by_id:
        if cid not in state:
            visit(cid)

    for p in kn.get("patterns", []):
        for x in p.get("concept_ids", []):
            if x not in concepts:
                errors.append(f"pattern {p['id']}: unknown concept {x}")
        if not p.get("source_questions"):
            warns.append(f"pattern {p['id']}: no past-paper source questions")
        if p.get("guide") is None:
            warns.append(f"pattern {p['id']}: no solving kit (guide)")
        if not any(pr["pattern_id"] == p["id"] for pr in kn.get("problems", [])):
            warns.append(f"pattern {p['id']}: no practice problems")

    for q in kn.get("mcqs", []):
        n = len(q.get("options", []))
        if n < 2:
            errors.append(f"mcq {q['id']}: needs at least 2 options")
        if not isinstance(q.get("correct"), int) or not 0 <= q["correct"] < n:
            errors.append(f"mcq {q['id']}: correct index out of range")
        if len(q.get("option_explanations", [])) != n:
            errors.append(f"mcq {q['id']}: need one explanation per option")
        if q.get("type") not in MCQ_TYPES:
            errors.append(f"mcq {q['id']}: type must be one of {sorted(MCQ_TYPES)}")
        for x in q.get("concept_ids", []):
            if x not in concepts:
                errors.append(f"mcq {q['id']}: unknown concept {x}")
    for cid, steps in (kn.get("guided") or {}).items():
        if cid not in concepts:
            errors.append(f"guided: unknown concept {cid}")
        for i, s in enumerate(steps):
            if not 0 <= s.get("correct", -1) < len(s.get("options", [])):
                errors.append(f"guided {cid}[{i}]: correct index out of range")

    step_ids: set[str] = set()
    for pr in kn.get("problems", []):
        if pr.get("pattern_id") not in patterns:
            errors.append(f"problem {pr['id']}: unknown pattern {pr.get('pattern_id')}")
        if pr.get("source") not in ("past_paper", "variant"):
            errors.append(f"problem {pr['id']}: source must be past_paper or variant")
        if not pr.get("parts"):
            errors.append(f"problem {pr['id']}: no parts")
        for pt in pr.get("parts", []):
            if not pt.get("steps"):
                errors.append(f"problem {pr['id']} part {pt.get('label')}: no steps")
            for s in pt.get("steps", []):
                sid = s.get("id", "?")
                if sid in step_ids:
                    errors.append(f"duplicate step id {sid}")
                step_ids.add(sid)
                at = s.get("answer_type")
                if at not in ANSWER_TYPES:
                    errors.append(f"step {sid}: answer_type must be one of {sorted(ANSWER_TYPES)}")
                if s.get("kind") not in STEP_KINDS:
                    errors.append(f"step {sid}: kind must be one of {sorted(STEP_KINDS)}")
                if at in ("choice", "multi"):
                    ch, cc = s.get("choices", []), s.get("correct_choices", [])
                    if len(ch) < 2 or not cc or any(not isinstance(i, int) or not 0 <= i < len(ch) for i in cc):
                        errors.append(f"step {sid}: bad choices / correct_choices")
                    if at == "choice" and len(cc) != 1:
                        errors.append(f"step {sid}: a choice step needs exactly one correct choice")
                if at == "numeric":
                    v = s.get("numeric_answer")
                    if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v):
                        errors.append(f"step {sid}: numeric_answer must be a finite number")
                    if not isinstance(s.get("tolerance_pct"), (int, float)) or s["tolerance_pct"] <= 0:
                        errors.append(f"step {sid}: tolerance_pct must be > 0")
                if at == "text" and not s.get("text_answer_md"):
                    warns.append(f"step {sid}: text step has no model answer (text_answer_md)")
                for x in s.get("concept_ids", []):
                    if x not in concepts:
                        errors.append(f"step {sid}: unknown concept {x}")
                if not s.get("concept_ids"):
                    warns.append(f"step {sid}: no concept_ids (won't count toward mastery)")

    lp = set(kn.get("learning_path", []))
    if lp != concepts:
        warns.append("learning_path does not list every concept exactly (finalize() fixes this)")
    for path, text in _md_fields(kn, "knowledge"):
        if _unbalanced_dollars(text):
            warns.append(f"odd number of $ in {path} (unclosed math?)")
    return errors, warns


# ====================================================================== merging

def merge(base: dict, add: dict) -> dict:
    """Merge knowledge `add` into `base` (both 'knowledge' dicts). Items with the same id are replaced,
    new ones appended. Lets a course be built topic by topic."""
    out = json.loads(json.dumps(base))
    for key in ("topics", "concepts", "patterns", "mcqs", "problems"):
        idx = {it["id"]: i for i, it in enumerate(out.get(key, []))}
        for it in add.get(key, []):
            if it["id"] in idx:
                out[key][idx[it["id"]]] = it
            else:
                out.setdefault(key, []).append(it)
                idx[it["id"]] = len(out[key]) - 1
    out.setdefault("guided", {}).update(add.get("guided") or {})
    if add.get("course", {}).get("title"):
        out.setdefault("course", {})["title"] = add["course"]["title"]
    if add.get("course", {}).get("overview_md"):
        out.setdefault("course", {})["overview_md"] = add["course"]["overview_md"]
    out["learning_path"] = list(out.get("learning_path", [])) + [x for x in add.get("learning_path", [])
                                                                if x not in out.get("learning_path", [])]
    if "uncovered_questions" in add:
        out["uncovered_questions"] = add["uncovered_questions"]
    out["model"] = add.get("model") or out.get("model")
    return finalize(out)
