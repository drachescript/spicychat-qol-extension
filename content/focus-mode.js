(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const ROOT_ACTIVE = "ds-focus-mode-active";
  const ROOT_HIDE_SIDEBAR = "ds-focus-hide-sidebar";
  const ROOT_HIDE_TOPBAR = "ds-focus-hide-topbar";
  const ROOT_HIDE_CHAT_HEADER = "ds-focus-hide-chat-header";
  const ROOT_HIDE_QOL = "ds-focus-hide-qol-panel";
  const TOPBAR_TARGET = "ds-focus-mode-topbar-target";
  const CHAT_HEADER_TARGET = "ds-focus-mode-chat-header-target";
  const EXIT_ID = "ds-focus-mode-exit";

  let observer = null;
  let refreshTimer = 0;

  function settings() {
    return DS.state?.settings || {};
  }

  function featureAvailable() {
    const s = settings();
    return !!s.enabled && !!s.enableFocusMode && !!DS.isSingleChatPage?.();
  }

  function isActive() {
    return !!DS.state.focusModeActive;
  }

  function clearTargetClasses() {
    document.querySelectorAll(`.${TOPBAR_TARGET}`).forEach(el => el.classList.remove(TOPBAR_TARGET));
    document.querySelectorAll(`.${CHAT_HEADER_TARGET}`).forEach(el => el.classList.remove(CHAT_HEADER_TARGET));
  }

  function findTopBarControls() {
    const avatar =
      document.querySelector("a[aria-label='avatar'][href='/profile']") ||
      document.querySelector("a[aria-label='avatar'][href*='/profile']") ||
      document.querySelector("a[aria-label='avatar']");

    const starts = [
      avatar,
      document.querySelector("[data-testid='LocaleSelector']"),
      document.querySelector("button[aria-label='notifications']"),
      document.querySelector("button[aria-label='theme']"),
    ].filter(Boolean);

    for (const start of starts) {
      let node = start.parentElement;
      let fallback = node;

      for (let i = 0; node && i < 10; i++, node = node.parentElement) {
        if (node === document.body || node.id === "root") break;

        const rect = node.getBoundingClientRect?.();
        let position = "";
        try { position = getComputedStyle(node).position; } catch {}

        const hasControls = !!(
          node.querySelector?.("a[aria-label='avatar']") &&
          (
            node.querySelector?.("[data-testid='LocaleSelector']") ||
            node.querySelector?.("button[aria-label='notifications']") ||
            node.querySelector?.("button[aria-label='theme']")
          )
        );

        if (hasControls) fallback = node;
        if (hasControls && rect?.width > window.innerWidth * 0.45 && ["fixed", "sticky"].includes(position)) {
          return node;
        }
      }

      if (fallback) return fallback;
    }

    return null;
  }

  function findChatHeaderRoot() {
    const profile = document.querySelector("a[aria-label='chatbot-profile'][href*='/chatbot/']");
    const dropdown = document.querySelector("button[aria-label='chat-dropdown']");
    const start = profile || dropdown;
    if (!start) return null;

    let fallback = start.parentElement;

    for (let node = start; node && node !== document.body && node.id !== "root"; node = node.parentElement) {
      const hasProfile = !!node.querySelector?.("a[aria-label='chatbot-profile']");
      const hasDropdown = !!node.querySelector?.("button[aria-label='chat-dropdown']");
      const hasControls = !!node.querySelector?.("button[aria-label='ThumbsUp-button'], [data-testid='ChatModelTierCapabilityGate']");

      if (hasProfile && hasDropdown) fallback = node;
      if (hasProfile && hasDropdown && hasControls) return node;
    }

    return fallback;
  }

  function applyTargetClasses() {
    clearTargetClasses();
    if (!isActive()) return;

    findTopBarControls()?.classList.add(TOPBAR_TARGET);
    findChatHeaderRoot()?.classList.add(CHAT_HEADER_TARGET);
  }

  function syncRootClasses() {
    const root = document.documentElement;
    const s = settings();
    const active = isActive() && featureAvailable();

    root.classList.toggle(ROOT_ACTIVE, active);
    root.classList.toggle(ROOT_HIDE_SIDEBAR, active && s.focusHideSidebar !== false);
    root.classList.toggle(ROOT_HIDE_TOPBAR, active && s.focusHideTopBar !== false);
    root.classList.toggle(ROOT_HIDE_CHAT_HEADER, active && s.focusHideChatHeader !== false);
    root.classList.toggle(ROOT_HIDE_QOL, active && s.focusHideQolPanel !== false);
  }

  function ensureExitButton() {
    if (!isActive() || !featureAvailable()) {
      document.getElementById(EXIT_ID)?.remove();
      return;
    }

    let button = document.getElementById(EXIT_ID);
    if (button) return button;

    button = document.createElement("button");
    button.id = EXIT_ID;
    button.type = "button";
    button.textContent = "Exit focus";
    button.title = "Exit Focus / Immersive Mode";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => DS.setFocusMode?.(false));
    document.documentElement.appendChild(button);
    return button;
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    clearTimeout(refreshTimer);
    refreshTimer = 0;
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (!isActive()) return;
      applyTargetClasses();
      ensureExitButton();
    }, 100);
  }

  function startObserver() {
    if (observer || !isActive()) return;
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function cleanup() {
    stopObserver();
    clearTargetClasses();
    document.getElementById(EXIT_ID)?.remove();
    document.documentElement.classList.remove(
      ROOT_ACTIVE,
      ROOT_HIDE_SIDEBAR,
      ROOT_HIDE_TOPBAR,
      ROOT_HIDE_CHAT_HEADER,
      ROOT_HIDE_QOL
    );
  }

  DS.setFocusMode = function setFocusMode(active) {
    const next = !!active && featureAvailable();
    DS.state.focusModeActive = next;

    if (!next) {
      cleanup();
      DS.updateQuickPanel?.();
      return false;
    }

    syncRootClasses();
    applyTargetClasses();
    ensureExitButton();
    startObserver();
    DS.updateQuickPanel?.();
    return true;
  };

  DS.toggleFocusMode = function toggleFocusMode() {
    if (!featureAvailable()) {
      DS.setQuickStatus?.("Enable Focus / Immersive Mode in Settings first.");
      return false;
    }
    return DS.setFocusMode(!isActive());
  };

  DS.isFocusModeActive = isActive;

  DS.applyFocusMode = function applyFocusMode() {
    if (!featureAvailable()) {
      if (isActive()) DS.state.focusModeActive = false;
      cleanup();
      return;
    }

    if (!isActive()) {
      cleanup();
      return;
    }

    syncRootClasses();
    applyTargetClasses();
    ensureExitButton();
    startObserver();
  };

  DS.removeFocusMode = function removeFocusMode() {
    DS.state.focusModeActive = false;
    cleanup();
  };

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !isActive()) return;
    DS.setFocusMode?.(false);
  }, true);
})();
