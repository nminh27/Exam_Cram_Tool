// Shared helpers: Preact re-exports, API client, markdown+math rendering, routing, store, mastery.
export {
  html, render, useState, useEffect, useMemo, useRef, useCallback,
} from "https://unpkg.com/htm@3.1.1/preact/standalone.module.js";
import { html, useState, useEffect, useMemo } from "https://unpkg.com/htm@3.1.1/preact/standalone.module.js";

// ------------------------------------------------------------------ API

// "server" when served by the Cramtoolfinal app; "static" on the GitHub Pages website (set in config.js),
// where a browser-only stand-in answers the API and courses live in this browser's storage.
export const IS_STATIC = window.FINALFORGE_MODE === "static";
export const REPO_URL = "https://github.com/nminh27/Exam_Cram_Tool";

export async function api(path, opts = {}) {
  if (IS_STATIC) return (await import("./static-api.js")).staticApi(path, opts);
  const o = { ...opts };
  if (o.json !== undefined) {
    o.method = o.method || "POST";
    o.headers = { "Content-Type": "application/json" };
    o.body = JSON.stringify(o.json);
    delete o.json;
  }
  const r = await fetch("/api" + path, o);
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = j.detail || msg; } catch (_) { /* not JSON */ }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return r.json();
}

export function downloadJson(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fileSlug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course";

// Download a course's knowledge pack (works in both modes).
export async function exportPack(cid, name) {
  if (!IS_STATIC) { location.href = `/api/courses/${cid}/export`; return; }
  downloadJson(await api(`/courses/${cid}/export`), `${fileSlug(name)}.cramtoolfinal.json`);
}

// ------------------------------------------------------------------ markdown + math

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function mdToHtml(src, inline = false) {
  if (src === null || src === undefined || src === "") return "";
  const math = [];
  const stash = (tex, display) => { math.push({ tex, display }); return `⟦M${math.length - 1}⟧`; };
  let s = String(src).replace(/\\\$/g, "⟦D⟧");
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => stash(t, true));
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => stash(t, true));
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => stash(t, false));
  s = s.replace(/\$([^$\n]+?)\$/g, (_, t) => stash(t, false));
  let h = inline ? window.marked.parseInline(s) : window.marked.parse(s, { gfm: true });
  h = window.DOMPurify.sanitize(h);
  h = h.replace(/⟦M(\d+)⟧/g, (_, i) => {
    const m = math[+i];
    try { return window.katex.renderToString(m.tex, { displayMode: m.display, throwOnError: false }); }
    catch (_) { return esc(m.tex); }
  });
  return h.replace(/⟦D⟧/g, "$");
}

// Course colours follow the home-page list (newest first): violet, magenta, gold, blue, then repeat, so neighbours
// always differ. A course's lesson titles use the colour of its tile in that list.
export function sortCourses(list) {
  return [...(list || [])].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}
export function toneAt(index) {
  return "tone-" + (Math.max(0, index) % 4);
}
export function useCourseTone(cid) {
  const [tone, setTone] = useState("");
  useEffect(() => {
    let live = true;
    api("/courses").then((list) => { if (live) setTone(toneAt(sortCourses(list).findIndex((c) => c.id === cid))); })
      .catch(() => { if (live) setTone(toneAt(0)); });
    return () => { live = false; };
  }, [cid]);
  return tone;
}

// Short labels from a course pack (concept names, one-liners, pattern names, problem titles): plain text,
// unless an AI wrote LaTeX into them, in which case they are rendered like inline Markdown so $k_d$ shows as maths.

export function Tx({ text }) {
  const s = text == null ? "" : String(text);
  return s.includes("$") || s.includes("\\(") ? html`<${Md} text=${s} inline />` : s;
}

// A worked-answer figure (SVG from the course file), shown after a question is checked or revealed.
export function AnswerFigure({ svg }) {
  if (!svg || !String(svg).trim().startsWith("<svg")) return null;
  return html`<div class="diagram answer-fig"><img alt="Figure for this answer" src=${"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)} /></div>`;
}

export function Md({ text, inline, cls }) {
  const h = useMemo(() => mdToHtml(text, inline), [text, inline]);
  return inline
    ? html`<span class=${"md " + (cls || "")} dangerouslySetInnerHTML=${{ __html: h }} />`
    : html`<div class=${"md " + (cls || "")} dangerouslySetInnerHTML=${{ __html: h }} />`;
}

// ------------------------------------------------------------------ routing

export function parseHash(h) {
  const raw = (h || "").replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || "") };
}

export function useRoute() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => { setH(location.hash); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return parseHash(h);
}

export const go = (path) => { location.hash = path; };

// ------------------------------------------------------------------ course store

const store = { data: {}, subs: new Set(), health: null };
const notify = () => store.subs.forEach((f) => f());

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    store.subs.add(f);
    return () => store.subs.delete(f);
  }, []);
  return store;
}

// True when an AI provider is set up (API mode). Features that call the AI live are hidden otherwise
// (the course itself can still be built by Claude Code: see inbox/README.md).
export function useHasKey() {
  const s = useStore();
  return !!(s.health && s.health.ai_available);
}

export async function loadHealth() {
  store.health = await api("/health");
  notify();
  return store.health;
}

export async function loadCourse(cid, force = false) {
  if (!force && store.data[cid] && !store.data[cid].error) return store.data[cid];
  try {
    const [course, kn, progress] = await Promise.all([
      api(`/courses/${cid}`), api(`/courses/${cid}/knowledge`), api(`/courses/${cid}/progress`),
    ]);
    store.data[cid] = { course, kn, progress, mastery: null };
  } catch (e) {
    store.data[cid] = { error: e.message };
  }
  notify();
  return store.data[cid];
}

export function useCourse(cid) {
  useStore();
  useEffect(() => { if (cid) loadCourse(cid); }, [cid]);
  const d = store.data[cid];
  if (d && d.kn && !d.mastery) d.mastery = computeMastery(d.kn, d.progress.events);
  return d;
}

export async function recordEvents(cid, events) {
  const ts = Date.now() / 1000;
  events.forEach((e) => { e.ts = ts; });
  const d = store.data[cid];
  if (d && d.progress) { d.progress.events.push(...events); d.mastery = null; notify(); }
  try { await api(`/courses/${cid}/progress`, { json: { events } }); }
  catch (e) { console.error("Could not save progress", e); }
}

export function invalidate(cid) { delete store.data[cid]; notify(); }

// ------------------------------------------------------------------ mastery model

export function conceptStatus(m, n) {
  if (m === null || m === undefined || n === 0) return "unseen";
  if (m >= 0.85 && n >= 3) return "solid";
  if (m >= 0.6) return "shaky";
  return "weak";
}

export const STATUS_LABEL = { unseen: "Not started", weak: "Weak", shaky: "Getting there", solid: "Solid" };

export function computeMastery(kn, events) {
  const per = {};
  for (const e of events) for (const c of e.concept_ids || []) (per[c] ||= []).push(Number(e.score) || 0);
  const concepts = {};
  for (const c of kn.concepts) {
    const arr = per[c.id] || [];
    const recent = arr.slice(-12);
    let m = null;
    if (recent.length) {
      let w = 0, s = 0;
      recent.forEach((v, i) => { const wt = Math.pow(1.3, i); w += wt; s += wt * v; });
      m = s / w;
    }
    concepts[c.id] = { attempts: arr.length, mastery: m, status: conceptStatus(m, arr.length) };
  }
  const patterns = {};
  for (const p of kn.patterns) {
    const arr = events.filter((e) => e.kind === "problem" && e.pattern_id === p.id).map((e) => Number(e.score) || 0);
    const recent = arr.slice(-3);
    patterns[p.id] = {
      attempts: arr.length,
      readiness: recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0,
      best: arr.length ? Math.max(...arr) : null,
    };
  }
  // Exam readiness: past-paper-frequency-weighted pattern readiness, blended with concept mastery.
  let wsum = 0, rsum = 0;
  for (const p of kn.patterns) { const w = Math.max(1, p.frequency || 0); wsum += w; rsum += w * patterns[p.id].readiness; }
  const patternReadiness = wsum ? rsum / wsum : 0;
  const core = kn.concepts.filter((c) => c.importance === "core");
  const pool = core.length ? core : kn.concepts;
  const conceptReadiness = pool.length ? pool.reduce((a, c) => a + (concepts[c.id].mastery || 0), 0) / pool.length : 0;
  const overall = kn.patterns.length ? 0.65 * patternReadiness + 0.35 * conceptReadiness : conceptReadiness;
  // Per-item last result, for spaced review of MCQs.
  const lastResult = {};
  for (const e of events) if (e.item_id) lastResult[e.item_id] = { score: e.score, ts: e.ts };
  return { concepts, patterns, overall, patternReadiness, conceptReadiness, lastResult };
}

export function masteryColor(status) {
  return { unseen: "var(--unseen)", weak: "var(--bad)", shaky: "var(--warn)", solid: "var(--good)" }[status] || "var(--unseen)";
}

// ------------------------------------------------------------------ small utilities

export function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// Display order for answer options: shuffled once per question so the right answer isn't always in the same
// slot. Two options (Yes/No, True/False) keep their natural order.
export function optionOrder(n) {
  const idx = Array.from({ length: n }, (_, k) => k);
  return n > 2 ? shuffle(idx) : idx;
}

// Colour themes (styles.css). "orb" is the default; the choice is remembered in this browser.
export const THEMES = [
  { id: "orb", name: "Orb", desc: "Glowing violet night (default)", bg: "#0a0420", swatch: ["#5b2bff", "#c800b4", "#ff3d7a", "#ffc46b"] },
  { id: "snow", name: "Snow blue", desc: "Icy white with clear blue", bg: "#f3f7fc", swatch: ["#1d4ed8", "#0e7490", "#4f46e5", "#bfdbfe"] },
  { id: "paper", name: "Paper white", desc: "Plain white, black ink", bg: "#fafaf9", swatch: ["#292524", "#78716c", "#d6d3d1", "#e7e5e4"] },
  { id: "sage", name: "Sage", desc: "Soft green, easy on the eyes", bg: "#f2f5f0", swatch: ["#2d6b55", "#6b7a35", "#d2e0cd", "#9a6a3f"] },
  { id: "midnight", name: "Midnight", desc: "Plain dark blue, no glow", bg: "#0f1420", swatch: ["#2563eb", "#0f766e", "#7c3aed", "#c2410c"] },
];
export function currentTheme() {
  return document.documentElement.dataset.theme || "orb";
}
export function setTheme(id) {
  if (id === "orb") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  try { localStorage.setItem("cramtoolfinal-theme", id); } catch (e) { /* private window: theme lasts this visit only */ }
}

export const pct = (x) => `${Math.round((x || 0) * 100)}%`;

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(ts) {
  if (!ts) return "";
  const s = Date.now() / 1000 - ts;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

// Parse what a student typed into a numeric box: "1.2e3", "1.2×10^3", "1,200", "3/4", "−5 m/s".
export function parseNumber(input) {
  if (input === null || input === undefined) return NaN;
  let s = String(input).trim().replace(/[−–]/g, "-").replace(/\s+/g, "");
  s = s.replace(/(\d),(?=\d{3}(\D|$))/g, "$1");
  s = s.replace(/,/g, ".");
  const sci = s.match(/^([-+]?\d*\.?\d+)(?:[x×*·]10\^?\(?([-+]?\d+)\)?)/i);
  if (sci) return parseFloat(sci[1]) * Math.pow(10, parseInt(sci[2], 10));
  const frac = s.match(/^([-+]?\d*\.?\d+)\/(\d*\.?\d+)/);
  if (frac) return parseFloat(frac[1]) / parseFloat(frac[2]);
  const m = s.match(/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i);
  if (!m) return NaN;
  const v = parseFloat(m[0]);
  return s.slice(m[0].length).startsWith("%") ? v : v;
}

export function numericMatches(input, expected, tolPct) {
  const v = parseNumber(input);
  if (!Number.isFinite(v)) return false;
  const tol = Math.max(0.0001, (tolPct ?? 1) / 100);
  if (expected === 0) return Math.abs(v) <= 1e-9 + tol;
  return Math.abs(v - expected) / Math.abs(expected) <= tol;
}

export function Progress({ value, color }) {
  return html`<div class="bar"><div style=${`width:${Math.round((value || 0) * 100)}%;${color ? `background:${color}` : ""}`}></div></div>`;
}

export function Spinner({ label }) {
  return html`<div class="spinner-row"><span class="spinner"></span>${label || "Loading…"}</div>`;
}

export function Empty({ title, children }) {
  return html`<div class="empty"><h3>${title}</h3>${children}</div>`;
}

// "Quiz me" on a lesson: the lesson's own questions first, then (to reach LESSON_QUIZ_N) questions from the
// lessons it builds on, unlocks or is confused with, then the rest of its topic, then the rest of the course. Returns Map(mcq id -> tier).
export const LESSON_QUIZ_N = 10;
export function lessonQuizTiers(kn, conceptId) {
  const c = kn.concepts.find((x) => x.id === conceptId);
  const tiers = new Map();
  if (!c) return tiers;
  const near = new Set([...(c.prerequisites || []), ...(c.related || []),
    ...kn.concepts.filter((x) => (x.prerequisites || []).includes(c.id)).map((x) => x.id)]);
  near.delete(c.id);
  for (const q of kn.mcqs) {
    const ids = q.concept_ids || [];
    if (ids.includes(c.id)) tiers.set(q.id, 0);
    else if (ids.some((x) => near.has(x))) tiers.set(q.id, 1);
    else if (c.topic_id && ids.some((x) => (kn.concepts.find((k) => k.id === x) || {}).topic_id === c.topic_id)) tiers.set(q.id, 2);
    else tiers.set(q.id, 3);
  }
  return tiers;
}
export function lessonQuizCount(kn, conceptId) {
  return Math.min(LESSON_QUIZ_N, lessonQuizTiers(kn, conceptId).size);
}

// Topics in teaching order (first appearance of their lessons on the learning path), each with its lessons in order,
// its quiz questions and the exam problems whose patterns use its lessons. Used by Practice → Train topic by topic.
export function topicsInOrder(kn) {
  const path = kn.learning_path && kn.learning_path.length ? kn.learning_path : kn.concepts.map((c) => c.id);
  const rank = Object.fromEntries(path.map((id, i) => [id, i]));
  const byTopic = {};
  for (const c of kn.concepts) (byTopic[c.topic_id] ||= []).push(c);
  return kn.topics
    .map((t) => {
      const concepts = (byTopic[t.id] || []).slice().sort((a, b) => (rank[a.id] ?? 1e9) - (rank[b.id] ?? 1e9));
      const ids = new Set(concepts.map((c) => c.id));
      const mcqs = kn.mcqs.filter((q) => (q.concept_ids || []).some((x) => ids.has(x)));
      const pats = new Set(kn.patterns.filter((p) => (p.concept_ids || []).some((x) => ids.has(x))).map((p) => p.id));
      const problems = kn.problems.filter((x) => pats.has(x.pattern_id));
      return { topic: t, concepts, mcqs, problems, first: Math.min(...concepts.map((c) => rank[c.id] ?? 1e9)) };
    })
    .filter((x) => x.concepts.length)
    .sort((a, b) => a.first - b.first);
}
