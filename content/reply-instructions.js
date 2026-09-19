(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const WRAPPER_CLASS = "ds-chat-reply-instructions-wrapper";
  const BUTTON_CLASS = "ds-chat-reply-instructions-button";
  const POPOVER_CLASS = "ds-reply-instructions-popover";
  const SESSION_PREFIX = "ds-qol-reply-instruction-sent-v1:";
  const MAX_INSTRUCTION_LENGTH = 2000;
  const MAX_GLOBAL_MEMORY_LENGTH = 4000;
  const GLOBAL_WRAPPER_CLASS = "ds-chat-global-memory-wrapper";
  const GLOBAL_BUTTON_CLASS = "ds-chat-global-memory-button";
  const GLOBAL_POPOVER_CLASS = "ds-global-memory-popover";
  const GLOBAL_SESSION_PREFIX = "ds-qol-global-memory-sent-v1:";

  let listenersInstalled = false;
  let syntheticSendPending = false;

  function settings() {
    return DS.state?.settings || {};
  }

  function normalizeText(value) {
    return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, MAX_INSTRUCTION_LENGTH);
  }

  function normalizeGlobalText(value) {
    return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, MAX_GLOBAL_MEMORY_LENGTH);
  }

  function normalizeOverrides(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const entries = [];
    for (const [key, raw] of Object.entries(source)) {
      const id = String(key || "").trim().slice(0, 160);
      const text = normalizeText(raw && typeof raw === "object" ? raw.text : raw);
      if (!id || !text) continue;
      entries.push([id, {
        text,
        updatedAt: Math.max(0, Number(raw?.updatedAt || 0) || 0)
      }]);
    }
    entries.sort((a, b) => Number(b[1].updatedAt || 0) - Number(a[1].updatedAt || 0));
    return Object.fromEntries(entries.slice(0, 100));
  }

  function currentCharacter() {
    const anchors = [...document.querySelectorAll("a[href*='/chatbot/']")];
    for (const anchor of anchors) {
      const href = String(anchor.getAttribute("href") || anchor.href || "");
      const match = href.match(/\/chatbot\/([0-9a-f-]{20,})(?:[/?#]|$)/i);
      if (!match) continue;
      const name = String(anchor.textContent || "").replace(/\s+/g, " ").trim();
      return { key: `bot:${match[1].toLowerCase()}`, botId: match[1].toLowerCase(), name };
    }

    const path = String(location.pathname || "").replace(/\/+$/, "");
    return { key: `chat:${path}`, botId: "", name: document.title?.replace(/^Chat with\s+/i, "").replace(/\s+on Spicychat.*$/i, "").trim() || "this chat" };
  }

  function effectiveInstruction() {
    const s = settings();
    const overrides = normalizeOverrides(s.replyInstructionBotOverrides);
    const character = currentCharacter();
    const override = normalizeText(overrides[character.key]?.text);
    const global = normalizeText(s.replyInstructionText);
    return {
      character,
      text: override || global,
      source: override ? "bot" : "global",
      hasOverride: !!override
    };
  }

  function buildDirective(text) {
    const clean = normalizeText(text);
    if (!clean) return "";
    if (settings().replyInstructionOocWrapper === false) return clean;
    if (/^\s*\[\s*OOC\s*[:\]]/i.test(clean)) return clean;
    return `[OOC: Reply instructions: ${clean}]`;
  }

  function buildGlobalDirective(text) {
    const clean = normalizeGlobalText(text);
    if (!clean) return "";
    if (settings().globalMemoryOocWrapper === false) return clean;
    if (/^\s*\[\s*OOC\s*[:\]]/i.test(clean)) return clean;
    return `[OOC: Global baseline notes for this chat: ${clean}]`;
  }

  function directiveHash(text) {
    let hash = 2166136261;
    const value = String(text || "");
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function sessionKey(characterKey, directive, prefix = SESSION_PREFIX) {
    const chatPath = String(location.pathname || "").replace(/\/+$/, "") || "/chat";
    return `${prefix}${encodeURIComponent(String(characterKey || "chat"))}:${encodeURIComponent(chatPath)}:${directiveHash(directive)}`;
  }

  function sessionAlreadySent(characterKey, directive) {
    try { return sessionStorage.getItem(sessionKey(characterKey, directive)) === "1"; }
    catch { return false; }
  }

  function markSessionSent(characterKey, directive) {
    try { sessionStorage.setItem(sessionKey(characterKey, directive), "1"); } catch {}
  }

  function globalSessionAlreadySent(characterKey, directive) {
    try { return sessionStorage.getItem(sessionKey(characterKey, directive, GLOBAL_SESSION_PREFIX)) === "1"; } catch { return false; }
  }

  function markGlobalSessionSent(characterKey, directive) {
    try { sessionStorage.setItem(sessionKey(characterKey, directive, GLOBAL_SESSION_PREFIX), "1"); } catch {}
  }

  function findComposer() {
    const direct = document.querySelector("textarea[placeholder='Message...']");
    if (direct) return direct;
    return [...document.querySelectorAll("textarea")].find(el => {
      if (el.closest?.("[id^='message-']")) return false;
      const placeholder = String(el.getAttribute("placeholder") || "").toLowerCase();
      return placeholder.includes("message") || Number(el.getAttribute("maxlength") || 0) >= 5000;
    }) || null;
  }

  function findSendButton() {
    return document.querySelector("button[aria-label='send-message']") || null;
  }

  function setTextareaValue(textarea, nextValue) {
    if (!textarea) return false;
    const oldValue = String(textarea.value || "");
    try {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      if (descriptor?.set) descriptor.set.call(textarea, nextValue);
      else textarea.value = nextValue;
      if (textarea._valueTracker?.setValue) textarea._valueTracker.setValue(oldValue);
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: null }));
      return true;
    } catch {
      try {
        textarea.value = nextValue;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      } catch {
        return false;
      }
    }
  }

  function showToast(message) {
    document.querySelectorAll(".ds-reply-instructions-toast").forEach(node => node.remove());
    const toast = document.createElement("div");
    toast.className = "ds-reply-instructions-toast";
    toast.textContent = String(message || "");
    Object.assign(toast.style, {
      position: "fixed", left: "50%", bottom: "82px", transform: "translateX(-50%)",
      zIndex: "2147483000", maxWidth: "min(90vw, 520px)", padding: "9px 12px",
      borderRadius: "9px", background: "rgba(24,24,28,.96)", color: "#fff",
      border: "1px solid rgba(255,255,255,.18)", fontSize: "13px", boxShadow: "0 6px 24px rgba(0,0,0,.35)"
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  function appendDirectiveToComposer({ manual = false } = {}) {
    const s = settings();
    if (!manual && !s.enableReplyInstructions) return { changed: false, reason: "disabled" };

    const info = effectiveInstruction();
    const directive = buildDirective(info.text);
    if (!directive) return { changed: false, reason: "empty" };

    const mode = ["every", "session", "manual"].includes(s.replyInstructionSendMode) ? s.replyInstructionSendMode : "session";
    if (!manual) {
      if (mode === "manual") return { changed: false, reason: "manual" };
      if (mode === "session" && sessionAlreadySent(info.character.key, directive)) return { changed: false, reason: "already-sent" };
    }

    const textarea = findComposer();
    if (!textarea || textarea.disabled) return { changed: false, reason: "composer" };
    const current = String(textarea.value || "");
    if (!current.trim()) return { changed: false, reason: "empty-message" };
    if (current.includes(directive)) return { changed: false, reason: "already-present", directive, info };

    const separator = current.endsWith("\n") ? "\n" : "\n\n";
    const next = `${current}${separator}${directive}`;
    const maxLength = Number(textarea.getAttribute("maxlength") || 0) || 10000;
    if (next.length > maxLength) {
      showToast(`Reply instruction was not added: message would exceed SpicyChat's ${maxLength.toLocaleString()} character limit.`);
      return { changed: false, reason: "maxlength" };
    }

    if (!setTextareaValue(textarea, next)) return { changed: false, reason: "set-failed" };
    textarea.selectionStart = textarea.selectionEnd = next.length;
    return { changed: true, directive, info };
  }

  function appendGlobalMemoryToComposer({ manual = false } = {}) {
    const s = settings();
    if (!manual && !s.enableGlobalMemory) return { changed: false, reason: "disabled" };
    const directive = buildGlobalDirective(s.globalMemoryText);
    if (!directive) return { changed: false, reason: "empty" };
    const textarea = findComposer();
    if (!textarea || textarea.disabled) return { changed: false, reason: "composer" };
    const current = String(textarea.value || "");
    if (!current.trim()) return { changed: false, reason: "empty-message" };
    if (current.includes(directive)) return { changed: false, reason: "already-present", directive };
    const separator = current.endsWith("\n") ? "\n" : "\n\n";
    const next = `${current}${separator}${directive}`;
    const maxLength = Number(textarea.getAttribute("maxlength") || 0) || 10000;
    if (next.length > maxLength) { showToast(`Global Memory was not added: message would exceed SpicyChat's ${maxLength.toLocaleString()} character limit.`); return { changed: false, reason: "maxlength" }; }
    if (!setTextareaValue(textarea, next)) return { changed: false, reason: "set-failed" };
    textarea.selectionStart = textarea.selectionEnd = next.length;
    return { changed: true, directive };
  }

  function maybePrepareAutomaticSend(event) {
    if (syntheticSendPending) return false;
    const s = settings();
    if (!s.enabled || !DS.isSingleChatPage?.()) return false;
    const textarea = findComposer();
    if (!textarea || textarea.disabled) return false;
    let current = String(textarea.value || "");
    if (!current.trim()) return false;
    const maxLength = Number(textarea.getAttribute("maxlength") || 0) || 10000;
    const character = currentCharacter();
    const candidates = [];

    const queue = s.enableLorebookConsistency ? DS.getLorebookConsistencyQueue?.() : null;
    if (queue?.text) candidates.push({ kind: "lorebook", directive: String(queue.text), queueId: queue.id || "" });

    const rpState = s.enableRpStateTracker ? DS.getRpStateInjectionCandidate?.() : null;
    if (rpState?.text) candidates.push({ kind: "rp-state", directive: String(rpState.text), stateHash: String(rpState.hash || "") });

    if (s.enableGlobalMemory) {
      const directive = buildGlobalDirective(s.globalMemoryText);
      const mode = ["every", "session", "manual"].includes(s.globalMemorySendMode) ? s.globalMemorySendMode : "session";
      if (directive && mode !== "manual" && !(mode === "session" && globalSessionAlreadySent(character.key, directive))) {
        candidates.push({ kind: "global", directive, mode });
      }
    }

    if (s.enableReplyInstructions) {
      const info = effectiveInstruction();
      const directive = buildDirective(info.text);
      const mode = ["every", "session", "manual"].includes(s.replyInstructionSendMode) ? s.replyInstructionSendMode : "session";
      if (directive && mode !== "manual" && !(mode === "session" && sessionAlreadySent(info.character.key, directive))) {
        candidates.push({ kind: "reply", directive, mode, info });
      }
    }

    if (!candidates.length) return false;
    const added = [];
    const alreadyPresent = [];
    const skipped = [];
    for (const candidate of candidates) {
      if (current.includes(candidate.directive)) { alreadyPresent.push(candidate); continue; }
      const separator = current.endsWith("\n") ? "\n" : "\n\n";
      const next = `${current}${separator}${candidate.directive}`;
      if (next.length > maxLength) { skipped.push(candidate); continue; }
      current = next; added.push(candidate);
    }

    for (const candidate of alreadyPresent) {
      if (candidate.kind === "global" && candidate.mode === "session") markGlobalSessionSent(character.key, candidate.directive);
      if (candidate.kind === "reply" && candidate.mode === "session") markSessionSent(candidate.info.character.key, candidate.directive);
      if (candidate.kind === "rp-state") DS.markRpStateInjected?.(candidate.stateHash);
    }
    if (!added.length) {
      if (skipped.length) showToast("QoL guidance could not be added because the message is too close to SpicyChat's character limit.");
      return false;
    }
    if (!setTextareaValue(textarea, current)) return false;
    textarea.selectionStart = textarea.selectionEnd = current.length;
    if (skipped.length) showToast(`${skipped.length} QoL guidance block${skipped.length === 1 ? " was" : "s were"} skipped because the message would be too long.`);

    event?.preventDefault?.(); event?.stopPropagation?.(); event?.stopImmediatePropagation?.();
    syntheticSendPending = true;
    window.setTimeout(() => {
      try {
        const button = findSendButton();
        if (button && !button.disabled) {
          for (const candidate of added) {
            if (candidate.kind === "global" && candidate.mode === "session") markGlobalSessionSent(character.key, candidate.directive);
            if (candidate.kind === "reply" && candidate.mode === "session") markSessionSent(candidate.info.character.key, candidate.directive);
            if (candidate.kind === "lorebook") DS.markLorebookConsistencyQueueSent?.(candidate.queueId);
            if (candidate.kind === "rp-state") DS.markRpStateInjected?.(candidate.stateHash);
          }
          button.click();
        }
      } finally { window.setTimeout(() => { syntheticSendPending = false; }, 80); }
    }, 24);
    return true;
  }

  function installSendListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;

    document.addEventListener("click", event => {
      const button = event.target?.closest?.("button[aria-label='send-message']");
      if (!button || syntheticSendPending) return;
      maybePrepareAutomaticSend(event);
    }, true);

    document.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      const textarea = event.target?.matches?.("textarea[placeholder='Message...']") ? event.target : null;
      if (!textarea || syntheticSendPending) return;
      maybePrepareAutomaticSend(event);
    }, true);
  }

  async function saveBotOverride(text) {
    const current = { ...settings() };
    const overrides = normalizeOverrides(current.replyInstructionBotOverrides);
    const character = currentCharacter();
    const clean = normalizeText(text);
    if (clean) overrides[character.key] = { text: clean, updatedAt: Date.now() };
    else delete overrides[character.key];
    current.replyInstructionBotOverrides = normalizeOverrides(overrides);
    const ok = await DS.storageSet?.({ settings: current });
    if (ok) DS.state.settings = { ...DS.DEFAULT_SETTINGS, ...current };
    return !!ok;
  }

  function closePopover() {
    document.querySelectorAll(`.${POPOVER_CLASS}`).forEach(node => node.remove());
  }

  function makePopover(button) {
    closePopover();
    const info = effectiveInstruction();
    const pop = document.createElement("div");
    pop.className = POPOVER_CLASS;
    Object.assign(pop.style, {
      position: "fixed", zIndex: "2147483000", width: "min(330px, calc(100vw - 24px))",
      padding: "10px", borderRadius: "10px", background: "#18191d", color: "#fff",
      border: "1px solid rgba(255,255,255,.16)", boxShadow: "0 10px 30px rgba(0,0,0,.45)",
      fontSize: "13px"
    });

    const title = document.createElement("strong");
    title.textContent = "Reply Instructions";
    const status = document.createElement("div");
    status.style.margin = "5px 0 9px";
    status.style.opacity = ".75";
    status.textContent = info.text
      ? `${info.hasOverride ? "Bot override" : "Global instruction"} · ${info.character.name || "current bot"}`
      : "No instruction set yet.";

    const actions = document.createElement("div");
    Object.assign(actions.style, { display: "flex", gap: "6px", flexWrap: "wrap" });
    const addButton = (label, fn, disabled = false) => {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = label;
      el.disabled = disabled;
      Object.assign(el.style, {
        padding: "6px 8px", borderRadius: "7px", border: "1px solid rgba(255,255,255,.18)",
        background: "rgba(255,255,255,.08)", color: "inherit", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? ".5" : "1"
      });
      el.addEventListener("click", fn);
      actions.appendChild(el);
    };

    addButton("Insert now", () => {
      const result = appendDirectiveToComposer({ manual: true });
      showToast(result.changed ? "Reply instruction added to your draft." : "Nothing was inserted.");
      closePopover();
    }, !info.text);

    addButton("Edit for this bot", async () => {
      const overrides = normalizeOverrides(settings().replyInstructionBotOverrides);
      const currentOverride = normalizeText(overrides[info.character.key]?.text);
      const next = window.prompt(
        `Reply instruction for ${info.character.name || "this bot"}.\n\nLeave it empty to use your global instruction instead.`,
        currentOverride
      );
      if (next == null) return;
      const ok = await saveBotOverride(next);
      showToast(ok ? (normalizeText(next) ? "Bot-specific reply instruction saved." : "Bot override cleared; using the global instruction.") : "Could not save the reply instruction.");
      closePopover();
      DS.scheduleRun?.({ priority: "critical", source: "reply-instruction-override" });
    });

    if (info.hasOverride) {
      addButton("Use global", async () => {
        const ok = await saveBotOverride("");
        showToast(ok ? "Bot override cleared; using the global instruction." : "Could not update the reply instruction.");
        closePopover();
      });
    }

    const note = document.createElement("div");
    note.style.marginTop = "9px";
    note.style.opacity = ".68";
    note.style.lineHeight = "1.35";
    note.textContent = "QoL sends this as normal message text/OOC guidance. SpicyChat does not currently expose a permanent hidden system-instruction slot to QoL.";

    pop.append(title, status, actions, note);
    document.body.appendChild(pop);

    const rect = button.getBoundingClientRect();
    const width = Math.min(330, window.innerWidth - 24);
    let left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
    let top = rect.top - pop.offsetHeight - 8;
    if (top < 12) top = Math.min(window.innerHeight - pop.offsetHeight - 12, rect.bottom + 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(12, top)}px`;
  }

  function makeGlobalMemoryPopover(button) {
    document.querySelectorAll(`.${GLOBAL_POPOVER_CLASS}`).forEach(node => node.remove());
    const pop = document.createElement("div"); pop.className = GLOBAL_POPOVER_CLASS;
    Object.assign(pop.style, { position: "fixed", zIndex: "2147483000", width: "min(340px, calc(100vw - 24px))", padding: "10px", borderRadius: "10px", background: "#18191d", color: "#fff", border: "1px solid rgba(255,255,255,.16)", boxShadow: "0 10px 30px rgba(0,0,0,.45)", fontSize: "13px" });
    const title = document.createElement("strong"); title.textContent = "Global Memory";
    const note = document.createElement("div"); note.style.cssText = "margin:5px 0 9px;opacity:.72;line-height:1.35";
    note.textContent = normalizeGlobalText(settings().globalMemoryText) ? "Baseline notes shared across chats. They are sent as visible message/OOC text when used." : "No baseline notes are set yet.";
    const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:7px;flex-wrap:wrap";
    const insert = document.createElement("button"); insert.type = "button"; insert.textContent = "Insert now"; insert.disabled = !normalizeGlobalText(settings().globalMemoryText);
    insert.addEventListener("click", () => { const result = appendGlobalMemoryToComposer({ manual: true }); showToast(result.changed ? "Global Memory added to your draft." : "Nothing was inserted."); pop.remove(); });
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Open Settings"; edit.addEventListener("click", () => DS.openOptionsTarget?.("personas-memory"));
    for (const buttonEl of [insert, edit]) Object.assign(buttonEl.style, { padding: "6px 8px", borderRadius: "7px", border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.08)", color: "inherit", cursor: "pointer" });
    actions.append(insert, edit); pop.append(title, note, actions); document.body.appendChild(pop);
    const rect = button.getBoundingClientRect(); const width = Math.min(340, window.innerWidth - 24); pop.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.left))}px`;
    let top = rect.top - pop.offsetHeight - 8; if (top < 12) top = Math.min(window.innerHeight - pop.offsetHeight - 12, rect.bottom + 8); pop.style.top = `${Math.max(12, top)}px`;
  }

  function removeButton() {
    document.querySelectorAll(`.${WRAPPER_CLASS},.${GLOBAL_WRAPPER_CLASS}`).forEach(node => node.remove());
    closePopover();
    document.querySelectorAll(`.${GLOBAL_POPOVER_CLASS}`).forEach(node => node.remove());
    DS.state.replyInstructionsWasActive = false;
  }

  function placeComposerButton({ wrapperClass, buttonClass, label, title, onClick }) {
    const textarea = findComposer(); if (!textarea) return false;
    if (document.querySelector(`.${buttonClass}`)?.isConnected) return true;
    const inputWrap = textarea.closest("div.w-full.flex") || textarea.parentElement?.parentElement?.parentElement;
    const row = inputWrap?.parentElement; if (!row) return false;
    const wrapper = document.createElement("div"); wrapper.className = `inline-flex max-w-full ${wrapperClass}`;
    const button = document.createElement("button"); button.type = "button";
    button.className = `inline-flex items-center justify-center transition-all duration-200 rounded-full bg-transparent text-black dark:text-white w-9 h-9 cursor-pointer ${buttonClass}`;
    button.setAttribute("aria-label", title); button.title = title; button.textContent = label;
    button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); onClick(button); });
    wrapper.appendChild(button); row.insertBefore(wrapper, inputWrap); return true;
  }

  function applyButton() {
    const s = settings();
    const onChat = !!s.enabled && !!DS.isSingleChatPage?.();
    if (!onChat) { removeButton(); return; }
    if (s.enableReplyInstructions && s.replyInstructionShowChatButton !== false) {
      placeComposerButton({ wrapperClass: WRAPPER_CLASS, buttonClass: BUTTON_CLASS, label: "RI", title: "Reply Instructions", onClick: makePopover });
    } else document.querySelectorAll(`.${WRAPPER_CLASS}`).forEach(node => node.remove());
    if (s.enableGlobalMemory && s.globalMemoryShowChatButton !== false) {
      placeComposerButton({ wrapperClass: GLOBAL_WRAPPER_CLASS, buttonClass: GLOBAL_BUTTON_CLASS, label: "GM", title: "Global Memory", onClick: makeGlobalMemoryPopover });
    } else document.querySelectorAll(`.${GLOBAL_WRAPPER_CLASS}`).forEach(node => node.remove());
    DS.state.replyInstructionsWasActive = !!(s.enableReplyInstructions || s.enableGlobalMemory);
  }

  DS.applyReplyInstructions = function applyReplyInstructions() {
    installSendListeners();
    applyButton();
  };

  DS.removeReplyInstructions = removeButton;

  installSendListeners();
})();
