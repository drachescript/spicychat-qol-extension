"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundInstalled() {
chrome.runtime.onInstalled.addListener(details => {
  rememberReleaseNotice(details)
    .catch(() => {})
    .finally(() => {
      if (details?.reason === "install") {
        try {
          chrome.storage.local.set({ dsFirstRunSetupPendingV1: true, dsFirstRunSetupCompletedV1: false, dsFirstRunOptInDefaultsAppliedV1: false }, () => {
            chrome.runtime.openOptionsPage(() => void chrome.runtime.lastError);
          });
        } catch {
          chrome.runtime.openOptionsPage(() => void chrome.runtime.lastError);
        }
      }
    });
  if (details?.reason === "update") {
    // Existing content scripts keep running the old extension context until the
    // site reloads. Mark all normal SpicyChat tabs stale, then reload only the
    // currently focused active one. Other stale tabs reload once when the user
    // activates them later. The per-tab+version guard prevents reload loops.
    markOpenSpicyTabsStaleAfterUpdate(
      chrome.runtime.getManifest?.().version || "",
      details?.previousVersion || ""
    ).then(async () => {
      const settings = await getAutoAfkSettings();
      if (settings.enabled !== false) await autoReloadFocusedStaleTab("extension-update");
    }).catch(() => {});
  }
  syncAutoAfkTabs().finally(() => configureAutoAfkAlarm(false));
  getDuplicateTabSettings().then(settings => {
    if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
  });
  configureChatNudgeAlarm(true);
  configureCreatorBotWatchAlarm(true);
  initializeHelperLifecycleRecovery();
});
}
