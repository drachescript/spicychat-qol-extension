(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const TOP_BUTTON_ID = "ds-scroll-to-top";
  const BOTTOM_BUTTON_ID = "ds-scroll-to-bottom";
  const STOP_BUTTON_ID = "ds-scroll-history-stop";
  const SHOW_AFTER = 520;
  let installed = false;
  let activeScroller = null;
  let loadingOlder = false;
  let backgroundLoadPromise = null;
  let backgroundLoadChat = "";
  let stopAfterCurrentBatch = false;

  function scrollTopOf(target) {
    if (!target || target === document || target === window) {
      return Number(document.scrollingElement?.scrollTop || window.scrollY || 0);
    }
    return Number(target.scrollTop || 0);
  }

  function scrollRangeOf(target) {
    if (!target || target === document || target === window) {
      const root = document.scrollingElement;
      return Math.max(0, Number(root?.scrollHeight || 0) - Number(root?.clientHeight || 0));
    }
    return Math.max(0, Number(target.scrollHeight || 0) - Number(target.clientHeight || 0));
  }

  function canScroll(target) {
    return scrollRangeOf(target) > 80;
  }

  function bestPageScroller() {
    const candidates = [
      activeScroller,
      document.scrollingElement,
      ...Array.from(document.querySelectorAll("main, [role='main'], .overflow-y-auto, .overflow-auto"))
    ].filter(Boolean);

    let best = document.scrollingElement;
    let bestRange = scrollRangeOf(best);

    for (const candidate of candidates) {
      if (!canScroll(candidate)) continue;
      const range = scrollRangeOf(candidate);
      if (range > bestRange) {
        best = candidate;
        bestRange = range;
      }
    }

    return best || document.scrollingElement;
  }

  function currentTarget() {
    return canScroll(activeScroller) ? activeScroller : bestPageScroller();
  }

  function normalizedPath() {
    const path = String(location.pathname || "/").replace(/\/{2,}/g, "/");
    return path.length > 1 ? path.replace(/\/+$/, "") : path;
  }

  function currentPageScope() {
    const path = normalizedPath();
    if (DS.isHomePage?.()) return "home";
    if (DS.isSingleChatPage?.()) return "chat";
    if (DS.isChatListPage?.()) return "chats";

    if (
      path === "/my-creations" ||
      path.startsWith("/my-creations/") ||
      /^\/(?:chatbot|lorebook)\/(?:create|edit)(?:\/|$)/i.test(path) ||
      path === "/create" ||
      path.startsWith("/create/")
    ) return "creation";

    if (DS.isBotProfilePage?.() || DS.isLorebookPage?.()) return "profiles";
    return "other";
  }

  function pageScopeEnabled(settings = DS.state?.settings || {}) {
    const keyByScope = {
      home: "scrollNavOnHome",
      chats: "scrollNavOnChats",
      chat: "scrollNavOnChat",
      creation: "scrollNavOnCreation",
      profiles: "scrollNavOnProfiles",
      other: "scrollNavOnOther"
    };
    const key = keyByScope[currentPageScope()] || "scrollNavOnOther";
    // Missing keys from older backups behave like the old global setting: enabled.
    return settings[key] !== false;
  }

  function mobileViewport() {
    try {
      return window.matchMedia?.("(pointer: coarse)")?.matches || window.innerWidth <= 760;
    } catch {
      return window.innerWidth <= 760;
    }
  }

  function visibleChatComposer() {
    if (!DS.isSingleChatPage?.()) return null;
    const candidates = [...document.querySelectorAll("textarea")]
      .filter(el => !el.closest?.("#ds-qol-panel, #ds-chat-export-modal, [role='dialog']"))
      .filter(el => {
        const rect = el.getBoundingClientRect?.();
        if (!rect || rect.width < 80 || rect.height < 20) return false;
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && rect.bottom > 0;
      });
    const textarea = candidates.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
    if (!textarea) return null;

    let host = textarea.closest("form");
    if (!host) {
      let node = textarea.parentElement;
      for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
        const rect = node.getBoundingClientRect?.();
        const hasSend = !!node.querySelector?.("button[type='submit'], button[aria-label*='send' i]");
        if (rect && rect.width >= textarea.getBoundingClientRect().width && (hasSend || rect.height >= textarea.getBoundingClientRect().height)) {
          host = node;
          if (hasSend) break;
        }
      }
    }
    return host || textarea;
  }

  function applyHorizontalPlacement() {
    const settings = DS.state?.settings || {};
    const side = settings.scrollNavSide === "left" ? "left" : "right";
    const inset = Math.max(4, Math.min(160, Number(settings.scrollNavHorizontalInset) || 12));
    for (const button of [document.getElementById(TOP_BUTTON_ID), document.getElementById(BOTTOM_BUTTON_ID)]) {
      if (!button) continue;
      button.style[side] = `${Math.round(inset)}px`;
      button.style[side === "left" ? "right" : "left"] = "auto";
    }
  }

  function resetMobilePlacement() {
    for (const button of [document.getElementById(TOP_BUTTON_ID), document.getElementById(BOTTOM_BUTTON_ID)]) {
      if (button?.dataset.dsMobileBottom === "1") {
        button.style.removeProperty("bottom");
        delete button.dataset.dsMobileBottom;
      }
    }
  }

  function updateMobilePlacement() {
    if (!mobileViewport() || !DS.isSingleChatPage?.()) {
      resetMobilePlacement();
      return;
    }

    const composer = visibleChatComposer();
    if (!composer) {
      resetMobilePlacement();
      return;
    }

    const rect = composer.getBoundingClientRect();
    const visual = window.visualViewport;
    const viewportHeight = Number(visual?.height || window.innerHeight || document.documentElement.clientHeight || 0);
    const viewportOffsetTop = Number(visual?.offsetTop || 0);
    // getBoundingClientRect is layout-viewport based while Firefox Android may
    // expose a shifted/shrunken visual viewport. Convert the composer top into
    // visual-viewport coordinates before calculating the fixed bottom gap.
    const composerTopInVisualViewport = rect.top - viewportOffsetTop;
    // The composer can be taller than its textarea (shortcut row, send button, etc.).
    // Keep the lower arrow above the whole visible composer, then add a user-set
    // lift so Firefox Android users can clear native generation-attempt controls.
    const extraLift = Math.max(0, Math.min(220, Number(DS.state?.settings?.scrollNavMobileExtraLift ?? 56)));
    const automaticBase = Math.max(78, Math.min(Math.max(78, viewportHeight - composerTopInVisualViewport + 12), Math.max(78, viewportHeight - 56)));
    const base = Math.min(Math.max(78, viewportHeight - 56), automaticBase + extraLift);
    applyHorizontalPlacement();
    const topButton = document.getElementById(TOP_BUTTON_ID);
    const bottomButton = document.getElementById(BOTTOM_BUTTON_ID);
    const both = !!topButton && !!bottomButton;
    if (bottomButton) {
      bottomButton.style.bottom = `calc(${Math.round(base)}px + env(safe-area-inset-bottom, 0px))`;
      bottomButton.dataset.dsMobileBottom = "1";
    }
    if (topButton) {
      const topBase = both ? base + 48 : base;
      topButton.style.bottom = `calc(${Math.round(topBase)}px + env(safe-area-inset-bottom, 0px))`;
      topButton.dataset.dsMobileBottom = "1";
    }
  }

  function updateVisibility() {
    const settings = DS.state?.settings || {};
    applyHorizontalPlacement();
    if (!pageScopeEnabled(settings)) {
      document.getElementById(TOP_BUTTON_ID)?.classList.remove("ds-visible");
      document.getElementById(BOTTOM_BUTTON_ID)?.classList.remove("ds-visible");
      return;
    }
    const target = currentTarget();
    const top = scrollTopOf(target);
    const range = scrollRangeOf(target);
    const remaining = Math.max(0, range - top);

    const topButton = document.getElementById(TOP_BUTTON_ID);
    if (topButton) topButton.classList.toggle("ds-visible", !!settings.showScrollToTopButton && top >= SHOW_AFTER);

    const bottomButton = document.getElementById(BOTTOM_BUTTON_ID);
    if (bottomButton) bottomButton.classList.toggle("ds-visible", !!settings.showScrollToBottomButton && remaining >= SHOW_AFTER);
    updateMobilePlacement();
  }

  function onScroll(event) {
    const target = event.target === document ? document.scrollingElement : event.target;
    if (target && target instanceof Element && canScroll(target)) activeScroller = target;
    updateVisibility();
  }

  function install() {
    if (installed) return;
    installed = true;
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility, { passive: true });
    window.visualViewport?.addEventListener?.("resize", updateVisibility, { passive: true });
    window.visualViewport?.addEventListener?.("scroll", updateVisibility, { passive: true });
  }

  function uninstall() {
    if (!installed) return;
    installed = false;
    document.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("scroll", updateVisibility);
    window.removeEventListener("resize", updateVisibility);
    window.visualViewport?.removeEventListener?.("resize", updateVisibility);
    window.visualViewport?.removeEventListener?.("scroll", updateVisibility);
    activeScroller = null;
    resetMobilePlacement();
  }

  function removeButtons() {
    document.getElementById(TOP_BUTTON_ID)?.remove();
    document.getElementById(BOTTOM_BUTTON_ID)?.remove();
    document.getElementById(STOP_BUTTON_ID)?.remove();
    uninstall();
  }

  function scrollTargetTo(target, top, behavior = "smooth") {
    try {
      if (target && target !== document.scrollingElement) target.scrollTo({ top, behavior });
      else window.scrollTo({ top, behavior });
    } catch {
      if (target) target.scrollTop = top;
      if (!target || target === document.scrollingElement) window.scrollTo(0, top);
    }
  }

  function currentChatKey() {
    return DS.chatIdFromHref?.(location.href || "") || location.pathname;
  }

  function findLoadPreviousMessagesButton() {
    if (!DS.isSingleChatPage?.()) return null;
    return [...document.querySelectorAll("button")].find(button => {
      if (button.disabled || button.closest("#ds-qol-panel")) return false;
      const key = button.querySelector("[data-translate-key='chat:page.action.loadPreviousMessages']");
      const text = String(button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      return !!key || text.includes("load previous messages");
    }) || null;
  }

  function nodeContainsMessageRoot(node) {
    if (!(node instanceof Element)) return false;
    return !!(node.matches?.("div[id^='message-']") || node.querySelector?.("div[id^='message-']"));
  }

  function waitForOlderProgress(previousButton, timeoutMs = 6500) {
    return new Promise(resolve => {
      let settled = false;
      let observer = null;
      let timer = null;

      const finish = value => {
        if (settled) return;
        settled = true;
        observer?.disconnect();
        clearTimeout(timer);
        resolve(value);
      };

      observer = new MutationObserver(mutations => {
        if (mutations.some(mutation => [...mutation.addedNodes].some(nodeContainsMessageRoot))) {
          finish(true);
          return;
        }
        const next = findLoadPreviousMessagesButton();
        if (!next || next !== previousButton) finish(true);
      });

      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      timer = setTimeout(() => finish(false), timeoutMs);
    });
  }

  function scrollerTopEdge(target) {
    if (!target || target === document.scrollingElement) return 0;
    try { return Number(target.getBoundingClientRect().top || 0); } catch { return 0; }
  }

  function viewportAnchor(target) {
    const edge = scrollerTopEdge(target);
    const x = Math.max(8, Math.min(window.innerWidth - 8, Math.round(window.innerWidth / 2)));
    for (const offset of [8, 36, 80, 140, 220]) {
      const y = Math.max(1, Math.min(window.innerHeight - 1, edge + offset));
      for (const element of document.elementsFromPoint(x, y)) {
        const message = element.closest?.("div[id^='message-']");
        if (message) return message;
      }
    }
    return null;
  }

  function removeStopButton() {
    document.getElementById(STOP_BUTTON_ID)?.remove();
  }

  function ensureStopButton() {
    const settings = DS.state?.settings || {};
    if (!loadingOlder || !settings.enabled || !settings.showScrollToTopButton) {
      removeStopButton();
      return null;
    }

    let button = document.getElementById(STOP_BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = STOP_BUTTON_ID;
      button.type = "button";
      button.className = "ds-scroll-history-stop";
      button.addEventListener("click", () => {
        stopAfterCurrentBatch = true;
        button.disabled = true;
        button.textContent = "Stopping after this page…";
        button.title = "The current older-message page will finish loading, then QoL will stop.";
      });
      document.documentElement.appendChild(button);
    }
    if (!stopAfterCurrentBatch) {
      button.disabled = false;
      button.textContent = "Stop loading older messages";
      button.title = "Finish the current page, then stop loading older messages";
    }
    return button;
  }

  function preserveAnchorAfterPrepend(target, anchor, beforeTop) {
    if (!anchor?.isConnected) return;
    const afterTop = anchor.getBoundingClientRect().top;
    const delta = afterTop - beforeTop;
    if (!Number.isFinite(delta) || Math.abs(delta) < 2) return;
    const next = Math.max(0, scrollTopOf(target) + delta);
    scrollTargetTo(target, next, "auto");
  }

  async function loadPreviousForTopButton(mode = "all", { preserveViewport = false, chatKey = currentChatKey() } = {}) {
    if (loadingOlder || !DS.isSingleChatPage?.()) return 0;
    loadingOlder = true;
    stopAfterCurrentBatch = false;
    DS.state.bulkChatHistoryLoadActive = true;
    DS.state.bulkChatHistoryLoadNeedsRefresh = false;
    document.documentElement.classList.add("ds-qol-history-loading");
    ensureStopButton();
    let batches = 0;

    try {
      const max = mode === "one" ? 1 : 100;
      for (let i = 0; i < max; i++) {
        if (!DS.isSingleChatPage?.() || currentChatKey() !== chatKey) break;
        const native = findLoadPreviousMessagesButton();
        if (!native) break;

        const target = currentTarget();
        const anchor = preserveViewport ? viewportAnchor(target) : null;
        const beforeTop = anchor ? anchor.getBoundingClientRect().top : 0;
        try { native.click(); } catch { DS.realClick?.(native); }
        batches++;

        const progressed = await waitForOlderProgress(native);
        if (preserveViewport && anchor) preserveAnchorAfterPrepend(target, anchor, beforeTop);
        if (!progressed) break;

        if (stopAfterCurrentBatch) break;

        // Give React/layout a small quiet window before requesting another page.
        await DS.sleep?.(120);
      }
    } finally {
      loadingOlder = false;
      removeStopButton();
      DS.state.bulkChatHistoryLoadActive = false;
      if (Date.now() >= Number(DS.state.chatHistoryBatchUntil || 0)) document.documentElement.classList.remove("ds-qol-history-loading");
      const needsRefresh = !!DS.state.bulkChatHistoryLoadNeedsRefresh;
      DS.state.bulkChatHistoryLoadNeedsRefresh = false;
      if (needsRefresh && currentChatKey() === chatKey) {
        DS.bumpDomRevision?.();
        // Run one scoped message pass after the full prepend finishes. Normal
        // mode routes this through the critical lane; adaptive modes can use the
        // dirty roots collected during loading and defer cosmetics until quiet.
        DS.scheduleMessageLane?.("older-history-load-finished");
      }
    }

    return batches;
  }

  function startBackgroundPreviousLoad(mode = "all") {
    const chatKey = currentChatKey();
    if (backgroundLoadPromise && backgroundLoadChat === chatKey) return backgroundLoadPromise;

    backgroundLoadChat = chatKey;
    backgroundLoadPromise = (async () => {
      // Let the immediate jump start first so the user is not held up by loading.
      await DS.sleep?.(180);
      const batches = await loadPreviousForTopButton(mode, { preserveViewport: true, chatKey });
      if (currentChatKey() === chatKey && batches) {
        DS.setQuickStatus?.(`Loaded ${batches} older message batch${batches === 1 ? "" : "es"} in the background.`);
      }
      return batches;
    })().finally(() => {
      if (backgroundLoadChat === chatKey) {
        backgroundLoadPromise = null;
        backgroundLoadChat = "";
      }
    });

    return backgroundLoadPromise;
  }

  async function handleTopAction() {
    const settings = DS.state?.settings || {};
    const target = currentTarget();

    if (!DS.isSingleChatPage?.() || !settings.scrollTopLoadPreviousMessages) {
      scrollTargetTo(target, 0);
      return;
    }

    const mode = settings.scrollTopLoadPreviousMode === "one" ? "one" : "all";
    const timing = settings.scrollTopLoadPreviousTiming === "background" ? "background" : "before";

    if (timing === "background") {
      // If a background run is already active, ↑ still works as a normal jump to
      // whatever oldest batch has been loaded so far.
      scrollTargetTo(target, 0);
      startBackgroundPreviousLoad(mode);
      return;
    }

    const button = document.getElementById(TOP_BUTTON_ID);
    if (loadingOlder) {
      scrollTargetTo(target, 0);
      return;
    }

    if (button) {
      button.disabled = true;
      button.classList.add("ds-scroll-nav-loading");
      button.dataset.dsOriginalTitle = button.title || "Scroll to top";
      button.title = "Loading older messages…";
    }

    try {
      const batches = await loadPreviousForTopButton(mode);
      if (batches) DS.setQuickStatus?.(`Loaded ${batches} older message batch${batches === 1 ? "" : "es"}.`);
    } finally {
      if (button) {
        button.disabled = false;
        button.classList.remove("ds-scroll-nav-loading");
        button.title = button.dataset.dsOriginalTitle || "Scroll to top";
        delete button.dataset.dsOriginalTitle;
      }
    }

    scrollTargetTo(currentTarget(), 0);
  }

  function ensureButton(id, label, glyph, direction) {
    let button = document.getElementById(id);
    if (button) return button;

    button = document.createElement("button");
    button.id = id;
    button.className = "ds-scroll-nav-button";
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = glyph;
    button.addEventListener("click", async () => {
      if (direction === "top") await handleTopAction();
      else {
        const target = currentTarget();
        scrollTargetTo(target, scrollRangeOf(target));
      }
    });
    document.documentElement.appendChild(button);
    return button;
  }

  DS.applyScrollToTopButton = function applyScrollToTopButton() {
    const settings = DS.state?.settings || {};
    if (
      !settings.enabled ||
      (!settings.showScrollToTopButton && !settings.showScrollToBottomButton) ||
      !pageScopeEnabled(settings)
    ) {
      removeButtons();
      return;
    }

    install();

    if (settings.showScrollToTopButton) ensureButton(TOP_BUTTON_ID, "Scroll to top", "↑", "top");
    else {
      document.getElementById(TOP_BUTTON_ID)?.remove();
      removeStopButton();
    }

    if (settings.showScrollToBottomButton) ensureButton(BOTTOM_BUTTON_ID, "Scroll to bottom", "↓", "bottom");
    else document.getElementById(BOTTOM_BUTTON_ID)?.remove();

    const bothEnabled = !!settings.showScrollToTopButton && !!settings.showScrollToBottomButton;
    const subtle = !DS.isSingleChatPage?.();

    for (const button of [document.getElementById(TOP_BUTTON_ID), document.getElementById(BOTTOM_BUTTON_ID)]) {
      button?.classList.toggle("ds-scroll-nav-subtle", subtle);
    }

    document.getElementById(TOP_BUTTON_ID)?.classList.toggle("ds-scroll-nav-stacked-top", bothEnabled);
    document.getElementById(BOTTOM_BUTTON_ID)?.classList.toggle("ds-scroll-nav-stacked-bottom", bothEnabled);

    updateVisibility();
    ensureStopButton();
  };

  DS.scrollChatToTop = async function scrollChatToTop() {
    await handleTopAction();
  };

  DS.scrollChatToBottom = function scrollChatToBottom() {
    const target = currentTarget();
    scrollTargetTo(target, scrollRangeOf(target));
  };

  DS.removeScrollToTopButton = removeButtons;
})();
