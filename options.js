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
  "rating-button-not-found",
  "rating-modal-not-found",
  "done-button-not-ready",
  "submit-not-confirmed",
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

const PAGE_INTROS = {
  general: "Core extension behavior, quick setup, site-wide defaults, and compatibility.",
  control: "Fast navigation, creator status, data health, performance comparisons, and support tools in one place.",
  features: "A grouped catalogue of current and planned QoL features, with live status and direct links to their settings.",
  browser: "Browser-level helpers such as Auto-AFK, duplicate-tab protection, tab sessions, popup contents, and notifications.",
  "chat-list": "Search, filter, sort, rediscover, and manage conversations on /chat and /chats.",
  "chat-ui": "Controls used inside an open conversation: top-bar tools, search, bookmarks, navigation, message actions, export, and text display helpers.",
  writing: "Composer helpers, generation controls, translation, OOC presets, and reusable text tools.",
  "personas-memory": "Persona backups and switching, SpicyChat Memory helpers, and Context Keeper.",
  "bot-tools": "Chatbot and Lorebook creation helpers, editor tools, moderation warnings, My Creations filters, and audits.",
  appearance: "Appearance, navigation cleanup, Mini Panel, ambience, premium/promo cleanup, and other interface controls.",
  saved: "Review and manage local bot organization plus Favorite, Followed, Later, Opened, and saved-copy data.",
  blocking: "Discovery filters, recommendation helpers, listing refill, language cleanup, blocked bots, and Not Interested entries.",
  data: "Back up, restore, inspect, and clean data stored by QoL in this browser.",
  advanced: "Performance, per-character overrides, and other settings intended for troubleshooting or specialized setups.",
  android: "Controls for Android browsers, installed apps, and compact/WebView layouts.",
  help: "Diagnostics, support links, credits, and bug-report preparation."
};

const FEATURE_CHANGE_MARKERS = {
  saiToolkitCompatibility: { version: "0.1.8.76", label: "Updated" },
  enableSmartFilterPresets: { version: "0.1.9.105", label: "Updated" },
  enableCreationAudit: { version: "0.1.9.111", label: "Updated" },
  enableBulkMemoryManager: { version: "0.1.9.121", label: "Updated" },
  enableCreatorBotNotifications: { version: "0.1.9.111", label: "Updated" },
  showFollowCreatorButtons: { version: "0.1.9.111", label: "Updated" },
  enableMyCreationsFilters: { version: "0.1.8.95", label: "New" },
  rememberMyCreationsView: { version: "0.1.9.35", label: "New" },
  enableBulkCardBlocking: { version: "0.1.9.109", label: "Updated" },
  bulkCardBlockingSidebarLauncher: { version: "0.1.9.109", label: "New" },
  autoLoadMyCreations: { version: "0.1.9.87", label: "Updated" },
  showFormattingToolbar: { version: "0.1.8.76", label: "New" },
  styleAlternateDialogue: { version: "0.1.9.65", label: "Updated" },
  enableRecommendationHelpers: { version: "0.1.8.76", label: "New" },
  customizeModelQuickMenu: { version: "0.1.8.77", label: "Updated" },
  modelQuickFavoritesOnly: { version: "0.1.8.77", label: "Updated" },
  chatTextReplacementPreview: { version: "0.1.8.75", label: "New" },
  enablePersonaOrganizer: { version: "0.1.8.79", label: "Updated" },
  enableWikiLorebookImporter: { version: "0.1.9.94", label: "New" },
  enableLorebookConsistency: { version: "0.1.9.101", label: "New" },
  lorebookDefaultEntriesTab: { version: "0.1.9.96", label: "New" },
  lorebookRememberEntrySort: { version: "0.1.9.96", label: "New" },
  lorebookProtectEntryDrafts: { version: "0.1.9.96", label: "New" },
  lorebookEditShortcuts: { version: "0.1.9.96", label: "New" },
  lorebookEntryManager: { version: "0.1.9.104", label: "Updated" },
  lorebookMultiEntryWorkspace: { version: "0.1.9.117", label: "New" },
  lorebookEntrySelectionCheckbox: { version: "0.1.9.104", label: "New" },
  lorebookEntryShowTokenCount: { version: "0.1.9.104", label: "New" },
  lorebookEntryShowHiddenKeywordCount: { version: "0.1.9.104", label: "New" },
  lorebookEntryShowNoKeywordsWarning: { version: "0.1.9.104", label: "New" },
  lorebookEntryShowCharacterCount: { version: "0.1.9.104", label: "New" },
  lorebookEntryRenameButton: { version: "0.1.9.104", label: "New" },
  lorebookEntryCopyButton: { version: "0.1.9.104", label: "New" },
  lorebookEntryDuplicateButton: { version: "0.1.9.104", label: "New" },
  lorebookBulkSelectAll: { version: "0.1.9.104", label: "New" },
  lorebookBulkClear: { version: "0.1.9.104", label: "New" },
  lorebookBulkAnalyze: { version: "0.1.9.104", label: "New" },
  lorebookBulkExportSelected: { version: "0.1.9.104", label: "New" },
  lorebookBulkCopySelected: { version: "0.1.9.104", label: "New" },
  lorebookBulkDuplicateSelected: { version: "0.1.9.104", label: "New" },
  lorebookBulkAddKeyword: { version: "0.1.9.104", label: "New" },
  lorebookBulkRemoveKeyword: { version: "0.1.9.104", label: "New" },
  lorebookBulkToggleEnabled: { version: "0.1.9.104", label: "New" },
  lorebookBulkDeleteSelected: { version: "0.1.9.104", label: "New" },
  lorebookBulkFindKeyword: { version: "0.1.9.104", label: "New" },
  enableCommandPalette: { version: "0.1.9.97", label: "New" },
  commandPaletteShortcut: { version: "0.1.9.97", label: "New" },
  qolInterfaceScale: { version: "0.1.9.95", label: "New" },
  chatTextScale: { version: "0.1.9.95", label: "New" },
  chatLineSpacing: { version: "0.1.9.95", label: "New" },
  enableBotOrganizer: { version: "0.1.9.105", label: "Updated" },
  enableReplyInstructions: { version: "0.1.9.73", label: "New" },
  enableGlobalMemory: { version: "0.1.9.101", label: "New" },
  enableRpFormatRepair: { version: "0.1.8.92", label: "Updated" },
  enableCharacterQolProfiles: { version: "0.1.8.88", label: "New" },
  showChatTopBarTools: { version: "0.1.9.105", label: "Updated" },
  chatTopBarAddLaterButton: { version: "0.1.9.105", label: "Updated" },
  showPerCharacterChatHistory: { version: "0.1.9.105", label: "Updated" },
  showQuickNewChatButton: { version: "0.1.9.105", label: "Updated" },
  showChatSearch: { version: "0.1.9.65", label: "Updated" },
  chatSearchShowFindButton: { version: "0.1.8.87", label: "New" },
  enableFocusMode: { version: "0.1.8.87", label: "New" },
  enableChatBackgrounds: { version: "0.1.9.54", label: "New" },
  enableChatBubbleCustomization: { version: "0.1.9.88", label: "Updated" },
  stackChatMessages: { version: "0.2.22", label: "Updated" },
  expandLongCardDescriptions: { version: "0.2.22", label: "Updated" },
  enablePersonaOrganizer: { version: "0.2.22", label: "Updated" },
  persistSpicyChatUserAppearance: { version: "0.1.9.88", label: "New" },
  androidTopBarMenu: { version: "0.1.8.84", label: "New" },
  performanceDiagnostics: { version: "0.1.8.84", label: "New" },
  hideSidebarFooterTerms: { version: "0.1.8.91", label: "Updated" },
  hideSidebarFooterPrivacy: { version: "0.1.8.91", label: "Updated" },
  hideSidebarFooterRefunds: { version: "0.1.8.91", label: "Updated" },
  hideSidebarFooterReporting: { version: "0.1.8.91", label: "Updated" },
  hideSidebarFooterGuidelines: { version: "0.1.8.91", label: "Updated" },
  hideSidebarFooterSupport: { version: "0.1.8.91", label: "Updated" },
  hideSidebarFooterAffiliates: { version: "0.1.8.91", label: "Updated" },
  hideSidebarSocialDiscord: { version: "0.1.8.91", label: "Updated" },
  hideSidebarSocialX: { version: "0.1.8.91", label: "Updated" },
  hideSidebarSocialReddit: { version: "0.1.8.91", label: "Updated" },
  hideSidebarAppDownloadGooglePlay: { version: "0.1.8.91", label: "Updated" },
  hideSidebarAppDownloadAppStore: { version: "0.1.8.91", label: "Updated" },
  hideSidebarAppDownloadGeneric: { version: "0.1.8.91", label: "Updated" },
  personaShowLocalMetaInPicker: { version: "0.1.8.79", label: "New" },
  showCardGreetingTokenInfo: { version: "0.1.8.97", label: "Updated" },
  showExactMessageCounts: { version: "0.1.9.112", label: "New" },
  showBotCreationDates: { version: "0.2.14", label: "New" },
  expandBotNamesOnHover: { version: "0.2.17", label: "New" },
  paginationTopJumpBox: { version: "0.2.17", label: "New" },
  cardTokenShowGreeting: { version: "0.1.8.97", label: "New" },
  cardTokenShowPersonality: { version: "0.1.8.97", label: "New" },
  cardTokenShowScenario: { version: "0.1.8.97", label: "New" },
  cardTokenShowExamples: { version: "0.1.8.97", label: "New" },
  lorebookBulkKeywordPaste: { version: "0.1.8.93", label: "New" },
  lorebookExpandEntryEditor: { version: "0.1.8.93", label: "New" },
  lorebookExpandTags: { version: "0.2.36", label: "Updated" },
  botTagBulkPaste: { version: "0.1.8.93", label: "New" },
  showLorebookFilters: { version: "0.1.9.109", label: "Updated" },
  rememberBotImagePrompt: { version: "0.1.9.109", label: "New" },
  reduceAnimatedBotImages: { version: "0.1.8.75", label: "New" },
  creatorModerationWarnings: { version: "0.1.9.117", label: "Updated" },
  creatorModerationWarningsChatbots: { version: "0.1.9.117", label: "Updated" },
  creatorModerationWarningMode: { version: "0.1.9.117", label: "Updated" },
  creatorModerationWarningIgnoredTerms: { version: "0.1.9.117", label: "Updated" },
  creatorModerationWarningCustomTerms: { version: "0.1.9.117", label: "Updated" },
  enableTranslation: { version: "0.1.9.65", label: "Updated" },
  creatorBotCheckMinutes: { version: "0.1.9.103", label: "New" },
  creatorBotBrowserNotifications: { version: "0.1.9.103", label: "New" },
  quickPanelShowTranslation: { version: "0.1.8.73", label: "New" },
  showCopyMemoryAction: { version: "0.1.8.71", label: "New" },
  memoryAutoLoadAll: { version: "0.1.8.96", label: "New" },
  enableContextKeeper: { version: "0.1.9.112", label: "Updated" },
  enableStoryDayTracker: { version: "0.1.9.112", label: "New" },
  storyDayTrackerMode: { version: "0.1.9.112", label: "New" },
  enableRpStateTracker: { version: "0.1.9.115", label: "New" },
  rpStateTrackerMode: { version: "0.1.9.115", label: "New" },
  rpStateInjectMode: { version: "0.1.9.115", label: "New" },
  languageSelectionMode: { version: "0.1.9.112", label: "New" },
  contextKeeperAutoCapture: { version: "0.1.9.80", label: "New" },
  contextKeeperAutoSensitivity: { version: "0.1.9.80", label: "New" },
  contextKeeperAutoEveryMessages: { version: "0.1.9.80", label: "New" },
  contextKeeperAutoMaxDetails: { version: "0.1.9.80", label: "New" },
  contextKeeperMessageButtons: { version: "0.1.9.80", label: "Updated" },
  enableChatNudges: { version: "0.1.9.66", label: "New" },
  chatNudgeDefaultHours: { version: "0.1.9.66", label: "New" },
  chatNudgeBrowserNotifications: { version: "0.1.9.66", label: "New" },
  contextKeeperRecapSize: { version: "0.1.8.96", label: "New" },
  enableSelectionRemember: { version: "0.1.9.34", label: "New" },
  cardClickBehavior: { version: "0.1.9.34", label: "New" },
  botArchiveRememberSeenPublic: { version: "0.1.9.90", label: "Updated" },
  botBackupToolsEnabled: { version: "0.1.9.111", label: "Updated" },
  botArchiveOwnEditorBackups: { version: "0.1.9.114", label: "Updated" },
  lorebookBackupToolsEnabled: { version: "0.1.9.104", label: "New" },
  lorebookBackupsEnabled: { version: "0.1.9.104", label: "Updated" },
  botArchiveOwnRevisionLimit: { version: "0.1.9.114", label: "Updated" },
  botArchiveOnProfileVisit: { version: "0.1.8.98", label: "New" },
  botArchiveOnChatOpen: { version: "0.1.8.98", label: "New" },
  botArchiveRefreshHours: { version: "0.1.8.98", label: "New" },
  botEditorSaveActions: { version: "0.1.8.96", label: "New" },
  botEditorSaveChatNewTab: { version: "0.1.8.96", label: "New" },
  enableBotEditorDraftHistory: { version: "0.1.9.28", label: "New" },
  scrollTopLoadPreviousMessages: { version: "0.1.8.97", label: "Updated" },
  scrollTopLoadPreviousTiming: { version: "0.1.8.97", label: "New" },
  enableChatTextReplacements: { version: "0.1.8.75", label: "Updated" },
  showScrollToBottomButton: { version: "0.1.8.67", label: "New" },
  showScrollToTopButton: { version: "0.1.9.31", label: "Updated" },
  enableBulkCardBlocking: { version: "0.1.9.109", label: "Updated" },
  bulkCardBlockingSidebarLauncher: { version: "0.1.9.109", label: "New" },
  quickDislikeOnBlock: { version: "0.1.9.119", label: "Updated" },
  quickDislikeIdleMinutes: { version: "0.1.9.86", label: "New" },
  blockedBulkDislikeDelayMs: { version: "0.2.23", label: "Updated" },
  autoFillListings: { version: "0.1.9.62", label: "Updated" },
  showListingFilterStats: { version: "0.2.14", label: "New" },
  showListingFilterStatsDetails: { version: "0.2.14", label: "New" },
  textNormalizationEnabled: { version: "0.1.9.61", label: "Updated" },
  scrollNavOnHome: { version: "0.1.9.31", label: "New" },
  scrollNavOnChats: { version: "0.1.9.31", label: "New" },
  scrollNavOnChat: { version: "0.1.9.31", label: "New" },
  scrollNavOnCreation: { version: "0.1.9.31", label: "New" },
  scrollNavOnProfiles: { version: "0.1.9.31", label: "New" },
  scrollNavOnOther: { version: "0.1.9.31", label: "New" },
  showGenerationMetadata: { version: "0.1.9.24", label: "Updated" },
  runtimePerformanceMode: { version: "0.1.9.65", label: "Updated" },
  desktopAppPerformanceGuard: { version: "0.1.9.2", label: "New" },
  enableLocalChangeHistory: { version: "0.1.9.1", label: "New" },
  enableMessageBookmarks: { version: "0.1.9.62", label: "Updated" },
  favoriteBotCreatorFilter: { version: "0.1.9.62", label: "New" },
  favoriteBotStateFilter: { version: "0.1.9.62", label: "New" },
  laterBotCreatorFilter: { version: "0.1.9.62", label: "New" },
  laterBotStateFilter: { version: "0.1.9.62", label: "New" },
  chatBackgroundFit: { version: "0.1.9.62", label: "New" },
  chatBackgroundPosition: { version: "0.1.9.62", label: "New" },
  enableCreationAudit: { version: "0.1.9.111", label: "Updated" },
  chatSearchExactPhrase: { version: "0.1.9.2", label: "New" },
  chatSearchLoadUntilMatch: { version: "0.1.9.2", label: "New" },
  showUpdateNotifications: { version: "0.1.9.2", label: "New" },
  showMessageQuickActions: { version: "0.1.9.31", label: "Updated" },
  messageQuickActionReport: { version: "0.1.9.31", label: "Updated" },
  messageQuickActionResend: { version: "0.1.9.21", label: "New" },
  formatToolbarBrackets: { version: "0.1.9.21", label: "New" },
  formatToolbarBraces: { version: "0.1.9.21", label: "New" },
  formatToolbarCustomWrappers: { version: "0.1.9.21", label: "New" },
  chatListOpenedFilter: { version: "0.1.9.21", label: "New" },
  chatListMessageFilter: { version: "0.1.9.21", label: "New" },
  chatListSavedFilter: { version: "0.1.9.38", label: "New" },
  chatListBlockedFilter: { version: "0.1.9.63", label: "New" },
  showRandomChatButton: { version: "0.1.9.61", label: "Updated" },
  randomChatUseLastHomeFilters: { version: "0.1.9.61", label: "New" },
  randomChatIncludeOpened: { version: "0.1.9.54", label: "New" },
  randomChatIncludeLater: { version: "0.1.9.57", label: "New" },
  randomChatIncludeFavorites: { version: "0.1.9.57", label: "New" },
  quickPanelShowSmartFilterPins: { version: "0.1.9.38", label: "New" },
  botEditorAutoOpenAdvanced: { version: "0.1.9.38", label: "Updated" },
  enableBotOrganizer: { version: "0.1.9.105", label: "Updated" },
  showAsteriskButton: { version: "0.1.9.89", label: "Updated" },
  composerShortcutPlacement: { version: "0.1.9.89", label: "New" },
  deepSleepDisabledFeatures: { version: "0.1.9.89", label: "New" },
  formatToolbarBoldItalic: { version: "0.1.8.99", label: "New" },
  autoPairAsterisks: { version: "0.1.8.68", label: "New" },
  quickPanelShowAutoAsterisk: { version: "0.1.8.68", label: "New" },
  showLaterBotButtons: { version: "0.1.8.68", label: "Updated" },
  popupShowStorageDetails: { version: "0.1.8.69", label: "New" },
  quickPanelShowFeatureSummary: { version: "0.1.8.69", label: "New" },
  enableSoundscapes: { version: "0.1.9.41", label: "New" },
  quickPanelShowSoundscapes: { version: "0.1.9.41", label: "New" }
};

const CARD_CHANGE_MARKERS = [
  { selector: "#accessibilityCard h2", version: "0.1.9.95", label: "New" },
  { selector: "#quickSetupCard h2", version: "0.1.9.31", label: "Updated" },
  { selector: "#backupRestoreCard h2", version: "0.1.9.700", label: "Updated" },
  { selector: "#storageCard h2", version: "0.1.9.700", label: "Updated" },
  { selector: "#botOrganizerCard h2", version: "0.1.9.105", label: "Updated" },
  { selector: "#savedBotsHubCard h2", version: "0.1.9.109", label: "Updated" },
  { selector: "#followedCreatorsCard h2", version: "0.1.9.103", label: "Updated" },
  { selector: "#creatorBackupCard h2", version: "0.1.9.104", label: "Updated" },
  { selector: "#creationHelpersCard h2", version: "0.1.9.109", label: "Updated" },
  { selector: "#blockedBotsCard h2", version: "0.1.9.55", label: "Updated" },
  { selector: "#settingsHealthCard h2", version: "0.1.9.700", label: "Updated" },
  { selector: "#recentChangesCard h2", version: "0.1.9.1", label: "New" },
  { selector: "#focusModeCard h2", version: "0.1.8.87", label: "New" },
  { selector: "#characterQolProfilesCard h2", version: "0.1.8.88", label: "New" },
  { selector: "#savedSnippetsCard h2", version: "0.1.8.89", label: "New" },
  { selector: "#contextKeeperCard h2", version: "0.1.9.34", label: "Updated" },
  { selector: "#botAvailabilityCard h2", version: "0.2.21", label: "Updated" },
  { selector: "#cardWorkflowCard h2", version: "0.1.9.34", label: "Updated" },
  { selector: "#diagnosticsCard h2", version: "0.1.9.120", label: "Updated" },
  { selector: "#simpleFeatureGuideCard h2", version: "0.1.9.105", label: "New" },
  { selector: "#chatTopBarCard h2", version: "0.1.9.105", label: "Updated" },
  { selector: "#characterShortcutsCard h2", version: "0.1.9.105", label: "Updated" },
  { selector: "#duplicateTabGuardCard h2", version: "0.1.9.39", label: "Updated" },
  { selector: "#tabCleanupDiagnosticCard h2", version: "0.1.9.43", label: "Updated" },
  { selector: "#soundscapesCard h2", version: "0.1.9.41", label: "New" }
];

const OPTIONAL_FEATURE_KEYS = [
  "enableCommandPalette",
  "enableContextKeeper",
  "enableCreatorWritingAssistant",
  "enableNativeRatingHelpers",
  "enablePersonalUsageSummary",
  "enableProfileExport",
  "enableRpStateTracker",
  "enableSavedListsOverlay",
  "enableStoryDayTracker",
  "enableTagAliases",
  "lorebookTrackHistory",
  "quickDislikeIdleEnabled",
  "styleAlternateDialogue",
  "saiToolkitCompatibility",
  "autoAfkEnabled",
  "duplicateTabGuardEnabled",
  "enableSoundscapes",
  "autoTags",
  "showTagTemplateButton",
  "showChatTagLinks",
  "showChatTagAddButtons",
  "botEditorShowCharButton",
  "botEditorShowUserButton",
  "botEditorShowContinueButton",
  "botEditorShowNoControlButton",
  "botEditorShowCustomSnippets",
  "botEditorAutoOpenAdvanced",
  "rememberBotImagePrompt",
  "botEditorSaveActions",
  "botEditorSaveChatNewTab",
  "enableBotEditorDraftHistory",
  "enableWikiLorebookImporter",
  "enableLorebookConsistency",
  "lorebookDefaultEntriesTab",
  "lorebookRememberEntrySort",
  "lorebookProtectEntryDrafts",
  "lorebookEditShortcuts",
  "lorebookEntryManager",
  "lorebookMultiEntryWorkspace",
  "lorebookEntrySelectionCheckbox",
  "lorebookEntryShowTokenCount",
  "lorebookEntryShowHiddenKeywordCount",
  "lorebookEntryShowNoKeywordsWarning",
  "lorebookEntryShowCharacterCount",
  "lorebookEntryRenameButton",
  "lorebookEntryCopyButton",
  "lorebookEntryDuplicateButton",
  "lorebookBulkSelectAll",
  "lorebookBulkClear",
  "lorebookBulkAnalyze",
  "lorebookBulkExportSelected",
  "lorebookBulkCopySelected",
  "lorebookBulkDuplicateSelected",
  "lorebookBulkAddKeyword",
  "lorebookBulkRemoveKeyword",
  "lorebookBulkToggleEnabled",
  "lorebookBulkDeleteSelected",
  "lorebookBulkFindKeyword",
  "lorebookAutoStartNew",
  "lorebookBulkKeywordPaste",
  "lorebookExpandEntryEditor",
  "lorebookExpandTags",
  "botTagBulkPaste",
  "showLorebookEntryExpandButtons",
  "creatorModerationWarnings",
  "creatorModerationWarningsChatbots",
  "autoAgreeCreationGuidelines",
  "enableGenerationProfiles",
  "showGenerationMetadata",
  "showMessageTimestamps",
  "showGenerationModel",
  "showGenerationElapsed",
  "showGenerationSettings",
  "enableContextWindowWarning",
  "contextWarningBrowserNotifications",
  "hidePremium",
  "hideFloatingPremiumPopups",
  "hideAdvertBanners",
  "expandModelSelectorDescriptions",
  "hideModelUpgradeButtons",
  "customizeModelQuickMenu",
  "modelQuickFavoritesOnly",
  "hideNotifications",
  "hideFeatureReleasePopups",
  "hideTabNotificationBadge",
  "autoReadNotifications",
  "hideTopBarLanguage",
  "hideTopBarNotifications",
  "hideTopBarTheme",
  "showChatTopBarTools",
  "chatTopBarInlineCreator",
  "chatTopBarAddLaterButton",
  "closeChatTabAfterSavingLater",
  "showPerCharacterChatHistory",
  "showQuickNewChatButton",
  "hideChatTopBarRatingButton",
  "hideChatTopBarModelButton",
  "hideChatTopBarContextDot",
  "hideChatDropdownVoiceUpsell",
  "hideChatDropdownMemoryItem",
  "enableBulkMemoryManager",
  "enableMemoryVault",
  "showCopyMemoryAction",
  "memoryAutoLoadAll",
  "enableSelectionRemember",
  "enableChatTextReplacements",
  "chatTextReplacementPreview",
  "enableTranslation",
  "translationShowMessageButtons",
  "translationAutoAi",
  "translationAutoUser",
  "blockCards",
  "neverHideFavorites",
  "protectFavoritesFromBlocking",
  "showCreatorFavoriteButtons",
  "protectFavoriteCreatorsFromFiltering",
  "showFollowCreatorButtons",
  "enableCreatorBotNotifications",
  "creatorBotBrowserNotifications",
  "trackFavoriteBots",
  "showFavoriteHistoryButton",
  "enableBotOrganizer",
  "botOrganizerExplorerFolders",
  "showLaterBotButtons",
  "protectLaterBotsFromFiltering",
  "hideLaterBotsFromListings",
  "hideHomeForYouCards",
  "expandLongCardDescriptions",
  "showCardGreetingTokenInfo",
  "showExactMessageCounts",
  "showBotCreationDates",
  "hideGroupChats",
  "showLorebookFilters",
  "showRulebookFilters",
  "enableSmartFilterPresets",
  "enableCreationAudit",
  "enableMyCreationsFilters",
  "enableMyCreationsBulkBackup",
  "showMyLorebookEditButtons",
  "rememberMyCreationsView",
  "autoLoadMyCreations",
  "enableRecommendationHelpers",
  "recommendationHideFavoriteBots",
  "recommendationHideOwnBots",
  "recommendationOnlyUnopened",
  "recommendationOnlyLorebook",
  "recommendationSessionHideButtons",
  "recommendationRandomButton",
  "showCopyBotInfoButtons",
  "trackRecentlySeenBots",
  "showRecentlySeenButton",
  "enableBotComparison",
  "showQuickNotInterestedButtons",
  "showQuickLessLikeButtons",
  "showQuickDislikeButtons",
  "showQuickUnblockButtons",
  "reduceAnimatedBotImages",
  "animatedImagesListings",
  "animatedImagesChats",
  "animatedImagesProfiles",
  "animatedImagesChatMedia",
  "enableLanguageFilter",
  "languageAutoDetectUntagged",
  "languageShowDetectedBadge",
  "textNormalizationEnabled",
  "normalizeFancyUnicode",
  "normalizePunctuation",
  "normalizeInvisibleCharacters",
  "normalizeDecorativeSymbols",
  "autoFillListings",
  "showListingFilterStats",
  "showListingFilterStatsDetails",
  "trackOpenedChats",
  "importOpenedFromChatsPage",
  "hideOpenedChats",
  "compactAfterHiding",
  "showQuickPanel",
  "enableChatIndex",
  "chatIndexStandaloneLauncher",
  "popupShowOpenedCount",
  "popupShowBlockedCount",
  "popupShowStorageDetails",
  "quickPanelShowFeatureSummary",
  "quickPanelShowTranslation",
  "replaceCardProfileWithBlockButton",
  "showBlockButtonOnMyCreations",
  "enableBulkCardBlocking",
  "bulkCardBlockingSidebarLauncher",
  "quickDislikeOnBlock",
  "showChatListTools",
  "enableChatOrganizer",
  "showSavedChatQuickActions",
  "showRandomChatButton",
  "showChatExportButton",
  "chatExportIncludeRulebook",
  "enableRulebookDiagnostics",
  "showOocTools",
  "enableReplyInstructions",
  "enableGlobalMemory",
  "autoAcceptPersonaChange",
  "savePersonasFromPages",
  "keepLocalPersonaCopies",
  "expandPersonaDescriptions",
  "enablePersonaOrganizer",
  "showPersonaQuickSwitch",
  "hideChatPlusButton",
  "hideChatImageButton",
  "replaceChatImageWithOocButton",
  "showAsteriskButton",
  "autoPairAsterisks",
  "showFormattingToolbar",
  "formatToolbarBrackets",
  "formatToolbarBraces",
  "enableRpFormatRepair",
  "enableChatBackgrounds",
  "chatBackgroundUseAvatar",
  "chatBackgroundAnimateAvatar",
  "favoritePageFoldersEnabled",
  "favoritePageSortEnabled",
  "lorebookUnknownSafeFilter",
  "enableCharacterQolProfiles",
  "enableChatBubbleCustomization",
  "persistSpicyChatUserAppearance",
  "hideChatVoiceButton",
  "hideUnlockCustomVoices",
  "showMessageQuickActions",
  "showChatSearch",
  "chatSearchShowFindButton",
  "chatSearchExactPhrase",
  "chatSearchCaseSensitive",
  "chatSearchWholeWord",
  "chatSearchRegex",
  "chatSearchLoadUntilMatch",
  "enableMessageBookmarks",
  "messageBookmarkButtons",
  "enableFocusMode",
  "messageQuickActionCopy",
  "messageQuickActionEdit",
  "messageQuickActionRemoveImage",
  "messageQuickActionResend",
  "messageQuickActionConfirmRemoveImage",
  "messageQuickActionReport",
  "allowTypingWhileAiResponding",
  "keepChatPositionWhileTyping",
  "showScrollToTopButton",
  "scrollTopLoadPreviousMessages",
  "showScrollToBottomButton",
  "botArchiveRememberSeenPublic",
  "botBackupToolsEnabled",
  "botArchiveOwnEditorBackups",
  "lorebookBackupToolsEnabled",
  "lorebookBackupsEnabled",
  "botArchiveOnProfileVisit",
  "botArchiveOnChatOpen",
  "protectDraftDuringMessageRemoval",
  "failedMessageHelper",
  "autoRetryFailedMessageSends",
  "chatPerformanceMode",
  "desktopAppPerformanceGuard",
  "pauseQolInHiddenTabs",
  "performanceDiagnostics",
  "enableLocalChangeHistory",
  "showUpdateNotifications",
  "androidTopBarMenu",
  "showQolSidebarButton",
  "hideSidebarLogo",
  "hideSidebarHome",
  "hideSidebarChats",
  "hideSidebarPersonas",
  "hideSidebarNewBadges",
  "hideSidebarCreateMenu",
  "hideSidebarCreateChatbot",
  "hideSidebarCreateLorebook",
  "hideSidebarCreateGroup",
  "hideSidebarCreateVoice",
  "hideSidebarMyCreationsMenu",
  "hideSidebarMyChatbots",
  "hideSidebarMyLorebooks",
  "hideSidebarMyGroups",
  "hideSidebarMyVoices",
  "hideSidebarFavorites",
  "hideSidebarRecommendations",
  "hideSidebarLeaderboard",
  "hideSidebarBlockedCreators",
  "hideSidebarSubscribe",
  "hideSidebarHelp",
  "hideSidebarSocialLinks",
  "hideSidebarSocialDiscord",
  "hideSidebarSocialX",
  "hideSidebarSocialReddit",
  "hideSidebarFooterLinks",
  "hideSidebarAppDownload",
  "hideSidebarAppDownloadGooglePlay",
  "hideSidebarAppDownloadAppStore",
  "hideSidebarAppDownloadGeneric",
  "hideSidebarWebVersion",
  "hideSidebarSignOut",
  "debug"
];

const BASELINE_SAFETY_ON_KEYS = [
  // These do not add visible/content features. They only make the extension
  // yield more aggressively on installed-app/desktop pressure.
  "desktopAppPerformanceGuard"
];

const PRESET_VALUES = {
  minimal: {
    trackOpenedChats: true,
    trackFavoriteBots: true,
    showLaterBotButtons: true,
    showScrollToTopButton: true,
    showScrollToBottomButton: true,
    protectDraftDuringMessageRemoval: true
  },
  recommended: {
    trackOpenedChats: true,
    importOpenedFromChatsPage: true,
    trackFavoriteBots: true,
    showLaterBotButtons: true,
    protectLaterBotsFromFiltering: true,
    showAsteriskButton: true,
    autoPairAsterisks: true,
    showScrollToTopButton: true,
    showScrollToBottomButton: true,
    protectDraftDuringMessageRemoval: true,
    failedMessageHelper: true,
    savePersonasFromPages: true,
    expandPersonaDescriptions: true,
    showLorebookEntryExpandButtons: true,
    popupShowOpenedCount: true,
    popupShowBlockedCount: true
  },
  creator: {
    botEditorShowCharButton: true,
    botEditorShowUserButton: true,
    botEditorShowContinueButton: true,
    botEditorShowNoControlButton: true,
    botEditorShowCustomSnippets: true,
    botEditorAutoOpenAdvanced: true,
    botEditorSaveActions: true,
    botEditorSaveChatNewTab: true,
    enableBotEditorDraftHistory: true,
    enableWikiLorebookImporter: true,
    lorebookDefaultEntriesTab: true,
    lorebookRememberEntrySort: true,
    lorebookProtectEntryDrafts: true,
    lorebookEditShortcuts: true,
    lorebookEntryManager: true,
    lorebookEntrySelectionCheckbox: true,
    lorebookEntryShowTokenCount: true,
    lorebookEntryShowHiddenKeywordCount: true,
    lorebookEntryShowNoKeywordsWarning: true,
    lorebookEntryShowCharacterCount: true,
    lorebookEntryRenameButton: true,
    lorebookEntryCopyButton: true,
    lorebookEntryDuplicateButton: true,
    lorebookBulkSelectAll: true,
    lorebookBulkClear: true,
    lorebookBulkAnalyze: true,
    lorebookBulkExportSelected: true,
    lorebookBulkCopySelected: true,
    lorebookBulkDuplicateSelected: true,
    lorebookBulkAddKeyword: true,
    lorebookBulkRemoveKeyword: true,
    lorebookBulkToggleEnabled: true,
    lorebookBulkDeleteSelected: true,
    lorebookBulkFindKeyword: true,
    lorebookAutoStartNew: true,
    lorebookBulkKeywordPaste: true,
    lorebookExpandEntryEditor: true,
    lorebookExpandTags: false,
    botTagBulkPaste: true,
    showLorebookEntryExpandButtons: true,
    autoAgreeCreationGuidelines: true,
    enableMyCreationsFilters: true,
    enableMyCreationsBulkBackup: true,
    showMyLorebookEditButtons: true,
    rememberMyCreationsView: true,
    autoLoadMyCreations: true,
    myCreationsAutoLoadPages: 1,
    enableCreationAudit: true,
    showCardGreetingTokenInfo: true,
    cardTokenShowGreeting: true,
    cardTokenShowPersonality: true,
    cardTokenShowScenario: true,
    cardTokenShowExamples: true,
    showLorebookFilters: true
  }
};



























// Tab Cleanup controller now lives in its own Settings script.

// Soundscapes controller now lives in its own Settings script.














// An explicit unblock exempts the ID from both matching auto-block rule sets.
// Keep the original name for existing removal actions in this Settings page.






























const managerAnimatedImageState = new Map();
let managerAnimationGuardInstalled = false;



















// Converts common Unicode "fancy text" letters and digits to ASCII even on
// older Android WebViews where String.normalize("NFKC") can be incomplete.


const SMALL_CAP_LATIN_MAP = new Map(Object.entries({
  "ᴀ":"a", "ʙ":"b", "ᴄ":"c", "ᴅ":"d", "ᴇ":"e", "ꜰ":"f", "ɢ":"g", "ʜ":"h",
  "ɪ":"i", "ᴊ":"j", "ᴋ":"k", "ʟ":"l", "ᴍ":"m", "ɴ":"n", "ᴏ":"o", "ᴘ":"p",
  "ʀ":"r", "ꜱ":"s", "ᴛ":"t", "ᴜ":"u", "ᴠ":"v", "ᴡ":"w", "ʏ":"y", "ᴢ":"z"
}));





























































































// OOC template/editor helpers live in settings/options-ooc.js.











































const BOT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT_AVAILABILITY_STATUSES = new Set(["available", "unavailable", "restricted", "unknown"]);
const BOT_UPDATE_STATUSES = new Set(["current", "updated"]);
const BOT_DUPLICATE_LEVELS = new Set(["exact", "likely", "possible"]);
const BOT_SNAPSHOT_FIELDS = ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues", "tags", "visibility", "creator", "image"];
const BOT_ARCHIVE_FIELDS = [
  "name", "title", "description", "greeting", "personality", "scenario",
  "exampleDialogues", "tags", "visibility", "creator", "image",
  "messageCount", "rating", "tokenCount"
];
const BOT_VERSION_FIELDS = ["name", "title", "greeting", "personality", "scenario", "exampleDialogues", "tags", "image"];
const BOT_VERSION_LABELS = {
  name: "Name",
  title: "Title",
  greeting: "Greeting",
  personality: "Personality",
  scenario: "Scenario",
  exampleDialogues: "Example Dialogues",
  tags: "Tags",
  image: "Avatar / image",
  lorebook: "Lorebook"
};
const BOT_ARCHIVE_LABELS = {
  name: "Name",
  title: "Title",
  description: "Description",
  greeting: "Greeting",
  personality: "Personality",
  scenario: "Scenario",
  exampleDialogues: "Example Dialogues",
  tags: "Tags",
  visibility: "Visibility",
  creator: "Creator",
  image: "Avatar / image",
  messageCount: "Messages",
  rating: "Rating",
  tokenCount: "Profile tokens"
};

const BOT_SNAPSHOT_LABELS = {
  name: "Name",
  title: "Title",
  description: "Description",
  greeting: "Greeting",
  personality: "Personality",
  scenario: "Scenario",
  exampleDialogues: "Example Dialogues",
  tags: "Tags",
  visibility: "Visibility",
  creator: "Creator",
  image: "Avatar / image"
};











































































































































let lorebookCenterRows = [];
let lorebookCenterVisibleCount = 20;



























































const LOREBOOK_ARCHIVE_EXPORT_SCHEMA = "spicychat-qol-lorebook-archive-export";
const LOREBOOK_ARCHIVE_EXPORT_VERSION = 1;












const BOT_STATUS_ARCHIVE_EXPORT_SCHEMA = "spicychat-qol-bot-status-archive-export";
const BOT_STATUS_ARCHIVE_EXPORT_VERSION = 1;
const BOT_STATUS_ARCHIVE_PUBLIC_SOURCE_RE = /(?:bot status|profile visit|spicychat public profile|character api|character-api|tracked metadata)/i;
const BOT_STATUS_ARCHIVE_PRIVATE_SOURCE_RE = /(?:manual|editor|draft|creator backup|own[- ]?bot backup)/i;












































































const CREATOR_BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;
let creatorBackupManagerState = {
  bots: normalizeBotArchive(null),
  lorebooks: normalizeLorebookBackups(null),
  settings: { ...DEFAULT_SETTINGS }
};
let creatorBackupManagerLoaded = false;
let creatorBackupManagerLoading = false;
let creatorBackupPendingFocus = null;




































































const BOT_STATUS_LAST_RATE_KEY = "botStatusLastRateV1";
let botStatusPreviousScanRateMs = 0;







const BOT_STATUS_PAUSED_QUEUE_KEY = "botStatusPausedQueueV1";
const BOT_STATUS_ACCESS_FAILURE_PAUSE_AT = 3;
// Persist both completed data AND unprocessed IDs. A tab/extension reload does
// not run finally handlers, so crash recovery cannot rely on the Stop button.
const BOT_STATUS_PROGRESS_EVERY = 50;
const BOT_STATUS_PROGRESS_MS = 30_000;










































let unavailableCleanupRunning = false;




const savedBotInfoUiState = { query: "", visible: 10, collapsed: true };




const deletedSavedBotsUiState = { query: "", visible: 10, collapsed: true };



































































































const savedBotsHubUiState = {
  query: "",
  visible: 10,
  collapsed: true,
  selected: new Set()
};

const SAVED_HUB_BOT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;








































































































































































































































const SETTINGS_AUTOSAVE_MISSING = Symbol("settings-autosave-missing");





































const CHAT_BUBBLE_TEXT_DEFAULTS = {
  chatBubbleAiTextMode: "custom",
  chatBubbleAiActionMode: "native",
  chatBubbleAiActionText: "#79c8f5",
  chatBubbleAiDialogueMode: "base",
  chatBubbleAiDialogueText: "#f2f2f2",
  chatBubbleAiDecorationMode: "bubble",
  chatBubbleAiDecorationColor: "#27282d",
  chatBubbleAiCatEarLayout: "auto",
  chatBubbleUserTextMode: "custom",
  chatBubbleUserActionMode: "native",
  chatBubbleUserActionText: "#79c8f5",
  chatBubbleUserDialogueMode: "base",
  chatBubbleUserDialogueText: "#f5f5f5",
  chatBubbleUserDecorationMode: "bubble",
  chatBubbleUserDecorationColor: "#253f52",
  chatBubbleUserCatEarLayout: "auto"
};

const CHAT_BUBBLE_PRESETS = {
  default: {
    chatBubbleAiBackground: "#27282d", chatBubbleAiText: "#f2f2f2", chatBubbleAiBorder: "#555861", chatBubbleAiBorderWidth: 0, chatBubbleAiBorderStyle: "solid", chatBubbleAiBorderOpacity: 100, chatBubbleAiOpacity: 100, chatBubbleAiRadius: 20, chatBubbleAiShape: "native", chatBubbleAiShadow: false,
    chatBubbleUserBackground: "#253f52", chatBubbleUserText: "#f5f5f5", chatBubbleUserBorder: "#52718a", chatBubbleUserBorderWidth: 0, chatBubbleUserBorderStyle: "solid", chatBubbleUserBorderOpacity: 100, chatBubbleUserOpacity: 100, chatBubbleUserRadius: 20, chatBubbleUserShape: "native", chatBubbleUserShadow: false
  },
  soft: {
    chatBubbleAiBackground: "#303238", chatBubbleAiText: "#f3f3f3", chatBubbleAiBorder: "#5c606b", chatBubbleAiBorderWidth: 1, chatBubbleAiBorderStyle: "solid", chatBubbleAiBorderOpacity: 100, chatBubbleAiOpacity: 95, chatBubbleAiRadius: 20, chatBubbleAiShape: "rounded", chatBubbleAiShadow: false,
    chatBubbleUserBackground: "#304b60", chatBubbleUserText: "#f7f7f7", chatBubbleUserBorder: "#63839a", chatBubbleUserBorderWidth: 1, chatBubbleUserBorderStyle: "solid", chatBubbleUserBorderOpacity: 100, chatBubbleUserOpacity: 95, chatBubbleUserRadius: 20, chatBubbleUserShape: "rounded", chatBubbleUserShadow: false
  },
  "contrast-dark": {
    chatBubbleAiBackground: "#090b10", chatBubbleAiText: "#ffffff", chatBubbleAiBorder: "#d7dbe5", chatBubbleAiBorderWidth: 2, chatBubbleAiBorderStyle: "solid", chatBubbleAiBorderOpacity: 100, chatBubbleAiOpacity: 100, chatBubbleAiRadius: 18, chatBubbleAiShape: "rounded", chatBubbleAiShadow: true,
    chatBubbleUserBackground: "#102f4a", chatBubbleUserText: "#ffffff", chatBubbleUserBorder: "#b9dcff", chatBubbleUserBorderWidth: 2, chatBubbleUserBorderStyle: "solid", chatBubbleUserBorderOpacity: 100, chatBubbleUserOpacity: 100, chatBubbleUserRadius: 18, chatBubbleUserShape: "rounded", chatBubbleUserShadow: true
  },
  "contrast-light": {
    chatBubbleAiBackground: "#f5f6f8", chatBubbleAiText: "#111318", chatBubbleAiBorder: "#282b32", chatBubbleAiBorderWidth: 2, chatBubbleAiBorderStyle: "solid", chatBubbleAiBorderOpacity: 100, chatBubbleAiOpacity: 100, chatBubbleAiRadius: 18, chatBubbleAiShape: "rounded", chatBubbleAiShadow: true,
    chatBubbleUserBackground: "#d9ecff", chatBubbleUserText: "#102033", chatBubbleUserBorder: "#234d72", chatBubbleUserBorderWidth: 2, chatBubbleUserBorderStyle: "solid", chatBubbleUserBorderOpacity: 100, chatBubbleUserOpacity: 100, chatBubbleUserRadius: 18, chatBubbleUserShape: "rounded", chatBubbleUserShadow: true
  },
  pastel: {
    chatBubbleAiBackground: "#e9d7f2", chatBubbleAiText: "#291c31", chatBubbleAiBorder: "#b690c9", chatBubbleAiBorderWidth: 1, chatBubbleAiBorderStyle: "solid", chatBubbleAiBorderOpacity: 100, chatBubbleAiOpacity: 100, chatBubbleAiRadius: 22, chatBubbleAiShape: "rounded", chatBubbleAiShadow: false,
    chatBubbleUserBackground: "#cfe8f3", chatBubbleUserText: "#17282f", chatBubbleUserBorder: "#83b6ca", chatBubbleUserBorderWidth: 1, chatBubbleUserBorderStyle: "solid", chatBubbleUserBorderOpacity: 100, chatBubbleUserOpacity: 100, chatBubbleUserRadius: 22, chatBubbleUserShape: "rounded", chatBubbleUserShadow: false
  }
};








































const GZIP_BACKUP_THRESHOLD = 50 * 1024 * 1024;
const MAX_IMPORT_BACKUP_BYTES = 250 * 1024 * 1024;
const MAX_GZIP_FILE_BYTES = 100 * 1024 * 1024;













const MODERATION_MANAGER_GROUPS = {
  Underage: [
    "child", "children", "childhood", "young", "baby", "boy", "girl", "short", "small", "petite", "tiny",
    "loli", "minor", "kid", "kids", "underage", "teen", "innocent", "infant", "little",
    "school", "teacher", "student", "adolescent", "juvenile", "brat", "youth",
    "backpack", "runaway", "insecure", "fragile", "uniform", "prodigy", "pupil", "born", "birth", "hatchling"
  ],
  Incest: [
    "mom", "dad", "sister", "brother", "cousin", "uncle", "aunt", "mother", "father", "grandpa", "grandparent", "grandparents",
    "daughter", "son", "relationship", "adopt", "family", "paternal", "twin", "sibling", "relative", "king", "queen", "prince", "princess", "lineage", "bloodline"
  ],
  Bestiality: ["dog", "horse", "bull", "minotaur", "beast", "monster", "creature", "animal", "farm", "bred", "breed", "breeding", "tail", "fur", "paw"],
  Abuse: ["rape", "force", "kill", "murder", "torture", "abuse", "abused", "violent", "violence", "violently", "trauma", "tremble", "intimidate", "intimidated", "intimidating", "intimidation", "push"],
  Other: ["god", "purity"]
};
const MODERATION_MANAGER_AGE_WORDS = [];
const MODERATION_MANAGER_CONTEXT_ONLY = [
  "young", "short", "small", "petite", "tiny", "innocent", "little", "school", "teacher", "student", "backpack", "insecure", "fragile", "uniform", "prodigy", "pupil",
  "born", "birth", "relationship", "family", "lineage", "bloodline", "dog", "horse", "bull", "beast", "monster", "creature", "animal", "farm", "tail", "fur", "paw", "god", "purity", "push", "tremble", "trauma"
];



















const SETTINGS_BACKUP_GROUPS = {
  settingsGeneral: { label: "General & Control Center", pages: ["general", "control", "features"] },
  settingsDiscovery: { label: "Discovery & Filters", pages: ["blocking"] },
  settingsSavedBots: { label: "Saved Bots & Lists", pages: ["saved"] },
  settingsChatList: { label: "Chat List", pages: ["chat-list"] },
  settingsChat: { label: "Chat", pages: ["chat-ui"] },
  settingsWriting: { label: "Writing & Generation", pages: ["writing"] },
  settingsPersonas: { label: "Personas & Memory", pages: ["personas-memory"] },
  settingsCreator: { label: "Creator Tools", pages: ["bot-tools"] },
  settingsAppearance: { label: "Appearance & Interface", pages: ["appearance"] },
  settingsBrowser: { label: "Browser, Tabs & Mobile", pages: ["browser", "android"] },
  settingsAdvanced: { label: "Advanced & Compatibility", pages: ["advanced"] }
};
const SETTINGS_BACKUP_SCOPE_IDS = Object.keys(SETTINGS_BACKUP_GROUPS);
const SETTINGS_BACKUP_OVERRIDES = {
  autoAfkAction: "settingsBrowser",
  botEditorSnippets: "settingsCreator",
  blockedBotIds: "settingsDiscovery",
  blockedBotNames: "settingsDiscovery",
  cardTokenShowDescription: "settingsDiscovery",
  cardTokenShowCombined: "settingsDiscovery",
  allowedLanguages: "settingsDiscovery",
  showListingRefillButton: "settingsDiscovery",
  quickPanelCustomX: "settingsGeneral",
  quickPanelCustomY: "settingsGeneral",
  showBlockCurrentBotButton: "settingsDiscovery",
  quickDislikeIdleEnabled: "settingsDiscovery",
  chatListSearchMode: "settingsChatList",
  autoLoadAllOpenedChats: "settingsChatList",
  deepImportMaxPages: "settingsChatList",
  oocTemplates: "settingsWriting",
  replyInstructionBotOverrides: "settingsWriting",
  chatBubblePreserveActionColors: "settingsAppearance",
  hideSidebarSocialLinks: "settingsAppearance",
  hideSidebarFooterLinks: "settingsAppearance",
  hideSidebarAppDownload: "settingsAppearance",
  enableMainFooterManagement: "settingsAppearance",
  hideMainFooterEntirely: "settingsAppearance",
  hideMainFooterCompany: "settingsAppearance",
  hideMainFooterResources: "settingsAppearance",
  hideMainFooterCommunity: "settingsAppearance",
  hideMainFooterJoinUs: "settingsAppearance",
  hideMainFooterAppDownload: "settingsAppearance",
  hideMainFooter2257: "settingsAppearance",
  enablePersonalUsageSummary: "settingsGeneral",
  enableLocalChangeHistory: "settingsAdvanced",
  showUpdateNotifications: "settingsGeneral",
  debug: "settingsAdvanced"
};













const BACKUP_STORAGE_KEYS = [
  "settings", QOL_SYNC_DEVICE_PREFS_KEY, "dsMemoryVaultV1", OPENED_KEY, OPENED_META_KEY, BLOCKED_BOTS_KEY, QUICK_DISLIKE_HISTORY_KEY, QUICK_DISLIKE_BULK_STATE_KEY, QUICK_LESS_LIKE_HISTORY_KEY, QUICK_LESS_LIKE_BULK_STATE_KEY,
  NOT_INTERESTED_KEY, PERSONAS_KEY, LEGACY_PERSONAS_KEY, PERSONA_ORG_KEY, OOC_TEMPLATES_KEY, FAVORITE_CREATORS_KEY,
  FOLLOWED_CREATORS_KEY, CREATOR_BOT_WATCH_KEY, FAVORITE_BOTS_KEY, LATER_BOTS_KEY, BOT_ORGANIZER_KEY, CHAT_ORGANIZER_KEY, CHARACTER_QOL_PROFILES_KEY,
  BOT_AVAILABILITY_KEY, BOT_UNAVAILABLE_RECOVERY_KEY, BOT_ARCHIVE_KEY, LOREBOOK_STATUS_KEY, LOREBOOK_BACKUPS_KEY, CHATBOT_LOREBOOK_LINKS_KEY, SAVED_TEXT_SNIPPETS_KEY, CONTEXT_KEEPER_DATA_KEY,
  STORY_DAY_TRACKER_KEY, RP_STATE_TRACKER_KEY, CHAT_NUDGE_STORE_KEY, GENERATION_PROFILES_KEY, SMART_FILTER_PRESETS_KEY, SMART_FILTER_PINNED_KEY,
  BOT_EDITOR_DRAFT_HISTORY_KEY, CHAT_BOOKMARKS_KEY, RECENTLY_SEEN_BOTS_KEY, SOUNDSCAPES_KEY, SOUNDSCAPE_AUDIO_KEY, CHAT_BACKGROUNDS_KEY,
  TAB_CLEANUP_SESSIONS_KEY, TAB_CLEANUP_TOPICS_KEY, TAB_CLEANUP_ENRICHMENT_KEY, LOCAL_CHANGE_HISTORY_KEY
];
const BACKUP_SCOPE_IDS = [
  ...SETTINGS_BACKUP_SCOPE_IDS,
  "settings", "accountSyncRules",
  "opened", "blocked", "notInterested", "favoriteCreators", "followedCreators", "creatorBotWatch", "favoriteBots", "laterBots",
  "memoryVault", "botOrganization", "chatOrganization", "characterQolProfiles", "botAvailability", "botArchive", "lorebookStatus", "lorebookBackups", "chatbotLorebookLinks",
  "savedTextSnippets", "contextKeeperData", "storyDayTrackerData", "rpStateTrackerData", "chatNudges", "personas", "personaOrganization",
  "ooc", "generationProfiles", "smartFilterPresets", "smartFilterPins", "botEditorDraftHistory", "chatBookmarks", "recentlySeenBots",
  "soundscapes", "tabCleanupSessions", "tabCleanupTopics", "tabCleanupEnrichment", "localChangeHistory", "localMedia"
];
const LIGHTWEIGHT_BACKUP_SCOPE_IDS = BACKUP_SCOPE_IDS.filter(scope => scope !== "localMedia");

const BACKUP_DATA_SCOPE_DEFS = {
  accountSyncRules: { count: result => result[QOL_SYNC_DEVICE_PREFS_KEY] && typeof result[QOL_SYNC_DEVICE_PREFS_KEY] === "object" ? 1 : 0 },
  opened: { count: result => Array.isArray(result[OPENED_KEY]) ? result[OPENED_KEY].length : 0 },
  blocked: { count: result => uniqueClean([...(result[BLOCKED_BOTS_KEY]?.ids || []), ...(result[BLOCKED_BOTS_KEY]?.names || [])]).length },
  notInterested: { count: result => uniqueClean(result[NOT_INTERESTED_KEY]?.ids || []).length },
  favoriteCreators: { count: result => uniqueClean(result[FAVORITE_CREATORS_KEY]?.handles || []).length },
  followedCreators: { count: result => uniqueClean(result[FOLLOWED_CREATORS_KEY]?.handles || []).length },
  creatorBotWatch: { count: result => Object.keys(normalizeCreatorBotWatchState(result[CREATOR_BOT_WATCH_KEY]).creators || {}).length },
  favoriteBots: { count: result => uniqueClean(result[FAVORITE_BOTS_KEY]?.ids || []).length },
  laterBots: { count: result => uniqueClean(result[LATER_BOTS_KEY]?.ids || []).length },
  memoryVault: { count: result => normalizeMemoryVault(result.dsMemoryVaultV1).entries.length },
  botOrganization: { count: result => {
    const organizer = normalizeBotOrganization(result[BOT_ORGANIZER_KEY]);
    const folders = uniqueClean([
      ...(organizer.collections || []),
      ...String(result.settings?.botCollections || "").split(/[\n,]+/g)
    ]);
    return Object.keys(organizer.meta || {}).length + folders.length;
  } },
  chatOrganization: { count: result => Object.keys(normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]).meta).length },
  characterQolProfiles: { count: result => Object.keys(normalizeCharacterQolProfiles(result[CHARACTER_QOL_PROFILES_KEY])).length },
  botAvailability: { count: result => Object.keys(normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]).meta).length },
  botArchive: { count: result => Object.keys(normalizeBotArchive(result[BOT_ARCHIVE_KEY]).meta).length },
  lorebookStatus: { count: result => Object.keys(normalizeLorebookStatusStore(result[LOREBOOK_STATUS_KEY]).meta).length },
  lorebookBackups: { count: result => Object.keys(normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]).meta).length },
  chatbotLorebookLinks: { count: result => Object.keys(result[CHATBOT_LOREBOOK_LINKS_KEY] && typeof result[CHATBOT_LOREBOOK_LINKS_KEY] === "object" ? result[CHATBOT_LOREBOOK_LINKS_KEY] : {}).length },
  savedTextSnippets: { count: result => Array.isArray(result[SAVED_TEXT_SNIPPETS_KEY]) ? result[SAVED_TEXT_SNIPPETS_KEY].length : 0 },
  contextKeeperData: { count: result => Object.keys(result[CONTEXT_KEEPER_DATA_KEY] && typeof result[CONTEXT_KEEPER_DATA_KEY] === "object" ? result[CONTEXT_KEEPER_DATA_KEY] : {}).length },
  storyDayTrackerData: { count: result => Object.keys(result[STORY_DAY_TRACKER_KEY] && typeof result[STORY_DAY_TRACKER_KEY] === "object" ? result[STORY_DAY_TRACKER_KEY] : {}).length },
  rpStateTrackerData: { count: result => Object.keys(result[RP_STATE_TRACKER_KEY] && typeof result[RP_STATE_TRACKER_KEY] === "object" ? result[RP_STATE_TRACKER_KEY] : {}).length },
  chatNudges: { count: result => normalizeChatNudgeStore(result[CHAT_NUDGE_STORE_KEY]).length },
  personas: { count: result => Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY].length : (Array.isArray(result[LEGACY_PERSONAS_KEY]) ? result[LEGACY_PERSONAS_KEY].length : 0) },
  personaOrganization: { count: result => Object.keys(result[PERSONA_ORG_KEY]?.meta || {}).length },
  ooc: { count: result => normalizeOocTemplates(result[OOC_TEMPLATES_KEY]).length },
  generationProfiles: { count: result => Object.keys(normalizeGenerationProfiles(result[GENERATION_PROFILES_KEY])).length },
  smartFilterPresets: { count: result => normalizeSmartFilterPresets(result[SMART_FILTER_PRESETS_KEY]).length },
  smartFilterPins: { count: result => normalizeSmartFilterPins(result[SMART_FILTER_PINNED_KEY], result[SMART_FILTER_PRESETS_KEY]).length },
  botEditorDraftHistory: { count: result => Object.values(normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]).entries).reduce((n, list) => n + list.length, 0) },
  chatBookmarks: { count: result => Object.values(result[CHAT_BOOKMARKS_KEY] || {}).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0) },
  recentlySeenBots: { count: result => Array.isArray(result[RECENTLY_SEEN_BOTS_KEY]?.entries) ? result[RECENTLY_SEEN_BOTS_KEY].entries.length : 0 },
  soundscapes: { count: result => normalizeSoundscapeScenes(result[SOUNDSCAPES_KEY]).scenes.length },
  tabCleanupSessions: { count: result => normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]).sessions.length },
  tabCleanupTopics: { count: result => normalizeTabCleanupTopics(result[TAB_CLEANUP_TOPICS_KEY]).topics.length },
  tabCleanupEnrichment: { count: result => Object.keys(result[TAB_CLEANUP_ENRICHMENT_KEY]?.meta || {}).length },
  localChangeHistory: { count: result => Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY].length : 0 },
  localMedia: { count: result => normalizeSoundscapeAudio(result[SOUNDSCAPE_AUDIO_KEY]).items.length + (normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).global ? 1 : 0) + Object.keys(normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).chats || {}).length + Object.values(normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).galleries || {}).reduce((n, g) => n + (g.items?.length || 0), 0), large: true }
};



let exportScopesInitialized = false;











// This is a separate, one-record IndexedDB database so it cannot collide with
// the per-bot large-storage schema. Database writes replace the last snapshot
// atomically; there is no background retention loop or unbounded copy history.






















let pendingImportSafetyDownload = null;


































































const CARD_TOKEN_CACHE_KEY = "cardGreetingTokenCache";

const STORAGE_DATASET_DEFS = [
  { id: "settings", label: "Settings", keys: ["settings"], count: result => Object.keys(result.settings || {}).length },
  { id: "opened", label: "Opened", keys: [OPENED_KEY, OPENED_META_KEY], count: result => countStoreItems(result[OPENED_KEY], "opened") },
  { id: "blocked", label: "Blocked", keys: [BLOCKED_BOTS_KEY], count: result => countStoreItems(result[BLOCKED_BOTS_KEY]) },
  { id: "notInterested", label: "Not interested", keys: [NOT_INTERESTED_KEY], count: result => countStoreItems(result[NOT_INTERESTED_KEY]) },
  { id: "favoriteBots", label: "Favorite bots", keys: [FAVORITE_BOTS_KEY], count: result => countStoreItems(result[FAVORITE_BOTS_KEY]) },
  { id: "favoriteCreators", label: "Favorite creators", keys: [FAVORITE_CREATORS_KEY], count: result => countStoreItems(result[FAVORITE_CREATORS_KEY], "creator") },
  { id: "followedCreators", label: "Followed creators", keys: [FOLLOWED_CREATORS_KEY], count: result => countStoreItems(result[FOLLOWED_CREATORS_KEY], "creator") },
  { id: "laterBots", label: "Later", keys: [LATER_BOTS_KEY], count: result => countStoreItems(result[LATER_BOTS_KEY]) },
  { id: "memoryVault", label: "Memory Vault", keys: ["dsMemoryVaultV1"], count: result => normalizeMemoryVault(result.dsMemoryVaultV1).entries.length },
  { id: "botOrganization", label: "Bot organization", keys: [BOT_ORGANIZER_KEY], count: result => Object.keys(result[BOT_ORGANIZER_KEY]?.meta || {}).length },
  { id: "chatOrganization", label: "Chat organization", keys: [CHAT_ORGANIZER_KEY], count: result => Object.keys(normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]).meta).length },
  { id: "characterProfiles", label: "Character profiles", keys: [CHARACTER_QOL_PROFILES_KEY], count: result => Object.keys(normalizeCharacterQolProfiles(result[CHARACTER_QOL_PROFILES_KEY])).length },
  { id: "availability", label: "Availability checks", keys: [BOT_AVAILABILITY_KEY], count: result => Object.keys(normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]).meta).length },
  { id: "unavailableRecovery", label: "Unavailable-bot recovery ledger", keys: [BOT_UNAVAILABLE_RECOVERY_KEY], count: result => Object.keys(normalizeBotUnavailableRecovery(result[BOT_UNAVAILABLE_RECOVERY_KEY]).meta).length },
  { id: "botArchive", label: "Saved bot copies", keys: [BOT_ARCHIVE_KEY], count: result => Object.keys(normalizeBotArchive(result[BOT_ARCHIVE_KEY]).meta).length },
  { id: "lorebookBackups", label: "Lorebook backups", keys: [LOREBOOK_BACKUPS_KEY], count: result => Object.keys(normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]).meta).length },
  { id: "snippets", label: "Saved snippets", keys: [SAVED_TEXT_SNIPPETS_KEY], count: result => Array.isArray(result[SAVED_TEXT_SNIPPETS_KEY]) ? result[SAVED_TEXT_SNIPPETS_KEY].length : 0 },
  { id: "contextKeeper", label: "Context Keeper chats", keys: [CONTEXT_KEEPER_DATA_KEY], count: result => result[CONTEXT_KEEPER_DATA_KEY] && typeof result[CONTEXT_KEEPER_DATA_KEY] === "object" ? Object.keys(result[CONTEXT_KEEPER_DATA_KEY]).length : 0 },
  { id: "storyDayTracker", label: "Internal Day Tracker chats", keys: [STORY_DAY_TRACKER_KEY], count: result => result[STORY_DAY_TRACKER_KEY] && typeof result[STORY_DAY_TRACKER_KEY] === "object" ? Object.keys(result[STORY_DAY_TRACKER_KEY]).length : 0 },
  { id: "rpStateTracker", label: "RP State Tracker chats", keys: [RP_STATE_TRACKER_KEY], count: result => result[RP_STATE_TRACKER_KEY] && typeof result[RP_STATE_TRACKER_KEY] === "object" ? Object.keys(result[RP_STATE_TRACKER_KEY]).length : 0 },
  { id: "chatNudges", label: "Chat Nudges", keys: [CHAT_NUDGE_STORE_KEY], count: result => normalizeChatNudgeStore(result[CHAT_NUDGE_STORE_KEY]).length },
  { id: "personas", label: "Personas", keys: [PERSONAS_KEY, LEGACY_PERSONAS_KEY], count: result => countStoreItems(Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY] : result[LEGACY_PERSONAS_KEY], "persona") },
  { id: "personaOrganization", label: "Persona organization", keys: [PERSONA_ORG_KEY], count: result => Object.keys(result[PERSONA_ORG_KEY]?.meta || {}).length },
  { id: "ooc", label: "OOC presets", keys: [OOC_TEMPLATES_KEY], count: result => countStoreItems(result[OOC_TEMPLATES_KEY], "ooc") },
  { id: "generationProfiles", label: "Generation profiles", keys: [GENERATION_PROFILES_KEY], count: result => countStoreItems(result[GENERATION_PROFILES_KEY], "profiles") },
  { id: "smartFilters", label: "Smart filter presets", keys: [SMART_FILTER_PRESETS_KEY], count: result => normalizeSmartFilterPresets(result[SMART_FILTER_PRESETS_KEY]).length },
  { id: "smartFilterPins", label: "Pinned Smart Filter presets", keys: [SMART_FILTER_PINNED_KEY], count: result => Array.isArray(result[SMART_FILTER_PINNED_KEY]) ? result[SMART_FILTER_PINNED_KEY].length : 0 },
  { id: "botEditorDraftHistory", label: "Chatbot editor draft history", keys: [BOT_EDITOR_DRAFT_HISTORY_KEY], count: result => Object.values(normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]).entries).reduce((n, list) => n + list.length, 0) },
  { id: "cardTokenCache", label: "Card token cache", keys: [CARD_TOKEN_CACHE_KEY], count: result => Object.keys(result[CARD_TOKEN_CACHE_KEY] || {}).length },
  { id: "localChangeHistory", label: "Recent changes", keys: [LOCAL_CHANGE_HISTORY_KEY], count: result => Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY].length : 0 },
  { id: "chatBookmarks", label: "Message bookmarks", keys: [CHAT_BOOKMARKS_KEY], count: result => Object.values(result[CHAT_BOOKMARKS_KEY] || {}).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0) },
  { id: "recentlySeenBots", label: "Recently seen bots", keys: [RECENTLY_SEEN_BOTS_KEY], count: result => Array.isArray(result[RECENTLY_SEEN_BOTS_KEY]?.entries) ? result[RECENTLY_SEEN_BOTS_KEY].entries.length : 0 },
  { id: "soundscapes", label: "Soundscape scenes", keys: [SOUNDSCAPES_KEY], count: result => normalizeSoundscapeScenes(result[SOUNDSCAPES_KEY]).scenes.length },
  { id: "soundscapeAudio", label: "Local soundscape audio files", keys: [SOUNDSCAPE_AUDIO_KEY], count: result => normalizeSoundscapeAudio(result[SOUNDSCAPE_AUDIO_KEY]).items.length },
  { id: "chatBackgroundMedia", label: "Local chat background images", keys: [CHAT_BACKGROUNDS_KEY], count: result => { const store = normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]); return (store.global ? 1 : 0) + Object.keys(store.chats || {}).length + Object.values(store.galleries || {}).reduce((n, g) => n + (g.items?.length || 0), 0); } },
  { id: "tabCleanupEnrichment", label: "Tab cleanup profile metadata", keys: [TAB_CLEANUP_ENRICHMENT_KEY], count: result => Object.keys(result[TAB_CLEANUP_ENRICHMENT_KEY]?.meta || {}).length },
  { id: "tabCleanupSessions", label: "Saved tab sessions", keys: [TAB_CLEANUP_SESSIONS_KEY], count: result => normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]).sessions.length },
  { id: "tabCleanupTopics", label: "Tab cleanup topics", keys: [TAB_CLEANUP_TOPICS_KEY], count: result => normalizeTabCleanupTopics(result[TAB_CLEANUP_TOPICS_KEY]).topics.length },
  { id: "deeplKey", label: "DeepL API key", keys: [DEEPL_API_KEY], count: result => String(result[DEEPL_API_KEY] || "").trim() ? "saved" : "none" }
];
















































let lastPerformanceSelfCheckText = "";






































































const FEATURE_INDEX_LEGACY_GROUP_STATE_KEY = "dsFeatureIndexGroupStateV1";
const FEATURE_INDEX_GROUP_IDS = Object.freeze({
  "Setup & Compatibility": "setup-compatibility",
  "Saved Lists & Bot Discovery": "saved-lists-discovery",
  "Card & Listing Tools": "card-listing-tools",
  "Chat Tools": "chat-tools",
  "Creation Tools": "creation-tools",
  "Creator Tools": "creator-tools",
  "Interface Cleanup": "interface-cleanup",
  "Data & Backup": "data-backup",
  "Mobile / Android": "mobile-android",
  "Advanced": "advanced",
  "Planned": "planned"
});













let DS_FEATURE_INDEX_REFRESH = null;




const SETTING_DEPENDENCY_GROUPS = [
  { parent: "autoAfkEnabled", name: "Inactive tab cleanup (Auto-AFK)", children: ["autoAfkMinutes", "autoAfkChats", "autoAfkHome", "autoAfkProfiles", "autoAfkProtectActive", "autoAfkResetOnActivate"] },
  { parent: "lowMemoryProtectionEnabled", name: "Low memory / PC protection", children: ["maxAwakeSpicyTabs"] },
  { parent: "duplicateTabGuardEnabled", name: "Duplicate SpicyChat Tab Guard", children: ["duplicateTabChats", "duplicateTabHome", "duplicateTabProfiles", "duplicateTabFocusExisting"] },
  { parent: "showCreatorFavoriteButtons", name: "Favorite creator stars", children: ["showCreatorFavoriteButtonsOnMyChatbots"] },
  { parent: "showQuickPanel", name: "Mini Panel", children: ["quickPanelDraggable", "quickPanelDefaultClosed", "quickPanelEnabledByDefaultInTab", "quickPanelAutoCollapseOverlap", "quickPanelShowStatus", "quickPanelShowLoadedMessageCount", "quickPanelStatusShowOpened", "quickPanelStatusShowBlocked", "quickPanelShowFeatureSummary", "quickPanelShowOptions", "quickPanelShowFillNow", "quickPanelShowSmartFilterPins", "quickPanelShowChatSearch", "quickPanelShowChatSort", "quickPanelShowScanVisible", "quickPanelShowLoadAll", "quickPanelShowOoc", "quickPanelShowAutoVoice", "quickPanelShowAutoAsterisk", "quickPanelShowTranslation", "quickPanelShowPersona", "quickPanelShowExport", "quickPanelShowSoundscapes"] },
  { parent: "showCardGreetingTokenInfo", name: "Bot card token info", children: ["cardTokenShowGreeting", "cardTokenShowPersonality", "cardTokenShowScenario", "cardTokenShowExamples"] },
  { parent: "replaceCardProfileWithBlockButton", name: "QoL card block button", children: ["quickDislikeOnBlock", "showBlockButtonOnMyCreations"] },
  { parent: "enableBulkCardBlocking", name: "Bulk card selection", children: ["bulkCardBlockingSidebarLauncher"] },
  { parent: "quickDislikeOnBlock", name: "Quick Dislike on QoL Block", children: ["quickDislikeIdleMinutes"] },
  { parent: "enableRecommendationHelpers", name: "Recommendation helpers", children: ["recommendationHideFavoriteBots", "recommendationHideOwnBots", "recommendationOnlyUnopened", "recommendationOnlyLorebook", "recommendationSessionHideButtons", "recommendationRandomButton", "recommendationHideLaterBots", "recommendationHideNotInterested", "recommendationPreferFavoriteCreators", "recommendationPreferredTags", "recommendationAvoidTags", "recommendationShowReasonBadges"] },
  { parent: "reduceAnimatedBotImages", name: "Animated bot images", children: ["animatedImagesListings", "animatedImagesChats", "animatedImagesProfiles", "animatedImagesChatMedia"] },
  { parent: "textNormalizationEnabled", name: "Text normalization", children: ["normalizeFancyUnicode", "normalizePunctuation", "normalizeInvisibleCharacters", "normalizeDecorativeSymbols"] },
  { parent: "autoFillListings", name: "Listing refill", children: ["showListingRefillButton"] },
  { parent: "showListingFilterStats", name: "Listing filter stats", children: ["showListingFilterStatsDetails"] },
  { parent: "blockCards", name: "Blocked tag / word / creator rules", children: ["autoBlockWordMatches", "autoBlockTagMatches"] },
  { parent: "showRandomChatButton", name: "Random Chat", children: ["randomChatUseLastHomeFilters", "randomChatIncludeOpened", "randomChatIncludeLater", "randomChatIncludeFavorites"] },
  { parent: "showChatTopBarTools", name: "Chat top-bar tools", children: ["chatTopBarInlineCreator", "hideChatTopBarRatingButton", "hideChatTopBarModelButton", "hideChatTopBarContextDot", "hideChatDropdownVoiceUpsell", "hideChatDropdownMemoryItem"] },
  { parent: "enableChatTextReplacements", name: "Chat text replacements", children: ["chatTextReplacementPreview", "chatTextReplacementShowChatPresetControl"] },
  { parent: "showChatSearch", name: "Search Inside Current Chat", children: ["chatSearchShowPanel", "chatSearchShowFindButton", "chatSearchExactPhrase", "chatSearchCaseSensitive", "chatSearchWholeWord", "chatSearchRegex", "chatSearchLoadUntilMatch"] },
  { parent: "enableMessageBookmarks", name: "Message bookmarks", children: ["messageBookmarkButtons"] },
  { parent: "enableFocusMode", name: "Focus / Immersive Mode", children: ["focusHideSidebar", "focusHideTopBar", "focusHideChatHeader", "focusHideQolPanel"] },
  { parent: "enableContextKeeper", name: "Context Keeper", children: ["contextKeeperAutoCapture", "contextKeeperAutoSensitivity", "contextKeeperAutoEveryMessages", "contextKeeperAutoMaxDetails", "contextKeeperMessageButtons", "enableSelectionRemember"] },
  { parent: "enableStoryDayTracker", name: "Internal Day Tracker", children: ["storyDayTrackerMode", "storyDayTrackerIncludeInContext", "storyDayTrackerShowQuickPanel"] },
  { parent: "enableRpStateTracker", name: "RP State Tracker", children: ["rpStateTrackerMode", "rpStateInjectMode", "rpStateMaxContextChars", "rpStateShowQuickPanel"] },
  { parent: "enableGlobalMemory", name: "Global Memory", children: ["globalMemoryText", "globalMemorySendMode", "globalMemoryOocWrapper", "globalMemoryShowChatButton"] },
  { parent: "enableChatNudges", name: "Chat Nudges", children: ["chatNudgeDefaultHours", "chatNudgeBrowserNotifications"] },
  { parent: "enableTranslation", name: "Message translation", children: ["translationShowMessageButtons", "translationAutoAi", "translationAutoUser", "translationAllowRemoteFallback", "translationPerChatControls"] },
  { parent: "showFormattingToolbar", name: "Formatting toolbar", children: ["formatToolbarAsterisk", "formatToolbarBold", "formatToolbarBoldItalic", "formatToolbarStrike", "formatToolbarParens", "formatToolbarQuotes", "formatToolbarBackticks", "formatToolbarBrackets", "formatToolbarBraces"] },
  { parent: "enableBulkMemoryManager", name: "Memory Manager", children: ["enableMemoryVault"] },
  { parent: "enableBotOrganizer", name: "Bot Organizer", children: ["botOrganizerExplorerFolders", "botOrganizerShowCardMeta", "botOrganizerBulkTools"] },
  { parent: "enableCreatorWritingAssistant", name: "Creator Writing Assistant", children: ["creatorWritingUseBrowserAi", "creatorWritingTargetLanguage", "creatorWritingDictionary"] },
  { parent: "enableTagAliases", name: "Local tag aliases", children: ["tagAliasRules", "tagAliasShowDisplay"] },
  { parent: "localTagMatchEnabled", name: "Personal tag matches", children: ["localTagMatchRules", "localTagMatchFetchPublic"] },
  { parent: "enableCreationAudit", name: "Creation Audit", children: ["creationAuditQuickStatus"] },
  { parent: "botBackupToolsEnabled", name: "Chatbot backup tools", children: ["botArchiveOwnEditorBackups", "botArchiveOwnRevisionLimit"] },
  { parent: "lorebookBackupToolsEnabled", name: "Lorebook backup tools", children: ["lorebookBackupsEnabled"] },
  { parent: "lorebookEntryManager", name: "Lorebook entry manager", children: ["lorebookMultiEntryWorkspace", "lorebookEntrySelectionCheckbox", "lorebookEntryShowTokenCount", "lorebookEntryShowHiddenKeywordCount", "lorebookEntryShowNoKeywordsWarning", "lorebookEntryShowCharacterCount", "lorebookEntryRenameButton", "lorebookEntryCopyButton", "lorebookEntryDuplicateButton", "lorebookBulkSelectAll", "lorebookBulkClear", "lorebookBulkAnalyze", "lorebookBulkExportSelected", "lorebookBulkCopySelected", "lorebookBulkDuplicateSelected", "lorebookBulkAddKeyword", "lorebookBulkRemoveKeyword", "lorebookBulkToggleEnabled", "lorebookBulkDeleteSelected", "lorebookBulkFindKeyword"] },
  { parent: "creatorModerationWarnings", name: "Creator wording warnings", children: ["creatorModerationWarningsChatbots"] },
  { parent: "enableReplyInstructions", name: "Reply Instructions", children: ["replyInstructionText", "replyInstructionSendMode", "replyInstructionOocWrapper", "replyInstructionShowChatButton"] },
  { parent: "enableLorebookConsistency", name: "Lorebook response consistency", children: ["lorebookConsistencyShowMatches", "lorebookConsistencyAutoQueue", "lorebookConsistencyMaxEntries"] },
  { parent: "enableSoundscapes", name: "Soundscapes", children: ["soundscapeShowChatControl", "soundscapeMasterVolume", "soundscapeOnChat", "soundscapeOnHome", "soundscapeOnChats", "soundscapeOnProfiles", "soundscapeOnOther"] },
  { parent: "enableRpFormatRepair", name: "RP Format Repair", children: ["rpFormatRepairAuto", "rpFormatConvertBoldActions", "rpFormatRemoveActionParens", "rpFormatPreserveInlineEmphasis", "rpFormatPreserveSemanticQuotes", "rpFormatPreserveBackticks", "rpFormatShowMessageButtons"] },
  { parent: "enableChatBackgrounds", name: "Custom chat backgrounds", children: ["chatSceneGalleriesEnabled", "chatBackgroundDim", "chatBackgroundBlur", "chatBackgroundFit", "chatBackgroundPosition"] },
  { parent: "androidTopBarMenu", name: "Compact chat top-bar controls", children: ["androidHideComposerShortcuts", "androidTopBarOoc", "androidTopBarAsterisk", "androidTopBarFormatting", "androidTopBarTranslation", "androidTopBarScroll", "androidTopBarPersona", "androidTopBarModel"] }
];










const SETTINGS_NO_DIRECT_CONTROL_KEYS = new Set([
  "autoAfkHours", "featureIndexCollapsedCategories",
  "autoAfkAction", "botEditorSnippets", "blockedBotIds", "blockedBotNames",
  "cardTokenShowDescription", "cardTokenShowCombined", "allowedLanguages",
  "showListingRefillButton", "quickPanelCustomX", "quickPanelCustomY",
  "showBlockCurrentBotButton", "quickDislikeIdleEnabled", "chatListSearchMode",
  "autoLoadAllOpenedChats", "deepImportMaxPages", "chatExportLoadPreviousMessages",
  "chatExportHistoryMode", "oocTemplates", "replyInstructionBotOverrides",
  "chatBubblePreserveActionColors", "hideSidebarSocialLinks", "hideSidebarFooterLinks",
  "hideSidebarAppDownload", "enableMainFooterManagement", "hideMainFooterEntirely",
  "hideMainFooterCompany", "hideMainFooterResources", "hideMainFooterCommunity",
  "hideMainFooterJoinUs", "hideMainFooterAppDownload", "hideMainFooter2257",
  "translationChatLanguageOverrides", "chatTextReplacementChatAssignments"
]);

const SETTINGS_RUNTIME_REQUIRED_KEYS = new Set(["stackChatMessages"]);



const CHAT_BUBBLE_DEFAULTS = { ...CHAT_BUBBLE_TEXT_DEFAULTS, ...CHAT_BUBBLE_PRESETS.default, chatBubblePreserveActionColors: true };
const CHAT_BUBBLE_FIELD_IDS = [
  "chatBubbleAiBackground", "chatBubbleAiTextMode", "chatBubbleAiText", "chatBubbleAiFont", "chatBubbleAiActionMode", "chatBubbleAiActionText", "chatBubbleAiActionFont", "chatBubbleAiDialogueMode", "chatBubbleAiDialogueText", "chatBubbleAiDialogueFont", "chatBubbleAiBorder", "chatBubbleAiBorderWidth", "chatBubbleAiBorderStyle", "chatBubbleAiBorderOpacity", "chatBubbleAiOpacity", "chatBubbleAiRadius", "chatBubbleAiShape", "chatBubbleAiDecorationMode", "chatBubbleAiDecorationColor", "chatBubbleAiCatEarLayout", "chatBubbleAiShadow",
  "chatBubbleUserBackground", "chatBubbleUserTextMode", "chatBubbleUserText", "chatBubbleUserFont", "chatBubbleUserActionMode", "chatBubbleUserActionText", "chatBubbleUserActionFont", "chatBubbleUserDialogueMode", "chatBubbleUserDialogueText", "chatBubbleUserDialogueFont", "chatBubbleUserBorder", "chatBubbleUserBorderWidth", "chatBubbleUserBorderStyle", "chatBubbleUserBorderOpacity", "chatBubbleUserOpacity", "chatBubbleUserRadius", "chatBubbleUserShape", "chatBubbleUserDecorationMode", "chatBubbleUserDecorationColor", "chatBubbleUserCatEarLayout", "chatBubbleUserShadow"
];













["chatBubbleAiBackground", "chatBubbleAiText", "chatBubbleUserBackground", "chatBubbleUserText"].forEach(id => {
  $(id)?.addEventListener("input", updateBubbleContrastWarnings);
  $(id)?.addEventListener("change", updateBubbleContrastWarnings);
});
["chatBubbleAiTextMode", "chatBubbleAiActionMode", "chatBubbleAiDialogueMode", "chatBubbleAiDecorationMode", "chatBubbleAiShape", "chatBubbleUserTextMode", "chatBubbleUserActionMode", "chatBubbleUserDialogueMode", "chatBubbleUserDecorationMode", "chatBubbleUserShape", "alternateDialogueCustomColors"].forEach(id => {
  $(id)?.addEventListener("change", updateAppearanceColorControlStates);
});
["messageQuickActionRemoveImage"].forEach(id => {
  $(id)?.addEventListener("change", updateMessageQuickActionControlStates);
});
document.querySelectorAll("[data-chat-bubble-preset]").forEach(button => {
  button.addEventListener("click", () => applyBubblePreset(button.dataset.chatBubblePreset));
});

document.querySelectorAll("[data-context-keeper-preset]").forEach(button => {
  button.addEventListener("click", () => {
    const preset = String(button.dataset.contextKeeperPreset || "recommended");
    const values = preset === "light"
      ? { sensitivity: "strict", every: 6, max: 60, recap: "compact" }
      : preset === "detailed"
        ? { sensitivity: "broad", every: 2, max: 200, recap: "full" }
        : { sensitivity: "balanced", every: 4, max: 120, recap: "balanced" };
    setValue("contextKeeperAutoSensitivity", values.sensitivity);
    setValue("contextKeeperAutoEveryMessages", String(values.every));
    setValue("contextKeeperAutoMaxDetails", String(values.max));
    setValue("contextKeeperRecapSize", values.recap);
    setChecked("contextKeeperAutoCapture", true);
    showSettingsToast(`Context Keeper ${preset === "recommended" ? "Recommended" : preset[0].toUpperCase() + preset.slice(1)} preset applied. Changes save automatically.`);
  });
});

$("botBackupToolsEnabled")?.addEventListener("change", event => {
  const parent = event.currentTarget;
  const auto = $("botArchiveOwnEditorBackups");
  if (parent?.checked && parent.dataset.dsAutoBackupDefaultUsed !== "1") {
    parent.dataset.dsAutoBackupDefaultUsed = "1";
    if (auto && !auto.checked) auto.checked = true;
    updateSettingDependencies();
  }
});
$("save")?.addEventListener("click", save);
$("chatNudgeRequestNotifications")?.addEventListener("click", requestChatNudgeNotifications);
$("contextWarningRequestNotifications")?.addEventListener("click", requestContextWarningNotifications);
$("creatorBotRequestNotifications")?.addEventListener("click", requestCreatorBotNotifications);
$("creatorBotWebhookTest")?.addEventListener("click", testCreatorBotWebhook);
$("creatorBotCheckNow")?.addEventListener("click", runCreatorBotWatchNow);
$("creatorBotStatusCenterCheckNow")?.addEventListener("click", runCreatorBotWatchNow);
$("enableCreatorBotNotifications")?.addEventListener("change", () => { renderCreatorBotWatchStatus(); if (savedListsDataLoaded) renderFollowedCreators(); });
$("chatNudgeRefresh")?.addEventListener("click", () => renderChatNudgeManager());
$("autoAfkCheckNow")?.addEventListener("click", runAutoAfkCheckNow);
$("duplicateTabCheckNow")?.addEventListener("click", runDuplicateTabCheckNow);
bindTabCleanupSettingsEvents();


$("saveLibreTranslate")?.addEventListener("click", () => saveLibreInstance());
$("testLibreTranslate")?.addEventListener("click", () => saveLibreInstance({ testing: true }));
$("copyEnglishFirstOoc")?.addEventListener("click", async () => {
  const instruction = "(OOC: Please write your next replies in natural English, preserving character names, dialogue formatting and actions. My chat interface may translate your responses for display. Do not translate or control my character's own dialogue.)";
  try {
    await navigator.clipboard.writeText(instruction);
    showSettingsToast("English-first OOC copied. Paste it into chat using your usual OOC workflow.");
  } catch { showSettingsToast("Could not copy. Enable clipboard access or copy the instruction manually."); }
});
$("testLocalTranslator")?.addEventListener("click", async () => {
  const host = $("localTranslatorStatus");
  if (!host) return;
  // Options pages and content scripts can expose the same Chrome Translator API.
  const API = globalThis.Translator;
  if (!API?.availability || !API?.create) { host.textContent = "This browser doesn't expose the on-device Translator API to QoL."; return; }
  host.textContent = "Checking language model...";
  try {
    const targetLanguage = value("translationTargetLanguage", "DE").split("-")[0].toLowerCase();
    const sourceLanguage = targetLanguage === "en" ? "de" : "en";
    const state = await API.availability({ sourceLanguage, targetLanguage });
    host.textContent = `On-device support (${sourceLanguage} → ${targetLanguage}): ${state}. A model download may be needed.`;
  } catch (error) { host.textContent = error?.message || String(error); }
});
$("chatBackgroundGlobalUpload")?.addEventListener("change", async event => { await importGlobalChatBackground(event.target.files); event.target.value = ""; });
$("useGlobalChatBackgroundUrl")?.addEventListener("click", () => importGlobalChatBackgroundUrl());
$("refreshGlobalChatBackgroundUrl")?.addEventListener("click", () => importGlobalChatBackgroundUrl({ refresh: true }));
$("clearGlobalChatBackground")?.addEventListener("click", clearGlobalChatBackground);
$("clearPerChatBackgrounds")?.addEventListener("click", clearPerChatBackgrounds);
$("chatBackgroundFit")?.addEventListener("change", renderChatBackgroundOptions);
$("chatBackgroundPosition")?.addEventListener("change", renderChatBackgroundOptions);
bindSoundscapesSettingsEvents();

$("clearOpened")?.addEventListener("click", clearOpened);
$("exportSettings")?.addEventListener("click", exportSettings);
$("selectActiveUsedExportScopes")?.addEventListener("click", () => selectActiveUsedExportScopes());
$("selectAllExportScopes")?.addEventListener("click", () => document.querySelectorAll("[data-export-scope]").forEach(input => { input.checked = true; }));
$("clearExportScopes")?.addEventListener("click", () => document.querySelectorAll("[data-export-scope]").forEach(input => { input.checked = false; }));
$("validateImport")?.addEventListener("click", validateImportBackup);
$("previewImport")?.addEventListener("click", previewImportSettings);
document.querySelectorAll("input[name='importMode']").forEach(input => input.addEventListener("change", refreshImportPreviewImpact));
$("selectAllImportScopes")?.addEventListener("click", () => { document.querySelectorAll("[data-import-scope]").forEach(input => { input.checked = true; }); refreshImportPreviewImpact(); });
$("clearImportScopes")?.addEventListener("click", () => { document.querySelectorAll("[data-import-scope]").forEach(input => { input.checked = false; }); refreshImportPreviewImpact(); });
$("importSettings")?.addEventListener("click", importSettings);
$("cancelImportPreview")?.addEventListener("click", cancelImportPreview);
$("retryImportAfterRecoveryFailure")?.addEventListener("click", () => importSettings());
$("downloadImportSafetyCopy")?.addEventListener("click", () => {
  if (!pendingImportSafetyDownload) {
    showSettingsToast("No safety-copy data is ready to download yet.");
    return;
  }
  downloadJsonFile(pendingImportSafetyDownload, backupFilename("json").replace("spicychat-qol-backup", "spicychat-qol-pre-import-safety-copy"));
});
$("dismissImportRecoveryActions")?.addEventListener("click", hideImportRecoveryActions);
let optimizeStoredDataStopRequested = false;
let optimizeStoredDataRunning = false;



$("optimizeStoredData")?.addEventListener("click", optimizeStoredData);
$("stopOptimizeStoredData")?.addEventListener("click", () => { optimizeStoredDataStopRequested = true; });
$("refreshStorageUsage")?.addEventListener("click", refreshStorageUsage);
$("checkOrphanedLocalData")?.addEventListener("click", () => checkOrphanedLocalData().catch(() => showSettingsToast("Local-data check failed.")));
$("createRecoverySnapshot")?.addEventListener("click", createManualRecoverySnapshot);
$("loadRecoverySnapshot")?.addEventListener("click", loadRecoverySnapshotIntoImport);
$("clearRecoverySnapshot")?.addEventListener("click", clearRecoverySnapshot);
$("refreshLocalChangeHistory")?.addEventListener("click", renderLocalChangeHistory);
$("undoLastLocalChange")?.addEventListener("click", undoLatestLocalChange);
$("clearLocalChangeHistory")?.addEventListener("click", clearLocalChangeHistoryFromOptions);
$("cleanLocalData")?.addEventListener("click", cleanLocalData);
$("copyAllSupportInfo")?.addEventListener("click", copyAllSupportInfo);


$("downloadAllSupportInfo")?.addEventListener("click", downloadAllSupportInfo);
$("copyDiagnostics")?.addEventListener("click", copyDiagnostics);
$("downloadDiagnostics")?.addEventListener("click", downloadDiagnostics);
$("copyPerformanceReport")?.addEventListener("click", copyPerformanceReport);
$("downloadPerformanceReport")?.addEventListener("click", downloadPerformanceReport);
$("runPerformanceSelfCheck")?.addEventListener("click", runPerformanceSelfCheck);
$("downloadPerformanceSelfCheck")?.addEventListener("click", downloadPerformanceSelfCheck);
$("resetPerformanceCounters")?.addEventListener("click", resetPerformanceCounters);
$("releaseOptionsTemporaryMemory")?.addEventListener("click", releaseTemporaryOptionsMemory);
$("refreshLorebookCenter")?.addEventListener("click", () => refreshLorebookCenter().catch(() => showSettingsToast("Could not load Lorebook history.")));
$("scanLorebookAvailability")?.addEventListener("click", () => runLorebookStatusScan({ mode: "all" }).catch(() => showSettingsToast("Lorebook Status scan failed.")));
$("scanUncheckedLorebookAvailability")?.addEventListener("click", () => runLorebookStatusScan({ mode: "unchecked" }).catch(() => showSettingsToast("Lorebook Status scan failed.")));
$("scanStaleLorebookAvailability")?.addEventListener("click", () => runLorebookStatusScan({ mode: "stale" }).catch(() => showSettingsToast("Lorebook Status scan failed.")));
$("stopLorebookAvailabilityScan")?.addEventListener("click", () => {
  lorebookStatusStopRequested = true;
  const status = $("lorebookCenterScanStatus");
  if (status) status.textContent = "Stopping after the current Lorebook check…";
});
$("lorebookStatusScanSpeed")?.addEventListener("change", () => save().catch(() => {}));
$("lorebookStatusStaleDays")?.addEventListener("change", () => { save().catch(() => {}); renderLorebookCenter(); });
$("exportLorebookHistory")?.addEventListener("click", () => exportLorebookHistory().catch(() => showSettingsToast("Could not export Lorebook history.")));
$("exportLorebookArchiveData")?.addEventListener("click", () => exportLorebookArchiveData().catch(() => showSettingsToast("Could not export Lorebook archive data.")));
$("clearLorebookHistory")?.addEventListener("click", () => clearLorebookHistory().catch(() => showSettingsToast("Could not clear Lorebook history.")));
$("lorebookCenterSearch")?.addEventListener("input", () => { lorebookCenterVisibleCount = 20; renderLorebookCenter(); });
$("lorebookCenterStatusFilter")?.addEventListener("change", () => { lorebookCenterVisibleCount = 20; renderLorebookCenter(); });
$("lorebookCenterSortMode")?.addEventListener("change", () => { lorebookCenterVisibleCount = 20; renderLorebookCenter(); });
$("lorebookCenterShowMore")?.addEventListener("click", () => { lorebookCenterVisibleCount += 20; renderLorebookCenter(); });
$("lorebookCenterShowLess")?.addEventListener("click", () => { lorebookCenterVisibleCount = 20; renderLorebookCenter(); });
$("lorebookCenterCollapse")?.addEventListener("click", () => {
  lorebookCenterVisibleCount = lorebookCenterVisibleCount >= 100 ? 20 : 100;
  renderLorebookCenter();
});
$("reduceOptionsAnimations")?.addEventListener("change", () => applyOptionsPerformancePreferences({ reduceOptionsAnimations: checked("reduceOptionsAnimations") }));
["settingsNavigationStyle", "settingsContentLayout", "settingsPageWidth"].forEach(id => {
  $(id)?.addEventListener("change", () => applyOptionsLayoutPreferences());
});
for (const id of ["qolInterfaceScale", "settingsReadingFont", "settingsReadingSize", "settingsReadingLineSpacing", "settingsReadingLetterSpacing", "settingsReadingContrast", "settingsReadingLargerControls"]) {
  $(id)?.addEventListener("change", () => applyOptionsAccessibilityPreview(settingsReadingValuesFromControls()));
}
const SETTINGS_READING_PRESETS = {
  default: { settingsReadingFont: "native", settingsReadingSize: 100, settingsReadingLineSpacing: "native", settingsReadingLetterSpacing: "native", settingsReadingContrast: false, settingsReadingLargerControls: false },
  comfort: { settingsReadingFont: "verdana", settingsReadingSize: 110, settingsReadingLineSpacing: "comfortable", settingsReadingLetterSpacing: "slight", settingsReadingContrast: false, settingsReadingLargerControls: false },
  vision: { settingsReadingFont: "arial", settingsReadingSize: 125, settingsReadingLineSpacing: "comfortable", settingsReadingLetterSpacing: "native", settingsReadingContrast: true, settingsReadingLargerControls: true }
};
document.querySelectorAll("[data-settings-reading-preset]").forEach(button => button.addEventListener("click", () => {
  const preset = SETTINGS_READING_PRESETS[button.dataset.settingsReadingPreset];
  if (!preset) return;
  for (const [key, selected] of Object.entries(preset)) {
    if (typeof selected === "boolean") setChecked(key, selected);
    else setValue(key, selected);
  }
  applyOptionsAccessibilityPreview(settingsReadingValuesFromControls());
  const card = $("accessibilityCard");
  if (card) queueSettingsDiffForContainer(card, { delay: 70 });
}));
$("collapseAllSettingsSections")?.addEventListener("click", () => {
  setAllSettingsSectionsCollapsed(true);
  persistAllSettingsSectionStates();
});
$("expandAllSettingsSections")?.addEventListener("click", () => {
  setAllSettingsSectionsCollapsed(false);
  persistAllSettingsSectionStates();
});
$("runSettingsHealthCheck")?.addEventListener("click", () => runSettingsHealthCheck().catch(() => showSettingsToast("Settings health check failed.")));
$("openSaiCompatibilitySetting")?.addEventListener("click", () => revealSettingsTarget("saiToolkitCompatibility"));
$("markUpdatesSeen")?.addEventListener("click", markUpdatesSeen);
$("startFirstRunSetup")?.addEventListener("click", () => {
  setActiveTab("general");
  $("quickSetupCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
});
$("dismissFirstRunNotice")?.addEventListener("click", dismissFirstRunNotice);
$("addOocTemplate")?.addEventListener("click", addOocTemplate);
$("addBotEditorSnippet")?.addEventListener("click", addBotEditorSnippet);
$("addBlockedBot")?.addEventListener("click", () => addManagedBot("blocked"));
$("addNotInterestedBot")?.addEventListener("click", () => addManagedBot("notInterested"));
$("addFavoriteCreator")?.addEventListener("click", addFavoriteCreator);
$("addFollowedCreator")?.addEventListener("click", addFollowedCreator);
$("saveDeeplKey")?.addEventListener("click", () => saveDeepLKey());
$("testDeepl")?.addEventListener("click", testDeepL);
$("checkDeeplUsage")?.addEventListener("click", checkDeepLUsage);
[
  "textNormalizationEnabled",
  "normalizeFancyUnicode",
  "normalizePunctuation",
  "normalizeInvisibleCharacters",
  "normalizeDecorativeSymbols",
  "textNormalizationPreviewInput"
].forEach(id => $(id)?.addEventListener("input", updateTextNormalizationPreview));
[
  "textNormalizationEnabled",
  "normalizeFancyUnicode",
  "normalizePunctuation",
  "normalizeInvisibleCharacters",
  "normalizeDecorativeSymbols"
].forEach(id => $(id)?.addEventListener("change", updateTextNormalizationPreview));


// Keep the displayed version available even when a required Settings module is missing.
setVersionText();
const missingSettingsModules = [
  ["settings/options-settings-defaults.js", typeof DEFAULT_SETTINGS !== "undefined"],
  ["settings/options-reading-accessibility.js", typeof applyOptionsAccessibilityPreview === "function"],
  ["settings/options-section-navigation.js", typeof setupCollapsibleSettingsCards === "function" && typeof setupSettingsSectionNavigation === "function"],
  ["settings/options-tab-cleanup.js", typeof tabCleanupWords === "function"],
  ["settings/options-soundscapes.js", typeof normalizeSoundscapeScenes === "function"]
].filter(([, ready]) => !ready).map(([filename]) => filename);
if (missingSettingsModules.length) {
  const message = `QoL Settings could not finish loading. Missing required file(s): ${missingSettingsModules.join(", ")}. Reinstall the complete replacement files for this update and reload Settings.`;
  const notice = document.createElement("p");
  notice.setAttribute("role", "alert");
  notice.style.cssText = "color:#ffb4a9;font-weight:600;max-width:80ch";
  notice.textContent = message;
  document.querySelector("main > header")?.append(notice);
  throw new Error(message);
}

reorderOptionsUi();
setupCollapsibleSettingsCards();
setupSettingsSectionNavigation();
setupActiveOptionsPanel();

setupBotManagerControls("blocked");
setupBotManagerControls("notInterested");
setupBotManagerControls("later");
setupBotManagerControls("favorite");
setupBotManagerControls("opened");
setupSavedBotsHubControls();
setupFavoriteCreatorControls();
setupFollowedCreatorControls();
setupBotAvailabilityControls();
setupMiniPanelPreview();
setupSettingsToast();
setupSettingDependencies();
setupPlatformCompatibility();
setupAccountSyncFoundation();
setupFeaturesIndex();
setupMessageQuickActionGroupToggle();
setupPageIntros();
setupSettingsSearch();
setupPresets();
setupBubbleResetControls();
setupAndroidSettings();
setupBackupFileIo();
setupModerationTermManager();
setupBlockerTester();
setupCreatorBackupManager();
setupControlCenterControls();

const pendingSavedManagerRefreshKinds = new Set();
let savedManagerRefreshTimer = 0;
let blockedManagerRefreshTimer = 0;







chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  const granularSettingChanges = Object.entries(changes || {})
    .map(([key, change]) => [granularSettingName(key), change])
    .filter(([name]) => !!name);
  const settingsChanged = !!changes.settings || granularSettingChanges.length > 0;
  if (changes.settings?.newValue) loadedSettingsSnapshot = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
  if (granularSettingChanges.length) {
    const next = { ...loadedSettingsSnapshot };
    for (const [name, change] of granularSettingChanges) {
      if (change?.newValue === undefined) next[name] = DEFAULT_SETTINGS[name];
      else next[name] = change.newValue;
    }
    loadedSettingsSnapshot = next;
  }
  if (settingsChanged && optionsDataLoaded) {
    refreshPlatformCompatibilityUi(loadedSettingsSnapshot);
    DS_FEATURE_INDEX_REFRESH?.();
    if (activeOptionsTab() === "account") refreshAccountSyncUi().catch(() => {});
  }
  if (changes[QOL_SYNC_STATE_KEY] && optionsDataLoaded && activeOptionsTab() === "account") {
    refreshAccountSyncUi().catch(() => {});
  }

  // Bot Status / unavailable-cleanup writes originate from this Options page,
  // whose in-memory stores are already current. Re-normalizing every large
  // changed value and immediately rebuilding all Saved managers was causing a
  // second wave of short UI hangs after the actual storage commit.
  if (Date.now() < Number(botStatusStorageSelfWriteUntil || 0)) {
    const selfWriteKeys = new Set([
      "settings",
      BLOCKED_BOTS_KEY, NOT_INTERESTED_KEY, FAVORITE_BOTS_KEY, LATER_BOTS_KEY,
      OPENED_KEY, OPENED_META_KEY, RECENTLY_SEEN_BOTS_KEY, BOT_ORGANIZER_KEY,
      CREATOR_BOT_WATCH_KEY, QUICK_DISLIKE_BULK_STATE_KEY, QUICK_LESS_LIKE_BULK_STATE_KEY,
      BOT_AVAILABILITY_KEY, BOT_ARCHIVE_KEY, BOT_UNAVAILABLE_RECOVERY_KEY
    ]);
    const keys = Object.keys(changes || {});
    if (keys.length && keys.every(key => selfWriteKeys.has(key) || key.startsWith(GRANULAR_SETTING_PREFIX) || [GRANULAR_SETTINGS_INDEX_KEY, GRANULAR_SETTINGS_MIGRATION_KEY, GRANULAR_SETTINGS_REVISION_KEY, GRANULAR_SETTINGS_LAST_BATCH_KEY].includes(key))) {
      if (changes[BOT_ARCHIVE_KEY]) creatorBackupManagerLoaded = false;
      return;
    }
  }

  if (changes[PENDING_OPTIONS_NAV_KEY]?.newValue && optionsDataLoaded) {
    applyPendingOptionsNavigation(changes[PENDING_OPTIONS_NAV_KEY].newValue).catch(() => {});
  }
  let refreshBlocked = false;
  const savedRefreshKinds = new Set();

  if (changes[QUICK_DISLIKE_HISTORY_KEY]) {
    quickDislikeHistoryState = normalizeQuickDislikeHistory(changes[QUICK_DISLIKE_HISTORY_KEY].newValue);
    refreshBlocked = true;
  }

  if (changes[QUICK_DISLIKE_BULK_STATE_KEY]) {
    quickDislikeBulkState = normalizeQuickDislikeBulkState(changes[QUICK_DISLIKE_BULK_STATE_KEY].newValue);
    updateBlockedBulkResumeControls();
  }

  if (changes[QUICK_LESS_LIKE_HISTORY_KEY]) {
    quickLessLikeHistoryState = normalizeQuickLessLikeHistory(changes[QUICK_LESS_LIKE_HISTORY_KEY].newValue);
    refreshBlocked = true;
  }

  if (changes[QUICK_LESS_LIKE_BULK_STATE_KEY]) {
    quickLessLikeBulkState = normalizeQuickLessLikeBulkState(changes[QUICK_LESS_LIKE_BULK_STATE_KEY].newValue);
    updateBlockedLessLikeResumeControls();
  }

  if (changes[BLOCKED_BOTS_KEY] && blockingDataLoaded) {
    blockedState = normalizeBotStore(changes[BLOCKED_BOTS_KEY].newValue);
    renderAutoBlockMatchCounters();
    refreshBlocked = true;
    if (savedListsDataLoaded) {
      savedRefreshKinds.add("hub");
      savedRefreshKinds.add("opened");
      const cleaned = enforceBlockedPriorityOverOpenedState({ markDirty: false });
      if (cleaned.removed) {
        currentOpened = cleaned.ids;
        openedChatMetaState = cleaned.meta;
        storageSet({
          [OPENED_KEY]: cleaned.ids,
          [OPENED_META_KEY]: cleaned.meta
        }).catch(() => {});
      }
    }
  }

  if (changes[NOT_INTERESTED_KEY] && blockingDataLoaded) {
    notInterestedState = normalizeBotStore(changes[NOT_INTERESTED_KEY].newValue);
    if (savedListsDataLoaded) savedRefreshKinds.add("hub");
  }

  if (changes[OPENED_KEY] && savedListsDataLoaded) {
    currentOpened = Array.isArray(changes[OPENED_KEY].newValue) ? uniqueClean(changes[OPENED_KEY].newValue) : [];
    savedRefreshKinds.add("opened");
    savedRefreshKinds.add("favorite");
    savedRefreshKinds.add("later");
    savedRefreshKinds.add("hub");
    const cleaned = enforceBlockedPriorityOverOpenedState({ markDirty: false });
    if (cleaned.removed) {
      currentOpened = cleaned.ids;
      openedChatMetaState = cleaned.meta;
      storageSet({
        [OPENED_KEY]: cleaned.ids,
        [OPENED_META_KEY]: cleaned.meta
      }).catch(() => {});
    }
  }

  if (changes[OPENED_META_KEY] && savedListsDataLoaded) {
    openedChatMetaState = normalizeMetaStore(changes[OPENED_META_KEY].newValue);
    savedRefreshKinds.add("opened");
    savedRefreshKinds.add("hub");
    const cleaned = enforceBlockedPriorityOverOpenedState({ markDirty: false });
    if (cleaned.removed) {
      currentOpened = cleaned.ids;
      openedChatMetaState = cleaned.meta;
      storageSet({
        [OPENED_KEY]: cleaned.ids,
        [OPENED_META_KEY]: cleaned.meta
      }).catch(() => {});
    }
  }

  if (changes[FAVORITE_BOTS_KEY] && savedListsDataLoaded) {
    favoriteBotState = normalizeBotStore(changes[FAVORITE_BOTS_KEY].newValue);
    savedRefreshKinds.add("favorite");
    savedRefreshKinds.add("later");
    savedRefreshKinds.add("hub");
  }

  if (changes[LATER_BOTS_KEY] && savedListsDataLoaded) {
    laterBotState = normalizeBotStore(changes[LATER_BOTS_KEY].newValue);
    savedRefreshKinds.add("favorite");
    savedRefreshKinds.add("later");
    savedRefreshKinds.add("hub");
  }

  if (changes[FAVORITE_CREATORS_KEY] && savedListsDataLoaded) {
    favoriteCreatorState = normalizeCreatorStore(changes[FAVORITE_CREATORS_KEY].newValue);
    savedRefreshKinds.add("favoriteCreators");
  }

  if (changes[FOLLOWED_CREATORS_KEY] && savedListsDataLoaded) {
    followedCreatorState = normalizeCreatorStore(changes[FOLLOWED_CREATORS_KEY].newValue);
    savedRefreshKinds.add("followedCreators");
  }

  if (changes[CREATOR_BOT_WATCH_KEY]) {
    creatorBotWatchState = normalizeCreatorBotWatchState(changes[CREATOR_BOT_WATCH_KEY].newValue);
    if (savedListsDataLoaded) {
      savedRefreshKinds.add("creatorWatch");
      savedRefreshKinds.add("followedCreators");
      savedRefreshKinds.add("hub");
    } else {
      renderCreatorBotWatchStatus();
    }
  }

  if (changes[CREATOR_BOT_WEBHOOK_KEY]) {
    creatorBotWebhookState = normalizeCreatorBotWebhookConfig(changes[CREATOR_BOT_WEBHOOK_KEY].newValue);
  }

  if (changes[RECENTLY_SEEN_BOTS_KEY] && savedListsDataLoaded) {
    recentlySeenBotState = normalizeRecentlySeenStore(changes[RECENTLY_SEEN_BOTS_KEY].newValue);
    savedRefreshKinds.add("hub");
  }

  if (changes[BOT_ORGANIZER_KEY] && savedListsDataLoaded) {
    botOrganizationState = normalizeBotOrganization(changes[BOT_ORGANIZER_KEY].newValue);
    savedRefreshKinds.add("favorite");
    savedRefreshKinds.add("later");
    savedRefreshKinds.add("hub");
  }

  if (changes[BOT_AVAILABILITY_KEY] && savedListsDataLoaded) {
    botAvailabilityState = normalizeBotAvailability(changes[BOT_AVAILABILITY_KEY].newValue);
    savedRefreshKinds.add("availability");
  }

  if (changes[BOT_UNAVAILABLE_RECOVERY_KEY] && savedListsDataLoaded) {
    botUnavailableRecoveryState = normalizeBotUnavailableRecovery(changes[BOT_UNAVAILABLE_RECOVERY_KEY].newValue);
    savedRefreshKinds.add("availability");
  }

  if (changes[BOT_ARCHIVE_KEY] || changes[LOREBOOK_BACKUPS_KEY] || settingsChanged) {
    creatorBackupManagerLoaded = false;
    if (activeOptionsTab() === "bot-tools") loadCreatorBackupManager({ force: true }).catch(() => {});
  }

  if (changes[BOT_ARCHIVE_KEY] && savedListsDataLoaded) {
    botArchiveState = normalizeBotArchive(changes[BOT_ARCHIVE_KEY].newValue);
    // Archive metadata feeds name/image recovery helpers used by saved managers.
    savedRefreshKinds.add("opened");
    savedRefreshKinds.add("favorite");
    savedRefreshKinds.add("later");
    savedRefreshKinds.add("hub");
  }

  if (savedRefreshKinds.size) scheduleSavedManagersRefresh([...savedRefreshKinds]);

  if (refreshBlocked && blockingDataLoaded && !blockedBulkDislikeRunning) {
    scheduleBlockedManagerRefresh();
  }
});

setupTabs();
setupSettingsAutosave();
load();

$("refreshPersonalUsage")?.addEventListener("click", refreshPersonalUsageSummary);

try { window.addEventListener("focus", () => refreshOptionsDiagnosticState(true).catch(() => {})); } catch {}
