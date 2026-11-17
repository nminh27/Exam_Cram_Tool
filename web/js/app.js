import { html, render, useEffect, useRoute, useStore, loadHealth, useCourse, Spinner, IS_STATIC } from "./lib.js";
import { HomePage } from "./pages/home.js";
import { SettingsPage } from "./pages/settings.js";
import { DashboardPage } from "./pages/dashboard.js";
import { MaterialsPage } from "./pages/materials.js";
import { CourseFilePage } from "./pages/course-file.js";
import { LearnPage } from "./pages/learn.js";
import { ConceptPage } from "./pages/concept.js";
import { MapPage } from "./pages/map.js";
import { PatternsPage, PatternPage } from "./pages/patterns.js";
import { PracticePage } from "./pages/practice.js";
import { QuizPage } from "./pages/quiz.js";
import { ProblemPage } from "./pages/problem.js";
import { ProgressPage } from "./pages/progress.js";

const NAV = [
  { sec: "Understand" },
  { key: "", label: "Dashboard", ico: "◎" },
  { key: "learn", label: "Learn concepts", ico: "📘" },
  { key: "map", label: "Knowledge map", ico: "🕸" },
  { key: "patterns", label: "Exam patterns", ico: "🎯" },
  { sec: "Train" },
  { key: "practice", label: "Practice", ico: "🏋" },
  { key: "progress", label: "Progress", ico: "📈" },
  { sec: "Setup" },
  IS_STATIC ? { key: "materials", label: "Course file", ico: "📦" } : { key: "materials", label: "Materials", ico: "📂" },
];

function TopBar({ courseName }) {
  const store = useStore();
  const h = store.health;
  return html`<header class="topbar">
    <a class="brand" href="#/"><span class="logo">F</span>FinalForge</a>
    ${courseName && html`<span class="crumb">/ ${courseName}</span>`}
    <span class="spacer"></span>
    ${h && html`<a class="small muted" href="#/settings" title=${h.static ? "Website: courses and progress are saved in this browser" : h.ai_available ? `API mode: ${h.provider}` : "Claude Code mode: no AI provider set"}>
      <span class="dot" style=${`background:${h.ai_available ? "var(--good)" : "var(--accent)"}`}></span>
      ${h.static ? "Website" : h.ai_available ? h.model : "Claude Code mode"}
    </a>`}
    <a class="btn ghost sm" href="#/settings">⚙ Settings</a>
  </header>`;
}

function CourseShell({ cid, section, view, wide }) {
  const d = useCourse(cid);
  const name = d && d.course ? d.course.name : "";
  return html`
    <${TopBar} courseName=${name} />
    <div class="shell">
      <nav class="sidebar">
        ${NAV.map((n) => n.sec
          ? html`<div class="sec">${n.sec}</div>`
          : html`<a class=${section === n.key ? "active" : ""} href=${`#/c/${cid}${n.key ? "/" + n.key : ""}`}>
              <span class="ico">${n.ico}</span>${n.label}</a>`)}
      </nav>
      <main class=${"main" + (wide ? " wide" : "")}>
        ${!d ? html`<${Spinner} />`
          : d.error ? html`<div class="notice bad">${d.error} <a href="#/">Back to courses</a></div>`
          : view(d)}
      </main>
    </div>`;
}

function App() {
  const route = useRoute();
  useEffect(() => { loadHealth().catch(() => {}); }, []);
  const [a, cid, section, sub] = route.parts;

  if (a === "settings") return html`<${TopBar} /><main class="main"><${SettingsPage} /></main>`;
  if (a !== "c" || !cid) return html`<${TopBar} /><main class="main"><${HomePage} /></main>`;

  const q = route.query;
  const pages = {
    "": (d) => html`<${DashboardPage} cid=${cid} d=${d} />`,
    materials: (d) => (IS_STATIC ? html`<${CourseFilePage} cid=${cid} d=${d} />` : html`<${MaterialsPage} cid=${cid} d=${d} />`),
    learn: (d) => html`<${LearnPage} cid=${cid} d=${d} />`,
    concept: (d) => html`<${ConceptPage} cid=${cid} d=${d} conceptId=${sub} />`,
    map: (d) => html`<${MapPage} cid=${cid} d=${d} />`,
    patterns: (d) => html`<${PatternsPage} cid=${cid} d=${d} />`,
    pattern: (d) => html`<${PatternPage} cid=${cid} d=${d} patternId=${sub} />`,
    practice: (d) => html`<${PracticePage} cid=${cid} d=${d} />`,
    quiz: (d) => html`<${QuizPage} cid=${cid} d=${d} query=${q} key=${location.hash} />`,
    problem: (d) => html`<${ProblemPage} cid=${cid} d=${d} problemId=${sub} key=${sub + (q.get("n") || "")} />`,
    progress: (d) => html`<${ProgressPage} cid=${cid} d=${d} />`,
  };
  const key = section || "";
  const navKey = { concept: "learn", pattern: "patterns", quiz: "practice", problem: "practice" }[key] ?? key;
  const page = pages[key] || pages[""];
  return html`<${CourseShell} cid=${cid} section=${navKey} wide=${key === "map" || key === "problem"} view=${page} />`;
}

const root = document.getElementById("app");
root.textContent = ""; // drop the "Loading…" placeholder
render(html`<${App} />`, root);
