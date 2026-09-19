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
      root.classList.toggle("ds-chat-message-lite", index < liteUntil);
      root.classList.remove("ds-chat-message-far");
      delete root.dataset.dsPerformanceObserved;
      delete root.dataset.dsPerformanceNewest;
    });
  }


  function clearListingClasses() {
    document.documentElement.classList.remove("ds-listing-performance");
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
    document.documentElement.classList.toggle("ds-listing-performance", active);
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

    document.documentElement.classList.toggle("ds-qol-hidden-tab-paused", hiddenPaused);

    if (!active) {
      document.documentElement.classList.remove("ds-chat-performance");
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
    document.documentElement.classList.toggle("ds-chat-performance", longChat);

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
