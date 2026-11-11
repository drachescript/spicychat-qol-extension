"use strict";
// Runtime messages, tab/storage events and alarms. Imports after background.js.
registerQolBackgroundRuntimeMessages();

registerQolBackgroundAlarms();

registerQolBackgroundNotificationClick();

registerQolBackgroundTabActivated();

registerQolBackgroundTabUpdated();

registerQolBackgroundTabCreated();

registerQolBackgroundWindowFocus();

registerQolBackgroundTabRemoved();

registerQolBackgroundStorageChanged();

registerQolBackgroundInstalled();

registerQolBackgroundStartup();

if (dsqBackgroundHasFeature("performance-mode")) configureAutoAfkAlarm(false);
getDuplicateTabSettings().then(settings => {
  if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
});
if (dsqBackgroundHasFeature("chat-nudges")) configureChatNudgeAlarm(false);
if (dsqBackgroundHasFeature("creator-workspace")) configureCreatorBotWatchAlarm(false);
initializeHelperLifecycleRecovery();

// v0.2.25 account/device sync is intentionally isolated from the large
// background worker coordinator. Keep it in its own file, but load it from the
// canonical background.js because the release builder pins this entry point for
// both Chromium and Firefox packages. Chromium imports it here; Firefox runs
// shared/sync-service.js as a static script after the other background scripts.
registerQolBackgroundSyncBootstrap();
