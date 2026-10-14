"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundTabCreated() {
chrome.tabs.onCreated.addListener(tab => {
  if (!tab?.id || !isSpicyChatUrl(tab.url || tab.pendingUrl)) return;
  if (isQuickDislikeWorkerUrl(tab.url || tab.pendingUrl)) {
    quickDislikeWorkerTabIds.add(Number(tab.id));
    return;
  }
  if (isQuickLessLikeWorkerUrl(tab.url || tab.pendingUrl)) {
    quickLessLikeWorkerTabIds.add(Number(tab.id));
    return;
  }
  if (isBotStatusWorkerUrl(tab.url || tab.pendingUrl)) {
    botStatusWorkerTabIds.add(Number(tab.id));
    botStatusWorkerTabId = Number(tab.id);
    return;
  }
  if (isListingRefillWorkerUrl(tab.url || tab.pendingUrl)) {
    listingRefillWorkerTabIds.add(Number(tab.id));
    return;
  }
  if (isPersonaRefreshWorkerUrl(tab.url || tab.pendingUrl)) {
    personaRefreshWorkerTabIds.add(Number(tab.id));
    return;
  }

  getDuplicateTabSettings().then(settings => {
    if (settings.enabled !== false && settings.duplicateTabGuardEnabled) {
      queueDuplicateTabScan({ initiatorTabId: tab.id, focusExisting: !!tab.active });
    }
  });

  getAutoAfkSettings().then(settings => {
    if (settings.enabled === false) return;
    if (settings.autoAfkEnabled || settings.lowMemoryProtectionEnabled) {
      markAutoAfkActivity(tab.id);
    }
    if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(500);
  });
});
}
