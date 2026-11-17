import { html, useState, STATUS_LABEL, masteryColor, pct } from "../lib.js";

export function LearnPage({ cid, d }) {
  const { kn, mastery } = d;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  if (!kn.concepts.length) return html`<h1>Learn</h1><p class="muted">No concepts yet. Analyze your materials first.</p>`;

  const order = kn.learning_path.length ? kn.learning_path : kn.concepts.map((c) => c.id);
  const pos = Object.fromEntries(order.map((id, i) => [id, i]));
  const match = (c) => (!q || (c.name + " " + c.one_liner).toLowerCase().includes(q.toLowerCase()))
    && (status === "all" || mastery.concepts[c.id].status === status);

  // Topics in the order their first concept appears in the learning path.
  const topics = [...kn.topics].sort((a, b) => {
    const fa = Math.min(...kn.concepts.filter((c) => c.topic_id === a.id).map((c) => pos[c.id] ?? 1e9), 1e9);
    const fb = Math.min(...kn.concepts.filter((c) => c.topic_id === b.id).map((c) => pos[c.id] ?? 1e9), 1e9);
    return fa - fb;
  });

  return html`
    <h1>Learn concepts</h1>
    <p class="muted">In recommended order: prerequisites first. Each concept is broken down into why it exists, what it does, how it works, an everyday picture, and the exam cues that call for it.</p>
    <div class="row mb-4">
      <input type="text" style="max-width:300px" placeholder="Search concepts…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <select style="width:auto" value=${status} onChange=${(e) => setStatus(e.target.value)}>
        <option value="all">All</option>
        ${Object.entries(STATUS_LABEL).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
      </select>
    </div>
    ${topics.map((t) => {
      const cs = kn.concepts.filter((c) => c.topic_id === t.id && match(c)).sort((a, b) => (pos[a.id] ?? 1e9) - (pos[b.id] ?? 1e9));
      if (!cs.length) return null;
      return html`<div class="card">
        <h3>${t.name}</h3>
        ${t.summary && html`<p class="muted small lede">${t.summary}</p>`}
        <div class="tbl-wrap"><table class="tbl"><tbody>
          ${cs.map((c) => {
            const m = mastery.concepts[c.id];
            return html`<tr>
              <td style="width:16px"><span class="dot" style=${`background:${masteryColor(m.status)}`} title=${STATUS_LABEL[m.status]}></span></td>
              <td><a href=${`#/c/${cid}/concept/${c.id}`}><b>${c.name}</b></a><div class="small muted">${c.one_liner}</div></td>
              <td class="small">${c.importance === "core" ? html`<span class="badge accent">core</span>` : html`<span class="badge">${c.importance}</span>`}</td>
              <td class="small muted" title="Past-paper questions that need it">${c.exam_frequency ? `${c.exam_frequency}× in exams` : ""}</td>
              <td class="small" style="width:90px">${m.mastery === null ? html`<span class="muted">—</span>` : pct(m.mastery)}</td>
              <td style="width:1%"><a class="btn sm" href=${`#/c/${cid}/quiz?concept=${c.id}`}>Quiz</a></td>
            </tr>`;
          })}
        </tbody></table></div>
      </div>`;
    })}
  `;
}
