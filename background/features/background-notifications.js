"use strict";

// Feature-owned background helpers: notifications. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeChatNudgeSubscriptions(value) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  const next = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id || raw.botId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const intervalHours = [5, 8, 24, 48, 168].includes(Number(raw.intervalHours)) ? Number(raw.intervalHours) : 24;
    next.push({
      ...raw,
      id,
      name: String(raw.name || raw.botName || id).replace(/\s+/g, " ").trim().slice(0, 120),
      intervalHours,
      lastActivityAt: Number(raw.lastActivityAt) || Date.now(),
      dueAt: Number(raw.dueAt) || 0,
      lastNotifiedForActivityAt: Number(raw.lastNotifiedForActivityAt) || 0,
      lastNotifiedAt: Number(raw.lastNotifiedAt) || 0,
      pendingInPage: !!raw.pendingInPage,
      pendingAt: Number(raw.pendingAt) || 0
    });
    if (next.length >= 2) break;
  }
  return next;
}

function chatNudgeExcerpt(value, max = 170) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const questions = text.match(/[^.!?]{8,}[?](?:[\s”’'\"]|$)/g) || [];
  const source = questions.length ? questions[questions.length - 1] : (text.split(/(?<=[.!?])\s+/).filter(Boolean).pop() || text);
  return source.length > max ? `${source.slice(0, max - 1).trim()}…` : source;
}

function chatNudgeMessage(entry) {
  const excerpt = chatNudgeExcerpt(entry?.lastBotText || "");
  if (!excerpt) return `You haven't chatted with ${entry?.name || "this chatbot"} in a while.`;
  if (/\?$/.test(excerpt.trim())) return `Still waiting on your answer: “${excerpt}”`;
  return `Continue where you left off: “${excerpt}”`;
}

function hasOptionalPermission(permission) {
  return new Promise(resolve => {
    try {
      chrome.permissions.contains({ permissions: [permission] }, ok => {
        if (chrome.runtime.lastError) resolve(false);
        else resolve(!!ok);
      });
    } catch { resolve(false); }
  });
}

function createBrowserNotification(id, options) {
  return new Promise(resolve => {
    if (!chrome.notifications?.create) return resolve(false);
    try {
      chrome.notifications.create(id, options, notificationId => {
        if (chrome.runtime.lastError) resolve(false);
        else resolve(!!notificationId);
      });
    } catch { resolve(false); }
  });
}

async function runChatNudgeScan() {
  const result = await storageGet(["settings", CHAT_NUDGE_STORE_KEY]);
  const settings = result.settings || {};
  if (settings.enabled === false || !settings.enableChatNudges) return { checked: 0, notified: 0, pending: 0 };

  const rows = normalizeChatNudgeSubscriptions(result[CHAT_NUDGE_STORE_KEY]);
  if (!rows.length) return { checked: 0, notified: 0, pending: 0 };
  const notificationsAllowed = settings.chatNudgeBrowserNotifications !== false && await hasOptionalPermission("notifications");
  const now = Date.now();
  let notified = 0;
  let pending = 0;
  let changed = false;

  for (const row of rows) {
    const activityAt = Number(row.lastActivityAt || 0);
    const intervalMs = Number(row.intervalHours || 24) * 60 * 60 * 1000;
    const dueAt = Number(row.dueAt || 0) || (activityAt + intervalMs);
    if (dueAt > now) continue;
    if (Number(row.lastNotifiedForActivityAt || 0) === activityAt) continue;

    let delivered = false;
    if (notificationsAllowed) {
      const notificationId = `ds-chat-nudge:${encodeURIComponent(row.id)}:${activityAt}`;
      delivered = await createBrowserNotification(notificationId, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: `${String(row.name || "SpicyChat").slice(0, 100)} · Chat Nudge`,
        message: chatNudgeMessage(row)
      });
    }

    row.lastNotifiedForActivityAt = activityAt;
    row.lastNotifiedAt = now;
    row.pendingInPage = !delivered;
    row.pendingAt = delivered ? 0 : now;
    changed = true;
    if (delivered) notified += 1;
    else pending += 1;
  }

  if (changed) await storageSet({ [CHAT_NUDGE_STORE_KEY]: rows });
  return { checked: rows.length, notified, pending };
}

function configureChatNudgeAlarm(runNow = false) {
  try {
    chrome.alarms.clear(CHAT_NUDGE_ALARM, () => {
      chrome.alarms.create(CHAT_NUDGE_ALARM, { periodInMinutes: CHAT_NUDGE_SCAN_MINUTES, delayInMinutes: runNow ? 0.1 : CHAT_NUDGE_SCAN_MINUTES });
    });
  } catch {}
}

// Optional alarm handler owned by chat-nudges. Omitted modules do not register a handler.
(globalThis.__DSQ_BACKGROUND_ALARM_HANDLERS__ ||= Object.create(null))["ds-chat-nudge-scan-v1"] = {
  owner: "chat-nudges",
  run: () => { runChatNudgeScan(); }
};
