"""End-to-end pipeline test with a fake Claude (no API key or network needed)."""
from __future__ import annotations

import time

import pytest

from app import config, llm, pipeline, schemas, storage


class FakeProvider:
    native_pdf = True
    pdf_mode = "auto"
    concurrency = 2
    label = "Fake · test"
    model = "test"

    def prices(self):
        return None


@pytest.fixture()
def tmp_data(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "COURSES_DIR", tmp_path / "courses")
    monkeypatch.setattr(config, "SETTINGS_FILE", tmp_path / "settings.json")
    monkeypatch.setattr(llm, "provider", lambda role="main": FakeProvider())
    return tmp_path


DIGEST_NOTES = {
    "title": "Lecture 1", "kind_detected": "notes", "label": "Lecture 1", "summary": "Kinematics",
    "sections": [{"heading": "SUVAT", "pages": "1-2", "content_md": "$v = u + at$"}],
    "concepts": [{"name": "Acceleration", "description": "rate of change of velocity"}],
    "questions": [],
}
DIGEST_PAPER = {
    "title": "Final 2023", "kind_detected": "past_paper", "label": "Final 2023", "summary": "Exam",
    "sections": [],
    "concepts": [],
    "questions": [
        {"number": "1", "text_md": "A car accelerates from 0 to 20 m/s in 4 s. Find a. (3 marks)", "marks": "3",
         "topics": ["kinematics"], "question_type": "calculation", "solution_md": ""},
        {"number": "Q2", "text_md": "Define velocity. (2 marks)", "marks": "2",
         "topics": ["kinematics"], "question_type": "theory", "solution_md": ""},
    ],
}


def fake_structured(system, content, schema, **kw):
    text = content if isinstance(content, str) else content[-1]["text"]
    if schema is schemas.DIGEST:
        return DIGEST_PAPER if "past_paper" in text else DIGEST_NOTES
    if schema is schemas.SYNTHESIS:
        return {
            "course_title": "Physics", "overview_md": "Motion.",
            "topics": [{"id": "t-kinematics", "name": "Kinematics", "summary": ""}],
            "concepts": [
                {"id": "c-velocity", "name": "Velocity", "topic_id": "t-kinematics", "one_liner": "speed with direction",
                 "prerequisites": ["c-acceleration"], "related": [], "importance": "core", "source_refs": []},
                {"id": "c-acceleration", "name": "Acceleration", "topic_id": "t-kinematics", "one_liner": "dv/dt",
                 "prerequisites": ["c-velocity"], "related": ["c-unknown"], "importance": "core", "source_refs": []},
            ],
            # Only Q1 is mapped: Q2 must be caught by coverage repair.
            "patterns": [{"id": "p-find-acceleration", "name": "Find acceleration", "description": "",
                          "calc": True, "concept_ids": ["c-acceleration"],
                          "source_questions": [{"material_id": PAPER_ID[0], "number": "Q1"}]}],
            "learning_path": ["c-velocity", "c-acceleration"],
        }
    if schema is schemas.COVERAGE_REPAIR:
        return {"assignments": [{"material_id": PAPER_ID[0], "number": "2", "pattern_id": "p-definitions"}],
                "new_patterns": [{"id": "p-definitions", "name": "Definitions", "description": "", "calc": False,
                                  "concept_ids": ["c-velocity"]}]}
    if schema is schemas.CONCEPT_DETAIL:
        d = {k: "" for k in schemas.CONCEPT_DETAIL["properties"]}
        d.update({k: [] for k, v in schemas.CONCEPT_DETAIL["properties"].items() if v.get("type") == "array"})
        d["atomic_steps"] = [{"step_md": "x", "everyday_link": "y"}]
        d["mcqs"] = [
            {"type": "intuition", "question_md": "Q?", "options": ["a", "b", "c", "d"], "correct": 2,
             "option_explanations": ["no", "no", "yes"], "difficulty": 5},
            {"type": "map", "question_md": "bad", "options": ["a"], "correct": 0, "option_explanations": [], "difficulty": 1},
        ]
        return d
    if schema is schemas.PATTERN_GUIDE:
        step = {"kind": "compute", "prompt_md": "a = ?", "answer_type": "numeric", "choices": [],
                "correct_choices": [], "numeric_answer": 5, "tolerance_pct": 1, "unit": "m/s^2",
                "text_answer_md": "", "hint_md": "", "explanation_md": "", "concept_ids": ["c-acceleration", "c-nope"]}
        bad_choice = dict(step, answer_type="choice", choices=["only"], correct_choices=[3], explanation_md="because")
        return {"recognition_cues": ["accelerates from"], "recipe": [], "tricks": [], "traps": [],
                "examiner_wants_md": "",
                "problems": [{"source": "past_paper", "source_ref": "Q1", "title": "Car", "statement_md": "...",
                              "parts": [{"label": "a", "prompt_md": "", "marks": "3", "final_answer_md": "5",
                                         "steps": [step, bad_choice]}]}]}
    if schema is schemas.VERIFY:
        return {"results": [{"problem_index": 0, "agrees": False, "independent_final_answers_md": "5",
                             "issues_md": "unit"}]}
    raise AssertionError(f"unexpected schema {schema}")


PAPER_ID: list[str] = []


def test_full_pipeline(tmp_data, monkeypatch):
    monkeypatch.setattr(llm, "structured", fake_structured)
    meta = storage.create_course("Physics 101")
    cid = meta["id"]
    storage.add_material(cid, "lecture1.txt", b"notes", "notes")
    paper = storage.add_material(cid, "final2023.txt", b"paper", "past_paper")
    PAPER_ID[:] = [paper["id"]]

    pipeline.start_job(cid, "analyze", {"variants": 1, "verify": True})
    for _ in range(200):
        if not pipeline.is_running(cid):
            break
        time.sleep(0.05)
    job = storage.get_job(cid)
    assert job["status"] == "completed" and job["errors"] == 0, job["log"]
    assert job["log"][-1]["msg"].startswith("Finished (completed)")

    kn = storage.get_knowledge(cid)
    ids = {c["id"] for c in kn["concepts"]}
    assert ids == {"c-velocity", "c-acceleration"}
    # cycle velocity <-> acceleration must be broken; unknown related id dropped
    prereq = {c["id"]: c["prerequisites"] for c in kn["concepts"]}
    assert not (prereq["c-velocity"] and prereq["c-acceleration"])
    assert all(r in ids for c in kn["concepts"] for r in c["related"])
    assert set(kn["learning_path"]) == ids
    # coverage repair added Q2 via a new pattern
    assert kn["uncovered_questions"] == []
    assert {p["id"] for p in kn["patterns"]} == {"p-find-acceleration", "p-definitions"}
    # bad MCQ dropped, difficulty clamped
    assert all(len(q["options"]) >= 2 for q in kn["mcqs"]) and all(q["difficulty"] <= 3 for q in kn["mcqs"])
    # problem cleaned: unknown concept removed, unusable choice step converted to text
    prob = next(p for p in kn["problems"] if p["pattern_id"] == "p-find-acceleration")
    s0, s1 = prob["parts"][0]["steps"]
    assert s0["concept_ids"] == ["c-acceleration"]
    assert s1["answer_type"] == "text" and s1["text_answer_md"] == "because"
    assert prob["verified"] is False and "unit" in prob["verify_note"]


def test_norm_qnum():
    assert pipeline.norm_qnum("Q1") == pipeline.norm_qnum("1") == pipeline.norm_qnum("Question 1")
    assert pipeline.norm_qnum("3(b)") == "3b"


def test_clean_mcq_keeps_figures():
    svg = "<svg xmlns='http://www.w3.org/2000/svg'></svg>"
    q = {"options": ["a", "b"], "correct": 1, "question_md": "?", "figure_svg": svg, "question_svg": svg}
    out = pipeline.clean_mcq(q, ["c-x"], "q-1")
    assert out["figure_svg"] == svg and out["question_svg"] == svg
    out = pipeline.clean_mcq({**q, "question_svg": "not an svg"}, ["c-x"], "q-1")
    assert "question_svg" not in out
