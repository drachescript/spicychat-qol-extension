"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundAlarms() {
chrome.alarms.onAlarm.addListener(alarm => {
  const featureHandlers = globalThis.__DSQ_BACKGROUND_ALARM_HANDLERS__;
  const optionalHandler = featureHandlers?.[alarm.name];
  if (optionalHandler) {
    if (dsqBackgroundHasFeature(optionalHandler.owner)) optionalHandler.run();
    return;
  }

  if (alarm.name === HELPER_SESSION_GRACE_ALARM) {
    cleanupPriorHelperSessionTabs();
    return;
  }

  const tabId = tabIdFromAlarm(alarm.name);

  if (!tabId || !activeLoaders.has(tabId)) return;

  chrome.tabs.sendMessage(
    tabId,
    { type: "DS_LOAD_ALL_CHATS_STEP" },
    response => {
      if (chrome.runtime.lastError) {
        stopLoader(tabId);
        return;
      }

      if (response?.running) {
        scheduleLoadStep(tabId);
      } else {
        stopLoader(tabId);
      }
    }
  );
});
}
