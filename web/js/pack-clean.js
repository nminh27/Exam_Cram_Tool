// Make a knowledge pack written by any AI chat safe for the UI.
// Chat assistants (ChatGPT, Claude, Gemini…) follow the format in ai-prompt.js well but not perfectly:
// fields go missing, ids clash, an answer index is off the end. Everything is repaired or dropped here,
// in the same spirit as clean_mcq / clean_problem in app/pipeline.py, so the study screens can trust the shape.

const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (x === null || x === undefined ? "" : typeof x === "string" ? x : typeof x === "object" ? JSON.stringify(x) : String(x));
const strs = (x) => arr(x).map(str).filter((s) => s.trim());
const int = (x, d = 0) => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : d);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const STEP_KINDS = ["given", "unknown", "concept", "formula", "rearrange", "substitute", "compute", "units", "check", "interpret", "explain", "final"];
const MCQ_TYPES = ["intuition", "misconception", "application", "pattern", "map"];

// Pull the JSON object out of a chat reply: code fences, text before or after, a pack or bare knowledge.
export function extractJson(text) {
  let s = String(text || "").replace(/^﻿/, "").trim();
  // A course file (or a bare JSON reply) parses as it is. Its text may itself contain ``` code blocks.
  if (s.startsWith("{")) { try { return JSON.parse(s); } catch (_) { /* fall through to the reply handling */ } }
  // A chat reply: take the fenced block. A real fence starts a line; ``` inside JSON strings never does.
  const fence = s.match(/(?:^|\n)[ \t]*```(?:json)?[^\n]*\n([\s\S]*?)\n[ \t]*```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0) throw new Error("No JSON found. Paste the AI's whole reply, including the part in curly brackets { … }.");
  if (b <= a) throw new Error("The JSON is cut off. The reply was probably too long: ask the AI to build one topic at a time.");
  try { return JSON.parse(s.slice(a, b + 1)); }
  catch (e) {
    throw new Error("The JSON is cut off or broken (" + e.message + "). The reply was probably too long: ask the AI to " +
      "\"send the same JSON again, complete, in one code block\", or to build one topic at a time.");
  }
}

// An id the pack already has is kept exactly (so progress survives "Update with a newer pack", and a part can
// replace an item of the course it is added to); a missing one is made from the name and never reuses an id in
// `reserved` (the ids the course already has).
function uniqueId(given, name, prefix, used, reserved) {
  let id = typeof given === "string" && given.trim() ? given.trim() : typeof given === "number" ? String(given) : "";
  const made = !id;
  if (made) id = `${prefix}-${slug(name || "") || used.size + reserved.size + 1}`;
  let out = id, n = 2;
  while (used.has(out) || (made && reserved.has(out))) out = `${id}-${n++}`;
  used.add(out);
  return out;
}

// Optional answer figure: kept only when it is an SVG.
const svgField = (v) => (str(v).trim().startsWith("<svg") ? { figure_svg: str(v).trim() } : {});

function cleanDetail(d) {
  if (!d || typeof d !== "object") return null;
  const svg = str(d.diagram_svg).trim();
  return {
    why_exists_md: str(d.why_exists_md), what_it_does_md: str(d.what_it_does_md), how_it_works_md: str(d.how_it_works_md),
    everyday_analogy_md: str(d.everyday_analogy_md), visualize_md: str(d.visualize_md),
    diagram_svg: svg.startsWith("<svg") ? svg : "",
    atomic_steps: arr(d.atomic_steps).map((s) => (typeof s === "string" ? { step_md: s, everyday_link: "" }
      : { step_md: str(s && s.step_md), everyday_link: str(s && s.everyday_link) })).filter((s) => s.step_md.trim()),
    formulas: arr(d.formulas).filter((f) => f && str(f.latex).trim()).map((f) => ({
      latex: str(f.latex).replace(/^\$+|\$+$/g, ""), name: str(f.name), meaning_md: str(f.meaning_md),
      symbols: arr(f.symbols).map((s) => ({ symbol: str(s && s.symbol), meaning: str(s && s.meaning), unit: str(s && s.unit) })),
      when_to_use_md: str(f.when_to_use_md),
    })),
    patterns_to_spot: arr(d.patterns_to_spot).map((p) => ({ cue: str(p && p.cue), signals_md: str(p && p.signals_md) })).filter((p) => p.cue),
    common_traps: arr(d.common_traps).map((t) => ({ trap_md: str(t && t.trap_md), fix_md: str(t && t.fix_md) })).filter((t) => t.trap_md),
    tips_tricks: arr(d.tips_tricks).map((t) => (typeof t === "string" ? { tip_md: t, source: "general" }
      : { tip_md: str(t && t.tip_md), source: str(t && t.source) || "general" })).filter((t) => t.tip_md),
    mini_example_md: str(d.mini_example_md),
    self_check: strs(d.self_check),
  };
}

function cleanChoiceQuestion(q) {
  const options = strs(q.options);
  const correct = int(q.correct, -1);
  if (options.length < 2 || correct < 0 || correct >= options.length) return null;
  return { options, correct };
}

// Topological order: prerequisites before the concepts that need them (cycles are broken, not fatal).
function learningPath(concepts, preferred) {
  const byId = Object.fromEntries(concepts.map((c) => [c.id, c]));
  const out = [], seen = new Set();
  const visit = (id, stack) => {
    if (seen.has(id) || !byId[id] || stack.has(id)) return;
    stack.add(id);
    byId[id].prerequisites.forEach((p) => visit(p, stack));
    stack.delete(id);
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  };
  [...arr(preferred), ...concepts.map((c) => c.id)].forEach((id) => visit(id, new Set()));
  return out;
}

// Returns { name, description, knowledge, notes } where notes lists what was repaired or dropped.
// `base` (optional): the course this part will be added to, so references to its concepts, topics and patterns resolve.
export function cleanPack(input, base = null) {
  if (!input || typeof input !== "object") throw new Error("That isn't a course file.");
  const kn0 = input.knowledge && typeof input.knowledge === "object" ? input.knowledge : input;
  if (!base && (!Array.isArray(kn0.concepts) || !kn0.concepts.length)) {
    throw new Error("No concepts found. The JSON needs a \"knowledge\" object with a \"concepts\" list; ask the AI to follow the format exactly.");
  }
  const notes = [];
  const reserved = (k) => new Set(base ? arr(base[k]).map((x) => x.id) : []);
  const resT = reserved("topics"), resC = reserved("concepts"), resP = reserved("patterns"), resQ = reserved("mcqs"), resPr = reserved("problems");
  const note = (n, what) => { if (n > 0) notes.push(`${n} ${what}`); };

  // topics
  const topicIds = new Map(), usedT = new Set();
  const baseTopics = base ? arr(base.topics) : [];
  baseTopics.forEach((t) => { topicIds.set(t.id, t.id); topicIds.set(t.name, t.id); });
  const topics = arr(kn0.topics).filter((t) => t && (t.name || t.id)).map((t) => {
    const id = uniqueId(t.id, t.name, "t", usedT, resT);
    topicIds.set(id, id);
    if (t.id) topicIds.set(String(t.id), id);
    if (t.name) topicIds.set(String(t.name), id);
    return { id, name: str(t.name || t.id), summary: str(t.summary) };
  });

  // concepts: ids first, so prerequisites can be remapped
  const conceptIds = new Map(), usedC = new Set();
  if (base) arr(base.concepts).forEach((c) => { conceptIds.set(c.id, c.id); conceptIds.set(c.name, c.id); });
  const rawConcepts = arr(kn0.concepts).filter((c) => c && (c.name || c.id));
  const ids = rawConcepts.map((c) => {
    const id = uniqueId(c.id, c.name, "c", usedC, resC);
    if (c.id) conceptIds.set(String(c.id), id);
    if (c.name) conceptIds.set(String(c.name), id);
    return id;
  });
  const mapC = (xs) => [...new Set(arr(xs).map((x) => conceptIds.get(String(x))).filter(Boolean))];
  let missingTopic = 0, noDetail = 0;
  const concepts = rawConcepts.map((c, i) => {
    let topic_id = (topics.find((t) => t.id === topicIds.get(String(c.topic_id)) || t.name === c.topic_id) || {}).id || topicIds.get(String(c.topic_id));
    if (!topic_id) {
      missingTopic++;
      if (!topics.find((t) => t.id === "t-general")) topics.push({ id: "t-general", name: "General", summary: "" });
      topic_id = "t-general";
    }
    const detail = cleanDetail(c.detail);
    if (!detail) noDetail++;
    return {
      id: ids[i], name: str(c.name || c.id), topic_id, one_liner: str(c.one_liner),
      prerequisites: mapC(c.prerequisites).filter((x) => x !== ids[i]), related: mapC(c.related).filter((x) => x !== ids[i]),
      importance: ["core", "supporting", "peripheral"].includes(c.importance) ? c.importance : "core",
      source_refs: strs(c.source_refs), exam_frequency: 0, detail,
    };
  });
  note(missingTopic, "concept(s) without a known topic were put under General");
  note(noDetail, "concept(s) have no full breakdown yet");
  const known = new Set(concepts.map((c) => c.id));

  // patterns
  const patternIds = new Map(), usedP = new Set();
  const basePatterns = base ? arr(base.patterns) : [];
  basePatterns.forEach((p) => patternIds.set(p.id, p.id));
  const patterns = arr(kn0.patterns).filter((p) => p && (p.name || p.id)).map((p) => {
    const id = uniqueId(p.id, p.name, "p", usedP, resP);
    if (p.id) patternIds.set(String(p.id), id);
    const g = p.guide && typeof p.guide === "object" ? p.guide : null;
    return {
      id, name: str(p.name || p.id), description: str(p.description), calc: p.calc !== false,
      concept_ids: mapC(p.concept_ids), frequency: 0,
      source_questions: arr(p.source_questions).filter((q) => q && q.text_md).map((q, k) => ({
        material_id: str(q.material_id) || "paper", number: str(q.number) || String(k + 1), text_md: str(q.text_md),
        marks: str(q.marks), solution_md: str(q.solution_md), material_label: str(q.material_label || q.material_id),
        is_exam: q.is_exam !== false,
      })),
      guide: g ? {
        recognition_cues: strs(g.recognition_cues),
        recipe: arr(g.recipe).map((r) => (typeof r === "string" ? { step_md: r, why_md: "", everyday_link: "" }
          : { step_md: str(r && r.step_md), why_md: str(r && r.why_md), everyday_link: str(r && r.everyday_link) })).filter((r) => r.step_md),
        tricks: strs(g.tricks), traps: strs(g.traps), examiner_wants_md: str(g.examiner_wants_md),
      } : null,
    };
  });

  // MCQs
  const usedQ = new Set();
  let badMcq = 0;
  const mcqs = arr(kn0.mcqs).map((q) => {
    const ok = q && cleanChoiceQuestion(q);
    const cids = q ? mapC(q.concept_ids) : [];
    if (!ok || !cids.length) { badMcq++; return null; }
    const expl = strs(q.option_explanations).slice(0, ok.options.length);
    while (expl.length < ok.options.length) expl.push("");
    return { id: uniqueId(q.id, "", "q", usedQ, resQ), concept_ids: cids, type: MCQ_TYPES.includes(q.type) ? q.type : "application",
      question_md: str(q.question_md), ...ok, option_explanations: expl, solution_md: str(q.solution_md), difficulty: Math.min(3, Math.max(1, int(q.difficulty, 2))),
      ...svgField(q.figure_svg) };
  }).filter(Boolean);
  note(badMcq, "broken quiz question(s) were left out");

  // guided discovery chains
  const guided = {};
  let badGuided = 0;
  for (const [k, steps] of Object.entries(kn0.guided && typeof kn0.guided === "object" ? kn0.guided : {})) {
    const cid = conceptIds.get(String(k));
    if (!cid) { badGuided++; continue; }
    const good = arr(steps).map((s) => {
      const ok = s && cleanChoiceQuestion(s);
      return ok ? { question_md: str(s.question_md), ...ok, explanation_md: str(s.explanation_md) } : null;
    }).filter(Boolean);
    if (good.length) guided[cid] = good;
  }
  note(badGuided, "discovery chain(s) for unknown concepts were left out");

  // problems
  const usedPr = new Set();
  let badProblem = 0;
  const problems = arr(kn0.problems).map((p) => {
    const pattern_id = p && patternIds.get(String(p.pattern_id));
    if (!pattern_id) { badProblem++; return null; }
    const pattern = patterns.find((x) => x.id === pattern_id) || basePatterns.find((x) => x.id === pattern_id);
    const id = uniqueId(p.id, p.title, "pr", usedPr, resPr);
    const parts = arr(p.parts).map((part, pi) => ({
      label: str(part && part.label), prompt_md: str(part && part.prompt_md), marks: str(part && part.marks),
      final_answer_md: str(part && part.final_answer_md),
      steps: arr(part && part.steps).map((s, si) => {
        s = s || {};
        let at = ["numeric", "choice", "multi", "text"].includes(s.answer_type) ? s.answer_type : "text";
        const choices = strs(s.choices);
        let correct = arr(s.correct_choices).map((x) => int(x, -1)).filter((x) => x >= 0 && x < choices.length);
        const num = Number(s.numeric_answer);
        let textAns = str(s.text_answer_md);
        if ((at === "choice" || at === "multi") && (choices.length < 2 || !correct.length)) { at = "text"; textAns = textAns || str(s.explanation_md); }
        if (at === "numeric" && !Number.isFinite(num)) { at = "text"; textAns = textAns || str(s.numeric_answer) || str(s.explanation_md); }
        if (at === "choice") correct = correct.slice(0, 1);
        const cids = mapC(s.concept_ids);
        return {
          id: str(s.id).trim() || `${id}-${pi}-${si}`, kind: STEP_KINDS.includes(s.kind) ? s.kind : "compute", prompt_md: str(s.prompt_md), answer_type: at,
          choices: at === "choice" || at === "multi" ? choices : [], correct_choices: at === "choice" || at === "multi" ? correct : [],
          numeric_answer: at === "numeric" ? num : null,
          tolerance_pct: at === "numeric" ? Math.max(0.1, Number(s.tolerance_pct) || 1) : null,
          unit: str(s.unit), text_answer_md: textAns, hint_md: str(s.hint_md), explanation_md: str(s.explanation_md),
          concept_ids: cids.length ? cids : pattern.concept_ids.slice(0, 3), ...svgField(s.figure_svg),
        };
      }).filter((s) => s.prompt_md.trim()),
    })).filter((part) => part.steps.length);
    if (!parts.length) { badProblem++; return null; }
    return { id, pattern_id, source: p.source === "past_paper" ? "past_paper" : "variant", source_ref: str(p.source_ref),
      title: str(p.title) || pattern.name, statement_md: str(p.statement_md), parts,
      verified: typeof p.verified === "boolean" ? p.verified : null, verify_note: str(p.verify_note) };
  }).filter(Boolean);
  note(badProblem, "exam problem(s) without a known pattern or usable steps were left out");

  // derived fields, as packkit.finalize does
  for (const p of patterns) p.frequency = p.source_questions.filter((q) => q.is_exam).length || problems.filter((x) => x.pattern_id === p.id).length;
  for (const c of concepts) {
    c.exam_frequency = patterns.filter((p) => p.concept_ids.includes(c.id)).reduce((n, p) => n + p.source_questions.filter((q) => q.is_exam).length, 0);
  }
  patterns.sort((a, b) => b.frequency - a.frequency);

  const course = kn0.course && typeof kn0.course === "object" ? kn0.course : {};
  const knowledge = {
    version: 1, course: { title: str(course.title || input.name), overview_md: str(course.overview_md) },
    topics: topics.filter((t) => concepts.some((c) => c.topic_id === t.id)), concepts, patterns, mcqs, guided, problems,
    learning_path: learningPath(concepts, mapC(kn0.learning_path)), uncovered_questions: arr(kn0.uncovered_questions),
    generated_at: kn0.generated_at || Date.now() / 1000, model: str(kn0.model) || null,
  };
  return { name: str(input.name || course.title) || "My course", description: str(input.description), knowledge, notes };
}

// Add a second part (another topic, more questions) to a course. Items with an id that already exists are replaced.
export function mergeKnowledge(base, add) {
  const by = (xs) => new Map(xs.map((x) => [x.id, x]));
  const out = { ...base };
  for (const k of ["topics", "concepts", "patterns", "mcqs", "problems"]) {
    const m = by(base[k] || []);
    (add[k] || []).forEach((x) => m.set(x.id, x));
    out[k] = [...m.values()];
  }
  out.guided = { ...(base.guided || {}), ...(add.guided || {}) };
  out.course = { title: base.course.title || add.course.title, overview_md: base.course.overview_md || add.course.overview_md };
  out.learning_path = learningPath(out.concepts, [...(base.learning_path || []), ...(add.learning_path || [])]);
  out.generated_at = Date.now() / 1000;
  return out;
}
