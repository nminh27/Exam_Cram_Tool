// Website mode replacement for the Materials page: the course lives in this browser as an imported
// knowledge pack, so this page exports it, swaps in a newer pack, and backs up / restores progress.
import { html, useState, useEffect, api, loadCourse, exportPack, downloadJson, fileSlug, timeAgo, REPO_URL } from "../lib.js";

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
    <div class="notice accent small">
      This is the Cramtoolfinal <b>website</b>. The course and your progress are saved in <b>this browser</b> only: not on GitHub,
      and not on your other devices. Building or changing a course happens in the app on your computer (or with Claude Code);
      then you bring the new pack here.
    </div>

    <div class="grid two">
      <div class="card">
        <h3>📦 This course</h3>
        <p class="small muted">${kn.concepts.length} concepts · ${kn.patterns.length} exam patterns · ${kn.mcqs.length} MCQs · ${kn.problems.length} problems
          ${course.created_at ? html`<br />added ${timeAgo(course.created_at)}` : ""}</p>
        <div class="stack">
          <div class="row"><button class="btn" onClick=${() => exportPack(cid, course.name)}>⬇ Download knowledge pack</button></div>
          <div class="row"><label class="btn">⟳ Update with a newer pack<input type="file" accept=".json,application/json" style="display:none" onChange=${replacePack} /></label></div>
          <p class="tiny muted">Rebuilt or extended the course on your computer? Export it there (Materials → Export knowledge pack) and load it here.
            Your progress is kept as long as the concept and question ids didn't change.</p>
        </div>
      </div>
      <div class="card">
        <h3>💾 Progress backup</h3>
        <p class="small muted">${progress.events.length} answers recorded. Clearing this site's data in your browser erases them, so keep a backup,
          or move your progress to another device with it.</p>
        <div class="row">
          <button class="btn" onClick=${() => downloadJson({ format: "finalforge-progress", course: course.name, events: progress.events },
            `${fileSlug(course.name)}.progress.json`)}>⬇ Download backup</button>
          <label class="btn">⟲ Restore backup<input type="file" accept=".json,application/json" style="display:none" onChange=${restoreProgress} /></label>
        </div>
        ${info && html`<p class="tiny muted" style="margin-top:10px">
          ${info.indexedDb ? "" : html`<b>Warning:</b> this browser blocks site storage (private window?), so everything is lost when the tab closes. `}
          ${info.persisted ? "Storage is protected from automatic clean-up." : html`Storage may be cleared by the browser when space runs low.
            <button class="btn sm ghost" onClick=${keepSafe}>Ask the browser to keep it</button>`}</p>`}
      </div>
    </div>

    <div class="card flat">
      <h3>Want to add files or use AI?</h3>
      <p class="small">Run the Cramtoolfinal app on your computer (see the <a href=${REPO_URL} target="_blank" rel="noopener">GitHub page</a>), or ask Claude Code to build the course.
        Then export the pack and load it here.</p>
      <button class="btn sm danger" onClick=${remove}>Remove this course from this browser</button>
    </div>`;
}
