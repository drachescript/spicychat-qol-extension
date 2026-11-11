// Stage 7: shared runtime helper. No optional work starts before main runtime startup.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainRouteChange = ({ runtimeCounters, clearSlowThrottle, clearEssentialChatDirtyRoots, clearMessageEnhancerQuiet, resetMessageEditGuards, clearBlockedRefreshBatch, invalidateLoadedChatMessageCount, loadedChatMessageCount, startChatStartupQuietWindow, startCreatorProfileStartupQuietWindow, scheduleNonChatPresentationRecovery, scheduleSavedOpenedLane, pauseReruns }) => {
  function checkRouteChange() {
    if (location.href === DS.state.lastUrl) return false;
    const routeCheckStartedAt = performance.now();

    DS.state.lastUrl = location.href;
    clearSlowThrottle();
    DS.invalidatePageStateCache?.();
    DS.handleLorebookWorkflowRouteChange?.();
    DS.state.openedImportRevision = -1;
    DS.state.lastMarkedChatId = "";
    DS.state.messageDirtyRoots?.clear?.();
    clearEssentialChatDirtyRoots();
    DS.state.messageLaneRoots = null;
    DS.state.chatEnhancerQuietUntil = 0;
    clearMessageEnhancerQuiet();
    resetMessageEditGuards();
    clearBlockedRefreshBatch();
    invalidateLoadedChatMessageCount();
    DS.bumpDomRevision?.();

    if (DS.isSingleChatPage?.()) {
      startChatStartupQuietWindow("route-change");
      DS.diagPerformance?.("chat-navigation", { mountedMessages: loadedChatMessageCount(), phase: "route-start" });
    }
    else {
      DS.state.chatStartupQuietUntil = 0;
      DS.state.chatStartupQuietRoute = "";
      clearTimeout(DS.state.chatStartupQuietTimer);
      DS.state.chatStartupQuietTimer = 0;
    }
    startCreatorProfileStartupQuietWindow("route-change");

    sessionStorage.removeItem("dsAutoReadNotificationsDone");
    DS.resetChatListLoaderForRoute?.();

    // Route cleanup must happen BEFORE the normal 1s rerun quiet period.
    // This matters in the Android WebView, where back/SPA navigation can keep
    // the same document alive while React replaces the chat DOM underneath us.
    scheduleNonChatPresentationRecovery("route-change");

    // Opened/saved tracking must not wait behind the 1s route quiet period.
    // Run once after the URL settles and once after React has had time to mount
    // the destination chat/list DOM. Module-level dedupe keeps these cheap.
    scheduleSavedOpenedLane("route-change", 70);
    setTimeout(() => scheduleSavedOpenedLane("route-change-settled", 0), 450);

    pauseReruns(1000);
    DS.markModelSelectorDirty?.("route-change");
    DS.markAdvertBannerDirty?.("route-change");
    DS.scheduleRun?.({ immediate: true, source: "route-change", dirty: ["all"] });
    // Separate the synchronous QoL route handler cost from subsequent native
    // React mounting / deferred feature work in Inspector and support data.
    const syncMs = Math.max(0, performance.now() - routeCheckStartedAt);
    const routePerf = runtimeCounters();
    routePerf.chatNavigationSyncLastMs = Math.round(syncMs * 10) / 10;
    routePerf.chatNavigationSyncWorstMs = Math.max(Number(routePerf.chatNavigationSyncWorstMs || 0), routePerf.chatNavigationSyncLastMs);
    routePerf.chatNavigationCount = Number(routePerf.chatNavigationCount || 0) + 1;
    DS.diagPerformance?.("route-sync", { durationMs: routePerf.chatNavigationSyncLastMs, route: DS.isSingleChatPage?.() ? "chat" : "other" });
    return true;
  }
    return { checkRouteChange };
  };
})();
}
