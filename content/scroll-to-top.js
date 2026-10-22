// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
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
      const beforeTotal = swipeSettings().enabled ? (findSwipeRows().at(-1)?.total || 0) : 0;

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
        if (beforeTotal && mutations.some(mutation => {
          const element = mutation.target.nodeType === Node.TEXT_NODE
            ? mutation.target.parentElement : mutation.target;
          return !!(element?.closest?.("div[id^='message-']") &&
            Number(readSwipeCounter(element)?.total || 0) > beforeTotal);
        })) {
          finish(true);
          return;
        }
        const next = findLoadPreviousMessagesButton();
        // A disabled/temporarily removed button is just the loading state,
        // not proof that a batch completed. Wait for messages or a counter.
        if (next && next !== previousButton && !next.disabled) finish(true);
      });

      observer.observe(document.body || document.documentElement, { childList: true, characterData: true, subtree: true });
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

  async function loadPreviousForTopButton(mode = "all", {
    preserveViewport = false, chatKey = currentChatKey(), maxBatches = null,
    shouldStop = null, onBatch = null
  } = {}) {
    if (loadingOlder || !DS.isSingleChatPage?.()) return 0;
    loadingOlder = true;
    stopAfterCurrentBatch = false;
    DS.state.bulkChatHistoryLoadActive = true;
    DS.state.bulkChatHistoryLoadNeedsRefresh = false;
    document.documentElement.classList.add("ds-qol-history-loading");
    ensureStopButton();
    let batches = 0;

    try {
      const max = Number.isSafeInteger(maxBatches) && maxBatches > 0
        ? Math.min(100, maxBatches) : (mode === "one" ? 1 : 100);
      for (let i = 0; i < max; i++) {
        if (stopAfterCurrentBatch || shouldStop?.() || !DS.isSingleChatPage?.() || currentChatKey() !== chatKey) break;
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

        // Give React and swipe counters a quiet window before consulting the
        // caller. The native button can be replaced before the counter updates.
        await new Promise(resolve => setTimeout(resolve, 150));
        if (onBatch && await onBatch(batches) === false) break;
        if (stopAfterCurrentBatch || shouldStop?.()) break;
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


  // Native reply/swipe navigation. Never rewrite a reply, its swipe array, or
  // persisted chat state: only click the native previous/next controls.
  const SWIPE_CLASS = "ds-qol-swipe-jump";
  const swipeNavigation = {
    observer: null, timer: null, autoTimer: null, route: "", routeStartedAt: 0,
    autoAttempted: false, userInteracted: false, running: null,
    pendingHistory: null, lastSeenTotal: 0,
    // A chat may contain hundreds of mounted messages but only one or two
    // swipe rows. Revisit changed messages rather than scanning all of them
    // after every React token/toolbar mutation.
    cachedRows: new Map(), dirtyMessages: new Set(), fullScan: true
  };

  function swipeSettings() {
    const settings = DS.state?.settings || {};
    return {
      enabled: !!settings.enabled && (settings.showSwipeJumpButtons === true || settings.showSwipeJumpToNumber === true || settings.restoreFirstSwipeOnLoad === true),
      buttons: settings.showSwipeJumpButtons === true,
      number: settings.showSwipeJumpToNumber === true,
      auto: settings.restoreFirstSwipeOnLoad === true
    };
  }

  function swipeChatPath() {
    return /(?:^|\/)chat\/[^/]+/.test(location.pathname) ? location.pathname : "";
  }

  function readSwipeCounter(node) {
    const match = String(node?.textContent || "").trim().match(/^(\d{1,5})\s*\/\s*(\d{1,5})$/);
    if (!match) return null;
    const index = Number(match[1]);
    const total = Number(match[2]);
    return total > 1 && total <= 10000 && index >= 1 && index <= total ? { index, total } : null;
  }

  function interactiveForSwipeIcon(svg) {
    if (!svg) return null;
    return svg.closest("button, [role='button'], .cursor-pointer, [tabindex='0']") || svg.parentElement;
  }

  function swipeArrowCandidates(wrapper) {
    const controls = [...wrapper.querySelectorAll("button, [role='button'], .cursor-pointer, [tabindex='0']")];
    // SpicyChat also renders icons with click handlers on their enclosing
    // <div> on some mobile/desktop layouts, not always actual <button>s.
    for (const svg of wrapper.querySelectorAll("svg")) {
      const el = interactiveForSwipeIcon(svg);
      if (el && el !== wrapper && !controls.includes(el)) controls.push(el);
    }
    return controls.filter(el => el?.isConnected && !el.classList?.contains(SWIPE_CLASS) &&
      !el.closest?.(`.${SWIPE_CLASS}`) && !el.querySelector?.(`.${SWIPE_CLASS}`));
  }

  function swipeDirectionHint(el) {
    const text = [el?.getAttribute?.("aria-label"), el?.getAttribute?.("title"),
      el?.getAttribute?.("data-testid"), el?.querySelector?.("svg")?.getAttribute?.("class")].filter(Boolean).join(" ").toLowerCase();
    if (/\b(chevron-left|arrow-left|swipe-prev|swipe-previous|previous-swipe|prev-swipe|previous|prev)\b/.test(text)) return "prev";
    if (/\b(chevron-right|arrow-right|swipe-next|next-swipe|next)\b/.test(text)) return "next";
    return "";
  }

  function locateSwipeRow(message) {
    if (!message?.isConnected) return null;
    // Only leaf text nodes, never a parent whose aggregated text happens to
    // contain a separate counter (such as a story word-count control).
    const leaves = message.querySelectorAll("span, small, div, p");
    for (const node of leaves) {
      if (node.childElementCount || (node.textContent || "").length > 20) continue;
      const count = readSwipeCounter(node);
      if (!count) continue;
      let parent = node.parentElement;
      for (let depth = 0; parent && parent !== message && depth < 5; depth++, parent = parent.parentElement) {
        // SpicyChat 4.7.x puts the counter in a <p> between two buttons
        // labelled "previous" and "next". Prefer these native controls
        // before falling back to older chevron-only layouts.
        const nativePrev = parent.querySelector('button[aria-label="previous" i]');
        const nativeNext = parent.querySelector('button[aria-label="next" i]');
        if (nativePrev && nativeNext &&
            (nativePrev.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) &&
            (node.compareDocumentPosition(nativeNext) & Node.DOCUMENT_POSITION_FOLLOWING)) {
          return { message, counterNode: node, wrapper: parent, prev: nativePrev, next: nativeNext, ...count };
        }
        const controls = swipeArrowCandidates(parent).filter(el => el !== node && !node.contains(el));
        if (controls.length < 2 || controls.length > 18) continue;
        // Find the closest native controls on either side of the counter.
        const before = controls.filter(el => (el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
        const after = controls.filter(el => (el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
        if (!before.length || !after.length) continue;
        const prev = [...before].reverse().find(el => swipeDirectionHint(el) === "prev") || before[before.length - 1];
        const next = after.find(el => swipeDirectionHint(el) === "next") || after[0];
        if (prev === next || prev.contains(node) || next.contains(node)) continue;
        return { message, counterNode: node, wrapper: parent, prev, next, ...count };
      }
    }
    return null;
  }

  function findSwipeRows() {
    const started = performance.now();
    let visited = 0;
    if (swipeNavigation.fullScan) {
      swipeNavigation.cachedRows.clear();
      for (const message of document.querySelectorAll("div[id^='message-']")) {
        visited++;
        const row = locateSwipeRow(message);
        if (row) swipeNavigation.cachedRows.set(message, row);
      }
      swipeNavigation.fullScan = false;
      swipeNavigation.dirtyMessages.clear();
    } else {
      for (const message of swipeNavigation.dirtyMessages) {
        swipeNavigation.cachedRows.delete(message);
        if (!message.isConnected || !message.matches?.("div[id^='message-']")) continue;
        visited++;
        const row = locateSwipeRow(message);
        if (row) swipeNavigation.cachedRows.set(message, row);
      }
      swipeNavigation.dirtyMessages.clear();
      for (const message of swipeNavigation.cachedRows.keys()) {
        if (!message.isConnected) swipeNavigation.cachedRows.delete(message);
      }
    }
    const rows = [...swipeNavigation.cachedRows.values()].filter(row =>
      row.message.isConnected && row.prev.isConnected && row.next.isConnected && row.counterNode.isConnected);
    rows.sort((a, b) => a.message === b.message ? 0 :
      (a.message.compareDocumentPosition(b.message) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.swipeScans = Number(counters.swipeScans || 0) + 1;
    counters.swipeMessageRootsInspected = Number(counters.swipeMessageRootsInspected || 0) + visited;
    const elapsed = performance.now() - started;
    if (elapsed >= 8) {
      counters.swipeSlowScans = Number(counters.swipeSlowScans || 0) + 1;
      counters.swipeWorstScanMs = Math.max(Number(counters.swipeWorstScanMs || 0), Math.round(elapsed * 10) / 10);
    }
    return rows;
  }

  function markSwipeDirty(message) {
    if (message?.matches?.("div[id^='message-']")) swipeNavigation.dirtyMessages.add(message);
  }

  function historyForSwipe() {
    // We cannot infer the historical number of alternatives from a native
    // counter such as 50/50. This is the *loaded* count, not a verified total.
    return findLoadPreviousMessagesButton();
  }

  function removeSwipeButtons() {
    document.querySelectorAll(`.${SWIPE_CLASS}`).forEach(el => el.remove());
  }

  function swipeNotification(message) {
    DS.setQuickStatus?.(message);
  }

  function updateSwipeButtons(row, historyAvailable = !!historyForSwipe()) {
    if (!swipeSettings().buttons) return;
    for (const [where, text, description] of [
      ["first", "⇤", "Go to first generated reply"],
      ["last", "⇥", "Go to most recent generated reply"]
    ]) {
      let btn = row.wrapper.querySelector(`.${SWIPE_CLASS}[data-ds-swipe-target='${where}']`);
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = SWIPE_CLASS;
        btn.dataset.dsSwipeTarget = where;
        btn.setAttribute("aria-label", description);
        btn.style.cssText = "display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:25px;padding:0 4px;margin:0 2px;border:1px solid currentColor;border-radius:6px;font-size:15px;opacity:.8;cursor:pointer;background:transparent;color:inherit";
        btn.addEventListener("click", () => {
          if (swipeNavigation.running) { swipeNavigation.running.cancel = true; return; }
          // A swipe changes the visible response's DOM ID. Resolve the live
          // row at click time, not the original ID captured by this handler.
          const selected = locateSwipeRow(btn.closest("div[id^='message-']"));
          if (selected) void moveToSwipeBoundary(selected, where, false);
        });
      }
      // Wrap SpicyChat's native arrows: [First] [Previous] N/M [Next] [Last].
      // Move an existing control only if React has displaced it; no layout
      // mutation is needed on a normal repeat scan.
      if (where === "first" && btn.nextElementSibling !== row.prev) {
        row.prev.insertAdjacentElement("beforebegin", btn);
      } else if (where === "last" && btn.previousElementSibling !== row.next) {
        row.next.insertAdjacentElement("afterend", btn);
      }
      const busy = swipeNavigation.running && swipeRowMatchesJob(row, swipeNavigation.running);
      const olderAvailable = where === "first" && historyAvailable;
      const shouldDisable = !busy && (where === "first" ? (row.index <= 1 && !olderAvailable) : row.index >= row.total);
      const label = busy ? "■" : text;
      const title = busy ? "Stop swipe navigation"
        : (olderAvailable ? "Load older replies if available, then go to first generated reply" : description);
      // Do not generate a new mutation every time the observer scans the
      // controls. An unconditional textContent write caused repeated scans.
      if (btn.disabled !== shouldDisable) btn.disabled = shouldDisable;
      if (btn.textContent !== label) btn.textContent = label;
      if (btn.title !== title) btn.title = title;
    }
  }

  function updateSwipeNumberControl(row, historyAvailable = !!historyForSwipe()) {
    if (!swipeSettings().number) return;
    let container = row.wrapper.querySelector(`.${SWIPE_CLASS}[data-ds-swipe-target='number']`);
    if (!container) {
      container = document.createElement("span");
      container.className = SWIPE_CLASS;
      container.dataset.dsSwipeTarget = "number";
      container.style.cssText = "display:inline-flex;align-items:center;gap:3px;margin:0 2px;white-space:nowrap";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.step = "1";
      input.inputMode = "numeric";
      input.placeholder = "#";
      input.setAttribute("aria-label", "Generated reply number");
      input.style.cssText = "width:65px;min-width:0;height:25px;box-sizing:border-box;padding:2px 4px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px";
      input.addEventListener("input", () => {
        input.setCustomValidity("");
        const live = locateSwipeRow(container.closest("div[id^='message-']"));
        const requested = Number(input.value);
        if (live) go.textContent = Number.isSafeInteger(requested) && requested > live.total && historyForSwipe()
          ? "Load & Go" : "Go";
      });
      const go = document.createElement("button");
      go.type = "button";
      go.textContent = "Go";
      go.setAttribute("aria-label", "Go to generated reply number");
      go.style.cssText = "height:25px;padding:0 6px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:12px";
      const submit = () => {
        if (swipeNavigation.running) {
          swipeNavigation.running.cancel = true;
          return;
        }
        const live = locateSwipeRow(container.closest("div[id^='message-']"));
        if (!live) return;
        const raw = input.value.trim();
        const requested = Number(raw);
        const hasHistory = !!historyForSwipe();
        if (!raw || !Number.isSafeInteger(requested) || requested < 1 || requested > 10000 ||
            (requested > live.total && !hasHistory)) {
          input.setCustomValidity(hasHistory
            ? "Enter a whole reply number between 1 and 10000."
            : `Only ${live.total} replies are loaded; no older-history control is available.`);
          input.reportValidity();
          return;
        }
        input.setCustomValidity("");
        if (requested === live.index) {
          swipeNotification(`Already at generated reply ${requested}/${live.total}.`);
          return;
        }
        void moveToSwipeBoundary(live, requested, false);
      };
      go.addEventListener("click", submit);
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); submit(); }
        // Don't let typing in the input invoke native chat keyboard shortcuts.
        e.stopPropagation();
      });
      container.append(input, go);
    }
    // The number field is optional, independent of First/Last. Keep it after
    // Last when present, otherwise immediately after the native right arrow.
    const last = row.wrapper.querySelector(`.${SWIPE_CLASS}[data-ds-swipe-target='last']`);
    const reference = swipeSettings().buttons && last ? last : row.next;
    if (container.previousElementSibling !== reference) reference.insertAdjacentElement("afterend", container);
    const input = container.querySelector("input");
    const go = container.querySelector("button");
    if (!input || !go) return;
    // A native 50/50 counter may be the last 50 of 1,004 replies. Restricting
    // max to 50 prevents entering an absolute older reply number.
    const hasHistory = historyAvailable;
    const max = hasHistory ? "10000" : String(row.total);
    if (input.max !== max) input.max = max;
    const busy = !!swipeNavigation.running && swipeRowMatchesJob(row, swipeNavigation.running);
    const requested = Number(input.value);
    const loadNeeded = hasHistory && Number.isSafeInteger(requested) && requested > row.total;
    const label = busy ? "Stop" : (loadNeeded ? "Load & Go" : "Go");
    const title = busy
      ? `Stop navigating to reply ${swipeNavigation.running.destination}`
      : `${row.total} replies currently loaded${hasHistory ? "; older history may be available. Load only when requested" : ""}`;
    if (go.textContent !== label) go.textContent = label;
    if (go.title !== title) go.title = title;
    if (go.getAttribute("aria-label") !== title) go.setAttribute("aria-label", title);
    if (input.disabled !== busy) input.disabled = busy;
  }

  // On SpicyChat 4.7.x each generated alternative is a *different message*
  // with its own DOM ID, even though all alternatives belong to one chat turn.
  // The surrounding chat messages keep their IDs. Anchor to that turn instead
  // of the currently displayed response; it also survives history prepends.
  function swipeTurnAnchor(message) {
    const messages = [...document.querySelectorAll("div[id^='message-']")];
    const position = messages.indexOf(message);
    if (position < 0) return null;
    return {
      previousId: messages[position - 1]?.id || "",
      nextId: messages[position + 1]?.id || "",
      position,
      totalMessages: messages.length
    };
  }

  function swipeRowForJob(job) {
    const messages = [...document.querySelectorAll("div[id^='message-']")];
    let message = null;
    if (job.previousId) {
      const index = messages.findIndex(el => el.id === job.previousId);
      if (index >= 0) message = messages[index + 1];
    }
    if (!message && job.nextId) {
      const index = messages.findIndex(el => el.id === job.nextId);
      if (index > 0) message = messages[index - 1];
    }
    // The one-message case has no neighbor to use as a stable anchor.
    // Otherwise, never fall back to a changed numeric position after history
    // was loaded: that could navigate a different conversation turn.
    if (!message && !job.previousId && !job.nextId && messages.length === 1) {
      message = messages[0];
    }
    if (!message && messages.length === job.totalMessages) {
      message = messages[job.position];
    }
    return locateSwipeRow(message);
  }

  function swipeRowMatchesJob(row, job) {
    return !!row && !!job && swipeRowForJob(job)?.message === row.message;
  }

  async function waitForSwipeChange(priorIndex, target, job) {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline && !job.cancel && swipeChatPath() === job.route) {
      await new Promise(resolve => setTimeout(resolve, 65));
      const row = swipeRowForJob(job);
      if (row && (target < priorIndex ? row.index < priorIndex : row.index > priorIndex)) return row;
    }
    return null;
  }

  function refreshBusyButtons() {
    const available = !!historyForSwipe();
    for (const row of findSwipeRows()) {
      if (swipeSettings().buttons) updateSwipeButtons(row, available);
      if (swipeSettings().number) updateSwipeNumberControl(row, available);
    }
  }

  async function loadHistoryForSwipeJob(job, firstRequested) {
    if (!historyForSwipe()) return { batches: 0, exhausted: true };
    let lastTotal = 0;
    let unchangedBatches = 0;
    const MAX_SWIPE_HISTORY_BATCHES = 30;
    const batches = await loadPreviousForTopButton("all", {
      chatKey: currentChatKey(),
      preserveViewport: true,
      maxBatches: MAX_SWIPE_HISTORY_BATCHES,
      shouldStop: () => job.cancel || swipeChatPath() !== job.route,
      onBatch: async count => {
        // One native history request at a time, and never start these on chat
        // open. The person must actively request an unloaded reply / First.
        swipeNavigation.dirtyMessages.clear();
        swipeNavigation.fullScan = true;
        let row = swipeRowForJob(job);
        for (let retry = 0; row && row.total <= lastTotal && retry < 5; retry++) {
          await new Promise(resolve => setTimeout(resolve, 120));
          row = swipeRowForJob(job);
        }
        const total = Number(row?.total || 0);
        unchangedBatches = total > lastTotal ? 0 : unchangedBatches + 1;
        lastTotal = Math.max(lastTotal, total);
        if (count === 1 || count % 5 === 0) {
          swipeNotification(`Loading older replies: ${total || "?"} currently loaded (${count} batches). Click Stop to cancel.`);
        }
        if (job.cancel || swipeChatPath() !== job.route || unchangedBatches >= 3) return false;
        if (!firstRequested && total >= job.destination) return false;
        return !!historyForSwipe();
      }
    });
    const row = swipeRowForJob(job);
    const exhausted = !historyForSwipe();
    const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.swipeHistoryBatches = Number(counters.swipeHistoryBatches || 0) + batches;
    return { batches, exhausted, total: row?.total || 0 };
  }

  async function moveToSwipeBoundary(initial, target, automatic) {
    if (swipeNavigation.running || !swipeSettings().enabled || !initial?.message?.id) return;
    const anchor = swipeTurnAnchor(initial.message);
    if (!anchor) return;
    const firstRequested = target === "first";
    const destination = firstRequested ? 1 : target === "last" ? initial.total : Number(target);
    if (!Number.isSafeInteger(destination) || destination < 1 || destination > 10000) return;
    if (destination > initial.total && !historyForSwipe()) {
      if (!automatic) swipeNotification(`Only ${initial.total} generated replies are loaded.`);
      return;
    }
    const job = { route: swipeChatPath(), cancel: false, destination, ...anchor };
    swipeNavigation.running = job;
    const beganAt = performance.now();
    let steps = 0;
    let stoppedReason = "";
    let partialHistory = false;
    refreshBusyButtons();
    try {
      if ((firstRequested && !automatic && !!historyForSwipe()) || destination > initial.total) {
        const history = await loadHistoryForSwipeJob(job, firstRequested);
        partialHistory = firstRequested && !history.exhausted;
        if (!job.cancel && destination > (history.total || 0)) {
          stoppedReason = `only ${history.total || initial.total} replies are currently loaded`;
        }
      }
      while (!stoppedReason && !job.cancel && swipeChatPath() === job.route && steps < 10000) {
        const row = swipeRowForJob(job);
        if (!row) { stoppedReason = "native swipe controls changed"; break; }
        if (row.index === destination) break;
        if (destination > row.total) { stoppedReason = "target reply is no longer available"; break; }
        const arrow = row.index > destination ? row.prev : row.next;
        if (!arrow || arrow.disabled || arrow.getAttribute?.("aria-disabled") === "true" || arrow.hasAttribute?.("data-disabled")) {
          stoppedReason = "native navigation is unavailable";
          break;
        }
        const before = row.index;
        arrow.click();
        steps++;
        if (!await waitForSwipeChange(before, destination, job)) {
          if (!job.cancel) stoppedReason = "SpicyChat did not advance the reply";
          break;
        }
        if (steps % 5 === 0) {
          markSwipeDirty(row.message);
          refreshBusyButtons();
          await new Promise(resolve => setTimeout(resolve, 90));
        }
      }
    } finally {
      if (swipeNavigation.running === job) swipeNavigation.running = null;
      const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.swipeNativeNavigationSteps = Number(counters.swipeNativeNavigationSteps || 0) + steps;
      const durationMs = Math.round(performance.now() - beganAt);
      counters.swipeLastNavigationMs = durationMs;
      counters.swipeWorstNavigationMs = Math.max(Number(counters.swipeWorstNavigationMs || 0), durationMs);
      if (!automatic) {
        if (job.cancel) swipeNotification(`Swipe navigation stopped after ${steps} steps.`);
        else if (stoppedReason) swipeNotification(`Swipe navigation stopped: ${stoppedReason}.`);
        else {
          const current = swipeRowForJob(job);
          swipeNotification(`Swipe navigation finished at ${current?.index || "?"}/${current?.total || "?"} loaded replies (${steps} steps)${partialHistory ? "; more older history may still be available" : ""}.`);
        }
      }
      swipeNavigation.fullScan = true;
      scheduleSwipeScan();
    }
  }

  function scheduleAutomaticFirst(route, delay = 850) {
    clearTimeout(swipeNavigation.autoTimer);
    swipeNavigation.autoTimer = setTimeout(() => {
      if (!swipeSettings().auto || swipeNavigation.running || swipeChatPath() !== route || swipeNavigation.userInteracted) return;
      const latest = findSwipeRows().at(-1);
      if (latest?.index > 1) void moveToSwipeBoundary(latest, "first", true);
    }, delay);
  }

  function scanSwipeControls() {
    swipeNavigation.timer = null;
    const config = swipeSettings();
    const route = swipeChatPath();
    if (!config.enabled || !route) { stopSwipeNavigation(); return; }
    if (swipeNavigation.running) return;
    if (route !== swipeNavigation.route) {
      swipeNavigation.route = route;
      swipeNavigation.routeStartedAt = Date.now();
      swipeNavigation.autoAttempted = false;
      swipeNavigation.userInteracted = false;
      swipeNavigation.pendingHistory = null;
      swipeNavigation.lastSeenTotal = 0;
      swipeNavigation.cachedRows.clear();
      swipeNavigation.dirtyMessages.clear();
      swipeNavigation.fullScan = true;
      clearTimeout(swipeNavigation.autoTimer);
    }
    const rows = findSwipeRows();
    const liveMessages = new Set(rows.map(r => r.message));
    document.querySelectorAll(`.${SWIPE_CLASS}`).forEach(el => {
      const available = el.dataset.dsSwipeTarget === "number" ? config.number : config.buttons;
      if (!liveMessages.has(el.closest("div[id^='message-']")) || !available) el.remove();
    });
    const historyAvailable = !!historyForSwipe();
    for (const row of rows) {
      if (config.buttons) updateSwipeButtons(row, historyAvailable);
      if (config.number) updateSwipeNumberControl(row, historyAvailable);
    }
    const latest = rows.at(-1);
    if (latest) swipeNavigation.lastSeenTotal = latest.total;
    if (config.auto && !swipeNavigation.autoAttempted && !swipeNavigation.userInteracted && latest && !swipeNavigation.pendingHistory) {
      swipeNavigation.autoAttempted = true;
      scheduleAutomaticFirst(route, Math.max(0, 900 - (Date.now() - swipeNavigation.routeStartedAt)));
    }
    // "Load Previous Messages" can expose 150 more variants of the SAME
    // response (50/50 → 200/200 → 350/350 in the supplied recording).
    // Treat that as new available history, not a fresh reroll; ordinary
    // rerolls growing 50→51 must not trigger any automatic reset.
    const pending = swipeNavigation.pendingHistory;
    const messageCount = document.querySelectorAll("div[id^='message-']").length;
    if (config.auto && pending && latest &&
        (latest.total > pending.originalTotal + 1 || messageCount > pending.originalMessageCount)) {
      swipeNavigation.pendingHistory = null;
      swipeNavigation.userInteracted = false;
      scheduleAutomaticFirst(route, 700);
    } else if (pending && Date.now() - pending.startedAt > 15000) {
      swipeNavigation.pendingHistory = null;
    }
  }

  function scheduleSwipeScan() {
    if (swipeNavigation.timer) return;
    swipeNavigation.timer = setTimeout(scanSwipeControls, 160);
  }

  function onSwipeUserInput(e) {
    if (!swipeChatPath()) return;
    if (swipeNavigation.running) {
      // A user's real pointer action interrupts an automated long navigation
      // without confusing it with the synthetic native .click() steps.
      if (!e.target?.closest?.(`.${SWIPE_CLASS}`)) swipeNavigation.running.cancel = true;
    }
    if (e.target?.closest?.("div[id^='message-']")) swipeNavigation.userInteracted = true;
  }

  function onSwipeHistoryClick(e) {
    if (!e.isTrusted || swipeNavigation.running || !swipeSettings().auto || !swipeChatPath()) return;
    const target = e.target?.closest?.("button, [role='button'], .cursor-pointer");
    if (!target) return;
    const nativeHistory = target.querySelector('[data-translate-key="chat:page.action.loadPreviousMessages"]');
    if (!nativeHistory && !/load\s+previous\s+messages?/i.test(target.textContent || "")) return;
    const latest = findSwipeRows().at(-1);
    swipeNavigation.pendingHistory = {
      originalTotal: latest?.total || 0,
      originalMessageCount: document.querySelectorAll("div[id^='message-']").length,
      startedAt: Date.now()
    };
    swipeNavigation.userInteracted = false;
  }

  function stopSwipeNavigation() {
    if (swipeNavigation.running) swipeNavigation.running.cancel = true;
    swipeNavigation.observer?.disconnect();
    swipeNavigation.observer = null;
    clearTimeout(swipeNavigation.timer);
    clearTimeout(swipeNavigation.autoTimer);
    swipeNavigation.timer = null;
    swipeNavigation.autoTimer = null;
    swipeNavigation.pendingHistory = null;
    document.removeEventListener("pointerdown", onSwipeUserInput, true);
    document.removeEventListener("click", onSwipeHistoryClick, true);
    swipeNavigation.cachedRows.clear();
    swipeNavigation.dirtyMessages.clear();
    swipeNavigation.fullScan = true;
    removeSwipeButtons();
    swipeNavigation.route = "";
  }

  DS.applySwipeNavigation = function applySwipeNavigation() {
    if (!swipeSettings().enabled || !swipeChatPath()) { stopSwipeNavigation(); return; }
    if (!swipeNavigation.observer) {
      swipeNavigation.observer = new MutationObserver(records => {
        if (swipeNavigation.running) return;
        let relevant = false;
        for (const record of records) {
          const el = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
          if (el?.closest?.(`.${SWIPE_CLASS}`)) continue;
          const root = el?.closest?.("div[id^='message-']");
          if (root && record.type === "characterData") {
            // Ignore ordinary token streaming; counters are short N/M text.
            const text = String(record.target?.textContent || "").trim();
            if (!/^\d{1,5}\s*\/\s*\d{1,5}$/.test(text)) continue;
          }
          if (root) {
            // A QoL-owned child inserted into a native message does not mean
            // that SpicyChat's swipe controls changed.
            const nodes = [...record.addedNodes || [], ...record.removedNodes || []];
            if (nodes.length && nodes.every(node => DS.isQolOwnedNode?.(node))) continue;
            markSwipeDirty(root);
            relevant = true;
          } else if ([...record.addedNodes || [], ...record.removedNodes || []].some(node =>
            node.nodeType === 1 && (node.matches?.("div[id^='message-']") || node.querySelector?.("div[id^='message-']")))) {
            // React added or removed a message root. Mark only actual new
            // roots and let the cache prune detached old roots.
            for (const node of record.addedNodes || []) {
              if (!(node instanceof Element)) continue;
              if (node.matches?.("div[id^='message-']")) markSwipeDirty(node);
              node.querySelectorAll?.("div[id^='message-']").forEach(markSwipeDirty);
            }
            relevant = true;
          }
        }
        if (relevant) scheduleSwipeScan();
      });
      swipeNavigation.observer.observe(document.body || document.documentElement, { childList: true, characterData: true, subtree: true });
      document.addEventListener("pointerdown", onSwipeUserInput, true);
      document.addEventListener("click", onSwipeHistoryClick, true);
    }
    scheduleSwipeScan();
  };

  DS.isSwipeNavigationActive = () => !!swipeNavigation.observer;
  DS.removeSwipeNavigation = stopSwipeNavigation;

  DS.removeScrollToTopButton = removeButtons;
})();

}
