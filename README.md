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
3. Click **Open demo course** to try everything without any AI key.
4. Pick how your own courses get built (next section), create a course, and upload its files.

macOS / Linux / Git Bash: `./run.sh`

Manual: `python -m venv .venv && .venv\Scripts\pip install -r requirements.txt && .venv\Scripts\python -m uvicorn app.main:app --port 8000`

## Two ways to build a course

### API mode: the app does it, with the AI of your choice

In **Settings → AI providers**, add one or more providers and pick which one does the work:

| Provider | Notes |
|---|---|
| **Anthropic Claude** (recommended) | FinalForge's prompts are written for Claude, and it reads PDFs natively (formulas, tables, diagrams). Default model `claude-opus-5-5`. |
| OpenAI, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together | Any OpenAI-compatible API. Paste the key, press **Load models**, pick one, press **Test**. |
| Ollama, LM Studio | Free models running on your own computer, no key. Much weaker results with small models. |
| Any other OpenAI-compatible endpoint | Give its base URL. |

- **Two roles:** *Analysis* builds the course; *Quick tasks* (marking written answers, "Break it down further") can use a cheaper or local model.
- **Keys** are stored only in `.env` (git-ignored), one line per provider, and are never shown again or sent anywhere but that provider.
- **PDFs with non-Claude models:** each page is sent as text; pages without a text layer (scans, handwriting) are sent as page images, so pick a vision model. *Advanced* lets you send every page as an image (best for maths) or text only (for text-only models).
- **Structured output:** FinalForge asks for strict JSON-schema output, and automatically falls back to plain JSON mode or instructions for APIs that don't support it; missing fields are filled in so the app never breaks.
- Quality varies by model. Keep **Verify generated problems** on, and use **Test** after adding a provider.

### Claude Code mode: no API key at all

With no provider set, Claude Code builds the course:

1. Create a course and upload its files on the Materials page, or drop them into `inbox/<course name>/`.
2. In Claude Code, say **"Build the FinalForge pack for <course name>"**. It reads every file, writes the same
   breakdowns, questions and step-by-step problems the Analyze button would (numbers computed in Python, then
   validated), and loads them into the app. Big courses are built topic by topic ("continue the pack for …").
3. Everything else works as usual. In this mode the app hides Analyze, "Break it down further", AI marking
   (you mark written answers against the model answer) and in-app generation; ask Claude Code for those instead.

Details: [docs/CLAUDE_CODE_WORKFLOW.md](docs/CLAUDE_CODE_WORKFLOW.md). Tools: `python -m app.packcli --help`.

You can switch any time: courses built either way look and work the same.

## Study website (GitHub Pages)

**https://nminh27.github.io/Exam_Cram_Tool/** is the same FinalForge interface as a website: open it on any
device, phone included, with nothing to install.

- It studies and drills courses you **import as knowledge packs**: build the course on your computer (Analyze,
  or Claude Code mode), press **Materials → Export knowledge pack**, get the file onto the device, and press
  **Import pack** on the website. The demo course is built in.
- Courses and progress are kept **in that browser** (IndexedDB). They are never uploaded to GitHub and don't
  sync between devices; **Course file → Progress backup** moves or protects your progress, and **Update with a
  newer pack** refreshes a course without losing it.
- Uploading files and the AI features (Analyze, "Break it down further", AI marking, generating more) need the app on your computer.
- The site is public, so only the app and the demo are published. Never commit your own course packs to the repo.

Publishing is automatic: every push to `main` runs `.github/workflows/pages.yml`, which builds the site with
`python scripts/build_site.py` and deploys it. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
Preview locally with `python scripts/build_site.py` and any static server.

## Cost

With Claude Opus 5.5 (`claude-opus-5-5`, about $4 / $20 per million input / output tokens) the course corpus is prompt-cached (1 h), so the many per-concept and per-pattern calls reuse it cheaply. A typical course of a few hundred pages plus 5–10 past papers costs a few dollars. For other providers, enter their prices under *Advanced* to get a cost estimate. The job panel shows live token counts. Re-running an analysis only processes new material unless you tick the rebuild boxes.

Other knobs live in `.env` (see `.env.example`): Claude effort per stage, refusal fallback, PDF chunk size.

## Knowledge packs

A course's entire knowledge base (concepts, patterns, MCQs, problems) can be exported as a single JSON **knowledge pack** (*Materials → Export*), and imported on another machine (*Home → Import pack*). Packs contain no API key and no uploaded files. The format is documented in [docs/PACK_FORMAT.md](docs/PACK_FORMAT.md), so Claude Code can also write a pack directly from your materials.

## Project layout

```
app/                FastAPI backend
  main.py           HTTP API + serves the web UI
  pipeline.py       analysis job: digest → knowledge map → concept breakdowns → pattern kits → verification
  prompts.py        every prompt (the pedagogy lives here)
  schemas.py        JSON schemas for structured outputs
  settings.py       AI providers (presets, roles, keys in .env)
  providers.py      adapters: Anthropic SDK, OpenAI-compatible HTTP; JSON fallbacks; cost meter
  llm.py            routes each call to the provider for its role
  ingest.py         PDF / image / DOCX / PPTX / text → content blocks (native PDF or text + page images)
  packkit.py        build / validate / merge knowledge packs (Claude Code mode)
  packcli.py        command line: list, materials, validate, import, dump
  storage.py        file-based storage under data/
web/                no-build UI (Preact + htm, KaTeX, marked, Cytoscape from CDNs)
  js/pages/*.js     one file per screen
  js/static-api.js  website mode: answers the API in the browser (IndexedDB)
  config.js         "server" here; "static" in the built website
scripts/build_site.py  builds the GitHub Pages website into _site/
samples/            demo course (build_demo.py → demo_pack.json)
tests/              pytest suite (fake AI, no key needed)
inbox/              drop materials here for Claude Code mode (git-ignored)
data/               your courses and provider settings (git-ignored)
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
