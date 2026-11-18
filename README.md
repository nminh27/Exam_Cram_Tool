# Cramtoolfinal

Turn your course materials and past papers into an exam-ready training ground.

**Use it in your browser: https://nminh27.github.io/Exam_Cram_Tool/**. Nothing to install and no API key.
You build each course with **your own AI chat** (ChatGPT, Claude, Gemini…):

1. On the website, press **Copy prompt**.
2. Open your AI chat, attach your lecture notes, slides and every past paper (with solutions if you have them), paste the prompt and send.
3. Paste the AI's reply back into the website and press **Create course**. Big courses come in parts: ask the AI to continue and
   add each reply on the course's **Course file** page.

The website fixes small mistakes in the reply on its own, keeps everything in your browser, and never uploads your files.
(The [computer app](#optional-the-computer-app) can do the same with an API key, or with Claude Code.)

From your materials, the course contains:

1. **Everything read faithfully.** Past-paper questions are copied word for word into the exam pattern they belong to. (In the computer app, PDFs are read as page images and you can check each transcription in *Materials → view what was read*.)
2. **Build the knowledge map.** Topics → concepts → direct prerequisites, a recommended learning path, and every past-paper question grouped into **exam patterns** (the archetypes examiners reuse). A coverage check makes sure every past-paper question belongs to a pattern.
3. **Every concept broken down to atoms.** For each concept: *why it exists, what it does, how it works, an everyday picture a child would get, how to visualize it, the smallest possible steps, every formula with each symbol explained, the exam cues that signal it, the traps that lose marks, tips and tricks from the past papers, a worked mini-example, and self-check questions.* In the computer app with an API key, any section or step also has a **"Break it down further"** button.
4. **Build a solving kit per exam pattern.** How to recognise it in 10 seconds, the universal recipe, tricks, traps and what the examiner rewards.
5. **Practice in the exact form of the past papers.** Every past-paper question, plus new variants with the same parts, wording style, data and mark allocation, is **scaffolded into small answer boxes**: *what's given → what's asked → which principle → which formula → rearrange → substitute → calculate → sanity check → final answer.* (The computer app also re-solves every generated problem independently and flags disagreements.)

Then you train:

| Mode | What it does |
|---|---|
| **Concept quiz (MCQ)** | Intuition (everyday scenarios), misconception, application, "spot the approach" and concept-relationship questions, each option explained. Smart mode serves unseen and previously-missed questions first. |
| **Discover it yourself** | A Socratic chain of small questions on each concept page that leads you from an everyday observation to the formal idea. |
| **Knowledge-map drills** | Built from your concept graph: what must come first, what a concept unlocks, which concepts a question type needs, putting a recipe in order. |
| **Exam problems, step by step** | The question stays pinned on the left like an exam paper; you fill one small box at a time, with hints and targeted nudges (wrong sign, power-of-ten slip, rounding). Written answers are compared with the model answer (or AI-marked in the app with an API key). |
| **Progress & readiness** | Per-concept mastery (recency-weighted), per-pattern readiness (last 3 attempts), and an exam-readiness estimate weighted by how often each pattern appears in past papers. |

> No tool can promise a 100% mark. What Cramtoolfinal does is make the gaps visible: every past-paper question maps to a pattern, every pattern to concepts, and the readiness numbers only go up when you actually solve exam-form problems without help.

## Study website (GitHub Pages)

**https://nminh27.github.io/Exam_Cram_Tool/** works on any device, phone included, with nothing to install.

- **New course:** home page → *Make your course with your own AI* → **Copy prompt**, give it to your AI chat with your files,
  paste the reply, **Create course**. The prompt (`web/js/ai-prompt.js`) asks for the [knowledge pack format](docs/PACK_FORMAT.md);
  `web/js/pack-clean.js` repairs small mistakes (missing fields, clashing ids, out-of-range answers) and lists what it changed.
- **Big course:** the AI builds a topic or two per reply. On the course's **Course file** page, **Copy "continue" message**, send it
  to the same chat, and paste each new reply under *Add more with your AI*. You can add more questions the same way at any time.
- **Already have a file?** **Open course file** loads a `.json` course file you or a classmate saved; the demo course is built in.
- Courses and progress are kept **in that browser** (IndexedDB). Nothing is uploaded: you talk to your AI yourself, and the website
  never calls an AI or needs a key. **Course file → Download course file** and **Progress backup** move or protect them;
  **Replace with a newer file** refreshes a course without losing progress.
- Not on the website: uploading files to Cramtoolfinal itself, "Break it down further", AI marking of written answers and
  one-click "generate more". Ask your AI chat for more instead, or use the computer app.
- The site is public, so only the app and the demo are published. Never commit your own course files to the repo.

Publishing is automatic: every push to `main` runs `.github/workflows/pages.yml`, which builds the site with
`python scripts/build_site.py` and deploys it. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
Preview locally with `python scripts/build_site.py` and any static server.

## Optional: the computer app

You don't need it to study: the [website](https://nminh27.github.io/Exam_Cram_Tool/) builds courses with your own AI chat.
The app is for people who prefer to upload files once and let an API key (or Claude Code) do the whole build, with the extra
AI features (independent re-solving of problems, "Break it down further", AI marking). It's free and runs on your own computer.

1. **Install Python** 3.11 or newer from [python.org/downloads](https://www.python.org/downloads/).
   On Windows, tick **"Add python.exe to PATH"** on the first screen of the installer.
2. **Download Cramtoolfinal:** at the top of this page press the green **Code** button → **Download ZIP**, then unzip it
   (right-click → *Extract All*).
3. **Start it:** open the unzipped folder and double-click **`run.bat`**. The first start installs what it needs
   (a minute or two), then the app opens in your browser at http://localhost:8000. Keep the black window open while you use it;
   close it to stop the app.
4. Click **Open demo course** to look around, then create your own course (next section).

macOS / Linux: open a terminal in the folder and run `./run.sh`.

**To study on your phone:** in the app, open the course's **Materials** page and press **Export knowledge pack**. That
downloads a course file (`.cramtoolfinal.json`); put it on your phone and press **Open course file** on the
[study website](https://nminh27.github.io/Exam_Cram_Tool/).

Manual: `python -m venv .venv && .venv\Scripts\pip install -r requirements.txt && .venv\Scripts\python -m uvicorn app.main:app --port 8000`

## Two ways to build a course in the app

### API mode: the app does it, with the AI of your choice

In **Settings → AI providers**, add one or more providers and pick which one does the work:

| Provider | Notes |
|---|---|
| **Anthropic Claude** (recommended) | Cramtoolfinal's prompts are written for Claude, and it reads PDFs natively (formulas, tables, diagrams). Default model `claude-opus-5-5`. |
| OpenAI, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together | Any OpenAI-compatible API. Paste the key, press **Load models**, pick one, press **Test**. |
| Ollama, LM Studio | Free models running on your own computer, no key. Much weaker results with small models. |
| Any other OpenAI-compatible endpoint | Give its base URL. |

- **Two roles:** *Analysis* builds the course; *Quick tasks* (marking written answers, "Break it down further") can use a cheaper or local model.
- **Keys** are stored only in `.env` (git-ignored), one line per provider, and are never shown again or sent anywhere but that provider.
- **PDFs with non-Claude models:** each page is sent as text; pages without a text layer (scans, handwriting) are sent as page images, so pick a vision model. *Advanced* lets you send every page as an image (best for maths) or text only (for text-only models).
- **Structured output:** Cramtoolfinal asks for strict JSON-schema output, and automatically falls back to plain JSON mode or instructions for APIs that don't support it; missing fields are filled in so the app never breaks.
- Quality varies by model. Keep **Verify generated problems** on, and use **Test** after adding a provider.

### Claude Code mode: no API key at all

With no provider set, Claude Code builds the course:

1. Create a course and upload its files on the Materials page, or drop them into `inbox/<course name>/`.
2. In Claude Code, say **"Build the Cramtoolfinal pack for <course name>"**. It reads every file, writes the same
   breakdowns, questions and step-by-step problems the Analyze button would (numbers computed in Python, then
   validated), and loads them into the app. Big courses are built topic by topic ("continue the pack for …").
3. Everything else works as usual. In this mode the app hides Analyze, "Break it down further", AI marking
   (you mark written answers against the model answer) and in-app generation; ask Claude Code for those instead.

Details: [docs/CLAUDE_CODE_WORKFLOW.md](docs/CLAUDE_CODE_WORKFLOW.md). Tools: `python -m app.packcli --help`.

You can switch any time: courses built either way look and work the same.

## Cost

On the website it costs nothing beyond your AI chat plan; a free plan works for a small course but may cut long replies short,
so build big courses topic by topic. In the app with an API key: with Claude Opus 5.5 (`claude-opus-5-5`, about $4 / $20 per million input / output tokens) the course corpus is prompt-cached (1 h), so the many per-concept and per-pattern calls reuse it cheaply. A typical course of a few hundred pages plus 5–10 past papers costs a few dollars. For other providers, enter their prices under *Advanced* to get a cost estimate. The job panel shows live token counts. Re-running an analysis only processes new material unless you tick the rebuild boxes.

Other knobs live in `.env` (see `.env.example`): Claude effort per stage, refusal fallback, PDF chunk size.

## Knowledge packs

A course's entire knowledge base (concepts, patterns, MCQs, problems) is one JSON **knowledge pack**, also called the course file.
Any AI chat can write one from the website's prompt; the app exports one with *Materials → Export*; both load with *Open course file* /
*Import pack*. Packs contain no API key and no uploaded files. The format is documented in [docs/PACK_FORMAT.md](docs/PACK_FORMAT.md).

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
  js/ai-prompt.js   the prompt students give their own AI chat to write a course file
  js/pack-clean.js  repairs and merges AI-written course files before they are stored
  config.js         "server" here; "static" in the built website
scripts/build_site.py  builds the GitHub Pages website into _site/
samples/            demo course (build_demo.py → demo_pack.json)
tests/              pytest suite (fake AI, no key needed)
inbox/              drop materials here for Claude Code mode (git-ignored)
data/               your courses and provider settings (git-ignored)
```

Run tests: `.venv\Scripts\python -m pytest -q`

## Working with GitHub

The code lives at https://github.com/nminh27/Exam_Cram_Tool. Changes go on a branch, get tested, and are
merged into `main`; every push to `main` runs the tests (`.github/workflows/ci.yml`) and republishes the
study website (`.github/workflows/pages.yml`).

`data/`, `inbox/` and `.env` are git-ignored, so your course files, progress and API keys never leave your computer.

Cramtoolfinal was first called FinalForge. Some technical ids still use the old name on purpose (the pack
format `finalforge-pack`, the website's browser storage, the `FINALFORGE_*` settings in `.env`), so older
packs, saved website progress and existing settings keep working.
