import { html, useState, useRef, useEffect, api, Md, recordEvents, numericMatches, parseNumber, pct, go, useStore } from "../lib.js";
import { ExplainButton } from "./concept.js";
import { problemStats } from "./patterns.js";

const KIND_LABEL = {
  given: "Spot what's given", unknown: "What is asked?", concept: "Which principle?", formula: "Pick the formula",
  rearrange: "Rearrange", substitute: "Substitute", compute: "Calculate", units: "Units", check: "Sanity check",
  interpret: "Interpret", explain: "Explain", final: "Final answer",
};

function answerText(step) {
  if (step.answer_type === "numeric") return `${step.numeric_answer} ${step.unit || ""}`.trim();
  if (step.answer_type === "choice" || step.answer_type === "multi") return step.correct_choices.map((k) => step.choices[k]).join("; ");
  return step.text_answer_md;
}

function numericNudge(input, expected) {
  const v = parseNumber(input);
  if (!Number.isFinite(v)) return "I couldn't read a number there. Type just the number (e.g. 12.5 or 3.2e-4).";
  if (expected !== 0 && Math.abs(v + expected) / Math.abs(expected) < 0.02) return "Right size, wrong sign. Check your direction / sign convention.";
  const ratio = expected !== 0 ? Math.abs(v / expected) : 0;
  for (const p of [10, 100, 1000, 1e6]) {
    if (Math.abs(ratio * p - 1) < 0.03 || Math.abs(ratio / p - 1) < 0.03) return "Off by a power of ten: check unit conversions (cm/m, g/kg, ms/s…).";
  }
  if (ratio > 0.9 && ratio < 1.1) return "Very close: check your rounding of intermediate values.";
  return "Not quite. Re-read the step and try again, or take a hint.";
}

function Step({ cid, step, n, state, active, onChange, onFinish, context }) {
  const store = useStore();
  const [val, setVal] = useState("");
  const [sel, setSel] = useState(step.answer_type === "multi" ? [] : null);
  const [fb, setFb] = useState(null);
  const [grading, setGrading] = useState(false);
  const [selfGrade, setSelfGrade] = useState(false);
  const ref = useRef();
  // Follow the student down the page, but leave the question in view for the very first step.
  useEffect(() => { if (active && n > 1 && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "center" }); }, [active]);

  const done = state.status === "correct" || state.status === "revealed";
  const scoreNow = () => (state.tries === 0 && !state.hinted ? 1 : 0.5);

  function wrong(msg) {
    onChange({ ...state, tries: state.tries + 1 });
    setFb({ cls: "bad", text: msg });
  }

  async function check() {
    if (step.answer_type === "numeric") {
      if (numericMatches(val, step.numeric_answer, step.tolerance_pct)) onFinish("correct", scoreNow(), val);
      else wrong(numericNudge(val, step.numeric_answer));
    } else if (step.answer_type === "choice") {
      if (step.correct_choices.includes(sel)) onFinish("correct", scoreNow(), step.choices[sel]);
      else wrong("Not this one. Think about what the question gives you and what each option assumes.");
    } else if (step.answer_type === "multi") {
      const a = [...sel].sort().join(","), b = [...step.correct_choices].sort().join(",");
      if (a === b) onFinish("correct", scoreNow(), sel.map((k) => step.choices[k]).join("; "));
      else {
        const missing = step.correct_choices.filter((k) => !sel.includes(k)).length;
        const extra = sel.filter((k) => !step.correct_choices.includes(k)).length;
        wrong(`${missing ? `You missed ${missing}. ` : ""}${extra ? `${extra} of your picks ${extra > 1 ? "are" : "is"} not right. ` : ""}Read the question again, word by word.`);
      }
    } else if (step.answer_type === "text") {
      if (!store.health || !store.health.ai_available) { setSelfGrade(true); return; }
      setGrading(true);
      try {
        const r = await api(`/courses/${cid}/grade`, { json: { context, prompt: step.prompt_md, model: step.text_answer_md, answer: val } });
        if (r.verdict === "correct") onFinish("correct", scoreNow(), val, r.feedback_md);
        else {
          onChange({ ...state, tries: state.tries + 1 });
          setFb({ cls: r.verdict === "partial" ? "warn" : "bad", text: r.feedback_md + (r.missing_points.length ? "\n\nMissing: " + r.missing_points.map((x) => `\n- ${x}`).join("") : "") });
        }
      } catch (e) { setFb({ cls: "warn", text: `AI grading unavailable (${e.message}). Compare with the model answer instead.` }); setSelfGrade(true); }
      finally { setGrading(false); }
    }
  }

  const cls = "step " + (done ? (state.status === "correct" ? "done-correct" : "done-revealed") : active ? "active" : "locked");
  return html`<div class=${cls} ref=${ref}>
    <div class="step-head">
      <span class="step-num">${n}</span>
      <span class="badge accent">${KIND_LABEL[step.kind] || step.kind}</span>
      ${state.status === "correct" && html`<span class="badge good">✓ ${state.score === 1 ? "first try" : "solved"}</span>`}
      ${state.status === "revealed" && html`<span class="badge warn">revealed</span>`}
    </div>
    <${Md} text=${step.prompt_md} />

    ${active && !done && html`<div>
      ${step.answer_type === "numeric" && html`<form class="answer-row" onSubmit=${(e) => { e.preventDefault(); check(); }}>
        <input type="text" inputmode="decimal" placeholder="your answer" value=${val} onInput=${(e) => setVal(e.target.value)} autofocus />
        ${step.unit && html`<span class="unit"><${Md} text=${step.unit} inline /></span>`}
        <button class="btn primary" disabled=${!val.trim()}>Check</button></form>`}
      ${step.answer_type === "choice" && html`<div class="q-opts">${step.choices.map((c, k) => html`<button class=${"q-opt" + (sel === k ? " selected" : "")} onClick=${() => setSel(k)}>
        <span class="key">${"ABCDEFGH"[k]}</span><span><${Md} text=${c} inline /></span></button>`)}</div>
        <button class="btn primary" onClick=${check} disabled=${sel === null}>Check</button>`}
      ${step.answer_type === "multi" && html`<div class="tiny muted mt-2">Select all that apply.</div>
        <div class="q-opts">${step.choices.map((c, k) => { const on = sel.includes(k); return html`<button class=${"q-opt" + (on ? " selected" : "")}
          onClick=${() => setSel(on ? sel.filter((x) => x !== k) : [...sel, k])}><span class="key">${on ? "✓" : ""}</span><span><${Md} text=${c} inline /></span></button>`; })}</div>
        <button class="btn primary" onClick=${check} disabled=${!sel.length}>Check</button>`}
      ${step.answer_type === "text" && html`<div class="mt-2">
        <textarea placeholder="Write your answer as you would in the exam…" value=${val} onInput=${(e) => setVal(e.target.value)}></textarea>
        <div class="row mt-2">
          <button class="btn primary" onClick=${check} disabled=${!val.trim() || grading}>${grading ? "Marking…" : store.health && store.health.ai_available ? "Mark my answer" : "Compare with model answer"}</button>
        </div></div>`}

      ${fb && html`<div class=${"feedback " + fb.cls}><${Md} text=${fb.text} /></div>`}
      ${selfGrade && html`<div class="feedback info"><b>Model answer:</b><${Md} text=${step.text_answer_md} />
        <div class="row mt-2"><span class="small">How did you do?</span>
          <button class="btn sm" onClick=${() => onFinish("correct", 0.75, val)}>Had all the points</button>
          <button class="btn sm" onClick=${() => onFinish("revealed", 0.4, val)}>Partly</button>
          <button class="btn sm" onClick=${() => onFinish("revealed", 0, val)}>Missed it</button></div></div>`}
      ${state.hinted && step.hint_md && html`<div class="feedback info"><${Md} text=${step.hint_md} inline /></div>`}

      <div class="row mt-3">
        ${step.hint_md && !state.hinted && html`<button class="btn sm ghost" onClick=${() => onChange({ ...state, hinted: true })}>Hint</button>`}
        <button class="btn sm ghost" onClick=${() => onFinish("revealed", 0, null)}>Show answer</button>
        ${step.concept_ids[0] && html`<${ExplainButton} cid=${cid} conceptId=${step.concept_ids[0]} label="I don't get this step"
          snippet=${`Exam step: ${step.prompt_md}\nCorrect answer: ${answerText(step)}\nWorking: ${step.explanation_md}`} />`}
      </div>
    </div>`}

    ${done && html`<div class="feedback ${state.status === "correct" ? "good" : "warn"}">
      <div><b>Answer:</b> <${Md} text=${answerText(step)} inline /></div>
      ${state.aiFeedback && html`<${Md} text=${state.aiFeedback} />`}
      ${step.explanation_md && html`<div class="mt-2"><${Md} text=${step.explanation_md} /></div>`}
    </div>`}
  </div>`;
}

export function ProblemPage({ cid, d, problemId }) {
  const { kn } = d;
  const p = kn.problems.find((x) => x.id === problemId);
  const [states, setStates] = useState({});
  const [started] = useState(Date.now());
  const [recorded, setRecorded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (!p) return html`<div class="notice bad">Problem not found. <a href=${`#/c/${cid}/practice`}>Back</a></div>`;
  const pattern = kn.patterns.find((x) => x.id === p.pattern_id);
  const flat = [];
  p.parts.forEach((part, pi) => part.steps.forEach((s) => flat.push({ s, pi })));
  const st = (id) => states[id] || { status: "pending", tries: 0, hinted: false };
  const currentIdx = flat.findIndex(({ s }) => !["correct", "revealed"].includes(st(s.id).status));
  const finished = currentIdx === -1 && flat.length > 0;
  const context = `${p.statement_md}`.slice(0, 5000);

  function finishStep(s, status, score, given, aiFeedback) {
    const next = { ...states, [s.id]: { ...st(s.id), status, score, given, aiFeedback } };
    setStates(next);
    recordEvents(cid, [{ kind: "step", item_id: s.id, concept_ids: s.concept_ids, pattern_id: p.pattern_id, result: status === "correct" ? (score === 1 ? "correct" : "hint") : "revealed", score }]);
    const allDone = flat.every(({ s: x }) => ["correct", "revealed"].includes((next[x.id] || {}).status));
    if (allDone && !recorded) {
      setRecorded(true);
      const total = flat.reduce((a, { s: x }) => a + (next[x.id].score || 0), 0) / flat.length;
      recordEvents(cid, [{ kind: "problem", item_id: p.id, concept_ids: [], pattern_id: p.pattern_id, result: total >= 0.85 ? "correct" : "wrong", score: total,
        meta: { seconds: Math.round((Date.now() - started) / 1000) } }]);
    }
  }

  const siblings = kn.problems.filter((x) => x.pattern_id === p.pattern_id && x.id !== p.id);
  const nextProblem = siblings.find((x) => problemStats(d, x.id).attempts === 0) || siblings[0];
  const totalScore = finished ? flat.reduce((a, { s }) => a + (st(s.id).score || 0), 0) / flat.length : 0;

  return html`
    <div class="small muted"><a href=${`#/c/${cid}/patterns`}>Exam patterns</a> / ${pattern && html`<a href=${`#/c/${cid}/pattern/${pattern.id}`}>${pattern.name}</a>`}</div>
    <div class="row between"><h1 class="mt-2">${p.title}</h1>
      <div class="row">${p.source === "past_paper" ? html`<span class="badge accent">past paper · ${p.source_ref}</span>` : html`<span class="badge">variant · ${p.source_ref}</span>`}</div></div>
    ${p.verified === false && html`<div class="notice warn"><b>An independent re-solve disagreed with this problem's solution.</b> Treat the steps with care.
      ${p.verify_note && html`<details><summary class="small">Details</summary><${Md} text=${p.verify_note} /></details>`}</div>`}

    <div class="solver">
    <div class="paper-col">
      <div class="paper"><${Md} text=${p.statement_md} /></div>
      <p class="tiny muted mt-2">Exam technique: try it on paper first, then walk through the boxes. One small step at a time.</p>
    </div>
    <div class="steps-col">
    ${p.parts.map((part, pi) => {
      const steps = flat.map((f, k) => ({ ...f, k })).filter((f) => f.pi === pi);
      const partDone = steps.every(({ s }) => ["correct", "revealed"].includes(st(s.id).status));
      const partStarted = steps.some(({ k }) => currentIdx === -1 || k <= currentIdx);
      return html`<div class="mt-4">
        <h3>${part.label ? `(${part.label}) ` : ""}<${Md} text=${part.prompt_md} inline /> ${part.marks && html`<span class="badge">${part.marks} marks</span>`}</h3>
        ${partStarted ? steps.map(({ s, k }) => (currentIdx === -1 || k <= currentIdx || showAll)
          ? html`<${Step} key=${s.id} cid=${cid} step=${s} n=${k + 1} state=${st(s.id)} active=${k === currentIdx} context=${context}
              onChange=${(ns) => setStates({ ...states, [s.id]: ns })}
              onFinish=${(status, score, given, ai) => finishStep(s, status, score, given, ai)} />`
          : null)
          : html`<div class="muted small">${steps.length} steps — unlocks after the previous part.</div>`}
        ${partStarted && currentIdx !== -1 && steps.some(({ k }) => k > currentIdx) && html`<div class="muted small">+ ${steps.filter(({ k }) => k > currentIdx).length} more step(s) in this part</div>`}
        ${partDone && part.final_answer_md && html`<div class="notice good"><b>Final answer ${part.label ? `(${part.label})` : ""}:</b> <${Md} text=${part.final_answer_md} inline /></div>`}
      </div>`;
    })}

    ${finished && html`<div class="card center mt-5">
      <div style="font-size:2.4rem;font-weight:800">${pct(totalScore)}</div>
      <div class="muted">${flat.filter(({ s }) => st(s.id).score === 1).length} of ${flat.length} steps right first time</div>
      <div class="row justify-center mt-4">
        ${nextProblem && html`<button class="btn primary" onClick=${() => go(`/c/${cid}/problem/${nextProblem.id}`)}>Next problem like this</button>`}
        <button class="btn" onClick=${() => go(`/c/${cid}/problem/${p.id}?n=${Date.now()}`)}>Retry this one</button>
        <a class="btn" href=${`#/c/${cid}/pattern/${p.pattern_id}`}>Back to pattern</a>
      </div>
    </div>`}
    ${!finished && html`<div class="row mt-3"><label class="check small"><input type="checkbox" checked=${showAll} onChange=${(e) => setShowAll(e.target.checked)} />Preview all steps</label></div>`}
    </div></div>
  `;
}
