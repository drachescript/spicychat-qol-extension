// Feature-owned options helpers: notifications. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeChatNudgeStore(value) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  const next = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id || raw.botId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push({
      ...raw,
      id,
      name: String(raw.name || raw.botName || id).replace(/\s+/g, " ").trim().slice(0, 120),
      intervalHours: [5, 8, 24, 48, 168].includes(Number(raw.intervalHours)) ? Number(raw.intervalHours) : 24,
      lastActivityAt: Number(raw.lastActivityAt) || 0,
      dueAt: Number(raw.dueAt) || 0
    });
    if (next.length >= 2) break;
  }
  return next;
}

function formatNudgeDelay(hours) {
  const value = Number(hours) || 24;
  if (value === 24) return "1 day";
  if (value === 48) return "2 days";
  if (value === 168) return "1 week";
  return `${value} hours`;
}

async function refreshChatNudgePermissionStatus() {
  const status = $("chatNudgePermissionStatus");
  const button = $("chatNudgeRequestNotifications");
  if (!status) return;
  if (!chrome.permissions?.contains) {
    status.textContent = "This browser does not expose optional notification permissions to extensions. In-page fallback reminders can still be used.";
    if (button) button.disabled = true;
    return;
  }
  chrome.permissions.contains({ permissions: ["notifications"] }, allowed => {
    const ok = !chrome.runtime.lastError && !!allowed;
    status.textContent = ok
      ? "Browser notifications are enabled. Chat Nudges can alert you while the browser is running."
      : "Browser notifications are not enabled. Due nudges fall back to an in-page reminder the next time QoL is active on SpicyChat.";
    if (button) {
      button.disabled = ok;
      button.textContent = ok ? "Browser notifications enabled" : "Enable browser notifications";
    }
  });
}

async function renderChatNudgeManager(source = null) {
  const host = $("chatNudgeList");
  if (!host) return;
  let rows = source;
  if (rows == null) {
    const result = await storageGet([CHAT_NUDGE_STORE_KEY]);
    rows = result[CHAT_NUDGE_STORE_KEY];
  }
  rows = normalizeChatNudgeStore(rows);
  host.replaceChildren();
  if (!rows.length) {
    host.appendChild(makeElement("div", { className: "managed-empty", text: "No chat nudges selected yet. Open a chat and press Nudge beside the chatbot name." }));
    return;
  }

  for (const row of rows) {
    const card = makeElement("div", { className: "managed-item" });
    const main = makeElement("div", { className: "managed-main" });
    const title = makeElement("strong", { text: row.name || row.id });
    const now = Date.now();
    const dueText = row.dueAt
      ? (row.dueAt <= now ? "due now" : `due ${new Date(row.dueAt).toLocaleString()}`)
      : `after ${formatNudgeDelay(row.intervalHours)} of inactivity`;
    const meta = makeElement("div", { className: "hint", text: `${formatNudgeDelay(row.intervalHours)} · ${dueText}` });
    main.append(title, meta);

    const actions = makeElement("div", { className: "managed-actions" });
    const delay = document.createElement("select");
    delay.setAttribute("aria-label", `Nudge delay for ${row.name || row.id}`);
    [[5,"5 hours"],[8,"8 hours"],[24,"1 day"],[48,"2 days"],[168,"1 week"]].forEach(([value,label]) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = label;
      delay.appendChild(option);
    });
    delay.value = String(row.intervalHours || 24);
    delay.addEventListener("change", async () => {
      const result = await storageGet([CHAT_NUDGE_STORE_KEY]);
      const current = normalizeChatNudgeStore(result[CHAT_NUDGE_STORE_KEY]);
      const hours = Number(delay.value) || 24;
      const next = current.map(item => item.id === row.id ? {
        ...item,
        intervalHours: hours,
        dueAt: (Number(item.lastActivityAt) || Date.now()) + hours * 60 * 60 * 1000,
        lastNotifiedForActivityAt: 0,
        pendingInPage: false,
        pendingAt: 0
      } : item);
      await storageSet({ [CHAT_NUDGE_STORE_KEY]: next });
      try { chrome.runtime.sendMessage({ type: "DS_CHAT_NUDGE_SYNC" }, () => void chrome.runtime.lastError); } catch {}
      await renderChatNudgeManager(next);
    });

    const open = makeElement("button", { text: "Open chat", attrs: { type: "button" } });
    open.addEventListener("click", () => {
      const url = String(row.chatUrl || `https://spicychat.ai/chat/${row.id}`);
      chrome.tabs?.create?.({ url });
    });
    const remove = makeElement("button", { text: "Remove", attrs: { type: "button" }, className: "danger" });
    remove.addEventListener("click", async () => {
      const result = await storageGet([CHAT_NUDGE_STORE_KEY]);
      const next = normalizeChatNudgeStore(result[CHAT_NUDGE_STORE_KEY]).filter(item => item.id !== row.id);
      await storageSet({ [CHAT_NUDGE_STORE_KEY]: next });
      await renderChatNudgeManager(next);
    });
    actions.append(delay, open, remove);
    card.append(main, actions);
    host.appendChild(card);
  }
}

async function requestChatNudgeNotifications() {
  if (!chrome.permissions?.request) {
    showSettingsToast("This browser does not support extension notification permission requests.");
    return;
  }
  chrome.permissions.request({ permissions: ["notifications"] }, granted => {
    if (chrome.runtime.lastError) {
      showSettingsToast(chrome.runtime.lastError.message || "Could not request notification permission.");
    } else {
      showSettingsToast(granted ? "Browser notifications enabled for Chat Nudges." : "Notification permission was not granted. In-page fallback reminders remain available.");
    }
    refreshChatNudgePermissionStatus();
    refreshCreatorBotNotificationPermissionStatus();
    refreshContextWarningNotificationPermissionStatus();
  });
}

async function refreshContextWarningNotificationPermissionStatus() {
  const status = $("contextWarningNotificationPermissionStatus");
  const button = $("contextWarningRequestNotifications");
  if (!status) return;
  if (!chrome.permissions?.contains) {
    status.textContent = "Optional browser notifications are unavailable here; the in-chat warning still works.";
    if (button) button.disabled = true;
    return;
  }
  chrome.permissions.contains({ permissions: ["notifications"] }, allowed => {
    const ok = !chrome.runtime.lastError && !!allowed;
    status.textContent = ok ? "Browser notifications enabled." : "Browser notifications not enabled yet; the in-chat warning still works.";
    if (button) {
      button.disabled = ok;
      button.textContent = ok ? "Browser notifications enabled" : "Enable browser notifications";
    }
  });
}

async function requestContextWarningNotifications() {
  if (!chrome.permissions?.request) {
    showSettingsToast("This browser does not support extension notification permission requests.");
    return;
  }
  chrome.permissions.request({ permissions: ["notifications"] }, granted => {
    if (chrome.runtime.lastError) showSettingsToast(chrome.runtime.lastError.message || "Could not request notification permission.");
    else showSettingsToast(granted ? "Browser notifications enabled for RP context warnings." : "Notification permission was not granted; the in-chat warning remains available.");
    refreshContextWarningNotificationPermissionStatus();
    refreshChatNudgePermissionStatus();
    refreshCreatorBotNotificationPermissionStatus();
  });
}

async function refreshCreatorBotNotificationPermissionStatus() {
  const status = $("creatorBotNotificationPermissionStatus");
  const button = $("creatorBotRequestNotifications");
  if (!status) return;
  if (!chrome.permissions?.contains) {
    status.textContent = "Optional notification permission is unavailable in this browser.";
    if (button) button.disabled = true;
    return;
  }
  chrome.permissions.contains({ permissions: ["notifications"] }, allowed => {
    const ok = !chrome.runtime.lastError && !!allowed;
    status.textContent = ok ? "Browser notifications enabled." : "Browser notifications not enabled yet.";
    if (button) {
      button.disabled = ok;
      button.textContent = ok ? "Browser notifications enabled" : "Enable browser notifications";
    }
  });
}

async function requestCreatorBotNotifications() {
  if (!chrome.permissions?.request) {
    showSettingsToast("This browser does not support extension notification permission requests.");
    return;
  }
  chrome.permissions.request({ permissions: ["notifications"] }, granted => {
    if (chrome.runtime.lastError) showSettingsToast(chrome.runtime.lastError.message || "Could not request notification permission.");
    else showSettingsToast(granted ? "Browser notifications enabled for followed-creator alerts." : "Notification permission was not granted.");
    refreshCreatorBotNotificationPermissionStatus();
    refreshChatNudgePermissionStatus();
    refreshContextWarningNotificationPermissionStatus();
  });
}

function normalizeDiscordWebhookUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const allowedHosts = new Set(["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"]);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) return "";
    if (!/^\/api(?:\/v\d+)?\/webhooks\/[^/]+\/[^/?#]+/i.test(url.pathname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function discordWebhookOriginPattern(urlValue) {
  try {
    const url = new URL(urlValue);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return "";
  }
}

function requestOptionalOrigin(origin) {
  return new Promise(resolve => {
    if (!origin || !chrome.permissions?.request) return resolve(false);
    chrome.permissions.request({ origins: [origin] }, granted => {
      resolve(!chrome.runtime.lastError && !!granted);
    });
  });
}

async function testCreatorBotWebhook() {
  const raw = value("creatorBotDiscordWebhookUrl", "");
  const url = normalizeDiscordWebhookUrl(raw);
  if (!url) {
    showSettingsToast("Enter a valid Discord webhook URL from discord.com first.");
    return;
  }
  const origin = discordWebhookOriginPattern(url);
  const granted = await requestOptionalOrigin(origin);
  if (!granted) {
    showSettingsToast("Discord webhook host permission was not granted.");
    return;
  }
  const button = $("creatorBotWebhookTest");
  if (button) button.disabled = true;
  const response = await runtimeMessage({ type: "DS_CREATOR_BOT_WEBHOOK_TEST", url });
  if (button) button.disabled = false;
  if (response?.ok) showSettingsToast("Discord webhook test sent.");
  else showSettingsToast(response?.error || response?.status || "Discord webhook test failed.");
}

async function refreshCreatorBotWatchStateFromStorage() {
  const result = await storageGet([CREATOR_BOT_WATCH_KEY]);
  creatorBotWatchState = normalizeCreatorBotWatchState(result[CREATOR_BOT_WATCH_KEY]);
  renderCreatorBotWatchStatus();
  if (savedListsDataLoaded) {
    renderFollowedCreators();
    if (activeOptionsTab() === "saved") renderSavedBotsHub();
  }
}

async function runCreatorBotWatchNow() {
  if (!checked("enableCreatorBotNotifications")) {
    showSettingsToast("Enable followed-creator new-bot notifications first, then save settings.");
    return;
  }
  const buttons = [$("creatorBotCheckNow"), $("creatorBotStatusCenterCheckNow")].filter(Boolean);
  buttons.forEach(button => { button.disabled = true; });
  if ($("creatorBotWatchStatus")) $("creatorBotWatchStatus").textContent = "Checking followed creators...";
  if ($("creatorBotWatchStatusCenter")) $("creatorBotWatchStatusCenter").textContent = "Checking followed creators...";
  const response = await runtimeMessage({ type: "DS_CREATOR_BOT_SCAN_NOW" });
  buttons.forEach(button => { button.disabled = false; });
  await refreshCreatorBotWatchStateFromStorage();
  if (!response?.ok) {
    showSettingsToast(response?.error || "Creator check failed.");
    return;
  }
  const summary = response.summary || {};
  if (summary.skipped === "disabled") {
    showSettingsToast("The saved setting is still disabled. Wait for autosave to finish, then check again.");
    return;
  }
  showSettingsToast(`Creator check complete: ${Number(summary.checked || 0)} checked, ${Number(summary.newBots || 0)} new, ${Number(summary.failures || 0)} failed.`);
}
