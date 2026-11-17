import { html, api, loadCourse, STATUS_LABEL, masteryColor, pct, Progress, timeAgo } from "../lib.js";
import { Ring } from "./dashboard.js";

export function ProgressPage({ cid, d }) {
  const { kn, mastery, progress } = d;
  const events = progress.events;

  async function reset() {
    if (!confirm("Erase all your answers and mastery for this course? This cannot be undone.")) return;
    await api(`/courses/${cid}/progress`, { method: "DELETE" });
    loadCourse(cid, true);
  }

  const days = {};
  events.forEach((e) => { const k = new Date(e.ts * 1000).toISOString().slice(0, 10); days[k] = (days[k] || 0) + 1; });
  const recentDays = Object.entries(days).sort().slice(-14);
  const maxDay = Math.max(1, ...recentDays.map(([, v]) => v));
  const byKind = {};
  events.forEach((e) => { byKind[e.kind] = (byKind[e.kind] || 0) + 1; });

  return html`
    <div class="row between"><h1>Progress</h1><button class="btn sm danger" onClick=${reset}>Reset progress</button></div>
    <div class="grid two">
      <div class="card row gap-5">
        <${Ring} value=${mastery.overall} label="exam readiness" />
        <div class="small stack">
          <div><b>${events.length}</b> answers recorded</div>
          <div class="muted">${Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(" · ") || "none yet"}</div>
          <div class="muted">last activity ${events.length ? timeAgo(events[events.length - 1].ts) : "—"}</div>
        </div>
      </div>
      <div class="card">
        <h3>Last 14 active days</h3>
        ${recentDays.length === 0 ? html`<p class="muted small">No activity yet.</p>` : html`<div class="row gap-2" style="align-items:flex-end;height:110px">
          ${recentDays.map(([day, v]) => html`<div style="flex:1;text-align:center" title=${`${day}: ${v}`}>
            <div style=${`height:${Math.round((80 * v) / maxDay)}px;background:var(--accent);border-radius:4px 4px 0 0`}></div>
            <div class="tiny muted">${day.slice(5)}</div></div>`)}</div>`}
      </div>
    </div>

    <div class="card">
      <h3>Exam patterns</h3>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pattern</th><th>Past-paper weight</th><th>Attempts</th><th style="width:30%">Readiness (last 3)</th></tr></thead><tbody>
        ${kn.patterns.map((p) => { const r = mastery.patterns[p.id]; return html`<tr>
          <td><a href=${`#/c/${cid}/pattern/${p.id}`}>${p.name}</a></td><td>${p.frequency}</td><td>${r.attempts}</td>
          <td><${Progress} value=${r.readiness} color="var(--good)" /><span class="tiny muted">${pct(r.readiness)}</span></td></tr>`; })}
      </tbody></table></div>
    </div>

    ${kn.topics.map((t) => {
      const cs = kn.concepts.filter((c) => c.topic_id === t.id);
      if (!cs.length) return null;
      return html`<div class="card"><h3>${t.name}</h3>
        <div class="tbl-wrap"><table class="tbl"><tbody>${cs.map((c) => { const m = mastery.concepts[c.id]; return html`<tr>
          <td><a href=${`#/c/${cid}/concept/${c.id}`}>${c.name}</a></td>
          <td style="width:120px"><span class="badge" style=${`color:${masteryColor(m.status)}`}>● ${STATUS_LABEL[m.status]}</span></td>
          <td class="small muted" style="width:90px">${m.attempts} answers</td>
          <td style="width:30%"><${Progress} value=${m.mastery || 0} color=${masteryColor(m.status)} /></td></tr>`; })}</tbody></table></div></div>`;
    })}
    <p class="tiny muted">Mastery is a recency-weighted score of your answers on each concept (first-try correct = 1, after a hint = 0.5, revealed = 0).
      "Solid" needs at least 3 answers and ≥ 85%.</p>`;
}
