"use strict";

const LOAD_ALL_ALARM_PREFIX = "ds-load-all-chats-";
const activeLoaders = new Set();

const AUTO_AFK_ALARM = "ds-auto-afk-scan-v1";
const CHAT_NUDGE_ALARM = "ds-chat-nudge-scan-v1";
const CHAT_NUDGE_STORE_KEY = "chatNudgeSubscriptionsV1";
const CREATOR_BOT_WATCH_ALARM = "ds-creator-bot-watch-v1";
const CREATOR_BOT_WATCH_KEY = "creatorBotWatchV1";
const CREATOR_BOT_WEBHOOK_KEY = "creatorBotWebhookV1";
const FOLLOWED_CREATORS_KEY = "followedCreators";
const CREATOR_BOT_WATCH_INTERVALS = [15, 30, 60, 180, 360, 720, 1440, 2880, 4320, 10080, 20160];
const CREATOR_BOT_SEEN_LIMIT = 180;
const CREATOR_BOT_RECENT_LIMIT = 240;
const CREATOR_DEFAULT_SORT_INDEX = "public_characters_alias/sort/_text_match(buckets: 3):desc,num_messages_24h:desc";
const CREATOR_LATEST_SORT_INDEX = "public_characters_alias/sort/_text_match(buckets: 3):desc,createdAt:desc";
const AUTO_AFK_ACTIVITY_KEY = "dsAutoAfkTabActivity";
const AUTO_AFK_STATUS_KEY = "dsAutoAfkLastScan";
const DUPLICATE_TAB_STATUS_KEY = "dsDuplicateTabLastScan";
const TAB_CLEANUP_ENRICHMENT_KEY = "tabCleanupEnrichment";
const TAB_CLEANUP_WORKER_TIMEOUT_MS = 30000;
const OPTIONS_SOURCE_TAB_KEY = "dsQolOptionsSourceTabId";
const RELEASE_NOTICE_KEY = "dsReleaseNotice";
const LAST_SEEN_VERSION_KEY = "dsLastSeenReleaseVersion";
const INSTALLED_VERSION_KEY = "dsLastInstalledVersion";
const QUICK_DISLIKE_HISTORY_KEY = "quickDislikeHistoryV1";
const AUTO_AFK_SCAN_MINUTES = 1;
const CHAT_NUDGE_SCAN_MINUTES = 15;

const CARD_TOKEN_DIAG_KEY = "cardTokenFetchDiagnosticsV1";
const CARD_TOKEN_API_BASE = "https://prod.nd-api.com/v2/characters/";
const CARD_TOKEN_TIMEOUT_MS = 8000;

const EXACT_MESSAGE_TYPESENSE_URL = "https://ts-lb.nd-api.com/multi_search";
const EXACT_MESSAGE_TYPESENSE_KEY = "STHKtT6jrC5z1IozTJHIeSN4qN9oL1s3";
const EXACT_MESSAGE_TYPESENSE_COLLECTION = "public_characters_alias";
const EXACT_MESSAGE_TYPESENSE_QUERY_BY = "name,title,tags,creator_username,character_id,type";
const EXACT_MESSAGE_MAX_IDS = 60;
let cardTokenDiagWriteTimer = null;
const cardTokenDiag = {
  requests: 0, successes: 0, timeouts: 0, http401: 0, http403: 0, http404: 0, http429: 0, httpOther: 0, parseFailures: 0, networkFailures: 0,
  authProvided: 0, authMissing: 0, indexedDbAuth: 0, storageAuth: 0,
  mainWorldRequests: 0, mainWorldSuccesses: 0, mainWorldFailures: 0, mainWorldCapturedAuth: 0,
  lastStatus: "none", lastHttpStatus: 0, lastElapsedMs: 0, lastAt: 0
};

const AUTO_AFK_DEFAULTS = {
  autoAfkEnabled: false,
  autoAfkHours: 12,
  autoAfkChats: false,
  autoAfkHome: false,
  autoAfkProfiles: false,
  autoAfkAction: "discard",
  autoAfkProtectActive: false,
  autoAfkResetOnActivate: false
};

const DUPLICATE_TAB_DEFAULTS = {
  duplicateTabGuardEnabled: false,
  duplicateTabChats: true,
  duplicateTabHome: false,
  duplicateTabProfiles: false,
  duplicateTabFocusExisting: true,
  duplicateTabKeepMode: "new"
};

let duplicateTabScanChain = Promise.resolve();
let quickDislikeChain = Promise.resolve();
let creatorBotScanChain = Promise.resolve();
let tabCleanupWorkerTabId = null;
const tabCleanupWorkerTabIds = new Set();
const quickDislikeWorkerTabIds = new Set();
const quickDislikeBulkWorkerTabs = new Map();
const listingRefillWorkerTabIds = new Set();
const personaRefreshWorkerTabIds = new Set();
const canceledQuickDislikeBulkRuns = new Map();

function isQuickDislikeWorkerUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return isSpicyChatUrl(parsed.href) && parsed.searchParams.get("dsQuickDislike") === "1";
  } catch {
    return false;
  }
}

function isPersonaRefreshWorkerUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return isSpicyChatUrl(parsed.href) && parsed.searchParams.get("dsPersonaRefresh") === "1";
  } catch {
    return false;
  }
}

function isListingRefillWorkerUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return isSpicyChatUrl(parsed.href) && parsed.searchParams.get("dsListingRefill") === "1";
  } catch {
    return false;
  }
}


function markQuickDislikeBulkRunCanceled(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  const now = Date.now();
  canceledQuickDislikeBulkRuns.set(id, now);
  for (const [key, at] of canceledQuickDislikeBulkRuns.entries()) {
    if (now - Number(at || 0) > 30 * 60 * 1000) canceledQuickDislikeBulkRuns.delete(key);
  }
  return true;
}

function isQuickDislikeBulkRunCanceled(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  const at = Number(canceledQuickDislikeBulkRuns.get(id) || 0);
  if (!at) return false;
  if (Date.now() - at > 30 * 60 * 1000) {
    canceledQuickDislikeBulkRuns.delete(id);
    return false;
  }
  return true;
}

async function releaseQuickDislikeBulkWorker(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  const tabId = Number(quickDislikeBulkWorkerTabs.get(id));
  quickDislikeBulkWorkerTabs.delete(id);
  if (!Number.isFinite(tabId)) return false;
  quickDislikeWorkerTabIds.delete(tabId);
  await tabsRemove(tabId).catch?.(() => null);
  return true;
}

async function prepareQuickDislikeWorkerTab(url, bulkRunId = "") {
  const runId = String(bulkRunId || "").trim();
  if (runId) {
    const existingId = Number(quickDislikeBulkWorkerTabs.get(runId));
    if (Number.isFinite(existingId)) {
      const existing = await tabsGet(existingId);
      if (existing) {
        const updated = await tabsUpdate(existingId, { url: url.href, active: false });
        if (updated?.ok) {
          quickDislikeWorkerTabIds.add(existingId);
          return { ok: true, tabId: existingId, reusable: true };
        }
      }
      quickDislikeBulkWorkerTabs.delete(runId);
      quickDislikeWorkerTabIds.delete(existingId);
    }
  }

  const created = await tabsCreate({ url: url.href, active: false });
  const tabId = Number(created?.tab?.id);
  if (!created.ok || !Number.isFinite(tabId)) {
    return { ok: false, tabId: null, reusable: !!runId, error: created.error || "" };
  }
  quickDislikeWorkerTabIds.add(tabId);
  if (runId) quickDislikeBulkWorkerTabs.set(runId, tabId);
  return { ok: true, tabId, reusable: !!runId };
}

function alarmName(tabId) {
  return `${LOAD_ALL_ALARM_PREFIX}${tabId}`;
}

function tabIdFromAlarm(name) {
  if (!name.startsWith(LOAD_ALL_ALARM_PREFIX)) return null;

  const raw = name.slice(LOAD_ALL_ALARM_PREFIX.length);
  const id = Number(raw);

  return Number.isFinite(id) ? id : null;
}

function scheduleLoadStep(tabId) {
  if (!tabId) return;

  activeLoaders.add(tabId);

  chrome.alarms.create(alarmName(tabId), {
    delayInMinutes: 0.1
  });
}

function stopLoader(tabId) {
  if (!tabId) return;

  activeLoaders.delete(tabId);
  chrome.alarms.clear(alarmName(tabId));
}


function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise(resolve => chrome.storage.local.set(values, resolve));
}

function tabsGet(tabId) {
  return new Promise(resolve => {
    chrome.tabs.get(tabId, tab => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(tab || null);
    });
  });
}

function tabsQuery(queryInfo) {
  return new Promise(resolve => chrome.tabs.query(queryInfo, tabs => resolve(tabs || [])));
}

function tabsSendMessage(tabId, message) {
  return new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

function tabsDiscard(tabId) {
  return new Promise(resolve => {
    if (typeof chrome.tabs.discard !== "function") {
      resolve({ ok: false, error: "tabs.discard is not available in this browser" });
      return;
    }

    chrome.tabs.discard(tabId, tab => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !!tab && !error, tab: tab || null, error });
    });
  });
}

function tabsRemove(tabId) {
  return new Promise(resolve => {
    chrome.tabs.remove(tabId, () => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !error, error });
    });
  });
}

function tabsUpdate(tabId, updateProperties) {
  return new Promise(resolve => {
    chrome.tabs.update(tabId, updateProperties, tab => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !!tab && !error, tab: tab || null, error });
    });
  });
}

function tabsCreate(createProperties) {
  return new Promise(resolve => {
    if (typeof chrome.tabs?.create !== "function") {
      resolve({ ok: false, error: "tabs.create is not available" });
      return;
    }
    chrome.tabs.create(createProperties, tab => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !!tab && !error, tab: tab || null, error });
    });
  });
}

function windowsCreate(createData) {
  return new Promise(resolve => {
    if (typeof chrome.windows?.create !== "function") {
      resolve({ ok: false, error: "windows.create is not available" });
      return;
    }
    chrome.windows.create(createData, window => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !!window && !error, window: window || null, error });
    });
  });
}

function windowsUpdate(windowId, updateInfo) {
  return new Promise(resolve => {
    if (!Number.isFinite(Number(windowId)) || typeof chrome.windows?.update !== "function") {
      resolve({ ok: false, error: "windows.update is not available" });
      return;
    }

    chrome.windows.update(Number(windowId), updateInfo, window => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !!window && !error, window: window || null, error });
    });
  });
}


function scheduleCardTokenDiagWrite() {
  if (cardTokenDiagWriteTimer) return;
  cardTokenDiagWriteTimer = setTimeout(() => {
    cardTokenDiagWriteTimer = null;
    try { chrome.storage.local.set({ [CARD_TOKEN_DIAG_KEY]: { ...cardTokenDiag } }, () => void chrome.runtime.lastError); } catch {}
  }, 1200);
}

function recordCardTokenFetch(status, extra = {}) {
  cardTokenDiag.requests += status === "start" ? 1 : 0;
  if (status === "success") cardTokenDiag.successes += 1;
  if (status === "timeout") cardTokenDiag.timeouts += 1;
  if (status === "parse-failure") cardTokenDiag.parseFailures += 1;
  if (status === "network-failure") cardTokenDiag.networkFailures += 1;
  const http = Number(extra.httpStatus || 0);
  if (status === "http") {
    if (http === 401) cardTokenDiag.http401 += 1;
    else if (http === 403) cardTokenDiag.http403 += 1;
    else if (http === 404) cardTokenDiag.http404 += 1;
    else if (http === 429) cardTokenDiag.http429 += 1;
    else cardTokenDiag.httpOther += 1;
  }
  if (status === "start") {
    if (extra.authProvided) cardTokenDiag.authProvided += 1;
    else cardTokenDiag.authMissing += 1;
    if (extra.authSource === "indexeddb") cardTokenDiag.indexedDbAuth += 1;
    else if (extra.authSource && extra.authSource !== "none") cardTokenDiag.storageAuth += 1;
  }
  if (status !== "start") {
    cardTokenDiag.lastStatus = String(status || "unknown");
    cardTokenDiag.lastHttpStatus = http;
    cardTokenDiag.lastElapsedMs = Math.max(0, Math.round(Number(extra.elapsedMs || 0)));
    cardTokenDiag.lastAt = Date.now();
  }
  scheduleCardTokenDiagWrite();
}

async function fetchCardTokenCharacter(message) {
  const botId = String(message?.botId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(botId)) return { ok: false, status: "invalid-id" };
  const authToken = String(message?.authToken || "").trim();
  const guestUserId = String(message?.guestUserId || "").trim();
  const authSource = String(message?.authSource || (authToken ? "storage" : "none"));
  recordCardTokenFetch("start", { authProvided: !!authToken, authSource });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CARD_TOKEN_TIMEOUT_MS);
  const started = Date.now();
  const headers = { Accept: "application/json", "x-app-id": "spicychat" };
  if (authToken && authToken.length < 12000) headers.Authorization = `Bearer ${authToken}`;
  if (/^[0-9a-f-]{20,}$/i.test(guestUserId)) headers["x-guest-userid"] = guestUserId;
  try {
    const response = await fetch(`${CARD_TOKEN_API_BASE}${encodeURIComponent(botId)}`, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers,
      signal: controller.signal
    });
    const elapsedMs = Date.now() - started;
    if (!response.ok) {
      recordCardTokenFetch("http", { httpStatus: response.status, elapsedMs });
      return { ok: false, status: "http", httpStatus: response.status, elapsedMs };
    }
    let data;
    try { data = await response.json(); }
    catch (error) {
      recordCardTokenFetch("parse-failure", { elapsedMs });
      return { ok: false, status: "parse-failure", elapsedMs, error: error?.message || String(error) };
    }
    recordCardTokenFetch("success", { httpStatus: response.status, elapsedMs });
    return { ok: true, status: "success", httpStatus: response.status, elapsedMs, data };
  } catch (error) {
    const elapsedMs = Date.now() - started;
    if (error?.name === "AbortError") {
      recordCardTokenFetch("timeout", { elapsedMs });
      return { ok: false, status: "timeout", elapsedMs };
    }
    recordCardTokenFetch("network-failure", { elapsedMs });
    return { ok: false, status: "network-failure", elapsedMs, error: error?.message || String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function recordCardTokenBridge(message) {
  cardTokenDiag.mainWorldRequests += 1;
  const status = String(message?.status || "failed");
  if (status === "success") cardTokenDiag.mainWorldSuccesses += 1;
  else cardTokenDiag.mainWorldFailures += 1;
  if (String(message?.authSource || "") === "captured-main-world") cardTokenDiag.mainWorldCapturedAuth += 1;
  cardTokenDiag.lastStatus = `main-${status}`;
  cardTokenDiag.lastHttpStatus = Number(message?.httpStatus || 0);
  cardTokenDiag.lastElapsedMs = Math.max(0, Math.round(Number(message?.elapsedMs || 0)));
  cardTokenDiag.lastAt = Date.now();
  scheduleCardTokenDiagWrite();
  return { ok: true };
}

function isSpicyChatUrl(url) {
  try {
    const parsed = new URL(url || "");
    return parsed.protocol === "https:" && (
      parsed.hostname === "spicychat.ai" ||
      parsed.hostname === "www.spicychat.ai"
    );
  } catch {
    return false;
  }
}

function autoAfkScopeForUrl(url) {
  if (!isSpicyChatUrl(url)) return null;

  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";

    if (/^\/chat\/[^/]+/i.test(pathname)) return "chat";
    if (pathname === "/") return "home";

    if (
      /^\/profile(?:\/|$)/i.test(pathname) ||
      /^\/users?(?:\/|$)/i.test(pathname) ||
      /^\/creator(?:\/|$)/i.test(pathname) ||
      /^\/chatbot\/(?!create(?:\/|$))[^/]+/i.test(pathname) ||
      /^\/character(?:s)?(?:\/|$)/i.test(pathname)
    ) {
      return "profile";
    }
  } catch {}

  return null;
}

function autoAfkApplies(url, settings) {
  const scope = autoAfkScopeForUrl(url);
  if (scope === "chat") return settings.autoAfkChats !== false;
  if (scope === "home") return !!settings.autoAfkHome;
  if (scope === "profile") return !!settings.autoAfkProfiles;
  return false;
}

function duplicateTabApplies(url, settings) {
  const scope = autoAfkScopeForUrl(url);
  if (scope === "chat") return settings.duplicateTabChats !== false;
  if (scope === "home") return !!settings.duplicateTabHome;
  if (scope === "profile") return !!settings.duplicateTabProfiles;
  return false;
}

function duplicateTabKey(url, settings) {
  if (!duplicateTabApplies(url, settings)) return "";

  try {
    const parsed = new URL(url);
    const scope = autoAfkScopeForUrl(url);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";

    // Hash fragments are client-side position/state, not a different SpicyChat page.
    // Keep query parameters because SpicyChat can use them for meaningful page state.
    return `${scope}:${pathname}${parsed.search}`;
  } catch {
    return "";
  }
}

async function getDuplicateTabSettings() {
  const result = await storageGet(["settings"]);
  return {
    ...DUPLICATE_TAB_DEFAULTS,
    ...(result.settings || {})
  };
}

function duplicateKeeperForGroup(group, initiatorTabId = null, keepMode = "new") {
  const tabs = Array.isArray(group) ? group.filter(tab => tab?.id) : [];
  if (!tabs.length) return null;

  // Pinned tabs are deliberately never auto-closed, so prefer one as the keeper
  // before applying the normal duplicate strategy.
  const pinned = tabs.filter(tab => tab.pinned);
  if (pinned.length) {
    const activePinned = pinned.find(tab => tab.active);
    return activePinned || pinned.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
  }

  const initiator = initiatorTabId
    ? tabs.find(tab => Number(tab.id) === Number(initiatorTabId))
    : null;

  if (initiator && keepMode === "new") return initiator;

  if (initiator && keepMode === "existing") {
    const alternatives = tabs.filter(tab => Number(tab.id) !== Number(initiatorTabId));
    if (alternatives.length) {
      const activeExisting = alternatives.find(tab => tab.active);
      return activeExisting || alternatives.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
    }
  }

  const active = tabs.find(tab => tab.active);
  if (active) return active;
  return tabs.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
}

async function focusDuplicateKeeper(tab) {
  if (!tab?.id) return;
  if (Number.isFinite(Number(tab.windowId))) await windowsUpdate(tab.windowId, { focused: true });
  await tabsUpdate(tab.id, { active: true });
}

async function writeDuplicateTabStatus(status) {
  try {
    await storageSet({ [DUPLICATE_TAB_STATUS_KEY]: status });
  } catch {}
}

async function runDuplicateTabScan(options = {}) {
  const settings = await getDuplicateTabSettings();
  const summary = {
    at: Date.now(),
    enabled: settings.enabled !== false && !!settings.duplicateTabGuardEnabled,
    checked: 0,
    groups: 0,
    duplicates: 0,
    closed: 0,
    protected: 0,
    failed: 0,
    focusedExisting: 0,
    keepMode: settings.duplicateTabKeepMode === "existing" ? "existing" : "new",
    errors: []
  };

  if (!summary.enabled) {
    await writeDuplicateTabStatus(summary);
    return summary;
  }

  const tabs = await tabsQuery({
    url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"]
  });
  const groups = new Map();

  for (const tab of tabs) {
    if (!tab?.id || tabCleanupWorkerTabIds.has(Number(tab.id)) || quickDislikeWorkerTabIds.has(Number(tab.id)) || listingRefillWorkerTabIds.has(Number(tab.id)) || isQuickDislikeWorkerUrl(tab.url || tab.pendingUrl) || isListingRefillWorkerUrl(tab.url || tab.pendingUrl)) continue;
    const key = duplicateTabKey(tab.url || tab.pendingUrl, settings);
    if (!key) continue;
    summary.checked += 1;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }

  const initiatorTabId = Number(options.initiatorTabId) || null;
  let keeperToFocus = null;
  let initiatorWasClosed = false;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    summary.groups += 1;
    summary.duplicates += group.length - 1;

    // Automatic catches use the configured keep-new / keep-existing strategy.
    // Pinned tabs still win regardless of that preference.
    const keeper = duplicateKeeperForGroup(group, initiatorTabId && group.some(tab => Number(tab.id) === initiatorTabId) ? initiatorTabId : null, settings.duplicateTabKeepMode === "existing" ? "existing" : "new");
    if (!keeper?.id) continue;

    for (const tab of group) {
      if (!tab?.id || Number(tab.id) === Number(keeper.id)) continue;

      // Never auto-close pinned tabs. If multiple pinned copies exist, report them
      // as protected and leave the user's deliberate browser state alone.
      if (tab.pinned) {
        summary.protected += 1;
        continue;
      }

      const result = await tabsRemove(tab.id);
      if (result.ok) {
        summary.closed += 1;
        await removeAutoAfkActivity(tab.id);
        if (initiatorTabId && Number(tab.id) === initiatorTabId) {
          initiatorWasClosed = true;
          keeperToFocus = keeper;
        }
      } else {
        summary.failed += 1;
        if (result.error && summary.errors.length < 3) summary.errors.push(result.error);
      }
    }
  }

  if (initiatorWasClosed && keeperToFocus && options.focusExisting !== false && settings.duplicateTabFocusExisting !== false) {
    await focusDuplicateKeeper(keeperToFocus);
    summary.focusedExisting = 1;
  }

  await writeDuplicateTabStatus(summary);
  return summary;
}

function normalizeQuickDislikeHistory(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bots = source.bots && typeof source.bots === "object" ? source.bots : {};
  const normalized = {};
  for (const [id, value] of Object.entries(bots)) {
    if (!/^[0-9a-f-]{20,}$/i.test(String(id || ""))) continue;
    const status = String(value?.status || "");
    if (!["disliked", "already-disliked", "already-rated-or-unavailable", "unavailable-private-or-deleted", "unavailable-creator-blocked"].includes(status)) continue;
    normalized[id] = {
      status,
      name: String(value?.name || "").slice(0, 160),
      handledAt: Number(value?.handledAt || value?.at || 0) || Date.now()
    };
  }
  return { version: 1, bots: normalized };
}

async function getQuickDislikeHistory() {
  const result = await storageGet([QUICK_DISLIKE_HISTORY_KEY]);
  return normalizeQuickDislikeHistory(result[QUICK_DISLIKE_HISTORY_KEY]);
}

async function rememberQuickDislike(botId, botName, status) {
  if (!["disliked", "already-disliked", "already-rated-or-unavailable", "unavailable-private-or-deleted", "unavailable-creator-blocked"].includes(status)) return null;
  const history = await getQuickDislikeHistory();
  history.bots[botId] = {
    status,
    name: String(botName || history.bots[botId]?.name || "").slice(0, 160),
    handledAt: Date.now()
  };

  // Keep this local ledger bounded even for very old installations.
  const entries = Object.entries(history.bots);
  if (entries.length > 5000) {
    entries
      .sort((a, b) => Number(b[1]?.handledAt || 0) - Number(a[1]?.handledAt || 0))
      .slice(5000)
      .forEach(([id]) => delete history.bots[id]);
  }

  await storageSet({ [QUICK_DISLIKE_HISTORY_KEY]: history });
  return history.bots[botId];
}

async function runQuickDislikeBot(message) {
  const botId = String(message?.botId || "").trim();
  if (!/^[0-9a-f-]{20,}$/i.test(botId)) return { ok: false, status: "invalid-bot" };
  if (message?.bulkRunId && isQuickDislikeBulkRunCanceled(message.bulkRunId)) {
    return { ok: false, status: "bulk-canceled" };
  }

  if (message?.force !== true) {
    const history = await getQuickDislikeHistory();
    const remembered = history.bots[botId];
    if (remembered) {
      return {
        ok: true,
        status: "already-handled",
        rememberedStatus: remembered.status,
        handledAt: remembered.handledAt || 0
      };
    }
  }

  let url;
  try {
    url = new URL(String(message?.chatUrl || `https://spicychat.ai/chat/${botId}`));
  } catch {
    return { ok: false, status: "invalid-url" };
  }
  if (!isSpicyChatUrl(url.href) || !/^\/chat\//i.test(url.pathname)) return { ok: false, status: "invalid-url" };
  url.searchParams.set("dsQuickDislike", "1");

  const worker = await prepareQuickDislikeWorkerTab(url, message?.bulkRunId || "");
  const tabId = Number(worker?.tabId);
  if (!worker?.ok || !Number.isFinite(tabId)) return { ok: false, status: "worker-tab-failed", error: worker?.error || "" };

  let result = { ok: false, status: "worker-timeout" };
  try {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (message?.bulkRunId && isQuickDislikeBulkRunCanceled(message.bulkRunId)) {
        result = { ok: false, status: "bulk-canceled" };
        break;
      }
      const tab = await tabsGet(tabId);
      if (!tab) {
        result = { ok: false, status: "worker-closed" };
        break;
      }
      const response = await tabsSendMessage(tabId, { type: "DS_QUICK_DISLIKE_RUN", botId });
      if (response?.status && response.status !== "not-worker") {
        result = response;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 420));
    }
  } finally {
    // Bulk runs reuse one hidden helper tab instead of booting a fresh full
    // SpicyChat app for every bot. A failed helper is discarded so the next
    // retry starts clean; successful bulk helpers are released explicitly when
    // the run finishes.
    if (!worker.reusable || !result?.ok) {
      if (worker.reusable && message?.bulkRunId) quickDislikeBulkWorkerTabs.delete(String(message.bulkRunId));
      await tabsRemove(tabId);
      quickDislikeWorkerTabIds.delete(tabId);
    }
  }

  if (result?.ok && [
    "disliked",
    "already-disliked",
    "already-rated-or-unavailable",
    "unavailable-private-or-deleted",
    "unavailable-creator-blocked"
  ].includes(result.status)) {
    await rememberQuickDislike(botId, message?.botName || "", result.status);
  }
  return result;
}

async function runListingRefillFavoriteWorker(message) {
  let url;
  try {
    url = new URL(String(message?.url || ""));
  } catch {
    return { ok: false, status: "invalid-url" };
  }
  if (!isSpicyChatUrl(url.href)) return { ok: false, status: "invalid-url" };
  const botId = String(message?.botId || "").trim();
  if (!botId) return { ok: false, status: "missing-bot-id" };
  url.searchParams.set("dsListingRefill", "1");

  const created = await tabsCreate({ url: url.href, active: false });
  const tabId = Number(created?.tab?.id);
  if (!created.ok || !Number.isFinite(tabId)) {
    return { ok: false, status: "worker-tab-failed", error: created.error || "" };
  }

  listingRefillWorkerTabIds.add(tabId);
  let result = { ok: false, status: "worker-timeout" };
  try {
    const started = Date.now();
    while (Date.now() - started < 25000) {
      const tab = await tabsGet(tabId);
      if (!tab) return { ok: false, status: "worker-closed" };
      const response = await tabsSendMessage(tabId, {
        type: "DS_LISTING_REFILL_FAVORITE_RUN",
        botId
      });
      if (response?.ok) {
        result = response;
        break;
      }
      if (response?.status && !["not-ready", "not-worker"].includes(response.status)) {
        result = response;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 420));
    }
  } finally {
    await tabsRemove(tabId);
    listingRefillWorkerTabIds.delete(tabId);
  }
  return result;
}

async function runListingRefillPageWorker(message) {
  let url;
  try {
    url = new URL(String(message?.url || ""));
  } catch {
    return { ok: false, status: "invalid-url" };
  }
  if (!isSpicyChatUrl(url.href)) return { ok: false, status: "invalid-url" };
  url.searchParams.set("dsListingRefill", "1");

  const created = await tabsCreate({ url: url.href, active: false });
  const tabId = Number(created?.tab?.id);
  if (!created.ok || !Number.isFinite(tabId)) {
    return { ok: false, status: "worker-tab-failed", error: created.error || "" };
  }

  listingRefillWorkerTabIds.add(tabId);
  let result = { ok: false, status: "worker-timeout" };
  try {
    const started = Date.now();
    while (Date.now() - started < 25000) {
      const tab = await tabsGet(tabId);
      if (!tab) return { ok: false, status: "worker-closed" };
      const response = await tabsSendMessage(tabId, {
        type: "DS_LISTING_REFILL_EXTRACT",
        expectedPage: Number(message?.expectedPage || 0) || 0
      });
      if (response?.ok) {
        result = response;
        break;
      }
      if (response?.status && !["not-ready", "not-worker"].includes(response.status)) {
        result = response;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 420));
    }
  } finally {
    await tabsRemove(tabId);
    listingRefillWorkerTabIds.delete(tabId);
  }
  return result;
}


async function runPersonaRenderedSnapshotWorker(message) {
  const personaId = String(message?.personaId || "").trim();
  if (!personaId) return { ok: false, status: "invalid-persona" };
  const url = new URL(`https://spicychat.ai/personas/edit/${encodeURIComponent(personaId)}`);
  url.searchParams.set("dsPersonaRefresh", "1");

  const created = await tabsCreate({ url: url.href, active: false });
  const tabId = Number(created?.tab?.id);
  if (!created.ok || !Number.isFinite(tabId)) return { ok: false, status: "worker-tab-failed", error: created.error || "" };

  personaRefreshWorkerTabIds.add(tabId);
  let result = { ok: false, status: "worker-timeout" };
  try {
    const started = Date.now();
    while (Date.now() - started < 22000) {
      const tab = await tabsGet(tabId);
      if (!tab) return { ok: false, status: "worker-closed" };
      const response = await tabsSendMessage(tabId, { type: "DS_PERSONA_RENDERED_SNAPSHOT_READ", personaId });
      if (response?.ok) { result = response; break; }
      if (response?.status && !["not-ready", "not-worker"].includes(response.status)) { result = response; break; }
      await new Promise(resolve => setTimeout(resolve, 350));
    }
  } finally {
    await tabsRemove(tabId);
    personaRefreshWorkerTabIds.delete(tabId);
  }
  return result;
}

function allowedPersonaImageUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    if (url.protocol !== "https:") return null;
    if (!["cdn.nd-api.com", "cms.cdn.nd-api.com"].includes(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchPersonaImageDataUrl(rawUrl) {
  const url = allowedPersonaImageUrl(rawUrl);
  if (!url) return { ok: false, error: "unsupported image host" };

  const response = await fetch(url.href, { cache: "no-store", credentials: "omit" });
  if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
  const blob = await response.blob();
  if (!blob.size || blob.size > 5 * 1024 * 1024) return { ok: false, error: "image too large or empty" };
  const type = /^image\//i.test(blob.type || "") ? blob.type : "image/jpeg";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { ok: true, dataUrl: `data:${type};base64,${bytesToBase64(bytes)}` };
}


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

  // If a busy creator pushed every previously-seen bot off page 1, walk a
  // handful of later pages before treating the listing as unrelated. This is
  // especially useful for longer check intervals without turning every normal
  // scan into a multi-page crawl.
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
      // No overlap after the bounded multi-page check: refresh the baseline without firing a wall
      // of alerts. This is intentionally conservative; a later normal overlap
      // resumes precise prefix-based new-bot detection.
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

  // Keep watcher state only for creators who are still locally followed.
  // Public creator pages/public bot listings are the data source; users opt in
  // to the watch locally when they choose Follow.
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

function queueQuickDislikeBot(message) {
  quickDislikeChain = quickDislikeChain
    .catch(() => {})
    .then(() => runQuickDislikeBot(message));
  return quickDislikeChain;
}

function queueDuplicateTabScan(options = {}) {
  duplicateTabScanChain = duplicateTabScanChain
    .catch(() => {})
    .then(() => runDuplicateTabScan(options));
  return duplicateTabScanChain;
}

function diagnosticPageType(url) {
  try {
    const path = new URL(url || "").pathname || "/";
    if (/^\/chat\/[^/]+/i.test(path)) return "chat";
    if (/^\/chatbot\/(?!create(?:\/|$))[^/]+/i.test(path)) return "profile";
    if (path === "/") return "home";
    if (path === "/chats" || path === "/chat" || path.startsWith("/chats/")) return "chat-list";
    if (path.startsWith("/my-creations/")) return "my-creations";
    if (path.startsWith("/favorite-bots")) return "favorites";
    if (path.startsWith("/recommended-bots")) return "recommendations";
    if (path.startsWith("/lorebook")) return "lorebook";
    if (path.startsWith("/creator/")) return "creator";
  } catch {}
  return "other";
}

function diagnosticBotId(url) {
  try {
    const path = new URL(url || "").pathname || "";
    return path.match(/^\/(?:chat|chatbot)\/([^/?#]+)/i)?.[1] || "";
  } catch {
    return "";
  }
}

function diagnosticStoreIds(store) {
  if (Array.isArray(store)) return new Set(store.map(value => String(value || "").trim()).filter(Boolean));
  if (!store || typeof store !== "object") return new Set();
  if (Array.isArray(store.ids)) return new Set(store.ids.map(value => String(value || "").trim()).filter(Boolean));
  return new Set(Object.keys(store.meta || {}));
}

function diagnosticMeta(store, id) {
  if (!store || typeof store !== "object" || !id) return null;
  return store.meta?.[id] || store[id] || null;
}

function diagnosticRecent(store, id) {
  const entries = Array.isArray(store?.entries) ? store.entries : Array.isArray(store) ? store : [];
  return entries.find(entry => String(entry?.id || entry?.botId || "") === id) || null;
}

function diagnosticList(value) {
  if (Array.isArray(value)) return [...new Set(value.map(item => String(item || "").trim()).filter(Boolean))];
  return [...new Set(String(value || "").split(/[,;|\n]/).map(item => item.trim()).filter(Boolean))];
}

function diagnosticIncrement(map, values) {
  for (const value of values || []) {
    const key = String(value || "").trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
}

function diagnosticTopCounts(map, limit = 100) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}


function diagnosticTitleBotName(title) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  const match = text.match(/^Chat with (.+?) on Spicychat$/i);
  return match ? String(match[1] || "").trim() : "";
}

function diagnosticProfileTitleName(title) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  const chatName = diagnosticTitleBotName(text);
  if (chatName) return chatName;
  return text
    .replace(/\s+-\s+Explore this AI Chatbot on Spicychat.*$/i, "")
    .replace(/\s+-\s+AI(?: Sex)? Chatbot(?:\s*\|\s*Spicychat)? .*$/i, "")
    .replace(/\s*[|\-–—]\s*Spicychat.*$/i, "")
    .trim();
}

function diagnosticUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(String(value || "").trim());
}

function diagnosticNamePenalty(value, botId = "") {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  if (!text) return 1000;
  if (diagnosticUuidLike(text) || (botId && lower === String(botId).toLowerCase())) return 900;
  if (["for you", "chat", "spicychat", "unknown"].includes(lower)) return 700;
  if (/^https?:\/\//i.test(text) || /spicychat\.ai\/chat/i.test(text)) return 700;
  if (text.length > 180) return 120;
  if (text.length > 110) return 70;
  return 0;
}

function diagnosticBestCandidate(candidates, botId = "") {
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map((item, index) => ({
      value: String(item?.value || "").replace(/\s+/g, " ").trim(),
      source: String(item?.source || ""),
      score: Number(item?.score || 0) - diagnosticNamePenalty(item?.value, botId),
      index
    }))
    .filter(item => item.value)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0] || { value: "", source: "", score: 0 };
}

function diagnosticEnrichmentStore(value) {
  const raw = value && typeof value === "object" ? value : {};
  const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : raw;
  return { version: 1, meta: meta && typeof meta === "object" ? meta : {} };
}


function diagnosticHtmlText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function diagnosticMetaFromHtml(html, key) {
  const source = String(html || "");
  const escaped = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return diagnosticHtmlText(match[1]);
  }
  return "";
}

function diagnosticFindProfileObject(value, id, depth = 0, seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 12 || seen.has(value)) return null;
  seen.add(value);
  const ownId = String(value.id || value.uuid || value.chatbotId || value.chatbot_id || value.characterId || value.character_id || "");
  if (id && ownId === id) return value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = diagnosticFindProfileObject(child, id, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function diagnosticObjectValue(obj, aliases) {
  if (!obj || typeof obj !== "object") return "";
  for (const alias of aliases) {
    const value = obj[alias];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const text = value.name || value.username || value.handle || value.title || value.value;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return "";
}

function diagnosticObjectList(obj, aliases) {
  if (!obj || typeof obj !== "object") return [];
  for (const alias of aliases) {
    const value = obj[alias];
    const out = [];
    const add = item => {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
      else if (item && typeof item === "object") {
        const text = item.name || item.label || item.title || item.value;
        if (typeof text === "string" && text.trim()) out.push(text.trim());
      }
    };
    if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === "string") value.split(/[,;|]/).forEach(add);
    else add(value);
    if (out.length) return [...new Set(out)];
  }
  return [];
}

function diagnosticProfileObjectFromHtml(html, id) {
  const source = String(html || "");
  const regex = /<script[^>]+(?:type=["']application\/json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let scans = 0;
  while ((match = regex.exec(source)) && scans < 24) {
    scans += 1;
    const raw = String(match[1] || "").trim();
    if (!raw || raw.length > 3500000) continue;
    try {
      const found = diagnosticFindProfileObject(JSON.parse(raw), id);
      if (found) return found;
    } catch {}
  }
  return null;
}

async function diagnosticFetchProfileFallback(id) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://spicychat.ai/chatbot/${encodeURIComponent(id)}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    const finalUrl = String(response.url || "");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (/\/(login|signin|sign-in|auth)(?:[/?#]|$)/i.test(finalUrl)) throw new Error("SpicyChat login is required");
    const html = await response.text();
    const candidate = diagnosticProfileObjectFromHtml(html, id);
    const title = diagnosticMetaFromHtml(html, "og:title") || diagnosticHtmlText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const name = diagnosticObjectValue(candidate, ["name", "title", "characterName", "character_name", "chatbotName", "chatbot_name"]) || diagnosticProfileTitleName(title);
    const challengeDetected = /cf-chl-|cloudflare|checking your browser|just a moment/i.test(html.slice(0, 250000));
    const idPresent = html.toLowerCase().includes(String(id).toLowerCase());
    return {
      name,
      description: diagnosticObjectValue(candidate, ["description", "subtitle", "summary", "shortDescription", "short_description"]) || diagnosticMetaFromHtml(html, "og:description") || diagnosticMetaFromHtml(html, "description"),
      creator: diagnosticObjectValue(candidate, ["creator", "creatorName", "creator_name", "username", "author"]),
      tags: diagnosticObjectList(candidate, ["tags", "tagNames", "tag_names", "chatbotTags", "chatbot_tags", "categories", "keywords"]),
      visibility: diagnosticObjectValue(candidate, ["visibility", "privacy", "status"]),
      image: diagnosticObjectValue(candidate, ["image", "avatar", "avatarUrl", "avatar_url", "imageUrl", "image_url"]) || diagnosticMetaFromHtml(html, "og:image"),
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      _diagnostic: {
        httpStatus: Number(response.status) || 0,
        finalUrl,
        responseBytes: html.length,
        embeddedProfileJson: !!candidate,
        requestedBotIdPresent: idPresent,
        challengeDetected,
        pageTitle: diagnosticHtmlText(title).slice(0, 240),
        responseKind: challengeDetected ? "challenge" : (candidate ? "embedded-profile-json" : (idPresent ? "profile-shell-with-id" : "generic-app-shell"))
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

async function diagnosticHelperTab() {
  const tabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const ordered = tabs
    .filter(tab => tab?.id && !tab.discarded && tab.status === "complete")
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  for (const tab of ordered) {
    const pong = await tabsSendMessage(tab.id, { type: "DS_TAB_DIAGNOSTIC_PING" });
    if (pong?.ok) return tab;
  }
  return null;
}

function tabCleanupDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function ensureTabCleanupWorker() {
  if (tabCleanupWorkerTabId) {
    const existing = await tabsGet(tabCleanupWorkerTabId);
    if (existing?.id) {
      tabCleanupWorkerTabIds.add(Number(existing.id));
      return { ok: true, tab: existing, reused: true };
    }
    tabCleanupWorkerTabIds.delete(Number(tabCleanupWorkerTabId));
    tabCleanupWorkerTabId = null;
  }

  const created = await tabsCreate({ url: "about:blank", active: false });
  if (!created?.ok || !created.tab?.id) {
    return { ok: false, error: created?.error || "Could not create the temporary analysis tab" };
  }
  tabCleanupWorkerTabId = Number(created.tab.id);
  tabCleanupWorkerTabIds.add(tabCleanupWorkerTabId);
  return { ok: true, tab: created.tab, reused: false };
}

async function closeTabCleanupWorker() {
  const id = Number(tabCleanupWorkerTabId) || 0;
  tabCleanupWorkerTabId = null;
  if (!id) return { ok: true, closed: false };
  tabCleanupWorkerTabIds.delete(id);
  const result = await tabsRemove(id);
  return { ok: result.ok, closed: result.ok, error: result.error || "" };
}

async function focusTabCleanupWorker() {
  const id = Number(tabCleanupWorkerTabId) || 0;
  if (!id) return { ok: false, error: "No analysis worker tab is open" };
  const tab = await tabsGet(id);
  if (!tab?.id) return { ok: false, error: "The analysis worker tab is no longer open" };
  if (Number.isFinite(Number(tab.windowId))) await windowsUpdate(tab.windowId, { focused: true });
  return tabsUpdate(tab.id, { active: true });
}

function diagnosticLocalProfileMetadata(storage, id) {
  const archive = diagnosticMeta(storage?.botArchive, id) || {};
  const fields = archive?.fields && typeof archive.fields === "object" ? archive.fields : {};
  const cache = diagnosticMeta(storage?.cardGreetingTokenCache, id) || {};
  const cacheFields = cache?.fields && typeof cache.fields === "object" ? cache.fields : {};
  const tags = [...new Set([
    ...diagnosticList(fields.tags),
    ...diagnosticList(cache.tags)
  ])].slice(0, 60);
  const metadata = {
    id,
    name: String(fields.name || archive.name || "").trim(),
    description: String(fields.description || cacheFields.description?.text || cacheFields.description || "").trim().slice(0, 8000),
    creator: String(fields.creator || archive.creator || "").replace(/^@/, "").trim(),
    tags,
    visibility: String(fields.visibility || archive.visibility || "").trim(),
    image: String(fields.image || archive.image || "").trim(),
    profileUrl: `https://spicychat.ai/chatbot/${id}`
  };
  const usefulFields = [];
  if (metadata.name && diagnosticNamePenalty(metadata.name, id) < 700) usefulFields.push("name");
  if (metadata.description) usefulFields.push("description");
  if (metadata.creator) usefulFields.push("creator");
  if (metadata.tags.length) usefulFields.push("tags");
  const groupingStrength = Number(!!metadata.description) + Number(metadata.tags.length > 0) + Number(!!metadata.creator);
  return { metadata, usefulFields, groupingStrength };
}

async function diagnosticReadWorkerProfile(botId) {
  const id = String(botId || "").trim();
  const worker = await ensureTabCleanupWorker();
  if (!worker.ok || !worker.tab?.id) {
    return { ok: false, error: worker.error || "Could not create the analysis worker tab" };
  }
  const tabId = Number(worker.tab.id);
  const target = `https://spicychat.ai/chatbot/${encodeURIComponent(id)}`;
  const updated = await tabsUpdate(tabId, { url: target, active: false });
  if (!updated?.ok) return { ok: false, error: updated?.error || "Could not navigate the analysis worker tab" };

  const started = Date.now();
  let challengeSince = 0;
  let lastMetadata = null;
  let lastError = "";
  while (Date.now() - started < TAB_CLEANUP_WORKER_TIMEOUT_MS) {
    const tab = await tabsGet(tabId);
    if (!tab?.id) return { ok: false, error: "The analysis worker tab was closed" };
    const url = String(tab.url || tab.pendingUrl || "");
    const onTarget = url.includes(`/chatbot/${id}`);
    if (onTarget && tab.status === "complete") {
      const response = await tabsSendMessage(tabId, { type: "DS_TAB_DIAGNOSTIC_READ_RENDERED_PROFILE", botId: id });
      if (response?.ok && response.metadata) {
        lastMetadata = response.metadata;
        const diag = response.metadata?._diagnostic || {};
        const kind = String(diag.responseKind || "");
        if (diag.challengeDetected || kind === "challenge") {
          if (!challengeSince) challengeSince = Date.now();
          if (Date.now() - challengeSince >= 4500) {
            await focusTabCleanupWorker();
            return {
              ok: false,
              verificationRequired: true,
              workerTabId: tabId,
              metadata: response.metadata,
              error: "SpicyChat verification is blocking the analysis worker. Complete verification in the opened worker tab, then resume analysis."
            };
          }
        } else {
          challengeSince = 0;
          if (kind === "rendered-profile") return { ok: true, metadata: response.metadata, workerTabId: tabId };
          if (kind === "rendered-profile-no-usable-data" && Date.now() - started > 8000) {
            return { ok: true, metadata: response.metadata, workerTabId: tabId };
          }
        }
      } else if (response?.error) {
        lastError = response.error;
      }
    }
    await tabCleanupDelay(400);
  }
  return {
    ok: !!lastMetadata,
    metadata: lastMetadata,
    workerTabId: tabId,
    error: lastError || "Timed out waiting for the rendered SpicyChat profile"
  };
}

async function enrichOpenBotMetadata(botId, options = {}) {
  const id = String(botId || "").trim();
  if (!id) return { ok: false, error: "Missing bot id" };

  const stored = await storageGet([TAB_CLEANUP_ENRICHMENT_KEY, "botArchive", "cardGreetingTokenCache"]);
  const store = diagnosticEnrichmentStore(stored[TAB_CLEANUP_ENRICHMENT_KEY]);
  const cached = store.meta[id];
  const now = Date.now();
  const successMaxAge = 7 * 24 * 60 * 60 * 1000;
  const missMaxAge = 60 * 60 * 1000;
  const cachedAge = cached?.checkedAt ? now - Number(cached.checkedAt) : Infinity;
  const cachedSuccess = cached?.status === "profile-fetched" && Number(cached?.successfulAt) > 0;
  const cacheFromWorker = /rendered profile worker/i.test(String(cached?.source || ""));
  if (!options.force && cachedSuccess && cachedAge < successMaxAge) {
    return { ok: true, cached: true, metadata: cached, error: "" };
  }
  if (!options.force && cacheFromWorker && cached?.checkedAt && cachedAge < missMaxAge && ["no-usable-data", "unavailable"].includes(cached?.status)) {
    return { ok: false, cached: true, metadata: cached, error: cached.lastError || cached.status || "No usable profile data" };
  }

  const local = diagnosticLocalProfileMetadata(stored, id);
  // When QoL already has enough grouping metadata locally, use it immediately
  // instead of opening a network worker just to rediscover the same information.
  if (!options.force && local.groupingStrength >= 2) {
    const metadata = {
      ...local.metadata,
      checkedAt: Date.now(),
      successfulAt: 0,
      status: "local-only",
      usefulFields: local.usefulFields,
      source: "Existing QoL profile/archive data",
      lastError: "",
      diagnostic: { responseKind: "local-only", localGroupingStrength: local.groupingStrength }
    };
    store.meta[id] = metadata;
    await storageSet({ [TAB_CLEANUP_ENRICHMENT_KEY]: store });
    return { ok: true, cached: true, localOnly: true, metadata, error: "" };
  }

  let workerResult;
  try {
    workerResult = await diagnosticReadWorkerProfile(id);
  } catch (error) {
    workerResult = { ok: false, error: error?.message || String(error) };
  }

  if (workerResult?.verificationRequired) {
    const raw = workerResult.metadata || {};
    const metadata = {
      id,
      ...local.metadata,
      checkedAt: Date.now(),
      successfulAt: 0,
      status: "verification-required",
      usefulFields: local.usefulFields,
      source: "Rendered profile worker tab",
      lastError: workerResult.error || "SpicyChat verification is required",
      diagnostic: {
        ...(raw?._diagnostic && typeof raw._diagnostic === "object" ? raw._diagnostic : {}),
        workerTabId: Number(workerResult.workerTabId) || 0
      }
    };
    store.meta[id] = metadata;
    await storageSet({ [TAB_CLEANUP_ENRICHMENT_KEY]: store });
    return { ok: false, cached: false, verificationRequired: true, workerTabId: Number(workerResult.workerTabId) || 0, metadata, error: metadata.lastError };
  }

  const rawMetadata = workerResult?.metadata || {};
  const responseKind = String(rawMetadata?._diagnostic?.responseKind || "");
  const workerUsefulFields = [];
  if (responseKind === "rendered-profile") {
    if (String(rawMetadata.name || "").trim() && diagnosticNamePenalty(rawMetadata.name, id) < 700) workerUsefulFields.push("name");
    if (String(rawMetadata.description || "").trim()) workerUsefulFields.push("description");
    if (String(rawMetadata.creator || "").trim()) workerUsefulFields.push("creator");
    if (diagnosticList(rawMetadata.tags).length) workerUsefulFields.push("tags");
  }

  const metadata = {
    id,
    name: String(rawMetadata.name || local.metadata.name || "").trim(),
    description: String(rawMetadata.description || local.metadata.description || "").trim().slice(0, 8000),
    creator: String(rawMetadata.creator || local.metadata.creator || "").replace(/^@/, "").trim(),
    tags: [...new Set([...diagnosticList(rawMetadata.tags), ...diagnosticList(local.metadata.tags)])].slice(0, 60),
    visibility: String(rawMetadata.visibility || local.metadata.visibility || "").trim(),
    image: String(rawMetadata.image || local.metadata.image || "").trim(),
    profileUrl: String(rawMetadata.profileUrl || local.metadata.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim(),
    checkedAt: Date.now(),
    successfulAt: 0,
    status: "no-usable-data",
    usefulFields: [...new Set([...workerUsefulFields, ...local.usefulFields])],
    source: "Rendered profile worker tab",
    lastError: "",
    diagnostic: {
      ...(rawMetadata?._diagnostic && typeof rawMetadata._diagnostic === "object" ? rawMetadata._diagnostic : {}),
      workerTabId: Number(workerResult?.workerTabId) || 0,
      workerUsefulFields,
      localUsefulFields: local.usefulFields
    }
  };

  if (workerUsefulFields.length) {
    metadata.status = "profile-fetched";
    metadata.successfulAt = metadata.checkedAt;
  } else if (local.groupingStrength > 0) {
    metadata.status = "local-only";
    metadata.lastError = workerResult?.error || "Rendered profile exposed no additional grouping fields; existing QoL metadata was retained";
  } else if (!workerResult?.ok) {
    metadata.status = "failed";
    metadata.lastError = workerResult?.error || "Could not read the rendered bot profile";
  } else {
    metadata.status = "no-usable-data";
    metadata.lastError = `Rendered profile returned ${responseKind || "a page"}, but no usable grouping fields were exposed`;
  }

  store.meta[id] = metadata;
  await storageSet({ [TAB_CLEANUP_ENRICHMENT_KEY]: store });
  return {
    ok: ["profile-fetched", "local-only"].includes(metadata.status),
    cached: false,
    localOnly: metadata.status === "local-only",
    metadata,
    error: metadata.lastError
  };
}

async function collectOpenSpicyChatTabDiagnostic() {
  const allTabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const tabs = allTabs.filter(tab => !tabCleanupWorkerTabIds.has(Number(tab?.id)));
  const storage = await storageGet([
    "settings", "favoriteBots", "laterBots", "recentlySeenBots", "botOrganization",
    "openedChatMeta", "botArchive", "botAvailability", "cardGreetingTokenCache", TAB_CLEANUP_ENRICHMENT_KEY
  ]);
  const favoriteIds = diagnosticStoreIds(storage.favoriteBots);
  const laterIds = diagnosticStoreIds(storage.laterBots);
  const botMap = new Map();
  const otherTabs = [];
  const tagCounts = new Map();
  const creatorCounts = new Map();
  const folderCounts = new Map();
  const personalTagCounts = new Map();
  let snapshotAvailable = 0;
  let discarded = 0;
  let pinned = 0;

  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl || "";
    const type = diagnosticPageType(url);
    const id = diagnosticBotId(url);
    if (tab.discarded) discarded += 1;
    if (tab.pinned) pinned += 1;

    let snapshot = null;
    // Do not wake discarded tabs just to build a diagnostic report.
    if (tab.id && !tab.discarded && tab.status === "complete") {
      snapshot = await tabsSendMessage(tab.id, { type: "DS_TAB_DIAGNOSTIC_SNAPSHOT" });
      if (snapshot?.ok) snapshotAvailable += 1;
    }

    const tabInfo = {
      tabId: Number(tab.id) || 0,
      windowId: Number(tab.windowId) || 0,
      index: Number(tab.index) || 0,
      active: !!tab.active,
      pinned: !!tab.pinned,
      audible: !!tab.audible,
      muted: !!tab.mutedInfo?.muted,
      discarded: !!tab.discarded,
      status: tab.status || "",
      lastAccessed: Number(tab.lastAccessed) || 0,
      url,
      title: tab.title || "",
      pageType: snapshot?.pageType || type,
      duplicateKey: duplicateTabKey(url, { ...DUPLICATE_TAB_DEFAULTS, duplicateTabChats: true, duplicateTabHome: true, duplicateTabProfiles: true }) || "",
      renderedMessageCount: Number(snapshot?.renderedMessageCount) || 0,
      contentSnapshot: snapshot?.ok ? "available" : (tab.discarded ? "skipped-discarded" : "unavailable")
    };

    const botId = String(snapshot?.botId || id || "").trim();
    if (!botId) {
      otherTabs.push(tabInfo);
      continue;
    }

    const organizer = diagnosticMeta(storage.botOrganization, botId) || {};
    const archive = diagnosticMeta(storage.botArchive, botId) || {};
    const availability = diagnosticMeta(storage.botAvailability, botId) || {};
    const profileCache = diagnosticMeta(storage.cardGreetingTokenCache, botId) || {};
    const enrichment = diagnosticMeta(storage[TAB_CLEANUP_ENRICHMENT_KEY], botId) || {};
    const recent = diagnosticRecent(storage.recentlySeenBots, botId) || {};
    const opened = diagnosticMeta(storage.openedChatMeta, botId) || {};
    const favoriteMeta = diagnosticMeta(storage.favoriteBots, botId) || {};
    const laterMeta = diagnosticMeta(storage.laterBots, botId) || {};

    const titleName = diagnosticTitleBotName(tab.title || "");
    const nameCandidates = [
      { value: snapshot?.botName, source: "loaded page", score: 110 },
      { value: titleName, source: "browser tab title", score: 105 },
      { value: enrichment?.name, source: "profile enrichment", score: 100 },
      { value: favoriteMeta?.name, source: "Favorite history", score: 82 },
      { value: laterMeta?.name, source: "Later", score: 80 },
      { value: archive?.fields?.name, source: "Local Bot Archive", score: 72 },
      { value: archive?.name, source: "Local Bot Archive", score: 70 }
    ];
    const names = [...new Set(nameCandidates.map(item => String(item.value || "").trim()).filter(Boolean))];
    const creators = [...new Set([
      snapshot?.creator?.handle,
      snapshot?.creator?.text,
      enrichment?.creator,
      favoriteMeta?.creator,
      laterMeta?.creator,
      archive?.creator,
      archive?.fields?.creator
    ].map(value => String(value || "").replace(/^@/, "").trim()).filter(Boolean))];
    const tags = [...new Set([
      ...diagnosticList(snapshot?.visibleTags),
      ...diagnosticList(enrichment?.tags),
      ...diagnosticList(profileCache?.tags),
      ...diagnosticList(archive?.fields?.tags)
    ])];
    const folders = diagnosticList(organizer?.collections || organizer?.folders);
    const personalTags = diagnosticList(organizer?.tags);

    let entry = botMap.get(botId);
    if (!entry) {
      entry = {
        id: botId,
        names: [],
        creators: [],
        tags: [],
        _nameCandidates: [],
        identity: {
          bestName: "",
          nameSource: "",
          bestCreator: "",
          creatorSource: "",
          description: "",
          visibility: "",
          image: "",
          enrichedAt: 0
        },
        local: {
          favoriteHistory: favoriteIds.has(botId),
          later: laterIds.has(botId),
          folders,
          personalTags,
          creatorStatus: String(organizer?.status || ""),
          hasPrivateNote: !!String(organizer?.note || "").trim(),
          recentlySeenAt: Number(recent?.lastSeenAt || recent?.seenAt || recent?.at) || 0,
          recentlySeenCount: Number(recent?.visits || recent?.count) || 0,
          openedAt: Number(opened?.lastOpenedAt || opened?.openedAt || opened?.at) || 0,
          savedLocalCopy: !!Object.keys(archive || {}).length,
          archiveCoverage: Array.isArray(archive?.coverage) ? archive.coverage : [],
          availabilityStatus: String(availability?.status || "")
        },
        profileSignals: {
          checkedAt: Number(profileCache?.checkedAt) || 0,
          fields: profileCache?.fields && typeof profileCache.fields === "object" ? profileCache.fields : {},
          enrichedAt: Number(enrichment?.successfulAt) || 0,
          enrichmentCheckedAt: Number(enrichment?.checkedAt) || 0,
          enrichmentStatus: String(enrichment?.status || "not-checked"),
          usefulFields: diagnosticList(enrichment?.usefulFields),
          enrichmentSource: String(enrichment?.source || ""),
          enrichmentError: String(enrichment?.lastError || ""),
          enrichmentDiagnostic: enrichment?.diagnostic && typeof enrichment.diagnostic === "object" ? enrichment.diagnostic : {}
        },
        tabs: []
      };
      botMap.set(botId, entry);
    }

    entry.names = [...new Set([...entry.names, ...names])];
    entry.creators = [...new Set([...entry.creators, ...creators])];
    entry.tags = [...new Set([...entry.tags, ...tags])];
    entry._nameCandidates.push(...nameCandidates);
    if (!entry.identity.description) {
      entry.identity.description = String(
        enrichment?.description ||
        archive?.fields?.description ||
        profileCache?.fields?.description?.text ||
        profileCache?.fields?.description ||
        ""
      ).trim();
    }
    if (!entry.identity.visibility) entry.identity.visibility = String(enrichment?.visibility || archive?.fields?.visibility || archive?.visibility || "").trim();
    if (!entry.identity.image) entry.identity.image = String(enrichment?.image || archive?.fields?.image || archive?.image || "").trim();
    entry.identity.enrichedAt = Math.max(Number(entry.identity.enrichedAt) || 0, Number(enrichment?.successfulAt) || 0);
    entry.tabs.push(tabInfo);
  }

  const bots = [...botMap.values()].sort((a, b) => {
    const aLast = Math.max(0, ...a.tabs.map(tab => Number(tab.lastAccessed) || 0));
    const bLast = Math.max(0, ...b.tabs.map(tab => Number(tab.lastAccessed) || 0));
    return bLast - aLast || String(a.names[0] || a.id).localeCompare(String(b.names[0] || b.id));
  });

  for (const bot of bots) {
    const bestName = diagnosticBestCandidate(bot._nameCandidates, bot.id);
    bot.identity.bestName = bestName.value || diagnosticTitleBotName(bot.tabs?.[0]?.title || "") || bot.names.find(name => !diagnosticNamePenalty(name, bot.id)) || "";
    bot.identity.nameSource = bestName.source || (bot.identity.bestName ? "available metadata" : "");
    bot.identity.bestCreator = String(bot.creators[0] || "").trim();
    bot.identity.creatorSource = bot.identity.bestCreator
      ? (bot.profileSignals.enrichedAt ? "profile enrichment / local metadata" : "local metadata")
      : "";
    delete bot._nameCandidates;
  }

  for (const bot of bots) {
    diagnosticIncrement(tagCounts, bot.tags);
    diagnosticIncrement(creatorCounts, bot.creators.slice(0, 1));
    diagnosticIncrement(folderCounts, bot.local.folders);
    diagnosticIncrement(personalTagCounts, bot.local.personalTags);
  }

  const duplicateGroups = new Map();
  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl || "";
    const key = duplicateTabKey(url, { ...DUPLICATE_TAB_DEFAULTS, duplicateTabChats: true, duplicateTabHome: true, duplicateTabProfiles: true });
    if (!key) continue;
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, 0);
    duplicateGroups.set(key, duplicateGroups.get(key) + 1);
  }

  return {
    format: "spicychat-qol-open-tab-diagnostic",
    version: 3,
    generatedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest?.().version || "unknown",
    privacy: "Contains only open SpicyChat tab metadata and non-secret QoL organization/profile signals. Chat message text, private-note contents, API keys, and non-SpicyChat tabs are excluded.",
    summary: {
      spicychatTabs: tabs.length,
      uniqueBots: bots.length,
      botTabs: bots.reduce((sum, bot) => sum + bot.tabs.length, 0),
      otherSpicyChatTabs: otherTabs.length,
      duplicateGroups: [...duplicateGroups.values()].filter(count => count > 1).length,
      duplicateExtraTabs: [...duplicateGroups.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      pinnedTabs: pinned,
      discardedTabs: discarded,
      contentSnapshotsAvailable: snapshotAvailable,
      botsWithName: bots.filter(bot => bot.names.length).length,
      botsWithResolvedName: bots.filter(bot => bot.identity?.bestName).length,
      botsWithCreator: bots.filter(bot => bot.creators.length).length,
      botsWithTags: bots.filter(bot => bot.tags.length).length,
      botsWithDescription: bots.filter(bot => bot.identity?.description).length,
      botsWithEnrichedProfile: bots.filter(bot => Number(bot.identity?.enrichedAt) > 0).length,
      botsWithLocalProfileData: bots.filter(bot => String(bot.profileSignals?.enrichmentStatus || "") === "local-only").length,
      enrichmentStatusCounts: bots.reduce((counts, bot) => {
        const status = String(bot.profileSignals?.enrichmentStatus || "not-checked");
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {}),
      botsWithFolders: bots.filter(bot => bot.local.folders.length).length,
      botsWithPersonalTags: bots.filter(bot => bot.local.personalTags.length).length
    },
    duplicateGuard: {
      enabled: !!storage.settings?.duplicateTabGuardEnabled,
      keepMode: storage.settings?.duplicateTabKeepMode === "existing" ? "existing" : "new",
      chats: storage.settings?.duplicateTabChats !== false,
      home: !!storage.settings?.duplicateTabHome,
      profiles: !!storage.settings?.duplicateTabProfiles
    },
    topicSignals: {
      tags: diagnosticTopCounts(tagCounts),
      creators: diagnosticTopCounts(creatorCounts),
      folders: diagnosticTopCounts(folderCounts),
      personalTags: diagnosticTopCounts(personalTagCounts)
    },
    windows: [...new Set(tabs.map(tab => Number(tab.windowId)).filter(Boolean))].map(windowId => ({
      windowId,
      tabCount: tabs.filter(tab => Number(tab.windowId) === windowId).length,
      botTabCount: bots.reduce((sum, bot) => sum + bot.tabs.filter(tab => Number(tab.windowId) === windowId).length, 0)
    })).sort((a, b) => b.botTabCount - a.botTabCount || a.windowId - b.windowId),
    bots,
    otherTabs
  };
}

function autoAfkProtectedTab(tab, action, settings) {
  if (!tab) return true;
  if (settings.autoAfkProtectActive !== false && tab.active) return true;

  // Safety rules from the tab-discard design: never touch pinned or audible tabs.
  if (tab.pinned || tab.audible) return true;

  // Respect the browser/user decision that a tab is not eligible for automatic discard.
  if ((action || "discard") === "discard" && tab.autoDiscardable === false) return true;

  return false;
}

function autoAfkLastActivity(tab, activity) {
  const stored = Number(activity?.[String(tab?.id)]);
  const browserLastAccessed = Number(tab?.lastAccessed);

  let latest = Number.isFinite(stored) ? stored : 0;
  if (Number.isFinite(browserLastAccessed)) latest = Math.max(latest, browserLastAccessed);

  return latest || Date.now();
}

async function getAutoAfkSettings() {
  const result = await storageGet(["settings"]);
  return {
    ...AUTO_AFK_DEFAULTS,
    ...(result.settings || {})
  };
}

async function getAutoAfkActivity() {
  const result = await storageGet([AUTO_AFK_ACTIVITY_KEY]);
  const value = result[AUTO_AFK_ACTIVITY_KEY];
  return value && typeof value === "object" ? value : {};
}

async function markAutoAfkActivity(tabId, timestamp = Date.now()) {
  if (!tabId) return;
  const activity = await getAutoAfkActivity();
  activity[String(tabId)] = Number(timestamp) || Date.now();
  await storageSet({ [AUTO_AFK_ACTIVITY_KEY]: activity });
}

async function removeAutoAfkActivity(tabId) {
  if (!tabId) return;
  const activity = await getAutoAfkActivity();
  const key = String(tabId);
  if (!(key in activity)) return;
  delete activity[key];
  await storageSet({ [AUTO_AFK_ACTIVITY_KEY]: activity });
}

async function syncAutoAfkTabs() {
  const tabs = await tabsQuery({
    url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"]
  });
  const activity = await getAutoAfkActivity();
  const now = Date.now();
  const existingIds = new Set();
  let changed = false;

  for (const tab of tabs) {
    if (!tab?.id) continue;

    const key = String(tab.id);
    existingIds.add(key);

    if (!Number.isFinite(Number(activity[key]))) {
      const browserLastAccessed = Number(tab.lastAccessed);
      activity[key] = Number.isFinite(browserLastAccessed) && browserLastAccessed > 0
        ? Math.min(now, browserLastAccessed)
        : now;
      changed = true;
    }
  }

  for (const key of Object.keys(activity)) {
    if (!existingIds.has(key)) {
      delete activity[key];
      changed = true;
    }
  }

  if (changed) await storageSet({ [AUTO_AFK_ACTIVITY_KEY]: activity });
  return activity;
}

async function configureAutoAfkAlarm(sync = false) {
  const settings = await getAutoAfkSettings();

  if (settings.enabled === false || !settings.autoAfkEnabled) {
    chrome.alarms.clear(AUTO_AFK_ALARM);
    return;
  }

  if (sync) await syncAutoAfkTabs();

  chrome.alarms.create(AUTO_AFK_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: AUTO_AFK_SCAN_MINUTES
  });

  if (sync) await runAutoAfkScan();
}

async function writeAutoAfkStatus(status) {
  try {
    await storageSet({ [AUTO_AFK_STATUS_KEY]: status });
  } catch {}
}

async function runAutoAfkScan() {
  const settings = await getAutoAfkSettings();
  const now = Date.now();
  const hours = Math.min(720, Math.max(1, Number(settings.autoAfkHours) || 12));
  const action = settings.autoAfkAction || "discard";
  const summary = {
    at: now,
    enabled: settings.enabled !== false && !!settings.autoAfkEnabled,
    hours,
    action,
    monitored: 0,
    protected: 0,
    recent: 0,
    eligible: 0,
    cleaned: 0,
    alreadyDiscarded: 0,
    failed: 0,
    nextDueAt: null,
    errors: []
  };

  if (!summary.enabled) {
    await writeAutoAfkStatus(summary);
    return summary;
  }

  const cutoff = now - hours * 60 * 60 * 1000;
  const tabs = await tabsQuery({
    url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"]
  });
  const activity = await getAutoAfkActivity();
  let activityChanged = false;

  for (const tab of tabs) {
    if (!tab?.id || !autoAfkApplies(tab.url, settings)) continue;
    summary.monitored += 1;

    const key = String(tab.id);
    const browserLastAccessed = Number(tab.lastAccessed);
    const storedBefore = Number(activity[key]);

    if (!Number.isFinite(storedBefore)) {
      activity[key] = Number.isFinite(browserLastAccessed) && browserLastAccessed > 0
        ? Math.min(now, browserLastAccessed)
        : now;
      activityChanged = true;
    }

    const lastActive = autoAfkLastActivity(tab, activity);

    // Chrome/Brave lastAccessed is the last time the tab became active. Keep it
    // as a browser-level fallback in case a content-script activity event was missed.
    if (!Number.isFinite(storedBefore) || lastActive > Number(activity[key] || 0)) {
      activity[key] = lastActive;
      activityChanged = true;
    }

    if (autoAfkProtectedTab(tab, action, settings)) {
      summary.protected += 1;
      continue;
    }

    if (action === "discard" && tab.discarded) {
      summary.alreadyDiscarded += 1;
      continue;
    }

    if (lastActive > cutoff) {
      summary.recent += 1;
      const dueAt = lastActive + hours * 60 * 60 * 1000;
      if (!summary.nextDueAt || dueAt < summary.nextDueAt) summary.nextDueAt = dueAt;
      continue;
    }

    summary.eligible += 1;

    if (action === "close") {
      const result = await tabsRemove(tab.id);
      if (result.ok) {
        summary.cleaned += 1;
        delete activity[key];
        activityChanged = true;
      } else {
        summary.failed += 1;
        if (result.error && summary.errors.length < 3) summary.errors.push(result.error);
      }
      continue;
    }

    const result = await tabsDiscard(tab.id);
    if (result.ok) {
      summary.cleaned += 1;
    } else {
      summary.failed += 1;
      if (result.error && summary.errors.length < 3) summary.errors.push(result.error);
    }
  }

  // Remove activity records for tabs that no longer exist.
  const existingIds = new Set(tabs.filter(tab => tab?.id).map(tab => String(tab.id)));
  for (const key of Object.keys(activity)) {
    if (!existingIds.has(key)) {
      delete activity[key];
      activityChanged = true;
    }
  }

  if (activityChanged) await storageSet({ [AUTO_AFK_ACTIVITY_KEY]: activity });
  await writeAutoAfkStatus(summary);
  return summary;
}

async function rememberReleaseNotice(details = {}) {
  const version = chrome.runtime.getManifest?.().version || "";
  const reason = String(details.reason || "");
  const previousVersion = String(details.previousVersion || "");
  if (!version || !["install", "update"].includes(reason)) return;

  const existing = await storageGet([LAST_SEEN_VERSION_KEY, INSTALLED_VERSION_KEY]);
  if (reason === "update" && existing[INSTALLED_VERSION_KEY] === version) return;

  const payload = {
    [INSTALLED_VERSION_KEY]: version,
    [RELEASE_NOTICE_KEY]: {
      reason,
      version,
      previousVersion,
      at: Date.now()
    }
  };

  // Fresh installs do not need every historical setting marked as new.
  // On the first update after this system is introduced, start badges from
  // the version the user actually came from.
  if (!existing[LAST_SEEN_VERSION_KEY]) {
    payload[LAST_SEEN_VERSION_KEY] = reason === "update" && previousVersion
      ? previousVersion
      : version;
  }

  await storageSet(payload);
}

async function rememberOptionsSourceTab(tabId) {
  if (!tabId) return false;
  const tab = await tabsGet(tabId);
  if (!tab || !isSpicyChatUrl(tab.url)) return false;
  await storageSet({ [OPTIONS_SOURCE_TAB_KEY]: tabId });
  return true;
}

async function getOptionsSourceTab() {
  const stored = await storageGet([OPTIONS_SOURCE_TAB_KEY]);
  const storedId = Number(stored[OPTIONS_SOURCE_TAB_KEY]);

  if (Number.isFinite(storedId)) {
    const tab = await tabsGet(storedId);
    if (tab && isSpicyChatUrl(tab.url)) return tab;
  }

  const tabs = await tabsQuery({
    url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"]
  });

  const candidates = tabs
    .filter(tab => tab?.id)
    .sort((a, b) => {
      if (!!a.active !== !!b.active) return a.active ? -1 : 1;
      return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
    });

  const tab = candidates[0] || null;
  if (tab?.id) await storageSet({ [OPTIONS_SOURCE_TAB_KEY]: tab.id });
  return tab;
}

function sendTabMessage(tabId, message) {
  return new Promise(resolve => {
    try { chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(response || null);
    }); } catch { resolve(null); }
  });
}

async function getReachableDiagnosticContext() {
  const stored = await storageGet([OPTIONS_SOURCE_TAB_KEY]);
  const storedId = Number(stored[OPTIONS_SOURCE_TAB_KEY]);
  const tabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const candidates = tabs.filter(tab => tab?.id).sort((a, b) => {
    if (Number(a.id) === storedId && Number(b.id) !== storedId) return -1;
    if (Number(b.id) === storedId && Number(a.id) !== storedId) return 1;
    if (!!a.active !== !!b.active) return a.active ? -1 : 1;
    return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
  });
  for (const tab of candidates) {
    const pageDiagnostics = await sendTabMessage(tab.id, { type: "DS_GET_PAGE_DIAGNOSTICS" });
    if (!pageDiagnostics) continue;
    await storageSet({ [OPTIONS_SOURCE_TAB_KEY]: tab.id });
    return { ok: true, runtimeAvailable: true, url: tab.url || "", title: tab.title || "", pageDiagnostics, tabId: tab.id };
  }
  const fallback = candidates[0] || null;
  return { ok: !!fallback, runtimeAvailable: false, url: fallback?.url || "", title: fallback?.title || "", pageDiagnostics: null, tabId: fallback?.id || 0 };
}

async function relayQuickPanelStateToOptions(message) {
  const tab = await getOptionsSourceTab();
  if (!tab?.id) return { ok: false };

  return new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, message, response => {
      if (chrome.runtime.lastError || !response?.ok) {
        resolve({ ok: false });
        return;
      }

      resolve({
        ...response,
        ok: true,
        tabId: tab.id,
        tabLabel: tab.title || "the current SpicyChat tab"
      });
    });
  });
}


const DEEPL_API_KEY_STORAGE_KEY = "deeplApiKey";

function storageLocalGet(keys) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(keys, result => resolve(result || {}));
    } catch {
      resolve({});
    }
  });
}

function deeplBaseUrlForKey(key) {
  return String(key || "").trim().toLowerCase().endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";
}

async function getDeepLKey() {
  const result = await storageLocalGet([DEEPL_API_KEY_STORAGE_KEY]);
  return String(result[DEEPL_API_KEY_STORAGE_KEY] || "").trim();
}

async function deeplRequest(path, { method = "GET", body = null } = {}) {
  const key = await getDeepLKey();
  if (!key) throw new Error("No DeepL API key is saved. Open QoL Settings → Chat UI → Translation.");

  const response = await fetch(`${deeplBaseUrlForKey(key)}${path}`, {
    method,
    headers: {
      "Authorization": `DeepL-Auth-Key ${key}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  let data = null;
  try { data = await response.json(); } catch {}

  if (!response.ok) {
    const detail = data?.message || data?.detail || `DeepL returned HTTP ${response.status}.`;
    throw new Error(detail);
  }

  return data || {};
}

async function deeplTranslate(message) {
  const text = String(message?.text || "").trim();
  const targetLang = String(message?.targetLang || "EN-US").trim().toUpperCase();
  const context = String(message?.context || "").trim();

  if (!text) throw new Error("Nothing to translate.");
  if (text.length > 30000) throw new Error("That message is too long to translate in one request.");

  const body = {
    text: [text],
    target_lang: targetLang
  };
  if (context) body.context = context.slice(0, 4000);

  const data = await deeplRequest("/v2/translate", { method: "POST", body });
  const first = Array.isArray(data.translations) ? data.translations[0] : null;
  if (!first?.text) throw new Error("DeepL did not return a translation.");

  return {
    text: first.text,
    detectedSourceLanguage: first.detected_source_language || ""
  };
}

async function deeplTranslateBatch(message) {
  const texts = Array.isArray(message?.texts)
    ? message.texts.map(value => String(value || "").trim()).filter(Boolean).slice(0, 50)
    : [];
  const targetLang = String(message?.targetLang || "EN-US").trim().toUpperCase();
  const context = String(message?.context || "").trim();
  if (!texts.length) throw new Error("Nothing to translate.");
  if (texts.some(text => text.length > 30000)) throw new Error("One of those messages is too long to translate in one request.");

  const body = { text: texts, target_lang: targetLang };
  if (context) body.context = context.slice(0, 4000);
  const data = await deeplRequest("/v2/translate", { method: "POST", body });
  const translations = Array.isArray(data.translations) ? data.translations : [];
  if (translations.length !== texts.length) throw new Error("DeepL returned an incomplete translation batch.");
  return translations.map(item => ({
    text: item?.text || "",
    detectedSourceLanguage: item?.detected_source_language || ""
  }));
}

async function reopenTabSessionItems(items, mode = "current") {
  const cleaned = (Array.isArray(items) ? items : []).map(item => ({
    url: String(item?.url || "").trim(),
    windowId: Number(item?.windowId) || 0,
    index: Number(item?.index) || 0
  })).filter(item => /^https:\/\/(?:www\.)?spicychat\.ai\//i.test(item.url));
  if (!cleaned.length) return { opened: 0, failed: 0, windows: 0, skippedExisting: 0, openedUrls: [], skippedExistingUrls: [], failedUrls: [], errors: [] };

  const normalize = url => {
    try {
      const parsed = new URL(String(url || ""));
      parsed.hostname = "spicychat.ai";
      parsed.hash = "";
      const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
      return `${parsed.protocol}//${parsed.hostname}${pathname}${parsed.search}`;
    } catch { return String(url || "").replace(/#.*$/, ""); }
  };

  const existingTabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const existingUrls = new Set(existingTabs.map(tab => normalize(tab.url || tab.pendingUrl || "")).filter(Boolean));
  const skippedExistingItems = cleaned.filter(item => existingUrls.has(normalize(item.url)));
  const pending = cleaned.filter(item => !existingUrls.has(normalize(item.url)));
  const skippedExisting = skippedExistingItems.length;
  if (!pending.length) return { opened: 0, failed: 0, windows: 0, skippedExisting, openedUrls: [], skippedExistingUrls: skippedExistingItems.map(item => item.url), failedUrls: [], errors: [] };

  const errors = [];
  const openedUrls = [];
  const failedUrls = [];
  let opened = 0;
  let windows = 0;
  const createIntoWindow = async (windowId, list) => {
    for (const item of list) {
      const createProperties = { url: item.url, active: false };
      if (Number.isFinite(Number(windowId)) && Number(windowId) > 0) createProperties.windowId = Number(windowId);
      const result = await tabsCreate(createProperties);
      if (result.ok) {
        opened += 1;
        openedUrls.push(item.url);
      } else {
        failedUrls.push(item.url);
        errors.push(result.error || `Could not reopen ${item.url}`);
      }
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  };

  if (mode === "new-window") {
    const first = pending[0];
    const created = await windowsCreate({ url: first.url, focused: true });
    if (!created.ok) return { opened: 0, failed: pending.length, windows: 0, skippedExisting, openedUrls: [], skippedExistingUrls: skippedExistingItems.map(item => item.url), failedUrls: pending.map(item => item.url), errors: [created.error || "Could not create a new window"] };
    opened = 1;
    openedUrls.push(first.url);
    windows = 1;
    await createIntoWindow(created.window?.id, pending.slice(1));
  } else if (mode === "saved-windows") {
    const groups = new Map();
    for (const item of pending) {
      const key = item.windowId || -1;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.index - b.index);
      const first = list[0];
      const created = await windowsCreate({ url: first.url, focused: windows === 0 });
      if (!created.ok) {
        for (const item of list) failedUrls.push(item.url);
        errors.push(created.error || "Could not create a restored window");
        continue;
      }
      opened += 1;
      openedUrls.push(first.url);
      windows += 1;
      await createIntoWindow(created.window?.id, list.slice(1));
    }
  } else {
    await createIntoWindow(undefined, pending);
  }

  return { opened, failed: failedUrls.length, windows, skippedExisting, openedUrls, skippedExistingUrls: skippedExistingItems.map(item => item.url), failedUrls, errors: errors.slice(0, 20) };
}

function tabSessionExactUrlKey(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!/(^|\.)spicychat\.ai$/i.test(parsed.hostname)) return "";
    parsed.hostname = "spicychat.ai";
    parsed.hash = "";
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.hostname}${pathname}${parsed.search}`;
  } catch {
    return "";
  }
}

async function matchOpenTabSessionItems(items, protectPinned = true) {
  const requested = (Array.isArray(items) ? items : [])
    .map(item => ({ ...item, key: tabSessionExactUrlKey(item?.url) }))
    .filter(item => item.key);
  const wanted = new Set(requested.map(item => item.key));
  const openTabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const matches = [];
  let pinnedSkipped = 0;
  const matchedKeys = new Set();
  for (const tab of openTabs) {
    if (!tab?.id) continue;
    const url = String(tab.url || tab.pendingUrl || "");
    const key = tabSessionExactUrlKey(url);
    if (!key || !wanted.has(key)) continue;
    matchedKeys.add(key);
    if (protectPinned && tab.pinned) {
      pinnedSkipped += 1;
      continue;
    }
    matches.push({
      tabId: tab.id,
      url,
      title: String(tab.title || ""),
      windowId: Number(tab.windowId) || 0,
      index: Number(tab.index) || 0,
      active: !!tab.active,
      pinned: !!tab.pinned,
      discarded: !!tab.discarded,
      lastAccessed: Number(tab.lastAccessed) || 0
    });
  }
  const missing = requested.filter(item => !matchedKeys.has(item.key)).length;
  return { matches, pinnedSkipped, missing };
}

async function closeMatchedTabSessionItems(tabIds, protectPinned = true) {
  const ids = [...new Set((Array.isArray(tabIds) ? tabIds : []).map(Number).filter(Number.isFinite))];
  let closed = 0;
  let pinnedSkipped = 0;
  let failed = 0;
  const errors = [];
  for (const tabId of ids) {
    const tab = await tabsGet(tabId);
    if (!tab) {
      failed += 1;
      continue;
    }
    if (protectPinned && tab.pinned) {
      pinnedSkipped += 1;
      continue;
    }
    const result = await tabsRemove(tabId);
    if (result.ok) closed += 1;
    else {
      failed += 1;
      if (result.error) errors.push(result.error);
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return { closed, pinnedSkipped, failed, errors: errors.slice(0, 20) };
}


function wikiOriginPattern(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol)) return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

function hasOptionalOrigin(origin) {
  return new Promise(resolve => {
    try {
      chrome.permissions.contains({ origins: [origin] }, ok => {
        if (chrome.runtime.lastError) resolve(false);
        else resolve(!!ok);
      });
    } catch { resolve(false); }
  });
}

function requestOptionalOrigin(origin) {
  return new Promise(resolve => {
    try {
      chrome.permissions.request({ origins: [origin] }, ok => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message || "Could not request site access." });
        else resolve({ ok: !!ok, error: ok ? "" : "Site access was not granted." });
      });
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
    }
  });
}

async function fetchWikiPageSource(value) {
  const origin = wikiOriginPattern(value);
  if (!origin) return { ok: false, error: "Only http:// and https:// wiki/article URLs are supported." };
  if (!await hasOptionalOrigin(origin)) return { ok: false, requiresPermission: true, origin };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(String(value), {
      method: "GET",
      redirect: "follow",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: { "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.2" }
    });
    if (!response.ok) return { ok: false, error: `Wiki page returned HTTP ${response.status}.`, status: response.status };
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if (type && !/(text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml)/i.test(type)) {
      return { ok: false, error: `That URL returned ${type.split(";")[0] || "a non-text file"}, not a wiki/article page.` };
    }
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > 5_000_000) return { ok: false, error: "That page is larger than 5 MB. Try a more specific article or paste the article text instead." };
    const html = await response.text();
    if (!html || html.length < 20) return { ok: false, error: "The page returned no readable content." };
    if (html.length > 5_000_000) return { ok: false, error: "That page is larger than 5 MB. Try a more specific article or paste the article text instead." };
    return {
      ok: true,
      html,
      finalUrl: response.url || String(value),
      contentType: type,
      status: response.status
    };
  } catch (error) {
    const message = error?.name === "AbortError" ? "Fetching that page timed out after 20 seconds." : (error?.message || String(error));
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeExactMessageBotId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id) ? id : "";
}

async function fetchExactMessageCounts(message) {
  const rawIds = Array.isArray(message?.ids) ? message.ids : [];
  const ids = [...new Set(rawIds.map(normalizeExactMessageBotId).filter(Boolean))].slice(0, EXACT_MESSAGE_MAX_IDS);
  if (!ids.length) return { ok: true, counts: [], missing: [] };

  const searches = ids.map(id => ({
    collection: EXACT_MESSAGE_TYPESENSE_COLLECTION,
    q: "*",
    query_by: EXACT_MESSAGE_TYPESENSE_QUERY_BY,
    filter_by: `application_ids:spicychat && character_id:=${id}`,
    include_fields: "character_id,num_messages",
    per_page: 1
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(EXACT_MESSAGE_TYPESENSE_URL, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "Content-Type": "text/plain",
        "X-TYPESENSE-API-KEY": EXACT_MESSAGE_TYPESENSE_KEY
      },
      body: JSON.stringify({ searches })
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: `Typesense returned HTTP ${response.status}.`, counts: [] };
    }

    const data = await response.json();
    const counts = [];
    const found = new Set();
    const results = Array.isArray(data?.results) ? data.results : [];
    for (let index = 0; index < results.length; index += 1) {
      const requestedId = ids[index];
      const result = results[index];
      const hit = Array.isArray(result?.hits) ? result.hits[0] : null;
      const doc = hit?.document && typeof hit.document === "object" ? hit.document : null;
      const id = normalizeExactMessageBotId(doc?.character_id || requestedId);
      const count = Number(doc?.num_messages);
      if (!id || !Number.isFinite(count) || count < 0) continue;
      counts.push({ id, count: Math.round(count) });
      found.add(requestedId);
    }

    return {
      ok: true,
      counts,
      missing: ids.filter(id => !found.has(id))
    };
  } catch (error) {
    return {
      ok: false,
      status: error?.name === "AbortError" ? "timeout" : "network-error",
      error: error?.name === "AbortError" ? "Typesense lookup timed out." : (error?.message || String(error)),
      counts: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function setLorebookExportJob(token, value) {
  const safe = String(token || "").trim().slice(0, 140);
  if (!safe) return false;
  return new Promise(resolve => {
    chrome.storage.local.set({ [`dsLorebookExportJob:${safe}`]: value }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function runLorebookExportHelperTab(tabId, message) {
  const token = String(message?.token || "").trim().slice(0, 140);
  const target = String(message?.target || "").trim().slice(0, 20);
  const id = String(message?.id || "").trim().slice(0, 200);
  if (!Number.isFinite(Number(tabId)) || !token || !["details", "entries"].includes(target)) return;

  const deadline = Date.now() + 90_000;
  let response = null;
  try {
    while (Date.now() < deadline) {
      const tab = await tabsGet(Number(tabId));
      if (!tab) throw new Error("Lorebook export helper tab closed before collection finished.");
      response = await tabsSendMessage(Number(tabId), {
        type: "DS_LOREBOOK_EXPORT_RUN",
        token,
        target,
        id
      });
      if (response) break;
      await new Promise(resolve => setTimeout(resolve, 350));
    }

    if (!response) throw new Error("QoL could not start the Lorebook export helper in the other tab.");
    if (!response.ok) throw new Error(response.error || "Lorebook export helper failed.");
  } catch (error) {
    await setLorebookExportJob(token, {
      status: "error",
      id,
      target,
      error: error?.message || String(error),
      finishedAt: Date.now()
    });
  } finally {
    await new Promise(resolve => setTimeout(resolve, 300));
    await tabsRemove(Number(tabId)).catch?.(() => null);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;


  if (message?.type === "DS_DOWNLOAD_TEXT_FILE") {
    const text = String(message.text ?? "");
    const filename = String(message.filename || "spicychat-qol-export.json")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 180) || "spicychat-qol-export.json";
    const mimeType = String(message.mimeType || "application/octet-stream").slice(0, 120);
    if (!text || text.length > 12_000_000) {
      sendResponse({ ok: false, error: "Export payload is empty or too large." });
      return false;
    }
    if (!chrome.permissions?.contains || !chrome.downloads?.download) {
      sendResponse({ ok: false, status: "download-manager-unavailable" });
      return false;
    }
    chrome.permissions.contains({ permissions: ["downloads"] }, allowed => {
      if (chrome.runtime.lastError || !allowed) {
        sendResponse({ ok: false, status: "downloads-permission-not-granted" });
        return;
      }
      try {
        const bytes = new TextEncoder().encode(text);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const url = `data:${mimeType};base64,${btoa(binary)}`;
        chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false }, id => {
          if (chrome.runtime.lastError || !Number.isFinite(Number(id))) {
            sendResponse({ ok: false, error: chrome.runtime.lastError?.message || "Download manager rejected the file." });
          } else {
            sendResponse({ ok: true, downloadId: Number(id) });
          }
        });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    });
    return true;
  }

  if (message?.type === "DS_LOREBOOK_EXPORT_HELPER") {
    const url = String(message.url || "");
    const token = String(message.token || "").trim().slice(0, 140);
    const target = String(message.target || "").trim().slice(0, 20);
    const id = String(message.id || "").trim().slice(0, 200);
    if (!/^https:\/\/(?:www\.)?spicychat\.ai\/lorebook\/edit\//i.test(url) || !token || !["details", "entries"].includes(target)) {
      sendResponse({ ok: false, error: "Invalid Lorebook helper request." });
      return false;
    }
    tabsCreate({ url, active: false })
      .then(result => {
        const helperTabId = Number(result?.tab?.id || 0);
        if (!result?.ok || !helperTabId) {
          sendResponse({ ok: false, tabId: 0, error: result?.error || "Could not create Lorebook helper tab." });
          return;
        }
        sendResponse({ ok: true, tabId: helperTabId });
        runLorebookExportHelperTab(helperTabId, { token, target, id }).catch(() => {});
      })
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_WIKI_REQUEST_PERMISSION") {
    const origin = wikiOriginPattern(message.url);
    if (!origin) {
      sendResponse({ ok: false, error: "Enter a valid http:// or https:// page URL." });
      return;
    }
    requestOptionalOrigin(origin).then(sendResponse);
    return true;
  }

  if (message?.type === "DS_WIKI_FETCH") {
    fetchWikiPageSource(message.url)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }


  if (message?.type === "DS_EXACT_MESSAGE_COUNTS_FETCH") {
    fetchExactMessageCounts(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error), counts: [] }));
    return true;
  }

  if (message?.type === "DS_CARD_TOKEN_BRIDGE_DIAG") {
    sendResponse(recordCardTokenBridge(message));
    return;
  }

  if (message?.type === "DS_CARD_TOKEN_FETCH") {
    fetchCardTokenCharacter(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_DISLIKE_CANCEL_BULK") {
    sendResponse({ ok: markQuickDislikeBulkRunCanceled(message.bulkRunId) });
    return;
  }

  if (message?.type === "DS_QUICK_DISLIKE_RELEASE_BULK") {
    releaseQuickDislikeBulkWorker(message.bulkRunId)
      .then(released => sendResponse({ ok: true, released }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_DISLIKE_BOT") {
    queueQuickDislikeBot(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LISTING_REFILL_PAGE") {
    runListingRefillPageWorker(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LISTING_REFILL_FAVORITE") {
    runListingRefillFavoriteWorker(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }


  if (message?.type === "DS_CONTEXT_WINDOW_NOTIFICATION") {
    (async () => {
      const allowed = await hasOptionalPermission("notifications");
      if (!allowed) { sendResponse({ ok: false, status: "permission-missing" }); return; }
      const percent = Math.min(100, Math.max(0, Number(message.percent) || 0));
      const used = Math.max(0, Number(message.used) || 0);
      const limit = Math.max(0, Number(message.limit) || 0);
      const delivered = await createBrowserNotification(`ds-context-window:${Date.now()}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: `SpicyChat context ${Math.round(percent)}% full`,
        message: `${Math.round(used).toLocaleString()} / ${Math.round(limit).toLocaleString()} tokens. Older RP messages may soon drop from the model's context.`
      });
      sendResponse({ ok: delivered });
    })().catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_CHAT_NUDGE_SYNC" || message?.type === "DS_CHAT_NUDGE_SCAN_NOW") {
    runChatNudgeScan()
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_CREATOR_BOT_SCAN_NOW") {
    queueCreatorBotScan({ force: true, reason: "manual" })
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_CREATOR_BOT_WEBHOOK_TEST") {
    sendCreatorBotDiscordWebhook(message.url, null, { test: true })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_PERSONA_RENDERED_SNAPSHOT") {
    runPersonaRenderedSnapshotWorker(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_FETCH_PERSONA_IMAGE_DATA_URL") {
    fetchPersonaImageDataUrl(message.url)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_AUTO_AFK_ACTIVITY") {
    (async () => {
      const settings = await getAutoAfkSettings();
      if (settings.enabled === false || !settings.autoAfkEnabled || !tabId) {
        sendResponse({ ok: false });
        return;
      }

      if (message.reason === "opened" && settings.autoAfkResetOnActivate === false) {
        sendResponse({ ok: true, ignored: true });
        return;
      }

      await markAutoAfkActivity(tabId);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "DS_AUTO_AFK_RUN_NOW") {
    runAutoAfkScan()
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }


  if (message?.type === "DS_DUPLICATE_TABS_RUN_NOW") {
    queueDuplicateTabScan({ focusExisting: false })
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_DIAGNOSTIC_COLLECT") {
    collectOpenSpicyChatTabDiagnostic()
      .then(report => sendResponse({ ok: true, report }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_DIAGNOSTIC_ENRICH_ONE") {
    enrichOpenBotMetadata(message.botId, { force: !!message.force })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_DIAGNOSTIC_WORKER_CLOSE") {
    closeTabCleanupWorker()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_DIAGNOSTIC_WORKER_FOCUS") {
    focusTabCleanupWorker()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_SESSION_REOPEN") {
    reopenTabSessionItems(message.items, String(message.mode || "current"))
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_SESSION_MATCH_OPEN") {
    matchOpenTabSessionItems(message.items, message.protectPinned !== false)
      .then(summary => sendResponse({ ok: true, ...summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_SESSION_CLOSE_MATCHES") {
    closeMatchedTabSessionItems(message.tabIds, message.protectPinned !== false)
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_OPTIONS_OPEN_COMMAND_PALETTE" || message?.type === "DS_OPTIONS_CLEAR_COMMAND_PALETTE") {
    getOptionsSourceTab().then(tab => {
      if (!tab?.id) { sendResponse({ ok: false, error: "No open SpicyChat source tab found." }); return; }
      const type = message.type === "DS_OPTIONS_OPEN_COMMAND_PALETTE" ? "DS_OPEN_COMMAND_PALETTE" : "DS_CLEAR_COMMAND_PALETTE_HISTORY";
      chrome.tabs.sendMessage(tab.id, { type, query: String(message.query || "") }, response => {
        if (chrome.runtime.lastError) sendResponse({ ok: false, error: chrome.runtime.lastError.message || "Could not reach the SpicyChat tab." });
        else sendResponse(response || { ok: true });
      });
    });
    return true;
  }

  if (message?.type === "DS_OPTIONS_GET_QUICK_PANEL_TAB_STATE") {
    relayQuickPanelStateToOptions({ type: "DS_GET_QUICK_PANEL_TAB_STATE" })
      .then(sendResponse);
    return true;
  }

  if (message?.type === "DS_OPTIONS_SET_QUICK_PANEL_TAB_STATE") {
    relayQuickPanelStateToOptions({
      type: "DS_SET_QUICK_PANEL_TAB_STATE",
      enabled: !!message.enabled
    }).then(sendResponse);
    return true;
  }


  if (message?.type === "DS_DEEPL_TRANSLATE_BATCH") {
    deeplTranslateBatch(message)
      .then(translations => sendResponse({ ok: true, translations }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_DEEPL_TRANSLATE") {
    deeplTranslate(message)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_DEEPL_TEST") {
    deeplRequest("/v2/usage")
      .then(data => sendResponse({
        ok: true,
        characterCount: Number(data.character_count || 0),
        characterLimit: Number(data.character_limit || 0)
      }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_DEEPL_USAGE") {
    deeplRequest("/v2/usage")
      .then(data => sendResponse({
        ok: true,
        characterCount: Number(data.character_count || 0),
        characterLimit: Number(data.character_limit || 0)
      }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_GET_DIAGNOSTIC_CONTEXT") {
    getReachableDiagnosticContext().then(sendResponse).catch(() => sendResponse({ ok: false, runtimeAvailable: false, url: "", title: "", pageDiagnostics: null }));
    return true;
  }

  if (message?.type === "DS_RECOVER_OPTIONS_SOURCE_PAGE" || message?.type === "DS_CLEAR_PAGE_RUNTIME_LOG") {
    getOptionsSourceTab().then(tab => {
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No open SpicyChat tab found." });
        return;
      }
      const pageType = message.type === "DS_CLEAR_PAGE_RUNTIME_LOG" ? "DS_CLEAR_RUNTIME_LOG" : "DS_RECOVER_CURRENT_PAGE";
      try {
        chrome.tabs.sendMessage(tab.id, { type: pageType }, response => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message || "Could not reach the SpicyChat tab." });
            return;
          }
          sendResponse({ ok: response?.ok !== false, ...(response || {}) });
        });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    });
    return true;
  }

  if (message?.type === "DS_OPEN_OPTIONS_CHANGELOG") {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html#changelog") }, tab => {
      sendResponse({ ok: !!tab && !chrome.runtime.lastError });
    });
    return true;
  }

  if (message?.type === "DS_OPEN_OPTIONS_FROM_POPUP") {
    (async () => {
      await rememberOptionsSourceTab(Number(message.tabId));
      chrome.runtime.openOptionsPage(() => {
        sendResponse({ ok: !chrome.runtime.lastError });
      });
    })();
    return true;
  }

  if (message?.type === "DS_OPEN_OPTIONS_TARGET") {
    (async () => {
      const sourceTabId = Number(message.tabId || tabId || 0);
      await rememberOptionsSourceTab(sourceTabId);
      const target = String(message.target || "general").replace(/[^a-z0-9-]/gi, "") || "general";
      const query = String(message.query || "").trim().slice(0, 180);
      const url = chrome.runtime.getURL(`options.html${query ? `?search=${encodeURIComponent(query)}` : ""}#${target}`);
      chrome.tabs.create({ url }, created => sendResponse({ ok: !!created && !chrome.runtime.lastError }));
    })();
    return true;
  }

  if (message?.type === "DS_OPEN_OPTIONS") {
    (async () => {
      await rememberOptionsSourceTab(tabId);
      chrome.runtime.openOptionsPage(() => {
        sendResponse({ ok: !chrome.runtime.lastError });
      });
    })();

    return true;
  }

  if (message?.type === "DS_CLOSE_CURRENT_TAB") {
    if (!tabId) {
      sendResponse({ ok: false });
      return false;
    }

    chrome.tabs.remove(tabId, () => {
      sendResponse({ ok: !chrome.runtime.lastError });
    });

    return true;
  }

  if (message?.type === "DS_LOAD_ALL_CHATS_START") {
    scheduleLoadStep(tabId);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "DS_LOAD_ALL_CHATS_STOP") {
    stopLoader(tabId);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "DS_LOAD_ALL_CHATS_RESCHEDULE") {
    scheduleLoadStep(tabId);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "DS_LOAD_ALL_CHATS_DONE") {
    stopLoader(tabId);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === AUTO_AFK_ALARM) {
    runAutoAfkScan();
    return;
  }

  if (alarm.name === CHAT_NUDGE_ALARM) {
    runChatNudgeScan();
    return;
  }

  if (alarm.name === CREATOR_BOT_WATCH_ALARM) {
    queueCreatorBotScan({ force: false, reason: "alarm" });
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

chrome.tabs.onActivated.addListener(async activeInfo => {
  const settings = await getAutoAfkSettings();
  if (settings.enabled === false || !settings.autoAfkEnabled || settings.autoAfkResetOnActivate === false) return;

  const tab = await tabsGet(activeInfo.tabId);
  if (tab && isSpicyChatUrl(tab.url)) await markAutoAfkActivity(tab.id);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const spicyUrl = tab?.url || changeInfo.url || tab?.pendingUrl;
  if (!isSpicyChatUrl(spicyUrl)) return;
  if (quickDislikeWorkerTabIds.has(Number(tabId)) || listingRefillWorkerTabIds.has(Number(tabId)) || personaRefreshWorkerTabIds.has(Number(tabId)) || isQuickDislikeWorkerUrl(spicyUrl) || isListingRefillWorkerUrl(spicyUrl) || isPersonaRefreshWorkerUrl(spicyUrl)) return;

  if (changeInfo.url) {
    const duplicateSettings = await getDuplicateTabSettings();
    if (duplicateSettings.enabled !== false && duplicateSettings.duplicateTabGuardEnabled) {
      queueDuplicateTabScan({ initiatorTabId: tabId, focusExisting: !!tab?.active });
    }
  }

  const settings = await getAutoAfkSettings();
  if (settings.enabled === false || !settings.autoAfkEnabled || settings.autoAfkResetOnActivate === false) return;

  // A URL change means a new SpicyChat page was opened in this tab. A normal
  // background reload should not keep extending an AFK timer forever.
  if (changeInfo.url || (changeInfo.status === "complete" && tab?.active)) {
    await markAutoAfkActivity(tabId);
  }
});

chrome.tabs.onCreated.addListener(tab => {
  if (!tab?.id || !isSpicyChatUrl(tab.url || tab.pendingUrl)) return;
  if (isQuickDislikeWorkerUrl(tab.url || tab.pendingUrl)) {
    quickDislikeWorkerTabIds.add(Number(tab.id));
    return;
  }
  if (isListingRefillWorkerUrl(tab.url || tab.pendingUrl)) {
    listingRefillWorkerTabIds.add(Number(tab.id));
    return;
  }
  if (isPersonaRefreshWorkerUrl(tab.url || tab.pendingUrl)) {
    personaRefreshWorkerTabIds.add(Number(tab.id));
    return;
  }

  getDuplicateTabSettings().then(settings => {
    if (settings.enabled !== false && settings.duplicateTabGuardEnabled) {
      queueDuplicateTabScan({ initiatorTabId: tab.id, focusExisting: !!tab.active });
    }
  });

  getAutoAfkSettings().then(settings => {
    if (settings.enabled !== false && settings.autoAfkEnabled && settings.autoAfkResetOnActivate !== false) {
      markAutoAfkActivity(tab.id);
    }
  });
});

chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  getAutoAfkSettings().then(async settings => {
    if (settings.enabled === false || !settings.autoAfkEnabled || settings.autoAfkResetOnActivate === false) return;
    const tabs = await tabsQuery({ active: true, windowId });
    const tab = tabs[0];
    if (tab?.id && isSpicyChatUrl(tab.url)) await markAutoAfkActivity(tab.id);
  });
});

chrome.tabs.onRemoved.addListener(tabId => {
  if (Number(tabId) === Number(tabCleanupWorkerTabId)) tabCleanupWorkerTabId = null;
  tabCleanupWorkerTabIds.delete(Number(tabId));
  quickDislikeWorkerTabIds.delete(Number(tabId));
  for (const [runId, workerTabId] of quickDislikeBulkWorkerTabs.entries()) {
    if (Number(workerTabId) === Number(tabId)) quickDislikeBulkWorkerTabs.delete(runId);
  }
  listingRefillWorkerTabIds.delete(Number(tabId));
  personaRefreshWorkerTabIds.delete(Number(tabId));
  removeAutoAfkActivity(tabId);
  storageGet([OPTIONS_SOURCE_TAB_KEY]).then(result => {
    if (Number(result[OPTIONS_SOURCE_TAB_KEY]) === Number(tabId)) {
      chrome.storage.local.remove(OPTIONS_SOURCE_TAB_KEY);
    }
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[CHAT_NUDGE_STORE_KEY]) runChatNudgeScan();

  if (changes[FOLLOWED_CREATORS_KEY]) {
    const beforeFollowed = normalizeFollowedCreatorStore(changes[FOLLOWED_CREATORS_KEY].oldValue);
    const afterFollowed = normalizeFollowedCreatorStore(changes[FOLLOWED_CREATORS_KEY].newValue);
    const beforeSet = new Set(beforeFollowed.handles);
    const added = afterFollowed.handles.filter(handle => !beforeSet.has(handle));
    if (added.length) queueCreatorBotScan({ force: true, handles: added, reason: "followed-added" });
  }

  if (!changes.settings) return;

  const before = {
    ...AUTO_AFK_DEFAULTS,
    ...(changes.settings.oldValue || {})
  };
  const after = {
    ...AUTO_AFK_DEFAULTS,
    ...(changes.settings.newValue || {})
  };

  const justEnabled = !before.autoAfkEnabled && !!after.autoAfkEnabled;
  configureAutoAfkAlarm(justEnabled);

  const duplicateBefore = {
    ...DUPLICATE_TAB_DEFAULTS,
    ...(changes.settings.oldValue || {})
  };
  const duplicateAfter = {
    ...DUPLICATE_TAB_DEFAULTS,
    ...(changes.settings.newValue || {})
  };
  const duplicateJustEnabled = !duplicateBefore.duplicateTabGuardEnabled && !!duplicateAfter.duplicateTabGuardEnabled;
  if (duplicateAfter.enabled !== false && duplicateAfter.duplicateTabGuardEnabled && duplicateJustEnabled) {
    queueDuplicateTabScan({ focusExisting: false });
  }

  const nudgeJustEnabled = !before.enableChatNudges && !!after.enableChatNudges;
  if (nudgeJustEnabled) runChatNudgeScan();
  configureChatNudgeAlarm(nudgeJustEnabled);

  const creatorWatchJustEnabled = !before.enableCreatorBotNotifications && !!after.enableCreatorBotNotifications;
  const creatorWatchIntervalChanged = Number(before.creatorBotCheckMinutes || 60) !== Number(after.creatorBotCheckMinutes || 60);
  if (creatorWatchJustEnabled) queueCreatorBotScan({ force: true, reason: "enabled" });
  if (creatorWatchJustEnabled || creatorWatchIntervalChanged || before.enabled !== after.enabled) {
    configureCreatorBotWatchAlarm(creatorWatchJustEnabled);
  }
});

chrome.runtime.onInstalled.addListener(details => {
  rememberReleaseNotice(details)
    .catch(() => {})
    .finally(() => {
      if (details?.reason === "install") {
        chrome.runtime.openOptionsPage(() => void chrome.runtime.lastError);
      }
    });
  syncAutoAfkTabs().finally(() => configureAutoAfkAlarm(false));
  getDuplicateTabSettings().then(settings => {
    if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
  });
  configureChatNudgeAlarm(true);
  configureCreatorBotWatchAlarm(true);
});

chrome.runtime.onStartup.addListener(() => {
  syncAutoAfkTabs().finally(() => configureAutoAfkAlarm(false));
  getDuplicateTabSettings().then(settings => {
    if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
  });
  configureChatNudgeAlarm(true);
  configureCreatorBotWatchAlarm(false).finally(() => queueCreatorBotScan({ force: false, reason: "startup" }));
});

configureAutoAfkAlarm(false);
getDuplicateTabSettings().then(settings => {
  if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
});
configureChatNudgeAlarm(false);
configureCreatorBotWatchAlarm(false);
