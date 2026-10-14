"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundNotificationClick() {
if (chrome.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener(notificationId => {
    const id = String(notificationId || "");
    let botId = "";

    if (id.startsWith("ds-chat-nudge:")) {
      const parts = id.split(":");
      botId = decodeURIComponent(parts[1] || "");
    } else if (id.startsWith("ds-creator-bot:")) {
      botId = decodeURIComponent(id.slice("ds-creator-bot:".length));
    } else {
      return;
    }

    if (!botId) return;
    chrome.tabs.create({ url: `https://spicychat.ai/chat/${encodeURIComponent(botId)}` }, () => void chrome.runtime.lastError);
    try { chrome.notifications.clear(notificationId, () => void chrome.runtime.lastError); } catch {}
  });
}
}
