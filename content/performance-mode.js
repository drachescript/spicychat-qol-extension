(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const LONG_CHAT_THRESHOLD = 80;
  const DESKTOP_APP_LONG_CHAT_THRESHOLD = 50;
  const KEEP_FULLY_RENDERED = 10;
  const DESKTOP_APP_KEEP_FULLY_RENDERED = 6;
  let listingPaintRevision = -1;
  let listingPaintKey = "";
  let listingPaintCards = new Set();
  let menuCard = null;
  let menuCleanupTimer = 0;
  let menuHooksInstalled = false;

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

  function clearMessageClasses() {
    document.querySelectorAll(
      ".ds-chat-message-lite, .ds-chat-message-far, [data-ds-performance-observed='1'], [data-ds-performance-newest='1']"
    ).forEach(el => {
      el.classList.remove("ds-chat-message-lite", "ds-chat-message-far");
      delete el.dataset.dsPerformanceObserved;
      delete el.dataset.dsPerformanceNewest;
    });
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

      if (root.classList.contains("ds-chat-message-far")) root.classList.remove("ds-chat-message-far");
      if ("dsPerformanceObserved" in root.dataset) delete root.dataset.dsPerformanceObserved;
      if ("dsPerformanceNewest" in root.dataset) delete root.dataset.dsPerformanceNewest;
    });
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
      if (DS.state.performanceModeApplied || document.querySelector(".ds-chat-message-lite, .ds-chat-message-far")) {
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
    } else if (DS.state.performanceModeApplied || document.querySelector(".ds-chat-message-lite, .ds-chat-message-far")) {
      clearMessageClasses();
    }

    DS.state.performanceModeApplied = longChat;
    DS.state.performanceModeRevision = revision;
    DS.state.performanceModeMessageCount = roots.length;
  };
})();
