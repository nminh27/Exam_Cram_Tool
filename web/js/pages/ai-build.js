// Website mode: build a course with the student's own AI chat. Copy the prompt, give it to ChatGPT / Claude /
// Gemini with the course files, paste the reply back. Used on the home page (new course) and on a course's
// Course file page (add the next part).
import { html, useState, api, go } from "../lib.js";
import { AI_PROMPT, AI_CONTINUE, topicPrompt } from "../ai-prompt.js";
import { extractJson } from "../pack-clean.js";

export function CopyButton({ text, label, primary, disabled }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); }
    catch (_) { // older browsers: copy through a hidden textarea
      const t = document.createElement("textarea");
      t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } finally { t.remove(); }
    }
    setDone(true); setTimeout(() => setDone(false), 2000);
  }
  return html`<button type="button" class=${"btn" + (primary ? " primary" : "")} onClick=${copy} disabled=${disabled}>${done ? "Copied" : label}</button>`;
}

export const AiChats = () => html`<a href="https://chatgpt.com" target="_blank" rel="noopener">ChatGPT</a>${", "}<a href="https://claude.ai" target="_blank" rel="noopener">Claude</a>${" or "}<a href="https://gemini.google.com" target="_blank" rel="noopener">Gemini</a>`;

// mode "new": create a course from the reply. mode "add": add the reply to course `cid` as another part.
export function AiBuilder({ mode = "new", cid, onAdded }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // { id?, notes, msg }
  const [kind, setKind] = useState("files"); // "files": from my course files; "topic": any subject, no files
  const [topic, setTopic] = useState({ subject: "", level: "", goal: "" });
  const prompt = kind === "files" ? AI_PROMPT : topicPrompt(topic);
  const setT = (k) => (e) => setTopic({ ...topic, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(""); setResult(null);
    let pack;
    try { pack = extractJson(text); } catch (e2) { setErr(e2.message); return; }
    setBusy(true);
    try {
      if (mode === "new") {
        const c = await api("/import", { json: pack });
        if (!c.notes || !c.notes.length) { go(`/c/${c.id}`); return; }
        setResult({ id: c.id, notes: c.notes, msg: `${c.name} is ready.` });
      } else {
        const r = await api(`/courses/${cid}/add-part`, { json: pack });
        setResult({ notes: r.notes || [], msg: `Added ${r.added}. The course now has ${r.concepts} concepts.` });
        setText("");
        onAdded && onAdded();
      }
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  const kindBtn = (k, label) => html`<button type="button" class=${"btn sm" + (kind === k ? " primary" : "")}
    aria-pressed=${kind === k} onClick=${() => setKind(k)}>${label}</button>`;
  const needSubject = kind === "topic" && !topic.subject.trim();
  const steps = mode === "new" ? html`
    <div class="row mb-3" role="group" aria-label="What to build from">
      ${kindBtn("files", "From my course files")}${kindBtn("topic", "Any subject, no files")}
    </div>
    ${kind === "topic" && html`<div class="topic-fields mb-3">
      <label class="field" for="topic-subject">What do you want to learn?</label>
      <input id="topic-subject" type="text" placeholder="e.g. Korean for beginners, World War II, music theory, Python"
        value=${topic.subject} onInput=${setT("subject")} />
      <label class="field mt-2" for="topic-level">Your level</label>
      <input id="topic-level" type="text" placeholder="e.g. complete beginner, I know the alphabet, high school"
        value=${topic.level} onInput=${setT("level")} />
      <label class="field mt-2" for="topic-goal">Your goal (optional)</label>
      <input id="topic-goal" type="text" placeholder="e.g. order food in Seoul, pass TOPIK I, ace my history test"
        value=${topic.goal} onInput=${setT("goal")} />
    </div>`}
    <ol class="plan how mb-4">
      <li><span class="plan-n">01</span><div class="plan-body"><div class="plan-name">Copy the course prompt</div>
        <div class="muted small">${kind === "files" ? "It tells your AI exactly what to build and in which format."
          : needSubject ? "Type what you want to learn above first." : "It asks your AI for a full course on your subject, at your level."}</div>
        <div class="row mt-2"><${CopyButton} text=${prompt} label="Copy prompt" primary=${true} disabled=${needSubject} />
          <details class="prompt-peek"><summary class="small">See the prompt</summary><pre class="log">${prompt}</pre></details></div></div></li>
      <li><span class="plan-n">02</span><div class="plan-body">${kind === "files" ? html`<div class="plan-name">Give it to your AI with your files</div>
        <div class="muted small">Open <${AiChats} />. Attach your lecture notes, slides and every past paper (with solutions if you have them), paste the prompt and send.
          A model that can read PDFs and think longer gives better courses.</div>` : html`<div class="plan-name">Give it to your AI</div>
        <div class="muted small">Open <${AiChats} />, paste the prompt and send. No files needed. A model that thinks longer gives better courses.</div>`}</div></li>
      <li><span class="plan-n">03</span><div class="plan-body"><div class="plan-name">Paste the reply here</div>
        <div class="muted small">Copy the AI's whole answer (the code block) and paste it below. Small mistakes are fixed automatically.</div></div></li>
    </ol>` : html`
    <p class="muted small">For a big course, your AI builds it in parts. Ask it to continue, then paste each reply here to add it to this course.</p>
    <div class="row mb-4"><${CopyButton} text=${AI_CONTINUE} label="Copy “continue” message" /></div>`;

  return html`<form onSubmit=${submit}>
    ${steps}
    <label class="field" for=${"ai-reply-" + mode}>${mode === "new" ? "Your AI's reply" : "Next part from your AI"}</label>
    <textarea id=${"ai-reply-" + mode} class="ai-reply" placeholder='\`\`\`json { "format": "finalforge-pack", … } \`\`\`'
      value=${text} onInput=${(e) => setText(e.target.value)} spellcheck="false"></textarea>
    ${err && html`<div class="notice bad small mt-3 mb-0">${err}</div>`}
    ${result && html`<div class="notice good small mt-3 mb-0">${result.msg}
      ${result.notes.length > 0 && html`<div class="mt-1">Notes: ${result.notes.join("; ")}.</div>`}
      ${result.id && html`<div class="mt-2"><a class="btn sm primary" href=${`#/c/${result.id}`}>Open the course</a></div>`}</div>`}
    <div class="row mt-3">
      <button class="btn primary" disabled=${busy || !text.trim()}>${busy ? "Loading…" : mode === "new" ? "Create course" : "Add to this course"}</button>
    </div>
  </form>`;
}
