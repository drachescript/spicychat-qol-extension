"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundTabActivated() {
chrome.tabs.onActivated.addListener(async activeInfo => {
  const settings = await getAutoAfkSettings();
  const tab = await tabsGet(activeInfo.tabId);
  if (!tab || !isSpicyChatUrl(tab.url) || isDedicatedWorkerTab(tab)) return;

  // After a QoL update, inactive SpicyChat pages still contain the previous
  // content-script runtime. The first time one becomes the active tab, reload
  // it once so the current version attaches automatically. This is separate
  // from PC Protection and Auto-AFK and is guarded per tab+version.
  if (settings.enabled !== false && await maybeAutoReloadStaleActiveTab(tab, "tab-activated")) return;
  if (settings.enabled === false) return;

  if (settings.lowMemoryProtectionEnabled) markLowMemoryWakeGrace(tab.id);

  // Auto-AFK is fundamentally "not focused for X time". Selecting a
  // SpicyChat tab always refreshes its own AFK timestamp, regardless of PC
  // Protection. PC Protection merely reuses the same timestamp for LRU order.
  if (settings.autoAfkEnabled || settings.lowMemoryProtectionEnabled) {
    await markAutoAfkActivity(tab.id);
  }
  if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(250);
});
}
