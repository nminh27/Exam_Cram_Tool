import { html, useState, useMemo, api, Md, AnswerFigure, recordEvents, shuffle, pct, loadCourse, useHasKey, IS_STATIC, LESSON_QUIZ_N, lessonQuizTiers, topicsInOrder } from "../lib.js";

// ------------------------------------------------------------------ building the question list

function mcqItems(kn, mastery, query) {
  const concept = query.get("concept");
  const topic = query.get("topic");
  const types = query.get("types") ? query.get("types").split(",") : null;
  const mode = query.get("mode") || "smart";
  const n = Math.max(1, Math.min(60, +(query.get("n") || (concept ? LESSON_QUIZ_N : 10))));
  const topicOf = Object.fromEntries(kn.concepts.map((c) => [c.id, c.topic_id]));
  const tiers = concept ? lessonQuizTiers(kn, concept) : null;
  const tier = (q) => (tiers ? tiers.get(q.id) : 0);
  let pool = kn.mcqs.filter((q) =>
    (!concept || tiers.has(q.id))
    && (!topic || q.concept_ids.some((c) => topicOf[c] === topic))
    && (!types || types.includes(q.type)));
  if (mode === "mistakes") pool = pool.filter((q) => mastery.lastResult[q.id] && mastery.lastResult[q.id].score < 1);
  if (mode === "smart") {
    // priority: never seen < got wrong < weak concept < answered right long ago
    const pri = (q) => {
      const last = mastery.lastResult[q.id];
      const cm = Math.min(...q.concept_ids.map((c) => (mastery.concepts[c] && mastery.concepts[c].mastery) ?? 0));
      if (!last) return 0 + cm * 0.5;
      if (last.score < 1) return 1 + cm * 0.5;
      return 2 + cm + Math.max(0, 1 - (Date.now() / 1000 - last.ts) / 86400 / 3);
    };
    pool = shuffle(pool).sort((a, b) => tier(a) - tier(b) || pri(a) - pri(b));
  } else pool = shuffle(pool).sort((a, b) => tier(a) - tier(b));
  return pool.slice(0, n).map((q) => {
    const order = shuffle(q.options.map((_, i) => i));
    return {
      id: q.id, kind: "single", qtype: q.type, concept_ids: q.concept_ids,
      question_md: q.question_md,
      options: order.map((i) => q.options[i]),
      explanations: order.map((i) => q.option_explanations[i] || ""),
      correct: order.indexOf(q.correct),
      figure_svg: q.figure_svg || "",
      question_svg: q.question_svg || "",
      ...helpFigure(kn, q.concept_ids),
      solution_md: q.solution_md || "",
    };
  });
}

// The lesson figure of the question's first lesson that has one: offered as "Show a figure to help" while answering,
// so a question about a table or a tree can be reasoned out instead of remembered.
function helpFigure(kn, conceptIds) {
  for (const id of conceptIds || []) {
    const c = kn.concepts.find((x) => x.id === id);
    const svg = c && c.detail && c.detail.diagram_svg;
    if (svg && String(svg).trim().startsWith("<svg")) return { help_svg: svg, help_name: c.name };
  }
  return {};
}

function sample(arr, k) { return shuffle(arr).slice(0, k); }

// Knowledge-map drills are generated from the concept graph itself: no extra API calls.
export function mapDrills(kn, query) {
  const byId = Object.fromEntries(kn.concepts.map((c) => [c.id, c]));
  const dependents = {};
  kn.concepts.forEach((c) => c.prerequisites.forEach((p) => (dependents[p] ||= []).push(c.id)));
  const ancestors = (id, seen = new Set()) => { (byId[id]?.prerequisites || []).forEach((p) => { if (!seen.has(p)) { seen.add(p); ancestors(p, seen); } }); return seen; };
  const descendants = (id, seen = new Set()) => { (dependents[id] || []).forEach((p) => { if (!seen.has(p)) { seen.add(p); descendants(p, seen); } }); return seen; };
  const items = [];
  const onlyPattern = query.get("pattern");

  for (const p of kn.patterns) {
    if (onlyPattern && p.id !== onlyPattern) continue;
    const recipe = p.guide && p.guide.recipe ? p.guide.recipe.map((r) => r.step_md) : [];
    if (recipe.length >= 3) {
      const steps = recipe.slice(0, 8);
      const order = shuffle(steps.map((_, i) => i));
      items.push({ id: `map-order-${p.id}`, kind: "order", concept_ids: p.concept_ids,
        question_md: `Put the steps for solving **${p.name}** questions in the right order.`,
        options: order.map((i) => steps[i]), correctOrder: steps, explain_md: steps.map((s, i) => `${i + 1}. ${s}`).join("\n") });
    }
    if (onlyPattern) continue;
    const need = p.concept_ids.filter((c) => byId[c]);
    if (need.length >= 1) {
      const right = sample(need, 3);
      const wrong = sample(kn.concepts.filter((c) => !need.includes(c.id)).map((c) => c.id), Math.max(2, 5 - right.length));
      const opts = shuffle([...right, ...wrong]);
      items.push({ id: `map-pat-${p.id}`, kind: "multi", concept_ids: right,
        question_md: `An exam question of the type **"${p.name}"** appears. Which of these concepts will you need? (select all)`,
        options: opts.map((x) => byId[x].name), correctSet: opts.map((x, i) => (right.includes(x) ? i : -1)).filter((i) => i >= 0),
        explain_md: `This pattern uses: ${need.map((x) => byId[x].name).join(", ")}.` });
    }
  }
  if (!onlyPattern) {
    for (const c of kn.concepts) {
      if (c.prerequisites.length) {
        const right = c.prerequisites.filter((x) => byId[x]).slice(0, 3);
        const desc = [...descendants(c.id)];
        const anc = ancestors(c.id);
        const wrongPool = [...desc, ...kn.concepts.map((x) => x.id).filter((x) => x !== c.id && !anc.has(x) && !desc.includes(x))];
        const wrong = [...new Set(wrongPool)].slice(0, 12);
        const opts = shuffle([...right, ...sample(wrong, Math.max(2, 5 - right.length))]);
        items.push({ id: `map-pre-${c.id}`, kind: "multi", concept_ids: [c.id, ...right],
          question_md: `Before you can really understand **${c.name}**, which of these must you understand first? (select all direct prerequisites)`,
          options: opts.map((x) => byId[x].name), correctSet: opts.map((x, i) => (right.includes(x) ? i : -1)).filter((i) => i >= 0),
          explain_md: `${c.name} builds directly on: ${right.map((x) => byId[x].name).join(", ")}.` });
      }
      const deps = (dependents[c.id] || []).filter((x) => byId[x]);
      if (deps.length) {
        const right = deps[Math.floor(Math.random() * deps.length)];
        const wrong = sample(kn.concepts.map((x) => x.id).filter((x) => x !== c.id && !deps.includes(x) && !descendants(c.id).has(x)), 3);
        if (wrong.length >= 2) {
          const opts = shuffle([right, ...wrong]);
          items.push({ id: `map-unl-${c.id}`, kind: "single", concept_ids: [c.id, right],
            question_md: `Once you've mastered **${c.name}**, which concept does it *directly* unlock?`,
            options: opts.map((x) => byId[x].name), explanations: opts.map(() => ""), correct: opts.indexOf(right),
            explain_md: `${c.name} is a direct prerequisite of ${deps.map((x) => byId[x].name).join(", ")}.` });
        }
      }
      if (kn.topics.length >= 3) {
        const t = kn.topics.find((x) => x.id === c.topic_id);
        if (t) {
          const opts = shuffle([t, ...sample(kn.topics.filter((x) => x.id !== t.id), 3)]);
          items.push({ id: `map-top-${c.id}`, kind: "single", concept_ids: [c.id],
            question_md: `Which part of the course does **${c.name}** belong to?`,
            options: opts.map((x) => x.name), explanations: opts.map(() => ""), correct: opts.indexOf(t),
            explain_md: `${c.name} sits in **${t.name}**${t.summary ? `: ${t.summary}` : ""}.` });
        }
      }
    }
  }
  const n = +(query.get("n") || 12);
  return shuffle(items).slice(0, n);
}

// ------------------------------------------------------------------ the runner

export function QuizPage({ cid, d, query }) {
  const { kn, mastery } = d;
  const isMap = query.get("mode") === "map";
  const items = useMemo(() => (isMap ? mapDrills(kn, query) : mcqItems(kn, mastery, query)), []);
  const [i, setI] = useState(0);
  const [results, setResults] = useState([]);
  const [busyMore, setBusyMore] = useState(false);
  const hasKey = useHasKey();
  const concept = query.get("concept");
  const cName = concept && (kn.concepts.find((c) => c.id === concept) || {}).name;
  const topic = query.get("topic");
  const tName = topic && (kn.topics.find((t) => t.id === topic) || {}).name;
  const order = topic ? topicsInOrder(kn) : [];
  const next = order[order.findIndex((x) => x.topic.id === topic) + 1];

  const again = () => {
    const p = new URLSearchParams(query);
    p.set("r", String(Date.now()));
    location.hash = `/c/${cid}/quiz?${p}`;
  };
  async function genMore() {
    setBusyMore(true);
    try { await api(`/courses/${cid}/mcqs/more`, { json: { concept_id: concept, n: 6 } }); await loadCourse(cid, true); again(); }
    catch (e) { alert(e.message); } finally { setBusyMore(false); }
  }

  if (!items.length) {
    return html`<h1>${isMap ? "Map drills" : "Quiz"}</h1>
      <div class="notice">${query.get("mode") === "mistakes" ? "No mistakes to review. Nice." : "No questions match these filters yet."}</div>
      ${concept && hasKey && html`<button class="btn" onClick=${genMore} disabled=${busyMore}>${busyMore ? "Generating…" : "Generate questions for this concept"}</button>`}
      ${concept && !hasKey && html`<p class="muted small">${IS_STATIC
        ? `Ask your AI: "write 8 MCQs for ${cName} in the same JSON format", then add the reply under Course file.`
        : `Ask Claude Code: "write 8 MCQs for ${cName}".`}</p>`}`;
  }

  if (i >= items.length) {
    const score = results.reduce((a, r) => a + r.score, 0) / results.length;
    const missed = results.filter((r) => r.score < 1);
    return html`<h1>Done</h1>
      <div class="card center"><div style="font-size:2.6rem;font-weight:800">${pct(score)}</div>
        <div class="muted">${results.filter((r) => r.score === 1).length} of ${results.length} right</div></div>
      ${missed.length > 0 && html`<div class="card"><h3>Review what you missed</h3>
        ${missed.map((r) => html`<div class="mb-3"><${Md} text=${r.item.question_md} />
          <div class="small">Correct: <b>${r.item.kind === "single" ? html`<${Md} text=${r.item.options[r.item.correct]} inline />`
            : r.item.kind === "multi" ? r.item.correctSet.map((k) => r.item.options[k]).join(", ") : "see order above"}</b></div>
          ${r.item.solution_md && html`<details class="small mt-2"><summary>Step by step</summary><${Md} text=${r.item.solution_md} /></details>`}
          ${r.item.concept_ids.slice(0, 1).map((c) => kn.concepts.find((x) => x.id === c) && html`<a class="small" href=${`#/c/${cid}/concept/${c}`}>Revisit ${kn.concepts.find((x) => x.id === c).name} →</a>`)}
        </div>`)}</div>`}
      <div class="row"><button class="btn primary" onClick=${again}>Another round</button>
        ${concept && hasKey && html`<button class="btn" onClick=${genMore} disabled=${busyMore}>${busyMore ? "Generating…" : "Generate 6 fresh questions"}</button>`}
        ${next && next.mcqs.length > 0 && html`<a class="btn" href=${`#/c/${cid}/quiz?mode=smart&n=${Math.min(10, next.mcqs.length)}&topic=${next.topic.id}`}>Next topic: ${next.topic.name} →</a>`}
        <a class="btn" href=${`#/c/${cid}/practice`}>Back to practice</a></div>`;
  }

  const item = items[i];
  const onDone = (score) => {
    setResults([...results, { item, score }]);
    recordEvents(cid, [{ kind: isMap ? "map" : "mcq", item_id: item.id, concept_ids: item.concept_ids, result: score === 1 ? "correct" : "wrong", score }]);
  };
  return html`
    <div class="row between"><h1 class="m-0">${isMap ? "Map drills" : cName ? `Quiz: ${cName}` : tName ? `Topic quiz: ${tName}` : "Concept quiz"}</h1>
      <span class="muted">${i + 1} / ${items.length}</span></div>
    <div class="bar mt-3 mb-4"><div style=${`width:${(100 * i) / items.length}%`}></div></div>
    <div class="card" key=${item.id}>
      ${item.qtype && html`<span class="badge accent">${item.qtype}</span>`}
      <${Question} item=${item} onDone=${onDone} onNext=${() => setI(i + 1)} last=${i + 1 === items.length} />
    </div>`;
}

function QuestionFigure({ svg, alt, caption }) {
  if (!svg || !String(svg).trim().startsWith("<svg")) return null;
  return html`<div class="diagram q-fig"><img alt=${alt} src=${"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)} />
    ${caption && html`<div class="tiny muted mt-1">${caption}</div>`}</div>`;
}

function Question({ item, onDone, onNext, last }) {
  const [picked, setPicked] = useState(item.kind === "multi" ? [] : null);
  const [order, setOrder] = useState(item.kind === "order" ? item.options : null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [help, setHelp] = useState(false);

  function check() {
    let s = 0;
    if (item.kind === "single") s = picked === item.correct ? 1 : 0;
    if (item.kind === "multi") {
      const a = [...picked].sort().join(","), b = [...item.correctSet].sort().join(",");
      s = a === b ? 1 : 0;
    }
    if (item.kind === "order") s = order.every((x, k) => x === item.correctOrder[k]) ? 1 : 0;
    setScore(s); setChecked(true); onDone(s);
  }
  const move = (k, dir) => {
    const o = [...order]; const j = k + dir;
    if (j < 0 || j >= o.length) return;
    [o[k], o[j]] = [o[j], o[k]]; setOrder(o);
  };

  return html`<div>
    <div class="q-stem"><${Md} text=${item.question_md} /></div>
    ${item.question_svg ? html`<${QuestionFigure} svg=${item.question_svg} alt="Figure for this question" />`
      : item.help_svg && !checked && html`<div class="q-help">
          <button class="btn sm ghost" onClick=${() => setHelp(!help)}>${help ? "Hide the figure" : "Show a figure to help"}</button>
          ${help && html`<${QuestionFigure} svg=${item.help_svg} alt=${`Lesson figure: ${item.help_name}`} caption=${`From the lesson: ${item.help_name}`} />`}</div>`}

    ${item.kind === "single" && html`<div class="q-opts">${item.options.map((o, k) => {
      let cls = "q-opt";
      if (checked) cls += k === item.correct ? " correct" : k === picked ? " wrong" : "";
      else if (picked === k) cls += " selected";
      return html`<button class=${cls} disabled=${checked} onClick=${() => setPicked(k)}>
        <span class="key">${"ABCDEFGH"[k]}</span>
        <span style="flex:1"><${Md} text=${o} inline />
          ${checked && item.explanations[k] && (k === picked || k === item.correct) && html`<div class="why"><${Md} text=${item.explanations[k]} inline /></div>`}</span>
      </button>`;
    })}</div>`}

    ${item.kind === "multi" && html`<div class="q-opts">${item.options.map((o, k) => {
      const on = picked.includes(k);
      let cls = "q-opt";
      if (checked) cls += item.correctSet.includes(k) ? " correct" : on ? " wrong" : "";
      else if (on) cls += " selected";
      return html`<button class=${cls} disabled=${checked} onClick=${() => setPicked(on ? picked.filter((x) => x !== k) : [...picked, k])}>
        <span class="key">${on ? "✓" : ""}</span><span><${Md} text=${o} inline /></span></button>`;
    })}</div>`}

    ${item.kind === "order" && html`<div class="my-4">${order.map((o, k) => html`<div class=${"order-item " + (checked ? (o === item.correctOrder[k] ? "correct" : "wrong") : "")}>
      <span class="n">${k + 1}</span><span style="flex:1"><${Md} text=${o} inline /></span>
      ${!checked && html`<button class="btn sm ghost" onClick=${() => move(k, -1)} disabled=${k === 0}>↑</button>
        <button class="btn sm ghost" onClick=${() => move(k, 1)} disabled=${k === order.length - 1}>↓</button>`}</div>`)}</div>`}

    ${!checked ? html`<button class="btn primary" onClick=${check}
        disabled=${item.kind === "single" ? picked === null : item.kind === "multi" ? !picked.length : false}>Check</button>`
      : html`<div class=${"feedback " + (score === 1 ? "good" : "bad")}>${score === 1 ? "Correct." : "Not quite."}
          ${item.explain_md && html`<${Md} text=${item.explain_md} />`}
          ${item.solution_md && html`<div class="solution"><div class="solution-h">Step by step</div><${Md} text=${item.solution_md} /></div>`}
          <${AnswerFigure} svg=${item.figure_svg} /></div>
        <div class="row mt-3"><button class="btn primary" onClick=${onNext}>${last ? "See results" : "Next"}</button></div>`}
  </div>`;
}
