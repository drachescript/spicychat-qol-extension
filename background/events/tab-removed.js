"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundTabRemoved() {
chrome.tabs.onRemoved.addListener(tabId => {
  qolDiagnosticSubscribers.delete(Number(tabId));
  lowMemoryWakeGraceUntil.delete(Number(tabId));
  clearStaleRuntimeTab(tabId).catch(() => {});
  // Close any refill helper that belongs to a source tab the user just closed.
  for (const [runId, sourceTabId] of [...listingRefillSourceTabs.entries()]) {
    if (Number(sourceTabId) !== Number(tabId)) continue;
    listingRefillSourceTabs.delete(runId);
    releaseListingRefillPageWorker(runId).catch(() => {});
  }

  if (Number(tabId) === Number(tabCleanupWorkerTabId)) tabCleanupWorkerTabId = null;
  tabCleanupWorkerTabIds.delete(Number(tabId));
  quickDislikeWorkerTabIds.delete(Number(tabId));
  if (Number(quickDislikePersistentWorkerTabId) === Number(tabId)) quickDislikePersistentWorkerTabId = null;
  for (const [runId, workerTabId] of quickDislikeBulkWorkerTabs.entries()) {
    if (Number(workerTabId) === Number(tabId)) quickDislikeBulkWorkerTabs.delete(runId);
  }
  quickLessLikeWorkerTabIds.delete(Number(tabId));
  quickLessLikeReadyWorkerTabs.delete(Number(tabId));
  if (Number(quickLessLikePersistentWorkerTabId) === Number(tabId)) {
    quickLessLikePersistentWorkerTabId = null;
    storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: 0 }).catch(() => {});
  }
  const removedBotStatusWorker = botStatusWorkerTabIds.has(Number(tabId)) || Number(botStatusWorkerTabId) === Number(tabId);
  const expectedBotStatusClose = botStatusWorkerExpectedCloseIds.delete(Number(tabId));
  botStatusWorkerTabIds.delete(Number(tabId));
  if (Number(botStatusWorkerTabId) === Number(tabId)) {
    botStatusWorkerTabId = null;
    botStatusWorkerOwned = false;
    botStatusWorkerHeartbeatAt = 0;
    botStatusWorkerSessionId = "";
    rememberBotStatusWorker(0, false, "").catch(() => {});
  }
  if (removedBotStatusWorker && !expectedBotStatusClose) recordHelperLifecycle("bot-status-worker-lost", { tabId: Number(tabId), reason: "tab-closed-unexpected" }).catch(() => {});
  for (const [runId, workerTabId] of quickLessLikeBulkWorkerTabs.entries()) {
    if (Number(workerTabId) === Number(tabId)) {
      quickLessLikeBulkWorkerTabs.delete(runId);
      quickLessLikeClosedBulkRuns.set(String(runId), Date.now());
    }
  }
  for (const [runId, directTabId] of quickLessLikeDirectBulkTabs.entries()) {
    if (Number(directTabId) === Number(tabId)) quickLessLikeDirectBulkTabs.delete(runId);
  }
  listingRefillWorkerTabIds.delete(Number(tabId));
  for (const [runId, workerTabId] of listingRefillPageWorkerTabs.entries()) {
    if (Number(workerTabId) === Number(tabId)) listingRefillPageWorkerTabs.delete(runId);
  }
  personaRefreshWorkerTabIds.delete(Number(tabId));
  removeAutoAfkActivity(tabId);
  storageGet([OPTIONS_SOURCE_TAB_KEY]).then(result => {
    if (Number(result[OPTIONS_SOURCE_TAB_KEY]) === Number(tabId)) {
      chrome.storage.local.remove(OPTIONS_SOURCE_TAB_KEY);
    }
  });
});
}
