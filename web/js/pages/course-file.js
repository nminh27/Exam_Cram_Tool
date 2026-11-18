// Website mode replacement for the Materials page: the course lives in this browser as a course file
// (knowledge pack) written by the student's own AI. This page adds the next part from the AI, saves the
// course file, swaps in a newer one, and backs up / restores progress.
import { html, useState, useEffect, api, loadCourse, exportPack, downloadJson, fileSlug, timeAgo } from "../lib.js";
import { AiBuilder } from "./ai-build.js";

export function CourseFilePage({ cid, d }) {
  const { course, kn, progress } = d;
  const [msg, setMsg] = useState(null);
  const [info, setInfo] = useState(null);
  useEffect(() => { import("../static-api.js").then((m) => m.storageInfo()).then(setInfo).catch(() => {}); }, []);
  const say = (ok, text) => setMsg({ ok, text });

  async function replacePack(ev) {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try { await api(`/courses/${cid}/replace`, { method: "POST", body: fd }); await loadCourse(cid, true); say(true, "Course updated. Your progress was kept."); }
    catch (e) { say(false, e.message); }
  }
  async function restoreProgress(ev) {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.events)) throw new Error("That file isn't a Cramtoolfinal progress backup.");
      if (!confirm(`Replace this course's progress with the ${data.events.length} answers in the backup?`)) return;
      await api(`/courses/${cid}/progress`, { json: { events: data.events, replace: true } });
      await loadCourse(cid, true);
      say(true, `Restored ${data.events.length} answers.`);
    } catch (e) { say(false, e.message); }
  }
  async function keepSafe() {
    const m = await import("../static-api.js");
    const ok = await m.askPersistence();
    setInfo(await m.storageInfo());
    say(ok, ok ? "This browser will keep Cramtoolfinal's data unless you clear it yourself." : "The browser didn't allow it; keep a progress backup instead.");
  }
  async function remove() {
    if (!confirm(`Remove "${course.name}" and its progress from this browser? Export a backup first if you might want it back.`)) return;
    await api(`/courses/${cid}`, { method: "DELETE" });
    location.hash = "/";
  }

  return html`
    <h1>Course file</h1>
    ${msg && html`<div class=${"notice " + (msg.ok ? "good" : "bad")}>${msg.text}</div>`}
    <p class="lede muted">The course and your progress are saved in <b>this browser</b> only. Nothing is uploaded, and other devices
      don't see it until you open the course file there.</p>

    <section class="card">
      <div class="sec-head"><h2>Add more with your AI</h2><span class="muted small">same chat you built it in</span></div>
      <${AiBuilder} mode="add" cid=${cid} onAdded=${() => loadCourse(cid, true)} />
    </section>

    <div class="grid two">
      <div class="card">
        <h3>This course</h3>
        <p class="small muted">${kn.concepts.length} concepts · ${kn.patterns.length} exam patterns · ${kn.mcqs.length} MCQs · ${kn.problems.length} problems
          ${course.created_at ? html`<br />added ${timeAgo(course.created_at)}` : ""}</p>
        <div class="stack">
          <div class="row"><button class="btn" onClick=${() => exportPack(cid, course.name)}>Download course file</button></div>
          <div class="row"><label class="btn">Replace with a newer file<input type="file" accept=".json,application/json" style="display:none" onChange=${replacePack} /></label></div>
          <p class="tiny muted">Open the downloaded file on another device with <b>Open course file</b> on the home page, or send it to a classmate.
            Replacing keeps your progress as long as the concept and question ids stay the same.</p>
        </div>
      </div>
      <div class="card">
        <h3>Progress backup</h3>
        <p class="small muted">${progress.events.length} answers recorded. Clearing this site's data in your browser erases them, so keep a backup,
          or move your progress to another device with it.</p>
        <div class="row">
          <button class="btn" onClick=${() => downloadJson({ format: "finalforge-progress", course: course.name, events: progress.events },
            `${fileSlug(course.name)}.progress.json`)}>Download backup</button>
          <label class="btn">Restore backup<input type="file" accept=".json,application/json" style="display:none" onChange=${restoreProgress} /></label>
        </div>
        ${info && html`<p class="tiny muted mt-3">
          ${info.indexedDb ? "" : html`<b>Warning:</b> this browser blocks site storage (private window?), so everything is lost when the tab closes. `}
          ${info.persisted ? "Storage is protected from automatic clean-up." : html`Storage may be cleared by the browser when space runs low.
            <button class="btn sm ghost" onClick=${keepSafe}>Ask the browser to keep it</button>`}</p>`}
      </div>
    </div>

    <div class="row">
      <button class="btn sm ghost danger" onClick=${remove}>Remove this course from this browser</button>
    </div>`;
}
