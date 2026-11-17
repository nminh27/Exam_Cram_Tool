# inbox: drop course materials here for Claude Code

Use this folder when you don't have an Anthropic API key. Claude Code reads your files and builds the
course for you.

1. Make one folder per course, for example `inbox/MATH1010/`.
2. Put everything in it: lecture notes, slides, textbook chapters, **every past paper**, and solutions or
   mark schemes if you have them. PDFs work best. Naming helps, e.g. `past_2023_final.pdf`,
   `past_2023_solutions.pdf`, `lecture_04_integration.pdf`.
3. In Claude Code, say: **"build the pack for MATH1010"**.

Claude Code writes `build_pack.py` and `pack.json` into the same folder and loads the course into the app.
For a big course it works topic by topic; say "continue the MATH1010 pack" to pick up where it stopped.

Everything in `inbox/` except this README is git-ignored: your materials never go to GitHub.

(You can also upload files through the app's Materials page and ask Claude Code to "build the pack for
the course <name>"; it can read uploaded files too.)
