(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const LONG_CHAT_THRESHOLD = 80;
  const DESKTOP_APP_LONG_CHAT_THRESHOLD = 50;
  const KEEP_FULLY_RENDERED = 10;
  const DESKTOP_APP_KEEP_FULLY_RENDERED = 6;
  const PERFORMANCE_RELOAD_STATE_KEY = "dsQolPerformanceReloadV1";
  const CHAT_WINDOW_CONFIG = Object.freeze({
    normal: Object.freeze({ threshold: 140, keep: 70, reveal: 50 }),
    adaptive: Object.freeze({ threshold: 120, keep: 60, reveal: 50 }),
    aggressive: Object.freeze({ threshold: 100, keep: 50, reveal: 50 }),
    maximum: Object.freeze({ threshold: 80, keep: 40, reveal: 40 })
  });
  let listingPaintRevision = -1;
  let listingPaintKey = "";
  let listingPaintCards = new Set();
  let menuCard = null;
  let menuCleanupTimer = 0;
  let menuHooksInstalled = false;
  let chatWindowRouteKey = "";
  let chatWindowVisibleCount = 0;
  let chatWindowApplied = false;
  let chatWindowControl = null;
  let performanceReloadRestoreTimer = 0;

  function settings() {
    return DS.state?.settings || {};
  }

  function isActiveChatPerformance() {
    const s = settings();
    return !!(s.enabled && s.chatPerformanceMode && DS.isSingleChatPage?.());
  }

  function messageRoots() {
    return Array.from(document.querySelectorAll("[id^='message-']"))
      .filter(root => root.id && !root.closest?.("#ds-qol-panel, #ds-chat-export-modal"));
  }

  function chatRouteKey() {
    return `${location.pathname || ""}${location.search || ""}`;
  }

  function performanceProfile() {
    const configured = String(settings().runtimePerformanceMode || "adaptive");
    if (["normal", "adaptive", "aggressive", "maximum"].includes(configured)) return configured;
    return "adaptive";
  }

  function chatWindowConfig() {
    let profile = performanceProfile();
    if (desktopAppGuardActive() && (profile === "normal" || profile === "adaptive")) profile = "aggressive";
    return CHAT_WINDOW_CONFIG[profile] || CHAT_WINDOW_CONFIG.adaptive;
  }

  function removeChatWindowControl() {
    chatWindowControl?.remove?.();
    chatWindowControl = null;
  }

  function clearChatWindowState({ keepRoute = false } = {}) {
    document.querySelectorAll(".ds-chat-message-windowed, .ds-chat-message-far").forEach(root => {
      root.classList.remove("ds-chat-message-windowed", "ds-chat-message-far");
    });
    removeChatWindowControl();
    chatWindowApplied = false;
    chatWindowVisibleCount = 0;
    if (!keepRoute) chatWindowRouteKey = "";
    DS.state.performanceWindowHiddenCount = 0;
    DS.state.performanceWindowVisibleCount = 0;
  }

  function clearMessageClasses() {
    document.querySelectorAll(
      ".ds-chat-message-lite, .ds-chat-message-far, .ds-chat-message-windowed, [data-ds-performance-observed='1'], [data-ds-performance-newest='1']"
    ).forEach(el => {
      el.classList.remove("ds-chat-message-lite", "ds-chat-message-far", "ds-chat-message-windowed");
      delete el.dataset.dsPerformanceObserved;
      delete el.dataset.dsPerformanceNewest;
    });
    removeChatWindowControl();
    chatWindowApplied = false;
    chatWindowVisibleCount = 0;
    chatWindowRouteKey = "";
    DS.state.performanceWindowHiddenCount = 0;
    DS.state.performanceWindowVisibleCount = 0;
  }

  function desktopAppGuardActive() {
    const s = settings();
    const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
    return s.desktopAppPerformanceGuard !== false && !!env.installedApp && !env.android;
  }

  function applyStaticLightweightClasses(roots) {
    const keepRendered = desktopAppGuardActive() ? DESKTOP_APP_KEEP_FULLY_RENDERED : KEEP_FULLY_RENDERED;
    const liteUntil = Math.max(0, roots.length - keepRendered);

    roots.forEach((root, index) => {
      // Previous versions changed these classes while scrolling with an
      // IntersectionObserver. On very long chats that caused repeated DOM work
      // exactly while the user was trying to scroll. Keep the classification
      // static instead and let CSS content-visibility decide what to paint.
      const shouldLite = index < liteUntil;
      const hasLite = root.classList.contains("ds-chat-message-lite");
      if (shouldLite && !hasLite) root.classList.add("ds-chat-message-lite");
      else if (!shouldLite && hasLite) root.classList.remove("ds-chat-message-lite");

      if ("dsPerformanceObserved" in root.dataset) delete root.dataset.dsPerformanceObserved;
      if ("dsPerformanceNewest" in root.dataset) delete root.dataset.dsPerformanceNewest;
    });
  }

  function scrollContainerFor(roots = messageRoots()) {
    let node = roots.at(-1)?.parentElement || null;
    for (let depth = 0; node && depth < 10 && node !== document.body; depth++, node = node.parentElement) {
      try {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY || "") && node.scrollHeight > node.clientHeight + 120) return node;
      } catch {}
    }
    return document.scrollingElement || document.documentElement;
  }

  function isDocumentScroller(scroller) {
    return scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body;
  }

  function nearBottom(scroller) {
    if (!scroller) return true;
    if (isDocumentScroller(scroller)) {
      const root = document.scrollingElement || document.documentElement;
      return root.scrollHeight - (root.scrollTop + window.innerHeight) < 900;
    }
    return scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight) < 900;
  }

  function scrollToBottom(scroller) {
    if (!scroller) return;
    if (isDocumentScroller(scroller)) {
      const root = document.scrollingElement || document.documentElement;
      window.scrollTo({ top: root.scrollHeight, behavior: "auto" });
    } else {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }

  function firstVisibleMessage(roots) {
    const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 800);
    return roots.find(root => {
      if (root.classList.contains("ds-chat-message-windowed")) return false;
      try {
        const rect = root.getBoundingClientRect();
        return rect.bottom >= 0 && rect.top <= height;
      } catch {
        return false;
      }
    }) || null;
  }

  function generationLikelyActive() {
    const candidates = Array.from(document.querySelectorAll("button"));
    return candidates.some(button => {
      if (!button.getClientRects?.().length) return false;
      const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.textContent || ""}`.trim();
      return /stop\s+(generating|generation|reply)|cancel\s+generation/i.test(label);
    });
  }

  function findComposerField() {
    const fields = Array.from(document.querySelectorAll("textarea, [contenteditable='true']"));
    return fields.find(field => {
      if (!(field instanceof HTMLElement)) return false;
      if (field.closest("[id^='message-'], #ds-qol-panel, #ds-chat-export-modal")) return false;
      const placeholder = String(field.getAttribute("placeholder") || "");
      if (/search|filter/i.test(placeholder)) return false;
      return field.getClientRects?.().length > 0;
    }) || fields.find(field => !field.closest?.("[id^='message-'], #ds-qol-panel, #ds-chat-export-modal")) || null;
  }

  function composerText(field) {
    if (!field) return "";
    if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) return String(field.value || "");
    return String(field.textContent || "");
  }

  function setComposerText(field, text) {
    if (!field) return false;
    const value = String(text || "");
    try {
      if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
        const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(field, value);
        else field.value = value;
      } else {
        field.textContent = value;
      }
      field.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  function queueScrollBottom() {
    [80, 350, 900].forEach(delay => setTimeout(() => {
      if (!DS.isSingleChatPage?.()) return;
      scrollToBottom(scrollContainerFor(messageRoots()));
    }, delay));
  }

  function refreshChatForPerformance() {
    if (generationLikelyActive()) {
      window.alert("Wait for the current reply to finish before refreshing the chat for performance.");
      return;
    }

    const field = findComposerField();
    const payload = {
      routeKey: chatRouteKey(),
      draft: composerText(field),
      at: Date.now(),
      scrollBottom: true
    };
    try {
      sessionStorage.setItem(PERFORMANCE_RELOAD_STATE_KEY, JSON.stringify(payload));
    } catch {}
    location.reload();
  }

  function readPendingReloadState() {
    try {
      const raw = sessionStorage.getItem(PERFORMANCE_RELOAD_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.routeKey !== chatRouteKey() || Date.now() - Number(parsed.at || 0) > 120000) {
        sessionStorage.removeItem(PERFORMANCE_RELOAD_STATE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function schedulePerformanceReloadRestore() {
    clearTimeout(performanceReloadRestoreTimer);
    const pending = readPendingReloadState();
    if (!pending) return;

    let attempts = 0;
    const attempt = () => {
      attempts += 1;
      const state = readPendingReloadState();
      if (!state) return;
      const field = findComposerField();
      if (!field && attempts < 40) {
        performanceReloadRestoreTimer = setTimeout(attempt, 200);
        return;
      }

      if (field) {
        const current = composerText(field);
        // Never overwrite a non-empty native draft. QoL's snapshot is only a
        // safety net around the explicit performance refresh button.
        if (!current && state.draft) setComposerText(field, state.draft);
      }
      try { sessionStorage.removeItem(PERFORMANCE_RELOAD_STATE_KEY); } catch {}
      if (state.scrollBottom) queueScrollBottom();
    };

    performanceReloadRestoreTimer = setTimeout(attempt, 120);
  }

  function forceChatWindowRefresh(source) {
    DS.state.performanceModeRevision = -1;
    DS.applyPerformanceMode?.();
    DS.scheduleMessageLane?.(source || "performance-window-change");
  }

  function changeVisibleWindow(nextVisible, source) {
    const roots = messageRoots();
    if (!roots.length) return;
    const scroller = scrollContainerFor(roots);
    const wasNearBottom = nearBottom(scroller);
    const anchor = firstVisibleMessage(roots);
    const beforeTop = anchor?.getBoundingClientRect?.().top;

    chatWindowVisibleCount = Math.max(1, Math.min(roots.length, Number(nextVisible) || 1));
    forceChatWindowRefresh(source);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (anchor?.isConnected && Number.isFinite(beforeTop)) {
        const afterTop = anchor.getBoundingClientRect().top;
        const delta = afterTop - beforeTop;
        if (Math.abs(delta) > 1) {
          if (isDocumentScroller(scroller)) window.scrollBy(0, delta);
          else scroller.scrollTop += delta;
        }
      } else if (wasNearBottom) {
        scrollToBottom(scroller);
      }
    }));
  }

  function ensureChatWindowControl({ hiddenCount, total, config }) {
    if (!chatWindowControl?.isConnected) {
      const control = document.createElement("div");
      control.id = "ds-long-chat-window-control";
      control.dataset.dsOwned = "1";
      control.setAttribute("role", "status");
      control.innerHTML = `
        <span class="ds-long-chat-window-status"></span>
        <button type="button" data-action="older"></button>
        <button type="button" data-action="all">Show all</button>
        <button type="button" data-action="fold">Fold old</button>
        <button type="button" data-action="refresh">Refresh chat</button>
      `;
      control.addEventListener("click", event => {
        const button = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
        if (!button) return;
        const action = button.dataset.action;
        const roots = messageRoots();
        const currentConfig = chatWindowConfig();
        if (action === "older") changeVisibleWindow(chatWindowVisibleCount + currentConfig.reveal, "performance-window-show-older");
        else if (action === "all") changeVisibleWindow(roots.length, "performance-window-show-all");
        else if (action === "fold") changeVisibleWindow(currentConfig.keep, "performance-window-refold");
        else if (action === "refresh") refreshChatForPerformance();
      });
      (document.body || document.documentElement).appendChild(control);
      chatWindowControl = control;
    }

    const status = chatWindowControl.querySelector(".ds-long-chat-window-status");
    const older = chatWindowControl.querySelector("button[data-action='older']");
    const all = chatWindowControl.querySelector("button[data-action='all']");
    const fold = chatWindowControl.querySelector("button[data-action='fold']");
    const refresh = chatWindowControl.querySelector("button[data-action='refresh']");
    if (status) status.textContent = hiddenCount
      ? `${hiddenCount} older message${hiddenCount === 1 ? "" : "s"} folded · ${total - hiddenCount} shown`
      : `All ${total} messages shown`;
    if (older) {
      const amount = Math.min(config.reveal, hiddenCount);
      older.textContent = amount ? `Show ${amount} older` : "Show older";
      older.hidden = hiddenCount <= 0;
    }
    if (all) all.hidden = hiddenCount <= 0;
    if (fold) fold.hidden = hiddenCount > 0 || total <= config.keep;
    if (refresh) refresh.title = "Reload this chat, preserve the current composer draft, and return to the bottom. QoL does not alter SpicyChat's own draft storage.";
  }

  function applyChatWindowing(roots) {
    const config = chatWindowConfig();
    const routeKey = chatRouteKey();
    if (chatWindowRouteKey !== routeKey) {
      clearChatWindowState({ keepRoute: true });
      chatWindowRouteKey = routeKey;
      chatWindowVisibleCount = config.keep;
    }

    if (roots.length < config.threshold) {
      clearChatWindowState({ keepRoute: true });
      chatWindowRouteKey = routeKey;
      return false;
    }

    const scroller = scrollContainerFor(roots);
    const wasNearBottom = nearBottom(scroller);
    if (!chatWindowApplied && !wasNearBottom) {
      // Do not suddenly hide the section somebody is actively reading. The
      // guard activates once they return to the normal bottom-of-chat position.
      return false;
    }

    const firstApply = !chatWindowApplied;
    chatWindowApplied = true;
    if (!chatWindowVisibleCount) chatWindowVisibleCount = config.keep;
    chatWindowVisibleCount = Math.max(config.keep, Math.min(roots.length, chatWindowVisibleCount));
    const hiddenCount = Math.max(0, roots.length - chatWindowVisibleCount);

    roots.forEach((root, index) => {
      const hidden = index < hiddenCount;
      root.classList.toggle("ds-chat-message-windowed", hidden);
      root.classList.toggle("ds-chat-message-far", hidden);
    });

    DS.state.performanceWindowHiddenCount = hiddenCount;
    DS.state.performanceWindowVisibleCount = roots.length - hiddenCount;
    ensureChatWindowControl({ hiddenCount, total: roots.length, config });

    if (firstApply && wasNearBottom) {
      requestAnimationFrame(() => scrollToBottom(scroller));
    }
    return true;
  }

  function clearNativeCardMenuState() {
    clearTimeout(menuCleanupTimer);
    menuCleanupTimer = 0;
    if (menuCard?.classList) menuCard.classList.remove("ds-listing-card-menu-open");
    menuCard = null;
    document.querySelectorAll(".ds-native-card-actions-menu").forEach(menu => menu.classList.remove("ds-native-card-actions-menu"));
  }

  function markNativeCardActionsMenu(card) {
    if (!card?.isConnected) return;
    menuCard = card;
    card.classList.add("ds-listing-card-menu-open");
    const findMenu = () => {
      const candidates = Array.from(document.querySelectorAll("button, [role='menuitem'], [role='option'], li, div"));
      const item = candidates.find(el => String(el.textContent || "").trim().toLowerCase() === "less like this" && el.getClientRects().length);
      if (!item) return;
      let menu = item.closest?.('[role="menu"], [data-radix-menu-content], [data-menu-content]') || null;
      if (!menu) {
        let node = item.parentElement;
        for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
          const rect = node.getBoundingClientRect?.();
          const text = String(node.textContent || "");
          if (rect && rect.width > 80 && rect.width < 520 && rect.height < 900 && /Less Like This/i.test(text) && /(Report|Share|Block Creator|Less Like This)/i.test(text)) {
            menu = node;
            break;
          }
        }
      }
      menu?.classList?.add("ds-native-card-actions-menu");
    };
    [0, 50, 150].forEach(delay => setTimeout(findMenu, delay));
    clearTimeout(menuCleanupTimer);
    menuCleanupTimer = setTimeout(() => {
      if (!document.querySelector(".ds-native-card-actions-menu")) clearNativeCardMenuState();
    }, 5000);
  }

  function installNativeCardMenuHooks() {
    if (menuHooksInstalled) return;
    menuHooksInstalled = true;
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest?.("#ds-qol-panel")) return;
      const card = target.closest?.(".ds-listing-card-lite") || (DS.collectCards?.() || []).find(item => item?.card?.contains?.(target))?.card || null;
      if (!card) {
        if (menuCard) setTimeout(() => {
          if (!document.querySelector(".ds-native-card-actions-menu")) clearNativeCardMenuState();
        }, 100);
        return;
      }
      const button = target.closest?.("button");
      const ellipsis = target.closest?.("svg.lucide-ellipsis, svg.lucide-ellipsis-vertical") ||
        button?.querySelector?.("svg.lucide-ellipsis, svg.lucide-ellipsis-vertical");
      const label = String(button?.getAttribute?.("aria-label") || button?.title || button?.dataset?.testid || "");
      const isMore = !!ellipsis || /more|action|ellipsis|menu/i.test(label);
      if (!isMore) {
        if (menuCard) setTimeout(() => {
          if (!document.querySelector(".ds-native-card-actions-menu")) clearNativeCardMenuState();
        }, 100);
        return;
      }
      clearNativeCardMenuState();
      markNativeCardActionsMenu(card);
    }, true);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") clearNativeCardMenuState();
    }, true);
  }

  function clearListingClasses() {
    clearNativeCardMenuState();
    DS.setClassState?.(document.documentElement, "ds-listing-performance", false);
    // Only touch cards this helper marked. A document-wide cleanup scan on a
    // large My Creations page defeats the point of the paint guard.
    for (const card of listingPaintCards) {
      if (card?.classList) card.classList.remove("ds-listing-card-lite");
    }
    listingPaintCards = new Set();
    listingPaintRevision = -1;
    listingPaintKey = "";
    DS.state.listingPerformanceWasActive = false;
  }

  function applyListingPaintGuard() {
    const s = settings();
    const page = DS.getPageState?.() || {};
    const listing = page.routeType === "listing" || page.routeType === "creator-listing";
    if (!s.enabled || !listing) {
      clearListingClasses();
      return;
    }

    const configured = String(s.runtimePerformanceMode || "adaptive");
    const revision = Number(DS.state?.domRevision || 0);
    const routeKey = `${page.routeType || ""}|${location.pathname || ""}|${location.search || ""}|${configured}`;
    if (listingPaintRevision === revision && listingPaintKey === routeKey) return;
    listingPaintRevision = revision;
    listingPaintKey = routeKey;

    const cards = DS.collectCards?.() || [];
    const strongMode = configured === "aggressive" || configured === "maximum";
    const active = cards.length >= 60 && (strongMode || (configured === "adaptive" && cards.length >= 120));
    DS.setClassState?.(document.documentElement, "ds-listing-performance", active);
    if (!active) {
      for (const card of listingPaintCards) {
        if (card?.classList) card.classList.remove("ds-listing-card-lite");
      }
      listingPaintCards = new Set();
      DS.state.listingPerformanceWasActive = false;
      return;
    }

    const activeCards = new Set();
    for (const item of cards) {
      const card = item?.card;
      if (!card) continue;
      if (!card.classList.contains("ds-listing-card-lite")) card.classList.add("ds-listing-card-lite");
      activeCards.add(card);
    }
    for (const card of listingPaintCards) {
      if (!activeCards.has(card) && card?.classList) card.classList.remove("ds-listing-card-lite");
    }
    listingPaintCards = activeCards;
    installNativeCardMenuHooks();
    DS.state.listingPerformanceWasActive = true;
  }

  // Listing pages have their own scheduler lane. Expose the paint guard so it
  // actually runs there; older builds only called applyPerformanceMode from
  // the single-chat lane, leaving the listing optimization dormant.
  DS.applyListingPerformanceMode = applyListingPaintGuard;
  DS.removeListingPerformanceMode = clearListingClasses;

  DS.applyPerformanceMode = function applyPerformanceMode() {
    const s = settings();
    applyListingPaintGuard();
    const active = isActiveChatPerformance();
    const hiddenPaused = !!(s.enabled && s.pauseQolInHiddenTabs && document.hidden);

    DS.setClassState?.(document.documentElement, "ds-qol-hidden-tab-paused", hiddenPaused);

    if (!active) {
      DS.setClassState?.(document.documentElement, "ds-chat-performance", false);
      if (DS.state.performanceModeApplied || document.querySelector(".ds-chat-message-lite, .ds-chat-message-far, .ds-chat-message-windowed")) {
        clearMessageClasses();
      }
      DS.state.performanceModeApplied = false;
      DS.state.performanceModeRevision = -1;
      DS.state.performanceModeMessageCount = 0;
      return;
    }

    const revision = Number(DS.state.domRevision || 0);
    if (
      DS.state.performanceModeApplied &&
      DS.state.performanceModeRevision === revision
    ) {
      return;
    }

    const roots = messageRoots();
    const threshold = desktopAppGuardActive() ? DESKTOP_APP_LONG_CHAT_THRESHOLD : LONG_CHAT_THRESHOLD;
    const longChat = roots.length >= threshold;
    DS.setClassState?.(document.documentElement, "ds-chat-performance", longChat);

    if (longChat) {
      applyStaticLightweightClasses(roots);
      applyChatWindowing(roots);
    } else if (DS.state.performanceModeApplied || document.querySelector(".ds-chat-message-lite, .ds-chat-message-far, .ds-chat-message-windowed")) {
      clearMessageClasses();
    }

    DS.state.performanceModeApplied = longChat;
    DS.state.performanceModeRevision = revision;
    DS.state.performanceModeMessageCount = roots.length;
  };

  schedulePerformanceReloadRestore();
})();
