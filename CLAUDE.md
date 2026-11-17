# FinalForge: notes for Claude Code

Local study platform: FastAPI backend (`app/`) + no-build Preact/htm UI (`web/`). The user uploads course
materials and past papers; `app/pipeline.py` uses the Claude API to build a knowledge pack; the UI teaches
and drills from it. See README.md for the feature list and docs/PACK_FORMAT.md for the data model.

## Run / test
- Windows: `run.bat` (port 8000). Dev: `.venv\Scripts\python -m uvicorn app.main:app --port 8765 --reload`
- Tests (no API key needed, Claude is faked): `.venv\Scripts\python -m pytest -q`
- Regenerate the demo course after changing its source: `.venv\Scripts\python samples\build_demo.py`

## Conventions
- Prompts live only in `app/prompts.py`; output shapes only in `app/schemas.py` (structured outputs: every
  object `additionalProperties: false`, every property required, no min/max constraints). Keep
  `BASE_SYSTEM` free of volatile text: it prefixes the prompt-cached corpus.
- AI providers (`app/settings.py`, `app/providers.py`): Anthropic via the official SDK (default model
  `claude-opus-5-5`; all calls stream; no `temperature` or thinking budgets, depth via
  `output_config.effort`), or any OpenAI-compatible `/chat/completions` API over httpx. Pipeline code only
  calls `llm.call` / `llm.structured` with a role ("main" or "quick"); never call an SDK directly from it.
  Non-Claude providers get PDFs as page text + page images (`ingest.py`, `native_pdf=False`).
- Keys live only in `.env` (`ANTHROPIC_API_KEY`, `FINALFORGE_KEY_<ID>`); provider records in
  `data/settings.json`. No provider = Claude Code mode.
- Anything the pipeline writes must go through `clean_problem` / `clean_mcq` so the UI can trust the shape.
- UI: one module per screen in `web/js/pages/`; shared helpers in `web/js/lib.js`. CDN script versions are pinned in `web/index.html`.
  Paths in `web/` must stay relative (the website is served from `/Exam_Cram_Tool/`).
- Two UI modes from one codebase: `window.FINALFORGE_MODE` ("server" in `web/config.js`; "static" in the
  GitHub Pages build from `scripts/build_site.py`). In static mode `lib.api()` routes to `web/js/static-api.js`
  (IndexedDB); any new API route the study screens use needs a static equivalent there, and server-only
  features must be hidden or explained when `IS_STATIC`.
- `data/` and `.env` are git-ignored: never commit course materials, progress or keys.

## GitHub workflow
- When the user gives a repo URL: `git remote add origin <url>` (or `set-url`), then `git push -u origin main`.
- For changes: branch from `main`, commit with a clear message, run the tests, push, open a PR if `gh` is available.
- CI: `.github/workflows/ci.yml` runs pytest on push / PR. `.github/workflows/pages.yml` deploys the
  website on every push to `main` (https://nminh27.github.io/Exam_Cram_Tool/).
- `gh` is not installed: push branches; the user merges on GitHub, or asks for a local merge + push.

## Building a course without an API key
When the user says "build the (FinalForge) pack for <course>" (or "continue the pack"), follow
docs/CLAUDE_CODE_WORKFLOW.md exactly: materials come from `inbox/<course>/` or the app's uploads
(`python -m app.packcli materials <course_id>`); write `inbox/<course>/build_pack.py` with the builders in
`app/packkit.py` (computing every number in Python), validate, and import with `python -m app.packcli`.
`inbox/` contents are git-ignored; never commit them.
