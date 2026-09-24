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
const FAVORITE_BOTS_KEY = "favoriteBots";
const LATER_BOTS_KEY = "laterBots";
const BOT_ORGANIZER_KEY = "botOrganization";
const CHAT_ORGANIZER_KEY = "chatOrganization";
const CHARACTER_QOL_PROFILES_KEY = "characterQolProfiles";
const BOT_AVAILABILITY_KEY = "botAvailability";
const BOT_ARCHIVE_KEY = "botArchive";
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
const SOUNDSCAPES_KEY = "soundscapes";
const SOUNDSCAPE_AUDIO_KEY = "soundscapeAudioLibrary";
const CHAT_BACKGROUNDS_KEY = "chatBackgroundMediaV1";
const QUICK_DISLIKE_HISTORY_KEY = "quickDislikeHistoryV1";
const QUICK_DISLIKE_BULK_STATE_KEY = "quickDislikeBulkStateV1";
const BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD = 3;
const BULK_DISLIKE_RETRY_LIMIT = 2;
const BULK_DISLIKE_RETRY_BASE_MS = 1200;
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
const TAB_CLEANUP_TOPICS_KEY = "tabCleanupTopics";
const RECOVERY_SNAPSHOT_KEY = "dsRecoverySnapshotV1";
const BACKUP_FORMAT_VERSION = 12;

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

function optionsPerfFinish(kind, started) {
  if (!started || typeof performance === "undefined") return 0;
  const elapsed = Math.max(0, performance.now() - started);
  if (kind === "read") {
    OPTIONS_PERFORMANCE.storageReads += 1;
    OPTIONS_PERFORMANCE.storageReadTotalMs += elapsed;
    OPTIONS_PERFORMANCE.storageReadMaxMs = Math.max(OPTIONS_PERFORMANCE.storageReadMaxMs, elapsed);
  } else if (kind === "write") {
    OPTIONS_PERFORMANCE.storageWrites += 1;
    OPTIONS_PERFORMANCE.storageWriteTotalMs += elapsed;
    OPTIONS_PERFORMANCE.storageWriteMaxMs = Math.max(OPTIONS_PERFORMANCE.storageWriteMaxMs, elapsed);
  }
  return elapsed;
}

function storageKeyLabel(keys) {
  if (keys == null) return "all storage";
  const list = Array.isArray(keys) ? keys : (typeof keys === "string" ? [keys] : Object.keys(keys || {}));
  if (!list.length) return "no keys";
  if (list.length <= 4) return list.join(", ");
  return `${list.slice(0, 4).join(", ")} +${list.length - 4} more`;
}

function recordSlowStorageRead(keys, elapsed) {
  if (elapsed < 100) return;
  const record = { keys: storageKeyLabel(keys), ms: Math.round(elapsed * 10) / 10, bytes: 0, at: Date.now() };
  OPTIONS_PERFORMANCE.slowStorageReads.push(record);
  OPTIONS_PERFORMANCE.slowStorageReads.sort((a, b) => Number(b.ms || 0) - Number(a.ms || 0));
  OPTIONS_PERFORMANCE.slowStorageReads = OPTIONS_PERFORMANCE.slowStorageReads.slice(0, 5);
  try {
    chrome.storage.local.getBytesInUse(keys, bytes => {
      if (!chrome.runtime?.lastError) record.bytes = Math.max(0, Number(bytes || 0));
    });
  } catch {}
}

function applyOptionsPerformancePreferences(settings = {}) {
  const reduce = !!settings.reduceOptionsAnimations;
  if (document.documentElement.classList.contains("ds-options-reduced-motion") !== reduce) {
    document.documentElement.classList.toggle("ds-options-reduced-motion", reduce);
  }
  let style = document.getElementById("ds-options-performance-style");
  if (reduce && !style) {
    style = document.createElement("style");
    style.id = "ds-options-performance-style";
    style.textContent = `.ds-options-reduced-motion *, .ds-options-reduced-motion *::before, .ds-options-reduced-motion *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }`;
    document.head.appendChild(style);
  } else if (!reduce) {
    style?.remove();
  }
}

function applyOptionsAccessibilityPreview(settings = {}) {
  const scale = [100, 110, 125, 150].includes(Number(settings.qolInterfaceScale))
    ? Number(settings.qolInterfaceScale)
    : 100;
  document.documentElement.style.zoom = scale === 100 ? "" : String(scale / 100);
}

const OLD_DEFAULT_OOC_TEMPLATE = "[OOC: Never control Lukas or the user in any way. Do not speak for Lukas. Do not describe what Lukas thinks, feels, wants, notices, decides, does, or how he reacts. Do not move Lukas forward in the scene. Only the user may write Lukas's words, actions, thoughts, emotions, expressions, and decisions. You may control only your character, NPCs, side characters, enemies, and the environment. End every response in a way that leaves Lukas free to respond.]";
const DEFAULT_OOC_TEMPLATE_ID = "builtin-strict-no-control";
const HARD_OOC_TEMPLATE_ID = "builtin-hard-no-control";
const DEFAULT_OOC_TEMPLATE = "[OOC: Never control {user} or the user in any way. Do not speak for {user}. Do not describe what {user} thinks, feels, wants, notices, decides, does, or how {user} reacts. Do not move {user} forward in the scene. Only the user may write {user}'s words, actions, thoughts, emotions, expressions, and decisions. You may control only your character, NPCs, side characters, enemies, and the environment. End every response in a way that leaves {user} free to respond.]";
const HARD_OOC_TEMPLATE = "[OOC: Never control {user} or the user in any way. Do not speak for {user}. Do not describe what {user} thinks, feels, wants, notices, decides, remembers, assumes, understands, intends, or how {user} reacts. Do not describe {user}'s facial expressions, body language, physical reactions, involuntary reactions, attention, focus, attraction, arousal, fear, embarrassment, surprise, discomfort, pleasure, or any other internal or external response unless the user explicitly wrote it first. Do not move {user} forward in the scene. Do not make {user} walk, sit, stand, turn, look, nod, shake their head, smile, laugh, sigh, blush, tense, relax, freeze, tremble, touch someone, pull away, approach, leave, eat, drink, sleep, wake, or perform any other action unless the user explicitly wrote that action first. If the user begins an action, do not continue, complete, alter, or finish that action for them. Characters may touch, speak to, approach, flirt with, question, or interact with {user}, but only describe the character's actions and stop before describing {user}'s response. NPCs may form opinions or assumptions about {user}, but those assumptions must remain clearly the NPC's perspective and must never be treated as confirmed narration or fact. Never use narration such as {user} can't help but, {user} finds themselves, {user} realizes, {user} notices, {user} feels, {user} wants, {user} knows, despite themselves, or before {user} can react unless the user explicitly established it. Do not move or control {user} during time skips. You may control only your character, NPCs, side characters, enemies, animals, crowds, and the environment. For formatting, write all narration, actions, environmental description, and nonverbal behavior in italics. Write dialogue in the format Character Name: dialogue. Do not use quotation marks around dialogue. Do not bold character names. Do not put narration in parentheses. Use a new paragraph when the speaker changes. Keep replies medium-length, cohesive, concrete, and story-focused. Avoid repetitive exposition, artificial cliffhangers, and cutting scenes short just to force continuation. End every response in a way that leaves {user} completely free to respond.]";

const DEFAULT_SETTINGS = {
  enabled: true,
  globalNsfwMode: "ignore",
  saiToolkitCompatibility: false,

  autoAfkEnabled: false,
  autoAfkHours: 12,
  autoAfkChats: false,
  autoAfkHome: false,
  autoAfkProfiles: false,
  autoAfkAction: "discard",
  autoAfkProtectActive: false,
  autoAfkResetOnActivate: false,
  duplicateTabGuardEnabled: false,
  duplicateTabChats: true,
  duplicateTabHome: false,
  duplicateTabProfiles: false,
  duplicateTabFocusExisting: true,
    duplicateTabKeepMode: "new",
  tabCleanupRecentHours: 24,
  tabCleanupRecentDays: 3,
  tabCleanupMediumDays: 7,
  tabCleanupOldDays: 14,
  tabCleanupProtectPinnedOnClose: true,

  autoTags: false,
  enableTagAliases: false,
  tagAliasRules: "",
  tagAliasShowDisplay: true,
  includeTags: [],
  excludeTags: [],
  showTagTemplateButton: false,
  showChatTagLinks: false,
  showChatTagAddButtons: false,

  botEditorShowCharButton: false,
  botEditorShowUserButton: false,
  botEditorShowContinueButton: false,
  botEditorShowNoControlButton: false,
  botEditorShowCustomSnippets: false,
  botEditorAutoOpenAdvanced: false,
  rememberBotImagePrompt: false,
  botEditorSaveActions: false,
  botEditorSaveChatNewTab: false,
  enableBotEditorDraftHistory: false,
  botEditorDraftHistoryLimit: 8,
  enableWikiLorebookImporter: false,
  enableLorebookConsistency: false,
  lorebookConsistencyShowMatches: true,
  lorebookConsistencyAutoQueue: true,
  lorebookConsistencyMaxEntries: 3,
  lorebookDefaultEntriesTab: false,
  lorebookRememberEntrySort: false,
  lorebookProtectEntryDrafts: false,
  lorebookEditShortcuts: false,
  lorebookEntryManager: false,
  lorebookMultiEntryWorkspace: false,
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
  lorebookAutoStartNew: false,
  lorebookBulkKeywordPaste: false,
  lorebookExpandEntryEditor: false,
  lorebookExpandTags: false,
  botTagBulkPaste: false,
  showLorebookEntryExpandButtons: false,
  creatorModerationWarnings: false,
  creatorModerationWarningsChatbots: false,
  creatorModerationWarningMode: "balanced",
  creatorModerationWarningIgnoredTerms: "",
  creatorModerationWarningCustomTerms: "",
  botEditorDefaultVisibility: "ignore",
  autoAgreeCreationGuidelines: false,
  botEditorSnippets: [],

  enableGenerationProfiles: false,
  showGenerationMetadata: false,
  showMessageTimestamps: false,
  messageTimestamp24Hour: false,
  messageTimestampDateFirst: false,
  messageTimestampShowSeconds: false,
  showGenerationModel: false,
  showGenerationElapsed: false,
  showGenerationSettings: false,
  compactGenerationMetadata: false,
  enableContextWindowWarning: false,
  contextWarningThreshold: 85,
  contextWarningManualLimit: 0,
  contextWarningBrowserNotifications: false,

  hidePremium: false,
  hideFloatingPremiumPopups: false,
  hideAdvertBanners: false,
  expandModelSelectorDescriptions: false,
  hideModelUpgradeButtons: false,
  customizeModelQuickMenu: false,
  modelFavoriteNames: "",
  modelHiddenNames: "",
  modelQuickFavoritesOnly: false,
  hideNotifications: false,
  hideTabNotificationBadge: false,
  autoReadNotifications: false,

  hideTopBarLanguage: false,
  hideTopBarNotifications: false,
  hideTopBarTheme: false,
  topBarProfilePillMode: "normal",
  topBarProfilePillCustomText: "",
  topBarProfilePillPersonaPrefix: false,

  showChatTopBarTools: false,
  chatTopBarInlineCreator: false,
  chatTopBarAddLaterButton: false,
  closeChatTabAfterSavingLater: false,
  showPerCharacterChatHistory: false,
  showQuickNewChatButton: false,
  showChatSearch: false,
  chatSearchShowPanel: true,
  chatSearchShowFindButton: false,
  chatSearchExactPhrase: false,
  chatSearchCaseSensitive: false,
  chatSearchWholeWord: false,
  chatSearchRegex: false,
  chatSearchLoadUntilMatch: false,
  enableMessageBookmarks: false,
  messageBookmarkButtons: true,
  enableFocusMode: false,
  focusHideSidebar: true,
  focusHideTopBar: true,
  focusHideChatHeader: true,
  focusHideQolPanel: true,
  enableSavedTextSnippets: false,
  enableContextKeeper: false,
  contextKeeperAutoCapture: true,
  contextKeeperAutoSensitivity: "balanced",
  contextKeeperAutoEveryMessages: 4,
  contextKeeperAutoMaxDetails: 120,
  contextKeeperMessageButtons: false,
  enableSelectionRemember: false,
  contextKeeperRecapSize: "balanced",
  enableStoryDayTracker: false,
  storyDayTrackerMode: "conservative",
  storyDayTrackerIncludeInContext: true,
  storyDayTrackerShowQuickPanel: true,
  enableRpStateTracker: false,
  rpStateTrackerMode: "conservative",
  rpStateInjectMode: "changed",
  rpStateMaxContextChars: 1200,
  rpStateShowQuickPanel: true,
  enableChatNudges: false,
  chatNudgeDefaultHours: 24,
  chatNudgeBrowserNotifications: true,
  enableSoundscapes: false,
  soundscapeShowChatControl: true,
  soundscapeMasterVolume: 65,
  soundscapeOnChat: true,
  soundscapeOnHome: false,
  soundscapeOnChats: false,
  soundscapeOnProfiles: false,
  soundscapeOnOther: false,
  hideChatTopBarRatingButton: false,
  enableNativeRatingHelpers: false,
  hideChatTopBarModelButton: false,
  hideChatTopBarContextDot: false,
  hideChatDropdownVoiceUpsell: false,
  hideChatDropdownMemoryItem: false,
  enableBulkMemoryManager: false,
  showCopyMemoryAction: false,
  memoryAutoLoadAll: false,
  enableChatTextReplacements: false,
  chatTextReplacementRules: "",
  chatTextReplacementScope: "ai",
  chatTextReplacementMode: "display",
  chatTextReplacementPreview: false,
  enableTranslation: false,
  translationShowMessageButtons: false,
  translationAutoAi: false,
  translationAutoUser: false,
  translationTargetLanguage: "EN-US",
  translationUnderstoodLanguages: "EN",
  translationProtectedTerms: "",

  blockCards: false,
  blockedTags: [],
  blockedWords: [],
  blockedCreators: [],
  blockedBotIds: [],
  blockedBotNames: [],
  blockedBotSortMode: "newest",
  neverHideFavorites: false,
  protectFavoritesFromBlocking: false,
  showBlockButtonOnMyCreations: false,
  showCreatorFavoriteButtons: false,
  protectFavoriteCreatorsFromFiltering: false,
  showFollowCreatorButtons: false,
  enableCreatorBotNotifications: false,
  creatorBotCheckMinutes: 60,
  creatorBotBrowserNotifications: false,
  trackFavoriteBots: false,
  showFavoriteHistoryButton: false,
  favoriteBotSortMode: "newest",
  favoriteBotRelationFilter: "all",
  favoriteBotFolderFilter: "all",
  favoriteBotCreatorFilter: "",
  favoriteBotStateFilter: "all",
  showLaterBotButtons: false,
  enableSavedListsOverlay: false,
  protectLaterBotsFromFiltering: false,
  hideLaterBotsFromListings: false,
  laterBotSortMode: "newest",
  laterBotRelationFilter: "all",
  laterBotFolderFilter: "all",
  laterBotCreatorFilter: "",
  laterBotStateFilter: "all",
  enableBotOrganizer: false,
  botCollections: "",
  botOrganizerShowCardMeta: true,
  botOrganizerBulkTools: true,
  hideHomeForYouCards: false,
  expandLongCardDescriptions: false,
  showCardGreetingTokenInfo: false,
  showExactMessageCounts: false,
  showBotCreationDates: false,
  cardTokenShowGreeting: true,
  cardTokenShowDescription: false,
  cardTokenShowPersonality: false,
  cardTokenShowScenario: false,
  cardTokenShowExamples: false,
  cardTokenShowCombined: false,
  botArchiveOnProfileVisit: false,
  botArchiveOnChatOpen: false,
  botArchiveRefreshHours: 24,
  botArchiveRememberSeenPublic: false,
  botBackupToolsEnabled: false,
  botArchiveOwnEditorBackups: true,
  botArchiveOwnRevisionLimit: 10,
  lorebookBackupToolsEnabled: false,
  lorebookBackupsEnabled: false,
  hideGroupChats: false,
  showLorebookFilters: false,
  enableSmartFilterPresets: false,
  enableCreationAudit: false,
  creationAuditQuickStatus: true,
  enableCreatorWritingAssistant: false,
  creatorWritingUseBrowserAi: true,
  creatorWritingDictionary: "",
  creatorWritingTargetLanguage: "English",
  enableProfileExport: false,
  enablePersonalUsageSummary: false,
  enableMyCreationsFilters: false,
  rememberMyCreationsView: false,
  autoLoadMyCreations: false,
  myCreationsAutoLoadPages: 1,
  enableRecommendationHelpers: false,
  recommendationHideFavoriteBots: false,
  recommendationHideOwnBots: false,
  recommendationOnlyUnopened: false,
  recommendationOnlyLorebook: false,
  recommendationSessionHideButtons: false,
  recommendationRandomButton: false,
  recommendationHideLaterBots: false,
  recommendationHideNotInterested: false,
  recommendationPreferFavoriteCreators: false,
  recommendationPreferredTags: "",
  recommendationAvoidTags: "",
  recommendationShowReasonBadges: false,

  cardDensityMode: "normal",
  cardClickBehavior: "default",
  showCopyBotInfoButtons: false,
  trackRecentlySeenBots: false,
  showRecentlySeenButton: false,
  recentlySeenLimit: 100,
  enableBotComparison: false,
  showQuickNotInterestedButtons: false,
  showQuickUnblockButtons: false,

  reduceAnimatedBotImages: false,
  animatedImageMode: "freeze",
  animatedImagesListings: false,
  animatedImagesChats: false,
  animatedImagesProfiles: false,
  animatedImagesChatMedia: false,

  enableLanguageFilter: false,
  allowedLanguages: [],
  languageSelectionMode: "include",
  languageFilterMode: "conservative",
  languageAutoDetectUntagged: true,
  languageShowDetectedBadge: false,

  textNormalizationEnabled: false,
  normalizeFancyUnicode: false,
  normalizePunctuation: false,
  normalizeInvisibleCharacters: false,
  normalizeDecorativeSymbols: false,

  qolInterfaceScale: 100,
  chatTextScale: 100,
  chatLineSpacing: "native",


  autoFillListings: false,
  showListingRefillButton: false,
  showListingFilterStats: false,
  showListingFilterStatsDetails: false,
  autoFillTargetCards: 50,
  autoFillMaxClicks: 8,

  trackOpenedChats: false,
  importOpenedFromChatsPage: false,
  hideOpenedChats: false,
  openedBotSortMode: "newest",

  hiddenCardMode: "hide",
  compactAfterHiding: false,

  showQuickPanel: false,
  quickPanelPlacement: "bottom-right",
  quickPanelDraggable: false,
  quickPanelDefaultClosed: false,
  quickPanelEnabledByDefaultInTab: false,
  quickPanelWidth: 280,
  quickPanelUiScale: 100,
  quickPanelMaxHeightPercent: 80,
  quickPanelAutoCollapseOverlap: false,
  quickPanelShowStatus: false,
  quickPanelStatusShowOpened: false,
  quickPanelStatusShowBlocked: false,
  popupShowOpenedCount: false,
  popupShowBlockedCount: false,
  popupShowStorageDetails: false,
  quickPanelShowFeatureSummary: false,
  quickPanelShowOptions: false,
  quickPanelShowFillNow: false,
  quickPanelShowSmartFilterPins: false,
  quickPanelShowChatSearch: false,
  quickPanelShowChatSort: false,
  quickPanelShowScanVisible: false,
  quickPanelShowLoadAll: false,
  quickPanelShowOoc: false,
  quickPanelShowAutoVoice: false,
  quickPanelShowAutoAsterisk: false,
  quickPanelShowTranslation: false,
  quickPanelShowPersona: false,
  quickPanelShowExport: false,
  quickPanelShowSoundscapes: false,
  quickPanelCustomX: 12,
  quickPanelCustomY: 12,
  quickPanelCustomXPercent: 70,
  quickPanelCustomYPercent: 12,
  showBlockCurrentBotButton: false,
  replaceCardProfileWithBlockButton: false,
  enableBulkCardBlocking: false,
  bulkCardBlockingSidebarLauncher: false,
  quickDislikeOnBlock: false,
  quickDislikeIdleEnabled: false,
  quickDislikeIdleMinutes: 5,
  blockedBulkDislikeDelayMs: 750,

  showChatListTools: false,
  enableChatOrganizer: false,
  chatCollections: "",
  showSavedChatQuickActions: false,
  showRandomChatButton: false,
  randomChatUseLastHomeFilters: true,
  randomChatIncludeOpened: true,
  randomChatIncludeLater: true,
  randomChatIncludeFavorites: true,
  chatListSortMode: "default",
  chatListSearchMode: "all",
  chatListOpenedFilter: "all",
  chatListMessageFilter: "all",
  chatListSavedFilter: "all",
  chatListBlockedFilter: "all",
  autoLoadAllOpenedChats: false,
  deepImportMaxPages: 80,

  showChatExportButton: false,
  chatExportLoadPreviousMessages: false,
  chatExportIncludeBotInfo: false,
  chatExportIncludeOocDirectives: false,
  chatExportIncludeGenerationDetails: true,
  chatExportNumberMessages: true,
  chatExportIncludeAvatars: true,
  chatExportDefaultFormat: "text",
  chatExportHtmlLayout: "bubbles",
  showOocTools: false,
  oocTemplates: [
    { id: DEFAULT_OOC_TEMPLATE_ID, name: "Strict no-control", text: DEFAULT_OOC_TEMPLATE, builtIn: true },
    { id: HARD_OOC_TEMPLATE_ID, name: "Hard no-control + formatting", text: HARD_OOC_TEMPLATE, builtIn: true }
  ],

  enableReplyInstructions: false,
  replyInstructionText: "",
  replyInstructionSendMode: "session",
  replyInstructionOocWrapper: true,
  replyInstructionShowChatButton: true,
  replyInstructionBotOverrides: {},
  enableGlobalMemory: false,
  globalMemoryText: "",
  globalMemorySendMode: "session",
  globalMemoryOocWrapper: true,
  globalMemoryShowChatButton: true,

  autoAcceptPersonaChange: false,
  savePersonasFromPages: false,
  keepLocalPersonaCopies: false,
  expandPersonaDescriptions: false,
  enablePersonaOrganizer: false,
  personaFolders: "",
  personaShowLocalMetaInPicker: true,
  showPersonaQuickSwitch: false,
  personaQuickSwitchLimit: 6,

  hideChatPlusButton: false,
  hideChatImageButton: false,
  replaceChatImageWithOocButton: false,
  showAsteriskButton: false,
  composerShortcutPlacement: "inside-right",
  autoPairAsterisks: false,
  showFormattingToolbar: false,
  formatToolbarAsterisk: true,
  formatToolbarBold: true,
  formatToolbarBoldItalic: false,
  formatToolbarStrike: false,
  formatToolbarParens: true,
  formatToolbarQuotes: true,
  formatToolbarBackticks: false,
  formatToolbarBrackets: false,
  formatToolbarBraces: false,
  formatToolbarCustomWrappers: "",
  styleAlternateDialogue: false,
  alternateDialogueScope: "ai",
  alternateDialogueStyle: "dialogue",
  alternateDialogueCustomColors: false,
  alternateDialogueTextColor: "#f4d35e",
  alternateDialogueBackgroundColor: "#1f2430",
  alternateDialogueBorderColor: "#596273",
  enableRpFormatRepair: false,
  enableCharacterQolProfiles: false,
  rpFormatRepairAuto: true,
  rpFormatStyle: "clean",
  rpFormatDetection: "balanced",
  rpFormatConvertBoldActions: true,
  rpFormatRemoveActionParens: true,
  rpFormatPreserveInlineEmphasis: true,
  rpFormatPreserveSemanticQuotes: true,
  rpFormatPreserveBackticks: true,
  rpFormatShowMessageButtons: true,
  enableChatBackgrounds: false,
  chatBackgroundDim: 45,
  chatBackgroundBlur: 0,
  chatBackgroundFit: "cover",
  chatBackgroundPosition: "center",
  enableChatBubbleCustomization: false,
  persistSpicyChatUserAppearance: false,
  chatBubbleAiBackground: "#27282d",
  chatBubbleAiTextMode: "custom",
  chatBubbleAiText: "#f2f2f2",
  chatBubbleAiActionMode: "native",
  chatBubbleAiActionText: "#79c8f5",
  chatBubbleAiDialogueMode: "base",
  chatBubbleAiDialogueText: "#f2f2f2",
  chatBubbleAiBorder: "#555861",
  chatBubbleAiBorderWidth: 0,
  chatBubbleAiBorderStyle: "solid",
  chatBubbleAiBorderOpacity: 100,
  chatBubbleAiOpacity: 100,
  chatBubbleAiRadius: 20,
  chatBubbleAiShape: "native",
  chatBubbleAiDecorationMode: "bubble",
  chatBubbleAiDecorationColor: "#27282d",
  chatBubbleAiCatEarLayout: "auto",
  chatBubbleAiShadow: false,
  chatBubbleUserBackground: "#253f52",
  chatBubbleUserTextMode: "custom",
  chatBubbleUserText: "#f5f5f5",
  chatBubbleUserActionMode: "native",
  chatBubbleUserActionText: "#79c8f5",
  chatBubbleUserDialogueMode: "base",
  chatBubbleUserDialogueText: "#f5f5f5",
  chatBubbleUserBorder: "#52718a",
  chatBubbleUserBorderWidth: 0,
  chatBubbleUserBorderStyle: "solid",
  chatBubbleUserBorderOpacity: 100,
  chatBubbleUserOpacity: 100,
  chatBubbleUserRadius: 20,
  chatBubbleUserShape: "native",
  chatBubbleUserDecorationMode: "bubble",
  chatBubbleUserDecorationColor: "#253f52",
  chatBubbleUserCatEarLayout: "auto",
  chatBubbleUserShadow: false,
  chatBubblePreserveActionColors: true,
  hideChatVoiceButton: false,
  hideUnlockCustomVoices: false,

  showMessageQuickActions: false,
  messageQuickActionCopy: false,
  messageQuickActionEdit: false,
  messageQuickActionRemoveImage: false,
  messageQuickActionResend: false,
  messageQuickActionConfirmRemoveImage: false,
  messageQuickActionReport: false,
  allowTypingWhileAiResponding: false,
  keepChatPositionWhileTyping: false,
  showScrollToTopButton: false,
  showScrollToBottomButton: false,
  scrollNavOnHome: true,
  scrollNavOnChats: true,
  scrollNavOnChat: true,
  scrollNavOnCreation: true,
  scrollNavOnProfiles: true,
  scrollNavOnOther: true,
  scrollTopLoadPreviousMessages: false,
  scrollTopLoadPreviousMode: "all",
  scrollTopLoadPreviousTiming: "before",
  protectDraftDuringMessageRemoval: false,
  failedMessageHelper: false,
  chatPerformanceMode: false,
  runtimePerformanceMode: "adaptive",
  desktopAppPerformanceGuard: true,
  pauseQolInHiddenTabs: false,
  autoPerformanceLargeChats: false,
  largeChatPerformanceThreshold: 500,
  deferQolWhileTyping: false,
  pauseQolWhileMessageEditing: true,
  reduceQolAnimations: false,
  reduceOptionsAnimations: false,
  settingsNavigationStyle: "classic",
  settingsContentLayout: "single",
  settingsPageWidth: "comfortable",
  collapseSettingsSectionsByDefault: false,
  enableCommandPalette: false,
  commandPaletteShortcut: "ctrl-k",
  commandPaletteShowSavedItems: true,
  deepSleepDisabledFeatures: true,
  performanceDiagnostics: false,
  enableLocalChangeHistory: false,
  showUpdateNotifications: false,

  androidAppControlsMode: "auto",
  androidTopBarMenu: false,
  androidHideComposerShortcuts: true,
  androidTopBarOoc: true,
  androidTopBarAsterisk: true,
  androidTopBarFormatting: true,
  androidTopBarTranslation: false,
  androidTopBarScroll: true,
  androidTopBarPersona: true,
  androidTopBarModel: true,

  hideSidebarLogo: false,
  hideSidebarHome: false,
  hideSidebarChats: false,
  hideSidebarPersonas: false,
  hideSidebarCreateMenu: false,
  hideSidebarCreateChatbot: false,
  hideSidebarCreateLorebook: false,
  hideSidebarCreateGroup: false,
  hideSidebarCreateVoice: false,
  hideSidebarMyCreationsMenu: false,
  hideSidebarMyChatbots: false,
  hideSidebarMyLorebooks: false,
  hideSidebarMyGroups: false,
  hideSidebarMyVoices: false,
  hideSidebarFavorites: false,
  hideSidebarRecommendations: false,
  hideSidebarLeaderboard: false,
  hideSidebarBlockedCreators: false,
  hideSidebarSubscribe: false,
  hideSidebarHelp: false,
  hideSidebarSocialLinks: false,
  hideSidebarSocialDiscord: false,
  hideSidebarSocialX: false,
  hideSidebarSocialReddit: false,
  hideSidebarFooterLinks: false,
  hideSidebarFooterTerms: false,
  hideSidebarFooterPrivacy: false,
  hideSidebarFooterRefunds: false,
  hideSidebarFooterReporting: false,
  hideSidebarFooterGuidelines: false,
  hideSidebarFooterSupport: false,
  hideSidebarFooterAffiliates: false,
  hideSidebarAppDownload: false,
  hideSidebarAppDownloadGooglePlay: false,
  hideSidebarAppDownloadAppStore: false,
  hideSidebarAppDownloadGeneric: false,
  hideSidebarWebVersion: false,
  hideSidebarSignOut: false,
  enableMainFooterManagement: false,
  hideMainFooterEntirely: false,
  hideMainFooterCompany: false,
  hideMainFooterResources: false,
  hideMainFooterCommunity: false,
  hideMainFooterJoinUs: false,
  hideMainFooterAppDownload: false,
  hideMainFooter2257: false,

  debug: false
};

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
let botAvailabilityScanRunning = false;
let botAvailabilityStopRequested = false;
let blockedBotNameRepairRunning = false;
let blockedBotNameRepairStopRequested = false;
let blockedBulkDislikeRunning = false;
let blockedBulkDislikeStopRequested = false;
let activeBlockedBulkDislikeRunId = "";
let quickDislikeHistoryState = { version: 1, bots: {} };
let quickDislikeBulkState = { version: 1, status: "idle", pendingIds: [], failedIds: [], startedAt: 0, updatedAt: 0, currentId: "", lastMode: "remaining" };
let chatBackgroundMediaState = { global: null, chats: {} };

let soundscapeSceneState = { version: 1, activeId: "", scenes: [] };
let soundscapeAudioState = { version: 1, items: [] };
let soundscapeScenePersistTimer = 0;
let tabCleanupTopicState = { version: 1, topics: [] };
let activeTabCleanupSessionId = "";
let tabCleanupSessionSelection = new Set();

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
let blockingDataLoadPromise = null;
let savedListsDataLoadPromise = null;
let loadedSettingsSnapshot = { ...DEFAULT_SETTINGS };

const BLOCKING_DATA_KEYS = [BLOCKED_BOTS_KEY, NOT_INTERESTED_KEY, QUICK_DISLIKE_HISTORY_KEY, QUICK_DISLIKE_BULK_STATE_KEY];
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
  BOT_AVAILABILITY_KEY,
  BOT_ARCHIVE_KEY
];

function nextUiFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function nextOptionsIdleSlice(timeout = 220) {
  OPTIONS_PERFORMANCE.heavyManagerIdleSlices += 1;
  if (typeof requestIdleCallback === "function") {
    return new Promise(resolve => requestIdleCallback(() => resolve(), { timeout }));
  }
  return nextUiFrame();
}

function debounceCallback(callback, delay = 140) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

function activeOptionsTab() {
  return document.querySelector(".tab-button.active")?.dataset.tab || "general";
}

const SETTINGS_SECTION_COLLAPSE_EXCLUDED_TABS = new Set(["features", "changelog", "help"]);
const SETTINGS_PINNED_SECTIONS_KEY = "dsSettingsPinnedSectionsV1";
const SETTINGS_RECENT_SECTIONS_KEY = "dsSettingsRecentSectionsV1";
const SETTINGS_ENABLED_ONLY_KEY = "dsSettingsEnabledOnlyV1";
let settingsSectionDefaultsApplied = false;
let settingsShowEnabledOnly = false;

function readLocalJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function cleanSettingsSectionLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function settingsCardInfo(card) {
  if (!card) return null;
  const page = card.closest?.(".tab-page");
  const tabName = String(page?.dataset?.page || "");
  if (!tabName) return null;
  const heading = cleanSettingsSectionLabel(
    card.querySelector(":scope > h2 .settings-card-toggle")?.textContent ||
    card.querySelector(":scope > h2")?.textContent ||
    "Settings"
  );
  const key = card.id ? `id:${card.id}` : `tab:${tabName}:${heading.toLowerCase()}`;
  const tabButton = document.querySelector(`.tab-button[data-tab="${CSS.escape(tabName)}"]`);
  const tabLabel = cleanSettingsSectionLabel(tabButton?.textContent || tabName);
  return { key, tabName, tabLabel, heading };
}

function settingsCardByKey(key) {
  const wanted = String(key || "");
  if (!wanted) return null;
  for (const card of document.querySelectorAll(".tab-page > section.card.ds-settings-card-collapsible")) {
    if (settingsCardInfo(card)?.key === wanted) return card;
  }
  return null;
}

function pinnedSettingsSections() {
  const list = readLocalJson(SETTINGS_PINNED_SECTIONS_KEY, []);
  return Array.isArray(list) ? [...new Set(list.map(String).filter(Boolean))].slice(0, 30) : [];
}

function recentSettingsSections() {
  const list = readLocalJson(SETTINGS_RECENT_SECTIONS_KEY, []);
  return Array.isArray(list) ? [...new Set(list.map(String).filter(Boolean))].slice(0, 8) : [];
}

function refreshSettingsSectionShortcuts() {
  const pinnedSelect = $("settingsPinnedSections");
  const recentSelect = $("settingsRecentSections");
  const pinned = pinnedSettingsSections();
  const recent = recentSettingsSections();

  const fill = (select, keys, placeholder) => {
    if (!select) return;
    const previous = select.value;
    select.replaceChildren(new Option(placeholder, ""));
    for (const key of keys) {
      const card = settingsCardByKey(key);
      const info = settingsCardInfo(card);
      if (!card || !info) continue;
      select.appendChild(new Option(`${info.tabLabel} · ${info.heading}`, key));
    }
    select.value = [...select.options].some(option => option.value === previous) ? previous : "";
  };

  fill(pinnedSelect, pinned, pinned.length ? "Pinned sections…" : "No pinned sections");
  fill(recentSelect, recent, recent.length ? "Recent sections…" : "No recent sections");

  document.querySelectorAll(".settings-card-pin").forEach(button => {
    const card = button.closest("section.card");
    const key = settingsCardInfo(card)?.key || "";
    const active = pinned.includes(key);
    button.classList.toggle("is-pinned", active);
    button.textContent = active ? "★" : "☆";
    button.setAttribute("aria-label", active ? "Unpin this Settings section" : "Pin this Settings section");
    button.title = active ? "Unpin this Settings section" : "Pin this Settings section";
  });
}

function applyPinnedSettingsSectionOrder() {
  const pins = pinnedSettingsSections();
  const pinRank = new Map(pins.map((key, index) => [key, index]));
  document.querySelectorAll(".tab-page").forEach(page => {
    const cards = [...page.querySelectorAll(":scope > section.card.ds-settings-card-collapsible")];
    if (cards.length < 2) return;
    cards.forEach((card, index) => {
      if (!card.dataset.dsSettingsOriginalOrder) card.dataset.dsSettingsOriginalOrder = String(index + 1);
    });
    cards.sort((a, b) => {
      const aKey = settingsCardInfo(a)?.key || "";
      const bKey = settingsCardInfo(b)?.key || "";
      const aPinned = pinRank.has(aKey);
      const bPinned = pinRank.has(bKey);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (aPinned && bPinned) return (pinRank.get(aKey) || 0) - (pinRank.get(bKey) || 0);
      return Number(a.dataset.dsSettingsOriginalOrder || 0) - Number(b.dataset.dsSettingsOriginalOrder || 0);
    });
    cards.forEach(card => page.appendChild(card));
  });
}

function recordRecentSettingsCard(card) {
  const info = settingsCardInfo(card);
  if (!info) return;
  const next = [info.key, ...recentSettingsSections().filter(key => key !== info.key)].slice(0, 8);
  writeLocalJson(SETTINGS_RECENT_SECTIONS_KEY, next);
  refreshSettingsSectionShortcuts();
}

function navigateToSettingsCard(card) {
  const info = settingsCardInfo(card);
  if (!card || !info) return;
  setActiveTab(info.tabName);
  setSettingsCardCollapsed(card, false);
  recordRecentSettingsCard(card);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.classList.add("ds-search-target");
    setTimeout(() => card.classList.remove("ds-search-target"), 1800);
  }));
}

function settingValueFromControl(key, card) {
  const direct = card.querySelector(`#${CSS.escape(key)}`);
  if (direct) {
    if (direct.type === "checkbox") return !!direct.checked;
    if (direct.type === "radio") return direct.checked ? direct.value : undefined;
    return direct.value;
  }
  const selectedRadio = card.querySelector(`input[type="radio"][name="${CSS.escape(key)}"]:checked`);
  if (selectedRadio) return selectedRadio.value;
  return undefined;
}

function settingValueDiffers(current, expected) {
  if (Array.isArray(expected)) {
    const currentList = Array.isArray(current)
      ? current
      : String(current || "").split(/[\n,]+/g).map(item => item.trim()).filter(Boolean);
    return JSON.stringify(currentList) !== JSON.stringify(expected);
  }
  if (typeof expected === "boolean") return !!current !== expected;
  if (typeof expected === "number") return Number(current) !== expected;
  return String(current ?? "") !== String(expected ?? "");
}

function settingsCardHasEnabledFeature(card) {
  const info = settingsCardInfo(card);
  if (!info) return true;
  if (info.key === "id:settingsLayoutCard") return true;
  if (pinnedSettingsSections().includes(info.key)) return true;

  const keys = Object.keys(DEFAULT_SETTINGS).filter(key => {
    try {
      return !!card.querySelector(`#${CSS.escape(key)}, input[type="radio"][name="${CSS.escape(key)}"]`);
    } catch {
      return false;
    }
  });
  if (!keys.length) return true;

  const optInBooleans = keys.filter(key => DEFAULT_SETTINGS[key] === false);
  if (optInBooleans.some(key => settingValueFromControl(key, card) === true)) return true;

  // A few core features ship enabled. If the first checkbox in a section is an
  // enabled-by-default master switch, treat the section as enabled instead of
  // hiding it just because one of its optional child checkboxes defaults off.
  const firstCheckbox = card.querySelector("input[type='checkbox'][id]");
  if (firstCheckbox?.id in DEFAULT_SETTINGS && DEFAULT_SETTINGS[firstCheckbox.id] === true && firstCheckbox.checked) return true;

  // Cards with no opt-in switch (for example layout/default selectors) count as
  // active when one of their values differs from the shipped default.
  if (!optInBooleans.length) {
    return keys.some(key => settingValueDiffers(settingValueFromControl(key, card), DEFAULT_SETTINGS[key]));
  }

  // A changed non-boolean preference can still be meaningful even if its
  // parent toggle lives elsewhere in the same section.
  return keys.some(key => typeof DEFAULT_SETTINGS[key] !== "boolean" && settingValueDiffers(settingValueFromControl(key, card), DEFAULT_SETTINGS[key]));
}

function applySettingsEnabledOnlyFilter() {
  document.querySelectorAll(".tab-page > section.card.ds-settings-card-collapsible").forEach(card => {
    const hide = settingsShowEnabledOnly && !settingsCardHasEnabledFeature(card);
    card.classList.toggle("ds-settings-filtered-out", hide);
  });
  const button = $("settingsShowEnabledOnly");
  if (button) {
    button.classList.toggle("active", settingsShowEnabledOnly);
    button.textContent = settingsShowEnabledOnly ? "Show all sections" : "Show enabled only";
    button.setAttribute("aria-pressed", settingsShowEnabledOnly ? "true" : "false");
  }
}

function resetSettingsSection(card) {
  const info = settingsCardInfo(card);
  if (!card || !info) return;
  if (!confirm(`Reset “${info.heading}” to its default settings? Nothing is saved until you press Save settings.`)) return;

  let changed = 0;
  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    let handled = false;
    let control = null;
    try { control = card.querySelector(`#${CSS.escape(key)}`); } catch {}
    if (control) {
      if (control.type === "checkbox") control.checked = !!defaultValue;
      else if (control.type === "radio") control.checked = String(control.value) === String(defaultValue);
      else if (Array.isArray(defaultValue)) control.value = defaultValue.join("\n");
      else control.value = String(defaultValue ?? "");
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      handled = true;
    }
    const radios = [...card.querySelectorAll(`input[type="radio"][name="${CSS.escape(key)}"]`)];
    if (radios.length) {
      radios.forEach(radio => { radio.checked = String(radio.value) === String(defaultValue); });
      radios.find(radio => radio.checked)?.dispatchEvent(new Event("change", { bubbles: true }));
      handled = true;
    }
    if (handled) changed += 1;
  }

  updateSettingDependencies?.();
  applySettingsEnabledOnlyFilter();
  showSettingsToast(changed
    ? `Reset ${info.heading}. Press Save settings to apply it.`
    : `There are no normal Settings values to reset in ${info.heading}.`);
}

function setupSettingsSectionNavigation() {
  settingsShowEnabledOnly = sessionStorage.getItem(SETTINGS_ENABLED_ONLY_KEY) === "1";

  const goFromSelect = event => {
    const key = event.target.value;
    if (!key) return;
    const card = settingsCardByKey(key);
    event.target.value = "";
    if (card) navigateToSettingsCard(card);
  };
  $("settingsPinnedSections")?.addEventListener("change", goFromSelect);
  $("settingsRecentSections")?.addEventListener("change", goFromSelect);
  $("settingsShowEnabledOnly")?.addEventListener("click", () => {
    settingsShowEnabledOnly = !settingsShowEnabledOnly;
    sessionStorage.setItem(SETTINGS_ENABLED_ONLY_KEY, settingsShowEnabledOnly ? "1" : "0");
    applySettingsEnabledOnlyFilter();
  });

  document.addEventListener("change", event => {
    const card = event.target?.closest?.("section.card.ds-settings-card-collapsible");
    if (card) {
      recordRecentSettingsCard(card);
      if (settingsShowEnabledOnly) applySettingsEnabledOnlyFilter();
    }
  }, true);

  applyPinnedSettingsSectionOrder();
  refreshSettingsSectionShortcuts();
  applySettingsEnabledOnlyFilter();
}

function setSettingsCardCollapsed(card, collapsed) {
  if (!card?.classList?.contains("ds-settings-card-collapsible")) return;
  const body = card.querySelector(":scope > .settings-card-body");
  const toggle = card.querySelector(":scope > h2 .settings-card-toggle");
  if (!body || !toggle) return;
  const next = !!collapsed;
  card.classList.toggle("ds-settings-card-collapsed", next);
  body.hidden = next;
  toggle.setAttribute("aria-expanded", next ? "false" : "true");
}

function setSettingsTabCollapsed(tabName, collapsed) {
  if (SETTINGS_SECTION_COLLAPSE_EXCLUDED_TABS.has(String(tabName || ""))) return;
  const page = document.querySelector(`.tab-page[data-page="${CSS.escape(String(tabName || ""))}"]`);
  page?.querySelectorAll(":scope > section.card.ds-settings-card-collapsible").forEach(card => {
    setSettingsCardCollapsed(card, collapsed);
  });
}

function setAllSettingsSectionsCollapsed(collapsed) {
  document.querySelectorAll(".tab-page").forEach(page => {
    setSettingsTabCollapsed(page.dataset.page || "", collapsed);
  });
}

function expandSettingsCardForTarget(target) {
  const card = target?.closest?.("section.card.ds-settings-card-collapsible");
  if (card) setSettingsCardCollapsed(card, false);
}

function setupCollapsibleSettingsCards() {
  document.querySelectorAll(".tab-page").forEach(page => {
    const tabName = String(page.dataset.page || "");
    if (SETTINGS_SECTION_COLLAPSE_EXCLUDED_TABS.has(tabName)) return;

    page.querySelectorAll(":scope > section.card").forEach((card, index) => {
      if (card.classList.contains("ds-settings-card-collapsible")) return;
      const heading = card.querySelector(":scope > h2");
      if (!heading) return;

      const body = document.createElement("div");
      body.className = "settings-card-body";
      while (heading.nextSibling) body.appendChild(heading.nextSibling);
      card.appendChild(body);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "settings-card-toggle";
      while (heading.firstChild) toggle.appendChild(heading.firstChild);

      const bodyId = card.id ? `${card.id}-body` : `settings-card-${tabName}-${index}-body`;
      body.id = bodyId;
      toggle.setAttribute("aria-controls", bodyId);
      toggle.setAttribute("aria-expanded", "true");
      toggle.title = "Open or close this Settings section";
      toggle.addEventListener("click", () => {
        setSettingsCardCollapsed(card, !card.classList.contains("ds-settings-card-collapsed"));
        recordRecentSettingsCard(card);
      });

      const tools = document.createElement("span");
      tools.className = "settings-card-heading-tools";
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "settings-card-pin";
      pin.textContent = "☆";
      pin.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const key = settingsCardInfo(card)?.key || "";
        if (!key) return;
        const pins = pinnedSettingsSections();
        const next = pins.includes(key) ? pins.filter(item => item !== key) : [...pins, key];
        writeLocalJson(SETTINGS_PINNED_SECTIONS_KEY, next);
        applyPinnedSettingsSectionOrder();
        refreshSettingsSectionShortcuts();
        applySettingsEnabledOnlyFilter();
      });
      tools.appendChild(pin);

      const canReset = Object.keys(DEFAULT_SETTINGS).some(key => {
        try { return !!card.querySelector(`#${CSS.escape(key)}, input[type="radio"][name="${CSS.escape(key)}"]`); }
        catch { return false; }
      });
      if (canReset) {
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "settings-card-reset";
        reset.textContent = "Reset";
        reset.title = "Reset this section to its default settings";
        reset.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          resetSettingsSection(card);
        });
        tools.appendChild(reset);
      }

      heading.append(toggle, tools);
      card.classList.add("ds-settings-card-collapsible");
    });
  });
}

function applySettingsSectionDefault(settings = {}) {
  if (settingsSectionDefaultsApplied) return;
  settingsSectionDefaultsApplied = true;
  if (!settings.collapseSettingsSectionsByDefault) return;
  setAllSettingsSectionsCollapsed(true);
}

function invalidateHeavyTab(tabName) {
  if (tabName) renderedHeavyTabs.delete(tabName);
}

function invalidateDuplicateCache() {
  botDuplicateMatchesCache = new Map();
  botDuplicateCacheScope = "";
  botDuplicateCacheReady = false;
}

function refreshStorageUsageIfVisible() {
  if (activeOptionsTab() === "data") refreshStorageUsage().catch(() => {});
}

function markSavedStoreDirty(kind) {
  if (!kind) return;
  dirtySavedStores.add(kind);
  if (["blocked", "notInterested"].includes(kind)) {
    invalidateHeavyTab("blocking");
    invalidateHeavyTab("saved");
  } else invalidateHeavyTab("saved");
}

const botManagerUiState = {
  blocked: {
    query: "",
    visible: 20,
    collapsed: true
  },
  notInterested: {
    query: "",
    visible: 20,
    collapsed: true
  },
  later: {
    query: "",
    visible: 20,
    collapsed: true
  },
  favorite: {
    query: "",
    visible: 20,
    collapsed: true
  },
  opened: {
    query: "",
    visible: 20,
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
  visible: 20,
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

function storageGetChecked(keys) {
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  return new Promise(resolve => {
    const finish = value => { const elapsed = optionsPerfFinish("read", started); recordSlowStorageRead(keys, elapsed); resolve(value); };
    try {
      chrome.storage.local.get(keys, result => {
        if (chrome.runtime.lastError) {
          finish({ ok: false, data: {}, error: chrome.runtime.lastError.message || "Browser storage read failed" });
          return;
        }
        finish({ ok: true, data: result || {}, error: "" });
      });
    } catch (error) {
      finish({ ok: false, data: {}, error: error?.message || String(error || "Browser storage read failed") });
    }
  });
}

async function storageGet(keys) {
  const result = await storageGetChecked(keys);
  return result.data;
}

function storageSet(obj) {
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  return new Promise(resolve => {
    const finish = value => { optionsPerfFinish("write", started); resolve(value); };
    try {
      chrome.storage.local.set(obj, () => finish(!chrome.runtime.lastError));
    } catch { finish(false); }
  });
}

function storageRemove(keys) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.remove(keys, () => resolve(!chrome.runtime.lastError));
    } catch { resolve(false); }
  });
}

function storageValueMatches(actual, expected) {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
    return actual.every((value, index) => storageValueMatches(value, expected[index]));
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const actualKeys = Object.keys(actual).filter(key => actual[key] !== undefined).sort();
    const expectedKeys = Object.keys(expected).filter(key => expected[key] !== undefined).sort();
    if (actualKeys.length !== expectedKeys.length) return false;
    return actualKeys.every((key, index) =>
      key === expectedKeys[index] && storageValueMatches(actual[key], expected[key])
    );
  }
  return false;
}

async function storageSetVerified(obj) {
  const payload = obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  const keys = Object.keys(payload);
  if (!keys.length) return true;
  if (!await storageSet(payload)) return false;
  const readback = await storageGetChecked(keys);
  if (!readback.ok) return false;
  return keys.every(key =>
    Object.prototype.hasOwnProperty.call(readback.data, key) &&
    storageValueMatches(readback.data[key], payload[key])
  );
}

async function storageRemoveVerified(keys) {
  const list = [...new Set((Array.isArray(keys) ? keys : [keys]).map(key => String(key || "").trim()).filter(Boolean))];
  if (!list.length) return true;
  if (!await storageRemove(list)) return false;
  const readback = await storageGetChecked(list);
  if (!readback.ok) return false;
  return list.every(key => !Object.prototype.hasOwnProperty.call(readback.data, key));
}

function runtimeMessage(message) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}


const DEEPL_ORIGINS = ["https://api-free.deepl.com/*", "https://api.deepl.com/*"];

function permissionRequest(permission) {
  return new Promise(resolve => {
    try { chrome.permissions.request(permission, result => resolve(!!result && !chrome.runtime.lastError)); }
    catch { resolve(false); }
  });
}

function ensureDeepLPermission() {
  // permissions.request must start directly from the button click. Calling it
  // immediately also succeeds without a prompt when permission is already granted.
  return permissionRequest({ origins: DEEPL_ORIGINS });
}


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
  cardTokenShowGreeting: { version: "0.1.8.97", label: "New" },
  cardTokenShowPersonality: { version: "0.1.8.97", label: "New" },
  cardTokenShowScenario: { version: "0.1.8.97", label: "New" },
  cardTokenShowExamples: { version: "0.1.8.97", label: "New" },
  lorebookBulkKeywordPaste: { version: "0.1.8.93", label: "New" },
  lorebookExpandEntryEditor: { version: "0.1.8.93", label: "New" },
  lorebookExpandTags: { version: "0.1.9.25", label: "New" },
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
  blockedBulkDislikeDelayMs: { version: "0.1.9.92", label: "Updated" },
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
  { selector: "#botAvailabilityCard h2", version: "0.1.9.89", label: "Updated" },
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
  "enableSmartFilterPresets",
  "enableCreationAudit",
  "enableMyCreationsFilters",
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
  "chatPerformanceMode",
  "desktopAppPerformanceGuard",
  "pauseQolInHiddenTabs",
  "performanceDiagnostics",
  "enableLocalChangeHistory",
  "showUpdateNotifications",
  "androidTopBarMenu",
  "hideSidebarLogo",
  "hideSidebarHome",
  "hideSidebarChats",
  "hideSidebarPersonas",
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

function storageBytesInUse(keys = null) {
  return new Promise(resolve => {
    try {
      if (typeof chrome.storage.local.getBytesInUse !== "function") {
        resolve(null);
        return;
      }
      chrome.storage.local.getBytesInUse(keys, bytes => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(Number(bytes) || 0);
      });
    } catch {
      resolve(null);
    }
  });
}

function compareVersions(a, b) {
  const left = String(a || "0").split(".").map(x => Number(x) || 0);
  const right = String(b || "0").split(".").map(x => Number(x) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function displayReleaseVersion(value) {
  const raw = String(value || "").trim();
  if (!raw) return raw;

  // Chrome/Firefox update ordering must stay above the old 0.1.9.641 store
  // build, so technical manifests continue at 0.1.9.700+. Keep the UI on
  // the human release sequence: 0.1.9.700 -> 0.1.9.70, .701 -> .71, etc.
  const parts = raw.split(".");
  if (parts.length === 4 && parts[0] === "0" && parts[1] === "1" && parts[2] === "9") {
    const technical = Number(parts[3]);
    if (Number.isInteger(technical) && technical >= 700) {
      return `0.1.9.${technical - 630}`;
    }
  }

  const manifest = chrome.runtime.getManifest?.() || {};
  if (raw === String(manifest.version || "") && manifest.version_name) {
    return String(manifest.version_name);
  }
  return raw;
}

function showSettingsToast(message, undoAction = null) {
  const toast = $("settingsToast");
  const text = $("settingsToastText");
  const undo = $("settingsToastUndo");
  if (!toast || !text || !undo) return;

  clearTimeout(settingsToastTimer);
  settingsUndoAction = typeof undoAction === "function" ? undoAction : null;
  text.textContent = String(message || "Done.");
  undo.hidden = !settingsUndoAction;
  toast.hidden = false;

  settingsToastTimer = setTimeout(() => {
    toast.hidden = true;
    settingsUndoAction = null;
  }, settingsUndoAction ? 8000 : 3200);
}

function cloneJson(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

function setupSettingsToast() {
  $("settingsToastUndo")?.addEventListener("click", async () => {
    const action = settingsUndoAction;
    settingsUndoAction = null;
    if (!action) return;
    try {
      await action();
      showSettingsToast("Undone.");
    } catch {
      showSettingsToast("Undo failed.");
    }
  });
}

function formatAutoAfkStatus(summary) {
  if (!summary || typeof summary !== "object") {
    return "No cleanup check recorded yet.";
  }

  const when = Number(summary.at)
    ? new Date(Number(summary.at)).toLocaleString()
    : "unknown time";

  if (!summary.enabled) {
    return `Last check ${when}: Auto-AFK was disabled.`;
  }

  const actionWord = summary.action === "close" ? "closed" : "unloaded";
  const parts = [
    `Last check ${when}: ${Number(summary.monitored || 0)} monitored`,
    `${Number(summary.protected || 0)} protected`,
    `${Number(summary.recent || 0)} still active`,
    `${Number(summary.eligible || 0)} eligible`,
    `${Number(summary.cleaned || 0)} ${actionWord}`
  ];

  if (Number(summary.alreadyDiscarded || 0) > 0) {
    parts.push(`${Number(summary.alreadyDiscarded)} already unloaded`);
  }

  if (Number(summary.failed || 0) > 0) {
    parts.push(`${Number(summary.failed)} failed`);
  }

  if (Number(summary.nextDueAt) > Date.now()) {
    parts.push(`next eligible around ${new Date(Number(summary.nextDueAt)).toLocaleString()}`);
  }

  if (Array.isArray(summary.errors) && summary.errors[0]) {
    parts.push(`browser error: ${summary.errors[0]}`);
  }

  return `${parts.join("; ")}.`;
}

function renderAutoAfkStatus(summary) {
  const el = $("autoAfkStatus");
  if (el) el.textContent = formatAutoAfkStatus(summary);
}

async function runAutoAfkCheckNow() {
  const button = $("autoAfkCheckNow");
  if (button) button.disabled = true;

  try {
    // Save the controls first so the check uses exactly what is visible here.
    await storageSet({ settings: readSettingsFromPage() });
    const response = await runtimeMessage({ type: "DS_AUTO_AFK_RUN_NOW" });

    if (response?.ok) {
      renderAutoAfkStatus(response.summary);
    } else {
      renderAutoAfkStatus({
        at: Date.now(),
        enabled: true,
        monitored: 0,
        protected: 0,
        recent: 0,
        eligible: 0,
        cleaned: 0,
        failed: 1,
        errors: [response?.error || "Could not contact the extension background worker"]
      });
    }
  } finally {
    if (button) button.disabled = false;
  }
}


function formatDuplicateTabStatus(summary) {
  if (!summary || typeof summary !== "object") return "No duplicate-tab check recorded yet.";

  const when = Number(summary.at)
    ? new Date(Number(summary.at)).toLocaleString()
    : "unknown time";

  if (!summary.enabled) return `Last check ${when}: duplicate tab guard was disabled.`;

  const parts = [
    `Last check ${when}: ${Number(summary.checked || 0)} matching SpicyChat tabs checked`,
    `${Number(summary.groups || 0)} duplicate groups`,
    `${Number(summary.duplicates || 0)} extra tabs found`,
    `${Number(summary.closed || 0)} closed`
  ];

  if (Number(summary.protected || 0) > 0) parts.push(`${Number(summary.protected)} pinned/protected`);
  if (Number(summary.focusedExisting || 0) > 0) parts.push("returned to the existing tab");
  if (Number(summary.failed || 0) > 0) parts.push(`${Number(summary.failed)} failed`);
  if (Array.isArray(summary.errors) && summary.errors[0]) parts.push(`browser error: ${summary.errors[0]}`);
  parts.push(summary.keepMode === "existing" ? "kept already-open tabs" : "kept newly opened tabs when known");

  return `${parts.join("; ")}.`;
}

function renderDuplicateTabStatus(summary) {
  const el = $("duplicateTabStatus");
  if (el) el.textContent = formatDuplicateTabStatus(summary);
}

async function runDuplicateTabCheckNow() {
  const button = $("duplicateTabCheckNow");
  if (button) button.disabled = true;

  try {
    await storageSet({ settings: readSettingsFromPage() });
    const response = await runtimeMessage({ type: "DS_DUPLICATE_TABS_RUN_NOW" });
    if (response?.ok) {
      renderDuplicateTabStatus(response.summary);
    } else {
      renderDuplicateTabStatus({
        at: Date.now(),
        enabled: true,
        checked: 0,
        groups: 0,
        duplicates: 0,
        closed: 0,
        failed: 1,
        errors: [response?.error || "Could not contact the extension background worker"]
      });
    }
  } finally {
    if (button) button.disabled = false;
  }
}


const TAB_CLEANUP_ENRICHMENT_KEY = "tabCleanupEnrichment";
const TAB_CLEANUP_SESSIONS_KEY = "tabCleanupSessions";
const TAB_CLEANUP_ENRICH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let lastTabCleanupDiagnostic = null;
let tabCleanupEnrichState = {
  running: false,
  paused: false,
  cancelled: false,
  completed: 0,
  total: 0
};

const TAB_CLEANUP_STOPWORDS = new Set([
  "about", "after", "again", "against", "almost", "also", "always", "among", "another", "around", "because", "been", "before", "being", "between", "both", "but", "came", "can", "could", "does", "doing", "dont", "from", "gets", "getting", "have", "having", "here", "hers", "him", "himself", "into", "just", "like", "looks", "make", "more", "most", "much", "need", "needs", "never", "only", "other", "our", "over", "really", "same", "she", "should", "some", "someone", "something", "still", "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "too", "under", "very", "want", "wants", "was", "were", "what", "when", "where", "which", "while", "who", "with", "would", "you", "your", "yours", "chat", "chatbot", "spicychat", "character", "characters", "scenario", "thank", "thanks"
]);

function tabCleanupSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function tabCleanupWords(value) {
  const text = String(value || "").toLowerCase().replace(/[’']/g, "");
  let words = [];
  try { words = text.match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) || []; }
  catch { words = text.match(/[a-z0-9][a-z0-9_-]{2,}/g) || []; }
  return words
    .map(word => word.replace(/^[-_]+|[-_]+$/g, ""))
    .filter(word => word.length >= 4 && word.length <= 32 && !TAB_CLEANUP_STOPWORDS.has(word) && !/^\d+$/.test(word));
}

function tabCleanupIncrement(map, value, botId = "") {
  const key = String(value || "").trim();
  if (!key) return;
  const current = map.get(key) || { count: 0, botIds: new Set() };
  current.count += 1;
  if (botId) current.botIds.add(String(botId));
  map.set(key, current);
}

function tabCleanupLastAccessed(bot) {
  return Math.max(0, ...(Array.isArray(bot?.tabs) ? bot.tabs : []).map(tab => Number(tab?.lastAccessed) || 0));
}

function tabCleanupIdentityNeedsReview(bot) {
  const id = String(bot?.id || "").toLowerCase();
  const name = String(bot?.identity?.bestName || "").trim();
  if (!name) return true;
  if (name.toLowerCase() === id || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(name)) return true;
  if (/^(for you|spicychat|chatbot|character)$/i.test(name)) return true;
  if (name.length > 120) return true;
  return false;
}

function buildTabCleanupAnalysis(report) {
  const bots = Array.isArray(report?.bots) ? report.bots : [];
  const tagCounts = new Map();
  const folderCounts = new Map();
  const personalTagCounts = new Map();
  const creatorCounts = new Map();
  const keywordCounts = new Map();

  for (const bot of bots) {
    const botId = String(bot?.id || "");
    const seenKeywords = new Set();
    for (const tag of bot.tags || []) tabCleanupIncrement(tagCounts, tag, botId);
    for (const folder of bot.local?.folders || []) tabCleanupIncrement(folderCounts, folder, botId);
    for (const tag of bot.local?.personalTags || []) tabCleanupIncrement(personalTagCounts, tag, botId);
    if (bot.identity?.bestCreator) tabCleanupIncrement(creatorCounts, bot.identity.bestCreator, botId);

    const text = `${bot.identity?.bestName || ""}\n${bot.identity?.description || ""}`;
    for (const word of tabCleanupWords(text)) seenKeywords.add(word);
    for (const word of seenKeywords) tabCleanupIncrement(keywordCounts, word, botId);
  }

  const suggestions = [];
  const addMap = (map, type, minimum, confidenceForCount, limit = 16) => {
    [...map.entries()]
      .filter(([, meta]) => Number(meta?.count || 0) >= minimum)
      .sort((a, b) => Number(b[1]?.count || 0) - Number(a[1]?.count || 0) || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .forEach(([label, meta]) => {
        const count = Number(meta?.count || 0);
        suggestions.push({ type, label, count, confidence: confidenceForCount(count), botIds: [...(meta?.botIds || [])] });
      });
  };

  addMap(folderCounts, "Folder", 1, () => "high", 12);
  addMap(personalTagCounts, "Personal tag", 1, () => "high", 12);
  addMap(tagCounts, "Tag", 2, count => count >= 5 ? "high" : "medium", 18);
  addMap(keywordCounts, "Keyword", 3, count => count >= 7 ? "high" : count >= 4 ? "medium" : "low", 18);
  addMap(creatorCounts, "Creator", 2, count => count >= 4 ? "medium" : "low", 12);

  const typeRank = { Folder: 5, "Personal tag": 5, Tag: 4, Keyword: 3, Creator: 2 };
  suggestions.sort((a, b) => {
    const conf = { high: 3, medium: 2, low: 1 };
    return (conf[b.confidence] - conf[a.confidence]) || (b.count - a.count) || ((typeRank[b.type] || 0) - (typeRank[a.type] || 0)) || a.label.localeCompare(b.label);
  });

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const { recentHours, recentDays, mediumDays, oldDays } = tabCleanupAgeThresholdsFromPage();
  const recentCut = recentHours * 60 * 60 * 1000;
  const utility = (id, label, test, tabMode = false) => {
    const matching = bots.filter(test);
    return {
      id,
      label,
      count: tabMode ? matching.reduce((sum, bot) => sum + (bot.tabs || []).filter(tab => tab.discarded).length, 0) : matching.reduce((sum, bot) => sum + Math.max(1, (bot.tabs || []).length), 0),
      botIds: matching.map(bot => String(bot.id || "")).filter(Boolean)
    };
  };
  const utilityGroups = [
    utility("smart:recent", `Used in last ${recentHours}h`, bot => { const at = tabCleanupLastAccessed(bot); return at > 0 && now - at <= recentCut; }),
    utility("smart:recent-days", `${recentHours}h–${recentDays}d old`, bot => { const at = tabCleanupLastAccessed(bot); const age = at > 0 ? now - at : Number.NaN; return age > recentCut && age <= recentDays * day; }),
    utility("smart:medium", `${recentDays}–${mediumDays}d old`, bot => { const at = tabCleanupLastAccessed(bot); const age = at > 0 ? now - at : Number.NaN; return age > recentDays * day && age <= mediumDays * day; }),
    utility("smart:old", `${mediumDays}–${oldDays}d old`, bot => { const at = tabCleanupLastAccessed(bot); const age = at > 0 ? now - at : Number.NaN; return age > mediumDays * day && age <= oldDays * day; }),
    utility("smart:very-old", `${oldDays}d+ old`, bot => { const at = tabCleanupLastAccessed(bot); return at > 0 && now - at > oldDays * day; }),
    utility("smart:favorite", "Favorite history", bot => bot.local?.favoriteHistory),
    utility("smart:later", "Later", bot => bot.local?.later),
    utility("smart:archive", "Local archive copy", bot => bot.local?.savedLocalCopy),
    utility("smart:multiple", "Multiple conversations", bot => (bot.tabs || []).length > 1),
    utility("smart:discarded", "Discarded/unloaded tabs", bot => (bot.tabs || []).some(tab => tab.discarded), true)
  ].filter(item => item.count > 0);

  const enrichmentStatuses = {};
  for (const bot of bots) {
    const status = String(bot.profileSignals?.enrichmentStatus || "not-checked");
    enrichmentStatuses[status] = (enrichmentStatuses[status] || 0) + 1;
  }
  const dataQuality = {
    bots: bots.length,
    names: bots.filter(bot => bot.identity?.bestName).length,
    creators: bots.filter(bot => bot.identity?.bestCreator).length,
    tags: bots.filter(bot => (bot.tags || []).length).length,
    descriptions: bots.filter(bot => bot.identity?.description).length,
    enriched: bots.filter(bot => Number(bot.identity?.enrichedAt) > 0).length,
    needsIdentity: bots.filter(tabCleanupIdentityNeedsReview).length,
    enrichmentStatuses
  };

  return {
    generatedAt: new Date().toISOString(),
    dataQuality,
    topicSuggestions: suggestions.slice(0, 30),
    utilityGroups
  };
}

function makeTabCleanupChip(item, action = null) {
  const label = item?.type ? `${item.type}: ${item.label}` : String(item?.label || "");
  const chip = makeElement("span", { className: "tab-cleanup-chip" });
  chip.append(makeElement("span", { text: label }));
  chip.append(makeElement("small", { text: `${Number(item?.count || 0)}${item?.confidence ? ` · ${item.confidence}` : ""}` }));
  if (typeof action === "function") {
    const add = makeElement("button", { text: "+ topic", attrs: { type: "button", title: "Save this suggestion as a reusable topic" } });
    add.addEventListener("click", () => action(item));
    chip.append(add);
  }
  return chip;
}

function renderTabCleanupAnalysis(report) {
  const host = $("tabCleanupAnalysisPreview");
  const summary = $("tabCleanupAnalysisSummary");
  const topics = $("tabCleanupTopicSuggestions");
  const utility = $("tabCleanupUtilityGroups");
  if (!host || !summary || !topics || !utility) return;
  if (!report) {
    host.hidden = true;
    topics.replaceChildren();
    utility.replaceChildren();
    return;
  }

  const analysis = report.analysis || buildTabCleanupAnalysis(report);
  report.analysis = analysis;
  const quality = analysis.dataQuality || {};
  host.hidden = false;
  const statuses = quality.enrichmentStatuses || {};
  const coverageSignal = Math.max(
    Number(quality.descriptions || 0) / Math.max(1, Number(quality.bots || 0)),
    Number(quality.tags || 0) / Math.max(1, Number(quality.bots || 0)),
    Number(quality.creators || 0) / Math.max(1, Number(quality.bots || 0))
  );
  const qualityLabel = coverageSignal >= 0.6 ? "good" : (coverageSignal >= 0.2 ? "partial" : "poor");
  summary.textContent = `Metadata quality: ${qualityLabel}. Coverage: ${quality.names || 0}/${quality.bots || 0} names, ${quality.creators || 0} creators, ${quality.tags || 0} with tags, ${quality.descriptions || 0} descriptions. Profile analysis: ${quality.enriched || 0} rendered profiles, ${statuses["local-only"] || 0} local-only, ${statuses["no-usable-data"] || 0} no usable data, ${statuses["verification-required"] || 0} verification needed, ${statuses.unavailable || 0} unavailable, ${statuses.failed || 0} failed; ${quality.needsIdentity || 0} identities still need review. Topic suggestions are previews only and never close or move tabs.`;

  topics.replaceChildren();
  const topicTitle = makeElement("strong", { text: "Suggested topics" });
  topics.append(topicTitle);
  if (!(analysis.topicSuggestions || []).length) {
    topics.append(makeElement("span", { className: "tab-cleanup-chip", text: "No strong topic signals yet — run Analyze / enrich open bots" }));
  } else {
    for (const item of analysis.topicSuggestions || []) topics.append(makeTabCleanupChip(item, saveSuggestedTabCleanupTopic));
  }

  utility.replaceChildren();
  utility.append(makeElement("strong", { text: "Smart cleanup groups" }));
  for (const item of analysis.utilityGroups || []) utility.append(makeTabCleanupChip(item, item.id ? () => browseTabCleanupFilter(item.id) : null));
}

function renderTabCleanupDiagnostic(report, message = "") {
  const box = $("tabCleanupDiagnosticOutput");
  const status = $("tabCleanupDiagnosticStatus");
  lastTabCleanupDiagnostic = report && typeof report === "object" ? report : null;
  if (lastTabCleanupDiagnostic) lastTabCleanupDiagnostic.analysis = buildTabCleanupAnalysis(lastTabCleanupDiagnostic);
  if (box) box.value = lastTabCleanupDiagnostic ? JSON.stringify(lastTabCleanupDiagnostic, null, 2) : "";
  renderTabCleanupAnalysis(lastTabCleanupDiagnostic);
  renderTabCleanupSmartGroups();
  if (!status) return;
  if (message) {
    status.textContent = message;
    return;
  }
  if (!lastTabCleanupDiagnostic) {
    status.textContent = "Nothing collected yet.";
    return;
  }
  const summary = lastTabCleanupDiagnostic.summary || {};
  status.textContent = `${Number(summary.spicychatTabs || 0)} SpicyChat tabs; ${Number(summary.uniqueBots || 0)} unique bots; ${Number(summary.botsWithResolvedName || summary.botsWithName || 0)} resolved names; ${Number(summary.botsWithEnrichedProfile || 0)} rendered profiles; ${Number(summary.botsWithLocalProfileData || 0)} local-only; ${Number(summary.discardedTabs || 0)} discarded tabs left asleep.`;
}

async function requestTabCleanupDiagnostic() {
  await storageSet({ settings: readSettingsFromPage() });
  const response = await runtimeMessage({ type: "DS_TAB_DIAGNOSTIC_COLLECT" });
  if (!response?.ok || !response.report) throw new Error(response?.error || "Could not collect tab diagnostic");
  response.report.analysis = buildTabCleanupAnalysis(response.report);
  return response.report;
}

async function collectTabCleanupDiagnostic() {
  const button = $("collectTabCleanupDiagnostic");
  const status = $("tabCleanupDiagnosticStatus");
  if (button) button.disabled = true;
  if (status) status.textContent = "Collecting open SpicyChat tabs...";
  try {
    renderTabCleanupDiagnostic(await requestTabCleanupDiagnostic());
  } catch (error) {
    renderTabCleanupDiagnostic(null, `Could not collect tabs: ${error?.message || String(error)}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function setTabCleanupEnrichControls() {
  const progress = $("tabCleanupEnrichmentProgress");
  const run = $("enrichTabCleanupDiagnostic");
  const retry = $("retryTabCleanupEnrichment");
  const pause = $("pauseTabCleanupEnrichment");
  const cancel = $("cancelTabCleanupEnrichment");
  if (run) run.disabled = tabCleanupEnrichState.running;
  if (retry) retry.disabled = tabCleanupEnrichState.running;
  if (pause) {
    pause.disabled = !tabCleanupEnrichState.running;
    pause.textContent = tabCleanupEnrichState.paused ? "Resume" : "Pause";
  }
  if (cancel) cancel.disabled = !tabCleanupEnrichState.running;
  if (progress) {
    progress.hidden = !tabCleanupEnrichState.running && !tabCleanupEnrichState.total;
    progress.max = Math.max(1, tabCleanupEnrichState.total || 1);
    progress.value = Math.min(progress.max, tabCleanupEnrichState.completed || 0);
  }
}

async function enrichTabCleanupDiagnostic(forceMissing = false) {
  if (tabCleanupEnrichState.running) return;
  const status = $("tabCleanupDiagnosticStatus");
  tabCleanupEnrichState = { running: true, paused: false, cancelled: false, completed: 0, total: 0 };
  setTabCleanupEnrichControls();

  const counts = { fetched: 0, localOnly: 0, cached: 0, noData: 0, unavailable: 0, failed: 0 };
  let lastError = "";
  try {
    const initial = await requestTabCleanupDiagnostic();
    renderTabCleanupDiagnostic(initial, forceMissing ? "Preparing retry for unresolved profile metadata..." : "Preparing rendered-profile analysis...");
    const now = Date.now();
    const pending = (initial.bots || []).filter(bot => {
      const signals = bot.profileSignals || {};
      const state = String(signals.enrichmentStatus || "not-checked");
      const successfulAt = Number(bot.identity?.enrichedAt) || Number(signals.enrichedAt) || 0;
      if (forceMissing) return !["profile-fetched", "local-only"].includes(state);
      if (state === "local-only") return false;
      return state !== "profile-fetched" || !successfulAt || now - successfulAt > TAB_CLEANUP_ENRICH_MAX_AGE;
    });
    tabCleanupEnrichState.total = pending.length;
    setTabCleanupEnrichControls();

    if (!pending.length) {
      renderTabCleanupDiagnostic(initial, "All currently open bots already have useful rendered or local profile metadata. Analysis preview refreshed.");
      return;
    }

    outer: for (let index = 0; index < pending.length; index += 1) {
      if (tabCleanupEnrichState.cancelled) break;
      while (tabCleanupEnrichState.paused && !tabCleanupEnrichState.cancelled) {
        if (status) status.textContent = `Paused at ${tabCleanupEnrichState.completed}/${tabCleanupEnrichState.total}.`;
        await tabCleanupSleep(180);
      }
      if (tabCleanupEnrichState.cancelled) break;

      const bot = pending[index];
      const label = bot.identity?.bestName || bot.names?.[0] || bot.id;
      let response = null;
      while (!tabCleanupEnrichState.cancelled) {
        if (status) status.textContent = `${forceMissing ? "Retrying" : "Analyzing"} ${index + 1}/${pending.length}: ${label}`;
        response = await runtimeMessage({ type: "DS_TAB_DIAGNOSTIC_ENRICH_ONE", botId: bot.id, force: !!forceMissing });
        if (!response?.verificationRequired && String(response?.metadata?.status || "") !== "verification-required") break;

        tabCleanupEnrichState.paused = true;
        setTabCleanupEnrichControls();
        if (status) status.textContent = `SpicyChat verification is blocking the temporary analysis tab. Complete verification in the tab QoL opened, then press Resume. Analysis is paused at ${index + 1}/${pending.length}.`;
        while (tabCleanupEnrichState.paused && !tabCleanupEnrichState.cancelled) await tabCleanupSleep(220);
        if (tabCleanupEnrichState.cancelled) break outer;
        // Verification was completed/resumed: retry this same bot instead of skipping it.
      }
      if (tabCleanupEnrichState.cancelled) break;

      const meta = response?.metadata || {};
      const state = String(meta.status || (response?.ok ? "profile-fetched" : "failed"));
      if (response?.cached && state !== "local-only") counts.cached += 1;
      if (state === "profile-fetched") counts.fetched += response?.cached ? 0 : 1;
      else if (state === "local-only") counts.localOnly += 1;
      else if (state === "no-usable-data") counts.noData += 1;
      else if (state === "unavailable") counts.unavailable += 1;
      else counts.failed += 1;
      if (!response?.ok && response?.error) lastError = response.error;

      tabCleanupEnrichState.completed = index + 1;
      setTabCleanupEnrichControls();
      await tabCleanupSleep(650);
    }

    const report = await requestTabCleanupDiagnostic();
    const prefix = tabCleanupEnrichState.cancelled ? "Analysis cancelled" : "Analysis finished";
    const detail = `${counts.fetched} rendered profiles, ${counts.localOnly} local-only, ${counts.cached} recent cached results, ${counts.noData} no usable data, ${counts.unavailable} unavailable, ${counts.failed} failed.`;
    renderTabCleanupDiagnostic(report, `${prefix}: ${detail}${lastError && counts.failed ? ` Last error: ${lastError}` : ""}`);
  } catch (error) {
    if (status) status.textContent = `Could not analyze open bots: ${error?.message || String(error)}`;
  } finally {
    tabCleanupEnrichState.running = false;
    tabCleanupEnrichState.paused = false;
    setTabCleanupEnrichControls();
    await runtimeMessage({ type: "DS_TAB_DIAGNOSTIC_WORKER_CLOSE" });
  }
}

function toggleTabCleanupEnrichmentPause() {
  if (!tabCleanupEnrichState.running) return;
  tabCleanupEnrichState.paused = !tabCleanupEnrichState.paused;
  setTabCleanupEnrichControls();
}

function cancelTabCleanupEnrichment() {
  if (!tabCleanupEnrichState.running) return;
  tabCleanupEnrichState.cancelled = true;
  tabCleanupEnrichState.paused = false;
  setTabCleanupEnrichControls();
}

async function copyTabCleanupDiagnostic() {
  const text = $("tabCleanupDiagnosticOutput")?.value || (lastTabCleanupDiagnostic ? JSON.stringify(lastTabCleanupDiagnostic, null, 2) : "");
  const status = $("tabCleanupDiagnosticStatus");
  if (!text.trim()) {
    if (status) status.textContent = "Collect the open tabs first.";
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = "Diagnostic JSON copied.";
  } catch {
    const box = $("tabCleanupDiagnosticOutput");
    box?.focus();
    box?.select();
    if (status) status.textContent = "Clipboard access failed; the diagnostic text is selected for manual copying.";
  }
}

function downloadTabCleanupDiagnostic() {
  const report = lastTabCleanupDiagnostic;
  const status = $("tabCleanupDiagnosticStatus");
  if (!report) {
    if (status) status.textContent = "Collect the open tabs first.";
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadJsonFile(report, `spicychat-qol-open-tabs-${stamp}.json`);
  if (status) status.textContent = "Diagnostic JSON downloaded.";
}

function normalizeTabCleanupSessions(value) {
  const raw = value && typeof value === "object" ? value : {};
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.filter(item => item && typeof item === "object") : [];
  return { version: 2, sessions: sessions.slice(0, 40) };
}

function normalizeTabCleanupTopics(value) {
  const raw = value && typeof value === "object" ? value : {};
  const topics = (Array.isArray(raw.topics) ? raw.topics : []).map((topic, index) => ({
    id: String(topic?.id || `topic-${index + 1}`),
    name: String(topic?.name || `Topic ${index + 1}`).trim().slice(0, 60),
    botIds: [...new Set((Array.isArray(topic?.botIds) ? topic.botIds : []).map(id => String(id || "").trim()).filter(Boolean))]
  })).filter(topic => topic.name);
  return { version: 1, topics };
}

function tabCleanupAgeThresholdsFromPage() {
  const recentHours = Math.min(72, Math.max(1, Number(value("tabCleanupRecentHours", "24")) || 24));
  const recentDays = Math.min(30, Math.max(Math.ceil(recentHours / 24), Number(value("tabCleanupRecentDays", "3")) || 3));
  const mediumDays = Math.min(90, Math.max(recentDays + 1, Number(value("tabCleanupMediumDays", "7")) || 7));
  const oldDays = Math.min(365, Math.max(mediumDays + 1, Number(value("tabCleanupOldDays", "14")) || 14));
  return { recentHours, recentDays, mediumDays, oldDays };
}

function tabCleanupExactUrlKey(url) {
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

function tabCleanupSmartGroupsForSession(session) {
  const tabs = Array.isArray(session?.tabs) ? session.tabs : [];
  const { recentHours, recentDays, mediumDays, oldDays } = tabCleanupAgeThresholdsFromPage();
  const now = Date.now();
  const hour = 3600000;
  const day = 24 * hour;
  const recentCut = recentHours * hour;
  const recentDaysCut = recentDays * day;
  const mediumCut = mediumDays * day;
  const oldCut = oldDays * day;
  const conversationCounts = new Map();
  for (const tab of tabs) if (tab.botId) conversationCounts.set(tab.botId, (conversationCounts.get(tab.botId) || 0) + 1);
  const age = tab => { const at = Number(tab?.lastAccessed) || 0; return at > 0 ? Math.max(0, now - at) : Number.NaN; };
  const defs = [
    { id: "smart:recent", label: `Used in last ${recentHours}h`, help: "Recently accessed SpicyChat tabs.", test: tab => age(tab) <= recentCut },
    { id: "smart:recent-days", label: `${recentHours}h–${recentDays}d old`, help: "Exclusive age range; these tabs are not also counted in the newer group.", test: tab => age(tab) > recentCut && age(tab) <= recentDaysCut },
    { id: "smart:medium", label: `${recentDays}–${mediumDays}d old`, help: "Exclusive age range based on browser last-accessed time.", test: tab => age(tab) > recentDaysCut && age(tab) <= mediumCut },
    { id: "smart:old", label: `${mediumDays}–${oldDays}d old`, help: "Older open tabs that are good candidates for reviewed cleanup.", test: tab => age(tab) > mediumCut && age(tab) <= oldCut },
    { id: "smart:very-old", label: `${oldDays}d+ old`, help: "Tabs not accessed within the configured oldest threshold.", test: tab => age(tab) > oldCut },
    { id: "smart:favorite", label: "Favorite history", help: "Bots present in QoL's local Favorite history.", test: tab => !!tab.favoriteHistory },
    { id: "smart:later", label: "Later", help: "Bots currently saved in QoL's Later list.", test: tab => !!tab.later },
    { id: "smart:archive", label: "Local archive copy", help: "QoL already has some Local Bot Archive record for this bot. This backs up profile data, not the chat conversation itself.", test: tab => !!tab.savedLocalCopy },
    { id: "smart:multiple", label: "Multiple conversations", help: "The same bot has more than one distinct chat URL in this session. Each conversation is preserved separately and is not treated as a duplicate.", test: tab => !!tab.botId && (conversationCounts.get(tab.botId) || 0) > 1 },
    { id: "smart:discarded", label: "Discarded / unloaded tabs", help: "Tabs the browser has unloaded to save memory. Tab Cleanup does not wake them just to list or close them.", test: tab => !!tab.discarded }
  ];
  return defs.map(def => {
    const matching = tabs.filter(def.test);
    return { ...def, count: matching.length, urls: matching.map(tab => String(tab.url || "")).filter(Boolean) };
  });
}

function tabCleanupSmartGroupForId(session, id) {
  return tabCleanupSmartGroupsForSession(session).find(group => group.id === id) || null;
}

async function loadTabCleanupTopics() {
  const result = await storageGet([TAB_CLEANUP_TOPICS_KEY]);
  tabCleanupTopicState = normalizeTabCleanupTopics(result[TAB_CLEANUP_TOPICS_KEY]);
  renderTabCleanupTopics();
  await renderTabCleanupSmartGroups();
  renderTabCleanupSessionReview();
}

async function persistTabCleanupTopics() {
  tabCleanupTopicState = normalizeTabCleanupTopics(tabCleanupTopicState);
  await storageSet({ [TAB_CLEANUP_TOPICS_KEY]: tabCleanupTopicState });
  renderTabCleanupTopics();
  await renderTabCleanupSmartGroups();
  renderTabCleanupSessionReview();
}

function tabCleanupTopicIdsForBot(botId) {
  const id = String(botId || "");
  if (!id) return [];
  return tabCleanupTopicState.topics.filter(topic => topic.botIds.includes(id)).map(topic => topic.id);
}

function tabCleanupTopicNamesForBot(botId) {
  const ids = new Set(tabCleanupTopicIdsForBot(botId));
  return tabCleanupTopicState.topics.filter(topic => ids.has(topic.id)).map(topic => topic.name);
}

function populateTabCleanupTopicSelects(session = null) {
  const filter = $("tabCleanupSessionTopicFilter");
  const assign = $("tabCleanupAssignTopic");
  if (filter) {
    const current = filter.value || "all";
    filter.replaceChildren(
      makeElement("option", { text: "All tabs", attrs: { value: "all" } }),
      makeElement("option", { text: "Uncategorized", attrs: { value: "none" } })
    );
    for (const topic of tabCleanupTopicState.topics) filter.append(makeElement("option", { text: `Topic · ${topic.name}`, attrs: { value: topic.id } }));
    for (const group of tabCleanupSmartGroupsForSession(session || { tabs: [] })) {
      filter.append(makeElement("option", { text: `Smart · ${group.label}${session ? ` (${group.count})` : ""}`, attrs: { value: group.id } }));
    }
    filter.value = [...filter.options].some(option => option.value === current) ? current : "all";
  }
  if (assign) {
    const current = assign.value || "";
    assign.replaceChildren(makeElement("option", { text: "Choose topic…", attrs: { value: "" } }));
    for (const topic of tabCleanupTopicState.topics) assign.append(makeElement("option", { text: topic.name, attrs: { value: topic.id } }));
    assign.value = [...assign.options].some(option => option.value === current) ? current : "";
  }
}

async function latestTabCleanupSession() {
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  return normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]).sessions[0] || null;
}

async function browseTabCleanupFilter(filterValue = "all") {
  let targetId = "";
  if (lastTabCleanupDiagnostic) {
    targetId = "__live__";
  } else {
    const latest = await latestTabCleanupSession();
    if (latest) targetId = latest.id;
    else {
      try {
        lastTabCleanupDiagnostic = await requestTabCleanupDiagnostic();
        targetId = "__live__";
      } catch {
        const status = $("tabCleanupDiagnosticStatus");
        if (status) status.textContent = "Collect open tabs or save a session before browsing groups.";
        return;
      }
    }
  }
  activeTabCleanupSessionId = targetId;
  tabCleanupSessionSelection.clear();
  const host = $("tabCleanupSessionReview");
  if (host) host.hidden = false;
  const session = await getActiveTabCleanupSession();
  populateTabCleanupTopicSelects(session);
  const select = $("tabCleanupSessionTopicFilter");
  if (select && [...select.options].some(option => option.value === filterValue)) select.value = filterValue;
  await renderTabCleanupSessionReview();
  host?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function renderTabCleanupTopics() {
  const host = $("tabCleanupTopicList");
  if (!host) return;
  host.replaceChildren();
  populateTabCleanupTopicSelects();
  if (!tabCleanupTopicState.topics.length) {
    host.append(makeElement("div", { className: "bot-manager-empty", text: "No saved topics yet. Create one manually or save a generated suggestion." }));
    return;
  }
  for (const topic of tabCleanupTopicState.topics) {
    const row = makeElement("div", { className: "tab-cleanup-topic-card" });
    const info = makeElement("div");
    info.append(makeElement("strong", { text: topic.name }));
    info.append(makeElement("div", { className: "hint", text: `${topic.botIds.length} bot${topic.botIds.length === 1 ? "" : "s"}` }));
    const actions = makeElement("div", { className: "button-row" });
    const browse = makeElement("button", { text: "Browse", attrs: { type: "button", title: "Show the actual tabs/bots in this topic" } });
    browse.addEventListener("click", () => browseTabCleanupFilter(topic.id));
    const rename = makeElement("button", { text: "Rename", attrs: { type: "button" } });
    rename.addEventListener("click", async () => {
      const next = prompt("Rename topic", topic.name);
      if (next === null) return;
      const name = String(next || "").trim().slice(0, 60);
      if (!name) return;
      topic.name = name;
      await persistTabCleanupTopics();
    });
    const remove = makeElement("button", { text: "Delete", attrs: { type: "button" } });
    remove.addEventListener("click", async () => {
      if (!confirm(`Delete topic "${topic.name}"? This only removes the QoL topic; it does not close tabs or change bots.`)) return;
      tabCleanupTopicState.topics = tabCleanupTopicState.topics.filter(item => item.id !== topic.id);
      await persistTabCleanupTopics();
    });
    actions.append(browse, rename, remove);
    row.append(info, actions);
    host.append(row);
  }
}

async function renderTabCleanupSmartGroups() {
  const host = $("tabCleanupSmartGroupList");
  if (!host) return;
  let session = await getActiveTabCleanupSession();
  if (!session && lastTabCleanupDiagnostic) session = makeTabCleanupSession(lastTabCleanupDiagnostic, { id: "__live__", name: "Current open SpicyChat tabs", kind: "live" });
  if (!session) session = await latestTabCleanupSession();
  host.replaceChildren();
  if (!session) {
    host.append(makeElement("div", { className: "bot-manager-empty", text: "Collect open tabs or save a session to populate Smart Groups." }));
    return;
  }
  for (const group of tabCleanupSmartGroupsForSession(session)) {
    if (!group.count) continue;
    const row = makeElement("div", { className: "tab-cleanup-topic-card tab-cleanup-smart-card" });
    const info = makeElement("div");
    info.append(makeElement("strong", { text: group.label }));
    info.append(makeElement("div", { className: "hint", text: `${group.count} tab${group.count === 1 ? "" : "s"} · ${group.help}` }));
    const actions = makeElement("div", { className: "button-row" });
    const browse = makeElement("button", { text: "Browse", attrs: { type: "button" } });
    browse.addEventListener("click", () => browseTabCleanupFilter(group.id));
    actions.append(browse);
    row.append(info, actions);
    host.append(row);
  }
}

async function createTabCleanupTopic(name, botIds = []) {
  const cleanName = String(name || "").trim().slice(0, 60);
  if (!cleanName) return null;
  let topic = tabCleanupTopicState.topics.find(item => item.name.toLowerCase() === cleanName.toLowerCase());
  if (!topic) {
    topic = { id: globalThis.crypto?.randomUUID?.() || `topic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName, botIds: [] };
    tabCleanupTopicState.topics.push(topic);
  }
  topic.botIds = [...new Set([...topic.botIds, ...(Array.isArray(botIds) ? botIds : [])].map(id => String(id || "").trim()).filter(Boolean))];
  await persistTabCleanupTopics();
  return topic;
}

async function saveSuggestedTabCleanupTopic(item) {
  const name = String(item?.label || "").trim();
  const ids = Array.isArray(item?.botIds) ? item.botIds : [];
  if (!name) return;
  const topic = await createTabCleanupTopic(name, ids);
  const status = $("tabCleanupDiagnosticStatus");
  if (status && topic) status.textContent = `Saved topic "${topic.name}" with ${topic.botIds.length} bot${topic.botIds.length === 1 ? "" : "s"}. No tabs were moved or closed.`;
}

async function addManualTabCleanupTopic() {
  const input = $("tabCleanupNewTopicName");
  const name = String(input?.value || "").trim();
  if (!name) return;
  await createTabCleanupTopic(name, []);
  if (input) input.value = "";
}

async function getActiveTabCleanupSession() {
  if (!activeTabCleanupSessionId) return null;
  if (activeTabCleanupSessionId === "__live__") {
    if (!lastTabCleanupDiagnostic) return null;
    return makeTabCleanupSession(lastTabCleanupDiagnostic, { id: "__live__", name: "Current open SpicyChat tabs", kind: "live" });
  }
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  return normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]).sessions.find(item => item.id === activeTabCleanupSessionId) || null;
}

function tabCleanupAgeLabel(timestamp) {
  const at = Number(timestamp) || 0;
  if (!at) return "unknown age";
  const diff = Math.max(0, Date.now() - at);
  const hours = diff / 3600000;
  if (hours < 1) return `${Math.max(1, Math.round(diff / 60000))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function tabCleanupReviewVisibleTabs(session) {
  const search = String($("tabCleanupSessionSearch")?.value || "").trim().toLowerCase();
  const topicFilter = String($("tabCleanupSessionTopicFilter")?.value || "all");
  const smart = topicFilter.startsWith("smart:") ? tabCleanupSmartGroupForId(session, topicFilter) : null;
  const smartUrls = smart ? new Set(smart.urls.map(tabCleanupExactUrlKey).filter(Boolean)) : null;
  return (Array.isArray(session?.tabs) ? session.tabs : []).filter(tab => {
    const topics = tabCleanupTopicIdsForBot(tab.botId);
    if (topicFilter === "none" && topics.length) return false;
    if (topicFilter !== "all" && topicFilter !== "none" && !topicFilter.startsWith("smart:") && !topics.includes(topicFilter)) return false;
    if (smartUrls && !smartUrls.has(tabCleanupExactUrlKey(tab.url))) return false;
    if (!search) return true;
    const haystack = `${tab.botName || ""}\n${tab.creator || ""}\n${tab.title || ""}\n${tab.url || ""}\n${(tab.tags || []).join(" ")}\n${tabCleanupTopicNamesForBot(tab.botId).join(" ")}`.toLowerCase();
    return haystack.includes(search);
  });
}

async function openTabCleanupSessionReview(id) {
  activeTabCleanupSessionId = String(id || "");
  tabCleanupSessionSelection.clear();
  const host = $("tabCleanupSessionReview");
  if (host) host.hidden = false;
  await loadTabCleanupTopics();
  await renderTabCleanupSessionReview();
  host?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function closeTabCleanupSessionReview() {
  activeTabCleanupSessionId = "";
  tabCleanupSessionSelection.clear();
  const host = $("tabCleanupSessionReview");
  if (host) host.hidden = true;
  renderTabCleanupSmartGroups();
}

async function renderTabCleanupSessionReview() {
  const host = $("tabCleanupSessionReview");
  const list = $("tabCleanupSessionReviewList");
  if (!host || !list) return;
  if (!activeTabCleanupSessionId) {
    host.hidden = true;
    return;
  }
  const session = await getActiveTabCleanupSession();
  if (!session) {
    closeTabCleanupSessionReview();
    return;
  }
  populateTabCleanupTopicSelects(session);
  host.hidden = false;
  const kind = String(session.kind || "snapshot");
  if ($("tabCleanupSessionReviewTitle")) $("tabCleanupSessionReviewTitle").textContent = session.name || (kind === "live" ? "Current open SpicyChat tabs" : "Saved SpicyChat session");
  if ($("tabCleanupSessionReviewMeta")) {
    const source = session.sourceLabel ? ` · ${session.sourceLabel}` : "";
    $("tabCleanupSessionReviewMeta").textContent = `${Number(session.tabCount || 0)} tabs · ${Number(session.botCount || 0)} bots · ${Array.isArray(session.windows) ? session.windows.length : 0} windows${kind === "closed" ? " · closed cleanup recovery" : kind === "live" ? " · live open tabs" : kind === "merged" ? " · merged snapshot" : ""}${source}`;
  }
  const removeReopenedWrap = $("tabCleanupRemoveReopenedWrap");
  if (removeReopenedWrap) removeReopenedWrap.hidden = kind !== "closed";

  const allUrls = new Set((session.tabs || []).map(tab => String(tab.url || "")).filter(Boolean));
  for (const url of [...tabCleanupSessionSelection]) if (!allUrls.has(url)) tabCleanupSessionSelection.delete(url);
  const visible = tabCleanupReviewVisibleTabs(session);
  const conversationCounts = new Map();
  for (const tab of session.tabs || []) if (tab.botId) conversationCounts.set(tab.botId, (conversationCounts.get(tab.botId) || 0) + 1);

  list.replaceChildren();
  if (!visible.length) {
    list.append(makeElement("div", { className: "bot-manager-empty", text: "No saved tabs match these filters." }));
  } else {
    for (const tab of visible) {
      const url = String(tab.url || "");
      const row = makeElement("label", { className: `tab-cleanup-review-row${tabCleanupSessionSelection.has(url) ? " is-selected" : ""}` });
      const checkbox = makeElement("input", { attrs: { type: "checkbox" } });
      checkbox.checked = tabCleanupSessionSelection.has(url);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) tabCleanupSessionSelection.add(url); else tabCleanupSessionSelection.delete(url);
        renderTabCleanupSessionReview();
      });
      const body = makeElement("div", { className: "tab-cleanup-review-body" });
      body.append(makeElement("strong", { text: tab.botName || tab.title || tab.url || "SpicyChat tab" }));
      const bits = [];
      if (tab.creator) bits.push(`@${tab.creator}`);
      if (tab.botId && (conversationCounts.get(tab.botId) || 0) > 1) bits.push(`${conversationCounts.get(tab.botId)} conversations`);
      bits.push(tabCleanupAgeLabel(tab.lastAccessed));
      if (tab.favoriteHistory) bits.push("Favorite history");
      if (tab.later) bits.push("Later");
      if (tab.savedLocalCopy) bits.push("Local archive");
      if (tab.discarded) bits.push("discarded");
      if (tab.pinned) bits.push("pinned");
      body.append(makeElement("div", { className: "hint", text: bits.filter(Boolean).join(" · ") }));
      const topicNames = tabCleanupTopicNamesForBot(tab.botId);
      if (topicNames.length) body.append(makeElement("div", { className: "tab-cleanup-row-topics", text: topicNames.join(" · ") }));
      if ((tab.tags || []).length) body.append(makeElement("div", { className: "tab-cleanup-row-tags", text: (tab.tags || []).slice(0, 8).join(" · ") }));
      body.append(makeElement("div", { className: "tab-cleanup-url", text: url }));
      row.append(checkbox, body);
      list.append(row);
    }
  }
  if ($("tabCleanupSessionSelectedCount")) $("tabCleanupSessionSelectedCount").textContent = `${tabCleanupSessionSelection.size} selected`;
  const closeButton = $("tabCleanupCloseSelected");
  if (closeButton) closeButton.disabled = !tabCleanupSessionSelection.size;
}

async function selectShownTabCleanupSessionTabs() {
  const session = await getActiveTabCleanupSession();
  if (!session) return;
  for (const tab of tabCleanupReviewVisibleTabs(session)) if (tab.url) tabCleanupSessionSelection.add(String(tab.url));
  await renderTabCleanupSessionReview();
}

async function applyTopicToSelectedTabCleanup(add = true) {
  const topicId = String($("tabCleanupAssignTopic")?.value || "");
  if (!topicId || !tabCleanupSessionSelection.size) return;
  const topic = tabCleanupTopicState.topics.find(item => item.id === topicId);
  const session = await getActiveTabCleanupSession();
  if (!topic || !session) return;
  const selectedBots = new Set((session.tabs || []).filter(tab => tabCleanupSessionSelection.has(String(tab.url || ""))).map(tab => String(tab.botId || "")).filter(Boolean));
  if (add) topic.botIds = [...new Set([...topic.botIds, ...selectedBots])];
  else topic.botIds = topic.botIds.filter(id => !selectedBots.has(id));
  await persistTabCleanupTopics();
  const status = $("tabCleanupSessionReviewStatus");
  if (status) status.textContent = `${add ? "Added" : "Removed"} ${selectedBots.size} bot${selectedBots.size === 1 ? "" : "s"} ${add ? "to" : "from"} "${topic.name}". Tabs were not moved or closed.`;
}

async function removeUrlsFromTabCleanupSession(sessionId, urls) {
  const removeKeys = new Set((urls || []).map(tabCleanupExactUrlKey).filter(Boolean));
  if (!removeKeys.size || !sessionId || sessionId === "__live__") return;
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  const session = store.sessions.find(item => item.id === sessionId);
  if (!session) return;
  session.tabs = (session.tabs || []).filter(tab => !removeKeys.has(tabCleanupExactUrlKey(tab.url)));
  session.tabCount = session.tabs.length;
  session.botCount = new Set(session.tabs.map(tab => tab.botId).filter(Boolean)).size;
  if (!session.tabs.length) store.sessions = store.sessions.filter(item => item.id !== sessionId);
  await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
  if (!session.tabs.length && activeTabCleanupSessionId === sessionId) closeTabCleanupSessionReview();
  await renderTabCleanupSessions();
}

async function reopenSelectedTabCleanup(mode = "current") {
  const session = await getActiveTabCleanupSession();
  const status = $("tabCleanupSessionReviewStatus");
  if (!session || !tabCleanupSessionSelection.size) {
    if (status) status.textContent = "Select at least one saved tab first.";
    return;
  }
  const items = (session.tabs || []).filter(tab => tabCleanupSessionSelection.has(String(tab.url || "")) && /^https:\/\/(?:www\.)?spicychat\.ai\//i.test(String(tab.url || "")));
  if (!items.length) return;
  const savedWindows = new Set(items.map(item => Number(item.windowId) || 0)).size;
  if ((items.length > 20 || (mode === "saved-windows" && savedWindows > 3)) && !confirm(`Reopen ${items.length} SpicyChat tabs${mode === "saved-windows" ? ` across ${savedWindows} new windows` : ""}? Existing tabs will not be closed.`)) return;
  if (status) status.textContent = `Reopening ${items.length} saved tab${items.length === 1 ? "" : "s"}...`;
  const response = await runtimeMessage({ type: "DS_TAB_SESSION_REOPEN", mode, items });
  if (!response?.ok) {
    if (status) status.textContent = `Could not reopen tabs: ${response?.error || "unknown error"}`;
    return;
  }
  const summary = response.summary || {};
  const restoredUrls = [...(summary.openedUrls || []), ...(summary.skippedExistingUrls || [])];
  let removedText = "";
  if (session.kind === "closed" && checked("tabCleanupRemoveReopened", false) && restoredUrls.length) {
    await removeUrlsFromTabCleanupSession(session.id, restoredUrls);
    removedText = ` ${restoredUrls.length} restored entr${restoredUrls.length === 1 ? "y was" : "ies were"} removed from the closed-session recovery list.`;
  }
  if (status) status.textContent = `Reopened ${Number(summary.opened || 0)} tab${Number(summary.opened || 0) === 1 ? "" : "s"}${summary.windows ? ` in ${summary.windows} new window${summary.windows === 1 ? "" : "s"}` : ""}. ${Number(summary.skippedExisting || 0)} already-open tab${Number(summary.skippedExisting || 0) === 1 ? "" : "s"} skipped; ${Number(summary.failed || 0)} failed.${removedText}`;
}

function makeTabCleanupSession(report, overrides = {}) {
  const bots = Array.isArray(report?.bots) ? report.bots : [];
  const tabs = [];
  for (const bot of bots) {
    for (const tab of bot.tabs || []) {
      tabs.push({
        botId: bot.id,
        botName: bot.identity?.bestName || bot.names?.[0] || "",
        creator: bot.identity?.bestCreator || "",
        tags: [...new Set((bot.tags || []).map(tag => String(tag || "").trim()).filter(Boolean))],
        favoriteHistory: !!bot.local?.favoriteHistory,
        later: !!bot.local?.later,
        savedLocalCopy: !!bot.local?.savedLocalCopy,
        url: tab.url || "",
        title: tab.title || "",
        windowId: Number(tab.windowId) || 0,
        index: Number(tab.index) || 0,
        active: !!tab.active,
        pinned: !!tab.pinned,
        discarded: !!tab.discarded,
        lastAccessed: Number(tab.lastAccessed) || 0,
        pageType: tab.pageType || "chat"
      });
    }
  }
  for (const tab of report?.otherTabs || []) {
    tabs.push({
      botId: "",
      botName: "",
      creator: "",
      tags: [],
      favoriteHistory: false,
      later: false,
      savedLocalCopy: false,
      url: tab.url || "",
      title: tab.title || "",
      windowId: Number(tab.windowId) || 0,
      index: Number(tab.index) || 0,
      active: !!tab.active,
      pinned: !!tab.pinned,
      discarded: !!tab.discarded,
      lastAccessed: Number(tab.lastAccessed) || 0,
      pageType: tab.pageType || "other"
    });
  }
  tabs.sort((a, b) => a.windowId - b.windowId || a.index - b.index);
  const createdAt = Date.now();
  const id = String(overrides.id || globalThis.crypto?.randomUUID?.() || `session-${createdAt}-${Math.random().toString(36).slice(2, 8)}`);
  return {
    format: "spicychat-qol-tab-session",
    version: 3,
    id,
    name: String(overrides.name || `SpicyChat tabs — ${new Date(createdAt).toLocaleString()}`),
    kind: String(overrides.kind || "snapshot"),
    createdAt,
    tabCount: tabs.length,
    botCount: new Set(tabs.map(tab => tab.botId).filter(Boolean)).size,
    windows: Array.isArray(report?.windows) ? report.windows : [],
    analysis: report?.analysis || buildTabCleanupAnalysis(report),
    tabs
  };
}

async function saveTabCleanupSession() {
  const status = $("tabCleanupDiagnosticStatus");
  try {
    const report = lastTabCleanupDiagnostic || await requestTabCleanupDiagnostic();
    if (!report) throw new Error("Collect the open tabs first");
    const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
    const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
    const session = makeTabCleanupSession(report);
    store.sessions.unshift(session);
    store.sessions = store.sessions.slice(0, 40);
    await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
    if (status) status.textContent = `Saved session snapshot with ${session.tabCount} SpicyChat tabs. No tabs were closed.`;
    await renderTabCleanupSessions();
    await renderTabCleanupSmartGroups();
  } catch (error) {
    if (status) status.textContent = `Could not save session snapshot: ${error?.message || String(error)}`;
  }
}

function mergeTabCleanupTabRecords(previous, incoming) {
  if (!previous) return { ...incoming, tags: [...new Set(incoming?.tags || [])] };
  const preferText = (a, b) => {
    const left = String(a || "").trim();
    const right = String(b || "").trim();
    if (!left) return right;
    if (!right) return left;
    return right.length >= left.length ? right : left;
  };
  return {
    ...previous,
    ...incoming,
    botId: incoming.botId || previous.botId || "",
    botName: preferText(previous.botName, incoming.botName),
    creator: preferText(previous.creator, incoming.creator),
    title: preferText(previous.title, incoming.title),
    tags: [...new Set([...(previous.tags || []), ...(incoming.tags || [])].map(tag => String(tag || "").trim()).filter(Boolean))],
    favoriteHistory: !!(previous.favoriteHistory || incoming.favoriteHistory),
    later: !!(previous.later || incoming.later),
    savedLocalCopy: !!(previous.savedLocalCopy || incoming.savedLocalCopy),
    pinned: !!(previous.pinned || incoming.pinned),
    active: !!incoming.active,
    discarded: !!incoming.discarded,
    lastAccessed: Math.max(Number(previous.lastAccessed) || 0, Number(incoming.lastAccessed) || 0),
    pageType: incoming.pageType || previous.pageType || "chat"
  };
}

async function mergeAllTabCleanupSessions() {
  const status = $("tabCleanupSessionToolsStatus");
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  if (!store.sessions.length) {
    if (status) status.textContent = "No saved snapshots to merge.";
    return;
  }

  const sourceSessions = [...store.sessions].reverse();
  const mergedByUrl = new Map();
  const windowIds = new Map();
  let nextWindowId = 1;
  let duplicateUrls = 0;

  for (const session of sourceSessions) {
    for (const tab of session.tabs || []) {
      const key = tabCleanupExactUrlKey(tab.url);
      if (!key) continue;
      const sourceWindowKey = `${session.id || session.createdAt || "session"}:${Number(tab.windowId) || 0}`;
      if (!windowIds.has(sourceWindowKey)) windowIds.set(sourceWindowKey, nextWindowId++);
      const incoming = {
        ...tab,
        url: key,
        windowId: windowIds.get(sourceWindowKey),
        sourceSessionId: String(session.id || ""),
        sourceWindowId: Number(tab.windowId) || 0
      };
      if (mergedByUrl.has(key)) duplicateUrls += 1;
      mergedByUrl.set(key, mergeTabCleanupTabRecords(mergedByUrl.get(key), incoming));
    }
  }

  const tabs = [...mergedByUrl.values()].sort((a, b) => (Number(a.windowId) || 0) - (Number(b.windowId) || 0) || (Number(a.index) || 0) - (Number(b.index) || 0));
  if (!tabs.length) {
    if (status) status.textContent = "The saved snapshots did not contain any valid SpicyChat URLs to merge.";
    return;
  }

  const createdAt = Date.now();
  const merged = {
    format: "spicychat-qol-tab-session",
    version: 4,
    id: globalThis.crypto?.randomUUID?.() || `merged-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Merged snapshots — ${new Date(createdAt).toLocaleString()}`,
    kind: "merged",
    createdAt,
    sourceLabel: `Merged from ${store.sessions.length} saved snapshot${store.sessions.length === 1 ? "" : "s"}`,
    tabCount: tabs.length,
    botCount: new Set(tabs.map(tab => tab.botId).filter(Boolean)).size,
    windows: tabCleanupWindowsSummary(tabs),
    mergedFrom: store.sessions.map(session => ({ id: session.id, name: session.name, createdAt: session.createdAt, kind: session.kind })),
    tabs
  };

  store.sessions.unshift(merged);
  store.sessions = store.sessions.slice(0, 40);
  await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
  await renderTabCleanupSessions();
  await renderTabCleanupSmartGroups();
  if (status) status.textContent = `Created one merged snapshot with ${tabs.length} unique exact URLs from ${sourceSessions.length} snapshot${sourceSessions.length === 1 ? "" : "s"}; ${duplicateUrls} repeated URL record${duplicateUrls === 1 ? " was" : "s were"} merged. Original snapshots were kept.`;
}

async function cleanTabCleanupSessionDuplicates() {
  const status = $("tabCleanupSessionToolsStatus");
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  let duplicates = 0;
  const cleaned = store.sessions.map(session => {
    const byUrl = new Map();
    const passthrough = [];
    for (const tab of session.tabs || []) {
      const key = tabCleanupExactUrlKey(tab.url);
      if (!key) { passthrough.push(tab); continue; }
      if (byUrl.has(key)) duplicates += 1;
      byUrl.set(key, mergeTabCleanupTabRecords(byUrl.get(key), { ...tab, url: key }));
    }
    const tabs = [...byUrl.values(), ...passthrough];
    return {
      ...session,
      tabs,
      tabCount: tabs.length,
      botCount: new Set(tabs.map(tab => tab.botId).filter(Boolean)).size,
      windows: tabCleanupWindowsSummary(tabs)
    };
  });

  if (!duplicates) {
    if (status) status.textContent = "No repeated exact URLs were found inside the saved snapshots.";
    return;
  }
  if (!confirm(`Remove ${duplicates} repeated exact-URL record${duplicates === 1 ? "" : "s"} from saved session snapshots?\n\nThis only cleans QoL's saved snapshot data. It does not close or change browser tabs, and separate conversation URLs are kept.`)) return;
  store.sessions = cleaned;
  await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
  await renderTabCleanupSessions();
  if (status) status.textContent = `Removed ${duplicates} repeated exact-URL record${duplicates === 1 ? "" : "s"} from saved snapshots. Separate conversation URLs were preserved.`;
}

function tabCleanupWindowsSummary(tabs) {
  const map = new Map();
  for (const tab of tabs || []) {
    const id = Number(tab.windowId) || 0;
    if (!map.has(id)) map.set(id, { windowId: id, tabCount: 0, botTabCount: 0 });
    const item = map.get(id);
    item.tabCount += 1;
    if (tab.botId) item.botTabCount += 1;
  }
  return [...map.values()];
}

async function saveClosedTabCleanupSession(tabs, sourceLabel = "Selected tabs") {
  const createdAt = Date.now();
  const id = globalThis.crypto?.randomUUID?.() || `closed-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    format: "spicychat-qol-tab-session",
    version: 3,
    id,
    name: `Closed tabs — ${new Date(createdAt).toLocaleString()}`,
    kind: "closed",
    createdAt,
    closedAt: createdAt,
    sourceLabel: String(sourceLabel || "Selected tabs"),
    tabCount: tabs.length,
    botCount: new Set(tabs.map(tab => tab.botId).filter(Boolean)).size,
    windows: tabCleanupWindowsSummary(tabs),
    tabs
  };
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  store.sessions.unshift(session);
  store.sessions = store.sessions.slice(0, 40);
  await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
  return session;
}

async function closeSelectedTabCleanup() {
  const session = await getActiveTabCleanupSession();
  const status = $("tabCleanupSessionReviewStatus");
  if (!session || !tabCleanupSessionSelection.size) {
    if (status) status.textContent = "Select at least one tab first.";
    return;
  }
  const selected = (session.tabs || []).filter(tab => tabCleanupSessionSelection.has(String(tab.url || "")) && tabCleanupExactUrlKey(tab.url));
  if (!selected.length) return;
  const protectPinned = checked("tabCleanupProtectPinnedOnClose", true);
  if (status) status.textContent = `Checking which of the ${selected.length} selected tabs are still open...`;
  const preview = await runtimeMessage({ type: "DS_TAB_SESSION_MATCH_OPEN", items: selected, protectPinned });
  if (!preview?.ok) {
    if (status) status.textContent = `Could not prepare cleanup: ${preview?.error || "unknown error"}`;
    return;
  }
  const matches = Array.isArray(preview.matches) ? preview.matches : [];
  const pinnedSkipped = Number(preview.pinnedSkipped || 0);
  const missing = Number(preview.missing || 0);
  if (!matches.length) {
    if (status) status.textContent = `None of the selected URLs are currently open${pinnedSkipped ? `; ${pinnedSkipped} pinned tab${pinnedSkipped === 1 ? " was" : "s were"} protected` : ""}.`;
    return;
  }
  const sourceByKey = new Map(selected.map(tab => [tabCleanupExactUrlKey(tab.url), tab]));
  const closingTabs = matches.map(match => {
    const source = sourceByKey.get(tabCleanupExactUrlKey(match.url)) || {};
    return {
      ...source,
      url: match.url || source.url || "",
      title: match.title || source.title || "",
      windowId: Number(match.windowId) || Number(source.windowId) || 0,
      index: Number(match.index) || Number(source.index) || 0,
      active: !!match.active,
      pinned: !!match.pinned,
      discarded: !!match.discarded,
      lastAccessed: Number(match.lastAccessed) || Number(source.lastAccessed) || 0
    };
  });
  const filter = $("tabCleanupSessionTopicFilter");
  const sourceLabel = String(filter?.selectedOptions?.[0]?.textContent || "Selected tabs").replace(/^(?:Topic|Smart) · /, "");
  const names = closingTabs.slice(0, 10).map(tab => tab.botName || tab.title || tab.url).filter(Boolean);
  const detail = names.length ? `\n\n${names.join("\n")}${closingTabs.length > names.length ? `\n… +${closingTabs.length - names.length} more` : ""}` : "";
  const pinNote = pinnedSkipped ? `\n${pinnedSkipped} pinned tab${pinnedSkipped === 1 ? " is" : "s are"} protected and will stay open.` : "";
  const missingNote = missing ? `\n${missing} selected saved URL${missing === 1 ? " is" : "s are"} no longer open and will be ignored.` : "";
  if (!confirm(`Save a recovery session and close ${closingTabs.length} currently open SpicyChat tab${closingTabs.length === 1 ? "" : "s"}?\n\nThe recovery snapshot is written before any tab is closed.${pinNote}${missingNote}${detail}`)) return;

  let recovery = null;
  try {
    recovery = await saveClosedTabCleanupSession(closingTabs, sourceLabel);
  } catch (error) {
    if (status) status.textContent = `Cleanup stopped: recovery session could not be saved (${error?.message || String(error)}). No tabs were closed.`;
    return;
  }
  const closeResponse = await runtimeMessage({ type: "DS_TAB_SESSION_CLOSE_MATCHES", tabIds: matches.map(item => item.tabId), protectPinned });
  if (!closeResponse?.ok) {
    if (status) status.textContent = `Recovery session saved, but tab closing failed: ${closeResponse?.error || "unknown error"}.`;
    await renderTabCleanupSessions();
    return;
  }
  const summary = closeResponse.summary || {};
  activeTabCleanupSessionId = recovery.id;
  tabCleanupSessionSelection.clear();
  if (lastTabCleanupDiagnostic) {
    try { lastTabCleanupDiagnostic = await requestTabCleanupDiagnostic(); } catch {}
  }
  await renderTabCleanupSessions();
  await renderTabCleanupSmartGroups();
  await renderTabCleanupSessionReview();
  if (status) status.textContent = `Saved recovery session and closed ${Number(summary.closed || 0)} tab${Number(summary.closed || 0) === 1 ? "" : "s"}. ${Number(summary.pinnedSkipped || 0)} pinned protected; ${Number(summary.failed || 0)} failed. You are now reviewing the saved recovery session.`;
}

async function deleteTabCleanupSession(id) {
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  const target = store.sessions.find(item => item.id === id);
  if (!target) return;
  if (!confirm(`Delete saved tab session "${target.name}"? This only deletes the QoL snapshot; it does not touch browser tabs.`)) return;
  store.sessions = store.sessions.filter(item => item.id !== id);
  await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
  if (activeTabCleanupSessionId === id) closeTabCleanupSessionReview();
  await renderTabCleanupSessions();
  await renderTabCleanupSmartGroups();
}

async function renderTabCleanupSessions() {
  const host = $("tabCleanupSessionList");
  if (!host) return;
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  host.replaceChildren();
  if (!store.sessions.length) {
    host.append(makeElement("div", { className: "bot-manager-empty", text: "No session snapshots saved yet." }));
    return;
  }
  for (const session of store.sessions) {
    const card = makeElement("div", { className: `tab-cleanup-session-card${session.kind === "closed" ? " is-closed-recovery" : ""}` });
    card.append(makeElement("strong", { text: session.name || "Saved SpicyChat session" }));
    const kind = session.kind === "closed" ? "Closed cleanup recovery" : session.kind === "merged" ? "Merged snapshot" : "Snapshot";
    const source = session.sourceLabel ? ` · ${session.sourceLabel}` : "";
    card.append(makeElement("div", { className: "hint", text: `${kind} · ${Number(session.tabCount || 0)} tabs · ${Number(session.botCount || 0)} bots · ${Array.isArray(session.windows) ? session.windows.length : 0} windows${source}` }));
    const actions = makeElement("div", { className: "button-row" });
    const review = makeElement("button", { text: session.kind === "closed" ? "Review / restore" : "Review / reopen", attrs: { type: "button" } });
    review.addEventListener("click", () => openTabCleanupSessionReview(session.id));
    const download = makeElement("button", { text: "Download snapshot", attrs: { type: "button" } });
    download.addEventListener("click", () => downloadJsonFile(session, `spicychat-qol-tab-session-${new Date(Number(session.createdAt) || Date.now()).toISOString().slice(0, 10)}.json`));
    const remove = makeElement("button", { text: "Delete snapshot", attrs: { type: "button" } });
    remove.addEventListener("click", () => deleteTabCleanupSession(session.id));
    actions.append(review, download, remove);
    card.append(actions);
    host.append(card);
  }
}

function soundscapeId(prefix = "item") {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeSoundscapeLayer(value, index = 0) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    id: String(raw.id || soundscapeId("layer")),
    name: String(raw.name || `Layer ${index + 1}`).trim() || `Layer ${index + 1}`,
    sourceType: raw.sourceType === "file" ? "file" : "url",
    source: String(raw.source || "").trim(),
    volume: Number.isFinite(Number(raw.volume)) ? Math.min(100, Math.max(0, Number(raw.volume))) : 70,
    enabled: raw.enabled !== false,
    loop: raw.loop !== false,
    intervalSeconds: Math.min(3600, Math.max(0, Number(raw.intervalSeconds) || 0))
  };
}

function normalizeSoundscapeScene(value, index = 0) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    id: String(raw.id || soundscapeId("scene")),
    name: String(raw.name || `Soundscape ${index + 1}`).trim() || `Soundscape ${index + 1}`,
    layers: (Array.isArray(raw.layers) ? raw.layers : []).slice(0, 5).map(normalizeSoundscapeLayer)
  };
}

function normalizeSoundscapeScenes(value) {
  const raw = value && typeof value === "object" ? value : {};
  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, 50).map(normalizeSoundscapeScene);
  const activeId = scenes.some(scene => scene.id === raw.activeId) ? raw.activeId : (scenes[0]?.id || "");
  return { version: 1, activeId, scenes };
}

function normalizeSoundscapeAudio(value) {
  const raw = value && typeof value === "object" ? value : {};
  const items = (Array.isArray(raw.items) ? raw.items : []).filter(item => item && typeof item === "object").map(item => ({
    id: String(item.id || "").trim(),
    name: String(item.name || "Saved audio").trim() || "Saved audio",
    mime: String(item.mime || "").trim(),
    size: Number(item.size) || 0,
    dataUrl: String(item.dataUrl || ""),
    savedAt: Number(item.savedAt) || 0
  })).filter(item => item.id && item.dataUrl);
  return { version: 1, items };
}

function soundscapeBytesLabel(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function persistSoundscapeScenes({ rerender = false } = {}) {
  if (soundscapeScenePersistTimer) { clearTimeout(soundscapeScenePersistTimer); soundscapeScenePersistTimer = 0; }
  soundscapeSceneState = normalizeSoundscapeScenes(soundscapeSceneState);
  const ok = await storageSetVerified({ [SOUNDSCAPES_KEY]: soundscapeSceneState });
  if (!ok) showSettingsToast("Soundscape scene changes could not be verified in browser storage. Please try Save settings again.");
  if (rerender) renderSoundscapeScenes();
  return ok;
}

function scheduleSoundscapeScenePersist(delay = 220) {
  if (soundscapeScenePersistTimer) clearTimeout(soundscapeScenePersistTimer);
  soundscapeScenePersistTimer = window.setTimeout(() => {
    soundscapeScenePersistTimer = 0;
    persistSoundscapeScenes().catch(() => {});
  }, Math.max(80, Number(delay) || 220));
}

async function flushSoundscapeSceneState() {
  if (!soundscapeManagerLoaded) return true;
  return persistSoundscapeScenes();
}

async function persistSoundscapeAudio({ rerender = false } = {}) {
  soundscapeAudioState = normalizeSoundscapeAudio(soundscapeAudioState);
  const ok = await storageSetVerified({ [SOUNDSCAPE_AUDIO_KEY]: soundscapeAudioState });
  if (!ok) showSettingsToast("Imported Soundscape audio could not be verified in browser storage. The previous saved copy was left alone where possible.");
  if (rerender) {
    renderSoundscapeAudioLibrary();
    renderSoundscapeScenes();
  }
  return ok;
}

function soundscapeAudioOptions(select, current = "") {
  select.replaceChildren();
  select.append(makeElement("option", { text: soundscapeAudioState.items.length ? "Choose saved audio…" : "No saved audio imported", attrs: { value: "" } }));
  for (const item of soundscapeAudioState.items) {
    select.append(makeElement("option", { text: `${item.name} (${soundscapeBytesLabel(item.size)})`, attrs: { value: item.id } }));
  }
  select.value = soundscapeAudioState.items.some(item => item.id === current) ? current : "";
}

function renderSoundscapeAudioLibrary() {
  const host = $("soundscapeAudioList");
  const status = $("soundscapeAudioStatus");
  if (!host) return;
  host.replaceChildren();
  const total = soundscapeAudioState.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  if (status) status.textContent = soundscapeAudioState.items.length
    ? `${soundscapeAudioState.items.length} local audio file${soundscapeAudioState.items.length === 1 ? "" : "s"} · ${soundscapeBytesLabel(total)} stored. Files stay local and are not included in normal text/settings backups.`
    : "Import short ambience/audio files here. QoL stores them locally in extension storage and excludes the audio bytes from normal text/settings backups.";
  if (!soundscapeAudioState.items.length) {
    host.append(makeElement("div", { className: "bot-manager-empty", text: "No local ambience audio saved yet. URL layers can still be used." }));
    return;
  }
  for (const item of soundscapeAudioState.items) {
    const row = makeElement("div", { className: "soundscape-audio-row" });
    const meta = makeElement("div", { className: "soundscape-audio-meta" });
    meta.append(makeElement("strong", { text: item.name }), makeElement("small", { text: `${soundscapeBytesLabel(item.size)}${item.mime ? ` · ${item.mime}` : ""}` }));
    const remove = makeElement("button", { text: "Remove", attrs: { type: "button" } });
    remove.addEventListener("click", async () => {
      const refs = soundscapeSceneState.scenes.reduce((sum, scene) => sum + scene.layers.filter(layer => layer.sourceType === "file" && layer.source === item.id).length, 0);
      if (refs && !confirm(`This audio file is used by ${refs} soundscape layer${refs === 1 ? "" : "s"}. Remove it and clear those layer sources?`)) return;
      soundscapeAudioState.items = soundscapeAudioState.items.filter(entry => entry.id !== item.id);
      for (const scene of soundscapeSceneState.scenes) {
        for (const layer of scene.layers) if (layer.sourceType === "file" && layer.source === item.id) layer.source = "";
      }
      await Promise.all([persistSoundscapeAudio(), persistSoundscapeScenes()]);
      renderSoundscapeAudioLibrary();
      renderSoundscapeScenes();
    });
    row.append(meta, remove);
    host.append(row);
  }
}

function makeSoundscapeLayerRow(scene, layer, index) {
  const row = makeElement("div", { className: "soundscape-layer-row" });
  const name = makeElement("input", { attrs: { type: "text", value: layer.name, placeholder: `Layer ${index + 1}`, "aria-label": "Sound layer name" } });
  const type = makeElement("select", { attrs: { "aria-label": "Sound source type" } });
  type.append(makeElement("option", { text: "Saved local audio", attrs: { value: "file" } }), makeElement("option", { text: "Audio URL", attrs: { value: "url" } }));
  type.value = layer.sourceType;
  const sourceHost = makeElement("div", { className: "soundscape-layer-source" });
  const volumeWrap = makeElement("label", { className: "soundscape-volume" });
  const volume = makeElement("input", { attrs: { type: "range", min: "0", max: "100", step: "1", value: String(layer.volume), "aria-label": "Layer volume" } });
  const volumeValue = makeElement("span", { text: `${layer.volume}%` });
  volumeWrap.append(volume, volumeValue);
  const enabledLabel = makeElement("label", { className: "row soundscape-inline-check" });
  const enabled = makeElement("input", { attrs: { type: "checkbox" } });
  enabled.checked = layer.enabled !== false;
  enabledLabel.append(enabled, document.createTextNode("On"));
  const loopLabel = makeElement("label", { className: "row soundscape-inline-check" });
  const loop = makeElement("input", { attrs: { type: "checkbox" } });
  loop.checked = layer.loop;
  loopLabel.append(loop, document.createTextNode("Loop"));
  const interval = makeElement("input", { attrs: { type: "number", min: "0", max: "3600", step: "5", value: String(layer.intervalSeconds || 0), title: "0 = no timed replay", "aria-label": "Replay interval in seconds" } });
  const remove = makeElement("button", { text: "Remove", attrs: { type: "button" } });

  const renderSource = () => {
    sourceHost.replaceChildren();
    if (layer.sourceType === "file") {
      const select = makeElement("select", { attrs: { "aria-label": "Saved audio file" } });
      soundscapeAudioOptions(select, layer.source);
      select.addEventListener("change", async () => { layer.source = select.value; await persistSoundscapeScenes(); });
      sourceHost.append(select);
    } else {
      const input = makeElement("input", { attrs: { type: "url", value: layer.source, placeholder: "https://…/rain.mp3", "aria-label": "Audio URL" } });
      input.addEventListener("input", () => { layer.source = input.value.trim(); scheduleSoundscapeScenePersist(); });
      input.addEventListener("change", async () => { layer.source = input.value.trim(); await persistSoundscapeScenes(); });
      sourceHost.append(input);
    }
  };
  renderSource();

  name.addEventListener("input", () => { layer.name = name.value.trim() || `Layer ${index + 1}`; scheduleSoundscapeScenePersist(); });
  name.addEventListener("change", async () => { layer.name = name.value.trim() || `Layer ${index + 1}`; await persistSoundscapeScenes(); });
  type.addEventListener("change", async () => { layer.sourceType = type.value === "file" ? "file" : "url"; layer.source = ""; renderSource(); await persistSoundscapeScenes(); });
  volume.addEventListener("input", () => { layer.volume = Math.min(100, Math.max(0, Number(volume.value) || 0)); volumeValue.textContent = `${layer.volume}%`; scheduleSoundscapeScenePersist(); });
  volume.addEventListener("change", () => persistSoundscapeScenes());
  enabled.addEventListener("change", async () => { layer.enabled = enabled.checked; await persistSoundscapeScenes(); });
  loop.addEventListener("change", async () => { layer.loop = loop.checked; await persistSoundscapeScenes(); });
  interval.addEventListener("change", async () => { layer.intervalSeconds = Math.min(3600, Math.max(0, Number(interval.value) || 0)); interval.value = String(layer.intervalSeconds); await persistSoundscapeScenes(); });
  remove.addEventListener("click", async () => { scene.layers = scene.layers.filter(item => item.id !== layer.id); await persistSoundscapeScenes({ rerender: true }); });

  const sourceLabel = makeElement("div", { className: "soundscape-source-block" });
  sourceLabel.append(type, sourceHost);
  const intervalWrap = makeElement("label", { className: "soundscape-interval" });
  intervalWrap.append(document.createTextNode("Repeat every (sec, 0 = off)"), interval);
  row.append(name, sourceLabel, volumeWrap, enabledLabel, loopLabel, intervalWrap, remove);
  return row;
}

function renderSoundscapeScenes() {
  const host = $("soundscapeSceneList");
  if (!host) return;
  soundscapeSceneState = normalizeSoundscapeScenes(soundscapeSceneState);
  host.replaceChildren();
  if (!soundscapeSceneState.scenes.length) {
    host.append(makeElement("div", { className: "bot-manager-empty", text: "No soundscapes yet. Add a scene, then add up to five layers." }));
    return;
  }
  for (const scene of soundscapeSceneState.scenes) {
    const card = makeElement("div", { className: `soundscape-scene-card${scene.id === soundscapeSceneState.activeId ? " is-active" : ""}` });
    const head = makeElement("div", { className: "soundscape-scene-head" });
    const name = makeElement("input", { attrs: { type: "text", value: scene.name, "aria-label": "Soundscape name" } });
    const active = makeElement("button", { text: scene.id === soundscapeSceneState.activeId ? "Active" : "Set active", attrs: { type: "button" } });
    const remove = makeElement("button", { text: "Delete", attrs: { type: "button" } });
    name.addEventListener("input", () => { scene.name = name.value.trim() || "Soundscape"; scheduleSoundscapeScenePersist(); });
    name.addEventListener("change", async () => { scene.name = name.value.trim() || "Soundscape"; await persistSoundscapeScenes({ rerender: true }); });
    active.addEventListener("click", async () => { soundscapeSceneState.activeId = scene.id; await persistSoundscapeScenes({ rerender: true }); });
    remove.addEventListener("click", async () => {
      if (!confirm(`Delete soundscape "${scene.name}"? This does not delete imported audio files.`)) return;
      soundscapeSceneState.scenes = soundscapeSceneState.scenes.filter(item => item.id !== scene.id);
      if (soundscapeSceneState.activeId === scene.id) soundscapeSceneState.activeId = soundscapeSceneState.scenes[0]?.id || "";
      await persistSoundscapeScenes({ rerender: true });
    });
    head.append(name, active, remove);
    card.append(head);

    const layers = makeElement("div", { className: "soundscape-layer-list" });
    scene.layers.forEach((layer, index) => layers.append(makeSoundscapeLayerRow(scene, layer, index)));
    if (!scene.layers.length) layers.append(makeElement("div", { className: "hint", text: "No layers in this scene yet." }));
    card.append(layers);

    const add = makeElement("button", { text: scene.layers.length >= 5 ? "5 layer limit reached" : "+ Add layer", attrs: { type: "button" } });
    add.disabled = scene.layers.length >= 5;
    add.addEventListener("click", async () => {
      if (scene.layers.length >= 5) return;
      scene.layers.push(normalizeSoundscapeLayer({ id: soundscapeId("layer"), name: `Layer ${scene.layers.length + 1}`, sourceType: soundscapeAudioState.items.length ? "file" : "url", volume: 70, enabled: true, loop: true, intervalSeconds: 0 }, scene.layers.length));
      await persistSoundscapeScenes({ rerender: true });
    });
    card.append(add);
    host.append(card);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read audio file"));
    reader.readAsDataURL(file);
  });
}

async function importSoundscapeAudio(files) {
  await loadSoundscapeManager();
  const status = $("soundscapeAudioStatus");
  const list = [...(files || [])].filter(file => file && /^audio\//i.test(file.type || "audio/unknown"));
  if (!list.length) {
    if (status) status.textContent = "Choose one or more audio files first.";
    return;
  }
  const perFileLimit = 20 * 1024 * 1024;
  const totalLimit = 60 * 1024 * 1024;
  let total = soundscapeAudioState.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  let added = 0;
  let skipped = 0;
  for (const file of list) {
    if (file.size > perFileLimit || total + file.size > totalLimit) { skipped += 1; continue; }
    const dataUrl = await fileToDataUrl(file);
    soundscapeAudioState.items.push({ id: soundscapeId("audio"), name: file.name || `Audio ${soundscapeAudioState.items.length + 1}`, mime: file.type || "audio/*", size: file.size, dataUrl, savedAt: Date.now() });
    total += file.size;
    added += 1;
  }
  const saved = await persistSoundscapeAudio({ rerender: true });
  if (status) status.textContent = saved
    ? `${added} audio file${added === 1 ? "" : "s"} imported${skipped ? `; ${skipped} skipped because the local audio limit is 20 MB per file / 60 MB total` : ""}.`
    : "Audio import could not be verified in browser storage. Nothing should be trusted as saved until this succeeds.";
}

let soundscapeManagerLoaded = false;
let soundscapeManagerLoadPromise = null;

async function loadSoundscapeManager() {
  if (soundscapeManagerLoaded) return;
  if (soundscapeManagerLoadPromise) return soundscapeManagerLoadPromise;
  soundscapeManagerLoadPromise = (async () => {
    const result = await storageGet([SOUNDSCAPES_KEY, SOUNDSCAPE_AUDIO_KEY]);
    soundscapeSceneState = normalizeSoundscapeScenes(result[SOUNDSCAPES_KEY]);
    soundscapeAudioState = normalizeSoundscapeAudio(result[SOUNDSCAPE_AUDIO_KEY]);
    renderSoundscapeAudioLibrary();
    renderSoundscapeScenes();
    soundscapeManagerLoaded = true;
  })();
  try { await soundscapeManagerLoadPromise; } finally { soundscapeManagerLoadPromise = null; }
}

function armLazySoundscapeManager() {
  const card = $("soundscapesCard");
  if (!card || soundscapeManagerLoaded) return;
  const load = () => loadSoundscapeManager().catch(() => {});
  if (!("IntersectionObserver" in window)) {
    if (checked("enableSoundscapes")) load();
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    load();
  }, { rootMargin: "500px 0px" });
  observer.observe(card);
}

function $(id) {
  return document.getElementById(id);
}

function checked(id, fallback = false) {
  const el = $(id);
  return el ? !!el.checked : fallback;
}

function value(id, fallback = "") {
  const el = $(id);
  return el ? el.value : fallback;
}

function linesToArray(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}


function blockerSearchableText(value) {
  let text = String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2");
  try {
    text = normalizeTextPreviewValue(text);
  } catch {}
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function prepareBlockerTestRules(values) {
  return (values || []).map(rawValue => {
    const raw = String(rawValue || "").trim();
    if (!raw) return null;
    const needle = blockerSearchableText(raw);
    const tokens = needle.split(" ").filter(Boolean);
    return { raw, needle, tokens, compact: tokens.join("") };
  }).filter(rule => rule?.needle);
}

function compactBlockerWindowMatch(haystack, rule) {
  const target = String(rule?.compact || "");
  if (!target || target.length < 3) return false;
  const hayTokens = String(haystack || "").split(" ").filter(Boolean);
  const maxWindow = Math.min(hayTokens.length, Math.max(1, rule.tokens.length) + 3);
  for (let start = 0; start < hayTokens.length; start++) {
    let joined = "";
    for (let size = 1; size <= maxWindow && start + size <= hayTokens.length; size++) {
      joined += hayTokens[start + size - 1];
      if (joined === target) return true;
      if (joined.length > target.length + 2) break;
    }
  }
  return false;
}

function findBlockerTestMatch(sample, rules, allowUnordered = false) {
  const haystack = blockerSearchableText(sample);
  if (!haystack) return null;
  const padded = ` ${haystack} `;
  const haySet = new Set(haystack.split(" ").filter(Boolean));
  for (const rule of prepareBlockerTestRules(rules)) {
    if (padded.includes(` ${rule.needle} `) || compactBlockerWindowMatch(haystack, rule)) return rule;
    if (allowUnordered) {
      const meaningful = rule.tokens.filter(token => /^\p{L}{3,}$/u.test(token));
      if (meaningful.length >= 2 && rule.tokens.every(token => haySet.has(token))) return rule;
    }
  }
  return null;
}

function runBlockerRuleTest() {
  const result = $("blockerTestResult");
  if (!result) return;
  const sampleText = value("blockerTestText", "");
  const sampleCreator = value("blockerTestCreator", "").replace(/^@+/, "");
  const sampleTags = value("blockerTestTags", "");
  if (!sampleText.trim() && !sampleCreator.trim() && !sampleTags.trim()) {
    result.dataset.state = "warning";
    result.textContent = "Enter a name/description, creator, or tags sample first.";
    return;
  }

  const matches = [];
  const word = findBlockerTestMatch(sampleText, linesToArray(value("blockedWords", "")), true);
  if (word) matches.push(`blocked word: ${word.raw}`);
  const creator = findBlockerTestMatch(sampleCreator, linesToArray(value("blockedCreators", "")), false);
  if (creator) matches.push(`blocked creator: ${creator.raw}`);
  const tag = findBlockerTestMatch(sampleTags, linesToArray(value("blockedTags", "")), false);
  if (tag) matches.push(`blocked tag: ${tag.raw}`);

  if (matches.length) {
    result.dataset.state = checked("blockCards") ? "match" : "warning";
    result.textContent = checked("blockCards")
      ? `Would be blocked by ${matches.join("; ")}.`
      : `Rule match found (${matches.join("; ")}), but “Block character cards by text” is currently off.`;
    return;
  }

  const normalized = [sampleText, sampleCreator, sampleTags].filter(Boolean).map(blockerSearchableText).filter(Boolean).join(" | ");
  result.dataset.state = "clear";
  result.textContent = `No current text/creator/tag rule matched.${normalized ? ` Normalized sample: ${normalized}` : ""}`;
}

function setupBlockerTester() {
  $("testBlockerRules")?.addEventListener("click", runBlockerRuleTest);
  $("clearBlockerTest")?.addEventListener("click", () => {
    setControlValue("blockerTestText", "");
    setControlValue("blockerTestCreator", "");
    setControlValue("blockerTestTags", "");
    const result = $("blockerTestResult");
    if (result) {
      delete result.dataset.state;
      result.textContent = "Enter a sample and press Test current rules.";
    }
  });
  ["blockerTestText", "blockerTestCreator", "blockerTestTags"].forEach(id => {
    $(id)?.addEventListener("keydown", event => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) runBlockerRuleTest();
    });
  });
}

function arrayToLines(arr) {
  return (arr || []).join("\n");
}

function uniqueClean(values) {
  return [
    ...new Set(
      (values || [])
        .map(x => String(x).trim())
        .filter(Boolean)
    )
  ];
}

function setChecked(id, enabled) {
  const el = $(id);
  if (el) el.checked = !!enabled;
}

function setValue(id, next) {
  const el = $(id);
  if (el) el.value = next;
}

function setAllowedLanguages(values) {
  const allowed = new Set(Array.isArray(values) ? values : []);

  document.querySelectorAll(".allowed-language").forEach(input => {
    input.checked = allowed.has(input.value);
  });
}

function getAllowedLanguages() {
  return [...document.querySelectorAll(".allowed-language:checked")]
    .map(input => input.value)
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function makeElement(tag, { className = "", text = null, attrs = {}, dataset = {} } = {}, children = []) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== null && text !== undefined) el.textContent = String(text);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (value === true) el.setAttribute(name, "");
    else el.setAttribute(name, String(value));
  }
  for (const [name, value] of Object.entries(dataset || {})) {
    if (value !== null && value !== undefined) el.dataset[name] = String(value);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function setEmptyState(host, text) {
  if (!host) return;
  host.replaceChildren(makeElement("div", { className: "bot-manager-empty", text }));
}


// Converts common Unicode "fancy text" letters and digits to ASCII even on
// older Android WebViews where String.normalize("NFKC") can be incomplete.
function normalizeMathematicalLatinFallback(value) {
  const ranges = [
    [0x2102, 0x2102, 0x43], [0x210A, 0x210A, 0x67],
    [0x210B, 0x210B, 0x48], [0x210C, 0x210C, 0x48],
    [0x210D, 0x210D, 0x48], [0x210E, 0x210E, 0x68],
    [0x2110, 0x2110, 0x49], [0x2111, 0x2111, 0x49],
    [0x2112, 0x2112, 0x4C], [0x2113, 0x2113, 0x6C],
    [0x2115, 0x2115, 0x4E], [0x2119, 0x211B, 0x50],
    [0x211C, 0x211C, 0x52], [0x211D, 0x211D, 0x52],
    [0x2124, 0x2124, 0x5A], [0x2128, 0x2128, 0x5A],
    [0x212A, 0x212A, 0x4B], [0x212C, 0x212D, 0x42],
    [0x212F, 0x212F, 0x65], [0x2130, 0x2131, 0x45],
    [0x2133, 0x2133, 0x4D], [0x2134, 0x2134, 0x6F],
    [0x2139, 0x2139, 0x69], [0x2145, 0x2145, 0x44],
    [0x2146, 0x2147, 0x64], [0x2148, 0x2149, 0x69],
    [0x1D400, 0x1D419, 0x41], [0x1D41A, 0x1D433, 0x61],
    [0x1D434, 0x1D44D, 0x41], [0x1D44E, 0x1D454, 0x61],
    [0x1D456, 0x1D467, 0x69], [0x1D468, 0x1D481, 0x41],
    [0x1D482, 0x1D49B, 0x61], [0x1D49C, 0x1D49C, 0x41],
    [0x1D49E, 0x1D49F, 0x43], [0x1D4A2, 0x1D4A2, 0x47],
    [0x1D4A5, 0x1D4A6, 0x4A], [0x1D4A9, 0x1D4AC, 0x4E],
    [0x1D4AE, 0x1D4B5, 0x53], [0x1D4B6, 0x1D4B9, 0x61],
    [0x1D4BB, 0x1D4BB, 0x66], [0x1D4BD, 0x1D4C3, 0x68],
    [0x1D4C5, 0x1D4CF, 0x70], [0x1D4D0, 0x1D4E9, 0x41],
    [0x1D4EA, 0x1D503, 0x61], [0x1D504, 0x1D505, 0x41],
    [0x1D507, 0x1D50A, 0x44], [0x1D50D, 0x1D514, 0x4A],
    [0x1D516, 0x1D51C, 0x53], [0x1D51E, 0x1D537, 0x61],
    [0x1D538, 0x1D539, 0x41], [0x1D53B, 0x1D53E, 0x44],
    [0x1D540, 0x1D544, 0x49], [0x1D546, 0x1D546, 0x4F],
    [0x1D54A, 0x1D550, 0x53], [0x1D552, 0x1D56B, 0x61],
    [0x1D56C, 0x1D585, 0x41], [0x1D586, 0x1D59F, 0x61],
    [0x1D5A0, 0x1D5B9, 0x41], [0x1D5BA, 0x1D5D3, 0x61],
    [0x1D5D4, 0x1D5ED, 0x41], [0x1D5EE, 0x1D607, 0x61],
    [0x1D608, 0x1D621, 0x41], [0x1D622, 0x1D63B, 0x61],
    [0x1D63C, 0x1D655, 0x41], [0x1D656, 0x1D66F, 0x61],
    [0x1D670, 0x1D689, 0x41], [0x1D68A, 0x1D6A3, 0x61],
    [0x1D7CE, 0x1D7D7, 0x30], [0x1D7D8, 0x1D7E1, 0x30],
    [0x1D7E2, 0x1D7EB, 0x30], [0x1D7EC, 0x1D7F5, 0x30],
    [0x1D7F6, 0x1D7FF, 0x30]
  ];

  let output = "";

  for (const character of String(value || "")) {
    const codePoint = character.codePointAt(0);
    let replacement = character;

    for (const [start, end, asciiStart] of ranges) {
      if (codePoint < start || codePoint > end) continue;
      replacement = String.fromCharCode(asciiStart + (codePoint - start));
      break;
    }

    output += replacement;
  }

  return output;
}

function normalizeTextPreviewValue(value) {
  const settings = readTextNormalizationSettingsFromPage();
  let text = String(value || "");

  if (!settings.textNormalizationEnabled) return text.trim();

  if (settings.normalizeInvisibleCharacters) {
    text = text
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
      .replace(/[\u00AD]/g, "");
  }

  if (settings.normalizeFancyUnicode) {
    if (typeof text.normalize === "function") {
      try {
        text = text.normalize("NFKC");
      } catch {}
    }
    text = normalizeMathematicalLatinFallback(text);
  }

  if (settings.normalizePunctuation) {
    text = text
      .replace(/[‘’‚‛`´]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[‐‑‒–—―]/g, "-")
      .replace(/[⁄∕]/g, "/")
      .replace(/[…]/g, "...")
      .replace(/[•·∙]/g, " ");
  }

  if (settings.normalizeDecorativeSymbols) {
    text = text
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, " ")
      .replace(/[★☆✦✧✩✪✫✬✭✮✯✰♡♥❤💕💖💗💘💝💞💟]/gu, " ")
      .replace(/[꧁꧂◦°⋆]+/gu, " ")
      .replace(/[\u{13000}-\u{1342F}]/gu, " ")
      .replace(/[\u08E3-\u0902₊₋₌⁺⁻⁼]+/gu, " ")
      .replace(/[|｜¦]+/g, " | ");
  }

  return text.replace(/\s+/g, " ").trim();
}

function displayNormalizedSavedText(value) {
  return normalizeTextPreviewValue(value);
}

function splitManagerSearchTerms(value) {
  const raw = displayNormalizedSavedText(value || "").toLowerCase();
  return raw.split(",")
    .map(term => term.replace(/\s+/g, " " ).trim())
    .filter(Boolean)
    .slice(0, 20);
}

function managerHaystackMatchesTerms(haystack, terms) {
  if (!Array.isArray(terms) || !terms.length) return true;
  const text = displayNormalizedSavedText(haystack || "").toLowerCase();
  return terms.every(term => text.includes(term));
}

function readTextNormalizationSettingsFromPage() {
  return {
    textNormalizationEnabled: checked("textNormalizationEnabled"),
    normalizeFancyUnicode: checked("normalizeFancyUnicode"),
    normalizePunctuation: checked("normalizePunctuation"),
    normalizeInvisibleCharacters: checked("normalizeInvisibleCharacters"),
    normalizeDecorativeSymbols: checked("normalizeDecorativeSymbols")
  };
}

function updateTextNormalizationPreview() {
  const input = $("textNormalizationPreviewInput");
  const output = $("textNormalizationPreviewOutput");
  if (!input || !output) return;

  output.textContent = normalizeTextPreviewValue(input.value || "");
}

function setVersionText() {
  const versionEl = $("versionText");
  if (!versionEl) return;

  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version_name || displayReleaseVersion(manifest.version)}`;
}

function resetHeavySavedDataState() {
  blockingDataLoaded = false;
  savedListsDataLoaded = false;
  blockingDataLoadPromise = null;
  savedListsDataLoadPromise = null;
  blockedState = { ids: [], names: [], meta: {} };
  notInterestedState = { ids: [], meta: {} };
  quickDislikeHistoryState = { version: 1, bots: {} };
  quickDislikeBulkState = { version: 1, status: "idle", pendingIds: [], failedIds: [], startedAt: 0, updatedAt: 0, currentId: "", lastMode: "remaining" };
  currentOpened = [];
  openedChatMetaState = {};
  favoriteCreatorState = { handles: [], meta: {} };
  followedCreatorState = { handles: [], meta: {} };
  creatorBotWatchState = { version: 1, creators: {}, recent: [], lastRunAt: 0, lastScanAt: 0, lastDurationMs: 0, lastCheckedCreators: 0, lastNewCount: 0, lastFailureCount: 0, lastReason: "", lastWebhookAt: 0, lastWebhookError: "" };
  creatorBotWebhookState = { enabled: false, url: "" };
  favoriteBotState = { ids: [], meta: {} };
  laterBotState = { ids: [], meta: {} };
  recentlySeenBotState = { entries: [] };
  botOrganizationState = { meta: {} };
  botAvailabilityState = { meta: {} };
  botArchiveState = { meta: {} };
}

async function ensureBlockingDataLoaded() {
  if (blockingDataLoaded) return true;
  if (blockingDataLoadPromise) return blockingDataLoadPromise;

  blockingDataLoadPromise = (async () => {
    const result = await storageGet(["settings", ...BLOCKING_DATA_KEYS]);
    const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
    blockedState = normalizeBotStore(result[BLOCKED_BOTS_KEY]);
    blockedState.ids = uniqueClean([...(settings.blockedBotIds || []), ...blockedState.ids]);
    blockedState.names = uniqueClean([...(settings.blockedBotNames || []), ...blockedState.names]);
    notInterestedState = normalizeBotStore(result[NOT_INTERESTED_KEY]);
    quickDislikeHistoryState = normalizeQuickDislikeHistory(result[QUICK_DISLIKE_HISTORY_KEY]);
    quickDislikeBulkState = normalizeQuickDislikeBulkState(result[QUICK_DISLIKE_BULK_STATE_KEY]);
    blockingDataLoaded = true;
    return true;
  })().finally(() => {
    blockingDataLoadPromise = null;
  });
  return blockingDataLoadPromise;
}

async function ensureSavedListsDataLoaded() {
  if (savedListsDataLoaded) return true;
  if (savedListsDataLoadPromise) return savedListsDataLoadPromise;

  savedListsDataLoadPromise = (async () => {
    const result = await storageGet(SAVED_LIST_DATA_KEYS);
    currentOpened = Array.isArray(result[OPENED_KEY]) ? result[OPENED_KEY] : [];
    openedChatMetaState = normalizeMetaStore(result[OPENED_META_KEY]);
    favoriteCreatorState = normalizeCreatorStore(result[FAVORITE_CREATORS_KEY]);
    followedCreatorState = normalizeCreatorStore(result[FOLLOWED_CREATORS_KEY]);
    creatorBotWatchState = normalizeCreatorBotWatchState(result[CREATOR_BOT_WATCH_KEY]);
    favoriteBotState = normalizeBotStore(result[FAVORITE_BOTS_KEY]);
    laterBotState = normalizeBotStore(result[LATER_BOTS_KEY]);
    recentlySeenBotState = normalizeRecentlySeenStore(result[RECENTLY_SEEN_BOTS_KEY]);
    botOrganizationState = normalizeBotOrganization(result[BOT_ORGANIZER_KEY]);
    botAvailabilityState = normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]);
    botArchiveState = normalizeBotArchive(result[BOT_ARCHIVE_KEY]);
    await ensureBlockingDataLoaded();
    const blockedPriorityCleanup = enforceBlockedPriorityOverOpenedState({ markDirty: false });
    if (blockedPriorityCleanup.removed) {
      await storageSet({
        [OPENED_KEY]: blockedPriorityCleanup.ids,
        [OPENED_META_KEY]: blockedPriorityCleanup.meta
      });
    }
    if ($("openedCount")) $("openedCount").textContent = `${currentOpened.length} stored`;
    savedListsDataLoaded = true;
    invalidateDuplicateCache();
    return true;
  })().finally(() => {
    savedListsDataLoadPromise = null;
  });
  return savedListsDataLoadPromise;
}

async function ensureHeavySavedDataLoaded(tabName = "all") {
  if (tabName === "blocking") return ensureBlockingDataLoaded();
  // Saved Bots Hub includes Blocked and Not Interested status, so the Saved
  // tab needs both stores even though the dedicated blocking managers remain
  // lazily rendered only on Discovery & Filters.
  if (tabName === "saved") {
    await Promise.all([ensureBlockingDataLoaded(), ensureSavedListsDataLoaded()]);
    return true;
  }
  await Promise.all([ensureBlockingDataLoaded(), ensureSavedListsDataLoaded()]);
  return true;
}

async function renderHeavyManagersForTab(tabName) {
  if (!optionsDataLoaded || !["saved", "blocking"].includes(tabName)) return;
  if (renderedHeavyTabs.has(tabName)) return;

  const token = ++heavyRenderToken;
  const loadingHosts = tabName === "saved"
    ? ["savedBotsHubManager", "favoriteCreatorManager", "followedCreatorManager", "creatorBotRecentList", "favoriteBotManager", "laterBotManager", "openedBotManager", "botAvailabilityManager"]
    : ["blockedBotManager", "notInterestedBotManager"];
  loadingHosts.forEach(id => {
    const host = $(id);
    if (host && !host.children.length) setEmptyState(host, "Loading saved data...");
  });

  await ensureHeavySavedDataLoaded(tabName);
  if (token !== heavyRenderToken || activeOptionsTab() !== tabName) return;
  const renderers = tabName === "saved"
    ? [
        renderSavedBotsHub,
        renderFavoriteCreators,
        renderFollowedCreators,
        renderCreatorBotWatchStatus,
        () => renderBotManager("favorite"),
        () => renderBotManager("later"),
        () => renderBotManager("opened"),
        renderBotAvailability
      ]
    : [
        () => renderBotManager("blocked"),
        () => renderBotManager("notInterested")
      ];

  // Yield between managers so opening a tab never locks the entire options
  // page while several thousand saved entries are being normalized/sorted.
  // Prefer actual browser idle time when available; requestAnimationFrame alone
  // can still put a large manager render directly into a frame the user needs.
  for (const render of renderers) {
    await nextOptionsIdleSlice();
    if (token !== heavyRenderToken || activeOptionsTab() !== tabName) return;
    render();
  }

  renderedHeavyTabs.add(tabName);
}

function setActiveTab(tabName) {
  document.querySelectorAll(".tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  document.querySelectorAll(".tab-page").forEach(page => {
    page.classList.toggle("active", page.dataset.page === tabName);
  });

  const footer = $("settingsFooter");
  if (footer) footer.classList.toggle("hidden", tabName === "help" || tabName === "changelog");

  sessionStorage.setItem("spicychatQolOptionsTab", tabName);

  // Lightweight pages can become usable before the large saved-data load is
  // finished. Heavy managers render only after their tab is actually opened.
  if (tabName === "changelog") loadChangelog();
  if (tabName === "features") DS_FEATURE_INDEX_REFRESH?.();
  if (tabName === "bot-tools") loadCreatorBackupManager().catch(() => {});
  if (tabName === "control" && optionsDataLoaded) setupControlCenterView().catch(() => {});
  if (tabName === "data" && optionsDataLoaded) { refreshStorageUsage().catch(() => {}); renderLocalChangeHistory().catch(() => {}); }
  renderHeavyManagersForTab(tabName);
}

function setupTabs() {
  document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });

  const savedTab = sessionStorage.getItem("spicychatQolOptionsTab");
  const hashTab = String(location.hash || "").replace(/^#/, "");
  const validTabs = new Set([...document.querySelectorAll(".tab-button")].map(button => button.dataset.tab));
  setActiveTab(validTabs.has(hashTab) ? hashTab : (validTabs.has(savedTab) ? savedTab : "general"));
}


function setupPageIntros() {
  document.querySelectorAll(".tab-page").forEach(page => {
    const tabName = page.dataset.page || "";
    const text = PAGE_INTROS[tabName];
    if (!text || page.querySelector(":scope > .page-intro")) return;
    const intro = document.createElement("p");
    intro.className = "page-intro";
    intro.textContent = text;
    page.prepend(intro);
  });
}

function cardSearchText(card) {
  // textContent does not force style/layout calculation for every hidden tab.
  // innerText did, which made Options startup increasingly expensive as more
  // settings cards were added.
  return String(card?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function setSettingsSearchExpanded(expanded, { focus = false } = {}) {
  const card = $("settingsSearchCard");
  const toggle = $("settingsSearchToggle");
  const body = $("settingsSearchBody");
  if (!card || !toggle || !body) return;
  const open = !!expanded;
  card.classList.toggle("is-collapsed", !open);
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  body.hidden = !open;
  if (open && focus) window.setTimeout(() => $("settingsSearch")?.focus(), 0);
}

function setupSettingsSearch() {
  const SEARCH_ALIASES = {
    autoFillListings: "refill fill page listing autofill hidden cards",
    showListingRefillButton: "refill fill now manual listing",
    showListingFilterStats: "bot blocking filters blocked filtered bots result count stats results found listing statistics",
    showListingFilterStatsDetails: "bot blocking filters blocked filtered breakdown details language tags words creators listing statistics",
    autoLoadMyCreations: "my creations automatic auto load more bots pages creator",
    myCreationsAutoLoadPages: "my creations auto load more pages batches count",
    enableChatBackgrounds: "background wallpaper image custom chat",
    chatBackgroundFit: "background cover contain tile repeat",
    chatBackgroundPosition: "background alignment position",
    enableCreationAudit: "creator creation qa audit tags placeholders definition",
    showMessageTimestamps: "timestamp time date messages",
    enableMessageBookmarks: "bookmark pin saved message jump",
    blockedBotSearch: "block blocked manager dislike",
    favoriteBotSearch: "favorites favourite liked bots manager",
    laterBotSearch: "later saved bots manager",
    settingsJson: "backup restore import export json",
    enableReplyInstructions: "reply response instruction instructions style shorter length emoji roleplay ooc persistent bot behavior",
    enableGlobalMemory: "global memory baseline notes all chats universal memory recurring facts behavior ooc",
    enableRpStateTracker: "roleplay state tracker inventory equipment worn clothing stats hp health gold currency current location quest objective party injury status",
    enableLorebookConsistency: "lorebook response consistency post response keyword outgoing ai self lookup continuity",
    enableRpFormatRepair: "roleplay rp formatting repair asterisk dialogue",
    showChatSearch: "find search current chat messages regex",
    enableBulkCardBlocking: "select bots bulk blocking multi select bot cards home recommendations creator pages",
    bulkCardBlockingSidebarLauncher: "select bots placement narrow by group size sidebar",
    rememberBotImagePrompt: "remember save restore chatbot character image generation prompt edit editor refresh",
    settingsNavigationStyle: "settings layout navigation tabs classic grouped categories options appearance",
  settingsContentLayout: "settings layout cards single column adaptive columns two column options appearance",
  settingsPageWidth: "settings layout width comfortable wide full page options appearance",
  collapseSettingsSectionsByDefault: "settings sections collapsed collapse options dropdown dropdowns accordion accordions less scrolling compact settings",
    enableCommandPalette: "command palette ctrl k shortcut quick search navigation actions control center",
    commandPaletteShortcut: "keyboard shortcut hotkey ctrl k command palette",
    commandPaletteShowSavedItems: "command palette saved bots lorebooks personas favorites later",
    qolInterfaceScale: "accessibility text size font size larger bigger settings interface ui eye strain readability",
    chatTextScale: "accessibility chat message text font size larger bigger eye strain readability",
    chatLineSpacing: "accessibility chat line spacing comfortable spacious readability eye strain",
    chatListBlockedFilter: "chat list blocked bots filter blocked state"
  };

  const GENERIC_SEARCH_TERMS = "setting settings option options preference preferences pref control controls configuration config";
  const GENERIC_QUERY_TERMS = new Set(GENERIC_SEARCH_TERMS.split(/\s+/));
  const featureRegistry = Array.isArray(window.SpicyChatQoLFeatureRegistry) ? window.SpicyChatQoLFeatureRegistry : [];

  function registrySearchTextFor(controlId, targetId, cardId) {
    const id = String(controlId || targetId || "");
    const parts = [];
    for (const entry of featureRegistry) {
      const settings = Array.isArray(entry?.settings) ? entry.settings : [];
      const matched = (id && (entry?.setting === id || settings.includes(id) || entry?.target === id)) || (cardId && entry?.target === cardId);
      if (!matched) continue;
      parts.push(entry.name, entry.category, entry.description, ...(entry.aliases || []));
    }
    return parts.filter(Boolean).join(" ");
  }

  const input = $("settingsSearch");
  const host = $("settingsSearchResults");
  const toggle = $("settingsSearchToggle");
  if (!input || !host) return;

  // The first activation lazily builds the cross-tab search index. Keep the
  // user's expanded state while that second-stage setup runs; otherwise an
  // empty search box immediately collapses again after the first click.
  const firstSetup = !input.dataset.dsSearchIndexReady;
  if (firstSetup) {
    setSettingsSearchExpanded(!!input.value.trim());
  }

  if (firstSetup) {
    input.dataset.dsSearchIndexReady = "1";
    const activate = () => {
      if (input.dataset.dsSearchActivating === "1") return;
      input.dataset.dsSearchActivating = "1";
      setSettingsSearchExpanded(true, { focus: true });
      window.setTimeout(() => { delete input.dataset.dsSearchActivating; setupSettingsSearch(); }, 0);
    };
    toggle?.addEventListener("click", activate, { once: true });
    input.addEventListener("focus", activate, { once: true });
    return;
  }
  toggle?.addEventListener("click", () => {
    const card = $("settingsSearchCard");
    const currentlyOpen = !card?.classList.contains("is-collapsed");
    if (currentlyOpen && input.value.trim()) { input.focus(); return; }
    setSettingsSearchExpanded(!currentlyOpen, { focus: !currentlyOpen });
  });
  input.addEventListener("focus", () => setSettingsSearchExpanded(true));

  function cleanSearchText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nearestSubheading(target, card) {
    let found = "";
    card.querySelectorAll("h3").forEach(heading => {
      if (heading === target || (heading.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        found = cleanSearchText(heading.textContent);
      }
    });
    return found;
  }

  function targetLabel(target) {
    if (!target) return "Setting";
    if (target.matches("label")) return cleanSearchText(target.textContent);
    if (target.matches("button")) return cleanSearchText(target.textContent || target.getAttribute("aria-label"));
    const label = target.closest("label");
    if (label) return cleanSearchText(label.textContent);
    return cleanSearchText(target.textContent || target.getAttribute?.("aria-label")) || "Setting";
  }

  const items = [];
  let itemIndex = 0;

  document.querySelectorAll(".tab-page .card").forEach(card => {
    const page = card.closest(".tab-page");
    const tabName = page?.dataset.page || "general";
    if (tabName === "features") return;
    const tabButton = document.querySelector(`.tab-button[data-tab="${CSS.escape(tabName)}"]`);
    const tabLabel = cleanSearchText(tabButton?.textContent) || tabName;
    const cardHeading = cleanSearchText(card.querySelector(":scope > h2 .settings-card-toggle")?.textContent || card.querySelector(":scope > h2")?.textContent || card.querySelector("h2")?.textContent) || "Settings";
    const seenTargets = new Set();

    const addItem = (target, kind = "setting") => {
      if (!target || seenTargets.has(target)) return;
      seenTargets.add(target);

      const label = targetLabel(target);
      if (!label) return;
      const subheading = nearestSubheading(target, card);
      const control = target.matches("input, select, textarea, button")
        ? target
        : target.querySelector("input, select, textarea, button");
      const controlMeta = cleanSearchText([
        control?.id,
        control?.name,
        control?.getAttribute?.("aria-label"),
        control?.getAttribute?.("placeholder")
      ].filter(Boolean).join(" "));
      const nearbyHint = cleanSearchText(
        target.nextElementSibling?.classList?.contains("hint")
          ? target.nextElementSibling.textContent
          : ""
      );
      const aliases = cleanSearchText(SEARCH_ALIASES[control?.id] || SEARCH_ALIASES[target?.id] || "");
      const registryText = cleanSearchText(registrySearchTextFor(control?.id, target?.id, card.id));
      const searchText = kind === "action"
        ? cleanSearchText([subheading, label, GENERIC_SEARCH_TERMS].filter(Boolean).join(" ")).toLowerCase()
        : cleanSearchText([
            tabLabel,
            cardHeading,
            subheading,
            label,
            controlMeta,
            nearbyHint,
            aliases,
            registryText,
            kind !== "card" ? GENERIC_SEARCH_TERMS : ""
          ].filter(Boolean).join(" ")).toLowerCase();

      items.push({
        index: itemIndex++,
        target,
        control,
        card,
        tabName,
        tabLabel,
        cardHeading,
        subheading,
        label,
        kind,
        searchText,
        targetText: cleanSearchText([subheading, label, controlMeta].filter(Boolean).join(" ")).toLowerCase()
      });
    };

    // Index the individual setting/control first. This is the important part:
    // search results now point to the exact checkbox/select/button instead of
    // only knowing which large card contains the words.
    card.querySelectorAll("label").forEach(label => addItem(label, "setting"));
    card.querySelectorAll("button").forEach(button => {
      if (button.closest("label, .settings-search-results")) return;
      const text = cleanSearchText(button.textContent || button.getAttribute("aria-label"));
      if (!text) return;
      addItem(button, "action");
    });

    // Keep one card-level fallback so searches for explanatory hint text still
    // work even when that wording is not part of a specific control label.
    items.push({
      index: itemIndex++,
      target: card,
      control: null,
      card,
      tabName,
      tabLabel,
      cardHeading,
      subheading: "",
      label: cardHeading,
      kind: "card",
      searchText: cleanSearchText([cardSearchText(card), registrySearchTextFor("", card.id, card.id), GENERIC_SEARCH_TERMS].join(" ")).toLowerCase(),
      targetText: cardHeading.toLowerCase()
    });
  });

  const clearResults = () => {
    host.hidden = true;
    host.replaceChildren();
  };

  const scoreMatch = (item, query, terms) => {
    let score = 0;
    if (item.kind !== "card") score += 120;
    if (item.targetText === query) score += 1000;
    else if (item.targetText.startsWith(query)) score += 700;
    else if (item.targetText.includes(query)) score += 500;
    if (item.label.toLowerCase().includes(query)) score += 350;
    if (item.subheading.toLowerCase().includes(query)) score += 180;
    if (item.cardHeading.toLowerCase().includes(query)) score += 90;
    for (const term of terms) {
      if (item.targetText.includes(term)) score += 35;
      if (item.label.toLowerCase().startsWith(term)) score += 20;
    }
    return score;
  };

  const revealAndScrollTo = item => {
    setActiveTab(item.tabName);
    expandSettingsCardForTarget(item.target);
    recordRecentSettingsCard(item.card);

    // A matching setting can live inside a collapsed <details>. Open all of
    // those ancestors before measuring/scrolling so the browser can actually
    // land on the requested control.
    let details = item.target.closest?.("details") || null;
    while (details) {
      details.open = true;
      details = details.parentElement?.closest?.("details") || null;
    }

    document.querySelectorAll(".ds-search-target").forEach(target => target.classList.remove("ds-search-target"));

    // Tab display changes and heavy-tab rendering can alter layout. Waiting two
    // frames makes the final scroll use the setting's real post-tab position.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = item.target?.isConnected ? item.target : item.card;
      if (!target) return;
      target.classList.add("ds-search-target");

      const focusTarget = item.control?.isConnected
        ? item.control
        : target.querySelector?.("input, select, textarea, button");
      const isNativeSelect = focusTarget?.tagName === "SELECT";

      // Do not programmatically focus settings after a search jump. The old
      // delayed focus could steal focus just after the user clicked a native
      // <select>, immediately collapsing the browser's dropdown. Select targets
      // also use an instant jump so an in-progress smooth scroll cannot dismiss
      // the popup while the user is choosing an option.
      target.scrollIntoView({
        behavior: isNativeSelect ? "auto" : "smooth",
        block: "center",
        inline: "nearest"
      });

      window.setTimeout(() => target.classList.remove("ds-search-target"), 2200);
    }));
  };

  function fuzzyTermMatch(text, term) {
    const hay = String(text || "").toLowerCase();
    const needle = String(term || "").toLowerCase();
    if (!needle) return true;
    if (hay.includes(needle)) return true;
    let pos = 0;
    let gaps = 0;
    for (const ch of needle) {
      const found = hay.indexOf(ch, pos);
      if (found < 0) return false;
      gaps += found - pos;
      pos = found + 1;
    }
    return gaps <= Math.max(6, needle.length * 3);
  }

  let lastMatches = [];

  const render = () => {
    const rawQuery = String(input.value || "").trim().toLowerCase();
    const rawTerms = rawQuery.split(/\s+/).filter(Boolean);
    if (!rawTerms.length) {
      clearResults();
      return;
    }

    // Words such as "preference", "setting", "option" and "config" describe
    // what the user is searching, not the feature itself. Treat them as
    // modifiers when a more specific term is present. Previously a query like
    // "preference" accidentally favored Context Keeper because its help text
    // literally contains "preferences".
    const terms = rawTerms.filter(term => !GENERIC_QUERY_TERMS.has(term));
    const genericOnly = terms.length === 0;
    const query = terms.join(" ");

    const directItems = genericOnly
      ? items.filter(item => item.kind === "card")
      : items.filter(item => terms.every(term => item.searchText.includes(term)));
    const candidateItems = directItems.length || genericOnly
      ? directItems
      : items.filter(item => terms.every(term => fuzzyTermMatch(item.searchText, term)));
    const matches = candidateItems
      .map(item => ({ item, score: genericOnly ? 0 : scoreMatch(item, query, terms) + (directItems.includes(item) ? 0 : -120) }))
      .sort((a, b) => {
        if (genericOnly) return a.item.index - b.item.index;
        return b.score - a.score || a.item.label.length - b.item.label.length;
      })
      .slice(0, 30);

    lastMatches = matches;
    host.hidden = false;

    if (!matches.length) {
      host.replaceChildren(makeElement("div", {
        className: "settings-search-empty",
        text: `No settings matched “${rawQuery}”.`
      }));
      return;
    }

    const buttons = matches.map(({ item }) => {
      const path = [item.tabLabel, item.cardHeading];
      if (item.subheading && item.subheading !== item.cardHeading) path.push(item.subheading);
      const exact = item.kind === "card" ? item.cardHeading : item.label;
      const button = makeElement("button", {
        className: "settings-search-result",
        attrs: { type: "button" },
        dataset: { searchItemIndex: item.index }
      }, [
        makeElement("strong", { text: path.join(" › ") }),
        makeElement("small", { text: exact })
      ]);
      return button;
    });

    host.replaceChildren(...buttons);

    host.querySelectorAll(".settings-search-result").forEach(button => {
      button.addEventListener("click", () => {
        const item = items.find(candidate => candidate.index === Number(button.dataset.searchItemIndex));
        if (!item) return;
        input.value = "";
        clearResults();
        revealAndScrollTo(item);
      });
    });
  };

  const renderDebounced = debounceCallback(() => { OPTIONS_PERFORMANCE.searchRenders += 1; render(); }, 120);
  input.addEventListener("input", renderDebounced);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && lastMatches.length) {
      event.preventDefault();
      const item = lastMatches[0]?.item;
      if (item) {
        input.value = "";
        clearResults();
        revealAndScrollTo(item);
      }
      return;
    }
    if (event.key !== "Escape") return;
    input.value = "";
    clearResults();
  });

  try {
    const initial = new URLSearchParams(location.search || "").get("search") || "";
    if (initial) {
      input.value = initial;
      setTimeout(() => { render(); input.focus(); }, 80);
    }
  } catch {}
}

function applyFeatureChangeBadges(lastSeenVersion) {
  document.querySelectorAll(".feature-badge").forEach(badge => badge.remove());
  const currentVersion = chrome.runtime.getManifest?.().version || "0";
  let visible = 0;

  Object.entries(FEATURE_CHANGE_MARKERS).forEach(([id, marker]) => {
    if (compareVersions(marker.version, currentVersion) > 0) return;
    if (lastSeenVersion && compareVersions(marker.version, lastSeenVersion) <= 0) return;

    const control = $(id);
    const label = control?.closest("label");
    const target = label?.querySelector("span") || label;
    if (!target) return;

    const badge = document.createElement("span");
    badge.className = "feature-badge";
    badge.textContent = marker.label || "New";
    badge.title = `${marker.label || "Changed"} in v${displayReleaseVersion(marker.version)}`;
    target.appendChild(badge);
    visible += 1;
  });

  CARD_CHANGE_MARKERS.forEach(marker => {
    if (compareVersions(marker.version, currentVersion) > 0) return;
    if (lastSeenVersion && compareVersions(marker.version, lastSeenVersion) <= 0) return;
    const target = document.querySelector(marker.selector);
    if (!target) return;
    const badge = document.createElement("span");
    badge.className = "feature-badge";
    badge.textContent = marker.label || "New";
    badge.title = `${marker.label || "Changed"} in v${displayReleaseVersion(marker.version)}`;
    target.appendChild(badge);
    visible += 1;
  });

  const summary = $("settingsUpdateSummary");
  if (summary) {
    summary.hidden = visible === 0;
    summary.textContent = visible
      ? `${visible} setting${visible === 1 ? " is" : "s are"} new or updated since the version you last reviewed.`
      : "";
  }

  const tabBadge = $("changelogUpdateBadge");
  if (tabBadge) {
    tabBadge.hidden = visible === 0;
    tabBadge.textContent = visible ? String(visible) : "";
    tabBadge.title = visible ? `${visible} new or updated setting${visible === 1 ? "" : "s"}` : "";
  }
}

function setPageSetting(id, value) {
  const el = $(id);
  if (!el) return;
  if (el.type === "checkbox" || el.type === "radio") el.checked = !!value;
  else el.value = value;
}

async function applyPreset(name) {
  const preset = PRESET_VALUES[name];
  if (!preset) return;

  OPTIONAL_FEATURE_KEYS.forEach(key => setPageSetting(key, false));
  Object.entries(preset).forEach(([key, value]) => setPageSetting(key, value));
  setPageSetting("enabled", true);

  // Keep safety/behavior sub-options sensible even though their parent features remain opt-in.
  setPageSetting("autoAfkProtectActive", true);
  setPageSetting("autoAfkResetOnActivate", true);
  setPageSetting("autoAfkChats", true);
  setPageSetting("duplicateTabChats", true);
  setPageSetting("duplicateTabFocusExisting", true);
  setPageSetting("quickPanelEnabledByDefaultInTab", true);
  setPageSetting("quickPanelAutoCollapseOverlap", true);

  await save();
  const status = $("presetStatus");
  if (status) {
    const labels = { minimal: "Minimal", recommended: "Recommended", creator: "Creator-only" };
    status.textContent = `${labels[name] || "Quick"} setup applied and saved.`;
  }
}

async function disableOptionalFeatures() {
  OPTIONAL_FEATURE_KEYS.forEach(key => setPageSetting(key, false));
  setPageSetting("enabled", true);
  await save();
  const status = $("presetStatus");
  if (status) status.textContent = "Optional features turned off. Your saved lists and presets were kept.";
}

function setupPresets() {
  $("applyMinimalPreset")?.addEventListener("click", () => applyPreset("minimal"));
  $("applyRecommendedPreset")?.addEventListener("click", () => applyPreset("recommended"));
  $("applyCreatorPreset")?.addEventListener("click", () => applyPreset("creator"));
  $("disableOptionalFeatures")?.addEventListener("click", disableOptionalFeatures);
}

function oocNameFromText(text, index = 0) {
  const clean = String(text || "")
    .replace(/^\s*\[?OOC\s*:?\s*/i, "")
    .replace(/\]?\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean || clean === ":") return `OOC ${index + 1}`;
  return clean.length > 28 ? `${clean.slice(0, 28)}...` : clean;
}

function templatesToArray(raw) {
  return String(raw || "")
    .split(/\n\s*---\s*\n/g)
    .map(x => x.trim())
    .filter(Boolean);
}

function normalizeOocTemplates(input) {
  let items = [];

  if (Array.isArray(input)) {
    items = input;
  } else if (typeof input === "string" && input.trim()) {
    items = templatesToArray(input);
  }

  if (!items.length) {
    items = [
      { id: DEFAULT_OOC_TEMPLATE_ID, name: "Strict no-control", text: DEFAULT_OOC_TEMPLATE, builtIn: true },
      { id: HARD_OOC_TEMPLATE_ID, name: "Hard no-control + formatting", text: HARD_OOC_TEMPLATE, builtIn: true }
    ];
  }

  return items
    .map((item, index) => {
      if (typeof item === "string") {
        let text = item.trim();
        if (!text) return null;
        if (text === OLD_DEFAULT_OOC_TEMPLATE) text = DEFAULT_OOC_TEMPLATE;

        return {
          id: `ooc-${Date.now()}-${index}`,
          name: oocNameFromText(text, index),
          text
        };
      }

      if (!item || typeof item !== "object") return null;

      let text = String(item.text || item.body || item.value || "").trim();
      if (!text) return null;
      if (text === OLD_DEFAULT_OOC_TEMPLATE) text = DEFAULT_OOC_TEMPLATE;

      return {
        id: String(item.id || `ooc-${Date.now()}-${index}`),
        name: String(item.name || item.title || "").trim() || oocNameFromText(text, index),
        text,
        builtIn: item.builtIn === true
      };
    })
    .filter(Boolean);
}

function oocTemplatesFromPage() {
  const rows = [...document.querySelectorAll(".ooc-template-card")];

  return normalizeOocTemplates(
    rows.map((row, index) => ({
      id: row.dataset.oocId || `ooc-${Date.now()}-${index}`,
      name: row.querySelector(".ooc-template-name")?.value?.trim() || `OOC ${index + 1}`,
      text: row.querySelector(".ooc-template-text")?.value?.trim() || ""
    }))
  );
}

function oocInnerBody(value) {
  const text = String(value || "").trim();
  const match = text.match(/^\[OOC\s*:\s*([\s\S]*?)\]$/i);
  return match ? match[1].trim() : text;
}

function appendOocRules(baseValue, additionValue) {
  const base = String(baseValue || "").trim();
  const additionBody = oocInnerBody(additionValue);
  if (!additionBody) return base;
  const baseBody = oocInnerBody(base);
  const norm = value => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (norm(baseBody).includes(norm(additionBody))) return base;
  if (!baseBody) return `[OOC: ${additionBody}]`;
  if (/^\[OOC\s*:/i.test(base) && /\]$/.test(base)) return `[OOC: ${baseBody} ${additionBody}]`;
  return `${base}\n\n[OOC: ${additionBody}]`;
}

function renderOocTemplates(templates) {
  const host = $("oocTemplateList");
  if (!host) return;

  const normalized = normalizeOocTemplates(templates);
  const cards = normalized.map(template => {
    const card = makeElement("div", {
      className: "ooc-template-card",
      dataset: { oocId: template.id }
    });

    const head = makeElement("div", { className: "ooc-template-head" });
    const nameLabel = makeElement("label", {}, [document.createTextNode("Name")]);
    const nameInput = makeElement("input", {
      className: "ooc-template-name",
      attrs: { type: "text", placeholder: "Example: Strict no-control" }
    });
    nameInput.value = template.name;
    nameLabel.appendChild(nameInput);

    const appendHard = makeElement("button", {
      className: "ooc-template-append-hard",
      text: "+ Hard rules",
      attrs: { type: "button", title: "Append the built-in hard no-control and formatting rules without replacing this OOC" }
    });
    if (template.id === HARD_OOC_TEMPLATE_ID || template.text === HARD_OOC_TEMPLATE) appendHard.hidden = true;

    const remove = makeElement("button", {
      className: "ooc-template-remove",
      text: "×",
      attrs: { type: "button", title: "Remove this OOC" }
    });
    head.append(nameLabel, appendHard, remove);

    const textLabel = makeElement("label", {}, [document.createTextNode("Text")]);
    const textarea = makeElement("textarea", {
      className: "ooc-template-text",
      attrs: { spellcheck: "false", placeholder: "[OOC: ...]" }
    });
    textarea.value = template.text;
    textLabel.appendChild(textarea);

    card.append(head, textLabel);
    return card;
  });

  host.replaceChildren(...cards);

  host.querySelectorAll(".ooc-template-append-hard").forEach(button => {
    button.addEventListener("click", () => {
      const card = button.closest(".ooc-template-card");
      const textarea = card?.querySelector(".ooc-template-text");
      if (!textarea) return;
      const next = appendOocRules(textarea.value, HARD_OOC_TEMPLATE);
      if (next === textarea.value) {
        showSettingsToast("Those hard OOC rules are already present.");
        return;
      }
      textarea.value = next;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      showSettingsToast("Hard OOC rules appended without replacing your existing text.");
    });
  });

  host.querySelectorAll(".ooc-template-remove").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".ooc-template-card")?.remove();

      if (!host.querySelector(".ooc-template-card")) {
        renderOocTemplates([{ name: "Blank OOC", text: "[OOC: ]" }]);
      }
    });
  });
}

function addOocTemplate() {
  const current = oocTemplatesFromPage();
  current.push({ id: `ooc-${Date.now()}`, name: `OOC ${current.length + 1}`, text: "[OOC: ]" });
  renderOocTemplates(current);
}


function normalizeBotEditorSnippets(input) {
  if (!Array.isArray(input)) return [];

  const seen = new Set();
  const snippets = [];

  input.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const name = String(item.name || item.title || `Snippet ${index + 1}`).trim();
    const text = String(item.text || item.value || "").trim();
    if (!name || !text) return;

    const key = `${name.toLowerCase()}\n${text}`;
    if (seen.has(key)) return;
    seen.add(key);

    snippets.push({
      id: String(item.id || `snippet-${Date.now()}-${index}`),
      name,
      text
    });
  });

  return snippets;
}

function rawBotEditorSnippetsFromPage() {
  return [...document.querySelectorAll(".bot-editor-snippet-card")].map((row, index) => ({
    id: row.dataset.snippetId || `snippet-${Date.now()}-${index}`,
    name: row.querySelector(".bot-editor-snippet-name")?.value || "",
    text: row.querySelector(".bot-editor-snippet-text")?.value || ""
  }));
}

function botEditorSnippetsFromPage() {
  return normalizeBotEditorSnippets(rawBotEditorSnippetsFromPage());
}

function snippetCardElement(snippet) {
  const card = makeElement("div", {
    className: "bot-editor-snippet-card",
    dataset: { snippetId: snippet.id }
  });

  const head = makeElement("div", { className: "ooc-template-head" });
  const nameLabel = makeElement("label", {}, [document.createTextNode("Button name")]);
  const nameInput = makeElement("input", {
    className: "bot-editor-snippet-name",
    attrs: { type: "text", placeholder: "Example: Writing rule" }
  });
  nameInput.value = snippet.name;
  nameLabel.appendChild(nameInput);

  const remove = makeElement("button", {
    className: "bot-editor-snippet-remove",
    text: "×",
    attrs: { type: "button", title: "Remove this snippet" }
  });
  head.append(nameLabel, remove);

  const textLabel = makeElement("label", {}, [document.createTextNode("Text to insert")]);
  const textarea = makeElement("textarea", {
    className: "bot-editor-snippet-text",
    attrs: { spellcheck: "false", placeholder: "Text inserted at the cursor" }
  });
  textarea.value = snippet.text;
  textLabel.appendChild(textarea);

  card.append(head, textLabel);
  return card;
}

function bindBotEditorSnippetRemoveButtons() {
  const host = $("botEditorSnippetList");
  if (!host) return;

  host.querySelectorAll(".bot-editor-snippet-remove").forEach(button => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      button.closest(".bot-editor-snippet-card")?.remove();
      if (!host.querySelector(".bot-editor-snippet-card")) {
        setEmptyState(host, "No custom snippets saved yet.");
      }
    });
  });
}

function renderBotEditorSnippets(input) {
  const host = $("botEditorSnippetList");
  if (!host) return;

  const snippets = normalizeBotEditorSnippets(input);
  if (!snippets.length) {
    setEmptyState(host, "No custom snippets saved yet.");
    return;
  }

  host.replaceChildren(...snippets.map(snippetCardElement));
  bindBotEditorSnippetRemoveButtons();
}

function addBotEditorSnippet() {
  const host = $("botEditorSnippetList");
  if (!host) return;

  host.querySelector(".bot-manager-empty")?.remove();
  const snippet = {
    id: `snippet-${Date.now()}`,
    name: `Snippet ${host.querySelectorAll(".bot-editor-snippet-card").length + 1}`,
    text: ""
  };
  const card = snippetCardElement(snippet);
  host.appendChild(card);
  bindBotEditorSnippetRemoveButtons();
  card.querySelector(".bot-editor-snippet-name")?.focus();
}

function mergeBotEditorSnippetLists(...lists) {
  return normalizeBotEditorSnippets(lists.flatMap(list => Array.isArray(list) ? list : []));
}

function normalizeBotStore(store) {
  const raw = store && typeof store === "object" ? store : {};

  return {
    ids: uniqueClean(Array.isArray(raw.ids) ? raw.ids : []),
    names: uniqueClean(Array.isArray(raw.names) ? raw.names : []),
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {}
  };
}

function normalizeQuickDislikeHistory(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bots = source.bots && typeof source.bots === "object" ? source.bots : {};
  const normalized = {};
  Object.entries(bots).forEach(([id, value]) => {
    const botId = String(id || "").trim();
    const status = String(value?.status || "");
    if (!botId || !["disliked", "already-disliked", "already-rated-or-unavailable", "unavailable-private-or-deleted", "unavailable-creator-blocked"].includes(status)) return;
    normalized[botId] = {
      status,
      name: String(value?.name || "").slice(0, 160),
      handledAt: Number(value?.handledAt || value?.at || 0) || 0
    };
  });
  return { version: 1, bots: normalized };
}

function quickDislikeHistoryEntry(id) {
  const botId = String(id || "").trim();
  return botId ? quickDislikeHistoryState?.bots?.[botId] || null : null;
}

function quickDislikeHistoryLabel(entry) {
  if (!entry) return "";
  if (entry.status === "disliked") return "Disliked";
  if (entry.status === "already-disliked") return "Already disliked";
  if (entry.status === "already-rated-or-unavailable") return "Rating already set / unavailable";
  if (entry.status === "unavailable-private-or-deleted") return "Private/deleted/404 · cannot rate";
  if (entry.status === "unavailable-creator-blocked") return "Creator blocked · cannot rate";
  return "Handled";
}

function mergeQuickDislikeHistories(current, incoming) {
  const left = normalizeQuickDislikeHistory(current);
  const right = normalizeQuickDislikeHistory(incoming);
  const bots = { ...left.bots };
  Object.entries(right.bots).forEach(([id, entry]) => {
    const previous = bots[id];
    if (!previous || Number(entry.handledAt || 0) >= Number(previous.handledAt || 0)) bots[id] = entry;
  });
  return { version: 1, bots };
}

function normalizeQuickDislikeBulkState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const status = ["idle", "running", "paused", "completed", "completed-with-failures", "interrupted"].includes(String(source.status || ""))
    ? String(source.status)
    : "idle";
  return {
    version: 1,
    status,
    pendingIds: uniqueClean(Array.isArray(source.pendingIds) ? source.pendingIds : []),
    failedIds: uniqueClean(Array.isArray(source.failedIds) ? source.failedIds : []),
    startedAt: Number(source.startedAt || 0) || 0,
    updatedAt: Number(source.updatedAt || 0) || 0,
    currentId: String(source.currentId || "").trim(),
    lastMode: ["remaining", "resume", "failed", "selected"].includes(String(source.lastMode || "")) ? String(source.lastMode) : "remaining",
    runId: String(source.runId || "").slice(0, 120),
    stopRequested: !!source.stopRequested
  };
}

async function persistQuickDislikeBulkState(nextState) {
  quickDislikeBulkState = normalizeQuickDislikeBulkState(nextState);
  quickDislikeBulkState.updatedAt = Date.now();
  await storageSet({ [QUICK_DISLIKE_BULK_STATE_KEY]: quickDislikeBulkState });
  updateBlockedBulkResumeControls();
  return quickDislikeBulkState;
}

const BOT_AVAILABILITY_STATUSES = new Set(["available", "unavailable", "restricted", "unknown"]);
const BOT_UPDATE_STATUSES = new Set(["current", "updated"]);
const BOT_DUPLICATE_LEVELS = new Set(["exact", "likely", "possible"]);
const BOT_SNAPSHOT_FIELDS = ["name", "title", "description", "greeting", "personality", "scenario", "tags", "visibility", "creator", "image"];
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
  tags: "Tags",
  visibility: "Visibility",
  creator: "Creator",
  image: "Avatar / image"
};

function cleanBotSnapshotText(value, max = 6000) {
  if (Array.isArray(value)) {
    return uniqueClean(value.map(item => typeof item === "string" ? item : item?.name || item?.label || item?.title || ""))
      .sort((a, b) => a.localeCompare(b))
      .join(", ")
      .slice(0, max);
  }
  if (value && typeof value === "object") {
    const nested = value.name || value.username || value.handle || value.title || value.url || value.src || "";
    return cleanBotSnapshotText(nested, max);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function canonicalBotImage(value) {
  const text = cleanBotSnapshotText(value, 2000);
  if (!text) return "";
  try {
    const url = new URL(text, "https://spicychat.ai");
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return text.replace(/[?#].*$/, "");
  }
}


function cleanBotArchiveText(value, max = 14000) {
  if (Array.isArray(value)) {
    return uniqueClean(value.map(item => cleanBotArchiveText(item, 1000)))
      .filter(Boolean)
      .join(", ")
      .slice(0, max);
  }
  if (value && typeof value === "object") {
    const nested = value.name || value.username || value.handle || value.title || value.url || value.src || "";
    return cleanBotArchiveText(nested, max);
  }
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function normalizeBotVersionTags(value) {
  const values = String(value || "")
    .split(/\s*,\s*/g)
    .map(tag => cleanBotArchiveText(tag, 120))
    .filter(Boolean);
  const deduped = [...new Map(values.map(tag => [tag.toLocaleLowerCase(), tag])).values()];
  deduped.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return deduped.join(", ");
}

function normalizeBotVersionContent(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const content = {};
  for (const field of BOT_VERSION_FIELDS) {
    if (field === "image") content[field] = canonicalBotImage(source[field] || "");
    else if (field === "tags") content[field] = normalizeBotVersionTags(source[field]);
    else content[field] = cleanBotArchiveText(source[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
  }
  const lorebookRaw = source.lorebook && typeof source.lorebook === "object" ? source.lorebook : {};
  content.lorebook = {
    id: cleanBotArchiveText(lorebookRaw.id || source.lorebookId || "", 240),
    name: cleanBotArchiveText(lorebookRaw.name || source.lorebookName || "", 500)
  };
  return content;
}

function normalizeBotVersionState(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    visibility: cleanBotArchiveText(source.visibility || "", 80),
    moderation: cleanBotArchiveText(source.moderation || "", 80),
    capturedAt: Number(source.capturedAt) || 0
  };
}

function normalizeBotVersion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const content = normalizeBotVersionContent(raw.content || raw.fields || raw);
  const hasContent = BOT_VERSION_FIELDS.some(field => String(content[field] || "")) || content.lorebook.id || content.lorebook.name;
  if (!hasContent) return null;
  return {
    id: cleanBotArchiveText(raw.id || "", 120),
    number: Math.max(1, Number(raw.number) || 1),
    capturedAt: Number(raw.capturedAt) || Number(raw.savedAt) || 0,
    source: cleanBotArchiveText(raw.source || "", 120),
    label: cleanBotArchiveText(raw.label || "", 160),
    content,
    state: normalizeBotVersionState(raw.state),
    changedFields: Array.isArray(raw.changedFields)
      ? [...new Set(raw.changedFields.map(field => cleanBotArchiveText(field, 80)).filter(Boolean))]
      : []
  };
}

function normalizeBotArchiveRevision(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rawFields = raw.fields && typeof raw.fields === "object" ? raw.fields : raw;
  const fields = {};
  for (const field of BOT_ARCHIVE_FIELDS) {
    fields[field] = field === "image"
      ? canonicalBotImage(rawFields[field] || raw.image || "")
      : cleanBotArchiveText(rawFields[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
  }
  const coverage = BOT_ARCHIVE_FIELDS.filter(field => fields[field]);
  if (!coverage.length) return null;
  return {
    id: cleanBotArchiveText(raw.id || "", 120),
    capturedAt: Number(raw.capturedAt) || Number(raw.savedAt) || 0,
    source: cleanBotArchiveText(raw.source || "", 120),
    label: cleanBotArchiveText(raw.label || "", 160),
    kind: cleanBotArchiveText(raw.kind || "auto", 40) || "auto",
    fields,
    coverage
  };
}

function normalizeBotManualBackup(raw) {
  const backup = normalizeBotArchiveRevision(raw);
  if (!backup) return null;
  return {
    ...backup,
    id: backup.id || `manual-${backup.capturedAt || Date.now()}`,
    kind: "manual",
    label: backup.label || "Manual backup"
  };
}

function normalizeBotArchive(value) {
  const source = value && typeof value === "object" ? value : {};
  const rawMeta = source.meta && typeof source.meta === "object" ? source.meta : source;
  const meta = {};
  for (const [rawId, raw] of Object.entries(rawMeta || {})) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(rawId || raw.id || "").trim();
    if (!id) continue;
    const rawFields = raw.fields && typeof raw.fields === "object" ? raw.fields : raw;
    const fields = {};
    for (const field of BOT_ARCHIVE_FIELDS) {
      fields[field] = field === "image"
        ? canonicalBotImage(rawFields[field] || raw.image || "")
        : cleanBotArchiveText(rawFields[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
    }
    const coverage = BOT_ARCHIVE_FIELDS.filter(field => fields[field]);
    meta[id] = {
      id,
      name: cleanBotArchiveText(raw.name || fields.name || id, 500),
      creator: cleanBotArchiveText(raw.creator || fields.creator || "", 500),
      image: canonicalBotImage(raw.image || fields.image || ""),
      profileUrl: String(raw.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim(),
      firstSavedAt: Number(raw.firstSavedAt) || Number(raw.savedAt) || Number(raw.capturedAt) || 0,
      lastSavedAt: Number(raw.lastSavedAt) || Number(raw.savedAt) || Number(raw.capturedAt) || 0,
      lastAvailableAt: Number(raw.lastAvailableAt) || Number(raw.lastSavedAt) || 0,
      source: cleanBotArchiveText(raw.source || "", 120),
      ownBot: !!raw.ownBot,
      profileBackup: !!raw.profileBackup,
      revisions: Array.isArray(raw.revisions) ? raw.revisions.map(normalizeBotArchiveRevision).filter(Boolean).slice(0, 50) : [],
      manualBackups: Array.isArray(raw.manualBackups) ? raw.manualBackups.map(normalizeBotManualBackup).filter(Boolean).sort((a, b) => b.capturedAt - a.capturedAt) : [],
      versions: Array.isArray(raw.versions) ? raw.versions.map(normalizeBotVersion).filter(Boolean).sort((a, b) => b.number - a.number || b.capturedAt - a.capturedAt).slice(0, 50) : [],
      versionState: normalizeBotVersionState(raw.versionState),
      fields,
      coverage
    };
  }
  return { meta };
}

function mergeBotArchiveEntry(previousValue, incomingValue) {
  const id = String(incomingValue?.id || previousValue?.id || "").trim();
  if (!id) return previousValue || null;
  const previous = normalizeBotArchive({ meta: { [id]: { ...(previousValue || {}), id } } }).meta[id] || null;
  const incoming = normalizeBotArchive({ meta: { [id]: { ...(incomingValue || {}), id } } }).meta[id] || null;
  if (!incoming) return previousValue || null;
  const fields = {};
  for (const field of BOT_ARCHIVE_FIELDS) fields[field] = incoming.fields?.[field] || previous?.fields?.[field] || "";
  return {
    id,
    name: incoming.name || previous?.name || fields.name || id,
    creator: incoming.creator || previous?.creator || fields.creator || "",
    image: incoming.image || previous?.image || fields.image || "",
    profileUrl: incoming.profileUrl || previous?.profileUrl || `https://spicychat.ai/chatbot/${id}`,
    firstSavedAt: Number(previous?.firstSavedAt) || Number(incoming.firstSavedAt) || Date.now(),
    lastSavedAt: Number(incoming.lastSavedAt) || Date.now(),
    lastAvailableAt: Number(incoming.lastAvailableAt) || Date.now(),
    source: incoming.source || previous?.source || "",
    ownBot: !!(incoming.ownBot || previous?.ownBot),
    profileBackup: !!(incoming.profileBackup || previous?.profileBackup),
    revisions: Array.isArray(incoming.revisions) && incoming.revisions.length ? incoming.revisions : (previous?.revisions || []),
    manualBackups: Array.isArray(incoming.manualBackups) && incoming.manualBackups.length ? incoming.manualBackups : (previous?.manualBackups || []),
    versions: Array.isArray(incoming.versions) && incoming.versions.length ? incoming.versions : (previous?.versions || []),
    versionState: Number(incoming.versionState?.capturedAt || 0) >= Number(previous?.versionState?.capturedAt || 0)
      ? normalizeBotVersionState(incoming.versionState)
      : normalizeBotVersionState(previous?.versionState),
    fields,
    coverage: BOT_ARCHIVE_FIELDS.filter(field => fields[field])
  };
}

function mergeBotArchives(current, incoming) {
  const left = normalizeBotArchive(current);
  const right = normalizeBotArchive(incoming);
  const meta = { ...left.meta };
  for (const [id, entry] of Object.entries(right.meta)) meta[id] = mergeBotArchiveEntry(meta[id], entry);
  return normalizeBotArchive({ meta });
}

function normalizeLorebookBackups(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawMeta = source.meta && typeof source.meta === "object" ? source.meta : (source.lorebooks && typeof source.lorebooks === "object" ? source.lorebooks : {});
  const meta = {};
  for (const [rawId, rawValue] of Object.entries(rawMeta || {})) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) continue;
    const id = String(rawValue.id || rawId || "").trim().slice(0, 200);
    if (!id) continue;
    const entries = {};
    for (const [rawKey, rawEntry] of Object.entries(rawValue.entries || {})) {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
      const name = cleanBotArchiveText(rawEntry.name || rawKey, 500);
      if (!name) continue;
      const key = cleanBotArchiveText(rawEntry.key || rawKey || name.toLowerCase(), 600).toLowerCase();
      entries[key] = {
        key, name,
        keywords: uniqueClean(Array.isArray(rawEntry.keywords) ? rawEntry.keywords : String(rawEntry.keywords || "").split(/\s*,\s*/g)).slice(0, 12),
        keywordsComplete: !!rawEntry.keywordsComplete,
        hiddenKeywordCount: Math.max(0, Number(rawEntry.hiddenKeywordCount) || 0),
        content: cleanBotArchiveText(rawEntry.content, 24000),
        capturedAt: Number(rawEntry.capturedAt) || 0
      };
    }
    meta[id] = {
      id,
      name: cleanBotArchiveText(rawValue.name || id, 500),
      description: cleanBotArchiveText(rawValue.description, 4000),
      tags: uniqueClean(Array.isArray(rawValue.tags) ? rawValue.tags : String(rawValue.tags || "").split(/\s*,\s*/g)).slice(0, 12),
      visibility: cleanBotArchiveText(rawValue.visibility, 40),
      image: cleanBotArchiveText(rawValue.image, 3000),
      firstSavedAt: Number(rawValue.firstSavedAt) || 0,
      lastSavedAt: Number(rawValue.lastSavedAt) || 0,
      source: cleanBotArchiveText(rawValue.source, 120),
      entries
    };
  }
  return { version: 1, meta };
}

function mergeLorebookBackups(current, incoming) {
  const left = normalizeLorebookBackups(current);
  const right = normalizeLorebookBackups(incoming);
  for (const [id, incomingBook] of Object.entries(right.meta)) {
    const previous = left.meta[id];
    if (!previous) { left.meta[id] = incomingBook; continue; }
    const entries = { ...(previous.entries || {}) };
    for (const [key, incomingEntry] of Object.entries(incomingBook.entries || {})) {
      const old = entries[key];
      if (!old) { entries[key] = incomingEntry; continue; }
      const useIncomingKeywords = incomingEntry.keywordsComplete || !old.keywordsComplete;
      entries[key] = {
        ...old, ...incomingEntry,
        keywords: useIncomingKeywords && incomingEntry.keywords?.length ? incomingEntry.keywords : old.keywords,
        keywordsComplete: !!(old.keywordsComplete || incomingEntry.keywordsComplete),
        hiddenKeywordCount: incomingEntry.keywordsComplete ? 0 : Math.max(Number(old.hiddenKeywordCount) || 0, Number(incomingEntry.hiddenKeywordCount) || 0),
        content: incomingEntry.content || old.content
      };
    }
    left.meta[id] = {
      ...previous, ...incomingBook,
      name: incomingBook.name || previous.name,
      description: incomingBook.description || previous.description,
      tags: incomingBook.tags?.length ? incomingBook.tags : previous.tags,
      visibility: incomingBook.visibility || previous.visibility,
      image: incomingBook.image || previous.image,
      firstSavedAt: Math.min(...[previous.firstSavedAt, incomingBook.firstSavedAt].filter(Number)) || 0,
      lastSavedAt: Math.max(Number(previous.lastSavedAt) || 0, Number(incomingBook.lastSavedAt) || 0),
      entries
    };
  }
  return normalizeLorebookBackups(left);
}

function saveArchiveSnapshotForBot(idValue, snapshotValue, meta = {}) {
  const id = String(idValue || "").trim();
  if (!id || !snapshotValue || typeof snapshotValue !== "object") return false;
  const normalized = normalizeBotArchive({ meta: { [id]: { ...snapshotValue, id, ...meta } } }).meta[id];
  if (!normalized?.coverage?.length) return false;
  botArchiveState = normalizeBotArchive(botArchiveState);
  botArchiveState.meta[id] = mergeBotArchiveEntry(botArchiveState.meta[id], {
    ...normalized,
    id,
    profileUrl: meta.profileUrl || normalized.profileUrl || `https://spicychat.ai/chatbot/${id}`,
    lastSavedAt: Date.now(),
    lastAvailableAt: Date.now(),
    source: meta.source || normalized.source || "Bot Status Center"
  });
  botArchiveState = normalizeBotArchive(botArchiveState);
  return true;
}

function normalizeBotSnapshot(value) {
  const raw = value && typeof value === "object" ? value : {};
  const fields = raw.fields && typeof raw.fields === "object" ? raw.fields : raw;
  const normalized = {};
  for (const field of BOT_SNAPSHOT_FIELDS) {
    normalized[field] = field === "image"
      ? canonicalBotImage(fields[field])
      : cleanBotSnapshotText(fields[field]);
  }
  const coverage = BOT_SNAPSHOT_FIELDS.filter(field => normalized[field]);
  const strongText = [normalized.description, normalized.greeting, normalized.personality, normalized.scenario]
    .filter(Boolean).join("\n");
  return {
    capturedAt: Number(raw.capturedAt) || 0,
    source: cleanBotSnapshotText(raw.source || "", 80),
    fields: normalized,
    coverage,
    strongTextLength: strongText.length
  };
}

function snapshotHasSignal(snapshot) {
  const snap = normalizeBotSnapshot(snapshot);
  return snap.coverage.length >= 2 || snap.strongTextLength >= 40;
}

function normalizeBotChange(change) {
  if (!change || typeof change !== "object") return null;
  const field = BOT_SNAPSHOT_FIELDS.includes(String(change.field || "")) ? String(change.field) : "";
  if (!field) return null;
  return {
    field,
    before: field === "image" ? canonicalBotImage(change.before) : cleanBotSnapshotText(change.before),
    after: field === "image" ? canonicalBotImage(change.after) : cleanBotSnapshotText(change.after)
  };
}

function normalizeBotAvailability(value) {
  const source = value && typeof value === "object" ? value : {};
  const rawMeta = source.meta && typeof source.meta === "object" ? source.meta : source;
  const meta = {};

  for (const [rawId, raw] of Object.entries(rawMeta || {})) {
    const id = String(rawId || raw?.id || "").trim();
    if (!id || !raw || typeof raw !== "object") continue;
    const status = BOT_AVAILABILITY_STATUSES.has(String(raw.status || "").toLowerCase())
      ? String(raw.status).toLowerCase()
      : "unknown";
    const updateStatus = BOT_UPDATE_STATUSES.has(String(raw.updateStatus || "").toLowerCase())
      ? String(raw.updateStatus).toLowerCase()
      : "current";
    const baseline = snapshotHasSignal(raw.baseline) ? normalizeBotSnapshot(raw.baseline) : null;
    const snapshot = snapshotHasSignal(raw.snapshot) ? normalizeBotSnapshot(raw.snapshot) : null;
    const changedFields = Array.isArray(raw.changedFields)
      ? raw.changedFields.map(normalizeBotChange).filter(Boolean)
      : [];

    meta[id] = {
      id,
      name: String(raw.name || "").replace(/\s+/g, " ").trim(),
      image: String(raw.image || "").trim(),
      creator: String(raw.creator || "").replace(/\s+/g, " ").trim(),
      profileUrl: String(raw.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim(),
      chatUrl: String(raw.chatUrl || `https://spicychat.ai/chat/${id}`).trim(),
      sources: uniqueClean(Array.isArray(raw.sources) ? raw.sources : []),
      status,
      reason: String(raw.reason || "").replace(/\s+/g, " ").trim().slice(0, 500),
      httpStatus: Number(raw.httpStatus) || 0,
      checkedAt: Number(raw.checkedAt) || 0,
      baseline,
      snapshot,
      updateStatus: changedFields.length ? "updated" : updateStatus,
      changedFields,
      updateDetectedAt: Number(raw.updateDetectedAt) || 0,
      baselineAcceptedAt: Number(raw.baselineAcceptedAt) || 0
    };
  }

  return { meta };
}

function mergeBotAvailability(current, incoming) {
  const left = normalizeBotAvailability(current);
  const right = normalizeBotAvailability(incoming);
  return { meta: { ...left.meta, ...right.meta } };
}

function availabilitySourceLabel(source) {
  return ({
    favorite: "Favorites",
    later: "Later",
    organizer: "Bot Organizer",
    opened: "Opened history",
    archive: "Saved bot archive"
  })[source] || source;
}

function collectTrackedAvailabilityBots(scope = "all") {
  const byId = new Map();
  const selected = source => scope === "all" || scope === source;

  const add = (idValue, raw = {}, source = "") => {
    const id = String(idValue || raw?.id || "").trim();
    if (!id || !selected(source)) return;
    const previous = byId.get(id) || {
      id,
      name: "",
      image: "",
      creator: "",
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      chatUrl: `https://spicychat.ai/chat/${id}`,
      sources: []
    };

    const candidate = raw && typeof raw === "object" ? raw : {};
    previous.name = previous.name || String(candidate.name || candidate.title || "").replace(/\s+/g, " ").trim();
    previous.image = previous.image || String(candidate.image || candidate.avatar || "").trim();
    previous.creator = previous.creator || String(candidate.creator || candidate.creatorName || candidate.creatorHandle || "").replace(/\s+/g, " ").trim();
    previous.profileUrl = String(candidate.profileUrl || previous.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim();
    previous.chatUrl = String(candidate.chatUrl || previous.chatUrl || `https://spicychat.ai/chat/${id}`).trim();
    previous.sources = uniqueClean([...(previous.sources || []), source]);
    byId.set(id, previous);
  };

  if (selected("favorite")) {
    const store = normalizeBotStore(favoriteBotState);
    store.ids.forEach(id => add(id, store.meta[id], "favorite"));
  }
  if (selected("later")) {
    const store = normalizeBotStore(laterBotState);
    store.ids.forEach(id => add(id, store.meta[id], "later"));
  }
  if (selected("organizer")) {
    const store = normalizeBotOrganization(botOrganizationState);
    Object.entries(store.meta || {}).forEach(([id, meta]) => add(id, meta, "organizer"));
  }
  if (selected("opened")) {
    uniqueClean(currentOpened).forEach(id => add(id, openedChatMetaState?.[id], "opened"));
  }
  if (selected("archive")) {
    const store = normalizeBotArchive(botArchiveState);
    Object.entries(store.meta || {}).forEach(([id, meta]) => add(id, {
      id,
      name: meta.name || meta.fields?.name || "",
      creator: meta.creator || meta.fields?.creator || "",
      image: meta.image || meta.fields?.image || "",
      profileUrl: meta.profileUrl || `https://spicychat.ai/chatbot/${id}`
    }, "archive"));
  }

  return [...byId.values()].map(entry => ({
    ...entry,
    name: entry.name || entry.id
  }));
}

function botAvailabilityStatusLabel(status) {
  return ({
    available: "Available",
    unavailable: "Unavailable / deleted",
    restricted: "Private / restricted",
    unknown: "Unknown"
  })[status] || "Unknown";
}

function botAvailabilityVisibleText(html) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("script, style, noscript, svg").forEach(node => node.remove());
    const title = String(doc.title || "").replace(/\s+/g, " ").trim();
    const body = String(doc.body?.textContent || "").replace(/\s+/g, " ").trim();
    return { title, body: body.slice(0, 12000) };
  } catch {
    return { title: "", body: String(html || "").replace(/\s+/g, " ").trim().slice(0, 12000) };
  }
}

function readMetaContent(doc, selectors) {
  for (const selector of selectors) {
    const value = cleanBotSnapshotText(doc.querySelector(selector)?.getAttribute("content") || "", 6000);
    if (value) return value;
  }
  return "";
}

function botObjectIdMatches(obj, id) {
  const keys = ["id", "chatbotId", "chatbot_id", "characterId", "character_id", "uuid"];
  return keys.some(key => String(obj?.[key] || "").trim() === String(id));
}

function scoreBotJsonObject(obj, id) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return -1;
  let score = botObjectIdMatches(obj, id) ? 30 : 0;
  const keys = Object.keys(obj).map(key => key.toLowerCase());
  for (const token of ["name", "title", "description", "greeting", "personality", "scenario", "tags", "avatar", "image", "visibility", "creator"]) {
    if (keys.some(key => key.includes(token))) score += 2;
  }
  return score;
}

function findBestBotJsonObject(root, id) {
  let best = null;
  let bestScore = 0;
  let visited = 0;
  const stack = [{ value: root, depth: 0 }];
  while (stack.length && visited < 14000) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== "object" || depth > 14) continue;
    visited++;
    if (!Array.isArray(value)) {
      const score = scoreBotJsonObject(value, id);
      if (score > bestScore) {
        best = value;
        bestScore = score;
      }
    }
    const children = Array.isArray(value) ? value : Object.values(value);
    for (let i = Math.min(children.length, 160) - 1; i >= 0; i--) {
      const child = children[i];
      if (child && typeof child === "object") stack.push({ value: child, depth: depth + 1 });
    }
  }
  return bestScore >= 8 ? best : null;
}

function firstBotField(obj, aliases) {
  if (!obj || typeof obj !== "object") return "";
  const directKeys = Object.keys(obj);
  for (const alias of aliases) {
    const exact = directKeys.find(key => key.toLowerCase() === alias.toLowerCase());
    if (exact && obj[exact] != null) {
      const cleaned = cleanBotSnapshotText(obj[exact]);
      if (cleaned) return cleaned;
    }
  }
  return "";
}

function extractCreatorFromBotObject(obj) {
  const direct = firstBotField(obj, ["creatorName", "creatorHandle", "authorName", "username", "author", "creator"]);
  if (direct) return direct;
  for (const key of ["creator", "author", "user", "owner"]) {
    const nested = obj?.[key];
    if (nested && typeof nested === "object") {
      const value = firstBotField(nested, ["name", "username", "handle", "displayName"]);
      if (value) return value;
    }
  }
  return "";
}

function cleanBotProfileDisplayName(value) {
  return cleanBotSnapshotText(value, 500)
    .replace(/\s+-\s+Explore this AI Chatbot on Spicychat.*$/i, "")
    .replace(/\s+-\s+AI(?: Sex)? Chatbot(?:\s*\|\s*Spicychat)? .*$/i, "")
    .replace(/\s*[|\-–—]\s*Spicychat.*$/i, "")
    .trim();
}


function readableArchiveNode(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = String(node.tagName || "").toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "hr") return "\n---\n";
  const inner = [...node.childNodes].map(readableArchiveNode).join("");
  if (tag === "em" || tag === "i") return `*${inner.trim()}*`;
  return inner;
}

function extractVisibleProfileSection(doc, names) {
  const wanted = new Set((Array.isArray(names) ? names : [names]).map(name => String(name).toLowerCase()));
  for (const label of doc.querySelectorAll("p")) {
    const labelText = cleanBotArchiveText(label.textContent || "", 200).toLowerCase();
    if (!wanted.has(labelText)) continue;
    const section = label.parentElement;
    if (!section) continue;
    const candidate = [...section.children].find(child => child !== label && child.querySelector?.("p"));
    const body = candidate?.querySelector?.("p");
    if (!body) continue;
    const text = cleanBotArchiveText([...body.childNodes].map(readableArchiveNode).join("\n"), 18000);
    if (text) return text;
  }
  return "";
}

function extractJsonLdProfileMeta(doc, id) {
  const result = { description: "", creator: "", image: "" };
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = String(script.textContent || "").trim();
    if (!raw || raw.length > 500000) continue;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const url = String(item.url || "");
        const matchesBot = !id || url.includes(`/chatbot/${id}`) || String(item.name || "").trim() === cleanBotProfileDisplayName(doc.querySelector("h1")?.textContent || "");
        if (!matchesBot) continue;
        if (!result.description && item.description) result.description = cleanBotArchiveText(item.description, 5000);
        const author = item.author;
        if (!result.creator) result.creator = cleanBotArchiveText(typeof author === "string" ? author : author?.name || author?.username || "", 500);
        const image = item.image;
        if (!result.image) result.image = canonicalBotImage(typeof image === "string" ? image : image?.url || image?.contentUrl || "");
      }
    } catch {}
  }
  return result;
}

function extractVisibleProfileDescription(doc) {
  const tagsHost = doc.querySelector('[data-testid="TagSuggestion"]');
  const parent = tagsHost?.parentElement;
  if (!parent) return "";
  const children = [...parent.children];
  const start = children.indexOf(tagsHost);
  for (let i = start + 1; i < children.length; i++) {
    const child = children[i];
    if (child.matches?.("p")) {
      const text = cleanBotArchiveText(child.textContent || "", 5000);
      if (text) return text;
    }
  }
  return "";
}

function numericProfileStatFromIcon(doc, className) {
  for (const svg of doc.querySelectorAll(`svg.${className}`)) {
    const text = cleanBotArchiveText(svg.parentElement?.textContent || "", 100);
    if (/^[\d,.]+(?:\s*[kmb])?$/i.test(text) || /^\d+(?:\.\d+)?%$/.test(text)) return text;
  }
  return "";
}

function extractVisibleBotProfileData(doc, id, entry = {}) {
  const jsonLd = extractJsonLdProfileMeta(doc, id);
  const name = cleanBotProfileDisplayName(doc.querySelector("h1")?.textContent || "") ||
    cleanBotProfileDisplayName(doc.title || "") ||
    cleanBotArchiveText(entry.name || "", 500);
  const creator = cleanBotArchiveText(doc.querySelector('a[aria-label="creator-profile"]')?.textContent || jsonLd.creator || entry.creator || "", 500);
  const image = canonicalBotImage(
    doc.querySelector('img[alt="avatar image"]')?.getAttribute("src") ||
    readMetaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']) ||
    jsonLd.image ||
    entry.image ||
    ""
  );
  const tags = uniqueClean([...doc.querySelectorAll('[data-testid^="TagSuggestionItem-"], a[aria-label^="tag-"]')]
    .map(node => cleanBotArchiveText(node.textContent || "", 200))
    .filter(Boolean))
    .join(", ");
  const tokenText = cleanBotArchiveText(doc.querySelector('a[aria-label="tokens-info"]')?.textContent || "", 100)
    .replace(/\btokens?\b/i, "").trim();

  let visibility = "";
  for (const candidate of doc.querySelectorAll("span, p, div")) {
    const text = cleanBotArchiveText(candidate.textContent || "", 50).toLowerCase();
    if (["public", "unlisted", "private"].includes(text)) {
      visibility = text[0].toUpperCase() + text.slice(1);
      break;
    }
  }

  return {
    name,
    description: extractVisibleProfileDescription(doc) || jsonLd.description || "",
    greeting: extractVisibleProfileSection(doc, ["Greeting"]),
    personality: extractVisibleProfileSection(doc, ["Personality"]),
    scenario: extractVisibleProfileSection(doc, ["Scenario"]),
    exampleDialogues: extractVisibleProfileSection(doc, ["Example Dialogues", "Example Dialogue"]),
    tags,
    visibility,
    creator,
    image,
    messageCount: numericProfileStatFromIcon(doc, "lucide-message-square-text"),
    rating: numericProfileStatFromIcon(doc, "lucide-thumbs-up"),
    tokenCount: tokenText
  };
}

function extractBotArchiveSnapshot(html, id, entry = {}, stableSnapshot = null) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const visible = extractVisibleBotProfileData(doc, id, entry);
    const stable = stableSnapshot ? normalizeBotSnapshot(stableSnapshot).fields : {};
    const fields = {};
    for (const field of BOT_ARCHIVE_FIELDS) fields[field] = visible[field] || "";
    // The archive intentionally does not pull hidden definition text out of app JSON.
    // Only harmless public metadata may fall back to the update-watch snapshot.
    for (const field of ["name", "description", "tags", "visibility", "creator", "image"]) {
      if (!fields[field]) fields[field] = stable[field] || "";
    }
    return {
      id: String(id || "").trim(),
      name: fields.name || entry.name || "",
      creator: fields.creator || entry.creator || "",
      image: fields.image || entry.image || "",
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      source: "Bot Status Center profile scan",
      firstSavedAt: Date.now(),
      lastSavedAt: Date.now(),
      lastAvailableAt: Date.now(),
      fields
    };
  } catch {
    return null;
  }
}

function extractBotProfileSnapshot(html, id, entry = {}) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    let candidate = null;
    for (const script of doc.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__')) {
      const text = String(script.textContent || "").trim();
      if (!text || text.length > 3_000_000) continue;
      try {
        const parsed = JSON.parse(text);
        const found = findBestBotJsonObject(parsed, id);
        if (found && scoreBotJsonObject(found, id) > scoreBotJsonObject(candidate, id)) candidate = found;
      } catch {}
    }

    const metaName = cleanBotProfileDisplayName(readMetaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']));
    const metaDescription = readMetaContent(doc, ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]']);
    const metaImage = readMetaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']);
    const title = cleanBotProfileDisplayName(doc.title || "");
    const objectName = cleanBotProfileDisplayName(firstBotField(candidate, ["name", "title", "chatbotName", "characterName"]));
    const visible = extractVisibleBotProfileData(doc, id, entry);

    const fields = {
      name: objectName || visible.name || metaName || title || entry.name || "",
      description: firstBotField(candidate, ["description", "shortDescription", "short_description", "summary"]) || visible.description || metaDescription || "",
      greeting: firstBotField(candidate, ["greeting", "firstMessage", "first_message", "openingMessage", "opening_message", "initialMessage"]) || visible.greeting || "",
      personality: firstBotField(candidate, ["personality", "definition", "characterDefinition", "character_definition"]) || visible.personality || "",
      scenario: firstBotField(candidate, ["scenario", "context", "setting"]) || visible.scenario || "",
      tags: firstBotField(candidate, ["tags", "tagNames", "tag_names", "categories"]) || visible.tags || "",
      visibility: firstBotField(candidate, ["visibility", "privacy", "publishStatus", "publish_status"]) || visible.visibility || "",
      creator: extractCreatorFromBotObject(candidate) || visible.creator || entry.creator || "",
      image: firstBotField(candidate, ["avatar", "avatarUrl", "avatar_url", "image", "imageUrl", "image_url", "thumbnail"]) || visible.image || metaImage || entry.image || ""
    };

    const normalized = normalizeBotSnapshot({ capturedAt: Date.now(), source: candidate ? "page data + metadata" : "page metadata", fields });
    return normalized;
  } catch {
    return normalizeBotSnapshot({
      capturedAt: Date.now(),
      source: "tracked metadata",
      fields: { name: entry.name || "", creator: entry.creator || "", image: entry.image || "" }
    });
  }
}

function compareBotSnapshots(baselineValue, currentValue) {
  const baseline = normalizeBotSnapshot(baselineValue);
  const current = normalizeBotSnapshot(currentValue);
  const changes = [];
  for (const field of BOT_SNAPSHOT_FIELDS) {
    const before = baseline.fields[field] || "";
    const after = current.fields[field] || "";
    // Only call a field changed when both scans could actually read it. This avoids
    // treating a temporarily missing field as a creator edit.
    if (!before || !after || before === after) continue;
    changes.push({ field, before, after });
  }
  return changes;
}

function reconcileBotUpdate(previousValue, checkedValue) {
  const previous = previousValue && typeof previousValue === "object" ? previousValue : null;
  const checked = { ...checkedValue };
  const oldBaseline = previous?.baseline ? normalizeBotSnapshot(previous.baseline) : null;
  const snapshot = checked.snapshot && snapshotHasSignal(checked.snapshot) ? normalizeBotSnapshot(checked.snapshot) : null;

  checked.baseline = oldBaseline;
  checked.updateStatus = "current";
  checked.changedFields = [];
  checked.updateDetectedAt = Number(previous?.updateDetectedAt) || 0;
  checked.baselineAcceptedAt = Number(previous?.baselineAcceptedAt) || 0;

  if (checked.status !== "available" || !snapshot) return checked;
  if (!oldBaseline || !snapshotHasSignal(oldBaseline)) {
    checked.baseline = snapshot;
    checked.baselineAcceptedAt = Date.now();
    return checked;
  }

  const changes = compareBotSnapshots(oldBaseline, snapshot);
  if (changes.length) {
    checked.updateStatus = "updated";
    checked.changedFields = changes;
    checked.updateDetectedAt = Date.now();
  }
  return checked;
}

async function checkBotAvailability(entry) {
  const id = String(entry?.id || "").trim();
  const base = {
    id,
    name: String(entry?.name || id).replace(/\s+/g, " ").trim(),
    image: String(entry?.image || "").trim(),
    creator: String(entry?.creator || "").replace(/\s+/g, " ").trim(),
    profileUrl: `https://spicychat.ai/chatbot/${id}`,
    chatUrl: String(entry?.chatUrl || `https://spicychat.ai/chat/${id}`).trim(),
    sources: uniqueClean(entry?.sources || []),
    checkedAt: Date.now(),
    httpStatus: 0,
    snapshot: null
  };

  if (!id) return { ...base, status: "unknown", reason: "Missing bot ID." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(base.profileUrl, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    base.httpStatus = Number(response.status) || 0;

    if (response.status === 404 || response.status === 410) {
      return { ...base, status: "unavailable", reason: `Profile returned HTTP ${response.status}.` };
    }
    if (response.status === 401 || response.status === 403) {
      return { ...base, status: "restricted", reason: `Profile returned HTTP ${response.status}.` };
    }
    if (response.status === 429) {
      return { ...base, status: "unknown", reason: "SpicyChat rate-limited the check (HTTP 429)." };
    }
    if (!response.ok) {
      return { ...base, status: "unknown", reason: `Profile check returned HTTP ${response.status}.` };
    }

    const finalUrl = String(response.url || "");
    if (/\/(login|signin|sign-in|auth)(?:[/?#]|$)/i.test(finalUrl)) {
      return { ...base, status: "restricted", reason: "Profile redirected to sign-in/authentication." };
    }

    const html = await response.text();
    const visible = botAvailabilityVisibleText(html);
    const title = visible.title.toLowerCase();
    const body = visible.body.toLowerCase();
    const combined = `${title}\n${body}`;

    const unavailablePhrases = [
      "chatbot not found",
      "character not found",
      "this chatbot is unavailable",
      "this character is unavailable",
      "chatbot is unavailable",
      "character is unavailable",
      "this chatbot has been deleted",
      "this character has been deleted",
      "couldn't find this chatbot",
      "could not find this chatbot",
      "page does not exist",
      "page doesn't exist"
    ];
    const restrictedPhrases = [
      "this chatbot is private",
      "this character is private",
      "private chatbot",
      "private character",
      "you do not have access",
      "you don't have access",
      "access denied",
      "not available in your region",
      "not available in your country"
    ];

    const unavailablePhrase = unavailablePhrases.find(phrase => combined.includes(phrase));
    if (unavailablePhrase || /(^|\s)404(?:\s|$)/.test(title)) {
      return { ...base, status: "unavailable", reason: unavailablePhrase ? `Page says “${unavailablePhrase}”.` : "Profile page title indicates 404/not found." };
    }

    const restrictedPhrase = restrictedPhrases.find(phrase => combined.includes(phrase));
    if (restrictedPhrase) {
      return { ...base, status: "restricted", reason: `Page says “${restrictedPhrase}”.` };
    }

    const snapshot = extractBotProfileSnapshot(html, id, entry);
    const archiveSnapshot = extractBotArchiveSnapshot(html, id, entry, snapshot);
    const fields = snapshot.fields || {};
    const archiveCoverage = archiveSnapshot
      ? (normalizeBotArchive({ meta: { [id]: archiveSnapshot } }).meta[id]?.coverage?.length || 0)
      : 0;
    return {
      ...base,
      name: fields.name || base.name,
      image: fields.image || base.image,
      creator: fields.creator || base.creator,
      snapshot,
      archiveSnapshot,
      status: "available",
      reason: `Profile loaded. Update watch captured ${snapshot.coverage.length} stable field${snapshot.coverage.length === 1 ? "" : "s"}${archiveCoverage ? `; local archive captured ${archiveCoverage} accessible field${archiveCoverage === 1 ? "" : "s"}` : ""}.`
    };
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return {
      ...base,
      status: "unknown",
      reason: aborted ? "Profile check timed out." : `Profile check failed: ${String(error?.message || error || "network error").slice(0, 180)}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDuplicateText(value) {
  return cleanBotSnapshotText(value, 8000).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function fastStringHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function botDuplicateKeys(entry) {
  const snapshot = normalizeBotSnapshot(entry.snapshot || entry.baseline || {});
  const fields = snapshot.fields || {};
  const archive = entry.archive || null;
  const archived = archive?.fields || {};
  const rawName = fields.name || archived.name || archive?.name || entry.name || "";
  const name = isPlaceholderBotName(rawName, entry.id) ? "" : normalizeDuplicateText(rawName);
  const creator = normalizeDuplicateText(fields.creator || archived.creator || archive?.creator || entry.creator || "");
  const image = canonicalBotImage(fields.image || archived.image || archive?.image || entry.image || "").toLowerCase();
  const strongParts = [
    fields.description || archived.description,
    fields.greeting || archived.greeting,
    fields.personality || archived.personality,
    fields.scenario || archived.scenario
  ].map(normalizeDuplicateText).filter(Boolean);
  const strong = strongParts.join("\n");
  return {
    name,
    creator,
    image,
    strong,
    strongKey: strong.length >= 80 ? fastStringHash(strong) : "",
    coverage: snapshot.coverage?.length ? snapshot.coverage : (archive?.coverage || [])
  };
}

function addDuplicatePair(map, a, b, level, reasons) {
  if (!a?.id || !b?.id || a.id === b.id) return;
  const rank = { possible: 1, likely: 2, exact: 3 };
  const addOne = (from, to) => {
    const current = map.get(from.id) || new Map();
    const existing = current.get(to.id);
    // The UI only displays the first 20 matches. Bound the cached match set too
    // so a generic same-name/avatar bucket cannot create hundreds of thousands
    // of objects and freeze the Settings page. Existing matches may still be
    // upgraded from Possible -> Likely -> Exact.
    if (!existing && current.size >= 20) return;
    if (!existing || rank[level] > rank[existing.level]) {
      current.set(to.id, {
        id: to.id,
        name: to.name || to.id,
        level,
        reasons: uniqueClean(reasons)
      });
    } else if (existing) {
      existing.reasons = uniqueClean([...(existing.reasons || []), ...reasons]);
    }
    map.set(from.id, current);
  };
  addOne(a, b);
  addOne(b, a);
}

function forBoundedDuplicatePairs(group, callback, neighborLimit = 20) {
  if (!Array.isArray(group) || group.length < 2) return;
  const maxNeighbors = Math.max(1, Number(neighborLimit) || 20);
  for (let i = 0; i < group.length; i++) {
    const end = Math.min(group.length, i + 1 + maxNeighbors);
    for (let j = i + 1; j < end; j++) callback(group[i], group[j]);
  }
}

function computeBotDuplicateMatches(entries) {
  const result = new Map();
  const byStrong = new Map();
  const byImage = new Map();
  const byName = new Map();
  const keys = new Map();

  const bucket = (map, key, entry) => {
    if (!key) return;
    const list = map.get(key) || [];
    list.push(entry);
    map.set(key, list);
  };

  for (const entry of entries) {
    const key = botDuplicateKeys(entry);
    keys.set(entry.id, key);
    bucket(byStrong, key.strongKey, entry);
    bucket(byImage, key.image, entry);
    bucket(byName, key.name.length >= 3 ? key.name : "", entry);
  }

  for (const group of byStrong.values()) {
    forBoundedDuplicatePairs(group, (a, b) => {
      addDuplicatePair(result, a, b, "exact", ["matching captured profile text"]);
    });
  }

  for (const group of byImage.values()) {
    forBoundedDuplicatePairs(group, (a, b) => {
      const ak = keys.get(a.id), bk = keys.get(b.id);
      if (ak.name && ak.name === bk.name) {
        addDuplicatePair(result, a, b, "likely", ["matching name", "matching avatar/image"]);
      } else if (ak.strongKey && ak.strongKey === bk.strongKey) {
        addDuplicatePair(result, a, b, "exact", ["matching captured profile text", "matching avatar/image"]);
      } else {
        addDuplicatePair(result, a, b, "possible", ["matching avatar/image"]);
      }
    });
  }

  for (const group of byName.values()) {
    forBoundedDuplicatePairs(group, (a, b) => {
      const ak = keys.get(a.id), bk = keys.get(b.id);
      if (ak.creator && ak.creator === bk.creator && ak.image && ak.image === bk.image) {
        addDuplicatePair(result, a, b, "likely", ["matching name", "matching creator", "matching avatar/image"]);
      } else {
        addDuplicatePair(result, a, b, "possible", ["matching name"]);
      }
    });
  }

  const plain = new Map();
  for (const [id, matches] of result.entries()) {
    plain.set(id, [...matches.values()].sort((a, b) => ({ exact: 0, likely: 1, possible: 2 }[a.level] ?? 9) - ({ exact: 0, likely: 1, possible: 2 }[b.level] ?? 9) || a.name.localeCompare(b.name)));
  }
  return plain;
}

function botStatusCenterBaseEntries(scope = "all") {
  const tracked = collectTrackedAvailabilityBots(scope);
  const saved = normalizeBotAvailability(botAvailabilityState).meta;
  const archives = normalizeBotArchive(botArchiveState).meta;
  const byId = new Map();
  for (const item of tracked) {
    byId.set(item.id, {
      ...item,
      status: "unknown",
      reason: item.sources?.includes("archive") ? "Saved local copy; availability has not been checked yet." : "Not checked yet.",
      checkedAt: 0,
      httpStatus: 0,
      updateStatus: "current",
      changedFields: [],
      archive: archives[item.id] || null
    });
  }
  for (const entry of Object.values(saved)) {
    const include = scope === "all" || (entry.sources || []).includes(scope) || byId.has(entry.id);
    if (!include) continue;
    const trackedEntry = byId.get(entry.id) || {};
    byId.set(entry.id, {
      ...trackedEntry,
      ...entry,
      name: entry.name || trackedEntry.name || entry.id,
      image: entry.image || trackedEntry.image || "",
      creator: entry.creator || trackedEntry.creator || "",
      sources: uniqueClean([...(trackedEntry.sources || []), ...(entry.sources || [])]),
      archive: archives[entry.id] || trackedEntry.archive || null
    });
  }
  for (const [id, archive] of Object.entries(archives)) {
    const include = scope === "all" || scope === "archive" || byId.has(id);
    if (!include) continue;
    const current = byId.get(id) || {};
    byId.set(id, {
      id,
      ...current,
      name: current.name || archive.name || archive.fields?.name || id,
      image: current.image || archive.image || archive.fields?.image || "",
      creator: current.creator || archive.creator || archive.fields?.creator || "",
      profileUrl: current.profileUrl || archive.profileUrl || `https://spicychat.ai/chatbot/${id}`,
      chatUrl: current.chatUrl || `https://spicychat.ai/chat/${id}`,
      sources: uniqueClean([...(current.sources || []), "archive"]),
      status: current.status || "unknown",
      reason: current.reason || "Saved local copy; availability has not been checked yet.",
      checkedAt: Number(current.checkedAt) || 0,
      httpStatus: Number(current.httpStatus) || 0,
      updateStatus: current.updateStatus || "current",
      changedFields: current.changedFields || [],
      archive
    });
  }
  return [...byId.values()];
}

function duplicateLevelForEntry(matches) {
  if (!matches?.length) return "";
  if (matches.some(match => match.level === "exact")) return "exact";
  if (matches.some(match => match.level === "likely")) return "likely";
  return "possible";
}

function botAvailabilityEntries(baseEntries = null, duplicateMatches = null) {
  const query = String($("botAvailabilitySearch")?.value || botAvailabilityUiState.query || "")
    .toLowerCase().replace(/\s+/g, " ").trim();
  const filter = String($("botAvailabilityStatusFilter")?.value || botAvailabilityUiState.status || "all");
  const scope = String($("botAvailabilityScope")?.value || "all");
  const base = Array.isArray(baseEntries) ? baseEntries : botStatusCenterBaseEntries(scope);
  const duplicates = duplicateMatches instanceof Map ? duplicateMatches : new Map();
  const priority = { unavailable: 0, restricted: 1, unknown: 2, available: 3 };
  const updatePriority = entry => entry.updateStatus === "updated" ? 0 : 1;

  return base
    .map(entry => ({ ...entry, duplicateMatches: duplicates.get(entry.id) || [] }))
    .filter(entry => {
      if (filter === "all") return true;
      if (filter === "updated") return entry.updateStatus === "updated";
      if (filter === "archived") return !!entry.archive;
      if (filter === "unarchived") return !entry.archive;
      if (BOT_DUPLICATE_LEVELS.has(filter)) return entry.duplicateMatches.some(match => match.level === filter);
      return entry.status === filter;
    })
    .filter(entry => {
      if (!query) return true;
      const archived = entry.archive?.fields || {};
      return [entry.name, entry.id, entry.creator, ...(entry.sources || []), entry.reason, archived.description, archived.tags, archived.visibility, ...(entry.changedFields || []).map(change => `${change.field} ${change.before} ${change.after}`), ...(entry.duplicateMatches || []).map(match => `${match.name} ${match.level} ${(match.reasons || []).join(" ")}`)]
        .join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => updatePriority(a) - updatePriority(b) || (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || Number(b.checkedAt || 0) - Number(a.checkedAt || 0) || String(a.name || "").localeCompare(String(b.name || "")));
}

function shortenedDiffValue(value) {
  const text = cleanBotSnapshotText(value, 1200);
  return text.length > 360 ? `${text.slice(0, 357)}...` : text || "(empty)";
}

function botUpdateDetails(entry) {
  if (entry.updateStatus !== "updated" || !(entry.changedFields || []).length) return null;
  const details = makeElement("details", { className: "bot-update-details" });
  details.appendChild(makeElement("summary", { text: `View ${entry.changedFields.length} detected change${entry.changedFields.length === 1 ? "" : "s"}` }));
  for (const change of entry.changedFields) {
    const block = makeElement("div", { className: "bot-update-change" });
    block.appendChild(makeElement("div", { className: "bot-update-field", text: BOT_SNAPSHOT_LABELS[change.field] || change.field }));
    block.appendChild(makeElement("div", { className: "bot-update-before", text: `Before: ${shortenedDiffValue(change.before)}` }));
    block.appendChild(makeElement("div", { className: "bot-update-after", text: `Now: ${shortenedDiffValue(change.after)}` }));
    details.appendChild(block);
  }
  return details;
}

function botDuplicateDetails(entry) {
  const matches = entry.duplicateMatches || [];
  if (!matches.length) return null;
  const details = makeElement("details", { className: "bot-duplicate-details" });
  details.appendChild(makeElement("summary", { text: `${matches.length} possible duplicate/reupload match${matches.length === 1 ? "" : "es"}` }));
  for (const match of matches.slice(0, 20)) {
    const row = makeElement("div", { className: "bot-duplicate-match" });
    row.appendChild(makeElement("span", {
      className: "bot-duplicate-badge",
      text: match.level === "exact" ? "Exact" : match.level === "likely" ? "Likely" : "Possible",
      dataset: { level: match.level }
    }));
    row.appendChild(makeElement("a", {
      text: match.name || match.id,
      attrs: { href: `https://spicychat.ai/chatbot/${match.id}`, target: "_blank", rel: "noopener noreferrer" }
    }));
    if (match.reasons?.length) row.appendChild(makeElement("span", { className: "bot-duplicate-reason", text: match.reasons.join(" + ") }));
    details.appendChild(row);
  }
  return details;
}

function botArchiveReadableText(archiveValue) {
  const archive = archiveValue && typeof archiveValue === "object" ? archiveValue : null;
  if (!archive) return "";
  const fields = archive.fields || {};
  const lines = [];
  lines.push(fields.name || archive.name || archive.id || "Saved bot");
  if (fields.creator || archive.creator) lines.push(`Creator: ${fields.creator || archive.creator}`);
  if (archive.profileUrl) lines.push(`Profile: ${archive.profileUrl}`);
  if (archive.lastSavedAt) lines.push(`Saved locally: ${new Date(archive.lastSavedAt).toLocaleString()}`);
  lines.push("");
  for (const field of BOT_ARCHIVE_FIELDS) {
    if (field === "name" || field === "creator") continue;
    const value = cleanBotArchiveText(fields[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
    if (!value) continue;
    lines.push(`${BOT_ARCHIVE_LABELS[field] || field}:`);
    lines.push(value);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function botArchiveDetails(entry) {
  const archive = entry.archive;
  if (!archive) return null;
  const details = makeElement("details", { className: "bot-update-details bot-archive-details" });
  const count = archive.coverage?.length || 0;
  details.appendChild(makeElement("summary", { text: `View saved local copy (${count} field${count === 1 ? "" : "s"})` }));
  const pre = makeElement("pre", { text: botArchiveReadableText(archive) });
  pre.style.whiteSpace = "pre-wrap";
  pre.style.overflowWrap = "anywhere";
  pre.style.margin = ".35rem 0 0";
  pre.style.font = "inherit";
  details.appendChild(pre);
  return details;
}

function safeBotExportName(archiveValue) {
  const archive = archiveValue && typeof archiveValue === "object" ? archiveValue : {};
  return String(archive.name || archive.fields?.name || archive.id || "spicychat-bot")
    .replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90) || "spicychat-bot";
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function portableBotProfileJson(archiveValue) {
  const raw = archiveValue && typeof archiveValue === "object" ? archiveValue : null;
  const id = String(raw?.id || "").trim();
  if (!id) return null;
  const archive = normalizeBotArchive({ meta: { [id]: raw } }).meta[id];
  if (!archive) return null;
  const fields = archive.fields || {};
  const organizer = normalizeBotOrganization(botOrganizationState).meta[id] || {};
  const splitTags = value => uniqueClean(String(value || "").split(/\s*,\s*/g).filter(Boolean));

  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: fields.name || archive.name || id,
      title: fields.title || "",
      description: fields.description || "",
      personality: fields.personality || "",
      scenario: fields.scenario || "",
      first_mes: fields.greeting || "",
      mes_example: fields.exampleDialogues || "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: splitTags(fields.tags),
      creator: fields.creator || archive.creator || "",
      character_version: "",
      extensions: {
        spicychat_qol: {
          export_format: "spicychat-qol-portable-profile",
          export_version: 2,
          exported_at: new Date().toISOString(),
          spicychat_id: id,
          spicychat_profile_url: archive.profileUrl || `https://spicychat.ai/chatbot/${id}`,
          avatar_url: fields.image || archive.image || "",
          visibility: fields.visibility || "",
          own_bot: !!archive.ownBot,
          revision_count: Array.isArray(archive.revisions) ? archive.revisions.length : 0,
          message_count: fields.messageCount || "",
          rating: fields.rating || "",
          token_count: fields.tokenCount || "",
          spicychat_fields: {
            title: fields.title || "",
            description: fields.description || "",
            greeting: fields.greeting || "",
            personality: fields.personality || "",
            scenario: fields.scenario || "",
            example_dialogues: fields.exampleDialogues || "",
            tags: splitTags(fields.tags),
            visibility: fields.visibility || ""
          },
          archive: {
            first_saved_at: Number(archive.firstSavedAt) || 0,
            last_saved_at: Number(archive.lastSavedAt) || 0,
            last_available_at: Number(archive.lastAvailableAt) || 0,
            source: archive.source || "",
            captured_fields: [...(archive.coverage || [])]
          },
          local: {
            favorite_history: normalizeBotStore(favoriteBotState).ids.includes(id),
            later: normalizeBotStore(laterBotState).ids.includes(id),
            folders: uniqueClean(organizer.collections || []),
            personal_tags: uniqueClean(organizer.tags || []),
            private_note: String(organizer.note || ""),
            creator_status: String(organizer.status || "")
          }
        }
      }
    }
  };
}

function downloadPortableBotProfile(archiveValue) {
  const payload = portableBotProfileJson(archiveValue);
  if (!payload) return;
  downloadJsonFile(payload, `${safeBotExportName(archiveValue)}-character-card-v2.json`);
}

function downloadBotArchiveEntry(archiveValue) {
  const archive = archiveValue && typeof archiveValue === "object" ? archiveValue : null;
  if (!archive) return;
  downloadJsonFile(archive, `${safeBotExportName(archive)}-qol-archive.json`);
}

const CREATOR_BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;
let creatorBackupManagerState = {
  bots: normalizeBotArchive(null),
  lorebooks: normalizeLorebookBackups(null),
  settings: { ...DEFAULT_SETTINGS }
};
let creatorBackupManagerLoaded = false;
let creatorBackupManagerLoading = false;
let creatorBackupPendingFocus = null;

function creatorBackupAge(timestamp) {
  const time = Number(timestamp) || 0;
  if (!time) return "not saved yet";
  const delta = Math.max(0, Date.now() - time);
  if (delta < 60_000) return "just now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function creatorBackupDate(timestamp) {
  const time = Number(timestamp) || 0;
  if (!time) return "Unknown date";
  try { return new Date(time).toLocaleString(); }
  catch { return "Unknown date"; }
}

function safeLorebookExportName(value) {
  return String(value?.name || value?.id || "spicychat-lorebook")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "spicychat-lorebook";
}

function downloadLorebookBackup(item) {
  if (!item?.id) return;
  downloadJsonFile({
    format: "spicychat-qol-lorebook-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    lorebook: item
  }, `${safeLorebookExportName(item)}-lorebook-backup.json`);
}

function creatorBackupOpen(url) {
  try { window.open(url, "_blank", "noopener,noreferrer"); }
  catch { location.href = url; }
}

async function deleteCreatorBackup(kind, id, name) {
  const label = kind === "bot" ? "chatbot" : "Lorebook";
  if (!confirm(`Delete the local QoL backup for ${name || label}? This does not delete anything on SpicyChat.`)) return;
  if (kind === "bot") {
    const current = await storageGet([BOT_ARCHIVE_KEY]);
    const store = normalizeBotArchive(current[BOT_ARCHIVE_KEY]);
    delete store.meta[id];
    await storageSet({ [BOT_ARCHIVE_KEY]: store });
  } else {
    const current = await storageGet([LOREBOOK_BACKUPS_KEY]);
    const store = normalizeLorebookBackups(current[LOREBOOK_BACKUPS_KEY]);
    delete store.meta[id];
    await storageSet({ [LOREBOOK_BACKUPS_KEY]: store });
  }
  await loadCreatorBackupManager({ force: true });
  showSettingsToast(`Deleted the local ${label} backup.`);
}

function creatorBackupFieldDiff(bot, revision) {
  const editable = ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues"];
  const current = bot?.fields || {};
  const previous = revision?.fields || {};
  return editable.map(field => {
    const before = String(previous[field] || "");
    const after = String(current[field] || "");
    if (before === after) return null;
    return { field, before, after, delta: after.length - before.length };
  }).filter(Boolean);
}

async function queueBotFieldRestore(bot, revision, fields) {
  const chosen = fields.filter(Boolean);
  if (!chosen.length) return showSettingsToast("Choose at least one field to restore.");
  const payload = {};
  for (const field of chosen) payload[field] = String(revision?.fields?.[field] || "");
  const ok = await storageSet({
    [PENDING_BOT_FIELD_RESTORE_KEY]: {
      botId: bot.id,
      botName: bot.name || bot.id,
      createdAt: Date.now(),
      revisionAt: Number(revision?.capturedAt || 0),
      fields: payload
    }
  });
  if (!ok) return showSettingsToast("Could not queue the selected backup fields.");
  creatorBackupOpen(`https://spicychat.ai/chatbot/edit/${encodeURIComponent(bot.id)}`);
  showSettingsToast("Restore queued. The editor will ask before filling those fields.");
}

async function mutateCreatorBotBackup(botId, mutate, successMessage = "Backup updated.") {
  const current = await storageGet([BOT_ARCHIVE_KEY]);
  const store = normalizeBotArchive(current[BOT_ARCHIVE_KEY]);
  const entry = store.meta[botId];
  if (!entry) return showSettingsToast("That local chatbot backup no longer exists.");
  await mutate(entry);
  const ok = await storageSet({ [BOT_ARCHIVE_KEY]: normalizeBotArchive(store) });
  if (!ok) return showSettingsToast("Could not update that local backup.");
  await loadCreatorBackupManager({ force: true });
  showSettingsToast(successMessage);
}

function revisionAsBotEntry(bot, revision) {
  return {
    ...bot,
    fields: revision?.fields || {},
    coverage: revision?.coverage || [],
    lastSavedAt: Number(revision?.capturedAt) || Number(bot.lastSavedAt) || 0,
    source: revision?.source || bot.source || "",
    revisions: [],
    manualBackups: []
  };
}

async function copyBackupJson(bot, revision) {
  const payload = portableBotProfileJson(revisionAsBotEntry(bot, revision));
  if (!payload) return showSettingsToast("Could not build JSON for that backup.");
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    showSettingsToast("Copied backup JSON to the clipboard.");
  } catch {
    showSettingsToast("Could not copy backup JSON to the clipboard.");
  }
}

function botVersionFieldValue(content, field) {
  if (field === "lorebook") {
    const id = String(content?.lorebook?.id || "");
    const name = String(content?.lorebook?.name || "");
    return name && id ? `${name} (${id})` : (name || id || "None");
  }
  return String(content?.[field] || "");
}

function botVersionAsRevision(version) {
  const content = normalizeBotVersionContent(version?.content || {});
  return {
    capturedAt: Number(version?.capturedAt) || 0,
    source: version?.source || `Bot version v${version?.number || "?"}`,
    fields: {
      name: content.name || "",
      title: content.title || "",
      greeting: content.greeting || "",
      personality: content.personality || "",
      scenario: content.scenario || "",
      exampleDialogues: content.exampleDialogues || "",
      tags: content.tags || "",
      image: content.image || ""
    },
    coverage: BOT_VERSION_FIELDS.filter(field => String(content[field] || ""))
  };
}

function creatorBotVersionDiff(previousVersion, version) {
  const before = normalizeBotVersionContent(previousVersion?.content || {});
  const after = normalizeBotVersionContent(version?.content || {});
  const fields = [...BOT_VERSION_FIELDS, "lorebook"];
  return fields.map(field => {
    const previousValue = botVersionFieldValue(before, field);
    const nextValue = botVersionFieldValue(after, field);
    if (previousValue === nextValue) return null;
    return { field, before: previousValue, after: nextValue };
  }).filter(Boolean);
}

function shortVersionValue(value, max = 700) {
  const text = String(value || "");
  if (text.length <= max) return text || "(empty)";
  return `${text.slice(0, max)}\n… (${text.length - max} more characters)`;
}

function creatorBackupVersionRow(bot, version, olderVersion) {
  const row = makeElement("div", { className: "creator-backup-revision" });
  const number = Math.max(1, Number(version?.number) || 1);
  const changed = Array.isArray(version?.changedFields) && version.changedFields.length
    ? version.changedFields
    : creatorBotVersionDiff(olderVersion, version).map(item => item.field);
  const changedText = changed.length
    ? changed.map(field => BOT_VERSION_LABELS[field] || field).join(", ")
    : (number === 1 ? "Initial captured version" : "Meaningful creator content changed");
  const label = version?.label ? ` · ${version.label}` : "";
  const stateBits = [];
  if (version?.state?.visibility) stateBits.push(version.state.visibility);
  if (version?.state?.moderation) stateBits.push(version.state.moderation);
  const stateText = stateBits.length ? ` · state: ${stateBits.join(" / ")}` : "";

  const text = makeElement("span", {
    text: `v${number} · ${creatorBackupDate(version?.capturedAt)}${label} · changed: ${changedText}${stateText}`
  });
  const actions = makeElement("span", { className: "creator-backup-row-actions" });

  const view = makeElement("button", { text: "View", attrs: { type: "button" } });
  view.addEventListener("click", () => {
    let box = row.querySelector(":scope > .creator-backup-compare[data-mode='view']");
    if (box) { box.remove(); return; }
    row.querySelectorAll(":scope > .creator-backup-compare").forEach(node => node.remove());
    box = makeElement("div", { className: "creator-backup-compare" });
    box.dataset.mode = "view";
    const content = normalizeBotVersionContent(version?.content || {});
    box.textContent = [...BOT_VERSION_FIELDS, "lorebook"]
      .map(field => `${BOT_VERSION_LABELS[field] || field}:\n${shortVersionValue(botVersionFieldValue(content, field))}`)
      .join("\n\n");
    row.appendChild(box);
  });

  const compare = makeElement("button", { text: "Compare", attrs: { type: "button" } });
  compare.addEventListener("click", () => {
    let box = row.querySelector(":scope > .creator-backup-compare[data-mode='version-compare']");
    if (box) { box.remove(); return; }
    row.querySelectorAll(":scope > .creator-backup-compare").forEach(node => node.remove());
    box = makeElement("div", { className: "creator-backup-compare" });
    box.dataset.mode = "version-compare";
    if (!olderVersion) {
      box.textContent = "This is the first locally recorded bot version, so there is no older version to compare against.";
    } else {
      const diff = creatorBotVersionDiff(olderVersion, version);
      box.textContent = diff.length
        ? diff.map(item => `${BOT_VERSION_LABELS[item.field] || item.field}\n--- v${olderVersion.number || "?"}\n${shortVersionValue(item.before)}\n+++ v${number}\n${shortVersionValue(item.after)}`).join("\n\n")
        : "No creator-content differences from the previous recorded version.";
    }
    row.appendChild(box);
  });

  const restore = makeElement("button", { text: "Restore fields", attrs: { type: "button" } });
  restore.addEventListener("click", () => {
    let box = row.querySelector(":scope > .creator-backup-restore-fields");
    if (box) { box.remove(); return; }
    const revision = botVersionAsRevision(version);
    const restorable = ["name", "title", "greeting", "personality", "scenario", "exampleDialogues", "tags"]
      .filter(field => String(revision.fields?.[field] || "").length > 0);
    box = makeElement("div", { className: "creator-backup-restore-fields" });
    if (!restorable.length) {
      box.appendChild(makeElement("span", { className: "hint", text: "This version has no editor fields available to restore." }));
      row.appendChild(box);
      return;
    }
    for (const field of restorable) {
      const input = makeElement("input", { attrs: { type: "checkbox", value: field } });
      input.checked = true;
      box.appendChild(makeElement("label", {}, [input, document.createTextNode(BOT_VERSION_LABELS[field] || field)]));
    }
    const go = makeElement("button", { text: "Open editor with selected fields", attrs: { type: "button" } });
    go.addEventListener("click", () => queueBotFieldRestore(bot, revision, [...box.querySelectorAll("input:checked")].map(input => input.value)));
    box.appendChild(go);
    row.appendChild(box);
  });

  const rename = makeElement("button", { text: "Rename", attrs: { type: "button" } });
  rename.addEventListener("click", async () => {
    const next = prompt(`Name bot version v${number}:`, version?.label || "");
    if (next == null) return;
    const labelValue = cleanBotArchiveText(next, 160);
    await mutateCreatorBotBackup(bot.id, entry => {
      const item = (entry.versions || []).find(candidate => String(candidate.id || "") === String(version.id || "") || Number(candidate.number) === number);
      if (item) item.label = labelValue;
    }, labelValue ? `Renamed bot version v${number}.` : `Cleared the name for bot version v${number}.`);
  });

  const del = makeElement("button", { text: "Delete", attrs: { type: "button" } });
  del.addEventListener("click", async () => {
    if (!confirm(`Delete bot version v${number}? Safety revisions/manual checkpoints are separate and will not be deleted.`)) return;
    await mutateCreatorBotBackup(bot.id, entry => {
      entry.versions = (entry.versions || []).filter(item => !(String(item.id || "") === String(version.id || "") || Number(item.number) === number));
    }, `Deleted bot version v${number}.`);
  });

  actions.append(view, compare, restore, rename, del);
  row.append(text, actions);
  return row;
}

function creatorBackupRevisionRow(bot, revision, index, options = {}) {
  const isManual = options.manual === true;
  const allowRestore = options.allowRestore !== false && !!bot.ownBot;
  const row = makeElement("div", { className: "creator-backup-revision" });
  const label = isManual ? (revision.label || "Manual backup") : (revision.kind === "profile" ? "Profile snapshot" : "Automatic revision");
  const text = makeElement("span", {
    text: `${label} · ${creatorBackupDate(revision.capturedAt)}${revision.source ? ` · ${revision.source}` : ""} · ${revision.coverage?.length || 0} fields`
  });
  const actions = makeElement("span", { className: "creator-backup-row-actions" });
  const exp = makeElement("button", { text: "Export", attrs: { type: "button" } });
  exp.addEventListener("click", () => {
    const payload = portableBotProfileJson(revisionAsBotEntry(bot, revision));
    if (payload) downloadJsonFile(payload, `${safeBotExportName(bot)}-${isManual ? "manual" : "revision"}-${index + 1}-character-card-v2.json`);
  });
  const copy = makeElement("button", { text: "Copy JSON", attrs: { type: "button" } });
  copy.addEventListener("click", () => copyBackupJson(bot, revision));
  const compare = makeElement("button", { text: "Compare", attrs: { type: "button" } });
  actions.append(exp, copy, compare);

  if (allowRestore) {
    const restore = makeElement("button", { text: "Restore fields", attrs: { type: "button" } });
    restore.addEventListener("click", () => {
      let box = row.querySelector(":scope > .creator-backup-restore-fields");
      if (box) { box.remove(); return; }
      const diff = creatorBackupFieldDiff(bot, revision);
      const restorable = Object.entries(revision?.fields || {})
        .filter(([field, value]) => ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues", "tags", "visibility"].includes(field) && String(value || "").length > 0)
        .map(([field]) => diff.find(item => item.field === field) || { field });
      box = makeElement("div", { className: "creator-backup-restore-fields" });
      if (!restorable.length) {
        box.appendChild(makeElement("span", { className: "hint", text: "This backup has no writing fields available to restore." }));
        row.appendChild(box);
        return;
      }
      for (const item of restorable) {
        const input = makeElement("input", { attrs: { type: "checkbox", value: item.field } });
        input.checked = true;
        box.appendChild(makeElement("label", {}, [input, document.createTextNode(BOT_ARCHIVE_LABELS[item.field] || item.field)]));
      }
      const go = makeElement("button", { text: "Open editor with selected fields", attrs: { type: "button" } });
      go.addEventListener("click", () => queueBotFieldRestore(bot, revision, [...box.querySelectorAll("input:checked")].map(input => input.value)));
      box.appendChild(go);
      row.appendChild(box);
    });
    actions.appendChild(restore);
  }

  if (isManual) {
    const rename = makeElement("button", { text: "Rename", attrs: { type: "button" } });
    rename.addEventListener("click", async () => {
      const next = prompt("Name this manual backup:", revision.label || "Manual backup");
      if (next == null) return;
      const labelValue = cleanBotArchiveText(next, 160) || "Manual backup";
      await mutateCreatorBotBackup(bot.id, entry => {
        const item = (entry.manualBackups || []).find(candidate => candidate.id === revision.id);
        if (item) item.label = labelValue;
      }, "Renamed the manual backup.");
    });
    const duplicate = makeElement("button", { text: "Duplicate", attrs: { type: "button" } });
    duplicate.addEventListener("click", async () => {
      await mutateCreatorBotBackup(bot.id, entry => {
        const item = (entry.manualBackups || []).find(candidate => candidate.id === revision.id);
        if (!item) return;
        entry.manualBackups = [{
          ...item,
          id: `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          capturedAt: Date.now(),
          label: `Copy of ${item.label || "Manual backup"}`,
          kind: "manual"
        }, ...(entry.manualBackups || [])];
      }, "Duplicated the manual backup.");
    });
    actions.append(rename, duplicate);
  }

  const del = makeElement("button", { text: "Delete", attrs: { type: "button" } });
  del.addEventListener("click", async () => {
    if (!confirm(`Delete this ${isManual ? "manual backup" : "automatic revision"}?`)) return;
    await mutateCreatorBotBackup(bot.id, entry => {
      if (isManual) entry.manualBackups = (entry.manualBackups || []).filter(item => item.id !== revision.id);
      else entry.revisions = (entry.revisions || []).filter(item => !(Number(item.capturedAt) === Number(revision.capturedAt) && String(item.source || "") === String(revision.source || "")));
    }, `Deleted the ${isManual ? "manual backup" : "automatic revision"}.`);
  });
  actions.appendChild(del);
  row.append(text, actions);

  const diff = creatorBackupFieldDiff(bot, revision);
  compare.addEventListener("click", () => {
    let box = row.querySelector(":scope > .creator-backup-compare");
    if (box) { box.remove(); return; }
    box = makeElement("div", { className: "creator-backup-compare" });
    box.textContent = diff.length
      ? diff.map(item => `${BOT_ARCHIVE_LABELS[item.field] || item.field}: ${item.before.length} → ${item.after.length} chars (${item.delta >= 0 ? "+" : ""}${item.delta})`).join("\n")
      : "No supported writing-field differences from the latest saved copy.";
    row.appendChild(box);
  });
  return row;
}

function creatorBackupBotRow(bot, kind = "bot") {
  const isProfile = kind === "profile";
  const autoOn = isProfile
    ? !!creatorBackupManagerState.settings.botArchiveOnProfileVisit
    : !!(creatorBackupManagerState.settings.botBackupToolsEnabled && creatorBackupManagerState.settings.botArchiveOwnEditorBackups);
  const stale = autoOn && Number(bot.lastSavedAt || 0) > 0 && Date.now() - Number(bot.lastSavedAt) > CREATOR_BACKUP_STALE_MS;
  const row = makeElement("article", { className: `creator-backup-row${stale ? " is-stale" : ""}` });
  row.dataset.backupKind = kind;
  row.dataset.backupId = bot.id;

  const head = makeElement("div", { className: "creator-backup-row-head" });
  const main = makeElement("div", { className: "creator-backup-row-main" });
  main.appendChild(makeElement("div", { className: "creator-backup-row-title", text: bot.name || bot.id }));
  const revisions = Array.isArray(bot.revisions) ? bot.revisions : [];
  const manuals = Array.isArray(bot.manualBackups) ? bot.manualBackups : [];
  const versions = Array.isArray(bot.versions) ? [...bot.versions].sort((a, b) => b.number - a.number || b.capturedAt - a.capturedAt) : [];
  const details = [
    isProfile ? "Bot profile" : "My chatbot",
    `last backup ${creatorBackupAge(bot.lastSavedAt)}`,
    ...(isProfile ? [] : [`${versions.length} bot version${versions.length === 1 ? "" : "s"}`]),
    `${revisions.length} safety revision${revisions.length === 1 ? "" : "s"}`
  ];
  if (!isProfile) details.push(`${manuals.length} manual backup${manuals.length === 1 ? "" : "s"}`);
  const visibility = cleanBotArchiveText(bot.fields?.visibility || "", 40);
  if (visibility) details.push(visibility);
  if (stale) details.push("automatic backup has not refreshed this for 7+ days");
  main.appendChild(makeElement("div", { className: "creator-backup-row-meta", text: details.join(" · ") }));

  const actions = makeElement("div", { className: "creator-backup-row-actions" });
  const open = makeElement("button", { text: isProfile ? "Open profile" : "Open editor", attrs: { type: "button" } });
  open.addEventListener("click", () => creatorBackupOpen(isProfile ? (bot.profileUrl || `https://spicychat.ai/chatbot/${encodeURIComponent(bot.id)}`) : `https://spicychat.ai/chatbot/edit/${encodeURIComponent(bot.id)}`));
  const exp = makeElement("button", { text: "Export latest", attrs: { type: "button" } });
  exp.addEventListener("click", () => downloadPortableBotProfile(bot));
  const del = makeElement("button", { text: "Delete all", attrs: { type: "button" } });
  del.addEventListener("click", () => deleteCreatorBackup("bot", bot.id, bot.name));
  actions.append(open, exp);
  if (!isProfile) {
    const restoreLatest = makeElement("button", { text: "Restore latest", attrs: { type: "button" } });
    restoreLatest.addEventListener("click", () => {
      const revision = { capturedAt: bot.lastSavedAt, source: bot.source || "Latest backup", fields: bot.fields || {}, coverage: bot.coverage || [] };
      const fields = ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues", "tags", "visibility"]
        .filter(field => String(revision.fields?.[field] || "").length > 0);
      queueBotFieldRestore(bot, revision, fields);
    });
    actions.appendChild(restoreLatest);
  }
  if (revisions.length) {
    const clearAuto = makeElement("button", { text: "Clear safety history", attrs: { type: "button" } });
    clearAuto.addEventListener("click", async () => {
      if (!confirm("Delete all rotating safety/profile revisions for this bot? Bot Version History, manual backups and the latest copy will remain.")) return;
      await mutateCreatorBotBackup(bot.id, entry => { entry.revisions = []; }, "Cleared the safety revision history.");
    });
    actions.appendChild(clearAuto);
  }
  actions.appendChild(del);
  head.append(main, actions);
  row.appendChild(head);

  if (versions.length && !isProfile) {
    const versionHistory = makeElement("details", { className: "creator-backup-revisions" });
    versionHistory.appendChild(makeElement("summary", { text: `Bot Version History (${versions.length})` }));
    const list = makeElement("div", { className: "creator-backup-revision-list" });
    versions.forEach((version, index) => {
      const olderVersion = versions[index + 1] || null;
      list.appendChild(creatorBackupVersionRow(bot, version, olderVersion));
    });
    versionHistory.appendChild(list);
    row.appendChild(versionHistory);
  }

  if (manuals.length && !isProfile) {
    const manualHistory = makeElement("details", { className: "creator-backup-revisions" });
    manualHistory.appendChild(makeElement("summary", { text: `Manual backups (${manuals.length})` }));
    const list = makeElement("div", { className: "creator-backup-revision-list" });
    manuals.forEach((backup, index) => list.appendChild(creatorBackupRevisionRow(bot, backup, index, { manual: true, allowRestore: true })));
    manualHistory.appendChild(list);
    row.appendChild(manualHistory);
  }

  if (revisions.length) {
    const history = makeElement("details", { className: "creator-backup-revisions" });
    history.appendChild(makeElement("summary", { text: `${isProfile ? "Profile" : "Safety revision"} history (${revisions.length})` }));
    const list = makeElement("div", { className: "creator-backup-revision-list" });
    revisions.forEach((revision, index) => list.appendChild(creatorBackupRevisionRow(bot, revision, index, { allowRestore: !isProfile })));
    history.appendChild(list);
    row.appendChild(history);
  }
  return row;
}

function creatorBackupLorebookRow(book) {
  const autoOn = !!(creatorBackupManagerState.settings.lorebookBackupToolsEnabled && creatorBackupManagerState.settings.lorebookBackupsEnabled);
  const stale = autoOn && Number(book.lastSavedAt || 0) > 0 && Date.now() - Number(book.lastSavedAt) > CREATOR_BACKUP_STALE_MS;
  const row = makeElement("article", { className: `creator-backup-row${stale ? " is-stale" : ""}` });
  row.dataset.backupKind = "lorebook";
  row.dataset.backupId = book.id;

  const head = makeElement("div", { className: "creator-backup-row-head" });
  const main = makeElement("div", { className: "creator-backup-row-main" });
  main.appendChild(makeElement("div", { className: "creator-backup-row-title", text: book.name || book.id }));
  const entryCount = Object.keys(book.entries || {}).length;
  const details = [
    "Lorebook",
    `last backup ${creatorBackupAge(book.lastSavedAt)}`,
    `${entryCount} entr${entryCount === 1 ? "y" : "ies"}`
  ];
  if (book.visibility) details.push(book.visibility);
  if (stale) details.push("automatic backup has not refreshed this for 7+ days");
  main.appendChild(makeElement("div", { className: "creator-backup-row-meta", text: details.join(" · ") }));

  const actions = makeElement("div", { className: "creator-backup-row-actions" });
  const open = makeElement("button", { text: "Open editor", attrs: { type: "button" } });
  open.addEventListener("click", () => creatorBackupOpen(`https://spicychat.ai/lorebook/edit/${encodeURIComponent(book.id)}`));
  const exp = makeElement("button", { text: "Export latest", attrs: { type: "button" } });
  exp.addEventListener("click", () => downloadLorebookBackup(book));
  const del = makeElement("button", { text: "Delete backup", attrs: { type: "button" } });
  del.addEventListener("click", () => deleteCreatorBackup("lorebook", book.id, book.name));
  actions.append(open, exp, del);
  head.append(main, actions);
  row.appendChild(head);
  return row;
}

function renderCreatorBackupManager() {
  const host = $("creatorBackupManager");
  if (!host) return;
  const query = String($("creatorBackupSearch")?.value || "").trim().toLowerCase();
  const type = value("creatorBackupType", "all");
  const allBotBackups = Object.values(creatorBackupManagerState.bots.meta || {})
    .filter(bot => !query || `${bot.name || ""} ${bot.id || ""} ${bot.creator || ""}`.toLowerCase().includes(query))
    .sort((a, b) => Number(b.lastSavedAt || 0) - Number(a.lastSavedAt || 0));
  const bots = allBotBackups.filter(bot => bot?.ownBot);
  const profiles = allBotBackups.filter(bot => bot?.profileBackup && !bot?.ownBot);
  const books = Object.values(creatorBackupManagerState.lorebooks.meta || {})
    .filter(book => !query || `${book.name || ""} ${book.id || ""} ${(book.tags || []).join(" ")}`.toLowerCase().includes(query))
    .sort((a, b) => Number(b.lastSavedAt || 0) - Number(a.lastSavedAt || 0));
  const visibleBots = ["all", "bots"].includes(type) ? bots : [];
  const visibleProfiles = ["all", "profiles"].includes(type) ? profiles : [];
  const visibleBooks = ["all", "lorebooks"].includes(type) ? books : [];

  host.replaceChildren();
  [
    ...visibleBots.map(bot => creatorBackupBotRow(bot, "bot")),
    ...visibleProfiles.map(bot => creatorBackupBotRow(bot, "profile")),
    ...visibleBooks.map(creatorBackupLorebookRow)
  ].forEach(row => host.appendChild(row));
  if (!host.children.length) host.appendChild(makeElement("span", { className: "hint", text: query ? "No matching backups found." : "No creator backups saved yet." }));
  if ($("creatorBackupSummary")) {
    const botTools = creatorBackupManagerState.settings.botBackupToolsEnabled ? "On" : "Off";
    const loreTools = creatorBackupManagerState.settings.lorebookBackupToolsEnabled ? "On" : "Off";
    const botAuto = creatorBackupManagerState.settings.botBackupToolsEnabled && creatorBackupManagerState.settings.botArchiveOwnEditorBackups ? "On" : "Off";
    const profileAuto = creatorBackupManagerState.settings.botArchiveOnProfileVisit ? "On" : "Off";
    const loreAuto = creatorBackupManagerState.settings.lorebookBackupToolsEnabled && creatorBackupManagerState.settings.lorebookBackupsEnabled ? "On" : "Off";
    $("creatorBackupSummary").textContent = `${bots.length} own bot${bots.length === 1 ? "" : "s"} · ${profiles.length} profile${profiles.length === 1 ? "" : "s"} · ${books.length} Lorebook${books.length === 1 ? "" : "s"} · auto: bots ${botAuto}, profiles ${profileAuto}, Lorebooks ${loreAuto} · bot tools ${botTools}, Lorebook tools ${loreTools}`;
  }

  let focusId = "";
  let kind = "bot";
  try {
    const params = new URLSearchParams(location.search || "");
    focusId = params.get("backup") || params.get("lorebookBackup") || "";
    kind = params.has("lorebookBackup") ? "lorebook" : (params.has("profileBackup") ? "profile" : "bot");
  } catch {}
  if (creatorBackupPendingFocus?.id) {
    focusId = creatorBackupPendingFocus.id;
    kind = creatorBackupPendingFocus.kind === "lorebook" ? "lorebook" : "bot";
  }
  if (focusId) {
    const target = host.querySelector(`[data-backup-kind="${kind}"][data-backup-id="${CSS.escape(focusId)}"]`);
    if (target && !target.dataset.dsFocusedOnce) {
      target.dataset.dsFocusedOnce = "1";
      expandSettingsCardForTarget(target);
      requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center" }));
      if (creatorBackupPendingFocus?.id === focusId) creatorBackupPendingFocus = null;
    }
  }
}

async function loadCreatorBackupManager({ force = false } = {}) {
  if (creatorBackupManagerLoading) return;
  if (creatorBackupManagerLoaded && !force) return renderCreatorBackupManager();
  creatorBackupManagerLoading = true;
  try {
    const result = await storageGet([BOT_ARCHIVE_KEY, LOREBOOK_BACKUPS_KEY, "settings"]);
    creatorBackupManagerState = {
      bots: normalizeBotArchive(result[BOT_ARCHIVE_KEY]),
      lorebooks: normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]),
      settings: { ...DEFAULT_SETTINGS, ...(result.settings || {}) }
    };
    creatorBackupManagerLoaded = true;
    renderCreatorBackupManager();
  } finally {
    creatorBackupManagerLoading = false;
  }
}

function setupCreatorBackupManager() {
  $("creatorBackupSearch")?.addEventListener("input", renderCreatorBackupManager);
  $("creatorBackupType")?.addEventListener("change", renderCreatorBackupManager);
  $("creatorBackupRefresh")?.addEventListener("click", () => loadCreatorBackupManager({ force: true }));
  const card = $("creatorBackupManagerCard");
  card?.querySelector(".settings-card-toggle")?.addEventListener("click", () => loadCreatorBackupManager());
  if (activeOptionsTab() === "bot-tools") loadCreatorBackupManager().catch(() => {});
}

function botAvailabilityCard(entry) {
  const card = makeElement("div", { className: "bot-manager-card", dataset: { id: entry.id } });
  if (entry.image) {
    card.appendChild(makeElement("img", { className: "bot-manager-image", attrs: { src: entry.image, alt: "", loading: "lazy", decoding: "async" } }));
  } else {
    card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: "?" }));
  }

  const main = makeElement("div", { className: "bot-manager-main" });
  main.appendChild(makeElement("div", { className: "bot-manager-title", text: displayNormalizedSavedText(entry.name || entry.id || "Unknown bot") }));
  if (entry.creator) main.appendChild(makeElement("div", { className: "bot-manager-creator", text: displayNormalizedSavedText(entry.creator) }));
  main.appendChild(makeElement("div", { className: "bot-manager-id", text: entry.id }));

  const badgeRow = makeElement("div", { className: "bot-status-badges" });
  badgeRow.appendChild(makeElement("span", {
    className: "bot-availability-status",
    text: entry.checkedAt ? botAvailabilityStatusLabel(entry.status) : "Not checked",
    dataset: { status: entry.checkedAt ? entry.status : "unknown" }
  }));
  if (entry.updateStatus === "updated") {
    badgeRow.appendChild(makeElement("span", { className: "bot-update-badge", text: "Updated", dataset: { status: "updated" } }));
  }
  if (entry.archive) {
    const archiveFields = entry.archive.coverage?.length || 0;
    badgeRow.appendChild(makeElement("span", { className: "bot-update-badge", text: `Saved copy · ${archiveFields} field${archiveFields === 1 ? "" : "s"}`, dataset: { status: "current" } }));
    if (entry.archive.ownBot) {
      const revisions = Array.isArray(entry.archive.revisions) ? entry.archive.revisions.length : 0;
      badgeRow.appendChild(makeElement("span", { className: "bot-update-badge", text: `Own bot${revisions ? ` · ${revisions} revision${revisions === 1 ? "" : "s"}` : ""}`, dataset: { status: "current" } }));
    }
  }
  const dupLevel = duplicateLevelForEntry(entry.duplicateMatches);
  if (dupLevel) {
    badgeRow.appendChild(makeElement("span", {
      className: "bot-duplicate-badge",
      text: dupLevel === "exact" ? "Exact duplicate match" : dupLevel === "likely" ? "Likely duplicate" : "Possible duplicate",
      dataset: { level: dupLevel }
    }));
  }
  main.appendChild(badgeRow);

  const sources = (entry.sources || []).map(availabilitySourceLabel).filter(Boolean).join(", ");
  const checked = entry.checkedAt ? new Date(entry.checkedAt).toLocaleString() : "never";
  const http = entry.httpStatus ? ` · HTTP ${entry.httpStatus}` : "";
  main.appendChild(makeElement("div", {
    className: "bot-availability-meta",
    text: `${sources ? `Tracked in: ${sources} · ` : ""}Checked: ${checked}${http}`
  }));
  if (entry.reason) main.appendChild(makeElement("div", { className: "bot-manager-description", text: entry.reason }));
  const updateDetails = botUpdateDetails(entry);
  if (updateDetails) main.appendChild(updateDetails);
  const archiveDetails = botArchiveDetails(entry);
  if (archiveDetails) main.appendChild(archiveDetails);
  const duplicateDetails = botDuplicateDetails(entry);
  if (duplicateDetails) main.appendChild(duplicateDetails);

  const actions = makeElement("div", { className: "bot-manager-actions" });
  actions.appendChild(makeElement("a", { text: "Open profile", attrs: { href: entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`, target: "_blank", rel: "noopener noreferrer" } }));
  actions.appendChild(makeElement("button", { className: "bot-availability-recheck", text: entry.checkedAt ? "Recheck" : "Check now", attrs: { type: "button" } }));
  if (entry.updateStatus === "updated") {
    actions.appendChild(makeElement("button", { className: "bot-update-accept", text: "Accept update", attrs: { type: "button" } }));
  }
  if (entry.archive) {
    actions.appendChild(makeElement("button", { className: "bot-archive-copy", text: "Copy saved bot", attrs: { type: "button" } }));
    actions.appendChild(makeElement("button", { className: "bot-archive-portable", text: "Importable JSON", attrs: { type: "button", title: "Character Card JSON that QoL can import back into SpicyChat" } }));
    actions.appendChild(makeElement("button", { className: "bot-archive-download", text: "Archive JSON", attrs: { type: "button", title: "Exact QoL saved-copy record" } }));
    actions.appendChild(makeElement("button", { className: "bot-archive-delete", text: "Delete saved copy", attrs: { type: "button" } }));
  }
  if (entry.checkedAt) actions.appendChild(makeElement("button", { className: "bot-availability-forget", text: "Forget history", attrs: { type: "button" } }));
  main.appendChild(actions);
  card.appendChild(main);
  return card;
}

function renderBotAvailability() {
  const host = $("botAvailabilityManager");
  if (!host) return;

  const scope = String($("botAvailabilityScope")?.value || "all");
  const base = botStatusCenterBaseEntries(scope);
  const duplicates = botDuplicateCacheReady && botDuplicateCacheScope === scope
    ? botDuplicateMatchesCache
    : new Map();
  const entries = botAvailabilityEntries(base, duplicates);
  const duplicateBots = botDuplicateCacheReady && botDuplicateCacheScope === scope
    ? [...duplicates.values()].filter(matches => matches.length).length
    : null;
  const updatedCount = base.filter(entry => entry.updateStatus === "updated").length;
  const checkedCount = base.filter(entry => Number(entry.checkedAt) > 0).length;
  const archivedCount = base.filter(entry => !!entry.archive).length;
  let limit = Math.max(20, Number(botAvailabilityUiState.visible || 20) || 20);
  const shown = entries.slice(0, limit);

  const summary = $("botAvailabilitySummary");
  if (summary) {
    const matches = entries.length !== base.length ? ` · ${entries.length} matching` : "";
    const duplicateText = duplicateBots == null ? "duplicates not calculated" : `${duplicateBots} duplicate matches`;
    summary.textContent = `${base.length} tracked · ${checkedCount} checked · ${archivedCount} saved copies · ${updatedCount} updated · ${duplicateText}${matches}`;
  }

  const showMore = $("botAvailabilityShowMore");
  const showLess = $("botAvailabilityShowLess");
  const collapse = $("botAvailabilityCollapse");
  if (showMore) {
    showMore.style.display = entries.length > shown.length ? "" : "none";
    showMore.textContent = `Show 20 more (${Math.max(0, entries.length - shown.length)} left)`;
  }
  if (showLess) showLess.style.display = shown.length > 20 || !botAvailabilityUiState.collapsed ? "" : "none";
  if (collapse) {
    collapse.style.display = entries.length > 20 ? "" : "none";
    collapse.textContent = limit <= 20 ? "Show 100" : "Collapse to 20";
  }

  if (!base.length) {
    setEmptyState(host, "No locally tracked bots found in this scope yet.");
    return;
  }
  if (!entries.length) {
    setEmptyState(host, "No tracked bots match this filter.");
    return;
  }

  host.replaceChildren(...shown.map(botAvailabilityCard));
  host.querySelectorAll(".bot-availability-recheck").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const previous = botAvailabilityState?.meta?.[id] || null;
      const tracked = collectTrackedAvailabilityBots("all").find(item => item.id === id) || previous || { id };
      button.disabled = true;
      button.textContent = "Checking...";
      const rawResult = await checkBotAvailability({ ...tracked, ...(previous || {}), sources: uniqueClean([...(previous?.sources || []), ...(tracked?.sources || [])]) });
      const result = reconcileBotUpdate(previous, rawResult);
      botAvailabilityState.meta[id] = result;
      botAvailabilityState = normalizeBotAvailability(botAvailabilityState);
      if (rawResult.status === "available" && rawResult.archiveSnapshot) {
        saveArchiveSnapshotForBot(id, rawResult.archiveSnapshot, {
          name: result.name,
          creator: result.creator,
          image: result.image,
          profileUrl: result.profileUrl,
          source: "Bot Status Center"
        });
      }
      invalidateDuplicateCache();
      await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState, [BOT_ARCHIVE_KEY]: botArchiveState });
      renderBotAvailability();
      refreshStorageUsageIfVisible();
    });
  });
  host.querySelectorAll(".bot-update-accept").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const current = normalizeBotAvailability(botAvailabilityState).meta[id];
      if (!current?.snapshot || !snapshotHasSignal(current.snapshot)) return;
      botAvailabilityState.meta[id] = {
        ...current,
        baseline: normalizeBotSnapshot(current.snapshot),
        updateStatus: "current",
        changedFields: [],
        updateDetectedAt: 0,
        baselineAcceptedAt: Date.now()
      };
      botAvailabilityState = normalizeBotAvailability(botAvailabilityState);
      await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState });
      renderBotAvailability();
      showSettingsToast("Accepted the current bot profile as the new update-watch baseline.");
    });
  });
  host.querySelectorAll(".bot-archive-copy").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const archive = normalizeBotArchive(botArchiveState).meta[id];
      if (!archive) return;
      const text = botArchiveReadableText(archive);
      try {
        await navigator.clipboard.writeText(text);
        showSettingsToast("Saved bot copy copied to clipboard.");
      } catch {
        const box = $("settingsJson");
        if (box) {
          box.value = text;
          setActiveTab("data");
          box.focus();
          box.select();
        }
      }
    });
  });
  host.querySelectorAll(".bot-archive-portable").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const archive = normalizeBotArchive(botArchiveState).meta[id];
      if (!archive) return;
      downloadPortableBotProfile(archive);
      showSettingsToast("Importable bot profile JSON downloaded.");
    });
  });
  host.querySelectorAll(".bot-archive-download").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const archive = normalizeBotArchive(botArchiveState).meta[id];
      if (!archive) return;
      downloadBotArchiveEntry(archive);
    });
  });
  host.querySelectorAll(".bot-archive-delete").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const archive = normalizeBotArchive(botArchiveState).meta[id];
      if (!id || !archive) return;
      const name = archive.name || archive.fields?.name || id;
      if (!confirm(`Delete the saved local copy of ${name}? Status history and other tracked lists are not affected.`)) return;
      delete botArchiveState.meta[id];
      botArchiveState = normalizeBotArchive(botArchiveState);
      invalidateDuplicateCache();
      await storageSet({ [BOT_ARCHIVE_KEY]: botArchiveState });
      renderBotAvailability();
      refreshStorageUsageIfVisible();
      showSettingsToast("Saved bot copy deleted.");
    });
  });
  host.querySelectorAll(".bot-availability-forget").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      if (!id) return;
      delete botAvailabilityState.meta[id];
      botAvailabilityState = normalizeBotAvailability(botAvailabilityState);
      invalidateDuplicateCache();
      await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState });
      renderBotAvailability();
      refreshStorageUsageIfVisible();
    });
  });
}

async function runBotAvailabilityScan() {
  await ensureSavedListsDataLoaded();
  if (botAvailabilityScanRunning) return;
  const scope = String($("botAvailabilityScope")?.value || "all");
  const entries = collectTrackedAvailabilityBots(scope);
  const status = $("botAvailabilityScanStatus");
  if (!entries.length) {
    if (status) status.textContent = "No locally tracked bots found in that scope.";
    showSettingsToast("No tracked bots found for this scan.");
    renderBotAvailability();
    return;
  }

  botAvailabilityScanRunning = true;
  botAvailabilityStopRequested = false;
  const scanButton = $("scanBotAvailability");
  const stopButton = $("stopBotAvailabilityScan");
  if (scanButton) scanButton.disabled = true;
  if (stopButton) stopButton.disabled = false;

  let completed = 0;
  let updatesFound = 0;
  try {
    for (const entry of entries) {
      if (botAvailabilityStopRequested) break;
      if (status) status.textContent = `Checking ${completed + 1} / ${entries.length}: ${entry.name || entry.id}`;
      const previous = normalizeBotAvailability(botAvailabilityState).meta[entry.id] || null;
      const rawResult = await checkBotAvailability({ ...entry, ...(previous || {}), sources: uniqueClean([...(previous?.sources || []), ...(entry.sources || [])]) });
      const result = reconcileBotUpdate(previous, rawResult);
      if (result.updateStatus === "updated") updatesFound++;
      botAvailabilityState.meta[result.id] = result;
      if (rawResult.status === "available" && rawResult.archiveSnapshot) {
        saveArchiveSnapshotForBot(result.id, rawResult.archiveSnapshot, {
          name: result.name,
          creator: result.creator,
          image: result.image,
          profileUrl: result.profileUrl,
          source: "Bot Status Center"
        });
      }
      completed++;
      if (completed % 5 === 0) {
        botAvailabilityState = normalizeBotAvailability(botAvailabilityState);
        await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState, [BOT_ARCHIVE_KEY]: botArchiveState });
      }
      if (completed % 5 === 0 || completed === entries.length) renderBotAvailability();
      if (!botAvailabilityStopRequested && completed < entries.length) {
        await new Promise(resolve => setTimeout(resolve, result.httpStatus === 429 ? 1200 : 250));
      }
    }
  } finally {
    botAvailabilityState = normalizeBotAvailability(botAvailabilityState);
    invalidateDuplicateCache();
    await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState, [BOT_ARCHIVE_KEY]: botArchiveState });
    botAvailabilityScanRunning = false;
    if (scanButton) scanButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
    if (status) status.textContent = botAvailabilityStopRequested
      ? `Stopped after ${completed} / ${entries.length}. Completed status/update checks were saved.`
      : `Finished ${completed} bot${completed === 1 ? "" : "s"}. ${updatesFound ? `${updatesFound} update${updatesFound === 1 ? "" : "s"} detected. ` : ""}Duplicate matches refreshed locally.`;
    botAvailabilityStopRequested = false;
    renderBotAvailability();
    refreshStorageUsageIfVisible();
  }
}

async function acceptAllBotUpdates() {
  const normalized = normalizeBotAvailability(botAvailabilityState);
  const updated = Object.values(normalized.meta).filter(entry => entry.updateStatus === "updated" && snapshotHasSignal(entry.snapshot));
  if (!updated.length) {
    showSettingsToast("There are no detected bot updates to accept.");
    return;
  }
  if (!confirm(`Accept the current profile snapshot as the new baseline for ${updated.length} updated bot${updated.length === 1 ? "" : "s"}?`)) return;
  const now = Date.now();
  for (const entry of updated) {
    normalized.meta[entry.id] = {
      ...entry,
      baseline: normalizeBotSnapshot(entry.snapshot),
      updateStatus: "current",
      changedFields: [],
      updateDetectedAt: 0,
      baselineAcceptedAt: now
    };
  }
  botAvailabilityState = normalizeBotAvailability(normalized);
  await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState });
  renderBotAvailability();
  showSettingsToast(`Accepted ${updated.length} bot update${updated.length === 1 ? "" : "s"}.`);
}

async function clearBotAvailabilityResults() {
  const count = Object.keys(normalizeBotAvailability(botAvailabilityState).meta).length;
  if (!count) {
    showSettingsToast("There is no bot status history to clear.");
    return;
  }
  if (!confirm(`Clear status/update history for ${count} bot${count === 1 ? "" : "s"}? This does not remove bots from Favorites, Later, Bot Organizer, opened history, or Saved bot copies.`)) return;
  botAvailabilityState = { meta: {} };
  invalidateDuplicateCache();
  await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState });
  renderBotAvailability();
  refreshStorageUsageIfVisible();
  showSettingsToast("Bot status history cleared. Your tracked bot lists and saved bot copies were left alone.");
}

async function clearBotArchive() {
  const count = Object.keys(normalizeBotArchive(botArchiveState).meta).length;
  if (!count) {
    showSettingsToast("There are no saved bot copies to clear.");
    return;
  }
  if (!confirm(`Delete all ${count} saved local bot cop${count === 1 ? "y" : "ies"}? Bot Status Center history and your Favorites/Later/Organizer lists will remain.`)) return;
  botArchiveState = { meta: {} };
  invalidateDuplicateCache();
  await storageSet({ [BOT_ARCHIVE_KEY]: botArchiveState });
  renderBotAvailability();
  refreshStorageUsageIfVisible();
  showSettingsToast("Saved bot copies cleared.");
}

function setupBotAvailabilityControls() {
  $("scanBotAvailability")?.addEventListener("click", runBotAvailabilityScan);
  $("stopBotAvailabilityScan")?.addEventListener("click", () => {
    botAvailabilityStopRequested = true;
    const status = $("botAvailabilityScanStatus");
    if (status) status.textContent = "Stopping after the current check...";
  });
  $("acceptAllBotUpdates")?.addEventListener("click", acceptAllBotUpdates);
  $("refreshBotDuplicateMatches")?.addEventListener("click", async () => {
    const scope = String($("botAvailabilityScope")?.value || "all");
    const button = $("refreshBotDuplicateMatches");
    if (button) button.disabled = true;
    showSettingsToast("Calculating duplicate / reupload matches...");
    await nextUiFrame();
    const base = botStatusCenterBaseEntries(scope);
    botDuplicateMatchesCache = computeBotDuplicateMatches(base);
    botDuplicateCacheScope = scope;
    botDuplicateCacheReady = true;
    renderBotAvailability();
    if (button) button.disabled = false;
    showSettingsToast("Duplicate / reupload matches refreshed from local bot data.");
  });
  $("clearBotAvailabilityResults")?.addEventListener("click", clearBotAvailabilityResults);
  $("clearBotArchive")?.addEventListener("click", clearBotArchive);
  $("botAvailabilityScope")?.addEventListener("change", () => {
    invalidateDuplicateCache();
    botAvailabilityUiState.visible = 20;
    botAvailabilityUiState.collapsed = true;
    renderBotAvailability();
  });
  $("botAvailabilityStatusFilter")?.addEventListener("change", async event => {
    botAvailabilityUiState.status = event.target.value || "all";
    botAvailabilityUiState.visible = 20;
    botAvailabilityUiState.collapsed = true;
    if (BOT_DUPLICATE_LEVELS.has(botAvailabilityUiState.status) && !botDuplicateCacheReady) {
      const scope = String($("botAvailabilityScope")?.value || "all");
      await nextUiFrame();
      botDuplicateMatchesCache = computeBotDuplicateMatches(botStatusCenterBaseEntries(scope));
      botDuplicateCacheScope = scope;
      botDuplicateCacheReady = true;
    }
    renderBotAvailability();
  });
  const renderAvailabilitySearch = debounceCallback(event => {
    botAvailabilityUiState.query = event?.target?.value || $("botAvailabilitySearch")?.value || "";
    botAvailabilityUiState.visible = 20;
    botAvailabilityUiState.collapsed = true;
    renderBotAvailability();
  });
  $("botAvailabilitySearch")?.addEventListener("input", renderAvailabilitySearch);
  $("botAvailabilityShowMore")?.addEventListener("click", () => {
    botAvailabilityUiState.collapsed = true;
    botAvailabilityUiState.visible = Math.min(5000, Number(botAvailabilityUiState.visible || 20) + 20);
    renderBotAvailability();
  });
  $("botAvailabilityShowLess")?.addEventListener("click", () => {
    botAvailabilityUiState.visible = 20;
    botAvailabilityUiState.collapsed = true;
    renderBotAvailability();
  });
  $("botAvailabilityCollapse")?.addEventListener("click", () => {
    const current = Number(botAvailabilityUiState.visible || 20);
    if (current <= 20) {
      botAvailabilityUiState.collapsed = false;
      botAvailabilityUiState.visible = Math.min(100, botStatusCenterBaseEntries(String($("botAvailabilityScope")?.value || "all")).length);
    } else {
      botAvailabilityUiState.collapsed = true;
      botAvailabilityUiState.visible = 20;
    }
    renderBotAvailability();
  });
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

function creatorFollowAllowed(handleValue) {
  return !!normalizeCreatorHandle(handleValue);
}

function creatorNotificationAllowed(handleValue) {
  return !!normalizeCreatorHandle(handleValue);
}

function normalizeFavoriteCreatorPreferences(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    showOpenedBots: !!raw.showOpenedBots,
    showLaterBots: !!raw.showLaterBots,
    ignoreLanguageFilter: !!raw.ignoreLanguageFilter,
    ignoreTagWordFilters: !!raw.ignoreTagWordFilters,
    showAllBots: !!raw.showAllBots
  };
}

function normalizeCreatorStore(store) {
  const raw = store && typeof store === "object" ? store : {};
  const handles = uniqueClean(Array.isArray(raw.handles) ? raw.handles.map(normalizeCreatorHandle) : []);
  const meta = {};
  const rawMeta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  for (const [rawKey, item] of Object.entries(rawMeta)) {
    const key = normalizeCreatorHandle(rawKey || item?.handle || "");
    if (!key) continue;
    const sourceItem = item && typeof item === "object" ? item : {};
    meta[key] = { ...sourceItem, handle: key, preferences: normalizeFavoriteCreatorPreferences(sourceItem.preferences) };
  }
  return { handles, meta };
}


function normalizeCreatorBotWatchEntry(raw, fallbackHandle = "") {
  const item = raw && typeof raw === "object" ? raw : {};
  const id = String(item.id || item.botId || "").trim();
  if (!id) return null;
  const creatorHandle = normalizeCreatorHandle(item.creatorHandle || item.creator || item.creatorUrl || fallbackHandle);
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
  const rawCreators = source.creators && typeof source.creators === "object" ? source.creators : {};
  for (const [rawHandle, raw] of Object.entries(rawCreators)) {
    const handle = normalizeCreatorHandle(rawHandle || raw?.handle || "");
    if (!handle || !raw || typeof raw !== "object") continue;
    creators[handle] = {
      handle,
      initialized: !!raw.initialized,
      baselineAt: Number(raw.baselineAt || 0) || 0,
      baselineCount: Number(raw.baselineCount || 0) || 0,
      seenIds: uniqueClean(Array.isArray(raw.seenIds) ? raw.seenIds : []).slice(0, 180),
      lastCheckedAt: Number(raw.lastCheckedAt || 0) || 0,
      lastNewAt: Number(raw.lastNewAt || 0) || 0,
      lastNewCount: Math.max(0, Number(raw.lastNewCount || 0) || 0),
      lastError: String(raw.lastError || "").slice(0, 500)
    };
  }

  const recent = [];
  const seen = new Set();
  for (const raw of Array.isArray(source.recent) ? source.recent : []) {
    const item = normalizeCreatorBotWatchEntry(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    recent.push(item);
    if (recent.length >= 240) break;
  }

  return {
    version: 1,
    creators,
    recent,
    lastRunAt: Number(source.lastRunAt || 0) || 0,
    lastScanAt: Number(source.lastScanAt || 0) || 0,
    lastDurationMs: Number(source.lastDurationMs || 0) || 0,
    lastCheckedCreators: Math.max(0, Number(source.lastCheckedCreators || 0) || 0),
    lastNewCount: Math.max(0, Number(source.lastNewCount || 0) || 0),
    lastFailureCount: Math.max(0, Number(source.lastFailureCount || 0) || 0),
    lastReason: String(source.lastReason || "").slice(0, 80),
    lastWebhookAt: Number(source.lastWebhookAt || 0) || 0,
    lastWebhookError: String(source.lastWebhookError || "").slice(0, 500)
  };
}

function normalizeCreatorBotWebhookConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  return { enabled: !!source.enabled, url: String(source.url || "").trim() };
}

function creatorBotWatchEntryStatus(handleValue) {
  const handle = normalizeCreatorHandle(handleValue);
  if (!checked("enableCreatorBotNotifications", !!loadedSettingsSnapshot.enableCreatorBotNotifications)) return "New-bot watch disabled";
  const item = creatorBotWatchState?.creators?.[handle];
  if (!item?.initialized) return "Baseline pending";
  const parts = [];
  if (item.lastCheckedAt) parts.push(`checked ${new Date(item.lastCheckedAt).toLocaleString()}`);
  if (item.lastNewCount) parts.push(`${item.lastNewCount} new last check`);
  if (item.lastError) parts.push(item.lastError);
  return parts.length ? parts.join(" · ") : `Baseline ready (${item.baselineCount || item.seenIds?.length || 0} bots)`;
}

function renderCreatorBotWatchStatus() {
  const state = normalizeCreatorBotWatchState(creatorBotWatchState);
  creatorBotWatchState = state;
  const enabled = checked("enableCreatorBotNotifications", !!loadedSettingsSnapshot.enableCreatorBotNotifications);
  const followedHandles = normalizeCreatorStore(followedCreatorState).handles;
  const followedCount = followedHandles.length;
  const initialized = Object.values(state.creators).filter(item => item?.initialized).length;
  const lastRun = state.lastRunAt ? new Date(state.lastRunAt).toLocaleString() : "never";
  const summaryParts = enabled
    ? [`${followedCount} followed`, `${initialized} baselined`, `last run ${lastRun}`]
    : ["New-bot watch is disabled"];
  if (enabled && state.lastCheckedCreators) summaryParts.push(`${state.lastCheckedCreators} checked`);
  if (enabled && state.lastNewCount) summaryParts.push(`${state.lastNewCount} new`);
  if (enabled && state.lastFailureCount) summaryParts.push(`${state.lastFailureCount} failed`);
  if (state.lastWebhookError) summaryParts.push(`webhook: ${state.lastWebhookError}`);
  const text = summaryParts.join(" · ");
  if ($("creatorBotWatchStatus")) $("creatorBotWatchStatus").textContent = text;
  if ($("creatorBotWatchStatusCenter")) $("creatorBotWatchStatusCenter").textContent = text;

  const host = $("creatorBotRecentList");
  if (!host) return;
  host.replaceChildren();
  const recent = state.recent.slice(0, 40);
  if (!recent.length) {
    setEmptyState(host, enabled
      ? "No new bots detected yet. The first successful check for each followed creator only creates a baseline."
      : "Enable new-bot notifications above to start watching followed creators.");
    return;
  }

  for (const item of recent) {
    const card = makeElement("div", { className: "bot-manager-card creator-bot-watch-row", dataset: { id: item.id } });
    if (item.image) card.appendChild(makeElement("img", { className: "bot-manager-image", attrs: { src: item.image, alt: "", loading: "lazy", decoding: "async" } }));
    else card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: "N" }));
    const main = makeElement("div", { className: "bot-manager-main" });
    main.appendChild(makeElement("div", { className: "bot-manager-title", text: displayNormalizedSavedText(item.name || item.id) }));
    const meta = [item.creator || (item.creatorHandle ? `@${item.creatorHandle}` : ""), item.detectedAt ? `detected ${new Date(item.detectedAt).toLocaleString()}` : ""].filter(Boolean).join(" · ");
    if (meta) main.appendChild(makeElement("div", { className: "bot-manager-creator", text: meta }));
    if (item.description) main.appendChild(makeElement("div", { className: "bot-manager-note", text: displayNormalizedSavedText(item.description) }));
    const actions = makeElement("div", { className: "bot-manager-actions" });
    if (item.chatUrl) actions.appendChild(makeElement("a", { text: "Open chat", attrs: { href: item.chatUrl, target: "_blank", rel: "noopener noreferrer" } }));
    if (item.creatorUrl) actions.appendChild(makeElement("a", { text: "Creator", attrs: { href: item.creatorUrl, target: "_blank", rel: "noopener noreferrer" } }));
    main.appendChild(actions);
    card.appendChild(main);
    host.appendChild(card);
  }
}

function creatorEntriesFromStore(store) {
  const normalized = normalizeCreatorStore(store);

  return normalized.handles.map(handle => {
    const item = normalized.meta?.[handle] || {};
    return {
      handle,
      name: item.name || `@${handle}`,
      url: item.url || `https://spicychat.ai/creator/${encodeURIComponent(handle)}`,
      savedAt: item.savedAt || 0,
      preferences: normalizeFavoriteCreatorPreferences(item.preferences)
    };
  });
}

function creatorManagerCardElement(entry, { rowClass, placeholder, buttonClass, buttonText }) {
  const card = makeElement("div", {
    className: `bot-manager-card ${rowClass}`,
    dataset: { handle: entry.handle }
  });
  card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: placeholder }));

  const main = makeElement("div", { className: "bot-manager-main" });
  main.append(
    makeElement("div", { className: "bot-manager-title", text: displayNormalizedSavedText(entry.name) }),
    makeElement("div", { className: "bot-manager-id", text: `@${entry.handle}` })
  );

  const actions = makeElement("div", { className: "bot-manager-actions" });
  actions.append(
    makeElement("a", { text: "Creator", attrs: { href: entry.url, target: "_blank", rel: "noopener noreferrer" } }),
    makeElement("button", { className: buttonClass, text: buttonText, attrs: { type: "button" } })
  );
  main.appendChild(actions);
  card.appendChild(main);
  return card;
}

async function persistFavoriteCreatorsNow() {
  favoriteCreatorState = normalizeCreatorStore(favoriteCreatorState);
  await storageSet({ [FAVORITE_CREATORS_KEY]: favoriteCreatorState });
  dirtySavedStores.delete("favoriteCreators");
}

function renderFavoriteCreators() {
  const host = $("favoriteCreatorManager");
  const summary = $("favoriteCreatorManagerSummary");
  if (!host) return;

  const entries = creatorEntriesFromStore(favoriteCreatorState)
    .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));

  const limit = Math.max(20, Number(favoriteCreatorUiState.visible || 20));
  const shownEntries = entries.slice(0, limit);

  if (summary) {
    summary.textContent = entries.length
      ? `${entries.length} saved, showing ${shownEntries.length}`
      : "0 saved";
  }

  const showMore = $("favoriteCreatorShowMore");
  const showLess = $("favoriteCreatorShowLess");
  const collapse = $("favoriteCreatorCollapse");

  if (showMore) {
    showMore.style.display = entries.length > shownEntries.length ? "" : "none";
    showMore.textContent = `Show 20 more (${Math.max(0, entries.length - shownEntries.length)} left)`;
  }

  if (showLess) {
    showLess.style.display = shownEntries.length > 20 || !favoriteCreatorUiState.collapsed ? "" : "none";
  }

  if (collapse) {
    collapse.style.display = entries.length > 20 ? "" : "none";
    collapse.textContent = limit <= 20 ? "Show 100" : "Collapse to 20";
  }

  if (!entries.length) {
    setEmptyState(host, "No favorite creators saved yet.");
    return;
  }

  host.replaceChildren(...shownEntries.map(entry => creatorManagerCardElement(entry, {
    rowClass: "ds-creator-fav-row",
    placeholder: "★",
    buttonClass: "favorite-creator-remove",
    buttonText: "Remove"
  })));

  const prefDefs = [
    ["showOpenedBots", "Show opened bots"],
    ["showLaterBots", "Show Saved for Later bots"],
    ["ignoreLanguageFilter", "Ignore language filter"],
    ["ignoreTagWordFilters", "Ignore tag / blocked-word filters"],
    ["showAllBots", "Always show all bots from this creator"]
  ];

  for (const row of host.querySelectorAll(".ds-creator-fav-row")) {
    const handle = normalizeCreatorHandle(row.dataset.handle || "");
    if (!handle) continue;
    const meta = favoriteCreatorState.meta?.[handle] || {};
    const prefs = normalizeFavoriteCreatorPreferences(meta.preferences);
    const main = row.querySelector(".bot-manager-main") || row;
    const box = makeElement("div", { className: "favorite-creator-overrides" });
    for (const [key, labelText] of prefDefs) {
      const label = makeElement("label", { className: "favorite-creator-override" });
      const input = makeElement("input", { attrs: { type: "checkbox", "data-pref": key } });
      input.checked = !!prefs[key];
      label.append(input, document.createTextNode(labelText));
      box.appendChild(label);
    }
    const note = makeElement("div", {
      className: "bot-manager-note",
      text: "Blocked bots always stay hidden. These switches only override softer discovery filters for this creator."
    });
    main.append(box, note);
  }

  host.querySelectorAll(".favorite-creator-overrides input[data-pref]").forEach(input => {
    input.addEventListener("change", async () => {
      const row = input.closest(".ds-creator-fav-row");
      const handle = normalizeCreatorHandle(row?.dataset.handle || "");
      const key = String(input.dataset.pref || "");
      if (!handle || !key) return;
      favoriteCreatorState = normalizeCreatorStore(favoriteCreatorState);
      const meta = favoriteCreatorState.meta[handle] || { handle };
      const prefs = normalizeFavoriteCreatorPreferences(meta.preferences);
      prefs[key] = !!input.checked;
      favoriteCreatorState.meta[handle] = { ...meta, preferences: prefs };
      await persistFavoriteCreatorsNow();
      showSettingsToast(`Updated @${handle} visibility overrides.`);
    });
  });

  host.querySelectorAll(".favorite-creator-remove").forEach(button => {
    button.addEventListener("click", async () => {
      const handle = button.closest(".ds-creator-fav-row")?.dataset.handle || "";
      const before = cloneJson(favoriteCreatorState);
      favoriteCreatorState.handles = favoriteCreatorState.handles.filter(item => item !== handle);
      delete favoriteCreatorState.meta[handle];
      renderFavoriteCreators();
      await persistFavoriteCreatorsNow();
      showSettingsToast(`Removed @${handle || "creator"}.`, async () => {
        favoriteCreatorState = normalizeCreatorStore(before);
        renderFavoriteCreators();
        await persistFavoriteCreatorsNow();
      });
    });
  });
}

async function addFavoriteCreator() {
  const handleInput = $("favoriteCreatorAddHandle");
  const nameInput = $("favoriteCreatorAddName");
  const handle = normalizeCreatorHandle(handleInput?.value || "");
  const name = String(nameInput?.value || "").trim() || (handle ? `@${handle}` : "");

  if (!handle) return;

  favoriteCreatorState = normalizeCreatorStore(favoriteCreatorState);
  if (!favoriteCreatorState.handles.includes(handle)) favoriteCreatorState.handles.push(handle);
  favoriteCreatorState.meta[handle] = {
    ...(favoriteCreatorState.meta[handle] || {}),
    handle,
    name,
    url: `https://spicychat.ai/creator/${encodeURIComponent(handle)}`,
    savedAt: Date.now(),
    preferences: normalizeFavoriteCreatorPreferences(favoriteCreatorState.meta[handle]?.preferences)
  };

  if (handleInput) handleInput.value = "";
  if (nameInput) nameInput.value = "";
  renderFavoriteCreators();
  renderBotManager("favorite");
  renderBotManager("later");
  renderBotManager("opened");
  await persistFavoriteCreatorsNow();
  showSettingsToast(`Saved @${handle} as a favorite creator.`);
  loadChangelog();
}

function renderFollowedCreators() {
  const host = $("followedCreatorManager");
  const summary = $("followedCreatorManagerSummary");
  if (!host) return;

  const queryTerms = splitManagerSearchTerms(followedCreatorUiState.query || "");
  const sortMode = followedCreatorUiState.sort || "newest";
  let entries = creatorEntriesFromStore(followedCreatorState);
  const total = entries.length;
  if (queryTerms.length) {
    entries = entries.filter(entry => managerHaystackMatchesTerms(`${entry.name} ${entry.handle}`, queryTerms));
  }
  entries.sort((a, b) => {
    if (sortMode === "oldest") return Number(a.savedAt || 0) - Number(b.savedAt || 0);
    if (sortMode === "name-asc") return String(a.name || a.handle).localeCompare(String(b.name || b.handle));
    if (sortMode === "name-desc") return String(b.name || b.handle).localeCompare(String(a.name || a.handle));
    return Number(b.savedAt || 0) - Number(a.savedAt || 0);
  });

  const limit = Math.max(20, Number(followedCreatorUiState.visible || 20));
  const shownEntries = entries.slice(0, limit);

  if (summary) summary.textContent = total ? `${total} saved, showing ${shownEntries.length}${queryTerms.length ? ` matching ${entries.length}` : ""}` : "0 saved";

  const showMore = $("followedCreatorShowMore");
  const showLess = $("followedCreatorShowLess");
  const collapse = $("followedCreatorCollapse");
  if (showMore) {
    showMore.style.display = entries.length > shownEntries.length ? "" : "none";
    showMore.textContent = `Show 20 more (${Math.max(0, entries.length - shownEntries.length)} left)`;
  }
  if (showLess) showLess.style.display = shownEntries.length > 20 || !followedCreatorUiState.collapsed ? "" : "none";
  if (collapse) {
    collapse.style.display = entries.length > 20 ? "" : "none";
    collapse.textContent = limit <= 20 ? "Show 100" : "Collapse to 20";
  }

  if (!entries.length) {
    setEmptyState(host, queryTerms.length ? "No followed creators match that search." : "No followed creators saved yet.");
    return;
  }

  host.replaceChildren(...shownEntries.map(entry => {
    const card = creatorManagerCardElement(entry, {
      rowClass: "ds-creator-follow-row",
      placeholder: "✓",
      buttonClass: "followed-creator-remove",
      buttonText: "Unfollow"
    });
    const main = card.querySelector(".bot-manager-main");
    const actions = main?.querySelector(".bot-manager-actions");
    const status = makeElement("div", { className: "hint", text: creatorBotWatchEntryStatus(entry.handle) });
    if (main && actions) main.insertBefore(status, actions);
    else main?.appendChild(status);
    return card;
  }));

  host.querySelectorAll(".followed-creator-remove").forEach(button => {
    button.addEventListener("click", () => {
      const handle = button.closest(".ds-creator-follow-row")?.dataset.handle || "";
      const before = cloneJson(followedCreatorState);
      followedCreatorState.handles = followedCreatorState.handles.filter(item => item !== handle);
      delete followedCreatorState.meta[handle];
      markSavedStoreDirty("followedCreators");
      renderFollowedCreators();
      showSettingsToast(`Unfollowed @${handle || "creator"}.`, () => {
        followedCreatorState = normalizeCreatorStore(before);
        markSavedStoreDirty("followedCreators");
        renderFollowedCreators();
      });
    });
  });
}

function addFollowedCreator() {
  const handleInput = $("followedCreatorAddHandle");
  const nameInput = $("followedCreatorAddName");
  const handle = normalizeCreatorHandle(handleInput?.value || "");
  const name = String(nameInput?.value || "").trim() || (handle ? `@${handle}` : "");
  if (!handle) return;
  followedCreatorState = normalizeCreatorStore(followedCreatorState);
  if (!followedCreatorState.handles.includes(handle)) followedCreatorState.handles.push(handle);
  followedCreatorState.meta[handle] = {
    ...(followedCreatorState.meta[handle] || {}),
    handle,
    name,
    url: `https://spicychat.ai/creator/${encodeURIComponent(handle)}`,
    savedAt: Date.now()
  };
  markSavedStoreDirty("followedCreators");
  if (handleInput) handleInput.value = "";
  if (nameInput) nameInput.value = "";
  renderFollowedCreators();
}

function normalizeMetaStore(raw) {
  return raw && typeof raw === "object" ? { ...raw } : {};
}

function mergeMetaStores(...stores) {
  return stores.reduce((merged, store) => ({
    ...merged,
    ...normalizeMetaStore(store)
  }), {});
}

function mergeBotStores(...stores) {
  const normalized = stores.map(normalizeBotStore);

  return {
    ids: uniqueClean(normalized.flatMap(store => store.ids || [])),
    names: uniqueClean(normalized.flatMap(store => store.names || [])),
    meta: normalized.reduce((merged, store) => ({
      ...merged,
      ...(store.meta || {})
    }), {})
  };
}

function mergeCreatorStores(...stores) {
  const normalized = stores.map(normalizeCreatorStore);

  return {
    handles: uniqueClean(normalized.flatMap(store => store.handles || [])),
    meta: normalized.reduce((merged, store) => ({
      ...merged,
      ...(store.meta || {})
    }), {})
  };
}

function mergePersonas(...lists) {
  const seen = new Set();
  const merged = [];

  for (const list of lists) {
    if (!Array.isArray(list)) continue;

    for (const persona of list) {
      if (!persona || typeof persona !== "object") continue;

      const key = String(persona.id || persona.key || persona.name || JSON.stringify(persona)).trim();
      if (!key || seen.has(key)) continue;

      seen.add(key);
      merged.push(persona);
    }
  }

  return merged;
}

function mergeOocTemplateLists(...lists) {
  const seen = new Set();
  const merged = [];

  for (const list of lists) {
    for (const template of normalizeOocTemplates(list)) {
      const key = `${String(template.name || "").trim()}\n${String(template.text || "").trim()}`;
      if (seen.has(key)) continue;

      seen.add(key);
      merged.push(template);
    }
  }

  return normalizeOocTemplates(merged);
}

function normalizeGenerationProfiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([name, profile]) =>
      String(name || "").trim() && profile && typeof profile === "object" && !Array.isArray(profile)
    )
  );
}

function mergeGenerationProfiles(currentValue, importedValue) {
  const current = normalizeGenerationProfiles(currentValue);
  const imported = normalizeGenerationProfiles(importedValue);
  const merged = { ...current };

  for (const [originalName, profile] of Object.entries(imported)) {
    let name = originalName.trim();
    if (!merged[name]) {
      merged[name] = profile;
      continue;
    }

    if (JSON.stringify(merged[name]) === JSON.stringify(profile)) continue;

    const base = `${name} (imported)`;
    name = base;
    let number = 2;
    while (merged[name]) name = `${base} ${number++}`;
    merged[name] = profile;
  }

  return merged;
}

function normalizeReplyInstructionOverrides(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const entries = [];
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = String(rawKey || "").trim().slice(0, 160);
    const rawText = rawValue && typeof rawValue === "object" ? rawValue.text : rawValue;
    const text = String(rawText || "").replace(/\r\n/g, "\n").trim().slice(0, 2000);
    if (!key || !text) continue;
    entries.push([key, { text, updatedAt: Math.max(0, Number(rawValue?.updatedAt || 0) || 0) }]);
  }
  entries.sort((a, b) => Number(b[1].updatedAt || 0) - Number(a[1].updatedAt || 0));
  return Object.fromEntries(entries.slice(0, 100));
}

function mergeSettingsForImport(currentSettings, importedSettings) {
  const current = { ...DEFAULT_SETTINGS, ...(currentSettings || {}) };
  const imported = importedSettings && typeof importedSettings === "object" ? importedSettings : {};
  const next = { ...current, ...imported };

  [
    "includeTags",
    "excludeTags",
    "blockedTags",
    "blockedWords",
    "blockedCreators",
    "blockedBotIds",
    "blockedBotNames",
    "allowedLanguages"
  ].forEach(key => {
    next[key] = uniqueClean([
      ...(Array.isArray(current[key]) ? current[key] : []),
      ...(Array.isArray(imported[key]) ? imported[key] : [])
    ]);
  });

  next.oocTemplates = mergeOocTemplateLists(current.oocTemplates, imported.oocTemplates);
  next.botEditorSnippets = mergeBotEditorSnippetLists(current.botEditorSnippets, imported.botEditorSnippets);
  next.replyInstructionBotOverrides = {
    ...normalizeReplyInstructionOverrides(current.replyInstructionBotOverrides),
    ...normalizeReplyInstructionOverrides(imported.replyInstructionBotOverrides)
  };
  next.replyInstructionBotOverrides = normalizeReplyInstructionOverrides(next.replyInstructionBotOverrides);

  return next;
}

function openedEntryIsBlocked(idValue, meta = {}, store = blockedState) {
  const id = String(idValue || "").trim();
  const blocked = normalizeBotStore(store);
  if (id && blocked.ids.includes(id)) return true;

  const name = String(meta?.name || meta?.title || "")
    .toLowerCase()
    .replace(/\s+/g, " " )
    .trim();
  if (!name) return false;

  return (blocked.names || []).some(value => String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " " )
    .trim() === name);
}

function enforceBlockedPriorityOverOpenedState(options = {}) {
  const blocked = normalizeBotStore(options.blockedStore || blockedState);
  const meta = normalizeMetaStore(options.openedMeta || openedChatMetaState);
  const ids = uniqueClean(options.openedIds || currentOpened);
  const kept = [];
  let removed = 0;

  for (const id of ids) {
    if (openedEntryIsBlocked(id, meta[id], blocked)) {
      delete meta[id];
      removed++;
      continue;
    }
    kept.push(id);
  }

  if (!options.detached) {
    currentOpened = kept;
    openedChatMetaState = meta;
    if (removed && options.markDirty !== false) markSavedStoreDirty("opened");
    if ($("openedCount")) $("openedCount").textContent = `${currentOpened.length} stored`;
  }

  return { ids: kept, meta, removed };
}

function openedStoreFromState() {
  const clean = enforceBlockedPriorityOverOpenedState({ detached: true });
  return {
    ids: clean.ids,
    meta: clean.meta
  };
}

function isPlaceholderBotName(value, id = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (id && text.toLowerCase() === String(id).toLowerCase()) return true;
  return ["for you", "unknown bot", "unknown", "chatbot"].includes(text.toLowerCase());
}

function localBotNameCandidates(id) {
  const key = String(id || "").trim();
  if (!key) return [];
  const availability = botAvailabilityState?.meta?.[key] || {};
  const snapshot = normalizeBotSnapshot(availability.snapshot || availability.baseline || {});
  return [
    openedChatMetaState?.[key]?.name,
    laterBotState?.meta?.[key]?.name,
    favoriteBotState?.meta?.[key]?.name,
    notInterestedState?.meta?.[key]?.name,
    botOrganizationState?.meta?.[key]?.name,
    snapshot.fields?.name,
    availability.name
  ]
    .map(value => String(value || "").replace(/\s+/g, " ").trim())
    .filter(value => !isPlaceholderBotName(value, key));
}

function bestKnownBotName(id, currentName = "") {
  const current = String(currentName || "").replace(/\s+/g, " ").trim();
  if (!isPlaceholderBotName(current, id)) return current;
  return localBotNameCandidates(id)[0] || "";
}

function repairBlockedNamesFromLocalMetadata() {
  let repaired = 0;
  blockedState.meta = blockedState.meta || {};
  for (const id of blockedState.ids || []) {
    const item = blockedState.meta[id] || {};
    if (!isPlaceholderBotName(item.name, id)) continue;
    const name = bestKnownBotName(id, item.name);
    if (!name) continue;
    blockedState.meta[id] = { ...item, id, name };
    repaired++;
  }
  return repaired;
}

function normalizeRecentlySeenStore(value) {
  const source = value && typeof value === "object" ? value : {};
  const items = Array.isArray(source.entries) ? source.entries : [];
  const entries = [];
  const seen = new Set();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    entries.push({
      id,
      name: String(raw.name || id).replace(/\s+/g, " ").trim(),
      creator: String(raw.creator || "").replace(/\s+/g, " ").trim(),
      image: String(raw.image || "").trim(),
      chatUrl: String(raw.chatUrl || `https://spicychat.ai/chat/${id}`).trim(),
      profileUrl: String(raw.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim(),
      lastSeenAt: Number(raw.lastSeenAt) || 0,
      seenCount: Math.max(1, Number(raw.seenCount) || 1)
    });
  }
  entries.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return { entries };
}

const savedBotsHubUiState = {
  query: "",
  visible: 20,
  collapsed: true,
  selected: new Set()
};

const SAVED_HUB_BOT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function savedBotsHubBotId(idValue, raw = null) {
  const candidates = [idValue, raw?.id, raw?.chatbotId, raw?.characterId, raw?.profileUrl, raw?.chatUrl];
  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (!text) continue;
    if (SAVED_HUB_BOT_ID_RE.test(text)) return text;
    const match = text.match(/\/(?:chatbot|chat)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i);
    if (match?.[1]) return match[1];
  }
  return "";
}

function collectSavedBotsHubEntries() {
  const byId = new Map();
  const ensure = (idValue, raw = null) => {
    const id = savedBotsHubBotId(idValue, raw);
    // Organizer folders/tags are local metadata, not chatbot records. Older or
    // malformed organizer data can contain non-bot keys; never turn those into
    // fake /chatbot/<folder> cards in Saved Bots Hub.
    if (!id) return null;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: "",
        creator: "",
        image: "",
        description: "",
        profileUrl: `https://spicychat.ai/chatbot/${id}`,
        chatUrl: `https://spicychat.ai/chat/${id}`,
        sources: new Set(),
        savedAt: 0,
        lastSeenAt: 0,
        seenCount: 0,
        organizer: {}
      });
    }
    return byId.get(id);
  };

  const mergeMeta = (entry, raw = {}, source = "", time = 0) => {
    if (!entry) return;
    const item = raw && typeof raw === "object" ? raw : {};
    if (source) entry.sources.add(source);
    const candidateName = bestKnownBotName(entry.id, item.name || item.title || "");
    if (!entry.name && candidateName) entry.name = candidateName;
    if (!entry.creator) entry.creator = String(item.creator || item.creatorName || item.creatorHandle || "").replace(/\s+/g, " ").trim();
    if (!entry.image) entry.image = String(item.image || item.avatar || "").trim();
    if (!entry.description) entry.description = String(item.description || item.summary || "").replace(/\s+/g, " ").trim();
    if (item.profileUrl) entry.profileUrl = String(item.profileUrl).trim();
    if (item.chatUrl) entry.chatUrl = String(item.chatUrl).trim();
    entry.savedAt = Math.max(entry.savedAt, Number(time || item.savedAt || 0) || 0);
  };

  const favorites = normalizeBotStore(favoriteBotState);
  favorites.ids.forEach(id => mergeMeta(ensure(id, favorites.meta?.[id]), favorites.meta?.[id], "favorite"));

  const later = normalizeBotStore(laterBotState);
  later.ids.forEach(id => mergeMeta(ensure(id, later.meta?.[id]), later.meta?.[id], "later"));

  uniqueClean(currentOpened).forEach(id => mergeMeta(ensure(id, openedChatMetaState?.[id]), openedChatMetaState?.[id], "opened"));

  const blocked = normalizeBotStore(blockedState);
  blocked.ids.forEach(id => mergeMeta(ensure(id, blocked.meta?.[id]), blocked.meta?.[id], "blocked"));

  const notInterested = normalizeBotStore(notInterestedState);
  notInterested.ids.forEach(id => mergeMeta(ensure(id, notInterested.meta?.[id]), notInterested.meta?.[id], "notInterested"));

  const organizer = normalizeBotOrganization(botOrganizationState);
  Object.entries(organizer.meta || {}).forEach(([id, meta]) => {
    const entry = ensure(id, meta);
    mergeMeta(entry, meta, "organizer");
    if (entry) entry.organizer = meta || {};
  });

  const recent = normalizeRecentlySeenStore(recentlySeenBotState);
  recent.entries.forEach(item => {
    const entry = ensure(item.id, item);
    mergeMeta(entry, item, "recent", item.lastSeenAt);
    if (!entry) return;
    entry.lastSeenAt = Number(item.lastSeenAt) || 0;
    entry.seenCount = Math.max(entry.seenCount, Number(item.seenCount) || 0);
  });

  const creatorWatch = normalizeCreatorBotWatchState(creatorBotWatchState);
  creatorWatch.recent.forEach(item => {
    const entry = ensure(item.id, item);
    mergeMeta(entry, item, "creatorWatch", item.detectedAt);
  });

  return [...byId.values()].map(entry => {
    const org = organizer.meta?.[entry.id] || entry.organizer || {};
    if (entry.sources.has("blocked")) entry.sources.delete("opened");
    return {
      ...entry,
      name: entry.name || entry.id,
      organizer: org,
      sources: [...entry.sources],
      sortTime: Math.max(entry.lastSeenAt || 0, entry.savedAt || 0)
    };
  });
}

function savedBotsHubFilteredEntries() {
  const queryTerms = splitManagerSearchTerms($("savedBotsHubSearch")?.value || savedBotsHubUiState.query || "");
  const source = value("savedBotsHubSourceFilter", "all");
  const overlap = value("savedBotsHubOverlapFilter", "all");
  const sortMode = value("savedBotsHubSortMode", "recent");

  const filtered = collectSavedBotsHubEntries().filter(entry => {
    if (source !== "all" && !entry.sources.includes(source)) return false;
    if (overlap === "multiple" && entry.sources.length < 2) return false;
    if (overlap === "single" && entry.sources.length !== 1) return false;
    if (!queryTerms.length) return true;
    const org = entry.organizer || {};
    const haystack = displayNormalizedSavedText([
      entry.name, entry.id, entry.creator, entry.description,
      ...(entry.sources || []), ...(org.collections || []), ...(org.tags || []),
      org.note || "", org.status || ""
    ].join(" ")).toLowerCase();
    return managerHaystackMatchesTerms(haystack, queryTerms);
  });

  const name = entry => String(entry.name || entry.id || "").toLowerCase();
  const creator = entry => String(entry.creator || "").replace(/^@/, "").toLowerCase();
  if (sortMode === "seen") return filtered.sort((a, b) => (b.seenCount || 0) - (a.seenCount || 0) || (b.sortTime || 0) - (a.sortTime || 0));
  if (sortMode === "name-asc") return filtered.sort((a, b) => name(a).localeCompare(name(b)));
  if (sortMode === "name-desc") return filtered.sort((a, b) => name(b).localeCompare(name(a)));
  if (sortMode === "creator-asc") return filtered.sort((a, b) => creator(a).localeCompare(creator(b)) || name(a).localeCompare(name(b)));
  if (sortMode === "creator-desc") return filtered.sort((a, b) => creator(b).localeCompare(creator(a)) || name(a).localeCompare(name(b)));
  return filtered.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0) || name(a).localeCompare(name(b)));
}

function savedBotsHubSourceLabel(source) {
  return ({
    favorite: "Favorite",
    later: "Later",
    recent: "Recently Seen",
    organizer: "Organizer",
    opened: "Opened",
    blocked: "Blocked",
    notInterested: "Not Interested",
    creatorWatch: "Creator Watch"
  })[source] || source;
}

function savedBotsHubCard(entry) {
  const card = makeElement("div", { className: "bot-manager-card saved-bots-hub-card", dataset: { id: entry.id } });
  if (entry.image) {
    card.appendChild(makeElement("img", { className: "bot-manager-image", attrs: { src: entry.image, alt: "", loading: "lazy", decoding: "async" } }));
  } else {
    card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: "?" }));
  }

  const main = makeElement("div", { className: "bot-manager-main" });
  const selectLabel = makeElement("label", { className: "bot-manager-select" });
  const selectInput = makeElement("input", { className: "saved-bots-hub-select", attrs: { type: "checkbox", "aria-label": `Select ${entry.name || entry.id}` } });
  selectInput.checked = savedBotsHubUiState.selected.has(entry.id);
  selectLabel.append(selectInput, document.createTextNode("Select"));
  main.appendChild(selectLabel);
  main.appendChild(makeElement("div", { className: "bot-manager-title", text: displayNormalizedSavedText(entry.name || entry.id) }));
  if (entry.creator) main.appendChild(makeElement("div", { className: "bot-manager-creator", text: displayNormalizedSavedText(entry.creator) }));
  main.appendChild(makeElement("div", { className: "bot-manager-id", text: entry.id }));

  const chipHost = makeElement("div", { className: "bot-manager-meta-chips" });
  (entry.sources || []).forEach(source => chipHost.appendChild(makeElement("span", { text: savedBotsHubSourceLabel(source) })));
  uniqueClean(entry.organizer?.collections || []).slice(0, 5).forEach(folder => chipHost.appendChild(makeElement("span", { text: `Folder: ${folder}` })));
  uniqueClean(entry.organizer?.tags || []).slice(0, 5).forEach(tag => chipHost.appendChild(makeElement("span", { text: `#${tag}` })));
  if (entry.organizer?.status) chipHost.appendChild(makeElement("span", { text: String(entry.organizer.status).replace(/-/g, " ") }));
  main.appendChild(chipHost);

  if (entry.lastSeenAt || entry.seenCount) {
    const seenParts = [];
    if (entry.seenCount) seenParts.push(`${entry.seenCount} visit${entry.seenCount === 1 ? "" : "s"}`);
    if (entry.lastSeenAt) seenParts.push(`last seen ${new Date(entry.lastSeenAt).toLocaleString()}`);
    main.appendChild(makeElement("div", { className: "saved-bots-hub-seen", text: seenParts.join(" · ") }));
  }
  if (entry.organizer?.note) main.appendChild(makeElement("div", { className: "bot-manager-note", text: entry.organizer.note }));

  const actions = makeElement("div", { className: "bot-manager-actions" });
  if (entry.chatUrl) actions.appendChild(makeElement("a", { text: "Open chat", attrs: { href: entry.chatUrl, target: "_blank", rel: "noopener noreferrer" } }));
  if (entry.profileUrl) actions.appendChild(makeElement("a", { text: "Open profile", attrs: { href: entry.profileUrl, target: "_blank", rel: "noopener noreferrer" } }));
  if ((entry.sources || []).includes("blocked")) actions.appendChild(makeElement("button", { className: "saved-bots-hub-unblock", text: "Unblock", attrs: { type: "button" } }));
  if ((entry.sources || []).includes("notInterested")) actions.appendChild(makeElement("button", { className: "saved-bots-hub-restore-interest", text: "Remove Not Interested", attrs: { type: "button" } }));
  const inLater = (laterBotState?.ids || []).includes(entry.id);
  actions.appendChild(makeElement("button", { className: "saved-bots-hub-later", text: inLater ? "Remove from Later" : "Add to Later", attrs: { type: "button" } }));
  actions.appendChild(makeElement("button", { className: "saved-bots-hub-copy", text: "Copy link", attrs: { type: "button" } }));
  main.appendChild(actions);
  card.appendChild(main);
  return card;
}

function updateSavedBotsHubSelectionUi() {
  const count = $("savedBotsHubSelectedCount");
  if (count) count.textContent = `${savedBotsHubUiState.selected.size} selected`;
  document.querySelectorAll(".saved-bots-hub-card").forEach(card => {
    const id = String(card.dataset.id || "").trim();
    const selected = !!id && savedBotsHubUiState.selected.has(id);
    card.classList.toggle("is-bulk-selected", selected);
    const input = card.querySelector(".saved-bots-hub-select");
    if (input) input.checked = selected;
  });
}

async function applySavedBotsHubBulkAction() {
  const action = value("savedBotsHubBulkAction", "");
  if (!action) return showSettingsToast("Choose a bulk organize action first.");
  const all = collectSavedBotsHubEntries();
  const byId = new Map(all.map(entry => [entry.id, entry]));
  const entries = [...savedBotsHubUiState.selected].map(id => byId.get(id)).filter(Boolean);
  if (!entries.length) return showSettingsToast("Select at least one known bot first.");

  if (action === "copy-links") {
    const links = entries.map(entry => entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`).filter(Boolean);
    try { await navigator.clipboard.writeText(links.join("\n")); showSettingsToast(`Copied ${links.length} profile link${links.length === 1 ? "" : "s"}.`); }
    catch { window.prompt("Copy selected bot profile links:", links.join("\n")); }
    if ($("savedBotsHubBulkAction")) $("savedBotsHubBulkAction").value = "";
    return;
  }

  const before = cloneJson(botOrganizationState);
  botOrganizationState = normalizeBotOrganization(botOrganizationState);
  let message = "";

  if (["add-folder", "remove-folder"].includes(action)) {
    const folder = chooseSavedManagerFolder(action === "add-folder" ? "Folder to add" : "Folder to remove");
    if (!folder) return;
    const add = action === "add-folder";
    for (const entry of entries) {
      const meta = ensureOrganizerMetaForEntry(entry);
      if (!meta) continue;
      meta.collections = add
        ? uniqueClean([...(meta.collections || []), folder])
        : uniqueClean((meta.collections || []).filter(item => item !== folder));
      meta.updatedAt = Date.now();
      if (!organizerMetaHasContent(meta)) delete botOrganizationState.meta[entry.id];
    }
    message = `${add ? "Added" : "Removed"} ${entries.length} known bot${entries.length === 1 ? "" : "s"} ${add ? "to" : "from"} folder ${folder}.`;
  } else if (["add-tag", "remove-tag"].includes(action)) {
    const raw = String(window.prompt(action === "add-tag" ? "Personal tag to add:" : "Personal tag to remove:", "") || "").replace(/\s+/g, " ").trim();
    if (!raw) return;
    const add = action === "add-tag";
    for (const entry of entries) {
      const meta = ensureOrganizerMetaForEntry(entry);
      if (!meta) continue;
      meta.tags = add
        ? uniqueClean([...(meta.tags || []), raw]).slice(0, 40)
        : uniqueClean((meta.tags || []).filter(item => item.toLowerCase() !== raw.toLowerCase())).slice(0, 40);
      meta.updatedAt = Date.now();
      if (!organizerMetaHasContent(meta)) delete botOrganizationState.meta[entry.id];
    }
    message = `${add ? "Added" : "Removed"} personal tag ${raw} ${add ? "on" : "from"} ${entries.length} known bot${entries.length === 1 ? "" : "s"}.`;
  } else {
    return;
  }

  await persistSavedManagerBulk(["organizer"]);
  if ($("savedBotsHubBulkAction")) $("savedBotsHubBulkAction").value = "";
  renderSavedBotsHub();
  renderBotManager("favorite");
  renderBotManager("later");
  showSettingsToast(message, async () => {
    botOrganizationState = normalizeBotOrganization(before);
    await persistSavedManagerBulk(["organizer"]);
    renderSavedBotsHub();
    renderBotManager("favorite");
    renderBotManager("later");
  });
}

function renderSavedBotsHub() {
  const host = $("savedBotsHubManager");
  if (!host) return;
  const all = collectSavedBotsHubEntries();
  const knownIds = new Set(all.map(entry => entry.id).filter(Boolean));
  for (const id of [...savedBotsHubUiState.selected]) if (!knownIds.has(id)) savedBotsHubUiState.selected.delete(id);
  const entries = savedBotsHubFilteredEntries();
  let limit = Number(savedBotsHubUiState.visible || 20);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  const shown = entries.slice(0, limit);

  const summary = $("savedBotsHubSummary");
  if (summary) summary.textContent = entries.length === all.length
    ? `${all.length} known, showing ${shown.length}`
    : `${entries.length} matches of ${all.length}, showing ${shown.length}`;

  const stats = $("savedBotsHubStats");
  if (stats) {
    const count = source => all.filter(entry => entry.sources.includes(source)).length;
    const overlaps = all.filter(entry => entry.sources.length > 1).length;
    stats.replaceChildren(
      makeElement("span", { text: `${all.length} unique` }),
      makeElement("span", { text: `${count("favorite")} Favorite` }),
      makeElement("span", { text: `${count("later")} Later` }),
      makeElement("span", { text: `${count("recent")} Recently Seen` }),
      makeElement("span", { text: `${count("organizer")} Organized` }),
      makeElement("span", { text: `${count("opened")} Opened` }),
      makeElement("span", { text: `${count("blocked")} Blocked` }),
      makeElement("span", { text: `${count("notInterested")} Not Interested` }),
      makeElement("span", { text: `${count("creatorWatch")} Creator Watch` }),
      makeElement("span", { text: `${overlaps} overlaps` })
    );
  }

  const showMore = $("savedBotsHubShowMore");
  const showLess = $("savedBotsHubShowLess");
  const collapse = $("savedBotsHubCollapse");
  if (showMore) {
    showMore.style.display = entries.length > shown.length ? "" : "none";
    showMore.textContent = `Show 20 more (${Math.max(0, entries.length - shown.length)} left)`;
  }
  if (showLess) showLess.style.display = shown.length > 20 || !savedBotsHubUiState.collapsed ? "" : "none";
  if (collapse) {
    collapse.style.display = entries.length > 20 ? "" : "none";
    collapse.textContent = limit <= 20 ? "Show 100" : "Collapse to 20";
  }

  if (!all.length) {
    setEmptyState(host, "No saved/known bots yet.");
    return;
  }
  if (!entries.length) {
    setEmptyState(host, "No bots match these hub filters.");
    return;
  }
  host.replaceChildren(...shown.map(savedBotsHubCard));

  host.querySelectorAll("input.saved-bots-hub-select").forEach(input => {
    input.addEventListener("change", () => {
      const id = String(input.closest(".saved-bots-hub-card")?.dataset.id || "").trim();
      if (!id) return;
      if (input.checked) savedBotsHubUiState.selected.add(id);
      else savedBotsHubUiState.selected.delete(id);
      updateSavedBotsHubSelectionUi();
    });
  });
  updateSavedBotsHubSelectionUi();

  host.querySelectorAll(".saved-bots-hub-unblock").forEach(button => {
    button.addEventListener("click", async () => {
      const id = String(button.closest(".saved-bots-hub-card")?.dataset.id || "").trim();
      if (!id) return;
      blockedState = normalizeBotStore(blockedState);
      blockedState.ids = blockedState.ids.filter(item => item !== id);
      delete blockedState.meta[id];
      await storageSet({ [BLOCKED_BOTS_KEY]: blockedState });
      renderBotManagers();
      renderSavedBotsHub();
    });
  });

  host.querySelectorAll(".saved-bots-hub-restore-interest").forEach(button => {
    button.addEventListener("click", async () => {
      const id = String(button.closest(".saved-bots-hub-card")?.dataset.id || "").trim();
      if (!id) return;
      notInterestedState = normalizeBotStore(notInterestedState);
      notInterestedState.ids = notInterestedState.ids.filter(item => item !== id);
      delete notInterestedState.meta[id];
      await storageSet({ [NOT_INTERESTED_KEY]: notInterestedState });
      renderBotManagers();
      renderSavedBotsHub();
    });
  });

  host.querySelectorAll(".saved-bots-hub-later").forEach(button => {
    button.addEventListener("click", async () => {
      const id = String(button.closest(".saved-bots-hub-card")?.dataset.id || "").trim();
      if (!id) return;
      const entry = all.find(item => item.id === id) || {};
      laterBotState = normalizeBotStore(laterBotState);
      const before = cloneJson(laterBotState);
      const inLater = laterBotState.ids.includes(id);
      if (inLater) {
        laterBotState.ids = laterBotState.ids.filter(item => item !== id);
        delete laterBotState.meta[id];
      } else {
        laterBotState.ids.push(id);
        laterBotState.meta[id] = {
          id,
          name: entry.name || id,
          image: entry.image || "",
          creator: entry.creator || "",
          description: entry.description || "",
          chatUrl: entry.chatUrl || `https://spicychat.ai/chat/${id}`,
          profileUrl: entry.profileUrl || `https://spicychat.ai/chatbot/${id}`,
          savedAt: Date.now()
        };
      }
      markSavedStoreDirty("later");
      await persistSavedManagerBulk(["later"]);
      renderSavedBotsHub();
      renderBotManager("favorite");
      renderBotManager("later");
      showSettingsToast(inLater ? "Removed from Later." : "Added to Later.", async () => {
        laterBotState = normalizeBotStore(before);
        markSavedStoreDirty("later");
        await persistSavedManagerBulk(["later"]);
        renderSavedBotsHub();
        renderBotManager("favorite");
        renderBotManager("later");
      });
    });
  });

  host.querySelectorAll(".saved-bots-hub-copy").forEach(button => {
    button.addEventListener("click", async () => {
      const id = String(button.closest(".saved-bots-hub-card")?.dataset.id || "").trim();
      const entry = all.find(item => item.id === id);
      const link = entry?.profileUrl || (id ? `https://spicychat.ai/chatbot/${id}` : "");
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        showSettingsToast("Profile link copied.");
      } catch {
        showSettingsToast("Could not copy the profile link.");
      }
    });
  });
}

function setupSavedBotsHubControls() {
  const search = $("savedBotsHubSearch");
  const refresh = debounceCallback(() => {
    savedBotsHubUiState.query = search?.value || "";
    savedBotsHubUiState.visible = 20;
    savedBotsHubUiState.collapsed = true;
    renderSavedBotsHub();
  });
  search?.addEventListener("input", refresh);

  ["savedBotsHubSourceFilter", "savedBotsHubOverlapFilter", "savedBotsHubSortMode"].forEach(id => {
    $(id)?.addEventListener("change", () => {
      savedBotsHubUiState.visible = 20;
      savedBotsHubUiState.collapsed = true;
      renderSavedBotsHub();
    });
  });
  $("savedBotsHubShowMore")?.addEventListener("click", () => {
    savedBotsHubUiState.visible = Math.min(5000, Number(savedBotsHubUiState.visible || 20) + 20);
    savedBotsHubUiState.collapsed = true;
    renderSavedBotsHub();
  });
  $("savedBotsHubShowLess")?.addEventListener("click", () => {
    savedBotsHubUiState.visible = 20;
    savedBotsHubUiState.collapsed = true;
    renderSavedBotsHub();
  });
  $("savedBotsHubCollapse")?.addEventListener("click", () => {
    savedBotsHubUiState.visible = Number(savedBotsHubUiState.visible || 20) <= 20 ? 100 : 20;
    savedBotsHubUiState.collapsed = savedBotsHubUiState.visible <= 20;
    renderSavedBotsHub();
  });
  $("savedBotsHubSelectShown")?.addEventListener("click", () => {
    const entries = savedBotsHubFilteredEntries().slice(0, Math.max(1, Number(savedBotsHubUiState.visible || 20)));
    entries.forEach(entry => savedBotsHubUiState.selected.add(entry.id));
    updateSavedBotsHubSelectionUi();
  });
  $("savedBotsHubSelectFiltered")?.addEventListener("click", () => {
    savedBotsHubFilteredEntries().forEach(entry => savedBotsHubUiState.selected.add(entry.id));
    updateSavedBotsHubSelectionUi();
  });
  $("savedBotsHubClearSelection")?.addEventListener("click", () => {
    savedBotsHubUiState.selected.clear();
    updateSavedBotsHubSelectionUi();
  });
  $("savedBotsHubApplyBulk")?.addEventListener("click", () => applySavedBotsHubBulkAction());
}

function botEntriesFromStore(store, includeNames = true) {
  const entries = [];
  const seen = new Set();
  const meta = store.meta || {};

  (store.ids || []).forEach((id, index) => {
    const item = meta[id] || {};
    entries.push({
      type: "id",
      id,
      name: bestKnownBotName(id, item.name) || (isPlaceholderBotName(item.name, id) ? "Unknown bot" : item.name) || id,
      image: item.image || "",
      creator: item.creator || item.creatorName || item.creatorHandle || "",
      description: item.description || "",
      profileUrl: item.profileUrl || (id ? `https://spicychat.ai/chatbot/${id}` : ""),
      chatUrl: item.chatUrl || (id ? `https://spicychat.ai/chat/${id}` : ""),
      savedAt: Number(item.savedAt || 0) || 0,
      index
    });
    seen.add(`id:${id}`);
  });

  if (includeNames) {
    (store.names || []).forEach((name, index) => {
      if (seen.has(`name:${name.toLowerCase()}`)) return;
      const item = meta[`name:${name}`] || meta[name] || {};
      entries.push({
        type: "name",
        id: "",
        name,
        image: "",
        profileUrl: "",
        chatUrl: "",
        savedAt: Number(item.savedAt || 0) || 0,
        index: (store.ids || []).length + index
      });
    });
  }

  return entries;
}

function managerElementId(kind, suffix) {
  const prefixes = {
    blocked: "blockedBot",
    notInterested: "notInterestedBot",
    later: "laterBot",
    favorite: "favoriteBot",
    opened: "openedBot"
  };

  return `${prefixes[kind] || prefixes.notInterested}${suffix}`;
}

function storeForManagerKind(kind) {
  if (kind === "opened") return openedStoreFromState();
  if (kind === "later") return laterBotState;
  if (kind === "favorite") return favoriteBotState;
  if (kind === "blocked") return blockedState;
  return notInterestedState;
}

function updateBotManagerSummary(kind, total, filtered, shown) {
  const summary = $(managerElementId(kind, "ManagerSummary"));
  if (!summary) return;

  if (!total) {
    summary.textContent = "0 saved";
    return;
  }

  if (filtered !== total) {
    summary.textContent = `${filtered} match${filtered === 1 ? "" : "es"} of ${total}, showing ${shown}`;
  } else {
    summary.textContent = `${total} saved, showing ${shown}`;
  }
}

function getBotManagerSearch(kind) {
  const input = $(managerElementId(kind, "Search"));
  return splitManagerSearchTerms(input?.value || botManagerUiState[kind]?.query || "");
}

function getBotSortMode(kind) {
  const settingKeys = {
    blocked: "blockedBotSortMode",
    later: "laterBotSortMode",
    favorite: "favoriteBotSortMode",
    opened: "openedBotSortMode"
  };
  const key = settingKeys[kind];
  if (!key) return "newest";

  const selected = value(key, DEFAULT_SETTINGS[key] || "newest");
  return ["newest", "oldest", "name-asc", "name-desc", "creator-asc", "creator-desc"].includes(selected)
    ? selected
    : "newest";
}

function sortBotManagerEntries(entries, kind) {
  if (!["blocked", "later", "favorite", "opened"].includes(kind)) return entries;

  const mode = getBotSortMode(kind);
  const copy = [...entries];
  const savedTime = entry => Number(entry.savedAt || 0) || 0;
  const originalIndex = entry => Number(entry.index || 0) || 0;
  const nameValue = entry => String(entry.name || entry.id || "").toLowerCase();

  if (mode === "oldest") {
    return copy.sort((a, b) => savedTime(a) - savedTime(b) || originalIndex(a) - originalIndex(b));
  }

  if (mode === "name-asc") {
    return copy.sort((a, b) => nameValue(a).localeCompare(nameValue(b)) || originalIndex(a) - originalIndex(b));
  }

  if (mode === "name-desc") {
    return copy.sort((a, b) => nameValue(b).localeCompare(nameValue(a)) || originalIndex(a) - originalIndex(b));
  }

  const creatorValue = entry => String(entry.creator || "").replace(/^@/, "").toLowerCase();
  if (mode === "creator-asc") {
    return copy.sort((a, b) => creatorValue(a).localeCompare(creatorValue(b)) || nameValue(a).localeCompare(nameValue(b)));
  }
  if (mode === "creator-desc") {
    return copy.sort((a, b) => creatorValue(b).localeCompare(creatorValue(a)) || nameValue(a).localeCompare(nameValue(b)));
  }

  return copy.sort((a, b) => savedTime(b) - savedTime(a) || originalIndex(b) - originalIndex(a));
}

function managerOrganizerMeta(entry) {
  const id = String(entry?.id || "").trim();
  return id ? (botOrganizationState?.meta?.[id] || {}) : {};
}

function refreshBotManagerFolderOptions(kind) {
  if (!["favorite", "later"].includes(kind)) return;
  const select = $(managerElementId(kind, "FolderFilter"));
  if (!select) return;

  const previous = String(select.value || loadedSettingsSnapshot?.[`${kind}BotFolderFilter`] || "all");
  const folders = new Set();
  Object.values(botOrganizationState?.meta || {}).forEach(meta => {
    uniqueClean(meta?.collections || []).forEach(folder => folders.add(folder));
  });

  const options = [
    ["all", "All folders"],
    ["__unfoldered__", "Unfoldered"],
    ...[...folders].sort((a, b) => a.localeCompare(b)).map(folder => [folder, folder])
  ];

  select.replaceChildren(...options.map(([value, label]) => makeElement("option", {
    text: label,
    attrs: { value }
  })));
  select.value = options.some(([value]) => value === previous) ? previous : "all";
}

function managerEntryBlocked(entry) {
  const id = String(entry?.id || "").trim();
  const name = String(entry?.name || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (id && (blockedState?.ids || []).includes(id)) return true;
  if (!name) return false;
  return (blockedState?.names || []).some(value => String(value || "").replace(/\s+/g, " ").trim().toLowerCase() === name);
}

function managerEntryOpened(entry) {
  const id = String(entry?.id || "").trim();
  return !!(id && currentOpened.includes(id) && !managerEntryBlocked(entry));
}

function managerExtraFilter(entry, kind) {
  const id = String(entry?.id || "").trim();

  if (kind === "blocked") {
    const filter = value("blockedBotDislikeFilter", "all");
    if (filter === "all") return true;
    const handled = !!quickDislikeHistoryEntry(id);
    return filter === "handled" ? handled : !handled;
  }

  if (!["favorite", "later"].includes(kind)) return true;
  if (!id) return true;

  const relation = value(managerElementId(kind, "RelationFilter"), "all");
  if (kind === "favorite") {
    const inLater = (laterBotState?.ids || []).includes(id);
    if (relation === "later" && !inLater) return false;
    if (relation === "not-later" && inLater) return false;
  } else {
    const inFavorites = (favoriteBotState?.ids || []).includes(id);
    if (relation === "favorite" && !inFavorites) return false;
    if (relation === "not-favorite" && inFavorites) return false;
  }

  const folder = value(managerElementId(kind, "FolderFilter"), "all");
  if (folder !== "all") {
    const collections = uniqueClean(managerOrganizerMeta(entry)?.collections || []);
    if (folder === "__unfoldered__" && collections.length) return false;
    if (folder !== "__unfoldered__" && !collections.includes(folder)) return false;
  }

  const creatorQuery = String(value(managerElementId(kind, "CreatorFilter"), "") || "").replace(/^@/, "").trim().toLowerCase();
  if (creatorQuery) {
    const creator = String(entry.creator || "").replace(/^@/, "").toLowerCase();
    if (!creator.includes(creatorQuery)) return false;
  }

  const state = value(managerElementId(kind, "StateFilter"), "all");
  if (state === "blocked" && !managerEntryBlocked(entry)) return false;
  if (state === "opened" && !managerEntryOpened(entry)) return false;
  if (state === "unopened" && (managerEntryOpened(entry) || managerEntryBlocked(entry))) return false;
  if (state === "available" && managerEntryBlocked(entry)) return false;

  return true;
}

function getBotManagerEntries(kind, baseEntries = null) {
  const isBlocked = kind === "blocked";
  const entries = Array.isArray(baseEntries)
    ? baseEntries
    : botEntriesFromStore(storeForManagerKind(kind), isBlocked);
  const queryTerms = getBotManagerSearch(kind);

  const filtered = entries.filter(entry => {
    if (!managerExtraFilter(entry, kind)) return false;
    if (!queryTerms.length) return true;

    const organizer = managerOrganizerMeta(entry);
    const haystack = [
      entry.name,
      entry.id,
      entry.chatUrl,
      entry.profileUrl,
      entry.creator,
      entry.description,
      entry.type,
      ...(organizer.collections || []),
      ...(organizer.tags || []),
      organizer.note || "",
      organizer.status || ""
    ]
      .join(" ")
      .toLowerCase();

    return managerHaystackMatchesTerms(haystack, queryTerms);
  });

  return sortBotManagerEntries(filtered, kind);
}

function botManagerBulkSet(kind) {
  if (!botManagerBulkSelection[kind]) botManagerBulkSelection[kind] = new Set();
  return botManagerBulkSelection[kind];
}

function botManagerShownEntries(kind) {
  const entries = getBotManagerEntries(kind);
  const limit = Math.max(1, Math.min(5000, Number(botManagerUiState[kind]?.visible || 20) || 20));
  return entries.slice(0, limit);
}

function updateBotManagerBulkCount(kind) {
  if (!["blocked", "favorite", "later"].includes(kind)) return;
  const validIds = new Set(botEntriesFromStore(storeForManagerKind(kind), false).map(entry => String(entry.id || "")).filter(Boolean));
  const selected = botManagerBulkSet(kind);
  for (const id of [...selected]) if (!validIds.has(id)) selected.delete(id);
  const count = $(managerElementId(kind, "SelectedCount"));
  if (count) count.textContent = `${selected.size} selected`;
}

function botManagerEntryForId(kind, id) {
  return botEntriesFromStore(storeForManagerKind(kind), false).find(entry => entry.id === id) || { id, name: id };
}

function ensureOrganizerMetaForEntry(entry) {
  const id = String(entry?.id || "").trim();
  if (!id) return null;
  botOrganizationState = normalizeBotOrganization(botOrganizationState);
  const previous = botOrganizationState.meta[id] || {};
  botOrganizationState.meta[id] = {
    ...previous,
    id,
    name: entry.name || previous.name || id,
    image: entry.image || previous.image || "",
    creator: entry.creator || previous.creator || "",
    chatUrl: entry.chatUrl || previous.chatUrl || `https://spicychat.ai/chat/${id}`,
    profileUrl: entry.profileUrl || previous.profileUrl || `https://spicychat.ai/chatbot/${id}`,
    collections: uniqueClean(previous.collections || []),
    tags: uniqueClean(previous.tags || []).slice(0, 40),
    note: String(previous.note || "").replace(/\s+/g, " ").trim().slice(0, 1000),
    status: ["needs-work", "testing", "finished"].includes(previous.status) ? previous.status : "",
    updatedAt: Date.now()
  };
  return botOrganizationState.meta[id];
}

function organizerMetaHasContent(meta) {
  return !!(meta && (
    uniqueClean(meta.collections || []).length ||
    uniqueClean(meta.tags || []).length ||
    String(meta.note || "").trim() ||
    String(meta.status || "").trim()
  ));
}

function configuredBotFolders() {
  return uniqueClean(String($("botCollections")?.value || loadedSettingsSnapshot?.botCollections || "").split(/[\n,]+/g));
}

function chooseSavedManagerFolder(promptText = "Folder name") {
  const folders = configuredBotFolders();
  if (!folders.length) {
    showSettingsToast("Create at least one Bot Organizer folder first.");
    return "";
  }
  const raw = String(window.prompt(`${promptText}:\n${folders.join(", ")}`, folders[0]) || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const exact = folders.find(folder => folder.toLowerCase() === raw.toLowerCase());
  if (!exact) {
    showSettingsToast("That Bot Organizer folder is not configured.");
    return "";
  }
  return exact;
}

async function persistSavedManagerBulk(keys = []) {
  const payload = {};
  if (keys.includes("favorite")) {
    favoriteBotState = normalizeBotStore(favoriteBotState);
    payload[FAVORITE_BOTS_KEY] = favoriteBotState;
    dirtySavedStores.delete("favorite");
  }
  if (keys.includes("later")) {
    laterBotState = normalizeBotStore(laterBotState);
    payload[LATER_BOTS_KEY] = laterBotState;
    dirtySavedStores.delete("later");
  }
  if (keys.includes("organizer")) {
    botOrganizationState = normalizeBotOrganization(botOrganizationState);
    payload[BOT_ORGANIZER_KEY] = botOrganizationState;
  }
  if (Object.keys(payload).length) await storageSet(payload);
  refreshStorageUsageIfVisible();
}

async function applyBlockedBotBulkAction() {
  const actionSelect = $("blockedBotBulkAction");
  const action = String(actionSelect?.value || "");
  if (!action) { showSettingsToast("Choose a bulk action first."); return; }
  const selected = botManagerBulkSet("blocked");
  const entries = [...selected].map(id => botManagerEntryForId("blocked", id)).filter(entry => entry.id);
  if (!entries.length) { showSettingsToast("Select at least one blocked bot first."); return; }

  if (action === "copy-links") {
    const links = entries.map(entry => entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`);
    try { await navigator.clipboard.writeText(links.join("\n")); showSettingsToast(`Copied ${links.length} blocked bot profile link${links.length === 1 ? "" : "s"}.`); }
    catch { window.prompt("Copy selected blocked bot profile links:", links.join("\n")); }
  } else if (action === "unblock") {
    if (!window.confirm(`Unblock ${entries.length} selected bot${entries.length === 1 ? "" : "s"}?`)) return;
    blockedState = normalizeBotStore(blockedState);
    const ids = new Set(entries.map(entry => entry.id));
    blockedState.ids = blockedState.ids.filter(id => !ids.has(id));
    entries.forEach(entry => delete blockedState.meta[entry.id]);
    await storageSet({ [BLOCKED_BOTS_KEY]: blockedState });
    selected.clear();
    showSettingsToast(`Unblocked ${entries.length} bot${entries.length === 1 ? "" : "s"}.`);
  } else if (action === "dislike-selected") {
    if (actionSelect) actionSelect.value = "";
    await runBlockedBulkDislike("selected");
    return;
  }

  if (actionSelect) actionSelect.value = "";
  renderBotManager("blocked");
  renderSavedBotsHub();
}

async function applyBotManagerBulkAction(kind) {
  if (!["favorite", "later"].includes(kind)) return;
  const actionSelect = $(managerElementId(kind, "BulkAction"));
  const action = String(actionSelect?.value || "");
  if (!action) {
    showSettingsToast("Choose a bulk action first.");
    return;
  }

  const selected = botManagerBulkSet(kind);
  const entries = [...selected].map(id => botManagerEntryForId(kind, id)).filter(entry => entry.id);
  if (!entries.length) {
    showSettingsToast("Select at least one saved bot first.");
    return;
  }

  const ids = entries.map(entry => entry.id);
  const before = {
    favorite: cloneJson(favoriteBotState),
    later: cloneJson(laterBotState),
    organizer: cloneJson(botOrganizationState)
  };
  const changed = new Set();
  let message = "";

  if (action === "copy-links") {
    const links = entries.map(entry => entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`).filter(Boolean);
    try {
      await navigator.clipboard.writeText(links.join("\n"));
      showSettingsToast(`Copied ${links.length} bot profile link${links.length === 1 ? "" : "s"}.`);
    } catch {
      window.prompt("Copy selected bot profile links:", links.join("\n"));
    }
    if (actionSelect) actionSelect.value = "";
    return;
  }

  if (action === "add-later" || action === "remove-later") {
    if (kind !== "favorite") return;
    laterBotState = normalizeBotStore(laterBotState);
    const add = action === "add-later";
    for (const entry of entries) {
      if (add) {
        if (!laterBotState.ids.includes(entry.id)) laterBotState.ids.push(entry.id);
        laterBotState.meta[entry.id] = {
          ...(laterBotState.meta[entry.id] || {}),
          id: entry.id,
          name: entry.name || entry.id,
          image: entry.image || "",
          creator: entry.creator || "",
          description: entry.description || "",
          chatUrl: entry.chatUrl || `https://spicychat.ai/chat/${entry.id}`,
          profileUrl: entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`,
          savedAt: Number(laterBotState.meta[entry.id]?.savedAt) || Date.now()
        };
      } else {
        laterBotState.ids = laterBotState.ids.filter(id => id !== entry.id);
        delete laterBotState.meta[entry.id];
      }
    }
    changed.add("later");
    message = `${add ? "Added" : "Removed"} ${entries.length} bot${entries.length === 1 ? "" : "s"} ${add ? "to" : "from"} Later.`;
  } else if (["add-folder", "remove-folder"].includes(action)) {
    const folder = chooseSavedManagerFolder(action === "add-folder" ? "Folder to add" : "Folder to remove");
    if (!folder) return;
    const add = action === "add-folder";
    for (const entry of entries) {
      const meta = ensureOrganizerMetaForEntry(entry);
      if (!meta) continue;
      meta.collections = add
        ? uniqueClean([...(meta.collections || []), folder])
        : uniqueClean((meta.collections || []).filter(item => item !== folder));
      meta.updatedAt = Date.now();
      if (!organizerMetaHasContent(meta)) delete botOrganizationState.meta[entry.id];
    }
    changed.add("organizer");
    message = `${add ? "Added" : "Removed"} ${entries.length} bot${entries.length === 1 ? "" : "s"} ${add ? "to" : "from"} folder ${folder}.`;
  } else if (["add-tag", "remove-tag"].includes(action)) {
    const raw = String(window.prompt(action === "add-tag" ? "Personal tag to add:" : "Personal tag to remove:", "") || "").replace(/\s+/g, " ").trim();
    if (!raw) return;
    const add = action === "add-tag";
    for (const entry of entries) {
      const meta = ensureOrganizerMetaForEntry(entry);
      if (!meta) continue;
      meta.tags = add
        ? uniqueClean([...(meta.tags || []), raw]).slice(0, 40)
        : uniqueClean((meta.tags || []).filter(item => item.toLowerCase() !== raw.toLowerCase())).slice(0, 40);
      meta.updatedAt = Date.now();
      if (!organizerMetaHasContent(meta)) delete botOrganizationState.meta[entry.id];
    }
    changed.add("organizer");
    message = `${add ? "Added" : "Removed"} personal tag ${raw} ${add ? "on" : "from"} ${entries.length} bot${entries.length === 1 ? "" : "s"}.`;
  } else if (action === "remove-list") {
    const label = kind === "favorite" ? "favorite history" : "Later";
    if (!window.confirm(`Remove ${entries.length} selected bot${entries.length === 1 ? "" : "s"} from ${label}?`)) return;
    if (kind === "favorite") {
      favoriteBotState = normalizeBotStore(favoriteBotState);
      favoriteBotState.ids = favoriteBotState.ids.filter(id => !selected.has(id));
      ids.forEach(id => delete favoriteBotState.meta[id]);
      changed.add("favorite");
    } else {
      laterBotState = normalizeBotStore(laterBotState);
      laterBotState.ids = laterBotState.ids.filter(id => !selected.has(id));
      ids.forEach(id => delete laterBotState.meta[id]);
      changed.add("later");
    }
    selected.clear();
    message = `Removed ${entries.length} bot${entries.length === 1 ? "" : "s"} from ${label}.`;
  }

  await persistSavedManagerBulk([...changed]);
  renderBotManager("favorite");
  renderBotManager("later");
  if (actionSelect) actionSelect.value = "";
  if (!message) return;

  showSettingsToast(message, async () => {
    favoriteBotState = normalizeBotStore(before.favorite);
    laterBotState = normalizeBotStore(before.later);
    botOrganizationState = normalizeBotOrganization(before.organizer);
    await persistSavedManagerBulk(["favorite", "later", "organizer"]);
    renderBotManager("favorite");
    renderBotManager("later");
  });
}

function blockedQuickDislikeCounts() {
  const ids = uniqueClean(blockedState?.ids || []);
  let handled = 0;
  ids.forEach(id => { if (quickDislikeHistoryEntry(id)) handled += 1; });
  return {
    total: ids.length,
    handled,
    remaining: Math.max(0, ids.length - handled),
    nameOnly: uniqueClean(blockedState?.names || []).length
  };
}

function updateBlockedDislikeStatus(text = "") {
  const status = $("blockedBotDislikeStatus");
  if (!status) return;
  const counts = blockedQuickDislikeCounts();
  const suffix = counts.nameOnly ? ` · ${counts.nameOnly} name-only skipped` : "";
  const next = text || `${counts.handled} handled · ${counts.remaining} remaining${suffix}`;
  if (status.textContent !== next) status.textContent = next;
}

function optionsLooksMobile() {
  if (navigator.userAgentData?.mobile) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigator.userAgent || ""));
}

function quickDislikeResponseIsTransient(response) {
  const status = String(response?.status || (response ? "failed" : "worker-error"));
  return !response?.ok && BULK_DISLIKE_TRANSIENT_STATUSES.has(status);
}

async function runQuickDislikeWithBackoff(payload, label = "") {
  let response = null;
  for (let attempt = 0; attempt <= BULK_DISLIKE_RETRY_LIMIT; attempt += 1) {
    if (navigator.onLine === false) return { ok: false, status: "offline-paused" };
    if (attempt > 0) {
      const wait = Math.min(8000, BULK_DISLIKE_RETRY_BASE_MS * (2 ** (attempt - 1)));
      updateBlockedDislikeStatus(`Retrying ${label || payload.botName || payload.botId} in ${(wait / 1000).toFixed(wait >= 2000 ? 0 : 1)}s · attempt ${attempt + 1}/${BULK_DISLIKE_RETRY_LIMIT + 1}`);
      await new Promise(resolve => setTimeout(resolve, wait));
      if (navigator.onLine === false) return { ok: false, status: "offline-paused" };
    }
    try {
      response = await runtimeMessage({ ...payload, retryAttempt: attempt });
    } catch (error) {
      response = { ok: false, status: "worker-error", error: String(error?.message || error || "Quick Dislike worker failed") };
    }
    if (!quickDislikeResponseIsTransient(response) || attempt >= BULK_DISLIKE_RETRY_LIMIT) return response || { ok: false, status: "worker-error" };
  }
  return response || { ok: false, status: "worker-error" };
}

function applyQuickDislikeResponseToLocalHistory(id, name, response) {
  const botId = String(id || "").trim();
  if (!botId || !response?.ok) return false;
  let status = String(response.status || "");
  if (status === "already-handled") status = String(response.rememberedStatus || "");
  if (!["disliked", "already-disliked", "already-rated-or-unavailable", "unavailable-private-or-deleted", "unavailable-creator-blocked"].includes(status)) return false;
  quickDislikeHistoryState = normalizeQuickDislikeHistory(quickDislikeHistoryState);
  quickDislikeHistoryState.bots[botId] = {
    status,
    name: String(name || quickDislikeHistoryState.bots[botId]?.name || "").slice(0, 160),
    handledAt: Number(response.handledAt || 0) || Date.now()
  };
  return true;
}

async function refreshQuickDislikeHistoryState() {
  const result = await storageGet([QUICK_DISLIKE_HISTORY_KEY, QUICK_DISLIKE_BULK_STATE_KEY]);
  quickDislikeHistoryState = normalizeQuickDislikeHistory(result[QUICK_DISLIKE_HISTORY_KEY]);
  quickDislikeBulkState = normalizeQuickDislikeBulkState(result[QUICK_DISLIKE_BULK_STATE_KEY]);
  updateBlockedBulkResumeControls();
  return quickDislikeHistoryState;
}

function blockedBulkCandidateIds(mode = "remaining") {
  const allBlocked = uniqueClean(blockedState?.ids || []);
  const stillEligible = id => allBlocked.includes(id) && !quickDislikeHistoryEntry(id);
  if (mode === "selected") return [...botManagerBulkSet("blocked")].filter(stillEligible);
  if (mode === "resume") {
    const stored = uniqueClean([quickDislikeBulkState.currentId, ...(quickDislikeBulkState.pendingIds || [])]);
    return stored.filter(stillEligible);
  }
  if (mode === "failed") return uniqueClean(quickDislikeBulkState.failedIds || []).filter(stillEligible);
  return allBlocked.filter(stillEligible);
}

function updateBlockedBulkResumeControls() {
  const resume = $("resumeBlockedDislikeRun");
  const retry = $("retryFailedBlockedDislikes");
  if (!resume || !retry) return;
  const resumeCount = blockedBulkCandidateIds("resume").length;
  const failedCount = blockedBulkCandidateIds("failed").length;
  const interrupted = ["running", "paused", "interrupted"].includes(quickDislikeBulkState?.status);
  resume.hidden = !(interrupted && resumeCount);
  resume.textContent = resumeCount ? `Resume unfinished (${resumeCount})` : "Resume unfinished";
  retry.hidden = !failedCount;
  retry.textContent = failedCount ? `Retry last failed (${failedCount})` : "Retry last failed";
}

async function runBlockedBulkDislike(mode = "remaining") {
  const button = $("bulkDislikeBlockedBots");
  const clearButton = $("clearBlockedDislikeHistory");

  if (blockedBulkDislikeRunning) {
    blockedBulkDislikeStopRequested = true;
    const runId = activeBlockedBulkDislikeRunId || quickDislikeBulkState?.runId || "";
    if (button) button.textContent = "Stopping after current bot...";
    updateBlockedDislikeStatus("Stopping after the current bot...");
    if (runId) await runtimeMessage({ type: "DS_QUICK_DISLIKE_CANCEL_BULK", bulkRunId: runId });
    await persistQuickDislikeBulkState({
      ...quickDislikeBulkState,
      status: "paused",
      runId,
      stopRequested: true
    });
    return;
  }

  if (optionsLooksMobile()) {
    showSettingsToast("Bulk Dislike is desktop-browser only for now.");
    return;
  }

  // Mark the run active before any async setup so a second click cannot race
  // this call and accidentally start a second bulk loop.
  blockedBulkDislikeRunning = true;
  blockedBulkDislikeStopRequested = false;
  const runId = `blocked-dislike-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  activeBlockedBulkDislikeRunId = runId;
  if (button) button.textContent = "Stop after current bot";
  if (clearButton) clearButton.disabled = true;

  let disliked = 0;
  let alreadySet = 0;
  let alreadyDisliked = 0;
  let creatorBlocked = 0;
  let unavailable = 0;
  let failed = 0;
  let processed = 0;
  let consecutiveWorkerFailures = 0;
  let autoPausedAfterFailures = false;
  const failedIds = [];
  let candidates = [];
  let startedAt = Date.now();

  try {
    await ensureBlockingDataLoaded();
    await refreshQuickDislikeHistoryState();
    if (blockedBulkDislikeStopRequested) return;

    candidates = blockedBulkCandidateIds(mode);
    if (!candidates.length) {
      updateBlockedDislikeStatus();
      const message = mode === "failed"
        ? "There are no failed blocked-bot dislikes left to retry."
        : mode === "resume"
          ? "There is no unfinished Bulk Dislike run to resume."
          : mode === "selected"
            ? "Select at least one unhandled blocked bot first."
            : ((blockedState?.ids || []).length ? "All blocked bot IDs are already handled." : "No blocked bot IDs are available to rate.");
      showSettingsToast(message);
      return;
    }

    startedAt = mode === "resume" && quickDislikeBulkState.startedAt ? quickDislikeBulkState.startedAt : Date.now();
    await persistQuickDislikeBulkState({
      version: 1,
      status: "running",
      pendingIds: candidates,
      failedIds: mode === "failed" ? [] : uniqueClean(quickDislikeBulkState.failedIds || []),
      startedAt,
      currentId: "",
      lastMode: mode,
      runId,
      stopRequested: false
    });

    for (let index = 0; index < candidates.length; index += 1) {
      if (blockedBulkDislikeStopRequested || quickDislikeBulkState?.stopRequested) break;
      const id = candidates[index];
      if (quickDislikeHistoryEntry(id) || !(blockedState?.ids || []).includes(id)) continue;
      processed += 1;
      const meta = blockedState?.meta?.[id] || {};
      const name = String(meta.name || id);
      await persistQuickDislikeBulkState({
        ...quickDislikeBulkState,
        status: "running",
        currentId: id,
        pendingIds: candidates.slice(index),
        runId,
        stopRequested: false
      });
      updateBlockedDislikeStatus(`Processing ${processed}/${candidates.length} · ${name}`);

      const response = await runQuickDislikeWithBackoff({
        type: "DS_QUICK_DISLIKE_BOT",
        botId: id,
        botName: name,
        chatUrl: meta.chatUrl || `https://spicychat.ai/chat/${id}`,
        bulkRunId: runId
      }, name);

      // If connectivity drops, keep the current bot and everything after it
      // pending instead of turning an offline period into a wall of failures.
      if (response?.status === "offline-paused") {
        blockedBulkDislikeStopRequested = true;
        await persistQuickDislikeBulkState({
          ...quickDislikeBulkState,
          status: "paused",
          currentId: "",
          pendingIds: candidates.slice(index),
          runId,
          stopRequested: true
        });
        updateBlockedDislikeStatus("Bulk Dislike paused because the browser is offline. Resume when the connection is back.");
        break;
      }

      // A canceled request means Stop won the race before this item began.
      // Leave it unhandled and resume from this item later.
      if (response?.status === "bulk-canceled") {
        blockedBulkDislikeStopRequested = true;
        await persistQuickDislikeBulkState({
          ...quickDislikeBulkState,
          status: "paused",
          currentId: "",
          pendingIds: candidates.slice(index),
          runId,
          stopRequested: true
        });
        break;
      }

      const remembered = applyQuickDislikeResponseToLocalHistory(id, name, response);
      const status = response?.status === "already-handled" ? response?.rememberedStatus : response?.status;
      if (remembered && status === "disliked") disliked += 1;
      else if (remembered && status === "already-disliked") alreadyDisliked += 1;
      else if (remembered && status === "already-rated-or-unavailable") alreadySet += 1;
      else if (remembered && status === "unavailable-creator-blocked") creatorBlocked += 1;
      else if (remembered && status === "unavailable-private-or-deleted") unavailable += 1;
      else { failed += 1; failedIds.push(id); }

      if (remembered) {
        consecutiveWorkerFailures = 0;
      } else {
        consecutiveWorkerFailures += 1;
        if (consecutiveWorkerFailures >= BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD) {
          autoPausedAfterFailures = true;
          blockedBulkDislikeStopRequested = true;
        }
      }

      await refreshQuickDislikeHistoryState();
      if (quickDislikeBulkState?.stopRequested) blockedBulkDislikeStopRequested = true;
      await persistQuickDislikeBulkState({
        ...quickDislikeBulkState,
        status: blockedBulkDislikeStopRequested ? "paused" : "running",
        currentId: "",
        pendingIds: candidates.slice(index + 1),
        failedIds: uniqueClean([...(quickDislikeBulkState.failedIds || []), ...failedIds]),
        runId,
        stopRequested: blockedBulkDislikeStopRequested
      });

      const counts = blockedQuickDislikeCounts();
      updateBlockedDislikeStatus(`${processed}/${candidates.length} checked · ${disliked} disliked · ${alreadyDisliked} already disliked · ${alreadySet} other rated · ${creatorBlocked} creator blocked · ${unavailable} unavailable · ${failed} failed · ${counts.remaining} remaining`);

      if (blockedBulkDislikeStopRequested) break;
      if (index < candidates.length - 1) {
        const delay = Math.min(10000, Math.max(250, Number(value("blockedBulkDislikeDelayMs", "750")) || 750));
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } finally {
    const stopped = blockedBulkDislikeStopRequested || !!quickDislikeBulkState?.stopRequested;
    blockedBulkDislikeRunning = false;
    blockedBulkDislikeStopRequested = false;
    activeBlockedBulkDislikeRunId = "";

    if (runId) {
      await runtimeMessage({ type: "DS_QUICK_DISLIKE_RELEASE_BULK", bulkRunId: runId }).catch?.(() => null);
    }
    await refreshQuickDislikeHistoryState();
    const unfinished = stopped ? blockedBulkCandidateIds("resume") : [];
    const finalFailed = uniqueClean([...(quickDislikeBulkState.failedIds || []), ...failedIds]).filter(id => !quickDislikeHistoryEntry(id));
    await persistQuickDislikeBulkState({
      ...quickDislikeBulkState,
      status: stopped && unfinished.length ? "paused" : (finalFailed.length ? "completed-with-failures" : "completed"),
      currentId: "",
      pendingIds: stopped ? unfinished : [],
      failedIds: finalFailed,
      startedAt,
      runId: "",
      stopRequested: false
    });
    if (button) button.textContent = "Dislike remaining blocked bots";
    if (clearButton) clearButton.disabled = false;
    renderBotManager("blocked");
    updateBlockedDislikeStatus();

    if (candidates.length) {
      showSettingsToast(autoPausedAfterFailures
        ? `Bulk Dislike paused after ${BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD} helper failures in a row. The remaining bots were kept for Resume.`
        : stopped
          ? `Bulk Dislike stopped. ${disliked} disliked, ${alreadyDisliked} already disliked, ${alreadySet} other rated, ${creatorBlocked} creator blocked, ${unavailable} unavailable, ${failed} failed.`
          : `Bulk Dislike finished. ${disliked} disliked, ${alreadyDisliked} already disliked, ${alreadySet} other rated, ${creatorBlocked} creator blocked, ${unavailable} unavailable, ${failed} failed.`);
    }
  }
}

async function bulkDislikeBlockedBots() {
  return runBlockedBulkDislike("remaining");
}

async function clearBlockedDislikeHistory() {
  if (blockedBulkDislikeRunning) {
    showSettingsToast("Stop Bulk Dislike before clearing its handled history.");
    return;
  }
  await ensureBlockingDataLoaded();
  const counts = blockedQuickDislikeCounts();
  const totalHistory = Object.keys(quickDislikeHistoryState?.bots || {}).length;
  if (!totalHistory) {
    showSettingsToast("There is no handled dislike history to clear.");
    return;
  }
  if (!window.confirm(`Forget Quick/Bulk Dislike history for ${totalHistory} bot${totalHistory === 1 ? "" : "s"}? ${counts.handled} of them are currently blocked. This does not change any SpicyChat rating.`)) return;
  quickDislikeHistoryState = { version: 1, bots: {} };
  quickDislikeBulkState = { version: 1, status: "idle", pendingIds: [], failedIds: [], startedAt: 0, updatedAt: Date.now(), currentId: "", lastMode: "remaining" };
  await storageSet({ [QUICK_DISLIKE_HISTORY_KEY]: quickDislikeHistoryState, [QUICK_DISLIKE_BULK_STATE_KEY]: quickDislikeBulkState });
  renderBotManager("blocked");
  updateBlockedBulkResumeControls();
  updateBlockedDislikeStatus();
  showSettingsToast("Handled dislike history cleared. Those bots can be processed again.");
}

function botManagerCardElement(entry, kind) {
  const card = makeElement("div", {
    className: "bot-manager-card",
    dataset: { kind, type: entry.type, id: entry.id, name: entry.name }
  });

  if (entry.image) {
    card.appendChild(makeElement("img", {
      className: "bot-manager-image",
      attrs: { src: entry.image, alt: "", loading: "lazy", decoding: "async" }
    }));
  } else {
    card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: "?" }));
  }

  const main = makeElement("div", { className: "bot-manager-main" });
  if (["blocked", "favorite", "later"].includes(kind) && entry.id) {
    const selected = botManagerBulkSet(kind);
    const label = makeElement("label", { className: "bot-manager-select" });
    const input = makeElement("input", { attrs: { type: "checkbox", "aria-label": `Select ${entry.name || entry.id}` } });
    input.className = "bot-manager-select-input";
    input.checked = selected.has(entry.id);
    card.classList.toggle("is-bulk-selected", input.checked);
    input.addEventListener("change", () => {
      if (input.checked) selected.add(entry.id);
      else selected.delete(entry.id);
      card.classList.toggle("is-bulk-selected", input.checked);
      updateBotManagerBulkCount(kind);
    });
    label.append(input, document.createTextNode("Select"));
    main.appendChild(label);
  }
  main.appendChild(makeElement("div", {
    className: "bot-manager-title",
    text: displayNormalizedSavedText(entry.name || entry.id || "Unknown bot")
  }));

  if (entry.creator) main.appendChild(makeElement("div", { className: "bot-manager-creator", text: displayNormalizedSavedText(entry.creator) }));
  main.appendChild(makeElement("div", { className: "bot-manager-id", text: entry.id || "name-only block" }));

  if (kind === "blocked" && entry.id) {
    const handled = quickDislikeHistoryEntry(entry.id);
    if (handled) {
      const when = handled.handledAt ? ` · ${new Date(handled.handledAt).toLocaleString()}` : "";
      main.appendChild(makeElement("div", {
        className: "bot-manager-creator",
        text: `Rating handled: ${quickDislikeHistoryLabel(handled)}${when}`
      }));
    }
  }

  if (kind === "favorite") {
    const suffix = entry.savedAt ? ` · ${new Date(entry.savedAt).toLocaleString()}` : "";
    main.appendChild(makeElement("div", { className: "bot-manager-creator", text: `Saved in favorite history${suffix}` }));
  }
  if (entry.description) main.appendChild(makeElement("div", { className: "bot-manager-description", text: displayNormalizedSavedText(entry.description) }));

  if (["favorite", "later"].includes(kind) && entry.id) {
    const organizer = managerOrganizerMeta(entry);
    const chips = [];
    uniqueClean(organizer.collections || []).forEach(folder => chips.push(`Folder: ${folder}`));
    uniqueClean(organizer.tags || []).forEach(tag => chips.push(`#${tag}`));
    if (organizer.status) chips.push(organizer.status.replace(/-/g, " "));
    if (kind === "favorite" && (laterBotState?.ids || []).includes(entry.id)) chips.push("Later");
    if (kind === "later" && (favoriteBotState?.ids || []).includes(entry.id)) chips.push("Favorite history");
    if (managerEntryBlocked(entry)) chips.push("Blocked");
    else if (managerEntryOpened(entry)) chips.push("Opened");
    else chips.push("Unopened");

    if (chips.length) {
      const chipHost = makeElement("div", { className: "bot-manager-meta-chips" });
      chips.slice(0, 12).forEach(text => chipHost.appendChild(makeElement("span", { text })));
      main.appendChild(chipHost);
    }
    if (organizer.note) main.appendChild(makeElement("div", { className: "bot-manager-note", text: organizer.note }));
  }

  const actions = makeElement("div", { className: "bot-manager-actions" });
  if (entry.chatUrl) actions.appendChild(makeElement("a", { text: "Open chat", attrs: { href: entry.chatUrl, target: "_blank", rel: "noopener noreferrer" } }));
  if (entry.profileUrl) actions.appendChild(makeElement("a", { text: "Open profile", attrs: { href: entry.profileUrl, target: "_blank", rel: "noopener noreferrer" } }));
  if (kind === "favorite" && entry.id) {
    const inLater = (laterBotState?.ids || []).includes(entry.id);
    actions.appendChild(makeElement("button", {
      className: "bot-manager-later-toggle",
      text: inLater ? "Remove from Later" : "Add to Later",
      attrs: { type: "button" }
    }));
  }
  actions.appendChild(makeElement("button", { className: "bot-manager-remove", text: "Remove", attrs: { type: "button" } }));
  main.appendChild(actions);
  card.appendChild(main);
  return card;
}

function renderBotManager(kind) {
  refreshBotManagerFolderOptions(kind);
  const isBlocked = kind === "blocked";
  const host = $(managerElementId(kind, "Manager"));
  if (!host) return;

  const allEntries = botEntriesFromStore(storeForManagerKind(kind), isBlocked);
  const entries = getBotManagerEntries(kind, allEntries);
  const ui = botManagerUiState[kind] || { visible: 20, collapsed: true, query: "" };
  const hasSearch = !!getBotManagerSearch(kind);

  let limit = Number(ui.visible || 20);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;

  // Never create thousands of cards in one synchronous DOM operation. Search
  // results are paged too; users can still reveal more in 20-item chunks.
  const shownEntries = entries.slice(0, limit);

  updateBotManagerSummary(kind, allEntries.length, entries.length, shownEntries.length);
  if (kind === "blocked" && !blockedBulkDislikeRunning) {
    updateBlockedDislikeStatus();
    updateBlockedBulkResumeControls();
  }

  const showMore = $(managerElementId(kind, "ShowMore"));
  const showLess = $(managerElementId(kind, "ShowLess"));
  const collapse = $(managerElementId(kind, "Collapse"));

  if (showMore) {
    showMore.style.display = entries.length > shownEntries.length ? "" : "none";
    showMore.textContent = `Show 20 more (${Math.max(0, entries.length - shownEntries.length)} left)`;
  }

  if (showLess) {
    showLess.style.display = shownEntries.length > 20 || !ui.collapsed ? "" : "none";
  }

  if (collapse) {
    collapse.style.display = entries.length > 20 ? "" : "none";
    collapse.textContent = limit <= 20 ? "Show 100" : "Collapse to 20";
  }

  if (!allEntries.length) {
    setEmptyState(host, "Nothing saved here yet.");
    updateBotManagerBulkCount(kind);
    return;
  }

  if (!entries.length) {
    setEmptyState(host, "No matches for that search.");
    updateBotManagerBulkCount(kind);
    return;
  }

  host.replaceChildren(...shownEntries.map(entry => botManagerCardElement(entry, kind)));
  updateBotManagerBulkCount(kind);

  host.querySelectorAll(".bot-manager-later-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const card = button.closest(".bot-manager-card");
      const id = String(card?.dataset.id || "").trim();
      if (!id) return;
      const entry = allEntries.find(item => item.id === id) || {};
      laterBotState = normalizeBotStore(laterBotState);
      const before = cloneJson(laterBotState);
      const inLater = laterBotState.ids.includes(id);

      if (inLater) {
        laterBotState.ids = laterBotState.ids.filter(item => item !== id);
        delete laterBotState.meta[id];
      } else {
        laterBotState.ids.push(id);
        laterBotState.meta[id] = {
          ...(laterBotState.meta[id] || {}),
          id,
          name: entry.name || id,
          image: entry.image || "",
          creator: entry.creator || "",
          description: entry.description || "",
          chatUrl: entry.chatUrl || `https://spicychat.ai/chat/${id}`,
          profileUrl: entry.profileUrl || `https://spicychat.ai/chatbot/${id}`,
          savedAt: Date.now()
        };
      }

      markSavedStoreDirty("later");
      renderBotManager("favorite");
      renderBotManager("later");
      showSettingsToast(inLater ? "Removed from Later." : "Added to Later.", () => {
        laterBotState = normalizeBotStore(before);
        markSavedStoreDirty("later");
        renderBotManager("favorite");
        renderBotManager("later");
      });
    });
  });

  host.querySelectorAll(".bot-manager-remove").forEach(button => {
    button.addEventListener("click", () => {
      const card = button.closest(".bot-manager-card");
      const id = card?.dataset.id || "";
      const name = card?.dataset.name || "";
      const type = card?.dataset.type || "id";
      const before = kind === "opened"
        ? { ids: [...currentOpened], meta: cloneJson(openedChatMetaState) }
        : cloneJson(storeForManagerKind(kind));

      if (kind === "blocked") {
        if (type === "id") {
          blockedState.ids = blockedState.ids.filter(x => x !== id);
          delete blockedState.meta[id];
        } else {
          blockedState.names = blockedState.names.filter(x => x !== name);
          delete blockedState.meta[`name:${name}`];
          delete blockedState.meta[name];
        }
      } else if (kind === "later") {
        laterBotState.ids = laterBotState.ids.filter(x => x !== id);
        delete laterBotState.meta[id];
      } else if (kind === "favorite") {
        favoriteBotState.ids = favoriteBotState.ids.filter(x => x !== id);
        delete favoriteBotState.meta[id];
      } else if (kind === "opened") {
        currentOpened = currentOpened.filter(x => x !== id);
        delete openedChatMetaState[id];
      } else {
        notInterestedState.ids = notInterestedState.ids.filter(x => x !== id);
        delete notInterestedState.meta[id];
      }

      markSavedStoreDirty(kind);
      renderBotManager(kind);
      showSettingsToast(`Removed ${name || id || "saved item"}.`, () => {
        if (kind === "blocked") blockedState = normalizeBotStore(before);
        else if (kind === "later") laterBotState = normalizeBotStore(before);
        else if (kind === "favorite") favoriteBotState = normalizeBotStore(before);
        else if (kind === "opened") {
          currentOpened = uniqueClean(before.ids || []);
          openedChatMetaState = normalizeMetaStore(before.meta);
        } else notInterestedState = normalizeBotStore(before);
        markSavedStoreDirty(kind);
        renderBotManager(kind);
      });
    });
  });
}

async function addManagedBot(kind) {
  await ensureBlockingDataLoaded();
  const isBlocked = kind === "blocked";
  const idInput = $(isBlocked ? "blockedAddId" : "notInterestedAddId");
  const nameInput = $(isBlocked ? "blockedAddName" : "notInterestedAddName");
  const id = String(idInput?.value || "").trim();
  const name = String(nameInput?.value || "").trim();

  if (!id && !name) return;

  const store = isBlocked ? blockedState : notInterestedState;
  store.ids = store.ids || [];
  store.names = store.names || [];
  store.meta = store.meta || {};

  if (id && !store.ids.includes(id)) store.ids.push(id);

  if (isBlocked && name && !store.names.includes(name)) {
    store.names.push(name);
    store.meta[`name:${name}`] = {
      ...(store.meta[`name:${name}`] || {}),
      name,
      savedAt: Date.now()
    };
  }

  if (id) {
    store.meta[id] = {
      ...(store.meta[id] || {}),
      id,
      name: name || store.meta[id]?.name || id,
      chatUrl: `https://spicychat.ai/chat/${id}`,
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      savedAt: Date.now()
    };
  }

  if (isBlocked && savedListsDataLoaded) {
    enforceBlockedPriorityOverOpenedState();
  }

  if (idInput) idInput.value = "";
  if (nameInput) nameInput.value = "";
  markSavedStoreDirty(kind);
  renderBotManager(kind);
}


function previewClamp(number, min, max) {
  return Math.max(min, Math.min(max, Number(number) || 0));
}

function setPreviewShown(id, shown) {
  const el = $(id);
  if (!el) return;
  el.hidden = !shown;
  el.style.display = shown ? "" : "none";
}

function previewComposerTop(preview) {
  const composer = preview?.querySelector(".mini-panel-preview-composer");
  if (!preview || !composer || composer.hidden || getComputedStyle(composer).display === "none") {
    return preview?.clientHeight || 430;
  }

  const previewRect = preview.getBoundingClientRect();
  const composerRect = composer.getBoundingClientRect();
  if (!composerRect.width || !composerRect.height) return preview.clientHeight || 430;
  return composerRect.top - previewRect.top;
}

function previewPanelBounds(preview, panel) {
  const margin = 12;
  const maxX = Math.max(margin, preview.clientWidth - panel.offsetWidth - margin);
  const composerTop = previewComposerTop(preview);
  const maxY = Math.max(
    margin,
    Math.min(
      preview.clientHeight - panel.offsetHeight - margin,
      composerTop - panel.offsetHeight - margin
    )
  );

  return { margin, maxX, maxY };
}

function positionMiniPanelPreview() {
  const preview = $("miniPanelPreview");
  const panel = $("miniPanelPreviewPanel");
  if (!preview || !panel) return;

  const placement = value("quickPanelPlacement", "bottom-right");
  const mode = value("miniPanelPreviewMode", "chat");
  const composer = preview.querySelector(".mini-panel-preview-composer");
  const composerHeight = mode === "chat" ? (composer?.offsetHeight || 42) : 0;
  const margin = 12;

  panel.style.left = "auto";
  panel.style.right = "auto";
  panel.style.top = "auto";
  panel.style.bottom = "auto";

  if (placement === "custom") {
    const { maxX, maxY } = previewPanelBounds(preview, panel);
    const xPercent = previewClamp(value("quickPanelCustomXPercent", "70"), 0, 100);
    const yPercent = previewClamp(value("quickPanelCustomYPercent", "12"), 0, 100);
    panel.style.left = `${(maxX * xPercent) / 100}px`;
    panel.style.top = `${(maxY * yPercent) / 100}px`;
    return;
  }

  if (placement === "sidebar-below-blocked-creators") {
    panel.style.left = `${margin}px`;
    panel.style.top = "64px";
    return;
  }

  if (placement.includes("right")) panel.style.right = `${margin}px`;
  if (placement.includes("left")) panel.style.left = `${margin}px`;
  if (placement.includes("top")) panel.style.top = "58px";
  if (placement.includes("bottom")) panel.style.bottom = `${composerHeight + 26}px`;
}

function renderMiniPanelPreview() {
  const preview = $("miniPanelPreview");
  const panel = $("miniPanelPreviewPanel");
  const body = $("miniPanelPreviewBody");
  if (!preview || !panel || !body) return;

  const mode = value("miniPanelPreviewMode", "chat");
  const width = previewClamp(value("quickPanelWidth", "280"), 200, 440);
  const scale = previewClamp(value("quickPanelUiScale", "100"), 80, 125) / 100;
  const maxHeight = previewClamp(value("quickPanelMaxHeightPercent", "80"), 25, 95);

  const maxVisualHeight = Math.max(150, (preview.clientHeight * maxHeight) / 100);
  panel.style.width = `${Math.min(width, Math.max(200, preview.clientWidth - 24))}px`;
  panel.style.setProperty("--preview-scale", String(scale));
  panel.style.maxHeight = `${maxVisualHeight}px`;
  body.style.maxHeight = `${Math.max(90, maxVisualHeight - 42)}px`;

  setPreviewShown("miniPanelPreviewChatScene", mode === "chat");
  setPreviewShown("miniPanelPreviewChatsScene", mode === "chats");
  setPreviewShown("miniPanelPreviewListingScene", mode === "listing");

  const previewStatus = $("miniPanelPreviewStatus");
  const previewStatusParts = [];

  if (checked("quickPanelStatusShowOpened", true)) {
    previewStatusParts.push("350 opened stored");
  }

  if (checked("quickPanelStatusShowBlocked", true)) {
    previewStatusParts.push("25 blocked");
  }

  if (mode === "chat") previewStatusParts.push("3 personas saved");
  if (mode === "chats") previewStatusParts.push("20 chats visible");
  if (mode === "listing") previewStatusParts.push("50 visible", "12 hidden");

  if (previewStatus) {
    previewStatus.textContent = `${previewStatusParts.join(". ")}.`;
  }

  setPreviewShown("miniPanelPreviewStatus", checked("quickPanelShowStatus", true));
  setPreviewShown("miniPanelPreviewOptions", checked("quickPanelShowOptions", true));
  setPreviewShown("miniPanelPreviewFill", mode === "listing" && checked("quickPanelShowFillNow", true));
  setPreviewShown("miniPanelPreviewSmartFilters", mode === "listing" && checked("quickPanelShowSmartFilterPins"));
  setPreviewShown("miniPanelPreviewSearch", mode === "chats" && checked("quickPanelShowChatSearch", true));
  setPreviewShown("miniPanelPreviewSort", mode === "chats" && checked("quickPanelShowChatSort", true));
  setPreviewShown("miniPanelPreviewScan", mode === "chats" && checked("quickPanelShowScanVisible", true));
  setPreviewShown("miniPanelPreviewLoad", mode === "chats" && checked("quickPanelShowLoadAll", true));
  setPreviewShown(
    "miniPanelPreviewChatButtons",
    mode === "chats" && (checked("quickPanelShowScanVisible", true) || checked("quickPanelShowLoadAll", true))
  );
  setPreviewShown("miniPanelPreviewOoc", mode === "chat" && checked("quickPanelShowOoc", true));
  setPreviewShown("miniPanelPreviewAutoVoice", mode === "chat" && checked("quickPanelShowAutoVoice", true));
  setPreviewShown("miniPanelPreviewAutoAsterisk", mode === "chat" && checked("quickPanelShowAutoAsterisk", true));
  const autoAsteriskPreview = $("miniPanelPreviewAutoAsterisk");
  if (autoAsteriskPreview) autoAsteriskPreview.textContent = checked("autoPairAsterisks") ? "Auto *: On" : "Auto *: Off";
  setPreviewShown("miniPanelPreviewTranslation", mode === "chat" && checked("enableTranslation") && checked("quickPanelShowTranslation"));
  setPreviewShown("miniPanelPreviewPersona", mode === "chat" && checked("quickPanelShowPersona", true));
  setPreviewShown("miniPanelPreviewSoundscapes", checked("enableSoundscapes") && checked("quickPanelShowSoundscapes"));
  setPreviewShown("miniPanelPreviewExport", mode === "chat" && checked("quickPanelShowExport", true));

  if (!panel.dataset.previewManuallyToggled) {
    panel.classList.toggle("closed", checked("quickPanelDefaultClosed"));
  }

  const toggle = $("miniPanelPreviewToggle");
  if (toggle) toggle.textContent = panel.classList.contains("closed") ? "+" : "-";

  requestAnimationFrame(positionMiniPanelPreview);
}

function setupMiniPanelPreview() {
  const preview = $("miniPanelPreview");
  const panel = $("miniPanelPreviewPanel");
  const head = panel?.querySelector(".mini-panel-preview-head");
  const toggle = $("miniPanelPreviewToggle");
  if (!preview || !panel || !head) return;

  const watched = [
    "quickPanelPlacement",
    "quickPanelDefaultClosed",
    "quickPanelWidth",
    "quickPanelUiScale",
    "quickPanelMaxHeightPercent",
    "quickPanelShowStatus",
    "quickPanelStatusShowOpened",
    "quickPanelStatusShowBlocked",
    "quickPanelShowOptions",
    "quickPanelShowFillNow",
    "quickPanelShowSmartFilterPins",
    "quickPanelShowChatSearch",
    "quickPanelShowChatSort",
    "quickPanelShowScanVisible",
    "quickPanelShowLoadAll",
    "quickPanelShowOoc",
    "quickPanelShowAutoVoice",
    "quickPanelShowAutoAsterisk",
    "quickPanelShowTranslation",
    "enableTranslation",
    "autoPairAsterisks",
    "quickPanelShowPersona",
    "quickPanelShowExport",
    "quickPanelShowSoundscapes",
    "enableSoundscapes",
    "miniPanelPreviewMode"
  ];

  watched.forEach(id => {
    $(id)?.addEventListener("input", renderMiniPanelPreview);
    $(id)?.addEventListener("change", renderMiniPanelPreview);
  });

  toggle?.addEventListener("click", event => {
    event.stopPropagation();
    panel.dataset.previewManuallyToggled = "1";
    panel.classList.toggle("closed");
    renderMiniPanelPreview();
  });

  let dragging = null;

  head.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button")) return;

    const panelRect = panel.getBoundingClientRect();
    dragging = {
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top
    };
    head.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  head.addEventListener("pointermove", event => {
    if (!dragging) return;

    const previewRect = preview.getBoundingClientRect();
    const { margin, maxX, maxY } = previewPanelBounds(preview, panel);
    const x = previewClamp(event.clientX - previewRect.left - dragging.offsetX, margin, maxX);
    const y = previewClamp(event.clientY - previewRect.top - dragging.offsetY, margin, maxY);

    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";

    setValue("quickPanelPlacement", "custom");
    setValue("quickPanelCustomXPercent", maxX > 0 ? String((x / maxX) * 100) : "0");
    setValue("quickPanelCustomYPercent", maxY > 0 ? String((y / maxY) * 100) : "0");
    event.preventDefault();
  });

  const stop = event => {
    if (!dragging) return;
    dragging = null;
    try { head.releasePointerCapture?.(event.pointerId); } catch {}
    renderMiniPanelPreview();
  };

  head.addEventListener("pointerup", stop);
  head.addEventListener("pointercancel", stop);
  window.addEventListener("resize", renderMiniPanelPreview);
  renderMiniPanelPreview();
}

async function dismissFirstRunNotice() {
  const version = chrome.runtime.getManifest?.().version || "";
  await storageSet({
    [RELEASE_NOTICE_KEY]: null,
    ...(version ? { [LAST_SEEN_VERSION_KEY]: version } : {})
  });
  const notice = $("firstRunNotice");
  if (notice) notice.hidden = true;
}

function showFirstRunNoticeIfNeeded(releaseNotice) {
  const notice = $("firstRunNotice");
  if (!notice) return;
  notice.hidden = releaseNotice?.reason !== "install";
}


function normalizeChatBackgroundMediaStore(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const cleanItem = item => {
    if (!item || typeof item !== "object") return null;
    const dataUrl = String(item.dataUrl || "");
    if (!dataUrl.startsWith("data:image/")) return null;
    return {
      dataUrl,
      name: String(item.name || "Background image").slice(0, 180),
      updatedAt: Number(item.updatedAt) || Date.now()
    };
  };
  const chats = {};
  for (const [key, item] of Object.entries(input.chats || {})) {
    const clean = cleanItem(item);
    if (clean && key) chats[String(key).slice(0, 260)] = clean;
  }
  return { global: cleanItem(input.global), chats };
}

function chatBackgroundFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function renderChatBackgroundOptions() {
  const status = $("chatBackgroundGlobalStatus");
  const preview = $("chatBackgroundGlobalPreview");
  const globalItem = chatBackgroundMediaState?.global || null;
  const perChatCount = Object.keys(chatBackgroundMediaState?.chats || {}).length;
  if (status) {
    status.textContent = globalItem
      ? `Global image: ${globalItem.name || "local image"} · ${perChatCount} chat override${perChatCount === 1 ? "" : "s"} saved.`
      : `No global image saved · ${perChatCount} chat override${perChatCount === 1 ? "" : "s"} saved.`;
  }
  if (preview) {
    preview.hidden = !globalItem;
    preview.style.backgroundImage = globalItem ? `url("${String(globalItem.dataUrl).replace(/"/g, "%22")}")` : "";
    const fit = value("chatBackgroundFit", "cover");
    const position = value("chatBackgroundPosition", "center");
    preview.style.backgroundSize = fit === "tile" ? "auto" : fit;
    preview.style.backgroundRepeat = fit === "tile" ? "repeat" : "no-repeat";
    preview.style.backgroundPosition = position;
  }
  const clear = $("clearGlobalChatBackground");
  if (clear) clear.disabled = !globalItem;
  const clearChats = $("clearPerChatBackgrounds");
  if (clearChats) clearChats.disabled = perChatCount === 0;
}

async function saveChatBackgroundMediaStore(next) {
  const normalized = normalizeChatBackgroundMediaStore(next);
  const ok = await storageSet({ [CHAT_BACKGROUNDS_KEY]: normalized });
  if (!ok) throw new Error("Browser storage rejected the background image");
  chatBackgroundMediaState = normalized;
  renderChatBackgroundOptions();
}

async function importGlobalChatBackground(files) {
  const file = files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    showSettingsToast("Use a chat background image under 8 MB.");
    return;
  }
  const dataUrl = await chatBackgroundFileToDataUrl(file);
  if (!dataUrl.startsWith("data:image/")) {
    showSettingsToast("That file could not be read as an image.");
    return;
  }
  try {
    await saveChatBackgroundMediaStore({
      ...chatBackgroundMediaState,
      global: { dataUrl, name: file.name || "Global background", updatedAt: Date.now() }
    });
    showSettingsToast("Global chat background saved locally.");
  } catch {
    showSettingsToast("Could not save that background image. Try a smaller file.");
  }
}

async function clearGlobalChatBackground() {
  if (!chatBackgroundMediaState?.global) return;
  if (!window.confirm("Clear the global chat background? Per-chat overrides will be kept.")) return;
  await saveChatBackgroundMediaStore({ ...chatBackgroundMediaState, global: null });
}

async function clearPerChatBackgrounds() {
  const count = Object.keys(chatBackgroundMediaState?.chats || {}).length;
  if (!count) return;
  if (!window.confirm(`Clear ${count} saved per-chat background override${count === 1 ? "" : "s"}? The global background will be kept.`)) return;
  await saveChatBackgroundMediaStore({ ...chatBackgroundMediaState, chats: {} });
}

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
    showSettingsToast("The saved setting is still disabled. Press Save settings, then check again.");
    return;
  }
  showSettingsToast(`Creator check complete: ${Number(summary.checked || 0)} checked, ${Number(summary.newBots || 0)} new, ${Number(summary.failures || 0)} failed.`);
}

function normalizePendingOptionsNavigation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const age = Date.now() - Number(value.at || 0);
  if (!Number.isFinite(age) || age < -60_000 || age > 5 * 60_000) return null;
  const target = String(value.target || "general").replace(/[^a-z0-9_-]/gi, "") || "general";
  return {
    target,
    search: String(value.search || "").slice(0, 300),
    backup: String(value.backup || "").slice(0, 160),
    lorebookBackup: String(value.lorebookBackup || "").slice(0, 160)
  };
}

async function applyPendingOptionsNavigation(value) {
  const pending = normalizePendingOptionsNavigation(value);
  if (!pending) {
    if (value != null) storageSet({ [PENDING_OPTIONS_NAV_KEY]: null }).catch?.(() => {});
    return false;
  }

  // Clear first so a reload/back-navigation cannot replay an old deep link.
  await storageSet({ [PENDING_OPTIONS_NAV_KEY]: null });

  const validTabs = new Set([...document.querySelectorAll(".tab-button")].map(button => button.dataset.tab));
  const target = validTabs.has(pending.target) ? pending.target : "general";
  if (pending.backup) creatorBackupPendingFocus = { kind: "bot", id: pending.backup };
  else if (pending.lorebookBackup) creatorBackupPendingFocus = { kind: "lorebook", id: pending.lorebookBackup };

  setActiveTab(target);

  if (pending.search) {
    const input = $("settingsSearch");
    if (input) {
      setSettingsSearchExpanded(true);
      input.value = pending.search;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      window.setTimeout(() => input.focus(), 80);
    }
  }

  if (target === "bot-tools" && creatorBackupPendingFocus) {
    creatorBackupManagerLoaded = false;
    loadCreatorBackupManager({ force: true }).catch(() => {});
  }
  return true;
}

async function load() {
  const loadStarted = typeof performance !== "undefined" ? performance.now() : 0;
  setVersionText();
  renderedHeavyTabs.clear();
  heavyRenderToken++;
  invalidateDuplicateCache();
  resetHeavySavedDataState();

  const result = await storageGet([
    "settings",
    PERSONAS_KEY,
    LEGACY_PERSONAS_KEY,
    PERSONA_ORG_KEY,
    OOC_TEMPLATES_KEY,
    CHARACTER_QOL_PROFILES_KEY,
    SAVED_TEXT_SNIPPETS_KEY,
    CONTEXT_KEEPER_DATA_KEY,
    STORY_DAY_TRACKER_KEY,
    CHAT_NUDGE_STORE_KEY,
    GENERATION_PROFILES_KEY,
    AUTO_AFK_STATUS_KEY,
    DUPLICATE_TAB_STATUS_KEY,
    SAI_TOOLKIT_PRESENCE_KEY,
    SPICYCHAT_BETA_CAPABILITIES_KEY,
    LAST_SEEN_VERSION_KEY,
    RELEASE_NOTICE_KEY,
    PENDING_OPTIONS_NAV_KEY,
    DEEPL_API_KEY,
    CHAT_BACKGROUNDS_KEY,
    CREATOR_BOT_WEBHOOK_KEY,
    "generationMetadataDefaultsMigrationV01841",
    "backupOptInMigrationV01990",
    "quickDislikeOptInMigrationV019119",
    "oocHardPresetMigrationV022"
  ]);

  const rawSettings = result.settings || {};
  const settings = { ...DEFAULT_SETTINGS, ...rawSettings };
  loadedSettingsSnapshot = { ...settings };
  creatorBotWebhookState = normalizeCreatorBotWebhookConfig(result[CREATOR_BOT_WEBHOOK_KEY]);
  applyOptionsPerformancePreferences(settings);
  applyOptionsAccessibilityPreview(settings);
  if (!("chatBubbleAiActionMode" in rawSettings)) settings.chatBubbleAiActionMode = rawSettings.chatBubblePreserveActionColors === false ? "base" : "native";
  if (!("chatBubbleUserActionMode" in rawSettings)) settings.chatBubbleUserActionMode = rawSettings.chatBubblePreserveActionColors === false ? "base" : "native";
  showFirstRunNoticeIfNeeded(result[RELEASE_NOTICE_KEY]);
  const migrationPayload = {};
  let shouldSaveMigratedSettings = false;

  // v0.1.9.119: dislike-after-blocking must be deliberately enabled.
  // Reset any older persisted automatic state once even if Settings is opened
  // before a SpicyChat content tab has had a chance to run its migration.
  if (result.quickDislikeOptInMigrationV019119 !== true) {
    settings.quickDislikeIdleEnabled = false;
    settings.quickDislikeOnBlock = false;
    shouldSaveMigratedSettings = true;
    migrationPayload.quickDislikeOptInMigrationV019119 = true;
  }

  if (result.generationMetadataDefaultsMigrationV01841 !== true) {
    const hasIndividualMetadataChoice = !!(
      settings.showMessageTimestamps ||
      settings.showGenerationModel ||
      settings.showGenerationElapsed ||
      settings.showGenerationSettings
    );
    if (!settings.showGenerationMetadata && !hasIndividualMetadataChoice) {
      settings.showMessageTimestamps = false;
      settings.messageTimestamp24Hour = false;
      settings.messageTimestampDateFirst = false;
      settings.messageTimestampShowSeconds = false;
      settings.showGenerationModel = false;
      settings.showGenerationElapsed = false;
      settings.showGenerationSettings = false;
      settings.compactGenerationMetadata = false;
      shouldSaveMigratedSettings = true;
    }
    migrationPayload.generationMetadataDefaultsMigrationV01841 = true;
  }

  if (result.backupOptInMigrationV01990 !== true) {
    settings.botArchiveRememberSeenPublic = false;
    settings.botBackupToolsEnabled = false;
    settings.botArchiveOwnEditorBackups = false;
    settings.botArchiveOnProfileVisit = false;
    settings.botArchiveOnChatOpen = false;
    settings.lorebookBackupToolsEnabled = false;
    settings.lorebookBackupsEnabled = false;
    shouldSaveMigratedSettings = true;
    migrationPayload.backupOptInMigrationV01990 = true;
  }

  const rawStoredSettings = result.settings || {};
  if (!("botBackupToolsEnabled" in rawStoredSettings) && rawStoredSettings.botArchiveOwnEditorBackups === true) {
    settings.botBackupToolsEnabled = true;
    shouldSaveMigratedSettings = true;
  }
  if (!("lorebookBackupToolsEnabled" in rawStoredSettings) && rawStoredSettings.lorebookBackupsEnabled === true) {
    settings.lorebookBackupToolsEnabled = true;
    shouldSaveMigratedSettings = true;
  }

  if (shouldSaveMigratedSettings || Object.keys(migrationPayload).length) {
    await storageSet({
      ...(shouldSaveMigratedSettings ? { settings } : {}),
      ...migrationPayload
    });
  }
  loadedSettingsSnapshot = { ...settings };
  settings.oocTemplates = normalizeOocTemplates(
    Array.isArray(result[OOC_TEMPLATES_KEY]) ? result[OOC_TEMPLATES_KEY] : settings.oocTemplates
  );

  if (result.oocHardPresetMigrationV022 !== true) {
    const templates = normalizeOocTemplates(settings.oocTemplates);
    const hasHard = templates.some(item =>
      String(item?.id || "") === HARD_OOC_TEMPLATE_ID ||
      String(item?.text || "").trim() === HARD_OOC_TEMPLATE
    );
    if (!hasHard) {
      templates.push({
        id: HARD_OOC_TEMPLATE_ID,
        name: "Hard no-control + formatting",
        text: HARD_OOC_TEMPLATE,
        builtIn: true
      });
    }
    settings.oocTemplates = templates;
    await storageSet({ [OOC_TEMPLATES_KEY]: templates, oocHardPresetMigrationV022: true });
  }

  currentPersonas = uniqueClean([
    ...(Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY].map(p => p?.name || p?.id || "") : []),
    ...(Array.isArray(result[LEGACY_PERSONAS_KEY]) ? result[LEGACY_PERSONAS_KEY].map(p => p?.name || p?.id || "") : [])
  ]);

  chatBackgroundMediaState = normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]);
  renderChatBackgroundOptions();

  setChecked("enabled", settings.enabled);
  const betaStatus = $("spicyChatBetaStatus");
  const betaDetails = $("spicyChatBetaCapabilities");
  if (betaStatus || betaDetails) {
    const beta = result[SPICYCHAT_BETA_CAPABILITIES_KEY] || {};
    const caps = beta.capabilities || {};
    const pub = caps.publicLorebooks || "unknown";
    const story = caps.storyMode || "unknown";
    const statusText = beta.detected ? "Detected on this browser profile" : (pub === "unavailable" ? "Not detected on this browser profile" : "Not detected yet");
    if (betaStatus) {
      const label = document.createElement("strong");
      label.textContent = "Status:";
      const checkedText = beta.lastCheckedAt
        ? ` · checked ${new Date(Number(beta.lastCheckedAt)).toLocaleString()}`
        : "";
      betaStatus.replaceChildren(label, document.createTextNode(` ${statusText}${checkedText}`));
    }
    if (betaDetails) betaDetails.textContent = `Public Lorebooks: ${pub} · Story Mode: ${story}`;
  }
  setChecked("saiToolkitCompatibility", !!settings.saiToolkitCompatibility);
  setValue("globalNsfwMode", settings.globalNsfwMode || "ignore");

  const saiStatus = $("saiToolkitStatus");
  if (saiStatus) {
    const presence = result[SAI_TOOLKIT_PRESENCE_KEY];
    if (presence?.detected && presence.detectedAt) {
      const when = new Date(Number(presence.detectedAt));
      saiStatus.textContent = `S.AI Toolkit detected on SpicyChat (${when.toLocaleString()}).`;
    } else {
      saiStatus.textContent = "S.AI Toolkit has not been detected on a SpicyChat page yet.";
    }
  }

  setChecked("autoTags", settings.autoTags);
  setChecked("enableTagAliases", !!settings.enableTagAliases);
  setValue("tagAliasRules", settings.tagAliasRules || "");
  setChecked("tagAliasShowDisplay", settings.tagAliasShowDisplay !== false);
  setChecked("showTagTemplateButton", !!settings.showTagTemplateButton);
  setChecked("showChatTagLinks", !!settings.showChatTagLinks);
  setChecked("showChatTagAddButtons", !!settings.showChatTagAddButtons);
  setChecked("botEditorShowCharButton", !!settings.botEditorShowCharButton);
  setChecked("botEditorShowUserButton", !!settings.botEditorShowUserButton);
  setChecked("botEditorShowContinueButton", !!settings.botEditorShowContinueButton);
  setChecked("botEditorShowNoControlButton", !!settings.botEditorShowNoControlButton);
  setChecked("botEditorShowCustomSnippets", !!settings.botEditorShowCustomSnippets);
  setChecked("botEditorAutoOpenAdvanced", !!settings.botEditorAutoOpenAdvanced);
  setChecked("rememberBotImagePrompt", !!settings.rememberBotImagePrompt);
  setChecked("botEditorSaveActions", !!settings.botEditorSaveActions);
  setChecked("botEditorSaveChatNewTab", !!settings.botEditorSaveChatNewTab);
  setChecked("enableBotEditorDraftHistory", !!settings.enableBotEditorDraftHistory);
  setValue("botEditorDraftHistoryLimit", Math.max(3, Math.min(20, Number(settings.botEditorDraftHistoryLimit) || 8)));
  setChecked("enableWikiLorebookImporter", !!settings.enableWikiLorebookImporter);
  setChecked("enableLorebookConsistency", !!settings.enableLorebookConsistency);
  setChecked("lorebookConsistencyShowMatches", settings.lorebookConsistencyShowMatches !== false);
  setChecked("lorebookConsistencyAutoQueue", settings.lorebookConsistencyAutoQueue !== false);
  setValue("lorebookConsistencyMaxEntries", String(Math.max(1, Math.min(5, Number(settings.lorebookConsistencyMaxEntries || 3)))));
  setChecked("lorebookDefaultEntriesTab", !!settings.lorebookDefaultEntriesTab);
  setChecked("lorebookRememberEntrySort", !!settings.lorebookRememberEntrySort);
  setChecked("lorebookProtectEntryDrafts", !!settings.lorebookProtectEntryDrafts);
  setChecked("lorebookEditShortcuts", !!settings.lorebookEditShortcuts);
  setChecked("lorebookEntryManager", !!settings.lorebookEntryManager);
  setChecked("lorebookMultiEntryWorkspace", !!settings.lorebookMultiEntryWorkspace);
  setChecked("lorebookEntrySelectionCheckbox", settings.lorebookEntrySelectionCheckbox !== false);
  setChecked("lorebookEntryShowTokenCount", settings.lorebookEntryShowTokenCount !== false);
  setChecked("lorebookEntryShowHiddenKeywordCount", settings.lorebookEntryShowHiddenKeywordCount !== false);
  setChecked("lorebookEntryShowNoKeywordsWarning", settings.lorebookEntryShowNoKeywordsWarning !== false);
  setChecked("lorebookEntryShowCharacterCount", settings.lorebookEntryShowCharacterCount !== false);
  setChecked("lorebookEntryRenameButton", settings.lorebookEntryRenameButton !== false);
  setChecked("lorebookEntryCopyButton", settings.lorebookEntryCopyButton !== false);
  setChecked("lorebookEntryDuplicateButton", settings.lorebookEntryDuplicateButton !== false);
  setChecked("lorebookBulkSelectAll", settings.lorebookBulkSelectAll !== false);
  setChecked("lorebookBulkClear", settings.lorebookBulkClear !== false);
  setChecked("lorebookBulkAnalyze", settings.lorebookBulkAnalyze !== false);
  setChecked("lorebookBulkExportSelected", settings.lorebookBulkExportSelected !== false);
  setChecked("lorebookBulkCopySelected", settings.lorebookBulkCopySelected !== false);
  setChecked("lorebookBulkDuplicateSelected", settings.lorebookBulkDuplicateSelected !== false);
  setChecked("lorebookBulkAddKeyword", settings.lorebookBulkAddKeyword !== false);
  setChecked("lorebookBulkRemoveKeyword", settings.lorebookBulkRemoveKeyword !== false);
  setChecked("lorebookBulkToggleEnabled", settings.lorebookBulkToggleEnabled !== false);
  setChecked("lorebookBulkDeleteSelected", settings.lorebookBulkDeleteSelected !== false);
  setChecked("lorebookBulkFindKeyword", settings.lorebookBulkFindKeyword !== false);
  setChecked("lorebookAutoStartNew", !!settings.lorebookAutoStartNew);
  setChecked("lorebookBulkKeywordPaste", !!settings.lorebookBulkKeywordPaste);
  setChecked("lorebookExpandEntryEditor", !!settings.lorebookExpandEntryEditor);
  settings.lorebookExpandTags = false;
  setChecked("lorebookExpandTags", false);
  setChecked("botTagBulkPaste", !!settings.botTagBulkPaste);
  setChecked("showLorebookEntryExpandButtons", !!settings.showLorebookEntryExpandButtons);
  setChecked("creatorModerationWarnings", !!settings.creatorModerationWarnings);
  setChecked("creatorModerationWarningsChatbots", !!settings.creatorModerationWarningsChatbots);
  setValue("creatorModerationWarningMode", settings.creatorModerationWarningMode === "all" ? "all" : "balanced");
  setValue("creatorModerationWarningIgnoredTerms", String(settings.creatorModerationWarningIgnoredTerms || ""));
  setValue("creatorModerationWarningCustomTerms", String(settings.creatorModerationWarningCustomTerms || ""));
  renderModerationTermManager();
  setValue("botEditorDefaultVisibility", ["public", "unlisted"].includes(settings.botEditorDefaultVisibility) ? settings.botEditorDefaultVisibility : "ignore");
  setChecked("autoAgreeCreationGuidelines", !!settings.autoAgreeCreationGuidelines);
  renderBotEditorSnippets(settings.botEditorSnippets);
  setChecked("enableGenerationProfiles", !!settings.enableGenerationProfiles);
  setChecked("showGenerationMetadata", !!settings.showGenerationMetadata);
  setChecked("showMessageTimestamps", !!settings.showMessageTimestamps);
  setChecked("messageTimestamp24Hour", !!settings.messageTimestamp24Hour);
  setChecked("messageTimestampDateFirst", !!settings.messageTimestampDateFirst);
  setChecked("messageTimestampShowSeconds", !!settings.messageTimestampShowSeconds);
  setChecked("showGenerationModel", !!settings.showGenerationModel);
  setChecked("showGenerationElapsed", !!settings.showGenerationElapsed);
  setChecked("showGenerationSettings", !!settings.showGenerationSettings);
  setChecked("compactGenerationMetadata", !!settings.compactGenerationMetadata);
  setChecked("enableContextWindowWarning", !!settings.enableContextWindowWarning);
  setValue("contextWarningThreshold", Math.min(99, Math.max(50, Number(settings.contextWarningThreshold) || 85)));
  setValue("contextWarningManualLimit", Math.max(0, Number(settings.contextWarningManualLimit) || 0));
  setChecked("contextWarningBrowserNotifications", !!settings.contextWarningBrowserNotifications);
  refreshContextWarningNotificationPermissionStatus();
  if ($("generationProfileCount")) {
    const profileCount = result[GENERATION_PROFILES_KEY] && typeof result[GENERATION_PROFILES_KEY] === "object"
      ? Object.keys(result[GENERATION_PROFILES_KEY]).length
      : 0;
    $("generationProfileCount").textContent = `${profileCount} saved`;
  }
  setValue("includeTags", arrayToLines(settings.includeTags));
  setValue("excludeTags", arrayToLines(settings.excludeTags));

  setChecked("autoAfkEnabled", !!settings.autoAfkEnabled);
  setValue("autoAfkHours", Math.min(720, Math.max(1, Number(settings.autoAfkHours) || 12)));
  setChecked("autoAfkChats", settings.autoAfkChats !== false);
  setChecked("autoAfkHome", !!settings.autoAfkHome);
  setChecked("autoAfkProfiles", !!settings.autoAfkProfiles);
  setChecked("autoAfkActionDiscard", (settings.autoAfkAction || "discard") !== "close");
  setChecked("autoAfkActionClose", (settings.autoAfkAction || "discard") === "close");
  setChecked("autoAfkProtectActive", settings.autoAfkProtectActive !== false);
  setChecked("autoAfkResetOnActivate", settings.autoAfkResetOnActivate !== false);
  renderAutoAfkStatus(result[AUTO_AFK_STATUS_KEY]);
  setChecked("duplicateTabGuardEnabled", !!settings.duplicateTabGuardEnabled);
  setChecked("duplicateTabChats", settings.duplicateTabChats !== false);
  setChecked("duplicateTabHome", !!settings.duplicateTabHome);
  setChecked("duplicateTabProfiles", !!settings.duplicateTabProfiles);
  setValue("duplicateTabKeepMode", settings.duplicateTabKeepMode === "existing" ? "existing" : "new");
  setChecked("duplicateTabFocusExisting", settings.duplicateTabFocusExisting !== false);
  setValue("tabCleanupRecentHours", Math.min(72, Math.max(1, Number(settings.tabCleanupRecentHours) || 24)));
  setValue("tabCleanupRecentDays", Math.min(30, Math.max(1, Number(settings.tabCleanupRecentDays) || 3)));
  setValue("tabCleanupMediumDays", Math.min(90, Math.max(2, Number(settings.tabCleanupMediumDays) || 7)));
  setValue("tabCleanupOldDays", Math.min(365, Math.max(3, Number(settings.tabCleanupOldDays) || 14)));
  setChecked("tabCleanupProtectPinnedOnClose", settings.tabCleanupProtectPinnedOnClose !== false);
  renderDuplicateTabStatus(result[DUPLICATE_TAB_STATUS_KEY]);

  setChecked("hidePremium", settings.hidePremium);
  setChecked("hideFloatingPremiumPopups", settings.hideFloatingPremiumPopups);
  setChecked("hideAdvertBanners", !!settings.hideAdvertBanners);
  setChecked("expandModelSelectorDescriptions", !!settings.expandModelSelectorDescriptions);
  setChecked("hideModelUpgradeButtons", !!settings.hideModelUpgradeButtons);
  setChecked("customizeModelQuickMenu", !!settings.customizeModelQuickMenu);
  setChecked("modelQuickFavoritesOnly", !!settings.modelQuickFavoritesOnly);
  setValue("modelFavoriteNames", settings.modelFavoriteNames || "");
  setValue("modelHiddenNames", settings.modelHiddenNames || "");
  setChecked("hideNotifications", settings.hideNotifications);
  setChecked("hideTabNotificationBadge", !!settings.hideTabNotificationBadge);
  setChecked("autoReadNotifications", settings.autoReadNotifications);

  setChecked("hideTopBarLanguage", settings.hideTopBarLanguage);
  setChecked("hideTopBarNotifications", settings.hideTopBarNotifications);
  setChecked("hideTopBarTheme", settings.hideTopBarTheme);
  setValue("topBarProfilePillMode", settings.topBarProfilePillMode || "normal");
  setValue("topBarProfilePillCustomText", settings.topBarProfilePillCustomText || "");
  setChecked("topBarProfilePillPersonaPrefix", !!settings.topBarProfilePillPersonaPrefix);

  setChecked("showChatTopBarTools", !!settings.showChatTopBarTools);
  setChecked("chatTopBarInlineCreator", !!settings.chatTopBarInlineCreator);
  setChecked("chatTopBarAddLaterButton", !!settings.chatTopBarAddLaterButton);
  setChecked("closeChatTabAfterSavingLater", !!settings.closeChatTabAfterSavingLater);
  setChecked("showPerCharacterChatHistory", !!settings.showPerCharacterChatHistory);
  setChecked("showQuickNewChatButton", !!settings.showQuickNewChatButton);
  setChecked("hideChatTopBarRatingButton", !!settings.hideChatTopBarRatingButton);
  setChecked("enableNativeRatingHelpers", !!settings.enableNativeRatingHelpers);
  setChecked("hideChatTopBarModelButton", !!settings.hideChatTopBarModelButton);
  setChecked("hideChatTopBarContextDot", !!settings.hideChatTopBarContextDot);
  setChecked("hideChatDropdownVoiceUpsell", !!settings.hideChatDropdownVoiceUpsell);
  setChecked("hideChatDropdownMemoryItem", !!settings.hideChatDropdownMemoryItem);
  setChecked("enableBulkMemoryManager", !!settings.enableBulkMemoryManager);
  setChecked("showCopyMemoryAction", !!settings.showCopyMemoryAction);
  setChecked("memoryAutoLoadAll", !!settings.memoryAutoLoadAll);
  setChecked("enableChatTextReplacements", !!settings.enableChatTextReplacements);
  setValue("chatTextReplacementRules", settings.chatTextReplacementRules || "");
  setValue("chatTextReplacementScope", ["ai", "user", "both"].includes(settings.chatTextReplacementScope) ? settings.chatTextReplacementScope : "ai");
  setValue("chatTextReplacementMode", settings.chatTextReplacementMode === "save" ? "save" : "display");
  setChecked("chatTextReplacementPreview", !!settings.chatTextReplacementPreview);
  setChecked("enableTranslation", !!settings.enableTranslation);
  setChecked("translationShowMessageButtons", !!settings.translationShowMessageButtons);
  setChecked("translationAutoAi", !!settings.translationAutoAi);
  setChecked("translationAutoUser", !!settings.translationAutoUser);
  setValue("translationTargetLanguage", settings.translationTargetLanguage || "EN-US");
  setValue("translationUnderstoodLanguages", settings.translationUnderstoodLanguages || "EN");
  setValue("translationProtectedTerms", settings.translationProtectedTerms || "");
  setValue("deeplApiKey", String(result[DEEPL_API_KEY] || ""));
  const deeplStatus = $("deeplStatus");
  if (deeplStatus) deeplStatus.textContent = result[DEEPL_API_KEY] ? "DeepL API key saved. Test it before relying on auto translate." : "DeepL is not configured yet.";

  setChecked("showChatListTools", settings.showChatListTools);
  setChecked("enableChatOrganizer", !!settings.enableChatOrganizer);
  setValue("chatCollections", settings.chatCollections || "");
  setChecked("showSavedChatQuickActions", !!settings.showSavedChatQuickActions);
  setChecked("showRandomChatButton", !!settings.showRandomChatButton);
  setChecked("randomChatUseLastHomeFilters", settings.randomChatUseLastHomeFilters !== false);
  setChecked("randomChatIncludeOpened", settings.randomChatIncludeOpened !== false);
  setChecked("randomChatIncludeLater", settings.randomChatIncludeLater !== false);
  setChecked("randomChatIncludeFavorites", settings.randomChatIncludeFavorites !== false);
  setValue("chatListSortMode", settings.chatListSortMode || "default");
  setValue("chatListOpenedFilter", ["all", "opened", "unopened"].includes(settings.chatListOpenedFilter) ? settings.chatListOpenedFilter : "all");
  setValue("chatListMessageFilter", ["all", "0", "1-9", "10-49", "50-99", "100-499", "500+", "unknown"].includes(settings.chatListMessageFilter) ? settings.chatListMessageFilter : "all");
  setValue("chatListSavedFilter", ["all", "favorite", "later", "both", "saved", "neither"].includes(settings.chatListSavedFilter) ? settings.chatListSavedFilter : "all");
  setValue("chatListBlockedFilter", ["all", "blocked", "unblocked"].includes(settings.chatListBlockedFilter) ? settings.chatListBlockedFilter : "all");

  setChecked("trackOpenedChats", settings.trackOpenedChats);
  setChecked("importOpenedFromChatsPage", settings.importOpenedFromChatsPage);
  setChecked("hideOpenedChats", settings.hideOpenedChats);
  setValue("openedBotSortMode", settings.openedBotSortMode || "newest");
  setValue("qolInterfaceScale", [100, 110, 125, 150].includes(Number(settings.qolInterfaceScale)) ? Number(settings.qolInterfaceScale) : 100);
  setValue("chatTextScale", [100, 110, 125, 150].includes(Number(settings.chatTextScale)) ? Number(settings.chatTextScale) : 100);
  setValue("chatLineSpacing", ["native", "comfortable", "spacious"].includes(settings.chatLineSpacing) ? settings.chatLineSpacing : "native");
  setChecked("showQuickPanel", settings.showQuickPanel);
  setValue("quickPanelPlacement", settings.quickPanelPlacement === "chat-header" ? "bottom-right" : (settings.quickPanelPlacement || "bottom-right"));
  setChecked("quickPanelDraggable", !!settings.quickPanelDraggable);
  setChecked("quickPanelDefaultClosed", !!settings.quickPanelDefaultClosed);
  setChecked("quickPanelEnabledByDefaultInTab", settings.quickPanelEnabledByDefaultInTab !== false);
  setValue("quickPanelWidth", Math.min(440, Math.max(200, Number(settings.quickPanelWidth) || 280)));
  setValue("quickPanelUiScale", Math.min(125, Math.max(80, Number(settings.quickPanelUiScale) || 100)));
  setValue("quickPanelMaxHeightPercent", Math.min(95, Math.max(25, Number(settings.quickPanelMaxHeightPercent) || 80)));
  setValue("quickPanelCustomXPercent", Math.min(100, Math.max(0, Number.isFinite(Number(settings.quickPanelCustomXPercent)) ? Number(settings.quickPanelCustomXPercent) : 70)));
  setValue("quickPanelCustomYPercent", Math.min(100, Math.max(0, Number.isFinite(Number(settings.quickPanelCustomYPercent)) ? Number(settings.quickPanelCustomYPercent) : 12)));
  setChecked("quickPanelAutoCollapseOverlap", settings.quickPanelAutoCollapseOverlap !== false);
  setChecked("quickPanelShowStatus", settings.quickPanelShowStatus !== false);
  setChecked("quickPanelStatusShowOpened", settings.quickPanelStatusShowOpened !== false);
  setChecked("quickPanelStatusShowBlocked", settings.quickPanelStatusShowBlocked !== false);
  setChecked("popupShowOpenedCount", !!settings.popupShowOpenedCount);
  setChecked("popupShowBlockedCount", !!settings.popupShowBlockedCount);
  setChecked("popupShowStorageDetails", !!settings.popupShowStorageDetails);
  setChecked("quickPanelShowFeatureSummary", !!settings.quickPanelShowFeatureSummary);
  setChecked("quickPanelShowOptions", settings.quickPanelShowOptions !== false);
  setChecked("quickPanelShowFillNow", settings.quickPanelShowFillNow !== false);
  setChecked("quickPanelShowSmartFilterPins", !!settings.quickPanelShowSmartFilterPins);
  setChecked("quickPanelShowChatSearch", settings.quickPanelShowChatSearch !== false);
  setChecked("quickPanelShowChatSort", settings.quickPanelShowChatSort !== false);
  setChecked("quickPanelShowScanVisible", settings.quickPanelShowScanVisible !== false);
  setChecked("quickPanelShowLoadAll", settings.quickPanelShowLoadAll !== false);
  setChecked("quickPanelShowOoc", settings.quickPanelShowOoc !== false);
  setChecked("quickPanelShowAutoVoice", settings.quickPanelShowAutoVoice !== false);
  setChecked("quickPanelShowAutoAsterisk", settings.quickPanelShowAutoAsterisk !== false);
  setChecked("quickPanelShowTranslation", !!settings.quickPanelShowTranslation);
  setChecked("quickPanelShowPersona", settings.quickPanelShowPersona !== false);
  setChecked("quickPanelShowExport", settings.quickPanelShowExport !== false);
  setChecked("quickPanelShowSoundscapes", !!settings.quickPanelShowSoundscapes);
  setChecked("compactAfterHiding", settings.compactAfterHiding);
  setChecked("neverHideFavorites", !!settings.neverHideFavorites);
  setChecked("protectFavoritesFromBlocking", !!settings.protectFavoritesFromBlocking);
  setChecked("showCreatorFavoriteButtons", !!settings.showCreatorFavoriteButtons);
  setChecked("protectFavoriteCreatorsFromFiltering", !!settings.protectFavoriteCreatorsFromFiltering);
  setChecked("showFollowCreatorButtons", !!settings.showFollowCreatorButtons);
  setChecked("enableCreatorBotNotifications", !!settings.enableCreatorBotNotifications);
  setValue("creatorBotCheckMinutes", String(CREATOR_BOT_WATCH_INTERVALS.includes(Number(settings.creatorBotCheckMinutes)) ? Number(settings.creatorBotCheckMinutes) : 60));
  setChecked("creatorBotBrowserNotifications", !!settings.creatorBotBrowserNotifications);
  setChecked("creatorBotDiscordWebhookEnabled", !!creatorBotWebhookState.enabled);
  setValue("creatorBotDiscordWebhookUrl", creatorBotWebhookState.url || "");
  setChecked("trackFavoriteBots", !!settings.trackFavoriteBots);
  setChecked("showFavoriteHistoryButton", !!settings.showFavoriteHistoryButton);
  setValue("favoriteBotSortMode", settings.favoriteBotSortMode || "newest");
  setValue("favoriteBotRelationFilter", settings.favoriteBotRelationFilter || "all");
  setValue("favoriteBotFolderFilter", settings.favoriteBotFolderFilter || "all");
  setValue("favoriteBotCreatorFilter", settings.favoriteBotCreatorFilter || "");
  setValue("favoriteBotStateFilter", settings.favoriteBotStateFilter || "all");
  setChecked("showLaterBotButtons", !!settings.showLaterBotButtons);
  setChecked("enableSavedListsOverlay", !!settings.enableSavedListsOverlay);
  setChecked("protectLaterBotsFromFiltering", !!settings.protectLaterBotsFromFiltering);
  setChecked("hideLaterBotsFromListings", !!settings.hideLaterBotsFromListings);
  setValue("laterBotSortMode", settings.laterBotSortMode || "newest");
  setValue("laterBotRelationFilter", settings.laterBotRelationFilter || "all");
  setValue("laterBotFolderFilter", settings.laterBotFolderFilter || "all");
  setValue("laterBotCreatorFilter", settings.laterBotCreatorFilter || "");
  setValue("laterBotStateFilter", settings.laterBotStateFilter || "all");
  setChecked("enableBotOrganizer", !!settings.enableBotOrganizer);
  setValue("botCollections", settings.botCollections || "");
  setChecked("botOrganizerShowCardMeta", settings.botOrganizerShowCardMeta !== false);
  setChecked("botOrganizerBulkTools", settings.botOrganizerBulkTools !== false);

  setChecked("hideHomeForYouCards", settings.hideHomeForYouCards);
  setChecked("expandLongCardDescriptions", settings.expandLongCardDescriptions);
  setChecked("showCardGreetingTokenInfo", !!settings.showCardGreetingTokenInfo);
  setChecked("showExactMessageCounts", !!settings.showExactMessageCounts);
  setChecked("showBotCreationDates", !!settings.showBotCreationDates);
  setChecked("cardTokenShowGreeting", settings.cardTokenShowGreeting !== false);
  setChecked("cardTokenShowPersonality", !!settings.cardTokenShowPersonality);
  setChecked("cardTokenShowScenario", !!settings.cardTokenShowScenario);
  setChecked("cardTokenShowExamples", !!settings.cardTokenShowExamples);

  setChecked("autoFillListings", settings.autoFillListings);
  setChecked("showListingRefillButton", !!settings.showListingRefillButton);
  setChecked("showListingFilterStats", !!settings.showListingFilterStats);
  setChecked("showListingFilterStatsDetails", !!settings.showListingFilterStatsDetails);
  setValue("autoFillTargetCards", String(settings.autoFillTargetCards || 50));
  setValue("autoFillMaxClicks", String(settings.autoFillMaxClicks || 8));

  setChecked("hideChatPlusButton", settings.hideChatPlusButton);
  setChecked("hideChatImageButton", settings.hideChatImageButton);
  setChecked("replaceChatImageWithOocButton", !!settings.replaceChatImageWithOocButton);
  setChecked("showAsteriskButton", !!settings.showAsteriskButton);
  setValue("composerShortcutPlacement", ["inside-right", "outside-left", "outside-right"].includes(settings.composerShortcutPlacement) ? settings.composerShortcutPlacement : "inside-right");
  setChecked("autoPairAsterisks", !!settings.autoPairAsterisks);
  setChecked("showFormattingToolbar", !!settings.showFormattingToolbar);
  setChecked("formatToolbarAsterisk", settings.formatToolbarAsterisk !== false);
  setChecked("formatToolbarBold", settings.formatToolbarBold !== false);
  setChecked("formatToolbarBoldItalic", !!settings.formatToolbarBoldItalic);
  setChecked("formatToolbarStrike", !!settings.formatToolbarStrike);
  setChecked("formatToolbarParens", settings.formatToolbarParens !== false);
  setChecked("formatToolbarQuotes", settings.formatToolbarQuotes !== false);
  setChecked("formatToolbarBackticks", !!settings.formatToolbarBackticks);
  setChecked("formatToolbarBrackets", !!settings.formatToolbarBrackets);
  setChecked("formatToolbarBraces", !!settings.formatToolbarBraces);
  setValue("formatToolbarCustomWrappers", settings.formatToolbarCustomWrappers || "");
  setChecked("styleAlternateDialogue", !!settings.styleAlternateDialogue);
  setValue("alternateDialogueScope", ["ai", "user", "both"].includes(settings.alternateDialogueScope) ? settings.alternateDialogueScope : "ai");
  setValue("alternateDialogueStyle", settings.alternateDialogueStyle || "dialogue");
  setChecked("alternateDialogueCustomColors", !!settings.alternateDialogueCustomColors);
  setValue("alternateDialogueTextColor", settings.alternateDialogueTextColor || "#f4d35e");
  setValue("alternateDialogueBackgroundColor", settings.alternateDialogueBackgroundColor || "#1f2430");
  setValue("alternateDialogueBorderColor", settings.alternateDialogueBorderColor || "#596273");
  setChecked("enableReplyInstructions", !!settings.enableReplyInstructions);
  setValue("replyInstructionText", settings.replyInstructionText || "");
  setValue("replyInstructionSendMode", ["every", "session", "manual"].includes(settings.replyInstructionSendMode) ? settings.replyInstructionSendMode : "session");
  setChecked("replyInstructionOocWrapper", settings.replyInstructionOocWrapper !== false);
  setChecked("replyInstructionShowChatButton", settings.replyInstructionShowChatButton !== false);
  setChecked("enableGlobalMemory", !!settings.enableGlobalMemory);
  setValue("globalMemoryText", settings.globalMemoryText || "");
  setValue("globalMemorySendMode", ["every", "session", "manual"].includes(settings.globalMemorySendMode) ? settings.globalMemorySendMode : "session");
  setChecked("globalMemoryOocWrapper", settings.globalMemoryOocWrapper !== false);
  setChecked("globalMemoryShowChatButton", settings.globalMemoryShowChatButton !== false);
  setChecked("enableRpFormatRepair", !!settings.enableRpFormatRepair);
  setChecked("enableCharacterQolProfiles", !!settings.enableCharacterQolProfiles);
  setChecked("rpFormatRepairAuto", settings.rpFormatRepairAuto !== false);
  setValue("rpFormatStyle", ["clean", "quoted"].includes(settings.rpFormatStyle) ? settings.rpFormatStyle : "clean");
  setValue("rpFormatDetection", ["conservative", "balanced", "aggressive"].includes(settings.rpFormatDetection) ? settings.rpFormatDetection : "balanced");
  setChecked("rpFormatConvertBoldActions", settings.rpFormatConvertBoldActions !== false);
  setChecked("rpFormatRemoveActionParens", settings.rpFormatRemoveActionParens !== false);
  setChecked("rpFormatPreserveInlineEmphasis", settings.rpFormatPreserveInlineEmphasis !== false);
  setChecked("rpFormatPreserveSemanticQuotes", settings.rpFormatPreserveSemanticQuotes !== false);
  setChecked("rpFormatPreserveBackticks", settings.rpFormatPreserveBackticks !== false);
  setChecked("rpFormatShowMessageButtons", settings.rpFormatShowMessageButtons !== false);
  setChecked("enableChatBackgrounds", !!settings.enableChatBackgrounds);
  setValue("chatBackgroundDim", String(settings.chatBackgroundDim ?? 45));
  setValue("chatBackgroundBlur", String(settings.chatBackgroundBlur ?? 0));
  setValue("chatBackgroundFit", settings.chatBackgroundFit || "cover");
  setValue("chatBackgroundPosition", settings.chatBackgroundPosition || "center");
  setChecked("enableChatBubbleCustomization", !!settings.enableChatBubbleCustomization);
  setChecked("persistSpicyChatUserAppearance", !!settings.persistSpicyChatUserAppearance);
  setValue("chatBubbleAiBackground", settings.chatBubbleAiBackground || "#27282d");
  setValue("chatBubbleAiTextMode", ["native", "custom"].includes(settings.chatBubbleAiTextMode) ? settings.chatBubbleAiTextMode : "custom");
  setValue("chatBubbleAiText", settings.chatBubbleAiText || "#f2f2f2");
  setValue("chatBubbleAiActionMode", ["native", "base", "custom"].includes(settings.chatBubbleAiActionMode) ? settings.chatBubbleAiActionMode : "native");
  setValue("chatBubbleAiActionText", settings.chatBubbleAiActionText || "#79c8f5");
  setValue("chatBubbleAiDialogueMode", ["native", "base", "custom"].includes(settings.chatBubbleAiDialogueMode) ? settings.chatBubbleAiDialogueMode : "base");
  setValue("chatBubbleAiDialogueText", settings.chatBubbleAiDialogueText || settings.chatBubbleAiText || "#f2f2f2");
  setValue("chatBubbleAiBorder", settings.chatBubbleAiBorder || "#555861");
  setValue("chatBubbleAiBorderWidth", String(settings.chatBubbleAiBorderWidth ?? 0));
  setValue("chatBubbleAiBorderStyle", ["solid", "dashed", "dotted", "double"].includes(settings.chatBubbleAiBorderStyle) ? settings.chatBubbleAiBorderStyle : "solid");
  setValue("chatBubbleAiBorderOpacity", String(settings.chatBubbleAiBorderOpacity ?? 100));
  setValue("chatBubbleAiOpacity", String(settings.chatBubbleAiOpacity ?? 100));
  setValue("chatBubbleAiRadius", String(settings.chatBubbleAiRadius ?? 20));
  setValue("chatBubbleAiShape", settings.chatBubbleAiShape || "native");
  setValue("chatBubbleAiDecorationMode", ["bubble", "custom"].includes(settings.chatBubbleAiDecorationMode) ? settings.chatBubbleAiDecorationMode : "bubble");
  setValue("chatBubbleAiDecorationColor", settings.chatBubbleAiDecorationColor || settings.chatBubbleAiBackground || "#27282d");
  setValue("chatBubbleAiCatEarLayout", ["auto", "left", "right", "split"].includes(settings.chatBubbleAiCatEarLayout) ? settings.chatBubbleAiCatEarLayout : "auto");
  setChecked("chatBubbleAiShadow", !!settings.chatBubbleAiShadow);
  setValue("chatBubbleUserBackground", settings.chatBubbleUserBackground || "#253f52");
  setValue("chatBubbleUserTextMode", ["native", "custom"].includes(settings.chatBubbleUserTextMode) ? settings.chatBubbleUserTextMode : "custom");
  setValue("chatBubbleUserText", settings.chatBubbleUserText || "#f5f5f5");
  setValue("chatBubbleUserActionMode", ["native", "base", "custom"].includes(settings.chatBubbleUserActionMode) ? settings.chatBubbleUserActionMode : "native");
  setValue("chatBubbleUserActionText", settings.chatBubbleUserActionText || "#79c8f5");
  setValue("chatBubbleUserDialogueMode", ["native", "base", "custom"].includes(settings.chatBubbleUserDialogueMode) ? settings.chatBubbleUserDialogueMode : "base");
  setValue("chatBubbleUserDialogueText", settings.chatBubbleUserDialogueText || settings.chatBubbleUserText || "#f5f5f5");
  setValue("chatBubbleUserBorder", settings.chatBubbleUserBorder || "#52718a");
  setValue("chatBubbleUserBorderWidth", String(settings.chatBubbleUserBorderWidth ?? 0));
  setValue("chatBubbleUserBorderStyle", ["solid", "dashed", "dotted", "double"].includes(settings.chatBubbleUserBorderStyle) ? settings.chatBubbleUserBorderStyle : "solid");
  setValue("chatBubbleUserBorderOpacity", String(settings.chatBubbleUserBorderOpacity ?? 100));
  setValue("chatBubbleUserOpacity", String(settings.chatBubbleUserOpacity ?? 100));
  setValue("chatBubbleUserRadius", String(settings.chatBubbleUserRadius ?? 20));
  setValue("chatBubbleUserShape", settings.chatBubbleUserShape || "native");
  setValue("chatBubbleUserDecorationMode", ["bubble", "custom"].includes(settings.chatBubbleUserDecorationMode) ? settings.chatBubbleUserDecorationMode : "bubble");
  setValue("chatBubbleUserDecorationColor", settings.chatBubbleUserDecorationColor || settings.chatBubbleUserBackground || "#253f52");
  setValue("chatBubbleUserCatEarLayout", ["auto", "left", "right", "split"].includes(settings.chatBubbleUserCatEarLayout) ? settings.chatBubbleUserCatEarLayout : "auto");
  setChecked("chatBubbleUserShadow", !!settings.chatBubbleUserShadow);
  updateAppearanceColorControlStates();
  updateMessageQuickActionControlStates();
  setChecked("hideChatVoiceButton", settings.hideChatVoiceButton);
  setChecked("hideUnlockCustomVoices", settings.hideUnlockCustomVoices);

  setChecked("showMessageQuickActions", !!settings.showMessageQuickActions);
  setChecked("showChatSearch", !!settings.showChatSearch);
  setChecked("chatSearchShowPanel", settings.chatSearchShowPanel !== false);
  setChecked("chatSearchShowFindButton", !!settings.chatSearchShowFindButton);
  setChecked("chatSearchExactPhrase", !!settings.chatSearchExactPhrase);
  setChecked("chatSearchCaseSensitive", !!settings.chatSearchCaseSensitive);
  setChecked("chatSearchWholeWord", !!settings.chatSearchWholeWord);
  setChecked("chatSearchRegex", !!settings.chatSearchRegex);
  setChecked("chatSearchLoadUntilMatch", !!settings.chatSearchLoadUntilMatch);
  setChecked("enableMessageBookmarks", !!settings.enableMessageBookmarks);
  setChecked("messageBookmarkButtons", settings.messageBookmarkButtons !== false);
  setChecked("enableFocusMode", !!settings.enableFocusMode);
  setChecked("focusHideSidebar", settings.focusHideSidebar !== false);
  setChecked("focusHideTopBar", settings.focusHideTopBar !== false);
  setChecked("focusHideChatHeader", settings.focusHideChatHeader !== false);
  setChecked("focusHideQolPanel", settings.focusHideQolPanel !== false);
  setChecked("enableSavedTextSnippets", !!settings.enableSavedTextSnippets);
  setChecked("enableContextKeeper", !!settings.enableContextKeeper);
  setChecked("contextKeeperAutoCapture", settings.contextKeeperAutoCapture !== false);
  setValue("contextKeeperAutoSensitivity", ["strict", "balanced", "broad"].includes(settings.contextKeeperAutoSensitivity) ? settings.contextKeeperAutoSensitivity : "balanced");
  setValue("contextKeeperAutoEveryMessages", String(Math.max(1, Math.min(20, Number(settings.contextKeeperAutoEveryMessages) || 4))));
  setValue("contextKeeperAutoMaxDetails", String(Math.max(20, Math.min(300, Number(settings.contextKeeperAutoMaxDetails) || 120))));
  setChecked("contextKeeperMessageButtons", !!settings.contextKeeperMessageButtons);
  setChecked("enableSelectionRemember", !!settings.enableSelectionRemember);
  setValue("contextKeeperRecapSize", ["compact", "balanced", "full"].includes(settings.contextKeeperRecapSize) ? settings.contextKeeperRecapSize : "balanced");
  setChecked("enableStoryDayTracker", !!settings.enableStoryDayTracker);
  setValue("storyDayTrackerMode", ["manual", "conservative", "assisted"].includes(settings.storyDayTrackerMode) ? settings.storyDayTrackerMode : "conservative");
  setChecked("storyDayTrackerIncludeInContext", settings.storyDayTrackerIncludeInContext !== false);
  setChecked("storyDayTrackerShowQuickPanel", settings.storyDayTrackerShowQuickPanel !== false);
  setChecked("enableRpStateTracker", !!settings.enableRpStateTracker);
  setValue("rpStateTrackerMode", ["manual", "conservative", "assisted"].includes(settings.rpStateTrackerMode) ? settings.rpStateTrackerMode : "conservative");
  setValue("rpStateInjectMode", ["manual", "changed", "every"].includes(settings.rpStateInjectMode) ? settings.rpStateInjectMode : "changed");
  setValue("rpStateMaxContextChars", String(Math.max(300, Math.min(3000, Number(settings.rpStateMaxContextChars) || 1200))));
  setChecked("rpStateShowQuickPanel", settings.rpStateShowQuickPanel !== false);
  setChecked("enableChatNudges", !!settings.enableChatNudges);
  setValue("chatNudgeDefaultHours", [5, 8, 24, 48, 168].includes(Number(settings.chatNudgeDefaultHours)) ? String(Number(settings.chatNudgeDefaultHours)) : "24");
  setChecked("chatNudgeBrowserNotifications", settings.chatNudgeBrowserNotifications !== false);
  renderChatNudgeManager(result[CHAT_NUDGE_STORE_KEY]);
  refreshChatNudgePermissionStatus();
  setChecked("enableSoundscapes", !!settings.enableSoundscapes);
  setChecked("soundscapeShowChatControl", settings.soundscapeShowChatControl !== false);
  const soundscapeMaster = Number.isFinite(Number(settings.soundscapeMasterVolume)) ? Math.min(100, Math.max(0, Number(settings.soundscapeMasterVolume))) : 65;
  setValue("soundscapeMasterVolume", soundscapeMaster);
  if ($("soundscapeMasterVolumeValue")) $("soundscapeMasterVolumeValue").textContent = `${soundscapeMaster}%`;
  setChecked("soundscapeOnChat", settings.soundscapeOnChat !== false);
  setChecked("soundscapeOnHome", !!settings.soundscapeOnHome);
  setChecked("soundscapeOnChats", !!settings.soundscapeOnChats);
  setChecked("soundscapeOnProfiles", !!settings.soundscapeOnProfiles);
  setChecked("soundscapeOnOther", !!settings.soundscapeOnOther);
  armLazySoundscapeManager();
  setChecked("messageQuickActionCopy", !!settings.messageQuickActionCopy);
  setChecked("messageQuickActionEdit", !!settings.messageQuickActionEdit);
  setChecked("messageQuickActionRemoveImage", !!settings.messageQuickActionRemoveImage);
  setChecked("messageQuickActionResend", !!settings.messageQuickActionResend);
  setChecked("messageQuickActionConfirmRemoveImage", !!settings.messageQuickActionConfirmRemoveImage);
  setChecked("messageQuickActionReport", !!settings.messageQuickActionReport);
  updateMessageQuickActionControlStates();
  setChecked("allowTypingWhileAiResponding", !!settings.allowTypingWhileAiResponding);
  setChecked("keepChatPositionWhileTyping", !!settings.keepChatPositionWhileTyping);
  setChecked("showScrollToTopButton", !!settings.showScrollToTopButton);
  setChecked("showScrollToBottomButton", !!settings.showScrollToBottomButton);
  setChecked("scrollNavOnHome", settings.scrollNavOnHome !== false);
  setChecked("scrollNavOnChats", settings.scrollNavOnChats !== false);
  setChecked("scrollNavOnChat", settings.scrollNavOnChat !== false);
  setChecked("scrollNavOnCreation", settings.scrollNavOnCreation !== false);
  setChecked("scrollNavOnProfiles", settings.scrollNavOnProfiles !== false);
  setChecked("scrollNavOnOther", settings.scrollNavOnOther !== false);
  setChecked("scrollTopLoadPreviousMessages", !!settings.scrollTopLoadPreviousMessages);
  setValue("scrollTopLoadPreviousMode", ["one", "all"].includes(settings.scrollTopLoadPreviousMode) ? settings.scrollTopLoadPreviousMode : "all");
  setValue("scrollTopLoadPreviousTiming", ["before", "background"].includes(settings.scrollTopLoadPreviousTiming) ? settings.scrollTopLoadPreviousTiming : "before");
  setChecked("botArchiveRememberSeenPublic", !!settings.botArchiveRememberSeenPublic);
  setChecked("botBackupToolsEnabled", !!settings.botBackupToolsEnabled);
  if ($("botBackupToolsEnabled")) $("botBackupToolsEnabled").dataset.dsAutoBackupDefaultUsed = settings.botBackupToolsEnabled ? "1" : "0";
  setChecked("botArchiveOwnEditorBackups", !!settings.botArchiveOwnEditorBackups);
  setChecked("lorebookBackupToolsEnabled", !!settings.lorebookBackupToolsEnabled);
  setChecked("lorebookBackupsEnabled", !!settings.lorebookBackupsEnabled);
  setValue("botArchiveOwnRevisionLimit", String(Math.max(1, Math.min(50, Number(settings.botArchiveOwnRevisionLimit) || 10))));
  setChecked("botArchiveOnProfileVisit", !!settings.botArchiveOnProfileVisit);
  setChecked("botArchiveOnChatOpen", !!settings.botArchiveOnChatOpen);
  setValue("botArchiveRefreshHours", [6, 24, 72, 168].includes(Number(settings.botArchiveRefreshHours)) ? String(Number(settings.botArchiveRefreshHours)) : "24");
  setChecked("protectDraftDuringMessageRemoval", !!settings.protectDraftDuringMessageRemoval);
  setChecked("failedMessageHelper", !!settings.failedMessageHelper);
  setChecked("chatPerformanceMode", !!settings.chatPerformanceMode);
  setValue("runtimePerformanceMode", ["normal", "adaptive", "aggressive", "maximum"].includes(settings.runtimePerformanceMode) ? settings.runtimePerformanceMode : "adaptive");
  setChecked("desktopAppPerformanceGuard", settings.desktopAppPerformanceGuard !== false);
  setChecked("pauseQolInHiddenTabs", !!settings.pauseQolInHiddenTabs);
  setChecked("autoPerformanceLargeChats", !!settings.autoPerformanceLargeChats);
  setValue("largeChatPerformanceThreshold", Math.max(100, Math.min(5000, Number(settings.largeChatPerformanceThreshold) || 500)));
  setChecked("deferQolWhileTyping", !!settings.deferQolWhileTyping);
  setChecked("pauseQolWhileMessageEditing", settings.pauseQolWhileMessageEditing !== false);
  setChecked("reduceQolAnimations", !!settings.reduceQolAnimations);
  setChecked("reduceOptionsAnimations", !!settings.reduceOptionsAnimations);
  setValue("settingsNavigationStyle", ["classic", "grouped"].includes(settings.settingsNavigationStyle) ? settings.settingsNavigationStyle : "classic");
  setValue("settingsContentLayout", ["single", "adaptive"].includes(settings.settingsContentLayout) ? settings.settingsContentLayout : "single");
  setValue("settingsPageWidth", ["comfortable", "wide"].includes(settings.settingsPageWidth) ? settings.settingsPageWidth : "comfortable");
  applyOptionsLayoutPreferences(settings);
  setChecked("collapseSettingsSectionsByDefault", !!settings.collapseSettingsSectionsByDefault);
  setChecked("enableCommandPalette", !!settings.enableCommandPalette);
  setValue("commandPaletteShortcut", ["ctrl-k", "ctrl-shift-k", "alt-k", "off"].includes(settings.commandPaletteShortcut) ? settings.commandPaletteShortcut : "ctrl-k");
  setChecked("commandPaletteShowSavedItems", settings.commandPaletteShowSavedItems !== false);
  setChecked("deepSleepDisabledFeatures", settings.deepSleepDisabledFeatures !== false);
  setChecked("performanceDiagnostics", !!settings.performanceDiagnostics);
  setChecked("enableLocalChangeHistory", !!settings.enableLocalChangeHistory);
  setChecked("showUpdateNotifications", !!settings.showUpdateNotifications);

  setValue("androidAppControlsMode", ["auto", "android", "always", "off"].includes(settings.androidAppControlsMode) ? settings.androidAppControlsMode : "auto");
  setChecked("androidTopBarMenu", !!settings.androidTopBarMenu);
  setChecked("androidHideComposerShortcuts", settings.androidHideComposerShortcuts !== false);
  setChecked("androidTopBarOoc", settings.androidTopBarOoc !== false);
  setChecked("androidTopBarAsterisk", settings.androidTopBarAsterisk !== false);
  setChecked("androidTopBarFormatting", settings.androidTopBarFormatting !== false);
  setChecked("androidTopBarTranslation", !!settings.androidTopBarTranslation);
  setChecked("androidTopBarScroll", settings.androidTopBarScroll !== false);
  setChecked("androidTopBarPersona", settings.androidTopBarPersona !== false);
  setChecked("androidTopBarModel", settings.androidTopBarModel !== false);

  setChecked("showChatExportButton", settings.showChatExportButton);
  setChecked("chatExportLoadPreviousMessages", !!settings.chatExportLoadPreviousMessages);
  setChecked("chatExportIncludeBotInfo", !!settings.chatExportIncludeBotInfo);
  setChecked("chatExportIncludeOocDirectives", !!settings.chatExportIncludeOocDirectives);
  setChecked("chatExportIncludeGenerationDetails", settings.chatExportIncludeGenerationDetails !== false);
  setChecked("chatExportNumberMessages", settings.chatExportNumberMessages !== false);
  setChecked("chatExportIncludeAvatars", settings.chatExportIncludeAvatars !== false);
  setValue("chatExportDefaultFormat", settings.chatExportDefaultFormat || "text");
  setValue("chatExportHtmlLayout", settings.chatExportHtmlLayout || "bubbles");
  setChecked("showOocTools", settings.showOocTools);
  renderOocTemplates(settings.oocTemplates);

  setChecked("savePersonasFromPages", settings.savePersonasFromPages);
  setChecked("keepLocalPersonaCopies", !!settings.keepLocalPersonaCopies);
  setChecked("expandPersonaDescriptions", !!settings.expandPersonaDescriptions);
  setChecked("enablePersonaOrganizer", !!settings.enablePersonaOrganizer);
  setValue("personaFolders", settings.personaFolders || "");
  setChecked("personaShowLocalMetaInPicker", settings.personaShowLocalMetaInPicker !== false);
  setChecked("showPersonaQuickSwitch", !!settings.showPersonaQuickSwitch);
  setChecked("autoAcceptPersonaChange", settings.autoAcceptPersonaChange);
  setValue("personaQuickSwitchLimit", String(settings.personaQuickSwitchLimit || 6));

  for (const key of Object.keys(DEFAULT_SETTINGS).filter(key => key.startsWith("hideSidebar"))) {
    setChecked(key, settings[key]);
  }

  [
    "enableMainFooterManagement", "hideMainFooterEntirely", "hideMainFooterCompany",
    "hideMainFooterResources", "hideMainFooterCommunity", "hideMainFooterJoinUs",
    "hideMainFooterAppDownload", "hideMainFooter2257"
  ].forEach(key => setChecked(key, !!settings[key]));

  // Migrate the old all-or-nothing footer setting into the new per-link controls.
  // Saving Settings clears the legacy flag and keeps the individual choices.
  if (settings.hideSidebarFooterLinks) {
    [
      "hideSidebarFooterTerms",
      "hideSidebarFooterPrivacy",
      "hideSidebarFooterRefunds",
      "hideSidebarFooterReporting",
      "hideSidebarFooterGuidelines",
      "hideSidebarFooterSupport",
      "hideSidebarFooterAffiliates"
    ].forEach(key => setChecked(key, true));
  }

  // The old social/app-download switches were all-or-nothing. Preserve those
  // choices by turning on each new individual option in the Settings UI.
  if (settings.hideSidebarSocialLinks) {
    [
      "hideSidebarSocialDiscord",
      "hideSidebarSocialX",
      "hideSidebarSocialReddit"
    ].forEach(key => setChecked(key, true));
  }

  if (settings.hideSidebarAppDownload) {
    [
      "hideSidebarAppDownloadGooglePlay",
      "hideSidebarAppDownloadAppStore",
      "hideSidebarAppDownloadGeneric"
    ].forEach(key => setChecked(key, true));
  }

  setChecked("blockCards", settings.blockCards);
  setChecked("hideGroupChats", settings.hideGroupChats);
  setChecked("showLorebookFilters", !!settings.showLorebookFilters);
  setChecked("enableSmartFilterPresets", !!settings.enableSmartFilterPresets);
  setChecked("enableCreationAudit", !!settings.enableCreationAudit);
  setChecked("creationAuditQuickStatus", settings.creationAuditQuickStatus !== false);
  setChecked("enableCreatorWritingAssistant", !!settings.enableCreatorWritingAssistant);
  setChecked("creatorWritingUseBrowserAi", settings.creatorWritingUseBrowserAi !== false);
  setValue("creatorWritingDictionary", settings.creatorWritingDictionary || "");
  setValue("creatorWritingTargetLanguage", settings.creatorWritingTargetLanguage || "English");
  setChecked("enableProfileExport", !!settings.enableProfileExport);
  setChecked("enableMyCreationsFilters", !!settings.enableMyCreationsFilters);
  setChecked("rememberMyCreationsView", !!settings.rememberMyCreationsView);
  setChecked("autoLoadMyCreations", !!settings.autoLoadMyCreations);
  setValue("myCreationsAutoLoadPages", String(Math.max(1, Math.min(30, Number(settings.myCreationsAutoLoadPages) || 1))));
  setChecked("enableRecommendationHelpers", !!settings.enableRecommendationHelpers);
  setChecked("recommendationHideLaterBots", !!settings.recommendationHideLaterBots);
  setChecked("recommendationHideNotInterested", !!settings.recommendationHideNotInterested);
  setChecked("recommendationPreferFavoriteCreators", !!settings.recommendationPreferFavoriteCreators);
  setValue("recommendationPreferredTags", settings.recommendationPreferredTags || "");
  setValue("recommendationAvoidTags", settings.recommendationAvoidTags || "");
  setChecked("recommendationShowReasonBadges", !!settings.recommendationShowReasonBadges);
  setChecked("recommendationHideFavoriteBots", !!settings.recommendationHideFavoriteBots);
  setChecked("recommendationHideOwnBots", !!settings.recommendationHideOwnBots);
  setChecked("recommendationOnlyUnopened", !!settings.recommendationOnlyUnopened);
  setChecked("recommendationOnlyLorebook", !!settings.recommendationOnlyLorebook);
  setChecked("recommendationSessionHideButtons", !!settings.recommendationSessionHideButtons);
  setChecked("recommendationRandomButton", !!settings.recommendationRandomButton);
  setValue("cardDensityMode", ["normal", "compact", "dense"].includes(settings.cardDensityMode) ? settings.cardDensityMode : "normal");
  setValue("cardClickBehavior", ["default", "profile"].includes(settings.cardClickBehavior) ? settings.cardClickBehavior : "default");
  setChecked("showCopyBotInfoButtons", !!settings.showCopyBotInfoButtons);
  setChecked("trackRecentlySeenBots", !!settings.trackRecentlySeenBots);
  setChecked("showRecentlySeenButton", !!settings.showRecentlySeenButton);
  setValue("recentlySeenLimit", Math.max(10, Math.min(250, Number(settings.recentlySeenLimit) || 100)));
  setChecked("enableBotComparison", !!settings.enableBotComparison);
  setChecked("showQuickNotInterestedButtons", !!settings.showQuickNotInterestedButtons);
  setChecked("showQuickUnblockButtons", !!settings.showQuickUnblockButtons);
  setChecked("reduceAnimatedBotImages", !!settings.reduceAnimatedBotImages);
  setValue("animatedImageMode", ["freeze", "once", "hover"].includes(settings.animatedImageMode) ? settings.animatedImageMode : "freeze");
  setChecked("animatedImagesListings", !!settings.animatedImagesListings);
  setChecked("animatedImagesChats", !!settings.animatedImagesChats);
  setChecked("animatedImagesProfiles", !!settings.animatedImagesProfiles);
  setChecked("animatedImagesChatMedia", !!settings.animatedImagesChatMedia);
  setChecked("replaceCardProfileWithBlockButton", settings.replaceCardProfileWithBlockButton);
  setChecked("showBlockButtonOnMyCreations", !!settings.showBlockButtonOnMyCreations);
  setChecked("enableBulkCardBlocking", !!settings.enableBulkCardBlocking);
  setChecked("bulkCardBlockingSidebarLauncher", !!settings.bulkCardBlockingSidebarLauncher);
  setChecked("quickDislikeOnBlock", settings.quickDislikeIdleEnabled === true);
  setValue("quickDislikeIdleMinutes", Math.min(60, Math.max(1, Number(settings.quickDislikeIdleMinutes) || 5)));
  setValue("blockedBulkDislikeDelayMs", Math.min(10000, Math.max(250, Number(settings.blockedBulkDislikeDelayMs) || 750)));
  setChecked("enableLanguageFilter", settings.enableLanguageFilter);
  setAllowedLanguages(settings.allowedLanguages);
  setValue("languageSelectionMode", ["include", "exclude"].includes(settings.languageSelectionMode) ? settings.languageSelectionMode : "include");
  setValue("languageFilterMode", settings.languageFilterMode || "conservative");
  setChecked("languageAutoDetectUntagged", settings.languageAutoDetectUntagged !== false);
  setChecked("languageShowDetectedBadge", !!settings.languageShowDetectedBadge);
  setChecked("textNormalizationEnabled", !!settings.textNormalizationEnabled);
  setChecked("normalizeFancyUnicode", !!settings.normalizeFancyUnicode);
  setChecked("normalizePunctuation", !!settings.normalizePunctuation);
  setChecked("normalizeInvisibleCharacters", !!settings.normalizeInvisibleCharacters);
  setChecked("normalizeDecorativeSymbols", settings.normalizeDecorativeSymbols);
  updateTextNormalizationPreview();
  setValue("blockedTags", arrayToLines(settings.blockedTags));
  setValue("blockedWords", arrayToLines(settings.blockedWords));
  setValue("blockedCreators", arrayToLines(settings.blockedCreators));
  setValue("blockedBotSortMode", settings.blockedBotSortMode || "newest");
  setValue("hiddenCardMode", settings.hiddenCardMode || "hide");

  setChecked("enablePersonalUsageSummary", !!settings.enablePersonalUsageSummary);
  setChecked("debug", settings.debug);

  if ($("openedCount")) $("openedCount").textContent = savedListsDataLoaded ? `${currentOpened.length} stored` : "loads with Saved Lists";
  if ($("personaCount")) $("personaCount").textContent = `${currentPersonas.length} stored`;

  optionsDataLoaded = true;
  updateBlockedBulkResumeControls();
  updateSettingDependencies();
  DS_FEATURE_INDEX_REFRESH?.();
  await applyPendingOptionsNavigation(result[PENDING_OPTIONS_NAV_KEY]);
  const activeTab = activeOptionsTab();
  renderHeavyManagersForTab(activeTab);
  if (activeTab === "data") { refreshStorageUsage().catch(() => {}); renderLocalChangeHistory().catch(() => {}); }
  if (activeTab === "control") setupControlCenterView().catch(() => {});
  if (activeTab === "changelog") loadChangelog();
  renderMiniPanelPreview();
  applyFeatureChangeBadges(String(result[LAST_SEEN_VERSION_KEY] || ""));
  renderTabCleanupSessions().catch(() => {});
  loadTabCleanupTopics().catch(() => {});
  applySettingsSectionDefault(settings);
  applySettingsEnabledOnlyFilter();
  refreshSettingsSectionShortcuts();
  initializeExportScopeSelection().catch(() => {});

  dirtySavedStores.clear();
  if (loadStarted && typeof performance !== "undefined") OPTIONS_PERFORMANCE.loadMs = Math.max(0, performance.now() - loadStarted);
}

function readSettingsFromPage() {
  const oocTemplates = oocTemplatesFromPage();

  return {
    enabled: checked("enabled"),
    saiToolkitCompatibility: checked("saiToolkitCompatibility", false),
    globalNsfwMode: value("globalNsfwMode", "ignore"),

    autoAfkEnabled: checked("autoAfkEnabled"),
    autoAfkHours: Math.min(720, Math.max(1, Number(value("autoAfkHours", "12")) || 12)),
    autoAfkChats: checked("autoAfkChats", true),
    autoAfkHome: checked("autoAfkHome"),
    autoAfkProfiles: checked("autoAfkProfiles"),
    autoAfkAction: $("autoAfkActionClose")?.checked ? "close" : "discard",
    autoAfkProtectActive: checked("autoAfkProtectActive", true),
    autoAfkResetOnActivate: checked("autoAfkResetOnActivate", true),
    duplicateTabGuardEnabled: checked("duplicateTabGuardEnabled"),
    duplicateTabChats: checked("duplicateTabChats", true),
    duplicateTabHome: checked("duplicateTabHome"),
    duplicateTabProfiles: checked("duplicateTabProfiles"),
    duplicateTabKeepMode: value("duplicateTabKeepMode") === "existing" ? "existing" : "new",
    duplicateTabFocusExisting: checked("duplicateTabFocusExisting", true),
    tabCleanupRecentHours: Math.min(72, Math.max(1, Number(value("tabCleanupRecentHours", "24")) || 24)),
    tabCleanupRecentDays: Math.min(30, Math.max(1, Number(value("tabCleanupRecentDays", "3")) || 3)),
    tabCleanupMediumDays: Math.min(90, Math.max(2, Number(value("tabCleanupMediumDays", "7")) || 7)),
    tabCleanupOldDays: Math.min(365, Math.max(3, Number(value("tabCleanupOldDays", "14")) || 14)),
    tabCleanupProtectPinnedOnClose: checked("tabCleanupProtectPinnedOnClose", true),

    autoTags: checked("autoTags"),
    enableTagAliases: checked("enableTagAliases"),
    tagAliasRules: value("tagAliasRules"),
    tagAliasShowDisplay: checked("tagAliasShowDisplay"),
    showTagTemplateButton: checked("showTagTemplateButton"),
    showChatTagLinks: checked("showChatTagLinks"),
    showChatTagAddButtons: checked("showChatTagAddButtons"),
    botEditorShowCharButton: checked("botEditorShowCharButton"),
    botEditorShowUserButton: checked("botEditorShowUserButton"),
    botEditorShowContinueButton: checked("botEditorShowContinueButton"),
    botEditorShowNoControlButton: checked("botEditorShowNoControlButton"),
    botEditorShowCustomSnippets: checked("botEditorShowCustomSnippets"),
    botEditorAutoOpenAdvanced: checked("botEditorAutoOpenAdvanced"),
    rememberBotImagePrompt: checked("rememberBotImagePrompt"),
    botEditorSaveActions: checked("botEditorSaveActions"),
    botEditorSaveChatNewTab: checked("botEditorSaveChatNewTab"),
    enableBotEditorDraftHistory: checked("enableBotEditorDraftHistory"),
    botEditorDraftHistoryLimit: Math.max(3, Math.min(20, Number(value("botEditorDraftHistoryLimit", "8")) || 8)),
    enableWikiLorebookImporter: checked("enableWikiLorebookImporter"),
    enableLorebookConsistency: checked("enableLorebookConsistency"),
    lorebookConsistencyShowMatches: checked("lorebookConsistencyShowMatches", true),
    lorebookConsistencyAutoQueue: checked("lorebookConsistencyAutoQueue", true),
    lorebookConsistencyMaxEntries: Math.max(1, Math.min(5, Number(value("lorebookConsistencyMaxEntries", "3")) || 3)),
    lorebookDefaultEntriesTab: checked("lorebookDefaultEntriesTab", false),
    lorebookRememberEntrySort: checked("lorebookRememberEntrySort", false),
    lorebookProtectEntryDrafts: checked("lorebookProtectEntryDrafts", false),
    lorebookEditShortcuts: checked("lorebookEditShortcuts", false),
    lorebookEntryManager: checked("lorebookEntryManager", false),
    lorebookMultiEntryWorkspace: checked("lorebookMultiEntryWorkspace", false),
    lorebookEntrySelectionCheckbox: checked("lorebookEntrySelectionCheckbox", true),
    lorebookEntryShowTokenCount: checked("lorebookEntryShowTokenCount", true),
    lorebookEntryShowHiddenKeywordCount: checked("lorebookEntryShowHiddenKeywordCount", true),
    lorebookEntryShowNoKeywordsWarning: checked("lorebookEntryShowNoKeywordsWarning", true),
    lorebookEntryShowCharacterCount: checked("lorebookEntryShowCharacterCount", true),
    lorebookEntryRenameButton: checked("lorebookEntryRenameButton", true),
    lorebookEntryCopyButton: checked("lorebookEntryCopyButton", true),
    lorebookEntryDuplicateButton: checked("lorebookEntryDuplicateButton", true),
    lorebookBulkSelectAll: checked("lorebookBulkSelectAll", true),
    lorebookBulkClear: checked("lorebookBulkClear", true),
    lorebookBulkAnalyze: checked("lorebookBulkAnalyze", true),
    lorebookBulkExportSelected: checked("lorebookBulkExportSelected", true),
    lorebookBulkCopySelected: checked("lorebookBulkCopySelected", true),
    lorebookBulkDuplicateSelected: checked("lorebookBulkDuplicateSelected", true),
    lorebookBulkAddKeyword: checked("lorebookBulkAddKeyword", true),
    lorebookBulkRemoveKeyword: checked("lorebookBulkRemoveKeyword", true),
    lorebookBulkToggleEnabled: checked("lorebookBulkToggleEnabled", true),
    lorebookBulkDeleteSelected: checked("lorebookBulkDeleteSelected", true),
    lorebookBulkFindKeyword: checked("lorebookBulkFindKeyword", true),
    lorebookAutoStartNew: checked("lorebookAutoStartNew"),
    lorebookBulkKeywordPaste: checked("lorebookBulkKeywordPaste"),
    lorebookExpandEntryEditor: checked("lorebookExpandEntryEditor"),
    lorebookExpandTags: false,
    botTagBulkPaste: checked("botTagBulkPaste"),
    showLorebookEntryExpandButtons: checked("showLorebookEntryExpandButtons"),
    creatorModerationWarnings: checked("creatorModerationWarnings"),
    creatorModerationWarningsChatbots: checked("creatorModerationWarningsChatbots"),
    creatorModerationWarningMode: value("creatorModerationWarningMode") === "all" ? "all" : "balanced",
    creatorModerationWarningIgnoredTerms: value("creatorModerationWarningIgnoredTerms", "").slice(0, 4000),
    creatorModerationWarningCustomTerms: value("creatorModerationWarningCustomTerms", "").slice(0, 12000),
    botEditorDefaultVisibility: ["public", "unlisted"].includes(value("botEditorDefaultVisibility")) ? value("botEditorDefaultVisibility") : "ignore",
    autoAgreeCreationGuidelines: checked("autoAgreeCreationGuidelines"),
    botEditorSnippets: botEditorSnippetsFromPage(),
    enableGenerationProfiles: checked("enableGenerationProfiles"),
    showGenerationMetadata: checked("showGenerationMetadata"),
    showMessageTimestamps: checked("showMessageTimestamps"),
    messageTimestamp24Hour: checked("messageTimestamp24Hour"),
    messageTimestampDateFirst: checked("messageTimestampDateFirst"),
    messageTimestampShowSeconds: checked("messageTimestampShowSeconds"),
    showGenerationModel: checked("showGenerationModel"),
    showGenerationElapsed: checked("showGenerationElapsed"),
    showGenerationSettings: checked("showGenerationSettings"),
    compactGenerationMetadata: checked("compactGenerationMetadata"),
    enableContextWindowWarning: checked("enableContextWindowWarning"),
    contextWarningThreshold: Math.min(99, Math.max(50, Number(value("contextWarningThreshold", "85")) || 85)),
    contextWarningManualLimit: Math.max(0, Number(value("contextWarningManualLimit", "0")) || 0),
    contextWarningBrowserNotifications: checked("contextWarningBrowserNotifications"),
    includeTags: linesToArray(value("includeTags")),
    excludeTags: linesToArray(value("excludeTags")),

    hidePremium: checked("hidePremium"),
    hideFloatingPremiumPopups: checked("hideFloatingPremiumPopups"),
    hideAdvertBanners: checked("hideAdvertBanners"),
    expandModelSelectorDescriptions: checked("expandModelSelectorDescriptions"),
    hideModelUpgradeButtons: checked("hideModelUpgradeButtons"),
    customizeModelQuickMenu: checked("customizeModelQuickMenu"),
    modelQuickFavoritesOnly: checked("modelQuickFavoritesOnly"),
    modelFavoriteNames: value("modelFavoriteNames", ""),
    modelHiddenNames: value("modelHiddenNames", ""),
    hideNotifications: checked("hideNotifications"),
    hideTabNotificationBadge: checked("hideTabNotificationBadge"),
    autoReadNotifications: checked("autoReadNotifications"),

    hideTopBarLanguage: checked("hideTopBarLanguage"),
    hideTopBarNotifications: checked("hideTopBarNotifications"),
    hideTopBarTheme: checked("hideTopBarTheme"),
    topBarProfilePillMode: value("topBarProfilePillMode", "normal"),
    topBarProfilePillCustomText: value("topBarProfilePillCustomText", ""),
    topBarProfilePillPersonaPrefix: checked("topBarProfilePillPersonaPrefix"),

    showChatTopBarTools: checked("showChatTopBarTools"),
    chatTopBarInlineCreator: checked("chatTopBarInlineCreator"),
    chatTopBarAddLaterButton: checked("chatTopBarAddLaterButton"),
    closeChatTabAfterSavingLater: checked("closeChatTabAfterSavingLater"),
    showPerCharacterChatHistory: checked("showPerCharacterChatHistory"),
    showQuickNewChatButton: checked("showQuickNewChatButton"),
    hideChatTopBarRatingButton: checked("hideChatTopBarRatingButton"),
    enableNativeRatingHelpers: checked("enableNativeRatingHelpers"),
    hideChatTopBarModelButton: checked("hideChatTopBarModelButton"),
    hideChatTopBarContextDot: checked("hideChatTopBarContextDot"),
    hideChatDropdownVoiceUpsell: checked("hideChatDropdownVoiceUpsell"),
    hideChatDropdownMemoryItem: checked("hideChatDropdownMemoryItem"),
    enableBulkMemoryManager: checked("enableBulkMemoryManager"),
    showCopyMemoryAction: checked("showCopyMemoryAction"),
    memoryAutoLoadAll: checked("memoryAutoLoadAll"),
    enableChatTextReplacements: checked("enableChatTextReplacements"),
    chatTextReplacementRules: value("chatTextReplacementRules", ""),
    chatTextReplacementScope: ["ai", "user", "both"].includes(value("chatTextReplacementScope")) ? value("chatTextReplacementScope") : "ai",
    chatTextReplacementMode: value("chatTextReplacementMode") === "save" ? "save" : "display",
    chatTextReplacementPreview: checked("chatTextReplacementPreview"),
    enableTranslation: checked("enableTranslation"),
    translationShowMessageButtons: checked("translationShowMessageButtons"),
    translationAutoAi: checked("translationAutoAi"),
    translationAutoUser: checked("translationAutoUser"),
    translationTargetLanguage: value("translationTargetLanguage", "EN-US"),
    translationUnderstoodLanguages: value("translationUnderstoodLanguages", "EN"),
    translationProtectedTerms: value("translationProtectedTerms", ""),

    showChatListTools: checked("showChatListTools"),
    enableChatOrganizer: checked("enableChatOrganizer"),
    chatCollections: value("chatCollections", ""),
    showSavedChatQuickActions: checked("showSavedChatQuickActions"),
    showRandomChatButton: checked("showRandomChatButton"),
    randomChatUseLastHomeFilters: checked("randomChatUseLastHomeFilters"),
    randomChatIncludeOpened: checked("randomChatIncludeOpened"),
    randomChatIncludeLater: checked("randomChatIncludeLater"),
    randomChatIncludeFavorites: checked("randomChatIncludeFavorites"),
    chatListSortMode: value("chatListSortMode", "default"),
    chatListSearchMode: "all",
    chatListOpenedFilter: ["all", "opened", "unopened"].includes(value("chatListOpenedFilter")) ? value("chatListOpenedFilter") : "all",
    chatListMessageFilter: ["all", "0", "1-9", "10-49", "50-99", "100-499", "500+", "unknown"].includes(value("chatListMessageFilter")) ? value("chatListMessageFilter") : "all",
    chatListSavedFilter: ["all", "favorite", "later", "both", "saved", "neither"].includes(value("chatListSavedFilter")) ? value("chatListSavedFilter") : "all",
    chatListBlockedFilter: ["all", "blocked", "unblocked"].includes(value("chatListBlockedFilter")) ? value("chatListBlockedFilter") : "all",

    trackOpenedChats: checked("trackOpenedChats"),
    importOpenedFromChatsPage: checked("importOpenedFromChatsPage"),
    hideOpenedChats: checked("hideOpenedChats"),
    openedBotSortMode: value("openedBotSortMode", "newest"),
    qolInterfaceScale: [100, 110, 125, 150].includes(Number(value("qolInterfaceScale", "100"))) ? Number(value("qolInterfaceScale", "100")) : 100,
    chatTextScale: [100, 110, 125, 150].includes(Number(value("chatTextScale", "100"))) ? Number(value("chatTextScale", "100")) : 100,
    chatLineSpacing: ["native", "comfortable", "spacious"].includes(value("chatLineSpacing", "native")) ? value("chatLineSpacing", "native") : "native",
    showQuickPanel: checked("showQuickPanel"),
    quickPanelPlacement: value("quickPanelPlacement", "bottom-right") || "bottom-right",
    quickPanelDraggable: checked("quickPanelDraggable"),
    quickPanelDefaultClosed: checked("quickPanelDefaultClosed"),
    quickPanelEnabledByDefaultInTab: checked("quickPanelEnabledByDefaultInTab", true),
    quickPanelWidth: Math.min(440, Math.max(200, Number(value("quickPanelWidth", "280")) || 280)),
    quickPanelUiScale: Math.min(125, Math.max(80, Number(value("quickPanelUiScale", "100")) || 100)),
    quickPanelMaxHeightPercent: Math.min(95, Math.max(25, Number(value("quickPanelMaxHeightPercent", "80")) || 80)),
    quickPanelCustomXPercent: Math.min(100, Math.max(0, Number.isFinite(Number(value("quickPanelCustomXPercent", "70"))) ? Number(value("quickPanelCustomXPercent", "70")) : 70)),
    quickPanelCustomYPercent: Math.min(100, Math.max(0, Number.isFinite(Number(value("quickPanelCustomYPercent", "12"))) ? Number(value("quickPanelCustomYPercent", "12")) : 12)),
    quickPanelAutoCollapseOverlap: checked("quickPanelAutoCollapseOverlap", true),
    quickPanelShowStatus: checked("quickPanelShowStatus", true),
    quickPanelStatusShowOpened: checked("quickPanelStatusShowOpened", true),
    quickPanelStatusShowBlocked: checked("quickPanelStatusShowBlocked", true),
    popupShowOpenedCount: checked("popupShowOpenedCount", false),
    popupShowBlockedCount: checked("popupShowBlockedCount", false),
    popupShowStorageDetails: checked("popupShowStorageDetails"),
    quickPanelShowFeatureSummary: checked("quickPanelShowFeatureSummary"),
    quickPanelShowOptions: checked("quickPanelShowOptions", true),
    quickPanelShowFillNow: checked("quickPanelShowFillNow", true),
    quickPanelShowSmartFilterPins: checked("quickPanelShowSmartFilterPins"),
    quickPanelShowChatSearch: checked("quickPanelShowChatSearch", true),
    quickPanelShowChatSort: checked("quickPanelShowChatSort", true),
    quickPanelShowScanVisible: checked("quickPanelShowScanVisible", true),
    quickPanelShowLoadAll: checked("quickPanelShowLoadAll", true),
    quickPanelShowOoc: checked("quickPanelShowOoc", true),
    quickPanelShowAutoVoice: checked("quickPanelShowAutoVoice", true),
    quickPanelShowAutoAsterisk: checked("quickPanelShowAutoAsterisk", true),
    quickPanelShowTranslation: checked("quickPanelShowTranslation"),
    quickPanelShowPersona: checked("quickPanelShowPersona", true),
    quickPanelShowExport: checked("quickPanelShowExport", true),
    quickPanelShowSoundscapes: checked("quickPanelShowSoundscapes"),
    compactAfterHiding: checked("compactAfterHiding"),
    neverHideFavorites: checked("neverHideFavorites"),
    protectFavoritesFromBlocking: checked("protectFavoritesFromBlocking"),
    showCreatorFavoriteButtons: checked("showCreatorFavoriteButtons"),
    protectFavoriteCreatorsFromFiltering: checked("protectFavoriteCreatorsFromFiltering"),
    showFollowCreatorButtons: checked("showFollowCreatorButtons"),
    enableCreatorBotNotifications: checked("enableCreatorBotNotifications"),
    creatorBotCheckMinutes: CREATOR_BOT_WATCH_INTERVALS.includes(Number(value("creatorBotCheckMinutes", "60"))) ? Number(value("creatorBotCheckMinutes", "60")) : 60,
    creatorBotBrowserNotifications: checked("creatorBotBrowserNotifications"),
    trackFavoriteBots: checked("trackFavoriteBots"),
    showFavoriteHistoryButton: checked("showFavoriteHistoryButton"),
    favoriteBotSortMode: value("favoriteBotSortMode", "newest"),
    favoriteBotRelationFilter: value("favoriteBotRelationFilter", "all"),
    favoriteBotFolderFilter: value("favoriteBotFolderFilter", "all"),
    favoriteBotCreatorFilter: value("favoriteBotCreatorFilter", ""),
    favoriteBotStateFilter: value("favoriteBotStateFilter", "all"),
    showLaterBotButtons: checked("showLaterBotButtons"),
    enableSavedListsOverlay: checked("enableSavedListsOverlay"),
    protectLaterBotsFromFiltering: checked("protectLaterBotsFromFiltering"),
    hideLaterBotsFromListings: checked("hideLaterBotsFromListings"),
    laterBotSortMode: value("laterBotSortMode", "newest"),
    laterBotRelationFilter: value("laterBotRelationFilter", "all"),
    laterBotFolderFilter: value("laterBotFolderFilter", "all"),
    laterBotCreatorFilter: value("laterBotCreatorFilter", ""),
    laterBotStateFilter: value("laterBotStateFilter", "all"),
    enableBotOrganizer: checked("enableBotOrganizer"),
    botCollections: value("botCollections", ""),
    botOrganizerShowCardMeta: checked("botOrganizerShowCardMeta", true),
    botOrganizerBulkTools: checked("botOrganizerBulkTools", true),

    autoFillListings: checked("autoFillListings"),
    showListingRefillButton: checked("showListingRefillButton"),
    showListingFilterStats: checked("showListingFilterStats"),
    showListingFilterStatsDetails: checked("showListingFilterStatsDetails"),
    autoFillTargetCards: Math.max(1, Math.min(200, Number(value("autoFillTargetCards", "50")) || 50)),
    autoFillMaxClicks: Math.max(1, Math.min(30, Number(value("autoFillMaxClicks", "8")) || 8)),

    hideChatPlusButton: checked("hideChatPlusButton"),
    hideChatImageButton: checked("hideChatImageButton"),
    replaceChatImageWithOocButton: checked("replaceChatImageWithOocButton"),
    showAsteriskButton: checked("showAsteriskButton"),
    composerShortcutPlacement: ["inside-right", "outside-left", "outside-right"].includes(value("composerShortcutPlacement")) ? value("composerShortcutPlacement") : "inside-right",
    autoPairAsterisks: checked("autoPairAsterisks"),
    showFormattingToolbar: checked("showFormattingToolbar"),
    formatToolbarAsterisk: checked("formatToolbarAsterisk", true),
    formatToolbarBold: checked("formatToolbarBold", true),
    formatToolbarBoldItalic: checked("formatToolbarBoldItalic"),
    formatToolbarStrike: checked("formatToolbarStrike"),
    formatToolbarParens: checked("formatToolbarParens", true),
    formatToolbarQuotes: checked("formatToolbarQuotes", true),
    formatToolbarBackticks: checked("formatToolbarBackticks"),
    formatToolbarBrackets: checked("formatToolbarBrackets"),
    formatToolbarBraces: checked("formatToolbarBraces"),
    formatToolbarCustomWrappers: value("formatToolbarCustomWrappers", ""),
    styleAlternateDialogue: checked("styleAlternateDialogue"),
    alternateDialogueScope: ["ai", "user", "both"].includes(value("alternateDialogueScope")) ? value("alternateDialogueScope") : "ai",
    alternateDialogueStyle: value("alternateDialogueStyle", "dialogue"),
    alternateDialogueCustomColors: checked("alternateDialogueCustomColors"),
    alternateDialogueTextColor: value("alternateDialogueTextColor", "#f4d35e"),
    alternateDialogueBackgroundColor: value("alternateDialogueBackgroundColor", "#1f2430"),
    alternateDialogueBorderColor: value("alternateDialogueBorderColor", "#596273"),
    enableReplyInstructions: checked("enableReplyInstructions"),
    replyInstructionText: value("replyInstructionText", "").trim().slice(0, 2000),
    replyInstructionSendMode: ["every", "session", "manual"].includes(value("replyInstructionSendMode")) ? value("replyInstructionSendMode") : "session",
    replyInstructionOocWrapper: checked("replyInstructionOocWrapper", true),
    replyInstructionShowChatButton: checked("replyInstructionShowChatButton", true),
    replyInstructionBotOverrides: normalizeReplyInstructionOverrides(loadedSettingsSnapshot.replyInstructionBotOverrides),
    enableGlobalMemory: checked("enableGlobalMemory"),
    globalMemoryText: value("globalMemoryText", "").trim().slice(0, 4000),
    globalMemorySendMode: ["every", "session", "manual"].includes(value("globalMemorySendMode")) ? value("globalMemorySendMode") : "session",
    globalMemoryOocWrapper: checked("globalMemoryOocWrapper", true),
    globalMemoryShowChatButton: checked("globalMemoryShowChatButton", true),
    enableRpFormatRepair: checked("enableRpFormatRepair"),
    enableCharacterQolProfiles: checked("enableCharacterQolProfiles"),
    rpFormatRepairAuto: checked("rpFormatRepairAuto", true),
    rpFormatStyle: ["clean", "quoted"].includes(value("rpFormatStyle")) ? value("rpFormatStyle") : "clean",
    rpFormatDetection: ["conservative", "balanced", "aggressive"].includes(value("rpFormatDetection")) ? value("rpFormatDetection") : "balanced",
    rpFormatConvertBoldActions: checked("rpFormatConvertBoldActions", true),
    rpFormatRemoveActionParens: checked("rpFormatRemoveActionParens", true),
    rpFormatPreserveInlineEmphasis: checked("rpFormatPreserveInlineEmphasis", true),
    rpFormatPreserveSemanticQuotes: checked("rpFormatPreserveSemanticQuotes", true),
    rpFormatPreserveBackticks: checked("rpFormatPreserveBackticks", true),
    rpFormatShowMessageButtons: checked("rpFormatShowMessageButtons", true),
    enableChatBackgrounds: checked("enableChatBackgrounds"),
    chatBackgroundDim: Math.min(90, Math.max(0, Number(value("chatBackgroundDim", "45")) || 0)),
    chatBackgroundBlur: Math.min(30, Math.max(0, Number(value("chatBackgroundBlur", "0")) || 0)),
    chatBackgroundFit: ["cover", "contain", "tile"].includes(value("chatBackgroundFit", "cover")) ? value("chatBackgroundFit", "cover") : "cover",
    chatBackgroundPosition: ["center", "top", "bottom", "left", "right"].includes(value("chatBackgroundPosition", "center")) ? value("chatBackgroundPosition", "center") : "center",
    enableChatBubbleCustomization: checked("enableChatBubbleCustomization"),
    persistSpicyChatUserAppearance: checked("persistSpicyChatUserAppearance"),
    chatBubbleAiBackground: value("chatBubbleAiBackground", "#27282d"),
    chatBubbleAiTextMode: ["native", "custom"].includes(value("chatBubbleAiTextMode")) ? value("chatBubbleAiTextMode") : "custom",
    chatBubbleAiText: value("chatBubbleAiText", "#f2f2f2"),
    chatBubbleAiActionMode: ["native", "base", "custom"].includes(value("chatBubbleAiActionMode")) ? value("chatBubbleAiActionMode") : "native",
    chatBubbleAiActionText: value("chatBubbleAiActionText", "#79c8f5"),
    chatBubbleAiDialogueMode: ["native", "base", "custom"].includes(value("chatBubbleAiDialogueMode")) ? value("chatBubbleAiDialogueMode") : "base",
    chatBubbleAiDialogueText: value("chatBubbleAiDialogueText", "#f2f2f2"),
    chatBubbleAiBorder: value("chatBubbleAiBorder", "#555861"),
    chatBubbleAiBorderWidth: Math.min(12, Math.max(0, Number(value("chatBubbleAiBorderWidth", "0")) || 0)),
    chatBubbleAiBorderStyle: ["solid", "dashed", "dotted", "double"].includes(value("chatBubbleAiBorderStyle")) ? value("chatBubbleAiBorderStyle") : "solid",
    chatBubbleAiBorderOpacity: Math.min(100, Math.max(0, Number(value("chatBubbleAiBorderOpacity", "100")) || 0)),
    chatBubbleAiOpacity: Math.min(100, Math.max(30, Number(value("chatBubbleAiOpacity", "100")) || 100)),
    chatBubbleAiRadius: Math.min(40, Math.max(4, Number(value("chatBubbleAiRadius", "20")) || 20)),
    chatBubbleAiShape: ["native", "rounded", "square", "speech", "cat", "cloud"].includes(value("chatBubbleAiShape")) ? value("chatBubbleAiShape") : "native",
    chatBubbleAiDecorationMode: ["bubble", "custom"].includes(value("chatBubbleAiDecorationMode")) ? value("chatBubbleAiDecorationMode") : "bubble",
    chatBubbleAiDecorationColor: value("chatBubbleAiDecorationColor", "#27282d"),
    chatBubbleAiCatEarLayout: ["auto", "left", "right", "split"].includes(value("chatBubbleAiCatEarLayout")) ? value("chatBubbleAiCatEarLayout") : "auto",
    chatBubbleAiShadow: checked("chatBubbleAiShadow"),
    chatBubbleUserBackground: value("chatBubbleUserBackground", "#253f52"),
    chatBubbleUserTextMode: ["native", "custom"].includes(value("chatBubbleUserTextMode")) ? value("chatBubbleUserTextMode") : "custom",
    chatBubbleUserText: value("chatBubbleUserText", "#f5f5f5"),
    chatBubbleUserActionMode: ["native", "base", "custom"].includes(value("chatBubbleUserActionMode")) ? value("chatBubbleUserActionMode") : "native",
    chatBubbleUserActionText: value("chatBubbleUserActionText", "#79c8f5"),
    chatBubbleUserDialogueMode: ["native", "base", "custom"].includes(value("chatBubbleUserDialogueMode")) ? value("chatBubbleUserDialogueMode") : "base",
    chatBubbleUserDialogueText: value("chatBubbleUserDialogueText", "#f5f5f5"),
    chatBubbleUserBorder: value("chatBubbleUserBorder", "#52718a"),
    chatBubbleUserBorderWidth: Math.min(12, Math.max(0, Number(value("chatBubbleUserBorderWidth", "0")) || 0)),
    chatBubbleUserBorderStyle: ["solid", "dashed", "dotted", "double"].includes(value("chatBubbleUserBorderStyle")) ? value("chatBubbleUserBorderStyle") : "solid",
    chatBubbleUserBorderOpacity: Math.min(100, Math.max(0, Number(value("chatBubbleUserBorderOpacity", "100")) || 0)),
    chatBubbleUserOpacity: Math.min(100, Math.max(30, Number(value("chatBubbleUserOpacity", "100")) || 100)),
    chatBubbleUserRadius: Math.min(40, Math.max(4, Number(value("chatBubbleUserRadius", "20")) || 20)),
    chatBubbleUserShape: ["native", "rounded", "square", "speech", "cat", "cloud"].includes(value("chatBubbleUserShape")) ? value("chatBubbleUserShape") : "native",
    chatBubbleUserDecorationMode: ["bubble", "custom"].includes(value("chatBubbleUserDecorationMode")) ? value("chatBubbleUserDecorationMode") : "bubble",
    chatBubbleUserDecorationColor: value("chatBubbleUserDecorationColor", "#253f52"),
    chatBubbleUserCatEarLayout: ["auto", "left", "right", "split"].includes(value("chatBubbleUserCatEarLayout")) ? value("chatBubbleUserCatEarLayout") : "auto",
    chatBubbleUserShadow: checked("chatBubbleUserShadow"),
    chatBubblePreserveActionColors: value("chatBubbleAiActionMode", "native") !== "base" || value("chatBubbleUserActionMode", "native") !== "base",
    hideChatVoiceButton: checked("hideChatVoiceButton"),
    hideUnlockCustomVoices: checked("hideUnlockCustomVoices"),

    showMessageQuickActions: checked("showMessageQuickActions"),
    showChatSearch: checked("showChatSearch"),
    chatSearchShowPanel: checked("chatSearchShowPanel", true),
    chatSearchShowFindButton: checked("chatSearchShowFindButton"),
    chatSearchExactPhrase: checked("chatSearchExactPhrase"),
    chatSearchCaseSensitive: checked("chatSearchCaseSensitive"),
    chatSearchWholeWord: checked("chatSearchWholeWord"),
    chatSearchRegex: checked("chatSearchRegex"),
    chatSearchLoadUntilMatch: checked("chatSearchLoadUntilMatch"),
    enableMessageBookmarks: checked("enableMessageBookmarks"),
    messageBookmarkButtons: checked("messageBookmarkButtons", true),
    enableFocusMode: checked("enableFocusMode"),
    focusHideSidebar: checked("focusHideSidebar", true),
    focusHideTopBar: checked("focusHideTopBar", true),
    focusHideChatHeader: checked("focusHideChatHeader", true),
    focusHideQolPanel: checked("focusHideQolPanel", true),
    enableSavedTextSnippets: checked("enableSavedTextSnippets"),
    enableContextKeeper: checked("enableContextKeeper"),
    contextKeeperAutoCapture: checked("contextKeeperAutoCapture", true),
    contextKeeperAutoSensitivity: ["strict", "balanced", "broad"].includes(value("contextKeeperAutoSensitivity")) ? value("contextKeeperAutoSensitivity") : "balanced",
    contextKeeperAutoEveryMessages: Math.max(1, Math.min(20, Number(value("contextKeeperAutoEveryMessages", "4")) || 4)),
    contextKeeperAutoMaxDetails: Math.max(20, Math.min(300, Number(value("contextKeeperAutoMaxDetails", "120")) || 120)),
    contextKeeperMessageButtons: checked("contextKeeperMessageButtons"),
    enableSelectionRemember: checked("enableSelectionRemember"),
    contextKeeperRecapSize: ["compact", "balanced", "full"].includes(value("contextKeeperRecapSize")) ? value("contextKeeperRecapSize") : "balanced",
    enableStoryDayTracker: checked("enableStoryDayTracker"),
    storyDayTrackerMode: ["manual", "conservative", "assisted"].includes(value("storyDayTrackerMode")) ? value("storyDayTrackerMode") : "conservative",
    storyDayTrackerIncludeInContext: checked("storyDayTrackerIncludeInContext", true),
    storyDayTrackerShowQuickPanel: checked("storyDayTrackerShowQuickPanel", true),
    enableRpStateTracker: checked("enableRpStateTracker"),
    rpStateTrackerMode: ["manual", "conservative", "assisted"].includes(value("rpStateTrackerMode")) ? value("rpStateTrackerMode") : "conservative",
    rpStateInjectMode: ["manual", "changed", "every"].includes(value("rpStateInjectMode")) ? value("rpStateInjectMode") : "changed",
    rpStateMaxContextChars: Math.max(300, Math.min(3000, Number(value("rpStateMaxContextChars", "1200")) || 1200)),
    rpStateShowQuickPanel: checked("rpStateShowQuickPanel", true),
    enableChatNudges: checked("enableChatNudges"),
    chatNudgeDefaultHours: [5, 8, 24, 48, 168].includes(Number(value("chatNudgeDefaultHours", "24"))) ? Number(value("chatNudgeDefaultHours", "24")) : 24,
    chatNudgeBrowserNotifications: checked("chatNudgeBrowserNotifications", true),
    enableSoundscapes: checked("enableSoundscapes"),
    soundscapeShowChatControl: checked("soundscapeShowChatControl", true),
    soundscapeMasterVolume: Number.isFinite(Number(value("soundscapeMasterVolume", "65"))) ? Math.min(100, Math.max(0, Number(value("soundscapeMasterVolume", "65")))) : 65,
    soundscapeOnChat: checked("soundscapeOnChat", true),
    soundscapeOnHome: checked("soundscapeOnHome"),
    soundscapeOnChats: checked("soundscapeOnChats"),
    soundscapeOnProfiles: checked("soundscapeOnProfiles"),
    soundscapeOnOther: checked("soundscapeOnOther"),
    messageQuickActionCopy: checked("messageQuickActionCopy"),
    messageQuickActionEdit: checked("messageQuickActionEdit"),
    messageQuickActionRemoveImage: checked("messageQuickActionRemoveImage"),
    messageQuickActionResend: checked("messageQuickActionResend"),
    messageQuickActionConfirmRemoveImage: checked("messageQuickActionConfirmRemoveImage"),
    messageQuickActionReport: checked("messageQuickActionReport"),
    allowTypingWhileAiResponding: checked("allowTypingWhileAiResponding"),
    keepChatPositionWhileTyping: checked("keepChatPositionWhileTyping"),
    showScrollToTopButton: checked("showScrollToTopButton"),
    showScrollToBottomButton: checked("showScrollToBottomButton"),
    scrollNavOnHome: checked("scrollNavOnHome", true),
    scrollNavOnChats: checked("scrollNavOnChats", true),
    scrollNavOnChat: checked("scrollNavOnChat", true),
    scrollNavOnCreation: checked("scrollNavOnCreation", true),
    scrollNavOnProfiles: checked("scrollNavOnProfiles", true),
    scrollNavOnOther: checked("scrollNavOnOther", true),
    scrollTopLoadPreviousMessages: checked("scrollTopLoadPreviousMessages"),
    scrollTopLoadPreviousMode: ["one", "all"].includes(value("scrollTopLoadPreviousMode")) ? value("scrollTopLoadPreviousMode") : "all",
    scrollTopLoadPreviousTiming: ["before", "background"].includes(value("scrollTopLoadPreviousTiming")) ? value("scrollTopLoadPreviousTiming") : "before",
    botArchiveRememberSeenPublic: checked("botArchiveRememberSeenPublic"),
    botBackupToolsEnabled: checked("botBackupToolsEnabled"),
    botArchiveOwnEditorBackups: checked("botArchiveOwnEditorBackups"),
    lorebookBackupToolsEnabled: checked("lorebookBackupToolsEnabled"),
    lorebookBackupsEnabled: checked("lorebookBackupsEnabled"),
    botArchiveOwnRevisionLimit: Math.max(1, Math.min(50, Number(value("botArchiveOwnRevisionLimit", "10")) || 10)),
    botArchiveOnProfileVisit: checked("botArchiveOnProfileVisit"),
    botArchiveOnChatOpen: checked("botArchiveOnChatOpen"),
    botArchiveRefreshHours: [6, 24, 72, 168].includes(Number(value("botArchiveRefreshHours"))) ? Number(value("botArchiveRefreshHours")) : 24,
    protectDraftDuringMessageRemoval: checked("protectDraftDuringMessageRemoval"),
    failedMessageHelper: checked("failedMessageHelper"),
    chatPerformanceMode: checked("chatPerformanceMode"),
    runtimePerformanceMode: ["normal", "adaptive", "aggressive", "maximum"].includes(value("runtimePerformanceMode")) ? value("runtimePerformanceMode") : "adaptive",
    desktopAppPerformanceGuard: checked("desktopAppPerformanceGuard", true),
    pauseQolInHiddenTabs: checked("pauseQolInHiddenTabs"),
    autoPerformanceLargeChats: checked("autoPerformanceLargeChats"),
    largeChatPerformanceThreshold: Math.max(100, Math.min(5000, Number(value("largeChatPerformanceThreshold", "500")) || 500)),
    deferQolWhileTyping: checked("deferQolWhileTyping"),
    pauseQolWhileMessageEditing: checked("pauseQolWhileMessageEditing", true),
    reduceQolAnimations: checked("reduceQolAnimations"),
    reduceOptionsAnimations: checked("reduceOptionsAnimations"),
    settingsNavigationStyle: ["classic", "grouped"].includes(value("settingsNavigationStyle")) ? value("settingsNavigationStyle") : "classic",
    settingsContentLayout: ["single", "adaptive"].includes(value("settingsContentLayout")) ? value("settingsContentLayout") : "single",
    settingsPageWidth: ["comfortable", "wide"].includes(value("settingsPageWidth")) ? value("settingsPageWidth") : "comfortable",
    collapseSettingsSectionsByDefault: checked("collapseSettingsSectionsByDefault"),
    enableCommandPalette: checked("enableCommandPalette", false),
    commandPaletteShortcut: ["ctrl-k", "ctrl-shift-k", "alt-k", "off"].includes(value("commandPaletteShortcut")) ? value("commandPaletteShortcut") : "ctrl-k",
    commandPaletteShowSavedItems: checked("commandPaletteShowSavedItems", true),
    deepSleepDisabledFeatures: checked("deepSleepDisabledFeatures", true),
    performanceDiagnostics: checked("performanceDiagnostics"),
    enableLocalChangeHistory: checked("enableLocalChangeHistory"),
    showUpdateNotifications: checked("showUpdateNotifications", false),

    androidAppControlsMode: ["auto", "android", "always", "off"].includes(value("androidAppControlsMode")) ? value("androidAppControlsMode") : "auto",
    androidTopBarMenu: checked("androidTopBarMenu"),
    androidHideComposerShortcuts: checked("androidHideComposerShortcuts", true),
    androidTopBarOoc: checked("androidTopBarOoc", true),
    androidTopBarAsterisk: checked("androidTopBarAsterisk", true),
    androidTopBarFormatting: checked("androidTopBarFormatting", true),
    androidTopBarTranslation: checked("androidTopBarTranslation"),
    androidTopBarScroll: checked("androidTopBarScroll", true),
    androidTopBarPersona: checked("androidTopBarPersona", true),
    androidTopBarModel: checked("androidTopBarModel", true),

    showChatExportButton: checked("showChatExportButton"),
    chatExportLoadPreviousMessages: checked("chatExportLoadPreviousMessages"),
    chatExportIncludeBotInfo: checked("chatExportIncludeBotInfo"),
    chatExportIncludeOocDirectives: checked("chatExportIncludeOocDirectives"),
    chatExportIncludeGenerationDetails: checked("chatExportIncludeGenerationDetails"),
    chatExportNumberMessages: checked("chatExportNumberMessages"),
    chatExportIncludeAvatars: checked("chatExportIncludeAvatars"),
    chatExportDefaultFormat: value("chatExportDefaultFormat", "text"),
    chatExportHtmlLayout: value("chatExportHtmlLayout", "bubbles"),
    showOocTools: checked("showOocTools"),
    oocTemplates,

    savePersonasFromPages: checked("savePersonasFromPages"),
    keepLocalPersonaCopies: checked("keepLocalPersonaCopies"),
    expandPersonaDescriptions: checked("expandPersonaDescriptions"),
    enablePersonaOrganizer: checked("enablePersonaOrganizer"),
    personaFolders: value("personaFolders", ""),
    personaShowLocalMetaInPicker: checked("personaShowLocalMetaInPicker"),
    showPersonaQuickSwitch: checked("showPersonaQuickSwitch"),
    autoAcceptPersonaChange: checked("autoAcceptPersonaChange"),
    personaQuickSwitchLimit: Math.max(1, Math.min(12, Number(value("personaQuickSwitchLimit", "6")) || 6)),

    hideSidebarLogo: checked("hideSidebarLogo"),
    hideSidebarHome: checked("hideSidebarHome"),
    hideSidebarChats: checked("hideSidebarChats"),
    hideSidebarPersonas: checked("hideSidebarPersonas"),
    hideSidebarCreateMenu: checked("hideSidebarCreateMenu"),
    hideSidebarCreateChatbot: checked("hideSidebarCreateChatbot"),
    hideSidebarCreateLorebook: checked("hideSidebarCreateLorebook"),
    hideSidebarCreateGroup: checked("hideSidebarCreateGroup"),
    hideSidebarCreateVoice: checked("hideSidebarCreateVoice"),
    hideSidebarMyCreationsMenu: checked("hideSidebarMyCreationsMenu"),
    hideSidebarMyChatbots: checked("hideSidebarMyChatbots"),
    hideSidebarMyLorebooks: checked("hideSidebarMyLorebooks"),
    hideSidebarMyGroups: checked("hideSidebarMyGroups"),
    hideSidebarMyVoices: checked("hideSidebarMyVoices"),
    hideSidebarFavorites: checked("hideSidebarFavorites"),
    hideSidebarRecommendations: checked("hideSidebarRecommendations"),
    hideSidebarLeaderboard: checked("hideSidebarLeaderboard"),
    hideSidebarBlockedCreators: checked("hideSidebarBlockedCreators"),
    hideSidebarSubscribe: checked("hideSidebarSubscribe"),
    hideSidebarHelp: checked("hideSidebarHelp"),
    // Legacy all-social flag is cleared once the individual choices are saved.
    hideSidebarSocialLinks: false,
    hideSidebarSocialDiscord: checked("hideSidebarSocialDiscord"),
    hideSidebarSocialX: checked("hideSidebarSocialX"),
    hideSidebarSocialReddit: checked("hideSidebarSocialReddit"),
    // Legacy all-footer flag is cleared once the per-link settings are saved.
    hideSidebarFooterLinks: false,
    hideSidebarFooterTerms: checked("hideSidebarFooterTerms"),
    hideSidebarFooterPrivacy: checked("hideSidebarFooterPrivacy"),
    hideSidebarFooterRefunds: checked("hideSidebarFooterRefunds"),
    hideSidebarFooterReporting: checked("hideSidebarFooterReporting"),
    hideSidebarFooterGuidelines: checked("hideSidebarFooterGuidelines"),
    hideSidebarFooterSupport: checked("hideSidebarFooterSupport"),
    hideSidebarFooterAffiliates: checked("hideSidebarFooterAffiliates"),

    hideSidebarAppDownload: false,
    hideSidebarAppDownloadGooglePlay: checked("hideSidebarAppDownloadGooglePlay"),
    hideSidebarAppDownloadAppStore: checked("hideSidebarAppDownloadAppStore"),
    hideSidebarAppDownloadGeneric: checked("hideSidebarAppDownloadGeneric"),
    hideSidebarWebVersion: checked("hideSidebarWebVersion"),
    hideSidebarSignOut: checked("hideSidebarSignOut"),
    enableMainFooterManagement: checked("enableMainFooterManagement"),
    hideMainFooterEntirely: checked("hideMainFooterEntirely"),
    hideMainFooterCompany: checked("hideMainFooterCompany"),
    hideMainFooterResources: checked("hideMainFooterResources"),
    hideMainFooterCommunity: checked("hideMainFooterCommunity"),
    hideMainFooterJoinUs: checked("hideMainFooterJoinUs"),
    hideMainFooterAppDownload: checked("hideMainFooterAppDownload"),
    hideMainFooter2257: checked("hideMainFooter2257"),

    blockCards: checked("blockCards"),
    hideHomeForYouCards: checked("hideHomeForYouCards"),
    expandLongCardDescriptions: checked("expandLongCardDescriptions"),
    showCardGreetingTokenInfo: checked("showCardGreetingTokenInfo"),
    showExactMessageCounts: checked("showExactMessageCounts"),
    showBotCreationDates: checked("showBotCreationDates"),
    cardTokenShowGreeting: checked("cardTokenShowGreeting", true),
    cardTokenShowDescription: false,
    cardTokenShowPersonality: checked("cardTokenShowPersonality"),
    cardTokenShowScenario: checked("cardTokenShowScenario"),
    cardTokenShowExamples: checked("cardTokenShowExamples"),
    cardTokenShowCombined: false,
    hideGroupChats: checked("hideGroupChats"),
    showLorebookFilters: checked("showLorebookFilters"),
    enableSmartFilterPresets: checked("enableSmartFilterPresets"),
    enableCreationAudit: checked("enableCreationAudit"),
    creationAuditQuickStatus: checked("creationAuditQuickStatus"),
    enableCreatorWritingAssistant: checked("enableCreatorWritingAssistant"),
    creatorWritingUseBrowserAi: checked("creatorWritingUseBrowserAi"),
    creatorWritingDictionary: value("creatorWritingDictionary"),
    creatorWritingTargetLanguage: value("creatorWritingTargetLanguage", "English"),
    enableProfileExport: checked("enableProfileExport"),
    enableMyCreationsFilters: checked("enableMyCreationsFilters"),
    rememberMyCreationsView: checked("rememberMyCreationsView"),
    autoLoadMyCreations: checked("autoLoadMyCreations"),
    myCreationsAutoLoadPages: Math.max(1, Math.min(30, Number(value("myCreationsAutoLoadPages", "1")) || 1)),
    enableRecommendationHelpers: checked("enableRecommendationHelpers"),
    recommendationHideLaterBots: checked("recommendationHideLaterBots"),
    recommendationHideNotInterested: checked("recommendationHideNotInterested"),
    recommendationPreferFavoriteCreators: checked("recommendationPreferFavoriteCreators"),
    recommendationPreferredTags: value("recommendationPreferredTags"),
    recommendationAvoidTags: value("recommendationAvoidTags"),
    recommendationShowReasonBadges: checked("recommendationShowReasonBadges"),
    recommendationHideFavoriteBots: checked("recommendationHideFavoriteBots"),
    recommendationHideOwnBots: checked("recommendationHideOwnBots"),
    recommendationOnlyUnopened: checked("recommendationOnlyUnopened"),
    recommendationOnlyLorebook: checked("recommendationOnlyLorebook"),
    recommendationSessionHideButtons: checked("recommendationSessionHideButtons"),
    recommendationRandomButton: checked("recommendationRandomButton"),
    cardDensityMode: ["normal", "compact", "dense"].includes(value("cardDensityMode")) ? value("cardDensityMode") : "normal",
    cardClickBehavior: ["default", "profile"].includes(value("cardClickBehavior")) ? value("cardClickBehavior") : "default",
    showCopyBotInfoButtons: checked("showCopyBotInfoButtons"),
    trackRecentlySeenBots: checked("trackRecentlySeenBots"),
    showRecentlySeenButton: checked("showRecentlySeenButton"),
    recentlySeenLimit: Math.max(10, Math.min(250, Number(value("recentlySeenLimit", "100")) || 100)),
    enableBotComparison: checked("enableBotComparison"),
    showQuickNotInterestedButtons: checked("showQuickNotInterestedButtons"),
    showQuickUnblockButtons: checked("showQuickUnblockButtons"),
    reduceAnimatedBotImages: checked("reduceAnimatedBotImages"),
    animatedImageMode: ["freeze", "once", "hover"].includes(value("animatedImageMode")) ? value("animatedImageMode") : "freeze",
    animatedImagesListings: checked("animatedImagesListings"),
    animatedImagesChats: checked("animatedImagesChats"),
    animatedImagesProfiles: checked("animatedImagesProfiles"),
    animatedImagesChatMedia: checked("animatedImagesChatMedia"),
    replaceCardProfileWithBlockButton: checked("replaceCardProfileWithBlockButton"),
    showBlockButtonOnMyCreations: checked("showBlockButtonOnMyCreations"),
    enableBulkCardBlocking: checked("enableBulkCardBlocking"),
    bulkCardBlockingSidebarLauncher: checked("bulkCardBlockingSidebarLauncher"),
    quickDislikeOnBlock: false,
    quickDislikeIdleEnabled: checked("quickDislikeOnBlock"),
    quickDislikeIdleMinutes: Math.min(60, Math.max(1, Number(value("quickDislikeIdleMinutes", "5")) || 5)),
    blockedBulkDislikeDelayMs: Math.min(10000, Math.max(250, Number(value("blockedBulkDislikeDelayMs", "750")) || 750)),
    enableLanguageFilter: checked("enableLanguageFilter"),
    allowedLanguages: getAllowedLanguages(),
    languageSelectionMode: ["include", "exclude"].includes(value("languageSelectionMode")) ? value("languageSelectionMode") : "include",
    languageFilterMode: "conservative",
    languageAutoDetectUntagged: checked("languageAutoDetectUntagged"),
    languageShowDetectedBadge: checked("languageShowDetectedBadge"),
    ...readTextNormalizationSettingsFromPage(),
    blockedTags: linesToArray(value("blockedTags")),
    blockedWords: linesToArray(value("blockedWords")),
    blockedCreators: linesToArray(value("blockedCreators")),
    blockedBotIds: uniqueClean(blockingDataLoaded ? blockedState.ids : (loadedSettingsSnapshot.blockedBotIds || [])),
    blockedBotNames: uniqueClean(blockingDataLoaded ? blockedState.names : (loadedSettingsSnapshot.blockedBotNames || [])),
    blockedBotSortMode: getBotSortMode("blocked"),
    hiddenCardMode: value("hiddenCardMode", "hide"),

    autoLoadAllOpenedChats: false,
    deepImportMaxPages: 80,
    showBlockCurrentBotButton: false,
    enablePersonalUsageSummary: checked("enablePersonalUsageSummary"),
    debug: checked("debug")
  };
}


function hexRgb(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value || "").trim());
  if (!match) return null;
  const hex = match[1];
  return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
}

function relativeLuminance(rgb) {
  if (!rgb) return 0;
  const values = rgb.map(channel => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrastRatio(bg, fg) {
  const a = relativeLuminance(hexRgb(bg));
  const b = relativeLuminance(hexRgb(fg));
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  return (high + 0.05) / (low + 0.05);
}

function updateBubbleContrastWarnings() {
  ["Ai", "User"].forEach(kind => {
    const warning = $(`chatBubble${kind}Contrast`);
    if (!warning) return;
    if (value(`chatBubble${kind}TextMode`, "custom") === "native") {
      warning.textContent = "Using SpicyChat's default normal text color.";
      warning.dataset.state = "ok";
      return;
    }
    const ratio = contrastRatio(value(`chatBubble${kind}Background`), value(`chatBubble${kind}Text`));
    if (!Number.isFinite(ratio)) {
      warning.textContent = "";
      return;
    }
    warning.textContent = ratio < 4.5
      ? `Low contrast (${ratio.toFixed(1)}:1) — text may be hard to read.`
      : `Contrast ${ratio.toFixed(1)}:1`;
    warning.dataset.state = ratio < 4.5 ? "warning" : "ok";
  });
}

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

function applyBubblePreset(name) {
  const basePreset = CHAT_BUBBLE_PRESETS[name];
  if (!basePreset) return;
  const preset = { ...CHAT_BUBBLE_TEXT_DEFAULTS, ...basePreset };
  preset.chatBubbleAiDialogueText = basePreset.chatBubbleAiText || preset.chatBubbleAiDialogueText;
  preset.chatBubbleUserDialogueText = basePreset.chatBubbleUserText || preset.chatBubbleUserDialogueText;
  preset.chatBubbleAiDecorationColor = basePreset.chatBubbleAiBackground || preset.chatBubbleAiDecorationColor;
  preset.chatBubbleUserDecorationColor = basePreset.chatBubbleUserBackground || preset.chatBubbleUserDecorationColor;
  Object.entries(preset).forEach(([key, val]) => {
    const element = $(key);
    if (!element) return;
    if (element.type === "checkbox") element.checked = !!val;
    else element.value = String(val);
  });
  if (name === "default") {
    const enabled = $("enableChatBubbleCustomization");
    if (enabled) enabled.checked = false;
  }
  updateAppearanceColorControlStates();
  showSettingsToast(name === "default"
    ? "SpicyChat bubble styling restored. Press Save settings to apply it."
    : `Chat bubble preset: ${name}. Press Save settings to apply it.`);
}

async function save() {
  await flushSoundscapeSceneState();
  const settings = readSettingsFromPage();
  creatorBotWebhookState = normalizeCreatorBotWebhookConfig({
    enabled: checked("creatorBotDiscordWebhookEnabled"),
    url: value("creatorBotDiscordWebhookUrl", "")
  });
  const payload = {
    settings,
    [OOC_TEMPLATES_KEY]: settings.oocTemplates,
    [CREATOR_BOT_WEBHOOK_KEY]: creatorBotWebhookState
  };

  // Large saved lists can contain thousands of entries. Older builds rewrote
  // every list and metadata map on every Settings save, even when the user
  // only changed one checkbox. Only write managers that were actually edited.
  if (dirtySavedStores.has("blocked")) payload[BLOCKED_BOTS_KEY] = blockedState;
  if (dirtySavedStores.has("notInterested")) payload[NOT_INTERESTED_KEY] = notInterestedState;
  if (dirtySavedStores.has("favoriteCreators")) payload[FAVORITE_CREATORS_KEY] = normalizeCreatorStore(favoriteCreatorState);
  if (dirtySavedStores.has("followedCreators")) payload[FOLLOWED_CREATORS_KEY] = normalizeCreatorStore(followedCreatorState);
  if (dirtySavedStores.has("favorite")) payload[FAVORITE_BOTS_KEY] = normalizeBotStore(favoriteBotState);
  if (dirtySavedStores.has("later")) payload[LATER_BOTS_KEY] = normalizeBotStore(laterBotState);
  if (dirtySavedStores.has("organizer")) payload[BOT_ORGANIZER_KEY] = normalizeBotOrganization(botOrganizationState);
  if (dirtySavedStores.has("opened")) {
    payload[OPENED_KEY] = uniqueClean(currentOpened);
    payload[OPENED_META_KEY] = normalizeMetaStore(openedChatMetaState);
  }

  const status = $("status");
  if (status) status.textContent = "Saving...";

  await storageSet(payload);
  dirtySavedStores.clear();

  if (status) {
    status.textContent = "Saved.";
    setTimeout(() => { status.textContent = ""; }, 1200);
  }
}

async function clearOpened() {
  const current = await storageGet([OPENED_KEY, OPENED_META_KEY]);
  const opened = Array.isArray(current[OPENED_KEY]) ? current[OPENED_KEY] : [];
  if (!opened.length) {
    showSettingsToast("There is no opened-history data to clear.");
    return;
  }
  if (!confirm(`Clear ${opened.length} opened chat${opened.length === 1 ? "" : "s"}? You can undo it for a few seconds.`)) return;

  const backup = {
    [OPENED_KEY]: [...opened],
    [OPENED_META_KEY]: normalizeMetaStore(current[OPENED_META_KEY])
  };
  await storageSet({ [OPENED_KEY]: [], [OPENED_META_KEY]: {} });
  await load();
  showSettingsToast(`Cleared ${opened.length} opened chat${opened.length === 1 ? "" : "s"}.`, async () => {
    await storageSet(backup);
    await load();
  });
}

function normalizeSmartFilterPresets(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((item, index) => {
    const name = String(item?.name || "").replace(/\s+/g, " ").trim();
    if (!name) return null;
    let id = String(item?.id || `preset-${index}`).trim();
    if (id.startsWith("builtin:")) id = `preset-${id.slice(8) || index}`;
    if (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    const filters = item?.filters && typeof item.filters === "object" ? item.filters : {};
    const opened = ["any", "opened", "unopened"].includes(filters.opened)
      ? filters.opened
      : (filters.unopened === true ? "unopened" : "any");
    const followed = ["any", "followed", "not-followed"].includes(filters.followed)
      ? filters.followed
      : (filters.followed === true ? "followed" : "any");
    const favorites = ["any", "favorites", "not-favorites"].includes(filters.favorites)
      ? filters.favorites
      : (filters.favorites === true ? "favorites" : "any");
    const later = ["any", "later", "not-later"].includes(filters.later)
      ? filters.later
      : (filters.later === true ? "later" : "any");
    return {
      id,
      name,
      filters: {
        lorebook: ["any", "has", "none"].includes(filters.lorebook) ? filters.lorebook : "any",
        opened,
        followed,
        favorites,
        later
      }
    };
  }).filter(Boolean);
}

function mergeSmartFilterPresets(current, incoming) {
  const byName = new Map(normalizeSmartFilterPresets(current).map(item => [item.name.toLowerCase(), item]));
  for (const item of normalizeSmartFilterPresets(incoming)) byName.set(item.name.toLowerCase(), item);
  return [...byName.values()];
}

function normalizeSmartFilterPins(value, presetSource = null) {
  const valid = new Set([
    "builtin:fresh-finds", "builtin:already-opened", "builtin:followed-fresh", "builtin:favorites",
    "builtin:later", "builtin:favorite-lorebooks", "builtin:unfollowed-fresh", "builtin:unsaved-fresh",
    "builtin:lorebooks-only", "builtin:unopened-lorebooks", "builtin:followed-creators", "builtin:favorite-unopened",
    ...normalizeSmartFilterPresets(presetSource).map(item => item.id)
  ]);
  return uniqueClean(Array.isArray(value) ? value : []).filter(id => valid.has(id)).slice(0, 3);
}

function normalizeBotEditorDraftHistory(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const entries = source.entries && typeof source.entries === "object" && !Array.isArray(source.entries) ? source.entries : {};
  const output = {};
  for (const [key, rawList] of Object.entries(entries)) {
    const cleanKey = String(key || "").trim();
    if (!cleanKey || !Array.isArray(rawList)) continue;
    const list = rawList.map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const rawFields = item.fields && typeof item.fields === "object" && !Array.isArray(item.fields) ? item.fields : {};
      const fields = {};
      for (const [field, rawValue] of Object.entries(rawFields)) {
        const cleanField = String(field || "").trim();
        if (!cleanField) continue;
        fields[cleanField] = String(rawValue ?? "");
      }
      if (!Object.keys(fields).length) return null;
      return {
        id: String(item.id || `snap-${Number(item.savedAt) || index}`).trim(),
        savedAt: Number(item.savedAt) || 0,
        reason: String(item.reason || "Snapshot").replace(/\s+/g, " ").trim().slice(0, 80),
        botName: String(item.botName || "").replace(/\s+/g, " ").trim().slice(0, 160),
        fields
      };
    }).filter(Boolean).sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).slice(0, 20);
    if (list.length) output[cleanKey] = list;
  }
  return { entries: output };
}

function mergeBotEditorDraftHistory(current, incoming) {
  const left = normalizeBotEditorDraftHistory(current);
  const right = normalizeBotEditorDraftHistory(incoming);
  const entries = { ...left.entries };
  for (const [key, list] of Object.entries(right.entries)) {
    const merged = [...(entries[key] || []), ...list];
    const byId = new Map();
    for (const item of merged) {
      const id = String(item.id || `${item.savedAt}`).trim();
      if (!id) continue;
      const previous = byId.get(id);
      if (!previous || Number(item.savedAt || 0) >= Number(previous.savedAt || 0)) byId.set(id, item);
    }
    entries[key] = [...byId.values()].sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).slice(0, 20);
  }
  return { entries };
}

function selectedExportScopes() {
  return new Set([...document.querySelectorAll("[data-export-scope]")]
    .filter(input => input.checked)
    .map(input => String(input.dataset.exportScope || "").trim())
    .filter(Boolean));
}

function buildExportPayload(scopes, result) {
  const selected = scopes instanceof Set ? scopes : new Set(scopes || []);
  const has = key => selected.has(key);
  const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  const payload = {
    _qolBackup: {
      formatVersion: BACKUP_FORMAT_VERSION,
      extensionVersion: chrome.runtime.getManifest()?.version || "",
      exportedAt: new Date().toISOString()
    }
  };

  const selectedSettingScopes = new Set([...selected].filter(isSettingsBackupScope));
  if (has("settings")) {
    payload.settings = settings;
    payload._qolBackup.settingsScopes = ["settings"];
  } else if (selectedSettingScopes.size) {
    payload.settings = settingsSubsetForScopes(settings, selectedSettingScopes);
    payload._qolBackup.settingsScopes = [...selectedSettingScopes];
  }
  if (has("opened")) {
    payload.openedChats = Array.isArray(result[OPENED_KEY]) ? result[OPENED_KEY] : [];
    payload.openedChatMeta = result[OPENED_META_KEY] || {};
  }
  if (has("blocked")) {
    payload.blockedBots = result[BLOCKED_BOTS_KEY] || { ids: [], names: [], meta: {} };
    payload.quickDislikeHistory = normalizeQuickDislikeHistory(result[QUICK_DISLIKE_HISTORY_KEY]);
    payload.quickDislikeBulkState = normalizeQuickDislikeBulkState(result[QUICK_DISLIKE_BULK_STATE_KEY]);
  }
  if (has("notInterested")) payload.notInterestedBots = result[NOT_INTERESTED_KEY] || { ids: [], meta: {} };
  if (has("favoriteCreators")) payload.favoriteCreators = result[FAVORITE_CREATORS_KEY] || { handles: [], meta: {} };
  if (has("followedCreators")) payload.followedCreators = result[FOLLOWED_CREATORS_KEY] || { handles: [], meta: {} };
  if (has("creatorBotWatch")) payload.creatorBotWatch = normalizeCreatorBotWatchState(result[CREATOR_BOT_WATCH_KEY]);
  if (has("favoriteBots")) payload.favoriteBots = result[FAVORITE_BOTS_KEY] || { ids: [], meta: {} };
  if (has("laterBots")) payload.laterBots = result[LATER_BOTS_KEY] || { ids: [], meta: {} };
  if (has("botOrganization")) payload.botOrganization = result[BOT_ORGANIZER_KEY] || { meta: {} };
  if (has("chatOrganization")) payload.chatOrganization = normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]);
  if (has("characterQolProfiles")) payload.characterQolProfiles = normalizeCharacterQolProfiles(result[CHARACTER_QOL_PROFILES_KEY]);
  if (has("botAvailability")) payload.botAvailability = normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]);
  if (has("botArchive")) payload.botArchive = normalizeBotArchive(result[BOT_ARCHIVE_KEY]);
  if (has("lorebookBackups")) payload.lorebookBackups = normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]);
  if (has("chatbotLorebookLinks")) payload.chatbotLorebookLinks = result[CHATBOT_LOREBOOK_LINKS_KEY] && typeof result[CHATBOT_LOREBOOK_LINKS_KEY] === "object" ? result[CHATBOT_LOREBOOK_LINKS_KEY] : {};
  if (has("savedTextSnippets")) payload.savedTextSnippets = Array.isArray(result[SAVED_TEXT_SNIPPETS_KEY]) ? result[SAVED_TEXT_SNIPPETS_KEY] : [];
  if (has("contextKeeperData")) payload.contextKeeperData = result[CONTEXT_KEEPER_DATA_KEY] && typeof result[CONTEXT_KEEPER_DATA_KEY] === "object" ? result[CONTEXT_KEEPER_DATA_KEY] : {};
  if (has("storyDayTrackerData")) payload.storyDayTrackerData = result[STORY_DAY_TRACKER_KEY] && typeof result[STORY_DAY_TRACKER_KEY] === "object" ? result[STORY_DAY_TRACKER_KEY] : {};
  if (has("rpStateTrackerData")) payload.rpStateTrackerData = result[RP_STATE_TRACKER_KEY] && typeof result[RP_STATE_TRACKER_KEY] === "object" ? result[RP_STATE_TRACKER_KEY] : {};
  if (has("chatNudges")) payload.chatNudges = normalizeChatNudgeStore(result[CHAT_NUDGE_STORE_KEY]);
  if (has("personas")) {
    payload.personas = Array.isArray(result[PERSONAS_KEY])
      ? result[PERSONAS_KEY]
      : (Array.isArray(result[LEGACY_PERSONAS_KEY]) ? result[LEGACY_PERSONAS_KEY] : []);
  }
  if (has("personaOrganization")) {
    payload.personaOrganization = result[PERSONA_ORG_KEY] && typeof result[PERSONA_ORG_KEY] === "object"
      ? result[PERSONA_ORG_KEY]
      : { meta: {} };
  }
  if (has("ooc")) payload.oocTemplates = normalizeOocTemplates(result[OOC_TEMPLATES_KEY] || settings.oocTemplates);
  if (has("generationProfiles")) payload.generationProfiles = normalizeGenerationProfiles(result[GENERATION_PROFILES_KEY]);
  if (has("smartFilterPresets")) payload.smartFilterPresets = normalizeSmartFilterPresets(result[SMART_FILTER_PRESETS_KEY]);
  if (has("smartFilterPins")) payload.smartFilterPinnedPresets = normalizeSmartFilterPins(result[SMART_FILTER_PINNED_KEY], result[SMART_FILTER_PRESETS_KEY]);
  if (has("botEditorDraftHistory")) payload.botEditorDraftHistory = normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]);
  if (has("chatBookmarks")) payload.chatBookmarks = result[CHAT_BOOKMARKS_KEY] && typeof result[CHAT_BOOKMARKS_KEY] === "object" ? result[CHAT_BOOKMARKS_KEY] : {};
  if (has("recentlySeenBots")) payload.recentlySeenBots = result[RECENTLY_SEEN_BOTS_KEY] && typeof result[RECENTLY_SEEN_BOTS_KEY] === "object" ? result[RECENTLY_SEEN_BOTS_KEY] : { entries: [] };
  if (has("soundscapes")) payload.soundscapes = normalizeSoundscapeScenes(result[SOUNDSCAPES_KEY]);
  if (has("tabCleanupSessions")) payload.tabCleanupSessions = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  if (has("tabCleanupTopics")) payload.tabCleanupTopics = normalizeTabCleanupTopics(result[TAB_CLEANUP_TOPICS_KEY]);
  if (has("tabCleanupEnrichment")) payload.tabCleanupEnrichment = result[TAB_CLEANUP_ENRICHMENT_KEY] && typeof result[TAB_CLEANUP_ENRICHMENT_KEY] === "object" ? result[TAB_CLEANUP_ENRICHMENT_KEY] : { meta: {} };
  if (has("localChangeHistory")) payload.localChangeHistory = Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY] : [];
  if (has("localMedia")) {
    payload.localMedia = {
      soundscapeAudio: normalizeSoundscapeAudio(result[SOUNDSCAPE_AUDIO_KEY]),
      chatBackgroundMedia: normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY])
    };
  }

  return payload;
}

function backupFilename(ext = "json") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
  return `spicychat-qol-backup-${stamp}.${String(ext || "json").replace(/^\./, "")}`;
}

async function ensureBackupTextInBox() {
  // Download buttons are export actions, so always rebuild the box from the
  // currently selected export scopes instead of accidentally downloading a
  // stale/pasted import payload.
  await exportSettings();
  return value("settingsJson").trim();
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function tryNativeBackupSave(text, filename, mimeType) {
  try {
    if (typeof window._dsRequestExport === "function") {
      window._dsRequestExport(text, filename);
      return true;
    }
  } catch {}
  const bridge = window.flutter_inappwebview;
  if (!bridge?.callHandler) return false;
  try {
    // v0.0.8 already exposes the same exportChat handler used by the injected
    // chat exporter. It is text/filename based, so it also works for backups.
    await bridge.callHandler("exportChat", JSON.stringify({ text, filename }));
    return true;
  } catch {}
  try {
    // Newer wrappers may expose the more generic saveFile handler instead.
    await bridge.callHandler("saveFile", JSON.stringify({
      text,
      content: text,
      filename,
      fileName: filename,
      mimeType,
      base64: utf8ToBase64(text)
    }));
    return true;
  } catch {}
  return false;
}

function decodeNativePickedFile(result) {
  if (result == null || result === false) return null;
  if (Array.isArray(result)) {
    if (!result.length) return null;
    if (result.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
      try { return { text: new TextDecoder().decode(new Uint8Array(result)), name: "Android backup file" }; } catch { return null; }
    }
    return decodeNativePickedFile(result[0]);
  }
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        const nested = decodeNativePickedFile(parsed);
        if (nested) return nested;
      } catch {}
      return { text: result, name: "Android backup file" };
    }
    return null;
  }
  if (typeof result !== "object") return null;
  const name = String(result.name || result.fileName || result.filename || "Android backup file");
  for (const key of ["text", "content", "data"]) {
    if (typeof result[key] === "string" && result[key].trim()) return { text: result[key], name };
  }
  if (typeof result.base64 === "string" && result.base64) {
    try {
      const binary = atob(result.base64.replace(/^data:[^,]*,/, ""));
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      return { text: new TextDecoder().decode(bytes), name };
    } catch {}
  }
  if (Array.isArray(result.bytes)) {
    try { return { text: new TextDecoder().decode(new Uint8Array(result.bytes)), name }; } catch {}
  }
  return null;
}

async function tryNativeBackupPicker() {
  const bridge = window.flutter_inappwebview;
  if (!bridge?.callHandler) return null;
  try {
    const result = await bridge.callHandler("pickFiles", JSON.stringify({
      allowMultiple: false,
      allowedExtensions: ["json", "txt", "qol", "backup"]
    }));
    return decodeNativePickedFile(result);
  } catch {
    // If this wrapper does not expose the native helper, the hidden HTML file
    // input below remains the normal browser/WebView fallback.
    return null;
  }
}

function requestBrowserDownloadsPermission() {
  return new Promise(resolve => {
    if (!chrome.permissions?.contains || !chrome.permissions?.request) { resolve(false); return; }
    chrome.permissions.contains({ permissions: ["downloads"] }, already => {
      if (chrome.runtime.lastError) { resolve(false); return; }
      if (already) { resolve(true); return; }
      chrome.permissions.request({ permissions: ["downloads"] }, granted => {
        if (chrome.runtime.lastError) resolve(false);
        else resolve(!!granted);
      });
    });
  });
}

function browserManagerDownload(text, filename, mimeType, permissionAlreadyGranted = false) {
  return new Promise(async resolve => {
    if (!chrome.downloads?.download) { resolve(false); return; }
    const allowed = permissionAlreadyGranted || await requestBrowserDownloadsPermission();
    if (!allowed) { resolve(false); return; }
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      resolve(!!ok);
    };
    try {
      chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false }, id => {
        if (chrome.runtime.lastError || !Number.isFinite(Number(id))) finish(false);
        else finish(true);
      });
    } catch {
      finish(false);
    }
  });
}

async function downloadBackupFile(ext = "json") {
  // Mobile Firefox/extension browsers can ignore a normal <a download> from an
  // extension page. Ask for the optional browser download-manager permission
  // directly from the user's click before other async work can consume the
  // user gesture. Desktop keeps the normal permission-free link path.
  const browserManagerAllowed = optionsLooksMobile() && !!chrome.downloads?.download
    ? await requestBrowserDownloadsPermission()
    : false;
  const text = await ensureBackupTextInBox();
  if (!text) {
    showSettingsToast("Nothing to export yet.");
    return;
  }
  try {
    JSON.parse(text);
  } catch {
    showSettingsToast("The backup box does not currently contain valid JSON.");
    return;
  }
  const normalizedExt = ext === "txt" ? "txt" : "json";
  const filename = backupFilename(normalizedExt);
  const mime = normalizedExt === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8";
  if (await tryNativeBackupSave(text, filename, mime)) {
    showSettingsToast(`Backup sent to the Android/system file saver as .${normalizedExt}.`);
    return;
  }
  if (browserManagerAllowed && await browserManagerDownload(text, filename, mime, true)) {
    showSettingsToast(`Backup sent to the browser download manager as .${normalizedExt}.`);
    return;
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  showSettingsToast(`Backup downloaded as .${normalizedExt}.`);
}

async function loadBackupFileObject(file) {
  if (!file) return;
  const status = $("status");
  try {
    if (Number(file.size || 0) > 20 * 1024 * 1024) throw new Error("Backup file is larger than 20 MB.");
    const text = await file.text();
    const parsed = JSON.parse(text);
    const validation = validateBackupObject(parsed);
    if (!validation.ok) throw new Error(validation.warnings.join(" ") || "No importable QoL categories were found.");
    const box = $("settingsJson");
    if (box) box.value = text;
    pendingImportPayload = null;
    cancelImportPreview();
    previewImportSettings();
    if (status) status.textContent = `Loaded ${file.name || "backup file"}. Review the import preview below.`;
  } catch (error) {
    pendingImportPayload = null;
    cancelImportPreview();
    if (status) status.textContent = `Could not load backup file: ${error?.message || "invalid JSON/text backup"}`;
  }
}

function setupBackupFileIo() {
  const input = $("settingsBackupFile");
  const box = $("settingsJson");
  $("loadBackupFile")?.addEventListener("click", async () => {
    const native = await tryNativeBackupPicker();
    if (native?.text) {
      const synthetic = { name: native.name || "Android backup file", size: new TextEncoder().encode(native.text).length, text: async () => native.text };
      await loadBackupFileObject(synthetic);
      return;
    }
    if (!input) return;
    input.value = "";
    input.click();
  });
  input?.addEventListener("change", () => loadBackupFileObject(input.files?.[0]));
  $("downloadBackupJson")?.addEventListener("click", () => downloadBackupFile("json"));
  $("downloadBackupTxt")?.addEventListener("click", () => downloadBackupFile("txt"));

  if (box) {
    ["dragenter", "dragover"].forEach(type => box.addEventListener(type, event => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      box.classList.add("ds-backup-drop-active");
    }));
    ["dragleave", "drop"].forEach(type => box.addEventListener(type, event => {
      box.classList.remove("ds-backup-drop-active");
      if (type !== "drop" || !event.dataTransfer?.files?.length) return;
      event.preventDefault();
      loadBackupFileObject(event.dataTransfer.files[0]);
    }));
  }
}

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

function parseModerationCustomTerms(valueText) {
  const seen = new Set();
  const output = [];
  for (const rawRow of String(valueText || "").split(/\n+/)) {
    const row = rawRow.replace(/\s+/g, " ").trim();
    if (!row) continue;
    const parts = row.split("|");
    const word = String(parts.shift() || "").trim().slice(0, 80);
    const group = String(parts.join("|") || "Custom").trim().slice(0, 40) || "Custom";
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    output.push({ word, group, custom: true });
    if (output.length >= 200) break;
  }
  return output;
}

function moderationData() {
  return {
    groups: MODERATION_MANAGER_GROUPS,
    balancedContextOnly: MODERATION_MANAGER_CONTEXT_ONLY,
    ageWords: MODERATION_MANAGER_AGE_WORDS,
    parseCustomTerms: parseModerationCustomTerms
  };
}

function splitLocalTerms(valueText) {
  return uniqueClean(String(valueText || "").split(/[\n,;]+/).map(item => String(item || "").trim().toLowerCase()).filter(Boolean));
}

function parsedCustomModerationTerms() {
  const parser = moderationData().parseCustomTerms;
  try { return typeof parser === "function" ? parser(value("creatorModerationWarningCustomTerms", "")) : []; }
  catch { return []; }
}

function serializeCustomModerationTerms(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => `${String(item?.word || "").trim()} | ${String(item?.group || "Custom").trim() || "Custom"}`)
    .filter(line => line.split("|")[0].trim())
    .join("\n");
}

function setModerationIgnoredSet(set) {
  const box = $("creatorModerationWarningIgnoredTerms");
  if (!box) return;
  box.value = [...set].sort((a, b) => a.localeCompare(b)).join("\n");
  renderModerationTermManager();
}

function moderationManagerEntries() {
  const data = moderationData();
  const contextOnly = new Set([...(data.balancedContextOnly || []), ...(data.ageWords || [])].map(item => String(item).toLowerCase()));
  const entries = [];
  for (const [group, words] of Object.entries(data.groups || {})) {
    for (const word of words || []) entries.push({ word: String(word), group, custom: false, contextual: contextOnly.has(String(word).toLowerCase()) });
  }
  for (const item of parsedCustomModerationTerms()) entries.push({ word: item.word, group: item.group || "Custom", custom: true, contextual: false });
  const seen = new Set();
  return entries.filter(item => {
    const key = `${item.group}\n${item.word}`.toLowerCase();
    if (!item.word || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderModerationTermManager() {
  const host = $("moderationTermList");
  if (!host) return;
  const entries = moderationManagerEntries();
  const ignored = new Set(splitLocalTerms(value("creatorModerationWarningIgnoredTerms", "")));
  const search = value("moderationTermSearch", "").trim().toLowerCase();
  const groupFilter = value("moderationTermCategory", "all");
  const stateFilter = value("moderationTermState", "all");

  const categorySelect = $("moderationTermCategory");
  if (categorySelect) {
    const current = categorySelect.value || "all";
    const categories = [...new Set(entries.map(item => item.group))].sort((a, b) => a.localeCompare(b));
    categorySelect.replaceChildren(makeElement("option", { text: "All categories", attrs: { value: "all" } }), ...categories.map(group => makeElement("option", { text: group, attrs: { value: group } })));
    categorySelect.value = categories.includes(current) ? current : "all";
  }

  const filtered = entries.filter(item => {
    const isIgnored = ignored.has(item.word.toLowerCase());
    if (search && !`${item.word} ${item.group}`.toLowerCase().includes(search)) return false;
    if (groupFilter !== "all" && item.group !== groupFilter) return false;
    if (stateFilter === "active" && isIgnored) return false;
    if (stateFilter === "ignored" && !isIgnored) return false;
    if (stateFilter === "community" && item.custom) return false;
    if (stateFilter === "custom" && !item.custom) return false;
    return true;
  }).sort((a, b) => a.group.localeCompare(b.group) || a.word.localeCompare(b.word));

  const customCount = entries.filter(item => item.custom).length;
  const ignoredCount = new Set(entries.filter(item => ignored.has(item.word.toLowerCase())).map(item => item.word.toLowerCase())).size;
  const summary = $("moderationTermSummary");
  if (summary) summary.textContent = `${entries.length} known term${entries.length === 1 ? "" : "s"} · ${customCount} custom · ${ignoredCount} ignored locally · showing ${filtered.length}`;

  if (!filtered.length) {
    host.replaceChildren(makeElement("div", { className: "bot-manager-empty", text: "No warning terms match these filters." }));
    return;
  }
  host.replaceChildren(...filtered.map(item => {
    const isIgnored = ignored.has(item.word.toLowerCase());
    const row = makeElement("div", { className: `moderation-term-row${isIgnored ? " is-ignored" : ""}` });
    const main = makeElement("div");
    main.appendChild(makeElement("div", { className: "moderation-term-word", text: item.word }));
    const meta = makeElement("div", { className: "moderation-term-meta" });
    meta.appendChild(makeElement("span", { text: item.group }));
    meta.appendChild(makeElement("span", { text: item.custom ? "Custom" : "Community" }));
    if (item.contextual) meta.appendChild(makeElement("span", { text: "Context-sensitive in Balanced" }));
    if (isIgnored) meta.appendChild(makeElement("span", { text: "Ignored locally" }));
    main.appendChild(meta);
    const actions = makeElement("div", { className: "moderation-term-actions" });
    const toggle = makeElement("button", { text: isIgnored ? "Enable" : "Ignore", attrs: { type: "button" } });
    toggle.addEventListener("click", () => {
      const next = new Set(splitLocalTerms(value("creatorModerationWarningIgnoredTerms", "")));
      const key = item.word.toLowerCase();
      if (next.has(key)) next.delete(key); else next.add(key);
      setModerationIgnoredSet(next);
      showSettingsToast(`${item.word}: ${isIgnored ? "enabled" : "ignored locally"}. Press Save settings to apply it.`);
    });
    actions.appendChild(toggle);
    if (item.custom) {
      const remove = makeElement("button", { text: "Remove", attrs: { type: "button" } });
      remove.addEventListener("click", () => {
        const remaining = parsedCustomModerationTerms().filter(custom => custom.word.toLowerCase() !== item.word.toLowerCase());
        const box = $("creatorModerationWarningCustomTerms");
        if (box) box.value = serializeCustomModerationTerms(remaining);
        renderModerationTermManager();
        showSettingsToast(`${item.word}: custom warning removed. Press Save settings to apply it.`);
      });
      actions.appendChild(remove);
    }
    row.append(main, actions);
    return row;
  }));
}

function setupModerationTermManager() {
  ["moderationTermSearch", "moderationTermCategory", "moderationTermState", "creatorModerationWarningIgnoredTerms", "creatorModerationWarningCustomTerms"].forEach(id => {
    $(id)?.addEventListener(id.includes("Search") || id.includes("Terms") ? "input" : "change", renderModerationTermManager);
  });
  $("clearModerationIgnoredTerms")?.addEventListener("click", () => {
    const box = $("creatorModerationWarningIgnoredTerms");
    if (box) box.value = "";
    renderModerationTermManager();
    showSettingsToast("Local moderation-warning ignores cleared. Press Save settings to apply it.");
  });
  $("addModerationCustomTerm")?.addEventListener("click", () => {
    const termInput = $("moderationCustomTerm");
    const term = String(termInput?.value || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const group = value("moderationCustomCategory", "Custom").trim().slice(0, 40) || "Custom";
    if (!term) { showSettingsToast("Enter a custom warning term first."); return; }
    const current = parsedCustomModerationTerms();
    const existsAnywhere = moderationManagerEntries().some(item => item.word.toLowerCase() === term.toLowerCase());
    if (existsAnywhere) { showSettingsToast("That warning term already exists in the community or custom list."); return; }
    current.push({ word: term, group });
    const box = $("creatorModerationWarningCustomTerms");
    if (box) box.value = serializeCustomModerationTerms(current);
    if (termInput) termInput.value = "";
    renderModerationTermManager();
    showSettingsToast(`${term}: custom warning added. Press Save settings to apply it.`);
  });
  $("moderationCustomTerm")?.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    $("addModerationCustomTerm")?.click();
  });
  renderModerationTermManager();
}

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

function settingBackupScopeForKey(key) {
  if (SETTINGS_BACKUP_OVERRIDES[key]) return SETTINGS_BACKUP_OVERRIDES[key];
  const element = $(key);
  const page = element?.closest?.(".tab-page[data-page]")?.dataset?.page || "";
  for (const [scope, def] of Object.entries(SETTINGS_BACKUP_GROUPS)) {
    if (def.pages.includes(page)) return scope;
  }
  return "settingsGeneral";
}

function settingKeysForBackupScope(scope) {
  return Object.keys(DEFAULT_SETTINGS).filter(key => settingBackupScopeForKey(key) === scope);
}

function isSettingsBackupScope(scope) {
  return SETTINGS_BACKUP_SCOPE_IDS.includes(String(scope || ""));
}

function settingsSubsetForScopes(settingsValue, scopes) {
  const source = { ...DEFAULT_SETTINGS, ...(settingsValue || {}) };
  const selected = scopes instanceof Set ? scopes : new Set(scopes || []);
  const out = {};
  for (const scope of SETTINGS_BACKUP_SCOPE_IDS) {
    if (!selected.has(scope)) continue;
    for (const key of settingKeysForBackupScope(scope)) out[key] = source[key];
  }
  return out;
}

function settingsPresentSubsetForScopes(settingsValue, scopes) {
  const source = settingsValue && typeof settingsValue === "object" ? settingsValue : {};
  const selected = scopes instanceof Set ? scopes : new Set(scopes || []);
  const out = {};
  for (const scope of SETTINGS_BACKUP_SCOPE_IDS) {
    if (!selected.has(scope)) continue;
    for (const key of settingKeysForBackupScope(scope)) {
      if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
    }
  }
  return out;
}

function settingsScopeUsageCount(settingsValue, scope) {
  const source = { ...DEFAULT_SETTINGS, ...(settingsValue || {}) };
  return settingKeysForBackupScope(scope).reduce((count, key) => (
    JSON.stringify(source[key]) === JSON.stringify(DEFAULT_SETTINGS[key]) ? count : count + 1
  ), 0);
}

const BACKUP_STORAGE_KEYS = [
  "settings", OPENED_KEY, OPENED_META_KEY, BLOCKED_BOTS_KEY, QUICK_DISLIKE_HISTORY_KEY, QUICK_DISLIKE_BULK_STATE_KEY,
  NOT_INTERESTED_KEY, PERSONAS_KEY, LEGACY_PERSONAS_KEY, PERSONA_ORG_KEY, OOC_TEMPLATES_KEY, FAVORITE_CREATORS_KEY,
  FOLLOWED_CREATORS_KEY, CREATOR_BOT_WATCH_KEY, FAVORITE_BOTS_KEY, LATER_BOTS_KEY, BOT_ORGANIZER_KEY, CHAT_ORGANIZER_KEY, CHARACTER_QOL_PROFILES_KEY,
  BOT_AVAILABILITY_KEY, BOT_ARCHIVE_KEY, LOREBOOK_BACKUPS_KEY, CHATBOT_LOREBOOK_LINKS_KEY, SAVED_TEXT_SNIPPETS_KEY, CONTEXT_KEEPER_DATA_KEY,
  STORY_DAY_TRACKER_KEY, RP_STATE_TRACKER_KEY, CHAT_NUDGE_STORE_KEY, GENERATION_PROFILES_KEY, SMART_FILTER_PRESETS_KEY, SMART_FILTER_PINNED_KEY,
  BOT_EDITOR_DRAFT_HISTORY_KEY, CHAT_BOOKMARKS_KEY, RECENTLY_SEEN_BOTS_KEY, SOUNDSCAPES_KEY, SOUNDSCAPE_AUDIO_KEY, CHAT_BACKGROUNDS_KEY,
  TAB_CLEANUP_SESSIONS_KEY, TAB_CLEANUP_TOPICS_KEY, TAB_CLEANUP_ENRICHMENT_KEY, LOCAL_CHANGE_HISTORY_KEY
];
const BACKUP_SCOPE_IDS = [
  ...SETTINGS_BACKUP_SCOPE_IDS,
  "settings",
  "opened", "blocked", "notInterested", "favoriteCreators", "followedCreators", "creatorBotWatch", "favoriteBots", "laterBots",
  "botOrganization", "chatOrganization", "characterQolProfiles", "botAvailability", "botArchive", "lorebookBackups", "chatbotLorebookLinks",
  "savedTextSnippets", "contextKeeperData", "storyDayTrackerData", "rpStateTrackerData", "chatNudges", "personas", "personaOrganization",
  "ooc", "generationProfiles", "smartFilterPresets", "smartFilterPins", "botEditorDraftHistory", "chatBookmarks", "recentlySeenBots",
  "soundscapes", "tabCleanupSessions", "tabCleanupTopics", "tabCleanupEnrichment", "localChangeHistory", "localMedia"
];
const LIGHTWEIGHT_BACKUP_SCOPE_IDS = BACKUP_SCOPE_IDS.filter(scope => scope !== "localMedia");

const BACKUP_DATA_SCOPE_DEFS = {
  opened: { count: result => Array.isArray(result[OPENED_KEY]) ? result[OPENED_KEY].length : 0 },
  blocked: { count: result => uniqueClean([...(result[BLOCKED_BOTS_KEY]?.ids || []), ...(result[BLOCKED_BOTS_KEY]?.names || [])]).length },
  notInterested: { count: result => uniqueClean(result[NOT_INTERESTED_KEY]?.ids || []).length },
  favoriteCreators: { count: result => uniqueClean(result[FAVORITE_CREATORS_KEY]?.handles || []).length },
  followedCreators: { count: result => uniqueClean(result[FOLLOWED_CREATORS_KEY]?.handles || []).length },
  creatorBotWatch: { count: result => Object.keys(normalizeCreatorBotWatchState(result[CREATOR_BOT_WATCH_KEY]).creators || {}).length },
  favoriteBots: { count: result => uniqueClean(result[FAVORITE_BOTS_KEY]?.ids || []).length },
  laterBots: { count: result => uniqueClean(result[LATER_BOTS_KEY]?.ids || []).length },
  botOrganization: { count: result => Object.keys(result[BOT_ORGANIZER_KEY]?.meta || {}).length },
  chatOrganization: { count: result => Object.keys(normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]).meta).length },
  characterQolProfiles: { count: result => Object.keys(normalizeCharacterQolProfiles(result[CHARACTER_QOL_PROFILES_KEY])).length },
  botAvailability: { count: result => Object.keys(normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]).meta).length },
  botArchive: { count: result => Object.keys(normalizeBotArchive(result[BOT_ARCHIVE_KEY]).meta).length },
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
  localMedia: { count: result => normalizeSoundscapeAudio(result[SOUNDSCAPE_AUDIO_KEY]).items.length + (normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).global ? 1 : 0) + Object.keys(normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).chats || {}).length, large: true }
};

async function readBackupSourceData() {
  const result = await storageGetChecked(BACKUP_STORAGE_KEYS);
  if (!result.ok) throw new Error(result.error || "Browser storage could not be read");
  return result.data;
}

let exportScopesInitialized = false;

function setExportScopeCount(scope, count, suffix = "saved") {
  document.querySelectorAll(`[data-export-count-for="${CSS.escape(scope)}"]`).forEach(node => {
    const numeric = Number(count) || 0;
    node.textContent = numeric ? `(${numeric.toLocaleString()} ${suffix})` : "";
  });
}

function refreshExportScopeCounts(result) {
  for (const scope of SETTINGS_BACKUP_SCOPE_IDS) {
    setExportScopeCount(scope, settingsScopeUsageCount(result.settings, scope), "active/customized");
  }
  for (const [scope, def] of Object.entries(BACKUP_DATA_SCOPE_DEFS)) {
    setExportScopeCount(scope, def.count(result), "saved");
  }
}

async function selectActiveUsedExportScopes({ initialize = false } = {}) {
  let result;
  try {
    result = await readBackupSourceData();
  } catch {
    if (!initialize) showSettingsToast("Could not read local data to build the Active / Used selection.");
    return;
  }
  refreshExportScopeCounts(result);
  document.querySelectorAll("[data-export-scope]").forEach(input => {
    const scope = String(input.dataset.exportScope || "");
    if (isSettingsBackupScope(scope)) {
      input.checked = settingsScopeUsageCount(result.settings, scope) > 0;
      return;
    }
    const def = BACKUP_DATA_SCOPE_DEFS[scope];
    input.checked = !!def && !def.large && def.count(result) > 0;
  });
  exportScopesInitialized = true;
}

async function initializeExportScopeSelection() {
  if (exportScopesInitialized) return;
  await selectActiveUsedExportScopes({ initialize: true });
}

async function exportSettings() {
  let result;
  try {
    result = await readBackupSourceData();
  } catch {
    showSettingsToast("Backup export cancelled because browser storage could not be read safely.");
    return;
  }

  const scopes = selectedExportScopes();
  if (!scopes.size) {
    showSettingsToast("Select at least one data set to export.");
    return;
  }
  $("settingsJson").value = JSON.stringify(buildExportPayload(scopes, result), null, 2);
}

function normalizeRecoverySnapshot(value) {
  const raw = value && typeof value === "object" ? value : {};
  if (!raw.backup || typeof raw.backup !== "object" || Array.isArray(raw.backup)) return null;
  return {
    createdAt: Number(raw.createdAt) || 0,
    reason: String(raw.reason || "manual"),
    extensionVersion: String(raw.extensionVersion || ""),
    scopes: Array.isArray(raw.scopes) ? raw.scopes.map(String) : [],
    backup: raw.backup
  };
}

async function refreshRecoverySnapshotStatus() {
  const host = $("recoverySnapshotStatus");
  if (!host) return;
  const result = await storageGet([RECOVERY_SNAPSHOT_KEY]);
  const snapshot = normalizeRecoverySnapshot(result[RECOVERY_SNAPSHOT_KEY]);
  if (!snapshot) {
    host.textContent = "No local recovery snapshot saved yet.";
    return;
  }
  const when = snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : "unknown time";
  const mediaNote = snapshot.scopes.includes("localMedia")
    ? " Local media was included because that category was part of the protected action."
    : " Local media bytes are not included.";
  host.textContent = `Last snapshot: ${when} · ${snapshot.reason}.${mediaNote} API keys/webhook URLs are never copied.`;
}

let pendingImportSafetyDownload = null;

function hideImportRecoveryActions() {
  const actions = $("importRecoveryActions");
  if (actions) actions.hidden = true;
  if ($("importRecoveryMessage")) $("importRecoveryMessage").textContent = "";
}

function showImportRecoveryActions(message) {
  const actions = $("importRecoveryActions");
  if (actions) actions.hidden = false;
  if ($("importRecoveryMessage")) $("importRecoveryMessage").textContent = String(message || "Import stopped safely before changing anything.");
}

async function createRecoverySnapshot(reason = "manual", sourceData = null, scopes = null) {
  const result = sourceData || await readBackupSourceData();
  const requestedScopes = scopes instanceof Set ? scopes : new Set(scopes || []);
  const selectedScopes = requestedScopes.size
    ? new Set([...requestedScopes].filter(scope => BACKUP_SCOPE_IDS.includes(scope)))
    : new Set(LIGHTWEIGHT_BACKUP_SCOPE_IDS);
  if (!selectedScopes.size) throw new Error("No recovery data was selected");

  const snapshot = {
    createdAt: Date.now(),
    reason: String(reason || "manual"),
    extensionVersion: chrome.runtime.getManifest()?.version || "",
    scopes: [...selectedScopes],
    backup: buildExportPayload(selectedScopes, result)
  };
  const ok = await storageSetVerified({ [RECOVERY_SNAPSHOT_KEY]: snapshot });
  if (!ok) {
    const error = new Error("QoL couldn't create the safety copy for the selected data");
    error.code = "RECOVERY_SNAPSHOT_FAILED";
    throw error;
  }
  await refreshRecoverySnapshotStatus();
  return snapshot;
}

async function createManualRecoverySnapshot() {
  try {
    await createRecoverySnapshot("manual snapshot");
    showSettingsToast("Local recovery snapshot saved.");
  } catch {
    showSettingsToast("Recovery snapshot could not be saved.");
  }
}

async function loadRecoverySnapshotIntoImport() {
  const result = await storageGet([RECOVERY_SNAPSHOT_KEY]);
  const snapshot = normalizeRecoverySnapshot(result[RECOVERY_SNAPSHOT_KEY]);
  if (!snapshot) { showSettingsToast("No recovery snapshot is available."); return; }
  const box = $("settingsJson");
  if (box) box.value = JSON.stringify(snapshot.backup, null, 2);
  pendingImportPayload = null;
  cancelImportPreview();
  previewImportSettings();
  const replace = document.querySelector('input[name="importMode"][value="replace"]');
  if (replace) { replace.checked = true; refreshImportPreviewImpact(); }
  $("importPreview")?.scrollIntoView({ behavior: "smooth", block: "center" });
  showSettingsToast("Recovery snapshot loaded into the normal import preview. Nothing has been restored yet.");
}

async function clearRecoverySnapshot() {
  if (!confirm("Clear the saved local recovery snapshot? This does not change your current QoL data.")) return;
  const removed = await storageRemoveVerified(RECOVERY_SNAPSHOT_KEY);
  await refreshRecoverySnapshotStatus();
  showSettingsToast(removed ? "Recovery snapshot cleared." : "Recovery snapshot could not be cleared or verified.");
}

function replaceSettingsForImport(importedSettings) {
  const imported = importedSettings && typeof importedSettings === "object" ? importedSettings : {};
  const next = { ...DEFAULT_SETTINGS, ...imported };

  [
    "includeTags",
    "excludeTags",
    "blockedTags",
    "blockedWords",
    "blockedCreators",
    "blockedBotIds",
    "blockedBotNames",
    "allowedLanguages"
  ].forEach(key => {
    next[key] = uniqueClean(Array.isArray(imported[key]) ? imported[key] : DEFAULT_SETTINGS[key]);
  });

  next.oocTemplates = Array.isArray(imported.oocTemplates)
    ? normalizeOocTemplates(imported.oocTemplates)
    : normalizeOocTemplates(DEFAULT_SETTINGS.oocTemplates);
  next.botEditorSnippets = Array.isArray(imported.botEditorSnippets)
    ? normalizeBotEditorSnippets(imported.botEditorSnippets)
    : [];
  next.replyInstructionBotOverrides = normalizeReplyInstructionOverrides(imported.replyInstructionBotOverrides);

  return next;
}

function selectedSettingsScopesForImport(importScopes) {
  const selected = new Set([...importScopes].filter(isSettingsBackupScope));
  if (importScopes.has("settings")) return new Set(["settings"]);
  return selected;
}

function mergeSettingsGroupsForImport(currentSettings, importedSettings, selectedScopes) {
  if (selectedScopes.has("settings")) return mergeSettingsForImport(currentSettings, importedSettings);
  const subset = settingsPresentSubsetForScopes(importedSettings, selectedScopes);
  return mergeSettingsForImport(currentSettings, subset);
}

function replaceSettingsGroupsForImport(currentSettings, importedSettings, selectedScopes) {
  if (selectedScopes.has("settings")) return replaceSettingsForImport(importedSettings);
  const current = { ...DEFAULT_SETTINGS, ...(currentSettings || {}) };
  const replacement = replaceSettingsForImport(settingsSubsetForScopes(importedSettings, selectedScopes));
  for (const scope of selectedScopes) {
    for (const key of settingKeysForBackupScope(scope)) current[key] = replacement[key];
  }
  return current;
}


function normalizeBotOrganization(value) {
  const source = value && typeof value === "object" ? value : {};
  const meta = source.meta && typeof source.meta === "object" ? source.meta : {};
  const out = {};
  for (const [id, raw] of Object.entries(meta)) {
    const key = String(id || "").trim();
    if (!key || !raw || typeof raw !== "object") continue;
    out[key] = {
      ...raw,
      id: key,
      collections: uniqueClean(raw.collections || []),
      tags: uniqueClean(raw.tags || []).slice(0, 40),
      note: String(raw.note || "").replace(/\s+/g, " ").trim().slice(0, 1000),
      status: ["needs-work", "testing", "finished"].includes(raw.status) ? raw.status : ""
    };
  }
  return { meta: out };
}

function mergeBotOrganizations(current, incoming) {
  const left = normalizeBotOrganization(current);
  const right = normalizeBotOrganization(incoming);
  const meta = { ...left.meta };
  for (const [id, raw] of Object.entries(right.meta)) {
    const previous = meta[id] || {};
    meta[id] = {
      ...previous,
      ...raw,
      collections: uniqueClean([...(previous.collections || []), ...(raw.collections || [])]),
      tags: uniqueClean([...(previous.tags || []), ...(raw.tags || [])]).slice(0, 40)
    };
  }
  return { meta };
}

function normalizeChatOrganization(value) {
  const source = value && typeof value === "object" ? value : {};
  const meta = source.meta && typeof source.meta === "object" ? source.meta : {};
  const out = {};
  for (const [keyRaw, raw] of Object.entries(meta)) {
    const key = String(keyRaw || "").trim();
    if (!key || !raw || typeof raw !== "object") continue;
    const collections = uniqueClean(raw.collections || []);
    if (!collections.length) continue;
    out[key] = {
      key,
      title: String(raw.title || "").replace(/\s+/g, " ").trim().slice(0, 200),
      url: String(raw.url || "").trim().slice(0, 1200),
      botId: String(raw.botId || "").trim().slice(0, 120),
      collections,
      updatedAt: Number(raw.updatedAt) || 0
    };
  }
  return { meta: out };
}

function mergeChatOrganizations(current, incoming) {
  const left = normalizeChatOrganization(current);
  const right = normalizeChatOrganization(incoming);
  const meta = { ...left.meta };
  for (const [key, raw] of Object.entries(right.meta)) {
    const previous = meta[key] || {};
    meta[key] = {
      ...previous,
      ...raw,
      collections: uniqueClean([...(previous.collections || []), ...(raw.collections || [])])
    };
  }
  return { meta };
}

function normalizeCharacterQolProfiles(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const output = {};
  const rpState = new Set(["inherit", "on", "off"]);
  const rpStyle = new Set(["inherit", "clean", "quoted"]);
  const rpDetection = new Set(["inherit", "conservative", "balanced", "aggressive"]);
  const autoVoice = new Set(["inherit", "on", "off"]);
  for (const [id, raw] of Object.entries(source)) {
    const key = String(id || raw?.id || "").trim();
    if (!key || !raw || typeof raw !== "object") continue;
    const profile = {
      id: key,
      name: String(raw.name || "").replace(/\s+/g, " ").trim(),
      rpFormatRepair: rpState.has(raw.rpFormatRepair) ? raw.rpFormatRepair : "inherit",
      rpFormatStyle: rpStyle.has(raw.rpFormatStyle) ? raw.rpFormatStyle : "inherit",
      rpFormatDetection: rpDetection.has(raw.rpFormatDetection) ? raw.rpFormatDetection : "inherit",
      autoVoiceOnOpen: autoVoice.has(raw.autoVoiceOnOpen) ? raw.autoVoiceOnOpen : "inherit",
      updatedAt: Number(raw.updatedAt) || 0
    };
    if (profile.rpFormatRepair !== "inherit" || profile.rpFormatStyle !== "inherit" || profile.rpFormatDetection !== "inherit" || profile.autoVoiceOnOpen !== "inherit") {
      output[key] = profile;
    }
  }
  return output;
}

function mergeCharacterQolProfiles(current, incoming) {
  return {
    ...normalizeCharacterQolProfiles(current),
    ...normalizeCharacterQolProfiles(incoming)
  };
}

function migrateBackupPayload(parsed) {
  const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : parsed;
  const migrations = [];
  if (!source || typeof source !== "object" || Array.isArray(source)) return { payload: source, migrations };

  const botListFields = ["blockedBots", "notInterestedBots", "favoriteBots", "laterBots"];
  for (const key of botListFields) {
    if (!Array.isArray(source[key])) continue;
    source[key] = { ids: uniqueClean(source[key]), meta: {} };
    migrations.push(`${key}: legacy array → saved-bot store`);
  }
  for (const key of ["favoriteCreators", "followedCreators"]) {
    if (!Array.isArray(source[key])) continue;
    source[key] = { handles: uniqueClean(source[key]), meta: {} };
    migrations.push(`${key}: legacy array → creator store`);
  }
  if (!Array.isArray(source.personas) && Array.isArray(source.savedPersonas)) {
    source.personas = source.savedPersonas;
    delete source.savedPersonas;
    migrations.push("savedPersonas → personas");
  }
  if (!Array.isArray(source.openedChats) && source.openedChatMeta && typeof source.openedChatMeta === "object") {
    const ids = uniqueClean(Object.keys(source.openedChatMeta));
    if (ids.length) {
      source.openedChats = ids;
      migrations.push("openedChats rebuilt from openedChatMeta");
    }
  }
  return { payload: source, migrations };
}

function looksLikeAppLogExport(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  if (typeof source.logcat === "string" && source.logcat.trim()) return true;
  if (Array.isArray(source.logs) && source.logs.length) return true;
  const recordLists = [source.entries, source.records, source.events].filter(Array.isArray);
  for (const list of recordLists) {
    if (!list.length) continue;
    const sample = list.slice(0, 8).filter(item => item && typeof item === "object" && !Array.isArray(item));
    if (!sample.length) continue;
    const logish = sample.filter(item => {
      const keys = new Set(Object.keys(item).map(key => String(key).toLowerCase()));
      const signals = ["level", "message", "tag", "stack", "thread", "exception", "timestamp"].filter(key => keys.has(key)).length;
      return signals >= 2 || (keys.has("message") && (keys.has("level") || keys.has("tag")));
    }).length;
    if (logish >= Math.max(1, Math.ceil(sample.length / 2))) return true;
  }
  return false;
}

function importCategoryEntries(parsed) {
  const entries = [];
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const logExport = looksLikeAppLogExport(source);
  const settingsLike = !logExport && (source.settings || (
    !source.openedChats && !source.blockedBots && !source.quickDislikeHistory && !source.quickDislikeBulkState && !source.notInterestedBots &&
    !source.favoriteCreators && !source.followedCreators && !source.favoriteBots &&
    !source.laterBots && !source.botOrganization && !source.chatOrganization && !source.characterQolProfiles &&
    !source.botAvailability && !source.botArchive && !source.lorebookBackups && !source.savedTextSnippets &&
    !source.contextKeeperData && !source.storyDayTrackerData && !source.rpStateTrackerData && !source.chatNudges && !source.personas && !source.personaOrganization &&
    !source.oocTemplates && !source.generationProfiles && !source.smartFilterPresets && !source.smartFilterPinnedPresets &&
    !source.botEditorDraftHistory && !source.chatBookmarks && !source.recentlySeenBots && !source.creatorBotWatch &&
    !source.chatbotLorebookLinks && !source.soundscapes && !source.tabCleanupSessions && !source.tabCleanupTopics &&
    !source.tabCleanupEnrichment && !source.localChangeHistory && !source.localMedia && !source._qolBackup
  ));
  const add = (scope, label, count) => entries.push({ scope, label, count: Number(count) || 0 });
  if (settingsLike) {
    const settingsSource = source.settings || source || {};
    const declaredScopes = Array.isArray(source?._qolBackup?.settingsScopes)
      ? source._qolBackup.settingsScopes.map(String)
      : [];
    const grouped = declaredScopes.filter(isSettingsBackupScope);
    if (grouped.length) {
      for (const scope of grouped) {
        const keys = settingKeysForBackupScope(scope).filter(key => Object.prototype.hasOwnProperty.call(settingsSource, key));
        add(scope, SETTINGS_BACKUP_GROUPS[scope]?.label || scope, keys.length);
      }
    } else {
      add("settings", "Settings (legacy/all)", Object.keys(settingsSource).filter(k => k !== "_qolBackup").length);
    }
  }
  if (Array.isArray(source.openedChats)) add("opened", "Bot Status Center opened history", source.openedChats.length);
  if (source.blockedBots && typeof source.blockedBots === "object") add("blocked", "Blocked bots", uniqueClean([...(source.blockedBots.ids || []), ...(source.blockedBots.names || [])]).length);
  if (source.notInterestedBots && typeof source.notInterestedBots === "object") add("notInterested", "Not interested", uniqueClean(source.notInterestedBots.ids || []).length);
  if (source.favoriteCreators && typeof source.favoriteCreators === "object") add("favoriteCreators", "Favorite creators", uniqueClean(source.favoriteCreators.handles || []).length);
  if (source.followedCreators && typeof source.followedCreators === "object") add("followedCreators", "Followed creators", uniqueClean(source.followedCreators.handles || []).length);
  if (source.creatorBotWatch && typeof source.creatorBotWatch === "object") add("creatorBotWatch", "Creator follow/watch history", Object.keys(normalizeCreatorBotWatchState(source.creatorBotWatch).creators || {}).length);
  if (source.favoriteBots && typeof source.favoriteBots === "object") add("favoriteBots", "Favorite bots", uniqueClean(source.favoriteBots.ids || []).length);
  if (source.laterBots && typeof source.laterBots === "object") add("laterBots", "Later bots", uniqueClean(source.laterBots.ids || []).length);
  if (source.botOrganization && typeof source.botOrganization === "object") add("botOrganization", "Bot organization", Object.keys(source.botOrganization.meta || {}).length);
  if (source.chatOrganization && typeof source.chatOrganization === "object") add("chatOrganization", "Chat organization", Object.keys(normalizeChatOrganization(source.chatOrganization).meta).length);
  if (source.chatBookmarks && typeof source.chatBookmarks === "object") add("chatBookmarks", "Message bookmarks", Object.values(source.chatBookmarks).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0));
  if (source.characterQolProfiles && typeof source.characterQolProfiles === "object") add("characterQolProfiles", "Character QoL profiles", Object.keys(normalizeCharacterQolProfiles(source.characterQolProfiles)).length);
  if (source.botAvailability && typeof source.botAvailability === "object") add("botAvailability", "Bot availability checks", Object.keys(normalizeBotAvailability(source.botAvailability).meta).length);
  if (source.botArchive && typeof source.botArchive === "object") add("botArchive", "Saved bot copies", Object.keys(normalizeBotArchive(source.botArchive).meta).length);
  if (source.lorebookBackups && typeof source.lorebookBackups === "object") add("lorebookBackups", "Lorebook backups", Object.keys(normalizeLorebookBackups(source.lorebookBackups).meta).length);
  if (source.chatbotLorebookLinks && typeof source.chatbotLorebookLinks === "object") add("chatbotLorebookLinks", "Chatbot ↔ Lorebook links", Object.keys(source.chatbotLorebookLinks).length);
  if (Array.isArray(source.savedTextSnippets)) add("savedTextSnippets", "Saved snippets", source.savedTextSnippets.length);
  if (source.contextKeeperData && typeof source.contextKeeperData === "object") add("contextKeeperData", "Context Keeper chats", Object.keys(source.contextKeeperData).length);
  if (source.storyDayTrackerData && typeof source.storyDayTrackerData === "object") add("storyDayTrackerData", "Internal Day Tracker chats", Object.keys(source.storyDayTrackerData).length);
  if (source.rpStateTrackerData && typeof source.rpStateTrackerData === "object") add("rpStateTrackerData", "RP State Tracker chats", Object.keys(source.rpStateTrackerData).length);
  if (Array.isArray(source.chatNudges)) add("chatNudges", "Chat Nudges", normalizeChatNudgeStore(source.chatNudges).length);
  if (Array.isArray(source.personas)) add("personas", "Personas", source.personas.length);
  if (source.personaOrganization && typeof source.personaOrganization === "object") add("personaOrganization", "Persona organization", Object.keys(source.personaOrganization.meta || {}).length);
  if (Array.isArray(source.oocTemplates)) add("ooc", "OOC presets", source.oocTemplates.length);
  if (source.generationProfiles && typeof source.generationProfiles === "object") add("generationProfiles", "Generation profiles", Object.keys(source.generationProfiles).length);
  if (Array.isArray(source.smartFilterPresets)) add("smartFilterPresets", "Smart filter presets", normalizeSmartFilterPresets(source.smartFilterPresets).length);
  if (Array.isArray(source.smartFilterPinnedPresets)) add("smartFilterPins", "Pinned Smart Filter presets", normalizeSmartFilterPins(source.smartFilterPinnedPresets, source.smartFilterPresets).length);
  if (source.botEditorDraftHistory && typeof source.botEditorDraftHistory === "object") add("botEditorDraftHistory", "Chatbot editor draft history", Object.values(normalizeBotEditorDraftHistory(source.botEditorDraftHistory).entries).reduce((n, list) => n + list.length, 0));
  if (source.recentlySeenBots && typeof source.recentlySeenBots === "object") add("recentlySeenBots", "Recently seen bots", Array.isArray(source.recentlySeenBots.entries) ? source.recentlySeenBots.entries.length : 0);
  if (source.soundscapes && typeof source.soundscapes === "object") add("soundscapes", "Soundscape scene configuration", normalizeSoundscapeScenes(source.soundscapes).scenes.length);
  if (source.tabCleanupSessions && typeof source.tabCleanupSessions === "object") add("tabCleanupSessions", "Saved tab sessions", normalizeTabCleanupSessions(source.tabCleanupSessions).sessions.length);
  if (source.tabCleanupTopics && typeof source.tabCleanupTopics === "object") add("tabCleanupTopics", "Tab Cleanup topics", normalizeTabCleanupTopics(source.tabCleanupTopics).topics.length);
  if (source.tabCleanupEnrichment && typeof source.tabCleanupEnrichment === "object") add("tabCleanupEnrichment", "Tab Cleanup profile metadata", Object.keys(source.tabCleanupEnrichment.meta || {}).length);
  if (Array.isArray(source.localChangeHistory)) add("localChangeHistory", "Recent QoL change history", source.localChangeHistory.length);
  if (source.localMedia && typeof source.localMedia === "object") {
    const audioCount = normalizeSoundscapeAudio(source.localMedia.soundscapeAudio).items.length;
    const backgrounds = normalizeChatBackgroundMediaStore(source.localMedia.chatBackgroundMedia);
    add("localMedia", "Local media", audioCount + (backgrounds.global ? 1 : 0) + Object.keys(backgrounds.chats || {}).length);
  }
  return entries;
}

function importCategoryCounts(parsed) {
  return importCategoryEntries(parsed).map(item => [item.label, item.count]);
}

function validateBackupObject(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, warnings: ["Backup root must be a JSON object."], entries: [], migrated: parsed, migrations: [] };
  const originalMeta = parsed._qolBackup && typeof parsed._qolBackup === "object" ? parsed._qolBackup : null;
  const futureSchema = Number(originalMeta?.formatVersion || 0) > BACKUP_FORMAT_VERSION;
  const migration = migrateBackupPayload(parsed);
  const source = migration.payload;
  const entries = importCategoryEntries(source);
  const known = new Set(["_qolBackup", "settings", "openedChats", "openedChatMeta", "blockedBots", "quickDislikeHistory", "quickDislikeBulkState", "notInterestedBots", "favoriteCreators", "followedCreators", "creatorBotWatch", "favoriteBots", "laterBots", "botOrganization", "chatOrganization", "characterQolProfiles", "botAvailability", "botArchive", "lorebookBackups", "chatbotLorebookLinks", "savedTextSnippets", "contextKeeperData", "storyDayTrackerData", "rpStateTrackerData", "chatNudges", "personas", "personaOrganization", "oocTemplates", "generationProfiles", "smartFilterPresets", "smartFilterPinnedPresets", "botEditorDraftHistory", "chatBookmarks", "recentlySeenBots", "soundscapes", "tabCleanupSessions", "tabCleanupTopics", "tabCleanupEnrichment", "localChangeHistory", "localMedia"]);
  const warnings = Object.keys(source).filter(key => !known.has(key)).map(key => `Unknown top-level field: ${key}`);
  const meta = source._qolBackup && typeof source._qolBackup === "object" ? source._qolBackup : null;
  if (!meta) warnings.push("Legacy backup: no QoL backup metadata found (still importable after preview). ");
  if (migration.migrations.length) warnings.push(`Legacy layout migration: ${migration.migrations.join("; ")}.`);
  if (futureSchema) warnings.push(`Backup format ${originalMeta.formatVersion} is newer than this build supports (${BACKUP_FORMAT_VERSION}). Recognized categories can still be restored; unknown/newer categories will be skipped rather than blocking the whole import.`);
  const looksLikeLog = looksLikeAppLogExport(source);
  if (looksLikeLog) warnings.push("This looks like an app/log export rather than a SpicyChat QoL backup.");
  if (!entries.length && !looksLikeLog) warnings.push("No importable QoL categories were found.");
  return { ok: entries.length > 0, warnings, entries, meta, migrated: source, migrations: migration.migrations, futureSchema };
}

function selectedImportScopes() {
  return new Set([...document.querySelectorAll("[data-import-scope]")].filter(input => input.checked).map(input => input.dataset.importScope));
}

function importPreviewDetails(parsed, validation) {
  const meta = validation?.meta || {};
  const details = [];
  if (meta.formatVersion) details.push(`Backup schema v${meta.formatVersion}`);
  else details.push("Legacy backup schema");
  if (meta.extensionVersion) details.push(`exported by QoL v${meta.extensionVersion}`);
  if (meta.exportedAt) {
    const when = new Date(meta.exportedAt);
    if (!Number.isNaN(when.getTime())) details.push(`exported ${when.toLocaleString()}`);
  }

  const personas = Array.isArray(parsed?.personas) ? parsed.personas : [];
  if (personas.length) {
    const withText = personas.filter(item => String(item?.description || item?.highlights || "").trim()).length;
    const withAvatar = personas.filter(item => String(item?.avatarDataUrl || "").startsWith("data:image/")).length;
    details.push(`Personas: ${personas.length} total · ${withText} with text · ${withAvatar} with local avatar data`);
  }

  if (parsed?.localMedia) details.push("Local media is included in this backup and may make the file much larger");
  else details.push("Local soundscape audio and chat-background image bytes are not included unless Local media is selected");
  return details;
}

function refreshImportPreviewImpact() {
  const impact = $("importPreviewImpact");
  if (!impact || !pendingImportPayload) return;
  const validation = validateBackupObject(pendingImportPayload);
  const selected = selectedImportScopes();
  const mode = document.querySelector("input[name='importMode']:checked")?.value === "replace" ? "replace" : "merge";
  const chosen = validation.entries.filter(item => selected.has(item.scope));
  const total = chosen.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const modeText = mode === "replace"
    ? "Replace mode: only the selected categories will be replaced; categories not selected remain untouched."
    : "Merge mode: selected categories are combined with current local data and supported duplicates are removed.";
  const details = importPreviewDetails(pendingImportPayload, validation);
  if (validation.futureSchema) details.unshift("Newer backup schema: partial/version-tolerant restore mode");
  const unknownCount = validation.warnings.filter(text => text.startsWith("Unknown top-level field:")).length;
  if (unknownCount) details.unshift(`${unknownCount} unknown/newer top-level field${unknownCount === 1 ? "" : "s"} will be skipped`);
  impact.replaceChildren(
    makeElement("strong", { text: `${chosen.length} selected categor${chosen.length === 1 ? "y" : "ies"} · ${total.toLocaleString()} saved item${total === 1 ? "" : "s"}` }),
    makeElement("p", { className: "hint", text: modeText }),
    makeElement("p", { className: "hint", text: details.join(" · ") })
  );
}

function previewImportSettings() {
  hideImportRecoveryActions();
  const preview = $("importPreview");
  const summary = $("importPreviewSummary");
  const countsHost = $("importPreviewCounts");

  try {
    const parsed = JSON.parse(value("settingsJson"));
    const validation = validateBackupObject(parsed);
    if (!validation.ok) {
      pendingImportPayload = null;
      if (preview) preview.hidden = true;
      const status = $("status");
      if (status) status.textContent = `Import preview stopped: ${validation.warnings.join(" ") || "No importable QoL categories were found."}`;
      return;
    }

    pendingImportPayload = validation.migrated || parsed;
    if (preview) preview.hidden = false;
    if (summary) {
      const warningText = validation.warnings.length ? ` ${validation.warnings.join(" ")}` : " Backup structure looks valid.";
      summary.textContent = `${validation.entries.length} categor${validation.entries.length === 1 ? "y" : "ies"} found. Choose exactly what to restore; nothing changes until Import now.${warningText}`;
    }
    if (countsHost) {
      countsHost.replaceChildren(...validation.entries.map(item => {
        const label = makeElement("label", { className: "row import-scope-row" });
        const input = makeElement("input", { attrs: { type: "checkbox", "data-import-scope": item.scope } });
        input.checked = true;
        input.addEventListener("change", refreshImportPreviewImpact);
        label.append(input, makeElement("span", { text: `${item.label}: ${item.count}` }));
        return label;
      }));
    }
    refreshImportPreviewImpact();
  } catch {
    pendingImportPayload = null;
    if (preview) preview.hidden = true;
    const status = $("status");
    if (status) status.textContent = "Import preview failed: that does not look like a valid QoL backup.";
  }
}

function validateImportBackup() {
  try {
    const parsed = JSON.parse(value("settingsJson"));
    const validation = validateBackupObject(parsed);
    const status = $("status");
    if (!validation.ok) {
      if (status) status.textContent = `Backup validation failed. ${validation.warnings.join(" ")}`;
      return;
    }
    const metaText = validation.meta?.extensionVersion ? ` Exported by v${validation.meta.extensionVersion}.` : "";
    const warningText = validation.warnings.length ? ` Warnings: ${validation.warnings.join(" ")}` : " No structural warnings found.";
    if (status) status.textContent = `Valid QoL backup with ${validation.entries.length} importable categories.${metaText}${warningText}`;
  } catch {
    const status = $("status");
    if (status) status.textContent = "Backup validation failed: invalid JSON.";
  }
}

function cancelImportPreview() {
  pendingImportPayload = null;
  pendingImportSafetyDownload = null;
  hideImportRecoveryActions();
  const preview = $("importPreview");
  if (preview) preview.hidden = true;
  $("importPreviewImpact")?.replaceChildren();
}

async function importSettings() {
  try {
    const rawParsed = pendingImportPayload || JSON.parse(value("settingsJson"));
    const validation = validateBackupObject(rawParsed);
    if (!validation.ok) throw new Error(validation.warnings.join(" ") || "Backup is not safely importable");
    const parsed = validation.migrated || rawParsed;
    const mode = document.querySelector("input[name='importMode']:checked")?.value === "replace" ? "replace" : "merge";
    const importScopes = selectedImportScopes();
    const hasImportScope = scope => !document.querySelector("[data-import-scope]") || importScopes.has(scope);
    if (document.querySelector("[data-import-scope]") && !importScopes.size) throw new Error("No import categories selected");
    const currentRead = await storageGetChecked([
      "settings",
      OPENED_KEY,
      OPENED_META_KEY,
      BLOCKED_BOTS_KEY,
      QUICK_DISLIKE_HISTORY_KEY,
      QUICK_DISLIKE_BULK_STATE_KEY,
      NOT_INTERESTED_KEY,
      PERSONAS_KEY,
      LEGACY_PERSONAS_KEY,
      PERSONA_ORG_KEY,
      OOC_TEMPLATES_KEY,
      FAVORITE_CREATORS_KEY,
      FOLLOWED_CREATORS_KEY,
      FAVORITE_BOTS_KEY,
      LATER_BOTS_KEY,
      BOT_ORGANIZER_KEY,
      CHAT_ORGANIZER_KEY,
      CHARACTER_QOL_PROFILES_KEY,
      BOT_AVAILABILITY_KEY,
      BOT_ARCHIVE_KEY,
      LOREBOOK_BACKUPS_KEY,
      SAVED_TEXT_SNIPPETS_KEY,
      CONTEXT_KEEPER_DATA_KEY,
      STORY_DAY_TRACKER_KEY,
      RP_STATE_TRACKER_KEY,
      CHAT_NUDGE_STORE_KEY,
      GENERATION_PROFILES_KEY,
      SMART_FILTER_PRESETS_KEY,
      SMART_FILTER_PINNED_KEY,
      BOT_EDITOR_DRAFT_HISTORY_KEY,
      CHAT_BOOKMARKS_KEY,
      RECENTLY_SEEN_BOTS_KEY,
      CREATOR_BOT_WATCH_KEY,
      CHATBOT_LOREBOOK_LINKS_KEY,
      SOUNDSCAPES_KEY,
      SOUNDSCAPE_AUDIO_KEY,
      CHAT_BACKGROUNDS_KEY,
      TAB_CLEANUP_SESSIONS_KEY,
      TAB_CLEANUP_TOPICS_KEY,
      TAB_CLEANUP_ENRICHMENT_KEY,
      LOCAL_CHANGE_HISTORY_KEY
    ]);
    if (!currentRead.ok) throw new Error(currentRead.error || "Current QoL data could not be read safely");
    const current = currentRead.data;

    const payload = {};
    const parsedLooksLikeSettings =
      parsed.settings ||
      (!parsed.openedChats &&
        !parsed.blockedBots &&
        !parsed.quickDislikeHistory &&
        !parsed.notInterestedBots &&
        !parsed.favoriteCreators &&
        !parsed.followedCreators &&
        !parsed.favoriteBots &&
        !parsed.laterBots &&
        !parsed.botOrganization &&
        !parsed.chatOrganization &&
        !parsed.characterQolProfiles &&
        !parsed.botAvailability &&
        !parsed.botArchive &&
        !parsed.lorebookBackups &&
        !parsed.savedTextSnippets &&
        !parsed.contextKeeperData &&
        !parsed.storyDayTrackerData &&
        !parsed.rpStateTrackerData &&
        !parsed.chatNudges &&
        !parsed.personas &&
        !parsed.personaOrganization &&
        !parsed.oocTemplates &&
        !parsed.generationProfiles &&
        !parsed.smartFilterPresets &&
        !parsed.smartFilterPinnedPresets &&
        !parsed.botEditorDraftHistory &&
        !parsed.chatBookmarks &&
        !parsed.recentlySeenBots &&
        !parsed.creatorBotWatch &&
        !parsed.chatbotLorebookLinks &&
        !parsed.soundscapes &&
        !parsed.tabCleanupSessions &&
        !parsed.tabCleanupTopics &&
        !parsed.tabCleanupEnrichment &&
        !parsed.localChangeHistory &&
        !parsed.localMedia);

    const selectedSettingsScopes = selectedSettingsScopesForImport(importScopes);
    if (parsedLooksLikeSettings && selectedSettingsScopes.size) {
      payload.settings = mode === "replace"
        ? replaceSettingsGroupsForImport(current.settings, parsed.settings || parsed, selectedSettingsScopes)
        : mergeSettingsGroupsForImport(current.settings, parsed.settings || parsed, selectedSettingsScopes);
    }

    if (hasImportScope("opened") && Array.isArray(parsed.openedChats)) {
      payload[OPENED_KEY] = mode === "replace"
        ? uniqueClean(parsed.openedChats)
        : uniqueClean([...(Array.isArray(current[OPENED_KEY]) ? current[OPENED_KEY] : []), ...parsed.openedChats]);
    }

    if (hasImportScope("opened") && parsed.openedChatMeta && typeof parsed.openedChatMeta === "object") {
      payload[OPENED_META_KEY] = mode === "replace"
        ? normalizeMetaStore(parsed.openedChatMeta)
        : mergeMetaStores(current[OPENED_META_KEY], parsed.openedChatMeta);
    }

    if (hasImportScope("blocked") && parsed.blockedBots && typeof parsed.blockedBots === "object") {
      payload[BLOCKED_BOTS_KEY] = mode === "replace"
        ? normalizeBotStore(parsed.blockedBots)
        : mergeBotStores(current[BLOCKED_BOTS_KEY], parsed.blockedBots);
    }

    if (hasImportScope("blocked") && parsed.quickDislikeHistory && typeof parsed.quickDislikeHistory === "object") {
      payload[QUICK_DISLIKE_HISTORY_KEY] = mode === "replace"
        ? normalizeQuickDislikeHistory(parsed.quickDislikeHistory)
        : mergeQuickDislikeHistories(current[QUICK_DISLIKE_HISTORY_KEY], parsed.quickDislikeHistory);
    }
    if (hasImportScope("blocked") && parsed.quickDislikeBulkState && typeof parsed.quickDislikeBulkState === "object") {
      payload[QUICK_DISLIKE_BULK_STATE_KEY] = normalizeQuickDislikeBulkState(parsed.quickDislikeBulkState);
    }

    if (hasImportScope("notInterested") && parsed.notInterestedBots && typeof parsed.notInterestedBots === "object") {
      payload[NOT_INTERESTED_KEY] = mode === "replace"
        ? normalizeBotStore(parsed.notInterestedBots)
        : mergeBotStores(current[NOT_INTERESTED_KEY], parsed.notInterestedBots);
    }

    if (hasImportScope("favoriteCreators") && parsed.favoriteCreators && typeof parsed.favoriteCreators === "object") {
      payload[FAVORITE_CREATORS_KEY] = mode === "replace"
        ? normalizeCreatorStore(parsed.favoriteCreators)
        : mergeCreatorStores(current[FAVORITE_CREATORS_KEY], parsed.favoriteCreators);
    }

    if (hasImportScope("followedCreators") && parsed.followedCreators && typeof parsed.followedCreators === "object") {
      payload[FOLLOWED_CREATORS_KEY] = mode === "replace"
        ? normalizeCreatorStore(parsed.followedCreators)
        : mergeCreatorStores(current[FOLLOWED_CREATORS_KEY], parsed.followedCreators);
    }

    if (hasImportScope("creatorBotWatch") && parsed.creatorBotWatch && typeof parsed.creatorBotWatch === "object") {
      const incoming = normalizeCreatorBotWatchState(parsed.creatorBotWatch);
      if (mode === "replace") payload[CREATOR_BOT_WATCH_KEY] = incoming;
      else {
        const existing = normalizeCreatorBotWatchState(current[CREATOR_BOT_WATCH_KEY]);
        payload[CREATOR_BOT_WATCH_KEY] = normalizeCreatorBotWatchState({
          ...existing,
          ...incoming,
          creators: { ...(existing.creators || {}), ...(incoming.creators || {}) },
          recent: [...(existing.recent || []), ...(incoming.recent || [])]
        });
      }
    }

    if (hasImportScope("favoriteBots") && parsed.favoriteBots && typeof parsed.favoriteBots === "object") {
      payload[FAVORITE_BOTS_KEY] = mode === "replace"
        ? normalizeBotStore(parsed.favoriteBots)
        : mergeBotStores(current[FAVORITE_BOTS_KEY], parsed.favoriteBots);
    }

    if (hasImportScope("laterBots") && parsed.laterBots && typeof parsed.laterBots === "object") {
      payload[LATER_BOTS_KEY] = mode === "replace"
        ? normalizeBotStore(parsed.laterBots)
        : mergeBotStores(current[LATER_BOTS_KEY], parsed.laterBots);
    }

    if (hasImportScope("botOrganization") && parsed.botOrganization && typeof parsed.botOrganization === "object") {
      payload[BOT_ORGANIZER_KEY] = mode === "replace"
        ? normalizeBotOrganization(parsed.botOrganization)
        : mergeBotOrganizations(current[BOT_ORGANIZER_KEY], parsed.botOrganization);
    }

    if (hasImportScope("chatOrganization") && parsed.chatOrganization && typeof parsed.chatOrganization === "object") {
      payload[CHAT_ORGANIZER_KEY] = mode === "replace"
        ? normalizeChatOrganization(parsed.chatOrganization)
        : mergeChatOrganizations(current[CHAT_ORGANIZER_KEY], parsed.chatOrganization);
    }

    if (hasImportScope("characterQolProfiles") && parsed.characterQolProfiles && typeof parsed.characterQolProfiles === "object") {
      payload[CHARACTER_QOL_PROFILES_KEY] = mode === "replace"
        ? normalizeCharacterQolProfiles(parsed.characterQolProfiles)
        : mergeCharacterQolProfiles(current[CHARACTER_QOL_PROFILES_KEY], parsed.characterQolProfiles);
    }

    if (hasImportScope("botAvailability") && parsed.botAvailability && typeof parsed.botAvailability === "object") {
      payload[BOT_AVAILABILITY_KEY] = mode === "replace"
        ? normalizeBotAvailability(parsed.botAvailability)
        : mergeBotAvailability(current[BOT_AVAILABILITY_KEY], parsed.botAvailability);
    }

    if (hasImportScope("botArchive") && parsed.botArchive && typeof parsed.botArchive === "object") {
      payload[BOT_ARCHIVE_KEY] = mode === "replace"
        ? normalizeBotArchive(parsed.botArchive)
        : mergeBotArchives(current[BOT_ARCHIVE_KEY], parsed.botArchive);
    }

    if (hasImportScope("lorebookBackups") && parsed.lorebookBackups && typeof parsed.lorebookBackups === "object") {
      payload[LOREBOOK_BACKUPS_KEY] = mode === "replace"
        ? normalizeLorebookBackups(parsed.lorebookBackups)
        : mergeLorebookBackups(current[LOREBOOK_BACKUPS_KEY], parsed.lorebookBackups);
    }

    if (hasImportScope("chatbotLorebookLinks") && parsed.chatbotLorebookLinks && typeof parsed.chatbotLorebookLinks === "object") {
      const existing = current[CHATBOT_LOREBOOK_LINKS_KEY] && typeof current[CHATBOT_LOREBOOK_LINKS_KEY] === "object" ? current[CHATBOT_LOREBOOK_LINKS_KEY] : {};
      payload[CHATBOT_LOREBOOK_LINKS_KEY] = mode === "replace" ? parsed.chatbotLorebookLinks : { ...existing, ...parsed.chatbotLorebookLinks };
    }

    if (hasImportScope("savedTextSnippets") && Array.isArray(parsed.savedTextSnippets)) {
      const incoming = parsed.savedTextSnippets.filter(item => item && typeof item === "object" && String(item.text || "").trim());
      const existing = Array.isArray(current[SAVED_TEXT_SNIPPETS_KEY]) ? current[SAVED_TEXT_SNIPPETS_KEY] : [];
      payload[SAVED_TEXT_SNIPPETS_KEY] = mode === "replace" ? incoming : [...existing, ...incoming].filter((item, index, arr) => {
        const key = `${String(item.name || "").trim().toLowerCase()}\n${String(item.text || "").trim().toLowerCase()}`;
        return arr.findIndex(other => `${String(other.name || "").trim().toLowerCase()}\n${String(other.text || "").trim().toLowerCase()}` === key) === index;
      });
    }

    if (hasImportScope("contextKeeperData") && parsed.contextKeeperData && typeof parsed.contextKeeperData === "object") {
      const existing = current[CONTEXT_KEEPER_DATA_KEY] && typeof current[CONTEXT_KEEPER_DATA_KEY] === "object" ? current[CONTEXT_KEEPER_DATA_KEY] : {};
      payload[CONTEXT_KEEPER_DATA_KEY] = mode === "replace" ? parsed.contextKeeperData : { ...existing, ...parsed.contextKeeperData };
    }

    if (hasImportScope("storyDayTrackerData") && parsed.storyDayTrackerData && typeof parsed.storyDayTrackerData === "object") {
      const existing = current[STORY_DAY_TRACKER_KEY] && typeof current[STORY_DAY_TRACKER_KEY] === "object" ? current[STORY_DAY_TRACKER_KEY] : {};
      payload[STORY_DAY_TRACKER_KEY] = mode === "replace" ? parsed.storyDayTrackerData : { ...existing, ...parsed.storyDayTrackerData };
    }

    if (hasImportScope("rpStateTrackerData") && parsed.rpStateTrackerData && typeof parsed.rpStateTrackerData === "object") {
      const existing = current[RP_STATE_TRACKER_KEY] && typeof current[RP_STATE_TRACKER_KEY] === "object" ? current[RP_STATE_TRACKER_KEY] : {};
      payload[RP_STATE_TRACKER_KEY] = mode === "replace" ? parsed.rpStateTrackerData : { ...existing, ...parsed.rpStateTrackerData };
    }

    if (hasImportScope("chatNudges") && Array.isArray(parsed.chatNudges)) {
      const incoming = normalizeChatNudgeStore(parsed.chatNudges);
      const existing = normalizeChatNudgeStore(current[CHAT_NUDGE_STORE_KEY]);
      payload[CHAT_NUDGE_STORE_KEY] = mode === "replace"
        ? incoming
        : normalizeChatNudgeStore([...existing, ...incoming]);
    }

    if (hasImportScope("personas") && Array.isArray(parsed.personas)) {
      payload[PERSONAS_KEY] = mode === "replace"
        ? mergePersonas([], parsed.personas)
        : mergePersonas(
            Array.isArray(current[PERSONAS_KEY])
              ? current[PERSONAS_KEY]
              : (Array.isArray(current[LEGACY_PERSONAS_KEY]) ? current[LEGACY_PERSONAS_KEY] : []),
            parsed.personas
          );
    }

    if (hasImportScope("chatBookmarks") && parsed.chatBookmarks && typeof parsed.chatBookmarks === "object") {
      const existing = current[CHAT_BOOKMARKS_KEY] && typeof current[CHAT_BOOKMARKS_KEY] === "object" ? current[CHAT_BOOKMARKS_KEY] : {};
      if (mode === "replace") {
        payload[CHAT_BOOKMARKS_KEY] = parsed.chatBookmarks;
      } else {
        const merged = { ...existing };
        for (const [chatId, raw] of Object.entries(parsed.chatBookmarks)) {
          const left = Array.isArray(merged[chatId]?.entries) ? merged[chatId].entries : [];
          const right = Array.isArray(raw?.entries) ? raw.entries : [];
          const byMessage = new Map(left.map(entry => [String(entry?.messageId || entry?.id || ""), entry]));
          for (const entry of right) {
            const key = String(entry?.messageId || entry?.id || "");
            if (key) byMessage.set(key, { ...(byMessage.get(key) || {}), ...entry });
          }
          merged[chatId] = { ...(merged[chatId] || {}), ...(raw || {}), entries: [...byMessage.values()] };
        }
        payload[CHAT_BOOKMARKS_KEY] = merged;
      }
    }

    if (hasImportScope("recentlySeenBots") && parsed.recentlySeenBots && typeof parsed.recentlySeenBots === "object") {
      const incoming = Array.isArray(parsed.recentlySeenBots.entries) ? parsed.recentlySeenBots.entries : [];
      const existing = current[RECENTLY_SEEN_BOTS_KEY] && typeof current[RECENTLY_SEEN_BOTS_KEY] === "object" && Array.isArray(current[RECENTLY_SEEN_BOTS_KEY].entries)
        ? current[RECENTLY_SEEN_BOTS_KEY].entries
        : [];
      if (mode === "replace") {
        payload[RECENTLY_SEEN_BOTS_KEY] = { entries: incoming };
      } else {
        const byId = new Map();
        for (const item of [...existing, ...incoming]) {
          const id = String(item?.id || "").trim();
          if (!id) continue;
          const prev = byId.get(id);
          if (!prev || Number(item?.lastSeenAt || 0) >= Number(prev?.lastSeenAt || 0)) {
            byId.set(id, { ...(prev || {}), ...item, id });
          }
        }
        payload[RECENTLY_SEEN_BOTS_KEY] = {
          entries: [...byId.values()].sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0))
        };
      }
    }

    if (hasImportScope("personaOrganization") && parsed.personaOrganization && typeof parsed.personaOrganization === "object") {
      const importedMeta = parsed.personaOrganization.meta && typeof parsed.personaOrganization.meta === "object" ? parsed.personaOrganization.meta : {};
      const currentOrg = current[PERSONA_ORG_KEY] && typeof current[PERSONA_ORG_KEY] === "object" ? current[PERSONA_ORG_KEY] : {};
      const currentMeta = currentOrg.meta && typeof currentOrg.meta === "object" ? currentOrg.meta : {};
      const importedOrder = uniqueClean(Array.isArray(parsed.personaOrganization.order) ? parsed.personaOrganization.order : []);
      const currentOrder = uniqueClean(Array.isArray(currentOrg.order) ? currentOrg.order : []);
      payload[PERSONA_ORG_KEY] = {
        meta: mode === "replace" ? importedMeta : { ...currentMeta, ...importedMeta },
        order: mode === "replace" ? importedOrder : uniqueClean([...currentOrder, ...importedOrder]),
        customOrder: mode === "replace" ? !!parsed.personaOrganization.customOrder : !!(currentOrg.customOrder || parsed.personaOrganization.customOrder)
      };
    }

    if (hasImportScope("ooc") && Array.isArray(parsed.oocTemplates)) {
      payload[OOC_TEMPLATES_KEY] = mode === "replace"
        ? normalizeOocTemplates(parsed.oocTemplates)
        : mergeOocTemplateLists(current[OOC_TEMPLATES_KEY], parsed.oocTemplates);
    }

    if (hasImportScope("generationProfiles") && parsed.generationProfiles && typeof parsed.generationProfiles === "object") {
      payload[GENERATION_PROFILES_KEY] = mode === "replace"
        ? normalizeGenerationProfiles(parsed.generationProfiles)
        : mergeGenerationProfiles(current[GENERATION_PROFILES_KEY], parsed.generationProfiles);
    }

    if (hasImportScope("smartFilterPresets") && Array.isArray(parsed.smartFilterPresets)) {
      payload[SMART_FILTER_PRESETS_KEY] = mode === "replace"
        ? normalizeSmartFilterPresets(parsed.smartFilterPresets)
        : mergeSmartFilterPresets(current[SMART_FILTER_PRESETS_KEY], parsed.smartFilterPresets);
    }

    if (hasImportScope("smartFilterPins") && Array.isArray(parsed.smartFilterPinnedPresets)) {
      const presetSource = payload[SMART_FILTER_PRESETS_KEY] || current[SMART_FILTER_PRESETS_KEY];
      const incomingPins = normalizeSmartFilterPins(parsed.smartFilterPinnedPresets, parsed.smartFilterPresets || presetSource);
      payload[SMART_FILTER_PINNED_KEY] = mode === "replace"
        ? normalizeSmartFilterPins(incomingPins, presetSource)
        : normalizeSmartFilterPins([...(current[SMART_FILTER_PINNED_KEY] || []), ...incomingPins], presetSource);
    }

    if (hasImportScope("botEditorDraftHistory") && parsed.botEditorDraftHistory && typeof parsed.botEditorDraftHistory === "object") {
      payload[BOT_EDITOR_DRAFT_HISTORY_KEY] = mode === "replace"
        ? normalizeBotEditorDraftHistory(parsed.botEditorDraftHistory)
        : mergeBotEditorDraftHistory(current[BOT_EDITOR_DRAFT_HISTORY_KEY], parsed.botEditorDraftHistory);
    }

    if (hasImportScope("soundscapes") && parsed.soundscapes && typeof parsed.soundscapes === "object") {
      if (mode === "replace") payload[SOUNDSCAPES_KEY] = normalizeSoundscapeScenes(parsed.soundscapes);
      else {
        const existing = normalizeSoundscapeScenes(current[SOUNDSCAPES_KEY]);
        const incoming = normalizeSoundscapeScenes(parsed.soundscapes);
        const byId = new Map(existing.scenes.map(scene => [String(scene.id || scene.name || ""), scene]));
        for (const scene of incoming.scenes) byId.set(String(scene.id || scene.name || ""), scene);
        payload[SOUNDSCAPES_KEY] = { ...existing, ...incoming, scenes: [...byId.values()] };
      }
    }

    if (hasImportScope("tabCleanupSessions") && parsed.tabCleanupSessions && typeof parsed.tabCleanupSessions === "object") {
      if (mode === "replace") payload[TAB_CLEANUP_SESSIONS_KEY] = normalizeTabCleanupSessions(parsed.tabCleanupSessions);
      else {
        const existing = normalizeTabCleanupSessions(current[TAB_CLEANUP_SESSIONS_KEY]);
        const incoming = normalizeTabCleanupSessions(parsed.tabCleanupSessions);
        const byId = new Map(existing.sessions.map(session => [String(session.id || session.createdAt || ""), session]));
        for (const session of incoming.sessions) byId.set(String(session.id || session.createdAt || ""), session);
        payload[TAB_CLEANUP_SESSIONS_KEY] = { version: 2, sessions: [...byId.values()].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 40) };
      }
    }

    if (hasImportScope("tabCleanupTopics") && parsed.tabCleanupTopics && typeof parsed.tabCleanupTopics === "object") {
      if (mode === "replace") payload[TAB_CLEANUP_TOPICS_KEY] = normalizeTabCleanupTopics(parsed.tabCleanupTopics);
      else {
        const existing = normalizeTabCleanupTopics(current[TAB_CLEANUP_TOPICS_KEY]);
        const incoming = normalizeTabCleanupTopics(parsed.tabCleanupTopics);
        const byId = new Map(existing.topics.map(topic => [String(topic.id || topic.name || ""), topic]));
        for (const topic of incoming.topics) byId.set(String(topic.id || topic.name || ""), topic);
        payload[TAB_CLEANUP_TOPICS_KEY] = { version: 1, topics: [...byId.values()] };
      }
    }

    if (hasImportScope("tabCleanupEnrichment") && parsed.tabCleanupEnrichment && typeof parsed.tabCleanupEnrichment === "object") {
      const existing = current[TAB_CLEANUP_ENRICHMENT_KEY] && typeof current[TAB_CLEANUP_ENRICHMENT_KEY] === "object" ? current[TAB_CLEANUP_ENRICHMENT_KEY] : { meta: {} };
      payload[TAB_CLEANUP_ENRICHMENT_KEY] = mode === "replace"
        ? parsed.tabCleanupEnrichment
        : { ...existing, ...parsed.tabCleanupEnrichment, meta: { ...(existing.meta || {}), ...(parsed.tabCleanupEnrichment.meta || {}) } };
    }

    if (hasImportScope("localChangeHistory") && Array.isArray(parsed.localChangeHistory)) {
      if (mode === "replace") payload[LOCAL_CHANGE_HISTORY_KEY] = parsed.localChangeHistory.slice(0, 100);
      else {
        const existing = Array.isArray(current[LOCAL_CHANGE_HISTORY_KEY]) ? current[LOCAL_CHANGE_HISTORY_KEY] : [];
        const byId = new Map();
        for (const item of [...existing, ...parsed.localChangeHistory]) {
          const key = String(item?.id || `${item?.at || ""}:${item?.label || ""}`);
          if (key) byId.set(key, item);
        }
        payload[LOCAL_CHANGE_HISTORY_KEY] = [...byId.values()].sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0)).slice(0, 100);
      }
    }

    if (hasImportScope("localMedia") && parsed.localMedia && typeof parsed.localMedia === "object") {
      const incomingAudio = normalizeSoundscapeAudio(parsed.localMedia.soundscapeAudio);
      const incomingBackgrounds = normalizeChatBackgroundMediaStore(parsed.localMedia.chatBackgroundMedia);
      if (mode === "replace") {
        payload[SOUNDSCAPE_AUDIO_KEY] = incomingAudio;
        payload[CHAT_BACKGROUNDS_KEY] = incomingBackgrounds;
      } else {
        const existingAudio = normalizeSoundscapeAudio(current[SOUNDSCAPE_AUDIO_KEY]);
        const audioById = new Map(existingAudio.items.map(item => [String(item.id || item.name || ""), item]));
        for (const item of incomingAudio.items) audioById.set(String(item.id || item.name || ""), item);
        payload[SOUNDSCAPE_AUDIO_KEY] = { ...existingAudio, ...incomingAudio, items: [...audioById.values()] };

        const existingBackgrounds = normalizeChatBackgroundMediaStore(current[CHAT_BACKGROUNDS_KEY]);
        payload[CHAT_BACKGROUNDS_KEY] = {
          global: incomingBackgrounds.global || existingBackgrounds.global || null,
          chats: { ...(existingBackgrounds.chats || {}), ...(incomingBackgrounds.chats || {}) }
        };
      }
    }

    if (!Object.keys(payload).length) throw new Error("Nothing importable found");

    if (payload[OPENED_KEY] || payload[OPENED_META_KEY] || payload[BLOCKED_BOTS_KEY]) {
      const effectiveBlocked = normalizeBotStore(payload[BLOCKED_BOTS_KEY] || current[BLOCKED_BOTS_KEY]);
      const effectiveOpenedIds = Array.isArray(payload[OPENED_KEY])
        ? payload[OPENED_KEY]
        : (Array.isArray(current[OPENED_KEY]) ? current[OPENED_KEY] : []);
      const effectiveOpenedMeta = payload[OPENED_META_KEY] || current[OPENED_META_KEY] || {};
      const cleanedOpened = enforceBlockedPriorityOverOpenedState({
        blockedStore: effectiveBlocked,
        openedIds: effectiveOpenedIds,
        openedMeta: effectiveOpenedMeta,
        detached: true
      });
      payload[OPENED_KEY] = cleanedOpened.ids;
      payload[OPENED_META_KEY] = cleanedOpened.meta;
    }

    const recoveryScopes = new Set(importScopes.size
      ? importScopes
      : validation.entries.map(entry => String(entry?.scope || "").trim()).filter(Boolean));

    // Importing Blocked can also remove those bots from Opened, so preserve both.
    if (recoveryScopes.has("blocked")) recoveryScopes.add("opened");

    pendingImportSafetyDownload = buildExportPayload(recoveryScopes, current);
    await createRecoverySnapshot(`before ${mode} import`, current, recoveryScopes);
    const importStored = await storageSetVerified(payload);
    if (!importStored) {
      const error = new Error("The imported data could not be verified; your safety copy was kept");
      error.code = "IMPORT_WRITE_FAILED";
      throw error;
    }
    pendingImportPayload = null;
    pendingImportSafetyDownload = null;
    hideImportRecoveryActions();
    cancelImportPreview();
    await load();

    const status = $("status");
    if (status) {
      const importedCategories = validation.entries.filter(entry => importScopes.has(entry.scope)).length;
      const skippedUnknown = validation.warnings.filter(text => text.startsWith("Unknown top-level field:")).length;
      const base = mode === "replace" ? "Imported selected categories (replace mode)." : "Imported selected categories (merge mode).";
      const partial = validation.futureSchema || skippedUnknown
        ? ` Partial restore: ${importedCategories} recognized categor${importedCategories === 1 ? "y" : "ies"}${skippedUnknown ? `; ${skippedUnknown} unknown/newer field${skippedUnknown === 1 ? "" : "s"} skipped` : ""}.`
        : "";
      status.textContent = `${base}${partial}`;
      setTimeout(() => { status.textContent = ""; }, partial ? 5200 : 2600);
    }
  } catch (error) {
    const status = $("status");
    const detail = String(error?.message || "the backup could not be read").replace(/\s+/g, " ").trim();
    if (error?.code === "RECOVERY_SNAPSHOT_FAILED") {
      if (status) status.textContent = "Import stopped before changing anything.";
      showImportRecoveryActions("QoL couldn't create the safety copy for the selected data. You can retry, download the current selected data yourself first, or cancel.");
    } else if (error?.code === "IMPORT_WRITE_FAILED") {
      if (status) status.textContent = "Import could not be verified. Your safety copy was kept.";
      showImportRecoveryActions("The browser did not confirm the import write. QoL kept the safety copy instead of pretending the import succeeded.");
    } else {
      if (status) status.textContent = `Import failed: ${detail}.`;
    }
  }
}

async function renderLocalChangeHistory() {
  const host = $("localChangeHistory");
  if (!host) return;
  const result = await storageGet([LOCAL_CHANGE_HISTORY_KEY]);
  const history = Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY] : [];
  if (!history.length) {
    host.replaceChildren(makeElement("span", { className: "hint", text: "No recent local QoL changes." }));
    return;
  }
  host.replaceChildren(...history.slice(0, 12).map(entry => {
    const row = makeElement("div", { className: "local-change-row" });
    const text = makeElement("div", { className: "local-change-main" });
    text.append(makeElement("strong", { text: String(entry?.label || "QoL change") }));
    text.append(makeElement("span", { className: "hint", text: entry?.at ? new Date(entry.at).toLocaleString() : "" }));
    const button = makeElement("button", { text: entry?.undoable ? "Undo" : "Logged", attrs: { type: "button" } });
    button.disabled = !entry?.undoable;
    button.addEventListener("click", async () => {
      if (!entry?.undoable) return;
      const current = await storageGet([LOCAL_CHANGE_HISTORY_KEY]);
      const list = Array.isArray(current[LOCAL_CHANGE_HISTORY_KEY]) ? current[LOCAL_CHANGE_HISTORY_KEY] : [];
      const index = list.findIndex(item => item?.id === entry.id);
      if (index < 0) return;
      const target = list[index];
      if (!target.before || typeof target.before !== "object") return;
      const keys = Object.keys(target.before);
      const currentValues = await storageGet(keys);
      const stale = Object.entries(target.after || {}).some(([key, expected]) => JSON.stringify(currentValues[key]) !== JSON.stringify(expected));
      if (stale) { showSettingsToast("That data changed again after this entry, so QoL will not overwrite the newer state."); return; }
      await storageSet(target.before);
      list.splice(index, 1);
      await storageSet({ [LOCAL_CHANGE_HISTORY_KEY]: list });
      await load();
      showSettingsToast(`Undid: ${target.label || "QoL change"}`);
      renderLocalChangeHistory();
    });
    row.append(text, button);
    return row;
  }));
}

async function undoLatestLocalChange() {
  const result = await storageGet([LOCAL_CHANGE_HISTORY_KEY]);
  const history = Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY] : [];
  const index = history.findIndex(item => item?.undoable && item?.before && typeof item.before === "object");
  if (index < 0) return showSettingsToast("There is no recent undoable QoL change.");
  const entry = history[index];
  const keys = Object.keys(entry.before || {});
  const currentValues = await storageGet(keys);
  const stale = Object.entries(entry.after || {}).some(([key, expected]) => JSON.stringify(currentValues[key]) !== JSON.stringify(expected));
  if (stale) return showSettingsToast("The latest recorded data changed again, so QoL will not overwrite the newer state.");
  await storageSet(entry.before);
  history.splice(index, 1);
  await storageSet({ [LOCAL_CHANGE_HISTORY_KEY]: history });
  await load();
  showSettingsToast(`Undid: ${entry.label || "QoL change"}`);
  renderLocalChangeHistory();
}

async function clearLocalChangeHistoryFromOptions() {
  const result = await storageGet([LOCAL_CHANGE_HISTORY_KEY]);
  const history = Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY] : [];
  if (!history.length) return showSettingsToast("Recent-change history is already empty.");
  if (!confirm(`Clear ${history.length} recent QoL change${history.length === 1 ? "" : "s"}?`)) return;
  await storageSet({ [LOCAL_CHANGE_HISTORY_KEY]: [] });
  renderLocalChangeHistory();
  showSettingsToast("Recent QoL change history cleared.");
}

function countStoreItems(value, kind = "bot") {
  if (kind === "opened") return Array.isArray(value) ? value.length : 0;
  if (kind === "creator") return uniqueClean(value?.handles || []).length;
  if (kind === "persona") return Array.isArray(value) ? value.length : 0;
  if (kind === "ooc") return Array.isArray(value) ? value.length : 0;
  if (kind === "profiles") return value && typeof value === "object" ? Object.keys(value).length : 0;
  return uniqueClean([...(value?.ids || []), ...(value?.names || [])]).length;
}

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
  { id: "botOrganization", label: "Bot organization", keys: [BOT_ORGANIZER_KEY], count: result => Object.keys(result[BOT_ORGANIZER_KEY]?.meta || {}).length },
  { id: "chatOrganization", label: "Chat organization", keys: [CHAT_ORGANIZER_KEY], count: result => Object.keys(normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]).meta).length },
  { id: "characterProfiles", label: "Character profiles", keys: [CHARACTER_QOL_PROFILES_KEY], count: result => Object.keys(normalizeCharacterQolProfiles(result[CHARACTER_QOL_PROFILES_KEY])).length },
  { id: "availability", label: "Availability checks", keys: [BOT_AVAILABILITY_KEY], count: result => Object.keys(normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]).meta).length },
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
  { id: "chatBackgroundMedia", label: "Local chat background images", keys: [CHAT_BACKGROUNDS_KEY], count: result => { const store = normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]); return (store.global ? 1 : 0) + Object.keys(store.chats || {}).length; } },
  { id: "tabCleanupEnrichment", label: "Tab cleanup profile metadata", keys: [TAB_CLEANUP_ENRICHMENT_KEY], count: result => Object.keys(result[TAB_CLEANUP_ENRICHMENT_KEY]?.meta || {}).length },
  { id: "tabCleanupSessions", label: "Saved tab sessions", keys: [TAB_CLEANUP_SESSIONS_KEY], count: result => normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]).sessions.length },
  { id: "tabCleanupTopics", label: "Tab cleanup topics", keys: [TAB_CLEANUP_TOPICS_KEY], count: result => normalizeTabCleanupTopics(result[TAB_CLEANUP_TOPICS_KEY]).topics.length },
  { id: "deeplKey", label: "DeepL API key", keys: [DEEPL_API_KEY], count: result => String(result[DEEPL_API_KEY] || "").trim() ? "saved" : "none" }
];

async function deleteStorageDataset(id) {
  const def = STORAGE_DATASET_DEFS.find(item => item.id === id);
  if (!def) return;
  const deleteRead = await storageGetChecked(["settings", ...def.keys]);
  if (!deleteRead.ok) {
    showSettingsToast(`Delete cancelled: ${def.label} data could not be read safely.`);
    return;
  }
  const result = deleteRead.data;
  const count = def.count(result);
  if (!confirm(`Delete ${def.label} QoL data (${count})? This cannot be undone from QoL unless you have a backup.`)) return;

  const recoveryProtected = !["deeplKey", "soundscapeAudio", "chatBackgroundMedia"].includes(id);
  if (recoveryProtected) {
    try {
      await createRecoverySnapshot(`before deleting ${def.label}`);
    } catch {
      showSettingsToast(`Delete cancelled: recovery snapshot for ${def.label} could not be verified.`);
      return;
    }
  }

  let changed = false;
  if (id === "ooc") {
    const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}), oocTemplates: [] };
    changed = await storageSetVerified({ settings, [OOC_TEMPLATES_KEY]: [] });
  } else if (id === "settings") {
    changed = await storageRemoveVerified("settings");
  } else {
    changed = await storageRemoveVerified(def.keys);
  }

  if (!changed) {
    showSettingsToast(`Delete could not be verified${recoveryProtected ? "; the recovery snapshot was kept" : ""}.`);
    return;
  }

  await load();
  showSettingsToast(`${def.label} data deleted.`);
}

async function refreshStorageUsage() {
  const host = $("storageUsage");
  if (!host) return;

  const keys = [...new Set(STORAGE_DATASET_DEFS.flatMap(def => def.keys))];
  const result = await storageGet(keys);
  const bytes = await storageBytesInUse(null);
  host.replaceChildren();

  if (Number.isFinite(bytes)) {
    host.appendChild(makeElement("span", { className: "storage-chip", text: `Storage: ${Math.max(0, bytes / 1024).toFixed(bytes >= 10240 ? 0 : 1)} KB` }));
  }

  await refreshRecoverySnapshotStatus();

  STORAGE_DATASET_DEFS.forEach(def => {
    const wrap = makeElement("span", { className: "storage-dataset" });
    wrap.appendChild(makeElement("span", { text: `${def.label}: ${def.count(result)}` }));
    const button = makeElement("button", { text: "Delete", attrs: { type: "button", "data-delete-storage-dataset": def.id } });
    button.addEventListener("click", () => deleteStorageDataset(def.id));
    wrap.appendChild(button);
    host.appendChild(wrap);
  });
}

function pruneMeta(meta, allowedKeys) {
  const raw = meta && typeof meta === "object" ? meta : {};
  const allowed = new Set(allowedKeys.filter(Boolean));
  return Object.fromEntries(Object.entries(raw).filter(([key]) => allowed.has(key)));
}

function cleanedBotStore(raw, { keepNames = false } = {}) {
  const store = normalizeBotStore(raw);
  const ids = uniqueClean(store.ids);
  const names = keepNames ? uniqueClean(store.names) : [];
  const allowedMeta = [
    ...ids,
    ...names,
    ...names.map(name => `name:${name}`)
  ];
  return { ids, ...(keepNames ? { names } : {}), meta: pruneMeta(store.meta, allowedMeta) };
}

function normalizeChatBookmarksForCleanup(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const output = {};
  for (const [chatId, raw] of Object.entries(source)) {
    const id = String(chatId || "").trim();
    if (!id || !raw || typeof raw !== "object") continue;
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    const byMessage = new Map();
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const messageId = String(entry.messageId || entry.id || "").trim();
      if (!messageId) continue;
      const previous = byMessage.get(messageId);
      if (!previous || Number(entry.updatedAt || entry.createdAt || 0) >= Number(previous.updatedAt || previous.createdAt || 0)) byMessage.set(messageId, { ...entry, messageId });
    }
    if (byMessage.size) output[id] = { ...raw, entries: [...byMessage.values()] };
  }
  return output;
}

function orphanedMetaCount(meta, allowedKeys) {
  const raw = meta && typeof meta === "object" ? meta : {};
  const allowed = new Set((allowedKeys || []).filter(Boolean));
  return Object.keys(raw).filter(key => !allowed.has(key)).length;
}

async function checkOrphanedLocalData() {
  const status = $("cleanupStatus");
  if (status) status.textContent = "Checking local data...";
  const result = await storageGet([
    OPENED_KEY, OPENED_META_KEY, BLOCKED_BOTS_KEY, NOT_INTERESTED_KEY, FAVORITE_BOTS_KEY, LATER_BOTS_KEY,
    FAVORITE_CREATORS_KEY, FOLLOWED_CREATORS_KEY, PERSONAS_KEY, LEGACY_PERSONAS_KEY, PERSONA_ORG_KEY,
    SMART_FILTER_PRESETS_KEY, SMART_FILTER_PINNED_KEY, CHAT_BOOKMARKS_KEY, RECENTLY_SEEN_BOTS_KEY
  ]);
  let orphaned = 0;
  const details = [];
  const opened = uniqueClean(result[OPENED_KEY] || []);
  const openedOrphans = orphanedMetaCount(result[OPENED_META_KEY], opened);
  if (openedOrphans) { orphaned += openedOrphans; details.push(`${openedOrphans} opened-chat metadata`); }
  for (const [key, label, keepNames] of [[BLOCKED_BOTS_KEY, "blocked-bot metadata", true], [NOT_INTERESTED_KEY, "Not Interested metadata", false], [FAVORITE_BOTS_KEY, "favorite-bot metadata", false], [LATER_BOTS_KEY, "Later metadata", false]]) {
    const store = normalizeBotStore(result[key]);
    const allowed = [...store.ids, ...(keepNames ? store.names : []), ...(keepNames ? store.names.map(name => `name:${name}`) : [])];
    const count = orphanedMetaCount(result[key]?.meta, allowed);
    if (count) { orphaned += count; details.push(`${count} ${label}`); }
  }
  for (const [key, label] of [[FAVORITE_CREATORS_KEY, "favorite-creator metadata"], [FOLLOWED_CREATORS_KEY, "followed-creator metadata"]]) {
    const store = normalizeCreatorStore(result[key]);
    const count = orphanedMetaCount(result[key]?.meta, store.handles);
    if (count) { orphaned += count; details.push(`${count} ${label}`); }
  }
  const personas = mergePersonas([], Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY] : (result[LEGACY_PERSONAS_KEY] || []));
  const personaIds = personas.map(item => String(item?.id || "").trim()).filter(Boolean);
  const org = result[PERSONA_ORG_KEY] && typeof result[PERSONA_ORG_KEY] === "object" ? result[PERSONA_ORG_KEY] : {};
  const personaMetaOrphans = orphanedMetaCount(org.meta, personaIds);
  const personaOrderOrphans = uniqueClean(org.order || []).filter(id => !personaIds.includes(id)).length;
  if (personaMetaOrphans + personaOrderOrphans) { orphaned += personaMetaOrphans + personaOrderOrphans; details.push(`${personaMetaOrphans + personaOrderOrphans} Persona organization entries`); }
  const rawPins = Array.isArray(result[SMART_FILTER_PINNED_KEY]) ? result[SMART_FILTER_PINNED_KEY] : [];
  const cleanPins = normalizeSmartFilterPins(rawPins, result[SMART_FILTER_PRESETS_KEY]);
  if (rawPins.length !== cleanPins.length) { const n = rawPins.length - cleanPins.length; orphaned += n; details.push(`${n} Smart Filter pin${n === 1 ? "" : "s"}`); }
  const rawBookmarks = result[CHAT_BOOKMARKS_KEY] && typeof result[CHAT_BOOKMARKS_KEY] === "object" ? result[CHAT_BOOKMARKS_KEY] : {};
  const rawBookmarkCount = Object.values(rawBookmarks).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0);
  const cleanBookmarks = normalizeChatBookmarksForCleanup(rawBookmarks);
  const cleanBookmarkCount = Object.values(cleanBookmarks).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0);
  if (rawBookmarkCount > cleanBookmarkCount) { const n = rawBookmarkCount - cleanBookmarkCount; orphaned += n; details.push(`${n} malformed/duplicate bookmark${n === 1 ? "" : "s"}`); }
  if (status) status.textContent = orphaned ? `${orphaned} cleanup candidate${orphaned === 1 ? "" : "s"} found: ${details.join(" · ")}. Nothing was changed.` : "No supported orphaned/duplicate local-data records found. Nothing was changed.";
}

async function cleanLocalData() {
  const status = $("cleanupStatus");
  if (status) status.textContent = "Cleaning...";

  const cleanRead = await storageGetChecked([
    "settings",
    OPENED_KEY,
    OPENED_META_KEY,
    BLOCKED_BOTS_KEY,
    NOT_INTERESTED_KEY,
    PERSONAS_KEY,
    LEGACY_PERSONAS_KEY,
    PERSONA_ORG_KEY,
    OOC_TEMPLATES_KEY,
    FAVORITE_CREATORS_KEY,
    FOLLOWED_CREATORS_KEY,
    FAVORITE_BOTS_KEY,
    LATER_BOTS_KEY,
    BOT_ORGANIZER_KEY,
    CHAT_ORGANIZER_KEY,
    CHARACTER_QOL_PROFILES_KEY,
    BOT_AVAILABILITY_KEY,
    BOT_ARCHIVE_KEY,
    SAVED_TEXT_SNIPPETS_KEY,
    CONTEXT_KEEPER_DATA_KEY,
    STORY_DAY_TRACKER_KEY,
    CHAT_NUDGE_STORE_KEY,
    GENERATION_PROFILES_KEY,
    SMART_FILTER_PRESETS_KEY,
    SMART_FILTER_PINNED_KEY,
    BOT_EDITOR_DRAFT_HISTORY_KEY,
    CHAT_BOOKMARKS_KEY,
    RECENTLY_SEEN_BOTS_KEY
  ]);
  if (!cleanRead.ok) {
    if (status) status.textContent = "Cleanup cancelled: current QoL storage could not be read safely.";
    showSettingsToast("Cleanup cancelled because browser storage could not be read.");
    return;
  }
  const result = cleanRead.data;

  const beforeBytes = await storageBytesInUse(null);
  const opened = uniqueClean(result[OPENED_KEY] || []);
  const favoriteCreators = normalizeCreatorStore(result[FAVORITE_CREATORS_KEY]);
  favoriteCreators.meta = pruneMeta(favoriteCreators.meta, favoriteCreators.handles);
  const followedCreators = normalizeCreatorStore(result[FOLLOWED_CREATORS_KEY]);
  followedCreators.meta = pruneMeta(followedCreators.meta, followedCreators.handles);
  const personas = mergePersonas([], Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY] : (result[LEGACY_PERSONAS_KEY] || []));
  const personaIds = personas.map(persona => String(persona?.id || "").trim()).filter(Boolean);
  const rawPersonaOrg = result[PERSONA_ORG_KEY] && typeof result[PERSONA_ORG_KEY] === "object" ? result[PERSONA_ORG_KEY] : {};
  const cleanedPersonaOrg = {
    meta: pruneMeta(rawPersonaOrg.meta, personaIds),
    order: uniqueClean(Array.isArray(rawPersonaOrg.order) ? rawPersonaOrg.order : []).filter(id => personaIds.includes(id)),
    customOrder: !!rawPersonaOrg.customOrder
  };
  const currentSettings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };

  ["includeTags", "excludeTags", "blockedTags", "blockedWords", "blockedCreators", "blockedBotIds", "blockedBotNames", "allowedLanguages"]
    .forEach(key => { currentSettings[key] = uniqueClean(currentSettings[key] || []); });
  currentSettings.botEditorSnippets = normalizeBotEditorSnippets(currentSettings.botEditorSnippets);
  currentSettings.oocTemplates = normalizeOocTemplates(currentSettings.oocTemplates);

  const payload = {
    settings: currentSettings,
    [OPENED_KEY]: opened,
    [OPENED_META_KEY]: pruneMeta(result[OPENED_META_KEY], opened),
    [BLOCKED_BOTS_KEY]: cleanedBotStore(result[BLOCKED_BOTS_KEY], { keepNames: true }),
    [NOT_INTERESTED_KEY]: cleanedBotStore(result[NOT_INTERESTED_KEY]),
    [FAVORITE_CREATORS_KEY]: favoriteCreators,
    [FOLLOWED_CREATORS_KEY]: followedCreators,
    [FAVORITE_BOTS_KEY]: cleanedBotStore(result[FAVORITE_BOTS_KEY]),
    [LATER_BOTS_KEY]: cleanedBotStore(result[LATER_BOTS_KEY]),
    [BOT_ORGANIZER_KEY]: normalizeBotOrganization(result[BOT_ORGANIZER_KEY]),
    [CHAT_ORGANIZER_KEY]: normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]),
    [CHARACTER_QOL_PROFILES_KEY]: normalizeCharacterQolProfiles(result[CHARACTER_QOL_PROFILES_KEY]),
    [BOT_AVAILABILITY_KEY]: normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]),
    [BOT_ARCHIVE_KEY]: normalizeBotArchive(result[BOT_ARCHIVE_KEY]),
    [SAVED_TEXT_SNIPPETS_KEY]: Array.isArray(result[SAVED_TEXT_SNIPPETS_KEY]) ? result[SAVED_TEXT_SNIPPETS_KEY].filter(item => item && typeof item === "object" && String(item.text || "").trim()) : [],
    [CONTEXT_KEEPER_DATA_KEY]: result[CONTEXT_KEEPER_DATA_KEY] && typeof result[CONTEXT_KEEPER_DATA_KEY] === "object" ? result[CONTEXT_KEEPER_DATA_KEY] : {},
    [STORY_DAY_TRACKER_KEY]: result[STORY_DAY_TRACKER_KEY] && typeof result[STORY_DAY_TRACKER_KEY] === "object" ? result[STORY_DAY_TRACKER_KEY] : {},
    [PERSONAS_KEY]: personas,
    [PERSONA_ORG_KEY]: cleanedPersonaOrg,
    [OOC_TEMPLATES_KEY]: mergeOocTemplateLists([], result[OOC_TEMPLATES_KEY] || currentSettings.oocTemplates),
    [GENERATION_PROFILES_KEY]: normalizeGenerationProfiles(result[GENERATION_PROFILES_KEY]),
    [SMART_FILTER_PRESETS_KEY]: normalizeSmartFilterPresets(result[SMART_FILTER_PRESETS_KEY]),
    [SMART_FILTER_PINNED_KEY]: normalizeSmartFilterPins(result[SMART_FILTER_PINNED_KEY], result[SMART_FILTER_PRESETS_KEY]),
    [BOT_EDITOR_DRAFT_HISTORY_KEY]: normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]),
    [CHAT_BOOKMARKS_KEY]: normalizeChatBookmarksForCleanup(result[CHAT_BOOKMARKS_KEY]),
    [RECENTLY_SEEN_BOTS_KEY]: normalizeRecentlySeenStore(result[RECENTLY_SEEN_BOTS_KEY])
  };

  try {
    await createRecoverySnapshot("before local data cleanup", result);
  } catch {
    if (status) status.textContent = "Cleanup cancelled: recovery snapshot could not be verified.";
    showSettingsToast("Cleanup cancelled because the recovery snapshot could not be verified.");
    return;
  }
  const cleanupStored = await storageSetVerified(payload);
  if (!cleanupStored) {
    if (status) status.textContent = "Cleanup could not be verified. The recovery snapshot was kept.";
    showSettingsToast("Cleanup write could not be verified; recovery snapshot kept.");
    return;
  }
  const afterBytes = await storageBytesInUse(null);
  await load();

  const saved = Number.isFinite(beforeBytes) && Number.isFinite(afterBytes)
    ? Math.max(0, beforeBytes - afterBytes)
    : 0;
  if (status) {
    status.textContent = saved > 0
      ? `Cleanup finished. Removed duplicates/orphaned metadata and freed about ${(saved / 1024).toFixed(1)} KB.`
      : "Cleanup finished. Saved lists are normalized and no duplicate/orphan cleanup was needed.";
  }
  showSettingsToast("Local QoL data cleaned.");
}


function formatControlBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return "n/a";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value >= 10240 ? 0 : 1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 1 : 2)} MB`;
}

function jumpToOptionsSearch(tabName, query = "") {
  setActiveTab(tabName);
  setSettingsSearchExpanded(true, { focus: !!query });
  if (!query) return;
  const input = $("settingsSearch");
  if (!input) return;
  input.value = query;
  input.focus();
  window.setTimeout(() => input.dispatchEvent(new Event("input", { bubbles: true })), 10);
}

async function renderCreatorWorkspace() {
  const summary = $("creatorWorkspaceSummary");
  const relations = $("creatorRelationshipView");
  if (!summary || !relations) return;
  const result = await storageGet([BOT_ARCHIVE_KEY, LOREBOOK_BACKUPS_KEY, BOT_EDITOR_DRAFT_HISTORY_KEY, CHATBOT_LOREBOOK_LINKS_KEY, "settings"]);
  const bots = normalizeBotArchive(result[BOT_ARCHIVE_KEY]).meta;
  const books = normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]).meta;
  const drafts = normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]).entries;
  const links = result[CHATBOT_LOREBOOK_LINKS_KEY] && typeof result[CHATBOT_LOREBOOK_LINKS_KEY] === "object" ? result[CHATBOT_LOREBOOK_LINKS_KEY] : {};
  const cfg = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  const botList = Object.values(bots);
  const bookList = Object.values(books);
  const ownBots = botList.filter(bot => bot.ownBot);
  const versionCount = ownBots.reduce((n, bot) => n + (Array.isArray(bot.versions) ? bot.versions.length : 0), 0);
  const revisionCount = ownBots.reduce((n, bot) => n + (Array.isArray(bot.revisions) ? bot.revisions.length : 0), 0);
  const draftCount = Object.values(drafts).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0);
  const staleBots = cfg.botBackupToolsEnabled && cfg.botArchiveOwnEditorBackups ? ownBots.filter(bot => Number(bot.lastSavedAt || 0) && Date.now() - Number(bot.lastSavedAt) > CREATOR_BACKUP_STALE_MS).length : 0;
  const staleBooks = cfg.lorebookBackupToolsEnabled && cfg.lorebookBackupsEnabled ? bookList.filter(book => Number(book.lastSavedAt || 0) && Date.now() - Number(book.lastSavedAt) > CREATOR_BACKUP_STALE_MS).length : 0;
  const cards = [
    ["Own bot backups", ownBots.length, `${versionCount} recorded bot version${versionCount === 1 ? "" : "s"} · ${revisionCount} safety revision${revisionCount === 1 ? "" : "s"}${staleBots ? ` · ${staleBots} stale` : ""}`],
    ["Lorebook backups", bookList.length, `${bookList.reduce((n, book) => n + Object.keys(book.entries || {}).length, 0)} saved entries${staleBooks ? ` · ${staleBooks} stale` : ""}`],
    ["Editor drafts", draftCount, `${Object.keys(drafts).length} bot/draft workspace${Object.keys(drafts).length === 1 ? "" : "s"}`],
    ["Known bot ↔ Lorebook links", Object.keys(links).length, "Learned when attached Lorebooks are visible on Edit Chatbot"]
  ];
  summary.replaceChildren(...cards.map(([label, count, detail]) => makeElement("div", { className: "control-summary-card" }, [
    makeElement("strong", { text: `${label}: ${count}` }), makeElement("small", { text: detail })
  ])));

  const relationRows = Object.values(links).filter(row => row && typeof row === "object").sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 12);
  if (!relationRows.length) {
    relations.replaceChildren(makeElement("span", { className: "hint", text: "No bot ↔ Lorebook relationships learned yet. Open an attached Lorebook card on Edit Chatbot once and QoL can remember the connection locally." }));
    return;
  }
  relations.replaceChildren(makeElement("strong", { text: "Recent bot ↔ Lorebook relationships" }), ...relationRows.map(row => {
    const bot = bots[row.chatbotId];
    const book = books[row.lorebookId];
    const wrap = makeElement("div", { className: "creator-relation-row" });
    const text = makeElement("span", { text: `${bot?.name || row.chatbotId || "Chatbot"} → ${book?.name || row.lorebookName || row.lorebookId || "Lorebook"}` });
    const open = makeElement("button", { text: "Open Lorebook", attrs: { type: "button" } });
    open.addEventListener("click", () => {
      if (row.lorebookId) window.open(`https://spicychat.ai/lorebook/edit/${encodeURIComponent(row.lorebookId)}/entries`, "_blank", "noopener");
      else window.open(`https://spicychat.ai/my-creations/lorebooks?search=${encodeURIComponent(row.lorebookName || "")}`, "_blank", "noopener");
    });
    wrap.append(text, open);
    return wrap;
  }));
}

async function collectDataHealth() {
  const keys = [...new Set([...BACKUP_STORAGE_KEYS, RECOVERY_SNAPSHOT_KEY, CHATBOT_LOREBOOK_LINKS_KEY, LOCAL_CHANGE_HISTORY_KEY, CARD_TOKEN_CACHE_KEY])];
  const checked = await storageGetChecked(keys);
  const rows = [];
  if (!checked.ok) return { ok: false, rows: [{ state: "bad", label: "Browser storage", detail: checked.error || "Could not read local storage." }], summaryText: `Browser storage read failed: ${checked.error || "unknown error"}` };
  const result = checked.data;
  const totalBytes = await storageBytesInUse(null);
  rows.push({ state: "ok", label: "Browser storage", detail: `Readable${Number.isFinite(totalBytes) ? ` · ${formatControlBytes(totalBytes)} used` : ""}.` });

  try {
    const payload = buildExportPayload(new Set(LIGHTWEIGHT_BACKUP_SCOPE_IDS), result);
    const roundTrip = JSON.parse(JSON.stringify(payload));
    const validation = validateBackupObject(roundTrip);
    rows.push({ state: validation.ok ? "ok" : "bad", label: "Backup schema", detail: validation.ok ? `Current local data produces a valid schema v${BACKUP_FORMAT_VERSION} backup.` : validation.warnings.join(" · ") });
  } catch (error) {
    rows.push({ state: "bad", label: "Backup schema", detail: error?.message || String(error) });
  }

  const snapshot = normalizeRecoverySnapshot(result[RECOVERY_SNAPSHOT_KEY]);
  rows.push({ state: "ok", label: "Recovery snapshot", detail: snapshot ? `Available from ${creatorBackupDate(snapshot.createdAt)} (${snapshot.reason || "manual snapshot"}).` : "None saved. This is normal until a protected import/cleanup or manual snapshot creates one." });

  let cleanupCandidates = 0;
  const opened = uniqueClean(result[OPENED_KEY] || []);
  cleanupCandidates += orphanedMetaCount(result[OPENED_META_KEY], opened);
  for (const [key, keepNames] of [[BLOCKED_BOTS_KEY, true], [NOT_INTERESTED_KEY, false], [FAVORITE_BOTS_KEY, false], [LATER_BOTS_KEY, false]]) {
    const store = normalizeBotStore(result[key]);
    const allowed = [...store.ids, ...(keepNames ? store.names : []), ...(keepNames ? store.names.map(name => `name:${name}`) : [])];
    cleanupCandidates += orphanedMetaCount(result[key]?.meta, allowed);
  }
  rows.push({ state: cleanupCandidates ? "warn" : "ok", label: "Supported orphan check", detail: cleanupCandidates ? `${cleanupCandidates} orphaned metadata record${cleanupCandidates === 1 ? "" : "s"} can be reviewed/cleaned in Data & Backup.` : "No supported orphaned metadata records found." });

  const botArchive = normalizeBotArchive(result[BOT_ARCHIVE_KEY]);
  const badArchives = Object.values(botArchive.meta).filter(bot => !bot.coverage?.length).length;
  const lorebooks = normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]);
  const badLorebookEntries = Object.values(lorebooks.meta).reduce((n, book) => n + Object.values(book.entries || {}).filter(entry => !entry.name).length, 0);
  rows.push({ state: badArchives || badLorebookEntries ? "warn" : "ok", label: "Creator backups", detail: badArchives || badLorebookEntries ? `${badArchives} empty bot archive${badArchives === 1 ? "" : "s"}; ${badLorebookEntries} malformed Lorebook entr${badLorebookEntries === 1 ? "y" : "ies"}.` : `${Object.keys(botArchive.meta).length} bot copies and ${Object.keys(lorebooks.meta).length} Lorebook backups normalize cleanly.` });

  if (Number.isFinite(totalBytes) && totalBytes > 20 * 1024 * 1024) rows.push({ state: "warn", label: "Storage size", detail: `QoL is using ${formatControlBytes(totalBytes)}. Use the breakdown below before deleting anything.` });
  const warnings = rows.filter(row => row.state === "warn").length;
  const errors = rows.filter(row => row.state === "bad").length;
  const summaryText = `${errors ? `${errors} error${errors === 1 ? "" : "s"}` : "No errors"}; ${warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "no warnings"}; ${Number.isFinite(totalBytes) ? formatControlBytes(totalBytes) : "unknown size"} local QoL storage.`;
  return { ok: !errors, rows, summaryText };
}

function renderHealthRows(health, host = $("controlHealthResults")) {
  if (!host) return;
  host.replaceChildren(...(health?.rows || []).map(row => makeElement("div", { className: "control-health-row", dataset: { state: row.state || "ok" } }, [
    makeElement("strong", { text: row.label || "Check" }), makeElement("div", { text: row.detail || "" })
  ])));
}

async function renderControlStorageBreakdown() {
  const host = $("controlStorageBreakdown");
  if (!host) return;
  const rows = [];
  for (const def of STORAGE_DATASET_DEFS) {
    const bytes = await storageBytesInUse(def.keys);
    if (!Number.isFinite(bytes) || bytes <= 0) continue;
    rows.push({ label: def.label, bytes });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  const shown = rows.slice(0, 12);
  if (!shown.length) {
    host.replaceChildren(makeElement("span", { className: "hint", text: "Per-dataset storage size is not available in this browser." }));
    return;
  }
  host.replaceChildren(...shown.map(row => makeElement("div", { className: "control-storage-card" }, [makeElement("strong", { text: row.label }), makeElement("small", { text: formatControlBytes(row.bytes) })])));
}

async function runFullDataHealth() {
  const host = $("controlHealthResults");
  if (host) host.replaceChildren(makeElement("span", { className: "hint", text: "Checking local QoL data…" }));
  const health = await collectDataHealth();
  renderHealthRows(health, host);
  await renderControlStorageBreakdown();
  return health;
}

async function runMigrationDryRun() {
  const host = $("controlHealthResults");
  try {
    const result = await readBackupSourceData();
    const payload = buildExportPayload(new Set(LIGHTWEIGHT_BACKUP_SCOPE_IDS), result);
    const serialized = JSON.stringify(payload);
    const parsed = JSON.parse(serialized);
    const validation = validateBackupObject(parsed);
    const row = { state: validation.ok ? "ok" : "bad", label: "Migration dry-run", detail: validation.ok ? `Passed without writing anything · ${formatControlBytes(new Blob([serialized]).size)} serialized · ${validation.entries.length} supported categories.` : validation.warnings.join(" · ") };
    if (host) host.prepend(makeElement("div", { className: "control-health-row", dataset: { state: row.state } }, [makeElement("strong", { text: row.label }), makeElement("div", { text: row.detail })]));
  } catch (error) {
    if (host) host.prepend(makeElement("div", { className: "control-health-row", dataset: { state: "bad" } }, [makeElement("strong", { text: "Migration dry-run" }), makeElement("div", { text: error?.message || String(error) })]));
  }
}

function performancePageFamily(path) {
  const value = String(path || "");
  if (/^\/chat\/:id/.test(value) || /^\/chat\//.test(value)) return "chat";
  if (/^\/chatbot\/edit/.test(value) || /^\/chatbot\/create/.test(value)) return "bot-editor";
  if (/^\/lorebook\/(?:edit|create)/.test(value)) return "lorebook-editor";
  if (/^\/creator\//.test(value)) return "creator";
  if (/^\/my-creations\//.test(value)) return "my-creations";
  if (/^\/chats/.test(value)) return "chat-list";
  if (value === "/" || /^\/(?:recommended-bots|favorite-bots)/.test(value)) return "listing";
  return "other";
}

function performanceSnapshotFromContext(context) {
  const runtimeAvailable = !!(context?.runtimeAvailable && context?.pageDiagnostics);
  const runtime = context?.pageDiagnostics?.runtimePerformance || {};
  const perf = Array.isArray(context?.pageDiagnostics?.performance) ? context.pageDiagnostics.performance : [];
  const byName = name => perf.find(entry => String(entry?.name || "").toLowerCase() === name)?.maxMs || 0;
  const page = sanitizeDiagnosticPath(context?.url || "");
  const sampleStartedAt = Number(runtime.sampleStartedAt || 0);
  const sampleSeconds = sampleStartedAt ? Math.max(1, (Date.now() - sampleStartedAt) / 1000) : 0;
  return {
    savedAt: Date.now(),
    page,
    pageFamily: performancePageFamily(page),
    sampleSeconds: Math.round(sampleSeconds * 10) / 10,
    schedulerRuns: Number(runtime.runtimeKernelRuns || 0),
    longTaskMaxMs: Number(runtime.maxLongTaskMs || 0),
    longTasks: Number(runtime.longTasks || 0),
    messageLaneRequests: Number(runtime.messageLaneScheduleRequests || runtime.messageLaneSchedules || 0),
    messageLaneRuns: Number(runtime.messageLaneRuns || 0),
    messageLaneCoalesced: Number(runtime.messageLaneScheduleCoalesced || 0),
    cacheInvalidations: Number(runtime.messageCacheInvalidations || 0),
    mutations: Number(runtime.mutations || 0),
    quickPanelUpdateMaxMs: Number(byName("update panel") || 0),
    quickPanelCreateMaxMs: Number(byName("create panel") || 0),
    quickPanelRefreshCoalesced: Number(runtime.quickPanelUpdateCoalesced || 0),
    runtimePlanCacheHits: Number(runtime.runtimePlanCacheHits || 0),
    buildBundleStepSkips: Number(runtime.buildBundleStepSkips || 0)
  };
}

async function savePerformanceBaseline() {
  const status = $("controlSupportStatus");
  const context = await runtimeMessage({ type: "DS_GET_DIAGNOSTIC_CONTEXT" });
  if (!context?.pageDiagnostics) {
    if (status) status.textContent = "No reachable source SpicyChat tab. Open Settings from a SpicyChat tab and try again.";
    return null;
  }
  const snapshot = performanceSnapshotFromContext(context);
  await storageSet({ [PERFORMANCE_BASELINE_KEY]: snapshot });
  if (status) status.textContent = `Performance baseline saved from ${snapshot.page || "the source page"}.`;
  return snapshot;
}

function percentChange(current, baseline) {
  const a = Number(current || 0), b = Number(baseline || 0);
  if (!b) return a ? "new" : "same";
  const pct = ((a - b) / b) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%`;
}

async function comparePerformanceBaseline({ returnText = false } = {}) {
  const result = await storageGet([PERFORMANCE_BASELINE_KEY]);
  const baseline = result[PERFORMANCE_BASELINE_KEY];
  const context = await runtimeMessage({ type: "DS_GET_DIAGNOSTIC_CONTEXT" });
  if (!baseline || !context?.pageDiagnostics) {
    const text = !baseline ? "No performance baseline saved yet." : "No reachable source SpicyChat tab for comparison.";
    if (!returnText) { const status = $("controlSupportStatus"); if (status) status.textContent = text; }
    return text;
  }
  const current = performanceSnapshotFromContext(context);
  const baselineSeconds = Number(baseline.sampleSeconds || 0);
  const currentSeconds = Number(current.sampleSeconds || 0);
  const sameFamily = !!baseline.pageFamily && baseline.pageFamily === current.pageFamily;
  const durationRatio = baselineSeconds && currentSeconds ? Math.max(baselineSeconds, currentSeconds) / Math.max(1, Math.min(baselineSeconds, currentSeconds)) : Infinity;
  if (!baseline.pageFamily || !baselineSeconds) {
    const text = "The saved baseline is from the older comparison format. Save a new performance baseline first.";
    if (!returnText) { const status = $("controlSupportStatus"); if (status) status.textContent = text; }
    return text;
  }
  if (!sameFamily || durationRatio > 4) {
    const text = `Baseline not directly comparable: saved ${baseline.pageFamily || baseline.page || "unknown"} for ${Math.round(baselineSeconds)}s, current ${current.pageFamily || current.page || "unknown"} for ${Math.round(currentSeconds)}s. Save a baseline on the same page type after a similar amount of use.`;
    if (!returnText) { const status = $("controlSupportStatus"); if (status) status.textContent = text; }
    return text;
  }
  const perMinute = (value, seconds) => Number(value || 0) * 60 / Math.max(1, Number(seconds || 1));
  const rawMetrics = [
    ["Browser long-task max", "longTaskMaxMs", "ms"],
    ["Mini Panel update max", "quickPanelUpdateMaxMs", "ms"],
    ["Mini Panel create max", "quickPanelCreateMaxMs", "ms"]
  ];
  const rateMetrics = [
    ["Message-lane requests/min", "messageLaneRequests"],
    ["Message-lane runs/min", "messageLaneRuns"],
    ["Cache invalidations/min", "cacheInvalidations"],
    ["DOM mutations/min", "mutations"],
    ["Mini Panel coalesced/min", "quickPanelRefreshCoalesced"],
    ["Runtime-plan cache hits/min", "runtimePlanCacheHits"],
    ["Omitted-bundle skips/min", "buildBundleStepSkips"]
  ];
  const lines = rawMetrics.map(([label, key, unit]) => `${label}: ${baseline[key] || 0}${unit} → ${current[key] || 0}${unit} (${percentChange(current[key], baseline[key])})`);
  for (const [label, key] of rateMetrics) {
    const before = perMinute(baseline[key], baselineSeconds);
    const after = perMinute(current[key], currentSeconds);
    lines.push(`${label}: ${before.toFixed(1)} → ${after.toFixed(1)} (${percentChange(after, before)})`);
  }
  const heading = `Baseline saved ${new Date(Number(baseline.savedAt || 0)).toLocaleString()} · ${baseline.pageFamily} · ${Math.round(baselineSeconds)}s vs ${Math.round(currentSeconds)}s`;
  if (returnText) return [heading, ...lines].join("\n");
  const host = $("controlPerformanceDiff");
  if (host) host.replaceChildren(...lines.map(line => makeElement("div", { className: "control-performance-row", text: line })));
  const status = $("controlSupportStatus");
  if (status) status.textContent = `Compared with a matching ${baseline.pageFamily} baseline. Count metrics are normalized per minute.`;
  return lines.join("\n");
}

async function setupControlCenterView() {
  if (activeOptionsTab() !== "control") return;
  await Promise.all([renderCreatorWorkspace(), renderControlStorageBreakdown()]);
}

function setupControlCenterControls() {
  $("openCommandPaletteFromOptions")?.addEventListener("click", async () => {
    await storageSet({ settings: readSettingsFromPage() });
    const status = $("commandPaletteStatus");
    const response = await runtimeMessage({ type: "DS_OPTIONS_OPEN_COMMAND_PALETTE" });
    if (status) status.textContent = response?.ok ? "Palette opened in the SpicyChat source tab." : (response?.error || "Open Settings from a SpicyChat tab first.");
  });
  $("clearCommandPaletteHistory")?.addEventListener("click", async () => {
    const status = $("commandPaletteStatus");
    const response = await runtimeMessage({ type: "DS_OPTIONS_CLEAR_COMMAND_PALETTE" });
    if (status) status.textContent = response?.ok ? "Palette pins and recent actions cleared on the source SpicyChat site." : (response?.error || "Could not reach the source SpicyChat tab.");
  });
  $("openCreatorBackupManager")?.addEventListener("click", () => jumpToOptionsSearch("bot-tools", "backup manager"));
  $("openCreationAuditSettings")?.addEventListener("click", () => jumpToOptionsSearch("bot-tools", "creation audit"));
  $("openWikiImporterSettings")?.addEventListener("click", () => jumpToOptionsSearch("bot-tools", "wiki web lorebook import"));
  $("openDataTools")?.addEventListener("click", () => setActiveTab("data"));
  $("runFullDataHealth")?.addEventListener("click", runFullDataHealth);
  $("runMigrationDryRun")?.addEventListener("click", runMigrationDryRun);
  $("savePerformanceBaseline")?.addEventListener("click", savePerformanceBaseline);
  $("comparePerformanceBaseline")?.addEventListener("click", () => comparePerformanceBaseline());
  $("controlCopySupport")?.addEventListener("click", async () => {
    const status = $("controlSupportStatus");
    if (status) status.textContent = "Building diagnostics, performance, self-check, data health and baseline comparison…";
    const copied = await copyAllSupportInfo();
    if (status) status.textContent = copied
      ? "Full support check copied. It includes no chat text or saved private content."
      : "Clipboard access failed; the full support check was placed in Data & Backup instead.";
  });
  $("controlDownloadSupport")?.addEventListener("click", async () => {
    const status = $("controlSupportStatus");
    if (status) status.textContent = "Building full support check for download…";
    const downloaded = await downloadAllSupportInfo();
    if (status) status.textContent = downloaded
      ? "Full support check downloaded. It includes no chat text or saved private content."
      : "Could not download the full support check; review Quick diagnostics for details.";
  });
}

let lastPerformanceSelfCheckText = "";

function supportReportFilename(kind = "support-info") {
  const manifest = chrome.runtime.getManifest?.() || {};
  const version = String(manifest.version_name || displayReleaseVersion(manifest.version || "unknown") || "unknown")
    .replace(/[^0-9A-Za-z._-]+/g, "-");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeKind = String(kind || "support-info").replace(/[^0-9A-Za-z._-]+/g, "-");
  return `spicychat-qol-${safeKind}-v${version}-${stamp}.txt`;
}

async function downloadSupportText(text, filename, successMessage = "Support report downloaded.") {
  const status = $("diagnosticsStatus");
  const body = String(text || "");
  if (!body.trim()) {
    if (status) status.textContent = "There is no report to download yet.";
    return false;
  }

  const mime = "text/plain;charset=utf-8";
  try {
    if (await tryNativeBackupSave(body, filename, mime)) {
      if (status) status.textContent = successMessage;
      return true;
    }
  } catch {}

  try {
    if (optionsLooksMobile() && chrome.downloads?.download) {
      const allowed = await requestBrowserDownloadsPermission();
      if (allowed && await browserManagerDownload(body, filename, mime, true)) {
        if (status) status.textContent = successMessage;
        return true;
      }
    }
  } catch {}

  try {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (status) status.textContent = successMessage;
    return true;
  } catch (error) {
    const box = $("settingsJson");
    if (box) {
      box.value = body;
      setActiveTab("data");
      box.focus();
      box.select();
    }
    if (status) status.textContent = `Download failed${error?.message ? `: ${error.message}` : "."} The report was placed in Data / Backup instead.`;
    return false;
  }
}

function sanitizeDiagnosticPath(url) {
  try {
    const parsed = new URL(url || "");
    return parsed.pathname
      .replace(/\/(chat|chats|chatbot|story|lorebook)\/[0-9a-f-]{8,}/ig, "/$1/:id")
      .replace(/\/(creator|profile)\/[^/]+/ig, "/$1/:name");
  } catch {
    return "unknown";
  }
}

async function copyDiagnostics({ returnOnly = false } = {}) {
  const status = $("diagnosticsStatus");
  if (status && !returnOnly) status.textContent = "Building diagnostic info...";

  const result = await storageGet([
    "settings",
    OPENED_KEY,
    BLOCKED_BOTS_KEY,
    NOT_INTERESTED_KEY,
    FAVORITE_CREATORS_KEY,
    FOLLOWED_CREATORS_KEY,
    FAVORITE_BOTS_KEY,
    LATER_BOTS_KEY,
    BOT_ORGANIZER_KEY,
    CHAT_ORGANIZER_KEY,
    BOT_AVAILABILITY_KEY,
    BOT_ARCHIVE_KEY,
    PERSONAS_KEY,
    LEGACY_PERSONAS_KEY,
    PERSONA_ORG_KEY,
    OOC_TEMPLATES_KEY,
    GENERATION_PROFILES_KEY,
    SMART_FILTER_PRESETS_KEY,
    SMART_FILTER_PINNED_KEY,
    BOT_EDITOR_DRAFT_HISTORY_KEY,
    CHAT_BOOKMARKS_KEY,
    RECOVERY_SNAPSHOT_KEY,
    SAI_TOOLKIT_PRESENCE_KEY,
    SPICYCHAT_BETA_CAPABILITIES_KEY,
    "cardTokenFetchDiagnosticsV1"
  ]);
  const context = await runtimeMessage({ type: "DS_GET_DIAGNOSTIC_CONTEXT" });
  const bytes = await storageBytesInUse(null);
  const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  const enabledFeatures = OPTIONAL_FEATURE_KEYS.filter(key => settings[key] === true);
  const personas = Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY] : result[LEGACY_PERSONAS_KEY];

  const diagnosticLines = [
    "SpicyChat QoL diagnostics",
    `Generated: ${new Date().toISOString()}`,
    `Version: ${chrome.runtime.getManifest?.().version_name || displayReleaseVersion(chrome.runtime.getManifest?.().version || "unknown")}`,
    `Browser: ${navigator.userAgent}`,
    `Platform: ${navigator.platform || "unknown"}`,
    (() => { const p = context?.pageDiagnostics?.buildProfile; return context?.runtimeAvailable && context?.pageDiagnostics ? `Build profile: ${p?.label || p?.id || "Full"}; bundles ${(p?.bundles || []).join(", ") || "unknown"}` : "Build profile: unavailable with runtime data"; })(),
    `SpicyChat page: ${sanitizeDiagnosticPath(context?.url || "")}`,
    `Runtime data: ${context?.runtimeAvailable && context?.pageDiagnostics ? "available" : "unavailable — no open SpicyChat tab responded to diagnostics; runtime counters below are omitted or unavailable"}`,
    (() => { const p = context?.pageDiagnostics?.diagnosticProtocol; return p ? `Dragon's SpicyChat Diagnostic Extension protocol: v${Number(p.protocolVersion || 1)}; ${p.inspectorConnected ? `paired${p.inspectorVersion ? ` with Inspector ${p.inspectorVersion}` : " with Inspector"}` : "Inspector not currently paired"}; QoL ${p.runState || "unknown"}` : "Dragon's SpicyChat Diagnostic Extension protocol: unavailable with runtime data"; })(),
    `S.AI Toolkit detected: ${result[SAI_TOOLKIT_PRESENCE_KEY]?.detected ? "yes" : "no"}`,
    (() => { const beta = result[SPICYCHAT_BETA_CAPABILITIES_KEY] || {}; const caps = beta.capabilities || {}; return `SpicyChat beta/experimental access: ${beta.detected ? "detected" : "not detected"}; Public Lorebooks ${caps.publicLorebooks || "unknown"}; Story Mode ${caps.storyMode || "unknown"}`; })(),
    `S.AI compatibility enabled: ${settings.saiToolkitCompatibility ? "yes" : "no"}`,
    Number.isFinite(bytes) ? `QoL storage: ${(bytes / 1024).toFixed(1)} KB` : "QoL storage: unavailable",
    `Backup schema supported: v${BACKUP_FORMAT_VERSION}`,
    (() => { const snap = normalizeRecoverySnapshot(result[RECOVERY_SNAPSHOT_KEY]); return snap ? `Recovery snapshot: yes (${snap.createdAt ? new Date(snap.createdAt).toISOString() : "unknown time"}; ${snap.reason})` : "Recovery snapshot: none"; })(),
    `Opened: ${countStoreItems(result[OPENED_KEY], "opened")}`,
    `Blocked: ${countStoreItems(result[BLOCKED_BOTS_KEY])}`,
    `Not interested: ${countStoreItems(result[NOT_INTERESTED_KEY])}`,
    `Favorite bots: ${countStoreItems(result[FAVORITE_BOTS_KEY])}`,
    `Favorite creators: ${countStoreItems(result[FAVORITE_CREATORS_KEY], "creator")}`,
    `Followed creators: ${countStoreItems(result[FOLLOWED_CREATORS_KEY], "creator")}`,
    `Later: ${countStoreItems(result[LATER_BOTS_KEY])}`,
    `Bot organization: ${Object.keys(result[BOT_ORGANIZER_KEY]?.meta || {}).length}`,
    `Chat organization: ${Object.keys(normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]).meta).length}`,
    `Bot availability checks: ${Object.keys(normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]).meta).length}`,
    `Saved bot copies: ${Object.keys(normalizeBotArchive(result[BOT_ARCHIVE_KEY]).meta).length}`,
    `Personas: ${countStoreItems(personas, "persona")}`,
    `Persona organization: ${Object.keys(result[PERSONA_ORG_KEY]?.meta || {}).length}`,
    `OOC presets: ${countStoreItems(result[OOC_TEMPLATES_KEY], "ooc")}`,
    `Generation profiles: ${countStoreItems(result[GENERATION_PROFILES_KEY], "profiles")}`,
    `Smart filter presets: ${normalizeSmartFilterPresets(result[SMART_FILTER_PRESETS_KEY]).length}; pinned: ${normalizeSmartFilterPins(result[SMART_FILTER_PINNED_KEY], result[SMART_FILTER_PRESETS_KEY]).length}`,
    `Editor draft snapshots: ${Object.values(normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]).entries).reduce((n, list) => n + list.length, 0)}`,
    `Message bookmarks: ${Object.values(result[CHAT_BOOKMARKS_KEY] || {}).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0)}`,
    `Enabled optional features (${enabledFeatures.length}): ${enabledFeatures.join(", ") || "none"}`
  ];

  const runtimeLog = Array.isArray(context?.pageDiagnostics?.runtimeLog) ? context.pageDiagnostics.runtimeLog.slice(-60) : [];
  if (runtimeLog.length) {
    diagnosticLines.push(`QoL runtime log: ${runtimeLog.length} recent entries`);
    for (const entry of runtimeLog) {
      const when = entry?.at ? new Date(Number(entry.at)).toISOString() : "unknown-time";
      const detail = entry?.detail ? ` | ${entry.detail}` : "";
      diagnosticLines.push(`  ${when} [${entry?.level || "info"}] ${entry?.area || "runtime"}: ${entry?.message || ""}${detail}`);
    }
  } else {
    diagnosticLines.push(context?.runtimeAvailable ? "QoL runtime log: no recent entries" : "QoL runtime log: unavailable because no open SpicyChat content runtime responded");
  }

  const tokenFetchDiag = result.cardTokenFetchDiagnosticsV1 && typeof result.cardTokenFetchDiagnosticsV1 === "object" ? result.cardTokenFetchDiagnosticsV1 : null;
  if (tokenFetchDiag) {
    diagnosticLines.push(`Card token fetch: background ${Number(tokenFetchDiag.requests || 0)} requests / ${Number(tokenFetchDiag.successes || 0)} success; MAIN-world ${Number(tokenFetchDiag.mainWorldRequests || 0)} requests / ${Number(tokenFetchDiag.mainWorldSuccesses || 0)} success / ${Number(tokenFetchDiag.mainWorldFailures || 0)} failed, captured-auth ${Number(tokenFetchDiag.mainWorldCapturedAuth || 0)}; ${Number(tokenFetchDiag.timeouts || 0)} background timeouts; HTTP 401 ${Number(tokenFetchDiag.http401 || 0)}, 403 ${Number(tokenFetchDiag.http403 || 0)}, 404 ${Number(tokenFetchDiag.http404 || 0)}, 429 ${Number(tokenFetchDiag.http429 || 0)}, other ${Number(tokenFetchDiag.httpOther || 0)}; network ${Number(tokenFetchDiag.networkFailures || 0)}; parse ${Number(tokenFetchDiag.parseFailures || 0)}; auth provided ${Number(tokenFetchDiag.authProvided || 0)} / missing ${Number(tokenFetchDiag.authMissing || 0)}; IndexedDB auth ${Number(tokenFetchDiag.indexedDbAuth || 0)}; last ${tokenFetchDiag.lastStatus || "none"}${Number(tokenFetchDiag.lastHttpStatus || 0) ? ` HTTP ${Number(tokenFetchDiag.lastHttpStatus || 0)}` : ""} in ${Number(tokenFetchDiag.lastElapsedMs || 0)} ms`);
  } else {
    diagnosticLines.push("Card token fetch: no background fetch attempts recorded yet");
  }
  {
    const archiveRuntime = context?.pageDiagnostics?.runtimePerformance || {};
    diagnosticLines.push(`Bot archive preservation: ${Number(archiveRuntime.botArchiveSeenQueued || 0)} public observations queued; ${Number(archiveRuntime.botArchiveSeenMerged || 0)} merged in ${Number(archiveRuntime.botArchiveSeenBatches || 0)} batched flushes; ${Number(archiveRuntime.botArchiveSeenUnchanged || 0)} unchanged snapshots skipped; ${Number(archiveRuntime.botArchiveWrites || 0)} archive writes; ${Number(archiveRuntime.ownBotBackupSaves || 0)} own-bot editor saves`);
  }

  const refill = context?.pageDiagnostics?.listingRefill;
  if (refill) {
    diagnosticLines.push(`Listing refill: ${Number(refill.visible || 0)}/${Number(refill.target || settings.autoFillTargetCards || 50)} visible; ${Number(refill.hidden || 0)} hidden; ${Number(refill.pagesLoaded || 0)} helper pages; ${Number(refill.received || 0)} cards received; ${Number(refill.metadataExtracted || 0)} metadata records; ${Number(refill.tagsRestored || 0)} tag rows rebuilt; ${Number(refill.appended || 0)} added; ${Number(refill.duplicates || 0)} duplicates; ${Number(refill.blockedRejected || 0)} blocked rejects (${Number(refill.blockedBotRejected || 0)} explicit bots, ${Number(refill.blockedCreatorRejected || 0)} creators, ${Number(refill.blockedTagRejected || 0)} tags, ${Number(refill.blockedWordRejected || 0)} words); ${Number(refill.languageRejected || 0)} language rejects; ${Number(refill.smartFilterRejected || 0)} Smart Filter rejects; ${Number(refill.helperFailures || 0)} helper failures; ${Number(refill.helperReuses || 0)} helper reuses; ${Number(refill.helperRecoveries || 0)} helper recoveries; ${Number(refill.helperGcClosed || 0)} stale helper tabs closed; last page ${Number(refill.lastPage || 0) || "—"}; ${refill.running ? (refill.stopping ? "stopping" : "running") : (refill.paused ? "paused" : "idle")}${refill.lastError ? `; last error: ${refill.lastError}` : ""}`);
  }

  if (settings.performanceDiagnostics && Array.isArray(context?.pageDiagnostics?.performance)) {
    const perf = context.pageDiagnostics.performance.slice(0, 15);
    diagnosticLines.push(`QoL performance mode: ${context?.pageDiagnostics?.runtimePerformance?.mode || settings.runtimePerformanceMode || "adaptive"}`);
    const runtime = context?.pageDiagnostics?.runtimePerformance || {};
    diagnosticLines.push(`QoL scheduler: plan ${runtime.currentRuntimePlan || "unknown"}; ${Number(runtime.schedules || 0)} schedules; ${Number(runtime.messageLaneRuns || 0)} message-lane runs; ${Number(runtime.messageLaneScheduleCoalesced || 0)} duplicate lane schedules coalesced; ${Number(runtime.messageLaneDirtyRoots || 0)} dirty roots processed; last lane ${Number(runtime.lastMessageLaneDirtyRoots || 0)} roots; ${Number(runtime.historyBatches || 0)} history batches; ${Number(runtime.slowLaneQuietDeferrals || 0)} quiet-gap deferrals; ${Number(runtime.disabledFeatureStepSkips || 0)} disabled-feature steps skipped; ${Number(runtime.routeFeatureStepSkips || 0)} off-route feature steps skipped; ${Number(runtime.buildBundleStepSkips || 0)} omitted-bundle steps skipped; ${Number(runtime.runtimeKernelRuns || 0)} kernel-dispatched feature runs; ${Number(runtime.runtimePlanCacheHits || 0)} runtime-plan cache hits; ${Number(runtime.mutations || 0)} mutations; ${Number(runtime.chatLocalMutations || 0)} chat-local; ${Number(runtime.qolOnlyMutations || 0)} QoL-only ignored; ${Number(runtime.deferredWhileScrolling || 0)} scroll deferrals; ${Number(runtime.desktopAppGuardDelays || 0)} desktop-app guard delays; ${Number(runtime.quickPanelStateSkips || 0)} unchanged Mini Panel refreshes skipped; ${Number(runtime.quickPanelLayoutSkips || 0)} unchanged Mini Panel layouts skipped; ${Number(runtime.quickPanelUpdateCoalesced || 0)} rapid Mini Panel refreshes coalesced; ${Number(runtime.loadedChatMessages || 0)} loaded messages; history low-impact ${runtime.historyBatchActive ? "active" : "inactive"}`);
    diagnosticLines.push(`Storage write batching: ${Number(runtime.storageWriteRequests || 0)} save requests → ${Number(runtime.storageWriteBatches || 0)} browser writes; ${Number(runtime.storageWriteMergedKeys || 0)} same-key writes merged; ${Number(runtime.storageWriteImmediateFlushes || 0)} immediate flushes`);
    diagnosticLines.push(`Message edit guard: ${Number(runtime.messageEditGuardsStarted || 0)} started; ${Number(runtime.messageEditGuardsSettled || 0)} settled; ${Number(runtime.messageEditMutationSkips || 0)} edit mutations skipped; ${Number(runtime.messageEditLaneSkips || 0)} lane runs skipped; ${Number(runtime.messageEditCriticalSkips || 0)} critical runs skipped`);
    diagnosticLines.push(`Chat header self-repair: ${Number(runtime.chatHeaderRepairRequests || 0)} repair requests; last source ${runtime.lastChatHeaderRepairSource || "none"}`);
    if (context?.pageDiagnostics?.chatLayout) {
      const layout = context.pageDiagnostics.chatLayout;
      diagnosticLines.push(`Chat layout: viewport ${Number(layout.viewport || 0)} px; root ${Number(layout.root || 0)} px; composer host ${Number(layout.composer || 0)} px; title host ${Number(layout.titleHost || 0)} px; title ${Number(layout.title || 0)} px`);
    }
    diagnosticLines.push(`Opened-history persistence: queued ${Number(runtime.openedSaveQueued || 0)}; coalesced ${Number(runtime.openedSaveCoalesced || 0)}; flushes ${Number(runtime.openedSaveFlushes || 0)}; pending ${Number(runtime.openedSavePending || 0)}; last ${Number(runtime.openedSaveLastMs || 0)} ms`);
    diagnosticLines.push(`Saved/opened lane: ${Number(runtime.savedOpenedLaneSchedules || 0)} schedules; ${Number(runtime.savedOpenedLaneRuns || 0)} runs; last source ${runtime.lastSavedOpenedLaneSource || "none"}`);
    const blockBatchRemaining = runtime.blockedBotRefreshPending ? Math.max(0, Math.ceil((Number(runtime.blockedBotRefreshSettleAt || 0) - Date.now()) / 1000)) : 0;
    diagnosticLines.push(`Blocked-bot refresh batching: ${Number(runtime.blockedBotRefreshDeferrals || 0)} deferred single-block changes; ${Number(runtime.blockedBotRefreshFlushes || 0)} settled refreshes; ${runtime.blockedBotRefreshPending ? `pending (${blockBatchRemaining}s remaining)` : "idle"}`);
    diagnosticLines.push(`Listing name sort: ${runtime.listingSortMode || "native"}; ${Number(runtime.listingSortLoadedCards || 0)} loaded cards; ${Number(runtime.listingSortReorders || 0)} DOM reorders`);
    diagnosticLines.push(`Notification auto-read: ${Number(runtime.notificationAutoReadAttempts || 0)} attempts; ${Number(runtime.notificationAutoReadClicks || 0)} native clicks; ${Number(runtime.notificationAutoReadSuccesses || 0)} cleared; ${Number(runtime.notificationAutoReadUncleared || 0)} still unread; ${Number(runtime.notificationAutoReadMissingButtons || 0)} missing-button checks; ${Number(runtime.notificationAutoReadFailures || 0)} failures; last source ${runtime.notificationAutoReadLastSource || "none"}`);
    diagnosticLines.push(`Incremental chat work: search ${Number(runtime.chatSearchIncrementalUpdates || 0)} updates / ${Number(runtime.chatSearchFullPasses || 0)} full passes; message actions ${Number(runtime.messageOptionsIncrementalUpdates || 0)}; alternate dialogue ${Number(runtime.alternateDialogueIncrementalUpdates || 0)}; translation ${Number(runtime.translationIncrementalUpdates || 0)}`);
    diagnosticLines.push(`Installed desktop-app performance guard: ${runtime.desktopAppGuardActive ? "active" : "inactive"}`);
    diagnosticLines.push(`Message cache: ${Number(runtime.messageCacheHits || 0)} hits; ${Number(runtime.messageCacheMisses || 0)} misses; ${Number(runtime.messageCacheInvalidations || 0)} actual invalidations; ${Number(runtime.messageCacheInvalidationRequests || 0)} requests; ${Number(runtime.messageCacheInvalidationDeduped || 0)} duplicate invalidations avoided; ${Number(runtime.messageCacheNonTextSkips || 0)} non-text message mutations kept cached; ${Number(runtime.messageCacheFingerprintSkips || 0)} unchanged-text invalidations skipped`);
    if (Number(runtime.longTasks || 0)) diagnosticLines.push(`Browser long tasks: ${Number(runtime.longTasks || 0)}; last ${Number(runtime.lastLongTaskMs || 0)} ms; max ${Number(runtime.maxLongTaskMs || 0)} ms; QoL-overlap ${Number(runtime.longTasksWithQolOverlap || 0)}; no-QoL-overlap ${Number(runtime.longTasksWithoutQolOverlap || 0)}; last overlap ${runtime.lastLongTaskOverlap || "none"}`);
    diagnosticLines.push(`QoL performance entries: ${perf.length}`);
    perf.forEach(entry => diagnosticLines.push(`  ${entry.name}: ${entry.calls} calls, avg ${entry.averageMs} ms, max ${entry.maxMs} ms, last ${entry.lastMs || 0} ms, total ${entry.totalMs} ms`));
  }
  if (context?.pageDiagnostics?.androidEnvironment) {
    const env = context.pageDiagnostics.androidEnvironment;
    diagnosticLines.push(`Android detected: ${env.android ? "yes" : "no"}; WebView detected: ${env.webview ? "yes" : "no"}; installed/standalone app: ${env.installedApp ? `yes (${env.displayMode || "standalone"})` : "no"}; Firefox-family: ${env.firefox || env.waterfox ? "yes" : "no"}; Opera: ${env.opera ? "yes" : "no"}`);
  }
  const text = diagnosticLines.join("\n");
  if (returnOnly) return text;

  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = "Copied. No chat text or saved private content was included.";
  } catch {
    const box = $("settingsJson");
    if (box) {
      box.value = text;
      setActiveTab("data");
      box.focus();
      box.select();
    }
    if (status) status.textContent = "Clipboard access failed, so the diagnostic text was placed in Data / Backup instead.";
  }
  return text;
}


async function downloadDiagnostics() {
  const status = $("diagnosticsStatus");
  if (status) status.textContent = "Building diagnostic info for download...";
  try {
    const text = await copyDiagnostics({ returnOnly: true });
    return downloadSupportText(text, supportReportFilename("diagnostics"), "Diagnostic info downloaded. No chat text was included.");
  } catch (error) {
    if (status) status.textContent = `Could not build diagnostic info: ${error?.message || String(error || "unknown error")}`;
    return false;
  }
}


function performanceWarningLines(context, settings) {
  const lines = [];
  const runtime = context?.pageDiagnostics?.runtimePerformance || {};
  const perf = Array.isArray(context?.pageDiagnostics?.performance) ? context.pageDiagnostics.performance : [];
  for (const entry of perf.slice(0, 20)) {
    const max = Number(entry?.maxMs || 0);
    if (max >= 5000) lines.push(`CRITICAL wall-time spike: ${entry.name} max ${max} ms (may include async waiting; compare browser long tasks).`);
    else if (max >= 1000) lines.push(`Large wall-time spike: ${entry.name} max ${max} ms.`);
    else if (max >= 250) lines.push(`Slow QoL step: ${entry.name} max ${max} ms.`);
  }
  const invalidations = Number(runtime.messageCacheInvalidations || 0);
  const requests = Number(runtime.messageCacheInvalidationRequests || 0);
  if (requests >= 500 && invalidations / Math.max(1, requests) > 0.8) lines.push(`High message-cache churn: ${invalidations}/${requests} invalidation requests caused real invalidations.`);
  if (Number(runtime.maxLongTaskMs || 0) >= 250) {
    const overlapMax = Number(runtime.maxLongTaskWithQolOverlapMs || 0);
    const noOverlapMax = Number(runtime.maxLongTaskWithoutQolOverlapMs || 0);
    if (noOverlapMax >= 250 && noOverlapMax >= overlapMax) lines.push(`Browser main-thread stall observed: max ${noOverlapMax} ms with no timed QoL step overlapping it.`);
    else if (overlapMax >= 250) lines.push(`Browser main-thread stall observed: max ${overlapMax} ms while a QoL step was active (${runtime.lastLongTaskOverlap || "overlap source unavailable"}).`);
    else lines.push(`Browser main-thread stall observed: max long task ${Number(runtime.maxLongTaskMs || 0)} ms.`);
  }
  if (Number(runtime.loadedChatMessages || 0) >= Number(settings.largeChatPerformanceThreshold || 500) && !settings.autoPerformanceLargeChats) lines.push(`Large chat detected (${Number(runtime.loadedChatMessages || 0)} messages) while automatic large-chat performance mode is off.`);
  return lines;
}

async function copyPerformanceReport({ returnOnly = false } = {}) {
  const status = $("diagnosticsStatus");
  if (status && !returnOnly) status.textContent = "Building performance report...";
  const stored = await storageGet(["settings", "cardTokenFetchDiagnosticsV1"]);
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  const context = await runtimeMessage({ type: "DS_GET_DIAGNOSTIC_CONTEXT" });
  const manifest = chrome.runtime.getManifest?.() || {};
  const runtimeAvailable = !!(context?.runtimeAvailable && context?.pageDiagnostics);
  const runtime = context?.pageDiagnostics?.runtimePerformance || {};
  const perf = Array.isArray(context?.pageDiagnostics?.performance) ? context.pageDiagnostics.performance.slice(0, 20) : [];
  const env = context?.pageDiagnostics?.androidEnvironment || detectSettingsEnvironment();
  const warnings = runtimeAvailable ? performanceWarningLines(context, settings) : [];
  const readAvg = OPTIONS_PERFORMANCE.storageReads ? OPTIONS_PERFORMANCE.storageReadTotalMs / OPTIONS_PERFORMANCE.storageReads : 0;
  const writeAvg = OPTIONS_PERFORMANCE.storageWrites ? OPTIONS_PERFORMANCE.storageWriteTotalMs / OPTIONS_PERFORMANCE.storageWrites : 0;
  let lines = [
    "SpicyChat QoL performance report",
    `Generated: ${new Date().toISOString()}`,
    `Version: ${manifest.version_name || displayReleaseVersion(manifest.version || "unknown")}`,
    `Browser: ${navigator.userAgent}`,
    `Platform: ${navigator.platform || "unknown"}`,
    (() => { const p = context?.pageDiagnostics?.buildProfile; return context?.runtimeAvailable && context?.pageDiagnostics ? `Build profile: ${p?.label || p?.id || "Full"}; bundles ${(p?.bundles || []).join(", ") || "unknown"}` : "Build profile: unavailable with runtime data"; })(),
    `SpicyChat page: ${sanitizeDiagnosticPath(context?.url || "")}`,
    `Runtime data: ${runtimeAvailable ? "available" : "unavailable — no open SpicyChat tab responded; Options-page measurements below are still valid"}`,
    (() => { const p = context?.pageDiagnostics?.diagnosticProtocol; return p ? `Dragon's SpicyChat Diagnostic Extension protocol: v${Number(p.protocolVersion || 1)}; ${p.inspectorConnected ? `paired${p.inspectorVersion ? ` with Inspector ${p.inspectorVersion}` : " with Inspector"}` : "Inspector not currently paired"}; QoL ${p.runState || "unknown"}; operation markers ${Number(p.counters?.operationsStarted || 0)}/${Number(p.counters?.operationsEnded || 0)}; network markers ${Number(p.counters?.networkStarted || 0)}/${Number(p.counters?.networkEnded || 0)}` : "Dragon's SpicyChat Diagnostic Extension protocol: unavailable"; })(),
    `Environment: Android ${env.android ? "yes" : "no"}; WebView ${env.webview ? "yes" : "no"}; installed/standalone ${env.installedApp ? `yes (${env.displayMode || "standalone"})` : "no"}; Firefox-family ${env.firefox || env.waterfox ? "yes" : "no"}; Opera ${env.opera ? "yes" : "no"}`,
    (() => { const d = stored.cardTokenFetchDiagnosticsV1 || {}; return `Card token fetch: background ${Number(d.requests || 0)}/${Number(d.successes || 0)} success; MAIN ${Number(d.mainWorldRequests || 0)}/${Number(d.mainWorldSuccesses || 0)} success / ${Number(d.mainWorldFailures || 0)} failed, captured-auth ${Number(d.mainWorldCapturedAuth || 0)}; timeouts ${Number(d.timeouts || 0)}; 401 ${Number(d.http401 || 0)}; 403 ${Number(d.http403 || 0)}; 429 ${Number(d.http429 || 0)}; network ${Number(d.networkFailures || 0)}; auth missing ${Number(d.authMissing || 0)}; IndexedDB auth ${Number(d.indexedDbAuth || 0)}; last ${d.lastStatus || "none"} ${Number(d.lastElapsedMs || 0)} ms`; })(),
    `Bot archive preservation: ${Number(runtime.botArchiveSeenQueued || 0)} public observations queued; ${Number(runtime.botArchiveSeenMerged || 0)} merged in ${Number(runtime.botArchiveSeenBatches || 0)} batches; ${Number(runtime.botArchiveSeenUnchanged || 0)} unchanged snapshots skipped; ${Number(runtime.botArchiveWrites || 0)} archive writes; ${Number(runtime.ownBotBackupSaves || 0)} own-bot editor saves`,
    `Performance mode: configured ${settings.runtimePerformanceMode || "adaptive"}; effective ${runtime.mode || settings.runtimePerformanceMode || "adaptive"}`,
    `Performance controls: large-chat auto ${settings.autoPerformanceLargeChats ? "on" : "off"} @ ${Number(settings.largeChatPerformanceThreshold || 500)} messages; defer while typing ${settings.deferQolWhileTyping ? "on" : "off"}; edit quieting ${settings.pauseQolWhileMessageEditing !== false ? "on" : "off"}; hidden-tab pause ${settings.pauseQolInHiddenTabs ? "on" : "off"}; desktop-app guard ${settings.desktopAppPerformanceGuard !== false ? "on" : "off"}; disabled-feature deep sleep ${settings.deepSleepDisabledFeatures !== false ? "on" : "off"}; reduced QoL animations ${settings.reduceQolAnimations ? "on" : "off"}`,
    `Loaded chat messages: ${Number(runtime.loadedChatMessages || 0)}`,
    `Scheduler: plan ${runtime.currentRuntimePlan || "unknown"}; ${Number(runtime.schedules || 0)} schedules; ${Number(runtime.messageLaneSchedules || 0)} message-lane schedule requests; ${Number(runtime.messageLaneScheduleCoalesced || 0)} duplicate requests coalesced; ${Number(runtime.messageLaneRuns || 0)} runs; ${Number(runtime.messageLaneDirtyRoots || 0)} dirty roots; ${Number(runtime.disabledFeatureStepSkips || 0)} disabled-feature steps skipped; ${Number(runtime.routeFeatureStepSkips || 0)} off-route feature steps skipped; ${Number(runtime.buildBundleStepSkips || 0)} omitted-bundle steps skipped; ${Number(runtime.runtimeKernelRuns || 0)} kernel-dispatched feature runs; ${Number(runtime.runtimePlanCacheHits || 0)} runtime-plan cache hits; ${Number(runtime.typingDeferrals || 0)} typing deferrals; ${Number(runtime.deferredWhileScrolling || 0)} scroll deferrals; ${Number(runtime.desktopAppGuardDelays || 0)} installed-app delays; ${Number(runtime.quickPanelStateSkips || 0)} unchanged Mini Panel refreshes skipped; ${Number(runtime.quickPanelLayoutSkips || 0)} unchanged Mini Panel layouts skipped; ${Number(runtime.quickPanelUpdateCoalesced || 0)} rapid Mini Panel refreshes coalesced`,
    `Storage write batching: ${Number(runtime.storageWriteRequests || 0)} save requests → ${Number(runtime.storageWriteBatches || 0)} browser writes; ${Number(runtime.storageWriteMergedKeys || 0)} same-key writes merged; ${Number(runtime.storageWriteImmediateFlushes || 0)} immediate flushes`,
    `Mutations: ${Number(runtime.mutations || 0)} total in ${Number(runtime.observerBatches || 0)} observer batches; ${Number(runtime.chatLocalMutations || 0)} chat-local; ${Number(runtime.composerOnlyMutationSkips || 0)} composer-only skipped; ${Number(runtime.qolOnlyMutations || 0)} QoL-owned ignored (${Number(runtime.observerQolOnlyBatches || 0)} pure + ${Number(runtime.observerMixedQolBatches || 0)} mixed batches)`,
    `Message edit guard: ${Number(runtime.messageEditGuardsStarted || 0)} started; ${Number(runtime.messageEditGuardsSettled || 0)} settled; ${Number(runtime.messageEditMutationSkips || 0)} edit mutations skipped; ${Number(runtime.messageEditLaneSkips || 0)} lane runs skipped; ${Number(runtime.messageEditCriticalSkips || 0)} critical runs skipped`,
    `Chat header self-repair: ${Number(runtime.chatHeaderRepairRequests || 0)} repair requests; last source ${runtime.lastChatHeaderRepairSource || "none"}`,
    ...(context?.pageDiagnostics?.chatLayout ? [`Chat layout: viewport ${Number(context.pageDiagnostics.chatLayout.viewport || 0)} px; root ${Number(context.pageDiagnostics.chatLayout.root || 0)} px; composer host ${Number(context.pageDiagnostics.chatLayout.composer || 0)} px; title host ${Number(context.pageDiagnostics.chatLayout.titleHost || 0)} px; title ${Number(context.pageDiagnostics.chatLayout.title || 0)} px`] : []),
    `Opened-history persistence: queued ${Number(runtime.openedSaveQueued || 0)}; coalesced ${Number(runtime.openedSaveCoalesced || 0)}; flushes ${Number(runtime.openedSaveFlushes || 0)}; pending ${Number(runtime.openedSavePending || 0)}; last ${Number(runtime.openedSaveLastMs || 0)} ms`,
    `Auto-AFK: ${settings.autoAfkEnabled ? "on" : "off"}; ${Math.min(720, Math.max(1, Number(settings.autoAfkHours) || 12))}h; action ${settings.autoAfkAction === "close" ? "close" : "discard"}; scopes ${[settings.autoAfkChats !== false ? "chats" : "", settings.autoAfkHome ? "home" : "", settings.autoAfkProfiles ? "profiles" : ""].filter(Boolean).join(", ") || "none"}`,
    `Disabled-feature deep sleep: ${settings.deepSleepDisabledFeatures !== false ? "on" : "off"}; ${Number(runtime.disabledFeatureStepSkips || 0)} scheduler steps skipped`,
    `Saved/opened lane: ${Number(runtime.savedOpenedLaneSchedules || 0)} schedules; ${Number(runtime.savedOpenedLaneRuns || 0)} runs; last source ${runtime.lastSavedOpenedLaneSource || "none"}`,
    `Blocked-bot refresh batching: ${Number(runtime.blockedBotRefreshDeferrals || 0)} deferred single-block changes; ${Number(runtime.blockedBotRefreshFlushes || 0)} settled refreshes; ${Number(runtime.blockedBotMutationSkips || 0)} immediate listing mutations skipped; ${runtime.blockedBotRefreshPending ? `pending (${Math.max(0, Math.ceil((Number(runtime.blockedBotRefreshSettleAt || 0) - Date.now()) / 1000))}s remaining)` : "idle"}`,
    `Listing workload guard: ${Number(runtime.listingNonCardCriticalSkips || 0)} non-card critical passes skipped; ${Number(runtime.listingScheduleDeferrals || 0)} mutation bursts coalesced; ${Number(runtime.slowStepThrottleSkips || 0)} repeated slow scans throttled; ${Number(runtime.listingDuplicateRefillCardsRemoved || 0)} duplicate refill cards removed; ${Number(runtime.cardTokenHiddenQueuePauses || 0)} hidden-tab token queue pauses`,
    `Listing name sort: ${runtime.listingSortMode || "native"}; ${Number(runtime.listingSortLoadedCards || 0)} loaded cards; ${Number(runtime.listingSortReorders || 0)} DOM reorders; ${Number(runtime.listingSortNoopSkips || 0)} identical passes skipped; ${Number(runtime.listingSortAlreadyOrdered || 0)} first-pass no-ops`,
    `Notification auto-read: ${Number(runtime.notificationAutoReadAttempts || 0)} attempts; ${Number(runtime.notificationAutoReadClicks || 0)} native clicks; ${Number(runtime.notificationAutoReadSuccesses || 0)} cleared; ${Number(runtime.notificationAutoReadUncleared || 0)} still unread; ${Number(runtime.notificationAutoReadMissingButtons || 0)} missing-button checks; ${Number(runtime.notificationAutoReadFailures || 0)} failures; last source ${runtime.notificationAutoReadLastSource || "none"}`,
    `Message cache: ${Number(runtime.messageCacheHits || 0)} hits; ${Number(runtime.messageCacheMisses || 0)} misses; ${Number(runtime.messageCacheInvalidations || 0)} actual invalidations; ${Number(runtime.messageCacheInvalidationRequests || 0)} requests; ${Number(runtime.messageCacheInvalidationDeduped || 0)} duplicates avoided; ${Number(runtime.messageCacheNonTextSkips || 0)} non-text mutations kept cached; ${Number(runtime.messageCacheFingerprintSkips || 0)} unchanged-text invalidations skipped; observer collapsed ${Number(runtime.messageCacheMutationCandidateNodes || 0)} changed nodes to ${Number(runtime.messageCacheMutationRoots || 0)} message-root targets (${Number(runtime.messageCacheMutationNodesCollapsed || 0)} node walks avoided)`,
    `Browser long tasks: ${Number(runtime.longTasks || 0)}; max ${Number(runtime.maxLongTaskMs || 0)} ms; last ${Number(runtime.lastLongTaskMs || 0)} ms; QoL-overlap ${Number(runtime.longTasksWithQolOverlap || 0)}; no-QoL-overlap ${Number(runtime.longTasksWithoutQolOverlap || 0)}; last overlap ${runtime.lastLongTaskOverlap || "none"}`,
    `Card-token request guard: MAIN bridge ${Number(runtime.cardTokenMainCircuitTrips || 0)} trips / ${Number(runtime.cardTokenMainCircuitSkips || 0)} skipped retries${Number(runtime.cardTokenMainCircuitUntil || 0) > Date.now() ? ` / cooling down ${Math.ceil((Number(runtime.cardTokenMainCircuitUntil) - Date.now()) / 1000)}s` : ""}; auth ${Number(runtime.cardTokenAuthCircuitTrips || 0)} rejected / ${Number(runtime.cardTokenAuthSkips || 0)} no-auth skips; background no-auth ${Number(runtime.cardTokenBackgroundAuthSkips || 0)} skipped`,
    `Options page: load ${OPTIONS_PERFORMANCE.loadMs.toFixed(1)} ms; DOM ${document.getElementsByTagName("*").length} nodes; storage reads ${OPTIONS_PERFORMANCE.storageReads} avg ${readAvg.toFixed(2)} ms max ${OPTIONS_PERFORMANCE.storageReadMaxMs.toFixed(2)} ms; writes ${OPTIONS_PERFORMANCE.storageWrites} avg ${writeAvg.toFixed(2)} ms max ${OPTIONS_PERFORMANCE.storageWriteMaxMs.toFixed(2)} ms`,
    ...(OPTIONS_PERFORMANCE.slowStorageReads.length ? [`Options slow storage reads: ${OPTIONS_PERFORMANCE.slowStorageReads.map(item => `${item.keys} ${item.ms} ms${item.bytes ? ` (${(item.bytes / 1024).toFixed(1)} KB)` : ""}`).join("; ")}`] : []),
    `Options search renders: settings ${OPTIONS_PERFORMANCE.searchRenders}; feature catalogue ${OPTIONS_PERFORMANCE.featureRenders}`,
    `Options heavy UI: ${OPTIONS_PERFORMANCE.heavyManagerIdleSlices} idle slices; ${OPTIONS_PERFORMANCE.savedManagerRefreshBatches} saved-manager refresh batches covering ${OPTIONS_PERFORMANCE.savedManagerRefreshKinds} manager kinds; ${OPTIONS_PERFORMANCE.blockedManagerRefreshBatches} blocked-manager refresh batches`,
    `Warnings: ${warnings.length}`,
    ...warnings.map(line => `  ! ${line}`),
    `QoL timing entries: ${perf.length}`,
    ...perf.map(entry => `  ${entry.name}: ${entry.calls} calls, avg ${entry.averageMs} ms, max ${entry.maxMs} ms, last ${entry.lastMs || 0} ms, total ${entry.totalMs} ms`)
  ];
  if (!runtimeAvailable) {
    const runtimePrefixes = ["Bot archive preservation:", "Performance mode:", "Loaded chat messages:", "Scheduler:", "Storage write batching:", "Mutations:", "Message edit guard:", "Chat header self-repair:", "Chat layout:", "Opened-history persistence:", "Auto-AFK:", "Disabled-feature deep sleep:", "Saved/opened lane:", "Blocked-bot refresh batching:", "Listing workload guard:", "Listing name sort:", "Notification auto-read:", "Message cache:", "Browser long tasks:", "Card-token request guard:", "QoL timing entries:"];
    lines = lines.filter(line => !runtimePrefixes.some(prefix => String(line).startsWith(prefix)) && !/^  .+: \d+ calls,/.test(String(line)));
  }
  const text = lines.join("\n");
  if (returnOnly) return text;

  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = `Performance report copied${warnings.length ? ` with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}. No chat text was included.`;
  } catch {
    const box = $("settingsJson");
    if (box) { box.value = text; setActiveTab("data"); box.focus(); box.select(); }
    if (status) status.textContent = "Clipboard access failed, so the performance report was placed in Data / Backup instead.";
  }
  return text;
}

async function downloadPerformanceReport() {
  const status = $("diagnosticsStatus");
  if (status) status.textContent = "Building performance report for download...";
  try {
    const text = await copyPerformanceReport({ returnOnly: true });
    return downloadSupportText(text, supportReportFilename("performance"), "Performance report downloaded. No chat text was included.");
  } catch (error) {
    if (status) status.textContent = `Could not build performance report: ${error?.message || String(error || "unknown error")}`;
    return false;
  }
}

async function buildPerformanceSelfCheckText() {
  const started = performance.now();
  const readStarted = performance.now();
  const read = await storageGetChecked(["settings"]);
  const storageMs = performance.now() - readStarted;
  const context = await runtimeMessage({ type: "DS_GET_DIAGNOSTIC_CONTEXT" });
  const settings = { ...DEFAULT_SETTINGS, ...(read.data?.settings || {}) };
  const warnings = performanceWarningLines(context, settings);
  const total = performance.now() - started;
  const domNodes = document.getElementsByTagName("*").length;
  const manifest = chrome.runtime.getManifest?.() || {};
  const lines = [
    "SpicyChat QoL performance self-check",
    `Generated: ${new Date().toISOString()}`,
    `Version: ${manifest.version_name || displayReleaseVersion(manifest.version || "unknown")}`,
    `Browser: ${navigator.userAgent}`,
    `Platform: ${navigator.platform || "unknown"}`,
    `SpicyChat page: ${sanitizeDiagnosticPath(context?.url || "")}`,
    `Self-check total: ${total.toFixed(1)} ms`,
    `Settings storage read: ${storageMs.toFixed(1)} ms${read.ok ? "" : ` (failed: ${read.error || "unknown error"})`}`,
    `Settings DOM: ${domNodes} nodes`,
    `Source SpicyChat tab: ${context?.pageDiagnostics ? "reachable" : "unavailable"}`,
    (() => { const p = context?.pageDiagnostics?.diagnosticProtocol; return p ? `Dragon's SpicyChat Diagnostic Extension: ${p.inspectorConnected ? `paired${p.inspectorVersion ? ` (${p.inspectorVersion})` : ""}` : "not paired"}; protocol v${Number(p.protocolVersion || 1)}; QoL ${p.runState || "unknown"}` : "Dragon's SpicyChat Diagnostic Extension: protocol unavailable"; })(),
    `Warnings: ${warnings.length}`,
    ...warnings.map(line => `  ! ${line}`)
  ];
  return lines.join("\n");
}


async function buildAllSupportInfo() {
  let diagnosticText = "";
  let performanceText = "";
  let selfCheckText = "";

  try {
    diagnosticText = await copyDiagnostics({ returnOnly: true });
  } catch (error) {
    diagnosticText = `Diagnostic info could not be built: ${error?.message || String(error || "unknown error")}`;
  }

  try {
    performanceText = await copyPerformanceReport({ returnOnly: true });
  } catch (error) {
    performanceText = `Performance report could not be built: ${error?.message || String(error || "unknown error")}`;
  }

  try {
    selfCheckText = await buildPerformanceSelfCheckText();
    lastPerformanceSelfCheckText = selfCheckText;
  } catch (error) {
    selfCheckText = `Performance self-check could not be built: ${error?.message || String(error || "unknown error")}`;
  }

  let healthText = "Data health could not be checked.";
  let baselineText = "No performance baseline comparison available.";
  try {
    const health = await collectDataHealth();
    healthText = [health.summaryText, ...(health.rows || []).map(row => `${String(row.state || "ok").toUpperCase()}: ${row.label}: ${row.detail}`)].join("\n");
  } catch (error) {
    healthText = `Data health check failed: ${error?.message || String(error)}`;
  }
  try { baselineText = await comparePerformanceBaseline({ returnText: true }); } catch {}

  return [
    "SpicyChat QoL support info",
    `Generated: ${new Date().toISOString()}`,
    "Paste or attach this whole report when someone asks for QoL diagnostics/support info.",
    "",
    "===== DIAGNOSTIC INFO =====",
    diagnosticText,
    "",
    "===== PERFORMANCE REPORT =====",
    performanceText,
    "",
    "===== PERFORMANCE SELF-CHECK =====",
    selfCheckText,
    "",
    "===== DATA HEALTH =====",
    healthText,
    "",
    "===== PERFORMANCE BASELINE COMPARISON =====",
    baselineText
  ].join("\n");
}

async function copyAllSupportInfo() {
  const status = $("diagnosticsStatus");
  if (status) status.textContent = "Building full support report...";
  const text = await buildAllSupportInfo();

  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = "Full support report copied. Paste it into Discord, GitHub, or wherever you were asked to send it.";
    return true;
  } catch {
    const box = $("settingsJson");
    if (box) {
      box.value = text;
      setActiveTab("data");
      box.focus();
      box.select();
    }
    if (status) status.textContent = "Clipboard access failed, so the full support report was placed in Data / Backup instead.";
    return false;
  }
}

async function downloadAllSupportInfo() {
  const status = $("diagnosticsStatus");
  if (status) status.textContent = "Building full support report for download...";
  try {
    const text = await buildAllSupportInfo();
    return downloadSupportText(text, supportReportFilename("support-info"), "Full support report downloaded. No chat text was included.");
  } catch (error) {
    if (status) status.textContent = `Could not build full support report: ${error?.message || String(error || "unknown error")}`;
    return false;
  }
}

async function runPerformanceSelfCheck({ returnOnly = false } = {}) {
  const status = $("diagnosticsStatus");
  if (status && !returnOnly) status.textContent = "Running local performance self-check...";
  try {
    const text = await buildPerformanceSelfCheckText();
    lastPerformanceSelfCheckText = text;
    if (!returnOnly && status) {
      const summary = text.split("\n").find(line => line.startsWith("Self-check total:")) || "Self-check finished.";
      const warnings = Number((text.match(/^  ! /gm) || []).length);
      status.textContent = `${summary.replace("Self-check total:", "Self-check:")} ${warnings} warning${warnings === 1 ? "" : "s"}.`;
    }
    return text;
  } catch (error) {
    const text = `SpicyChat QoL performance self-check\nGenerated: ${new Date().toISOString()}\nSelf-check failed: ${error?.message || String(error || "unknown error")}`;
    lastPerformanceSelfCheckText = text;
    if (!returnOnly && status) status.textContent = `Performance self-check failed: ${error?.message || String(error || "unknown error")}`;
    return text;
  }
}

async function downloadPerformanceSelfCheck() {
  const status = $("diagnosticsStatus");
  if (status) status.textContent = "Running performance self-check for download...";
  const text = await runPerformanceSelfCheck({ returnOnly: true });
  return downloadSupportText(text, supportReportFilename("performance-self-check"), "Performance self-check downloaded.");
}

async function resetPerformanceCounters() {
  const status = $("diagnosticsStatus");
  const response = await runtimeMessage({ type: "DS_RESET_PAGE_PERFORMANCE" });
  OPTIONS_PERFORMANCE.storageReads = 0;
  OPTIONS_PERFORMANCE.storageReadTotalMs = 0;
  OPTIONS_PERFORMANCE.storageReadMaxMs = 0;
  OPTIONS_PERFORMANCE.storageWrites = 0;
  OPTIONS_PERFORMANCE.storageWriteTotalMs = 0;
  OPTIONS_PERFORMANCE.storageWriteMaxMs = 0;
  OPTIONS_PERFORMANCE.searchRenders = 0;
  OPTIONS_PERFORMANCE.featureRenders = 0;
  OPTIONS_PERFORMANCE.heavyManagerIdleSlices = 0;
  OPTIONS_PERFORMANCE.savedManagerRefreshBatches = 0;
  OPTIONS_PERFORMANCE.savedManagerRefreshKinds = 0;
  OPTIONS_PERFORMANCE.blockedManagerRefreshBatches = 0;
  OPTIONS_PERFORMANCE.slowStorageReads = [];
  if (status) status.textContent = response?.ok ? "Performance counters reset for Settings and the source SpicyChat tab." : "Settings counters reset. No reachable SpicyChat source tab responded.";
}

async function saveDeepLKey({ quiet = false } = {}) {
  const status = $("deeplStatus");
  const key = String(value("deeplApiKey", "") || "").trim();
  if (!key) {
    await storageSet({ [DEEPL_API_KEY]: "" });
    if (status && !quiet) status.textContent = "DeepL API key cleared.";
    return true;
  }

  const env = detectSettingsEnvironment();
  const granted = await ensureDeepLPermission();
  if (!granted && !env.webview) {
    if (status) status.textContent = "DeepL permission was not granted, so translation stays unavailable.";
    return false;
  }

  // Some Android/WebView wrappers expose extension storage/runtime APIs but do
  // not implement Chrome's optional host-permission prompt. Do not throw away a
  // valid key in that case: save it locally and let Test DeepL determine whether
  // the wrapper/background can actually reach the DeepL endpoint.
  await storageSet({ [DEEPL_API_KEY]: key });
  if (status && !quiet) {
    status.textContent = granted
      ? "DeepL API key saved locally."
      : "DeepL API key saved locally. This Android/WebView build could not request Chrome host permission; press Test DeepL to check app access.";
  }
  return true;
}

async function testDeepL() {
  const status = $("deeplStatus");
  if (status) status.textContent = "Testing DeepL...";
  if (!(await saveDeepLKey({ quiet: true }))) return;
  const response = await runtimeMessage({ type: "DS_DEEPL_TEST" });
  if (!response?.ok) {
    const env = detectSettingsEnvironment();
    const error = String(response?.error || "unknown error");
    if (status) {
      status.textContent = env.webview && (!response || /failed to fetch|network|permission|host/i.test(error))
        ? `DeepL test failed in Android/WebView: ${error}. The key is saved; this app build may need DeepL host/network access added by the Android wrapper.`
        : `DeepL test failed: ${error}`;
    }
    return;
  }
  const limit = Number(response.characterLimit || 0);
  const used = Number(response.characterCount || 0);
  if (status) status.textContent = limit > 0
    ? `DeepL connected. ${used.toLocaleString()} / ${limit.toLocaleString()} characters used.`
    : "DeepL connected.";
}

async function checkDeepLUsage() {
  const status = $("deeplStatus");
  if (status) status.textContent = "Checking DeepL usage...";
  if (!(await saveDeepLKey({ quiet: true }))) return;
  const response = await runtimeMessage({ type: "DS_DEEPL_USAGE" });
  if (!response?.ok) {
    if (status) status.textContent = `Could not read DeepL usage: ${response?.error || "unknown error"}`;
    return;
  }
  const limit = Number(response.characterLimit || 0);
  const used = Number(response.characterCount || 0);
  if (status) status.textContent = limit > 0
    ? `DeepL usage: ${used.toLocaleString()} / ${limit.toLocaleString()} characters.`
    : `DeepL usage: ${used.toLocaleString()} characters.`;
}

async function markUpdatesSeen() {
  const version = chrome.runtime.getManifest?.().version || "";
  if (!version) return;
  await storageSet({ [LAST_SEEN_VERSION_KEY]: version, [RELEASE_NOTICE_KEY]: null });
  applyFeatureChangeBadges(version);
  showSettingsToast("New/updated setting markers cleared.");
}

async function loadChangelog() {
  const host = $("changelogContent");
  if (!host || host.dataset.loaded === "1") return;

  try {
    const response = await fetch(chrome.runtime.getURL("CHANGELOG.md"));
    const text = await response.text();
    const blocks = text
      .split(/\n(?=##\s+)/g)
      .map(block => block.trim())
      .filter(block => /^##\s+/.test(block));

    const plainReleaseText = value => String(value || "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();

    const nodes = blocks.map(block => {
      const lines = block.split(/\n+/).map(line => line.trim()).filter(Boolean);
      const title = plainReleaseText(lines.shift().replace(/^##\s+/, ""));
      const items = lines
        .map(line => plainReleaseText(line.replace(/^[-*]\s+/, "").trim()))
        .filter(Boolean);
      const wrapper = makeElement("div", { className: "changelog-version" });
      wrapper.appendChild(makeElement("h3", { text: title }));
      const list = makeElement("ul");
      items.forEach(item => list.appendChild(makeElement("li", { text: item })));
      wrapper.appendChild(list);
      return wrapper;
    });

    if (nodes.length) {
      const recentLimit = 10;
      const recent = nodes.slice(0, recentLimit);
      const older = nodes.slice(recentLimit);
      if (older.length) {
        const more = makeElement("details", { className: "changelog-older" });
        const summary = makeElement("summary", { text: `Read older updates (${older.length})` });
        const olderList = makeElement("div", { className: "changelog-older-list" });
        older.forEach(node => olderList.appendChild(node));
        more.append(summary, olderList);
        host.replaceChildren(...recent, more);
      } else {
        host.replaceChildren(...recent);
      }
    } else host.textContent = "No changelog entries yet.";

    host.dataset.loaded = "1";
  } catch {
    host.textContent = "Could not load the changelog.";
  }
}

function setBlockedBotNameRepairStatus(text = "") {
  const status = $("blockedBotNameRepairStatus");
  if (status) status.textContent = text;
}

async function repairBlockedBotNames() {
  await ensureBlockingDataLoaded();
  const button = $("repairBlockedBotNames");
  if (blockedBotNameRepairRunning) {
    blockedBotNameRepairStopRequested = true;
    if (button) button.textContent = "Stopping...";
    setBlockedBotNameRepairStatus("Stopping after the current profile...");
    return;
  }

  const locallyRepaired = repairBlockedNamesFromLocalMetadata();
  const targets = (blockedState.ids || []).filter(id => {
    const item = blockedState.meta?.[id] || {};
    return isPlaceholderBotName(item.name, id);
  });

  if (!targets.length) {
    if (locallyRepaired) {
      await storageSet({ [BLOCKED_BOTS_KEY]: blockedState });
      renderBotManager("blocked");
      showSettingsToast(`Repaired ${locallyRepaired} blocked bot name${locallyRepaired === 1 ? "" : "s"} from saved local metadata.`);
    } else {
      showSettingsToast("No bad blocked-bot names were found.");
    }
    setBlockedBotNameRepairStatus("");
    return;
  }

  blockedBotNameRepairRunning = true;
  blockedBotNameRepairStopRequested = false;
  if (button) {
    button.disabled = false;
    button.textContent = "Stop name repair";
  }

  let repaired = locallyRepaired;
  let checked = 0;
  let rateLimited = false;

  try {
    for (const id of targets) {
      if (blockedBotNameRepairStopRequested) break;
      checked++;
      setBlockedBotNameRepairStatus(`Checking ${checked}/${targets.length} · ${repaired} repaired`);

      const item = blockedState.meta?.[id] || {};
      const checkedBot = await checkBotAvailability({
        id,
        name: item.name || id,
        image: item.image || "",
        creator: item.creator || item.creatorName || item.creatorHandle || "",
        chatUrl: item.chatUrl || `https://spicychat.ai/chat/${id}`
      });

      if (checkedBot.httpStatus === 429) {
        rateLimited = true;
        break;
      }

      const profileName = normalizeBotSnapshot(checkedBot.snapshot || {}).fields?.name || "";
      if (checkedBot.status === "available" && !isPlaceholderBotName(profileName, id)) {
        blockedState.meta[id] = {
          ...item,
          id,
          name: profileName,
          image: item.image || checkedBot.snapshot?.fields?.image || checkedBot.image || "",
          creator: item.creator || checkedBot.snapshot?.fields?.creator || checkedBot.creator || "",
          profileUrl: item.profileUrl || `https://spicychat.ai/chatbot/${id}`,
          chatUrl: item.chatUrl || `https://spicychat.ai/chat/${id}`
        };
        repaired++;
      }

      // Save periodically so a long repair does not lose progress if Settings closes.
      if (checked % 10 === 0) {
        await storageSet({ [BLOCKED_BOTS_KEY]: blockedState });
        renderBotManager("blocked");
      }

      await new Promise(resolve => setTimeout(resolve, 220));
    }
  } finally {
    blockedBotNameRepairRunning = false;
    const stopped = blockedBotNameRepairStopRequested;
    blockedBotNameRepairStopRequested = false;
    await storageSet({ [BLOCKED_BOTS_KEY]: blockedState });
    renderBotManager("blocked");
    if (button) {
      button.disabled = false;
      button.textContent = "Repair bad names";
    }

    if (rateLimited) {
      setBlockedBotNameRepairStatus(`Stopped: SpicyChat rate-limited the repair · ${repaired} repaired`);
      showSettingsToast(`Repaired ${repaired} name${repaired === 1 ? "" : "s"}, then SpicyChat rate-limited the profile checks. You can continue later.`);
    } else if (stopped) {
      setBlockedBotNameRepairStatus(`Stopped · ${repaired} repaired`);
      showSettingsToast(`Name repair stopped. ${repaired} blocked bot name${repaired === 1 ? "" : "s"} repaired so far.`);
    } else {
      setBlockedBotNameRepairStatus(`Done · ${repaired} repaired`);
      showSettingsToast(`Repaired ${repaired} blocked bot name${repaired === 1 ? "" : "s"}.`);
    }
  }
}

function setupBotManagerControls(kind) {
  if (kind === "blocked") {
    $("repairBlockedBotNames")?.addEventListener("click", repairBlockedBotNames);
    $("bulkDislikeBlockedBots")?.addEventListener("click", () => bulkDislikeBlockedBots().catch(() => showSettingsToast("Bulk Dislike failed.")));
    $("resumeBlockedDislikeRun")?.addEventListener("click", () => runBlockedBulkDislike("resume").catch(() => showSettingsToast("Could not resume Bulk Dislike.")));
    $("retryFailedBlockedDislikes")?.addEventListener("click", () => runBlockedBulkDislike("failed").catch(() => showSettingsToast("Could not retry failed dislikes.")));
    $("clearBlockedDislikeHistory")?.addEventListener("click", () => clearBlockedDislikeHistory().catch(() => showSettingsToast("Could not clear handled dislike history.")));
    $("blockedBotDislikeFilter")?.addEventListener("change", () => {
      botManagerUiState.blocked.visible = 20;
      botManagerUiState.blocked.collapsed = true;
      renderBotManager("blocked");
    });
    $("blockedBotApplyBulk")?.addEventListener("click", () => applyBlockedBotBulkAction().catch(() => showSettingsToast("Blocked bot bulk action failed.")));
  }

  if (["blocked", "favorite", "later"].includes(kind)) {
    $(managerElementId(kind, "SelectShown"))?.addEventListener("click", () => {
      const selected = botManagerBulkSet(kind);
      botManagerShownEntries(kind).forEach(entry => entry.id && selected.add(entry.id));
      renderBotManager(kind);
    });
    $(managerElementId(kind, "SelectMatches"))?.addEventListener("click", () => {
      const selected = botManagerBulkSet(kind);
      getBotManagerEntries(kind).forEach(entry => entry.id && selected.add(entry.id));
      renderBotManager(kind);
    });
    $(managerElementId(kind, "ClearSelection"))?.addEventListener("click", () => {
      botManagerBulkSet(kind).clear();
      renderBotManager(kind);
    });
    if (["favorite", "later"].includes(kind)) {
      $(managerElementId(kind, "ApplyBulk"))?.addEventListener("click", () => {
        applyBotManagerBulkAction(kind).catch(() => showSettingsToast("Bulk action failed."));
      });
    }
  }

  const search = $(managerElementId(kind, "Search"));
  const showMore = $(managerElementId(kind, "ShowMore"));
  const showLess = $(managerElementId(kind, "ShowLess"));
  const collapse = $(managerElementId(kind, "Collapse"));
  const sort = ["blocked", "later", "favorite", "opened"].includes(kind)
    ? $(managerElementId(kind, "SortMode"))
    : null;

  sort?.addEventListener("change", () => {
    botManagerUiState[kind].visible = 20;
    botManagerUiState[kind].collapsed = true;
    renderBotManager(kind);
  });

  const relation = ["favorite", "later"].includes(kind) ? $(managerElementId(kind, "RelationFilter")) : null;
  const folder = ["favorite", "later"].includes(kind) ? $(managerElementId(kind, "FolderFilter")) : null;
  const stateFilter = ["favorite", "later"].includes(kind) ? $(managerElementId(kind, "StateFilter")) : null;
  for (const control of [relation, folder, stateFilter]) {
    control?.addEventListener("change", () => {
      botManagerUiState[kind].visible = 20;
      botManagerUiState[kind].collapsed = true;
      renderBotManager(kind);
    });
  }

  const renderSearch = debounceCallback(() => {
    botManagerUiState[kind].query = search?.value || "";
    botManagerUiState[kind].visible = 20;
    botManagerUiState[kind].collapsed = true;
    renderBotManager(kind);
  });
  search?.addEventListener("input", renderSearch);
  const creatorFilter = ["favorite", "later"].includes(kind) ? $(managerElementId(kind, "CreatorFilter")) : null;
  creatorFilter?.addEventListener("input", debounceCallback(() => {
    botManagerUiState[kind].visible = 20;
    botManagerUiState[kind].collapsed = true;
    renderBotManager(kind);
  }));

  showMore?.addEventListener("click", () => {
    botManagerUiState[kind].collapsed = true;
    botManagerUiState[kind].visible = Math.min(
      5000,
      Number(botManagerUiState[kind].visible || 20) + 20
    );
    renderBotManager(kind);
  });

  showLess?.addEventListener("click", () => {
    botManagerUiState[kind].visible = 20;
    botManagerUiState[kind].collapsed = true;
    renderBotManager(kind);
  });

  collapse?.addEventListener("click", () => {
    const entries = getBotManagerEntries(kind);
    const current = Number(botManagerUiState[kind].visible || 20);
    if (current <= 20) {
      botManagerUiState[kind].collapsed = false;
      botManagerUiState[kind].visible = Math.min(100, entries.length);
    } else {
      botManagerUiState[kind].collapsed = true;
      botManagerUiState[kind].visible = 20;
    }
    renderBotManager(kind);
  });
}

function setupFavoriteCreatorControls() {
  const showMore = $("favoriteCreatorShowMore");
  const showLess = $("favoriteCreatorShowLess");
  const collapse = $("favoriteCreatorCollapse");

  showMore?.addEventListener("click", () => {
    favoriteCreatorUiState.collapsed = true;
    favoriteCreatorUiState.visible = Math.min(
      5000,
      Number(favoriteCreatorUiState.visible || 20) + 20
    );
    renderFavoriteCreators();
  });

  showLess?.addEventListener("click", () => {
    favoriteCreatorUiState.visible = 20;
    favoriteCreatorUiState.collapsed = true;
    renderFavoriteCreators();
  });

  collapse?.addEventListener("click", () => {
    const entries = creatorEntriesFromStore(favoriteCreatorState);
    const current = Number(favoriteCreatorUiState.visible || 20);
    if (current <= 20) {
      favoriteCreatorUiState.collapsed = false;
      favoriteCreatorUiState.visible = Math.min(100, entries.length);
    } else {
      favoriteCreatorUiState.collapsed = true;
      favoriteCreatorUiState.visible = 20;
    }
    renderFavoriteCreators();
  });
}

function setupFollowedCreatorControls() {
  const search = $("followedCreatorSearch");
  const sort = $("followedCreatorSortMode");
  const showMore = $("followedCreatorShowMore");
  const showLess = $("followedCreatorShowLess");
  const collapse = $("followedCreatorCollapse");

  const renderFollowedSearch = debounceCallback(() => {
    followedCreatorUiState.query = search?.value || "";
    followedCreatorUiState.visible = 20;
    followedCreatorUiState.collapsed = true;
    renderFollowedCreators();
  });
  search?.addEventListener("input", renderFollowedSearch);

  sort?.addEventListener("change", () => {
    followedCreatorUiState.sort = sort.value || "newest";
    renderFollowedCreators();
  });

  showMore?.addEventListener("click", () => {
    followedCreatorUiState.collapsed = true;
    followedCreatorUiState.visible = Math.min(5000, Number(followedCreatorUiState.visible || 20) + 20);
    renderFollowedCreators();
  });

  showLess?.addEventListener("click", () => {
    followedCreatorUiState.visible = 20;
    followedCreatorUiState.collapsed = true;
    renderFollowedCreators();
  });

  collapse?.addEventListener("click", () => {
    const entries = creatorEntriesFromStore(followedCreatorState);
    const current = Number(followedCreatorUiState.visible || 20);
    if (current <= 20) {
      followedCreatorUiState.collapsed = false;
      followedCreatorUiState.visible = Math.min(100, entries.length);
    } else {
      followedCreatorUiState.collapsed = true;
      followedCreatorUiState.visible = 20;
    }
    renderFollowedCreators();
  });
}



function revealSettingsTarget(targetId, options = {}) {
  const target = $(targetId);
  if (!target) return false;
  const page = target.closest(".tab-page");
  if (!page?.dataset?.page) return false;
  setActiveTab(page.dataset.page);
  expandSettingsCardForTarget(target);
  let details = target.closest("details");
  while (details) {
    details.open = true;
    details = details.parentElement?.closest?.("details") || null;
  }
  const focusTarget = target.closest(".card") || target.closest("label") || target;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    focusTarget.classList.add("ds-search-target");
    focusTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => focusTarget.classList.remove("ds-search-target"), 2200);
  }));
  return true;
}

function featureRegistryState(entry) {
  if (entry?.planned) return { key: "planned", label: "Planned" };
  if (entry?.builtIn) return { key: "built-in", label: "Built in" };
  const keys = Array.isArray(entry?.settings) ? entry.settings : (entry?.setting ? [entry.setting] : []);
  const controls = keys.map(key => ({ key, control: $(key) })).filter(item => item.control);
  if (!controls.length) return { key: "built-in", label: "Available" };
  const states = controls.map(({ key, control }) => {
    const raw = control.type === "checkbox" ? !!control.checked : !!String(control.value || "").trim();
    if (!raw) return false;
    const dependency = dependencyParentFor(key);
    const parent = dependency ? $(dependency.parent) : null;
    if (parent && parent.type === "checkbox" && !parent.checked) return false;
    return true;
  });
  const on = entry.statusMode === "all" ? states.every(Boolean) : states.some(Boolean);
  return { key: on ? "on" : "off", label: on ? "On" : "Off" };
}

function featureChronologyParts(entry) {
  const raw = String(entry?.updated || entry?.added || "").trim();
  if (!raw) return [0, 0, 0, 0, 0];
  const parts = raw.split(".").map(value => Number(value) || 0);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  let release = parts[3] || 0;
  let subrelease = 0;

  // Historical pre-v0.2 build numbers briefly used 641/642-style manifest
  // numbers. Treat those as 64.1/64.2 for catalogue chronology, while the
  // current 700+ manifest sequence maps to the human 70/71/... releases.
  if (major === 0 && minor === 1 && patch === 9) {
    if (release >= 700) release -= 630;
    else if (release >= 100) {
      subrelease = release % 10;
      release = Math.floor(release / 10);
    }
  }
  return [major, minor, patch, release, subrelease];
}

function compareFeatureChronology(left, right) {
  const a = featureChronologyParts(left);
  const b = featureChronologyParts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function setupFeaturesIndex() {
  const host = $("featureIndexList");
  const search = $("featureIndexSearch");
  const category = $("featureIndexCategory");
  const status = $("featureIndexStatus");
  const sortMode = $("featureIndexSort");
  const summary = $("featureIndexSummary");
  if (!host || !search || !category || !summary) return;

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const registry = Array.isArray(window.SpicyChatQoLFeatureRegistry)
    ? window.SpicyChatQoLFeatureRegistry.filter(entry => entry && entry.id && entry.name && entry.category)
    : [];

  const registryOrder = new Map(registry.map((entry, index) => [entry.id, index]));
  const categories = [...new Set(registry.map(entry => entry.category))];
  category.replaceChildren(
    makeElement("option", { text: "All categories", attrs: { value: "all" } }),
    ...categories.map(name => makeElement("option", { text: name, attrs: { value: name } }))
  );

  function featureSearchText(entry) {
    return clean(`${entry.name} ${entry.category} ${entry.description || ""} ${(entry.aliases || []).join(" ")} ${entry.platform || ""} ${entry.maturity || ""}`).toLowerCase();
  }

  function renderFeature(entry) {
    const state = featureRegistryState(entry);
    const card = makeElement("article", { className: "feature-index-item feature-catalog-item" });
    const main = makeElement("div", { className: "feature-index-main" }, [
      makeElement("div", { className: "feature-index-title", text: displayNormalizedSavedText(entry.name) }),
      makeElement("div", { className: "feature-index-description", text: entry.description || "" })
    ]);
    const badges = makeElement("div", { className: "feature-index-badges" });
    badges.appendChild(makeElement("span", { className: `feature-index-state is-${state.key}`, text: state.label }));
    if (entry.maturity) badges.appendChild(makeElement("span", { className: "feature-badge feature-badge-muted", text: entry.maturity }));
    if (entry.platform) badges.appendChild(makeElement("span", { className: "feature-badge feature-badge-muted", text: entry.platform }));
    if (entry.updated) badges.appendChild(makeElement("span", { className: "feature-badge", text: `Updated ${displayReleaseVersion(entry.updated)}` }));
    else if (entry.added) badges.appendChild(makeElement("span", { className: "feature-badge", text: `Added ${displayReleaseVersion(entry.added)}` }));

    const targetId = entry.target || entry.setting || (Array.isArray(entry.settings) ? entry.settings[0] : "");
    const button = makeElement("button", {
      text: entry.planned ? "Planned" : "Open settings",
      attrs: { type: "button", ...(entry.planned ? { disabled: "" } : {}) }
    });
    if (!entry.planned) {
      button.addEventListener("click", () => {
        if (!targetId || !revealSettingsTarget(targetId, { fromFeatures: true })) showSettingsToast("That feature does not have a separate settings control yet.");
      });
    }
    card.append(main, badges, button);
    return card;
  }

  function render() {
    const query = clean(search.value).toLowerCase();
    const wantedCategory = category.value || "all";
    const wantedStatus = status?.value || "all";
    const filtered = registry.filter(entry => {
      if (wantedCategory !== "all" && entry.category !== wantedCategory) return false;
      const state = featureRegistryState(entry);
      if (wantedStatus !== "all" && state.key !== wantedStatus) return false;
      if (query && !featureSearchText(entry).includes(query)) return false;
      return true;
    });

    const ordered = [...filtered].sort((left, right) => {
      const mode = sortMode?.value || "oldest";
      if (mode === "name") return String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" });
      const chronology = compareFeatureChronology(left, right);
      if (chronology) return mode === "newest" ? -chronology : chronology;
      return (registryOrder.get(left.id) || 0) - (registryOrder.get(right.id) || 0);
    });

    const optional = registry.filter(entry => !entry.planned && !entry.builtIn && (entry.setting || entry.settings));
    const enabled = optional.filter(entry => featureRegistryState(entry).key === "on").length;
    const planned = registry.filter(entry => entry.planned).length;
    summary.textContent = `${filtered.length} shown · ${enabled}/${optional.length} optional features on · ${planned} planned`;

    if (!filtered.length) {
      host.replaceChildren(makeElement("div", { className: "feature-index-empty", text: "No features match this filter." }));
      return;
    }

    const groups = [];
    const mode = sortMode?.value || "oldest";
    const groupedCategories = [...categories];
    if (mode === "newest" || mode === "oldest") {
      const firstPosition = new Map();
      ordered.forEach((entry, index) => {
        if (!firstPosition.has(entry.category)) firstPosition.set(entry.category, index);
      });
      groupedCategories.sort((left, right) => (firstPosition.get(left) ?? Number.MAX_SAFE_INTEGER) - (firstPosition.get(right) ?? Number.MAX_SAFE_INTEGER));
    } else if (mode === "name") {
      groupedCategories.sort((left, right) => String(left).localeCompare(String(right), undefined, { sensitivity: "base" }));
    }
    for (const groupName of groupedCategories) {
      const groupEntries = ordered.filter(entry => entry.category === groupName);
      if (!groupEntries.length) continue;
      const section = makeElement("details", { className: "feature-index-group", attrs: { open: "" } });
      const groupDescriptions = {
        "Setup & Compatibility": "Setup, compatibility, update and diagnostic helpers.",
        "Saved Lists & Bot Discovery": "Local lists, organization, archives and rediscovery tools.",
        "Card & Listing Tools": "Filters and helpers used while browsing bot listings.",
        "Chat Tools": "Tools used in open chats and the chat list.",
        "Creator Tools": "Chatbot and Lorebook creation, review and workflow helpers.",
        "Interface Cleanup": "Appearance, layout, navigation and browser-tab cleanup.",
        "Data & Backup": "Backup, storage, cleanup and configuration health tools.",
        "Mobile / Android": "Compact controls shared with supported mobile/WebView environments.",
        "Advanced": "Performance and specialized per-character behavior.",
        "Planned": "Ideas still on the roadmap and not enabled in this build."
      };
      const summaryRow = makeElement("summary", { className: "feature-index-group-head" }, [
        makeElement("span", { className: "feature-index-group-title", text: groupName }),
        makeElement("span", { className: "hint", text: `${groupEntries.length} feature${groupEntries.length === 1 ? "" : "s"}` })
      ]);
      section.appendChild(summaryRow);
      const description = groupDescriptions[groupName];
      if (description) section.appendChild(makeElement("p", { className: "feature-index-group-description hint", text: description }));
      const list = makeElement("div", { className: "feature-index-group-list" });
      groupEntries.forEach(entry => list.appendChild(renderFeature(entry)));
      section.appendChild(list);
      groups.push(section);
    }
    host.replaceChildren(...groups);
  }

  const renderFeatureIndexDebounced = debounceCallback(() => { OPTIONS_PERFORMANCE.featureRenders += 1; render(); }, 120);
  search.addEventListener("input", renderFeatureIndexDebounced);
  category.addEventListener("change", render);
  status?.addEventListener("change", render);
  sortMode?.addEventListener("change", render);
  document.addEventListener("change", event => {
    if (event.target?.matches?.("input[type='checkbox'], input[type='radio'], select")) render();
  });

  DS_FEATURE_INDEX_REFRESH = render;
  render();
}

let DS_FEATURE_INDEX_REFRESH = null;


async function refreshPersonalUsageSummary() {
  const out = $("personalUsageSummary");
  if (!out) return;
  if (!checked("enablePersonalUsageSummary")) { out.textContent = "Turn the option on, then refresh."; return; }
  out.textContent = "Loading local summary…";
  try {
    const keys = ["openedChats","favoriteBots","laterBots","blockedBots","notInterestedBots","botOrganization","botArchive","lorebookBackups","personas"];
    const data = await storageGet(keys);
    const countIds = value => Array.isArray(value?.ids) ? value.ids.length : (value && typeof value === "object" ? Object.keys(value.meta || value).length : 0);
    const lines = [
      "Local QoL usage summary",
      `Opened/known bots: ${countIds(data.openedChats)}`,
      `Favorite history: ${countIds(data.favoriteBots)}`,
      `Later: ${countIds(data.laterBots)}`,
      `Blocked: ${countIds(data.blockedBots)}`,
      `Not Interested: ${countIds(data.notInterestedBots)}`,
      `Bots with local organization: ${countIds(data.botOrganization)}`,
      `Saved bot copies: ${countIds(data.botArchive)}`,
      `Lorebook backups: ${countIds(data.lorebookBackups)}`,
      `Personas saved: ${countIds(data.personas)}`,
      "",
      "This view uses existing local QoL records only; it does not read chat text or start new activity tracking."
    ];
    out.textContent = lines.join("\n");
  } catch (error) { out.textContent = `Could not build summary: ${String(error?.message || error)}`; }
}

const SETTING_DEPENDENCY_GROUPS = [
  { parent: "autoAfkEnabled", name: "Inactive tab cleanup (Auto-AFK)", children: ["autoAfkChats", "autoAfkHome", "autoAfkProfiles", "autoAfkProtectActive", "autoAfkResetOnActivate"] },
  { parent: "duplicateTabGuardEnabled", name: "Duplicate SpicyChat Tab Guard", children: ["duplicateTabChats", "duplicateTabHome", "duplicateTabProfiles", "duplicateTabFocusExisting"] },
  { parent: "showQuickPanel", name: "Mini Panel", children: ["quickPanelDraggable", "quickPanelDefaultClosed", "quickPanelEnabledByDefaultInTab", "quickPanelAutoCollapseOverlap", "quickPanelShowStatus", "quickPanelStatusShowOpened", "quickPanelStatusShowBlocked", "quickPanelShowFeatureSummary", "quickPanelShowOptions", "quickPanelShowFillNow", "quickPanelShowSmartFilterPins", "quickPanelShowChatSearch", "quickPanelShowChatSort", "quickPanelShowScanVisible", "quickPanelShowLoadAll", "quickPanelShowOoc", "quickPanelShowAutoVoice", "quickPanelShowAutoAsterisk", "quickPanelShowTranslation", "quickPanelShowPersona", "quickPanelShowExport", "quickPanelShowSoundscapes"] },
  { parent: "showCardGreetingTokenInfo", name: "Bot card token info", children: ["cardTokenShowGreeting", "cardTokenShowPersonality", "cardTokenShowScenario", "cardTokenShowExamples"] },
  { parent: "replaceCardProfileWithBlockButton", name: "QoL card block button", children: ["quickDislikeOnBlock", "showBlockButtonOnMyCreations"] },
  { parent: "enableBulkCardBlocking", name: "Bulk card selection", children: ["bulkCardBlockingSidebarLauncher"] },
  { parent: "quickDislikeOnBlock", name: "Quick Dislike on QoL Block", children: ["quickDislikeIdleMinutes"] },
  { parent: "enableRecommendationHelpers", name: "Recommendation helpers", children: ["recommendationHideFavoriteBots", "recommendationHideOwnBots", "recommendationOnlyUnopened", "recommendationOnlyLorebook", "recommendationSessionHideButtons", "recommendationRandomButton", "recommendationHideLaterBots", "recommendationHideNotInterested", "recommendationPreferFavoriteCreators", "recommendationPreferredTags", "recommendationAvoidTags", "recommendationShowReasonBadges"] },
  { parent: "reduceAnimatedBotImages", name: "Animated bot images", children: ["animatedImagesListings", "animatedImagesChats", "animatedImagesProfiles", "animatedImagesChatMedia"] },
  { parent: "textNormalizationEnabled", name: "Text normalization", children: ["normalizeFancyUnicode", "normalizePunctuation", "normalizeInvisibleCharacters", "normalizeDecorativeSymbols"] },
  { parent: "autoFillListings", name: "Listing refill", children: ["showListingRefillButton"] },
  { parent: "showListingFilterStats", name: "Listing filter stats", children: ["showListingFilterStatsDetails"] },
  { parent: "showRandomChatButton", name: "Random Chat", children: ["randomChatUseLastHomeFilters", "randomChatIncludeOpened", "randomChatIncludeLater", "randomChatIncludeFavorites"] },
  { parent: "showChatTopBarTools", name: "Chat top-bar tools", children: ["chatTopBarInlineCreator", "hideChatTopBarRatingButton", "hideChatTopBarModelButton", "hideChatTopBarContextDot", "hideChatDropdownVoiceUpsell", "hideChatDropdownMemoryItem"] },
  { parent: "enableChatTextReplacements", name: "Chat text replacements", children: ["chatTextReplacementPreview"] },
  { parent: "showChatSearch", name: "Search Inside Current Chat", children: ["chatSearchShowPanel", "chatSearchShowFindButton", "chatSearchExactPhrase", "chatSearchCaseSensitive", "chatSearchWholeWord", "chatSearchRegex", "chatSearchLoadUntilMatch"] },
  { parent: "enableMessageBookmarks", name: "Message bookmarks", children: ["messageBookmarkButtons"] },
  { parent: "enableFocusMode", name: "Focus / Immersive Mode", children: ["focusHideSidebar", "focusHideTopBar", "focusHideChatHeader", "focusHideQolPanel"] },
  { parent: "enableContextKeeper", name: "Context Keeper", children: ["contextKeeperAutoCapture", "contextKeeperAutoSensitivity", "contextKeeperAutoEveryMessages", "contextKeeperAutoMaxDetails", "contextKeeperMessageButtons", "enableSelectionRemember"] },
  { parent: "enableStoryDayTracker", name: "Internal Day Tracker", children: ["storyDayTrackerMode", "storyDayTrackerIncludeInContext", "storyDayTrackerShowQuickPanel"] },
  { parent: "enableRpStateTracker", name: "RP State Tracker", children: ["rpStateTrackerMode", "rpStateInjectMode", "rpStateMaxContextChars", "rpStateShowQuickPanel"] },
  { parent: "enableGlobalMemory", name: "Global Memory", children: ["globalMemoryText", "globalMemorySendMode", "globalMemoryOocWrapper", "globalMemoryShowChatButton"] },
  { parent: "enableChatNudges", name: "Chat Nudges", children: ["chatNudgeDefaultHours", "chatNudgeBrowserNotifications"] },
  { parent: "enableTranslation", name: "Message translation (DeepL)", children: ["translationShowMessageButtons", "translationAutoAi", "translationAutoUser"] },
  { parent: "showFormattingToolbar", name: "Formatting toolbar", children: ["formatToolbarAsterisk", "formatToolbarBold", "formatToolbarBoldItalic", "formatToolbarStrike", "formatToolbarParens", "formatToolbarQuotes", "formatToolbarBackticks", "formatToolbarBrackets", "formatToolbarBraces"] },
  { parent: "enableBotOrganizer", name: "Bot Organizer", children: ["botOrganizerShowCardMeta", "botOrganizerBulkTools"] },
  { parent: "enableCreatorWritingAssistant", name: "Creator Writing Assistant", children: ["creatorWritingUseBrowserAi", "creatorWritingTargetLanguage", "creatorWritingDictionary"] },
  { parent: "enableTagAliases", name: "Local tag aliases", children: ["tagAliasRules", "tagAliasShowDisplay"] },
  { parent: "enableCreationAudit", name: "Creation Audit", children: ["creationAuditQuickStatus"] },
  { parent: "botBackupToolsEnabled", name: "Chatbot backup tools", children: ["botArchiveOwnEditorBackups", "botArchiveOwnRevisionLimit"] },
  { parent: "lorebookBackupToolsEnabled", name: "Lorebook backup tools", children: ["lorebookBackupsEnabled"] },
  { parent: "lorebookEntryManager", name: "Lorebook entry manager", children: ["lorebookMultiEntryWorkspace", "lorebookEntrySelectionCheckbox", "lorebookEntryShowTokenCount", "lorebookEntryShowHiddenKeywordCount", "lorebookEntryShowNoKeywordsWarning", "lorebookEntryShowCharacterCount", "lorebookEntryRenameButton", "lorebookEntryCopyButton", "lorebookEntryDuplicateButton", "lorebookBulkSelectAll", "lorebookBulkClear", "lorebookBulkAnalyze", "lorebookBulkExportSelected", "lorebookBulkCopySelected", "lorebookBulkDuplicateSelected", "lorebookBulkAddKeyword", "lorebookBulkRemoveKeyword", "lorebookBulkToggleEnabled", "lorebookBulkDeleteSelected", "lorebookBulkFindKeyword"] },
  { parent: "creatorModerationWarnings", name: "Creator wording warnings", children: ["creatorModerationWarningsChatbots"] },
  { parent: "enableReplyInstructions", name: "Reply Instructions", children: ["replyInstructionText", "replyInstructionSendMode", "replyInstructionOocWrapper", "replyInstructionShowChatButton"] },
  { parent: "enableLorebookConsistency", name: "Lorebook response consistency", children: ["lorebookConsistencyShowMatches", "lorebookConsistencyAutoQueue", "lorebookConsistencyMaxEntries"] },
  { parent: "enableSoundscapes", name: "Soundscapes", children: ["soundscapeShowChatControl", "soundscapeMasterVolume", "soundscapeOnChat", "soundscapeOnHome", "soundscapeOnChats", "soundscapeOnProfiles", "soundscapeOnOther"] },
  { parent: "enableRpFormatRepair", name: "RP Format Repair", children: ["rpFormatRepairAuto", "rpFormatConvertBoldActions", "rpFormatRemoveActionParens", "rpFormatPreserveInlineEmphasis", "rpFormatPreserveSemanticQuotes", "rpFormatPreserveBackticks", "rpFormatShowMessageButtons"] },
  { parent: "enableChatBackgrounds", name: "Custom chat backgrounds", children: ["chatBackgroundDim", "chatBackgroundBlur", "chatBackgroundFit", "chatBackgroundPosition"] },
  { parent: "androidTopBarMenu", name: "Compact chat top-bar controls", children: ["androidHideComposerShortcuts", "androidTopBarOoc", "androidTopBarAsterisk", "androidTopBarFormatting", "androidTopBarTranslation", "androidTopBarScroll", "androidTopBarPersona", "androidTopBarModel"] }
];

function dependencyParentFor(childId) {
  return SETTING_DEPENDENCY_GROUPS.find(group => group.children.includes(childId)) || null;
}

function updateSettingDependencies() {
  for (const group of SETTING_DEPENDENCY_GROUPS) {
    const parent = $(group.parent);
    if (!parent) continue;
    const active = parent.type === "checkbox" ? !!parent.checked : !!String(parent.value || "").trim();
    for (const childId of group.children) {
      const child = $(childId);
      if (!child) continue;
      const label = child.closest("label");
      if (!label) continue;
      label.classList.toggle("setting-dependent-inactive", !active);
      let note = label.querySelector(":scope > .setting-dependency-note");
      if (!note) {
        note = makeElement("small", { className: "setting-dependency-note" });
        label.appendChild(note);
      }
      note.replaceChildren();
      note.hidden = active;
      if (!active) {
        note.appendChild(document.createTextNode(`Takes effect when ${group.name} is enabled. `));
        const enable = makeElement("button", { className: "setting-dependency-action", text: "Enable parent", attrs: { type: "button" } });
        enable.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          if (parent.type === "checkbox") parent.checked = true;
          parent.dispatchEvent(new Event("change", { bubbles: true }));
          updateSettingDependencies();
          DS_FEATURE_INDEX_REFRESH?.();
          showSettingsToast(`${group.name} enabled on this page. Press Save settings to keep the change.`);
        });
        const open = makeElement("button", { className: "setting-dependency-action", text: "Open parent", attrs: { type: "button" } });
        open.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          revealSettingsTarget(group.parent);
        });
        note.append(enable, open);
      }
    }
  }
}

function setupSettingDependencies() {
  const parents = new Set(SETTING_DEPENDENCY_GROUPS.map(group => group.parent));
  for (const id of parents) $(id)?.addEventListener("change", updateSettingDependencies);
  updateSettingDependencies();
}

function healthResultItem(kind, title, detail, targetId = "", action = null) {
  const item = makeElement("div", { className: `settings-health-item is-${kind}` });
  const body = makeElement("div", { className: "settings-health-item-body" }, [
    makeElement("strong", { text: title }),
    makeElement("span", { className: "hint", text: detail })
  ]);
  item.appendChild(body);
  const actions = makeElement("div", { className: "settings-health-actions" });
  if (targetId && $(targetId)) {
    const button = makeElement("button", { text: "Open setting", attrs: { type: "button" } });
    button.addEventListener("click", () => revealSettingsTarget(targetId));
    actions.appendChild(button);
  }
  if (action?.label && typeof action.run === "function") {
    const button = makeElement("button", { text: action.label, attrs: { type: "button" } });
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await action.run(); } finally { button.disabled = false; }
    });
    actions.appendChild(button);
  }
  if (actions.childNodes.length) item.appendChild(actions);
  return item;
}

async function runSettingsHealthCheck() {
  const host = $("settingsHealthResults");
  if (!host) return;
  host.replaceChildren(makeElement("span", { className: "hint", text: "Checking configuration..." }));

  const result = await storageGet(["settings", DEEPL_API_KEY, PERSONAS_KEY, LEGACY_PERSONAS_KEY, CHAT_BACKGROUNDS_KEY, QUICK_DISLIKE_BULK_STATE_KEY, BLOCKED_BOTS_KEY, NOT_INTERESTED_KEY, OPENED_KEY]);
  const savedSettings = result.settings && typeof result.settings === "object" ? result.settings : {};
  const current = { ...DEFAULT_SETTINGS, ...savedSettings, ...readSettingsFromPage() };
  const warnings = [];
  const notices = [];
  if (current.enableTranslation && !String(result[DEEPL_API_KEY] || "").trim()) {
    warnings.push({ title: "DeepL translation is enabled without an API key", detail: "Translation cannot run until a DeepL API key is saved and tested.", target: "deeplApiKey" });
  }


  document.querySelectorAll('input[type="number"][id]').forEach(input => {
    const n = Number(input.value);
    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    if (Number.isFinite(n) && ((Number.isFinite(min) && n < min) || (Number.isFinite(max) && n > max))) {
      const fixed = Math.min(Number.isFinite(max) ? max : n, Math.max(Number.isFinite(min) ? min : n, n));
      const fix = async () => {
        input.value = String(fixed);
        await save();
        await runSettingsHealthCheck();
      };
      warnings.push({ title: `${input.id} is outside its supported range`, detail: `Current value: ${input.value}. Supported range: ${input.min || "no minimum"} to ${input.max || "no maximum"}.`, target: input.id, action: { label: `Use ${fixed}`, run: fix } });
    }
  });

  const rawBackgroundStore = result[CHAT_BACKGROUNDS_KEY] && typeof result[CHAT_BACKGROUNDS_KEY] === "object" ? result[CHAT_BACKGROUNDS_KEY] : {};
  const backgroundStore = normalizeChatBackgroundMediaStore(rawBackgroundStore);
  const rawBackgroundCount = (rawBackgroundStore.global ? 1 : 0) + Object.keys(rawBackgroundStore.chats || {}).length;
  const normalizedBackgroundCount = (backgroundStore.global ? 1 : 0) + Object.keys(backgroundStore.chats || {}).length;
  if (rawBackgroundCount > normalizedBackgroundCount) {
    notices.push({
      title: `${rawBackgroundCount - normalizedBackgroundCount} invalid chat-background record${rawBackgroundCount - normalizedBackgroundCount === 1 ? "" : "s"} found`,
      detail: "QoL can remove malformed/missing image records without changing valid backgrounds.",
      target: "chatBackgroundsCard",
      action: { label: "Clean background records", run: async () => { await saveChatBackgroundMediaStore(backgroundStore); await runSettingsHealthCheck(); } }
    });
  }
  if (current.enableChatBackgrounds && !backgroundStore.global && !Object.keys(backgroundStore.chats || {}).length) {
    notices.push({ title: "Custom chat backgrounds are enabled without an image", detail: "Choose a global image in Appearance & Interface or set a per-chat override from the BG button in a chat.", target: "chatBackgroundsCard" });
  }

  const bulkState = normalizeQuickDislikeBulkState(result[QUICK_DISLIKE_BULK_STATE_KEY]);
  const rawBlocked = result[BLOCKED_BOTS_KEY] && typeof result[BLOCKED_BOTS_KEY] === "object" ? result[BLOCKED_BOTS_KEY] : {};
  const normalizedBlockedForBulk = normalizeBotStore(rawBlocked);
  const blockedIdSetForBulk = new Set(normalizedBlockedForBulk.ids);
  const unfinishedBulkIds = uniqueClean([bulkState.currentId, ...(bulkState.pendingIds || [])]).filter(id => blockedIdSetForBulk.has(id));
  const failedBulkIds = uniqueClean(bulkState.failedIds || []).filter(id => blockedIdSetForBulk.has(id));
  const staleRunning = bulkState.status === "running" && bulkState.updatedAt && Date.now() - bulkState.updatedAt > 15000;
  if ((staleRunning || bulkState.status === "paused") && unfinishedBulkIds.length) {
    notices.push({
      title: "Blocked Bot Bulk Dislike has an unfinished run",
      detail: `${unfinishedBulkIds.length} bot${unfinishedBulkIds.length === 1 ? "" : "s"} are still queued. Open Blocked Bots to resume or start a fresh remaining-bots pass.`,
      target: "bulkDislikeBlockedBots"
    });
  }
  if (failedBulkIds.length) {
    notices.push({
      title: `${failedBulkIds.length} blocked-bot dislike${failedBulkIds.length === 1 ? "" : "s"} failed on the last run`,
      detail: "Failures are not marked handled. The Blocked Bots manager can retry only those failures without reprocessing successful bots.",
      target: "retryFailedBlockedDislikes"
    });
  }

  const rawBlockedIds = Array.isArray(rawBlocked.ids) ? rawBlocked.ids : [];
  const normalizedBlocked = normalizedBlockedForBulk;
  const rawNotInterested = result[NOT_INTERESTED_KEY] && typeof result[NOT_INTERESTED_KEY] === "object" ? result[NOT_INTERESTED_KEY] : {};
  const normalizedNotInterested = normalizeBotStore(rawNotInterested);
  const openedRaw = Array.isArray(result[OPENED_KEY]) ? result[OPENED_KEY] : [];
  const listNeedsCleanup = rawBlockedIds.length !== normalizedBlocked.ids.length
    || (Array.isArray(rawNotInterested.ids) && rawNotInterested.ids.length !== normalizedNotInterested.ids.length)
    || openedRaw.length !== uniqueClean(openedRaw).length;
  if (listNeedsCleanup) {
    notices.push({ title: "Some saved bot lists contain duplicate or malformed entries", detail: "The existing Local data cleanup tool can normalize supported saved-list records without touching chat content.", target: "cleanLocalData" });
  }

  const personas = Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY] : (Array.isArray(result[LEGACY_PERSONAS_KEY]) ? result[LEGACY_PERSONAS_KEY] : []);
  if (current.savePersonasFromPages && personas.length) {
    const withText = personas.filter(p => String(p?.description || p?.highlights || "").trim()).length;
    const withAvatarData = personas.filter(p => String(p?.avatarDataUrl || "").startsWith("data:image/")).length;
    if (withText < personas.length || withAvatarData < personas.length) {
      notices.push({
        title: "Some saved Persona copies are incomplete",
        detail: `${withText}/${personas.length} include saved Persona text and ${withAvatarData}/${personas.length} include a local avatar copy. Open those Persona edit pages again if you want the local copies refreshed.`,
        target: "savePersonasFromPages"
      });
    }
  }

  const bytes = await storageBytesInUse(null);
  if (Number.isFinite(bytes) && bytes > 50 * 1024 * 1024) {
    notices.push({ title: `QoL storage is ${(bytes / 1024 / 1024).toFixed(1)} MB`, detail: "Large local archives, Persona images or other saved data can make backups/Settings heavier. Review Local storage if you want to clean anything up.", target: "storageCard" });
  }

  const good = warnings.length === 0;
  const summary = healthResultItem(good ? "good" : "warning", good ? "No problems found" : `${warnings.length} setting problem${warnings.length === 1 ? "" : "s"} found`, good ? (notices.length ? "No enabled feature appears to be misconfigured. A few useful follow-ups are shown below." : "Nothing here currently needs attention.") : "Review the items below. QoL will not change anything unless you use one of the shown actions.");
  const nodes = [summary];
  warnings.forEach(item => nodes.push(healthResultItem("warning", item.title, item.detail, item.target, item.action)));
  notices.forEach(item => nodes.push(healthResultItem("notice", item.title, item.detail, item.target, item.action)));
  host.replaceChildren(...nodes);
}

const CHAT_BUBBLE_DEFAULTS = { ...CHAT_BUBBLE_TEXT_DEFAULTS, ...CHAT_BUBBLE_PRESETS.default, chatBubblePreserveActionColors: true };
const CHAT_BUBBLE_FIELD_IDS = [
  "chatBubbleAiBackground", "chatBubbleAiTextMode", "chatBubbleAiText", "chatBubbleAiActionMode", "chatBubbleAiActionText", "chatBubbleAiDialogueMode", "chatBubbleAiDialogueText", "chatBubbleAiBorder", "chatBubbleAiBorderWidth", "chatBubbleAiBorderStyle", "chatBubbleAiBorderOpacity", "chatBubbleAiOpacity", "chatBubbleAiRadius", "chatBubbleAiShape", "chatBubbleAiDecorationMode", "chatBubbleAiDecorationColor", "chatBubbleAiCatEarLayout", "chatBubbleAiShadow",
  "chatBubbleUserBackground", "chatBubbleUserTextMode", "chatBubbleUserText", "chatBubbleUserActionMode", "chatBubbleUserActionText", "chatBubbleUserDialogueMode", "chatBubbleUserDialogueText", "chatBubbleUserBorder", "chatBubbleUserBorderWidth", "chatBubbleUserBorderStyle", "chatBubbleUserBorderOpacity", "chatBubbleUserOpacity", "chatBubbleUserRadius", "chatBubbleUserShape", "chatBubbleUserDecorationMode", "chatBubbleUserDecorationColor", "chatBubbleUserCatEarLayout", "chatBubbleUserShadow"
];

function setControlValue(id, next) {
  const el = $(id);
  if (!el) return;
  if (el.type === "checkbox") el.checked = !!next;
  else el.value = String(next);
}

function resetBubbleField(id) {
  if (!(id in CHAT_BUBBLE_DEFAULTS)) return;
  setControlValue(id, CHAT_BUBBLE_DEFAULTS[id]);
  updateAppearanceColorControlStates();
  showSettingsToast(`Reset ${id.replace(/^chatBubble/, "bubble ")} to default. Press Save settings to apply it.`);
}

function setupBubbleResetControls() {
  document.querySelectorAll("[data-chat-bubble-reset-group]").forEach(button => {
    button.addEventListener("click", () => {
      const group = button.dataset.chatBubbleResetGroup;
      CHAT_BUBBLE_FIELD_IDS.filter(id => group === "ai" ? id.startsWith("chatBubbleAi") : id.startsWith("chatBubbleUser"))
        .forEach(id => setControlValue(id, CHAT_BUBBLE_DEFAULTS[id]));
      updateAppearanceColorControlStates();
      showSettingsToast(`Reset ${group === "ai" ? "AI" : "User"} bubble settings. Press Save settings to apply them.`);
    });
  });

  CHAT_BUBBLE_FIELD_IDS.forEach(id => {
    const el = $(id);
    if (!el || el.dataset.dsResetReady === "1") return;
    el.dataset.dsResetReady = "1";
    const button = makeElement("button", { text: "↺", attrs: { type: "button", title: "Reset this setting to default", "aria-label": "Reset this setting to default" } });
    button.className = "setting-inline-reset";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      resetBubbleField(id);
    });
    el.insertAdjacentElement("afterend", button);
  });
}

function updateMessageQuickActionControlStates() {
  const confirmRemove = $("messageQuickActionConfirmRemoveImage");
  if (confirmRemove) confirmRemove.disabled = !checked("messageQuickActionRemoveImage");

  const group = $("showMessageQuickActions");
  if (group) {
    const states = ["messageQuickActionCopy", "messageQuickActionEdit", "messageQuickActionReport"].map(id => checked(id));
    group.checked = states.every(Boolean);
    group.indeterminate = states.some(Boolean) && !states.every(Boolean);
    group.title = group.indeterminate
      ? "Some of Copy, Edit and Report are enabled"
      : (group.checked ? "Copy, Edit and Report are all enabled" : "Copy, Edit and Report are all disabled");
  }
}

function setupMessageQuickActionGroupToggle() {
  const group = $("showMessageQuickActions");
  if (!group) return;

  group.addEventListener("change", () => {
    const next = !!group.checked;
    ["messageQuickActionCopy", "messageQuickActionEdit", "messageQuickActionReport"].forEach(id => setControlValue(id, next));
    group.indeterminate = false;
    updateMessageQuickActionControlStates();
  });

  ["messageQuickActionCopy", "messageQuickActionEdit", "messageQuickActionReport"].forEach(id => {
    $(id)?.addEventListener("change", updateMessageQuickActionControlStates);
  });

  updateMessageQuickActionControlStates();
}

function updateAppearanceColorControlStates() {
  ["Ai", "User"].forEach(kind => {
    const normal = $(`chatBubble${kind}Text`);
    const action = $(`chatBubble${kind}ActionText`);
    const dialogue = $(`chatBubble${kind}DialogueText`);
    const decoration = $(`chatBubble${kind}DecorationColor`);
    const ears = $(`chatBubble${kind}CatEarLayout`);
    if (normal) normal.disabled = value(`chatBubble${kind}TextMode`, "custom") !== "custom";
    if (action) action.disabled = value(`chatBubble${kind}ActionMode`, "native") !== "custom";
    if (dialogue) dialogue.disabled = value(`chatBubble${kind}DialogueMode`, "base") !== "custom";
    if (decoration) decoration.disabled = value(`chatBubble${kind}DecorationMode`, "bubble") !== "custom";
    if (ears) ears.disabled = value(`chatBubble${kind}Shape`, "native") !== "cat";
  });

  const altCustom = checked("alternateDialogueCustomColors");
  ["alternateDialogueTextColor", "alternateDialogueBackgroundColor", "alternateDialogueBorderColor"].forEach(id => {
    const el = $(id);
    if (el) el.disabled = !altCustom;
  });
  updateBubbleContrastWarnings();
}

function detectSettingsEnvironment() {
  const ua = navigator.userAgent || "";
  const android = /Android/i.test(ua);
  const webview = android && (/;\s*wv\)/i.test(ua) || /Version\/4\.0.*Chrome\/\d+.*Mobile Safari/i.test(ua));
  let displayMode = "browser";
  try {
    if (window.matchMedia?.("(display-mode: window-controls-overlay)")?.matches) displayMode = "window-controls-overlay";
    else if (window.matchMedia?.("(display-mode: standalone)")?.matches) displayMode = "standalone";
    else if (window.matchMedia?.("(display-mode: minimal-ui)")?.matches) displayMode = "minimal-ui";
    else if (window.matchMedia?.("(display-mode: fullscreen)")?.matches) displayMode = "fullscreen";
  } catch {}
  const installedApp = displayMode !== "browser" || navigator.standalone === true;
  const firefox = /Firefox\/|FxiOS\//i.test(ua);
  const waterfox = /Waterfox/i.test(ua);
  const opera = /\bOPR\//i.test(ua);
  const chromium = /Chrome\//i.test(ua) && !firefox && !waterfox;
  return { android, webview, installedApp, displayMode, firefox, waterfox, opera, chromium, ua };
}

function refreshAndroidSettingsVisibility(forceShow = false) {
  const env = detectSettingsEnvironment();
  let manual = false;
  try { manual = localStorage.getItem("dsShowAndroidSettings") === "1"; } catch {}
  const show = forceShow || manual || env.android || env.webview || env.installedApp;
  const tab = $("androidTabButton");
  if (tab) tab.hidden = !show;

  let text = env.webview
    ? "Android WebView detected."
    : env.android
      ? "Android/mobile browser detected (including Firefox-family browsers)."
      : env.installedApp
        ? `Installed/standalone web-app mode detected (${env.displayMode}).`
        : "Normal desktop browser tab detected.";
  const compactForced = checked("androidTopBarMenu") && value("androidAppControlsMode", "auto") !== "off";
  if (compactForced) text += " Compact QoL top-bar menu is manually enabled here, so detection will not block it.";
  else if (value("androidAppControlsMode", "auto") === "off") text += " Compact/mobile controls are set to Never.";

  if ($("androidEnvironmentStatus")) $("androidEnvironmentStatus").textContent = text;
  if ($("androidSettingsEnvironmentStatus")) $("androidSettingsEnvironmentStatus").textContent = text;
  return show;
}

function applyAndroidRecommendedUi() {
  setControlValue("androidAppControlsMode", "android");
  setControlValue("androidTopBarMenu", true);
  setControlValue("androidHideComposerShortcuts", true);
  setControlValue("androidTopBarOoc", true);
  setControlValue("androidTopBarAsterisk", true);
  setControlValue("androidTopBarFormatting", true);
  setControlValue("androidTopBarTranslation", false);
  setControlValue("androidTopBarScroll", true);
  setControlValue("androidTopBarPersona", true);
  setControlValue("androidTopBarModel", true);
  setControlValue("chatPerformanceMode", true);
  setControlValue("pauseQolInHiddenTabs", true);
  refreshAndroidSettingsVisibility(true);
  showSettingsToast("Mobile Recommended applied. Press Save settings to apply it.");
}

function setupAndroidSettings() {
  refreshAndroidSettingsVisibility(false);
  $("showAndroidAppSettings")?.addEventListener("click", () => {
    try { localStorage.setItem("dsShowAndroidSettings", "1"); } catch {}
    refreshAndroidSettingsVisibility(true);
    setActiveTab("android");
  });
  $("hideAndroidAppSettings")?.addEventListener("click", () => {
    try { localStorage.removeItem("dsShowAndroidSettings"); } catch {}
    const env = detectSettingsEnvironment();
    if (!env.webview) {
      $("androidTabButton")?.setAttribute("hidden", "");
      setActiveTab("general");
    }
  });
  $("applyAndroidRecommended")?.addEventListener("click", applyAndroidRecommendedUi);
  $("androidTopBarMenu")?.addEventListener("change", () => refreshAndroidSettingsVisibility(true));
  $("androidAppControlsMode")?.addEventListener("change", () => refreshAndroidSettingsVisibility(true));
}

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
    showSettingsToast(`Context Keeper ${preset === "recommended" ? "Recommended" : preset[0].toUpperCase() + preset.slice(1)} preset applied. Press Save settings to apply it.`);
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
$("collectTabCleanupDiagnostic")?.addEventListener("click", collectTabCleanupDiagnostic);
$("enrichTabCleanupDiagnostic")?.addEventListener("click", () => enrichTabCleanupDiagnostic(false));
$("retryTabCleanupEnrichment")?.addEventListener("click", () => enrichTabCleanupDiagnostic(true));
$("pauseTabCleanupEnrichment")?.addEventListener("click", toggleTabCleanupEnrichmentPause);
$("cancelTabCleanupEnrichment")?.addEventListener("click", cancelTabCleanupEnrichment);
$("saveTabCleanupSession")?.addEventListener("click", saveTabCleanupSession);
$("mergeTabCleanupSessions")?.addEventListener("click", mergeAllTabCleanupSessions);
$("cleanTabCleanupSessionDuplicates")?.addEventListener("click", cleanTabCleanupSessionDuplicates);
$("copyTabCleanupDiagnostic")?.addEventListener("click", copyTabCleanupDiagnostic);
$("downloadTabCleanupDiagnostic")?.addEventListener("click", downloadTabCleanupDiagnostic);
$("tabCleanupAddTopic")?.addEventListener("click", addManualTabCleanupTopic);
$("tabCleanupNewTopicName")?.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addManualTabCleanupTopic(); } });
$("tabCleanupCloseReview")?.addEventListener("click", closeTabCleanupSessionReview);
$("tabCleanupSessionSearch")?.addEventListener("input", () => renderTabCleanupSessionReview());
$("tabCleanupSessionTopicFilter")?.addEventListener("change", () => renderTabCleanupSessionReview());
$("tabCleanupSessionSelectShown")?.addEventListener("click", selectShownTabCleanupSessionTabs);
$("tabCleanupSessionClearSelection")?.addEventListener("click", () => { tabCleanupSessionSelection.clear(); renderTabCleanupSessionReview(); });
$("tabCleanupAddSelectedToTopic")?.addEventListener("click", () => applyTopicToSelectedTabCleanup(true));
$("tabCleanupRemoveSelectedFromTopic")?.addEventListener("click", () => applyTopicToSelectedTabCleanup(false));
$("tabCleanupReopenSelected")?.addEventListener("click", () => reopenSelectedTabCleanup("current"));
$("tabCleanupReopenSelectedNewWindow")?.addEventListener("click", () => reopenSelectedTabCleanup("new-window"));
$("tabCleanupRestoreSelectedWindows")?.addEventListener("click", () => reopenSelectedTabCleanup("saved-windows"));
$("tabCleanupCloseSelected")?.addEventListener("click", closeSelectedTabCleanup);
["tabCleanupRecentHours", "tabCleanupRecentDays", "tabCleanupMediumDays", "tabCleanupOldDays"].forEach(id => {
  $(id)?.addEventListener("change", async () => {
    renderTabCleanupAnalysis(lastTabCleanupDiagnostic);
    await renderTabCleanupSmartGroups();
    await renderTabCleanupSessionReview();
  });
});
$("chatBackgroundGlobalUpload")?.addEventListener("change", async event => { await importGlobalChatBackground(event.target.files); event.target.value = ""; });
$("clearGlobalChatBackground")?.addEventListener("click", clearGlobalChatBackground);
$("clearPerChatBackgrounds")?.addEventListener("click", clearPerChatBackgrounds);
$("chatBackgroundFit")?.addEventListener("change", renderChatBackgroundOptions);
$("chatBackgroundPosition")?.addEventListener("change", renderChatBackgroundOptions);
$("enableSoundscapes")?.addEventListener("change", event => { if (event.target.checked) loadSoundscapeManager().catch(() => {}); });
$("soundscapeMasterVolume")?.addEventListener("input", event => { if ($("soundscapeMasterVolumeValue")) $("soundscapeMasterVolumeValue").textContent = `${event.target.value}%`; });
$("soundscapeAudioUpload")?.addEventListener("change", async event => { await importSoundscapeAudio(event.target.files); event.target.value = ""; });
$("soundscapeAddScene")?.addEventListener("click", async () => {
  const input = $("soundscapeNewSceneName");
  const name = String(input?.value || "").trim() || `Soundscape ${soundscapeSceneState.scenes.length + 1}`;
  const scene = normalizeSoundscapeScene({ id: soundscapeId("scene"), name, layers: [] }, soundscapeSceneState.scenes.length);
  soundscapeSceneState.scenes.push(scene);
  if (!soundscapeSceneState.activeId) soundscapeSceneState.activeId = scene.id;
  if (input) input.value = "";
  await persistSoundscapeScenes({ rerender: true });
});
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
function applyOptionsLayoutPreferences(settings = null) {
  const source = settings || {
    settingsNavigationStyle: value("settingsNavigationStyle", "classic"),
    settingsContentLayout: value("settingsContentLayout", "single"),
    settingsPageWidth: value("settingsPageWidth", "comfortable")
  };
  const nav = ["classic", "grouped"].includes(source.settingsNavigationStyle) ? source.settingsNavigationStyle : "classic";
  const layout = ["single", "adaptive"].includes(source.settingsContentLayout) ? source.settingsContentLayout : "single";
  const width = ["comfortable", "wide"].includes(source.settingsPageWidth) ? source.settingsPageWidth : "comfortable";
  document.body.classList.toggle("ds-options-nav-grouped", nav === "grouped");
  document.body.classList.toggle("ds-options-layout-adaptive", layout === "adaptive");
  document.body.classList.toggle("ds-options-width-wide", width === "wide");
}

$("downloadAllSupportInfo")?.addEventListener("click", downloadAllSupportInfo);
$("copyDiagnostics")?.addEventListener("click", copyDiagnostics);
$("downloadDiagnostics")?.addEventListener("click", downloadDiagnostics);
$("copyPerformanceReport")?.addEventListener("click", copyPerformanceReport);
$("downloadPerformanceReport")?.addEventListener("click", downloadPerformanceReport);
$("runPerformanceSelfCheck")?.addEventListener("click", runPerformanceSelfCheck);
$("downloadPerformanceSelfCheck")?.addEventListener("click", downloadPerformanceSelfCheck);
$("resetPerformanceCounters")?.addEventListener("click", resetPerformanceCounters);
$("reduceOptionsAnimations")?.addEventListener("change", () => applyOptionsPerformancePreferences({ reduceOptionsAnimations: checked("reduceOptionsAnimations") }));
["settingsNavigationStyle", "settingsContentLayout", "settingsPageWidth"].forEach(id => {
  $(id)?.addEventListener("change", () => applyOptionsLayoutPreferences());
});
$("qolInterfaceScale")?.addEventListener("change", () => applyOptionsAccessibilityPreview({ qolInterfaceScale: Number(value("qolInterfaceScale", "100")) || 100 }));
$("collapseAllSettingsSections")?.addEventListener("click", () => setAllSettingsSectionsCollapsed(true));
$("expandAllSettingsSections")?.addEventListener("click", () => setAllSettingsSectionsCollapsed(false));
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
function reorderOptionsUi() {
  const tabOrder = [
    "general", "control", "blocking", "chat-ui", "saved", "chat-list", "writing",
    "personas-memory", "bot-tools", "appearance", "browser", "data",
    "features", "advanced", "android", "changelog", "help"
  ];
  const tabs = document.querySelector("nav.tabs");
  if (tabs && !tabs.querySelector(".tab-group")) {
    tabOrder.forEach(name => {
      const button = tabs.querySelector(`.tab-button[data-tab="${name}"]`);
      if (button) tabs.appendChild(button);
    });
  }

  const cardOrders = {
    general: ["Extension", "Quick setup", "Settings layout", "SpicyChat beta / experimental access", "S.AI Toolkit compatibility", "Android app settings", "SpicyChat NSFW switch"],
    control: ["Command Palette", "Data health & storage", "Creator Workspace", "Performance & support"],
    blocking: ["Tag defaults", "Bot Blocking & Dislikes", "Blocked bots manager", "Not interested", "Card filters", "Language filter", "Text normalization", "Local tag aliases / emoji", "Favorite protection", "Smart filter presets", "Recommendation helpers", "Card / discovery workflow", "Listing refill"],
    saved: ["Saved Bots Hub", "Favorite bots", "Later bots", "Favorite creators", "Followed creators", "Bot Organizer", "Bot Status Center"],
    writing: ["Composer and draft helpers", "OOC presets", "Reply Instructions", "Saved Text / Snippets", "Model quick menu", "Generation profiles", "Timestamps and generation details", "Translation (DeepL)"],
    "personas-memory": ["Persona helpers", "Memory manager", "Context Keeper", "Global Memory / Baseline Notes", "Internal Day Tracker", "RP State Tracker", "Chat Nudges"],
    "chat-ui": ["Chat top bar", "Character shortcuts", "Message options", "Search inside current chat", "Message bookmarks / multiple local pins", "Scroll navigation", "Chat export", "Native rating helpers", "Chat text replacements", "Focus / Immersive Mode"],
    "bot-tools": ["Creation helpers", "Bot editor snippets", "My Creations filters", "Creator Writing Assistant", "Creation audit", "Bot & Lorebook backups", "Backup manager", "Bot / profile export", "Bot tags in chats"],
    appearance: ["Accessibility & text size", "Mini panel", "Panel size", "Panel items", "Layout preview", "Top bar cleanup", "Avatar name", "Sidebar cleanup", "Premium & promo cleanup", "Chat bubble customization", "Custom chat backgrounds", "RP Format Repair", "Alternate dialogue styling", "Soundscapes / Ambience", "Animated bot images"],
    browser: ["Extension popup", "Notifications", "Inactive tab cleanup (Auto-AFK)", "Duplicate SpicyChat tab guard", "Tab cleanup & session analysis"],
    data: ["Backup and restore", "Local storage & recovery", "Recently changed / Undo", "Personal usage & context", "What's New notification", "Settings check", "Debug"]
  };

  for (const [pageName, headings] of Object.entries(cardOrders)) {
    const page = document.querySelector(`.tab-page[data-page="${pageName}"]`);
    if (!page) continue;
    const cards = [...page.querySelectorAll(":scope > section.card")];
    const byHeading = new Map(cards.map(card => [String(card.querySelector("h2")?.textContent || "").trim(), card]));
    headings.forEach(heading => {
      const card = byHeading.get(heading);
      if (card) page.appendChild(card);
    });
  }
}

reorderOptionsUi();
setupCollapsibleSettingsCards();
setupSettingsSectionNavigation();

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

function scheduleSavedManagersRefresh(kinds = []) {
  for (const kind of kinds) pendingSavedManagerRefreshKinds.add(kind);
  if (!pendingSavedManagerRefreshKinds.size) return;
  clearTimeout(savedManagerRefreshTimer);
  savedManagerRefreshTimer = setTimeout(() => {
    savedManagerRefreshTimer = 0;
    const queued = [...pendingSavedManagerRefreshKinds];
    pendingSavedManagerRefreshKinds.clear();
    OPTIONS_PERFORMANCE.savedManagerRefreshBatches += 1;
    OPTIONS_PERFORMANCE.savedManagerRefreshKinds += queued.length;
    refreshSavedManagersFromStorageChange(queued);
  }, document.hidden ? 280 : 90);
}

function scheduleBlockedManagerRefresh() {
  clearTimeout(blockedManagerRefreshTimer);
  blockedManagerRefreshTimer = setTimeout(() => {
    blockedManagerRefreshTimer = 0;
    if (!blockingDataLoaded || blockedBulkDislikeRunning) return;
    OPTIONS_PERFORMANCE.blockedManagerRefreshBatches += 1;
    // Do not build the heavy blocked manager while another Settings tab is open.
    // Its state is already current in memory and the manager will render lazily
    // when Discovery & Filters is visited.
    if (activeOptionsTab() !== "blocking") {
      invalidateHeavyTab("blocking");
      return;
    }
    renderBotManager("blocked");
    updateBlockedDislikeStatus();
  }, document.hidden ? 300 : 100);
}

function refreshSavedManagersFromStorageChange(kinds = []) {
  if (!savedListsDataLoaded) return;

  invalidateDuplicateCache();
  renderedHeavyTabs.delete("saved");
  if ($("openedCount")) $("openedCount").textContent = `${currentOpened.length} stored`;

  // If the user is looking at another settings page, just invalidate the lazy
  // Saved-tab render. It will rebuild from the fresh in-memory stores on entry.
  if (activeOptionsTab() !== "saved") return;

  const changed = new Set(kinds);
  if (changed.has("hub")) renderSavedBotsHub();
  if (changed.has("opened")) renderBotManager("opened");
  if (changed.has("favorite")) renderBotManager("favorite");
  if (changed.has("later")) renderBotManager("later");
  if (changed.has("favoriteCreators")) renderFavoriteCreators();
  if (changed.has("followedCreators")) { renderFollowedCreators(); renderCreatorBotWatchStatus(); }
  if (changed.has("creatorWatch")) renderCreatorBotWatchStatus();
  if (changed.has("availability")) renderBotAvailability();

  // The tab is already fully mounted; mark it current again after the targeted
  // refresh so a later click does not unnecessarily rebuild every manager.
  renderedHeavyTabs.add("saved");
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
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

  if (changes[BLOCKED_BOTS_KEY] && blockingDataLoaded) {
    blockedState = normalizeBotStore(changes[BLOCKED_BOTS_KEY].newValue);
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

  if (changes[BOT_ARCHIVE_KEY] || changes[LOREBOOK_BACKUPS_KEY] || changes.settings) {
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
load();

$("refreshPersonalUsage")?.addEventListener("click", refreshPersonalUsageSummary);
