import { html, Md, pct, STATUS_LABEL, Progress } from "../lib.js";

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

function greeting(now) {
  const h = now.getHours();
  return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
}

// Topic confidence: average mastery of the concepts in a topic that the student has answered.
function topicRows(kn, mastery) {
  return kn.topics.map((t) => {
    const cs = kn.concepts.filter((c) => c.topic_id === t.id);
    const seen = cs.map((c) => mastery.concepts[c.id].mastery).filter((m) => m !== null && m !== undefined);
    const avg = seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : null;
    const label = avg === null ? "Not started" : avg >= 0.85 ? "Confident" : avg >= 0.6 ? "Getting there" : "Needs work";
    return { id: t.id, name: t.name, avg, label, weak: avg !== null && avg < 0.6 };
  }).filter((r) => kn.concepts.some((c) => c.topic_id === r.id));
}

export function DashboardPage({ cid, d }) {
  const { course, kn, mastery } = d;
  const empty = !kn.concepts.length;
  const conceptById = Object.fromEntries(kn.concepts.map((c) => [c.id, c]));
  const now = new Date();
  const dateLine = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  if (empty) {
    return html`
      <header class="dash-head">
        <div><p class="muted small mb-1">${dateLine}</p><h1 class="mb-0">${course.name}</h1></div>
      </header>
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

  // Today's plan: the next unseen concept, the weakest concepts, and the weakest exam pattern
  const order = kn.learning_path.length ? kn.learning_path : kn.concepts.map((c) => c.id);
  const nextConcept = order.map((id) => conceptById[id]).find((c) => c && mastery.concepts[c.id].status === "unseen");
  const weak = kn.concepts
    .filter((c) => ["weak", "shaky"].includes(mastery.concepts[c.id].status))
    .sort((a, b) => (b.exam_frequency - a.exam_frequency) || (mastery.concepts[a.id].mastery - mastery.concepts[b.id].mastery))
    .slice(0, 3);
  const pats = [...kn.patterns].sort((a, b) => (mastery.patterns[a.id].readiness - mastery.patterns[b.id].readiness) || (b.frequency - a.frequency));
  const weakestPattern = pats.find((p) => kn.problems.some((x) => x.pattern_id === p.id));

  const plan = [];
  if (nextConcept) plan.push({ kind: "Learn", name: nextConcept.name, sub: nextConcept.one_liner,
    href: `#/c/${cid}/concept/${nextConcept.id}`, action: "Study" });
  weak.forEach((c) => plan.push({ kind: "Review", name: c.name, sub: `${STATUS_LABEL[mastery.concepts[c.id].status]} · quick concept quiz`,
    href: `#/c/${cid}/quiz?concept=${c.id}`, action: "Quiz" }));
  if (weakestPattern) plan.push({ kind: "Drill", name: weakestPattern.name,
    sub: `In ${weakestPattern.frequency} past question(s) · readiness ${pct(mastery.patterns[weakestPattern.id].readiness)}`,
    href: `#/c/${cid}/pattern/${weakestPattern.id}`, action: "Practise" });
  const first = plan[0];

  const solid = kn.concepts.filter((c) => mastery.concepts[c.id].status === "solid").length;
  const topics = topicRows(kn, mastery);
  const weakest = topics.filter((t) => t.weak).sort((a, b) => a.avg - b.avg)[0];

  return html`
    <header class="dash-head">
      <div class="dash-title">
        <p class="muted small mb-1">${dateLine} · ${kn.course.title || course.name}</p>
        <h1 class="mb-0">${greeting(now)} One steady session today.</h1>
      </div>
      ${first && html`<a class="btn primary lg" href=${first.href}>${first.kind === "Learn" ? "Start today's lesson" : "Start today's practice"}</a>`}
    </header>
    ${course.job && course.job.status === "running" && html`<div class="notice accent">Analysis is running. <a href=${`#/c/${cid}/materials`}>See progress</a></div>`}

    <section class="card strip" aria-label="Overview">
      <div class="strip-cell">
        <div class="lbl">Exam readiness</div>
        <div class="num">${pct(mastery.overall)}</div>
        <${Progress} value=${mastery.overall} />
      </div>
      <a class="strip-cell" href=${`#/c/${cid}/learn`}>
        <div class="lbl">Concepts solid</div>
        <div class="num">${solid} <span class="of">of ${kn.concepts.length}</span></div>
        <${Progress} value=${kn.concepts.length ? solid / kn.concepts.length : 0} />
      </a>
      <a class="strip-cell" href=${`#/c/${cid}/patterns`}>
        <div class="lbl">Exam patterns</div>
        <div class="num">${kn.patterns.length}</div>
        <div class="sub">readiness ${pct(mastery.patternReadiness)}</div>
      </a>
      <a class="strip-cell" href=${`#/c/${cid}/practice`}>
        <div class="lbl">Practice bank</div>
        <div class="num">${kn.mcqs.length + kn.problems.length}</div>
        <div class="sub">${kn.mcqs.length} MCQs · ${kn.problems.length} exam problems</div>
      </a>
    </section>

    <div class="dash-cols">
      <section class="card">
        <div class="sec-head"><h2>Today's plan</h2><span class="muted small">${plan.length} step${plan.length === 1 ? "" : "s"}</span></div>
        ${plan.length ? html`<ol class="plan">
          ${plan.map((p, i) => html`<li>
            <span class="plan-n">${String(i + 1).padStart(2, "0")}</span>
            <div class="plan-body"><div class="plan-name">${p.kind}: ${p.name}</div>${p.sub && html`<div class="muted small">${p.sub}</div>`}</div>
            <a class=${"btn sm" + (i === 0 ? " primary" : "")} href=${p.href}>${p.action}</a>
          </li>`)}
        </ol>` : html`<p class="muted mb-0">Everything looks solid. Run a mixed quiz from <a href=${`#/c/${cid}/practice`}>Practice</a> to keep it fresh.</p>`}
      </section>

      <section class="card">
        <div class="sec-head"><h2>Confidence by topic</h2><a class="small" href=${`#/c/${cid}/progress`}>All progress</a></div>
        <div class="topics">
          ${topics.map((t) => html`<div class="topic">
            <div class="topic-row"><span>${t.name}</span><span class="muted">${t.label}</span></div>
            <${Progress} value=${t.avg || 0} color=${t.weak ? "var(--warn)" : null} />
          </div>`)}
        </div>
        ${weakest && html`<p class="notice warn mt-4 mb-0">${weakest.name} is your weakest topic so far. Worth a second pass this week.</p>`}
      </section>
    </div>

    ${kn.course.overview_md && html`<section class="card"><h2>The big picture</h2><${Md} text=${kn.course.overview_md} /></section>`}
    ${kn.uncovered_questions && kn.uncovered_questions.length > 0 && html`<div class="notice warn">
      ${kn.uncovered_questions.length} past-paper question(s) are not mapped to an exam pattern yet. See <a href=${`#/c/${cid}/patterns`}>Exam patterns</a>.</div>`}
  `;
}
