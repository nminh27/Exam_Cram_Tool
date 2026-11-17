import { html, Md, pct, STATUS_LABEL, masteryColor, Progress } from "../lib.js";

export function Ring({ value, label }) {
  const r = 56, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  const color = v >= 0.85 ? "var(--good)" : v >= 0.6 ? "var(--warn)" : "var(--accent)";
  return html`<div class="ring">
    <svg width="132" height="132" viewBox="0 0 132 132">
      <circle cx="66" cy="66" r=${r} fill="none" stroke="var(--panel-2)" stroke-width="12" />
      <circle cx="66" cy="66" r=${r} fill="none" stroke=${color} stroke-width="12" stroke-linecap="round"
        stroke-dasharray=${c} stroke-dashoffset=${c * (1 - v)} style="transition:stroke-dashoffset .6s" />
    </svg>
    <div class="val"><div><b>${pct(v)}</b><span class="tiny muted">${label}</span></div></div>
  </div>`;
}

export function DashboardPage({ cid, d }) {
  const { course, kn, mastery } = d;
  const empty = !kn.concepts.length;
  const conceptById = Object.fromEntries(kn.concepts.map((c) => [c.id, c]));

  if (empty) {
    return html`
      <h1>${course.name}</h1>
      <div class="card">
        <h3>Let's build your knowledge base</h3>
        <ol class="md">
          <li>Upload lecture notes, slides, textbook chapters, and <b>every past paper</b> (plus solutions if you have them).</li>
          <li>Press <b>Analyze</b> (needs an API key), or ask Claude Code to build the pack for this course (no key needed).
            Either way Claude reads everything, maps the concepts, finds every exam question pattern and builds practice.</li>
          <li>Learn each concept in atomic steps, then train with MCQs and step-by-step exam problems.</li>
        </ol>
        <a class="btn primary" href=${`#/c/${cid}/materials`}>Go to materials</a>
        ${course.job && course.job.status === "running" && html`<p class="muted small">Analysis is running…</p>`}
      </div>`;
  }

  // Next best actions
  const order = kn.learning_path.length ? kn.learning_path : kn.concepts.map((c) => c.id);
  const nextConcept = order.map((id) => conceptById[id]).find((c) => c && mastery.concepts[c.id].status === "unseen");
  const weak = kn.concepts
    .filter((c) => ["weak", "shaky"].includes(mastery.concepts[c.id].status))
    .sort((a, b) => (b.exam_frequency - a.exam_frequency) || (mastery.concepts[a.id].mastery - mastery.concepts[b.id].mastery))
    .slice(0, 4);
  const pats = [...kn.patterns].sort((a, b) => (mastery.patterns[a.id].readiness - mastery.patterns[b.id].readiness) || (b.frequency - a.frequency));
  const weakestPattern = pats.find((p) => kn.problems.some((x) => x.pattern_id === p.id));
  const counts = { unseen: 0, weak: 0, shaky: 0, solid: 0 };
  kn.concepts.forEach((c) => { counts[mastery.concepts[c.id].status]++; });

  return html`
    <div class="row between">
      <h1>${kn.course.title || course.name}</h1>
      ${course.job && course.job.status === "running" && html`<a class="badge accent" href=${`#/c/${cid}/materials`}>Analysis running</a>`}
    </div>

    <div class="grid two">
      <div class="card row gap-5">
        <${Ring} value=${mastery.overall} label="exam readiness" />
        <div class="stack small" style="flex:1">
          <div>Exam patterns <b class="right">${pct(mastery.patternReadiness)}</b><${Progress} value=${mastery.patternReadiness} /></div>
          <div>Core concepts <b>${pct(mastery.conceptReadiness)}</b><${Progress} value=${mastery.conceptReadiness} color="var(--good)" /></div>
          <div class="muted tiny">Readiness = your last 3 attempts per exam pattern, weighted by how often the pattern appears in past papers, plus core-concept mastery.</div>
        </div>
      </div>
      <div class="card">
        <h3>Concept status</h3>
        <div class="grid four">
          ${Object.entries(counts).map(([k, v]) => html`<div class="stat bare">
            <div class="num">${v}</div><div class="lbl"><span class="dot" style=${`background:${masteryColor(k)}`}></span>${STATUS_LABEL[k]}</div></div>`)}
        </div>
      </div>
    </div>

    <div class="card">
      <h3>What to do next</h3>
      <div class="stack">
        ${nextConcept && html`<div class="row between">
          <div><b>Learn:</b> ${nextConcept.name} <span class="muted small">— next in your learning path</span></div>
          <a class="btn sm primary" href=${`#/c/${cid}/concept/${nextConcept.id}`}>Study</a></div>`}
        ${weak.map((c) => html`<div class="row between">
          <div><b>Shore up:</b> ${c.name} <span class="badge ${mastery.concepts[c.id].status === "weak" ? "bad" : "warn"}">${STATUS_LABEL[mastery.concepts[c.id].status]}</span></div>
          <a class="btn sm" href=${`#/c/${cid}/quiz?concept=${c.id}`}>Quiz it</a></div>`)}
        ${weakestPattern && html`<div class="row between">
          <div><b>Exam drill:</b> ${weakestPattern.name} <span class="muted small">— appears in ${weakestPattern.frequency} past question(s), readiness ${pct(mastery.patterns[weakestPattern.id].readiness)}</span></div>
          <a class="btn sm" href=${`#/c/${cid}/pattern/${weakestPattern.id}`}>Practice</a></div>`}
        ${!nextConcept && !weak.length && !weakestPattern && html`<div class="muted">Everything looks solid. Run a mixed quiz from Practice to keep it fresh.</div>`}
      </div>
    </div>

    ${kn.course.overview_md && html`<div class="card"><h3>The big picture</h3><${Md} text=${kn.course.overview_md} /></div>`}

    <div class="grid four">
      <a class="card stat" href=${`#/c/${cid}/learn`}><div class="num">${kn.concepts.length}</div><div class="lbl">concepts</div></a>
      <a class="card stat" href=${`#/c/${cid}/patterns`}><div class="num">${kn.patterns.length}</div><div class="lbl">exam patterns</div></a>
      <a class="card stat" href=${`#/c/${cid}/practice`}><div class="num">${kn.mcqs.length}</div><div class="lbl">MCQs</div></a>
      <a class="card stat" href=${`#/c/${cid}/practice`}><div class="num">${kn.problems.length}</div><div class="lbl">exam problems</div></a>
    </div>
    ${kn.uncovered_questions && kn.uncovered_questions.length > 0 && html`<div class="notice warn">
      ${kn.uncovered_questions.length} past-paper question(s) are not mapped to an exam pattern yet. See <a href=${`#/c/${cid}/patterns`}>Exam patterns</a>.</div>`}
  `;
}
