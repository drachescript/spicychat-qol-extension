// Stage 7: shared runtime helper. No optional work starts before main runtime startup.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainChatHistoryBatches = ({ runtimeCounters, loadedChatMessageCount }) => {
    let chatHistoryBatchTimer = null;
    let chatHistoryMutationBurst = { lastAt: 0, count: 0 };
  function scheduleChatHistoryBatchRefresh() {
    const counters = runtimeCounters();
    if (!chatHistoryBatchTimer) counters.historyBatches = Number(counters.historyBatches || 0) + 1;
    const quietMs = loadedChatMessageCount() >= 250 ? 1450 : 1100;
    DS.state.chatHistoryBatchUntil = Date.now() + quietMs;
    counters.historyBatchDeferrals = Number(counters.historyBatchDeferrals || 0) + 1;
    document.documentElement.classList.add("ds-qol-history-loading");
    clearTimeout(chatHistoryBatchTimer);
    chatHistoryBatchTimer = setTimeout(() => {
      chatHistoryBatchTimer = null;
      DS.state.chatHistoryBatchUntil = 0;
      if (!DS.state.bulkChatHistoryLoadActive) document.documentElement.classList.remove("ds-qol-history-loading");
      DS.bumpDomRevision?.();
      // One message-lane wake is enough here. In Normal mode it routes through
      // the critical lane; adaptive modes process the dirty message roots
      // directly and schedule the slower cosmetic lane after the chat is quiet.
      DS.scheduleMessageLane?.("history-batch-settled");
    }, quietMs + 90);
  }

  function isLikelyHistoryInsertionBurst(addedCount) {
    if (!DS.isSingleChatPage?.() || addedCount <= 0 || loadedChatMessageCount() < 80) return false;
    const now = Date.now();
    if (now - chatHistoryMutationBurst.lastAt > 450) chatHistoryMutationBurst.count = 0;
    chatHistoryMutationBurst.lastAt = now;
    chatHistoryMutationBurst.count += addedCount;
    if (chatHistoryMutationBurst.count < 3) return false;
    chatHistoryMutationBurst.count = 0;
    return true;
  }
    return { scheduleChatHistoryBatchRefresh, isLikelyHistoryInsertionBurst };
  };
})();
}
