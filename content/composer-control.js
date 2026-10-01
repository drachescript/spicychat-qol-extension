(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  const state = {
    composerObserver: null,
    observedTextareas: new WeakSet(),
    listenersInstalled: false,
    guardUntil: 0,
    guardTop: 0,
    guardContainer: null,
    guardRaf: 0,
    guardTimer: 0,
    mobileObserver: null,
    mobileListenersInstalled: false,
    mobileNormalizeRaf: 0,
    editResizeRaf: 0,
    editResizeTimer: 0
  };

  function settings() {
    return DS.state?.settings || {};
  }

  function enabled() {
    return !!settings().enabled && DS.isSingleChatPage?.();
  }

  function shouldKeepComposerEnabled() {
    return enabled() && settings().allowTypingWhileAiResponding !== false;
  }

  function isMessageTextarea(el) {
    if (!el || el.tagName !== "TEXTAREA") return false;

    const placeholder = String(el.getAttribute("placeholder") || "").toLowerCase();
    const maxLength = String(el.getAttribute("maxlength") || "");

    return (
      placeholder.includes("message") ||
      maxLength === "10000" ||
      !!el.closest("form, [role='main'], #root")
    );
  }

  function getMessageTextareas() {
    return DS.qsa("textarea")
      .filter(isMessageTextarea)
      .filter(textarea => !textarea.closest("#ds-qol-panel, #ds-chat-export-modal"));
  }

  function forceEnableTextarea(textarea) {
    if (!shouldKeepComposerEnabled() || !textarea) return;

    if (textarea.disabled) textarea.disabled = false;
    if (textarea.hasAttribute("disabled")) textarea.removeAttribute("disabled");
    if (textarea.readOnly) textarea.readOnly = false;
    if (textarea.hasAttribute("readonly")) textarea.removeAttribute("readonly");
    if (textarea.getAttribute("aria-disabled") === "true") textarea.setAttribute("aria-disabled", "false");
    if (textarea.getAttribute("aria-readonly") === "true") textarea.setAttribute("aria-readonly", "false");

    DS.setClassState?.(textarea, "ds-composer-forced-enabled", true);
  }

  function shouldKeepChatPositionWhileTyping() {
    return enabled() && settings().keepChatPositionWhileTyping === true;
  }

  function getChatScrollContainer(textarea = null) {
    const message = DS.qs?.("[id^='message-']");
    const candidates = [
      textarea?.closest?.(".overflow-auto, .custom-scroll"),
      message?.closest?.(".overflow-auto, .custom-scroll"),
      DS.qs?.(".custom-scroll.overflow-auto"),
      DS.qs?.("div.absolute.h-full.overflow-auto")
    ].filter(Boolean);

    return candidates.find(el => el.scrollHeight > el.clientHeight + 20) || null;
  }

  function distanceFromBottom(container) {
    return Math.max(0, container.scrollHeight - container.clientHeight - container.scrollTop);
  }

  function stopTypingScrollGuard() {
    state.guardUntil = 0;
    state.guardContainer = null;
    cancelAnimationFrame(state.guardRaf);
    clearTimeout(state.guardTimer);
  }

  function runTypingScrollGuard() {
    cancelAnimationFrame(state.guardRaf);

    const tick = () => {
      const container = state.guardContainer;
      if (!container || performance.now() >= state.guardUntil) {
        stopTypingScrollGuard();
        return;
      }

      if (Math.abs(container.scrollTop - state.guardTop) > 1) {
        container.scrollTop = state.guardTop;
      }

      state.guardRaf = requestAnimationFrame(tick);
    };

    state.guardRaf = requestAnimationFrame(tick);
    clearTimeout(state.guardTimer);
    state.guardTimer = setTimeout(stopTypingScrollGuard, 320);
  }

  function armTypingScrollGuard(textarea) {
    if (!shouldKeepChatPositionWhileTyping()) return;

    const container = getChatScrollContainer(textarea);
    if (!container || distanceFromBottom(container) <= 120) return;

    state.guardContainer = container;
    state.guardTop = container.scrollTop;
    state.guardUntil = performance.now() + 260;
    runTypingScrollGuard();
  }

  function installTypingScrollGuard() {
    if (state.listenersInstalled) return;
    state.listenersInstalled = true;

    document.addEventListener("beforeinput", event => {
      const textarea = event.target;
      if (!isMessageTextarea(textarea)) return;
      armTypingScrollGuard(textarea);
    }, true);

    document.addEventListener("input", event => {
      const textarea = event.target;
      if (!isMessageTextarea(textarea)) return;
      if (state.guardContainer) runTypingScrollGuard();
    }, true);

    document.addEventListener("keydown", event => {
      const textarea = event.target;
      if (!isMessageTextarea(textarea)) return;

      if (event.key === "Enter" && !event.shiftKey) {
        stopTypingScrollGuard();
      } else {
        armTypingScrollGuard(textarea);
      }
    }, true);

    document.addEventListener("pointerdown", event => {
      if (event.target?.closest?.("button[type='submit'], button[aria-label*='send' i]")) {
        stopTypingScrollGuard();
      }
    }, true);

    document.addEventListener("wheel", stopTypingScrollGuard, { capture: true, passive: true });
    document.addEventListener("touchstart", stopTypingScrollGuard, { capture: true, passive: true });
  }

  function ensureComposerObserver() {
    if (!state.composerObserver) {
      state.composerObserver = new MutationObserver(mutations => {
        if (!shouldKeepComposerEnabled()) return;

        for (const mutation of mutations) {
          const textarea = mutation.target;
          if (isMessageTextarea(textarea)) forceEnableTextarea(textarea);
        }
      });
    }

    for (const textarea of getMessageTextareas()) {
      if (state.observedTextareas.has(textarea)) continue;
      state.observedTextareas.add(textarea);
      state.composerObserver.observe(textarea, {
        attributes: true,
        attributeFilter: ["disabled", "readonly", "aria-disabled", "aria-readonly"]
      });
    }
  }

  function disconnectComposerObserver() {
    state.composerObserver?.disconnect();
    state.observedTextareas = new WeakSet();
  }

  function mobileLayoutActive() {
    try {
      return window.matchMedia?.("(max-width: 760px), (pointer: coarse)")?.matches ?? window.innerWidth <= 760;
    } catch {
      return window.innerWidth <= 760;
    }
  }

  function androidAppRuntime() {
    const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
    return !!(
      env.android ||
      window.__spicyChatQolAndroidWebView ||
      window.__spicyChatQolAndroidApp ||
      window.AndroidBridge ||
      window.SpicyChatQoLAndroidBridge
    );
  }

  function composerTextarea() {
    return getMessageTextareas().find(textarea => !textarea.closest("div[id^='message-']")) || null;
  }

  function normalizeMobileSendWrapper() {
    if (!mobileLayoutActive()) return;
    const textarea = composerTextarea();
    if (!textarea) return;

    const scope = textarea.closest("form") || textarea.parentElement?.parentElement?.parentElement || textarea.parentElement;
    const buttons = [...(scope?.querySelectorAll?.("button") || [])];
    const send = buttons.find(button => {
      const label = String(button.getAttribute("aria-label") || button.title || "").toLowerCase();
      return button.type === "submit" || label.includes("send");
    });
    if (!send) return;

    DS.setClassState?.(send, "ds-mobile-chat-send-button", true);
    const wrapper = send.parentElement;
    if (wrapper && wrapper !== scope) DS.setClassState?.(wrapper, "ds-mobile-chat-send-wrapper", true);
  }

  function buttonLabels(node) {
    return Array.from(node?.querySelectorAll?.("button") || [])
      .map(button => String(
        button.getAttribute("aria-label") ||
        button.textContent ||
        ""
      ).trim().toLowerCase())
      .filter(Boolean);
  }

  function isMessageEditTextarea(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return false;

    const messageRoot = textarea.closest("div[id^='message-']");
    if (!messageRoot) return false;

    let node = textarea.parentElement;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      const labels = buttonLabels(node);
      const hasSave = labels.some(label => label === "save" || label.includes("save"));
      const hasCancel = labels.some(label => label === "cancel" || label.includes("cancel"));

      if (hasSave && hasCancel) return true;
      if (node === messageRoot) break;
    }

    // SpicyChat sometimes mounts the textarea one render before Save/Cancel.
    // A textarea inside a message card is not the normal composer, so treat it
    // as an editor during that short mount window.
    return true;
  }

  function messageEditShell(textarea) {
    const messageRoot = textarea.closest("div[id^='message-']");
    let node = textarea.parentElement;

    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;

      const labels = buttonLabels(node);
      const hasSave = labels.some(label => label === "save" || label.includes("save"));
      const hasCancel = labels.some(label => label === "cancel" || label.includes("cancel"));

      if (hasSave && hasCancel) return node;
      if (messageRoot && node === messageRoot) break;
    }

    return textarea.parentElement;
  }

  function repairMessageEditAncestors(textarea, wantedHeight) {
    const shell = messageEditShell(textarea);
    const messageRoot = textarea.closest("div[id^='message-']");
    let node = textarea.parentElement;

    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      if (messageRoot && node === messageRoot) break;

      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const clips =
        style.overflow === "hidden" ||
        style.overflow === "clip" ||
        style.overflowY === "hidden" ||
        style.overflowY === "clip";

      const tooShort = rect.height > 0 && rect.height + 4 < wantedHeight;

      if (clips || tooShort || node === shell) {
        node.dataset.dsMobileMessageEditShell = "1";
        node.style.setProperty("height", "auto", "important");
        node.style.setProperty("max-height", "none", "important");
        node.style.setProperty("overflow", "visible", "important");
        node.style.setProperty("overflow-y", "visible", "important");
      }

      if (node === shell) break;
    }
  }

  function resizeAndroidMessageEdit(textarea) {
    if (!androidAppRuntime() || !mobileLayoutActive()) return false;
    if (!isMessageEditTextarea(textarea) || !textarea.isConnected) return false;

    const viewportHeight = Math.max(
      320,
      Number(window.visualViewport?.height || window.innerHeight || 640)
    );

    const minHeight = 96;
    // Leave enough room for Save/Cancel and the keyboard, but give long edits
    // more space before switching to an internal scroll area.
    const maxHeight = Math.max(240, Math.min(640, viewportHeight * 0.78));
    const previousScrollTop = Number(textarea.scrollTop || 0);
    const selectionEnd = Number(textarea.selectionEnd ?? textarea.value.length);
    const editingAtEnd = selectionEnd >= Math.max(0, textarea.value.length - 1);

    // Measure from the content, not the previous explicit height.
    textarea.style.setProperty("height", "auto", "important");
    textarea.style.setProperty("min-height", `${minHeight}px`, "important");
    textarea.style.setProperty("max-height", `${maxHeight}px`, "important");
    textarea.style.setProperty("box-sizing", "border-box", "important");
    textarea.style.setProperty("line-height", "1.5", "important");
    textarea.style.setProperty("padding-top", "6px", "important");
    textarea.style.setProperty("padding-bottom", "18px", "important");
    textarea.style.setProperty("scroll-padding-bottom", "22px", "important");
    textarea.style.setProperty("overscroll-behavior", "contain", "important");

    const naturalHeight = Math.ceil(textarea.scrollHeight + 12);
    const wantedHeight = Math.max(
      minHeight,
      Math.min(maxHeight, naturalHeight)
    );
    const capped = naturalHeight > maxHeight;

    textarea.style.setProperty("height", `${wantedHeight}px`, "important");
    textarea.style.setProperty(
      "overflow-y",
      capped ? "auto" : "hidden",
      "important"
    );

    textarea.dataset.dsMobileMessageEditFixed = "1";
    repairMessageEditAncestors(textarea, wantedHeight);

    // Once a long edit reaches the cap, keeping the textarea at the correct
    // height is not enough: Android WebView can leave the newest line partly
    // below the internal scroll viewport. Keep the active caret/end visible.
    const restoreEditScroll = () => {
      if (!textarea.isConnected) return;
      const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
      if (!capped || maxScroll <= 0) {
        textarea.scrollTop = 0;
        return;
      }

      if (document.activeElement === textarea && editingAtEnd) {
        textarea.scrollTop = maxScroll;
      } else {
        textarea.scrollTop = Math.max(0, Math.min(previousScrollTop, maxScroll));
      }
    };

    restoreEditScroll();
    requestAnimationFrame(restoreEditScroll);
    return true;
  }

  function normalizeAndroidMessageEditors() {
    if (!androidAppRuntime() || !mobileLayoutActive()) return;

    document.querySelectorAll("textarea").forEach(textarea => {
      if (isMessageEditTextarea(textarea)) {
        resizeAndroidMessageEdit(textarea);
      }
    });
  }

  function scheduleAndroidMessageEditResize(textarea = null) {
    if (!androidAppRuntime() || !mobileLayoutActive()) return;

    cancelAnimationFrame(state.editResizeRaf);
    clearTimeout(state.editResizeTimer);

    state.editResizeRaf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (textarea?.isConnected && isMessageEditTextarea(textarea)) {
          resizeAndroidMessageEdit(textarea);
        } else {
          normalizeAndroidMessageEditors();
        }
      });
    });

    // SpicyChat/React can write its own height at the end of the input event.
    // One bounded delayed pass fixes that race without an endless observer loop.
    state.editResizeTimer = setTimeout(() => {
      if (textarea?.isConnected && isMessageEditTextarea(textarea)) {
        resizeAndroidMessageEdit(textarea);
      } else {
        normalizeAndroidMessageEditors();
      }
    }, 90);
  }

  function scheduleMobileSendWrapperNormalize() {
    cancelAnimationFrame(state.mobileNormalizeRaf);
    state.mobileNormalizeRaf = requestAnimationFrame(() => {
      normalizeMobileSendWrapper();
      normalizeAndroidMessageEditors();
    });
  }

  function installMobileChatLayoutFixes() {
    if (!mobileLayoutActive() || state.mobileListenersInstalled) return;
    state.mobileListenersInstalled = true;

    state.mobileObserver = new MutationObserver(() => scheduleMobileSendWrapperNormalize());
    state.mobileObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    document.addEventListener("focusin", event => {
      const textarea = event.target;
      if (!isMessageEditTextarea(textarea)) return;
      scheduleAndroidMessageEditResize(textarea);
    }, true);

    document.addEventListener("input", event => {
      const textarea = event.target;
      if (!isMessageEditTextarea(textarea)) return;
      scheduleAndroidMessageEditResize(textarea);
    }, true);

    window.addEventListener("resize", () => {
      scheduleMobileSendWrapperNormalize();
      scheduleAndroidMessageEditResize();
    }, { passive: true });

    window.visualViewport?.addEventListener("resize", () => {
      scheduleAndroidMessageEditResize();
    }, { passive: true });
  }

  DS.applyMobileChatLayoutFixes = function applyMobileChatLayoutFixes() {
    if (!enabled() || !mobileLayoutActive()) return;
    installMobileChatLayoutFixes();
    normalizeMobileSendWrapper();
    normalizeAndroidMessageEditors();
  };

  DS.beginFollowNewestChatMessage = () => {};
  DS.isFollowingNewestMessage = () => false;

  DS.applyComposerControl = function applyComposerControl() {
    if (shouldKeepChatPositionWhileTyping()) {
      installTypingScrollGuard();
    } else {
      stopTypingScrollGuard();
    }

    if (!shouldKeepComposerEnabled()) {
      disconnectComposerObserver();
      if (DS.state.composerControlWasActive) {
        getMessageTextareas().forEach(textarea => {
          DS.setClassState?.(textarea, "ds-composer-forced-enabled", false);
        });
      }
      DS.state.composerControlWasActive = false;
      return;
    }

    DS.state.composerControlWasActive = true;
    ensureComposerObserver();
    getMessageTextareas().forEach(forceEnableTextarea);
  };
})();
