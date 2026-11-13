// Core runtime helper: quiet heavy creator/profile work briefly after navigation.
// Register the factory without starting timers or DOM work.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainCreatorProfileQuiet = ({ runtimeCounters }) => {
    const CREATOR_PROFILE_STARTUP_QUIET_MS = 5000;
    let creatorProfileQuietTimer = 0;
  function creatorProfileStartupQuietActive() {
    return Date.now() < Number(DS.state?.creatorProfileStartupQuietUntil || 0);
  }

  function scheduleCreatorProfileQuietResume() {
    if (!creatorProfileStartupQuietActive()) return;
    clearTimeout(creatorProfileQuietTimer);
    const delay = Math.max(80, Number(DS.state.creatorProfileStartupQuietUntil || 0) - Date.now() + 80);
    creatorProfileQuietTimer = setTimeout(() => {
      creatorProfileQuietTimer = 0;
      DS.scheduleRun?.({ priority: "critical", source: "creator-profile-startup-settled" });
      DS.scheduleRun?.({ priority: "slow", source: "creator-profile-startup-settled" });
    }, delay);
  }

  function startCreatorProfileStartupQuietWindow(source = "route") {
    const page = DS.getPageState?.() || {};
    const heavyCreatorRoute = !!(page.isBotEditor || page.isBotProfilePage);
    if (!heavyCreatorRoute) {
      DS.state.creatorProfileStartupQuietUntil = 0;
      clearTimeout(creatorProfileQuietTimer);
      creatorProfileQuietTimer = 0;
      return;
    }
    DS.state.creatorProfileStartupQuietUntil = Date.now() + CREATOR_PROFILE_STARTUP_QUIET_MS;
    const counters = runtimeCounters();
    counters.creatorProfileStartupQuietStarts = Number(counters.creatorProfileStartupQuietStarts || 0) + 1;
    counters.creatorProfileStartupQuietUntil = DS.state.creatorProfileStartupQuietUntil;
    counters.creatorProfileStartupQuietSource = String(source || "route");
    scheduleCreatorProfileQuietResume();
  }

    return { creatorProfileStartupQuietActive, scheduleCreatorProfileQuietResume,
      startCreatorProfileStartupQuietWindow };
  };
})();
}
