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
- Model: `claude-opus-5-5` via `FINALFORGE_MODEL`. All calls stream (`llm.call`). Opus 5.5 rejects
  `temperature` and thinking budgets; depth is controlled with `output_config.effort`.
- Anything the pipeline writes must go through `clean_problem` / `clean_mcq` so the UI can trust the shape.
- UI: one module per screen in `web/js/pages/`; shared helpers in `web/js/lib.js`. CDN script versions are pinned in `web/index.html`.
- `data/` and `.env` are git-ignored: never commit course materials, progress or keys.

## GitHub workflow
- When the user gives a repo URL: `git remote add origin <url>` (or `set-url`), then `git push -u origin main`.
- For changes: branch from `main`, commit with a clear message, run the tests, push, open a PR if `gh` is available.
- CI: `.github/workflows/ci.yml` runs pytest on push / PR.

## Building a pack without the API
If the user wants a course built directly by Claude Code (no API key), read their materials and write a
`finalforge-pack` JSON following docs/PACK_FORMAT.md (use samples/build_demo.py as a template for
generating it from Python so LaTeX escaping is right), then import it from the home page.
