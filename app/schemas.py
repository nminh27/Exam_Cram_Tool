"""JSON schemas for Claude's structured outputs (output_config.format).

Structured outputs need every object to set additionalProperties: false; no numeric or
length constraints. Every property is required: "not applicable" is an empty string/list.
"""
from __future__ import annotations


def obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def arr(items: dict) -> dict:
    return {"type": "array", "items": items}


STR = {"type": "string"}
INT = {"type": "integer"}
NUM = {"type": "number"}
BOOL = {"type": "boolean"}


def enum(*values: str) -> dict:
    return {"type": "string", "enum": list(values)}


# ---------------------------------------------------------------- Stage 1: per-material digest

DIGEST = obj({
    "title": STR,
    "kind_detected": enum("notes", "slides", "textbook", "past_paper", "solutions", "problem_set", "other"),
    "label": STR,  # e.g. "Final exam 2023", "Lecture 4"
    "summary": STR,
    "sections": arr(obj({"heading": STR, "pages": STR, "content_md": STR})),
    "concepts": arr(obj({"name": STR, "description": STR})),
    "questions": arr(obj({
        "number": STR,
        "text_md": STR,
        "marks": STR,
        "topics": arr(STR),
        "question_type": enum("calculation", "theory", "mixed", "proof", "diagram", "other"),
        "solution_md": STR,
    })),
})

# ---------------------------------------------------------------- Stage 2: course synthesis

QUESTION_REF = obj({"material_id": STR, "number": STR})

SYNTHESIS = obj({
    "course_title": STR,
    "overview_md": STR,
    "topics": arr(obj({"id": STR, "name": STR, "summary": STR})),
    "concepts": arr(obj({
        "id": STR,
        "name": STR,
        "topic_id": STR,
        "one_liner": STR,
        "prerequisites": arr(STR),
        "related": arr(STR),
        "importance": enum("core", "supporting", "peripheral"),
        "source_refs": arr(STR),
    })),
    "patterns": arr(obj({
        "id": STR,
        "name": STR,
        "description": STR,
        "calc": BOOL,
        "concept_ids": arr(STR),
        "source_questions": arr(QUESTION_REF),
    })),
    "learning_path": arr(STR),
})

COVERAGE_REPAIR = obj({
    "assignments": arr(obj({"material_id": STR, "number": STR, "pattern_id": STR})),
    "new_patterns": arr(obj({
        "id": STR, "name": STR, "description": STR, "calc": BOOL, "concept_ids": arr(STR),
    })),
})

# ---------------------------------------------------------------- Stage 3: concept deep dive

MCQ = obj({
    "type": enum("intuition", "misconception", "application", "pattern", "map"),
    "question_md": STR,
    "options": arr(STR),
    "correct": INT,
    "option_explanations": arr(STR),
    "difficulty": INT,
})

GUIDED_STEP = obj({
    "question_md": STR,
    "options": arr(STR),
    "correct": INT,
    "explanation_md": STR,
})

CONCEPT_DETAIL = obj({
    "why_exists_md": STR,
    "what_it_does_md": STR,
    "how_it_works_md": STR,
    "everyday_analogy_md": STR,
    "visualize_md": STR,
    "diagram_svg": STR,
    "atomic_steps": arr(obj({"step_md": STR, "everyday_link": STR})),
    "formulas": arr(obj({
        "latex": STR,
        "name": STR,
        "meaning_md": STR,
        "symbols": arr(obj({"symbol": STR, "meaning": STR, "unit": STR})),
        "when_to_use_md": STR,
    })),
    "patterns_to_spot": arr(obj({"cue": STR, "signals_md": STR})),
    "common_traps": arr(obj({"trap_md": STR, "fix_md": STR})),
    "tips_tricks": arr(obj({"tip_md": STR, "source": STR})),
    "mini_example_md": STR,
    "self_check": arr(STR),
    "mcqs": arr(MCQ),
    "guided": arr(GUIDED_STEP),
})

# ---------------------------------------------------------------- Stage 4: patterns + problems

STEP = obj({
    "kind": enum("given", "unknown", "concept", "formula", "rearrange", "substitute",
                 "compute", "units", "check", "interpret", "explain", "final"),
    "prompt_md": STR,
    "answer_type": enum("numeric", "choice", "multi", "text"),
    "choices": arr(STR),
    "correct_choices": arr(INT),
    "numeric_answer": NUM,
    "tolerance_pct": NUM,
    "unit": STR,
    "text_answer_md": STR,
    "hint_md": STR,
    "explanation_md": STR,
    "concept_ids": arr(STR),
})

PROBLEM = obj({
    "source": enum("past_paper", "variant"),
    "source_ref": STR,
    "title": STR,
    "statement_md": STR,
    "parts": arr(obj({
        "label": STR,
        "prompt_md": STR,
        "marks": STR,
        "final_answer_md": STR,
        "steps": arr(STEP),
    })),
})

PATTERN_GUIDE = obj({
    "recognition_cues": arr(STR),
    "recipe": arr(obj({"step_md": STR, "why_md": STR, "everyday_link": STR})),
    "tricks": arr(STR),
    "traps": arr(STR),
    "examiner_wants_md": STR,
    "problems": arr(PROBLEM),
})

PROBLEMS_ONLY = obj({"problems": arr(PROBLEM)})

VERIFY = obj({
    "results": arr(obj({
        "problem_index": INT,
        "agrees": BOOL,
        "independent_final_answers_md": STR,
        "issues_md": STR,
    })),
})

# ---------------------------------------------------------------- tutor / grading

GRADE = obj({
    "verdict": enum("correct", "partial", "incorrect"),
    "feedback_md": STR,
    "missing_points": arr(STR),
})

MORE_MCQS = obj({"mcqs": arr(MCQ)})
