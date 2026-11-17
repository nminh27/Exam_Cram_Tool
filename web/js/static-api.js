// Website mode (GitHub Pages): no server. This module answers the same /api paths the app uses,
// keeping courses and progress in this browser's IndexedDB. Only studying and practising work here;
// building courses (uploads, AI analysis) happens in the app on your computer or with Claude Code.

const DB_NAME = "finalforge";
const STORE = "kv";
let dbPromise = null;
const memory = new Map(); // fallback when IndexedDB is unavailable (some private windows)

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Browser storage is full or blocked."));
  });
}

const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

async function get(key) {
  return tx("readonly", (s) => (s ? req(s.get(key)) : memory.get(key)));
}
async function put(key, value) {
  return tx("readwrite", (s) => (s ? req(s.put(value, key)) : memory.set(key, value)));
}
async function del(key) {
  return tx("readwrite", (s) => (s ? req(s.delete(key)) : memory.delete(key)));
}
async function keys() {
  return tx("readonly", (s) => (s ? req(s.getAllKeys()) : [...memory.keys()]));
}

export async function storageInfo() {
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  return { indexedDb: !!(await openDb()), persisted, usage: est ? est.usage : null };
}

export async function askPersistence() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; }
  catch (_) { return false; }
}

// ------------------------------------------------------------------ helpers

const slugify = (s) => (String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "course");
const rand = () => Math.random().toString(16).slice(2, 6);

function stats(kn) {
  return { concepts: (kn.concepts || []).length, patterns: (kn.patterns || []).length,
    mcqs: (kn.mcqs || []).length, problems: (kn.problems || []).length };
}

function normalizeKnowledge(kn) {
  const out = {
    version: 1, course: { title: "", overview_md: "" }, topics: [], concepts: [], patterns: [], mcqs: [],
    guided: {}, problems: [], learning_path: [], uncovered_questions: [], generated_at: null, model: null, ...kn,
  };
  for (const k of ["topics", "concepts", "patterns", "mcqs", "problems", "learning_path", "uncovered_questions"]) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  if (!out.guided || typeof out.guided !== "object") out.guided = {};
  if (!out.learning_path.length) out.learning_path = out.concepts.map((c) => c.id);
  return out;
}

function checkPack(pack) {
  if (!pack || pack.format !== "finalforge-pack" || !pack.knowledge) {
    throw new Error("That file isn't a FinalForge knowledge pack (export one from Materials in the app).");
  }
  const kn = pack.knowledge;
  const bad = (kn.mcqs || []).filter((q) => !Array.isArray(q.options) || !(q.correct >= 0 && q.correct < q.options.length));
  if (bad.length) throw new Error(`The pack has ${bad.length} broken question(s); rebuild it and export again.`);
  return normalizeKnowledge(kn);
}

async function readJsonBody(opts) {
  if (opts.json !== undefined) return opts.json;
  const f = opts.body && opts.body.get ? opts.body.get("file") : null;
  if (!f) throw new Error("No file chosen.");
  try { return JSON.parse(await f.text()); } catch (_) { throw new Error("Could not read that file as JSON."); }
}

async function importPack(pack) {
  const kn = checkPack(pack);
  const name = pack.name || kn.course.title || "Imported course";
  const meta = { id: `${slugify(name)}-${rand()}`, name, description: pack.description || "", created_at: Date.now() / 1000, materials: [] };
  await put(`course:${meta.id}`, meta);
  await put(`kn:${meta.id}`, kn);
  await put(`progress:${meta.id}`, { events: [] });
  return meta;
}

async function courseMeta(id) {
  const meta = await get(`course:${id}`);
  if (!meta) throw new Error("Course not found in this browser.");
  return meta;
}

const NOT_HERE = "This needs the FinalForge app on your computer. The website can only study and practise courses you import.";

// ------------------------------------------------------------------ the fake API

export async function staticApi(path, opts = {}) {
  const method = (opts.method || (opts.json !== undefined ? "POST" : "GET")).toUpperCase();
  let m;

  if (path === "/health") {
    return { ok: true, mode: "static", static: true, ai_available: false, api_key_configured: false, provider: null, model: null };
  }
  if (path === "/courses" && method === "GET") {
    const ks = (await keys()).filter((k) => String(k).startsWith("course:"));
    const out = [];
    for (const k of ks) {
      const meta = await get(k);
      const kn = (await get(`kn:${meta.id}`)) || {};
      out.push({ ...meta, stats: stats(kn) });
    }
    return out.sort((a, b) => b.created_at - a.created_at);
  }
  if (path === "/demo" && method === "POST") {
    const r = await fetch("demo_pack.json");
    if (!r.ok) throw new Error("Could not load the demo course.");
    return importPack(await r.json());
  }
  if (path === "/import" && method === "POST") return importPack(await readJsonBody(opts));

  if ((m = path.match(/^\/courses\/([^/]+)$/))) {
    const id = decodeURIComponent(m[1]);
    if (method === "DELETE") {
      await courseMeta(id);
      await del(`course:${id}`); await del(`kn:${id}`); await del(`progress:${id}`);
      return { deleted: id };
    }
    const meta = await courseMeta(id);
    const kn = (await get(`kn:${id}`)) || {};
    return { ...meta, stats: stats(kn), job: null, analyzed_at: kn.generated_at || null };
  }
  if ((m = path.match(/^\/courses\/([^/]+)\/knowledge$/))) {
    const id = decodeURIComponent(m[1]);
    await courseMeta(id);
    return normalizeKnowledge((await get(`kn:${id}`)) || {});
  }
  if ((m = path.match(/^\/courses\/([^/]+)\/replace$/)) && method === "POST") {
    // Swap in a newer pack for the same course; progress is kept (ids normally stay the same).
    const id = decodeURIComponent(m[1]);
    const meta = await courseMeta(id);
    const pack = await readJsonBody(opts);
    await put(`kn:${id}`, checkPack(pack));
    if (pack.name && pack.name !== meta.name) await put(`course:${id}`, { ...meta, name: pack.name });
    return { replaced: id };
  }
  if ((m = path.match(/^\/courses\/([^/]+)\/progress$/))) {
    const id = decodeURIComponent(m[1]);
    await courseMeta(id);
    const key = `progress:${id}`;
    if (method === "GET") return (await get(key)) || { events: [] };
    if (method === "DELETE") { await put(key, { events: [] }); return { reset: true }; }
    const body = opts.json || {};
    if (body.replace) { await put(key, { events: body.events || [] }); return { count: (body.events || []).length }; }
    const prog = (await get(key)) || { events: [] };
    const allowed = ["ts", "kind", "item_id", "concept_ids", "pattern_id", "result", "score", "meta"];
    for (const e of body.events || []) {
      const clean = {};
      allowed.forEach((k) => { if (k in e) clean[k] = e[k]; });
      clean.ts = clean.ts || Date.now() / 1000;
      prog.events.push(clean);
    }
    await put(key, prog);
    return { count: prog.events.length };
  }
  if ((m = path.match(/^\/courses\/([^/]+)\/export$/))) {
    const id = decodeURIComponent(m[1]);
    const meta = await courseMeta(id);
    return { format: "finalforge-pack", version: 1, name: meta.name, description: meta.description || "",
      knowledge: normalizeKnowledge((await get(`kn:${id}`)) || {}) };
  }
  if (path.match(/^\/courses\/[^/]+\/job$/)) return {};
  throw new Error(NOT_HERE);
}
