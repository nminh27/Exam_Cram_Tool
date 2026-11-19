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
import { GuidePage } from "./pages/guide.js";

const NAV = [
  { key: "", label: "Overview" },
  { key: "learn", label: "Learn" },
  { key: "map", label: "Map" },
  { key: "patterns", label: "Exam patterns" },
  { key: "practice", label: "Practice" },
  { key: "progress", label: "Progress" },
  IS_STATIC ? { key: "materials", label: "Course file" } : { key: "materials", label: "Materials" },
];

// page: "home" | "guide" | "settings" | "course", so the matching link is marked as the current page.
// Brand logo: the name over a study timeline. Dots start far apart and crowd in towards the gold finish flag,
// the rush of revision before the final. Text uses the page font and colour; screen readers get the name.
const DOTS = [4, 42, 76, 104, 128, 148, 164, 177, 188, 197, 204, 210, 215.5, 220.5];
function BrandLogo() {
  // The word is real text at its natural width; the timeline below scales to exactly that width.
  return html`<span class="brand-logo">
    <span class="brand-word">Cramtoolfinal</span>
    <svg class="brand-line" viewBox="0 0 245 26" aria-hidden="true">
      <defs>
        <linearGradient id="brand-dots" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#a98bff" /><stop offset=".45" stop-color="#e070ff" />
          <stop offset=".75" stop-color="#ff6b9a" /><stop offset="1" stop-color="#ffc46b" />
        </linearGradient>
        <pattern id="brand-chk" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="currentColor" /><rect x="3" y="3" width="3" height="3" fill="currentColor" />
        </pattern>
      </defs>
      <g fill="url(#brand-dots)">${DOTS.map((x) => html`<circle cx=${x} cy="19" r="4.4" />`)}</g>
      <rect x="226" y="1" width="3.6" height="25" fill="#ffd98a" />
      <rect x="229.6" y="1" width="15.4" height="12" fill="url(#brand-chk)" />
    </svg>
  </span>`;
}

function TopBar({ courseName, page, children }) {
  const store = useStore();
  const h = store.health;
  const link = (key, href, label) => html`<a class=${"tlink" + (page === key ? " active" : "")} href=${href}
    aria-current=${page === key ? "page" : undefined}>${label}</a>`;
  return html`<header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="#/" title="Cramtoolfinal: all courses"><${BrandLogo} /></a>
      ${courseName && html`<span class="crumb">${courseName}</span>`}
      <span class="spacer"></span>
      ${h && html`<span class="mode" title=${h.static ? "Website: courses and progress are saved in this browser" : h.ai_available ? `API mode: ${h.provider}` : "Claude Code mode: no AI provider set"}>
        <span class="dot" style=${`background:${h.ai_available ? "var(--good)" : "var(--warn)"}`}></span>
        <span class="mode-text">${h.static ? "Website" : h.ai_available ? h.model : "Claude Code mode"}</span>
      </span>`}
      <nav class="top-links" aria-label="Main">
        ${link("home", "#/", page === "course" ? "All courses" : "Home")}
        ${link("guide", "#/guide", "Guide")}
        ${link("settings", "#/settings", "Settings")}
      </nav>
    </div>
    ${children}
  </header>`;
}

function CourseShell({ cid, section, view, wide }) {
  const d = useCourse(cid);
  const name = d && d.course ? d.course.name : "";
  return html`
    <${TopBar} courseName=${name} page="course">
      <nav class="course-nav" aria-label="Course">
        ${NAV.map((n) => html`<a class=${section === n.key ? "active" : ""} aria-current=${section === n.key ? "page" : undefined}
          href=${`#/c/${cid}${n.key ? "/" + n.key : ""}`}>${n.label}</a>`)}
      </nav>
    <//>
    <main class=${"main" + (wide ? " wide" : "")}>
      ${!d ? html`<${Spinner} />`
        : d.error ? html`<div class="notice bad">${d.error} <a href="#/">Back to courses</a></div>`
        : view(d)}
    </main>`;
}

function App() {
  const route = useRoute();
  useEffect(() => { loadHealth().catch(() => {}); }, []);
  const [a, cid, section, sub] = route.parts;

  if (a === "settings") return html`<${TopBar} page="settings" /><main class="main"><${SettingsPage} /></main>`;
  if (a === "guide") return html`<${TopBar} page="guide" /><main class="main"><${GuidePage} /></main>`;
  if (a !== "c" || !cid) return html`<${TopBar} page="home" /><main class="main"><${HomePage} /></main>`;

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
