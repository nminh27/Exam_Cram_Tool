// Shared helpers: Preact re-exports, API client, markdown+math rendering, routing, store, mastery.
export {
  html, render, useState, useEffect, useMemo, useRef, useCallback,
} from "https://unpkg.com/htm@3.1.1/preact/standalone.module.js";
import { html, useState, useEffect, useMemo } from "https://unpkg.com/htm@3.1.1/preact/standalone.module.js";

// ------------------------------------------------------------------ API

export async function api(path, opts = {}) {
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
