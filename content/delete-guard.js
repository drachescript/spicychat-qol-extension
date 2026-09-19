(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const DRAFT_PREFIX = "dsQolDraftBeforeRemoveMessages:";
  const ACTIVE_KEY = "dsQolDraftBeforeRemoveMessages:active";
  const INSTALL_KEY = "dsQolDeleteDraftGuardInstalled";
  let restoreTimer = null;

  function draftGuardEnabled() {
    return !!DS.state?.settings?.protectDraftDuringMessageRemoval;
  }

  function normalize(value) {
    if (DS.normalize) return DS.normalize(value);
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function safeGetItem(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Draft restore is only a safety helper, so storage failures should not affect the page.
    }
  }

  function safeRemoveItem(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore.
    }
  }

  function chatKey() {
    const parts = location.pathname.split("/").filter(Boolean);
    const chatIndex = parts.indexOf("chat");

    if (chatIndex >= 0) {
      const chatId = parts[chatIndex + 1] || "page";
      const conversationId = parts[chatIndex + 2] || "main";
      return `${DRAFT_PREFIX}${chatId}:${conversationId}`;
    }

    return `${DRAFT_PREFIX}${location.pathname}`;
  }

  function isVisible(el) {
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isEditTextarea(textarea) {
    if (!textarea) return false;

    const placeholder = normalize(textarea.getAttribute("placeholder") || "");
    if (placeholder.includes("enter something")) return true;

    return !!textarea.closest("[id^='message-']");
  }

  function findComposerTextarea() {
    const textareas = DS.qsa?.("textarea") || [];

    return textareas
      .filter(isVisible)
      .filter(textarea => !isEditTextarea(textarea))
      .sort((a, b) => {
        const ap = normalize(a.getAttribute("placeholder") || "");
        const bp = normalize(b.getAttribute("placeholder") || "");
        const aScore = ap.includes("message") ? 1 : 0;
        const bScore = bp.includes("message") ? 1 : 0;
        if (aScore !== bScore) return bScore - aScore;
        return b.getBoundingClientRect().top - a.getBoundingClientRect().top;
      })[0] || null;
  }

  function setTextareaValue(textarea, value) {
    if (!textarea) return false;

    const text = String(value || "");
    const proto = Object.getPrototypeOf(textarea);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");

    if (descriptor?.set) {
      descriptor.set.call(textarea, text);
    } else {
      textarea.value = text;
    }

    textarea.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: text
    }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));

    const end = text.length;
    try {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(end, end);
    } catch {
      // Some textarea states cannot be focused, which is fine.
    }

    return true;
  }

  function isRemovalMode() {
    if (document.querySelector("[data-translate-key='chat:page.removal.instruction']")) return true;

    return (DS.qsa?.("[role='dialog'] p, [role='dialog'] span, main p, main span") || []).some(el => {
      if (!isVisible(el)) return false;
      const text = normalize(el.textContent || "");
      return text.includes("select the first message to remove") && text.includes("all messages after it will be removed");
    });
  }

  function readSavedDraft() {
    const key = chatKey();
    const raw = safeGetItem(key);
    if (!raw) return null;

    try {
      const payload = JSON.parse(raw);
      if (!payload?.value) return null;
      if (Date.now() - Number(payload.savedAt || 0) > 1000 * 60 * 60 * 2) {
        safeRemoveItem(key);
        return null;
      }
      return payload;
    } catch {
      safeRemoveItem(key);
      return null;
    }
  }

  function saveCurrentDraft(reason = "remove messages") {
    if (!draftGuardEnabled()) return false;

    const textarea = findComposerTextarea();
    if (!textarea) return false;

    const value = String(textarea.value || "");
    const key = chatKey();

    if (!value) {
      safeRemoveItem(key);
      safeRemoveItem(ACTIVE_KEY);
      return false;
    }

    safeSetItem(key, JSON.stringify({
      value,
      reason,
      href: location.href,
      path: location.pathname,
      savedAt: Date.now()
    }));
    safeSetItem(ACTIVE_KEY, key);

    return true;
  }

  function clearSavedDraft() {
    safeRemoveItem(chatKey());

    const active = safeGetItem(ACTIVE_KEY);
    if (active === chatKey()) safeRemoveItem(ACTIVE_KEY);
  }

  function restoreDraftIfNeeded() {
    if (!draftGuardEnabled()) return false;

    // Nearly every pass has no saved draft. Check storage first so routine
    // chat mutations do not pay for a removal-mode DOM scan.
    const payload = readSavedDraft();
    if (!payload?.value) return false;
    if (isRemovalMode()) return false;

    const textarea = findComposerTextarea();
    if (!textarea) return false;

    const current = String(textarea.value || "");
    if (current.trim()) {
      if (current === payload.value) clearSavedDraft();
      return false;
    }

    const restored = setTextareaValue(textarea, payload.value);
    if (restored) clearSavedDraft();

    return restored;
  }

  function buttonLabel(button) {
    return normalize([
      button?.getAttribute?.("aria-label"),
      button?.getAttribute?.("title"),
      button?.textContent
    ].filter(Boolean).join(" "));
  }

  function isDeleteMenuButton(button) {
    if (!button) return false;

    const label = buttonLabel(button);
    return (
      label.includes("remove messages") ||
      label.includes("delete messages") ||
      label.includes("remove selected messages")
    );
  }

  function isSendButton(button) {
    if (!button) return false;
    const label = buttonLabel(button);
    return label.includes("send message") || label === "send";
  }

  function handlePossibleDeleteButton(event) {
    if (!draftGuardEnabled()) return;

    const button = event.target?.closest?.("button");
    if (!button) return;

    if (isDeleteMenuButton(button)) {
      saveCurrentDraft("remove messages button");
    }
  }

  function handlePossibleSendButton(event) {
    if (!draftGuardEnabled()) return;

    const button = event.target?.closest?.("button");
    if (!isSendButton(button)) return;

    // The deletion draft is only for the temporary wipe caused by removal mode.
    // Once the user sends normally, the recovery copy should not linger.
    setTimeout(clearSavedDraft, 1500);
  }

  function installListeners() {
    if (DS.state?.[INSTALL_KEY]) return;
    if (DS.state) DS.state[INSTALL_KEY] = true;

    document.addEventListener("pointerdown", event => {
      handlePossibleDeleteButton(event);
      handlePossibleSendButton(event);
    }, true);

    document.addEventListener("mousedown", handlePossibleDeleteButton, true);
    document.addEventListener("touchstart", handlePossibleDeleteButton, true);

    document.addEventListener("click", event => {
      handlePossibleDeleteButton(event);
      handlePossibleSendButton(event);
    }, true);

    document.addEventListener("keydown", event => {
      const target = event.target?.closest?.("textarea");
      if (!target || isEditTextarea(target)) return;

      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        setTimeout(clearSavedDraft, 1500);
      }
    }, true);

  }

  function stopRestoreTimer() {
    clearInterval(restoreTimer);
    restoreTimer = null;
    DS.state.messageRemovalGuardActive = false;
  }

  function ensureRestoreTimer() {
    if (restoreTimer) return;

    restoreTimer = setInterval(() => {
      if (!draftGuardEnabled() || !DS.isSingleChatPage?.()) {
        stopRestoreTimer();
        return;
      }

      restoreDraftIfNeeded();
    }, 700);
  }

  DS.applyMessageRemovalGuard = function applyMessageRemovalGuard() {
    if (!draftGuardEnabled() || !DS.isSingleChatPage?.()) {
      stopRestoreTimer();
      return;
    }

    installListeners();
    ensureRestoreTimer();
    DS.state.messageRemovalGuardActive = true;
    restoreDraftIfNeeded();
  };
})();
