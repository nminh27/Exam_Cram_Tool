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
        "visualize_md": "<how to picture it>", "diagram_svg": "<a labelled SVG diagram of the idea (see SVG rules), or empty>",
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
      "option_explanations": ["<why A is right or wrong>", "<B>", "<C>", "<D>"],
      "solution_md": "1. <what is given>\\n2. <which idea or formula applies>\\n3. <each substitution and result>\\n4. <why that is the right option, and where the wrong ones go astray>",
      "figure_svg": "<only if the answer is a graph, tree, table or sketch: an SVG of the worked answer; otherwise leave this key out>",
      "difficulty": 2 } ],
    "guided": { "c-<slug>": [ { "question_md": "<small question leading from everyday experience to the idea>",
      "options": ["<A>", "<B>", "<C>", "<D>"], "correct": 2, "explanation_md": "<explanation>" } ] },
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
          "figure_svg": "<only if this step asks to draw or sketch something: an SVG of the correct drawing; otherwise leave this key out>",
          "concept_ids": ["c-<slug>"] } ] } ]
    } ],
    "learning_path": ["c-<slug>, every concept, prerequisites first"]
  }
}`;

// Rules shared by both prompts (after the "Rules:" heading, minus the first line about sources).
const RULES = `- Text fields ending in _md are Markdown. Write maths in LaTeX: $...$ inline, $$...$$ on its own line. A literal dollar sign is \\$.
- Ids are lowercase with dashes and must match exactly wherever they are used (topic_id, prerequisites, concept_ids, pattern_id).
- "correct" and "correct_choices" count from 0. Give one option explanation per option.
- Every quiz question ("mcqs") and every "guided" step has exactly 4 options: the right one plus 3 believable wrong ones. Put the right answer in a different position each time (not always A or B); the website also shuffles the order.
- Step answer types: "numeric" needs numeric_answer as a plain number (calculate it carefully, then check it), with choices [] and correct_choices []. "choice" and "multi" need choices and correct_choices. "text" needs text_answer_md. Use null for numeric_answer and tolerance_pct when the step isn't numeric.
- Work out every number step by step and check it before writing it down. The numbers in a lesson, its quiz, its problems and its figures must agree.
- Write tokens in angle brackets such as <s>, </s> or <UNK> inside backticks (\`<s>\`) or as ⟨s⟩. Bare <...> is read as HTML and disappears.
- Don't start a line with * or _ unless you mean a list or italics; write "times" or × for multiplication in text.

SVG rules (for "diagram_svg" and "figure_svg"):
- One self-contained <svg> element: xmlns="http://www.w3.org/2000/svg", a viewBox and a width and height of about 520 by 240 (taller for trees). No scripts, no links, no images, no external fonts.
- Use single quotes for the attributes inside the SVG, so the JSON string needs no escaping. Keep each SVG small (under about 4 KB).
- Draw on a dark background so it matches the website: a first <rect width='100%' height='100%' rx='10' fill='#170b3a'/>, text in #f4effe (labels) and #b6aad8 (axes, notes), font-family='monospace' at 11 to 14 px, and lines and highlights in #c977ff, #ff6b9a, #ffc46b, #6ee7b7 and #7aa2ff.
- Label everything a student needs (axes, units, key values) and keep labels from overlapping. Draw only what the numbers say.
- If you can't draw something correctly, leave the field empty rather than guess.
- If the course is too big for one reply, build only the first one or two topics completely and say so in "description". I will then ask you to "continue with the next topics in the same format", and add each reply as another part.`;

export const AI_PROMPT = `You are building a course file for Cramtoolfinal, a study website. I have attached my course materials: lecture notes, slides, tutorial sheets and past exam papers (with solutions if I have them).

Read every file carefully, then reply with ONE JSON object in ONE \`\`\`json code block, following exactly the format below. No other text before or after it.

What to build:
1. "overview_md": what the course covers and what the exam looks like (length, number of questions, marks, which topics each question usually tests, what every paper so far has had).
2. Topics, then every concept in them, in the order the course teaches them. For each concept, a full "detail" breakdown: why it exists, what it does, how it works, an everyday picture, at least 4 tiny "atomic_steps", every formula with each symbol explained, the exam wording that signals it, the traps that lose marks, tips, a worked mini-example in the style of the past papers (every step shown) and self-check questions. Fill "prerequisites" and "related" carefully: the website uses them to link lessons and to top up each lesson's quiz.
3. A "diagram_svg" for every concept that has something to picture: a graph, a table being filled, a tree, a flow of steps, a worked example drawn out. Use the same numbers as the lesson's mini-example.
4. Exam patterns: group every past-paper question into the question types the examiner reuses. Copy each past-paper question word for word into "source_questions", with its question number and marks.
5. At least 6 multiple-choice questions per core concept ("mcqs"), so a lesson's "Quiz me" has 10 good questions with its neighbours. Mix intuition, misconception and application questions. Each has an explanation for every option and a "solution_md": a numbered step-by-step working from the question to the right answer, one step per line (what is given, which idea or formula applies, every substitution and its result, a quick check, then why the tempting wrong options fail). When the answer is a graph, a tree or a filled table, add "figure_svg" with it drawn.
6. A "guided" chain of 3 to 5 small questions (4 options each) for every core concept, leading from an everyday observation to the idea.
7. "problems": every past-paper question, solved as small steps the way a top student writes the solution (what's given, what's asked, which formula, rearrange, substitute, calculate, check, final answer), plus one new variant per pattern with different numbers. When a step asks the student to draw or sketch something (a spectrum, a parse tree, a waveform, a graph), give its "figure_svg": the correct drawing.

Rules:
- Use only what is in my files. If something is missing, leave it out rather than invent it.
${RULES}

Format:
${FORMAT}`;

// The "any subject" prompt: no files, the AI teaches a subject the student names (a language, a skill, a school topic…).
export function topicPrompt({ subject, level, goal }) {
  const s = (subject || "").trim() || "<write the subject here>";
  const lv = (level || "").trim() || "complete beginner";
  const g = (goal || "").trim();
  return `You are building a course file for Cramtoolfinal, a study website. I have no files: teach me from your own knowledge.

Subject: ${s}
My level: ${lv}${g ? `\nMy goal: ${g}` : ""}

Plan a complete course for this subject at my level, then reply with ONE JSON object in ONE \`\`\`json code block, following exactly the format below. No other text before or after it.

What to build:
1. "overview_md": what the course covers, in what order, roughly how long each topic takes, and how I should study it (a short weekly plan). Say how I will know I have reached my goal.
2. Topics, then every concept in them, in the order a good teacher would teach them, each building on the last. For each concept, a full "detail" breakdown: why it exists, what it does, how it works, an everyday picture, at least 4 tiny "atomic_steps", the exam or real-life wording that signals it, the traps beginners fall into, tips, a worked mini-example (every step shown) and self-check questions. Use "formulas" only for real formulas or fixed rules written in LaTeX; otherwise leave it as []. Fill "prerequisites" and "related" carefully: the website uses them to link lessons and to top up each lesson's quiz.
3. A "diagram_svg" for every concept that has something to picture: a table, a chart, a timeline, a tree, a flow of steps, a worked example drawn out.
4. "patterns": the kinds of exercises or test questions a learner of this subject meets (for a language: read aloud, translate a sentence, choose the right particle, conjugate a verb, listen and answer). Leave "source_questions" as [] (there are no past papers) and fill each "guide" with how to tackle that kind of exercise.
5. At least 6 multiple-choice questions per core concept ("mcqs"), so a lesson's "Quiz me" has 10 good questions with its neighbours. Mix intuition, misconception and application questions. Each has an explanation for every option and a "solution_md": a numbered step-by-step working from the question to the right answer, one step per line, then why the tempting wrong options fail.
6. A "guided" chain of 3 to 5 small questions (4 options each) for every core concept, leading from an everyday observation to the idea.
7. "problems": 3 practice exercises per pattern ("source": "variant", "source_ref": "practice"), each solved as small steps the way a good teacher would walk through it, from easy to harder. Use "text" steps for open answers, with the model answer in text_answer_md.

Rules:
- Teach only well-established, correct material. If you are not sure of something, leave it out rather than guess.
- Match my level: explain every new word or symbol the first time you use it.
- For a language: write every example in the language's own script, then its pronunciation (romanisation), then the English meaning, e.g. 안녕하세요 (annyeonghaseyo) "hello".
${RULES}

Format:
${FORMAT}`;
}

export const AI_CONTINUE = "Continue with the next topics in exactly the same JSON format, in one ```json code block. " +
  "Reuse the same ids for concepts and patterns you already made when you refer to them, and don't repeat them.";
