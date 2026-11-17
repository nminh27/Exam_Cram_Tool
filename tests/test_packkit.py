"""Pack builder / validator / merge / CLI tests for the no-API-key workflow."""
from __future__ import annotations

import json

import pytest

from app import config, packcli, packkit, storage
from app.packkit import concept, det, guide, make_pack, mcq, part, pattern, problem, source_q, step, topic


def small_pack(extra_concept: bool = False) -> dict:
    d = det("why", "what", "how", "analogy", "visual", [("a", "x"), ("b", "y"), ("c", "z")],
            formulas=[("v = u + at", "v", "", [("v", "velocity", "m/s")], "")], example="ex", check=["?"])
    cs = [concept("c-a", "A", "t-1", "first", detail=d), concept("c-b", "B", "t-1", "second", prereq=["c-a"], detail=d)]
    if extra_concept:
        cs.append(concept("c-c", "C", "t-1", "third", prereq=["c-b"], detail=d))
    pr = problem("p-x-1", "p-x", "past_paper", "Q1", "T", "Find $v$.", [
        part("a", "v?", 2, "$v = 5$", [
            step("formula", "Which?", "choice", choices=["$v=u+at$", "$v=at^2$"], correct=[0], cids=["c-a"]),
            step("final", "v =", "numeric", num=5.0, unit="m/s", cids=["c-b"]),
        ])])
    return make_pack("Test", topics=[topic("t-1", "T1")], concepts=cs,
                     patterns=[pattern("p-x", "X", "d", ["c-a", "c-b"], [source_q("m1", "1", "Find v.", "Final 2023")],
                                       guide_=guide(["cue"], [("s", "w", "e")]))],
                     mcqs=[mcq("q-1", ["c-a"], "intuition", "Q?", ["x", "y"], 1, ["no", "yes"])],
                     problems=[pr], learning_path=["c-b"])


def test_make_pack_is_valid_and_derived_fields():
    pack = small_pack()
    errors, warnings = packkit.validate(pack)
    assert errors == [], errors
    kn = pack["knowledge"]
    assert kn["learning_path"] == ["c-a", "c-b"]  # prerequisites first, every concept present
    assert kn["patterns"][0]["frequency"] == 1
    assert {c["id"]: c["exam_frequency"] for c in kn["concepts"]} == {"c-a": 1, "c-b": 1}
    assert kn["problems"][0]["parts"][0]["steps"][1]["id"] == "p-x-1-0-1"


def test_validator_catches_mistakes():
    pack = small_pack()
    kn = pack["knowledge"]
    kn["concepts"][0]["prerequisites"] = ["c-b"]  # cycle a <-> b
    kn["mcqs"][0]["correct"] = 5
    s0, s1 = kn["problems"][0]["parts"][0]["steps"]
    s0["correct_choices"] = [0, 1]  # choice with two answers
    s1["numeric_answer"] = None
    s1["concept_ids"] = ["c-missing"]
    kn["concepts"][1]["detail"]["mini_example_md"] = "cost $5 and"  # unclosed math
    errors, warnings = packkit.validate(pack)
    text = "\n".join(errors)
    assert "cycle" in text
    assert "mcq q-1: correct index out of range" in text
    assert "exactly one correct" in text
    assert "finite number" in text
    assert "unknown concept c-missing" in text
    assert any("odd number of $" in w for w in warnings)


def test_merge_replaces_by_id_and_appends():
    base = small_pack()["knowledge"]
    add = small_pack(extra_concept=True)["knowledge"]
    add["concepts"][0]["one_liner"] = "changed"
    merged = packkit.merge(base, add)
    by_id = {c["id"]: c for c in merged["concepts"]}
    assert set(by_id) == {"c-a", "c-b", "c-c"} and by_id["c-a"]["one_liner"] == "changed"
    assert len(merged["mcqs"]) == 1 and len(merged["problems"]) == 1
    assert merged["learning_path"] == ["c-a", "c-b", "c-c"]


@pytest.fixture()
def data(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "COURSES_DIR", tmp_path / "courses")
    return tmp_path


def test_cli_import_new_then_merge_keeps_progress(data, capsys):
    p1 = data / "pack.json"
    p1.write_text(json.dumps(small_pack()), encoding="utf-8")
    assert packcli.main(["validate", str(p1)]) == 0
    assert packcli.main(["import", str(p1)]) == 0
    cid = storage.list_courses()[0]["id"]
    storage.add_events(cid, [{"kind": "mcq", "item_id": "q-1", "concept_ids": ["c-a"], "score": 1}])

    p2 = data / "pack2.json"
    p2.write_text(json.dumps(small_pack(extra_concept=True)), encoding="utf-8")
    assert packcli.main(["import", str(p2), "--into", cid]) == 0
    kn = storage.get_knowledge(cid)
    assert len(kn["concepts"]) == 3
    assert len(storage.get_progress(cid)["events"]) == 1

    bad = small_pack()
    bad["knowledge"]["mcqs"][0]["correct"] = 9
    p3 = data / "bad.json"
    p3.write_text(json.dumps(bad), encoding="utf-8")
    assert packcli.main(["import", str(p3), "--into", cid, "--replace"]) == 1  # refused
    assert len(storage.get_knowledge(cid)["concepts"]) == 3  # unchanged

    assert packcli.main(["dump", cid, str(data / "out.json")]) == 0
    assert json.loads((data / "out.json").read_text(encoding="utf-8"))["format"] == "finalforge-pack"
    assert packcli.main(["materials", "nope"]) == 1
