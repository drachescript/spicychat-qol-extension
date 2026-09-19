(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const STORE_KEY = "dsBotEditorDraftHistory";
  const TOOLBAR_CLASS = "ds-bot-editor-history-tools";
  const MODAL_ID = "ds-bot-editor-history-modal";

  let storeLoaded = false;
  let storeLoadPromise = null;
  let historyStore = { entries: {} };
  let lastNativeSaveSnapshotAt = 0;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizedPath() {
    return String(location.pathname || "")
      .replace(/^\/[a-z]{2}(?=\/)/i, "")
      .replace(/\/+$/, "") || "/";
  }

  function editorInfo() {
    const path = normalizedPath();
    if (path === "/chatbot/create" || path === "/create/chatbot" || path === "/create") {
      return { mode: "create", id: "", key: "create", path };
    }

    let match = path.match(/^\/chatbot\/create\/([^/]+)$/i);
    if (match) {
      const id = decodeURIComponent(match[1]);
      return { mode: "draft", id, key: `draft:${id}`, path };
    }

    match = path.match(/^\/chatbot\/([^/]+)\/edit$/i);
    if (match) {
      const id = decodeURIComponent(match[1]);
      return { mode: "edit", id, key: `bot:${id}`, path };
    }

    match = path.match(/^\/chatbot\/edit\/([^/]+)$/i);
    if (match) {
      const id = decodeURIComponent(match[1]);
      return { mode: "edit", id, key: `bot:${id}`, path };
    }

    if (path === "/chatbot/edit" || path.startsWith("/chatbot/edit/")) {
      const params = new URLSearchParams(location.search || "");
      const id = clean(params.get("id") || params.get("chatbotId") || params.get("characterId"));
      return { mode: "edit", id, key: id ? `bot:${id}` : "edit:unknown", path };
    }

    return null;
  }

  function settings() {
    return DS.state?.settings || {};
  }

  function editorForm() {
    if (!editorInfo()) return null;
    const field = document.querySelector(
      '[data-field-name="name"] input, input[name="name"], [data-field-name="greeting"] textarea, textarea[name="greeting"]'
    );
    return field?.closest?.("form") || document.querySelector("form[data-testid*='Chatbot'], form[data-testid*='Character']") || null;
  }

  function enabled() {
    return !!(settings().enabled && settings().enableBotEditorDraftHistory && editorInfo());
  }

  function normalizeStore(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const entries = source.entries && typeof source.entries === "object" && !Array.isArray(source.entries)
      ? source.entries
      : {};
    const output = {};

    for (const [key, list] of Object.entries(entries)) {
      const cleanKey = clean(key);
      if (!cleanKey || !Array.isArray(list)) continue;
      output[cleanKey] = list.map(item => {
        if (!item || typeof item !== "object") return null;
        const fields = item.fields && typeof item.fields === "object" && !Array.isArray(item.fields)
          ? Object.fromEntries(Object.entries(item.fields).map(([field, value]) => [clean(field), String(value ?? "")]).filter(([field]) => !!field))
          : {};
        if (!Object.keys(fields).length) return null;
        return {
          id: clean(item.id) || `snap-${Number(item.savedAt) || Date.now()}`,
          savedAt: Number(item.savedAt) || Date.now(),
          reason: clean(item.reason) || "Snapshot",
          botName: clean(item.botName),
          fields
        };
      }).filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
    }

    return { entries: output };
  }

  async function ensureStore() {
    if (storeLoaded) return historyStore;
    if (storeLoadPromise) return storeLoadPromise;

    storeLoadPromise = (async () => {
      try {
        const result = await DS.storageGet?.([STORE_KEY]);
        historyStore = normalizeStore(result?.[STORE_KEY]);
      } catch {
        historyStore = { entries: {} };
      } finally {
        storeLoaded = true;
      }
      return historyStore;
    })().finally(() => {
      storeLoadPromise = null;
    });

    return storeLoadPromise;
  }

  async function saveStore() {
    historyStore = normalizeStore(historyStore);
    await DS.storageSet?.({ [STORE_KEY]: historyStore });
  }

  function controlText(control) {
    const parts = [
      control.id,
      control.name,
      control.getAttribute("aria-label"),
      control.getAttribute("placeholder"),
      control.getAttribute("data-testid"),
      control.closest("[data-field-name]")?.getAttribute("data-field-name")
    ];

    if (control.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
        if (label) parts.push(label.textContent);
      } catch {}
    }

    const holder = control.closest("label, [data-field-name]");
    if (holder) parts.push(holder.textContent);
    return clean(parts.filter(Boolean).join(" ")).toLowerCase();
  }

  function semanticKey(control) {
    if (!control || control.closest(`#${MODAL_ID}, #ds-qol-panel, .${TOOLBAR_CLASS}, .ds-bot-editor-snippets, .ds-creation-bulk-tools`)) return "";
    if (control.disabled) return "";

    const tag = control.tagName?.toLowerCase();
    const type = String(control.type || "").toLowerCase();
    if (!(["textarea", "select"].includes(tag) || (tag === "input" && ["", "text"].includes(type)))) return "";

    const text = controlText(control);
    if (!text || /\b(add tags?|search|image|avatar|url|website|feedback|comment|report)\b/i.test(text)) return "";

    if (/\b(example dialogue|example conversation|examples?)\b/i.test(text)) return "examples";
    if (/\b(first message|greeting|initial message)\b/i.test(text)) return "greeting";
    if (/\b(personality|definition|character details|system prompt)\b/i.test(text)) return "personality";
    if (/\bscenario\b/i.test(text)) return "scenario";
    if (/\b(description|character description)\b/i.test(text)) return "description";
    if (/\b(chatbot name|character name|name field)\b/i.test(text) || /^name(?:\s|$)/i.test(text)) return "name";
    return "";
  }

  function editorControls() {
    const result = new Map();
    for (const control of document.querySelectorAll("textarea, input, select")) {
      const key = semanticKey(control);
      if (!key || result.has(key)) continue;
      result.set(key, control);
    }
    return result;
  }

  function captureFields() {
    const fields = {};
    for (const [key, control] of editorControls()) {
      fields[key] = String(control.value ?? "");
    }
    return fields;
  }

  function botName(fields = captureFields()) {
    return clean(fields.name || "");
  }

  function sameFields(a, b) {
    const left = a && typeof a === "object" ? a : {};
    const right = b && typeof b === "object" ? b : {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (String(left[key] ?? "") !== String(right[key] ?? "")) return false;
    }
    return true;
  }

  function historyLimit() {
    return Math.max(3, Math.min(20, Number(settings().botEditorDraftHistoryLimit) || 8));
  }

  async function captureSnapshot(reason = "Manual snapshot", quiet = false) {
    const info = editorInfo();
    if (!enabled() || !info) return false;

    const fields = captureFields();
    const meaningful = Object.values(fields).some(value => clean(value));
    if (!meaningful) {
      if (!quiet) DS.setQuickStatus?.("Nothing to snapshot in the chatbot editor yet.");
      return false;
    }

    await ensureStore();
    const list = Array.isArray(historyStore.entries[info.key]) ? historyStore.entries[info.key] : [];
    if (list[0] && sameFields(list[0].fields, fields)) {
      if (!quiet) DS.setQuickStatus?.("Draft already matches the newest snapshot.");
      updateToolbarCount();
      return false;
    }

    const snapshot = {
      id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      savedAt: Date.now(),
      reason: clean(reason) || "Snapshot",
      botName: botName(fields),
      fields
    };

    historyStore.entries[info.key] = [snapshot, ...list].slice(0, historyLimit());
    await saveStore();
    updateToolbarCount();
    if (!quiet) DS.setQuickStatus?.(`Saved local editor snapshot${snapshot.botName ? ` for ${snapshot.botName}` : ""}.`);
    return true;
  }

  DS.captureBotEditorSnapshot = captureSnapshot;

  function nativeSetValue(control, value) {
    const next = String(value ?? "");
    const proto = control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : control instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLSelectElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    try {
      if (descriptor?.set) descriptor.set.call(control, next);
      else control.value = next;
    } catch {
      control.value = next;
    }
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function restoreSnapshot(snapshot) {
    const controls = editorControls();
    let restored = 0;
    for (const [key, value] of Object.entries(snapshot?.fields || {})) {
      const control = controls.get(key);
      if (!control) continue;
      nativeSetValue(control, value);
      restored++;
    }
    DS.scheduleRun?.({ priority: "critical", source: "bot-editor-history-restore" });
    return restored;
  }

  function formatTime(timestamp) {
    try { return new Date(Number(timestamp) || Date.now()).toLocaleString(); }
    catch { return "Unknown time"; }
  }

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
  }

  function makeButton(text, onClick, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    if (className) button.className = className;
    button.addEventListener("click", onClick);
    return button;
  }

  async function openHistory() {
    const info = editorInfo();
    if (!info) return;
    await ensureStore();
    closeModal();

    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "ds-bot-editor-history-overlay";
    overlay.addEventListener("click", event => { if (event.target === overlay) closeModal(); });

    const dialog = document.createElement("div");
    dialog.className = "ds-bot-editor-history-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Chatbot editor draft history");

    const head = document.createElement("div");
    head.className = "ds-bot-editor-history-head";
    const titleWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Editor draft history";
    const hint = document.createElement("span");
    hint.textContent = "Local snapshots only. Restoring fills the current form and never saves/publishes automatically.";
    titleWrap.append(title, hint);
    head.append(titleWrap, makeButton("×", closeModal, "ds-bot-editor-history-close"));

    const listHost = document.createElement("div");
    listHost.className = "ds-bot-editor-history-list";
    const list = Array.isArray(historyStore.entries[info.key]) ? historyStore.entries[info.key] : [];

    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "ds-bot-editor-history-empty";
      empty.textContent = "No snapshots saved for this editor yet.";
      listHost.appendChild(empty);
    }

    for (const snapshot of list) {
      const row = document.createElement("div");
      row.className = "ds-bot-editor-history-row";

      const meta = document.createElement("div");
      meta.className = "ds-bot-editor-history-meta";
      const rowTitle = document.createElement("strong");
      rowTitle.textContent = snapshot.botName || (info.mode === "create" ? "Unsaved chatbot" : info.id || "Chatbot");
      const details = document.createElement("span");
      const fields = Object.keys(snapshot.fields || {});
      details.textContent = `${snapshot.reason} • ${formatTime(snapshot.savedAt)} • ${fields.length} field${fields.length === 1 ? "" : "s"}`;
      const fieldNames = document.createElement("span");
      fieldNames.textContent = fields.length ? fields.join(", ") : "No recognized fields";
      meta.append(rowTitle, details, fieldNames);

      const actions = document.createElement("div");
      actions.className = "ds-bot-editor-history-actions";
      actions.append(
        makeButton("Restore", () => {
          if (!confirm("Restore this snapshot into the currently open chatbot editor? Unsaved text currently in those fields will be replaced.")) return;
          const count = restoreSnapshot(snapshot);
          closeModal();
          DS.setQuickStatus?.(count ? `Restored ${count} editor field${count === 1 ? "" : "s"}. Review them before saving.` : "Could not match this snapshot to the current editor fields.");
        }),
        makeButton("Delete", async () => {
          historyStore.entries[info.key] = (historyStore.entries[info.key] || []).filter(item => item.id !== snapshot.id);
          if (!historyStore.entries[info.key].length) delete historyStore.entries[info.key];
          await saveStore();
          await openHistory();
          updateToolbarCount();
        })
      );

      row.append(meta, actions);
      listHost.appendChild(row);
    }

    const footer = document.createElement("div");
    footer.className = "ds-bot-editor-history-footer";
    footer.append(
      makeButton("Save snapshot now", async () => {
        await captureSnapshot("Manual snapshot");
        await openHistory();
      }),
      makeButton("Delete all for this bot", async () => {
        if (!list.length || !confirm("Delete all local editor snapshots for this bot/draft?")) return;
        delete historyStore.entries[info.key];
        await saveStore();
        await openHistory();
        updateToolbarCount();
      })
    );

    dialog.append(head, listHost, footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  function nativeSaveButton() {
    const info = editorInfo();
    const form = editorForm();
    if (!info || !form) return null;
    const buttons = [...form.querySelectorAll("button")].filter(button => {
      if (button.closest(`#${MODAL_ID}, #ds-qol-panel, .${TOOLBAR_CLASS}, .ds-bot-editor-save-actions`)) return false;
      const text = clean(button.textContent).toLowerCase();
      const aria = clean(button.getAttribute("aria-label")).toLowerCase();
      const key = clean(button.querySelector("[data-translate-key]")?.getAttribute("data-translate-key")).toLowerCase();
      if (info.mode === "draft") {
        return text === "update draft" || text === "save draft" || aria === "draft" || key.includes("draftbuttonlabel");
      }
      return ["save", "update", "create"].includes(text) || ["save", "update", "create"].includes(aria) ||
        /(?:^|[.:_-])(save|update|create)(?:$|[.:_-])/.test(key);
    });
    return buttons.find(button => button.type === "submit") || buttons[buttons.length - 1] || null;
  }

  function updateToolbarCount() {
    const info = editorInfo();
    const button = document.querySelector(`.${TOOLBAR_CLASS} [data-ds-editor-history-count]`);
    if (!button || !info) return;
    const count = Array.isArray(historyStore.entries?.[info.key]) ? historyStore.entries[info.key].length : 0;
    const text = count ? `History (${count})` : "History";
    if (button.textContent !== text) button.textContent = text;
  }

  function removeToolbar() {
    document.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach(element => element.remove());
    closeModal();
    DS.state.botEditorDraftHistoryWasActive = false;
  }

  async function ensureToolbar() {
    const info = editorInfo();
    if (!enabled() || !info) {
      removeToolbar();
      return;
    }

    DS.state.botEditorDraftHistoryWasActive = true;

    // The saved draft-history blob can be large. Do not make every normal
    // bot-editor QoL pass wait for browser storage before showing the toolbar.
    // The History/Snapshot actions still await the same shared load when needed.
    if (!storeLoaded) {
      void ensureStore().then(() => updateToolbarCount()).catch(() => {});
    }

    let toolbar = document.querySelector(`.${TOOLBAR_CLASS}`);
    const native = nativeSaveButton();
    if (!native?.parentElement) return;

    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = TOOLBAR_CLASS;
      toolbar.append(
        makeButton("Snapshot", () => captureSnapshot("Manual snapshot")),
        (() => {
          const button = makeButton("History", openHistory);
          button.dataset.dsEditorHistoryCount = "1";
          return button;
        })()
      );

      const saveTools = document.querySelector(".ds-bot-editor-save-actions");
      if (saveTools?.parentElement) saveTools.parentElement.insertBefore(toolbar, saveTools);
      else native.parentElement.insertBefore(toolbar, native);
    }

    updateToolbarCount();
  }

  document.addEventListener("click", event => {
    if (!enabled()) return;
    const button = event.target?.closest?.("button");
    if (!button || button.closest(`.${TOOLBAR_CLASS}, .ds-bot-editor-save-actions`)) return;
    const native = nativeSaveButton();
    if (!native || button !== native) return;
    if (Date.now() - lastNativeSaveSnapshotAt < 1200) return;
    lastNativeSaveSnapshotAt = Date.now();
    void captureSnapshot("Before save", true);
  }, true);

  DS.applyBotEditorDraftHistory = ensureToolbar;
  DS.removeBotEditorDraftHistory = removeToolbar;
})();
