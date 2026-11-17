import { html, useState, useEffect, useRef, api, loadCourse, fmtBytes, Md, Progress, timeAgo, useStore } from "../lib.js";

const KINDS = [
  ["notes", "Lecture notes"], ["slides", "Slides"], ["textbook", "Textbook"],
  ["past_paper", "Past paper"], ["solutions", "Solutions / mark scheme"],
  ["problem_set", "Problem set / tutorial"], ["other", "Other"],
];
const KIND_LABEL = Object.fromEntries(KINDS);

function guessKind(name) {
  const n = name.toLowerCase();
  if (/(sol|answer|mark.?scheme|memo)/.test(n)) return "solutions";
  if (/(past|exam|final|midterm|paper|test|quiz)/.test(n)) return "past_paper";
  if (/(tut|problem|exercise|homework|hw|sheet)/.test(n)) return "problem_set";
  if (/(slide|lec.*\.pptx|\.pptx)/.test(n)) return "slides";
  return null;
}

export function MaterialsPage({ cid, d }) {
  const { course } = d;
  const store = useStore();
  const [kind, setKind] = useState("notes");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [job, setJob] = useState(course.job || null);
  const [opts, setOpts] = useState({ variants: 3, verify: true, force_digest: false, force_deep: false });
  const [digest, setDigest] = useState(null);
  const fileRef = useRef();

  const running = job && job.status === "running";
  // Poll the job while it runs; reload the course when it finishes.
  useEffect(() => {
    if (!running) return undefined;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const j = await api(`/courses/${cid}/job`);
        if (!alive) return;
        setJob(j && j.id ? j : null);
        if (!j || j.status !== "running") loadCourse(cid, true);
      } catch (_) { /* server busy; try again */ }
    }, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [running]);

  async function upload(files) {
    if (!files || !files.length) return;
    setBusy(true); setErr("");
    try {
      // Group by guessed kind so "past_2023.pdf" goes in as a past paper even if "notes" is selected.
      const groups = {};
      for (const f of files) { const k = kind === "auto" ? (guessKind(f.name) || "notes") : kind; (groups[k] ||= []).push(f); }
      for (const [k, fs] of Object.entries(groups)) {
        const fd = new FormData();
        fs.forEach((f) => fd.append("files", f));
        fd.append("kind", k);
        await api(`/courses/${cid}/materials`, { method: "POST", body: fd });
      }
      await loadCourse(cid, true);
    } catch (e) { setErr(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function setMatKind(m, k) {
    try { await api(`/courses/${cid}/materials/${m.id}`, { method: "PATCH", json: { kind: k } }); await loadCourse(cid, true); }
    catch (e) { setErr(e.message); }
  }
  async function remove(m) {
    if (!confirm(`Remove ${m.filename}? Its extracted digest is deleted too.`)) return;
    await api(`/courses/${cid}/materials/${m.id}`, { method: "DELETE" });
    loadCourse(cid, true);
  }
  async function analyze() {
    setErr("");
    try { const j = await api(`/courses/${cid}/analyze`, { json: opts }); setJob(j); }
    catch (e) { setErr(e.message); }
  }
  async function showDigest(m) {
    try { setDigest({ m, d: await api(`/courses/${cid}/materials/${m.id}/digest`) }); }
    catch (e) { setErr(e.message); }
  }
  async function deleteCourse() {
    if (!confirm(`Delete the course "${course.name}" with all materials and progress? This cannot be undone.`)) return;
    await api(`/courses/${cid}`, { method: "DELETE" });
    location.hash = "/";
  }

  const mats = course.materials;
  const hasPaper = mats.some((m) => m.kind === "past_paper");
  const keyOk = store.health ? store.health.ai_available : true;

  return html`
    <div class="row between"><h1>Materials</h1>
      <a class="btn sm" href=${`/api/courses/${cid}/export`}>Export knowledge pack</a></div>
    ${err && html`<div class="notice bad">${err}</div>`}

    <div class="card">
      <div class=${"drop" + (over ? " over" : "")}
        onDragOver=${(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave=${() => setOver(false)}
        onDrop=${(e) => { e.preventDefault(); setOver(false); upload([...e.dataTransfer.files]); }}>
        
        <p><b>Drop files here</b> or <label class="btn sm">browse<input ref=${fileRef} type="file" multiple style="display:none"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.txt,.md,.tex,.csv"
          onChange=${(e) => upload([...e.target.files])} /></label></p>
        <div class="row" style="justify-content:center">
          <span class="small muted">These files are:</span>
          <select style="width:auto" value=${kind} onChange=${(e) => setKind(e.target.value)}>
            <option value="auto">Auto-detect from file name</option>
            ${KINDS.map(([k, l]) => html`<option value=${k}>${l}</option>`)}
          </select>
        </div>
        <p class="tiny muted">PDF works best (formulas, tables and diagrams are read from the page images). Also: images of handwritten notes, DOCX, PPTX, text.</p>
        ${busy && html`<p class="small">Uploading…</p>`}
      </div>
    </div>

    ${mats.length > 0 && html`<div class="card"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>File</th><th>Type</th><th>Size</th>${keyOk && html`<th>Read?</th>`}<th></th></tr></thead>
      <tbody>${mats.map((m) => html`<tr>
        <td><a href=${`/api/courses/${cid}/materials/${m.id}/file`} target="_blank">${m.filename}</a>
          ${m.pages ? html` <span class="tiny muted">${m.pages} p.</span>` : ""}</td>
        <td><select style="width:auto" value=${m.kind} onChange=${(e) => setMatKind(m, e.target.value)}>
          ${KINDS.map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></td>
        <td class="muted small">${fmtBytes(m.size)}</td>
        ${keyOk && html`<td>${m.digest_error ? html`<span class="badge bad" title=${m.digest_error}>error</span>`
          : m.digested ? html`<button class="btn sm ghost" onClick=${() => showDigest(m)}>✓ view what was read</button>`
          : html`<span class="badge">not yet</span>`}</td>`}
        <td><button class="btn sm ghost danger" onClick=${() => remove(m)}>✕</button></td>
      </tr>`)}</tbody></table></div></div>`}

    ${!keyOk && html`<${ClaudeCodeCard} course=${course} hasPaper=${hasPaper} />`}
    ${(keyOk || job) && html`<div class="card">
      <h3>Analyze with AI ${store.health && store.health.provider && html`<span class="badge">${store.health.provider} · ${store.health.model}</span>`}</h3>
      ${!keyOk && html`<div class="notice warn">Add an AI provider in <a href="#/settings">Settings</a> first.</div>`}
      ${mats.length > 0 && !hasPaper && html`<div class="notice warn">No file is marked as a <b>past paper</b>. Exam patterns and exam-form practice problems come from past papers, so add them if you have any.</div>`}
      <p class="muted small">Reads each file once (cached), builds the knowledge map, writes the atomic breakdown + MCQs for every concept,
        then builds a solving kit and step-by-step problems for every exam pattern, and independently re-solves each generated problem to catch errors.
        Re-running only processes new or changed material unless you tick the boxes below.</p>
      <div class="row gap-4">
        <label class="check small">Variant problems per pattern
          <input type="number" min="0" max="8" style="width:70px" value=${opts.variants}
            onInput=${(e) => setOpts({ ...opts, variants: +e.target.value })} /></label>
        <label class="check small"><input type="checkbox" checked=${opts.verify} onChange=${(e) => setOpts({ ...opts, verify: e.target.checked })} />Verify generated problems</label>
        <label class="check small"><input type="checkbox" checked=${opts.force_digest} onChange=${(e) => setOpts({ ...opts, force_digest: e.target.checked })} />Re-read all files</label>
        <label class="check small"><input type="checkbox" checked=${opts.force_deep} onChange=${(e) => setOpts({ ...opts, force_deep: e.target.checked })} />Rebuild all breakdowns</label>
      </div>
      <div class="row mt-3">
        <button class="btn primary" onClick=${analyze} disabled=${running || !mats.length || !keyOk}>${running ? "Analyzing…" : d.kn.concepts.length ? "Update analysis" : "Analyze materials"}</button>
        ${d.course.analyzed_at && html`<span class="muted small">last full analysis ${timeAgo(d.course.analyzed_at)}</span>`}
      </div>
      ${job && html`<${JobPanel} job=${job} />`}
    </div>`}

    <div class="card flat">
      <h3>Danger zone</h3>
      <button class="btn sm danger" onClick=${deleteCourse}>Delete this course</button>
    </div>

    ${digest && html`<${DigestModal} digest=${digest} onClose=${() => setDigest(null)} />`}
  `;
}

function ClaudeCodeCard({ course, hasPaper }) {
  const [copied, setCopied] = useState(false);
  const say = `Build the Cramtoolfinal pack for the course "${course.name}" (${course.id})`;
  const copy = () => { navigator.clipboard.writeText(say).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  return html`<div class="card section-card how">
    <h3>No AI provider? Let Claude Code build this course</h3>
    <ol class="md">
      <li>Add your files: upload them above (mark past papers as <b>Past paper</b>),
        or drop them into <span class="kbd">inbox/${course.name}/</span> in the project folder.</li>
      <li>In Claude Code, say:
        <div class="row my-2"><span class="kbd lg">${say}</span>
          <button class="btn sm" onClick=${copy}>${copied ? "Copied ✓" : "Copy"}</button></div></li>
      <li>Claude Code reads every file, writes the concept breakdowns, questions and step-by-step exam problems,
        checks them, and loads them into this course. Refresh this page when it says it's done.</li>
    </ol>
    ${!hasPaper && html`<div class="notice warn small">Include your past papers: exam patterns and exam-form practice come from them.</div>`}
    <p class="tiny muted">Big course? It works topic by topic; say "continue the pack for ${course.name}". This uses your Claude plan's usage, not API billing.
      Have an API key (Claude, OpenAI, Gemini…)? Add it in <a href="#/settings">Settings</a> to unlock the Analyze button.</p>
  </div>`;
}

function JobPanel({ job }) {
  const p = job.progress || { done: 0, total: 0 };
  const u = job.usage || {};
  const statusBadge = { running: "accent", completed: "good", completed_with_errors: "warn", failed: "bad", interrupted: "warn" }[job.status] || "";
  return html`<div class="mt-4">
    <div class="row between small">
      <div><span class=${"badge " + statusBadge}>${job.status.replace(/_/g, " ")}</span> <b>${job.stage}</b></div>
      <div class="muted">${u.calls || 0} calls · ${((u.input_tokens || 0) + (u.cache_read_tokens || 0)).toLocaleString()} in / ${(u.output_tokens || 0).toLocaleString()} out tokens${u.approx_cost_usd !== null && u.approx_cost_usd !== undefined ? ` · ≈ $${u.approx_cost_usd.toFixed(2)}` : ""}</div>
    </div>
    ${p.total > 0 && html`<div class="my-2"><${Progress} value=${p.done / p.total} /><div class="tiny muted">${p.done} / ${p.total}</div></div>`}
    ${job.error && html`<div class="notice bad small">${job.error}</div>`}
    <div class="log">${(job.log || []).slice(-40).map((l) => html`<div class=${l.level}>${l.msg}</div>`)}</div>
  </div>`;
}

function DigestModal({ digest, onClose }) {
  const { m, d } = digest;
  return html`<div class="modal-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="modal">
      <div class="row between"><h2>${d.title || m.filename}</h2><button class="btn sm" onClick=${onClose}>Close</button></div>
      <p class="muted small">${KIND_LABEL[m.kind]} · detected as ${d.kind_detected} ${d.label ? "· " + d.label : ""}</p>
      <p class="small">Check that past-paper questions were transcribed exactly. If something is wrong, tick "Re-read all files" and analyze again.</p>
      <${Md} text=${d.summary} />
      ${d.questions && d.questions.length > 0 && html`<h3 class="mt-4">Questions (${d.questions.length})</h3>
        ${d.questions.map((q) => html`<details><summary>Q${q.number} <span class="muted small">[${q.marks} marks · ${q.question_type}]</span></summary>
          <div class="paper my-2"><${Md} text=${q.text_md} /></div>
          ${q.solution_md && html`<div class="card flat"><b>Solution</b><${Md} text=${q.solution_md} /></div>`}</details>`)}`}
      ${d.sections && d.sections.length > 0 && html`<h3 class="mt-4">Sections (${d.sections.length})</h3>
        ${d.sections.map((s) => html`<details><summary>${s.heading} <span class="muted small">p. ${s.pages}</span></summary><${Md} text=${s.content_md} /></details>`)}`}
    </div></div>`;
}
