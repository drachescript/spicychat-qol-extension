// Review help for Lorebook saves. This does not infer or bypass SpicyChat moderation.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const KEY = "dsLorebookModerationSnapshotsV1";
  const MAX = 30;
  let lastError = "";
  let latestSnapshot = null;
  let currentPanel = null;
  let renderTimer = 0;
  const clean = (value, cap = 16000) => String(value ?? "").trim().slice(0, cap);
  const routeId = () => location.pathname.match(/^\/lorebook\/(?:edit\/)?([0-9a-f-]{20,})(?:\/entries)?\/?$/i)?.[1] || "";
  const enabled = () => !!(DS.state?.settings?.enabled && DS.state.settings.creatorModerationWarnings && routeId());
  const make = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
  function editor() {
    const content = [...document.querySelectorAll("textarea[name='content']")].find(el => el.offsetParent !== null);
    const form = content?.closest("form");
    const name = form?.querySelector("input[name='name']");
    return content && form && name ? { form, name, content } : null;
  }
  function keywords(form) {
    const chips = [...form.querySelectorAll("[data-field-name='keywords'] button")];
    return chips.filter(x => x.getAttribute("aria-label") !== "Clear all tags")
      .map(x => clean(x.textContent, 80)).filter(Boolean).slice(0, 12);
  }
  function capture(parts) {
    return { lorebookId: routeId(), name: clean(parts.name.value, 120), content: clean(parts.content.value, 16000), keywords: keywords(parts.form), savedAt: new Date().toISOString() };
  }
  async function archive(snapshot) {
    const stored = await chrome.storage.local.get(KEY);
    const list = Array.isArray(stored[KEY]) ? stored[KEY] : [];
    // Cap local retained text; no networking or automatic publication.
    await chrome.storage.local.set({ [KEY]: [snapshot, ...list].slice(0, MAX) });
    latestSnapshot = snapshot;
  }
  async function latest() {
    const stored = await chrome.storage.local.get(KEY);
    const items = Array.isArray(stored[KEY]) ? stored[KEY] : [];
    const entry = editor();
    const name = clean(entry?.name?.value, 120);
    return items.find(x => x.lorebookId === routeId() && x.name === name) || null;
  }
  async function copy(value) {
    if (typeof DS.copyTextToClipboard === "function") return DS.copyTextToClipboard(value);
    return navigator.clipboard.writeText(value);
  }
  function status(panel, text, tone = "") {
    const node = panel?.querySelector(".ds-mod-review-status");
    if (node) { node.textContent = text; node.dataset.tone = tone; }
  }
  function changedSnippet(before, after) {
    if (!before) return "No earlier saved attempt to compare with.";
    if (before === after) return "The text matches your previous saved attempt.";
    let begin = 0;
    while (begin < before.length && begin < after.length && before[begin] === after[begin]) begin++;
    let endA = before.length - 1, endB = after.length - 1;
    while (endA >= begin && endB >= begin && before[endA] === after[endB]) { endA--; endB--; }
    const start = Math.max(0, begin - 32);
    const was = before.slice(start, Math.min(endA + 33, before.length)).slice(0, 240);
    const now = after.slice(start, Math.min(endB + 33, after.length)).slice(0, 240);
    return `Changed since previous saved attempt (not a moderation diagnosis):\nBefore: ${was || "(nothing)"}\nNow: ${now || "(nothing)"}`;
  }
  async function showCompare(parts, panel) {
    const before = await latest();
    const current = capture(parts);
    const output = panel.querySelector(".ds-mod-review-diff");
    if (output) output.textContent = changedSnippet(before?.content || "", current.content);
  }
  function updateWarnings(parts, panel) {
    const terms = DS.scanCreatorModerationText?.(parts.content.value) || [];
    const host = panel.querySelector(".ds-mod-review-terms");
    if (host) host.textContent = terms.length
      ? `Community-reported wording to review: ${[...new Set(terms.map(x => x.word))].slice(0, 12).join(", ")}. These are not confirmed moderation triggers.`
      : "No community-reported wording matches found. SpicyChat may still reject the entry based on context.";
  }
  function showPanel(parts) {
    if (parts.form.querySelector(".ds-mod-review-panel")) return;
    const panel = make("div", undefined, "ds-mod-review-panel");
    panel.dataset.dsOwned = "1";
    const header = make("strong", "Lorebook save review");
    const note = make("p", "QoL cannot see which words SpicyChat's moderation system actually flagged. This panel saves a local copy and helps compare edits; it does not test or bypass the filter.");
    const terms = make("p", "", "ds-mod-review-terms");
    const actions = make("div", undefined, "ds-mod-review-actions");
    const message = make("p", "", "ds-mod-review-status");
    const diff = make("pre", "", "ds-mod-review-diff");
    diff.hidden = true;
    const mk = (label, callback) => { const b = make("button", label); b.type="button"; b.addEventListener("click", callback); return b; };
    actions.append(
      mk("Save local copy", async () => {
        try { await archive(capture(parts)); status(panel, "Entry copied into local QoL storage.", "ok"); }
        catch(e) { status(panel, `Save failed: ${e.message}`, "error"); }
      }),
      mk("Compare edits", async () => {
        try { diff.hidden = false; await showCompare(parts, panel); }
        catch(e) { status(panel, `Comparison failed: ${e.message}`, "error"); }
      }),
      mk("Copy support report", async () => {
        try {
          const saved = await latest();
          const now = capture(parts);
          const matches = DS.scanCreatorModerationText?.(now.content) || [];
          const report = ["SpicyChat Lorebook save report (manual copy)",
            `Lorebook ID: ${now.lorebookId}`, `Entry: ${now.name}`, `Time: ${now.savedAt}`,
            `Most recently visible moderation error: ${lastError || "Not captured"}`,
            `Community-reported matches (not confirmed causes): ${matches.map(m => m.word).join(", ") || "None"}`,
            `Keywords: ${now.keywords.join(", ")}`, `Saved local snapshot: ${saved?.savedAt || "None"}`,
            `Entry text:\n${now.content}`].join("\n\n");
          await copy(report);
          status(panel, "Report copied. Review before sharing; it contains your entry text.", "ok");
        } catch (e) { status(panel, `Copy failed: ${e.message}`, "error"); }
      }),
      mk("Export local copy", async () => {
        try {
          const saved = await latest() || capture(parts);
          if (typeof DS.downloadTextFile !== "function") throw Error("File exporter unavailable.");
          await DS.downloadTextFile(JSON.stringify({format:"spicychat-qol-lorebook-save-review",version:1,entry:saved,error:lastError || null},null,2),
            `lorebook-${routeId().slice(0,8)}-save-review.json`, "application/json;charset=utf-8", {requestPermission:true});
          status(panel, "Copy export requested. Check your download result.", "ok");
        } catch(e) { status(panel, `Export failed: ${e.message}`, "error"); }
      })
    );
    panel.append(header, note, terms, actions, message, diff);
    parts.form.append(panel);
    parts.content.addEventListener("input", () => updateWarnings(parts, panel));
    updateWarnings(parts, panel);
    currentPanel = panel;
  }
  function update() {
    if (!enabled()) { document.querySelectorAll(".ds-mod-review-panel").forEach(x => x.remove()); return; }
    const parts = editor();
    if (parts) showPanel(parts);
  }
  // Capture a copy only on a real user-initiated save attempt; import scripts aren't changed.
  document.addEventListener("click", event => {
    if (!enabled() || !event.isTrusted) return;
    const parts = editor();
    const button = event.target?.closest?.("button");
    if (!parts || !button) return;
    const editorRoot = parts.form.closest("[role=dialog], [aria-modal=true], div.fixed") || parts.form;
    if (!editorRoot.contains(button)) return;
    const label = clean(button.getAttribute("aria-label") || button.textContent, 60).toLowerCase();
    if (!/^(save|update|add|create)(?: entry)?$/.test(label)) return;
    archive(capture(parts)).catch(error => status(currentPanel, `Local backup failed: ${error.message}`, "error"));
  }, true);
  // Show server-provided text verbatim, if present. Never guess a flagged word.
  function checkErrorNode(el) {
    if (!(el instanceof Element)) return;
    const alerts = [el, ...el.querySelectorAll("[role='alert'], [data-sonner-toast], [data-testid*='toast' i]")].slice(0, 25);
    for (const node of alerts) {
      if (!node.matches?.("[role='alert'], [data-sonner-toast], [data-testid*='toast' i]")) continue;
      const text = clean(node.textContent, 600);
      if (!/(moderati|rejected|content.policy|not.allowed|inappropriate|flagged)/i.test(text)) continue;
      lastError = text;
      status(currentPanel, `SpicyChat reported: ${text}`, "error");
    }
  }
  new MutationObserver(changes => {
    if (!enabled()) return;
    let modalChange = false;
    for (const mutation of changes) for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      checkErrorNode(node);
      if (node.matches?.("textarea[name='content'], form") || node.querySelector?.("textarea[name='content']")) modalChange = true;
    }
    if (modalChange) {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(update, 100);
    }
  }).observe(document.documentElement, {childList:true, subtree:true});
  if (/\/lorebook\//.test(location.pathname)) update();
})();
}
