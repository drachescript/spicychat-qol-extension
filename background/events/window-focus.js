"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundWindowFocus() {
chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  getAutoAfkSettings().then(async settings => {
    if (settings.enabled === false) return;
    const tabs = await tabsQuery({ active: true, windowId });
    const tab = tabs[0];
    if (tab?.id && isSpicyChatUrl(tab.url) && !isDedicatedWorkerTab(tab)) {
      if (settings.autoAfkEnabled || settings.lowMemoryProtectionEnabled) {
        await markAutoAfkActivity(tab.id);
      }
      if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(250);
    }
  });
});
}
