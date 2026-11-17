// Optional creator-only token review. Loaded on demand, does no analysis until clicked.
// No remote service, timer, MutationObserver, automatic writes or persistent snapshots.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const BUTTON_ID = "ds-character-token-optimizer-open";
  const MODAL_ID = "ds-character-token-optimizer-dialog";
  const STYLE_ID = "ds-character-token-optimizer-style";
  const MAX_CHARS = 120000;
  const LABELS = Object.freeze({
    description: "Description / public title",
    greeting: "Greeting",
    personality: "Personality / definition",
    scenario: "Scenario",
    examples: "Example dialogue",
    alternate: "Alternate greeting"
  });
  const EDITOR_ROUTE = /^\/(?:[a-z]{2}\/)?chatbot\/(?:create(?:\/[^/?#]+)?|edit\/[^/?#]+|[^/?#]+\/edit)(?:\/|$)/i;
  let active = false;

  function isEditor() { return EDITOR_ROUTE.test(location.pathname) || !!DS.getPageState?.().isBotEditor; }
  function isEditable(node) {
    if (!node || node.disabled || node.readOnly || !(node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement)) return false;
    if (node.closest(`#${MODAL_ID},[data-ds-owned='1'],#ds-qol-panel,.ds-bot-editor-snippets,[role='search']`)) return false;
    if (node instanceof HTMLInputElement && !["text", ""].includes(String(node.type || "").toLowerCase())) return false;
    return true;
  }
  function fieldLabel(node) {
    const name = [node.name, node.id, node.getAttribute("data-field-name"), node.getAttribute("aria-label"),
      node.getAttribute("data-testid"), node.closest("[data-field-name]")?.getAttribute("data-field-name")]
      .filter(Boolean).join(" ").toLowerCase();
    const label = node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent : "";
    const combined = `${name} ${String(label || "").slice(0, 120)}`.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
    if (/\b(search|tag search|image|avatar|website|keyword|feedback|report)\b/.test(combined)) return "";
    if (/(?:alternate|alternative|additional)[\s_-]*(?:greeting|first[\s_-]*message)|greetings?\s*\[\d+\]/.test(combined)) return "alternate";
    if (/\b(example[\s_-]*dialogue|example[\s_-]*conversation|mes[\s_-]*example|exampledialogues?|examples?)\b/.test(combined)) return "examples";
    if (/\b(greeting|first[\s_-]*mes(?:sage)?|initial[\s_-]*message|firstmessage)\b/.test(combined)) return "greeting";
    if (/\b(personality|definition|persona|character[\s_-]*details|system[\s_-]*prompt)\b/.test(combined)) return "personality";
    if (/\bscenario\b/.test(combined)) return "scenario";
    if (/\b(description|tagline|public[\s_-]*title)\b/.test(combined)) return "description";
    return "";
  }
  function collectFields(root = document) {
    const fields = [];
    const seen = new Set();
    for (const control of root.querySelectorAll("textarea,input[type='text'],input:not([type])")) {
      if (!isEditable(control)) continue;
      const type = fieldLabel(control);
      if (!type) continue;
      // One main instance per field, but preserve multiple alternate greetings.
      if (type !== "alternate" && seen.has(type)) continue;
      seen.add(type);
      const value = String(control.value ?? "");
      fields.push({ key: type, label: type === "alternate" ? `${LABELS.alternate} ${fields.filter(f => f.key === "alternate").length + 1}` : LABELS[type], control, value });
    }
    return fields;
  }
  // Approximation only; models, native editor counters and tokenizer versions differ.
  function estimate(text) {
    const source = String(text || "");
    if (!source.trim()) return 0;
    const parts = source.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || [];
    const pieceEstimate = parts.reduce((sum, part) => sum + (/^[\p{L}\p{N}_]+$/u.test(part) ? Math.max(1, part.length / 4.2) : .55), 0);
    return Math.max(1, Math.round((source.length / 4 + pieceEstimate) / 2));
  }
  function placeholders(text) { return (String(text).match(/\{\{[^{}\n]{1,120}\}\}/g) || []).sort().join("\u0000"); }
  function protectedEqual(before, after) { return placeholders(before) === placeholders(after); }
  function suggestion(field, title, detail, after, kind) {
    if (after === field.value || !protectedEqual(field.value, after)) return null;
    return {
      field, title, detail, kind,
      before: field.value, after,
      beforeTokens: estimate(field.value), afterTokens: estimate(after),
      saving: Math.max(0, estimate(field.value) - estimate(after))
    };
  }
  function findSuggestions(fields) {
    const suggestions = [], warnings = [];
    for (const field of fields) {
      if (field.value.length > MAX_CHARS) {
        warnings.push(`${field.label}: very large field; skipped optimization analysis to protect responsiveness.`);
        continue;
      }
      // Whitespace-only changes keep meaningful line breaks, indentation and dialogue intact.
      const whitespace = field.value.replace(/[ \t]+(?=\r?\n|$)/gm, "").replace(/(?:\r?\n){4,}/g, "\n\n\n");
      const fixSpacing = suggestion(field, `Remove excess blank lines / trailing spaces`,
        `Whitespace-only cleanup in ${field.label}. Review line layout before applying.`, whitespace, "whitespace");
      if (fixSpacing) suggestions.push(fixSpacing);

      // Only recommend exact repeated lines in factual/editor-definition fields.
      // Greeting and example dialogue intentionally repeat lines for RP pacing.
      if (!["personality", "scenario", "description"].includes(field.key)) continue;
      const lines = field.value.split(/\r?\n/);
      if (lines.length > 3500) continue;
      const seen = new Set();
      let removed = 0;
      const cleaned = lines.filter(line => {
        const normalized = line.trim();
        if (normalized.length < 44 || /\{\{[^}]+\}\}/.test(normalized) || /^```/.test(normalized)) return true;
        if (seen.has(normalized)) { removed++; return false; }
        seen.add(normalized); return true;
      }).join(field.value.includes("\r\n") ? "\r\n" : "\n");
      if (removed) {
        const duplicate = suggestion(field, `Remove ${removed} identical repeated line${removed === 1 ? "" : "s"}`,
          `Exact duplicates only, within ${field.label}. Character facts are not reworded. Check whether repetition was intentional.`, cleaned, "duplicate-lines");
        if (duplicate) suggestions.push(duplicate);
      }
    }
    // Exact large cross-field overlaps are warnings, not automatic transformations.
    const longFields = fields.filter(f => f.value.trim().length > 230 && f.value.length <= MAX_CHARS);
    for (let i = 0; i < longFields.length; i++) for (let j = i + 1; j < longFields.length; j++) {
      const a = longFields[i], b = longFields[j], x = a.value.trim(), y = b.value.trim();
      if (x.length > 230 && y.length > 230 && (x.includes(y) || y.includes(x))) {
        warnings.push(`${a.label} and ${b.label} contain a repeated block. Review the overlap manually; QoL won't remove facts across fields.`);
      }
    }
    if (fields.some(f => f.key === "personality" && estimate(f.value) > 2000))
      warnings.push("The Personality / definition is long. Consider shortening repeated instructions manually, but preserve character facts and relationships.");
    return { suggestions: suggestions.slice(0, 50), warnings: warnings.slice(0, 15) };
  }
  function applyToEditor(s) {
    const target = s?.field?.control;
    if (!target?.isConnected || !isEditable(target)) return "The original editor field is no longer available. Refresh the analysis.";
    if (target.value !== s.before) return "This field has changed since analysis. Refresh before applying anything.";
    if (!protectedEqual(s.before, s.after)) return "Protected placeholders changed. The edit was refused.";
    const descriptor = Object.getOwnPropertyDescriptor(target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value");
    if (!descriptor?.set) return "Could not safely edit this SpicyChat field.";
    descriptor.set.call(target, s.after);
    target.dispatchEvent(typeof InputEvent === "function"
      ? new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: null })
      : new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    if (target.value !== s.after) return "SpicyChat rejected the update. No save was attempted.";
    return "Applied to the editor only. Review it, then use SpicyChat's normal Save. Nothing was published automatically.";
  }
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style"); style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{margin:8px 0;padding:6px 12px;font:600 13px system-ui;color:inherit;background:transparent;border:1px solid #64748b;border-radius:7px;cursor:pointer}
      #${MODAL_ID}{position:fixed;inset:0;z-index:1000000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:12px}
      #${MODAL_ID} .ds-cto-box{box-sizing:border-box;max-width:980px;width:100%;max-height:94vh;overflow:auto;border:1px solid #475569;border-radius:12px;background:#171b22;color:#f8fafc;padding:16px;font:14px/1.45 system-ui,Arial,sans-serif}
      #${MODAL_ID} h2,#${MODAL_ID} h3{margin:0 0 8px}#${MODAL_ID} h2{font-size:20px}#${MODAL_ID} h3{font-size:15px}
      #${MODAL_ID} .ds-cto-row{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin:8px 0}
      #${MODAL_ID} button{background:#273143;color:inherit;border:1px solid #64748b;border-radius:7px;padding:6px 10px;cursor:pointer;font:inherit}
      #${MODAL_ID} button:disabled{opacity:.5;cursor:not-allowed}#${MODAL_ID} .ds-cto-primary{background:#1d4ed8}
      #${MODAL_ID} .ds-cto-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}#${MODAL_ID} textarea{box-sizing:border-box;width:100%;min-height:165px;max-height:300px;resize:vertical;background:#0c121c;color:inherit;border:1px solid #475569;border-radius:7px;padding:9px;font:12px/1.45 ui-monospace,monospace}
      #${MODAL_ID} .ds-cto-muted{opacity:.76;font-size:12px}#${MODAL_ID} .ds-cto-choice{display:flex;gap:5px;flex-wrap:wrap;max-height:160px;overflow:auto}
      #${MODAL_ID} .ds-cto-choice button[aria-pressed='true']{border-color:#93c5fd;background:#1d4ed8}
      @media(max-width:680px){#${MODAL_ID} .ds-cto-grid{grid-template-columns:1fr}#${MODAL_ID} .ds-cto-box{padding:10px}}
    `;
    document.head.appendChild(style);
  }
  function el(tag, text, className = "") {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function btn(text, callback, className = "") {
    const node = el("button", text, className); node.type = "button"; node.addEventListener("click", callback); return node;
  }
  function openOptimizer() {
    const fields = collectFields();
    if (!fields.length) { DS.setQuickStatus?.("Open the chatbot editor's text fields first, then retry Optimize Tokens."); return; }
    ensureStyle();
    document.getElementById(MODAL_ID)?.remove();
    const overlay = el("div"); overlay.id = MODAL_ID;
    const dialog = el("div", null, "ds-cto-box"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", "Character Token Optimizer");
    const heading = el("div", null, "ds-cto-row"); heading.append(el("h2", "Character Token Optimizer"), btn("Close", () => close()));
    const note = el("p", "Local estimated token counts, not SpicyChat's authoritative tokenizer. No AI or network requests. Nothing is edited until you apply an individual suggestion, and publishing still requires SpicyChat's Save.", "ds-cto-muted");
    const breakdown = el("div"); const list = el("div", null, "ds-cto-choice"); const warning = el("div", null, "ds-cto-muted");
    const description = el("p", "", "ds-cto-muted"); const grid = el("div", null, "ds-cto-grid");
    const left = el("label", "Original"); const right = el("label", "Suggested");
    const original = el("textarea"), changed = el("textarea"); original.readOnly = true; changed.readOnly = true;
    left.append(original); right.append(changed); grid.append(left, right);
    const bottom = el("div", null, "ds-cto-row"), status = el("p", "", "ds-cto-muted");
    let suggestions = [], selected = null;
    const apply = btn("Apply selected change to editor", () => {
      if (!selected) return;
      const msg = applyToEditor(selected);
      status.textContent = msg;
      if (msg.startsWith("Applied")) { apply.disabled = true; selected = null; }
    }, "ds-cto-primary");
    const copy = btn("Copy suggestion", () => {
      if (!selected) return;
      const value = selected.after;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(value).then(() => { status.textContent = "Suggestion copied."; }).catch(() => { status.textContent = "Clipboard access unavailable. Select the Suggested text and copy manually."; });
      } else { status.textContent = "Select the Suggested text and copy manually."; }
    });
    const refresh = btn("Reanalyze current fields", () => refreshAnalysis());
    bottom.append(refresh, copy, apply);
    dialog.append(heading, note, breakdown, el("h3", "Suggestions (review individually)"), list, description, grid, bottom, status, warning);
    overlay.append(dialog); document.documentElement.append(overlay);
    function close() { overlay.remove(); }
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); close(); } });
    function select(i) {
      selected = suggestions[i] || null;
      original.value = selected?.before || ""; changed.value = selected?.after || "";
      description.textContent = selected ? `${selected.field.label} · ${selected.detail} · ~${selected.beforeTokens} → ~${selected.afterTokens} tokens (approx. ${selected.saving} saved)` : "No automatic editing suggestions. You can still review the token breakdown and warnings.";
      [...list.querySelectorAll("button")].forEach((node, index) => node.setAttribute("aria-pressed", String(index === i)));
      apply.disabled = !selected; copy.disabled = !selected;
    }
    function refreshAnalysis() {
      const current = collectFields();
      const result = findSuggestions(current);
      suggestions = result.suggestions;
      const sum = current.reduce((n, field) => n + estimate(field.value), 0);
      const byField = new Map();
      for (const suggestion of suggestions) byField.set(suggestion.field.control, Math.max(byField.get(suggestion.field.control) || 0, suggestion.saving));
      const savings = [...byField.values()].reduce((n, saving) => n + saving, 0);
      breakdown.replaceChildren(el("div", `Estimated ${sum.toLocaleString()} tokens across ${current.length} visible editor field${current.length === 1 ? "" : "s"} · individual suggestions: ${suggestions.length} · potential savings if compatible edits are applied: up to ~${savings} tokens`));
      const table = el("div", null, "ds-cto-muted");
      table.textContent = current.map(f => `${f.label}: ~${estimate(f.value)} tokens`).join("  ·  "); breakdown.append(table);
      list.replaceChildren();
      suggestions.forEach((s, i) => list.append(btn(`${s.title} · ${s.field.label} (${s.saving ? `~${s.saving} tokens` : "formatting"})`, () => select(i))));
      warning.textContent = result.warnings.length ? `Manual review: ${result.warnings.join("  |  ")}` : "No obvious high-risk repeated blocks detected. Automated token savings are estimates and may be small.";
      status.textContent = "Analysis refreshed. No editor fields were changed.";
      select(suggestions.length ? 0 : -1);
    }
    refreshAnalysis();
    refresh.focus();
  }
  function cleanup() {
    document.getElementById(BUTTON_ID)?.remove();
    document.getElementById(MODAL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    active = false;
  }
  DS.applyCharacterTokenOptimizer = function applyCharacterTokenOptimizer() {
    if (!DS.state?.settings?.enabled || !DS.state.settings.enableCharacterTokenOptimizer || !isEditor()) return cleanup();
    const existing = document.getElementById(BUTTON_ID);
    if (existing?.isConnected) return;
    const available = collectFields();
    const target = (available.find(f => f.key === "personality") || available[0])?.control;
    if (!target) return;
    const button = btn("Optimize Tokens", event => { event.preventDefault(); event.stopPropagation(); openOptimizer(); });
    button.id = BUTTON_ID; button.title = "Review local token estimates and individual safe suggestions without saving automatically";
    target.insertAdjacentElement("beforebegin", button);
    active = true;
  };
  DS.removeCharacterTokenOptimizer = cleanup;
  DS.characterTokenOptimizer = Object.freeze({ estimate, findSuggestions, collectFields, applyToEditor });
})();
