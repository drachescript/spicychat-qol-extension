"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundTabUpdated() {
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (quickLessLikeWorkerTabIds.has(Number(tabId)) && (changeInfo.url || changeInfo.status === "loading")) {
    quickLessLikeReadyWorkerTabs.delete(Number(tabId));
  }
  const spicyUrl = tab?.url || changeInfo.url || tab?.pendingUrl;
  if (!isSpicyChatUrl(spicyUrl)) return;
  if (botStatusWorkerTabIds.has(Number(tabId))) {
    // The query parameter is bootstrap-only. SpicyChat's Home router is free to
    // replace the URL; the tab/session/heartbeat remain the worker identity.
    // Never navigate the helper back to the marker URL just because it vanished.
    return;
  }
  if (isBotExportWorkerUrl(spicyUrl) || Number(botExportHelperTabId || 0) === Number(tabId) || quickDislikeWorkerTabIds.has(Number(tabId)) || quickLessLikeWorkerTabIds.has(Number(tabId)) || botStatusWorkerTabIds.has(Number(tabId)) || listingRefillWorkerTabIds.has(Number(tabId)) || personaRefreshWorkerTabIds.has(Number(tabId)) || isQuickDislikeWorkerUrl(spicyUrl) || isQuickLessLikeWorkerUrl(spicyUrl) || isBotStatusWorkerUrl(spicyUrl) || isListingRefillWorkerUrl(spicyUrl) || isPersonaRefreshWorkerUrl(spicyUrl)) return;

  // A real page load after an extension update receives the current content
  // scripts again, so its stale-runtime warning can be cleared safely.
  if (changeInfo.status === "complete") {
    setTimeout(() => verifyOneSpicyTabRuntime(tabId).catch(() => {}), 900);
  }

  if (changeInfo.url) {
    const duplicateSettings = await getDuplicateTabSettings();
    if (duplicateSettings.enabled !== false && duplicateSettings.duplicateTabGuardEnabled) {
      queueDuplicateTabScan({ initiatorTabId: tabId, focusExisting: !!tab?.active });
    }
  }

  const settings = await getAutoAfkSettings();
  if (settings.enabled === false) return;
  if (settings.lowMemoryProtectionEnabled && (changeInfo.discarded === false || (changeInfo.status === "complete" && tab?.active))) {
    markLowMemoryWakeGrace(tabId);
  }

  // A URL change means a new normal SpicyChat page was opened in this tab.
  if ((settings.autoAfkEnabled || settings.lowMemoryProtectionEnabled) &&
      (changeInfo.url || (changeInfo.status === "complete" && tab?.active))) {
    await markAutoAfkActivity(tabId);
  }
  if (settings.lowMemoryProtectionEnabled && (changeInfo.url || changeInfo.status === "complete")) {
    scheduleLowMemoryProtectionScan(tab?.active ? 250 : 700);
  }
});
}
