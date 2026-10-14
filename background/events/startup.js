"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundStartup() {
chrome.runtime.onStartup.addListener(() => {
  syncAutoAfkTabs().finally(() => configureAutoAfkAlarm(false));
  // Restored/pinned tabs can occasionally survive browser startup without the
  // current content runtime. Detect that case passively and show a reload badge
  // instead of pretending QoL is active or forcing a page reload.
  setTimeout(() => verifyOpenSpicyTabRuntimes().catch(() => {}), 4500);
  getDuplicateTabSettings().then(settings => {
    if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
  });
  configureChatNudgeAlarm(true);
  configureCreatorBotWatchAlarm(false).finally(() => queueCreatorBotScan({ force: false, reason: "startup" }));
  initializeHelperLifecycleRecovery();
});
}
