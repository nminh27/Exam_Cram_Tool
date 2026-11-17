// "How to use Cramtoolfinal": a 4-step overview (shown on the home page) and a "what to expect" FAQ.
// The first step adapts to how the platform is being used: app with an AI provider, app in Claude Code
// mode, or the study website.
import { html, Md, useStore, IS_STATIC, REPO_URL } from "../lib.js";

function useMode() {
  const s = useStore();
  if (IS_STATIC) return "web";
  return s.health && s.health.ai_available ? "ai" : "cc";
}

// Where a website visitor's course file comes from: the step new users are most likely to miss.
export const INSTALL_URL = `${REPO_URL}#get-the-app-on-your-computer`;
export const COURSE_FILE_TITLE = "Where does the course file come from?";
export const COURSE_FILE_MD = [
  "A **course file** (`.cramtoolfinal.json`) is one of your courses after AI has read your notes and past papers and turned them " +
    "into concept breakdowns, quizzes and step-by-step exam problems. You make it **once, on a computer**, then open it on any device.",
  "",
  `1. **Get the Cramtoolfinal app on a computer** (free): on the [GitHub page](${INSTALL_URL}) press **Code → Download ZIP**, unzip it, ` +
    "and double-click `run.bat`. It needs Python; the GitHub page walks you through it.",
  "2. **Create a course** in the app and upload your lecture notes, slides and every past paper.",
  "3. **Let AI build it:** add an AI key in the app's Settings and press **Analyze** (Google Gemini gives free keys with usage limits; " +
    "Claude gives the best results), or, if you use Claude Code, ask it to build the course with no key at all.",
  "4. On the course's **Materials** page, press **Export knowledge pack**. That downloads the course file.",
  "5. Put the file on this device (cloud drive, email, USB…) and press **Import pack** here.",
  "",
  "A classmate who has already built the course can also just send you their file.",
].join("\n");

const STEP1 = {
  ai: "Create a course and upload your lecture notes, slides and **every past paper** (plus solutions if you have them). " +
    "Press **Analyze** on the Materials page. It takes several minutes, longer for big courses; the page shows live progress.",
  cc: "Create a course and upload your notes, slides and **every past paper** on its Materials page. " +
    "Then ask Claude Code: *\"Build the Cramtoolfinal pack for (course name)\"*. It builds the course and loads it here.",
  web: "Your course comes as one **course file** (`.cramtoolfinal.json`), which AI makes from your notes and past papers on a " +
    "computer (see *Where does the course file come from?*). Press **Import pack** to load it, or **Open demo course** to look around first.",
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
  return html`<section class="guide-steps" aria-label="How Cramtoolfinal works">
    <div class="row between" style="align-items:baseline">
      <h2 class="m-0">How it works</h2>
      ${!hideLink && html`<a class="small" href="#/guide">Full guide and FAQ →</a>`}
    </div>
    <ol class="steps-strip">
      ${STEPS.map((s, i) => html`<li class="card">
        <div class="row"><span class="step-num">${i + 1}</span><b>${s.title}</b></div>
        <${Md} text=${s.body(mode)} cls="small" />
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
    web: "Importing a pack is instant. Building the pack happens beforehand in the Cramtoolfinal app on a computer.",
  }[mode]]);
  items.push(["What should I upload?", IS_STATIC
    ? "Nothing here: the website can't read files. On a computer, upload lecture notes, slides, textbook chapters and every past paper, then export the pack."
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
    "independently; a **Check** badge means the two disagreed, so compare with your notes or the official solution. " +
    (IS_STATIC ? "" : "On the Materials page, **view what was read** shows how each past-paper question was transcribed. ") +
    "When anything conflicts with your lecturer's notes, the notes win."]);
  items.push(["Where are my courses and progress saved?", IS_STATIC
    ? "In **this browser on this device** only: not on GitHub and not on your other devices. Clearing this site's data erases them, so use **Course file → Progress backup** now and then."
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
