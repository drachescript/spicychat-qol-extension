"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundAlarms() {
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === AUTO_AFK_ALARM) {
    if (!dsqBackgroundHasFeature("performance-mode")) return;
    runAutoAfkScan();
    return;
  }

  if (alarm.name === CHAT_NUDGE_ALARM) {
    if (!dsqBackgroundHasFeature("chat-nudges")) return;
    runChatNudgeScan();
    return;
  }

  if (alarm.name === CREATOR_BOT_WATCH_ALARM) {
    if (!dsqBackgroundHasFeature("creator-workspace")) return;
    queueCreatorBotScan({ force: false, reason: "alarm" });
    return;
  }

  if (alarm.name === LISTING_REFILL_GC_ALARM) {
    if (!dsqBackgroundHasFeature("list-fill")) return;
    cleanupStaleListingRefillWorkers({ closeLegacy: true });
    return;
  }

  if (alarm.name === QUICK_DISLIKE_GC_ALARM) {
    if (!dsqBackgroundHasFeature("bot-blocking")) return;
    cleanupStaleQuickDislikeWorkers();
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
