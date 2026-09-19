(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const nodeState = new WeakMap();
  const stableState = new WeakMap();
  const queuedRoots = new WeakSet();
  const savedState = new Map();
  const suppressedSavedState = new Map();
  const failedSavedState = new Map();
  let lastSignature = "";
  let initializedRoute = "";
  let editQueue = Promise.resolve();
  let savedModeTimer = null;
  const dirtyRoots = new Set();

  function cleanRules(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));
  }

  function parseRegexLiteral(source) {
    if (!source.startsWith("/")) return null;

    let slash = -1;
    let escaped = false;
    for (let i = 1; i < source.length; i++) {
      const char = source[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "/") slash = i;
    }
    if (slash <= 0) return null;

    const pattern = source.slice(1, slash);
    let flags = source.slice(slash + 1).trim();
    if (!/^[dgimsuvy]*$/.test(flags)) return null;
    if (!flags.includes("g")) flags += "g";

    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function parseRules(value) {
    const parsed = [];
    for (const line of cleanRules(value)) {
      const divider = line.indexOf("=>");
      if (divider <= 0) continue;

      const find = line.slice(0, divider).trim();
      const replacement = line.slice(divider + 2).trim();
      if (!find) continue;

      const regex = parseRegexLiteral(find);
      if (regex) {
        parsed.push({ regex, replacement, source: line });
        continue;
      }

      try {
        parsed.push({
          regex: new RegExp(escapeRegExp(find), "gi"),
          replacement,
          source: line
        });
      } catch {}
    }
    return parsed;
  }

  function applyRules(text, rules) {
    let output = String(text || "");
    for (const rule of rules) {
      try {
        rule.regex.lastIndex = 0;
        output = output.replace(rule.regex, rule.replacement);
      } catch {}
    }
    return output;
  }

  function replacementSignature(settings) {
    return JSON.stringify([
      !!settings.enableChatTextReplacements,
      String(settings.chatTextReplacementRules || ""),
      String(settings.chatTextReplacementScope || "ai"),
      String(settings.chatTextReplacementMode || "display"),
      !!settings.chatTextReplacementPreview
    ]);
  }

  function getMessageRoots() {
    return [...document.querySelectorAll("div[id^='message-']")]
      .filter(root => !root.parentElement?.closest?.("div[id^='message-']"));
  }

  function messageIsAi(root) {
    return !!root?.querySelector?.("a[href*='/chatbot/'], a[aria-label='chatbot-profile']");
  }

  function scopeAllows(root, settings) {
    const scope = ["ai", "user", "both"].includes(settings.chatTextReplacementScope)
      ? settings.chatTextReplacementScope
      : "ai";
    if (scope === "both") return true;
    return scope === "ai" ? messageIsAi(root) : !messageIsAi(root);
  }

  function getMessageTextContainer(root) {
    if (!root) return null;
    const candidates = [...root.querySelectorAll("div")]
      .filter(el => {
        if (el.closest("#ds-qol-panel, #ds-chat-export-modal")) return false;
        if (!String(el.className || "").includes("overflow-wrap")) return false;
        return String(el.textContent || "").trim().length > 0;
      })
      .sort((a, b) => String(b.textContent || "").length - String(a.textContent || "").length);
    return candidates[0] || null;
  }

  function getVisibleMessageText(root) {
    const container = getMessageTextContainer(root);
    return String(container?.innerText || container?.textContent || "").trim();
  }

  function textNodesIn(container) {
    if (!container) return [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !String(node.nodeValue || "").trim()) return NodeFilter.FILTER_REJECT;
        if (parent.closest("button, [role='button'], input, textarea, select, script, style, noscript, svg")) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest(".ds-message-quick-actions, .ds-generation-metadata, .ds-replacement-undo")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    return nodes;
  }

  function restoreNode(node) {
    const saved = nodeState.get(node);
    if (!saved) return;
    if (node.nodeValue === saved.applied) node.nodeValue = saved.original;
    nodeState.delete(node);
  }

  function restoreDisplayChanges() {
    for (const root of getMessageRoots()) {
      const container = getMessageTextContainer(root);
      for (const node of textNodesIn(container)) restoreNode(node);
    }
  }

  DS.restoreChatTextReplacementsForMessage = function restoreChatTextReplacementsForMessage(root) {
    const container = getMessageTextContainer(root);
    for (const node of textNodesIn(container)) restoreNode(node);
    if (root instanceof Element) {
      delete root.dataset.dsTextReplacementReady;
      dirtyRoots.add(root);
    }
  };

  function applyDisplayMode(root, rules, signatureChanged) {
    const container = getMessageTextContainer(root);
    if (!container) return;

    for (const node of textNodesIn(container)) {
      const saved = nodeState.get(node);
      let original = String(node.nodeValue || "");

      if (saved && node.nodeValue === saved.applied) {
        original = saved.original;
      } else if (saved && node.nodeValue !== saved.applied) {
        nodeState.delete(node);
      }

      if (signatureChanged && saved && node.nodeValue === saved.applied) node.nodeValue = original;

      const applied = applyRules(original, rules);
      if (applied !== original) {
        if (node.nodeValue !== applied) node.nodeValue = applied;
        nodeState.set(node, { original, applied });
      } else {
        if (saved && node.nodeValue === saved.applied) node.nodeValue = original;
        nodeState.delete(node);
      }
    }
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function waitFor(find, timeout = 1800, interval = 40) {
    return new Promise(resolve => {
      const started = Date.now();
      const tick = () => {
        let found = null;
        try { found = find(); } catch {}
        if (found) return resolve(found);
        if (Date.now() - started >= timeout) return resolve(null);
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function visibleButton(label, scope = document) {
    const wanted = String(label || "").toLowerCase();
    return [...scope.querySelectorAll?.("button") || []].find(button => {
      const text = String(button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      return text === wanted && isVisible(button);
    }) || null;
  }

  function setNativeValue(control, value) {
    const proto = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) descriptor.set.call(control, value);
    else control.value = value;
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function cancelEdit(root) {
    const cancel = visibleButton("Cancel", root) || visibleButton("Cancel");
    try { cancel?.click(); } catch {}
  }

  async function openNativeEditor(root) {
    let dropdown = root.querySelector("button[aria-label='message-dropdown']");
    if (!dropdown) return { error: "message menu not found" };

    dropdown.click();
    const edit = await waitFor(() => visibleButton("Edit"), 1400);
    if (!edit) return { error: "Edit action not found" };
    edit.click();

    const opened = await waitFor(() => {
      const toolkitEditor = [...root.querySelectorAll(".sai-wysiwyg-editor[contenteditable='true']")].find(isVisible);
      if (toolkitEditor) {
        const adjacent = toolkitEditor.nextElementSibling?.tagName === "TEXTAREA" ? toolkitEditor.nextElementSibling : null;
        const textarea = adjacent || root.querySelector("textarea");
        return { textarea, editor: toolkitEditor };
      }
      const textarea = [...root.querySelectorAll("textarea")].find(isVisible);
      if (textarea) return { textarea, editor: null };
      const all = [...document.querySelectorAll("textarea")].filter(isVisible);
      const fallback = all.find(area => area.closest("div[id^='message-']") === root) || null;
      return fallback ? { textarea: fallback, editor: null } : null;
    }, 1800);

    if (!opened?.textarea && !opened?.editor) return { error: "message editor did not open" };
    return opened;
  }

  function setToolkitEditorValue(editor, textarea, value) {
    if (!editor) return;
    editor.textContent = value;
    try { editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value })); }
    catch { editor.dispatchEvent(new Event("input", { bubbles: true })); }
    if (textarea && String(textarea.value || "") !== value) setNativeValue(textarea, value);
  }

  async function commitNativeEdit(root, newTextOrTransform, options = {}) {
    const opened = await openNativeEditor(root);
    if (!opened.textarea && !opened.editor) return { ok: false, error: opened.error };

    const original = String(opened.textarea?.value ?? opened.editor?.innerText ?? opened.editor?.textContent ?? "");
    let newText = typeof newTextOrTransform === "function"
      ? newTextOrTransform(original)
      : String(newTextOrTransform ?? "");

    if (newText == null || newText === original) {
      cancelEdit(root);
      return { ok: false, unchanged: true, original };
    }

    if (options.preview) {
      const ok = window.confirm(`SpicyChat QoL wants to save this replacement into the message:\n\nBEFORE:\n${original}\n\nAFTER:\n${newText}`);
      if (!ok) {
        cancelEdit(root);
        return { ok: false, cancelled: true, original };
      }
    }

    if (opened.editor) {
      setToolkitEditorValue(opened.editor, opened.textarea, newText);
      await new Promise(resolve => setTimeout(resolve, 90));
    } else if (opened.textarea) {
      setNativeValue(opened.textarea, newText);
    }
    const save = await waitFor(() => visibleButton("Save", root) || visibleButton("Save"), 1200);
    if (!save) {
      cancelEdit(root);
      return { ok: false, error: "Save button not found", original };
    }

    save.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    return { ok: true, original, replaced: newText };
  }

  function updateUndoButton(messageId) {
    if (!messageId) return;
    const root = document.getElementById(messageId);
    const state = savedState.get(messageId);
    root?.querySelector?.(".ds-replacement-undo")?.remove();
    if (!root || !state) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-replacement-undo";
    button.textContent = "Undo replacement";
    button.title = "Restore the message text from before QoL replaced it";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      editQueue = editQueue.then(async () => {
        const currentRoot = document.getElementById(messageId);
        if (!currentRoot) return;
        const result = await commitNativeEdit(currentRoot, state.original);
        if (result.ok) {
          suppressedSavedState.set(messageId, state.signature || replacementSignature(DS.state?.settings || {}));
          savedState.delete(messageId);
          DS.setQuickStatus?.("Message replacement undone.");
          setTimeout(() => currentRoot.querySelector(".ds-replacement-undo")?.remove(), 50);
        } else {
          button.disabled = false;
          DS.setQuickStatus?.(`Could not undo replacement${result.error ? `: ${result.error}` : "."}`);
        }
      });
    });

    const header = root.querySelector(".ds-message-quick-actions")?.parentElement || root.querySelector("button[aria-label='message-dropdown']")?.parentElement;
    (header || root).appendChild(button);
  }

  function queueSavedReplacement(root, rules, settings) {
    if (!root?.id || queuedRoots.has(root)) return;
    const text = getVisibleMessageText(root);
    if (!text) return;

    const stable = stableState.get(root);
    if (!stable || stable.text !== text) {
      stableState.set(root, { text, at: Date.now() });
      clearTimeout(savedModeTimer);
      savedModeTimer = setTimeout(() => DS.applyChatTextReplacements?.(), 1250);
      return;
    }
    if (Date.now() - stable.at < 1200) {
      clearTimeout(savedModeTimer);
      savedModeTimer = setTimeout(() => DS.applyChatTextReplacements?.(), Math.max(80, 1250 - (Date.now() - stable.at)));
      return;
    }

    const replacement = applyRules(text, rules);
    if (replacement === text) return;

    const signature = replacementSignature(DS.state?.settings || settings);
    const prior = savedState.get(root.id);
    if (prior?.signature === signature || prior?.replaced === text) return;
    if (suppressedSavedState.get(root.id) === signature) return;

    const failed = failedSavedState.get(root.id);
    if (failed?.signature === signature && Date.now() - failed.at < 10000) return;

    queuedRoots.add(root);
    editQueue = editQueue.then(async () => {
      try {
        const currentRoot = document.getElementById(root.id);
        if (!currentRoot || !scopeAllows(currentRoot, DS.state?.settings || settings)) return;
        const currentText = getVisibleMessageText(currentRoot);
        const currentRules = parseRules(DS.state?.settings?.chatTextReplacementRules || settings.chatTextReplacementRules);
        const visibleWanted = applyRules(currentText, currentRules);
        if (!visibleWanted || visibleWanted === currentText) return;

        const result = await commitNativeEdit(
          currentRoot,
          raw => applyRules(raw, currentRules),
          { preview: !!DS.state?.settings?.chatTextReplacementPreview }
        );
        if (!result.ok) {
          if (result.cancelled) suppressedSavedState.set(currentRoot.id, signature);
          if (result.error) {
            failedSavedState.set(currentRoot.id, { signature, at: Date.now() });
            DS.setQuickStatus?.(`Replacement skipped: ${result.error}.`);
          }
          return;
        }

        failedSavedState.delete(currentRoot.id);
        savedState.set(currentRoot.id, {
          original: result.original,
          replaced: result.replaced,
          signature,
          at: Date.now()
        });
        DS.setQuickStatus?.("Replacement saved into the message.");
        setTimeout(() => updateUndoButton(currentRoot.id), 350);
      } finally {
        queuedRoots.delete(root);
      }
    });
  }

  function cleanup() {
    restoreDisplayChanges();
    document.querySelectorAll(".ds-replacement-undo").forEach(button => button.remove());
    clearTimeout(savedModeTimer);
    savedModeTimer = null;
    lastSignature = "";
    initializedRoute = "";
    dirtyRoots.clear();
    document.querySelectorAll("[data-ds-text-replacement-ready]").forEach(root => delete root.dataset.dsTextReplacementReady);
    failedSavedState.clear();
    DS.state.chatTextReplacementsWasActive = false;
  }

  DS.applyChatTextReplacements = function applyChatTextReplacements() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !DS.isSingleChatPage?.() || !settings.enableChatTextReplacements) {
      if (DS.state.chatTextReplacementsWasActive) cleanup();
      return;
    }

    const rules = parseRules(settings.chatTextReplacementRules);
    if (!rules.length) {
      if (DS.state.chatTextReplacementsWasActive) cleanup();
      return;
    }

    DS.state.chatTextReplacementsWasActive = true;
    const signature = replacementSignature(settings);
    const route = String(location.pathname || "");
    const signatureChanged = signature !== lastSignature || initializedRoute !== route;
    lastSignature = signature;
    initializedRoute = route;
    const mode = settings.chatTextReplacementMode === "save" ? "save" : "display";

    if (mode === "save" && signatureChanged) restoreDisplayChanges();

    let roots = [];
    if (signatureChanged) {
      roots = getMessageRoots();
    } else {
      const candidates = new Set(dirtyRoots);
      DS.getCurrentMessageLaneRoots?.().forEach(root => candidates.add(root));
      document.querySelectorAll("div[id^='message-']:not([data-ds-text-replacement-ready='1'])").forEach(root => {
        if (!root.parentElement?.closest?.("div[id^='message-']")) candidates.add(root);
      });
      roots = [...candidates].filter(root => root?.isConnected);
    }
    dirtyRoots.clear();

    for (const root of roots) {
      if (DS.isMessageEditPending?.(root)) continue;
      if (!scopeAllows(root, settings)) {
        const container = getMessageTextContainer(root);
        for (const node of textNodesIn(container)) restoreNode(node);
        root.dataset.dsTextReplacementReady = "1";
        continue;
      }

      if (mode === "display") applyDisplayMode(root, rules, signatureChanged);
      else queueSavedReplacement(root, rules, settings);

      if (savedState.has(root.id)) updateUndoButton(root.id);
      root.dataset.dsTextReplacementReady = "1";
    }
  };

  DS.removeChatTextReplacements = cleanup;

  let observerTimer = null;
  const replacementObserver = new MutationObserver(mutations => {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableChatTextReplacements || !DS.isSingleChatPage?.()) return;

    let affectsMessage = false;
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      const root = target?.closest?.("div[id^='message-']");
      if (root) { dirtyRoots.add(root); affectsMessage = true; }
      for (const node of mutation.addedNodes) {
        const el = node instanceof Element ? node : node.parentElement;
        const direct = el?.closest?.("div[id^='message-']");
        if (direct) { dirtyRoots.add(direct); affectsMessage = true; }
        el?.querySelectorAll?.("div[id^='message-']").forEach(messageRoot => { dirtyRoots.add(messageRoot); affectsMessage = true; });
      }
    }
    if (!affectsMessage) return;

    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => DS.applyChatTextReplacements?.(), 90);
  });

  replacementObserver.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true
  });
})();
