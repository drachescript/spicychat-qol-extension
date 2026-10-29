// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
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
  const selfWrittenTextNodes = new WeakSet();
  const PROFILE_SELECTION_KEY = "dsChatReplacementSelectedPresetsV1";
  let profileSelection = null;
  let profileLoading = null;
  const revealedMessageIds = new Set();
  let censorToggleRoute = "";
  function censorExclusions(settings) {
    try { const obj = JSON.parse(settings.chatWordCensorExcludedChats || "{}"); return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {}; }
    catch { return {}; }
  }
  function isCensorEnabled(settings) {
    return settings.enableChatWordCensor === true && !censorExclusions(settings)[location.pathname];
  }
  function censorScopeAllows(root, settings) {
    const scope = settings.chatWordCensorScope || "ai";
    return scope === "both" || (scope === "ai" ? messageIsAi(root) : !messageIsAi(root));
  }
  function ensureCensorToggle(settings) {
    let toggle = document.getElementById("ds-chat-censor-toggle");
    if (!settings.enabled || !DS.isSingleChatPage?.() || !settings.enableChatWordCensor || settings.chatWordCensorShowChatToggle === false) {
      toggle?.remove(); return;
    }
    const host = document.querySelector(".ds-chat-title-actions-host") || document.querySelector("a[aria-label='chatbot-profile']")?.parentElement;
    if (!host) return;
    if (!toggle) {
      toggle = document.createElement("button"); toggle.type = "button"; toggle.id = "ds-chat-censor-toggle";
      toggle.className = "ds-chat-censor-toggle"; toggle.dataset.dsOwned = "1";
      toggle.style.cssText = "border:1px solid #64748b;border-radius:7px;padding:5px 8px;background:#222;color:inherit;cursor:pointer;font:12px system-ui";
      toggle.addEventListener("click", async () => {
        const settingsNow = DS.state?.settings || {};
        const path = location.pathname;
        const excluded = censorExclusions(settingsNow);
        if (excluded[path]) delete excluded[path]; else excluded[path] = true;
        const value = JSON.stringify(Object.fromEntries(Object.entries(excluded).slice(-300)));
        try {
          if (DS.saveSettingsPatch) await DS.saveSettingsPatch({ chatWordCensorExcludedChats: value });
          else { DS.state.settings.chatWordCensorExcludedChats = value; await DS.storageSet?.({ settings: DS.state.settings }); }
          DS.state.settings.chatWordCensorExcludedChats = value;
          restoreDisplayChanges(); lastSignature = "";
          DS.applyChatTextReplacements?.();
        } catch (error) { DS.setQuickStatus?.("Could not save censor choice: " + (error?.message || error)); }
      });
    }
    if (toggle.parentElement !== host) host.append(toggle);
    const disabled = !!censorExclusions(settings)[location.pathname];
    toggle.textContent = disabled ? "Censor off" : "Censor on";
    toggle.title = disabled ? "Enable the word censor in this chat" : "Exclude this chat from word censoring";
    toggle.setAttribute("aria-pressed", disabled ? "false" : "true");
    censorToggleRoute = location.pathname;
  }

  async function loadProfileSelections() {
    if (profileSelection !== null) return;
    if (profileLoading) return profileLoading;
    profileLoading = (async () => {
      try {
        const stored = DS.state?.settings?.chatTextReplacementChatAssignments;
        if (stored) profileSelection = JSON.parse(stored);
        else { const result = await DS.storageGet?.([PROFILE_SELECTION_KEY]); profileSelection = result?.[PROFILE_SELECTION_KEY] || {}; }
        if (!profileSelection || typeof profileSelection !== "object") profileSelection = {};
      } catch { profileSelection = {}; }
      finally { profileLoading = null; }
    })();
    return profileLoading;
  }
  function availablePresets(raw) {
    const presets = new Map(); let current = "";
    for (const rawLine of String(raw || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      const header = /^\[([^\]\r\n]{1,60})\]$/.exec(line);
      if (header) { current = header[1]; if (!presets.has(current)) presets.set(current, []); }
      else if (current && line && !line.startsWith("#") && line.includes("=>")) presets.get(current).push(line);
    }
    return presets;
  }
  function selectedPresetRules(settings) {
    const selected = String(profileSelection?.[location.pathname] || "");
    const presets = availablePresets(settings.chatTextReplacementPresets);
    return presets.get(selected)?.join("\n") || "";
  }
  function mutedRules(settings) {
    if (!settings.enableChatMutedWords) return "";
    return String(settings.chatMutedWords || "").split(/\r?\n/).map(line => line.trim())
      .filter(line => line && !line.startsWith("#") && line.length <= 120)
      .map(line => `${line} => `).join("\n");
  }
  function combinedDisplayRules(settings) {
    return [settings.enableChatTextReplacements ? settings.chatTextReplacementRules : "", selectedPresetRules(settings), mutedRules(settings)]
      .filter(Boolean).join("\n");
  }
  function ensurePresetSelector(settings) {
    let select = document.getElementById("ds-chat-replacement-preset");
    const enabled = !!settings.chatTextReplacementShowChatPresetControl && !!settings.enableChatTextReplacements;
    if (!enabled) { select?.remove(); return; }
    const host = document.querySelector("button[aria-label='chat-dropdown']")?.parentElement;
    if (!host) return;
    if (!select) {
      select = document.createElement("select"); select.id = "ds-chat-replacement-preset";
      select.setAttribute("aria-label", "Replacement preset for this chat"); select.title = "Local replacement rules for this chat";
      select.addEventListener("change", async () => {
        profileSelection = profileSelection || {};
        if (select.value) profileSelection[location.pathname] = select.value;
        else delete profileSelection[location.pathname];
        profileSelection = Object.fromEntries(Object.entries(profileSelection).slice(-300));
        if (DS.saveSettingsPatch) await DS.saveSettingsPatch({ chatTextReplacementChatAssignments: JSON.stringify(profileSelection) });
        else await DS.storageSet?.({ [PROFILE_SELECTION_KEY]: profileSelection });
        restoreDisplayChanges(); lastSignature = "";
        DS.applyChatTextReplacements?.();
      });
    }
    const presets = availablePresets(settings.chatTextReplacementPresets);
    const old = [...select.options].map(item => item.value).join("|");
    const wanted = ["", ...presets.keys()].join("|");
    if (old !== wanted) {
      select.replaceChildren();
      for (const key of ["", ...presets.keys()]) {
        const option = document.createElement("option"); option.value = key; option.textContent = key || "Global replacements";
        select.appendChild(option);
      }
    }
    select.value = profileSelection?.[location.pathname] || "";
    if (select.parentElement !== host) host.appendChild(select);
  }

  function writeTextNode(node, value) {
    if (!node || node.nodeValue === value) return false;
    selfWrittenTextNodes.add(node);
    node.nodeValue = value;
    return true;
  }

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

  let cachedCensorKey = "";
  let cachedCensorRules = [];
  function parseCensorRules(settings, { ignoreChatExclusion = false } = {}) {
    if (!settings.enableChatWordCensor || (!ignoreChatExclusion && !isCensorEnabled(settings))) return [];
    const signature = [settings.chatWordCensorList, settings.chatWordCensorMask, settings.chatWordCensorCustom].join("\u0000");
    if (signature === cachedCensorKey) return cachedCensorRules;
    const names = [...new Set(String(settings.chatWordCensorList || "").split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#") && s.length <= 120))].slice(0,200);
    const kind = settings.chatWordCensorMask || "hash";
    const replacement = kind === "stars" ? "***" : kind === "bracket" ? "[censored]" : kind === "custom" ? String(settings.chatWordCensorCustom || "[censored]").slice(0,60) : "###";
    cachedCensorKey = signature;
    return cachedCensorRules = names.map(word => {
      const literal = escapeRegExp(word).replace(/\s+/g, "\\s+");
      try { return { regex: new RegExp(`(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])`, "giu"), replacement, isCensor: true }; }
      catch { return null; }
    }).filter(Boolean);
  }
  function hasCensorMatch(text, rules) {
    return rules.some(rule => { rule.regex.lastIndex = 0; return rule.regex.test(text); });
  }
  DS.censorChatExportText = (text, speaker, settings = DS.state?.settings || {}) => {
    const rules = parseCensorRules(settings, { ignoreChatExclusion: true });
    const scope = settings.chatWordCensorScope || "ai";
    const isUser = /^(user|you|human)$/i.test(String(speaker || ""));
    if (!rules.length || (scope === "ai" && isUser) || (scope === "user" && !isUser)) return text;
    return applyRules(text, rules);
  };
  function applyRules(text, rules) {
    let output = String(text || "");
    for (const rule of rules) {
      try {
        rule.regex.lastIndex = 0;
        output = output.replace(rule.regex, rule.isCensor ? () => rule.replacement : rule.replacement);
      } catch {}
    }
    return output;
  }

  function replacementSignature(settings) {
    return JSON.stringify([
      !!settings.enableChatTextReplacements,
      String(settings.chatTextReplacementRules || ""),
      String(settings.chatMutedWords || ""), !!settings.enableChatMutedWords,
      String(settings.chatTextReplacementPresets || ""), selectedPresetRules(settings),
      String(settings.chatTextReplacementScope || "ai"),
      String(settings.chatTextReplacementMode || "display"),
      !!settings.chatTextReplacementPreview,
      !!settings.enableChatWordCensor, settings.chatWordCensorList || "", settings.chatWordCensorMask || "hash",
      settings.chatWordCensorCustom || "", settings.chatWordCensorScope || "ai",
      settings.chatWordCensorExcludedChats || "", settings.chatWordCensorReveal !== false
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

  DS.getOriginalChatDisplayNodeText = node => {
    const prior = nodeState.get(node);
    return prior && node?.nodeValue === prior.applied ? prior.original : node?.nodeValue || "";
  };
  function restoreNode(node) {
    const saved = nodeState.get(node);
    if (!saved) return;
    if (node.nodeValue === saved.applied) writeTextNode(node, saved.original);
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

  function updateCensorReveal(root, censorRules, settings) {
    if (!root?.id) return;
    let b = root.querySelector(".ds-chat-censor-reveal");
    const key = location.pathname + ":" + root.id;
    const shouldShow = settings.chatWordCensorReveal !== false && censorRules.length &&
      textNodesIn(getMessageTextContainer(root)).some(node => hasCensorMatch(nodeState.get(node)?.original ?? node.nodeValue ?? "", censorRules));
    if (!shouldShow) { b?.remove(); return; }
    if (!b) {
      b = document.createElement("button"); b.type="button"; b.className="ds-chat-censor-reveal"; b.dataset.dsOwned="1";
      b.style.cssText="font:11px system-ui;color:inherit;opacity:.75;background:transparent;border:1px solid #64748b;border-radius:5px;padding:2px 6px;cursor:pointer;margin:3px";
      b.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        if (revealedMessageIds.has(key)) revealedMessageIds.delete(key); else revealedMessageIds.add(key);
        dirtyRoots.add(root); delete root.dataset.dsTextReplacementReady;
        DS.applyChatTextReplacements?.();
      });
      const target = root.querySelector(".ds-message-quick-actions")?.parentElement || root.querySelector("button[aria-label='message-dropdown']")?.parentElement || root;
      target.append(b);
    }
    b.textContent = revealedMessageIds.has(key) ? "Hide censored words" : "Reveal censored words";
  }
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

      if (signatureChanged && saved && node.nodeValue === saved.applied) writeTextNode(node, original);

      const applied = applyRules(original, rules);
      if (applied !== original) {
        if (node.nodeValue !== applied) writeTextNode(node, applied);
        nodeState.set(node, { original, applied });
      } else {
        if (saved && node.nodeValue === saved.applied) writeTextNode(node, original);
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
    if (replacementObserverActive) {
      replacementObserver.disconnect();
      replacementObserverActive = false;
    }
    clearTimeout(observerTimer);
    observerTimer = null;
    restoreDisplayChanges();
    document.querySelectorAll(".ds-replacement-undo").forEach(button => button.remove());
    document.getElementById("ds-chat-replacement-preset")?.remove();
    document.getElementById("ds-chat-censor-toggle")?.remove();
    document.querySelectorAll(".ds-chat-censor-reveal").forEach(b => b.remove());
    revealedMessageIds.clear();
    clearTimeout(savedModeTimer);
    savedModeTimer = null;
    lastSignature = "";
    initializedRoute = "";
    dirtyRoots.clear();
    document.querySelectorAll("[data-ds-text-replacement-ready]").forEach(root => delete root.dataset.dsTextReplacementReady);
    failedSavedState.clear();
    DS.state.chatTextReplacementsWasActive = false;
  }

  DS.applyChatTextReplacements = async function applyChatTextReplacements() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !DS.isSingleChatPage?.() || (!settings.enableChatTextReplacements && !settings.enableChatMutedWords && !settings.enableChatWordCensor)) {
      if (DS.state.chatTextReplacementsWasActive) cleanup();
      return;
    }

    await loadProfileSelections();
    ensurePresetSelector(settings);
    ensureCensorToggle(settings);
    const rules = parseRules(combinedDisplayRules(settings));
    const censorRules = parseCensorRules(settings);
    if (!rules.length && !censorRules.length) {
      if (DS.state.chatTextReplacementsWasActive) cleanup();
      ensureCensorToggle(settings); // Still allow re-enabling censor after excluding this chat.
      return;
    }

    if (!replacementObserverActive) {
      replacementObserver.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
      replacementObserverActive = true;
    }
    DS.state.chatTextReplacementsWasActive = true;
    const signature = replacementSignature(settings);
    const route = String(location.pathname || "");
    const signatureChanged = signature !== lastSignature || initializedRoute !== route;
    lastSignature = signature;
    initializedRoute = route;
    const mode = settings.enableChatMutedWords || censorRules.length > 0 || !!selectedPresetRules(settings)
      ? "display" : (settings.chatTextReplacementMode === "save" ? "save" : "display");

    if (mode === "save" && signatureChanged) restoreDisplayChanges();

    let roots = [];
    if (signatureChanged) {
      roots = DS.getMessageEnhancerRoots?.({ newest: 24, margin: 1400 }) || getMessageRoots();
    } else {
      const candidates = new Set(dirtyRoots);
      DS.getCurrentMessageLaneRoots?.().forEach(root => candidates.add(root));
      const unready = DS.getMessageEnhancerRoots?.({ readyAttribute: "data-ds-text-replacement-ready", readyValue: "1", newest: 24, margin: 1400 })
        || document.querySelectorAll("div[id^='message-']:not([data-ds-text-replacement-ready='1'])");
      unready.forEach(root => {
        if (!root.parentElement?.closest?.("div[id^='message-']")) candidates.add(root);
      });
      roots = [...candidates].filter(root => root?.isConnected);
    }
    dirtyRoots.clear();

    for (const root of roots) {
      if (DS.isMessageEditPending?.(root)) continue;
      const normalAllowed = scopeAllows(root, settings);
      const scopedCensor = censorScopeAllows(root, settings) ? censorRules : [];
      if (!normalAllowed && !scopedCensor.length) {
        root.querySelector(".ds-chat-censor-reveal")?.remove();
        const container = getMessageTextContainer(root);
        for (const node of textNodesIn(container)) restoreNode(node);
        root.dataset.dsTextReplacementReady = "1";
        continue;
      }

      const key = location.pathname + ":" + root.id;
      const visibleRules = [...(normalAllowed ? rules : []), ...(revealedMessageIds.has(key) ? [] : scopedCensor)];
      if (mode === "display") applyDisplayMode(root, visibleRules, signatureChanged);
      else queueSavedReplacement(root, rules, settings);
      updateCensorReveal(root, scopedCensor, settings);

      if (savedState.has(root.id)) updateUndoButton(root.id);
      root.dataset.dsTextReplacementReady = "1";
    }
  };

  DS.removeChatTextReplacements = cleanup;

  let observerTimer = null;
  let replacementObserverActive = false;
  const replacementObserver = new MutationObserver(mutations => {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || (!settings.enableChatTextReplacements && !settings.enableChatMutedWords && !settings.enableChatWordCensor) || !DS.isSingleChatPage?.()) return;

    let affectsMessage = false;
    for (const mutation of mutations) {
      if (DS.mutationIsQolOnly?.(mutation)) continue;
      if (mutation.type === "characterData" && selfWrittenTextNodes.has(mutation.target)) {
        selfWrittenTextNodes.delete(mutation.target);
        continue;
      }

      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      const root = target?.closest?.("div[id^='message-']");
      if (root) { dirtyRoots.add(root); affectsMessage = true; }
      for (const node of mutation.addedNodes) {
        if (DS.isQolOwnedNode?.(node)) continue;
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

  // No observer when muted words / replacement rules are disabled.
})();

}
