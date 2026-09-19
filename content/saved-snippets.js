(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const KEY = "savedTextSnippets";
  const MODAL_ID = "ds-saved-snippets-modal";

  function clean(value) {
    return String(value || "").replace(/\r\n/g, "\n").trim();
  }

  function normalize(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    return list.map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const text = clean(item.text);
      if (!text) return null;
      let id = String(item.id || `snippet-${Date.now()}-${index}`).trim();
      if (!id || seen.has(id)) id = `snippet-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      seen.add(id);
      return {
        id,
        name: clean(item.name) || `Snippet ${index + 1}`,
        text,
        createdAt: Number(item.createdAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now()
      };
    }).filter(Boolean);
  }

  async function read() {
    const result = await DS.storageGet?.([KEY]);
    return normalize(result?.[KEY]);
  }

  async function write(items, label = "Updated saved snippets") {
    const beforeResult = await DS.storageGet?.([KEY]);
    const before = normalize(beforeResult?.[KEY]);
    const after = normalize(items);
    await DS.storageSet?.({ [KEY]: after });
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await DS.recordLocalChange?.(label, { [KEY]: before }, { [KEY]: after });
    }
  }

  function editableFields() {
    return Array.from(document.querySelectorAll("textarea, input[type='text'], input:not([type]), [contenteditable='true'], [role='textbox']"))
      .filter(el => !el.closest(`#${MODAL_ID}, #ds-qol-panel, #ds-chat-export-modal`))
      .filter(el => {
        try {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 50 && r.height > 20 && s.display !== "none" && s.visibility !== "hidden";
        } catch { return false; }
      });
  }

  function composer() {
    const active = document.activeElement;
    if (active && editableFields().includes(active)) return active;
    return editableFields().sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
  }

  function dispatchInput(el, data) {
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data }));
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  DS.insertTextIntoComposer = DS.insertTextIntoComposer || function insertTextIntoComposer(text, { appendSpacing = false } = {}) {
    const value = String(text || "");
    if (!value) return false;
    const el = composer();
    if (!el) {
      DS.setQuickStatus?.("Could not find the chat message box.");
      return false;
    }

    el.focus();

    if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
      const selection = window.getSelection?.();
      let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!range || !el.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }
      const prefix = appendSpacing && clean(el.textContent) ? "\n\n" : "";
      const node = document.createTextNode(prefix + value);
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      dispatchInput(el, prefix + value);
      return true;
    }

    if ("value" in el) {
      const current = String(el.value || "");
      let start = Number.isInteger(el.selectionStart) ? el.selectionStart : current.length;
      let end = Number.isInteger(el.selectionEnd) ? el.selectionEnd : start;
      let insert = value;
      if (appendSpacing && start === current.length && clean(current)) insert = `\n\n${insert}`;
      const next = current.slice(0, start) + insert + current.slice(end);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, next); else el.value = next;
      const pos = start + insert.length;
      try { el.setSelectionRange(pos, pos); } catch {}
      dispatchInput(el, insert);
      return true;
    }

    return false;
  };

  function make(tag, attrs = {}, text = "") {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "className") el.className = value;
      else if (key === "type") el.type = value;
      else el.setAttribute(key, value);
    }
    if (text) el.textContent = text;
    return el;
  }

  async function openManager() {
    document.getElementById(MODAL_ID)?.remove();

    let items = await read();
    let editingId = "";
    let filter = "";

    const modal = make("div", { id: MODAL_ID, className: "ds-tool-modal" });
    const backdrop = make("div", { className: "ds-tool-modal-backdrop" });
    const dialog = make("div", { className: "ds-tool-modal-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Saved Snippets" });
    const head = make("div", { className: "ds-tool-modal-head" });
    head.append(make("h2", {}, "Saved Snippets"));
    const close = make("button", { type: "button", className: "ds-tool-modal-close", title: "Close" }, "×");
    head.append(close);

    const search = make("input", { type: "search", placeholder: "Search saved text...", className: "ds-tool-search" });
    const editor = make("div", { className: "ds-tool-editor" });
    const name = make("input", { type: "text", placeholder: "Snippet name" });
    const text = make("textarea", { placeholder: "Text to save...", rows: "4" });
    const editorActions = make("div", { className: "ds-tool-actions" });
    const save = make("button", { type: "button" }, "Save snippet");
    const draft = make("button", { type: "button" }, "Use current draft");
    const cancel = make("button", { type: "button" }, "Cancel edit");
    cancel.hidden = true;
    editorActions.append(save, draft, cancel);
    editor.append(name, text, editorActions);

    const list = make("div", { className: "ds-tool-list" });
    const empty = make("p", { className: "ds-tool-empty" }, "No saved snippets yet.");

    function render() {
      const q = filter.toLowerCase();
      const shown = items.filter(item => !q || `${item.name}\n${item.text}`.toLowerCase().includes(q));
      list.replaceChildren();
      if (!shown.length) {
        empty.textContent = items.length ? "No snippets match that search." : "No saved snippets yet.";
        list.append(empty);
        return;
      }
      shown.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).forEach(item => {
        const card = make("div", { className: "ds-tool-item" });
        const title = make("strong", {}, item.name);
        const preview = make("div", { className: "ds-tool-item-text" }, item.text);
        const actions = make("div", { className: "ds-tool-actions" });
        const insert = make("button", { type: "button" }, "Insert");
        const edit = make("button", { type: "button" }, "Edit");
        const del = make("button", { type: "button", className: "ds-danger" }, "Delete");
        insert.addEventListener("click", () => {
          if (DS.insertTextIntoComposer?.(item.text)) {
            DS.setQuickStatus?.(`Inserted ${item.name}.`);
            modal.remove();
          }
        });
        edit.addEventListener("click", () => {
          editingId = item.id;
          name.value = item.name;
          text.value = item.text;
          save.textContent = "Save changes";
          cancel.hidden = false;
          name.focus();
        });
        del.addEventListener("click", async () => {
          items = items.filter(entry => entry.id !== item.id);
          await write(items);
          render();
        });
        actions.append(insert, edit, del);
        card.append(title, preview, actions);
        list.append(card);
      });
    }

    async function saveEditor() {
      const snippetText = clean(text.value);
      if (!snippetText) {
        text.focus();
        return;
      }
      const now = Date.now();
      if (editingId) {
        items = items.map(item => item.id === editingId ? {
          ...item,
          name: clean(name.value) || item.name,
          text: snippetText,
          updatedAt: now
        } : item);
      } else {
        items.push({
          id: `snippet-${now}-${Math.random().toString(36).slice(2, 8)}`,
          name: clean(name.value) || `Snippet ${items.length + 1}`,
          text: snippetText,
          createdAt: now,
          updatedAt: now
        });
      }
      await write(items);
      editingId = "";
      name.value = "";
      text.value = "";
      save.textContent = "Save snippet";
      cancel.hidden = true;
      render();
    }

    save.addEventListener("click", saveEditor);
    draft.addEventListener("click", () => {
      const el = composer();
      const value = el ? ("value" in el ? el.value : el.textContent) : "";
      if (clean(value)) text.value = String(value);
      else DS.setQuickStatus?.("The current draft is empty.");
    });
    cancel.addEventListener("click", () => {
      editingId = "";
      name.value = "";
      text.value = "";
      save.textContent = "Save snippet";
      cancel.hidden = true;
    });
    search.addEventListener("input", () => { filter = search.value || ""; render(); });
    close.addEventListener("click", () => modal.remove());
    backdrop.addEventListener("click", () => modal.remove());
    modal.addEventListener("keydown", event => { if (event.key === "Escape") modal.remove(); });

    dialog.append(head, search, editor, list);
    modal.append(backdrop, dialog);
    document.documentElement.append(modal);
    render();
    search.focus();
  }

  DS.openSavedSnippets = openManager;
  DS.normalizeSavedTextSnippets = normalize;
})();
