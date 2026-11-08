// Card-hide safety and recovery. Independent of discovery/filtering features.
// Loaded after cards.js and before the shared runtime. No new observers are
// installed unless the existing critical lane enables the safety watchdog.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.isUnsafeCardHideTarget = function isUnsafeCardHideTarget(target) {
    if (!target) return true;
    if (target === document.documentElement || target === document.body || target.id === "root") return true;
    if (target.matches?.("main, [role='main'], [data-overlay-container='true'], [data-testid='SearchClientCharacterListing']")) return true;

    // Card filtering must never be allowed to hide an actual chat/page shell.
    // A fallback card match on a single chat used to climb to the large chat
    // container, and Hide Opened Chats could then blank the entire page.
    if (target.querySelector?.("textarea[placeholder='Message...'], button[aria-label='chat-dropdown'], nav, [role='navigation'], [data-testid='SearchClientCharacterListing']")) {
      return true;
    }

    // Most actual cards contain one bot link. Check DOM structure BEFORE
    // forcing a layout measurement (which is expensive on 100+ card pages).
    // Still perform the page-scale guard for containers with 3+ bot links.
    try {
      const botLinks = target.querySelectorAll?.("a[href*='/chat/'], a[href*='/chatbot/']")?.length || 0;
      if (botLinks >= 3) {
        const rect = target.getBoundingClientRect();
        const pageScale = rect.width >= Math.max(480, window.innerWidth * 0.72) && rect.height >= Math.max(360, window.innerHeight * 0.45);
        if (pageScale) return true;
      }
    } catch {}

    return false;
  };

  DS.recoverAccidentalCardPageHide = function recoverAccidentalCardPageHide(force = false) {
    // The attribute-only watchdog below checks every NEW page-scale hide
    // immediately. The broad fallback is for unusual pre-existing/surviving
    // markup, and need not force layout for every hidden card on every
    // React update. Route changes and explicit forced checks bypass the gap.
    const state = DS.state || (DS.state = {});
    const now = Date.now();
    const route = location.href;
    if (!force && state.cardHideSafetyLastRoute === route &&
        now - Number(state.cardHideSafetyLastScanAt || 0) < 3000) {
      const counters = state.runtimePerformance || (state.runtimePerformance = {});
      counters.cardHideSafetyFullScansSkipped = Number(counters.cardHideSafetyFullScansSkipped || 0) + 1;
      return 0;
    }
    state.cardHideSafetyLastRoute = route;
    state.cardHideSafetyLastScanAt = now;
    if (!document.querySelector("[data-ds-hidden='1']")) return 0;
    let restored = 0;
    DS.qsa?.("[data-ds-hidden='1']").forEach(target => {
      const reason = String(target.dataset?.dsReason || "");
      if (!(reason.startsWith("card:") || reason === "opened chat")) return;
      if (!DS.isUnsafeCardHideTarget?.(target)) return;
      DS.unhideElement?.(target);
      restored += 1;
    });

    if (restored) {
      DS.runtimeLog?.("warn", "cards", "Recovered an accidentally hidden chat page", { restored });
    }
    return restored;
  };


  DS.restoreOpenedCardsForSmartFilter = function restoreOpenedCardsForSmartFilter() {
    let restored = 0;
    for (const target of DS.qsa?.("[data-ds-hidden='1']") || []) {
      const reason = String(target.dataset?.dsReason || "");
      if (reason !== "opened chat" && reason !== "card:opened chat") continue;
      DS.unhideElement?.(target);
      restored += 1;
    }
    if (restored) {
      const runtime = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      runtime.openedSmartFilterRestores = Number(runtime.openedSmartFilterRestores || 0) + restored;
    }
    return restored;
  };

  DS.ensureCardHideSafetyWatchdog = function ensureCardHideSafetyWatchdog() {
    if (DS.state.cardHideSafetyWatchdog || !document.documentElement) return;
    const observer = new MutationObserver(records => {
      let restored = 0;
      for (const record of records) {
        const target = record.target;
        if (!(target instanceof Element)) continue;
        const reason = String(target.dataset?.dsReason || "");
        const hidden = target.dataset?.dsHidden === "1" || target.classList?.contains("ds-hidden");
        if (!hidden || !(reason.startsWith("card:") || reason === "opened chat") || !DS.isUnsafeCardHideTarget?.(target)) continue;
        DS.unhideElement?.(target);
        restored += 1;
      }
      if (restored) {
        DS.runtimeLog?.("error", "cards", "Safety watchdog prevented a page-scale card hide", { restored, route: location.pathname });
        DS.setQuickStatus?.("QoL prevented a listing filter from hiding the whole page.");
      }
      // Reuse this already-installed, attribute-only watcher for blocked cards.
      // Native React can strip ds-hidden from an existing wrapper without
      // adding any nodes; the main page observer deliberately watches hrefs
      // rather than every class change for performance. Only the affected
      // card is checked, never the full grid.
      if (DS.state?.blockedBotIdSet?.size) DS.hideBlockedCardMounts?.(records);
    });
    observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class", "data-ds-hidden", "data-ds-reason"] });
    DS.state.cardHideSafetyWatchdog = observer;
  };

  DS.removeCardHideSafetyWatchdog = function removeCardHideSafetyWatchdog() {
    try { DS.state.cardHideSafetyWatchdog?.disconnect?.(); } catch {}
    DS.state.cardHideSafetyWatchdog = null;
  };

})();
}
