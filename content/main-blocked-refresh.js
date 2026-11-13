// Core runtime helper: defer expensive listing refreshes after blocked-card changes.
// Register the factory without starting timers or DOM work.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainBlockedRefresh = ({ runtimeCounters }) => {
    let blockedRefreshTimer = null;
    let blockedRefreshUntil = 0;
    const BLOCKED_REFRESH_IDLE_MS = 120000;
  function clearBlockedRefreshBatch() {
    clearTimeout(blockedRefreshTimer);
    blockedRefreshTimer = null;
    blockedRefreshUntil = 0;
    DS.state.blockingMutationQuietUntil = 0;
    const counters = runtimeCounters();
    counters.blockedBotRefreshPending = 0;
    counters.blockedBotRefreshSettleAt = 0;
  }

  function scheduleBlockedRefreshAfterBurst(source = "blocked-storage") {
    clearTimeout(blockedRefreshTimer);
    blockedRefreshUntil = Date.now() + BLOCKED_REFRESH_IDLE_MS;
    // The clicked card has already been hidden immediately. Give React and the
    // listing DOM a short quiet window so the global observer does not wake the
    // entire listing pipeline for the removal animation/reflow after every X.
    DS.state.blockingMutationQuietUntil = Date.now() + 1600;
    const counters = runtimeCounters();
    counters.blockedBotRefreshDeferrals = Number(counters.blockedBotRefreshDeferrals || 0) + 1;
    counters.blockedBotRefreshPending = 1;
    counters.blockedBotRefreshSettleAt = blockedRefreshUntil;

    blockedRefreshTimer = window.setTimeout(() => {
      blockedRefreshTimer = null;
      blockedRefreshUntil = 0;
      const settled = runtimeCounters();
      settled.blockedBotRefreshPending = 0;
      settled.blockedBotRefreshSettleAt = 0;
      settled.blockedBotRefreshFlushes = Number(settled.blockedBotRefreshFlushes || 0) + 1;
      DS.scheduleRun?.({ priority: "critical", source: `${source}-settled` });
      DS.scheduleRun?.({ priority: "slow", source: `${source}-settled` });
    }, BLOCKED_REFRESH_IDLE_MS);
  }

    return { clearBlockedRefreshBatch, scheduleBlockedRefreshAfterBurst };
  };
})();
}
