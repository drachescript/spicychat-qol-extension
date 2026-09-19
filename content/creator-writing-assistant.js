(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const BUTTON_CLASS = "ds-creator-writing-button";
  const MODAL_ID = "ds-creator-writing-modal";
  const STYLE_ID = "ds-creator-writing-style";
  const BROWSER_AI_TIMEOUT_MS = 45000;
  const IS_OPERA = /\bOPR\//i.test(String(navigator.userAgent || ""));
  let activeField = null;
  let activeAiRun = null;

  function clean(value) {
    return String(value || "").replace(/\r\n/g, "\n");
  }

  function isCreatorPage() {
    return /^\/(?:[a-z]{2}\/)?chatbot\/(?:create(?:\/[^/?#]+)?|edit\/[^/?#]+|[^/?#]+\/edit)(?:[/?#]|$)/i.test(location.pathname) ||
      /^\/(?:[a-z]{2}\/)?lorebook\/(?:create|edit\/[^/?#]+)(?:[/?#]|$)/i.test(location.pathname);
  }

  function fieldLabel(field) {
    const explicit = field.getAttribute("aria-label") || field.getAttribute("name") || field.id || "";
    if (explicit) return explicit.replace(/[_-]+/g, " ").replace(/\b\w/g, m => m.toUpperCase()).slice(0, 80);
    const wrap = field.closest("label, [class*='flex-col'], [class*='grid']");
    const heading = wrap?.querySelector?.("label, p, h2, h3, h4, strong");
    const text = String(heading?.textContent || "").replace(/\s+/g, " ").trim();
    return text && text.length < 90 ? text : "Creator field";
  }

  function editableFields() {
    return [...document.querySelectorAll("textarea, input[type='text']")].filter(field => {
      if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)) return false;
      if (field.disabled || field.readOnly || field.closest(`#${MODAL_ID}, #ds-qol-panel, [data-ds-owned='1']`)) return false;
      if (field.closest("[class*='search'], [role='search']")) return false;
      const max = Number(field.maxLength || 0);
      return field instanceof HTMLTextAreaElement || max >= 80 || clean(field.value).length >= 40;
    });
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${BUTTON_CLASS}{appearance:none;border:1px solid rgba(148,163,184,.35);border-radius:7px;background:rgba(55,65,81,.75);color:inherit;padding:4px 8px;cursor:pointer;font:600 11px/1.2 system-ui;white-space:nowrap;margin-left:6px}
      #${MODAL_ID}{position:fixed;inset:0;z-index:1000000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.55)}
      #${MODAL_ID} .ds-cwa-dialog{width:min(900px,96vw);max-height:92vh;overflow:auto;background:#17181b;color:#f5f5f5;border:1px solid rgba(148,163,184,.35);border-radius:14px;padding:18px;box-shadow:0 20px 70px rgba(0,0,0,.55);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
      #${MODAL_ID} .ds-cwa-head,#${MODAL_ID} .ds-cwa-actions,#${MODAL_ID} .ds-cwa-modes{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      #${MODAL_ID} .ds-cwa-head{justify-content:space-between;margin-bottom:12px} #${MODAL_ID} h2{margin:0;font-size:20px}
      #${MODAL_ID} button,#${MODAL_ID} select{font:inherit;border:1px solid rgba(148,163,184,.38);border-radius:8px;background:#25272c;color:inherit;padding:7px 10px;cursor:pointer}
      #${MODAL_ID} button[data-primary='1']{background:#2563eb;border-color:#3b82f6} #${MODAL_ID} button:disabled{opacity:.5;cursor:default}
      #${MODAL_ID} textarea{width:100%;min-height:170px;resize:vertical;background:#0f1012;color:inherit;border:1px solid rgba(148,163,184,.32);border-radius:9px;padding:10px;font:13px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;box-sizing:border-box}
      #${MODAL_ID} .ds-cwa-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px} #${MODAL_ID} .ds-cwa-note{font-size:12px;opacity:.78;margin:8px 0}
      #${MODAL_ID} .ds-cwa-ai-status{font-size:12px;opacity:.78}
      #${MODAL_ID} .ds-cwa-findings{white-space:pre-wrap;border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:9px;margin-top:10px;min-height:32px}
      @media(max-width:720px){#${MODAL_ID} .ds-cwa-grid{grid-template-columns:1fr}#${MODAL_ID}{padding:8px}#${MODAL_ID} .ds-cwa-dialog{padding:13px}}
    `;
    document.head.appendChild(style);
  }

  function localReview(source) {
    const findings = [];
    const dict = new Set(String(DS.state.settings?.creatorWritingDictionary || "").split(/[\n,;]+/).map(v => v.trim().toLowerCase()).filter(Boolean));
    const repeats = [...source.matchAll(/\b([A-Za-z][A-Za-z'-]{2,})\s+\1\b/gi)].map(m => m[1]);
    if (repeats.length) findings.push(`Repeated word${repeats.length === 1 ? "" : "s"}: ${[...new Set(repeats)].slice(0, 8).join(", ")}`);
    if (/\s+[,.!?;:]/.test(source)) findings.push("Spaces appear before punctuation.");
    if (/[^\n]\s{3,}[^\n]/.test(source)) findings.push("There are runs of 3+ spaces inside a line.");
    if (/\{\{(?:user|char)\}(?!\})|(?<!\{)\{(?:user|char)\}\}/i.test(source)) findings.push("A {{user}}/{{char}} placeholder may have mismatched braces.");
    const opens = (source.match(/\{\{/g) || []).length;
    const closes = (source.match(/\}\}/g) || []).length;
    if (opens !== closes) findings.push(`Placeholder brace count differs (${opens} opening vs ${closes} closing).`);
    const sentenceI = [...source.matchAll(/(^|[.!?]\s+|\n\s*)i\b/g)].length;
    if (sentenceI) findings.push(`Lowercase “i” starts ${sentenceI} sentence${sentenceI === 1 ? "" : "s"}.`);
    if (dict.size) findings.push(`${dict.size} custom dictionar${dict.size === 1 ? "y word is" : "y words are"} protected from QoL wording checks.`);
    return findings;
  }

  function localCleanup(source) {
    return source
      .replace(/([A-Za-z][A-Za-z'-]{2,})(\s+)\1\b/gi, "$1")
      .replace(/[ \t]+([,.!?;:])/g, "$1")
      .replace(/([^\n]) {3,}([^\n])/g, "$1  $2")
      .replace(/(^|[.!?]\s+|\n\s*)i\b/g, "$1I");
  }

  function protectedTokens(text) {
    const tokens = [];
    const masked = text.replace(/\{\{[^{}\n]{1,80}\}\}|\{(?:user|char)\}|```[\s\S]*?```|`[^`\n]+`|https?:\/\/\S+/gi, match => {
      const key = `⟦DS_TOKEN_${tokens.length}⟧`;
      tokens.push(match);
      return key;
    });
    return { masked, tokens };
  }

  function restoreTokens(text, tokens) {
    let out = String(text || "");
    tokens.forEach((token, index) => { out = out.split(`⟦DS_TOKEN_${index}⟧`).join(token); });
    return out;
  }

  function browserAiApi() {
    return globalThis.LanguageModel || globalThis.ai?.languageModel || null;
  }

  function timeoutPromise(promise, ms, message, onTimeout = null) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { onTimeout?.(); } catch {}
        reject(new Error(message));
      }, Math.max(1000, Number(ms) || BROWSER_AI_TIMEOUT_MS));
      Promise.resolve(promise).then(value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }, error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async function browserAiCapability() {
    const LM = browserAiApi();
    if (!LM) {
      return {
        LM: null,
        usable: false,
        status: "unavailable",
        message: IS_OPERA
          ? "Browser AI unavailable in this Opera build. Local checks still work."
          : "Built-in browser AI is not available in this browser."
      };
    }

    let raw = "available";
    if (typeof LM.availability === "function") {
      try {
        raw = await timeoutPromise(LM.availability(), 6000, "Browser AI availability check timed out.");
      } catch (error) {
        return { LM, usable: false, status: "failed", message: String(error?.message || error) };
      }
    }

    const value = String(raw || "available").toLowerCase();
    if (["unavailable", "no", "unsupported"].includes(value)) {
      return { LM, usable: false, status: value, message: "Built-in browser AI is unavailable on this device/browser." };
    }
    if (/download/.test(value) || /after-download/.test(value)) {
      return { LM, usable: true, status: value, message: "Browser AI model needs to download or finish initializing before the rewrite can run." };
    }
    return { LM, usable: true, status: value, message: "Browser AI available." };
  }

  function cancelActiveAiRun(reason = "cancelled") {
    const run = activeAiRun;
    if (!run) return false;
    run.cancelled = true;
    run.cancelReason = reason;
    try { run.session?.destroy?.(); } catch {}
    activeAiRun = null;
    return true;
  }

  async function browserAiRewrite(source, mode, run, onStatus = null) {
    const capability = await browserAiCapability();
    if (!capability.usable || !capability.LM) throw new Error(capability.message);
    if (run?.cancelled) throw new Error("Browser AI rewrite cancelled.");
    onStatus?.(capability.message);

    const LM = capability.LM;
    let session = null;
    try {
      onStatus?.(/download|initial/i.test(capability.message) ? capability.message : "Starting browser AI…");
      session = typeof LM.create === "function"
        ? await timeoutPromise(LM.create(), BROWSER_AI_TIMEOUT_MS, "Browser AI took too long to start.")
        : null;
      if (run) run.session = session;
      if (run?.cancelled) throw new Error("Browser AI rewrite cancelled.");
      if (!session?.prompt) throw new Error("Built-in browser AI could not start.");

      const { masked, tokens } = protectedTokens(source);
      const targetLanguage = String(DS.state.settings?.creatorWritingTargetLanguage || "English").trim() || "English";
      const instructions = {
        grammar: "Correct spelling, grammar, punctuation, and awkward phrasing. Keep the meaning, character facts, tone, and formatting as close as possible.",
        clarity: "Improve clarity and natural phrasing without adding facts or changing the intended character voice.",
        concise: "Make the text more concise while preserving every important character fact, instruction, and relationship detail.",
        tone: "Polish the writing while preserving the author's existing tone, intensity, point of view, formatting, and style.",
        translate: `Translate the text into ${targetLanguage}. Preserve character names, placeholders, roleplay formatting, and meaning.`
      };
      const prompt = `You are editing text for a fictional chatbot creator. ${instructions[mode] || instructions.grammar}\n\nRules:\n- Return ONLY the revised text.\n- Do not add explanations.\n- Do not invent facts.\n- Keep every token shaped like ⟦DS_TOKEN_NUMBER⟧ exactly unchanged.\n- Preserve Markdown/roleplay markers when they are meaningful.\n\nTEXT:\n${masked}`;
      onStatus?.("Running browser AI…");
      const result = await timeoutPromise(
        session.prompt(prompt),
        BROWSER_AI_TIMEOUT_MS,
        "Browser AI rewrite timed out. You can retry or keep using local checks.",
        () => { try { session?.destroy?.(); } catch {} }
      );
      if (run?.cancelled) throw new Error("Browser AI rewrite cancelled.");
      const restored = restoreTokens(result, tokens).trim();
      for (const token of tokens) {
        if (!restored.includes(token)) throw new Error("The rewrite changed a protected placeholder/format token, so QoL refused to apply it.");
      }
      return restored;
    } finally {
      try { session?.destroy?.(); } catch {}
      if (run) run.session = null;
    }
  }

  function openModal(field, forcedMode = "grammar") {
    activeField = field;
    ensureStyle();
    document.getElementById(MODAL_ID)?.remove();
    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    DS.setSafeMarkup?.(modal, `
      <div class="ds-cwa-dialog" role="dialog" aria-modal="true" aria-label="Creator Writing Assistant">
        <div class="ds-cwa-head"><div><h2>Creator Writing Assistant</h2><div class="ds-cwa-note"></div></div><button type="button" data-close>×</button></div>
        <div class="ds-cwa-modes">
          <select data-mode><option value="grammar">Spelling + grammar</option><option value="clarity">Clarity / phrasing</option><option value="concise">Make more concise</option><option value="tone">Polish, keep my tone</option><option value="translate">Translate</option></select>
          <button type="button" data-local>Run local checks</button><button type="button" data-ai data-primary="1">Use browser AI</button><button type="button" data-ai-cancel hidden>Cancel browser AI</button><button type="button" data-card>Whole-card consistency</button>
          <span class="ds-cwa-ai-status" data-ai-status>Checking browser AI…</span>
        </div>
        <div class="ds-cwa-findings" data-findings></div>
        <div class="ds-cwa-grid"><label>Original<textarea data-source></textarea></label><label>Suggested<textarea data-result></textarea></label></div>
        <div class="ds-cwa-actions" style="margin-top:12px"><button type="button" data-copy>Copy suggestion</button><button type="button" data-apply data-primary="1">Apply to field</button><button type="button" data-close>Cancel</button></div>
      </div>`);
    document.documentElement.appendChild(modal);
    const source = modal.querySelector("[data-source]");
    const result = modal.querySelector("[data-result]");
    const findings = modal.querySelector("[data-findings]");
    const mode = modal.querySelector("[data-mode]");
    mode.value = forcedMode;
    const raw = field?.value || "";
    const selected = typeof field?.selectionStart === "number" && field.selectionEnd > field.selectionStart
      ? raw.slice(field.selectionStart, field.selectionEnd)
      : raw;
    source.value = selected;
    result.value = selected;
    modal.querySelector(".ds-cwa-note").textContent = `${fieldLabel(field)} · ${selected === raw ? "whole field" : "selected text"}. Nothing is saved to SpicyChat until you apply and then use SpicyChat's normal Save.`;

    const runLocal = () => {
      const findingsList = localReview(source.value);
      findings.textContent = findingsList.length ? findingsList.map(item => `• ${item}`).join("\n") : "No obvious local issues found. Browser spellcheck remains available in the editor for word-level spelling suggestions.";
      result.value = localCleanup(source.value);
    };
    modal.querySelector("[data-local]").addEventListener("click", runLocal);
    const aiButton = modal.querySelector("[data-ai]");
    const aiCancel = modal.querySelector("[data-ai-cancel]");
    const aiStatus = modal.querySelector("[data-ai-status]");
    aiButton.hidden = DS.state.settings?.creatorWritingUseBrowserAi === false;
    aiCancel.hidden = true;

    const refreshAiCapability = async () => {
      if (aiButton.hidden || !modal.isConnected) return;
      const capability = await browserAiCapability();
      if (!modal.isConnected) return;
      aiButton.disabled = !capability.usable;
      aiButton.textContent = capability.usable ? "Use browser AI" : "Browser AI unavailable";
      aiStatus.textContent = capability.message;
      aiButton.title = capability.message;
    };
    void refreshAiCapability();

    aiCancel.addEventListener("click", () => {
      if (!cancelActiveAiRun("user")) return;
      aiCancel.hidden = true;
      aiButton.disabled = false;
      aiButton.textContent = "Retry browser AI";
      findings.textContent = "Browser AI rewrite cancelled. Local checks are still available.";
      void refreshAiCapability();
    });

    aiButton.addEventListener("click", async event => {
      const button = event.currentTarget;
      cancelActiveAiRun("replaced");
      const run = { cancelled: false, session: null };
      activeAiRun = run;
      button.disabled = true;
      aiCancel.hidden = false;
      findings.textContent = "Checking browser AI…";
      try {
        result.value = await browserAiRewrite(source.value, mode.value, run, status => {
          if (activeAiRun === run && modal.isConnected) findings.textContent = status;
        });
        if (run.cancelled || activeAiRun !== run) return;
        findings.textContent = "Rewrite ready. Review it before applying; QoL never auto-saves or publishes.";
        button.textContent = "Use browser AI";
      } catch (error) {
        if (activeAiRun !== run && run.cancelled) return;
        findings.textContent = `${String(error?.message || error)}\n\nLocal checks are still available, and SpicyChat's own generate buttons are left untouched.`;
        button.textContent = "Retry browser AI";
      } finally {
        if (activeAiRun === run) activeAiRun = null;
        aiCancel.hidden = true;
        if (modal.isConnected) {
          button.disabled = false;
          void refreshAiCapability();
        }
      }
    });
    modal.querySelector("[data-card]").addEventListener("click", () => {
      const fields = editableFields().map(f => ({ label: fieldLabel(f), text: clean(f.value).trim() })).filter(item => item.text);
      const notes = [];
      const placeholderForms = { user: new Set(), char: new Set() };
      for (const item of fields) {
        for (const match of item.text.matchAll(/\{\{\s*(user|char)\s*\}\}/gi)) placeholderForms[match[1].toLowerCase()]?.add(match[0]);
      }
      const mixedForms = [...placeholderForms.user, ...placeholderForms.char].filter((value, index, all) => all.indexOf(value) === index);
      if (placeholderForms.user.size > 1 || placeholderForms.char.size > 1) notes.push(`Mixed placeholder spelling/casing: ${mixedForms.join(", ")}`);
      for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) {
        const a = fields[i].text.toLowerCase(), b = fields[j].text.toLowerCase();
        const shorter = a.length < b.length ? a : b;
        if (shorter.length > 220 && (a.includes(shorter) || b.includes(shorter))) notes.push(`${fields[i].label} and ${fields[j].label} contain a large repeated block.`);
      }
      findings.textContent = notes.length ? notes.map(item => `• ${item}`).join("\n") : `Checked ${fields.length} populated creator fields; no obvious cross-field duplication/placeholder inconsistency found.`;
    });
    modal.querySelector("[data-copy]").addEventListener("click", async () => { try { await navigator.clipboard.writeText(result.value); findings.textContent = "Suggestion copied."; } catch {} });
    modal.querySelector("[data-apply]").addEventListener("click", () => {
      if (!activeField?.isConnected) return;
      const before = activeField.value || "";
      if (typeof activeField.selectionStart === "number" && activeField.selectionEnd > activeField.selectionStart && source.value !== before) {
        const start = activeField.selectionStart, end = activeField.selectionEnd;
        activeField.value = before.slice(0, start) + result.value + before.slice(end);
      } else activeField.value = result.value;
      activeField.dispatchEvent(new Event("input", { bubbles: true }));
      activeField.dispatchEvent(new Event("change", { bubbles: true }));
      cancelActiveAiRun("applied");
      modal.remove();
      activeField.focus();
    });
    const closeModal = () => { cancelActiveAiRun("modal-closed"); modal.remove(); };
    modal.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", closeModal));
    modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
    runLocal();
  }

  function attachButton(field) {
    if (field.dataset.dsCreatorWritingReady === "1") return;
    field.dataset.dsCreatorWritingReady = "1";
    field.spellcheck = true;
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = "Review writing";
    button.title = "Spell/grammar/phrasing review for this field";
    button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openModal(field); });
    const generate = field.parentElement?.parentElement?.querySelector?.("button[data-testid^='generate-']") || field.parentElement?.querySelector?.("button[data-testid^='generate-']");
    if (generate?.parentElement) generate.insertAdjacentElement("afterend", button);
    else field.insertAdjacentElement("beforebegin", button);
  }

  function cleanup() {
    cancelActiveAiRun("cleanup");
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(el => el.remove());
    document.querySelectorAll("[data-ds-creator-writing-ready]").forEach(el => delete el.dataset.dsCreatorWritingReady);
    document.getElementById(MODAL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  DS.applyCreatorWritingAssistant = function applyCreatorWritingAssistant() {
    const settings = DS.state.settings || {};
    if (!settings.enabled || !settings.enableCreatorWritingAssistant || !isCreatorPage()) return cleanup();
    ensureStyle();
    editableFields().forEach(attachButton);
  };
  DS.removeCreatorWritingAssistant = cleanup;
})();
