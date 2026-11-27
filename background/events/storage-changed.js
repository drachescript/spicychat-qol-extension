"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundStorageChanged() {
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  dsqSctConfigChanged(changes);
  if (changes[QUICK_DISLIKE_HISTORY_KEY]) {
    recommendationFeedbackQuickDislikeCache = normalizeQuickDislikeHistory(changes[QUICK_DISLIKE_HISTORY_KEY].newValue);
  }
  // The Less Like bulk journal changes after every confirmed action, so do not
  // invalidate the cross-feedback cache for journal-only writes. A main-history
  // change (including a user reset) invalidates it; the next lookup rehydrates
  // main history + any still-pending journal entries exactly once.
  if (changes[QUICK_LESS_LIKE_HISTORY_KEY]) recommendationFeedbackQuickLessLikeCache = null;
  if (changes[CHAT_NUDGE_STORE_KEY]) runChatNudgeScan();

  if (changes[FOLLOWED_CREATORS_KEY]) {
    const beforeFollowed = normalizeFollowedCreatorStore(changes[FOLLOWED_CREATORS_KEY].oldValue);
    const afterFollowed = normalizeFollowedCreatorStore(changes[FOLLOWED_CREATORS_KEY].newValue);
    const beforeSet = new Set(beforeFollowed.handles);
    const added = afterFollowed.handles.filter(handle => !beforeSet.has(handle));
    if (added.length) queueCreatorBotScan({ force: true, handles: added, reason: "followed-added" });
  }

  const granularChanges = Object.entries(changes || {})
    .map(([key, change]) => [settingNameFromStorageKey(key), change])
    .filter(([name]) => !!name);
  // Most setting writes are unrelated to these background alarms. Avoid
  // reading the entire saved settings object for those granular updates.
  const alarmSettingKeys = new Set([
    "enabled", "autoAfkEnabled", "autoAfkMinutes", "autoAfkAction",
    "lowMemoryProtectionEnabled", "maxAwakeSpicyTabs",
    "duplicateTabGuardEnabled", "enableChatNudges", "chatNudgeCheckMinutes",
    "enableCreatorBotNotifications", "creatorBotCheckMinutes"
  ]);
  if (!changes.settings && !granularChanges.some(([key]) => alarmSettingKeys.has(key))) return;

  (async () => {
    let beforeSettings = {};
    let afterSettings = {};
    if (changes.settings) {
      beforeSettings = changes.settings.oldValue || {};
      afterSettings = changes.settings.newValue || {};
    } else {
      const legacy = (await storageGet(["settings"])).settings || {};
      afterSettings = { ...legacy };
      for (const [name, change] of granularChanges) {
        if (change?.newValue === undefined) delete afterSettings[name];
        else afterSettings[name] = change.newValue;
      }
      beforeSettings = { ...afterSettings };
      for (const [name, change] of granularChanges) {
        if (change?.oldValue === undefined) delete beforeSettings[name];
        else beforeSettings[name] = change.oldValue;
      }
    }
    const touched = new Set(granularChanges.map(([name]) => name));
    // A full settings save shouldn't reconfigure every alarm if only an
    // unrelated appearance/chat preference changed.
    const changedAny = (...keys) => changes.settings
      ? keys.some(key => beforeSettings[key] !== afterSettings[key])
      : keys.some(key => touched.has(key));

    const before = { ...AUTO_AFK_DEFAULTS, ...beforeSettings };
    const after = { ...AUTO_AFK_DEFAULTS, ...afterSettings };
    const justEnabled = (!before.autoAfkEnabled && !!after.autoAfkEnabled) ||
      (!before.lowMemoryProtectionEnabled && !!after.lowMemoryProtectionEnabled);
    if (changedAny("enabled", "autoAfkEnabled", "autoAfkMinutes", "autoAfkAction", "lowMemoryProtectionEnabled", "maxAwakeSpicyTabs"))
      configureAutoAfkAlarm(justEnabled);

    const duplicateBefore = { ...DUPLICATE_TAB_DEFAULTS, ...beforeSettings };
    const duplicateAfter = { ...DUPLICATE_TAB_DEFAULTS, ...afterSettings };
    const duplicateJustEnabled = !duplicateBefore.duplicateTabGuardEnabled && !!duplicateAfter.duplicateTabGuardEnabled;
    if (changedAny("enabled", "duplicateTabGuardEnabled") &&
        duplicateAfter.enabled !== false && duplicateAfter.duplicateTabGuardEnabled && duplicateJustEnabled) {
      queueDuplicateTabScan({ focusExisting: false });
    }

    const nudgeJustEnabled = !before.enableChatNudges && !!after.enableChatNudges;
    if (changedAny("enabled", "enableChatNudges", "chatNudgeCheckMinutes")) {
      if (nudgeJustEnabled) runChatNudgeScan();
      configureChatNudgeAlarm(nudgeJustEnabled);
    }

    const creatorWatchJustEnabled = !before.enableCreatorBotNotifications && !!after.enableCreatorBotNotifications;
    const creatorWatchIntervalChanged = Number(before.creatorBotCheckMinutes || 60) !== Number(after.creatorBotCheckMinutes || 60);
    if (creatorWatchJustEnabled) queueCreatorBotScan({ force: true, reason: "enabled" });
    if (changedAny("enabled", "enableCreatorBotNotifications", "creatorBotCheckMinutes") &&
        (creatorWatchJustEnabled || creatorWatchIntervalChanged || before.enabled !== after.enabled)) {
      configureCreatorBotWatchAlarm(creatorWatchJustEnabled);
    }
  })().catch(() => {});
});
}
