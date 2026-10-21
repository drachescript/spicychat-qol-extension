"use strict";

// Feature-owned background helpers: creator-watch. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeCreatorHandle(value) {
  let text = String(value || "").trim();
  try { text = decodeURIComponent(text); } catch {}
  return text
    .replace(/^https?:\/\/[^/]+\/creator\//i, "")
    .replace(/^\/?creator\//i, "")
    .replace(/[?#].*$/g, "")
    .replace(/\/+$/g, "")
    .replace(/^@+/, "")
    .trim()
    .toLowerCase();
}

function normalizeFollowedCreatorStore(value) {
  const source = value && typeof value === "object" ? value : {};
  const seen = new Set();
  const handles = [];
  for (const raw of Array.isArray(source.handles) ? source.handles : []) {
    const handle = normalizeCreatorHandle(raw);
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    handles.push(handle);
  }
  return {
    handles,
    meta: source.meta && typeof source.meta === "object" ? source.meta : {}
  };
}

function normalizeCreatorBotEntry(raw, fallbackHandle = "") {
  const item = raw && typeof raw === "object" ? raw : {};
  const id = String(item.id || item.botId || "").trim();
  if (!id) return null;
  const creatorHandle = normalizeCreatorHandle(
    item.creatorHandle ||
    item.creator ||
    item.creatorUrl ||
    fallbackHandle
  );
  const creator = creatorHandle ? `@${creatorHandle}` : String(item.creator || "").replace(/\s+/g, " ").trim();
  return {
    id,
    name: String(item.name || item.title || id).replace(/\s+/g, " ").trim().slice(0, 160),
    creator,
    creatorHandle,
    creatorUrl: String(item.creatorUrl || (creatorHandle ? `https://spicychat.ai/creator/${encodeURIComponent(creatorHandle)}` : "")).trim(),
    chatUrl: String(item.chatUrl || `https://spicychat.ai/chat/${encodeURIComponent(id)}`).trim(),
    profileUrl: String(item.profileUrl || `https://spicychat.ai/chatbot/${encodeURIComponent(id)}`).trim(),
    image: String(item.image || "").trim(),
    description: String(item.description || "").replace(/\s+/g, " ").trim().slice(0, 500),
    detectedAt: Number(item.detectedAt || 0) || 0
  };
}

function normalizeCreatorBotWatchState(value) {
  const source = value && typeof value === "object" ? value : {};
  const creators = {};
  for (const [rawHandle, raw] of Object.entries(source.creators && typeof source.creators === "object" ? source.creators : {})) {
    const handle = normalizeCreatorHandle(rawHandle || raw?.handle || "");
    if (!handle || !raw || typeof raw !== "object") continue;
    const seen = [];
    const seenSet = new Set();
    for (const rawId of Array.isArray(raw.seenIds) ? raw.seenIds : []) {
      const id = String(rawId || "").trim();
      if (!id || seenSet.has(id)) continue;
      seenSet.add(id);
      seen.push(id);
      if (seen.length >= CREATOR_BOT_SEEN_LIMIT) break;
    }
    creators[handle] = {
      handle,
      initialized: !!raw.initialized,
      baselineAt: Number(raw.baselineAt || 0) || 0,
      baselineCount: Number(raw.baselineCount || 0) || 0,
      seenIds: seen,
      lastCheckedAt: Number(raw.lastCheckedAt || 0) || 0,
      lastNewAt: Number(raw.lastNewAt || 0) || 0,
      lastNewCount: Number(raw.lastNewCount || 0) || 0,
      lastError: String(raw.lastError || "").slice(0, 500)
    };
  }

  const recent = [];
  const recentSeen = new Set();
  for (const raw of Array.isArray(source.recent) ? source.recent : []) {
    const item = normalizeCreatorBotEntry(raw);
    if (!item || recentSeen.has(item.id)) continue;
    recentSeen.add(item.id);
    recent.push(item);
    if (recent.length >= CREATOR_BOT_RECENT_LIMIT) break;
  }

  return {
    version: 1,
    creators,
    recent,
    lastRunAt: Number(source.lastRunAt || 0) || 0,
    lastScanAt: Number(source.lastScanAt || 0) || 0,
    lastDurationMs: Number(source.lastDurationMs || 0) || 0,
    lastCheckedCreators: Number(source.lastCheckedCreators || 0) || 0,
    lastNewCount: Number(source.lastNewCount || 0) || 0,
    lastFailureCount: Number(source.lastFailureCount || 0) || 0,
    lastReason: String(source.lastReason || "").slice(0, 80),
    lastWebhookAt: Number(source.lastWebhookAt || 0) || 0,
    lastWebhookError: String(source.lastWebhookError || "").slice(0, 500)
  };
}

function normalizeCreatorBotWebhookConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    enabled: !!source.enabled,
    url: String(source.url || "").trim()
  };
}

function creatorBotWatchInterval(settings = {}) {
  const raw = Number(settings.creatorBotCheckMinutes || 60);
  return CREATOR_BOT_WATCH_INTERVALS.includes(raw) ? raw : 60;
}

function creatorLatestUrl(handleValue, page = 0) {
  const handle = normalizeCreatorHandle(handleValue);
  if (!handle) return "";
  const url = new URL(`https://spicychat.ai/creator/${encodeURIComponent(handle)}`);
  url.searchParams.set(`${CREATOR_DEFAULT_SORT_INDEX}[sortBy]`, CREATOR_LATEST_SORT_INDEX);
  const pageNumber = Math.max(0, Number(page || 0) || 0);
  if (pageNumber > 1) url.searchParams.set(`${CREATOR_DEFAULT_SORT_INDEX}[page]`, String(pageNumber));
  return url.href;
}

function creatorBotCardsFromWorker(response, handle) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(response?.cards) ? response.cards : []) {
    const item = normalizeCreatorBotEntry(raw?.meta || raw, handle);
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function creatorBotWebhookUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const allowedHosts = new Set(["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"]);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) return null;
    if (!/^\/api(?:\/v\d+)?\/webhooks\//i.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

function originPermissionPattern(url) {
  try {
    const parsed = url instanceof URL ? url : new URL(String(url || ""));
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return "";
  }
}

function hasOptionalOriginPermission(origin) {
  return new Promise(resolve => {
    if (!origin || !chrome.permissions?.contains) return resolve(false);
    try {
      chrome.permissions.contains({ origins: [origin] }, ok => {
        if (chrome.runtime.lastError) resolve(false);
        else resolve(!!ok);
      });
    } catch {
      resolve(false);
    }
  });
}

async function sendCreatorBotDiscordWebhook(webhookValue, bot, { test = false } = {}) {
  const webhook = creatorBotWebhookUrl(webhookValue);
  if (!webhook) return { ok: false, status: "invalid-webhook" };
  const origin = originPermissionPattern(webhook);
  if (!await hasOptionalOriginPermission(origin)) return { ok: false, status: "missing-host-permission" };

  const entry = normalizeCreatorBotEntry(bot || {});
  const content = test
    ? "SpicyChat QoL test: followed-creator new-bot notifications are connected."
    : `New SpicyChat bot from ${entry?.creator || "a followed creator"}\n**${entry?.name || "New bot"}**\n${entry?.chatUrl || entry?.profileUrl || "https://spicychat.ai/"}`;

  try {
    const response = await fetch(webhook.href, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "SpicyChat QoL",
        content,
        allowed_mentions: { parse: [] }
      })
    });
    if (!response.ok) return { ok: false, status: "http", httpStatus: response.status };
    return { ok: true, status: "sent" };
  } catch (error) {
    return { ok: false, status: "network-error", error: error?.message || String(error) };
  }
}

async function deliverCreatorBotAlerts(newBots, settings, webhookConfig, watchState) {
  const rows = Array.isArray(newBots) ? newBots : [];
  if (!rows.length) return { browser: 0, webhook: 0 };

  let browser = 0;
  let webhook = 0;
  const browserAllowed = !!settings.creatorBotBrowserNotifications && await hasOptionalPermission("notifications");

  for (const bot of rows.slice(0, 25)) {
    if (browserAllowed) {
      const notificationId = `ds-creator-bot:${encodeURIComponent(bot.id)}`;
      const delivered = await createBrowserNotification(notificationId, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: `New bot from ${bot.creator || "followed creator"}`,
        message: bot.name || "New SpicyChat bot"
      });
      if (delivered) browser += 1;
    }

    if (webhookConfig.enabled && webhookConfig.url) {
      const result = await sendCreatorBotDiscordWebhook(webhookConfig.url, bot);
      watchState.lastWebhookAt = Date.now();
      if (result.ok) {
        webhook += 1;
        watchState.lastWebhookError = "";
      } else {
        watchState.lastWebhookError = result.error || result.status || "Webhook delivery failed";
      }
    }
  }

  return { browser, webhook };
}

async function scanOneFollowedCreator(handle, existingState) {
  const first = await runListingRefillPageWorker({
    url: creatorLatestUrl(handle),
    expectedPage: 0
  });
  if (!first?.ok) {
    return {
      ok: false,
      status: first?.status || "worker-failed",
      error: first?.error || first?.status || "Creator page could not be read"
    };
  }

  let cards = creatorBotCardsFromWorker(first, handle);
  if (!cards.length) {
    return { ok: false, status: "no-cards", error: "No chatbot cards were found on the creator page." };
  }

  const prior = existingState && typeof existingState === "object" ? existingState : {};
  const known = new Set(Array.isArray(prior.seenIds) ? prior.seenIds.map(String) : []);
  let firstKnownIndex = prior.initialized ? cards.findIndex(item => known.has(item.id)) : -1;

  if (prior.initialized && firstKnownIndex < 0) {
    const lastPage = Math.max(1, Number(first.lastPage || 1) || 1);
    const maxOverlapPage = Math.min(lastPage, 6);
    const ids = new Set(cards.map(item => item.id));
    for (let page = 2; page <= maxOverlapPage && firstKnownIndex < 0; page++) {
      const extraPage = await runListingRefillPageWorker({
        url: creatorLatestUrl(handle, page),
        expectedPage: page
      });
      if (!extraPage?.ok) break;
      const extra = creatorBotCardsFromWorker(extraPage, handle);
      for (const item of extra) {
        if (ids.has(item.id)) continue;
        ids.add(item.id);
        cards.push(item);
      }
      firstKnownIndex = cards.findIndex(item => known.has(item.id));
    }
  }

  let newBots = [];
  let ambiguousReset = false;
  if (prior.initialized) {
    if (firstKnownIndex >= 0) {
      newBots = cards.slice(0, firstKnownIndex);
    } else {
      ambiguousReset = true;
    }
  }

  return {
    ok: true,
    cards,
    newBots,
    ambiguousReset,
    baseUrl: first.baseUrl || creatorLatestUrl(handle)
  };
}

async function runCreatorBotScan({ force = false, handles = null, reason = "alarm" } = {}) {
  const started = Date.now();
  const result = await storageGet(["settings", FOLLOWED_CREATORS_KEY, CREATOR_BOT_WATCH_KEY, CREATOR_BOT_WEBHOOK_KEY]);
  const settings = result.settings || {};
  if (settings.enabled === false || !settings.enableCreatorBotNotifications) {
    return { checked: 0, newBots: 0, failures: 0, skipped: "disabled" };
  }

  const followed = normalizeFollowedCreatorStore(result[FOLLOWED_CREATORS_KEY]);
  const requested = Array.isArray(handles)
    ? [...new Set(handles.map(normalizeCreatorHandle).filter(Boolean))]
        .filter(handle => followed.handles.includes(handle))
    : [...followed.handles];
  const isFullScan = !Array.isArray(handles);

  let state = normalizeCreatorBotWatchState(result[CREATOR_BOT_WATCH_KEY]);
  const intervalMs = creatorBotWatchInterval(settings) * 60 * 1000;
  const now = Date.now();
  if (!force && isFullScan && state.lastScanAt && now - state.lastScanAt < Math.max(60000, intervalMs - 5000)) {
    return { checked: 0, newBots: 0, failures: 0, skipped: "not-due" };
  }

  const followedSet = new Set(followed.handles);
  for (const handle of Object.keys(state.creators)) {
    if (!followedSet.has(handle)) delete state.creators[handle];
  }

  if (!requested.length) {
    state.lastRunAt = now;
    if (isFullScan) state.lastScanAt = now;
    state.lastDurationMs = Date.now() - started;
    state.lastCheckedCreators = 0;
    state.lastNewCount = 0;
    state.lastFailureCount = 0;
    state.lastReason = reason;
    await storageSet({ [CREATOR_BOT_WATCH_KEY]: state });
    return { checked: 0, newBots: 0, failures: 0 };
  }

  const allNew = [];
  let checked = 0;
  let failures = 0;

  for (const handle of requested) {
    const previous = state.creators[handle] || {
      handle,
      initialized: false,
      baselineAt: 0,
      baselineCount: 0,
      seenIds: [],
      lastCheckedAt: 0,
      lastNewAt: 0,
      lastNewCount: 0,
      lastError: ""
    };

    const scan = await scanOneFollowedCreator(handle, previous);
    const checkedAt = Date.now();
    checked += 1;

    if (!scan.ok) {
      failures += 1;
      state.creators[handle] = {
        ...previous,
        handle,
        lastCheckedAt: checkedAt,
        lastNewCount: 0,
        lastError: String(scan.error || scan.status || "Creator scan failed").slice(0, 500)
      };
      continue;
    }

    const currentIds = scan.cards.map(item => item.id);
    const mergedSeen = [];
    const seenIds = new Set();
    for (const id of [...currentIds, ...(Array.isArray(previous.seenIds) ? previous.seenIds : [])]) {
      const cleanId = String(id || "").trim();
      if (!cleanId || seenIds.has(cleanId)) continue;
      seenIds.add(cleanId);
      mergedSeen.push(cleanId);
      if (mergedSeen.length >= CREATOR_BOT_SEEN_LIMIT) break;
    }

    const baselineNow = !previous.initialized || scan.ambiguousReset;
    const newBots = baselineNow ? [] : scan.newBots.map(item => ({
      ...item,
      detectedAt: checkedAt
    }));

    state.creators[handle] = {
      handle,
      initialized: true,
      baselineAt: baselineNow ? checkedAt : (Number(previous.baselineAt) || checkedAt),
      baselineCount: baselineNow ? currentIds.length : (Number(previous.baselineCount) || currentIds.length),
      seenIds: mergedSeen,
      lastCheckedAt: checkedAt,
      lastNewAt: newBots.length ? checkedAt : (Number(previous.lastNewAt) || 0),
      lastNewCount: newBots.length,
      lastError: scan.ambiguousReset ? "Baseline refreshed after the latest listing no longer overlapped the previous multi-page snapshot." : ""
    };

    allNew.push(...newBots);
  }

  if (allNew.length) {
    const recentById = new Map();
    for (const item of [...allNew, ...state.recent]) {
      const normalized = normalizeCreatorBotEntry(item);
      if (!normalized || recentById.has(normalized.id)) continue;
      recentById.set(normalized.id, normalized);
      if (recentById.size >= CREATOR_BOT_RECENT_LIMIT) break;
    }
    state.recent = [...recentById.values()];
  }

  const webhookConfig = normalizeCreatorBotWebhookConfig(result[CREATOR_BOT_WEBHOOK_KEY]);
  await deliverCreatorBotAlerts(allNew, settings, webhookConfig, state);

  state.lastRunAt = Date.now();
  if (isFullScan) state.lastScanAt = state.lastRunAt;
  state.lastDurationMs = Date.now() - started;
  state.lastCheckedCreators = checked;
  state.lastNewCount = allNew.length;
  state.lastFailureCount = failures;
  state.lastReason = reason;
  await storageSet({ [CREATOR_BOT_WATCH_KEY]: state });

  return {
    checked,
    newBots: allNew.length,
    failures,
    browserNotifications: !!settings.creatorBotBrowserNotifications,
    webhookEnabled: !!webhookConfig.enabled
  };
}

function queueCreatorBotScan(options = {}) {
  creatorBotScanChain = creatorBotScanChain
    .catch(() => {})
    .then(() => runCreatorBotScan(options));
  return creatorBotScanChain;
}

async function configureCreatorBotWatchAlarm(runNow = false) {
  const result = await storageGet(["settings"]);
  const settings = result.settings || {};
  const enabled = settings.enabled !== false && !!settings.enableCreatorBotNotifications;
  const periodInMinutes = creatorBotWatchInterval(settings);

  try {
    chrome.alarms.clear(CREATOR_BOT_WATCH_ALARM, () => {
      if (!enabled) return;
      chrome.alarms.create(CREATOR_BOT_WATCH_ALARM, {
        periodInMinutes,
        delayInMinutes: runNow ? 0.5 : Math.min(periodInMinutes, 1)
      });
    });
  } catch {}
}

// Optional alarm handler owned by creator-workspace. Omitted modules do not register a handler.
(globalThis.__DSQ_BACKGROUND_ALARM_HANDLERS__ ||= Object.create(null))["ds-creator-bot-watch-v1"] = {
  owner: "creator-workspace",
  run: () => { queueCreatorBotScan({ force: false, reason: "alarm" }); }
};
