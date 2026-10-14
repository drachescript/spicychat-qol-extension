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
const STALE_RUNTIME_TABS_KEY = "dsQolStaleRuntimeTabsV1";
const STALE_RUNTIME_AUTO_RELOAD_SESSION_KEY = "dsQolStaleRuntimeAutoReloadsV1";
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
  autoAfkChats: true,
  autoAfkHome: false,
  autoAfkProfiles: false,
  autoAfkAction: "discard",
  autoAfkProtectActive: true,
  autoAfkResetOnActivate: true
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















let qolDiagnosticBackgroundNetworkSeq = 0;
























































































































































const LARGE_STORAGE_DB_NAME = "dragon-spicychat-qol-large-v1";
const LARGE_STORAGE_DB_VERSION = 2;
const LARGE_STORAGE_META_STORE = "__meta";
const LARGE_STORAGE_KEYS = new Set(["botAvailability", "botArchive", "lorebookStatus"]);
// Cold, per-record compression. Ordinary callers always receive the original
// JSON shape; only the background's IndexedDB representation changes.
const LARGE_STORAGE_CODEC = "gzip-json-v1";
const LARGE_STORAGE_MIN_BYTES = 1800;
const LARGE_STORAGE_MIN_SAVINGS = 0.22;
const LARGE_STORAGE_MAX_UNPACKED_BYTES = 8 * 1024 * 1024;
const LARGE_STORAGE_OPTIMIZE_BATCH_LIMIT = 50;
const LARGE_STORAGE_SUMMARY_FIELDS = {
  botAvailability: ["id", "name", "image", "creator", "profileUrl", "chatUrl", "status", "reason", "checkedAt", "updateStatus", "unavailableConfirmedAt", "recoveredAt"],
  botArchive: ["id", "name", "creator", "image", "profileUrl", "lastSavedAt", "ownBot", "source", "coverage"],
  lorebookStatus: ["id", "name", "creator", "image", "profileUrl", "visibility", "status", "entryCount", "checkedAt", "updatedAt"]
};















// Explicit, small-batch upgrade for older IndexedDB rows. Runs only when the
// user chooses Optimize stored data. Every write checks the source still matches,
// so a Bot Status scan cannot be overwritten by stale optimization results.


let largeStorageDbPromise = null;
const largeStorageMigrationPromises = new Map();











































// Bot Status scans can touch a relatively small set of IDs while the persisted
// availability/archive objects contain thousands of entries. Merge those deltas
// in the service worker so the Options document does not have to structured-clone
// and serialize the complete multi-megabyte stores on its UI thread.
let botStatusPersistQueue = Promise.resolve();














































































































































































































































// background/background-auto-afk.js is loaded by background-entry.js.






































// Translation background operations now lives in its own Settings script.










// background/background-wiki-fetch.js is loaded by background-entry.js.








































// Bulk Lorebook backup can fall back to the real editor when the authenticated
// API is restricted. Keep one dedicated background editor alive and navigate it
// between Lorebooks/pages instead of creating + destroying a full SpicyChat tab
// for every Details/Entries step. The URL marker also lets a restarted MV3
// service worker rediscover the helper rather than opening a duplicate.
const LOREBOOK_EXPORT_WORKER_PARAM = "dsQolLorebookBackupWorker";
const LOREBOOK_EXPORT_HELPER_IDLE_CLOSE_MS = 30_000;
let lorebookExportHelperTabId = 0;
let lorebookExportHelperQueue = Promise.resolve();
let lorebookExportHelperBusy = 0;
let lorebookExportHelperIdleTimer = null;



















// Event registration runs after the shared background helpers have loaded.
