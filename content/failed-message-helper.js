(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const DRAFT_PREFIX = "dsQolFailedDraft:";
  const SENT_PREFIX = "dsQolLastSentDraft:";
  const INSTALL_KEY = "dsQolFailedMessageHelperInstalled";

  function helperEnabled() {
    return !!DS.state?.settings?.failedMessageHelper && !DS.shouldDeferToSaiToolkit?.("failed-message-helper");
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
    return label.includes("send message") || label === "send";
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
    if (!helperEnabled()) {
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

  function installListeners() {
    if (DS.state?.[INSTALL_KEY]) return;
    if (DS.state) DS.state[INSTALL_KEY] = true;

    document.addEventListener("input", event => {
      if (!helperEnabled()) return;
      const textarea = event.target?.closest?.("textarea");
      if (!textarea || isEditTextarea(textarea)) return;
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
      DS.state.failedMessageHelperWasActive = false;
      return;
    }

    DS.state.failedMessageHelperWasActive = true;
    installListeners();
    renderHelper();
  };
})();
