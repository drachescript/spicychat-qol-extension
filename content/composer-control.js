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
    guardTimer: 0
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
