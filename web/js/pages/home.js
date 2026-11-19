import { html, useState, useEffect, api, go, useStore, Spinner, timeAgo, IS_STATIC, courseTone } from "../lib.js";
import { GettingStarted, WhatToExpect } from "./guide.js";
import { AiBuilder } from "./ai-build.js";

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

  const aiCard = html`<section class="card" id="build">
    <div class="sec-head"><h2>${hasCourses ? "Add another course with your AI" : "Make your course with your own AI"}</h2>
      <span class="muted small">Free with any AI chat</span></div>
    <${AiBuilder} mode="new" />
  </section>`;
  const importBtn = (primary) => html`<label class=${"btn" + (primary ? " primary" : "")}>${IS_STATIC ? "Open course file" : "Import pack (.json)"}<input type="file" accept=".json,.txt,application/json,text/plain" style="display:none" onChange=${importPack} /></label>`;

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
      ${IS_STATIC
        ? "Give your lecture notes, slides and past papers to your own AI (ChatGPT, Claude or Gemini) with our prompt, and paste its reply here. You get every concept in small everyday steps, every exam question pattern, and practice in the exact form of your past papers."
        : "Upload your lecture notes, slides and past papers. Cramtoolfinal breaks every concept into small everyday steps, finds every exam question pattern, and drills you in the exact form of your past papers."}
    </p>

    ${err && html`<div class="notice bad">${err}</div>`}
    ${!IS_STATIC && h && !h.ai_available && html`<div class="notice accent">
      <b>No AI API key? No problem.</b> Create a course, add its files, then ask Claude Code to <i>"build the Cramtoolfinal pack"</i> for it
      (details on the course's Materials page). Or add Claude, OpenAI, Gemini or another provider in <a href="#/settings">Settings</a> to let the app analyze files by itself.
    </div>`}

    ${IS_STATIC && !hasCourses && courses !== null && aiCard}

    <div class="dash-cols">
      <section class="card courses-card">
        <div class="sec-head"><h2>Your courses</h2>${hasCourses && html`<span class="muted small">${sorted.length}</span>`}</div>
        ${courses === null ? html`<${Spinner} />`
          : !hasCourses ? html`<p class="muted mb-0">No courses yet. ${IS_STATIC ? "Build one with your AI, or open the demo course to look around." : "Create one, or open the demo course to look around."}</p>`
          : html`<ul class="course-list">${sorted.map((c) => html`<li>
              <a class=${"course-row " + courseTone(c.id)} href=${`#/c/${c.id}`}>
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
        <div class="sec-head"><h2>Already have a course file?</h2></div>
        <p class="muted small">Load a <span class="kbd">.json</span> course file that you or a classmate saved, or try the sample course.</p>
        <div class="row">${importBtn(false)}<button class="btn" onClick=${demo} disabled=${busy}>Open demo course</button></div>
        <p class="tiny muted mb-0 mt-4">Courses and progress are saved in this browser only. Nothing is uploaded anywhere.</p>
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

    ${IS_STATIC && (hasCourses || courses === null) && aiCard}

    <${GettingStarted} />

    <div class="mt-6"><${WhatToExpect} skipCourseFile=${true} /></div>
  `;
}
