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
    mobileResizeRaf: 0,
    mobileActiveEditTextarea: null
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

    // This only keeps drafting/editing available. It deliberately does not
    // click or re-enable SpicyChat's send/generate buttons while another text
    // or image generation is in flight.
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
    try { return window.matchMedia?.("(max-width: 760px), (pointer: coarse)")?.matches ?? window.innerWidth <= 760; }
    catch { return window.innerWidth <= 760; }
  }

  function isMessageEditTextarea(textarea) {
    return textarea instanceof HTMLTextAreaElement && !!textarea.closest("div[id^='message-']");
  }

  function resizeMessageEditTextarea(textarea) {
    if (!mobileLayoutActive() || !isMessageEditTextarea(textarea)) return;

    state.mobileActiveEditTextarea = textarea;
    const viewportHeight = Number(window.visualViewport?.height || window.innerHeight || 640);
    const maxHeight = Math.max(150, Math.min(360, Math.round(viewportHeight * 0.46)));
    const wanted = Math.max(96, Math.min(maxHeight, textarea.scrollHeight + 2));

    DS.setClassState?.(textarea, "ds-mobile-message-edit-textarea", true);
    if (textarea.style.height !== `${wanted}px`) textarea.style.height = `${wanted}px`;
    if (textarea.style.maxHeight !== `${maxHeight}px`) textarea.style.maxHeight = `${maxHeight}px`;
    const overflow = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    if (textarea.style.overflowY !== overflow) textarea.style.overflowY = overflow;

    const root = textarea.closest("div[id^='message-']");
    const buttons = [...(root?.querySelectorAll("button") || [])];
    const save = buttons.find(button => /^save$/i.test(String(button.textContent || "").trim()));
    const cancel = buttons.find(button => /^cancel$/i.test(String(button.textContent || "").trim()));
    const actions = save?.parentElement && save.parentElement === cancel?.parentElement ? save.parentElement : null;
    if (actions) DS.setClassState?.(actions, "ds-mobile-message-edit-actions", true);
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

  function processAddedMobileNode(node) {
    if (!mobileLayoutActive()) return;
    const el = node instanceof Element ? node : null;
    if (!el) return;
    if (isMessageEditTextarea(el)) resizeMessageEditTextarea(el);
    el.querySelectorAll?.("div[id^='message-'] textarea").forEach(resizeMessageEditTextarea);
  }

  function refreshActiveMobileEditor() {
    const textarea = state.mobileActiveEditTextarea;
    if (textarea?.isConnected && isMessageEditTextarea(textarea)) resizeMessageEditTextarea(textarea);
    else state.mobileActiveEditTextarea = null;
    normalizeMobileSendWrapper();
  }

  function installMobileChatLayoutFixes() {
    if (!mobileLayoutActive()) return;
    if (state.mobileListenersInstalled) return;
    state.mobileListenersInstalled = true;

    document.addEventListener("focusin", event => {
      if (!isMessageEditTextarea(event.target)) return;
      resizeMessageEditTextarea(event.target);
      setTimeout(() => {
        if (event.target?.isConnected) resizeMessageEditTextarea(event.target);
      }, 80);
    }, true);

    document.addEventListener("focusout", event => {
      if (event.target === state.mobileActiveEditTextarea) state.mobileActiveEditTextarea = null;
    }, true);

    document.addEventListener("input", event => {
      if (isMessageEditTextarea(event.target)) resizeMessageEditTextarea(event.target);
    }, true);

    const onViewportResize = () => {
      cancelAnimationFrame(state.mobileResizeRaf);
      state.mobileResizeRaf = requestAnimationFrame(refreshActiveMobileEditor);
    };
    window.addEventListener("resize", onViewportResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onViewportResize, { passive: true });

    state.mobileObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) processAddedMobileNode(node);
      }
    });
    state.mobileObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  DS.applyMobileChatLayoutFixes = function applyMobileChatLayoutFixes() {
    if (!enabled() || !mobileLayoutActive()) return;
    installMobileChatLayoutFixes();
    const active = document.activeElement;
    if (isMessageEditTextarea(active)) resizeMessageEditTextarea(active);
    normalizeMobileSendWrapper();
  };

  // Kept as no-ops so older helpers cannot accidentally re-enable the removed
  // automatic chat-following behaviour.
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
