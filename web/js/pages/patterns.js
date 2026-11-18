import { html, useState, useEffect, api, Md, pct, Progress, loadCourse, useHasKey, IS_STATIC } from "../lib.js";

export function problemStats(d, problemId) {
  const evs = d.progress.events.filter((e) => e.kind === "problem" && e.item_id === problemId);
  return { attempts: evs.length, best: evs.length ? Math.max(...evs.map((e) => e.score)) : null };
}

export function PatternsPage({ cid, d }) {
  const { kn, mastery } = d;
  if (!kn.patterns.length) return html`<h1>Exam patterns</h1><p class="muted">No exam patterns yet. Upload past papers and analyze.</p>`;
  const totalQ = kn.patterns.reduce((a, p) => a + p.frequency, 0);
  return html`
    <h1>Exam patterns</h1>
    <p class="muted">Every past-paper question, grouped into the archetypes the examiner keeps reusing. Master each pattern's recipe and you can handle any new question of that shape.</p>
    ${kn.uncovered_questions && kn.uncovered_questions.length > 0 && html`<div class="notice warn">
      <b>${kn.uncovered_questions.length} past-paper question(s) are not covered by a pattern:</b>
      ${kn.uncovered_questions.map((q) => html` <span class="chip">${q.material_id} Q${q.number}</span>`)}
      <div class="small">Re-run the analysis to retry mapping them.</div></div>`}
    <div class="grid two">
      ${kn.patterns.map((p) => {
        const r = mastery.patterns[p.id];
        const nProb = kn.problems.filter((x) => x.pattern_id === p.id).length;
        return html`<a class="card course-card" style="display:block;color:inherit" href=${`#/c/${cid}/pattern/${p.id}`}>
          <div class="row between"><h3 class="m-0">${p.name}</h3>
            ${p.calc ? html`<span class="badge accent">calculation</span>` : html`<span class="badge">theory</span>`}</div>
          <p class="small muted">${p.description}</p>
          <div class="row small">
            <span class="badge">${p.frequency} past question(s)${totalQ ? ` · ${Math.round((100 * p.frequency) / totalQ)}% of exam` : ""}</span>
            <span class="badge">${nProb} practice problems</span>
            ${!p.guide && html`<span class="badge warn">kit not built yet</span>`}
          </div>
          <div class="mt-3"><${Progress} value=${r.readiness} color="var(--good)" />
            <div class="tiny muted">readiness ${pct(r.readiness)} · ${r.attempts} attempt(s)</div></div>
        </a>`;
      })}
    </div>`;
}

export function PatternPage({ cid, d, patternId }) {
  const { kn, mastery } = d;
  const p = kn.patterns.find((x) => x.id === patternId);
  const hasKey = useHasKey();
  const [job, setJob] = useState(null);
  const [err, setErr] = useState("");
  const running = job && job.status === "running";
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(async () => {
      const j = await api(`/courses/${cid}/job`).catch(() => null);
      if (!j) return;
      setJob(j);
      if (j.status !== "running") loadCourse(cid, true);
    }, 2000);
    return () => clearInterval(t);
  }, [running]);

  if (!p) return html`<div class="notice bad">Pattern not found. <a href=${`#/c/${cid}/patterns`}>Back</a></div>`;
  const byId = Object.fromEntries(kn.concepts.map((x) => [x.id, x]));
  const probs = kn.problems.filter((x) => x.pattern_id === p.id);
  const g = p.guide;

  async function more() {
    setErr("");
    try { setJob(await api(`/courses/${cid}/problems/more`, { json: { pattern_id: p.id, n: 3 } })); }
    catch (e) { setErr(e.message); }
  }

  return html`
    <div class="small muted"><a href=${`#/c/${cid}/patterns`}>Exam patterns</a></div>
    <div class="row between"><h1 class="mt-2">${p.name}</h1>
      ${probs.length > 0 && html`<a class="btn primary" href=${`#/c/${cid}/problem/${probs.find((x) => problemStats(d, x.id).attempts === 0)?.id || probs[0].id}`}>Start practising</a>`}</div>
    <p>${p.description}</p>
    <div class="row small mb-4">
      <span class="badge">${p.frequency} past-paper question(s)</span>
      <span class="badge good">readiness ${pct(mastery.patterns[p.id].readiness)}</span>
      ${p.concept_ids.map((c) => byId[c] && html`<a class="chip" href=${`#/c/${cid}/concept/${c}`}>${byId[c].name}</a>`)}
    </div>
    ${!g ? html`<div class="notice warn">The solving kit for this pattern hasn't been built yet. Run (or resume) analysis from <a href=${`#/c/${cid}/materials`}>Materials</a>.</div>` : html`
      <div class="grid two">
        <div class="card section-card spot"><h3>Recognise it in 10 seconds</h3>
          <ul class="md">${g.recognition_cues.map((x) => html`<li><${Md} text=${x} inline /></li>`)}</ul></div>
        <div class="card section-card tip"><h3>What the examiner wants</h3><${Md} text=${g.examiner_wants_md} /></div>
      </div>
      <div class="card"><h3>The recipe</h3>
        <ol class="atomic">${g.recipe.map((s) => html`<li><${Md} text=${s.step_md} />
          ${s.why_md && html`<div class="small muted">Why: <${Md} text=${s.why_md} inline /></div>`}
          ${s.everyday_link && html`<div class="everyday">${s.everyday_link}</div>`}</li>`)}</ol>
        <a class="btn sm" href=${`#/c/${cid}/quiz?mode=map&pattern=${p.id}`}>Drill the recipe order</a>
      </div>
      <div class="grid two">
        <div class="card section-card tip"><h3>Tricks</h3><ul class="md">${g.tricks.map((x) => html`<li><${Md} text=${x} inline /></li>`)}</ul></div>
        <div class="card section-card trap"><h3>Traps</h3><ul class="md">${g.traps.map((x) => html`<li><${Md} text=${x} inline /></li>`)}</ul></div>
      </div>`}

    <div class="card">
      <div class="row between"><h3 class="m-0">Practice problems (${probs.length})</h3>
        ${hasKey ? html`<button class="btn sm" onClick=${more} disabled=${running}>${running ? "Generating…" : "+ 3 more like these"}</button>`
          : IS_STATIC ? html`<span class="tiny muted">Want more? Ask your AI: "make 3 more problems for ${p.name} in the same JSON format", then add the reply under Course file.</span>`
          : html`<span class="tiny muted" title="No AI provider: ask Claude Code instead">Want more? Ask Claude Code: "make 3 more problems for ${p.name}"</span>`}</div>
      ${err && html`<div class="notice bad small mt-2">${err}</div>`}
      ${job && html`<div class="small muted mt-2">${job.stage} — ${job.status}${job.error ? `: ${job.error}` : ""}</div>`}
      <div class="tbl-wrap mt-2"><table class="tbl"><tbody>
        ${probs.map((x) => {
          const st = problemStats(d, x.id);
          return html`<tr>
            <td>${x.source === "past_paper" ? html`<span class="badge accent">past paper</span>` : html`<span class="badge">variant</span>`}</td>
            <td><b>${x.title}</b><div class="tiny muted">${x.source_ref}</div></td>
            <td>${x.verified === false ? html`<span class="badge warn" title="Independent re-solve disagreed">Check</span>` : x.verified ? html`<span class="badge good">✓ verified</span>` : ""}</td>
            <td class="small muted">${st.attempts ? `best ${pct(st.best)} · ${st.attempts}×` : "not tried"}</td>
            <td style="width:1%"><a class="btn sm" href=${`#/c/${cid}/problem/${x.id}`}>${st.attempts ? "Retry" : "Solve"}</a></td>
          </tr>`;
        })}
      </tbody></table></div>
    </div>

    <div class="card"><h3>Source questions (verbatim)</h3>
      ${p.source_questions.length === 0 && html`<p class="muted small">No past-paper questions linked.</p>`}
      ${p.source_questions.map((q) => html`<details><summary>${q.material_label || q.material_id} — Q${q.number} <span class="muted small">${q.marks ? `[${q.marks} marks]` : ""}</span></summary>
        <div class="paper my-2"><${Md} text=${q.text_md} /></div>
        ${q.solution_md && html`<details><summary class="small">Official solution</summary><${Md} text=${q.solution_md} /></details>`}
      </details>`)}
    </div>`;
}
