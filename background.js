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
const GRANULAR_SETTING_PREFIX = "dsSettingV1:";
const GRANULAR_SETTINGS_INDEX_KEY = "dsSettingsIndexV1";
const GRANULAR_SETTINGS_MIGRATION_KEY = "dsGranularSettingsV1";
const GRANULAR_SETTINGS_REVISION_KEY = "dsSettingsRevisionV1";
let granularSettingsIndexCache = new Set();
const TAB_CLEANUP_ENRICHMENT_KEY = "tabCleanupEnrichment";
const TAB_CLEANUP_WORKER_TIMEOUT_MS = 30000;
const OPTIONS_SOURCE_TAB_KEY = "dsQolOptionsSourceTabId";
const RELEASE_NOTICE_KEY = "dsReleaseNotice";
const LAST_SEEN_VERSION_KEY = "dsLastSeenReleaseVersion";
const INSTALLED_VERSION_KEY = "dsLastInstalledVersion";
const QUICK_DISLIKE_HISTORY_KEY = "quickDislikeHistoryV1";
const QUICK_LESS_LIKE_HISTORY_KEY = "quickLessLikeHistoryV1";
const QUICK_LESS_LIKE_PENDING_KEY = "quickLessLikeHistoryPendingV1";
const QUICK_DISLIKE_ACTIVE_JOBS_KEY = "quickDislikeActiveJobsV1";
const HELPER_LIFECYCLE_DIAG_KEY = "helperLifecycleDiagnosticsV1";
const HELPER_RUNTIME_SESSION_KEY = "dsHelperRuntimeSessionIdV1";
const QUICK_DISLIKE_GC_ALARM = "ds-quick-dislike-worker-gc";
const HELPER_SESSION_GRACE_ALARM = "ds-helper-session-grace-cleanup";
const QUICK_DISLIKE_INTERRUPTED_GRACE_MS = 60 * 1000;
const QUICK_DISLIKE_ABSOLUTE_MAX_AGE_MS = 2 * 60 * 1000;
const QUICK_DISLIKE_RECOVERY_MAX_AGE_MS = 10 * 60 * 1000;
const QUICK_DISLIKE_PERSISTENT_IDLE_MAX_AGE_MS = 15 * 60 * 1000;
const AUTO_AFK_SCAN_MINUTES = 1;
const CHAT_NUDGE_SCAN_MINUTES = 15;

const CARD_TOKEN_DIAG_KEY = "cardTokenFetchDiagnosticsV1";
const CARD_TOKEN_API_BASE = "https://prod.nd-api.com/v2/characters/";
const CARD_TOKEN_TIMEOUT_MS = 8000;

const EXACT_MESSAGE_TYPESENSE_URL = "https://ts-lb.nd-api.com/multi_search";
const EXACT_MESSAGE_TYPESENSE_KEY = "STHKtT6jrC5z1IozTJHIeSN4qN9oL1s3";
const EXACT_MESSAGE_TYPESENSE_COLLECTION = "public_characters_alias";
const EXACT_MESSAGE_TYPESENSE_QUERY_BY = "name,title,tags,creator_username,character_id,type";
const PUBLIC_LOREBOOK_TYPESENSE_COLLECTION = "lorebooks_public";
const PUBLIC_LOREBOOK_ENTRY_TYPESENSE_COLLECTION = "lorebook_entries_public";
const PUBLIC_LOREBOOK_TYPESENSE_QUERY_BY = "name,tags,lorebook_id";
const PUBLIC_LOREBOOK_ENTRY_TYPESENSE_QUERY_BY = "name,keywords";
const SPICYCHAT_APPLICATION_CONFIG_URL = "https://prod.nd-api.com/v2/applications/spicychat";
const LOREBOOK_TYPESENSE_CONFIG_TTL_MS = 10 * 60 * 1000;
const LOREBOOK_CONFIG_GUEST_ID = (() => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0").slice(0, 12)}`;
})();
let lorebookTypesenseConfigCache = null;
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
  autoAfkMinutes: 720,
  lowMemoryProtectionEnabled: false,
  maxAwakeSpicyTabs: 3,
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
let quickLessLikeChain = Promise.resolve();
const recommendationFeedbackBotChains = new Map();
let recommendationFeedbackQuickDislikeCache = null;
let recommendationFeedbackQuickLessLikeCache = null;
let creatorBotScanChain = Promise.resolve();
let tabCleanupWorkerTabId = null;
const tabCleanupWorkerTabIds = new Set();
const quickDislikeWorkerTabIds = new Set();
const quickDislikeBulkWorkerTabs = new Map();
let quickDislikePersistentWorkerTabId = null;
const quickLessLikeWorkerTabIds = new Set();
const quickLessLikeBulkWorkerTabs = new Map();
const quickLessLikeDirectBulkTabs = new Map();
const quickLessLikeClosedBulkRuns = new Map();
const quickLessLikeReadyWorkerTabs = new Map();
let quickLessLikePersistentWorkerTabId = null;
let quickLessLikeHistoryCache = null;
let quickLessLikePendingCache = null;
let quickLessLikeHistoryCacheRunId = "";
let quickLessLikeHistoryLastFlushAt = 0;
// Successful Less Like actions are still journaled before returning so a crash
// cannot repeat a known-successful rating. The expensive full-history compaction
// is deliberately much less frequent; the old every-25 rewrite matched the
// ~5-second cadence seen in the Inspector stress test.
const QUICK_LESS_LIKE_HISTORY_FLUSH_EVERY = 500;
const QUICK_LESS_LIKE_HISTORY_FLUSH_MAX_AGE_MS = 5 * 60 * 1000;
const QUICK_LESS_LIKE_RECOMMENDATION_WORKER_URL = "https://spicychat.ai/?dsQolRecommendationWorker=1";
const QUICK_LESS_LIKE_LIGHT_WORKER_URL = "https://spicychat.ai/chats?dsQolRecommendationWorker=1&dsQolWorkerLight=1";
const QUICK_LESS_LIKE_TOKEN_CACHE_KEY = "dsQolRecombeePublicTokenCache";
const QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY = "dsQuickLessLikeRecommendationWorkerTabId";
const QUICK_LESS_LIKE_READY_TTL_MS = 10 * 60 * 1000;
let botStatusWorkerTabId = null;
let botStatusWorkerOwned = false;
let botStatusWorkerSessionId = "";
let botStatusWorkerHeartbeatAt = 0;
let botStatusWorkerActivityAt = 0;
let botStatusWorkerRequestActive = false;
let botStatusWorkerRestartCount = 0;
let botStatusWorkerRestartBackoffUntil = 0;
const botStatusWorkerTabIds = new Set();
const botStatusWorkerExpectedCloseIds = new Set();
const BOT_STATUS_HOME_WORKER_URL = "https://spicychat.ai/?dsQolBotStatusWorker=1";
const BOT_STATUS_WORKER_SESSION_TAB_KEY = "dsBotStatusWorkerTabId";
const BOT_STATUS_WORKER_SESSION_OWNED_KEY = "dsBotStatusWorkerOwned";
const BOT_STATUS_WORKER_SESSION_ID_KEY = "dsBotStatusWorkerSessionId";
// Visible/request-active health should update quickly, but an inactive helper tab
// can have its page timers throttled by Chromium for several minutes. Do not
// mistake that browser throttling for worker death.
const BOT_STATUS_WORKER_HEARTBEAT_TTL_MS = 60 * 1000;
const BOT_STATUS_WORKER_THROTTLED_TTL_MS = 6 * 60 * 1000;
const listingRefillWorkerTabIds = new Set();
const listingRefillPageWorkerTabs = new Map();
const listingRefillSourceTabs = new Map();
const LISTING_REFILL_GC_ALARM = "ds-listing-refill-worker-gc";
const LISTING_REFILL_WORKER_MAX_AGE_MS = 30 * 60 * 1000;
const LISTING_REFILL_WORKER_RESPONSE_MAX_MS = 45 * 1000;
const personaRefreshWorkerTabIds = new Set();
const canceledQuickDislikeBulkRuns = new Map();
const canceledQuickLessLikeBulkRuns = new Map();
let helperRuntimeSessionPromise = null;
let helperLifecycleInitPromise = null;

let backgroundJobLease = null;
const backgroundJobQueue = [];
let backgroundJobSeq = 0;

// Diagnostic Protocol v2 background bridge. It stays dormant until a SpicyChat
// content page tells us a v2 Inspector recording is active. While active, safe
// summaries are mirrored back through the content-script page bus and the last
// few thousand service-worker events are retained for short disconnects.
const QOL_DIAG_BACKGROUND_BUFFER_MAX = 5000;
const qolDiagnosticSubscribers = new Map();
const qolDiagnosticBackgroundBuffer = [];
let qolDiagnosticBackgroundSeq = 0;

function qolDiagnosticLevelRank(level) {
  return String(level || "normal") === "deep" ? 2 : 1;
}

function qolDiagnosticSensitiveKey(key = "") {
  return /(authorization|cookie|token|secret|password|webhook|request.?body|response.?body|headers?|chat.?text|message.?text|prompt|ooc|persona.?description|lorebook.?content|keywords?|definition|personality|scenario|example.?dialog|greeting|description|content|raw|html)/i.test(String(key || ""));
}

function qolDiagnosticFingerprint(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function qolDiagnosticSafe(value, depth = 0, keyHint = "") {
  if (qolDiagnosticSensitiveKey(keyHint)) {
    if (typeof value === "string") return { changed: true, chars: value.length, fingerprint: `fnv1a-${qolDiagnosticFingerprint(value)}` };
    if (Array.isArray(value)) return { changed: true, count: value.length };
    if (value && typeof value === "object") return { changed: true, keys: Object.keys(value).length };
    return value == null ? value : { changed: true, kind: typeof value };
  }
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 180);
  if (depth >= 4) return undefined;
  if (Array.isArray(value)) return value.slice(0, 32).map(item => qolDiagnosticSafe(item, depth + 1, keyHint)).filter(item => item !== undefined);
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 60)) {
      const safe = qolDiagnosticSafe(item, depth + 1, key);
      if (safe !== undefined) out[String(key).slice(0, 90)] = safe;
    }
    return out;
  }
  return undefined;
}

function qolDiagnosticHasSubscribers(level = "normal") {
  const needed = qolDiagnosticLevelRank(level);
  for (const sub of qolDiagnosticSubscribers.values()) {
    if (sub?.active && qolDiagnosticLevelRank(sub.traceLevel) >= needed) return true;
  }
  return false;
}

function qolDiagnosticForwardToTab(tabId, event) {
  try {
    chrome.tabs.sendMessage(Number(tabId), { type: "DS_QOL_DIAGNOSTIC_BACKGROUND_EVENT", event }, () => {
      try { void chrome.runtime.lastError; } catch {}
    });
  } catch {}
}

function qolBackgroundTrace(type, feature = "background", meta = {}, options = {}) {
  const level = options?.level === "deep" ? "deep" : "normal";
  if (!qolDiagnosticHasSubscribers(level)) return null;
  const row = {
    seq: ++qolDiagnosticBackgroundSeq,
    ts: Date.now(),
    type: String(type || "background-event").slice(0, 80),
    feature: String(feature || "background").slice(0, 80),
    level,
    critical: !!options?.critical,
    meta: qolDiagnosticSafe(meta || {}) || {}
  };
  qolDiagnosticBackgroundBuffer.push(row);
  if (qolDiagnosticBackgroundBuffer.length > QOL_DIAG_BACKGROUND_BUFFER_MAX) qolDiagnosticBackgroundBuffer.splice(0, qolDiagnosticBackgroundBuffer.length - QOL_DIAG_BACKGROUND_BUFFER_MAX);
  const needed = qolDiagnosticLevelRank(level);
  for (const [tabId, sub] of qolDiagnosticSubscribers.entries()) {
    if (!sub?.active || qolDiagnosticLevelRank(sub.traceLevel) < needed) continue;
    qolDiagnosticForwardToTab(tabId, row);
  }
  return row;
}

let qolDiagnosticBackgroundNetworkSeq = 0;
function qolDiagnosticEndpoint(value) {
  try {
    const url = new URL(String(value || ""), "https://spicychat.ai");
    const path = url.pathname
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, ":id")
      .replace(/\/webhooks\/[^/]+\/[^/]+/ig, "/webhooks/:redacted");
    return `${url.origin}${path}`.slice(0, 240);
  } catch {
    return String(value || "").split(/[?#]/, 1)[0].slice(0, 240);
  }
}

function qolBackgroundNetworkStart(feature, method, url, meta = {}) {
  if (!qolDiagnosticHasSubscribers("normal")) return null;
  const token = {
    requestId: `bgnet-${(++qolDiagnosticBackgroundNetworkSeq).toString(36)}`,
    feature: String(feature || "background-network").slice(0, 80),
    method: String(method || "GET").toUpperCase().slice(0, 12),
    endpoint: qolDiagnosticEndpoint(url),
    startedAt: Date.now()
  };
  qolBackgroundTrace("network-start", token.feature, {
    requestId: token.requestId, method: token.method, endpoint: token.endpoint, ...meta
  });
  return token;
}

function qolBackgroundNetworkEnd(token, result = {}) {
  if (!token || token.ended) return;
  token.ended = true;
  qolBackgroundTrace("network-end", token.feature, {
    requestId: token.requestId,
    method: token.method,
    endpoint: token.endpoint,
    durationMs: Math.max(0, Date.now() - Number(token.startedAt || Date.now())),
    status: Number(result?.status || 0),
    ok: result?.ok === true,
    outcome: String(result?.outcome || (result?.ok ? "ok" : "failed")).slice(0, 80)
  }, { critical: result?.ok === false });
}

function qolDiagnosticSubscribe(sender, message) {
  const tabId = Number(sender?.tab?.id || 0);
  if (!tabId) return { ok: false, error: "No sender tab." };
  if (message?.active === false) {
    qolDiagnosticSubscribers.delete(tabId);
    return { ok: true, active: false, latestSeq: qolDiagnosticBackgroundSeq };
  }
  const traceLevel = String(message?.traceLevel || "normal") === "deep" ? "deep" : "normal";
  const afterSeq = Math.max(0, Number(message?.afterSeq || 0));
  qolDiagnosticSubscribers.set(tabId, {
    active: true,
    traceLevel,
    pageSessionId: String(message?.pageSessionId || "").slice(0, 120),
    subscribedAt: Date.now()
  });
  const replay = qolDiagnosticBackgroundBuffer.filter(row => Number(row.seq || 0) > afterSeq && qolDiagnosticLevelRank(row.level) <= qolDiagnosticLevelRank(traceLevel)).slice(-QOL_DIAG_BACKGROUND_BUFFER_MAX);
  for (const row of replay) qolDiagnosticForwardToTab(tabId, row);
  return { ok: true, active: true, traceLevel, replayed: replay.length, latestSeq: qolDiagnosticBackgroundSeq };
}

function grantNextBackgroundJob() {
  if (backgroundJobLease || !backgroundJobQueue.length) return;
  const next = backgroundJobQueue.shift();
  if (!next) return;
  const now = Date.now();
  const leaseId = `bgjob-${(++backgroundJobSeq).toString(36)}-${now.toString(36)}`;
  const maxHoldMs = Math.max(1000, Math.min(60000, Number(next.maxHoldMs || 30000)));
  const timer = setTimeout(() => {
    if (backgroundJobLease?.leaseId !== leaseId) return;
    backgroundJobLease = null;
    grantNextBackgroundJob();
  }, maxHoldMs);
  backgroundJobLease = {
    leaseId,
    jobType: next.jobType,
    ownerTabId: Number(next.ownerTabId || 0) || 0,
    detail: String(next.detail || "").slice(0, 120),
    grantedAt: now,
    timer
  };
  const waitMs = Math.max(0, now - next.requestedAt);
  qolBackgroundTrace("scheduler", "background-job", { action: "granted", leaseId, jobType: next.jobType, waitMs, queueDepth: backgroundJobQueue.length, ownerTabId: Number(next.ownerTabId || 0) }, { level: "deep" });
  next.resolve({ ok: true, leaseId, jobType: next.jobType, waitMs });
}

function acquireBackgroundJob(jobType, options = {}) {
  const type = String(jobType || "generic").slice(0, 50);
  return new Promise(resolve => {
    backgroundJobQueue.push({
      jobType: type,
      ownerTabId: Number(options.ownerTabId || 0) || 0,
      detail: String(options.detail || "").slice(0, 120),
      maxHoldMs: Math.max(1000, Number(options.maxHoldMs || 30000)),
      requestedAt: Date.now(),
      resolve
    });
    grantNextBackgroundJob();
  });
}

function releaseBackgroundJob(leaseId) {
  const id = String(leaseId || "");
  if (!id || backgroundJobLease?.leaseId !== id) return false;
  clearTimeout(backgroundJobLease.timer);
  backgroundJobLease = null;
  grantNextBackgroundJob();
  return true;
}

async function withBackgroundJob(jobType, options, callback) {
  const requestedAt = Date.now();
  const lease = await acquireBackgroundJob(jobType, options);
  const startedAt = Date.now();
  qolBackgroundTrace("operation-start", String(jobType || "background-job"), { operationId: lease?.leaseId || "", operation: "background-job", leaseId: lease?.leaseId || "", waitMs: Number(lease?.waitMs || 0), ownerTabId: Number(options?.ownerTabId || 0), detail: String(options?.detail || "").slice(0, 120) });
  try {
    const result = await callback(lease);
    qolBackgroundTrace("operation-end", String(jobType || "background-job"), { operationId: lease?.leaseId || "", operation: "background-job", leaseId: lease?.leaseId || "", outcome: "ok", durationMs: Date.now() - startedAt, totalMs: Date.now() - requestedAt });
    return result;
  } catch (error) {
    qolBackgroundTrace("error", String(jobType || "background-job"), { operationId: lease?.leaseId || "", operation: "background-job", leaseId: lease?.leaseId || "", class: String(error?.name || "Error"), message: String(error?.message || error || "").slice(0, 180), durationMs: Date.now() - startedAt }, { critical: true });
    throw error;
  } finally {
    releaseBackgroundJob(lease?.leaseId);
  }
}

function quickDislikeWorkerUrlInfo(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!isSpicyChatUrl(parsed.href) || parsed.searchParams.get("dsQuickDislike") !== "1") return null;
    return {
      jobId: String(parsed.searchParams.get("dsQuickJobId") || "").trim(),
      botId: String(parsed.searchParams.get("dsQuickBotId") || "").trim().toLowerCase(),
      bulkRunId: String(parsed.searchParams.get("dsQuickBulkRunId") || "").trim(),
      startedAt: Number(parsed.searchParams.get("dsQuickStartedAt") || 0) || 0,
      sessionId: String(parsed.searchParams.get("dsHelperSession") || "").trim(),
      persistent: parsed.searchParams.get("dsQuickPersistent") === "1"
    };
  } catch {
    return null;
  }
}

function isQuickDislikeWorkerUrl(url) {
  return !!quickDislikeWorkerUrlInfo(url);
}

function quickLessLikeWorkerUrlInfo(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!isSpicyChatUrl(parsed.href)) return null;
    const recommendationWorker = parsed.searchParams.get("dsQolRecommendationWorker") === "1";
    const legacyWorker = parsed.searchParams.get("dsQuickLessLike") === "1";
    if (!recommendationWorker && !legacyWorker) return null;
    return {
      jobId: String(parsed.searchParams.get("dsLessLikeJobId") || "").trim(),
      botId: String(parsed.searchParams.get("dsLessLikeBotId") || "").trim().toLowerCase(),
      botName: String(parsed.searchParams.get("dsLessLikeBotName") || "").trim(),
      bulkRunId: String(parsed.searchParams.get("dsLessLikeBulkRunId") || "").trim(),
      startedAt: Number(parsed.searchParams.get("dsLessLikeStartedAt") || 0) || 0,
      sessionId: String(parsed.searchParams.get("dsHelperSession") || "").trim(),
      persistent: recommendationWorker || parsed.searchParams.get("dsLessLikePersistent") === "1",
      recommendationWorker
    };
  } catch {
    return null;
  }
}

function isQuickLessLikeWorkerUrl(url) {
  return !!quickLessLikeWorkerUrlInfo(url);
}

function isSpicyChatHomeUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!isSpicyChatUrl(parsed.href)) return false;
    const path = String(parsed.pathname || "/").replace(/\/+$/, "") || "/";
    return path === "/";
  } catch {
    return false;
  }
}

function isKnownQuickLessLikeRecommendationWorkerTab(tabId, url = "") {
  const id = Number(tabId || 0);
  if (!Number.isFinite(id) || !id || !isSpicyChatHomeUrl(url)) return false;
  const info = quickLessLikeWorkerUrlInfo(url);
  if (info?.recommendationWorker) return true;
  if (quickLessLikeWorkerTabIds.has(id)) return true;
  if (Number(quickLessLikePersistentWorkerTabId) === id) return true;
  for (const workerTabId of quickLessLikeBulkWorkerTabs.values()) {
    if (Number(workerTabId) === id) return true;
  }
  return false;
}

function stampQuickLessLikeWorkerUrl(url, { jobId = "", botId = "", botName = "", bulkRunId = "", startedAt = Date.now(), sessionId = "" } = {}) {
  const next = new URL(String(url));
  next.searchParams.set("dsQuickLessLike", "1");
  next.searchParams.set("dsLessLikePersistent", "1");
  const values = {
    dsLessLikeJobId: String(jobId || "").trim(),
    dsLessLikeBotId: String(botId || "").trim().toLowerCase(),
    dsLessLikeBotName: String(botName || "").trim(),
    dsLessLikeBulkRunId: String(bulkRunId || "").trim(),
    dsHelperSession: String(sessionId || "").trim()
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  next.searchParams.set("dsLessLikeStartedAt", String(Number(startedAt) || Date.now()));
  return next;
}

function stampQuickDislikeWorkerUrl(url, { jobId = "", botId = "", bulkRunId = "", startedAt = Date.now(), sessionId = "" } = {}) {
  const next = new URL(String(url));
  next.searchParams.set("dsQuickDislike", "1");
  next.searchParams.set("dsQuickPersistent", "1");
  const values = {
    dsQuickJobId: String(jobId || "").trim(),
    dsQuickBotId: String(botId || "").trim().toLowerCase(),
    dsQuickBulkRunId: String(bulkRunId || "").trim(),
    dsHelperSession: String(sessionId || "").trim()
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  next.searchParams.set("dsQuickStartedAt", String(Number(startedAt) || Date.now()));
  return next;
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

function listingRefillWorkerUrlInfo(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!isSpicyChatUrl(parsed.href) || parsed.searchParams.get("dsListingRefill") !== "1") return null;
    return {
      runId: String(parsed.searchParams.get("dsRefillRunId") || "").trim(),
      startedAt: Number(parsed.searchParams.get("dsRefillStartedAt") || 0) || 0,
      sessionId: String(parsed.searchParams.get("dsHelperSession") || "").trim()
    };
  } catch { return null; }
}

function stampListingRefillWorkerUrl(url, runId = "", startedAt = Date.now(), sessionId = "") {
  const next = new URL(String(url));
  next.searchParams.set("dsListingRefill", "1");
  const id = String(runId || "").trim();
  if (id) next.searchParams.set("dsRefillRunId", id);
  else next.searchParams.delete("dsRefillRunId");
  const session = String(sessionId || "").trim();
  if (session) next.searchParams.set("dsHelperSession", session);
  else next.searchParams.delete("dsHelperSession");
  next.searchParams.set("dsRefillStartedAt", String(Number(startedAt) || Date.now()));
  return next;
}

async function cleanupStaleListingRefillWorkers({ preserveRunId = "", closeLegacy = true } = {}) {
  const keep = String(preserveRunId || "").trim();
  const now = Date.now();
  let closed = 0;
  const tabs = await tabsQuery({});
  for (const tab of tabs) {
    const info = listingRefillWorkerUrlInfo(tab?.url || tab?.pendingUrl || "");
    if (!info || !tab?.id) continue;
    const legacyOrOrphan = !info.runId || !info.startedAt;
    const stale = info.startedAt > 0 && now - info.startedAt >= LISTING_REFILL_WORKER_MAX_AGE_MS;
    if (keep && info.runId === keep && !stale) continue;
    if (!(stale || (closeLegacy && legacyOrOrphan))) continue;
    await tabsRemove(Number(tab.id));
    listingRefillWorkerTabIds.delete(Number(tab.id));
    for (const [runId, workerTabId] of listingRefillPageWorkerTabs.entries()) {
      if (Number(workerTabId) === Number(tab.id)) listingRefillPageWorkerTabs.delete(runId);
    }
    closed += 1;
  }
  return closed;
}

async function findListingRefillWorkersForRun(runId) {
  const id = String(runId || "").trim();
  if (!id) return [];
  const tabs = await tabsQuery({});
  return tabs.filter(tab => listingRefillWorkerUrlInfo(tab?.url || tab?.pendingUrl || "")?.runId === id);
}

async function findListingRefillWorkerForRun(runId) {
  const tabs = await findListingRefillWorkersForRun(runId);
  if (!tabs.length) return null;
  tabs.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  return tabs[0] || null;
}

async function closeDuplicateListingRefillWorkers(runId, keepTabId) {
  const tabs = await findListingRefillWorkersForRun(runId);
  let closed = 0;
  for (const tab of tabs) {
    if (!tab?.id || Number(tab.id) === Number(keepTabId)) continue;
    await tabsRemove(Number(tab.id));
    listingRefillWorkerTabIds.delete(Number(tab.id));
    closed += 1;
  }
  return closed;
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
  const tabIds = new Set();
  const mapped = Number(quickDislikeBulkWorkerTabs.get(id));
  if (Number.isFinite(mapped)) tabIds.add(mapped);
  quickDislikeBulkWorkerTabs.delete(id);
  for (const tab of await tabsQuery({})) {
    const info = quickDislikeWorkerUrlInfo(tab?.url || tab?.pendingUrl || "");
    if (info?.bulkRunId === id && tab?.id) tabIds.add(Number(tab.id));
  }
  let released = false;
  for (const tabId of tabIds) {
    if (Number(tabId) === Number(quickDislikePersistentWorkerTabId)) {
      released = true;
      continue;
    }
    quickDislikeWorkerTabIds.delete(tabId);
    await tabsRemove(tabId);
    released = true;
  }
  return released;
}

async function findQuickDislikeWorkersForBulkRun(runId) {
  const id = String(runId || "").trim();
  if (!id) return [];
  const tabs = await tabsQuery({});
  return tabs.filter(tab => quickDislikeWorkerUrlInfo(tab?.url || tab?.pendingUrl || "")?.bulkRunId === id);
}

async function findPersistentQuickDislikeWorker(sessionId = "") {
  const mapped = Number(quickDislikePersistentWorkerTabId);
  if (Number.isFinite(mapped)) {
    const tab = await tabsGet(mapped);
    const info = tab ? quickDislikeWorkerUrlInfo(tab.url || tab.pendingUrl || "") : null;
    if (tab && info?.persistent && (!sessionId || !info.sessionId || info.sessionId === sessionId)) return tab;
    quickDislikePersistentWorkerTabId = null;
  }

  const tabs = await quickDislikeWorkerTabs();
  const candidates = tabs.filter(tab => {
    const info = quickDislikeWorkerUrlInfo(tab.url || tab.pendingUrl || "");
    return !!info?.persistent && (!sessionId || !info.sessionId || info.sessionId === sessionId);
  });
  candidates.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  const tab = candidates[0] || null;
  if (tab?.id) quickDislikePersistentWorkerTabId = Number(tab.id);
  return tab;
}

async function navigateQuickDislikeWorkerTab(tabId, targetUrl, botId, jobId) {
  const response = await tabsSendMessage(tabId, {
    type: "DS_QUICK_DISLIKE_NAVIGATE",
    targetUrl: targetUrl.href,
    botId,
    jobId
  });
  return response?.ok === true;
}

async function closeDuplicateQuickDislikeWorkers(runId, keepTabId) {
  const tabs = await findQuickDislikeWorkersForBulkRun(runId);
  let closed = 0;
  for (const tab of tabs) {
    if (!tab?.id || Number(tab.id) === Number(keepTabId)) continue;
    await tabsRemove(Number(tab.id));
    quickDislikeWorkerTabIds.delete(Number(tab.id));
    closed += 1;
  }
  if (closed) await recordHelperLifecycle("quickDislikeDuplicateClosed", { bulkRunId: String(runId || ""), closed });
  return closed;
}

async function prepareQuickDislikeWorkerTab(url, bulkRunId = "", job = {}) {
  const runId = String(bulkRunId || "").trim();
  const runtimeSession = await getHelperRuntimeSession();
  const jobId = String(job?.jobId || "").trim();
  const botId = String(job?.botId || "").trim().toLowerCase();
  const startedAt = Number(job?.startedAt || 0) || Date.now();
  const stampedFor = source => stampQuickDislikeWorkerUrl(source, {
    jobId,
    botId,
    bulkRunId: runId,
    startedAt,
    sessionId: runtimeSession.id
  });

  let existing = null;
  let recovered = false;

  if (runId) {
    const mappedId = Number(quickDislikeBulkWorkerTabs.get(runId));
    if (Number.isFinite(mappedId)) existing = await tabsGet(mappedId);
    if (!existing) {
      const runTabs = await findQuickDislikeWorkersForBulkRun(runId);
      runTabs.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
      existing = runTabs[0] || null;
      recovered = !!existing;
    }
  }

  if (!existing) existing = await findPersistentQuickDislikeWorker(runtimeSession.id);

  if (existing?.id) {
    const existingId = Number(existing.id);
    const target = stampedFor(url);
    let reusedWithoutReload = false;
    try {
      reusedWithoutReload = await navigateQuickDislikeWorkerTab(existingId, target, botId, jobId);
    } catch {}

    if (!reusedWithoutReload) {
      const updated = await tabsUpdate(existingId, { url: target.href, active: false });
      if (!updated?.ok) {
        quickDislikeWorkerTabIds.delete(existingId);
        if (Number(quickDislikePersistentWorkerTabId) === existingId) quickDislikePersistentWorkerTabId = null;
        if (runId) quickDislikeBulkWorkerTabs.delete(runId);
        existing = null;
      }
    }

    if (existing) {
      quickDislikeWorkerTabIds.add(existingId);
      quickDislikePersistentWorkerTabId = existingId;
      if (runId) quickDislikeBulkWorkerTabs.set(runId, existingId);
      const duplicateClosed = runId ? await closeDuplicateQuickDislikeWorkers(runId, existingId) : 0;
      if (recovered) await recordHelperLifecycle("quickDislikeHelperRecovered", { bulkRunId: runId, jobId, tabId: existingId });
      if (reusedWithoutReload) await recordHelperLifecycle("quickDislikeSpaReused", { bulkRunId: runId, jobId, botId, tabId: existingId });
      return {
        ok: true,
        tabId: existingId,
        reusable: true,
        reused: true,
        reusedWithoutReload,
        recovered,
        duplicateClosed
      };
    }
  }

  const created = await tabsCreate({ url: stampedFor(url).href, active: false });
  const tabId = Number(created?.tab?.id);
  if (!created.ok || !Number.isFinite(tabId)) {
    return { ok: false, tabId: null, reusable: true, error: created.error || "" };
  }
  quickDislikeWorkerTabIds.add(tabId);
  quickDislikePersistentWorkerTabId = tabId;
  if (runId) quickDislikeBulkWorkerTabs.set(runId, tabId);
  return { ok: true, tabId, reusable: true, reused: false, reusedWithoutReload: false, recovered: false, duplicateClosed: 0 };
}

function markQuickLessLikeBulkRunCanceled(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  const now = Date.now();
  canceledQuickLessLikeBulkRuns.set(id, now);
  for (const [key, at] of canceledQuickLessLikeBulkRuns.entries()) {
    if (now - Number(at || 0) > 30 * 60 * 1000) canceledQuickLessLikeBulkRuns.delete(key);
  }
  return true;
}

function isQuickLessLikeBulkRunCanceled(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  const at = Number(canceledQuickLessLikeBulkRuns.get(id) || 0);
  if (!at) return false;
  if (Date.now() - at > 30 * 60 * 1000) {
    canceledQuickLessLikeBulkRuns.delete(id);
    return false;
  }
  return true;
}

async function quickLessLikeWorkerTabs() {
  const tabs = await tabsQuery({});
  return tabs.filter(tab => isQuickLessLikeWorkerUrl(tab?.url || tab?.pendingUrl || ""));
}

async function releaseQuickLessLikeBulkWorker(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  try { await flushQuickLessLikeHistory(true, id); } catch {}
  if (quickLessLikeHistoryCacheRunId === id) {
    quickLessLikeHistoryCacheRunId = "";
    quickLessLikeHistoryCache = null;
    quickLessLikePendingCache = null;
    quickLessLikeHistoryLastFlushAt = 0;
  }
  quickLessLikeDirectBulkTabs.delete(id);
  quickLessLikeClosedBulkRuns.delete(id);
  const tabIds = new Set();
  const mapped = Number(quickLessLikeBulkWorkerTabs.get(id));
  if (Number.isFinite(mapped)) tabIds.add(mapped);
  quickLessLikeBulkWorkerTabs.delete(id);
  for (const tab of await quickLessLikeWorkerTabs()) {
    const info = quickLessLikeWorkerUrlInfo(tab?.url || tab?.pendingUrl || "");
    if (info?.bulkRunId === id && tab?.id) tabIds.add(Number(tab.id));
  }
  let released = false;
  for (const tabId of tabIds) {
    quickLessLikeWorkerTabIds.delete(tabId);
    quickLessLikeReadyWorkerTabs.delete(tabId);
    await tabsRemove(tabId);
    if (Number(tabId) === Number(quickLessLikePersistentWorkerTabId)) {
      quickLessLikePersistentWorkerTabId = null;
      await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: 0 });
    }
    released = true;
    await recordHelperLifecycle("quickLessLikeRecommendationWorkerReleased", { tabId, runId: id });
  }
  return released;
}

async function findPersistentQuickLessLikeWorker(sessionId = "") {
  let mapped = Number(quickLessLikePersistentWorkerTabId);
  if (!Number.isFinite(mapped) || !mapped) {
    const stored = await storageSessionGet([QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]);
    mapped = Number(stored[QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY] || 0);
  }
  if (Number.isFinite(mapped) && mapped > 0) {
    const tab = await tabsGet(mapped);
    const url = tab?.url || tab?.pendingUrl || "";
    if (tab && isSpicyChatHomeUrl(url)) {
      // Home replaces the helper query with listing-filter query params after boot.
      // Keep using the known tab instead of mistaking that SPA rewrite for navigation.
      quickLessLikeWorkerTabIds.add(mapped);
      quickLessLikePersistentWorkerTabId = mapped;
      await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: mapped });
      return tab;
    }
    quickLessLikePersistentWorkerTabId = null;
    await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: 0 });
  }

  const tabs = await quickLessLikeWorkerTabs();
  const candidates = [];
  for (const tab of tabs) {
    const info = quickLessLikeWorkerUrlInfo(tab.url || tab.pendingUrl || "");
    if (!info?.persistent) continue;
    if (sessionId && info.sessionId && info.sessionId !== sessionId) {
      if (tab?.id) {
        quickLessLikeWorkerTabIds.delete(Number(tab.id));
        await tabsRemove(Number(tab.id));
      }
      continue;
    }
    candidates.push(tab);
  }
  candidates.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  const tab = candidates[0] || null;
  if (tab?.id) {
    const tabId = Number(tab.id);
    quickLessLikeWorkerTabIds.add(tabId);
    quickLessLikePersistentWorkerTabId = tabId;
    await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: tabId });
  }
  return tab;
}

async function navigateQuickLessLikeWorkerTab(tabId, targetUrl, botId, botName, jobId) {
  const response = await tabsSendMessage(tabId, {
    type: "DS_QUICK_LESS_LIKE_NAVIGATE",
    targetUrl: targetUrl.href,
    botId,
    botName,
    jobId
  });
  return response?.ok === true;
}

async function prepareQuickLessLikeWorkerTab(url, bulkRunId = "", job = {}) {
  const runId = String(bulkRunId || "").trim();
  const runtimeSession = await getHelperRuntimeSession();
  const jobId = String(job?.jobId || "").trim();
  const botId = String(job?.botId || "").trim().toLowerCase();
  const botName = String(job?.botName || "").trim();
  const startedAt = Number(job?.startedAt || 0) || Date.now();
  const stampedFor = source => stampQuickLessLikeWorkerUrl(source, {
    jobId, botId, botName, bulkRunId: runId, startedAt, sessionId: runtimeSession.id
  });

  let existing = null;
  if (runId) {
    const mappedId = Number(quickLessLikeBulkWorkerTabs.get(runId));
    if (Number.isFinite(mappedId)) existing = await tabsGet(mappedId);
  }
  if (!existing) existing = await findPersistentQuickLessLikeWorker(runtimeSession.id);

  if (existing?.id) {
    const existingId = Number(existing.id);
    const target = stampedFor(url);
    let reusedWithoutReload = false;
    try { reusedWithoutReload = await navigateQuickLessLikeWorkerTab(existingId, target, botId, botName, jobId); } catch {}
    if (!reusedWithoutReload) {
      const updated = await tabsUpdate(existingId, { url: target.href, active: false });
      if (!updated?.ok) {
        quickLessLikeWorkerTabIds.delete(existingId);
        if (Number(quickLessLikePersistentWorkerTabId) === existingId) quickLessLikePersistentWorkerTabId = null;
        if (runId) quickLessLikeBulkWorkerTabs.delete(runId);
        existing = null;
      }
    }
    if (existing) {
      quickLessLikeWorkerTabIds.add(existingId);
      quickLessLikePersistentWorkerTabId = existingId;
      if (runId) quickLessLikeBulkWorkerTabs.set(runId, existingId);
      return { ok: true, tabId: existingId, reusable: true, reused: true, reusedWithoutReload };
    }
  }

  const created = await tabsCreate({ url: stampedFor(url).href, active: false });
  const tabId = Number(created?.tab?.id);
  if (!created.ok || !Number.isFinite(tabId)) return { ok: false, tabId: null, reusable: true, error: created.error || "" };
  quickLessLikeWorkerTabIds.add(tabId);
  quickLessLikePersistentWorkerTabId = tabId;
  if (runId) quickLessLikeBulkWorkerTabs.set(runId, tabId);
  return { ok: true, tabId, reusable: true, reused: false, reusedWithoutReload: false };
}

function quickLessLikeSearchUrl(botName, botId) {
  const url = new URL("https://spicychat.ai/");
  const key = "public_characters_alias/sort/_text_match(buckets: 3):desc,num_messages_24h:desc[query]";
  url.searchParams.set(key, String(botName || botId || "").trim());
  return url;
}

function quickLessLikeRecommendationWorkerUrl() {
  return new URL(QUICK_LESS_LIKE_RECOMMENDATION_WORKER_URL);
}

async function preferredQuickLessLikeRecommendationWorkerUrl() {
  try {
    const stored = await storageLocalGet([QUICK_LESS_LIKE_TOKEN_CACHE_KEY]);
    const cached = stored?.[QUICK_LESS_LIKE_TOKEN_CACHE_KEY] || {};
    const token = String(cached?.token || "").trim();
    const at = Number(cached?.at || 0);
    if (token.length >= 16 && token.length <= 180 && at > 0 && Date.now() - at < 24 * 60 * 60 * 1000) {
      return new URL(QUICK_LESS_LIKE_LIGHT_WORKER_URL);
    }
  } catch {}
  return quickLessLikeRecommendationWorkerUrl();
}

async function createOrReuseQuickLessLikeRecommendationWorker(runId = "") {
  const id = String(runId || "").trim();
  if (id && quickLessLikeClosedBulkRuns.has(id)) {
    return { ok: false, status: "recommendation-worker-closed", tabId: 0 };
  }
  let tab = null;
  const mapped = id ? Number(quickLessLikeBulkWorkerTabs.get(id) || 0) : 0;
  if (Number.isFinite(mapped) && mapped > 0) tab = await tabsGet(mapped);
  if (!tab) tab = await findPersistentQuickLessLikeWorker();
  if (tab?.id) {
    const tabId = Number(tab.id);
    quickLessLikeWorkerTabIds.add(tabId);
    quickLessLikePersistentWorkerTabId = tabId;
    if (id) quickLessLikeBulkWorkerTabs.set(id, tabId);
    const currentUrl = tab.url || tab.pendingUrl || "";
    const info = quickLessLikeWorkerUrlInfo(currentUrl);
    const knownWorkerHome = isKnownQuickLessLikeRecommendationWorkerTab(tabId, currentUrl);
    if (!info?.recommendationWorker && !knownWorkerHome) {
      const preferredUrl = await preferredQuickLessLikeRecommendationWorkerUrl();
      const updated = await tabsUpdate(tabId, { url: preferredUrl.href, active: false });
      if (!updated?.ok) return { ok: false, status: "recommendation-worker-navigation-failed", tabId };
      quickLessLikeReadyWorkerTabs.delete(tabId);
      await recordHelperLifecycle("quickLessLikeRecommendationWorkerResetHome", { tabId, runId: id });
    } else {
      await recordHelperLifecycle("quickLessLikeRecommendationWorkerReused", { tabId, runId: id });
    }
    await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: tabId });
    return { ok: true, status: "recommendation-worker-available", tabId };
  }
  const preferredUrl = await preferredQuickLessLikeRecommendationWorkerUrl();
  const created = await tabsCreate({ url: preferredUrl.href, active: false });
  const tabId = Number(created?.tab?.id || 0);
  if (!created?.ok || !Number.isFinite(tabId) || !tabId) {
    return { ok: false, status: "recommendation-worker-create-failed", tabId: 0, error: created?.error || "" };
  }
  quickLessLikeWorkerTabIds.add(tabId);
  quickLessLikePersistentWorkerTabId = tabId;
  if (id) quickLessLikeBulkWorkerTabs.set(id, tabId);
  await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: tabId });
  await recordHelperLifecycle("quickLessLikeRecommendationWorkerCreated", { tabId, runId: id });
  return { ok: true, status: "recommendation-worker-created", tabId };
}

async function probeQuickLessLikeRecommendationWorker(tabId, force = false, timeoutMs = 12000) {
  const id = Number(tabId || 0);
  if (!Number.isFinite(id) || !id) return { ok: false, ready: false, status: "recommendation-worker-missing" };
  const cachedAt = Number(quickLessLikeReadyWorkerTabs.get(id) || 0);
  if (!force && cachedAt && Date.now() - cachedAt < QUICK_LESS_LIKE_READY_TTL_MS) {
    return { ok: true, ready: true, status: "recommendation-worker-ready", cached: true, tabId: id };
  }
  const deadline = Date.now() + Math.max(2000, Number(timeoutMs || 12000));
  let last = null;
  while (Date.now() < deadline) {
    const tab = await tabsGet(id);
    if (!tab) return { ok: false, ready: false, status: "recommendation-worker-closed", tabId: id };
    const currentUrl = tab.url || tab.pendingUrl || "";
    if (!isKnownQuickLessLikeRecommendationWorkerTab(id, currentUrl)) {
      return { ok: false, ready: false, status: "recommendation-worker-wrong-page", tabId: id };
    }
    const response = await tabsSendMessage(id, { type: "DS_QUICK_LESS_LIKE_WORKER_READY" });
    if (response) last = response;
    if (response?.ready) {
      quickLessLikeReadyWorkerTabs.set(id, Date.now());
      await recordHelperLifecycle("quickLessLikeRecommendationWorkerReady", {
        tabId: id,
        nativeSignedSamples: Number(response?.nativeSignedSamples || 0),
        candidateTokenCount: Number(response?.candidateTokenCount || 0),
        recombeeValidated: !!response?.recombeeValidated,
        tokenSource: String(response?.tokenSource || "")
      });
      return { ...response, tabId: id };
    }
    if (["not-recommendation-worker", "not-worker"].includes(String(response?.status || ""))) {
      return { ...response, ok: false, ready: false, tabId: id };
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return {
    ...(last || {}), ok: false, ready: false, status: "recommendation-worker-not-ready", tabId: id,
    reason: String(last?.reason || "SpicyChat Home did not expose a ready recommendation/auth context in time.")
  };
}

function cachedReadyQuickLessLikeBulkWorker(runId = "") {
  const id = String(runId || "").trim();
  if (!id || quickLessLikeClosedBulkRuns.has(id)) return null;
  const tabId = Number(quickLessLikeBulkWorkerTabs.get(id) || 0);
  const readyAt = Number(quickLessLikeReadyWorkerTabs.get(tabId) || 0);
  if (!tabId || !readyAt || Date.now() - readyAt >= QUICK_LESS_LIKE_READY_TTL_MS) return null;
  return {
    ok: true,
    ready: true,
    status: "recommendation-worker-ready-cached",
    cached: true,
    tabId
  };
}

async function ensureQuickLessLikeRecommendationWorker(runId = "", { allowReload = true } = {}) {
  const worker = await createOrReuseQuickLessLikeRecommendationWorker(runId);
  if (!worker?.ok) return worker;
  const tabId = Number(worker.tabId || 0);
  let ready = await probeQuickLessLikeRecommendationWorker(tabId, false);
  if (ready?.ready) return { ...ready, ok: true, tabId };
  if (!allowReload || ready?.status === "recommendation-worker-closed") return ready;

  // Do not throw away a healthy Home runtime just because token discovery is
  // still finishing. A native signed Recombee sample, usable auth/user state,
  // or discovered candidates all prove that the helper itself is alive. Give
  // that same page a short extra window instead of paying for another complete
  // SpicyChat startup (OAuth, settings, banners, queue, etc.).
  const hasRecommendationEvidence = !!(
    Number(ready?.nativeSignedSamples || 0) > 0 ||
    Number(ready?.candidateTokenCount || 0) > 0 ||
    ready?.recombeeValidated
  );
  if (hasRecommendationEvidence) {
    const extended = await probeQuickLessLikeRecommendationWorker(tabId, true, 5000);
    if (extended?.ready) return { ...extended, ok: true, tabId };
    // A reload would discard the native signed request we can use to verify the
    // real token offline. Preserve this worker and report not-ready instead of
    // rebooting SpicyChat and falling back to blind candidate POSTs.
    return { ...(extended || ready), ok: false, ready: false, tabId };
  }

  const tab = await tabsGet(tabId);
  if (!tab) return { ok: false, ready: false, status: "recommendation-worker-closed", tabId };
  const reset = await tabsUpdate(tabId, { url: quickLessLikeRecommendationWorkerUrl().href, active: false });
  if (!reset?.ok) return { ok: false, ready: false, status: "recommendation-worker-navigation-failed", tabId };
  quickLessLikeReadyWorkerTabs.delete(tabId);
  await recordHelperLifecycle("quickLessLikeRecommendationWorkerReloaded", { tabId, runId: String(runId || "") });
  ready = await probeQuickLessLikeRecommendationWorker(tabId, true);
  return { ...ready, tabId };
}

async function prepareQuickLessLikeBulkWorker(message) {
  const runId = String(message?.bulkRunId || "").trim();
  if (!runId) return { ok: false, status: "invalid-run" };
  quickLessLikeClosedBulkRuns.delete(runId);
  return ensureQuickLessLikeRecommendationWorker(runId, { allowReload: true });
}

async function releaseQuickLessLikeStandaloneWorker() {
  const tabId = Number(quickLessLikePersistentWorkerTabId || 0);
  if (!Number.isFinite(tabId) || !tabId) return false;
  if ([...quickLessLikeBulkWorkerTabs.values()].some(value => Number(value) === tabId)) return false;
  quickLessLikeWorkerTabIds.delete(tabId);
  quickLessLikeReadyWorkerTabs.delete(tabId);
  quickLessLikePersistentWorkerTabId = null;
  await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: 0 });
  const result = await tabsRemove(tabId);
  if (result?.ok) await recordHelperLifecycle("quickLessLikeRecommendationWorkerSingleClosed", { tabId });
  return !!result?.ok;
}

async function runDirectCharacterFeedback(message, mode) {
  const totalStartedAt = Date.now();
  const botId = String(message?.botId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(botId) || !["less-like", "dislike"].includes(mode)) return { ok: false, status: "invalid-bot" };
  const runId = String(message?.bulkRunId || "").trim();
  if (runId && quickLessLikeClosedBulkRuns.has(runId)) {
    return { ok: false, status: "recommendation-worker-closed", feedbackTabsTried: 0, requestSent: false, networkAttempts: 0 };
  }

  const workerStartedAt = Date.now();
  // Bulk runs already prepared and validated one dedicated helper. Reuse its
  // cached tab identity directly instead of tabs.get + lifecycle/session writes
  // for every bot. A real send failure still falls through to the existing
  // self-heal/closed-worker path below.
  const worker = cachedReadyQuickLessLikeBulkWorker(runId)
    || await ensureQuickLessLikeRecommendationWorker(runId, { allowReload: true });
  const workerReadyMs = Date.now() - workerStartedAt;
  if (!worker?.ready) {
    return { ...worker, ok: false, feedbackTabsTried: worker?.tabId ? 1 : 0, requestSent: false, networkAttempts: 0, workerReadyMs, totalMs: Date.now() - totalStartedAt };
  }

  const tabId = Number(worker.tabId || 0);
  let coordinatorWaitMs = 0;
  let feedbackMs = 0;
  let response = null;
  let result = null;

  const sendFeedback = async () => {
    const feedbackStartedAt = Date.now();
    response = await tabsSendMessage(tabId, {
      type: "DS_DIRECT_CHARACTER_FEEDBACK", mode, botId,
      botName: String(message?.botName || "").slice(0, 160)
    });
    feedbackMs += Date.now() - feedbackStartedAt;
    return response;
  };

  const lease = await acquireBackgroundJob("recommendation-feedback", {
    ownerTabId: tabId,
    detail: botId,
    maxHoldMs: 50000
  });
  coordinatorWaitMs += Number(lease?.waitMs || 0);
  try {
    await sendFeedback();
  } finally {
    releaseBackgroundJob(lease?.leaseId);
  }

  result = response?.status ? { ...response, feedbackTabId: tabId, feedbackTabsTried: 1 } : {
    ok: false, status: "direct-feedback-unavailable", feedbackTabId: tabId, feedbackTabsTried: 1,
    requestSent: false, networkAttempts: 0
  };
  const mayHaveSentRating = !!result?.requestSent || Number(result?.networkAttempts || 0) > 0;
  const recoverableBeforeSend = new Set([
    "direct-feedback-unavailable", "recombee-token-not-found", "recombee-user-not-found",
    "character-auth-not-ready", "character-auth-rejected", "not-worker"
  ]);
  if (!result?.ok && !mayHaveSentRating && recoverableBeforeSend.has(String(result?.status || ""))) {
    quickLessLikeReadyWorkerTabs.delete(tabId);
    const reset = await tabsUpdate(tabId, { url: quickLessLikeRecommendationWorkerUrl().href, active: false });
    if (reset?.ok) {
      await recordHelperLifecycle("quickLessLikeRecommendationWorkerSelfHeal", { tabId, runId, status: String(result?.status || "") });
      const healed = await probeQuickLessLikeRecommendationWorker(tabId, true);
      if (healed?.ready) {
        const retryLease = await acquireBackgroundJob("recommendation-feedback", { ownerTabId: tabId, detail: `${botId}:retry`, maxHoldMs: 50000 });
        coordinatorWaitMs += Number(retryLease?.waitMs || 0);
        try {
          await sendFeedback();
        } finally {
          releaseBackgroundJob(retryLease?.leaseId);
        }
        if (response?.status) result = { ...response, feedbackTabId: tabId, feedbackTabsTried: 1, workerRecovered: true };
      } else {
        result = { ...healed, ok: false, feedbackTabId: tabId, feedbackTabsTried: 1, requestSent: false, networkAttempts: 0 };
      }
    } else if (!(await tabsGet(tabId)) || (runId && quickLessLikeClosedBulkRuns.has(runId))) {
      result = { ok: false, status: "recommendation-worker-closed", feedbackTabId: tabId, feedbackTabsTried: 1, requestSent: false, networkAttempts: 0 };
    }
  }
  if (result?.ok && ["less-liked", "disliked"].includes(result?.status)) quickLessLikeReadyWorkerTabs.set(tabId, Date.now());
  return {
    ...result,
    workerReadyMs,
    coordinatorWaitMs,
    feedbackMs,
    availabilityMs: Number(result?.availabilityMs || 0),
    ratingMs: Number(result?.ratingMs || 0),
    userLookupMs: Number(result?.userLookupMs || 0),
    totalMs: Date.now() - totalStartedAt
  };
}

async function runQuickLessLikeBot(message) {
  const totalStartedAt = Date.now();
  const botId = String(message?.botId || "").trim().toLowerCase();
  const botName = String(message?.botName || "").trim().slice(0, 160);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(botId)) return { ok: false, status: "invalid-bot" };
  if (message?.bulkRunId && isQuickLessLikeBulkRunCanceled(message.bulkRunId)) return { ok: false, status: "bulk-canceled" };
  if (message?.force !== true) {
    const history = await getQuickLessLikeHistory(message?.bulkRunId || "");
    const remembered = history.bots[botId];
    if (remembered) return { ok: true, status: "already-handled", rememberedStatus: remembered.status || "less-liked", handledAt: remembered.handledAt || 0 };

    const crossHandled = await completedRecommendationFeedbackForBot(botId, "less-like");
    if (crossHandled?.source === "dislike") {
      const handledAt = crossHandled.handledAt || Date.now();
      await rememberQuickLessLikeEntry(botId, {
        status: "less-liked",
        name: String(botName || crossHandled.name || "").slice(0, 160),
        handledAt,
        stage: "cross-feedback-dedupe",
        reason: "A successful Dislike rating for this bot is already recorded, so QoL skipped a duplicate recommendation rating POST.",
        httpStatus: 0
      }, {
        immediate: !String(message?.bulkRunId || "").trim(),
        runId: String(message?.bulkRunId || "").trim()
      });
      await recordHelperLifecycle("recommendationFeedbackCrossDedupe", {
        botId,
        skipped: "less-like",
        completedBy: "dislike"
      });
      return {
        ok: true,
        status: "already-handled",
        rememberedStatus: "less-liked",
        handledAt,
        crossHandledBy: "dislike",
        networkAttempts: 0,
        requestSent: false
      };
    }
  }

  let result;
  try {
    result = await runDirectCharacterFeedback(message, "less-like");
  } finally {
    if (!String(message?.bulkRunId || "").trim()) await releaseQuickLessLikeStandaloneWorker();
  }

  const historyStartedAt = Date.now();
  if (result?.ok && result.status === "less-liked") {
    const remembered = await rememberQuickLessLike(botId, botName, { immediate: !String(message?.bulkRunId || "").trim(), runId: String(message?.bulkRunId || "").trim() });
    if (remembered) result.handledAt = remembered.handledAt || Date.now();
  } else if (result?.status === "bot-not-found" && (result?.availabilityConfirmed || Number(message?.retryAttempt || 0) >= 1)) {
    const remembered = await rememberQuickLessLikeUnavailable(botId, botName, result, { immediate: !String(message?.bulkRunId || "").trim(), runId: String(message?.bulkRunId || "").trim() });
    result = {
      ...result,
      ok: true,
      status: "unavailable",
      rememberedStatus: "unavailable",
      handledAt: remembered?.handledAt || Date.now()
    };
  }
  const historyPersistMs = Date.now() - historyStartedAt;
  const timed = {
    ...result,
    historyPersistMs,
    totalMs: Date.now() - totalStartedAt
  };
  const feedbackTabId = Number(timed?.feedbackTabId || 0);
  if (feedbackTabId && !String(message?.bulkRunId || "").trim()) {
    tabsSendMessage(feedbackTabId, {
      type: "DS_QUICK_LESS_LIKE_TIMING",
      botId,
      timing: {
        workerReadyMs: Number(timed.workerReadyMs || 0),
        coordinatorWaitMs: Number(timed.coordinatorWaitMs || 0),
        feedbackMs: Number(timed.feedbackMs || timed.elapsedMs || 0),
        availabilityMs: Number(timed.availabilityMs || 0),
        ratingMs: Number(timed.ratingMs || 0),
        userLookupMs: Number(timed.userLookupMs || 0),
        historyPersistMs,
        totalMs: Number(timed.totalMs || 0),
        requestElapsedMs: Number(timed.elapsedMs || 0),
        networkAttempts: Number(timed.networkAttempts || 0),
        status: String(timed.status || "")
      }
    }).catch?.(() => null);
  }
  return timed;
}


function isBotStatusWorkerUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return isSpicyChatUrl(parsed.href) && parsed.searchParams.get("dsQolBotStatusWorker") === "1";
  } catch { return false; }
}

function isUsableBotStatusPage(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!isSpicyChatUrl(parsed.href)) return false;
    // Do not borrow a tab that belongs to another QoL helper workflow.
    if (parsed.searchParams.get("dsQolRecommendationWorker") === "1") return false;
    if (parsed.searchParams.get("dsQuickDislike") === "1") return false;
    if (parsed.searchParams.get("dsListFill") === "1") return false;
    if (parsed.searchParams.get("dsBotStatus") === "1") return false;
    return true;
  } catch { return false; }
}

function createBotStatusWorkerSessionId() {
  try {
    if (crypto?.randomUUID) return `bot-status:${crypto.randomUUID()}`;
  } catch {}
  return `bot-status:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function botStatusWorkerLastActivityAt() {
  return Math.max(Number(botStatusWorkerHeartbeatAt || 0), Number(botStatusWorkerActivityAt || 0));
}

function botStatusHeartbeatFresh(tab = null) {
  const lastAt = botStatusWorkerLastActivityAt();
  if (!lastAt) return false;
  const inactiveOwnedHelper = !!botStatusWorkerOwned && tab?.active !== true;
  const ttl = (inactiveOwnedHelper || botStatusWorkerRequestActive)
    ? BOT_STATUS_WORKER_THROTTLED_TTL_MS
    : BOT_STATUS_WORKER_HEARTBEAT_TTL_MS;
  return Date.now() - lastAt <= ttl;
}

async function runTrackedBotStatusRequest(task) {
  botStatusWorkerRequestActive = true;
  botStatusWorkerActivityAt = Date.now();
  try {
    return await task();
  } finally {
    botStatusWorkerRequestActive = false;
    botStatusWorkerActivityAt = Date.now();
  }
}

function noteBotStatusWorkerHeartbeat(tabId, sessionId = "") {
  const id = Number(tabId || 0);
  if (!id || Number(botStatusWorkerTabId || 0) !== id) return false;
  const supplied = String(sessionId || "").trim();
  if (supplied && botStatusWorkerSessionId && supplied !== botStatusWorkerSessionId) return false;
  if (supplied && !botStatusWorkerSessionId) botStatusWorkerSessionId = supplied;
  botStatusWorkerHeartbeatAt = Date.now();
  return true;
}

function botStatusRestartDelayMs(nextRestartCount) {
  const count = Math.max(1, Number(nextRestartCount || 1));
  if (count <= 1) return 0;
  if (count === 2) return 5000;
  if (count === 3) return 15000;
  if (count === 4) return 30000;
  return 60000;
}

async function waitForBotStatusRestartBackoff() {
  const waitMs = Math.max(0, Number(botStatusWorkerRestartBackoffUntil || 0) - Date.now());
  if (!waitMs) return;
  await recordHelperLifecycle("bot-status-worker-backoff", {
    waitMs,
    restartCount: Number(botStatusWorkerRestartCount || 0)
  });
  await new Promise(resolve => setTimeout(resolve, waitMs));
}

async function probeBotStatusWorker(tabId, timeoutMs = 7000) {
  const id = Number(tabId || 0);
  if (!id) return { ok: false, ready: false, status: "worker-missing" };
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 7000);
  let last = null;
  while (Date.now() < deadline) {
    const tab = await tabsGet(id);
    if (!tab) return { ok: false, ready: false, status: "worker-closed" };
    const remaining = Math.max(500, deadline - Date.now());
    await tabsSendMessageWithTimeout(id, {
      type: "DS_BOT_STATUS_MARK_WORKER",
      phase: "probe",
      sessionId: botStatusWorkerSessionId || ""
    }, Math.min(900, remaining));
    const response = await tabsSendMessageWithTimeout(id, {
      type: "DS_BOT_STATUS_WORKER_READY",
      sessionId: botStatusWorkerSessionId || ""
    }, Math.min(1400, remaining));
    if (response?.__dsTimeout) last = { ok: false, ready: false, status: "worker-message-timeout" };
    else if (response) last = response;
    if (response?.ready) {
      botStatusWorkerActivityAt = Date.now();
      noteBotStatusWorkerHeartbeat(id, response?.sessionId || botStatusWorkerSessionId);
      return { ...response, ok: true, ready: true, tabId: id, sessionId: botStatusWorkerSessionId || response?.sessionId || "" };
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return { ...(last || {}), ok: false, ready: false, status: last?.status || "worker-timeout", tabId: id };
}

async function rememberBotStatusWorker(tabId, owned, sessionId = botStatusWorkerSessionId) {
  const id = Number(tabId || 0);
  const nextSessionId = id ? String(sessionId || botStatusWorkerSessionId || createBotStatusWorkerSessionId()) : "";
  botStatusWorkerSessionId = nextSessionId;
  if (!id) {
    botStatusWorkerHeartbeatAt = 0;
    botStatusWorkerActivityAt = 0;
    botStatusWorkerRequestActive = false;
  }
  await storageSessionSet({
    [BOT_STATUS_WORKER_SESSION_TAB_KEY]: id || 0,
    [BOT_STATUS_WORKER_SESSION_OWNED_KEY]: !!owned,
    [BOT_STATUS_WORKER_SESSION_ID_KEY]: nextSessionId
  });
}

async function restoreBotStatusWorkerSession() {
  if (Number(botStatusWorkerTabId || 0)) return;
  const stored = await storageSessionGet([
    BOT_STATUS_WORKER_SESSION_TAB_KEY,
    BOT_STATUS_WORKER_SESSION_OWNED_KEY,
    BOT_STATUS_WORKER_SESSION_ID_KEY
  ]);
  const id = Number(stored?.[BOT_STATUS_WORKER_SESSION_TAB_KEY] || 0);
  if (!id) return;
  const tab = await tabsGet(id);
  if (!tab || !isUsableBotStatusPage(tab.url || tab.pendingUrl || "")) {
    await rememberBotStatusWorker(0, false);
    return;
  }
  botStatusWorkerTabId = id;
  botStatusWorkerOwned = !!stored?.[BOT_STATUS_WORKER_SESSION_OWNED_KEY];
  botStatusWorkerSessionId = String(stored?.[BOT_STATUS_WORKER_SESSION_ID_KEY] || botStatusWorkerSessionId || createBotStatusWorkerSessionId());
  if (botStatusWorkerOwned) botStatusWorkerTabIds.add(id);
}

async function releaseBotStatusWorker({ reason = "normal-release" } = {}) {
  await restoreBotStatusWorkerSession();
  const id = Number(botStatusWorkerTabId || 0);
  const owned = !!botStatusWorkerOwned;
  botStatusWorkerTabId = null;
  botStatusWorkerOwned = false;
  botStatusWorkerHeartbeatAt = 0;
  botStatusWorkerActivityAt = 0;
  botStatusWorkerRequestActive = false;
  botStatusWorkerTabIds.clear();
  await rememberBotStatusWorker(0, false, "");
  if (!id || !owned) return 0;
  const tab = await tabsGet(id);
  if (!tab) return 0;
  botStatusWorkerExpectedCloseIds.add(id);
  await tabsRemove(id);
  await recordHelperLifecycle("bot-status-worker-released", { tabId: id, reason: String(reason || "normal-release") });
  return 1;
}

async function findBorrowableBotStatusTab() {
  const tabs = await tabsQuery({});
  const candidates = tabs
    .filter(tab => tab?.id && isUsableBotStatusPage(tab.url || tab.pendingUrl || ""))
    .sort((a, b) => Number(b.active || false) - Number(a.active || false) || Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  for (const tab of candidates) {
    const ready = await probeBotStatusWorker(Number(tab.id), 1200);
    if (ready?.ready) return Number(tab.id);
  }
  return 0;
}

async function prepareBotStatusWorker({ forceOwnHelper = false } = {}) {
  await restoreBotStatusWorkerSession();
  let tab = Number.isFinite(Number(botStatusWorkerTabId)) ? await tabsGet(Number(botStatusWorkerTabId)) : null;

  // Bulk Bot Status scans deliberately use one QoL-owned Home helper. Do not
  // keep borrowing an arbitrary profile/editor/chat tab just because it has the
  // content scripts loaded; those pages can have different auth/runtime state.
  if (forceOwnHelper && tab?.id && !botStatusWorkerOwned) {
    botStatusWorkerTabId = null;
    botStatusWorkerOwned = false;
    botStatusWorkerTabIds.clear();
    await rememberBotStatusWorker(0, false);
    tab = null;
  }

  if (tab?.id) {
    const ready = await probeBotStatusWorker(Number(tab.id), botStatusWorkerOwned ? 10000 : 1500);
    if (ready?.ready) {
      await rememberBotStatusWorker(Number(tab.id), !!botStatusWorkerOwned, ready?.sessionId || botStatusWorkerSessionId);
      await recordHelperLifecycle("bot-status-worker-ready", {
        tabId: Number(tab.id),
        reused: true,
        owned: !!botStatusWorkerOwned,
        sessionId: botStatusWorkerSessionId || ""
      });
      return { tabId: Number(tab.id), owned: !!botStatusWorkerOwned, ready: true, sessionId: botStatusWorkerSessionId || "" };
    }
    // A router URL change is no longer treated as worker death. If the worker
    // is still heartbeating, keep the durable tab identity and let the API
    // request retry through the existing serial deadline.
    if (botStatusWorkerOwned && botStatusHeartbeatFresh(tab)) {
      await recordHelperLifecycle("bot-status-worker-throttle-aware-alive", {
        tabId: Number(tab.id),
        status: String(ready?.status || "not-ready"),
        active: !!tab.active,
        requestActive: !!botStatusWorkerRequestActive,
        heartbeatAgeMs: botStatusWorkerHeartbeatAt ? Date.now() - Number(botStatusWorkerHeartbeatAt) : -1,
        activityAgeMs: botStatusWorkerLastActivityAt() ? Date.now() - botStatusWorkerLastActivityAt() : -1,
        throttleGraceMs: BOT_STATUS_WORKER_THROTTLED_TTL_MS
      });
      return {
        tabId: Number(tab.id),
        owned: true,
        ready: true,
        status: "heartbeat-alive",
        sessionId: botStatusWorkerSessionId || ""
      };
    }
    await recordHelperLifecycle("bot-status-worker-lost", { tabId: Number(tab.id), owned: !!botStatusWorkerOwned, status: String(ready?.status || "not-ready") });
    if (botStatusWorkerOwned) {
      botStatusWorkerExpectedCloseIds.add(Number(tab.id));
      await tabsRemove(Number(tab.id));
    }
    botStatusWorkerTabId = null;
    botStatusWorkerOwned = false;
    botStatusWorkerHeartbeatAt = 0;
    botStatusWorkerActivityAt = 0;
    botStatusWorkerRequestActive = false;
    botStatusWorkerTabIds.clear();
    await rememberBotStatusWorker(0, false, "");
  }

  if (!forceOwnHelper) {
    const borrowedId = await findBorrowableBotStatusTab();
    if (borrowedId) {
      botStatusWorkerTabId = borrowedId;
      botStatusWorkerOwned = false;
      await rememberBotStatusWorker(borrowedId, false);
      return { tabId: borrowedId, owned: false };
    }
  }

  await waitForBotStatusRestartBackoff();
  const existing = (await tabsQuery({})).filter(item => item?.id && isBotStatusWorkerUrl(item.url || item.pendingUrl || ""));
  existing.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  let helper = existing[0] || null;
  for (const duplicate of existing.slice(1)) await tabsRemove(Number(duplicate.id));
  if (!botStatusWorkerSessionId) botStatusWorkerSessionId = createBotStatusWorkerSessionId();
  if (!helper?.id) {
    await recordHelperLifecycle("bot-status-worker-opening", {
      reason: "create-owned-home-helper",
      sessionId: botStatusWorkerSessionId
    });
    const created = await tabsCreate({ url: BOT_STATUS_HOME_WORKER_URL, active: false });
    helper = created?.ok ? created.tab : null;
    if (helper?.id) await recordHelperLifecycle("bot-status-worker-restart", {
      tabId: Number(helper.id),
      reason: "new-owned-helper",
      sessionId: botStatusWorkerSessionId,
      restartCount: Number(botStatusWorkerRestartCount || 0)
    });
  }
  const tabId = Number(helper?.id || 0);
  if (!tabId) return { tabId: 0, owned: false };
  botStatusWorkerTabId = tabId;
  botStatusWorkerOwned = true;
  botStatusWorkerTabIds.clear();
  botStatusWorkerTabIds.add(tabId);
  await rememberBotStatusWorker(tabId, true, botStatusWorkerSessionId);
  const ready = await probeBotStatusWorker(tabId, 10000);
  if (!ready?.ready) {
    await recordHelperLifecycle("bot-status-worker-lost", { tabId, owned: true, status: String(ready?.status || "worker-timeout"), reason: "startup-not-ready" });
    return { tabId, owned: true, ready: false, status: ready?.status || "worker-timeout" };
  }
  noteBotStatusWorkerHeartbeat(tabId, ready?.sessionId || botStatusWorkerSessionId);
  await recordHelperLifecycle("bot-status-worker-ready", {
    tabId,
    reused: false,
    owned: true,
    sessionId: botStatusWorkerSessionId || ""
  });
  await tabsSendMessage(tabId, {
    type: "DS_BOT_STATUS_DIAG_EVENT",
    event: "bot-status-worker-ready",
    detail: { tabId, owned: true, sessionId: botStatusWorkerSessionId || "" }
  });
  return { tabId, owned: true, ready: true, sessionId: botStatusWorkerSessionId || "" };
}

function botStatusApiResponseIsTransient(response) {
  const status = String(response?.status || "");
  if (["api-bridge-not-ready", "auth-unavailable", "worker-no-response"].includes(status)) return true;
  const reason = String(response?.reason || "");
  return /auth(?:entication)?[^.;]{0,30}(?:unavailable|not ready)|no reusable auth|bridge[^.;]{0,30}(?:unavailable|timeout|not ready)/i.test(reason);
}

async function waitForBotStatusApiCheck(tabId, botId, timeoutMs = 12000) {
  const id = Number(tabId || 0);
  if (!id) return null;
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 12000);
  let response = null;
  do {
    const remaining = Math.max(500, deadline - Date.now());
    response = await tabsSendMessageWithTimeout(id, { type: "DS_BOT_STATUS_API_CHECK", botId }, Math.min(12000, remaining));
    if (response?.__dsTimeout) {
      return { ok: false, ready: true, status: "worker-timeout", httpStatus: 0, reason: "Bot Status helper did not answer this API check in time." };
    }
    if (response && !botStatusApiResponseIsTransient(response)) return response;
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 400));
  } while (Date.now() < deadline);
  return response || { ok: false, ready: true, status: "worker-timeout", httpStatus: 0, reason: "Bot Status helper timed out before returning a result." };
}

async function runBotStatusHelperCheck(message) {
  const botId = String(message?.botId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(botId)) return { ok: false, status: "invalid-bot" };

  const forceOwnHelper = !!message?.forceOwnHelper;
  let worker = await prepareBotStatusWorker({ forceOwnHelper });
  let tabId = Number(worker?.tabId || 0);
  if (!tabId) return { ok: false, ready: true, status: "worker-tab-failed", httpStatus: 0, reason: "Could not create or reuse the Bot Status helper." };

  // QoL-owned Home helpers get one total API deadline rather than stacking an
  // initial long request plus another long retry. A broken bot/runtime can
  // therefore never pin the whole serial scan indefinitely.
  let response = null;
  response = await runTrackedBotStatusRequest(() => withBackgroundJob("bot-status", { ownerTabId: tabId, detail: botId, maxHoldMs: 15000 }, async () => {
    if (worker.owned || forceOwnHelper) {
      return await waitForBotStatusApiCheck(tabId, botId, 12000);
    }
    const direct = await tabsSendMessageWithTimeout(tabId, { type: "DS_BOT_STATUS_API_CHECK", botId }, 10000);
    if (direct?.__dsTimeout) {
      return { ok: false, ready: true, status: "worker-timeout", httpStatus: 0, reason: "Bot Status helper did not answer this API check in time." };
    }
    return direct;
  }));

  const status = String(response?.status || "");
  const shouldRetryOnOwnHelper = !forceOwnHelper && !worker.owned && (!response || ["api-bridge-not-ready", "auth-unavailable", "worker-error", "unknown", "worker-timeout"].includes(status));
  if (shouldRetryOnOwnHelper) {
    botStatusWorkerTabId = null;
    botStatusWorkerOwned = false;
    await rememberBotStatusWorker(0, false);
    worker = await prepareBotStatusWorker({ forceOwnHelper: true });
    tabId = Number(worker?.tabId || 0);
    if (tabId) response = await runTrackedBotStatusRequest(() => withBackgroundJob("bot-status", { ownerTabId: tabId, detail: `${botId}:retry`, maxHoldMs: 15000 }, () => waitForBotStatusApiCheck(tabId, botId, 12000)));
  }

  const finalStatus = String(response?.status || "");
  if (finalStatus === "worker-timeout" && worker.owned) {
    const workerTab = await tabsGet(tabId);
    if (botStatusHeartbeatFresh(workerTab)) {
      // The page is alive; only this character request timed out. Keep the
      // worker and let the serial queue continue instead of rebuilding Home.
      await recordHelperLifecycle("bot-status-request-timeout-worker-alive", {
        tabId,
        heartbeatAgeMs: botStatusWorkerHeartbeatAt ? Date.now() - Number(botStatusWorkerHeartbeatAt) : -1,
        activityAgeMs: botStatusWorkerLastActivityAt() ? Date.now() - botStatusWorkerLastActivityAt() : -1,
        requestActive: !!botStatusWorkerRequestActive
      });
    } else {
      // Only a real request + heartbeat timeout is allowed to discard the
      // durable worker identity. Repeated restarts back off instead of hammering Home.
      botStatusWorkerRestartCount = Math.max(0, Number(botStatusWorkerRestartCount || 0)) + 1;
      const delayMs = botStatusRestartDelayMs(botStatusWorkerRestartCount);
      botStatusWorkerRestartBackoffUntil = Date.now() + delayMs;
      await recordHelperLifecycle("bot-status-worker-timeout", {
        tabId,
        restartCount: botStatusWorkerRestartCount,
        nextRestartDelayMs: delayMs,
        heartbeatAgeMs: botStatusWorkerHeartbeatAt ? Date.now() - botStatusWorkerHeartbeatAt : -1
      });
      await releaseBotStatusWorker({ reason: "request-and-heartbeat-timeout" });
    }
  } else {
    if (response && !["worker-error", "api-bridge-not-ready", "auth-unavailable", "worker-no-response"].includes(finalStatus)) {
      botStatusWorkerRestartCount = 0;
      botStatusWorkerRestartBackoffUntil = 0;
      noteBotStatusWorkerHeartbeat(tabId, worker?.sessionId || botStatusWorkerSessionId);
    }
    if (!message?.keepHelper) await releaseBotStatusWorker({ reason: "normal-release" });
  }
  return response || { ok: false, ready: true, status: "worker-no-response", httpStatus: 0, reason: "Bot Status helper returned no response." };
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


function settingStorageKey(name) {
  return `${GRANULAR_SETTING_PREFIX}${String(name || "").trim()}`;
}

function settingNameFromStorageKey(key) {
  const value = String(key || "");
  return value.startsWith(GRANULAR_SETTING_PREFIX) ? value.slice(GRANULAR_SETTING_PREFIX.length) : "";
}


const LARGE_STORAGE_DB_NAME = "dragon-spicychat-qol-large-v1";
const LARGE_STORAGE_DB_VERSION = 2;
const LARGE_STORAGE_META_STORE = "__meta";
const LARGE_STORAGE_KEYS = new Set(["botAvailability", "botArchive", "lorebookStatus"]);
let largeStorageDbPromise = null;
const largeStorageMigrationPromises = new Map();

function largeStorageRequestedKeys(keys) {
  if (keys == null) return [...LARGE_STORAGE_KEYS];
  const list = typeof keys === "string" ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys || {}));
  return [...new Set(list.filter(key => LARGE_STORAGE_KEYS.has(String(key || ""))))];
}

function largeStorageLocalKeys(keys) {
  if (keys == null) return null;
  if (typeof keys === "string") return LARGE_STORAGE_KEYS.has(keys) ? [] : [keys];
  if (Array.isArray(keys)) return keys.filter(key => !LARGE_STORAGE_KEYS.has(String(key || "")));
  if (keys && typeof keys === "object") {
    return Object.fromEntries(Object.entries(keys).filter(([key]) => !LARGE_STORAGE_KEYS.has(String(key || ""))));
  }
  return keys;
}

function openLargeStorageDb() {
  if (largeStorageDbPromise) return largeStorageDbPromise;
  largeStorageDbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(LARGE_STORAGE_DB_NAME, LARGE_STORAGE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const key of LARGE_STORAGE_KEYS) {
          if (!db.objectStoreNames.contains(key)) db.createObjectStore(key, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(LARGE_STORAGE_META_STORE)) {
          db.createObjectStore(LARGE_STORAGE_META_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open QoL large-data IndexedDB."));
      request.onblocked = () => reject(new Error("QoL large-data IndexedDB upgrade was blocked."));
    } catch (error) {
      reject(error);
    }
  }).catch(error => {
    largeStorageDbPromise = null;
    throw error;
  });
  return largeStorageDbPromise;
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function idbTransactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
  });
}

function normalizeLargeStorageRecords(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawMeta = source.meta && typeof source.meta === "object" && !Array.isArray(source.meta) ? source.meta : source;
  const records = [];
  for (const [rawId, rawValue] of Object.entries(rawMeta || {})) {
    const id = String(rawId || rawValue?.id || "").trim();
    if (!id || !rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) continue;
    records.push({ id, value: rawValue });
  }
  return records;
}

async function largeStorageMeta(key) {
  const db = await openLargeStorageDb();
  const tx = db.transaction(LARGE_STORAGE_META_STORE, "readonly");
  return (await idbRequest(tx.objectStore(LARGE_STORAGE_META_STORE).get(key))) || null;
}

async function writeLargeStorageMeta(key, extra = {}) {
  const db = await openLargeStorageDb();
  const tx = db.transaction(LARGE_STORAGE_META_STORE, "readwrite");
  tx.objectStore(LARGE_STORAGE_META_STORE).put({ key, migrated: true, updatedAt: Date.now(), ...extra });
  await idbTransactionDone(tx);
  return true;
}

async function replaceLargeStorage(key, value, { markMigrated = true } = {}) {
  if (!LARGE_STORAGE_KEYS.has(key)) return false;
  const records = normalizeLargeStorageRecords(value);
  const db = await openLargeStorageDb();
  const tx = db.transaction([key, LARGE_STORAGE_META_STORE], "readwrite");
  const store = tx.objectStore(key);
  store.clear();
  for (const record of records) store.put(record);
  if (markMigrated) {
    tx.objectStore(LARGE_STORAGE_META_STORE).put({
      key,
      migrated: true,
      updatedAt: Date.now(),
      count: records.length
    });
  }
  await idbTransactionDone(tx);
  return true;
}

async function mergeLargeStorageEntries(key, entries) {
  if (!LARGE_STORAGE_KEYS.has(key)) return false;
  const startedAt = Date.now();
  await ensureLargeStorageMigrated(key);
  const records = normalizeLargeStorageRecords({ meta: entries });
  if (!records.length) return true;
  const db = await openLargeStorageDb();
  const tx = db.transaction([key, LARGE_STORAGE_META_STORE], "readwrite");
  const store = tx.objectStore(key);
  for (const record of records) store.put(record);
  tx.objectStore(LARGE_STORAGE_META_STORE).put({ key, migrated: true, updatedAt: Date.now() });
  await idbTransactionDone(tx);
  qolBackgroundTrace("storage", "indexeddb", { action: "merge", key, records: records.length, durationMs: Date.now() - startedAt });
  return true;
}

async function readLargeStorage(key) {
  if (!LARGE_STORAGE_KEYS.has(key)) return { meta: {} };
  const startedAt = Date.now();
  await ensureLargeStorageMigrated(key);
  const db = await openLargeStorageDb();
  const tx = db.transaction(key, "readonly");
  const rows = await idbRequest(tx.objectStore(key).getAll());
  const meta = {};
  for (const row of rows || []) {
    const id = String(row?.id || "").trim();
    if (id && row?.value && typeof row.value === "object") meta[id] = row.value;
  }
  qolBackgroundTrace("storage", "indexeddb", { action: "read-all", key, records: Object.keys(meta).length, durationMs: Date.now() - startedAt });
  return { meta };
}

async function readLargeStorageRecords(key, ids = []) {
  if (!LARGE_STORAGE_KEYS.has(key)) return {};
  const startedAt = Date.now();
  await ensureLargeStorageMigrated(key);
  const cleanIds = [...new Set((Array.isArray(ids) ? ids : [ids]).map(id => String(id || "").trim()).filter(Boolean))];
  if (!cleanIds.length) return {};
  const db = await openLargeStorageDb();
  const tx = db.transaction(key, "readonly");
  const store = tx.objectStore(key);
  const rows = await Promise.all(cleanIds.map(id => idbRequest(store.get(id)).catch(() => null)));
  const out = {};
  for (let i = 0; i < cleanIds.length; i += 1) {
    const value = rows[i]?.value;
    if (value && typeof value === "object") out[cleanIds[i]] = value;
  }
  qolBackgroundTrace("storage", "indexeddb", { action: "read-records", key, requested: cleanIds.length, records: Object.keys(out).length, durationMs: Date.now() - startedAt }, { level: "deep" });
  return out;
}

async function readLargeStoragePage(key, { afterId = "", limit = 250 } = {}) {
  if (!LARGE_STORAGE_KEYS.has(key)) return { key, rows: [], nextAfterId: "", done: true };
  const startedAt = Date.now();
  await ensureLargeStorageMigrated(key);
  const db = await openLargeStorageDb();
  const tx = db.transaction(key, "readonly");
  const store = tx.objectStore(key);
  const safeLimit = Math.max(25, Math.min(500, Number(limit) || 250));
  const cursorAfter = String(afterId || "").trim();
  const range = cursorAfter ? IDBKeyRange.lowerBound(cursorAfter, true) : null;
  const rows = await idbRequest(store.getAll(range, safeLimit));
  const cleanRows = [];
  for (const row of rows || []) {
    const id = String(row?.id || "").trim();
    if (!id || !row?.value || typeof row.value !== "object") continue;
    cleanRows.push({ id, value: row.value });
  }
  const nextAfterId = cleanRows.length ? cleanRows[cleanRows.length - 1].id : cursorAfter;
  const result = { key, rows: cleanRows, nextAfterId, done: (rows || []).length < safeLimit };
  qolBackgroundTrace("storage", "indexeddb", { action: "read-page", key, records: cleanRows.length, limit: safeLimit, done: result.done, durationMs: Date.now() - startedAt }, { level: "deep" });
  return result;
}

async function clearLargeStorage(key) {
  if (!LARGE_STORAGE_KEYS.has(key)) return false;
  const db = await openLargeStorageDb();
  const tx = db.transaction([key, LARGE_STORAGE_META_STORE], "readwrite");
  tx.objectStore(key).clear();
  tx.objectStore(LARGE_STORAGE_META_STORE).put({ key, migrated: true, updatedAt: Date.now(), count: 0 });
  await idbTransactionDone(tx);
  try { await new Promise(resolve => chrome.storage.local.remove([key], () => resolve())); } catch {}
  return true;
}

async function ensureLargeStorageMigrated(key) {
  if (!LARGE_STORAGE_KEYS.has(key)) return true;
  if (largeStorageMigrationPromises.has(key)) return largeStorageMigrationPromises.get(key);
  const promise = (async () => {
    const existingMeta = await largeStorageMeta(key).catch(() => null);
    if (existingMeta?.migrated) return true;

    // One-time .29 migration. Import the legacy monolithic object, verify the
    // per-record IDB count, then remove ONLY that legacy chrome.storage key.
    const legacy = await new Promise(resolve => {
      try { chrome.storage.local.get([key], value => resolve(value?.[key])); }
      catch { resolve(undefined); }
    });
    const records = normalizeLargeStorageRecords(legacy);
    await replaceLargeStorage(key, legacy);

    const db = await openLargeStorageDb();
    const tx = db.transaction(key, "readonly");
    const count = Number(await idbRequest(tx.objectStore(key).count())) || 0;
    if (count < records.length) throw new Error(`Large storage migration verification failed for ${key}.`);

    await writeLargeStorageMeta(key, { count });
    try { await new Promise(resolve => chrome.storage.local.remove([key], () => resolve())); } catch {}
    return true;
  })().finally(() => largeStorageMigrationPromises.delete(key));
  largeStorageMigrationPromises.set(key, promise);
  return promise;
}

async function getLargeStorageValues(keys) {
  const requested = largeStorageRequestedKeys(keys);
  const data = {};
  for (const key of requested) data[key] = await readLargeStorage(key);
  return data;
}

async function getLargeStorageStats() {
  const startedAt = Date.now();
  const stats = {};
  for (const key of LARGE_STORAGE_KEYS) {
    await ensureLargeStorageMigrated(key);
    const db = await openLargeStorageDb();
    const tx = db.transaction(key, "readonly");
    stats[key] = Number(await idbRequest(tx.objectStore(key).count())) || 0;
  }
  qolBackgroundTrace("storage", "indexeddb", { action: "stats", stores: Object.keys(stats).length, records: Object.values(stats).reduce((sum, value) => sum + Number(value || 0), 0), durationMs: Date.now() - startedAt }, { level: "deep" });
  return stats;
}

async function setLargeStorageValues(values) {
  const startedAt = Date.now();
  const source = values && typeof values === "object" && !Array.isArray(values) ? values : {};
  const changed = [];
  for (const key of LARGE_STORAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    await replaceLargeStorage(key, source[key]);
    try { await new Promise(resolve => chrome.storage.local.remove([key], () => resolve())); } catch {}
    changed.push(key);
  }
  qolBackgroundTrace("storage", "indexeddb", { action: "replace", keys: changed, stores: changed.length, durationMs: Date.now() - startedAt });
  return { ok: true, keys: changed };
}

async function storageGet(keys) {
  const largeKeys = largeStorageRequestedKeys(keys);
  let largeData = {};
  if (largeKeys.length) {
    try { largeData = await getLargeStorageValues(keys); } catch {}
  }

  const localKeys = largeStorageLocalKeys(keys);
  const requested = typeof localKeys === "string" ? [localKeys] : (Array.isArray(localKeys) ? localKeys : null);
  const wantsSettings = keys == null || requested?.includes("settings");
  const firstKeys = !wantsSettings || localKeys == null ? localKeys : [...new Set([...(requested || []), GRANULAR_SETTINGS_INDEX_KEY, GRANULAR_SETTINGS_MIGRATION_KEY])];
  const first = await new Promise(resolve => chrome.storage.local.get(firstKeys, resolve));
  const result = first || {};
  if (wantsSettings) {
    const index = [...new Set((Array.isArray(result[GRANULAR_SETTINGS_INDEX_KEY]) ? result[GRANULAR_SETTINGS_INDEX_KEY] : []).map(name => String(name || "").trim()).filter(Boolean))];
    granularSettingsIndexCache = new Set(index);
    const granular = localKeys == null || !index.length
      ? result
      : await new Promise(resolve => chrome.storage.local.get(index.map(settingStorageKey), resolve));
    const hadLegacy = result.settings && typeof result.settings === "object";
    const merged = hadLegacy ? { ...result.settings } : {};
    let found = false;
    for (const name of index) {
      const key = settingStorageKey(name);
      if (!Object.prototype.hasOwnProperty.call(granular || {}, key)) continue;
      merged[name] = granular[key];
      found = true;
    }
    if (hadLegacy || found) result.settings = merged;
    else delete result.settings;
  }
  return { ...result, ...largeData };
}

async function storageSet(values) {
  const payload = values && typeof values === "object" ? { ...values } : {};
  const largePayload = {};
  for (const key of LARGE_STORAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    largePayload[key] = payload[key];
    delete payload[key];
  }
  if (Object.keys(largePayload).length) await setLargeStorageValues(largePayload);
  if (payload.settings && typeof payload.settings === "object") {
    const settings = payload.settings;
    delete payload.settings;
    let indexChanged = false;
    for (const [name, value] of Object.entries(settings)) {
      payload[settingStorageKey(name)] = value;
      if (!granularSettingsIndexCache.has(name)) { granularSettingsIndexCache.add(name); indexChanged = true; }
    }
    if (indexChanged) payload[GRANULAR_SETTINGS_INDEX_KEY] = [...granularSettingsIndexCache].sort();
    payload[GRANULAR_SETTINGS_MIGRATION_KEY] = true;
    payload[GRANULAR_SETTINGS_REVISION_KEY] = Date.now();
  }
  if (!Object.keys(payload).length) return true;
  return new Promise(resolve => chrome.storage.local.set(payload, () => resolve(!chrome.runtime.lastError)));
}

// Bot Status scans can touch a relatively small set of IDs while the persisted
// availability/archive objects contain thousands of entries. Merge those deltas
// in the service worker so the Options document does not have to structured-clone
// and serialize the complete multi-megabyte stores on its UI thread.
let botStatusPersistQueue = Promise.resolve();

function botStatusDeltaEntries(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const [rawId, rawEntry] of Object.entries(source)) {
    const id = String(rawId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue;
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    out[id] = rawEntry;
  }
  return out;
}

function persistBotStatusDelta(message = {}) {
  const availabilityUpdates = botStatusDeltaEntries(message.availabilityUpdates);
  const archiveUpdates = botStatusDeltaEntries(message.archiveUpdates);
  const availabilityIds = Object.keys(availabilityUpdates);
  const archiveIds = Object.keys(archiveUpdates);

  if (!availabilityIds.length && !archiveIds.length) {
    return Promise.resolve({ ok: true, availability: 0, archive: 0 });
  }

  botStatusPersistQueue = botStatusPersistQueue.catch(() => null).then(async () => {
    try {
      // v0.2.29: per-bot IDB writes. A one-bot Bot Status result no longer
      // clones and rewrites the complete archive/availability objects.
      if (availabilityIds.length) await mergeLargeStorageEntries("botAvailability", availabilityUpdates);
      if (archiveIds.length) await mergeLargeStorageEntries("botArchive", archiveUpdates);
      return { ok: true, availability: availabilityIds.length, archive: archiveIds.length };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error),
        availability: availabilityIds.length,
        archive: archiveIds.length
      };
    }
  });

  return botStatusPersistQueue;
}

function storageSessionGet(keys) {
  return new Promise(resolve => {
    try {
      if (!chrome.storage?.session?.get) return resolve({});
      chrome.storage.session.get(keys, result => resolve(result || {}));
    } catch { resolve({}); }
  });
}

function storageSessionSet(values) {
  return new Promise(resolve => {
    try {
      if (!chrome.storage?.session?.set) return resolve(false);
      chrome.storage.session.set(values, () => resolve(!chrome.runtime.lastError));
    } catch { resolve(false); }
  });
}

async function getHelperRuntimeSession() {
  if (helperRuntimeSessionPromise) return helperRuntimeSessionPromise;
  helperRuntimeSessionPromise = (async () => {
    if (!chrome.storage?.session?.get || !chrome.storage?.session?.set) return { id: "", created: false, supported: false };
    const stored = await storageSessionGet([HELPER_RUNTIME_SESSION_KEY]);
    let id = String(stored[HELPER_RUNTIME_SESSION_KEY] || "").trim();
    if (id) return { id, created: false, supported: true };
    id = `hs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await storageSessionSet({ [HELPER_RUNTIME_SESSION_KEY]: id });
    return { id, created: true, supported: true };
  })();
  return helperRuntimeSessionPromise;
}

function normalizeActiveQuickDislikeJobs(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const jobs = source.jobs && typeof source.jobs === "object" ? source.jobs : {};
  const normalized = {};
  for (const [jobId, value] of Object.entries(jobs)) {
    const botId = String(value?.botId || "").trim().toLowerCase();
    if (!jobId || !/^[0-9a-f-]{20,}$/i.test(botId)) continue;
    normalized[jobId] = {
      jobId,
      botId,
      botName: String(value?.botName || "").slice(0, 160),
      chatUrl: String(value?.chatUrl || `https://spicychat.ai/chat/${botId}`),
      bulkRunId: String(value?.bulkRunId || "").trim(),
      createdAt: Number(value?.createdAt || value?.startedAt || 0) || Date.now(),
      startedAt: Number(value?.startedAt || 0) || Date.now(),
      tabId: Number(value?.tabId || 0) || 0,
      recoveryCount: Math.max(0, Number(value?.recoveryCount || 0) || 0),
      status: String(value?.status || "active").slice(0, 80)
    };
  }
  return { version: 1, jobs: normalized };
}

async function getActiveQuickDislikeJobs() {
  const stored = await storageGet([QUICK_DISLIKE_ACTIVE_JOBS_KEY]);
  return normalizeActiveQuickDislikeJobs(stored[QUICK_DISLIKE_ACTIVE_JOBS_KEY]);
}

async function upsertActiveQuickDislikeJob(job) {
  const jobId = String(job?.jobId || "").trim();
  if (!jobId) return null;
  const active = await getActiveQuickDislikeJobs();
  active.jobs[jobId] = { ...(active.jobs[jobId] || {}), ...job, jobId };
  const rows = Object.values(active.jobs);
  if (rows.length > 40) {
    rows.sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
    active.jobs = Object.fromEntries(rows.slice(0, 40).map(row => [row.jobId, row]));
  }
  await storageSet({ [QUICK_DISLIKE_ACTIVE_JOBS_KEY]: active });
  return active.jobs[jobId] || null;
}

async function removeActiveQuickDislikeJob(jobId) {
  const id = String(jobId || "").trim();
  if (!id) return false;
  const active = await getActiveQuickDislikeJobs();
  if (!active.jobs[id]) return false;
  delete active.jobs[id];
  await storageSet({ [QUICK_DISLIKE_ACTIVE_JOBS_KEY]: active });
  return true;
}

async function recordHelperLifecycle(event, detail = {}) {
  const name = String(event || "unknown").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "unknown";
  const stored = await storageGet([HELPER_LIFECYCLE_DIAG_KEY]);
  const diag = stored[HELPER_LIFECYCLE_DIAG_KEY] && typeof stored[HELPER_LIFECYCLE_DIAG_KEY] === "object"
    ? stored[HELPER_LIFECYCLE_DIAG_KEY]
    : { version: 1, counts: {} };
  diag.version = 1;
  diag.counts = diag.counts && typeof diag.counts === "object" ? diag.counts : {};
  diag.counts[name] = Number(diag.counts[name] || 0) + 1;
  diag.lastEvent = name;
  diag.lastAt = Date.now();
  diag.lastDetail = Object.fromEntries(Object.entries(detail || {}).slice(0, 12).map(([key, value]) => [String(key).slice(0, 60), typeof value === "number" || typeof value === "boolean" ? value : String(value ?? "").slice(0, 180)]));
  await storageSet({ [HELPER_LIFECYCLE_DIAG_KEY]: diag });
  const workerFeature = /bot-status/i.test(name) ? "bot-status" : /less-like|recommendation/i.test(name) ? "less-like" : /dislike/i.test(name) ? "quick-dislike" : /listing/i.test(name) ? "listing-refill" : /persona/i.test(name) ? "persona-refresh" : "helper";
  qolBackgroundTrace("worker", workerFeature, { action: name, ...diag.lastDetail }, { critical: /lost|timeout|restart|error|closed-unexpected/i.test(name) });
  return diag;
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

function tabsSendMessageWithTimeout(tabId, message, timeoutMs = 10000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish({ __dsTimeout: true }), Math.max(500, Number(timeoutMs) || 10000));
    tabsSendMessage(tabId, message).then(finish).catch(() => finish(null));
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
  const network = qolBackgroundNetworkStart("card-token-info", "GET", `${CARD_TOKEN_API_BASE}${encodeURIComponent(botId)}`, { transport: "background" });
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
      qolBackgroundNetworkEnd(network, { status: response.status, ok: false, outcome: "http" });
      recordCardTokenFetch("http", { httpStatus: response.status, elapsedMs });
      return { ok: false, status: "http", httpStatus: response.status, elapsedMs };
    }
    let data;
    try { data = await response.json(); }
    catch (error) {
      qolBackgroundNetworkEnd(network, { status: response.status, ok: false, outcome: "parse-failure" });
      recordCardTokenFetch("parse-failure", { elapsedMs });
      return { ok: false, status: "parse-failure", elapsedMs, error: error?.message || String(error) };
    }
    qolBackgroundNetworkEnd(network, { status: response.status, ok: true, outcome: "success" });
    recordCardTokenFetch("success", { httpStatus: response.status, elapsedMs });
    return { ok: true, status: "success", httpStatus: response.status, elapsedMs, data };
  } catch (error) {
    qolBackgroundNetworkEnd(network, { status: 0, ok: false, outcome: error?.name === "AbortError" ? "timeout" : "network-failure" });
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
    if (!tab?.id || tabCleanupWorkerTabIds.has(Number(tab.id)) || quickDislikeWorkerTabIds.has(Number(tab.id)) || quickLessLikeWorkerTabIds.has(Number(tab.id)) || botStatusWorkerTabIds.has(Number(tab.id)) || listingRefillWorkerTabIds.has(Number(tab.id)) || isQuickDislikeWorkerUrl(tab.url || tab.pendingUrl) || isQuickLessLikeWorkerUrl(tab.url || tab.pendingUrl) || isBotStatusWorkerUrl(tab.url || tab.pendingUrl) || isListingRefillWorkerUrl(tab.url || tab.pendingUrl)) continue;
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
  if (recommendationFeedbackQuickDislikeCache) return recommendationFeedbackQuickDislikeCache;
  const result = await storageGet([QUICK_DISLIKE_HISTORY_KEY]);
  recommendationFeedbackQuickDislikeCache = normalizeQuickDislikeHistory(result[QUICK_DISLIKE_HISTORY_KEY]);
  return recommendationFeedbackQuickDislikeCache;
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

function normalizeQuickLessLikeHistory(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bots = source.bots && typeof source.bots === "object" ? source.bots : {};
  const normalized = {};
  for (const [id, value] of Object.entries(bots)) {
    if (!/^[0-9a-f-]{20,}$/i.test(String(id || ""))) continue;
    const status = String(value?.status || "");
    if (!["less-liked", "unavailable"].includes(status)) continue;
    normalized[id] = {
      status,
      name: String(value?.name || "").slice(0, 160),
      handledAt: Number(value?.handledAt || value?.at || 0) || Date.now(),
      stage: String(value?.stage || "").slice(0, 80),
      reason: String(value?.reason || "").slice(0, 300),
      httpStatus: Number(value?.httpStatus || 0) || 0
    };
  }
  return { version: 1, bots: normalized };
}

function normalizeQuickLessLikePending(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bots = source.bots && typeof source.bots === "object" ? source.bots : {};
  return { version: 1, bots: { ...bots } };
}

function trimQuickLessLikeHistory(history) {
  const entries = Object.entries(history?.bots || {});
  if (entries.length > 5000) {
    entries
      .sort((a, b) => Number(b[1]?.handledAt || 0) - Number(a[1]?.handledAt || 0))
      .slice(5000)
      .forEach(([id]) => delete history.bots[id]);
  }
  return history;
}

async function readQuickLessLikeHistoryFromStorage() {
  const result = await storageGet([QUICK_LESS_LIKE_HISTORY_KEY, QUICK_LESS_LIKE_PENDING_KEY]);
  const history = normalizeQuickLessLikeHistory(result[QUICK_LESS_LIKE_HISTORY_KEY]);
  const pending = normalizeQuickLessLikePending(result[QUICK_LESS_LIKE_PENDING_KEY]);
  for (const [id, value] of Object.entries(pending.bots || {})) {
    if (!/^[0-9a-f-]{20,}$/i.test(String(id || ""))) continue;
    const status = String(value?.status || "");
    if (!["less-liked", "unavailable"].includes(status)) continue;
    history.bots[id] = {
      status,
      name: String(value?.name || history.bots[id]?.name || "").slice(0, 160),
      handledAt: Number(value?.handledAt || 0) || Date.now(),
      stage: String(value?.stage || "").slice(0, 80),
      reason: String(value?.reason || "").slice(0, 300),
      httpStatus: Number(value?.httpStatus || 0) || 0
    };
  }
  return { history: trimQuickLessLikeHistory(history), pending };
}

async function getQuickLessLikeCrossHistory() {
  if (recommendationFeedbackQuickLessLikeCache) return recommendationFeedbackQuickLessLikeCache;
  const loaded = await readQuickLessLikeHistoryFromStorage();
  recommendationFeedbackQuickLessLikeCache = loaded.history;
  return recommendationFeedbackQuickLessLikeCache;
}

async function getQuickLessLikeHistory(runId = "") {
  const id = String(runId || "").trim();
  if (id && quickLessLikeHistoryCacheRunId === id && quickLessLikeHistoryCache) {
    return quickLessLikeHistoryCache;
  }
  const loaded = await readQuickLessLikeHistoryFromStorage();
  if (id) {
    quickLessLikeHistoryCacheRunId = id;
    quickLessLikeHistoryCache = loaded.history;
    quickLessLikePendingCache = loaded.pending;
    quickLessLikeHistoryLastFlushAt = Date.now();
  }
  return loaded.history;
}

async function flushQuickLessLikeHistory(force = false, runId = "") {
  const id = String(runId || quickLessLikeHistoryCacheRunId || "").trim();
  if (!id || quickLessLikeHistoryCacheRunId !== id || !quickLessLikeHistoryCache) return true;
  const pending = quickLessLikePendingCache || { version: 1, bots: {} };
  const pendingCount = Object.keys(pending.bots || {}).length;
  if (!pendingCount) return true;
  const ageMs = quickLessLikeHistoryLastFlushAt ? Date.now() - quickLessLikeHistoryLastFlushAt : Infinity;
  if (!force && pendingCount < QUICK_LESS_LIKE_HISTORY_FLUSH_EVERY && ageMs < QUICK_LESS_LIKE_HISTORY_FLUSH_MAX_AGE_MS) return false;
  trimQuickLessLikeHistory(quickLessLikeHistoryCache);
  await storageSet({
    [QUICK_LESS_LIKE_HISTORY_KEY]: quickLessLikeHistoryCache,
    [QUICK_LESS_LIKE_PENDING_KEY]: { version: 1, bots: {} }
  });
  quickLessLikePendingCache = { version: 1, bots: {} };
  quickLessLikeHistoryLastFlushAt = Date.now();
  return true;
}

async function rememberQuickLessLikeEntry(botId, entry, { immediate = false, runId = "" } = {}) {
  const id = String(runId || "").trim();
  if (!id) {
    const loaded = await readQuickLessLikeHistoryFromStorage();
    loaded.history.bots[botId] = entry;
    trimQuickLessLikeHistory(loaded.history);
    recommendationFeedbackQuickLessLikeCache = loaded.history;
    await storageSet({
      [QUICK_LESS_LIKE_HISTORY_KEY]: loaded.history,
      [QUICK_LESS_LIKE_PENDING_KEY]: { version: 1, bots: {} }
    });
    return loaded.history.bots[botId];
  }

  const history = await getQuickLessLikeHistory(id);
  const pending = quickLessLikePendingCache || (quickLessLikePendingCache = { version: 1, bots: {} });
  history.bots[botId] = entry;
  pending.bots[botId] = entry;
  trimQuickLessLikeHistory(history);
  recommendationFeedbackQuickLessLikeCache = history;
  // Persist the compact success journal before returning so an interrupted run
  // cannot repeat a known-successful rating. Full multi-thousand-entry history
  // compaction is deferred to a large/time-based checkpoint and run end.
  await storageSet({ [QUICK_LESS_LIKE_PENDING_KEY]: pending });
  await flushQuickLessLikeHistory(immediate, id);
  return history.bots[botId];
}

async function rememberQuickLessLike(botId, botName, options = {}) {
  const history = await getQuickLessLikeHistory(options?.runId || "");
  return rememberQuickLessLikeEntry(botId, {
    status: "less-liked",
    name: String(botName || history.bots[botId]?.name || "").slice(0, 160),
    handledAt: Date.now()
  }, options);
}

async function rememberQuickLessLikeUnavailable(botId, botName, result = {}, options = {}) {
  const history = await getQuickLessLikeHistory(options?.runId || "");
  return rememberQuickLessLikeEntry(botId, {
    status: "unavailable",
    name: String(botName || history.bots[botId]?.name || "").slice(0, 160),
    handledAt: Date.now(),
    stage: String(result?.stage || "response").slice(0, 80),
    reason: String(result?.reason || "Character was not found while sending Less Like feedback.").slice(0, 300),
    httpStatus: Number(result?.httpStatus || 0) || 0
  }, options);
}

async function completedRecommendationFeedbackForBot(botId, targetMode = "") {
  const id = String(botId || "").trim().toLowerCase();
  if (!id) return null;
  const mode = String(targetMode || "").trim();

  if (mode !== "less-like") {
    const lessLike = await getQuickLessLikeCrossHistory();
    const entry = lessLike?.bots?.[id];
    if (entry?.status === "less-liked") {
      return {
        source: "less-like",
        status: "less-liked",
        handledAt: Number(entry.handledAt || 0) || 0,
        name: String(entry.name || "")
      };
    }
  }

  if (mode !== "dislike") {
    const dislike = await getQuickDislikeHistory();
    const entry = dislike?.bots?.[id];
    if (["disliked", "already-disliked"].includes(String(entry?.status || ""))) {
      return {
        source: "dislike",
        status: String(entry.status || ""),
        handledAt: Number(entry.handledAt || 0) || 0,
        name: String(entry.name || "")
      };
    }
  }

  return null;
}

function queueRecommendationFeedbackForBot(botId, task) {
  const id = String(botId || "").trim().toLowerCase();
  if (!id || typeof task !== "function") return Promise.resolve().then(task);
  const prior = recommendationFeedbackBotChains.get(id) || Promise.resolve();
  const current = prior.catch(() => {}).then(task);
  recommendationFeedbackBotChains.set(id, current);
  current.finally(() => {
    if (recommendationFeedbackBotChains.get(id) === current) recommendationFeedbackBotChains.delete(id);
  }).catch(() => {});
  return current;
}

function makeQuickDislikeJobId(botId) {
  return `qd-${String(botId || "").slice(0, 12)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function quickDislikeWorkerTabs() {
  const tabs = await tabsQuery({});
  return tabs.filter(tab => tab?.id && isQuickDislikeWorkerUrl(tab.url || tab.pendingUrl || ""));
}

async function closeQuickDislikeTab(tabId, event = "quickDislikeOrphanClosed", detail = {}) {
  const id = Number(tabId);
  if (!Number.isFinite(id)) return false;
  const result = await tabsRemove(id);
  quickDislikeWorkerTabIds.delete(id);
  if (Number(quickDislikePersistentWorkerTabId) === id) quickDislikePersistentWorkerTabId = null;
  for (const [runId, workerTabId] of quickDislikeBulkWorkerTabs.entries()) {
    if (Number(workerTabId) === id) quickDislikeBulkWorkerTabs.delete(runId);
  }
  if (result?.ok) await recordHelperLifecycle(event, { tabId: id, ...detail });
  return !!result?.ok;
}

async function cleanupStaleQuickDislikeWorkers() {
  const runtimeSession = await getHelperRuntimeSession();
  const active = await getActiveQuickDislikeJobs();
  const history = await getQuickDislikeHistory();
  const now = Date.now();
  let closed = 0;
  for (const tab of await quickDislikeWorkerTabs()) {
    const tabId = Number(tab.id);
    const info = quickDislikeWorkerUrlInfo(tab.url || tab.pendingUrl || "");
    if (!info || !Number.isFinite(tabId)) continue;
    quickDislikeWorkerTabIds.add(tabId);
    const activeJob = info.jobId ? active.jobs[info.jobId] : null;
    const age = info.startedAt ? now - info.startedAt : Number.POSITIVE_INFINITY;
    const priorSession = !!(runtimeSession.id && info.sessionId && info.sessionId !== runtimeSession.id);
    const confirmed = !!(info.botId && history.bots[info.botId]);
    const legacy = !info.jobId || !info.botId || !info.startedAt;
    const persistentIdle = !!info.persistent && !priorSession && !activeJob;
    if (persistentIdle && age < QUICK_DISLIKE_PERSISTENT_IDLE_MAX_AGE_MS) {
      quickDislikePersistentWorkerTabId = tabId;
      continue;
    }
    const stale = age >= (info.persistent ? QUICK_DISLIKE_PERSISTENT_IDLE_MAX_AGE_MS : QUICK_DISLIKE_ABSOLUTE_MAX_AGE_MS) ||
      (priorSession && age >= QUICK_DISLIKE_INTERRUPTED_GRACE_MS);
    if ((confirmed && !info.persistent) || (legacy && !info.persistent) || (!activeJob && stale) || (activeJob && age >= QUICK_DISLIKE_ABSOLUTE_MAX_AGE_MS)) {
      const event = confirmed ? "quickDislikeConfirmedHelperClosed" : (priorSession ? "quickDislikeInterruptedGcClosed" : "quickDislikeGcClosed");
      if (await closeQuickDislikeTab(tabId, event, { jobId: info.jobId, botId: info.botId, ageMs: Number.isFinite(age) ? age : -1 })) closed += 1;
    }
  }
  return closed;
}

async function cleanupPriorHelperSessionTabs() {
  const runtimeSession = await getHelperRuntimeSession();
  if (!runtimeSession.id) return { quickDislike: 0, listingRefill: 0 };
  let quickClosed = 0;
  let refillClosed = 0;
  for (const tab of await tabsQuery({})) {
    const rawUrl = tab?.url || tab?.pendingUrl || "";
    const quick = quickDislikeWorkerUrlInfo(rawUrl);
    if (quick && tab?.id && (!quick.sessionId || quick.sessionId !== runtimeSession.id)) {
      if (await closeQuickDislikeTab(Number(tab.id), "quickDislikePriorSessionClosed", { jobId: quick.jobId, botId: quick.botId })) quickClosed += 1;
      continue;
    }
    const refill = listingRefillWorkerUrlInfo(rawUrl);
    if (refill && tab?.id && (!refill.sessionId || refill.sessionId !== runtimeSession.id)) {
      const result = await tabsRemove(Number(tab.id));
      if (result?.ok) {
        listingRefillWorkerTabIds.delete(Number(tab.id));
        for (const [runId, workerTabId] of listingRefillPageWorkerTabs.entries()) {
          if (Number(workerTabId) === Number(tab.id)) listingRefillPageWorkerTabs.delete(runId);
        }
        refillClosed += 1;
        await recordHelperLifecycle("listingRefillPriorSessionClosed", { tabId: Number(tab.id), runId: refill.runId });
      }
    }
  }
  return { quickDislike: quickClosed, listingRefill: refillClosed };
}

async function recoverInterruptedQuickDislikeJobs() {
  const runtimeSession = await getHelperRuntimeSession();
  const active = await getActiveQuickDislikeJobs();
  const jobRows = Object.values(active.jobs);
  const helpers = await quickDislikeWorkerTabs();
  const history = await getQuickDislikeHistory();
  const now = Date.now();

  const byJob = new Map();
  for (const tab of helpers) {
    const info = quickDislikeWorkerUrlInfo(tab.url || tab.pendingUrl || "");
    if (!info) continue;
    quickDislikeWorkerTabIds.add(Number(tab.id));
    if (!info.jobId) continue;
    const list = byJob.get(info.jobId) || [];
    list.push({ tab, info });
    byJob.set(info.jobId, list);
  }

  for (const [jobId, rows] of byJob.entries()) {
    if (rows.length <= 1) continue;
    rows.sort((a, b) => Number(b.tab.lastAccessed || 0) - Number(a.tab.lastAccessed || 0));
    for (const duplicate of rows.slice(1)) {
      await closeQuickDislikeTab(Number(duplicate.tab.id), "quickDislikeDuplicateClosed", { jobId, botId: duplicate.info.botId });
    }
  }

  for (const job of jobRows) {
    const jobId = String(job.jobId || "");
    const botId = String(job.botId || "").toLowerCase();
    const rows = byJob.get(jobId) || [];
    if (history.bots[botId]) {
      for (const row of rows) await closeQuickDislikeTab(Number(row.tab.id), "quickDislikeRecoveredConfirmed", { jobId, botId });
      await removeActiveQuickDislikeJob(jobId);
      continue;
    }

    const age = now - Number(job.createdAt || job.startedAt || now);
    const recoveryCount = Number(job.recoveryCount || 0);
    if (age > QUICK_DISLIKE_RECOVERY_MAX_AGE_MS || recoveryCount >= 2) {
      for (const row of rows) await closeQuickDislikeTab(Number(row.tab.id), "quickDislikeRecoveryAbandoned", { jobId, botId, ageMs: age, recoveryCount });
      await removeActiveQuickDislikeJob(jobId);
      await recordHelperLifecycle("quickDislikeRecoveryAbandoned", { jobId, botId, ageMs: age, recoveryCount });
      continue;
    }

    for (const row of rows) await closeQuickDislikeTab(Number(row.tab.id), "quickDislikeReloadInterrupted", { jobId, botId });
    await recordHelperLifecycle("quickDislikeReloadInterrupted", { jobId, botId, recoveryCount });
    await upsertActiveQuickDislikeJob({ ...job, recoveryCount: recoveryCount + 1, status: "recovering", tabId: 0, startedAt: Date.now() });
    queueQuickDislikeBot({
      type: "DS_QUICK_DISLIKE_BOT",
      botId,
      botName: job.botName || botId,
      chatUrl: job.chatUrl || `https://spicychat.ai/chat/${botId}`,
      quickDislikeJobId: jobId,
      recoveryCount: recoveryCount + 1,
      recoveredAfterReload: true,
      force: false
    }).then(result => recordHelperLifecycle(result?.ok ? "quickDislikeRecoveryCompleted" : "quickDislikeRecoveryFailed", {
      jobId,
      botId,
      status: result?.status || "no-response"
    })).catch(() => recordHelperLifecycle("quickDislikeRecoveryFailed", { jobId, botId, status: "exception" }));
  }

  // Legacy/orphan helpers that have no persisted active job are not allowed to
  // live forever. Same-session helpers get a short grace; prior-session helpers
  // are handled by the one-minute session cleanup alarm.
  await cleanupStaleQuickDislikeWorkers();
  return { activeJobs: jobRows.length, helperTabs: helpers.length, sessionId: runtimeSession.id || "" };
}

async function initializeHelperLifecycleRecovery() {
  // The background bootstrap plus onInstalled/onStartup can fire very close
  // together. Reuse one initialization promise per service-worker lifetime so
  // the same persisted interrupted job cannot be recovered twice in parallel.
  if (helperLifecycleInitPromise) return helperLifecycleInitPromise;
  helperLifecycleInitPromise = (async () => {
    const runtimeSession = await getHelperRuntimeSession();
    await recoverInterruptedQuickDislikeJobs();
    await cleanupStaleListingRefillWorkers({ closeLegacy: true });
    chrome.alarms.create(QUICK_DISLIKE_GC_ALARM, { periodInMinutes: 1 });
    chrome.alarms.create(LISTING_REFILL_GC_ALARM, { periodInMinutes: 30 });
    if (runtimeSession.created) {
      chrome.alarms.create(HELPER_SESSION_GRACE_ALARM, { delayInMinutes: 1 });
      await recordHelperLifecycle("helperRuntimeSessionStarted", { sessionId: runtimeSession.id });
    }
  })();
  return helperLifecycleInitPromise;
}

async function runQuickDislikeBot(message) {
  const totalStartedAt = Date.now();
  const botId = String(message?.botId || "").trim().toLowerCase();
  const botName = String(message?.botName || "").trim().slice(0, 160);
  if (!/^[0-9a-f-]{20,}$/i.test(botId)) return { ok: false, status: "invalid-bot" };
  if (message?.bulkRunId && isQuickDislikeBulkRunCanceled(message.bulkRunId)) return { ok: false, status: "bulk-canceled" };

  if (message?.force !== true) {
    const history = await getQuickDislikeHistory();
    const remembered = history.bots[botId];
    if (remembered) return { ok: true, status: "already-handled", rememberedStatus: remembered.status, handledAt: remembered.handledAt || 0 };

    const crossHandled = await completedRecommendationFeedbackForBot(botId, "dislike");
    if (crossHandled?.source === "less-like") {
      const rememberedCross = await rememberQuickDislike(botId, botName || crossHandled.name || "", "already-disliked");
      await recordHelperLifecycle("recommendationFeedbackCrossDedupe", { botId, skipped: "dislike", completedBy: "less-like" });
      return { ok: true, status: "already-handled", rememberedStatus: "already-disliked", handledAt: rememberedCross?.handledAt || crossHandled.handledAt || Date.now(), crossHandledBy: "less-like", networkAttempts: 0, requestSent: false };
    }
  }

  // v0.2.30: Quick Dislike now uses the same persistent signed-feedback helper
  // as Less Like. This retires the old per-bot /chat navigation worker while
  // preserving separate Dislike history/UI and the shared cross-flow dedupe.
  let result;
  try {
    result = await runDirectCharacterFeedback(message, "dislike");
  } finally {
    if (!String(message?.bulkRunId || "").trim()) await releaseQuickLessLikeStandaloneWorker();
  }

  if (result?.ok && result.status === "disliked") {
    const remembered = await rememberQuickDislike(botId, botName, "disliked");
    if (remembered) result.handledAt = remembered.handledAt || Date.now();
  } else if (result?.status === "bot-not-found") {
    const remembered = await rememberQuickDislike(botId, botName, "unavailable-private-or-deleted");
    result = { ...result, ok: true, status: "unavailable-private-or-deleted", rememberedStatus: "unavailable-private-or-deleted", handledAt: remembered?.handledAt || Date.now() };
  } else if (result?.status === "character-restricted") {
    const remembered = await rememberQuickDislike(botId, botName, "unavailable-private-or-deleted");
    result = { ...result, ok: true, status: "unavailable-private-or-deleted", rememberedStatus: "unavailable-private-or-deleted", handledAt: remembered?.handledAt || Date.now() };
  }

  await recordHelperLifecycle(result?.ok ? "quickDislikeCompleted" : "quickDislikeFailed", {
    botId,
    status: result?.status || "unknown",
    executor: "persistent-recommendation-worker",
    elapsedMs: Date.now() - totalStartedAt
  });
  return { ...result, totalMs: Date.now() - totalStartedAt, executor: "persistent-recommendation-worker" };
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

function queueQuickDislikeBot(message) {
  quickDislikeChain = quickDislikeChain
    .catch(() => {})
    .then(() => queueRecommendationFeedbackForBot(message?.botId, () => runQuickDislikeBot(message)));
  return quickDislikeChain;
}

function queueQuickLessLikeBot(message) {
  quickLessLikeChain = quickLessLikeChain
    .catch(() => {})
    .then(() => queueRecommendationFeedbackForBot(message?.botId, () => runQuickLessLikeBot(message)));
  return quickLessLikeChain;
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
  const raw = result.settings || {};
  const settings = {
    ...AUTO_AFK_DEFAULTS,
    ...raw
  };
  // Preserve old custom hour values until Settings has saved the new minute field.
  if (!Object.prototype.hasOwnProperty.call(raw, "autoAfkMinutes")) {
    const legacyHours = Math.min(720, Math.max(0.25, Number(raw.autoAfkHours) || 12));
    settings.autoAfkMinutes = Math.round(legacyHours * 60);
  }
  return settings;
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

let lowMemoryProtectionScanTimer = 0;
const LOW_MEMORY_WAKE_GRACE_MS = 90000;
const LOW_MEMORY_WAKE_BURST_ALLOWANCE = 2;
const lowMemoryWakeGraceUntil = new Map();

function markLowMemoryWakeGrace(tabId, now = Date.now()) {
  const id = Number(tabId || 0);
  if (!id) return;
  lowMemoryWakeGraceUntil.set(id, now + LOW_MEMORY_WAKE_GRACE_MS);
}

function lowMemoryWakeGraceActive(tabId, now = Date.now()) {
  const id = Number(tabId || 0);
  const until = Number(lowMemoryWakeGraceUntil.get(id) || 0);
  if (!until) return false;
  if (until <= now) {
    lowMemoryWakeGraceUntil.delete(id);
    return false;
  }
  return true;
}

function normalizedAutoAfkMinutes(settings = {}) {
  const raw = Number(settings.autoAfkMinutes);
  if (Number.isFinite(raw) && raw > 0) return Math.min(43200, Math.max(15, Math.round(raw)));
  const hours = Math.min(720, Math.max(0.25, Number(settings.autoAfkHours) || 12));
  return Math.min(43200, Math.max(15, Math.round(hours * 60)));
}

function isDedicatedWorkerTab(tab) {
  const id = Number(tab?.id || 0);
  const url = String(tab?.url || tab?.pendingUrl || "");
  if (!id) return false;
  return (
    tabCleanupWorkerTabIds.has(id) ||
    quickDislikeWorkerTabIds.has(id) ||
    quickLessLikeWorkerTabIds.has(id) ||
    botStatusWorkerTabIds.has(id) ||
    listingRefillWorkerTabIds.has(id) ||
    personaRefreshWorkerTabIds.has(id) ||
    isQuickDislikeWorkerUrl(url) ||
    isQuickLessLikeWorkerUrl(url) ||
    isBotStatusWorkerUrl(url) ||
    isListingRefillWorkerUrl(url) ||
    isPersonaRefreshWorkerUrl(url)
  );
}

function lowMemoryProtectedTab(tab) {
  if (!tab) return true;
  // PC protection always keeps the tab the user is looking at. Pinned/audible
  // tabs and browser-declared non-discardable tabs are never sacrificed either.
  if (tab.active || tab.pinned || tab.audible || tab.autoDiscardable === false) return true;
  return false;
}

function scheduleLowMemoryProtectionScan(delayMs = 300) {
  clearTimeout(lowMemoryProtectionScanTimer);
  lowMemoryProtectionScanTimer = setTimeout(() => {
    lowMemoryProtectionScanTimer = 0;
    runAutoAfkScan().catch(() => {});
  }, Math.max(100, Number(delayMs) || 300));
}

async function configureAutoAfkAlarm(sync = false) {
  const settings = await getAutoAfkSettings();
  const cleanupEnabled = settings.enabled !== false && !!settings.autoAfkEnabled;
  const lowMemoryEnabled = settings.enabled !== false && !!settings.lowMemoryProtectionEnabled;

  if (!cleanupEnabled && !lowMemoryEnabled) {
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
  const minutes = normalizedAutoAfkMinutes(settings);
  const hours = minutes / 60;
  const action = settings.autoAfkAction || "discard";
  const timerEnabled = settings.enabled !== false && !!settings.autoAfkEnabled;
  const lowMemoryEnabled = settings.enabled !== false && !!settings.lowMemoryProtectionEnabled;
  const awakeLimit = Math.min(20, Math.max(1, Number(settings.maxAwakeSpicyTabs) || 3));
  const summary = {
    at: now,
    enabled: timerEnabled || lowMemoryEnabled,
    timerEnabled,
    lowMemoryEnabled,
    minutes,
    hours,
    action,
    awakeLimit,
    totalSpicyTabs: 0,
    normalTabs: 0,
    workerTabs: 0,
    loadedNormal: 0,
    discardedNormal: 0,
    loadedWorkers: 0,
    monitored: 0,
    protected: 0,
    recent: 0,
    eligible: 0,
    cleaned: 0,
    lruDiscarded: 0,
    alreadyDiscarded: 0,
    failed: 0,
    nextDueAt: null,
    errors: []
  };

  if (!summary.enabled) {
    await writeAutoAfkStatus(summary);
    return summary;
  }

  const cutoff = now - minutes * 60 * 1000;
  const tabs = await tabsQuery({
    url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"]
  });
  summary.totalSpicyTabs = tabs.length;

  const activity = await getAutoAfkActivity();
  let activityChanged = false;

  // Keep LRU timestamps current even when timer cleanup itself is disabled.
  for (const tab of tabs) {
    if (!tab?.id) continue;
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
    if (!Number.isFinite(storedBefore) || lastActive > Number(activity[key] || 0)) {
      activity[key] = lastActive;
      activityChanged = true;
    }
  }

  const workers = tabs.filter(isDedicatedWorkerTab);
  const normalTabs = tabs.filter(tab => !isDedicatedWorkerTab(tab));
  summary.workerTabs = workers.length;
  summary.normalTabs = normalTabs.length;
  summary.loadedWorkers = workers.filter(tab => !tab.discarded).length;
  summary.loadedNormal = normalTabs.filter(tab => !tab.discarded).length;
  summary.discardedNormal = normalTabs.filter(tab => !!tab.discarded).length;

  // Low-memory protection is independent from the AFK timer. Dedicated active
  // workers never count against the limit. Recently visited/woken tabs get a
  // short grace period so switching among a large discarded-tab pile does not
  // immediately ping-pong the tab back to sleep. During that grace we allow a
  // tiny +2 burst, then the normal one-minute scan trims back by LRU.
  if (lowMemoryEnabled && summary.loadedNormal > awakeLimit) {
    const loadedCandidates = normalTabs.filter(tab => !tab.discarded && !lowMemoryProtectedTab(tab));
    const graceCount = loadedCandidates.filter(tab => lowMemoryWakeGraceActive(tab.id, now)).length;
    const severeOverflow = summary.loadedNormal > awakeLimit + LOW_MEMORY_WAKE_BURST_ALLOWANCE + 2;
    const effectiveLimit = graceCount && !severeOverflow
      ? Math.min(20, awakeLimit + LOW_MEMORY_WAKE_BURST_ALLOWANCE)
      : awakeLimit;
    const candidates = loadedCandidates
      .filter(tab => severeOverflow || !lowMemoryWakeGraceActive(tab.id, now))
      .sort((a, b) => {
        const aGrace = lowMemoryWakeGraceActive(a.id, now) ? 1 : 0;
        const bGrace = lowMemoryWakeGraceActive(b.id, now) ? 1 : 0;
        if (aGrace !== bGrace) return aGrace - bGrace;
        return autoAfkLastActivity(a, activity) - autoAfkLastActivity(b, activity);
      });
    let needed = Math.max(0, summary.loadedNormal - effectiveLimit);
    summary.wakeGraceTabs = graceCount;
    summary.effectiveAwakeLimit = effectiveLimit;
    qolBackgroundTrace("pc-protection", "pc-protection", {
      action: "evaluate",
      loadedNormal: summary.loadedNormal,
      discardedNormal: summary.discardedNormal,
      loadedWorkers: summary.loadedWorkers,
      awakeLimit,
      effectiveAwakeLimit: effectiveLimit,
      wakeGraceTabs: graceCount,
      severeOverflow,
      candidateCount: candidates.length,
      needed
    }, { level: "deep" });
    for (const tab of candidates) {
      if (needed <= 0) break;
      const lastActive = autoAfkLastActivity(tab, activity);
      const result = await tabsDiscard(tab.id);
      if (result.ok) {
        summary.lruDiscarded += 1;
        summary.loadedNormal = Math.max(0, summary.loadedNormal - 1);
        summary.discardedNormal += 1;
        needed -= 1;
        qolBackgroundTrace("pc-protection", "pc-protection", {
          action: "discard-success",
          lastUsedAgoMs: Math.max(0, now - Number(lastActive || now)),
          loadedNormal: summary.loadedNormal,
          awakeLimit,
          effectiveAwakeLimit: Number(summary.effectiveAwakeLimit || awakeLimit),
          remainingNeeded: needed
        });
      } else {
        summary.failed += 1;
        if (result.error && summary.errors.length < 3) summary.errors.push(result.error);
        qolBackgroundTrace("pc-protection", "pc-protection", {
          action: "discard-failed",
          lastUsedAgoMs: Math.max(0, now - Number(lastActive || now)),
          loadedNormal: summary.loadedNormal,
          awakeLimit,
          effectiveAwakeLimit: Number(summary.effectiveAwakeLimit || awakeLimit),
          remainingNeeded: needed,
          errorClass: result.error ? "discard-error" : "unknown"
        }, { critical: true });
      }
    }
  } else if (lowMemoryEnabled) {
    qolBackgroundTrace("pc-protection", "pc-protection", {
      action: "evaluate",
      loadedNormal: summary.loadedNormal,
      discardedNormal: summary.discardedNormal,
      loadedWorkers: summary.loadedWorkers,
      awakeLimit,
      candidateCount: 0,
      needed: 0
    }, { level: "deep" });
  }

  if (timerEnabled) {
    for (const tab of normalTabs) {
      if (!tab?.id || !autoAfkApplies(tab.url, settings)) continue;
      summary.monitored += 1;
      const key = String(tab.id);
      const lastActive = autoAfkLastActivity(tab, activity);

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
        const dueAt = lastActive + minutes * 60 * 1000;
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
  }

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

function sendTabMessage(tabId, message, timeoutMs = 900) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = setTimeout(() => finish(null), Math.max(250, Number(timeoutMs || 900)));
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        try { if (chrome.runtime.lastError) return finish(null); } catch {}
        finish(response || null);
      });
    } catch {
      finish(null);
    }
  });
}

async function getReachableDiagnosticContext() {
  const stored = await storageGet([OPTIONS_SOURCE_TAB_KEY, HELPER_LIFECYCLE_DIAG_KEY]);
  const storedId = Number(stored[OPTIONS_SOURCE_TAB_KEY]);
  const helperLifecycleDiagnostics = stored[HELPER_LIFECYCLE_DIAG_KEY] || null;
  const tabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const allCandidates = tabs.filter(tab => tab?.id);
  const loaded = allCandidates.filter(tab => !tab.discarded);
  const candidates = (loaded.length ? loaded : allCandidates).sort((a, b) => {
    if (!!a.active !== !!b.active) return a.active ? -1 : 1;
    if (Number(a.id) === storedId && Number(b.id) !== storedId) return -1;
    if (Number(b.id) === storedId && Number(a.id) !== storedId) return 1;
    return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
  });
  for (const tab of candidates) {
    const pageDiagnostics = await sendTabMessage(tab.id, { type: "DS_GET_PAGE_DIAGNOSTICS" }, 900);
    if (!pageDiagnostics) continue;
    await storageSet({ [OPTIONS_SOURCE_TAB_KEY]: tab.id });
    return { ok: true, runtimeAvailable: true, url: tab.url || "", title: tab.title || "", pageDiagnostics, helperLifecycleDiagnostics, tabId: tab.id };
  }
  const fallback = candidates[0] || allCandidates[0] || null;
  return {
    ok: !!fallback,
    runtimeAvailable: false,
    runtimeStatus: fallback ? "page-found-runtime-unreachable" : "no-spicychat-tab",
    runtimeError: fallback ? "A SpicyChat tab was found, but its QoL content runtime did not answer diagnostics. Reload that tab after an extension update to attach the current QoL runtime." : "No open SpicyChat tab was found.",
    url: fallback?.url || "", title: fallback?.title || "", pageDiagnostics: null, helperLifecycleDiagnostics, tabId: fallback?.id || 0
  };
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
      await new Promise(resolve => setTimeout(resolve, 650));
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


function normalizeRandomChatId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

function secureBackgroundRandomInt(maxExclusive) {
  const max = Math.floor(Number(maxExclusive) || 0);
  if (max <= 1) return 0;
  try {
    const limit = Math.floor(0x100000000 / max) * max;
    const values = new Uint32Array(1);
    do { crypto.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % max;
  } catch {
    return Math.floor(Math.random() * max);
  }
}

function shuffleBackgroundRandom(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = secureBackgroundRandomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomChatDocument(doc) {
  const id = normalizeRandomChatId(doc?.character_id);
  if (!id) return null;
  return {
    id,
    name: String(doc?.name || doc?.title || "").trim().slice(0, 180),
    creator: String(doc?.creator_username || "").trim().slice(0, 180),
    tags: Array.isArray(doc?.tags) ? doc.tags.map(tag => String(tag || "").trim()).filter(Boolean).slice(0, 80) : [],
    avatarUrl: String(doc?.avatar_url || "").trim(),
    isNsfw: doc?.is_nsfw === true,
    href: `https://spicychat.ai/chat/${id}`
  };
}

function randomChatHomeQueryFromUrl(rawUrl) {
  let q = "*";
  try {
    const url = new URL(String(rawUrl || "https://spicychat.ai/"));
    for (const [key, value] of url.searchParams.entries()) {
      if (/\[query\]$/i.test(key) && String(value || "").trim()) {
        q = String(value).trim().slice(0, 250);
        break;
      }
    }
  } catch {}
  return q || "*";
}

async function typesenseMultiSearch(searches, timeoutMs = 8000, apiKey = EXACT_MESSAGE_TYPESENSE_KEY, diagnosticFeature = "typesense") {
  const controller = new AbortController();
  const network = qolBackgroundNetworkStart(diagnosticFeature, "POST", EXACT_MESSAGE_TYPESENSE_URL, { searches: Array.isArray(searches) ? searches.length : 0 });
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 8000));
  try {
    const response = await fetch(EXACT_MESSAGE_TYPESENSE_URL, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "Content-Type": "text/plain",
        "X-TYPESENSE-API-KEY": String(apiKey || EXACT_MESSAGE_TYPESENSE_KEY)
      },
      body: JSON.stringify({ searches })
    });
    if (!response.ok) {
      qolBackgroundNetworkEnd(network, { status: response.status, ok: false, outcome: "http" });
      return { ok: false, status: response.status, error: `Typesense returned HTTP ${response.status}.` };
    }
    const data = await response.json();
    qolBackgroundNetworkEnd(network, { status: response.status, ok: true, outcome: "success" });
    return { ok: true, data };
  } catch (error) {
    qolBackgroundNetworkEnd(network, { status: 0, ok: false, outcome: error?.name === "AbortError" ? "timeout" : "network-error" });
    return { ok: false, status: error?.name === "AbortError" ? "timeout" : "network-error", error: error?.message || String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function getLorebookTypesenseConfig({ force = false } = {}) {
  const now = Date.now();
  const cached = lorebookTypesenseConfigCache;
  if (!force && cached?.lorebookKey && cached?.entryKey && now - Number(cached.fetchedAt || 0) < LOREBOOK_TYPESENSE_CONFIG_TTL_MS) {
    return { ok: true, ...cached, cached: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const network = qolBackgroundNetworkStart("lorebook-status", "GET", SPICYCHAT_APPLICATION_CONFIG_URL, { purpose: "typesense-config" });
  try {
    const response = await fetch(SPICYCHAT_APPLICATION_CONFIG_URL, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "x-app-id": "spicychat",
        "x-guest-userid": LOREBOOK_CONFIG_GUEST_ID,
        "x-country": "US",
        "x-platform": "WEB",
        "x-platform-os": "DESKTOP"
      }
    });
    if (!response.ok) {
      qolBackgroundNetworkEnd(network, { status: response.status, ok: false, outcome: "http" });
      throw new Error(`SpicyChat application config returned HTTP ${response.status}.`);
    }
    const payload = await response.json();
    qolBackgroundNetworkEnd(network, { status: response.status, ok: true, outcome: "success" });
    const config = payload?.typesenseConfig && typeof payload.typesenseConfig === "object" ? payload.typesenseConfig : {};
    const next = {
      fetchedAt: now,
      lorebookKey: String(config.apiKeyLorebook || "").trim(),
      entryKey: String(config.apiKeyLorebookEntries || "").trim(),
      lorebookCollection: String(config.collectionNameLorebook || PUBLIC_LOREBOOK_TYPESENSE_COLLECTION).trim() || PUBLIC_LOREBOOK_TYPESENSE_COLLECTION,
      entryCollection: String(config.collectionNameLorebookEntries || PUBLIC_LOREBOOK_ENTRY_TYPESENSE_COLLECTION).trim() || PUBLIC_LOREBOOK_ENTRY_TYPESENSE_COLLECTION
    };
    if (!next.lorebookKey) throw new Error("SpicyChat application config did not provide apiKeyLorebook.");
    lorebookTypesenseConfigCache = next;
    return { ok: true, ...next, cached: false };
  } catch (error) {
    if (network) qolBackgroundNetworkEnd(network, { status: 0, ok: false, outcome: error?.name === "AbortError" ? "timeout" : "error" });
    if (cached?.lorebookKey) {
      return { ok: true, ...cached, cached: true, stale: true, warning: error?.message || String(error) };
    }
    return {
      ok: false,
      status: error?.name === "AbortError" ? "timeout" : "config-error",
      error: error?.message || String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}


function normalizePublicLorebookId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id) ? id : "";
}

function cleanPublicLorebookList(value) {
  const raw = Array.isArray(value) ? value : (typeof value === "string" ? value.split(/[,;|]/g) : []);
  return [...new Set(raw.map(item => String(item || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function publicLorebookIndexDocument(doc) {
  if (!doc || typeof doc !== "object") return null;
  const id = normalizePublicLorebookId(doc.lorebook_id || doc.lorebookId || doc.id);
  if (!id) return null;
  return {
    id,
    name: String(doc.name || doc.title || "").replace(/\s+/g, " ").trim().slice(0, 300),
    description: String(doc.description || "").replace(/\s+/g, " ").trim().slice(0, 8000),
    creator: String(doc.creator_username || doc.creatorUsername || "").replace(/\s+/g, " ").trim().slice(0, 300),
    creatorId: String(doc.creator_user_id || doc.creatorUserId || "").trim(),
    image: String(doc.avatar_url || doc.avatarUrl || doc.image || "").trim().slice(0, 3000),
    tags: cleanPublicLorebookList(doc.tags).slice(0, 120),
    visibility: String(doc.visibility || "").trim().slice(0, 80),
    status: String(doc.status || "").trim().slice(0, 80),
    entryCount: Math.max(0, Number(doc.num_entries ?? doc.numEntries ?? doc.entries_count ?? 0) || 0),
    version: Math.max(0, Number(doc.version || 0) || 0),
    numAttachedCharacters: Math.max(0, Number(doc.numAttachedCharacters ?? doc.num_attached_characters ?? 0) || 0),
    createdAt: String(doc.createdAt || doc.created_at || "").trim(),
    updatedAt: String(doc.updatedAt || doc.updated_at || "").trim(),
    isNsfw: doc.is_nsfw === true || doc.isNsfw === true,
    avatarIsNsfw: doc.avatar_is_nsfw === true || doc.avatarIsNsfw === true,
    profileUrl: `https://spicychat.ai/lorebook/${id}`
  };
}

async function checkPublicLorebookIndexBatch(message) {
  const ids = [...new Set((Array.isArray(message?.ids) ? message.ids : [])
    .map(normalizePublicLorebookId)
    .filter(Boolean))].slice(0, 60);
  if (!ids.length) return { ok: true, results: [] };

  const config = await getLorebookTypesenseConfig();
  if (!config?.ok || !config.lorebookKey) {
    return { ok: false, status: config?.status || "config-error", error: config?.error || "Could not load the current public Lorebook search key." };
  }

  const searches = ids.map(id => ({
    collection: config.lorebookCollection || PUBLIC_LOREBOOK_TYPESENSE_COLLECTION,
    q: "*",
    query_by: PUBLIC_LOREBOOK_TYPESENSE_QUERY_BY,
    filter_by: `lorebook_id:=${id}`,
    per_page: 1
  }));
  const response = await typesenseMultiSearch(searches, 10000, config.lorebookKey, "lorebook-status");
  if (!response.ok) return response;
  const buckets = Array.isArray(response.data?.results) ? response.data.results : [];
  const results = [];
  for (let index = 0; index < ids.length; index += 1) {
    const requestedId = ids[index];
    const bucket = buckets[index];
    if (bucket?.error) {
      results.push({ id: requestedId, found: false, meta: null, error: String(bucket.error || "Typesense query failed.") });
      continue;
    }
    const doc = bucket?.hits?.[0]?.document;
    const meta = publicLorebookIndexDocument(doc);
    results.push({ id: requestedId, found: !!meta, meta: meta || null });
  }
  return {
    ok: true,
    results,
    source: `typesense:${config.lorebookCollection || PUBLIC_LOREBOOK_TYPESENSE_COLLECTION}`,
    configCached: !!config.cached
  };
}

function normalizePublicLorebookEntry(doc) {
  if (!doc || typeof doc !== "object") return null;
  const id = String(doc.id || doc.entry_id || doc.entryId || "").trim();
  const keywords = cleanPublicLorebookList(doc.keywords || doc.keys || doc.keywords_list || []);
  const secondaryKeywords = cleanPublicLorebookList(doc.secondaryKeywords || doc.secondary_keywords || doc.secondary_keys || []);
  const numberOrNull = value => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    id,
    name: String(doc.name || doc.title || "").replace(/\s+/g, " ").trim().slice(0, 500),
    keywords,
    secondaryKeywords,
    content: String(doc.content || doc.text || ""),
    version: doc.version ?? "",
    createdAt: String(doc.createdAt || doc.created_at || "").trim(),
    updatedAt: String(doc.updatedAt || doc.updated_at || "").trim(),
    priority: numberOrNull(doc.priority ?? doc.sortPriority ?? doc.sort_priority),
    sortPriority: numberOrNull(doc.sortPriority ?? doc.sort_priority ?? doc.priority),
    status: String(doc.status || "").trim().slice(0, 120),
    enabled: doc.enabled !== false,
    constant: doc.constant === true,
    selective: doc.selective === true,
    caseSensitive: doc.caseSensitive === true || doc.case_sensitive === true,
    probability: numberOrNull(doc.probability),
    depth: numberOrNull(doc.depth),
    role: String(doc.role || doc.position || "").trim().slice(0, 120),
    isNsfw: doc.is_nsfw === true || doc.isNsfw === true
  };
}

async function fetchPublicLorebookRecovery(message) {
  const lorebookId = normalizePublicLorebookId(message?.lorebookId);
  if (!lorebookId) return { ok: false, status: "invalid-id", error: "Missing or invalid Lorebook UUID." };
  const expectedCount = Math.max(0, Number(message?.expectedCount || 0) || 0);

  const config = await getLorebookTypesenseConfig();
  if (!config?.ok || !config.entryKey) {
    return { ok: false, status: config?.status || "config-error", error: config?.error || "Could not load the current public Lorebook-entry search key." };
  }

  const pageSize = 250;
  const maxPages = 100;
  const filterFields = ["lorebook_id", "lorebookId"];
  const queryFields = [PUBLIC_LOREBOOK_ENTRY_TYPESENSE_QUERY_BY, "name"];
  let lastError = "";
  let emptySuccess = null;

  for (const filterField of filterFields) {
    for (const queryBy of queryFields) {
      const entries = [];
      let found = null;
      let complete = false;
      let failed = false;

      for (let page = 1; page <= maxPages; page += 1) {
        const search = {
          collection: config.entryCollection || PUBLIC_LOREBOOK_ENTRY_TYPESENSE_COLLECTION,
          q: "*",
          query_by: queryBy,
          page,
          per_page: pageSize,
          filter_by: `${filterField}:=${lorebookId}`
        };
        const response = await typesenseMultiSearch([search], 12000, config.entryKey, "lorebook-recovery");
        if (!response?.ok) {
          lastError = response?.error || `Public Lorebook-entry search failed (${response?.status || "unknown"}).`;
          failed = true;
          break;
        }

        const bucket = Array.isArray(response.data?.results) ? response.data.results[0] : null;
        if (bucket?.error) {
          lastError = String(bucket.error || "Public Lorebook-entry query failed.");
          failed = true;
          break;
        }

        if (found === null && Number.isFinite(Number(bucket?.found))) found = Math.max(0, Number(bucket.found));
        const docs = Array.isArray(bucket?.hits) ? bucket.hits.map(hit => hit?.document).filter(Boolean) : [];
        for (const doc of docs) {
          const normalized = normalizePublicLorebookEntry(doc);
          if (normalized) entries.push(normalized);
        }

        if (docs.length < pageSize || (found !== null && entries.length >= found)) {
          complete = true;
          break;
        }
      }

      if (failed) continue;
      if (!complete) {
        lastError = `Public Lorebook-entry recovery exceeded ${maxPages * pageSize} entries before completing.`;
        continue;
      }

      const result = {
        ok: true,
        lorebookId,
        entries,
        found: found === null ? entries.length : found,
        complete: true,
        source: `typesense:${config.entryCollection || PUBLIC_LOREBOOK_ENTRY_TYPESENSE_COLLECTION}`,
        filterField,
        queryBy
      };
      if (entries.length) return result;
      if (!emptySuccess) emptySuccess = result;
    }
  }

  if (emptySuccess) {
    if (expectedCount > 0) {
      return {
        ok: false,
        status: "empty-recovery",
        error: `Public index reports ${expectedCount} entr${expectedCount === 1 ? "y" : "ies"}, but the public entry collection returned none. The previous recovery copy was kept.`,
        source: emptySuccess.source
      };
    }
    return emptySuccess;
  }

  return {
    ok: false,
    status: "entry-query-failed",
    error: lastError || "Public Lorebook-entry recovery produced no usable result."
  };
}

async function runLorebookStatusHelperCheck(message) {
  const lorebookId = normalizePublicLorebookId(message?.lorebookId);
  if (!lorebookId) return { ok: false, status: "unknown", httpStatus: 0, reason: "Missing or invalid Lorebook UUID." };

  const forceOwnHelper = !!message?.forceOwnHelper;
  const worker = await prepareBotStatusWorker({ forceOwnHelper });
  const tabId = Number(worker?.tabId || 0);
  if (!tabId) return { ok: false, status: "unknown", httpStatus: 0, reason: "Could not create or reuse the signed-in Lorebook Status helper." };

  let response = await runTrackedBotStatusRequest(() => withBackgroundJob("bot-status", {
    ownerTabId: tabId,
    detail: `lorebook:${lorebookId}`,
    maxHoldMs: 28000
  }, async () => {
    const result = await tabsSendMessageWithTimeout(tabId, { type: "DS_LOREBOOK_STATUS_API_CHECK", lorebookId }, 24000);
    if (result?.__dsTimeout) return { ok: false, status: "unknown", httpStatus: 0, reason: "Lorebook Status helper timed out during the authenticated recovery-copy request.", recoveryAttempted: true };
    return result;
  }));

  if (!message?.keepHelper) await releaseBotStatusWorker({ reason: "lorebook-status-normal-release" });
  return response || { ok: false, status: "unknown", httpStatus: 0, reason: "Lorebook Status helper returned no response." };
}

async function pickRandomChatCandidates(message) {
  const scope = String(message?.scope || "home").toLowerCase() === "favorites" ? "favorites" : "home";
  const batchSize = Math.min(40, Math.max(6, Number(message?.batchSize || 24) || 24));
  const excluded = new Set((Array.isArray(message?.excludeIds) ? message.excludeIds : []).map(normalizeRandomChatId).filter(Boolean));
  const includeFields = "character_id,name,title,creator_username,tags,avatar_url,is_nsfw";

  const visibleIds = shuffleBackgroundRandom([...new Set((Array.isArray(message?.visibleIds) ? message.visibleIds : []).map(normalizeRandomChatId).filter(Boolean))])
    .filter(id => !excluded.has(id));

  // On Home / Recommended, prefer the cards SpicyChat actually put in the
  // current listing. We still validate them through the public API, so Random
  // Chat follows that page instead of silently becoming a separate discovery
  // feed. If the page has no cards yet, fall back to a direct discovery query.
  if (scope === "home" && visibleIds.length) {
    const ids = visibleIds.slice(0, Math.max(batchSize, 40));
    const searches = ids.map(id => ({
      collection: EXACT_MESSAGE_TYPESENSE_COLLECTION,
      q: "*",
      query_by: EXACT_MESSAGE_TYPESENSE_QUERY_BY,
      filter_by: `application_ids:spicychat && character_id:=${id}`,
      include_fields: includeFields,
      per_page: 1
    }));
    const result = await typesenseMultiSearch(searches, 8000, EXACT_MESSAGE_TYPESENSE_KEY, "random-chat");
    if (!result.ok) return result;
    const candidates = [];
    for (const item of Array.isArray(result.data?.results) ? result.data.results : []) {
      const normalized = randomChatDocument(item?.hits?.[0]?.document);
      if (normalized && !excluded.has(normalized.id)) candidates.push(normalized);
    }
    return { ok: true, scope, candidates: shuffleBackgroundRandom(candidates).slice(0, batchSize), found: candidates.length, source: "visible-listing-api" };
  }

  if (scope === "favorites") {
    const ids = shuffleBackgroundRandom([...new Set((Array.isArray(message?.favoriteIds) ? message.favoriteIds : []).map(normalizeRandomChatId).filter(Boolean))])
      .filter(id => !excluded.has(id))
      .slice(0, Math.max(batchSize, 30));
    if (!ids.length) return { ok: true, scope, candidates: [], found: 0 };
    const searches = ids.map(id => ({
      collection: EXACT_MESSAGE_TYPESENSE_COLLECTION,
      q: "*",
      query_by: EXACT_MESSAGE_TYPESENSE_QUERY_BY,
      filter_by: `application_ids:spicychat && character_id:=${id}`,
      include_fields: includeFields,
      per_page: 1
    }));
    const result = await typesenseMultiSearch(searches, 8000, EXACT_MESSAGE_TYPESENSE_KEY, "random-chat");
    if (!result.ok) return result;
    const candidates = [];
    for (const item of Array.isArray(result.data?.results) ? result.data.results : []) {
      const doc = item?.hits?.[0]?.document;
      const normalized = randomChatDocument(doc);
      if (normalized && !excluded.has(normalized.id)) candidates.push(normalized);
    }
    return { ok: true, scope, candidates: shuffleBackgroundRandom(candidates).slice(0, batchSize), found: candidates.length };
  }

  const q = randomChatHomeQueryFromUrl(message?.sourceUrl);
  const baseSearch = {
    collection: EXACT_MESSAGE_TYPESENSE_COLLECTION,
    q,
    query_by: EXACT_MESSAGE_TYPESENSE_QUERY_BY,
    filter_by: "application_ids:spicychat && tags:![Step-Family]",
    include_fields: includeFields,
    sort_by: "_text_match(buckets: 3):desc,num_messages_24h:desc",
    per_page: 1,
    page: 1
  };
  const meta = await typesenseMultiSearch([baseSearch], 8000, EXACT_MESSAGE_TYPESENSE_KEY, "random-chat");
  if (!meta.ok) return meta;
  const first = Array.isArray(meta.data?.results) ? meta.data.results[0] : null;
  const found = Math.max(0, Number(first?.found || 0) || 0);
  if (!found) return { ok: true, scope, candidates: [], found: 0, q };

  // Typesense numbered pages have a practical result window. Randomize inside
  // that window instead of opening/rendering helper pages in the browser.
  const perPage = 250;
  const pageCount = Math.max(1, Math.min(168, Math.ceil(found / perPage)));
  const page = secureBackgroundRandomInt(pageCount) + 1;
  const pageResult = await typesenseMultiSearch([{ ...baseSearch, page, per_page: perPage }], 8000, EXACT_MESSAGE_TYPESENSE_KEY, "random-chat");
  if (!pageResult.ok) return pageResult;
  const result = Array.isArray(pageResult.data?.results) ? pageResult.data.results[0] : null;
  const candidates = shuffleBackgroundRandom((Array.isArray(result?.hits) ? result.hits : [])
    .map(hit => randomChatDocument(hit?.document))
    .filter(Boolean)
    .filter(candidate => !excluded.has(candidate.id)))
    .slice(0, batchSize);
  return { ok: true, scope, candidates, found, page, pageCount, q };
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
    include_fields: "character_id,num_messages,createdAt",
    per_page: 1
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const network = qolBackgroundNetworkStart("exact-message-counts", "POST", EXACT_MESSAGE_TYPESENSE_URL, { botCount: ids.length });
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
      qolBackgroundNetworkEnd(network, { status: response.status, ok: false, outcome: "http" });
      return { ok: false, status: response.status, error: `Typesense returned HTTP ${response.status}.`, counts: [] };
    }

    const data = await response.json();
    qolBackgroundNetworkEnd(network, { status: response.status, ok: true, outcome: "success" });
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
      counts.push({
        id,
        count: Math.round(count),
        createdAt: doc?.createdAt ?? null
      });
      found.add(requestedId);
    }

    return {
      ok: true,
      counts,
      missing: ids.filter(id => !found.has(id))
    };
  } catch (error) {
    qolBackgroundNetworkEnd(network, { status: 0, ok: false, outcome: error?.name === "AbortError" ? "timeout" : "network-error" });
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
  if (message?.type === "DS_QOL_DIAGNOSTIC_SUBSCRIBE") {
    sendResponse(qolDiagnosticSubscribe(sender, message));
    return false;
  }

  if (message?.type === "DS_QOL_DIAGNOSTIC_STATUS_QUERY") {
    let traceLevel = "off";
    for (const sub of qolDiagnosticSubscribers.values()) {
      if (!sub?.active) continue;
      if (sub.traceLevel === "deep") { traceLevel = "deep"; break; }
      traceLevel = "normal";
    }
    sendResponse({ ok: true, active: traceLevel !== "off", traceLevel, subscribers: qolDiagnosticSubscribers.size, latestSeq: qolDiagnosticBackgroundSeq });
    return false;
  }

  if (message?.type === "DS_QOL_DIAGNOSTIC_BACKGROUND_EMIT") {
    const level = message?.level === "deep" ? "deep" : "normal";
    const event = qolBackgroundTrace(String(message?.event || "event"), String(message?.feature || "options"), message?.meta || {}, { level, critical: !!message?.critical });
    sendResponse({ ok: true, seq: Number(event?.seq || 0) });
    return false;
  }
  const tabId = sender.tab?.id;

  if (message?.type === "DS_BOT_STATUS_PERSIST_DELTA") {
    persistBotStatusDelta(message).then(sendResponse).catch(error => {
      sendResponse({ ok: false, error: error?.message || String(error) });
    });
    return true;
  }

  if (message?.type === "DS_REQUEST_DOWNLOAD_PERMISSION") {
    if (!chrome.permissions?.contains || !chrome.permissions?.request) {
      sendResponse({ ok: false, status: "permissions-api-unavailable" });
      return false;
    }
    chrome.permissions.contains({ permissions: ["downloads"] }, allowed => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, status: "permission-check-failed", error: chrome.runtime.lastError.message });
        return;
      }
      if (allowed) {
        sendResponse({ ok: true, alreadyGranted: true });
        return;
      }
      try {
        chrome.permissions.request({ permissions: ["downloads"] }, granted => {
          const error = chrome.runtime.lastError?.message || "";
          sendResponse({
            ok: !!granted && !error,
            granted: !!granted,
            status: granted ? "granted" : "not-granted",
            error
          });
        });
      } catch (error) {
        sendResponse({ ok: false, status: "request-failed", error: error?.message || String(error) });
      }
    });
    return true;
  }

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

  if (message?.type === "DS_QOL_BACKGROUND_WORKER_IDENTITY_QUERY") {
    const senderTabId = Number(sender?.tab?.id || 0);
    restoreBotStatusWorkerSession()
      .then(() => {
        const isBotStatus = !!senderTabId && (
          Number(botStatusWorkerTabId || 0) === senderTabId ||
          botStatusWorkerTabIds.has(senderTabId)
        );
        if (isBotStatus) {
          noteBotStatusWorkerHeartbeat(senderTabId, message?.sessionId || "");
          sendResponse({
            ok: true,
            worker: "bot-status",
            tabId: senderTabId,
            owned: !!botStatusWorkerOwned,
            sessionId: botStatusWorkerSessionId || "",
            heartbeatTtlMs: BOT_STATUS_WORKER_HEARTBEAT_TTL_MS,
            throttledTtlMs: BOT_STATUS_WORKER_THROTTLED_TTL_MS
          });
        } else {
          sendResponse({ ok: true, worker: "", tabId: senderTabId });
        }
      })
      .catch(error => sendResponse({ ok: false, worker: "", error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_PACE_WAIT") {
    const delayMs = Math.max(0, Math.min(10000, Number(message?.delayMs || 0)));
    // Keep the extension service worker/message channel alive for scan pacing.
    // This avoids relying on setTimeout cadence in a backgrounded Options tab,
    // which Chromium can throttle for minutes at a time.
    setTimeout(() => sendResponse({ ok: true, waitedMs: delayMs, at: Date.now() }), delayMs);
    return true;
  }

  if (message?.type === "DS_RECOMMENDATION_PACE_WAIT") {
    const delayMs = Math.max(0, Math.min(30000, Number(message?.delayMs || 0)));
    // Recommendation queues use service-worker-owned pacing too. Hidden
    // Options-page timers were the reason old Quick Dislike stretched a
    // sub-second interval into multi-minute gaps.
    setTimeout(() => sendResponse({ ok: true, waitedMs: delayMs, at: Date.now() }), delayMs);
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_GET") {
    getLargeStorageValues(message?.keys ?? null)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, data: {}, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_GET_RECORDS") {
    const key = String(message?.key || "");
    readLargeStorageRecords(key, message?.ids || [])
      .then(records => sendResponse({ ok: true, key, records }))
      .catch(error => sendResponse({ ok: false, key, records: {}, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_GET_PAGE") {
    const key = String(message?.key || "");
    readLargeStoragePage(key, { afterId: message?.afterId || "", limit: message?.limit })
      .then(page => sendResponse({ ok: true, ...page }))
      .catch(error => sendResponse({ ok: false, key, rows: [], done: true, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_STATS") {
    getLargeStorageStats()
      .then(stats => sendResponse({ ok: true, stats }))
      .catch(error => sendResponse({ ok: false, stats: {}, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_SET") {
    setLargeStorageValues(message?.values || {})
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_MERGE") {
    const key = String(message?.key || "");
    mergeLargeStorageEntries(key, message?.entries || {})
      .then(ok => sendResponse({ ok: !!ok, key }))
      .catch(error => sendResponse({ ok: false, key, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_REMOVE") {
    const keys = largeStorageRequestedKeys(message?.keys ?? null);
    Promise.all(keys.map(clearLargeStorage))
      .then(() => sendResponse({ ok: true, keys }))
      .catch(error => sendResponse({ ok: false, keys, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_WORKER_HEARTBEAT") {
    const senderTabId = Number(sender?.tab?.id || 0);
    restoreBotStatusWorkerSession()
      .then(async () => {
        const accepted = noteBotStatusWorkerHeartbeat(senderTabId, message?.sessionId || "");
        if (accepted && senderTabId) {
          botStatusWorkerTabIds.add(senderTabId);
          if (!botStatusWorkerSessionId) {
            botStatusWorkerSessionId = String(message?.sessionId || createBotStatusWorkerSessionId());
            await rememberBotStatusWorker(senderTabId, !!botStatusWorkerOwned, botStatusWorkerSessionId);
          }
        }
        sendResponse({
          ok: accepted,
          worker: accepted ? "bot-status" : "",
          sessionId: accepted ? (botStatusWorkerSessionId || "") : "",
          heartbeatTtlMs: BOT_STATUS_WORKER_HEARTBEAT_TTL_MS,
          throttledTtlMs: BOT_STATUS_WORKER_THROTTLED_TTL_MS
        });
      })
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_RUN_EVENT") {
    const event = String(message.event || "bot-status-event").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "bot-status-event";
    recordHelperLifecycle(event, message.detail || {})
      .then(diag => sendResponse({ ok: true, event: diag?.lastEvent || event }))
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error || "") }));
    const tabId = Number(botStatusWorkerTabId || 0);
    if (tabId) tabsSendMessage(tabId, { type: "DS_BOT_STATUS_DIAG_EVENT", event, detail: message.detail || {} }).catch?.(() => null);
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_HELPER_PREPARE") {
    prepareBotStatusWorker({ forceOwnHelper: message?.forceOwnHelper !== false })
      .then(worker => sendResponse({
        ok: !!worker?.tabId && worker?.ready !== false,
        ready: worker?.ready !== false,
        tabId: Number(worker?.tabId || 0),
        owned: !!worker?.owned,
        sessionId: String(worker?.sessionId || botStatusWorkerSessionId || ""),
        status: worker?.status || (worker?.tabId ? "ready" : "worker-tab-failed")
      }))
      .catch(error => sendResponse({ ok: false, ready: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_HELPER_CHECK") {
    runBotStatusHelperCheck(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LOREBOOK_STATUS_HELPER_CHECK") {
    runLorebookStatusHelperCheck(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "unknown", httpStatus: 0, reason: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LOREBOOK_STATUS_PUBLIC_CHECK_BATCH") {
    checkPublicLorebookIndexBatch(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LOREBOOK_PUBLIC_RECOVERY_FETCH") {
    fetchPublicLorebookRecovery(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "entry-query-failed", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_HELPER_RELEASE") {
    releaseBotStatusWorker()
      .then(released => sendResponse({ ok: true, released }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_DISLIKE_CANCEL_BULK") {
    sendResponse({ ok: markQuickDislikeBulkRunCanceled(message.bulkRunId) });
    return;
  }

  if (message?.type === "DS_QUICK_DISLIKE_RELEASE_BULK") {
    Promise.all([
      releaseQuickDislikeBulkWorker(message.bulkRunId),
      releaseQuickLessLikeBulkWorker(message.bulkRunId)
    ])
      .then(values => sendResponse({ ok: true, released: values.some(Boolean) }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_DISLIKE_BOT") {
    queueQuickDislikeBot(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_LESS_LIKE_CANCEL_BULK") {
    sendResponse({ ok: markQuickLessLikeBulkRunCanceled(message.bulkRunId) });
    return;
  }

  if (message?.type === "DS_QUICK_LESS_LIKE_RELEASE_BULK") {
    releaseQuickLessLikeBulkWorker(message.bulkRunId)
      .then(released => sendResponse({ ok: true, released }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_LESS_LIKE_PREPARE_BULK") {
    prepareQuickLessLikeBulkWorker(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "recommendation-worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_LESS_LIKE_BOT") {
    queueQuickLessLikeBot({ ...message, sourceTabId: tabId })
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }


  if (message?.type === "DS_RANDOM_CHAT_PICK") {
    pickRandomChatCandidates(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "random-chat-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LISTING_REFILL_PAGE") {
    runListingRefillPageWorker({ ...message, sourceTabId: tabId })
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LISTING_REFILL_RELEASE") {
    releaseListingRefillPageWorker(message.runId)
      .then(released => sendResponse({ ok: true, released }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
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
      if (settings.enabled === false || (!settings.autoAfkEnabled && !settings.lowMemoryProtectionEnabled) || !tabId) {
        sendResponse({ ok: false });
        return;
      }

      if (message.reason === "opened" && settings.autoAfkResetOnActivate === false && !settings.lowMemoryProtectionEnabled) {
        sendResponse({ ok: true, ignored: true });
        return;
      }

      await markAutoAfkActivity(tabId);
      if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(350);
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
            if (message.type === "DS_RECOVER_OPTIONS_SOURCE_PAGE") {
              chrome.tabs.reload(tab.id, {}, () => {
                const reloadError = chrome.runtime.lastError?.message || "";
                sendResponse(reloadError
                  ? { ok: false, error: reloadError }
                  : { ok: true, reloaded: true, status: "source-tab-reloaded" });
              });
              return;
            }
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
    rememberOptionsSourceTab(Number(message.tabId)).catch(() => {});
    chrome.runtime.openOptionsPage(() => {
      sendResponse({ ok: !chrome.runtime.lastError });
    });
    return true;
  }

  if (message?.type === "DS_OPEN_OPTIONS_TARGET") {
    const sourceTabId = Number(message.tabId || tabId || 0);
    rememberOptionsSourceTab(sourceTabId).catch(() => {});
    const target = String(message.target || "general").replace(/[^a-z0-9-]/gi, "") || "general";
    const query = String(message.query || "").trim().slice(0, 180);
    const url = chrome.runtime.getURL(`options.html${query ? `?search=${encodeURIComponent(query)}` : ""}#${target}`);
    chrome.tabs.create({ url }, created => {
      if (created && !chrome.runtime.lastError) {
        sendResponse({ ok: true });
        return;
      }
      chrome.runtime.openOptionsPage(() => sendResponse({ ok: !chrome.runtime.lastError }));
    });
    return true;
  }

  if (message?.type === "DS_OPEN_OPTIONS") {
    rememberOptionsSourceTab(tabId).catch(() => {});
    const url = chrome.runtime.getURL("options.html#general");
    chrome.tabs.create({ url }, created => {
      if (created && !chrome.runtime.lastError) { sendResponse({ ok: true }); return; }
      chrome.runtime.openOptionsPage(() => sendResponse({ ok: !chrome.runtime.lastError }));
    });
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

  if (message?.type === "DS_BACKGROUND_JOB_ACQUIRE") {
    acquireBackgroundJob(message.jobType, {
      ownerTabId: tabId,
      detail: message.detail,
      maxHoldMs: message.maxHoldMs
    }).then(sendResponse).catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_BACKGROUND_JOB_RELEASE") {
    sendResponse({ ok: releaseBackgroundJob(message.leaseId) });
    return false;
  }

  if (message?.type === "DS_QUICK_LESS_LIKE_CLIENT_TIMING" || message?.type === "DS_QUICK_LESS_LIKE_RUN_TIMING") {
    const targetTabId = Number(message?.feedbackTabId || message?.tabId || 0);
    if (!targetTabId) {
      sendResponse({ ok: false, status: "missing-target-tab" });
      return false;
    }
    const forwardType = message.type === "DS_QUICK_LESS_LIKE_RUN_TIMING"
      ? "DS_QUICK_LESS_LIKE_RUN_TIMING"
      : "DS_QUICK_LESS_LIKE_TIMING";
    tabsSendMessage(targetTabId, {
      type: forwardType,
      botId: String(message?.botId || ""),
      runId: String(message?.runId || ""),
      phase: String(message?.phase || ""),
      timing: message?.timing && typeof message.timing === "object" ? message.timing : {},
      meta: message?.meta && typeof message.meta === "object" ? message.meta : {}
    }).then(response => sendResponse({ ok: !!response?.ok, response })).catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
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

  if (alarm.name === LISTING_REFILL_GC_ALARM) {
    cleanupStaleListingRefillWorkers({ closeLegacy: true });
    return;
  }

  if (alarm.name === QUICK_DISLIKE_GC_ALARM) {
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
  if (settings.enabled === false) return;

  const tab = await tabsGet(activeInfo.tabId);
  if (!tab || !isSpicyChatUrl(tab.url) || isDedicatedWorkerTab(tab)) return;
  if (settings.lowMemoryProtectionEnabled) markLowMemoryWakeGrace(tab.id);

  // LRU protection needs real "last used" ordering even when the timer's
  // reset-on-activate option is off.
  if (settings.lowMemoryProtectionEnabled || (settings.autoAfkEnabled && settings.autoAfkResetOnActivate !== false)) {
    await markAutoAfkActivity(tab.id);
  }
  if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(250);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (quickLessLikeWorkerTabIds.has(Number(tabId)) && (changeInfo.url || changeInfo.status === "loading")) {
    quickLessLikeReadyWorkerTabs.delete(Number(tabId));
  }
  const spicyUrl = tab?.url || changeInfo.url || tab?.pendingUrl;
  if (!isSpicyChatUrl(spicyUrl)) return;
  if (botStatusWorkerTabIds.has(Number(tabId))) {
    // The query parameter is bootstrap-only. SpicyChat's Home router is free to
    // replace the URL; the tab/session/heartbeat remain the worker identity.
    // Never navigate the helper back to the marker URL just because it vanished.
    return;
  }
  if (quickDislikeWorkerTabIds.has(Number(tabId)) || quickLessLikeWorkerTabIds.has(Number(tabId)) || botStatusWorkerTabIds.has(Number(tabId)) || listingRefillWorkerTabIds.has(Number(tabId)) || personaRefreshWorkerTabIds.has(Number(tabId)) || isQuickDislikeWorkerUrl(spicyUrl) || isQuickLessLikeWorkerUrl(spicyUrl) || isBotStatusWorkerUrl(spicyUrl) || isListingRefillWorkerUrl(spicyUrl) || isPersonaRefreshWorkerUrl(spicyUrl)) return;

  if (changeInfo.url) {
    const duplicateSettings = await getDuplicateTabSettings();
    if (duplicateSettings.enabled !== false && duplicateSettings.duplicateTabGuardEnabled) {
      queueDuplicateTabScan({ initiatorTabId: tabId, focusExisting: !!tab?.active });
    }
  }

  const settings = await getAutoAfkSettings();
  if (settings.enabled === false) return;
  if (settings.lowMemoryProtectionEnabled && (changeInfo.discarded === false || (changeInfo.status === "complete" && tab?.active))) {
    markLowMemoryWakeGrace(tabId);
  }

  // A URL change means a new normal SpicyChat page was opened in this tab.
  if ((settings.lowMemoryProtectionEnabled || (settings.autoAfkEnabled && settings.autoAfkResetOnActivate !== false)) &&
      (changeInfo.url || (changeInfo.status === "complete" && tab?.active))) {
    await markAutoAfkActivity(tabId);
  }
  if (settings.lowMemoryProtectionEnabled && (changeInfo.url || changeInfo.status === "complete")) {
    scheduleLowMemoryProtectionScan(tab?.active ? 250 : 700);
  }
});

chrome.tabs.onCreated.addListener(tab => {
  if (!tab?.id || !isSpicyChatUrl(tab.url || tab.pendingUrl)) return;
  if (isQuickDislikeWorkerUrl(tab.url || tab.pendingUrl)) {
    quickDislikeWorkerTabIds.add(Number(tab.id));
    return;
  }
  if (isQuickLessLikeWorkerUrl(tab.url || tab.pendingUrl)) {
    quickLessLikeWorkerTabIds.add(Number(tab.id));
    return;
  }
  if (isBotStatusWorkerUrl(tab.url || tab.pendingUrl)) {
    botStatusWorkerTabIds.add(Number(tab.id));
    botStatusWorkerTabId = Number(tab.id);
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
    if (settings.enabled === false) return;
    if (settings.lowMemoryProtectionEnabled || (settings.autoAfkEnabled && settings.autoAfkResetOnActivate !== false)) {
      markAutoAfkActivity(tab.id);
    }
    if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(500);
  });
});

chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  getAutoAfkSettings().then(async settings => {
    if (settings.enabled === false) return;
    const tabs = await tabsQuery({ active: true, windowId });
    const tab = tabs[0];
    if (tab?.id && isSpicyChatUrl(tab.url) && !isDedicatedWorkerTab(tab)) {
      if (settings.lowMemoryProtectionEnabled || (settings.autoAfkEnabled && settings.autoAfkResetOnActivate !== false)) {
        await markAutoAfkActivity(tab.id);
      }
      if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(250);
    }
  });
});

chrome.tabs.onRemoved.addListener(tabId => {
  qolDiagnosticSubscribers.delete(Number(tabId));
  lowMemoryWakeGraceUntil.delete(Number(tabId));
  // Close any refill helper that belongs to a source tab the user just closed.
  for (const [runId, sourceTabId] of [...listingRefillSourceTabs.entries()]) {
    if (Number(sourceTabId) !== Number(tabId)) continue;
    listingRefillSourceTabs.delete(runId);
    releaseListingRefillPageWorker(runId).catch(() => {});
  }

  if (Number(tabId) === Number(tabCleanupWorkerTabId)) tabCleanupWorkerTabId = null;
  tabCleanupWorkerTabIds.delete(Number(tabId));
  quickDislikeWorkerTabIds.delete(Number(tabId));
  if (Number(quickDislikePersistentWorkerTabId) === Number(tabId)) quickDislikePersistentWorkerTabId = null;
  for (const [runId, workerTabId] of quickDislikeBulkWorkerTabs.entries()) {
    if (Number(workerTabId) === Number(tabId)) quickDislikeBulkWorkerTabs.delete(runId);
  }
  quickLessLikeWorkerTabIds.delete(Number(tabId));
  quickLessLikeReadyWorkerTabs.delete(Number(tabId));
  if (Number(quickLessLikePersistentWorkerTabId) === Number(tabId)) {
    quickLessLikePersistentWorkerTabId = null;
    storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: 0 }).catch(() => {});
  }
  const removedBotStatusWorker = botStatusWorkerTabIds.has(Number(tabId)) || Number(botStatusWorkerTabId) === Number(tabId);
  const expectedBotStatusClose = botStatusWorkerExpectedCloseIds.delete(Number(tabId));
  botStatusWorkerTabIds.delete(Number(tabId));
  if (Number(botStatusWorkerTabId) === Number(tabId)) {
    botStatusWorkerTabId = null;
    botStatusWorkerOwned = false;
    botStatusWorkerHeartbeatAt = 0;
    botStatusWorkerSessionId = "";
    rememberBotStatusWorker(0, false, "").catch(() => {});
  }
  if (removedBotStatusWorker && !expectedBotStatusClose) recordHelperLifecycle("bot-status-worker-lost", { tabId: Number(tabId), reason: "tab-closed-unexpected" }).catch(() => {});
  for (const [runId, workerTabId] of quickLessLikeBulkWorkerTabs.entries()) {
    if (Number(workerTabId) === Number(tabId)) {
      quickLessLikeBulkWorkerTabs.delete(runId);
      quickLessLikeClosedBulkRuns.set(String(runId), Date.now());
    }
  }
  for (const [runId, directTabId] of quickLessLikeDirectBulkTabs.entries()) {
    if (Number(directTabId) === Number(tabId)) quickLessLikeDirectBulkTabs.delete(runId);
  }
  listingRefillWorkerTabIds.delete(Number(tabId));
  for (const [runId, workerTabId] of listingRefillPageWorkerTabs.entries()) {
    if (Number(workerTabId) === Number(tabId)) listingRefillPageWorkerTabs.delete(runId);
  }
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
  if (!changes.settings && !granularChanges.length) return;

  (async () => {
    let beforeSettings = {};
    let afterSettings = {};
    if (changes.settings) {
      beforeSettings = changes.settings.oldValue || {};
      afterSettings = changes.settings.newValue || {};
    } else {
      afterSettings = (await storageGet(["settings"])).settings || {};
      beforeSettings = { ...afterSettings };
      for (const [name, change] of granularChanges) {
        if (change?.oldValue === undefined) delete beforeSettings[name];
        else beforeSettings[name] = change.oldValue;
      }
    }

    const before = { ...AUTO_AFK_DEFAULTS, ...beforeSettings };
    const after = { ...AUTO_AFK_DEFAULTS, ...afterSettings };
    const justEnabled = (!before.autoAfkEnabled && !!after.autoAfkEnabled) ||
      (!before.lowMemoryProtectionEnabled && !!after.lowMemoryProtectionEnabled);
    configureAutoAfkAlarm(justEnabled);

    const duplicateBefore = { ...DUPLICATE_TAB_DEFAULTS, ...beforeSettings };
    const duplicateAfter = { ...DUPLICATE_TAB_DEFAULTS, ...afterSettings };
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
  })().catch(() => {});
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
  initializeHelperLifecycleRecovery();
});

chrome.runtime.onStartup.addListener(() => {
  syncAutoAfkTabs().finally(() => configureAutoAfkAlarm(false));
  getDuplicateTabSettings().then(settings => {
    if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
  });
  configureChatNudgeAlarm(true);
  configureCreatorBotWatchAlarm(false).finally(() => queueCreatorBotScan({ force: false, reason: "startup" }));
  initializeHelperLifecycleRecovery();
});

configureAutoAfkAlarm(false);
getDuplicateTabSettings().then(settings => {
  if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
});
configureChatNudgeAlarm(false);
configureCreatorBotWatchAlarm(false);
initializeHelperLifecycleRecovery();

// v0.2.25 account/device sync is intentionally isolated from the large
// background worker coordinator. Keep it in its own file, but load it from the
// canonical background.js because the release builder pins this entry point for
// both Chromium and Firefox packages. Chromium runs a service worker; Firefox's
// generated manifest may run a background page instead, so support both loaders.
try {
  if (typeof importScripts === "function") {
    importScripts("sync-service.js");
  } else if (typeof document !== "undefined") {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("sync-service.js");
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }
} catch (error) {
  console.warn("[SpicyChat QoL] Sync service failed to load", error);
}
