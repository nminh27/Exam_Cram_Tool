import { html, useState, api, loadHealth, useStore } from "../lib.js";

export function SettingsPage() {
  const store = useStore();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState(null);
  const h = store.health;

  async function save(e) {
    e.preventDefault();
    try {
      await api("/settings/api-key", { json: { key } });
      setKey("");
      setMsg({ ok: true, text: "Saved to .env on this computer." });
      loadHealth();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  }

  return html`
    <h1>Settings</h1>
    <div class="card">
      <h3>Anthropic API key</h3>
      <p class="muted small">FinalForge uses Claude to read your materials and build the knowledge base.
        The key is stored only in the <span class="kbd">.env</span> file in the project folder (git-ignored) and never sent anywhere except the Anthropic API.
        Get one at console.anthropic.com.</p>
      <p>Status: ${h ? (h.api_key_configured ? html`<span class="badge good">configured</span>` : html`<span class="badge warn">missing</span>`) : "…"}</p>
      <form class="row" onSubmit=${save}>
        <input type="password" style="max-width:420px" placeholder="sk-ant-…" value=${key} onInput=${(e) => setKey(e.target.value)} autocomplete="off" />
        <button class="btn primary" disabled=${!key.trim()}>Save key</button>
      </form>
      ${msg && html`<div class=${"notice " + (msg.ok ? "good" : "bad")} style="margin-top:12px">${msg.text}</div>`}
    </div>
    <div class="card">
      <h3>Model</h3>
      <p>${h ? html`<span class="kbd">${h.model}</span>` : "…"}
        ${h && h.fallbacks && html` <span class="badge">refusal fallback on</span>`}</p>
      <p class="muted small">Change with <span class="kbd">FINALFORGE_MODEL</span> in <span class="kbd">.env</span>.
        Other knobs: <span class="kbd">FINALFORGE_CONCURRENCY</span>, <span class="kbd">FINALFORGE_EFFORT_EXTRACT</span>,
        <span class="kbd">FINALFORGE_FALLBACKS=0</span>. Restart the server after editing .env.</p>
    </div>
  `;
}
