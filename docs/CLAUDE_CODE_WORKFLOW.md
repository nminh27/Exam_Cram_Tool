# Building a course with Claude Code (no API key)

This is the procedure Claude Code follows when the user says "build the Cramtoolfinal pack for <course>".
The result must match what the API pipeline would produce: the specification is the prompts in
`app/prompts.py` (`CONCEPT_TASK`, `PATTERN_TASK`, `SCAFFOLD_RULES`, `BASE_SYSTEM`). Read them first.

## 1. Find the materials

- `inbox/<course>/`: files the user dropped in the project folder, or
- files uploaded in the app: `python -m app.packcli list`, then `python -m app.packcli materials <course_id>`
  prints each file's kind (notes / past_paper / solutions / ...) and its path on disk.

Keep all working files in `inbox/<course>/` (git-ignored): `notes.md`, `build_pack.py`, `pack.json`.

## 2. Read everything, write `notes.md`

Read every file (PDFs in page ranges of up to 20 pages). In `inbox/<course>/notes.md` record:

- the app course id once known, and which files have been read;
- topics in teaching order, and the concept list with ids (`c-...`) and direct prerequisites;
- **every past-paper question** (file, number, marks, one-line summary) and the exam pattern (`p-...`) it
  belongs to: this is the coverage table, and every past-paper question must be in it;
- any formula sheet, notation and method conventions the lecturer uses;
- progress: which topics are done in `build_pack.py`.

`notes.md` is the memory between sessions: a big course is built over several sessions, topic by topic.

## 3. Write `build_pack.py`

Start from `samples/build_demo.py`: it shows every builder (`app/packkit.py`). Rules:

- **Compute every number in Python** (as `build_demo.py` does with variables), never by hand: step answers,
  intermediate values and the statement's data all come from the same variables, so they can't disagree.
- Past-paper problems: `statement_md` is the verbatim question (sub-parts and marks included);
  `source_questions` on the pattern carry the verbatim text and official solution.
- Variants (`source="variant"`): the exact same form as the past-paper questions, with different numbers.
- Every concept gets a full `det(...)` breakdown (why / what / how / everyday analogy / visualize /
  atomic steps / formulas with symbols / exam cues / traps / tips / worked example / self-check), 8+ MCQs
  across all five types with an explanation for every option, and a guided (Socratic) chain for core concepts.
- Every pattern gets a `guide(...)` and step-scaffolded problems following `SCAFFOLD_RULES`
  (given → unknown → concept/formula as choices → rearrange → substitute → compute → check → final).
- Keep ids stable once imported: the user's progress refers to them.
- End with `write_pack(Path(__file__).with_name("pack.json"), make_pack(...))`.

Run it with the project venv: `.venv\Scripts\python inbox\<course>\build_pack.py`. It validates before
writing; fix every error and read every warning.

## 4. Import into the app

- New course: `.venv\Scripts\python -m app.packcli import inbox\<course>\pack.json` (prints the course id; put it in `notes.md`).
- Existing course (uploaded through the app, or a later topic batch):
  `.venv\Scripts\python -m app.packcli import inbox\<course>\pack.json --into <course_id> --replace`
  (`--replace` swaps in the full rebuilt knowledge; without it, items are merged by id). Progress is kept.

The running app shows the change on the next page load.

## 5. Check and report

Open the course in the app, look at one concept page and solve one problem end to end. Tell the user what was
built (concepts, patterns, MCQs, problems), the coverage of past-paper questions, and what is still to do.

## Follow-up requests without a key

"Explain step X more simply", "more problems like pattern P", "more questions on concept C": answer in chat
if it's a one-off, or add to `build_pack.py`, rebuild and re-import so it lands in the app.
