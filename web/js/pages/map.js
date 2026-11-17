import { html, useState, useEffect, useRef, STATUS_LABEL, pct } from "../lib.js";

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// Layered layout: a concept sits one row below its deepest prerequisite, so every arrow points
// downwards. Within a row, concepts are ordered by the average position of their prerequisites.
function layeredPositions(concepts) {
  const byId = Object.fromEntries(concepts.map((c) => [c.id, c]));
  const level = {};
  const depth = (id, seen = new Set()) => {
    if (level[id] !== undefined) return level[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const ps = byId[id].prerequisites.filter((p) => byId[p]);
    level[id] = ps.length ? 1 + Math.max(...ps.map((p) => depth(p, seen))) : 0;
    return level[id];
  };
  concepts.forEach((c) => depth(c.id));
  const rows = [];
  concepts.forEach((c) => (rows[level[c.id]] ||= []).push(c.id));
  const x = {};
  const pos = {};
  const W = 200, H = 120;
  rows.forEach((row, r) => {
    if (r > 0) {
      const bary = (id) => { const ps = byId[id].prerequisites.filter((p) => x[p] !== undefined); return ps.length ? ps.reduce((a, p) => a + x[p], 0) / ps.length : 0; };
      row.sort((a, b) => bary(a) - bary(b));
    }
    row.forEach((id, i) => { x[id] = (i - (row.length - 1) / 2) * W; pos[id] = { x: x[id], y: r * H }; });
  });
  return pos;
}

export function MapPage({ cid, d }) {
  const { kn, mastery } = d;
  const ref = useRef();
  const cyRef = useRef();
  const [sel, setSel] = useState(null);
  const [layout, setLayout] = useState("flow");
  const [showRelated, setShowRelated] = useState(false);

  useEffect(() => {
    if (!ref.current || !kn.concepts.length || !window.cytoscape) return undefined;
    const statusColor = { unseen: cssVar("--unseen"), weak: cssVar("--bad"), shaky: cssVar("--warn"), solid: cssVar("--good") };
    const ids = new Set(kn.concepts.map((c) => c.id));
    const els = [];
    if (layout === "topics") {
      kn.topics.forEach((t) => els.push({ data: { id: t.id, label: t.name }, classes: "topic" }));
    }
    kn.concepts.forEach((c) => {
      const st = mastery.concepts[c.id].status;
      els.push({
        data: {
          id: c.id, label: c.name, color: statusColor[st], weight: c.importance === "core" ? 700 : 400,
          parent: layout === "topics" && kn.topics.some((t) => t.id === c.topic_id) ? c.topic_id : undefined,
        },
        classes: c.importance,
      });
      c.prerequisites.forEach((p) => ids.has(p) && els.push({ data: { id: `${p}->${c.id}`, source: p, target: c.id }, classes: "prereq" }));
      if (showRelated) c.related.forEach((r) => ids.has(r) && c.id < r && els.push({ data: { id: `${c.id}~${r}`, source: c.id, target: r }, classes: "related" }));
    });

    const cy = window.cytoscape({
      container: ref.current,
      elements: els,
      wheelSensitivity: 0.25,
      style: [
        { selector: "node", style: {
          shape: "round-rectangle", label: "data(label)", "text-wrap": "wrap", "text-max-width": "130px",
          "font-size": "12px", "font-weight": "data(weight)", color: cssVar("--text"), "text-valign": "center", "text-halign": "center",
          "background-color": cssVar("--panel"), "border-width": 3, "border-color": "data(color)",
          width: "label", height: "label", padding: "10px" } },
        { selector: "node.core", style: { "border-width": 4 } },
        { selector: "node.peripheral", style: { "border-style": "dashed" } },
        { selector: "node.topic", style: {
          shape: "round-rectangle", "background-color": cssVar("--panel-2"), "background-opacity": 0.6, "border-width": 1,
          "border-color": cssVar("--border"), label: "data(label)", "text-valign": "top", "text-halign": "center",
          "font-size": "14px", "font-weight": 700, color: cssVar("--muted"), padding: "18px" } },
        { selector: "edge.prereq", style: {
          width: 2, "line-color": cssVar("--border"), "target-arrow-color": cssVar("--muted"),
          "target-arrow-shape": "triangle", "curve-style": "bezier", "arrow-scale": 1.1 } },
        { selector: "edge.related", style: { width: 1.5, "line-style": "dashed", "line-color": cssVar("--accent"), "curve-style": "bezier", opacity: 0.6 } },
        { selector: ".faded", style: { opacity: 0.15 } },
        { selector: "node:selected", style: { "border-color": cssVar("--accent"), "border-width": 5 } },
      ],
      layout: layout === "topics"
        ? { name: "cose", animate: false, nodeRepulsion: 9000, idealEdgeLength: 90, padding: 30 }
        : { name: "preset", positions: layeredPositions(kn.concepts), padding: 30 },
    });
    cy.on("tap", "node", (e) => {
      const n = e.target;
      if (n.hasClass("topic")) return;
      cy.elements().addClass("faded");
      n.closedNeighborhood().removeClass("faded");
      setSel(n.id());
    });
    cy.on("tap", (e) => { if (e.target === cy) { cy.elements().removeClass("faded"); setSel(null); } });
    cyRef.current = cy;
    return () => cy.destroy();
  }, [kn, layout, showRelated, mastery]);

  if (!kn.concepts.length) return html`<h1>Knowledge map</h1><p class="muted">No concepts yet.</p>`;
  if (!window.cytoscape) return html`<div class="notice bad">The graph library could not load (offline?).</div>`;

  const c = sel && kn.concepts.find((x) => x.id === sel);
  const byId = Object.fromEntries(kn.concepts.map((x) => [x.id, x]));

  return html`
    <div class="row between">
      <div><h1 style="margin-bottom:4px">Knowledge map</h1>
        <div class="muted small">Arrows point from what you must know first to what it unlocks. Click a concept to see its neighbourhood.</div></div>
      <div class="row">
        <select style="width:auto" value=${layout} onChange=${(e) => setLayout(e.target.value)}>
          <option value="flow">Learning flow</option><option value="topics">Grouped by topic</option></select>
        <label class="check small"><input type="checkbox" checked=${showRelated} onChange=${(e) => setShowRelated(e.target.checked)} />Show "related"</label>
        <a class="btn primary" href=${`#/c/${cid}/quiz?mode=map`}>🧩 Map drills</a>
      </div>
    </div>
    <div class="legend" style="margin:10px 0">
      ${Object.entries(STATUS_LABEL).map(([k, v]) => html`<span><span class="dot" style=${`background:var(--${k === "unseen" ? "unseen" : k === "weak" ? "bad" : k === "shaky" ? "warn" : "good"})`}></span>${v}</span>`)}
      <span>thick border = core concept · dashed = peripheral</span>
    </div>
    <div class="map-wrap">
      <div id="cy" ref=${ref}></div>
      ${c && html`<div class="card map-side">
        <h3>${c.name}</h3>
        <p class="small">${c.one_liner}</p>
        <p class="small"><span class="badge">${STATUS_LABEL[mastery.concepts[c.id].status]}</span>
          ${mastery.concepts[c.id].mastery !== null && html` <span class="badge">${pct(mastery.concepts[c.id].mastery)}</span>`}
          ${c.exam_frequency > 0 && html` <span class="badge">${c.exam_frequency}× in exams</span>`}</p>
        ${c.prerequisites.length > 0 && html`<div class="small"><b>Needs first:</b> ${c.prerequisites.map((p) => byId[p] && html`<span class="chip">${byId[p].name}</span>`)}</div>`}
        ${(() => { const u = kn.concepts.filter((x) => x.prerequisites.includes(c.id)); return u.length > 0 && html`<div class="small"><b>Unlocks:</b> ${u.map((x) => html`<span class="chip">${x.name}</span>`)}</div>`; })()}
        ${(() => { const ps = kn.patterns.filter((p) => p.concept_ids.includes(c.id)); return ps.length > 0 && html`<div class="small"><b>Used in exam patterns:</b> ${ps.map((p) => html`<a class="chip" href=${`#/c/${cid}/pattern/${p.id}`}>${p.name}</a>`)}</div>`; })()}
        <div class="row" style="margin-top:10px">
          <a class="btn sm primary" href=${`#/c/${cid}/concept/${c.id}`}>Study</a>
          <a class="btn sm" href=${`#/c/${cid}/quiz?concept=${c.id}`}>Quiz</a>
        </div>
      </div>`}
    </div>`;
}
