// "How to use Cramtoolfinal": a 4-step overview (shown on the home page) and a "what to expect" FAQ.
// The first step adapts to how the platform is being used: app with an AI provider, app in Claude Code
// mode, or the study website.
import { html, Md, useStore, IS_STATIC, REPO_URL } from "../lib.js";

function useMode() {
  const s = useStore();
  if (IS_STATIC) return "web";
  return s.health && s.health.ai_available ? "ai" : "cc";
}

// Where a website visitor's course comes from: their own AI chat, given the prompt in ai-prompt.js.
export const COURSE_FILE_TITLE = "Where does the course come from?";
export const COURSE_FILE_MD = [
  "Your own AI builds it. The website gives you a ready-made prompt; ChatGPT, Claude or Gemini reads your notes and past papers " +
    "and replies with the whole course (concept breakdowns, quizzes and step-by-step exam problems) as one block of JSON. Nothing to install.",
  "",
  "1. On the home page, press **Copy prompt** under *Make your course with your own AI*.",
  "2. Open your AI chat, attach your lecture notes, slides and every past paper (with solutions if you have them), paste the prompt and send.",
  "3. Copy the AI's whole reply, paste it into the box and press **Create course**. Small mistakes in the reply are fixed automatically.",
  "4. Big course? The AI builds it in parts. Ask it to continue, then paste each new reply on the course's **Course file** page under *Add more with your AI*.",
  "",
  "The course is saved in this browser. **Course file → Download course file** saves it as a `.json` file you can open on another device or send to a classmate.",
].join("\n");

const STEP1 = {
  ai: "Create a course and upload your lecture notes, slides and **every past paper** (plus solutions if you have them). " +
    "Press **Analyze** on the Materials page. It takes several minutes, longer for big courses; the page shows live progress.",
  cc: "Create a course and upload your notes, slides and **every past paper** on its Materials page. " +
    "Then ask Claude Code: *\"Build the Cramtoolfinal pack for (course name)\"*. It builds the course and loads it here.",
  web: "Press **Copy prompt**, give it to your own AI (ChatGPT, Claude or Gemini) together with your notes, slides and **every past paper**, " +
    "then paste its reply back here. Or press **Open demo course** to look around first.",
};

const STEPS = [
  { title: "Bring your course in", body: (mode) => STEP1[mode] },
  { title: "Understand it", body: () =>
    "Open **Learn concepts** and go in order. Each concept explains why it exists, what it does, how it works, " +
    "an everyday picture, and the exam wording that signals it. Stuck? Try **Discover it yourself** at the bottom of the page." },
  { title: "Train like the exam", body: () =>
    "In **Practice**, quizzes check your intuition. **Exam problems** are your past papers, solved one small box at a time: " +
    "what's given → what's asked → which formula → calculate → final answer." },
  { title: "Track your progress", body: () =>
    "Concepts move from *Not started* to *Weak*, *Getting there* and *Solid* as you answer. " +
    "**Exam readiness** gives the most weight to the question types that appear most in your past papers." },
];

export function GettingStarted({ hideLink }) {
  const mode = useMode();
  return html`<section class="card guide-steps" aria-label="How Cramtoolfinal works">
    <div class="sec-head">
      <h2>How it works</h2>
      ${!hideLink && html`<a class="small" href="#/guide">Full guide and FAQ</a>`}
    </div>
    <ol class="plan how">
      ${STEPS.map((s, i) => html`<li>
        <span class="plan-n">${String(i + 1).padStart(2, "0")}</span>
        <div class="plan-body"><div class="plan-name">${s.title}</div><${Md} text=${s.body(mode)} cls="small muted" /></div>
      </li>`)}
    </ol>
  </section>`;
}

function faq(mode, skipCourseFile) {
  const items = [];
  if (mode === "web" && !skipCourseFile) items.push([COURSE_FILE_TITLE, COURSE_FILE_MD]);
  if (mode !== "web") {
    items.push(["What is a knowledge pack (.cramtoolfinal.json)?",
      "One file that holds a whole built course: concepts, questions and problems (not your original files, and not your progress). " +
      "Use it to study on your phone with the [study website](https://nminh27.github.io/Exam_Cram_Tool/), move a course to another " +
      "computer, keep a backup, or share it with a classmate. Make one with **Materials → Export knowledge pack**; load one with " +
      "**Import pack** on the home page."]);
  }
  items.push(["How long does it take to get a course ready?", {
    ai: "Analyzing usually takes several minutes and longer for big courses: each file is read, then every concept and every exam " +
      "question type gets its own breakdown. The Materials page shows live progress and the cost so far. You can start studying " +
      "the parts that are finished. Running Analyze again only processes new files.",
    cc: "Claude Code reads every file and writes the course, which takes a while; a big course is built topic by topic over " +
      "several sessions (say *\"continue the pack for (course name)\"*). Refresh the app when it says it's done.",
    web: "Your AI usually needs a few minutes to write the reply; loading it here is instant. A big course comes in several parts: " +
      "ask the AI to continue and add each reply on the course's **Course file** page.",
  }[mode]]);
  items.push(["What should I upload?", IS_STATIC
    ? "Give your AI chat your lecture notes, slides, textbook chapters, tutorial sheets and **every past paper you have**, with solutions or mark schemes if available. " +
      "Exam question types and exam-style practice come from the past papers. The website itself never sees your files."
    : "Lecture notes, slides, textbook chapters, tutorial sheets, and **every past paper you have**, with solutions or mark schemes if available. " +
      "PDF works best. Mark past papers as *Past paper* (the type menu next to each file): exam question types and exam-style practice come from them."]);
  items.push(["How do the answer boxes in exam problems work?",
    "Steps unlock one at a time, in the order a top student writes the solution. The question stays visible next to them.\n\n" +
    "- **Numbers:** type just the number. `12.5`, `1.2e-3`, `1.2×10^-3`, `3/4` and `1,200` all work, units are optional, and small rounding differences are accepted.\n" +
    "- **Wrong answer:** you get a nudge (wrong sign, off by a power of ten, rounding) and can try again.\n" +
    "- **Hint** helps without giving it away; **Show answer** reveals and explains the step.\n" +
    "- **Written answers:** " + (mode === "ai" ? "marked by the AI against the marking points." : "compare yours with the model answer and mark yourself honestly.")]);
  items.push(["What do the colours and percentages mean?",
    "- **Not started** (grey): no answers yet. **Weak** (red): under 60%. **Getting there** (amber). **Solid** (green): 85%+ over at least 3 answers.\n" +
    "- Scores weigh recent answers most: right first time = 1, right after a hint or a wrong try = ½, shown answer = 0.\n" +
    "- **Exam readiness** combines your last 3 attempts at each exam question type, weighted by how often it appears in the past papers, with your mastery of core concepts."]);
  items.push(["Can I trust what it generates?",
    "It is written by AI from your own files, so it is usually right but can make mistakes. Every generated problem is solved a second time " +
    "independently when it's built in the app; a **Check** badge means the two disagreed, so compare with your notes or the official solution. " +
    (IS_STATIC ? "Courses from your own AI chat aren't double-checked, so if a step looks wrong, ask the AI to re-solve that question. " : "") +
    (IS_STATIC ? "" : "On the Materials page, **view what was read** shows how each past-paper question was transcribed. ") +
    "When anything conflicts with your lecturer's notes, the notes win."]);
  items.push(["Where are my courses and progress saved?", IS_STATIC
    ? "In **this browser on this device** only: nothing is uploaded, not even to the AI (you talk to your AI yourself). Clearing this site's data erases them, " +
      "so use **Course file → Download course file** and **Progress backup** now and then."
    : "On this computer, in the project's `data` folder. Files are only sent to the AI provider you chose in Settings (none in Claude Code mode). " +
      "To study on your phone, export the course (Materials → Export knowledge pack) and import it on the [study website](https://nminh27.github.io/Exam_Cram_Tool/)."]);
  items.push(["A good way to study with it",
    "1. Follow **What to do next** on the course dashboard: it picks the next concept and your weakest spots.\n" +
    "2. Learn each concept, then quiz it until it turns **Solid**.\n" +
    "3. For each exam question type: read its recipe, solve the past-paper version, then the variants.\n" +
    "4. Every day, run **Review mistakes** and a few **knowledge-map drills**.\n" +
    "5. In the final days, use **Random exam problem**: it picks question types as often as they appear in past papers."]);
  items.push(["Will it guarantee full marks?",
    "No tool can. What it does is show you the gaps: every past-paper question belongs to a question type, every question type to the concepts it needs, " +
    "and readiness only goes up when you solve exam-style problems without help."]);
  return items;
}

export function WhatToExpect({ skipCourseFile }) {
  const mode = useMode();
  return html`<section class="card" aria-label="What to expect">
    <h2 class="mt-0">What to expect</h2>
    ${faq(mode, skipCourseFile).map(([q, a]) => html`<details class="faq"><summary>${q}</summary><${Md} text=${a} cls="small" /></details>`)}
    <p class="tiny muted mb-0">More help and the source code: <a href=${REPO_URL} target="_blank" rel="noopener">GitHub</a>.</p>
  </section>`;
}

export function GuidePage() {
  return html`<h1>Guide</h1>
    <${GettingStarted} hideLink=${true} />
    <${WhatToExpect} />
    <p class="small"><a href="#/">← Back to courses</a></p>`;
}
