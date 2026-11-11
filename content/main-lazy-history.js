// Stage 7: shared runtime helper. No optional work starts before main runtime startup.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainLazyHistory = ({ runtimeCounters }) => {
  function primeLargeChatMessageLane(source = "resume") {
    if (!DS.isSingleChatPage?.()) return false;
    const roots = DS.getLoadedMessageRoots?.() || [];
    if (roots.length < 120) return false;

    DS.state.messageResumeLazyUntil = Date.now() + 8000;
    const dirty = DS.state.messageDirtyRoots || (DS.state.messageDirtyRoots = new Set());
    // Hidden tabs can accumulate hundreds of stale dirty roots. On resume,
    // discard that backlog and only enhance what the user can see plus the
    // newest messages. Older history is picked up lazily while scrolling.
    dirty.clear();
    const visible = DS.getMessageEnhancerRoots?.({ forceLazy: true, newest: 24, margin: 1400 }) || roots.slice(-24);
    let queued = 0;
    for (const root of visible) {
      if (DS.messageEnhancerHasVisited?.(root)) continue;
      if (DS.markMessageRootDirty?.(root)) queued++;
    }

    const counters = runtimeCounters();
    counters.messageResumeLazyPrunes = Number(counters.messageResumeLazyPrunes || 0) + 1;
    counters.messageResumeLazyRoots = Number(counters.messageResumeLazyRoots || 0) + queued;
    if (queued) DS.scheduleMessageLane?.(`lazy-${source}`);
    return true;
  }

  function scheduleLazyHistoryEnhancement() {
    if (!DS.isSingleChatPage?.()) return;
    clearTimeout(DS.state.messageLazyScrollTimer);
    DS.state.messageLazyScrollTimer = window.setTimeout(() => {
      DS.state.messageLazyScrollTimer = null;
      const roots = DS.getLoadedMessageRoots?.() || [];
      if (roots.length < 120) return;
      DS.state.messageResumeLazyUntil = Math.max(Number(DS.state.messageResumeLazyUntil || 0), Date.now() + 1200);
      const near = DS.getMessageEnhancerRoots?.({ forceLazy: true, newest: 8, margin: 900 }) || [];
      let added = 0;
      for (const root of near) {
        if (DS.messageEnhancerHasVisited?.(root)) continue;
        if (DS.markMessageRootDirty?.(root)) added++;
      }
      if (added) {
        const counters = runtimeCounters();
        counters.messageLazyScrollBatches = Number(counters.messageLazyScrollBatches || 0) + 1;
        counters.messageLazyScrollRoots = Number(counters.messageLazyScrollRoots || 0) + added;
        DS.scheduleMessageLane?.("lazy-history-scroll");
      }
    }, 180);
  }
    return { primeLargeChatMessageLane, scheduleLazyHistoryEnhancement };
  };
})();
}
