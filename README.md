# FinalForge

Turn your course materials and past papers into an exam-ready training ground.

Upload lecture notes, slides, textbook chapters and **past papers** (plus solutions if you have them).
FinalForge uses Claude to:

1. **Read everything faithfully.** PDFs are read as page images, so formulas, tables and diagrams survive. Past-paper questions are transcribed verbatim; you can check each transcription in *Materials → view what was read*.
2. **Build the knowledge map.** Topics → concepts → direct prerequisites, a recommended learning path, and every past-paper question grouped into **exam patterns** (the archetypes examiners reuse). A coverage check makes sure every past-paper question belongs to a pattern.
3. **Break every concept down to atoms.** For each concept: *why it exists, what it does, how it works, an everyday picture a child would get, how to visualize it (with a diagram), the smallest possible steps, every formula with each symbol explained, the exam cues that signal it, the traps that lose marks, tips and tricks from the past papers, a worked mini-example, and self-check questions.* Any section or step has a **"Break it down further"** button that asks Claude to explain it even smaller.
4. **Build a solving kit per exam pattern.** How to recognise it in 10 seconds, the universal recipe, tricks, traps and what the examiner rewards.
5. **Generate practice in the exact form of the past papers.** Every past-paper question, plus new variants with the same parts, wording style, data and mark allocation, is **scaffolded into small answer boxes**: *what's given → what's asked → which principle → which formula → rearrange → substitute → calculate → sanity check → final answer.* A second, independent Claude pass re-solves every generated problem and flags disagreements.

Then you train:

| Mode | What it does |
|---|---|
| **Concept quiz (MCQ)** | Intuition (everyday scenarios), misconception, application, "spot the approach" and concept-relationship questions, each option explained. Smart mode serves unseen and previously-missed questions first. |
| **Discover it yourself** | A Socratic chain of small questions on each concept page that leads you from an everyday observation to the formal idea. |
| **Knowledge-map drills** | Built from your concept graph: what must come first, what a concept unlocks, which concepts a question type needs, putting a recipe in order. |
| **Exam problems, step by step** | The question stays pinned on the left like an exam paper; you fill one small box at a time, with hints, targeted nudges (wrong sign, power-of-ten slip, rounding), AI marking for written answers, and "I don't get this step". |
| **Progress & readiness** | Per-concept mastery (recency-weighted), per-pattern readiness (last 3 attempts), and an exam-readiness estimate weighted by how often each pattern appears in past papers. |

> No tool can promise a 100% mark. What FinalForge does is make the gaps visible: every past-paper question maps to a pattern, every pattern to concepts, and the readiness numbers only go up when you actually solve exam-form problems without help.

## Quick start (Windows)

1. Install Python 3.11+ (you have 3.13).
2. Double-click **`run.bat`** (first run installs dependencies into `.venv`). The app opens at http://localhost:8000.
3. Click **Open demo course** to try everything without an API key.
4. For your own course: **Settings → paste your Anthropic API key** (stored only in `.env`, which is git-ignored), create a course, upload files, press **Analyze**.

macOS / Linux / Git Bash: `./run.sh`

Manual: `python -m venv .venv && .venv\Scripts\pip install -r requirements.txt && .venv\Scripts\python -m uvicorn app.main:app --port 8000`

## Cost

Analysis uses Claude Opus 5.5 (`claude-opus-5-5`, about $4 / $20 per million input / output tokens). The course corpus is prompt-cached (1 h) so the many per-concept and per-pattern calls reuse it cheaply. The job panel shows a live token count and an approximate dollar figure. Re-running an analysis only processes new material unless you tick the rebuild boxes. A typical course of a few hundred pages plus 5–10 past papers costs a few dollars.

Settings live in `.env` (see `.env.example`): model, effort per stage, parallelism, refusal fallback, PDF chunk size.

## Knowledge packs

A course's entire knowledge base (concepts, patterns, MCQs, problems) can be exported as a single JSON **knowledge pack** (*Materials → Export*), and imported on another machine (*Home → Import pack*). Packs contain no API key and no uploaded files. The format is documented in [docs/PACK_FORMAT.md](docs/PACK_FORMAT.md), so Claude Code can also write a pack directly from your materials.

## Project layout

```
app/                FastAPI backend
  main.py           HTTP API + serves the web UI
  pipeline.py       analysis job: digest → knowledge map → concept breakdowns → pattern kits → verification
  prompts.py        every prompt (the pedagogy lives here)
  schemas.py        JSON schemas for Claude's structured outputs
  llm.py            Anthropic SDK wrapper (streaming, structured output, caching, cost meter)
  ingest.py         PDF / image / DOCX / PPTX / text → Claude content blocks
  storage.py        file-based storage under data/
web/                no-build UI (Preact + htm, KaTeX, marked, Cytoscape from CDNs)
  js/pages/*.js     one file per screen
samples/            demo course (build_demo.py → demo_pack.json)
tests/              pytest suite (fake Claude, no key needed)
data/               your courses (git-ignored)
```

Run tests: `.venv\Scripts\python -m pytest -q`

## Working with GitHub

The project is a git repository. To publish it, create an empty GitHub repo and either give Claude Code the URL ("push this to https://github.com/you/finalforge") or run:

```bash
git remote add origin https://github.com/<you>/<repo>.git
```

```bash
git push -u origin main
```

`data/` and `.env` are git-ignored, so your course files, progress and API key never leave your computer. CI (`.github/workflows/ci.yml`) runs the test suite on every push.
