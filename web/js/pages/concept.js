import { html, useState, api, Md, recordEvents, STATUS_LABEL, Progress, masteryColor, pct, Spinner, useHasKey } from "../lib.js";

export function ExplainButton({ cid, conceptId, snippet, label }) {
  const hasKey = useHasKey();
  const [state, setState] = useState(null); // null | "loading" | {md} | {error}
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  if (!hasKey) return null; // needs live Claude; without a key, ask Claude Code instead
  async function ask() {
    setState("loading");
    try { const r = await api(`/courses/${cid}/explain`, { json: { concept_id: conceptId, snippet, message: msg } }); setState({ md: r.markdown }); }
    catch (e) { setState({ error: e.message }); }
  }
  if (!open) return html`<button class="btn sm ghost" onClick=${() => setOpen(true)}>${label || "Break it down further"}</button>`;
  return html`<div class="explain-box">
    ${state === null && html`<div class="stack">
      <input type="text" placeholder="What exactly is confusing? (optional)" value=${msg} onInput=${(e) => setMsg(e.target.value)} />
      <div class="row"><button class="btn sm primary" onClick=${ask}>Explain it smaller</button>
        <button class="btn sm ghost" onClick=${() => setOpen(false)}>Cancel</button></div></div>`}
    ${state === "loading" && html`<${Spinner} label="Claude is breaking it down…" />`}
    ${state && state.md && html`<${Md} text=${state.md} /><div class="row mt-2">
      <button class="btn sm" onClick=${() => setState(null)}>Ask again</button><button class="btn sm ghost" onClick=${() => { setOpen(false); setState(null); }}>Close</button></div>`}
    ${state && state.error && html`<div class="notice bad small">${state.error}</div><button class="btn sm" onClick=${() => setState(null)}>Back</button>`}
  </div>`;
}

function Section({ id, cls, title, cid, conceptId, snippet, children }) {
  return html`<div class=${"card section-card " + (cls || "")} id=${id}>
    <h3>${title}</h3>
    ${children}
    ${snippet && html`<div class="mt-2"><${ExplainButton} cid=${cid} conceptId=${conceptId} snippet=${`${title}:\n${snippet}`} /></div>`}
  </div>`;
}

function Guided({ cid, concept, steps }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [firstTry, setFirstTry] = useState(true);
  const [done, setDone] = useState(false);
  const s = steps[i];
  if (done) return html`<div class="notice good">You discovered it yourself. <button class="btn sm" onClick=${() => { setI(0); setPicked(null); setDone(false); setFirstTry(true); }}>Walk through again</button></div>`;
  const correct = picked === s.correct;
  function pick(k) {
    if (picked === s.correct) return;
    setPicked(k);
    if (k === s.correct) {
      recordEvents(cid, [{ kind: "guided", item_id: `g-${concept.id}-${i}`, concept_ids: [concept.id], result: firstTry ? "correct" : "wrong", score: firstTry ? 1 : 0.5 }]);
    } else setFirstTry(false);
  }
  return html`<div>
    <div class="tiny muted">Step ${i + 1} of ${steps.length}</div>
    <${Md} text=${s.question_md} />
    <div class="q-opts">${s.options.map((o, k) => html`<button class=${"q-opt " + (picked === k ? (k === s.correct ? "correct" : "wrong") : "")}
      onClick=${() => pick(k)}><span class="key">${"ABCDEF"[k]}</span><span><${Md} text=${o} inline /></span></button>`)}</div>
    ${picked !== null && !correct && html`<div class="feedback bad">Not quite. Think about the everyday situation again and try another option.</div>`}
    ${correct && html`<div class="feedback good"><${Md} text=${s.explanation_md} /></div>
      <div class="row mt-3"><button class="btn primary sm" onClick=${() => {
        if (i + 1 >= steps.length) setDone(true); else { setI(i + 1); setPicked(null); setFirstTry(true); }
      }}>${i + 1 >= steps.length ? "Finish" : "Next step"}</button></div>`}
  </div>`;
}

export function ConceptPage({ cid, d, conceptId }) {
  const { kn, mastery } = d;
  const c = kn.concepts.find((x) => x.id === conceptId);
  if (!c) return html`<div class="notice bad">Concept not found. <a href=${`#/c/${cid}/learn`}>Back</a></div>`;
  const byId = Object.fromEntries(kn.concepts.map((x) => [x.id, x]));
  const topic = kn.topics.find((t) => t.id === c.topic_id);
  const m = mastery.concepts[c.id];
  const leadsTo = kn.concepts.filter((x) => x.prerequisites.includes(c.id));
  const pats = kn.patterns.filter((p) => p.concept_ids.includes(c.id));
  const det = c.detail;
  const guided = (kn.guided || {})[c.id] || [];
  const nMcq = kn.mcqs.filter((q) => q.concept_ids.includes(c.id)).length;
  const order = kn.learning_path;
  const idx = order.indexOf(c.id);
  const next = idx >= 0 && idx + 1 < order.length ? byId[order[idx + 1]] : null;
  const prev = idx > 0 ? byId[order[idx - 1]] : null;

  const chips = (ids, label) => ids.length > 0 && html`<div class="small"><span class="muted">${label}</span> ${ids.map((x) => byId[x] && html`<a class="chip" href=${`#/c/${cid}/concept/${x}`}>${byId[x].name}</a>`)}</div>`;

  return html`
    <div class="small muted"><a href=${`#/c/${cid}/learn`}>Learn</a> / ${topic ? topic.name : ""}</div>
    <div class="row between" style="align-items:flex-start">
      <div style="flex:1;min-width:260px">
        <h1 class="mt-2">${c.name}</h1>
        <p class="lede lg">${c.one_liner}</p>
        <div class="row">
          <span class=${"badge " + (c.importance === "core" ? "accent" : "")}>${c.importance}</span>
          ${c.exam_frequency > 0 && html`<span class="badge">needed in ${c.exam_frequency} past-paper question(s)</span>`}
          <span class="badge" style=${`color:${masteryColor(m.status)}`}>● ${STATUS_LABEL[m.status]}${m.mastery !== null ? ` · ${pct(m.mastery)}` : ""}</span>
        </div>
      </div>
      <div class="row">
        <a class="btn primary" href=${`#/c/${cid}/quiz?concept=${c.id}`}>Quiz me (${nMcq})</a>
      </div>
    </div>
    <div class="stack my-4">
      ${chips(c.prerequisites, "Builds on:")}
      ${chips(leadsTo.map((x) => x.id), "Unlocks:")}
      ${chips(c.related, "Often confused / used with:")}
      ${pats.length > 0 && html`<div class="small"><span class="muted">Exam patterns:</span> ${pats.map((p) => html`<a class="chip" href=${`#/c/${cid}/pattern/${p.id}`}>${p.name}</a>`)}</div>`}
    </div>

    ${!det ? html`<div class="notice warn">The full breakdown for this concept hasn't been generated yet. Run (or resume) the analysis from <a href=${`#/c/${cid}/materials`}>Materials</a>.</div>` : html`
      <div class="toc">${[["why", "Why it exists"], ["what", "What it does"], ["how", "How it works"], ["analogy", "Everyday picture"], ["visual", "Visualize"],
        ["steps", "Atomic steps"], ["formulas", "Formulas"], ["spot", "Exam cues"], ["traps", "Traps"], ["tips", "Tips"], ["example", "Example"], ["guided", "Discover it"]]
        .map(([k, l]) => html`<button class="chip" onClick=${() => document.getElementById("s-" + k)?.scrollIntoView({ behavior: "smooth" })}>${l}</button>`)}</div>

      <${Section} cid=${cid} conceptId=${c.id} id="s-why" cls="why" title="Why does it exist?" snippet=${det.why_exists_md}><${Md} text=${det.why_exists_md} /><//>
      <${Section} cid=${cid} conceptId=${c.id} id="s-what" cls="what" title="What does it do?" snippet=${det.what_it_does_md}><${Md} text=${det.what_it_does_md} /><//>
      <${Section} cid=${cid} conceptId=${c.id} id="s-how" cls="how" title="How does it work?" snippet=${det.how_it_works_md}><${Md} text=${det.how_it_works_md} /><//>
      <${Section} cid=${cid} conceptId=${c.id} id="s-analogy" cls="analogy" title="The everyday picture" snippet=${det.everyday_analogy_md}><${Md} text=${det.everyday_analogy_md} /><//>
      <${Section} cid=${cid} conceptId=${c.id} id="s-visual" cls="visual" title="How to visualize it" snippet=${det.visualize_md}>
        <${Md} text=${det.visualize_md} />
        ${det.diagram_svg && det.diagram_svg.trim().startsWith("<svg") && html`<div class="diagram">
          <img alt="diagram" src=${"data:image/svg+xml;charset=utf-8," + encodeURIComponent(det.diagram_svg)} /></div>`}
      <//>

      <div class="card" id="s-steps">
        <h3>Atomic steps</h3>
        <p class="muted small lede">The idea in its smallest pieces. If a step still feels big, break it down further.</p>
        <ol class="atomic">${det.atomic_steps.map((s, i) => html`<li>
          <${Md} text=${s.step_md} />${s.everyday_link && html`<div class="everyday">${s.everyday_link}</div>`}
          <div class="mt-1"><${ExplainButton} cid=${cid} conceptId=${c.id} snippet=${`Atomic step ${i + 1}: ${s.step_md}`} label="This step is still too big" /></div>
        </li>`)}</ol>
      </div>

      ${det.formulas.length > 0 && html`<div class="card" id="s-formulas"><h3>Formulas</h3>
        ${det.formulas.map((f) => html`<div class="formula">
          <div class="row between"><b>${f.name}</b></div>
          <${Md} text=${`$$${f.latex}$$`} />
          <${Md} text=${f.meaning_md} />
          ${f.symbols.length > 0 && html`<table class="symtab"><tbody>${f.symbols.map((s) => html`<tr>
            <td><${Md} text=${`$${s.symbol}$`} inline /></td><td>${s.meaning}</td><td class="muted">${s.unit}</td></tr>`)}</tbody></table>`}
          ${f.when_to_use_md && html`<div class="small mt-2"><b>When to use:</b> <${Md} text=${f.when_to_use_md} inline /></div>`}
        </div>`)}</div>`}

      <${Section} cid=${cid} conceptId=${c.id} id="s-spot" cls="spot" title="Patterns to look for in exam questions">
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>When you see…</th><th>…it signals</th></tr></thead><tbody>
          ${det.patterns_to_spot.map((p) => html`<tr><td><b><${Md} text=${p.cue} inline /></b></td><td><${Md} text=${p.signals_md} inline /></td></tr>`)}
        </tbody></table></div>
      <//>
      <${Section} cid=${cid} conceptId=${c.id} id="s-traps" cls="trap" title="Common traps (where marks are lost)">
        ${det.common_traps.map((t) => html`<div class="mb-3"><div>✗ <${Md} text=${t.trap_md} inline /></div><div class="small">✓ <${Md} text=${t.fix_md} inline /></div></div>`)}
      <//>
      <${Section} cid=${cid} conceptId=${c.id} id="s-tips" cls="tip" title="Tips & tricks">
        <ul class="md">${det.tips_tricks.map((t) => html`<li><${Md} text=${t.tip_md} inline /> ${t.source && t.source !== "general" && html`<span class="badge">${t.source}</span>`}</li>`)}</ul>
      <//>
      <${Section} cid=${cid} conceptId=${c.id} id="s-example" title="Worked mini-example (exam style)" snippet=${det.mini_example_md}><${Md} text=${det.mini_example_md} /><//>

      ${det.self_check.length > 0 && html`<div class="card"><h3>Say it out loud</h3>
        <p class="muted small">If you can answer these without looking, you own this concept.</p>
        <ul class="md">${det.self_check.map((s) => html`<li><${Md} text=${s} inline /></li>`)}</ul></div>`}

      ${guided.length > 0 && html`<div class="card" id="s-guided"><h3>Discover it yourself</h3>
        <p class="muted small lede">A chain of small questions that leads you to the idea from everyday experience.</p>
        <${Guided} cid=${cid} concept=${c} steps=${guided} /></div>`}
    `}

    <div class="row between mt-5">
      ${prev ? html`<a class="btn" href=${`#/c/${cid}/concept/${prev.id}`}>← ${prev.name}</a>` : html`<span></span>`}
      ${next && html`<a class="btn" href=${`#/c/${cid}/concept/${next.id}`}>${next.name} →</a>`}
    </div>
    <div class="mt-3"><${Progress} value=${idx >= 0 ? (idx + 1) / order.length : 0} /><div class="tiny muted">Concept ${idx + 1} of ${order.length} in the learning path</div></div>
  `;
}
