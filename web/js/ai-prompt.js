// The prompt a student copies into their own AI chat (ChatGPT, Claude, Gemini…) together with their course files.
// The reply is a course file the website imports (see pack-clean.js, which repairs small mistakes).
// Keep it in step with docs/PACK_FORMAT.md.

const FORMAT = `{
  "format": "finalforge-pack", "version": 1, "name": "<course code and name>", "description": "<exam date, lecturer, or empty>",
  "knowledge": {
    "course": { "title": "<course title>", "overview_md": "<the big picture: what the course is about and what the exam looks like>" },
    "topics": [ { "id": "t-<slug>", "name": "<topic>", "summary": "<one sentence>" } ],
    "concepts": [ {
      "id": "c-<slug>", "name": "<concept>", "topic_id": "t-<slug>", "one_liner": "<one plain sentence>",
      "prerequisites": ["c-<slug of a concept you must know first>"], "related": ["c-<often confused or used together>"],
      "importance": "core | supporting | peripheral", "source_refs": ["<file name and page/slide>"],
      "detail": {
        "why_exists_md": "<the problem this idea solves>", "what_it_does_md": "<what it lets you do>",
        "how_it_works_md": "<how it works, step by step>", "everyday_analogy_md": "<an everyday picture a 12-year-old gets>",
        "visualize_md": "<how to picture it>", "diagram_svg": "",
        "atomic_steps": [ { "step_md": "<one tiny step>", "everyday_link": "<the same step in everyday terms>" } ],
        "formulas": [ { "latex": "<LaTeX without $ signs>", "name": "<name>", "meaning_md": "<what it says>",
          "symbols": [ { "symbol": "<LaTeX symbol>", "meaning": "<meaning>", "unit": "<SI unit or empty>" } ],
          "when_to_use_md": "<when to use it>" } ],
        "patterns_to_spot": [ { "cue": "<exam wording that signals this concept>", "signals_md": "<what to do>" } ],
        "common_traps": [ { "trap_md": "<mistake that loses marks>", "fix_md": "<how to avoid it>" } ],
        "tips_tricks": [ { "tip_md": "<tip>", "source": "general | <past paper name>" } ],
        "mini_example_md": "<a short worked example in exam style>",
        "self_check": ["<question the student should answer out loud>"]
      }
    } ],
    "patterns": [ {
      "id": "p-<slug>", "name": "<exam question type>", "description": "<what these questions ask>", "calc": true,
      "concept_ids": ["c-<slug>"],
      "source_questions": [ { "material_id": "<past paper file name>", "number": "<question number>", "text_md": "<the question, copied word for word>",
        "marks": "<marks>", "solution_md": "<official solution if given, else empty>", "material_label": "<e.g. 2023 final>", "is_exam": true } ],
      "guide": { "recognition_cues": ["<how to recognise it in 10 seconds>"],
        "recipe": [ { "step_md": "<step>", "why_md": "<why>", "everyday_link": "" } ],
        "tricks": ["<trick>"], "traps": ["<trap>"], "examiner_wants_md": "<what earns the marks>" }
    } ],
    "mcqs": [ { "id": "q-<n>", "concept_ids": ["c-<slug>"], "type": "intuition | misconception | application | pattern | map",
      "question_md": "<question>", "options": ["<A>", "<B>", "<C>", "<D>"], "correct": 0,
      "option_explanations": ["<why A is right or wrong>", "<B>", "<C>", "<D>"], "difficulty": 2 } ],
    "guided": { "c-<slug>": [ { "question_md": "<small question leading from everyday experience to the idea>",
      "options": ["<A>", "<B>", "<C>"], "correct": 1, "explanation_md": "<explanation>" } ] },
    "problems": [ {
      "id": "pr-<slug>-<n>", "pattern_id": "p-<slug>", "source": "past_paper | variant", "source_ref": "<past paper and question, or 'variant of …'>",
      "title": "<short title>", "statement_md": "<the full question as in the exam>",
      "parts": [ { "label": "a", "prompt_md": "<this part's question>", "marks": "<marks>", "final_answer_md": "<final answer>",
        "steps": [ {
          "kind": "given | unknown | concept | formula | rearrange | substitute | compute | units | check | interpret | explain | final",
          "prompt_md": "<one short question for this step>",
          "answer_type": "numeric | choice | multi | text",
          "choices": ["<only for choice/multi>"], "correct_choices": [0],
          "numeric_answer": 12.5, "tolerance_pct": 1, "unit": "<unit or empty>",
          "text_answer_md": "<model answer or marking points, for text steps>",
          "hint_md": "<a nudge that doesn't give it away>", "explanation_md": "<full working and why>",
          "concept_ids": ["c-<slug>"] } ] } ]
    } ],
    "learning_path": ["c-<slug>, every concept, prerequisites first"]
  }
}`;

export const AI_PROMPT = `You are building a course file for Cramtoolfinal, a study website. I have attached my course materials: lecture notes, slides, tutorial sheets and past exam papers (with solutions if I have them).

Read every file carefully, then reply with ONE JSON object in ONE \`\`\`json code block, following exactly the format below. No other text before or after it.

What to build:
1. Topics, then every concept in them. For each concept, a full "detail" breakdown: why it exists, what it does, how it works, an everyday picture, at least 4 tiny "atomic_steps", every formula with each symbol explained, the exam wording that signals it, the traps that lose marks, tips, a worked mini-example and self-check questions.
2. Exam patterns: group every past-paper question into the question types the examiner reuses. Copy each past-paper question word for word into "source_questions".
3. At least 4 multiple-choice questions per core concept ("mcqs"), each option explained. Mix intuition, misconception and application questions.
4. A "guided" chain of 3 to 5 small questions for the most important concepts.
5. "problems": every past-paper question, solved as small steps the way a top student writes the solution (what's given, what's asked, which formula, rearrange, substitute, calculate, check, final answer), plus one new variant per pattern with different numbers.

Rules:
- Use only what is in my files. If something is missing, leave it out rather than invent it.
- Text fields ending in _md are Markdown. Write maths in LaTeX: $...$ inline, $$...$$ on its own line. A literal dollar sign is \\$.
- Ids are lowercase with dashes and must match exactly wherever they are used (topic_id, prerequisites, concept_ids, pattern_id).
- "correct" and "correct_choices" count from 0. Give one option explanation per option.
- Step answer types: "numeric" needs numeric_answer as a plain number (calculate it carefully, then check it), with choices [] and correct_choices []. "choice" and "multi" need choices and correct_choices. "text" needs text_answer_md. Use null for numeric_answer and tolerance_pct when the step isn't numeric.
- Leave "diagram_svg" as "".
- If the course is too big for one reply, build only the first one or two topics completely and say so in "description". I will then ask you to "continue with the next topics in the same format", and add each reply as another part.

Format:
${FORMAT}`;

export const AI_CONTINUE = "Continue with the next topics in exactly the same JSON format, in one ```json code block. " +
  "Reuse the same ids for concepts and patterns you already made when you refer to them, and don't repeat them.";
