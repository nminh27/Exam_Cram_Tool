import { html, useState, useEffect, api, go, useStore, Spinner, timeAgo, IS_STATIC, Md } from "../lib.js";
import { GettingStarted, WhatToExpect, COURSE_FILE_TITLE, COURSE_FILE_MD } from "./guide.js";

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
  return html`
    <div class="hero">
      <h1>${IS_STATIC ? "Study your Cramtoolfinal courses anywhere." : "Walk into your final already knowing every question type."}</h1>
      <p class="muted" style="max-width:720px">
        ${IS_STATIC ? "From your lecture notes, slides and past papers," : "Upload your lecture notes, slides and past papers."} Cramtoolfinal breaks every concept down into
        atomic, everyday-life steps, maps how they connect, finds every exam question pattern, and drills you
        with intuition MCQs and step-by-step exam problems in the exact form of your past papers.
      </p>
    </div>

    <${GettingStarted} />

    ${IS_STATIC ? html`
      <div class="notice accent">
        <b>This is the Cramtoolfinal website.</b> Study and practise on any device, phone included.
        Courses and progress are saved in <b>this browser</b>. Courses are built in the Cramtoolfinal app on your computer (or by Claude Code) and brought here as a knowledge pack.
      </div>
      ${err && html`<div class="notice bad">${err}</div>`}
      <div class="grid two">
        <div class="card">
          <h3>Load a course</h3>
          <p class="muted small">Pick a <span class="kbd">.cramtoolfinal.json</span> knowledge pack, or try the sample course.</p>
          <div class="row">
            <label class="btn primary">Import pack (.json)<input type="file" accept=".json,application/json" style="display:none" onChange=${importPack} /></label>
            <button class="btn" onClick=${demo} disabled=${busy}>Open demo course</button>
          </div>
        </div>
        <div class="card">
          <h3>${COURSE_FILE_TITLE}</h3>
          <${Md} text=${COURSE_FILE_MD} cls="small" />
          <p class="tiny muted">Course files you import stay in this browser: they are not uploaded to GitHub.</p>
        </div>
      </div>` : html`
    ${h && !h.ai_available && html`<div class="notice accent">
        <b>No AI API key? No problem.</b> Create a course, add its files, then ask Claude Code to <i>"build the Cramtoolfinal pack"</i> for it
        (details on the course's Materials page). Or add Claude, OpenAI, Gemini or another provider in <a href="#/settings">Settings</a> to let the app analyze files by itself.
      </div>`}
      ${err && html`<div class="notice bad">${err}</div>`}
  
      <div class="grid two">
        <form class="card" onSubmit=${create}>
          <h3>New course</h3>
          <div class="stack">
            <div><label class="field">Course name</label>
              <input type="text" placeholder="e.g. MATH1010 Calculus I" value=${name} onInput=${(e) => setName(e.target.value)} /></div>
            <div><label class="field">Notes (optional)</label>
              <input type="text" placeholder="exam date, lecturer…" value=${desc} onInput=${(e) => setDesc(e.target.value)} /></div>
            <button class="btn primary" disabled=${busy || !name.trim()}>Create and upload materials</button>
          </div>
        </form>
        <div class="card">
          <h3>Try it or bring a pack</h3>
          <p class="muted small">The demo course (sample physics content) shows every feature without an API key.
            Knowledge packs are exported from Cramtoolfinal or written by Claude Code.</p>
          <div class="row">
            <button class="btn" onClick=${demo} disabled=${busy}>Open demo course</button>
            <label class="btn">Import pack (.json)<input type="file" accept=".json,application/json" style="display:none" onChange=${importPack} /></label>
          </div>
        </div>
      </div>`}

    <h2 class="mt-6">Your courses</h2>
    ${courses === null ? html`<${Spinner} />`
      : courses.length === 0 ? html`<p class="muted">No courses yet.</p>`
      : html`<div class="grid three">${courses.map((c) => html`
          <div class="card course-card" onClick=${() => go(`/c/${c.id}`)}>
            <h3>${c.name}</h3>
            ${c.description && html`<div class="muted small">${c.description}</div>`}
            <div class="row small muted mt-3">
              ${!IS_STATIC && html`<span>${c.materials.length} files</span>·`}<span>${c.stats.concepts} concepts</span>·
              <span>${c.stats.patterns} patterns</span>·<span>${c.stats.problems} problems</span>
            </div>
            <div class="tiny muted mt-2">created ${timeAgo(c.created_at)}</div>
          </div>`)}</div>`}

    <div class="mt-6"><${WhatToExpect} skipCourseFile=${true} /></div>
  `;
}
