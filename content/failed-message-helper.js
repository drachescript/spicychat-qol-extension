(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const DRAFT_PREFIX = "dsQolFailedDraft:";
  const SENT_PREFIX = "dsQolLastSentDraft:";
  const INSTALL_KEY = "dsQolFailedMessageHelperInstalled";

  function manualHelperEnabled() {
    return !!DS.state?.settings?.failedMessageHelper && !DS.shouldDeferToSaiToolkit?.("failed-message-helper");
  }

  function autoRetryEnabled() {
    return !!DS.state?.settings?.autoRetryFailedMessageSends;
  }

  function helperEnabled() {
    return manualHelperEnabled() || autoRetryEnabled();
  }

  function normalize(value) {
    if (DS.normalize) return DS.normalize(value);
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function safeGet(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }

  function safeSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch {}
  }

  function safeRemove(key) {
    try { sessionStorage.removeItem(key); } catch {}
  }

  function chatKey(prefix) {
    const parts = location.pathname.split("/").filter(Boolean);
    const chatIndex = parts.indexOf("chat");

    if (chatIndex >= 0) {
      const chatId = parts[chatIndex + 1] || "page";
      const conversationId = parts[chatIndex + 2] || "main";
      return `${prefix}${chatId}:${conversationId}`;
    }

    return `${prefix}${location.pathname}`;
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

    try {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(text.length, text.length);
    } catch {}

    return true;
  }

  function readPayload(prefix) {
    const raw = safeGet(chatKey(prefix));
    if (!raw) return null;

    try {
      const payload = JSON.parse(raw);
      if (!payload?.value) return null;
      if (Date.now() - Number(payload.savedAt || 0) > 1000 * 60 * 60 * 6) {
        safeRemove(chatKey(prefix));
        return null;
      }
      return payload;
    } catch {
      safeRemove(chatKey(prefix));
      return null;
    }
  }

  function writePayload(prefix, value, reason) {
    const text = String(value || "");
    const key = chatKey(prefix);

    if (!text.trim()) {
      safeRemove(key);
      return false;
    }

    safeSet(key, JSON.stringify({
      value: text,
      reason,
      href: location.href,
      path: location.pathname,
      savedAt: Date.now()
    }));

    return true;
  }

  function saveCurrentDraft(reason = "typing") {
    if (!helperEnabled()) return false;
    const textarea = findComposerTextarea();
    if (!textarea) return false;
    return writePayload(DRAFT_PREFIX, textarea.value || "", reason);
  }

  function saveLastSentDraft(reason = "send") {
    if (!helperEnabled()) return false;

    const textarea = findComposerTextarea();
    const current = String(textarea?.value || "");
    const draft = readPayload(DRAFT_PREFIX)?.value || "";
    const value = current.trim() ? current : draft;

    return writePayload(SENT_PREFIX, value, reason);
  }

  function buttonLabel(button) {
    return normalize([
      button?.getAttribute?.("aria-label"),
      button?.getAttribute?.("title"),
      button?.textContent
    ].filter(Boolean).join(" "));
  }

  function isSendButton(button) {
    const label = buttonLabel(button);
    return label.includes("send message") || label.includes("send-message") || label === "send";
  }

  function findResubmitButton() {
    return (DS.qsa?.("button") || []).find(button => {
      if (!isVisible(button)) return false;
      const label = buttonLabel(button);
      if (!label.includes("resubmit")) return false;

      const alert = button.closest("[data-role='alertbox'], div");
      const text = normalize(alert?.textContent || button.parentElement?.textContent || "");
      return text.includes("resubmit") || text.includes("oops") || text.includes("try again");
    }) || null;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      DS.setQuickStatus?.("Copied last sent draft.");
      return true;
    } catch {
      DS.setQuickStatus?.("Copy failed. Use Restore, then copy from the message box.");
      return false;
    }
  }

  function removeHelpers() {
    DS.qsa?.(".ds-failed-message-helper").forEach(el => el.remove());
  }

  function renderHelper() {
    if (!manualHelperEnabled()) {
      removeHelpers();
      return;
    }

    const button = findResubmitButton();
    if (!button) {
      removeHelpers();
      return;
    }

    const alert = button.closest("[data-role='alertbox']") || button.closest("div");
    if (!alert || alert.querySelector(".ds-failed-message-helper")) return;

    const payload = readPayload(SENT_PREFIX) || readPayload(DRAFT_PREFIX);
    if (!payload?.value) return;

    const helper = document.createElement("div");
    helper.className = "ds-failed-message-helper";
    DS.setSafeMarkup(helper, `
      <span>QoL saved your last sent draft.</span>
      <button type="button" data-ds-failed-action="restore">Restore</button>
      <button type="button" data-ds-failed-action="copy">Copy</button>
      <button type="button" data-ds-failed-action="resubmit">Resubmit</button>
    `);

    helper.addEventListener("click", event => {
      const action = event.target?.closest?.("button")?.dataset.dsFailedAction;
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const latest = readPayload(SENT_PREFIX) || readPayload(DRAFT_PREFIX);
      const text = latest?.value || "";
      if (!text) return;

      if (action === "restore") {
        setTextareaValue(findComposerTextarea(), text);
        DS.setQuickStatus?.("Restored last sent draft.");
      }

      if (action === "copy") {
        copyText(text);
      }

      if (action === "resubmit") {
        writePayload(SENT_PREFIX, text, "manual resubmit");
        button.click();
      }
    }, true);

    alert.appendChild(helper);
  }


  const RETRY_DELAYS = [3000, 5000, 10000, 20000, 30000];

  function retryState() {
    return DS.state.failedMessageAutoRetry || (DS.state.failedMessageAutoRetry = {
      chatKey: "",
      text: "",
      attempts: 0,
      timer: 0,
      generation: 0,
      sentAt: 0,
      awaitingConfirmation: false
    });
  }

  function currentChatIdentity() {
    return `${location.pathname}${location.search}`;
  }

  function clearRetryState(reason = "") {
    const state = retryState();
    if (state.timer) clearTimeout(state.timer);
    state.timer = 0;
    state.text = "";
    state.attempts = 0;
    state.awaitingConfirmation = false;
    state.sentAt = 0;
    state.generation++;
    state.chatKey = currentChatIdentity();
    if (reason) {
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.autoRetryLastStop = reason;
    }
  }

  function findSendErrorBanner() {
    return document.querySelector("[data-testid='ChatSendErrorBanner']");
  }

  function findSendButton() {
    const direct = document.querySelector("button[aria-label='send-message']");
    if (direct && isVisible(direct)) return direct;
    return (DS.qsa?.("button") || []).find(button => isVisible(button) && isSendButton(button)) || null;
  }

  function visibleUserMessageTexts() {
    const roots = DS.qsa?.("div[id^='message-']") || [];
    const texts = [];
    for (const root of roots.slice(-12)) {
      const buttons = root.querySelectorAll("button");
      const hasAiControls = [...buttons].some(button => /regenerate|continue|listen|rate/i.test(button.getAttribute("aria-label") || button.getAttribute("data-testid") || ""));
      if (hasAiControls) continue;
      const value = String(root.textContent || "").replace(/\s+/g, " ").trim();
      if (value) texts.push(value);
    }
    return texts;
  }

  function messageAlreadyConfirmed(text) {
    const wanted = String(text || "").replace(/\s+/g, " ").trim();
    if (!wanted) return false;
    return visibleUserMessageTexts().some(value => value === wanted || value.endsWith(wanted));
  }

  function scheduleAutoRetryFromBanner() {
    if (!autoRetryEnabled()) {
      clearRetryState("disabled");
      return;
    }

    const banner = findSendErrorBanner();
    if (!banner) return;

    const textarea = findComposerTextarea();
    const payload = readPayload(SENT_PREFIX) || readPayload(DRAFT_PREFIX);
    const text = String(textarea?.value || payload?.value || "");
    if (!text.trim()) return;

    const state = retryState();
    const identity = currentChatIdentity();
    if (state.chatKey && state.chatKey !== identity) clearRetryState("navigation");
    state.chatKey = identity;

    if (messageAlreadyConfirmed(text)) {
      clearRetryState("already-confirmed");
      return;
    }

    if (state.text && state.text !== text) clearRetryState("draft-changed");
    state.text = text;

    if (state.timer || state.awaitingConfirmation) return;
    if (state.attempts >= RETRY_DELAYS.length) {
      DS.setQuickStatus?.("Auto retry stopped after 5 failed attempts.");
      clearRetryState("max-attempts");
      return;
    }

    const delay = RETRY_DELAYS[state.attempts];
    const generation = state.generation;
    DS.setQuickStatus?.(`Message send failed. Retrying in ${Math.round(delay / 1000)}s…`);
    state.timer = setTimeout(() => {
      state.timer = 0;
      if (generation !== state.generation || !autoRetryEnabled()) return;
      if (currentChatIdentity() !== state.chatKey) {
        clearRetryState("navigation");
        return;
      }

      const currentTextarea = findComposerTextarea();
      if (!currentTextarea || String(currentTextarea.value || "") !== state.text) {
        clearRetryState("draft-changed");
        return;
      }
      if (messageAlreadyConfirmed(state.text)) {
        clearRetryState("confirmed-before-retry");
        return;
      }

      const button = findSendButton();
      if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
        scheduleAutoRetryFromBanner();
        return;
      }

      writePayload(SENT_PREFIX, state.text, `auto retry ${state.attempts + 1}`);
      state.attempts++;
      state.sentAt = Date.now();
      state.awaitingConfirmation = true;
      button.click();

      const confirmGeneration = state.generation;
      setTimeout(() => {
        if (confirmGeneration !== state.generation) return;
        state.awaitingConfirmation = false;

        if (messageAlreadyConfirmed(state.text)) {
          DS.setQuickStatus?.(`Message sent after ${state.attempts} ${state.attempts === 1 ? "retry" : "retries"}.`);
          clearRetryState("confirmed");
          return;
        }

        const current = findComposerTextarea();
        if (!current || String(current.value || "") !== state.text) {
          clearRetryState("draft-changed");
          return;
        }

        if (findSendErrorBanner()) scheduleAutoRetryFromBanner();
        else {
          // Give SpicyChat a little more time to render the confirmed user
          // message. A retry is never scheduled without the native error banner.
          setTimeout(() => {
            if (confirmGeneration !== state.generation) return;
            state.awaitingConfirmation = false;
            if (messageAlreadyConfirmed(state.text)) clearRetryState("confirmed-late");
            else if (findSendErrorBanner()) scheduleAutoRetryFromBanner();
          }, 2500);
        }
      }, 1800);
    }, delay);
  }

  function installListeners() {
    if (DS.state?.[INSTALL_KEY]) return;
    if (DS.state) DS.state[INSTALL_KEY] = true;

    document.addEventListener("input", event => {
      if (!helperEnabled()) return;
      const textarea = event.target?.closest?.("textarea");
      if (!textarea || isEditTextarea(textarea)) return;
      const state = retryState();
      if (state.text && String(textarea.value || "") !== state.text) clearRetryState("draft-edited");
      saveCurrentDraft("typing");
    }, true);

    document.addEventListener("keydown", event => {
      if (!helperEnabled()) return;
      const textarea = event.target?.closest?.("textarea");
      if (!textarea || isEditTextarea(textarea)) return;

      saveCurrentDraft("typing");

      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        saveLastSentDraft("enter");
      }
    }, true);

    for (const eventName of ["pointerdown", "mousedown", "touchstart", "click"]) {
      document.addEventListener(eventName, event => {
        if (!helperEnabled()) return;
        const textarea = event.target?.closest?.("textarea");
        if (textarea && !isEditTextarea(textarea)) saveCurrentDraft("typing");

        const button = event.target?.closest?.("button");
        if (button && isSendButton(button)) saveLastSentDraft("send button");
      }, true);
    }
  }

  DS.applyFailedMessageHelper = function applyFailedMessageHelper() {
    if (!helperEnabled()) {
      if (DS.state.failedMessageHelperWasActive) removeHelpers();
      clearRetryState("disabled");
      DS.state.failedMessageHelperWasActive = false;
      return;
    }

    DS.state.failedMessageHelperWasActive = true;
    installListeners();
    renderHelper();

    const state = retryState();
    const identity = currentChatIdentity();
    if (state.chatKey && state.chatKey !== identity) clearRetryState("navigation");
    state.chatKey = identity;

    if (autoRetryEnabled() && findSendErrorBanner()) scheduleAutoRetryFromBanner();
    else if (!findSendErrorBanner() && state.text && messageAlreadyConfirmed(state.text)) clearRetryState("confirmed");
  };
})();
