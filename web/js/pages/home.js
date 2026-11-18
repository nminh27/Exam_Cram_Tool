import { html, useState, useEffect, api, go, useStore, Spinner, timeAgo, IS_STATIC, Md } from "../lib.js";
import { GettingStarted, WhatToExpect, COURSE_FILE_TITLE, COURSE_FILE_MD } from "./guide.js";

function greeting(now) {
  const h = now.getHours();
  return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
}

export function HomePage() {
  const store = useStore();
  const [courses, setCourses] = useState(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => api("/courses").then(setCourses).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await api("/courses", { json: { name, description: desc } });
      go(`/c/${c.id}/materials`);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function demo() {
    setBusy(true);
    try { const c = await api("/demo", { method: "POST" }); go(`/c/${c.id}`); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function importPack(ev) {
    const f = ev.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    setBusy(true);
    try { const c = await api("/import", { method: "POST", body: fd }); go(`/c/${c.id}`); }
    catch (e) { setErr(e.message); } finally { setBusy(false); ev.target.value = ""; }
  }

  const h = store.health;
  const now = new Date();
  const dateLine = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const sorted = courses ? [...courses].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)) : [];
  const latest = sorted[0];
  const hasCourses = sorted.length > 0;

  const importBtn = (primary) => html`<label class=${"btn" + (primary ? " primary" : "")}>Import pack (.json)<input type="file" accept=".json,application/json" style="display:none" onChange=${importPack} /></label>`;

  return html`
    <header class="dash-head">
      <div class="dash-title">
        <p class="muted small mb-1">${dateLine}</p>
        <h1 class="mb-0">${hasCourses ? `${greeting(now)} Pick up where you left off.`
          : IS_STATIC ? "Study your Cramtoolfinal courses anywhere." : "Walk into your final knowing every question type."}</h1>
      </div>
      ${hasCourses ? html`<a class="btn primary lg" href=${`#/c/${latest.id}`}>Open ${latest.name}</a>`
        : html`<button class="btn primary lg" onClick=${demo} disabled=${busy}>Open demo course</button>`}
    </header>
    <p class="lede lg muted home-lede">
      ${IS_STATIC ? "From your lecture notes, slides and past papers," : "Upload your lecture notes, slides and past papers."} Cramtoolfinal breaks every concept
      into small everyday steps, finds every exam question pattern, and drills you in the exact form of your past papers.
    </p>

    ${err && html`<div class="notice bad">${err}</div>`}
    ${!IS_STATIC && h && !h.ai_available && html`<div class="notice accent">
      <b>No AI API key? No problem.</b> Create a course, add its files, then ask Claude Code to <i>"build the Cramtoolfinal pack"</i> for it
      (details on the course's Materials page). Or add Claude, OpenAI, Gemini or another provider in <a href="#/settings">Settings</a> to let the app analyze files by itself.
    </div>`}

    <div class="dash-cols">
      <section class="card">
        <div class="sec-head"><h2>Your courses</h2>${hasCourses && html`<span class="muted small">${sorted.length}</span>`}</div>
        ${courses === null ? html`<${Spinner} />`
          : !hasCourses ? html`<p class="muted mb-0">No courses yet. ${IS_STATIC ? "Import a course file, or open the demo course to look around." : "Create one, or open the demo course to look around."}</p>`
          : html`<ul class="course-list">${sorted.map((c) => html`<li>
              <a class="course-row" href=${`#/c/${c.id}`}>
                <div class="plan-body">
                  <div class="plan-name">${c.name}</div>
                  <div class="muted small">
                    ${!IS_STATIC && `${c.materials.length} files · `}${c.stats.concepts} concepts · ${c.stats.patterns} patterns · ${c.stats.problems} problems
                    ${c.description && html`<span class="course-desc"> · ${c.description}</span>`}
                  </div>
                </div>
                <span class="tiny muted course-age">${timeAgo(c.created_at)}</span>
              </a>
            </li>`)}</ul>`}
      </section>

      ${IS_STATIC ? html`<section class="card">
        <div class="sec-head"><h2>Load a course</h2></div>
        <p class="muted small">Pick a <span class="kbd">.cramtoolfinal.json</span> knowledge pack, or try the sample course.</p>
        <div class="row">${importBtn(true)}<button class="btn" onClick=${demo} disabled=${busy}>Open demo course</button></div>
        <details class="faq mt-4"><summary>${COURSE_FILE_TITLE}</summary><${Md} text=${COURSE_FILE_MD} cls="small muted" /></details>
        <p class="tiny muted mb-0 mt-3">This website saves courses and progress in this browser only. Nothing is uploaded to GitHub.</p>
      </section>` : html`<form class="card" onSubmit=${create}>
        <div class="sec-head"><h2>New course</h2></div>
        <div class="stack">
          <div><label class="field" for="nc-name">Course name</label>
            <input id="nc-name" type="text" placeholder="e.g. MATH1010 Calculus I" value=${name} onInput=${(e) => setName(e.target.value)} /></div>
          <div><label class="field" for="nc-desc">Notes (optional)</label>
            <input id="nc-desc" type="text" placeholder="exam date, lecturer…" value=${desc} onInput=${(e) => setDesc(e.target.value)} /></div>
          <button class="btn primary" disabled=${busy || !name.trim()}>Create and upload materials</button>
        </div>
        <div class="row mt-4 pt-line">
          <span class="muted small">Or</span>
          <button type="button" class="btn sm" onClick=${demo} disabled=${busy}>Open demo course</button>
          <label class="btn sm">Import pack (.json)<input type="file" accept=".json,application/json" style="display:none" onChange=${importPack} /></label>
        </div>
      </form>`}
    </div>

    <${GettingStarted} />

    <div class="mt-6"><${WhatToExpect} skipCourseFile=${true} /></div>
  `;
}
