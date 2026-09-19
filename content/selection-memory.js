(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const MESSAGE_SELECTOR = "div[id^='message-']";
  const ACTION_ID = "ds-selection-remember-action";
  const MODAL_ID = "ds-selection-remember-modal";
  const MAX_TEXT = 1200;
  let currentSelection = null;
  let updateTimer = null;

  function clean(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\u200b/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function visible(el) {
    if (!el?.isConnected) return false;
    try {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      const rect = el.getBoundingClientRect();
      return !!(rect.width || rect.height);
    } catch {
      return false;
    }
  }

  function messageRootFromNode(node) {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return el?.closest?.(MESSAGE_SELECTOR) || null;
  }

  function messageRole(root) {
    return root?.querySelector?.("a[href*='/chatbot/'], a[aria-label='chatbot-profile']") ? "AI" : "You";
  }

  function captureSelection() {
    if (!DS.state?.settings?.enabled || !DS.state?.settings?.enableSelectionRemember || !DS.isSingleChatPage?.()) return null;
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const startRoot = messageRootFromNode(range.startContainer);
    const endRoot = messageRootFromNode(range.endContainer);
    if (!startRoot || startRoot !== endRoot) return null;
    if (startRoot.closest?.(`#${MODAL_ID}`) || startRoot.closest?.(`#${ACTION_ID}`)) return null;

    const text = clean(selection.toString()).slice(0, MAX_TEXT);
    if (!text || text.length < 2) return null;

    let rect = null;
    try {
      const raw = range.getBoundingClientRect();
      if (raw && Number.isFinite(raw.left) && Number.isFinite(raw.top)) {
        rect = { left: raw.left, right: raw.right, top: raw.top, bottom: raw.bottom, width: raw.width, height: raw.height };
      }
    } catch {}

    const fullText = clean(
      typeof DS.getCachedMessageText === "function"
        ? DS.getCachedMessageText(startRoot)
        : startRoot.textContent || ""
    ).slice(0, 4000);

    return {
      text,
      fullText,
      role: messageRole(startRoot),
      messageId: String(startRoot.id || "").replace(/^message-/, ""),
      rect
    };
  }

  function removeAction() {
    document.getElementById(ACTION_ID)?.remove();
  }

  function positionAction(button, rect) {
    const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
    const compact = window.innerWidth <= 720 || !!env.android || !!env.webview;
    if (compact || !rect) {
      button.classList.add("ds-selection-remember-mobile");
      return;
    }

    button.classList.remove("ds-selection-remember-mobile");
    const margin = 10;
    const width = 126;
    const estimatedHeight = 38;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left + (rect.width / 2) - (width / 2)));
    let top = rect.bottom + 8;
    if (top + estimatedHeight > window.innerHeight - margin) top = Math.max(margin, rect.top - estimatedHeight - 8);
    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
  }

  function showAction(snapshot) {
    removeAction();
    currentSelection = snapshot;
    if (!snapshot) return;

    const button = document.createElement("button");
    button.id = ACTION_ID;
    button.type = "button";
    button.className = "ds-selection-remember-action";
    button.textContent = "Remember";
    button.title = "Review this selected message text before saving it";
    button.setAttribute("aria-label", "Remember selected chat text");
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const saved = currentSelection;
      removeAction();
      if (saved?.text) openPreview(saved);
    });

    document.documentElement.appendChild(button);
    positionAction(button, snapshot.rect);
  }

  function scheduleSelectionCheck(delay = 80) {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      if (document.getElementById(MODAL_ID)) return;
      const snapshot = captureSelection();
      if (snapshot) showAction(snapshot);
      else removeAction();
    }, delay);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    try {
      const box = document.createElement("textarea");
      box.value = text;
      box.readOnly = true;
      box.style.position = "fixed";
      box.style.left = "-9999px";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      box.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  function make(tag, attrs = {}, text = "") {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "className") el.className = value;
      else if (key === "type") el.type = value;
      else if (key === "rows") el.rows = value;
      else el.setAttribute(key, value);
    }
    if (text) el.textContent = text;
    return el;
  }

  function accessibleText(el) {
    return clean(`${el?.getAttribute?.("aria-label") || ""} ${el?.getAttribute?.("title") || ""} ${el?.textContent || ""}`).toLowerCase();
  }

  function findMemoryLauncher() {
    const translated = [...document.querySelectorAll("[data-translate-key]")].filter(visible).find(el => {
      const key = String(el.getAttribute("data-translate-key") || "").toLowerCase();
      return key.includes("memor") && !/(delete|pin|unpin|loadmore|edit|save|cancel)/.test(key);
    });
    const translatedButton = translated?.closest?.("button, [role='button'], [role='menuitem'], a");
    if (translatedButton && visible(translatedButton) && !translatedButton.closest?.(`#${MODAL_ID}`)) return translatedButton;

    const candidates = [...document.querySelectorAll("button, [role='button'], [role='menuitem'], a")].filter(visible);
    return candidates.find(el => {
      if (el.closest?.(".ds-tool-modal, .ds-message-quick-actions")) return false;
      const label = accessibleText(el);
      return label === "memory" || label === "memories" || label === "memory manager" || label === "manage memories" || label === "chat memory" || label === "chat memories" || /\bmanage memor(?:y|ies)\b/.test(label);
    }) || null;
  }

  function findChatDropdownButton() {
    const direct = document.querySelector('button[aria-label="chat-dropdown"]');
    if (direct && visible(direct)) return direct;
    return [...document.querySelectorAll("button")].filter(visible).find(button => {
      if (button.closest?.(".ds-tool-modal, #ds-qol-panel")) return false;
      const label = accessibleText(button);
      if (label === "chat menu" || label === "more chat options") return true;
      return !!button.querySelector("svg.lucide-ellipsis, svg[class*='lucide-ellipsis'], svg[data-lucide='ellipsis']");
    }) || null;
  }

  async function openMemoryManager() {
    let manager = findMemoryManager();
    if (manager) return manager;

    let launcher = findMemoryLauncher();
    if (!launcher) {
      const chatMenu = findChatDropdownButton();
      if (chatMenu) {
        try {
          if (typeof DS.realClick === "function") DS.realClick(chatMenu);
          else chatMenu.click();
        } catch { try { chatMenu.click(); } catch {} }
        launcher = await waitFor(findMemoryLauncher, 1600, 60);
      }
    }

    if (!launcher) return null;
    try {
      if (typeof DS.realClick === "function") DS.realClick(launcher);
      else launcher.click();
    } catch { try { launcher.click(); } catch {} }
    manager = await waitFor(findMemoryManager, 3200, 70);
    return manager || null;
  }

  function findMemoryManager() {
    const direct = document.querySelector('[data-testid="ChatMemoryManagerCapabilityGate"]');
    if (direct && visible(direct)) return direct;
    return [...document.querySelectorAll("[role='dialog'], [data-testid*='memor' i], div.fixed")]
      .filter(visible)
      .reverse()
      .find(el => /\bmemor(?:y|ies)\b/i.test(accessibleText(el)) && !el.closest?.(`#${MODAL_ID}`)) || null;
  }

  function findAddMemoryButton(manager) {
    if (!manager) return null;
    const translated = [...manager.querySelectorAll("[data-translate-key]")].find(el => {
      const key = String(el.getAttribute("data-translate-key") || "").toLowerCase();
      return key.includes("memor") && (key.includes("add") || key.includes("new") || key.includes("create"));
    });
    const translatedButton = translated?.closest?.("button, [role='button']");
    if (translatedButton && visible(translatedButton)) return translatedButton;

    const candidates = [...manager.querySelectorAll("button, [role='button']")].filter(visible).filter(el => {
      if (el.closest?.("#ds-memory-bulk-toolbar")) return false;
      if (el.matches?.("button[data-slot='trigger'][aria-haspopup='true']")) return false;
      return true;
    });

    const labelled = candidates.find(el => {
      const label = accessibleText(el);
      const testId = String(el.getAttribute?.("data-testid") || "").toLowerCase();
      return /^(add|new|create)( memory)?$/.test(label) || /^\+\s*(add )?memory$/.test(label) || /\b(add|new|create) memor(?:y|ies)\b/.test(label) || (/memor/.test(testId) && /(add|new|create)/.test(testId));
    });
    if (labelled) return labelled;

    // SpicyChat has used an icon-only plus button here in some layouts.
    return candidates.find(el => {
      const plus = el.querySelector("svg.lucide-plus, svg[class*='lucide-plus'], svg[data-lucide='plus']");
      if (!plus) return false;
      const label = accessibleText(el);
      return !/load more|delete|close|cancel/.test(label);
    }) || null;
  }

  function readEditorValue(control) {
    if (!control) return "";
    if (control.isContentEditable || (control.getAttribute?.("role") === "textbox" && !(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement))) {
      return String(control.textContent || "");
    }
    return String(control.value || "");
  }

  function setNativeValue(control, value) {
    if (!control) return false;
    const textBoxLike = control.isContentEditable || (control.getAttribute?.("role") === "textbox" && !(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement));
    if (textBoxLike) {
      try {
        control.focus();
        control.textContent = value;
        try {
          control.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        } catch {
          control.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return clean(readEditorValue(control)) === clean(value);
      } catch { return false; }
    }
    try {
      const proto = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(control, value);
      else control.value = value;
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return clean(readEditorValue(control)) === clean(value);
    } catch {
      try {
        control.value = value;
        control.dispatchEvent(new Event("input", { bubbles: true }));
        return clean(readEditorValue(control)) === clean(value);
      } catch {
        return false;
      }
    }
  }

  function waitFor(predicate, timeoutMs = 1500, intervalMs = 60) {
    return new Promise(resolve => {
      const started = Date.now();
      const check = () => {
        let result = null;
        try { result = predicate(); } catch {}
        if (result) return resolve(result);
        if (Date.now() - started >= timeoutMs) return resolve(null);
        setTimeout(check, intervalMs);
      };
      check();
    });
  }

  function findMemoryEditor() {
    const roots = [
      ...document.querySelectorAll("[role='dialog'], [role='alertdialog'], [data-testid*='Memory' i], [data-testid*='memory' i], [aria-modal='true']"),
      findMemoryManager()
    ].filter(Boolean).filter(visible).reverse();
    for (const root of roots) {
      if (root.closest?.(`#${MODAL_ID}`)) continue;
      const controls = [...root.querySelectorAll("textarea, input[type='text'], [contenteditable='true'], [role='textbox']")]
        .filter(visible)
        .filter(el => !el.closest?.("form[data-ds-chat-composer], #ds-selection-remember-modal"));
      const preferred = controls.find(el => {
        const label = accessibleText(el);
        const name = String(el.getAttribute?.("name") || "").toLowerCase();
        const placeholder = String(el.getAttribute?.("placeholder") || "").toLowerCase();
        const testId = String(el.getAttribute?.("data-testid") || "").toLowerCase();
        return /memor/.test(`${label} ${name} ${placeholder} ${testId}`);
      });
      if (preferred) return preferred;
      const fallback = controls.find(el => el.tagName === "TEXTAREA" || el.isContentEditable || el.getAttribute?.("role") === "textbox");
      if (fallback) return fallback;
    }
    return null;
  }

  async function prepareSpicyChatMemory(text) {
    const copied = await copyText(text);

    // If the Add/Edit Memory editor is already open, fill it directly rather than
    // clicking around and risking closing the user's current Memory UI.
    let editor = findMemoryEditor();
    if (editor) {
      const existingValue = clean(readEditorValue(editor));
      if (existingValue && existingValue !== clean(text)) {
        DS.setQuickStatus?.(copied
          ? "The open SpicyChat Memory draft already contains text, so QoL left it untouched and copied the reviewed selection instead."
          : "The open SpicyChat Memory draft already contains text, so QoL left it untouched.");
        return { prepared: false, copied, reason: "existing-draft" };
      }
      if (setNativeValue(editor, text)) {
        try { editor.focus({ preventScroll: false }); } catch { try { editor.focus(); } catch {} }
        DS.setQuickStatus?.("Filled the open SpicyChat Memory editor for review. Nothing was saved automatically.");
        return { prepared: true, copied, path: "existing-editor" };
      }
    }

    const manager = await openMemoryManager();

    if (manager) {
      editor = findMemoryEditor();
      if (!editor) {
        const addButton = findAddMemoryButton(manager);
        if (addButton) {
          try {
            if (typeof DS.realClick === "function") DS.realClick(addButton);
            else addButton.click();
          } catch { try { addButton.click(); } catch {} }
          editor = await waitFor(findMemoryEditor, 3200, 70);
        }
      }

      if (editor && setNativeValue(editor, text)) {
        await new Promise(resolve => setTimeout(resolve, 80));
        const currentValue = clean(readEditorValue(editor));
        if (currentValue === clean(text)) {
          try { editor.focus({ preventScroll: false }); } catch { try { editor.focus(); } catch {} }
          DS.setQuickStatus?.("Prepared a SpicyChat Memory for review. Nothing was saved automatically.");
          return { prepared: true, copied, path: "opened-editor" };
        }
      }
    }

    DS.setQuickStatus?.(copied
      ? "Copied the reviewed text. SpicyChat's current Memory editor could not be filled automatically."
      : "SpicyChat's current Memory editor could not be filled automatically; copy the reviewed text manually.");
    return { prepared: false, copied };
  }

  DS.prepareSpicyChatMemory = prepareSpicyChatMemory;

  function openPreview(snapshot) {
    document.getElementById(MODAL_ID)?.remove();

    const modal = make("div", { id: MODAL_ID, className: "ds-tool-modal" });
    const backdrop = make("div", { className: "ds-tool-modal-backdrop" });
    const dialog = make("div", { className: "ds-tool-modal-dialog ds-selection-remember-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Remember selected chat text" });
    const head = make("div", { className: "ds-tool-modal-head" });
    head.append(make("h2", {}, "Remember selection"));
    const close = make("button", { type: "button", className: "ds-tool-modal-close" }, "×");
    head.append(close);

    const note = make("p", { className: "ds-tool-note" }, `Selected from ${snapshot.role || "a chat message"}. Review or shorten it first; QoL will not generate a summary or save anything until you choose an action.`);
    const area = make("textarea", { rows: "6", maxlength: String(MAX_TEXT), "aria-label": "Selected text to remember" });
    area.value = snapshot.text;
    const status = make("p", { className: "ds-tool-status" });
    const actions = make("div", { className: "ds-tool-actions ds-selection-remember-actions" });
    const keep = make("button", { type: "button" }, "Save to Context Keeper");
    const memory = make("button", { type: "button" }, "Prepare SpicyChat Memory");
    const both = make("button", { type: "button" }, "Save + prepare Memory");
    const copy = make("button", { type: "button" }, "Copy text");
    const whole = snapshot.fullText && clean(snapshot.fullText) !== clean(snapshot.text)
      ? make("button", { type: "button" }, "Use whole message")
      : null;
    if (!DS.state?.settings?.enableContextKeeper) {
      keep.disabled = true;
      both.disabled = true;
      keep.title = "Enable Context Keeper to save selections there";
      both.title = "Enable Context Keeper to save the reviewed text there too";
    }
    if (whole) actions.append(whole);
    actions.append(keep, both, memory, copy);

    const value = () => clean(area.value).slice(0, MAX_TEXT);

    whole?.addEventListener("click", () => {
      area.value = clean(snapshot.fullText).slice(0, MAX_TEXT);
      status.textContent = "Using the full message. Review or shorten it before saving.";
      whole.disabled = true;
    });

    keep.addEventListener("click", async () => {
      const text = value();
      if (!text) { status.textContent = "Nothing to save."; return; }
      if (typeof DS.addContextKeeperDetails !== "function") {
        status.textContent = "Context Keeper is not available on this page yet.";
        return;
      }
      keep.disabled = true;
      const result = await DS.addContextKeeperDetails([{
        text,
        source: "selection",
        messageId: snapshot.messageId || "",
        role: snapshot.role || ""
      }], { source: "selection" });
      keep.disabled = false;
      if (result?.added) {
        DS.setQuickStatus?.("Saved selected text to Context Keeper.");
        modal.remove();
      } else {
        status.textContent = "That detail is already saved, or is very similar to one you kept before.";
      }
    });

    both.addEventListener("click", async () => {
      const text = value();
      if (!text) { status.textContent = "Nothing to save or prepare."; return; }
      if (typeof DS.addContextKeeperDetails !== "function") {
        status.textContent = "Context Keeper is not available on this page yet.";
        return;
      }
      both.disabled = true;
      status.textContent = "Saving to Context Keeper and preparing SpicyChat Memory…";
      const saved = await DS.addContextKeeperDetails([{
        text,
        source: "selection",
        messageId: snapshot.messageId || "",
        role: snapshot.role || ""
      }], { source: "selection" });
      const prepared = await prepareSpicyChatMemory(text);
      both.disabled = false;
      if (saved?.added && prepared?.prepared) {
        DS.setQuickStatus?.("Saved to Context Keeper and prepared a SpicyChat Memory for review. Nothing was saved to SpicyChat automatically.");
        modal.remove();
        return;
      }
      const savedText = saved?.added ? "Saved to Context Keeper." : "Context Keeper already had a matching detail.";
      const memoryText = prepared?.prepared
        ? " SpicyChat Memory is ready for review."
        : prepared?.copied
          ? " The text was copied because the Memory editor could not be prepared automatically."
          : " SpicyChat Memory could not be prepared automatically.";
      status.textContent = savedText + memoryText;
    });

    memory.addEventListener("click", async () => {
      const text = value();
      if (!text) { status.textContent = "Nothing to prepare."; return; }
      memory.disabled = true;
      status.textContent = "Preparing SpicyChat Memory…";
      const result = await prepareSpicyChatMemory(text);
      memory.disabled = false;
      if (result.prepared) modal.remove();
      else status.textContent = result.copied
        ? "Copied. Open SpicyChat Memories and paste the reviewed text."
        : "Automatic preparation was not available; use Copy text and paste it into SpicyChat Memories.";
    });

    copy.addEventListener("click", async () => {
      const ok = await copyText(value());
      status.textContent = ok ? "Copied." : "Could not copy the text.";
    });

    const dismiss = () => modal.remove();
    close.addEventListener("click", dismiss);
    backdrop.addEventListener("click", dismiss);
    modal.addEventListener("keydown", event => { if (event.key === "Escape") dismiss(); });

    dialog.append(head, note, area, status, actions);
    modal.append(backdrop, dialog);
    document.documentElement.appendChild(modal);
    setTimeout(() => { try { area.focus(); area.setSelectionRange(area.value.length, area.value.length); } catch {} }, 20);
  }

  function bind() {
    if (DS.state.selectionRememberWasActive) return;
    DS.state.selectionRememberWasActive = true;
    document.addEventListener("selectionchange", onSelectionChange, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("touchend", onTouchEnd, true);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange, true);
  }

  function unbind() {
    if (!DS.state.selectionRememberWasActive) return;
    DS.state.selectionRememberWasActive = false;
    document.removeEventListener("selectionchange", onSelectionChange, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("touchend", onTouchEnd, true);
    window.removeEventListener("scroll", onViewportChange, true);
    window.removeEventListener("resize", onViewportChange, true);
    clearTimeout(updateTimer);
    currentSelection = null;
    removeAction();
    document.getElementById(MODAL_ID)?.remove();
  }

  function onSelectionChange() { scheduleSelectionCheck(110); }
  function onPointerUp() { scheduleSelectionCheck(45); }
  function onTouchEnd() { scheduleSelectionCheck(140); }
  function onViewportChange() { removeAction(); }

  DS.applySelectionRemember = function applySelectionRemember() {
    const enabled = !!(DS.state?.settings?.enabled && DS.state?.settings?.enableSelectionRemember && DS.isSingleChatPage?.());
    if (enabled) bind();
    else unbind();
  };

  DS.removeSelectionRemember = unbind;
})();
