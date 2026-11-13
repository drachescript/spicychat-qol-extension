// Storage keys, Options performance counters, and shared page state.
const OPENED_KEY = "openedChats";
const OPENED_META_KEY = "openedChatMeta";
const BLOCKED_BOTS_KEY = "blockedBots";
const NOT_INTERESTED_KEY = "notInterestedBots";
const PERSONAS_KEY = "personas";
const PERSONA_ORG_KEY = "personaOrganization";
const LEGACY_PERSONAS_KEY = "savedPersonas";
const OOC_TEMPLATES_KEY = "oocTemplates";
const FAVORITE_CREATORS_KEY = "favoriteCreators";
const FOLLOWED_CREATORS_KEY = "followedCreators";
const CREATOR_BOT_WATCH_KEY = "creatorBotWatchV1";
const CREATOR_BOT_WEBHOOK_KEY = "creatorBotWebhookV1";
const CREATOR_BOT_WATCH_INTERVALS = [15, 30, 60, 180, 360, 720, 1440, 2880, 4320, 10080, 20160];
const DEEPL_API_KEY = "deeplApiKey";
const LIBRE_TRANSLATE_KEY = "dsLibreTranslateKeyV1";
const FAVORITE_BOTS_KEY = "favoriteBots";
const LATER_BOTS_KEY = "laterBots";
const BOT_ORGANIZER_KEY = "botOrganization";
const CHAT_ORGANIZER_KEY = "chatOrganization";
const CHARACTER_QOL_PROFILES_KEY = "characterQolProfiles";
const BOT_AVAILABILITY_KEY = "botAvailability";
const BOT_ARCHIVE_KEY = "botArchive";
const LOREBOOK_STATUS_KEY = "lorebookStatus";
const LARGE_STORAGE_KEYS = new Set([BOT_AVAILABILITY_KEY, BOT_ARCHIVE_KEY, LOREBOOK_STATUS_KEY]);
const BOT_UNAVAILABLE_RECOVERY_KEY = "botUnavailableRecoveryV1";
const BOT_STATUS_IGNORED_KEY = "botStatusIgnoredIdsV1";
const BOT_DISCOVERY_INDEX_KEY = "botDiscoveryIndexV1";
const LOREBOOK_BACKUPS_KEY = "lorebookBackups";
const SAVED_TEXT_SNIPPETS_KEY = "savedTextSnippets";
const CONTEXT_KEEPER_DATA_KEY = "contextKeeperData";
const CHAT_SCENE_NOTES_KEY = "chatSceneNotesV1";
const STORY_DAY_TRACKER_KEY = "storyDayTrackerData";
const RP_STATE_TRACKER_KEY = "rpStateTrackerData";
const CHAT_NUDGE_STORE_KEY = "chatNudgeSubscriptionsV1";
const GENERATION_PROFILES_KEY = "generationProfiles";
const AUTO_AFK_STATUS_KEY = "dsAutoAfkLastScan";
const DUPLICATE_TAB_STATUS_KEY = "dsDuplicateTabLastScan";
const SAI_TOOLKIT_PRESENCE_KEY = "dsSaiToolkitPresence";
const SPICYCHAT_BETA_CAPABILITIES_KEY = "dsSpicyChatBetaCapabilitiesV1";
const RELEASE_NOTICE_KEY = "dsReleaseNotice";
const LAST_SEEN_VERSION_KEY = "dsLastSeenReleaseVersion";
const FIRST_RUN_SETUP_PENDING_KEY = "dsFirstRunSetupPendingV1";
const FIRST_RUN_SETUP_COMPLETED_KEY = "dsFirstRunSetupCompletedV1";
const FIRST_RUN_OPT_IN_DEFAULTS_KEY = "dsFirstRunOptInDefaultsAppliedV1";
const SMART_FILTER_PRESETS_KEY = "dsSmartFilterPresets";
const SMART_FILTER_PINNED_KEY = "dsSmartFilterPinnedPresets";
const BOT_EDITOR_DRAFT_HISTORY_KEY = "dsBotEditorDraftHistory";
const LOCAL_CHANGE_HISTORY_KEY = "localActionHistory";
const CHAT_BOOKMARKS_KEY = "chatBookmarks";
const RECENTLY_SEEN_BOTS_KEY = "recentlySeenBots";
const PENDING_OPTIONS_NAV_KEY = "pendingOptionsNavigation";
const CHATBOT_LOREBOOK_LINKS_KEY = "chatbotLorebookLinks";
const PENDING_BOT_FIELD_RESTORE_KEY = "dsPendingBotFieldRestoreV1";
const PERFORMANCE_BASELINE_KEY = "dsPerformanceBaselineV1";
const CHAT_BACKGROUNDS_KEY = "chatBackgroundMediaV1";
const QUICK_DISLIKE_HISTORY_KEY = "quickDislikeHistoryV1";
const QUICK_DISLIKE_BULK_STATE_KEY = "quickDislikeBulkStateV1";
const QUICK_LESS_LIKE_HISTORY_KEY = "quickLessLikeHistoryV1";
const QUICK_LESS_LIKE_BULK_STATE_KEY = "quickLessLikeBulkStateV1";
const AUTO_BLOCK_WORD_EXCEPTIONS_KEY = "autoBlockWordExceptionsV1";
const AUTO_BLOCK_TAG_EXCEPTIONS_KEY = "autoBlockTagExceptionsV1";
const GRANULAR_SETTING_PREFIX = "dsSettingV1:";
const GRANULAR_SETTINGS_INDEX_KEY = "dsSettingsIndexV1";
const GRANULAR_SETTINGS_MIGRATION_KEY = "dsGranularSettingsV1";
const GRANULAR_SETTINGS_REVISION_KEY = "dsSettingsRevisionV1";
const GRANULAR_SETTINGS_LAST_BATCH_KEY = "dsSettingsLastBatchV1";
const QOL_SYNC_STATE_KEY = "qolSyncStateV1";
const QOL_SYNC_DEVICE_PREFS_KEY = "qolSyncDevicePrefsV1";
const QOL_SYNC_DEVICE_SCHEMA_VERSION = 1;
const PLATFORM_API = window.SpicyChatQoLPlatform || null;
const BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD = 3;
const BULK_DISLIKE_RETRY_LIMIT = 2;
const BULK_DISLIKE_RETRY_BASE_MS = 1200;

// Bulk Less Like stays strictly serial. These values are intentionally kept in
// one place so pacing can be tuned from real Inspector captures without
// scattering sleeps/cooldowns throughout the worker loop. The existing
// blockedBulkDislikeDelayMs setting is used as the *starting* Less Like
// interval; adaptive pacing then moves within the bounds below.
const BULK_LESS_LIKE_PACING = Object.freeze({
  minIntervalMs: 350,
  maxIntervalMs: 5000,
  successWindow: 25,
  successStepDownMs: 50,
  transientStepUpMs: 250,
  serverErrorMultiplier: 1.5,
  throttleMultiplier: 2,
  retryLimit: 2,
  retryBaseMs: 1500,
  retryMaxMs: 30000,
  checkpointEveryItems: 50,
  checkpointEveryMs: 30000,
  availabilityCheckpointEvery: 50,
  uiUpdateEveryMs: 300,
  latencyWindowSize: 31
});

const optionsDiagnosticState = { active: false, traceLevel: "off", checkedAt: 0 };







setTimeout(() => { refreshOptionsDiagnosticState(true).catch(() => {}); }, 0);
document.addEventListener("click", event => {
  if (!optionsDiagnosticState.active) return;
  const control = event.target?.closest?.("button, a, summary");
  if (!control) return;
  const controlId = String(control.id || control.getAttribute?.("data-action") || control.classList?.[0] || control.tagName || "control").slice(0, 100);
  optionsDiag("options", "user-action", { action: "click", controlId });
}, true);

const BULK_DISLIKE_TRANSIENT_STATUSES = new Set([
  "worker-timeout",
  "worker-tab-failed",
  "worker-closed",
  "rating-modal-not-found",
  "done-button-not-ready",
  "worker-error",
  "failed"
]);
const BULK_LESS_LIKE_TRANSIENT_STATUSES = new Set([
  "worker-timeout",
  "worker-tab-failed",
  "worker-closed",
  "native-helper-content-not-ready",
  "navigation-timeout",
  "card-not-found",
  "menu-button-not-found",
  "less-like-missing",
  "submit-failed",
  "submit-not-confirmed",
  "direct-feedback-timeout",
  "direct-feedback-unavailable",
  "recombee-request-failed",
  "recombee-rate-limited",
  "recombee-server-error",
  "recombee-network-error",
  "recombee-token-not-found",
  "bot-not-found",
  "character-auth-not-ready",
  "character-auth-rejected",
  "character-api-timeout",
  "character-api-network-failure",
  "character-rate-limited",
  "worker-error",
  "failed"
]);
const RECOVERY_SNAPSHOT_KEY = "dsRecoverySnapshotV1";
const RECOVERY_SNAPSHOT_META_KEY = "dsRecoverySnapshotMetaV1";
// Local safety copies are compressed and held outside chrome.storage.local.
// Never silently write a full uncompressed backup (75+ MiB) into local storage.
const RECOVERY_SNAPSHOT_DB_NAME = "dragon-spicychat-qol-recovery-v1";
const RECOVERY_SNAPSHOT_DB_STORE = "snapshots";
const RECOVERY_SNAPSHOT_DB_ID = "latest";
const RECOVERY_SNAPSHOT_MAX_JSON_BYTES = 160 * 1024 * 1024;
const RECOVERY_SNAPSHOT_MAX_GZIP_BYTES = 24 * 1024 * 1024;

const BACKUP_FORMAT_VERSION = 14;

const ARCHIVE_IMPORT_ENDPOINT_KEY = "dsArchiveImportEndpointV1";
const ARCHIVE_IMPORT_TOKEN_KEY = "dsArchiveImportTokenV1";
const ARCHIVE_UPLOAD_STATE_KEY = "dsBotStatusArchiveUploadStateV1";
const ARCHIVE_CONTRIBUTION_ENABLED_KEY = "dsArchivePublicContributionEnabledV1";
const ARCHIVE_CONTRIBUTION_INSTALL_ID_KEY = "dsArchivePublicContributionInstallIdV1";
const ARCHIVE_CONTRIBUTION_STATE_KEY = "dsBotStatusArchiveSubmissionStateV1";
const DEFAULT_ARCHIVE_IMPORT_ENDPOINT = "https://spicychat-archive-import.dragongraf.workers.dev/api/imports/bot-status";
const DEFAULT_ARCHIVE_SUBMISSION_ENDPOINT = "https://spicychat-archive-import.dragongraf.workers.dev/api/submissions/bot-status";
const ARCHIVE_UPLOAD_SOFT_MAX_BYTES = 60 * 1024 * 1024;
const ARCHIVE_UPLOAD_CHUNK_SIZE = 1000;
const BOT_STATUS_SCAN_SPEED_DELAYS = Object.freeze({ safe: 600, normal: 450, fast: 350 });
const LOREBOOK_STATUS_SCAN_SPEED_DELAYS = Object.freeze({ safe: 600, normal: 450, fast: 350 });

const OPTIONS_PERFORMANCE = {
  bootStartedAt: typeof performance !== "undefined" ? performance.now() : 0,
  loadMs: 0,
  storageReads: 0,
  storageReadTotalMs: 0,
  storageReadMaxMs: 0,
  storageWrites: 0,
  storageWriteTotalMs: 0,
  storageWriteMaxMs: 0,
  searchRenders: 0,
  featureRenders: 0,
  heavyManagerIdleSlices: 0,
  savedManagerRefreshBatches: 0,
  savedManagerRefreshKinds: 0,
  blockedManagerRefreshBatches: 0,
  slowStorageReads: []
};







// options-reading-accessibility.js provides the Settings helpers for this section.

// Settings defaults are defined in options-settings-defaults.js.

let blockedState = { ids: [], names: [], meta: {} };
let notInterestedState = { ids: [], meta: {} };
let currentOpened = [];
let openedChatMetaState = {};
let currentPersonas = [];
let favoriteCreatorState = { handles: [], meta: {} };
let followedCreatorState = { handles: [], meta: {} };
let creatorBotWatchState = { version: 1, creators: {}, recent: [], lastRunAt: 0, lastScanAt: 0, lastDurationMs: 0, lastCheckedCreators: 0, lastNewCount: 0, lastFailureCount: 0, lastReason: "", lastWebhookAt: 0, lastWebhookError: "" };
let creatorBotWebhookState = { enabled: false, url: "" };
let favoriteBotState = { ids: [], meta: {} };
let laterBotState = { ids: [], meta: {} };
let recentlySeenBotState = { entries: [] };
let botOrganizationState = { meta: {} };
let botAvailabilityState = { meta: {} };
let botArchiveState = { meta: {} };
let botUnavailableRecoveryState = { version: 1, meta: {} };
let botStatusIgnoredIdsState = [];
let botStatusIgnoredIdSetState = new Set();
let botAvailabilityScanRunning = false;
let botAvailabilityStopRequested = false;
let lorebookStatusScanRunning = false;
let lorebookStatusStopRequested = false;
let botStatusMetadataDirty = false;
let botStatusStorageSelfWriteUntil = 0;
let blockedBotNameRepairRunning = false;
let blockedBotNameRepairStopRequested = false;
let blockedBulkDislikeRunning = false;
let blockedBulkDislikeStopRequested = false;
let activeBlockedBulkDislikeRunId = "";
let quickDislikeHistoryState = { version: 1, bots: {} };
let quickDislikeBulkState = { version: 1, status: "idle", pendingIds: [], failedIds: [], startedAt: 0, updatedAt: 0, currentId: "", lastMode: "remaining" };
let blockedBulkLessLikeRunning = false;
let blockedBulkLessLikeStopRequested = false;
let activeBlockedBulkLessLikeRunId = "";
let quickLessLikeHistoryState = { version: 1, bots: {} };
let quickLessLikeBulkState = { version: 2, status: "idle", pendingIds: [], failedIds: [], failureMeta: {}, startedAt: 0, updatedAt: 0, currentId: "", lastMode: "remaining", totalBots: 0, nextQueuePosition: 0, attempted: 0, succeeded: 0, failedCount: 0, retried: 0, skipped: 0, pacing: {} };
let chatBackgroundMediaState = { global: null, chats: {} };


const dirtySavedStores = new Set();
let optionsDataLoaded = false;

// Options-page performance: heavy list managers are rendered lazily and only
// once per loaded data snapshot. Switching tabs should be instant even with
// thousands of saved bots.
const renderedHeavyTabs = new Set();
let heavyRenderToken = 0;
let botDuplicateMatchesCache = new Map();
let botDuplicateCacheScope = "";
let botDuplicateCacheReady = false;
let blockingDataLoaded = false;
let savedListsDataLoaded = false;
let savedRecoveryDataLoaded = false;
let blockingDataLoadPromise = null;
let savedListsDataLoadPromise = null;
let savedRecoveryDataLoadPromise = null;
let savedRecoveryLazySetup = false;
let savedRecoveryLazyObserver = null;
let loadedSettingsSnapshot = { ...DEFAULT_SETTINGS };
let granularSettingsIndexCache = new Set();
let granularSettingsMigrationSeen = false;
let settingsAutosaveReady = false;
let settingsAutosaveTimer = 0;
let settingsAutosaveFlushPromise = null;
const settingsAutosavePending = new Map();
const settingsAutosavePrevious = new Map();
let auxiliaryOptionsSaveTimer = 0;
let auxiliaryOptionsSavePending = new Set();

const BLOCKING_DATA_KEYS = [BLOCKED_BOTS_KEY, NOT_INTERESTED_KEY, QUICK_DISLIKE_HISTORY_KEY, QUICK_DISLIKE_BULK_STATE_KEY, QUICK_LESS_LIKE_HISTORY_KEY, QUICK_LESS_LIKE_BULK_STATE_KEY];
const SAVED_LIST_DATA_KEYS = [
  OPENED_KEY,
  OPENED_META_KEY,
  FAVORITE_CREATORS_KEY,
  FOLLOWED_CREATORS_KEY,
  CREATOR_BOT_WATCH_KEY,
  FAVORITE_BOTS_KEY,
  LATER_BOTS_KEY,
  RECENTLY_SEEN_BOTS_KEY,
  BOT_ORGANIZER_KEY,
  BOT_STATUS_IGNORED_KEY
];
const SAVED_RECOVERY_DATA_KEYS = [
  BOT_AVAILABILITY_KEY,
  BOT_ARCHIVE_KEY,
  BOT_UNAVAILABLE_RECOVERY_KEY
];









// options-section-navigation.js provides the Settings helpers for this section.









const botManagerUiState = {
  blocked: {
    query: "",
    visible: 10,
    collapsed: true
  },
  notInterested: {
    query: "",
    visible: 10,
    collapsed: true
  },
  later: {
    query: "",
    visible: 10,
    collapsed: true
  },
  favorite: {
    query: "",
    visible: 10,
    collapsed: true
  },
  opened: {
    query: "",
    visible: 10,
    collapsed: true
  }
};

const botManagerBulkSelection = {
  blocked: new Set(),
  favorite: new Set(),
  later: new Set()
};

const botAvailabilityUiState = {
  query: "",
  status: "all",
  visible: 10,
  collapsed: true
};

const favoriteCreatorUiState = {
  visible: 20,
  collapsed: true
};

const followedCreatorUiState = {
  query: "",
  sort: "newest",
  visible: 20,
  collapsed: true
};























































const DEEPL_ORIGINS = ["https://api-free.deepl.com/*", "https://api.deepl.com/*"];






let pendingImportPayload = null;
let settingsToastTimer = null;
let settingsUndoAction = null;
