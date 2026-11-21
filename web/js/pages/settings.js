import { html, useState, useEffect, api, loadHealth, Spinner, IS_STATIC, REPO_URL, THEMES, currentTheme, setTheme } from "../lib.js";

const BLANK = { preset: "anthropic", label: "", base_url: "", model: "", api_key: "", pdf_mode: "auto",
  reasoning: false, max_output_tokens: 0, concurrency: 0, price_in: 0, price_out: 0 };

export function ThemePicker() {
  const [theme, setThemeState] = useState(currentTheme());
  const pick = (id) => { setTheme(id); setThemeState(id); };
  return html`<section class="card" aria-label="Appearance">
    <h3>Appearance</h3>
    <p class="muted small mb-0">Pick a colour theme. It's saved in this browser.</p>
    <div class="theme-grid">
      ${THEMES.map((t) => html`<button type="button" class="theme-swatch" aria-pressed=${theme === t.id ? "true" : "false"} onClick=${() => pick(t.id)}>
        <span class="preview" style=${`background:${t.bg}`}>${t.swatch.map((c) => html`<i style=${`background:${c}`}></i>`)}</span>
        <span class="name">${t.name}${theme === t.id ? " ✓" : ""}</span>
        <span class="desc">${t.desc}</span>
      </button>`)}
    </div>
  </section>`;
}

export function SettingsPage() {
  if (IS_STATIC) return html`<${WebsiteSettings} />`; // constant per page load, so hook order is stable
  return html`<${AppSettings} />`;
}

function WebsiteSettings() {
  return html`
    <h1>Settings</h1>
    <${ThemePicker} />
    <div class="card">
      <h3>Website mode</h3>
      <ul class="md small">
        <li>Everything for studying works here: concept breakdowns, knowledge map, exam patterns, quizzes, map drills, the step-by-step solver and progress.</li>
        <li>Courses and progress are stored in <b>this browser on this device</b>. They are not uploaded to GitHub and don't sync between devices;
          use <b>Course file → Download course file</b> and <b>Progress backup</b> to move or protect them.</li>
        <li>Courses come from your own AI chat (ChatGPT, Claude, Gemini…): copy the prompt on the home page, give it your files, paste the reply.
          The website never calls an AI itself and needs no key.</li>
        <li>Written answers are marked by comparing with the model answer. For more questions or a simpler explanation, ask the AI you built
          the course with, in the same JSON format, and add its reply under <b>Course file → Add more with your AI</b>.</li>
      </ul>
      <p class="small">Source code and the optional computer app: <a href=${REPO_URL} target="_blank" rel="noopener">GitHub</a>.</p>
    </div>`;
}

function AppSettings() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null); // null | form object (with id when editing)
  const [tests, setTests] = useState({});

  const load = () => api("/settings").then(setS).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const after = (next) => { setS(next); loadHealth(); };

  async function setRoles(main, quick) {
    try { after(await api("/settings/roles", { json: { main, quick } })); } catch (e) { setErr(e.message); }
  }
  async function remove(p) {
    if (!confirm(`Remove ${p.label}? Its saved API key is deleted from .env too.`)) return;
    try { after(await api(`/settings/providers/${p.id}`, { method: "DELETE" })); } catch (e) { setErr(e.message); }
  }
  async function test(p) {
    setTests({ ...tests, [p.id]: { running: true } });
    try { const r = await api(`/settings/providers/${p.id}/test`, { method: "POST" }); setTests((t) => ({ ...t, [p.id]: r })); }
    catch (e) { setTests((t) => ({ ...t, [p.id]: { error: e.message } })); }
  }

  if (!s) return html`<h1>Settings</h1>${err ? html`<div class="notice bad">${err}</div>` : html`<${Spinner} />`}`;
  const mainP = s.providers.find((p) => p.id === s.main);

  return html`
    <h1>Settings</h1>
    <${ThemePicker} />
    ${err && html`<div class="notice bad">${err}</div>`}

    <div class=${"notice " + (s.mode === "api" ? "good" : "accent")}>
      ${s.mode === "api"
        ? html`<b>API mode.</b> The app analyzes your materials itself with <b>${mainP.label} · ${mainP.model}</b>.`
        : html`<b>Claude Code mode.</b> No AI provider is active, so Claude Code builds your courses (see below). Add a provider to let the app do it by itself.`}
    </div>

    <div class="card">
      <div class="row between"><h3 class="m-0">AI providers</h3>
        ${!editing && html`<button class="btn primary sm" onClick=${() => setEditing({ ...BLANK })}>+ Add provider</button>`}</div>
      <p class="muted small">Use Claude, or any other AI with an OpenAI-style API (OpenAI, Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together),
        or a free local model through Ollama or LM Studio. Keys are stored only in the <span class="kbd">.env</span> file on this computer
        (git-ignored) and are never shown again or sent anywhere except that provider.</p>

      ${s.providers.length === 0 && !editing && html`<p class="muted">No providers yet.</p>`}
      ${s.providers.map((p) => html`<div class="card flat my-3">
        <div class="row between">
          <div>
            <b>${p.label}</b> <span class="badge">${p.type === "anthropic" ? "Anthropic API" : "OpenAI-compatible"}</span>
            ${s.main === p.id && html` <span class="badge accent">analysis</span>`}
            ${s.quick === p.id && html` <span class="badge accent">quick tasks</span>`}
            <div class="small muted">${p.model || html`<span class="badge warn">no model chosen</span>`}
              ${p.base_url && html` · ${p.base_url}`}
              · ${p.has_key ? `key ${p.key_hint}` : p.needs_key ? html`<span class="badge warn">no key</span>` : "no key needed"}</div>
          </div>
          <div class="row">
            <button class="btn sm" onClick=${() => test(p)} disabled=${!p.ready}>Test</button>
            <button class="btn sm" onClick=${() => setEditing({ ...BLANK, ...p, api_key: "" })}>Edit</button>
            <button class="btn sm ghost danger" onClick=${() => remove(p)}>✕</button>
          </div>
        </div>
        ${tests[p.id] && html`<div class=${"feedback " + (tests[p.id].running ? "info" : tests[p.id].ok ? "good" : "bad")}>
          ${tests[p.id].running ? "Testing…" : tests[p.id].error ? tests[p.id].error
            : tests[p.id].ok ? `✓ Works (${tests[p.id].seconds}s, structured answer received).`
            : `Connected, but the answer was off: ${JSON.stringify(tests[p.id].reply)}`}</div>`}
      </div>`)}

      ${editing && html`<${ProviderForm} s=${s} init=${editing} onCancel=${() => setEditing(null)}
        onSaved=${(next) => { setEditing(null); after(next); }} />`}

      ${s.providers.length > 0 && html`<hr />
        <div class="grid two">
          <div><label class="field">Analysis (reading materials, building courses)</label>
            <select value=${s.main || ""} onChange=${(e) => setRoles(e.target.value || null, s.quick)}>
              <option value="">None: Claude Code builds courses</option>
              ${s.providers.map((p) => html`<option value=${p.id} disabled=${!p.ready}>${p.label}${p.model ? ` · ${p.model}` : ""}${p.ready ? "" : " (not ready)"}</option>`)}
            </select></div>
          <div><label class="field">Quick tasks (marking answers, "break it down further")</label>
            <select value=${s.quick || ""} onChange=${(e) => setRoles(s.main, e.target.value || null)}>
              <option value="">Same as analysis</option>
              ${s.providers.map((p) => html`<option value=${p.id} disabled=${!p.ready}>${p.label}${p.model ? ` · ${p.model}` : ""}</option>`)}
            </select></div>
        </div>
        <p class="tiny muted">Tip: a cheaper or local model can handle quick tasks while a strong one builds the course.</p>`}
    </div>

    ${s.mode !== "api" && html`<div class="card section-card how">
      <h3>Claude Code mode: no API key needed</h3>
      <p class="small">Everything works without a provider: concept pages, knowledge map, quizzes, drills, the step-by-step solver and progress.
        Claude Code builds the course content instead:</p>
      <ol class="md small">
        <li>Create a course and upload its files on the Materials page, or drop them into <span class="kbd">${"inbox/<course name>/"}</span> in the project folder.</li>
        <li>In Claude Code, say <span class="kbd">${"Build the Cramtoolfinal pack for <course name>"}</span>.</li>
        <li>Refresh the app when it's done. For more questions or a simpler explanation of something, ask Claude Code too.</li>
      </ol>
      <p class="tiny muted">Hidden in this mode: Analyze, "Break it down further", AI marking of written answers (you mark yourself against the model answer), and generating more questions or problems in the app.</p>
    </div>`}
  `;
}

function ProviderForm({ s, init, onCancel, onSaved }) {
  const [f, setF] = useState(() => {
    if (init.id) return { ...init };
    const pr = s.presets.find((p) => p.preset === init.preset);
    return { ...init, label: pr.label, base_url: pr.base_url, model: pr.model || "" };
  });
  const [models, setModels] = useState(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const preset = s.presets.find((p) => p.preset === f.preset) || s.presets[0];
  const isAnthropic = preset.type === "anthropic";
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  function choosePreset(e) {
    const pr = s.presets.find((p) => p.preset === e.target.value);
    setF({ ...f, preset: pr.preset, label: pr.label, base_url: pr.base_url, model: pr.model || "" });
    setModels(null);
  }
  async function loadModels() {
    setLoadingModels(true); setErr("");
    try {
      const body = f.id ? { id: f.id, api_key: f.api_key } : { ...f };
      const r = await api("/settings/models", { json: body });
      setModels(r.models);
    } catch (e) { setErr(e.message); } finally { setLoadingModels(false); }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const body = { ...f };
      ["max_output_tokens", "concurrency", "price_in", "price_out"].forEach((k) => { body[k] = Number(body[k]) || 0; });
      if (!body.api_key) delete body.api_key; // keep the stored key when editing
      const r = await api("/settings/providers", { json: body });
      onSaved(r.settings);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return html`<form class="card flat mt-3" style="border-color:var(--accent)" onSubmit=${save}>
    <h3>${f.id ? `Edit ${f.label}` : "Add a provider"}</h3>
    <div class="stack">
      ${!f.id && html`<div><label class="field">Provider</label>
        <select value=${f.preset} onChange=${choosePreset}>${s.presets.map((p) => html`<option value=${p.preset}>${p.label}</option>`)}</select></div>`}
      ${preset.note && html`<div class="small muted">${preset.note}</div>`}
      <div class="grid two">
        <div><label class="field">Name</label><input type="text" value=${f.label} onInput=${set("label")} /></div>
        ${!isAnthropic && html`<div><label class="field">API base URL</label>
          <input type="text" placeholder="https://…/v1" value=${f.base_url} onInput=${set("base_url")} /></div>`}
      </div>
      <div><label class="field">API key ${preset.needs_key ? "" : html`<span class="muted">(optional for local models)</span>`}</label>
        <input type="password" autocomplete="off" value=${f.api_key}
          placeholder=${f.id ? (f.has_key ? `saved (${f.key_hint}); leave blank to keep` : "paste key") : "paste key"} onInput=${set("api_key")} /></div>
      <div><label class="field">Model</label>
        <div class="row">
          <input type="text" style="flex:1" list="model-list" placeholder="model id, e.g. from Load models" value=${f.model} onInput=${set("model")} />
          <button type="button" class="btn sm" onClick=${loadModels} disabled=${loadingModels}>${loadingModels ? "Loading…" : "Load models"}</button>
        </div>
        ${models && html`<datalist id="model-list">${models.map((m) => html`<option value=${m} />`)}</datalist>
          <div class="tiny muted">${models.length} models found. Start typing to pick one.</div>`}
      </div>
      <details><summary class="small">Advanced</summary>
        <div class="grid two mt-2">
          ${!isAnthropic && html`<div><label class="field">How to read PDFs</label>
            <select value=${f.pdf_mode} onChange=${set("pdf_mode")}>
              <option value="auto">Text, plus images of scanned pages (vision models)</option>
              <option value="images">Every page as an image (best for maths; vision models)</option>
              <option value="text">Text only (text-only models)</option>
            </select></div>`}
          ${!isAnthropic && html`<label class="check small"><input type="checkbox" checked=${f.reasoning} onChange=${set("reasoning")} />
            Reasoning model (send reasoning effort)</label>`}
          ${!isAnthropic && html`<div><label class="field">Max output tokens (0 = provider default)</label>
            <input type="number" min="0" value=${f.max_output_tokens} onInput=${set("max_output_tokens")} /></div>`}
          <div><label class="field">Parallel calls during analysis (0 = default)</label>
            <input type="number" min="0" max="16" value=${f.concurrency} onInput=${set("concurrency")} /></div>
          <div><label class="field">Price, USD per million input tokens</label>
            <input type="number" min="0" step="0.01" value=${f.price_in} onInput=${set("price_in")} /></div>
          <div><label class="field">Price, USD per million output tokens</label>
            <input type="number" min="0" step="0.01" value=${f.price_out} onInput=${set("price_out")} /></div>
        </div>
        <p class="tiny muted">Prices only feed the cost meter on the Materials page.${isAnthropic ? " Claude Opus 5.5 prices are built in." : ""}</p>
      </details>
      ${err && html`<div class="notice bad small">${err}</div>`}
      <div class="row">
        <button class="btn primary" disabled=${busy}>${busy ? "Saving…" : "Save"}</button>
        <button type="button" class="btn ghost" onClick=${onCancel}>Cancel</button>
      </div>
      ${!isAnthropic && html`<p class="tiny muted">Cramtoolfinal's prompts are tuned for Claude. Other models work, but the quality of breakdowns and
        the accuracy of generated problems vary; keep "Verify generated problems" on and use Test after saving.</p>`}
    </div>
  </form>`;
}
