"""Prompts for every stage of the knowledge pipeline.

BASE_SYSTEM is identical across calls (it sits in front of the cached corpus), so do not
interpolate anything volatile into it.
"""
from __future__ import annotations

BASE_SYSTEM = """You are the knowledge engine of FinalForge, a study platform with one job: a student \
uploads their course materials and past exam papers, and FinalForge must take them from \
"confused" to "can score full marks on any question shaped like the past papers".

Principles that apply to everything you produce:

1. Faithful to the course. The course materials are the source of truth: use the lecturer's \
notation, terminology, conventions, sign conventions, rounding habits and solution methods, \
because those are what the marker rewards. Do not drift into content the course does not \
examine. When you add an everyday analogy or intuition that is not in the materials, that is \
welcome, but never change the examinable content.

2. Atomic breakdown. Break every idea and every solution into steps so small that each step \
is ONE action or ONE idea and cannot sensibly be split further. A step never combines two \
operations (e.g. "rearrange and substitute" is two steps). Write so a bright 12-year-old could \
follow each step.

3. Everyday anchoring. Tie concepts to mundane, concrete life experiences that a child would \
know: sharing sweets, filling a bathtub, a queue at the canteen, a seesaw, pocket money, \
a bike ride, a leaking bucket. The analogy must map onto the concept accurately (say where the \
analogy stops working if that matters for the exam).

4. Exam-first. Always connect knowledge to how it is examined: the trigger words in questions, \
the shape of the given data, which formula/approach that signals, what earns method marks, \
and the traps that lose marks.

5. Correctness. Double-check every number, unit and formula. If the materials contain an \
error or ambiguity, follow the materials but note it.

Formatting: Markdown. Math in LaTeX: inline $...$, display $$...$$. Write a literal dollar \
sign as \\$. Keep prose tight; no filler, no motivational fluff."""


DIGEST_INSTRUCTIONS = {
    "default": """Read the attached material and produce a faithful, dense DIGEST of it.

- `sections`: follow the document's own structure. In `content_md` capture EVERY examinable \
item: definitions, theorems, laws, every formula (LaTeX, with what each symbol means and its \
units), derivation steps, conditions/assumptions, diagrams (describe them precisely in words, \
with all labels and values), and every worked example IN FULL (all steps and numbers). Also \
record lecturer emphasis ("important", "will be examined", boxed results). Be complete rather \
than short: details dropped here are lost to the student. `pages`: page/slide range.
- `concepts`: every distinct teachable idea in the material, with a one-sentence description.
- `questions`: any exercises/problems/exam questions in the material, transcribed verbatim \
(see rules below). Empty list if none.""",

    "past_paper": """This is a PAST EXAM PAPER (or test). Your top priority is a perfect \
transcription of every question.

- `questions`: one entry per top-level question. `text_md` must be VERBATIM: the full stem, \
every sub-part ((a), (b)(i)...), every given value with units, tables (as Markdown tables), \
answer options, instructions, and any figure described precisely in words with all labels and \
values (prefix with "[Figure: ...]"). Include the marks for each sub-part inline, e.g. "(4 marks)". \
`marks`: total marks. `topics`: the course topics it tests. `question_type`: calculation if \
any numeric answer is required. `solution_md`: if this document contains solutions or a mark \
scheme for the question, copy them in full; otherwise empty string.
- `sections`: cover page instructions, formula sheet / data booklet content (VERY important: \
copy any formula sheet verbatim), and anything else on the paper.
- `concepts`: the concepts this paper examines.
- `label`: e.g. "Final exam 2023 (Semester 1)".""",

    "solutions": """This is a SOLUTIONS / MARK SCHEME document.

- `questions`: one entry per question it solves. `number` must match the exam's numbering. \
`text_md`: the question text if it is shown (verbatim), otherwise a short reconstruction \
prefixed with "[Reconstructed]". `solution_md`: the COMPLETE worked solution, every line, \
every intermediate number, plus mark allocations (M1/A1 etc.) and examiner comments.
- `sections`: general marking notes, common errors reported by examiners.
- `label`: which paper these are solutions for (year/semester) so they can be matched.""",
}


def digest_instruction(kind: str) -> str:
    if kind == "past_paper":
        return DIGEST_INSTRUCTIONS["past_paper"]
    if kind == "solutions":
        return DIGEST_INSTRUCTIONS["solutions"]
    if kind == "problem_set":
        return DIGEST_INSTRUCTIONS["default"] + "\n\nThis is a PROBLEM SET: transcribe every problem verbatim into `questions` (with solutions if present)."
    return DIGEST_INSTRUCTIONS["default"]


CORPUS_HEADER = """The complete digested course corpus follows. Every material is wrapped in a \
<material> tag with its id and kind. Past paper questions are the gold standard for what \
"full marks" means in this course."""


SYNTHESIS_TASK = """Build the KNOWLEDGE MAP of this course from the corpus.

- `topics`: 3-12 big chapters/themes, in teaching order. ids like "t-kinematics".
- `concepts`: the teachable ideas. Granularity: one concept = one idea a student can learn \
in one sitting and that has its own "why/what/how" (not a whole chapter, not a trivial fact). \
Typical courses have 15-60. ids like "c-newtons-second-law" (lowercase, hyphens, unique). \
`prerequisites`: ids of concepts that must be understood DIRECTLY before this one (no \
transitive ones, no cycles). `related`: ids of concepts often confused with or used together \
with it. `importance`: core if past papers examine it directly, supporting if needed to solve \
core questions, peripheral otherwise. `source_refs`: e.g. ["m_ab12 §2.3", "m_cd34 Q4"].
- `patterns`: the EXAM QUESTION ARCHETYPES. Group past-paper (and problem-set) questions that \
are solved with the same recipe, e.g. "Projectile launched horizontally from a height: find \
time of flight and range". ids like "p-horizontal-projectile". A multi-part question may \
appear in more than one pattern if its parts need different recipes. EVERY past-paper \
question in the corpus must be listed in at least one pattern's `source_questions` \
(material_id + question number exactly as in the corpus). `calc` true if numeric work is \
required. `concept_ids`: concepts the recipe needs.
- `learning_path`: ALL concept ids in the best order to learn them (prerequisites first, then \
by exam importance).
- `course_title` and `overview_md`: the big picture: what the course is about, how the topics \
connect into one story, and what the final exam typically looks like (structure, marks, \
recurring question types, based on the past papers)."""


COVERAGE_TASK = """Some past-paper questions were not assigned to any exam pattern. Assign each \
one to the best existing pattern id, or create a new pattern for it (new ids must start with \
"p-" and not clash). Only create a new pattern when no existing recipe solves it.

Existing patterns:
{patterns}

Unassigned questions:
{questions}"""


CONCEPT_TASK = """Write the complete BREAKDOWN for this one concept, for a student who must \
master it for the final exam.

Concept:
{concept}

Exam patterns that use it: {patterns}
Past-paper questions that involve it: {questions}
Prerequisites (already learned): {prereqs}

Fill every field:
- `why_exists_md`: the problem that forced humans to invent this idea. Start with an everyday \
situation where you NEED it and life is awkward without it.
- `what_it_does_md`: what it lets you do / compute / predict, in one short paragraph plus a \
plain-language "in one sentence" line.
- `how_it_works_md`: the mechanism, built up step by step from things the student already knows.
- `everyday_analogy_md`: one vivid analogy from mundane child-level life, mapped explicitly \
(analogy part -> concept part), plus where the analogy breaks if that matters for exams.
- `visualize_md`: how to picture it in your head: a concrete mental image or a sketch the \
student can draw in 10 seconds in the exam.
- `diagram_svg`: a SIMPLE self-contained SVG (viewBox, under 3 KB, no scripts, no external \
refs, font-family sans-serif, stroke/fill "#4b5563" with one accent "#6366f1") illustrating \
the visualization; empty string if a diagram would not help.
- `atomic_steps`: the smallest possible steps to understand (and apply) the concept, each with \
an `everyday_link` (a 3-10 word everyday parallel).
- `formulas`: every formula of this concept used in the course: LaTeX, name, meaning, each \
symbol with meaning and SI/course unit, and when to use it (and when NOT to).
- `patterns_to_spot`: phrases/data shapes in exam questions that signal this concept \
("cue") and what each signals.
- `common_traps`: mistakes students make that lose marks, each with a fix.
- `tips_tricks`: shortcuts, sanity checks, mnemonic devices, examiner preferences; `source` \
= past paper reference (e.g. "m_ab12 Q3") or "general".
- `mini_example_md`: a short fully-worked example in the exact style of the past papers, \
every step shown.
- `self_check`: 3-5 questions the student should be able to answer out loud.
- `mcqs`: 8-12 multiple-choice questions mixing types: intuition (everyday scenario, no \
calculation, tests gut understanding), misconception (distractors are real common \
misconceptions), application (small exam-like use), pattern (show an exam-style question \
stem; ask which concept/approach/first step applies), map (how this concept relates to \
others: prerequisite, consequence, contrast). 4 options each, exactly one correct (`correct` \
is the 0-based index), `option_explanations` explains for EVERY option why it is right or \
wrong, `difficulty` 1-3. No "all/none of the above".
- `guided`: a Socratic chain of 4-7 small multiple-choice questions that lets the student \
DISCOVER the concept themselves, starting from an everyday observation and ending at the \
formal idea. Each step builds on the previous one; `explanation_md` reveals the insight."""


PATTERN_TASK = """Build the complete SOLVING KIT for this exam question archetype.

Pattern:
{pattern}

Concept ids available (use these in `concept_ids`): {concept_ids}

Source questions from past papers (verbatim, with official solutions where available):
{questions}

Fill every field:
- `recognition_cues`: how to recognise this archetype within 10 seconds of reading a question \
(trigger words, given-data shape, what is asked).
- `recipe`: the universal step-by-step method, atomic steps, each with why it is done and an \
everyday parallel.
- `tricks`: shortcuts, checks and time-savers seen in the solutions / mark schemes.
- `traps`: where students lose marks on this archetype.
- `examiner_wants_md`: what earns full marks (method marks, units, significant figures, \
statements that must be written).
- `problems`: FIRST, one problem per source question listed above, in the same order, \
`source` "past_paper", `source_ref` "<material_id> Q<number>", `statement_md` the VERBATIM \
question. THEN {n_variants} NEW variant problems (`source` "variant", `source_ref` e.g. \
"variant of m_ab12 Q3") that are in EXACTLY the same form as the past-paper questions: same \
number and order of parts, same wording style and instructions, same kind of given data and \
units, same mark allocation, same figure style. Change the numbers (realistic values that \
give clean-but-not-trivial answers) and at most superficial context.
Official solutions / mark schemes may sit in a separate "solutions" material in the corpus: \
find and follow them (their method is the one that gets marks).

{rules}"""


SCAFFOLD_RULES = """Scaffolding rules for each part's `steps` (this is what the student types into, one small \
answer box at a time, in the order a top student writes the solution):
1. Start with "given" steps: what information is given. Use `multi` with 5-8 candidate \
items (the real givens plus plausible distractors such as quantities not given or wrong \
values), or `numeric` to extract a specific value (with unit).
2. An "unknown" step: what exactly is asked (choice).
3. "concept"/"formula" steps: which principle / formula to use, as `choice` with distractors \
that are classic wrong choices. NEVER make the student type a formula.
4. "rearrange" (choice between rearranged forms), "substitute" (choice or numeric), \
"compute" (numeric, one operation per step for multi-stage arithmetic), "units"/"check" \
(sanity check), "interpret" when the exam wants a statement.
5. Theory/explain parts use `explain` steps: `choice`/`multi` for the key points, and at most \
one `text` step with a model answer in `text_answer_md` listing the marking points.
6. End each part with a "final" step whose answer matches `final_answer_md`.
For every step: `prompt_md` is a short direct question; `hint_md` nudges without giving the \
answer away; `explanation_md` shows the working and WHY. Numeric steps: `numeric_answer` in \
the stated `unit`, `tolerance_pct` 1 (use 2-5 only where rounding of intermediate values is \
expected). Non-numeric steps: `numeric_answer` 0, `tolerance_pct` 0, `unit` "". \
`correct_choices`: 0-based indices into `choices` (one index for `choice`, all correct ones for \
`multi`, empty for numeric/text). `text_answer_md`: the model answer for text steps, else "". \
`concept_ids`: from the list above.
Verify every number by recomputing it before you write it."""


MORE_PROBLEMS_TASK = """Create {n} NEW variant problems (`source` "variant") for this exam \
archetype, in EXACTLY the same form as its past-paper questions (same parts, wording style, \
data types, units, marks). Use different numbers from the existing problems.

Pattern:
{pattern}

Concept ids available: {concept_ids}

Past-paper source questions (the form to copy):
{questions}

Existing problems (do not duplicate their numbers):
{existing}

{rules}"""


SCAFFOLD_TASK = """Scaffold ONLY these past-paper questions of the archetype below into \
step-by-step problems (`source` "past_paper", `source_ref` "<material_id> Q<number>", \
`statement_md` verbatim), one problem per question in the given order. Official solutions \
may be in a separate "solutions" material in the corpus: follow their method.

Pattern:
{pattern}

Concept ids available: {concept_ids}

Questions:
{questions}

{rules}"""


VERIFY_TASK = """Independently check these generated exam problems. For each problem: first \
solve it yourself from the statement ONLY (do your working privately), then compare your \
final answers with the provided solution steps. Set `agrees` false if any final answer, \
intermediate numeric step, unit, or correct-choice index is wrong, or if the problem is \
ill-posed. Put your own final answers in `independent_final_answers_md` and describe any \
discrepancy precisely in `issues_md` (empty if none). `problem_index` is the index shown.

{problems}"""


EXPLAIN_SIMPLER_TASK = """A student studying the concept below is stuck and asked you to break \
this down EVEN SMALLER.

Concept: {concept}
The part they are stuck on:
{snippet}
Their message (may be empty): {message}

Respond in Markdown:
1. A one-sentence plain-language core idea.
2. An everyday analogy from a child's daily life, mapped piece by piece.
3. The idea rebuilt in the smallest possible numbered steps (each step one idea; if a step \
has any math, show a tiny numeric example).
4. One quick question they can answer to check they got it (answer hidden at the end under \
"Answer:").
Stay faithful to the course's notation."""


GRADE_TASK = """Grade a student's written answer for one step of an exam problem. Be strict \
like an exam marker but fair about wording: meaning matters, not exact phrasing.

Question context:
{context}

Step prompt:
{prompt}

Model answer / marking points:
{model}

Student answer:
{answer}

Return `verdict` (correct = all key marking points present and nothing wrong; partial = some \
points; incorrect = wrong or missing the main point), `feedback_md` (2-4 sentences, \
encouraging, say exactly what to add or fix), `missing_points`."""


MORE_MCQS_TASK = """Write {n} NEW multiple-choice questions for this concept (do not repeat the \
existing ones). Mix types: intuition, misconception, application, pattern, map. 4 options, \
one correct, explanations for every option, difficulty 1-3, no "all/none of the above".

Concept:
{concept}

Existing questions:
{existing}"""
