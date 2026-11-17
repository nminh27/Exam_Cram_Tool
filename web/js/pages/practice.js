import { html, useState, go, pct } from "../lib.js";
import { problemStats } from "./patterns.js";

const TYPES = [
  ["intuition", "Intuition (everyday scenarios)"], ["misconception", "Misconceptions"],
  ["application", "Application"], ["pattern", "Spot the approach"], ["map", "How concepts connect"],
];

export function PracticePage({ cid, d }) {
  const { kn, mastery } = d;
  const [topic, setTopic] = useState("");
  const [types, setTypes] = useState(TYPES.map((t) => t[0]));
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState("smart");
  if (!kn.concepts.length) return html`<h1>Practice</h1><p class="muted">Nothing to practise yet. Analyze your materials first.</p>`;

  const wrongCount = kn.mcqs.filter((q) => mastery.lastResult[q.id] && mastery.lastResult[q.id].score < 1).length;
  const startQuiz = () => {
    const p = new URLSearchParams({ mode, n: String(count) });
    if (topic) p.set("topic", topic);
    if (types.length < TYPES.length) p.set("types", types.join(","));
    go(`/c/${cid}/quiz?${p}`);
  };
  const untried = kn.problems.filter((x) => problemStats(d, x.id).attempts === 0);
  const randomProblem = () => {
    // Weighted by how often the pattern shows up in past papers; prefer problems not tried yet.
    const pool = untried.length ? untried : kn.problems;
    const freq = Object.fromEntries(kn.patterns.map((p) => [p.id, Math.max(1, p.frequency)]));
    const total = pool.reduce((a, x) => a + (freq[x.pattern_id] || 1), 0);
    let r = Math.random() * total;
    for (const x of pool) { r -= freq[x.pattern_id] || 1; if (r <= 0) return go(`/c/${cid}/problem/${x.id}?n=${Date.now()}`); }
    return go(`/c/${cid}/problem/${pool[0].id}`);
  };

  return html`
    <h1>Practice</h1>
    <div class="grid two">
      <div class="card">
        <h3>🧠 Concept quiz (MCQ)</h3>
        <p class="muted small">Tests understanding and intuition, not memory. Every option comes with an explanation of why it's right or wrong.</p>
        <div class="stack">
          <div><label class="field">Topic</label>
            <select value=${topic} onChange=${(e) => setTopic(e.target.value)}>
              <option value="">All topics</option>${kn.topics.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select></div>
          <div><label class="field">Question types</label>
            ${TYPES.map(([k, l]) => html`<label class="check small"><input type="checkbox" checked=${types.includes(k)}
              onChange=${(e) => setTypes(e.target.checked ? [...types, k] : types.filter((x) => x !== k))} />${l}</label>`)}</div>
          <div class="row">
            <div><label class="field">Questions</label><input type="number" min="3" max="50" style="width:90px" value=${count} onInput=${(e) => setCount(+e.target.value)} /></div>
            <div style="flex:1"><label class="field">Selection</label>
              <select value=${mode} onChange=${(e) => setMode(e.target.value)}>
                <option value="smart">Smart: weak + unseen first</option>
                <option value="random">Random</option>
                <option value="mistakes">Only my mistakes (${wrongCount})</option></select></div>
          </div>
          <button class="btn primary" onClick=${startQuiz} disabled=${!types.length}>Start quiz</button>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <h3>📝 Exam problems, step by step</h3>
          <p class="muted small">The exact form of your past papers. You fill in one small box per step: what's given → what's asked → which formula → rearrange → substitute → compute → final answer.</p>
          <div class="row">
            <button class="btn primary" onClick=${randomProblem} disabled=${!kn.problems.length}>Random exam problem</button>
            <a class="btn" href=${`#/c/${cid}/patterns`}>Choose by pattern</a>
          </div>
          <p class="tiny muted">${kn.problems.length} problems · ${untried.length} not tried yet</p>
        </div>
        <div class="card">
          <h3>🧩 Knowledge-map drills</h3>
          <p class="muted small">Big-picture questions built from your concept graph: what must come first, what a concept unlocks, which concepts a question type needs, and putting solution recipes in order.</p>
          <a class="btn" href=${`#/c/${cid}/quiz?mode=map`}>Start map drills</a>
        </div>
        ${wrongCount > 0 && html`<div class="card"><h3>🔁 Review mistakes</h3>
          <p class="muted small">${wrongCount} MCQ(s) you got wrong last time.</p>
          <a class="btn" href=${`#/c/${cid}/quiz?mode=mistakes&n=50`}>Review them</a></div>`}
      </div>
    </div>

    <div class="card">
      <h3>Patterns at a glance</h3>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pattern</th><th>In past papers</th><th>Problems</th><th>Readiness</th><th></th></tr></thead><tbody>
        ${kn.patterns.map((p) => html`<tr><td>${p.name}</td><td>${p.frequency}</td>
          <td>${kn.problems.filter((x) => x.pattern_id === p.id).length}</td><td>${pct(mastery.patterns[p.id].readiness)}</td>
          <td style="width:1%"><a class="btn sm" href=${`#/c/${cid}/pattern/${p.id}`}>Open</a></td></tr>`)}
      </tbody></table></div>
    </div>`;
}
