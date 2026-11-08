// Feature-owned options helpers: settings-autosave. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function readSettingsFromPage() {
  const oocTemplates = oocTemplatesFromPage();

  const result = {
    enabled: checked("enabled"),
    saiToolkitCompatibility: checked("saiToolkitCompatibility", false),
    globalNsfwMode: value("globalNsfwMode", "ignore"),




    lowMemoryProtectionEnabled: checked("lowMemoryProtectionEnabled"),
    maxAwakeSpicyTabs: Math.min(20, Math.max(1, Number(value("maxAwakeSpicyTabs", "3")) || 3)),




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













    botEditorAutoOpenAdvanced: checked("botEditorAutoOpenAdvanced"),
    rememberBotImagePrompt: checked("rememberBotImagePrompt"),
    botEditorSaveActions: checked("botEditorSaveActions"),
    botEditorSaveChatNewTab: checked("botEditorSaveChatNewTab"),
    enableBotEditorDraftHistory: checked("enableBotEditorDraftHistory"),
    botEditorDraftHistoryLimit: Math.max(3, Math.min(20, Number(value("botEditorDraftHistoryLimit", "8")) || 8)),
    enableWikiLorebookImporter: checked("enableWikiLorebookImporter"),
    enableLorebookConsistency: checked("enableLorebookConsistency"),
    enableCreatorTriggerPreview: checked("enableCreatorTriggerPreview"),
    lorebookConsistencyShowMatches: checked("lorebookConsistencyShowMatches", true),
    lorebookConsistencyAutoQueue: checked("lorebookConsistencyAutoQueue", false),
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
    lorebookEntryQuickToggle: checked("lorebookEntryQuickToggle"),
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
    lorebookExpandTags: checked("lorebookExpandTags"),
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


    hidePremium: checked("hidePremium"),
    hideFloatingPremiumPopups: checked("hideFloatingPremiumPopups"),
    hideAdvertBanners: checked("hideAdvertBanners"),






    chatTopBarAddLaterButton: checked("chatTopBarAddLaterButton"),
    closeChatTabAfterSavingLater: checked("closeChatTabAfterSavingLater"),
    showPerCharacterChatHistory: checked("showPerCharacterChatHistory"),
    showQuickNewChatButton: checked("showQuickNewChatButton"),
    chatAlwaysShowProfileLink: checked("chatAlwaysShowProfileLink"),
    chatJumpToStartShortcut: checked("chatJumpToStartShortcut"),
    chatOpenWindowShortcut: checked("chatOpenWindowShortcut"),
    chatGenerationSettingsShortcut: checked("chatGenerationSettingsShortcut"),


    enableBulkMemoryManager: checked("enableBulkMemoryManager"),
    enableMemoryVault: checked("enableMemoryVault"),
    showCopyMemoryAction: checked("showCopyMemoryAction"),
    memoryAutoLoadAll: checked("memoryAutoLoadAll"),

    showChatListTools: checked("showChatListTools"),
    enableChatOrganizer: checked("enableChatOrganizer"),
    enableChatPins: checked("enableChatPins"),
    chatListTwoColumns: checked("chatListTwoColumns"),
    chatListPopoutShortcut: checked("chatListPopoutShortcut"),
    chatListRenameShortcut: checked("chatListRenameShortcut"),
    chatCollections: value("chatCollections", ""),
    showSavedChatQuickActions: checked("showSavedChatQuickActions"),





    chatListSortMode: value("chatListSortMode", "default"),
    chatListSearchMode: "all",
    chatListOpenedFilter: ["all", "opened", "unopened"].includes(value("chatListOpenedFilter")) ? value("chatListOpenedFilter") : "all",
    chatListMessageFilter: ["all", "0", "1-9", "10-49", "50-99", "100-499", "500+", "unknown"].includes(value("chatListMessageFilter")) ? value("chatListMessageFilter") : "all",
    chatListSavedFilter: ["all", "favorite", "later", "both", "saved", "neither"].includes(value("chatListSavedFilter")) ? value("chatListSavedFilter") : "all",
    chatListBlockedFilter: ["all", "blocked", "unblocked"].includes(value("chatListBlockedFilter")) ? value("chatListBlockedFilter") : "all",

    trackOpenedChats: checked("trackOpenedChats"),
    lorebookStatusScanSpeed: Object.prototype.hasOwnProperty.call(LOREBOOK_STATUS_SCAN_SPEED_DELAYS, value("lorebookStatusScanSpeed", "safe")) ? value("lorebookStatusScanSpeed", "safe") : "safe",
    lorebookStatusStaleDays: [1, 7, 14, 30].includes(Number(value("lorebookStatusStaleDays", "7"))) ? Number(value("lorebookStatusStaleDays", "7")) : 7,
    importOpenedFromChatsPage: checked("importOpenedFromChatsPage"),
    hideOpenedChats: checked("hideOpenedChats"),
    openedBotSortMode: value("openedBotSortMode", "newest"),





    popupShowOpenedCount: checked("popupShowOpenedCount", false),
    popupShowBlockedCount: checked("popupShowBlockedCount", false),
    popupShowStorageDetails: checked("popupShowStorageDetails"),









    enableChatIndex: checked("enableChatIndex"),
    chatIndexEnhanceNativeSearch: checked("chatIndexEnhanceNativeSearch"),
    chatIndexStandaloneLauncher: checked("chatIndexStandaloneLauncher"),







    showAutoImageInlineButton: checked("showAutoImageInlineButton"),

    compactAfterHiding: checked("compactAfterHiding"),
    neverHideFavorites: checked("neverHideFavorites"),
    protectFavoritesFromBlocking: checked("protectFavoritesFromBlocking"),
    showCreatorFavoriteButtons: checked("showCreatorFavoriteButtons"),
    showCreatorFavoriteButtonsOnMyChatbots: checked("showCreatorFavoriteButtonsOnMyChatbots"),
    protectFavoriteCreatorsFromFiltering: checked("protectFavoriteCreatorsFromFiltering"),
    showFollowCreatorButtons: checked("showFollowCreatorButtons"),
    enableCreatorBotNotifications: checked("enableCreatorBotNotifications"),
    creatorBotCheckMinutes: CREATOR_BOT_WATCH_INTERVALS.includes(Number(value("creatorBotCheckMinutes", "60"))) ? Number(value("creatorBotCheckMinutes", "60")) : 60,
    creatorBotBrowserNotifications: checked("creatorBotBrowserNotifications"),
    trackFavoriteBots: checked("trackFavoriteBots"),
    showFavoritesBulkSelect: checked("showFavoritesBulkSelect", true),
    showFavoritesScanButton: checked("showFavoritesScanButton", true),
    showFavoriteHistoryButton: checked("showFavoriteHistoryButton"),
    enableFavoritesRecovery: checked("enableFavoritesRecovery"),
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


    favoritePageFoldersEnabled: checked("favoritePageFoldersEnabled"),
    favoritePageSortEnabled: checked("favoritePageSortEnabled"),
    lorebookUnknownSafeFilter: checked("lorebookUnknownSafeFilter"),




    showListingRefillButton: checked("showListingRefillButton"),
    showListingFilterStats: checked("showListingFilterStats"),
    showListingFilterStatsDetails: checked("showListingFilterStatsDetails"),


    hideChatPlusButton: checked("hideChatPlusButton"),
    hideChatImageButton: checked("hideChatImageButton"),
    replaceChatImageWithOocButton: checked("replaceChatImageWithOocButton"),
    showAsteriskButton: checked("showAsteriskButton"),
    composerShortcutPlacement: ["inside-right", "outside-left", "outside-right"].includes(value("composerShortcutPlacement")) ? value("composerShortcutPlacement") : "inside-right",
    chatEnterKeyBehavior: ["site-default", "send", "newline"].includes(value("chatEnterKeyBehavior")) ? value("chatEnterKeyBehavior") : "site-default",
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
    enableCustomCharacterPictures: checked("enableCustomCharacterPictures"),
    enableCustomPersonaPictures: checked("enableCustomPersonaPictures"),
    enableCustomPictureLibrary: checked("enableCustomPictureLibrary"),
    chatSceneGalleriesEnabled: checked("chatSceneGalleriesEnabled"),
    chatBackgroundUseAvatar: checked("chatBackgroundUseAvatar"),
    chatBackgroundAnimateAvatar: checked("chatBackgroundAnimateAvatar"),
    chatBackgroundBubbleOpacity: Math.max(25, Math.min(100, Number(value("chatBackgroundBubbleOpacity", "100")) || 100)),
    chatBackgroundDim: Math.min(90, Math.max(0, Number(value("chatBackgroundDim", "45")) || 0)),
    chatBackgroundBlur: Math.min(30, Math.max(0, Number(value("chatBackgroundBlur", "0")) || 0)),
    chatBackgroundFit: ["cover", "contain", "tile"].includes(value("chatBackgroundFit", "cover")) ? value("chatBackgroundFit", "cover") : "cover",
    chatBackgroundPosition: ["center", "top", "bottom", "left", "right"].includes(value("chatBackgroundPosition", "center")) ? value("chatBackgroundPosition", "center") : "center",








































    chatBubblePreserveActionColors: value("chatBubbleAiActionMode", "native") !== "base" || value("chatBubbleUserActionMode", "native") !== "base",
    hideChatVoiceButton: checked("hideChatVoiceButton"),
    hideUnlockCustomVoices: checked("hideUnlockCustomVoices"),


    rpStateTrackerMode: ["manual", "conservative", "assisted"].includes(value("rpStateTrackerMode")) ? value("rpStateTrackerMode") : "conservative",
    rpStateInjectMode: ["manual", "changed", "every"].includes(value("rpStateInjectMode")) ? value("rpStateInjectMode") : "changed",
    rpStateMaxContextChars: Math.max(300, Math.min(3000, Number(value("rpStateMaxContextChars", "1200")) || 1200)),
    rpStateShowQuickPanel: checked("rpStateShowQuickPanel", true),

    allowTypingWhileAiResponding: checked("allowTypingWhileAiResponding"),
    keepChatPositionWhileTyping: checked("keepChatPositionWhileTyping"),

    protectDraftDuringMessageRemoval: checked("protectDraftDuringMessageRemoval"),
    failedMessageHelper: checked("failedMessageHelper"),
    autoRetryFailedMessageSends: checked("autoRetryFailedMessageSends"),
    chatPerformanceMode: checked("chatPerformanceMode"),
    runtimePerformanceMode: ["normal", "adaptive", "aggressive", "maximum"].includes(value("runtimePerformanceMode")) ? value("runtimePerformanceMode") : "adaptive",
    maximumPerformancePresetInitialized: loadedSettingsSnapshot.maximumPerformancePresetInitialized === true,
    maximumPerformanceOptOuts: Array.isArray(loadedSettingsSnapshot.maximumPerformanceOptOuts) ? loadedSettingsSnapshot.maximumPerformanceOptOuts : [],
    desktopAppPerformanceGuard: checked("desktopAppPerformanceGuard", true),
    pauseQolInHiddenTabs: checked("pauseQolInHiddenTabs"),
    autoPerformanceLargeChats: checked("autoPerformanceLargeChats"),
    largeChatPerformanceThreshold: Math.max(100, Math.min(5000, Number(value("largeChatPerformanceThreshold", "300")) || 300)),
    deferQolWhileTyping: checked("deferQolWhileTyping"),
    pauseQolWhileMessageEditing: checked("pauseQolWhileMessageEditing", true),
    reduceQolAnimations: checked("reduceQolAnimations"),
    reduceOptionsAnimations: checked("reduceOptionsAnimations"),
    settingsNavigationStyle: ["classic", "grouped"].includes(value("settingsNavigationStyle")) ? value("settingsNavigationStyle") : "classic",
    settingsContentLayout: ["single", "adaptive"].includes(value("settingsContentLayout")) ? value("settingsContentLayout") : "single",
    settingsPageWidth: ["comfortable", "wide"].includes(value("settingsPageWidth")) ? value("settingsPageWidth") : "comfortable",
    collapseSettingsSectionsByDefault: checked("collapseSettingsSectionsByDefault"),
    featureIndexCollapsedCategories: normalizeFeatureIndexCollapsedCategories(loadedSettingsSnapshot.featureIndexCollapsedCategories),

    deepSleepDisabledFeatures: true,
    performanceDiagnostics: checked("performanceDiagnostics"),
    enableLocalChangeHistory: checked("enableLocalChangeHistory"),
    showUpdateNotifications: checked("showUpdateNotifications", false),











    chatExportLoadPreviousMessages: checked("chatExportLoadPreviousMessages"),
    chatExportHistoryMode: value("chatExportHistoryMode", "api"),



    showOocTools: checked("showOocTools"),
    oocTemplates,

    savePersonasFromPages: checked("savePersonasFromPages"),
    personaFullBackupEnabled: checked("personaFullBackupEnabled"),
    keepLocalPersonaCopies: checked("keepLocalPersonaCopies"),
    expandPersonaDescriptions: checked("expandPersonaDescriptions"),
    enablePersonaOrganizer: checked("enablePersonaOrganizer"),
    personaFolders: value("personaFolders", ""),
    personaShowLocalMetaInPicker: checked("personaShowLocalMetaInPicker"),
    showPersonaQuickSwitch: checked("showPersonaQuickSwitch"),
    autoAcceptPersonaChange: checked("autoAcceptPersonaChange"),
    personaQuickSwitchLimit: Math.max(1, Math.min(12, Number(value("personaQuickSwitchLimit", "6")) || 6)),




















    // Legacy all-social flag is cleared once the individual choices are saved.

    // Legacy all-footer flag is cleared once the per-link settings are saved.


    enableMainFooterManagement: checked("enableMainFooterManagement"),
    hideMainFooterEntirely: checked("hideMainFooterEntirely"),
    hideMainFooterCompany: checked("hideMainFooterCompany"),
    hideMainFooterResources: checked("hideMainFooterResources"),
    hideMainFooterCommunity: checked("hideMainFooterCommunity"),
    hideMainFooterJoinUs: checked("hideMainFooterJoinUs"),
    hideMainFooterAppDownload: checked("hideMainFooterAppDownload"),
    hideMainFooter2257: checked("hideMainFooter2257"),

    blockCards: checked("blockCards"),
    autoBlockWordMatches: checked("autoBlockWordMatches"),
    autoBlockTagMatches: checked("autoBlockTagMatches"),
    hideHomeForYouCards: checked("hideHomeForYouCards"),
    expandLongCardDescriptions: checked("expandLongCardDescriptions"),
    showCardGreetingTokenInfo: checked("showCardGreetingTokenInfo"),
    showExactMessageCounts: checked("showExactMessageCounts"),
    showBotCreationDates: checked("showBotCreationDates"),
    showNewBotBadge: checked("showNewBotBadge"),
    expandBotNamesOnHover: checked("expandBotNamesOnHover"),
    cardTokenShowGreeting: checked("cardTokenShowGreeting", true),
    cardTokenShowDescription: false,
    cardTokenShowPersonality: checked("cardTokenShowPersonality"),
    cardTokenShowScenario: checked("cardTokenShowScenario"),
    cardTokenShowExamples: checked("cardTokenShowExamples"),
    cardTokenShowCombined: false,
    hideGroupChats: checked("hideGroupChats"),
    publicPersonalityOnly: checked("publicPersonalityOnly"),
    showLorebookFilters: checked("showLorebookFilters"),
    showRulebookFilters: checked("showRulebookFilters"),

    enableMyCreationsBulkBackup: checked("enableMyCreationsBulkBackup"),
    enableAccountMigrationAssistant: checked("enableAccountMigrationAssistant"),
    showMyLorebookEditButtons: checked("showMyLorebookEditButtons"),
    showMyChatbotEditButtons: checked("showMyChatbotEditButtons"),



    showQuickUnblockButtons: checked("showQuickUnblockButtons"),
    reduceAnimatedBotImages: checked("reduceAnimatedBotImages"),
    animatedImageMode: "hover",
    animatedImagesListings: checked("animatedImagesListings"),
    animatedImagesChats: checked("animatedImagesChats"),
    animatedImagesProfiles: checked("animatedImagesProfiles"),
    animatedImagesChatMedia: checked("animatedImagesChatMedia"),
    replaceCardProfileWithBlockButton: checked("replaceCardProfileWithBlockButton"),

    enableBulkCardBlocking: checked("enableBulkCardBlocking"),
    bulkCardBlockingSidebarLauncher: checked("bulkCardBlockingSidebarLauncher"),
    quickDislikeOnBlock: false,
    quickDislikeIdleEnabled: checked("quickDislikeOnBlock"),
    quickDislikeIdleMinutes: Math.min(60, Math.max(1, Number(value("quickDislikeIdleMinutes", "5")) || 5)),
    blockedBulkDislikeDelayMs: Math.min(10000, Math.max(250, Number(value("blockedBulkDislikeDelayMs", "750")) || 750)),

    allowedLanguages: getAllowedLanguages(),

    ...readTextNormalizationSettingsFromPage(),
    blockedTags: linesToArray(value("blockedTags")),
    blockedWords: linesToArray(value("blockedWords")),
    blockedCreators: linesToArray(value("blockedCreators")),
    rulebookBlockingEnabled: checked("rulebookBlockingEnabled", false),
    applyBotBlockingToRulebooks: checked("applyBotBlockingToRulebooks", false),
    showRulebookBlockButtons: checked("showRulebookBlockButtons", false),
    rulebookBlockedIds: linesToArray(value("rulebookBlockedIds")),
    lorebookBlockingEnabled: checked("lorebookBlockingEnabled", false),
    applyBotBlockingToLorebooks: checked("applyBotBlockingToLorebooks", false),
    showLorebookBlockButtons: checked("showLorebookBlockButtons", false),
    lorebookTrackHistory: checked("lorebookTrackHistory", false),
    showLorebookConnections: checked("showLorebookConnections", false),
    lorebookBlockedIds: linesToArray(value("lorebookBlockedIds")),
    blockedBotIds: uniqueClean(blockingDataLoaded ? blockedState.ids : (loadedSettingsSnapshot.blockedBotIds || [])),
    blockedBotNames: uniqueClean(blockingDataLoaded ? blockedState.names : (loadedSettingsSnapshot.blockedBotNames || [])),
    blockedBotSortMode: getBotSortMode("blocked"),
    hiddenCardMode: value("hiddenCardMode", "hide"),

    autoLoadAllOpenedChats: false,
    deepImportMaxPages: 80,
    showBlockCurrentBotButton: false,
    enablePersonalUsageSummary: checked("enablePersonalUsageSummary"),
    debug: checked("debug"),
    // Only installed feature modules contribute their controls here.
    // Omitted modules cannot silently write default values for their keys.
    ...Object.fromEntries(Object.entries(window.__DSQ_FEATURE_SETTINGS_READERS__ || {})
      .filter(([key]) => !isSettingOwnedByExcludedFeature(key))
      .map(([key, reader]) => [key, reader()])
    )
  };
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features)) {
    const installed = new Set(profile.features);
    const owners = window.__DSQ_FEATURE_SETTING_OWNERS__ || {};
    for (const [feature, keys] of Object.entries(owners)) {
      if (installed.has(feature)) continue;
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(result, key)) continue;
        if (Object.prototype.hasOwnProperty.call(loadedSettingsSnapshot || {}, key))
          result[key] = loadedSettingsSnapshot[key];
        else delete result[key];
      }
    }
  }
  return result;
}

// Build-time feature exclusions must never turn a missing Settings control
// into a saved false/default value. Full QoL has no generated exclusion profile.
function isSettingOwnedByExcludedFeature(settingKey) {
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (!profile?.generated || !Array.isArray(profile.features)) return false;
  const key = String(settingKey || '').trim();
  if (!key) return false;
  const owners = window.__DSQ_FEATURE_SETTING_OWNERS__ || {};
  for (const [feature, keys] of Object.entries(owners)) {
    if (Array.isArray(keys) && keys.includes(key) && !profile.features.includes(feature)) return true;
  }
  return false;
}

function readSingleSettingFromPage(settingKey) {
  if (isSettingOwnedByExcludedFeature(settingKey)) return SETTINGS_AUTOSAVE_MISSING;
  const ownedReader = window.__DSQ_FEATURE_SETTINGS_READERS__?.[String(settingKey || "")];
  if (typeof ownedReader === "function") return ownedReader();
  switch (String(settingKey || "")) {
    case "enabled": return (checked("enabled"));
    case "saiToolkitCompatibility": return (checked("saiToolkitCompatibility", false));
    case "globalNsfwMode": return (value("globalNsfwMode", "ignore"));



    case "lowMemoryProtectionEnabled": return (checked("lowMemoryProtectionEnabled"));
    case "maxAwakeSpicyTabs": return (Math.min(20, Math.max(1, Number(value("maxAwakeSpicyTabs", "3")) || 3)));




    case "duplicateTabGuardEnabled": return (checked("duplicateTabGuardEnabled"));
    case "duplicateTabChats": return (checked("duplicateTabChats", true));
    case "duplicateTabHome": return (checked("duplicateTabHome"));
    case "duplicateTabProfiles": return (checked("duplicateTabProfiles"));
    case "duplicateTabKeepMode": return (value("duplicateTabKeepMode") === "existing" ? "existing" : "new");
    case "duplicateTabFocusExisting": return (checked("duplicateTabFocusExisting", true));
    case "tabCleanupRecentHours": return (Math.min(72, Math.max(1, Number(value("tabCleanupRecentHours", "24")) || 24)));
    case "tabCleanupRecentDays": return (Math.min(30, Math.max(1, Number(value("tabCleanupRecentDays", "3")) || 3)));
    case "tabCleanupMediumDays": return (Math.min(90, Math.max(2, Number(value("tabCleanupMediumDays", "7")) || 7)));
    case "tabCleanupOldDays": return (Math.min(365, Math.max(3, Number(value("tabCleanupOldDays", "14")) || 14)));
    case "tabCleanupProtectPinnedOnClose": return (checked("tabCleanupProtectPinnedOnClose", true));












    case "botEditorAutoOpenAdvanced": return (checked("botEditorAutoOpenAdvanced"));
    case "rememberBotImagePrompt": return (checked("rememberBotImagePrompt"));
    case "botEditorSaveActions": return (checked("botEditorSaveActions"));
    case "botEditorSaveChatNewTab": return (checked("botEditorSaveChatNewTab"));
    case "enableBotEditorDraftHistory": return (checked("enableBotEditorDraftHistory"));
    case "botEditorDraftHistoryLimit": return (Math.max(3, Math.min(20, Number(value("botEditorDraftHistoryLimit", "8")) || 8)));
    case "enableWikiLorebookImporter": return (checked("enableWikiLorebookImporter"));
    case "enableLorebookConsistency": return (checked("enableLorebookConsistency"));
    case "enableCreatorTriggerPreview": return (checked("enableCreatorTriggerPreview"));
    case "lorebookConsistencyShowMatches": return (checked("lorebookConsistencyShowMatches", true));
    case "lorebookConsistencyAutoQueue": return (checked("lorebookConsistencyAutoQueue", false));
    case "lorebookConsistencyMaxEntries": return (Math.max(1, Math.min(5, Number(value("lorebookConsistencyMaxEntries", "3")) || 3)));
    case "lorebookDefaultEntriesTab": return (checked("lorebookDefaultEntriesTab", false));
    case "lorebookRememberEntrySort": return (checked("lorebookRememberEntrySort", false));
    case "lorebookProtectEntryDrafts": return (checked("lorebookProtectEntryDrafts", false));
    case "lorebookEditShortcuts": return (checked("lorebookEditShortcuts", false));
    case "lorebookEntryManager": return (checked("lorebookEntryManager", false));
    case "lorebookMultiEntryWorkspace": return (checked("lorebookMultiEntryWorkspace", false));
    case "lorebookEntrySelectionCheckbox": return (checked("lorebookEntrySelectionCheckbox", true));
    case "lorebookEntryShowTokenCount": return (checked("lorebookEntryShowTokenCount", true));
    case "lorebookEntryShowHiddenKeywordCount": return (checked("lorebookEntryShowHiddenKeywordCount", true));
    case "lorebookEntryShowNoKeywordsWarning": return (checked("lorebookEntryShowNoKeywordsWarning", true));
    case "lorebookEntryShowCharacterCount": return (checked("lorebookEntryShowCharacterCount", true));
    case "lorebookEntryQuickToggle": return (checked("lorebookEntryQuickToggle"));
    case "lorebookEntryRenameButton": return (checked("lorebookEntryRenameButton", true));
    case "lorebookEntryCopyButton": return (checked("lorebookEntryCopyButton", true));
    case "lorebookEntryDuplicateButton": return (checked("lorebookEntryDuplicateButton", true));
    case "lorebookBulkSelectAll": return (checked("lorebookBulkSelectAll", true));
    case "lorebookBulkClear": return (checked("lorebookBulkClear", true));
    case "lorebookBulkAnalyze": return (checked("lorebookBulkAnalyze", true));
    case "lorebookBulkExportSelected": return (checked("lorebookBulkExportSelected", true));
    case "lorebookBulkCopySelected": return (checked("lorebookBulkCopySelected", true));
    case "lorebookBulkDuplicateSelected": return (checked("lorebookBulkDuplicateSelected", true));
    case "lorebookBulkAddKeyword": return (checked("lorebookBulkAddKeyword", true));
    case "lorebookBulkRemoveKeyword": return (checked("lorebookBulkRemoveKeyword", true));
    case "lorebookBulkToggleEnabled": return (checked("lorebookBulkToggleEnabled", true));
    case "lorebookBulkDeleteSelected": return (checked("lorebookBulkDeleteSelected", true));
    case "lorebookBulkFindKeyword": return (checked("lorebookBulkFindKeyword", true));
    case "lorebookAutoStartNew": return (checked("lorebookAutoStartNew"));
    case "lorebookBulkKeywordPaste": return (checked("lorebookBulkKeywordPaste"));
    case "lorebookExpandEntryEditor": return (checked("lorebookExpandEntryEditor"));
    case "lorebookExpandTags": return (checked("lorebookExpandTags"));
    case "botTagBulkPaste": return (checked("botTagBulkPaste"));
    case "showLorebookEntryExpandButtons": return (checked("showLorebookEntryExpandButtons"));
    case "creatorModerationWarnings": return (checked("creatorModerationWarnings"));
    case "creatorModerationWarningsChatbots": return (checked("creatorModerationWarningsChatbots"));
    case "creatorModerationWarningMode": return (value("creatorModerationWarningMode") === "all" ? "all" : "balanced");
    case "creatorModerationWarningIgnoredTerms": return (value("creatorModerationWarningIgnoredTerms", "").slice(0, 4000));
    case "creatorModerationWarningCustomTerms": return (value("creatorModerationWarningCustomTerms", "").slice(0, 12000));
    case "botEditorDefaultVisibility": return (["public", "unlisted"].includes(value("botEditorDefaultVisibility")) ? value("botEditorDefaultVisibility") : "ignore");
    case "autoAgreeCreationGuidelines": return (checked("autoAgreeCreationGuidelines"));
    case "botEditorSnippets": return (botEditorSnippetsFromPage());


    case "hidePremium": return (checked("hidePremium"));
    case "hideFloatingPremiumPopups": return (checked("hideFloatingPremiumPopups"));
    case "hideAdvertBanners": return (checked("hideAdvertBanners"));






    case "chatTopBarAddLaterButton": return (checked("chatTopBarAddLaterButton"));
    case "closeChatTabAfterSavingLater": return (checked("closeChatTabAfterSavingLater"));
    case "showPerCharacterChatHistory": return (checked("showPerCharacterChatHistory"));
    case "showQuickNewChatButton": return (checked("showQuickNewChatButton"));


    case "enableBulkMemoryManager": return (checked("enableBulkMemoryManager"));
    case "enableMemoryVault": return (checked("enableMemoryVault"));
    case "showCopyMemoryAction": return (checked("showCopyMemoryAction"));
    case "memoryAutoLoadAll": return (checked("memoryAutoLoadAll"));

    case "showChatListTools": return (checked("showChatListTools"));
    case "enableChatOrganizer": return (checked("enableChatOrganizer"));
    case "chatListPopoutShortcut": return checked("chatListPopoutShortcut");
    case "chatListRenameShortcut": return checked("chatListRenameShortcut");
    case "enableChatPins": return (checked("enableChatPins"));
    case "chatListTwoColumns": return checked("chatListTwoColumns");
    case "chatCollections": return (value("chatCollections", ""));
    case "showSavedChatQuickActions": return (checked("showSavedChatQuickActions"));





    case "chatListSortMode": return (value("chatListSortMode", "default"));
    case "chatListSearchMode": return ("all");
    case "chatListOpenedFilter": return (["all", "opened", "unopened"].includes(value("chatListOpenedFilter")) ? value("chatListOpenedFilter") : "all");
    case "chatListMessageFilter": return (["all", "0", "1-9", "10-49", "50-99", "100-499", "500+", "unknown"].includes(value("chatListMessageFilter")) ? value("chatListMessageFilter") : "all");
    case "chatListSavedFilter": return (["all", "favorite", "later", "both", "saved", "neither"].includes(value("chatListSavedFilter")) ? value("chatListSavedFilter") : "all");
    case "chatListBlockedFilter": return (["all", "blocked", "unblocked"].includes(value("chatListBlockedFilter")) ? value("chatListBlockedFilter") : "all");
    case "trackOpenedChats": return (checked("trackOpenedChats"));
    case "lorebookStatusScanSpeed": return (Object.prototype.hasOwnProperty.call(LOREBOOK_STATUS_SCAN_SPEED_DELAYS, value("lorebookStatusScanSpeed", "safe")) ? value("lorebookStatusScanSpeed", "safe") : "safe");
    case "lorebookStatusStaleDays": return ([1, 7, 14, 30].includes(Number(value("lorebookStatusStaleDays", "7"))) ? Number(value("lorebookStatusStaleDays", "7")) : 7);
    case "importOpenedFromChatsPage": return (checked("importOpenedFromChatsPage"));
    case "hideOpenedChats": return (checked("hideOpenedChats"));
    case "openedBotSortMode": return (value("openedBotSortMode", "newest"));





    case "popupShowOpenedCount": return (checked("popupShowOpenedCount", false));
    case "popupShowBlockedCount": return (checked("popupShowBlockedCount", false));
    case "popupShowStorageDetails": return (checked("popupShowStorageDetails"));









    case "enableChatIndex": return checked("enableChatIndex");
    case "chatIndexEnhanceNativeSearch": return checked("chatIndexEnhanceNativeSearch");
    case "chatIndexStandaloneLauncher": return checked("chatIndexStandaloneLauncher");







    case "showAutoImageInlineButton": return checked("showAutoImageInlineButton");

    case "compactAfterHiding": return (checked("compactAfterHiding"));
    case "neverHideFavorites": return (checked("neverHideFavorites"));
    case "protectFavoritesFromBlocking": return (checked("protectFavoritesFromBlocking"));
    case "showCreatorFavoriteButtons": return (checked("showCreatorFavoriteButtons"));
    case "showCreatorFavoriteButtonsOnMyChatbots": return (checked("showCreatorFavoriteButtonsOnMyChatbots"));
    case "protectFavoriteCreatorsFromFiltering": return (checked("protectFavoriteCreatorsFromFiltering"));
    case "showFollowCreatorButtons": return (checked("showFollowCreatorButtons"));
    case "enableCreatorBotNotifications": return (checked("enableCreatorBotNotifications"));
    case "creatorBotCheckMinutes": return (CREATOR_BOT_WATCH_INTERVALS.includes(Number(value("creatorBotCheckMinutes", "60"))) ? Number(value("creatorBotCheckMinutes", "60")) : 60);
    case "creatorBotBrowserNotifications": return (checked("creatorBotBrowserNotifications"));
    case "trackFavoriteBots": return (checked("trackFavoriteBots"));
    case "showFavoritesBulkSelect": return (checked("showFavoritesBulkSelect", true));
    case "showFavoritesScanButton": return (checked("showFavoritesScanButton", true));
    case "showFavoriteHistoryButton": return (checked("showFavoriteHistoryButton"));
    case "enableFavoritesRecovery": return (checked("enableFavoritesRecovery"));
    case "favoriteBotSortMode": return (value("favoriteBotSortMode", "newest"));
    case "favoriteBotRelationFilter": return (value("favoriteBotRelationFilter", "all"));
    case "favoriteBotFolderFilter": return (value("favoriteBotFolderFilter", "all"));
    case "favoriteBotCreatorFilter": return (value("favoriteBotCreatorFilter", ""));
    case "favoriteBotStateFilter": return (value("favoriteBotStateFilter", "all"));
    case "showLaterBotButtons": return (checked("showLaterBotButtons"));
    case "enableSavedListsOverlay": return (checked("enableSavedListsOverlay"));
    case "protectLaterBotsFromFiltering": return (checked("protectLaterBotsFromFiltering"));
    case "hideLaterBotsFromListings": return (checked("hideLaterBotsFromListings"));
    case "laterBotSortMode": return (value("laterBotSortMode", "newest"));
    case "laterBotRelationFilter": return (value("laterBotRelationFilter", "all"));
    case "laterBotFolderFilter": return (value("laterBotFolderFilter", "all"));
    case "laterBotCreatorFilter": return (value("laterBotCreatorFilter", ""));
    case "laterBotStateFilter": return (value("laterBotStateFilter", "all"));





    case "showListingRefillButton": return (checked("showListingRefillButton"));
    case "showListingFilterStats": return (checked("showListingFilterStats"));
    case "showListingFilterStatsDetails": return (checked("showListingFilterStatsDetails"));


    case "hideChatPlusButton": return (checked("hideChatPlusButton"));
    case "hideChatImageButton": return (checked("hideChatImageButton"));
    case "replaceChatImageWithOocButton": return (checked("replaceChatImageWithOocButton"));
    case "showAsteriskButton": return (checked("showAsteriskButton"));
    case "composerShortcutPlacement": return (["inside-right", "outside-left", "outside-right"].includes(value("composerShortcutPlacement")) ? value("composerShortcutPlacement") : "inside-right");
    case "chatEnterKeyBehavior": return (["site-default", "send", "newline"].includes(value("chatEnterKeyBehavior")) ? value("chatEnterKeyBehavior") : "site-default");
    case "autoPairAsterisks": return (checked("autoPairAsterisks"));
    case "showFormattingToolbar": return (checked("showFormattingToolbar"));
    case "formatToolbarAsterisk": return (checked("formatToolbarAsterisk", true));
    case "formatToolbarBold": return (checked("formatToolbarBold", true));
    case "formatToolbarBoldItalic": return (checked("formatToolbarBoldItalic"));
    case "formatToolbarStrike": return (checked("formatToolbarStrike"));
    case "formatToolbarParens": return (checked("formatToolbarParens", true));
    case "formatToolbarQuotes": return (checked("formatToolbarQuotes", true));
    case "formatToolbarBackticks": return (checked("formatToolbarBackticks"));
    case "formatToolbarBrackets": return (checked("formatToolbarBrackets"));
    case "formatToolbarBraces": return (checked("formatToolbarBraces"));
    case "formatToolbarCustomWrappers": return (value("formatToolbarCustomWrappers", ""));

    case "replyInstructionText": return (value("replyInstructionText", "").trim().slice(0, 2000));
    case "replyInstructionSendMode": return (["every", "session", "manual"].includes(value("replyInstructionSendMode")) ? value("replyInstructionSendMode") : "session");
    case "replyInstructionOocWrapper": return (checked("replyInstructionOocWrapper", true));
    case "replyInstructionShowChatButton": return (checked("replyInstructionShowChatButton", true));
    case "replyInstructionBotOverrides": return (normalizeReplyInstructionOverrides(loadedSettingsSnapshot.replyInstructionBotOverrides));
    case "enableGlobalMemory": return (checked("enableGlobalMemory"));
    case "globalMemoryText": return (value("globalMemoryText", "").trim().slice(0, 4000));
    case "globalMemorySendMode": return (["every", "session", "manual"].includes(value("globalMemorySendMode")) ? value("globalMemorySendMode") : "session");
    case "globalMemoryOocWrapper": return (checked("globalMemoryOocWrapper", true));
    case "globalMemoryShowChatButton": return (checked("globalMemoryShowChatButton", true));
    case "enableRpFormatRepair": return (checked("enableRpFormatRepair"));
    case "enableCharacterQolProfiles": return (checked("enableCharacterQolProfiles"));
    case "rpFormatRepairAuto": return (checked("rpFormatRepairAuto", true));
    case "rpFormatStyle": return (["clean", "quoted"].includes(value("rpFormatStyle")) ? value("rpFormatStyle") : "clean");
    case "rpFormatDetection": return (["conservative", "balanced", "aggressive"].includes(value("rpFormatDetection")) ? value("rpFormatDetection") : "balanced");
    case "rpFormatConvertBoldActions": return (checked("rpFormatConvertBoldActions", true));
    case "rpFormatRemoveActionParens": return (checked("rpFormatRemoveActionParens", true));
    case "rpFormatPreserveInlineEmphasis": return (checked("rpFormatPreserveInlineEmphasis", true));
    case "rpFormatPreserveSemanticQuotes": return (checked("rpFormatPreserveSemanticQuotes", true));
    case "rpFormatPreserveBackticks": return (checked("rpFormatPreserveBackticks", true));
    case "rpFormatShowMessageButtons": return (checked("rpFormatShowMessageButtons", true));
    case "enableChatBackgrounds": return (checked("enableChatBackgrounds"));
    case "enableCustomCharacterPictures": return checked("enableCustomCharacterPictures");
    case "enableCustomPersonaPictures": return checked("enableCustomPersonaPictures");
    case "enableCustomPictureLibrary": return checked("enableCustomPictureLibrary");
    case "chatSceneGalleriesEnabled": return (checked("chatSceneGalleriesEnabled"));
    case "chatBackgroundDim": return (Math.min(90, Math.max(0, Number(value("chatBackgroundDim", "45")) || 0)));
    case "chatBackgroundBlur": return (Math.min(30, Math.max(0, Number(value("chatBackgroundBlur", "0")) || 0)));
    case "chatBackgroundFit": return (["cover", "contain", "tile"].includes(value("chatBackgroundFit", "cover")) ? value("chatBackgroundFit", "cover") : "cover");
    case "chatBackgroundPosition": return (["center", "top", "bottom", "left", "right"].includes(value("chatBackgroundPosition", "center")) ? value("chatBackgroundPosition", "center") : "center");








































    case "chatBubblePreserveActionColors": return (value("chatBubbleAiActionMode", "native") !== "base" || value("chatBubbleUserActionMode", "native") !== "base");
    case "hideChatVoiceButton": return (checked("hideChatVoiceButton"));
    case "hideUnlockCustomVoices": return (checked("hideUnlockCustomVoices"));


    case "rpStateTrackerMode": return (["manual", "conservative", "assisted"].includes(value("rpStateTrackerMode")) ? value("rpStateTrackerMode") : "conservative");
    case "rpStateInjectMode": return (["manual", "changed", "every"].includes(value("rpStateInjectMode")) ? value("rpStateInjectMode") : "changed");
    case "rpStateMaxContextChars": return (Math.max(300, Math.min(3000, Number(value("rpStateMaxContextChars", "1200")) || 1200)));
    case "rpStateShowQuickPanel": return (checked("rpStateShowQuickPanel", true));

    case "allowTypingWhileAiResponding": return (checked("allowTypingWhileAiResponding"));
    case "keepChatPositionWhileTyping": return (checked("keepChatPositionWhileTyping"));

    case "protectDraftDuringMessageRemoval": return (checked("protectDraftDuringMessageRemoval"));
    case "failedMessageHelper": return (checked("failedMessageHelper"));
    case "autoRetryFailedMessageSends": return (checked("autoRetryFailedMessageSends"));
    case "chatPerformanceMode": return (checked("chatPerformanceMode"));
    case "runtimePerformanceMode": return (["normal", "adaptive", "aggressive", "maximum"].includes(value("runtimePerformanceMode")) ? value("runtimePerformanceMode") : "adaptive");
    case "maximumPerformancePresetInitialized": return (loadedSettingsSnapshot.maximumPerformancePresetInitialized === true);
    case "maximumPerformanceOptOuts": return (Array.isArray(loadedSettingsSnapshot.maximumPerformanceOptOuts) ? loadedSettingsSnapshot.maximumPerformanceOptOuts : []);
    case "desktopAppPerformanceGuard": return (checked("desktopAppPerformanceGuard", true));
    case "pauseQolInHiddenTabs": return (checked("pauseQolInHiddenTabs"));
    case "autoPerformanceLargeChats": return (checked("autoPerformanceLargeChats"));
    case "largeChatPerformanceThreshold": return (Math.max(100, Math.min(5000, Number(value("largeChatPerformanceThreshold", "300")) || 300)));
    case "deferQolWhileTyping": return (checked("deferQolWhileTyping"));
    case "pauseQolWhileMessageEditing": return (checked("pauseQolWhileMessageEditing", true));
    case "reduceQolAnimations": return (checked("reduceQolAnimations"));
    case "reduceOptionsAnimations": return (checked("reduceOptionsAnimations"));
    case "settingsNavigationStyle": return (["classic", "grouped"].includes(value("settingsNavigationStyle")) ? value("settingsNavigationStyle") : "classic");
    case "settingsContentLayout": return (["single", "adaptive"].includes(value("settingsContentLayout")) ? value("settingsContentLayout") : "single");
    case "settingsPageWidth": return (["comfortable", "wide"].includes(value("settingsPageWidth")) ? value("settingsPageWidth") : "comfortable");
    case "collapseSettingsSectionsByDefault": return (checked("collapseSettingsSectionsByDefault"));
    case "featureIndexCollapsedCategories": return normalizeFeatureIndexCollapsedCategories(loadedSettingsSnapshot.featureIndexCollapsedCategories);

    case "deepSleepDisabledFeatures": return true;
    case "performanceDiagnostics": return (checked("performanceDiagnostics"));
    case "enableLocalChangeHistory": return (checked("enableLocalChangeHistory"));
    case "showUpdateNotifications": return (checked("showUpdateNotifications", false));










    case "chatExportLoadPreviousMessages": return (checked("chatExportLoadPreviousMessages"));
    case "chatExportHistoryMode": return (value("chatExportHistoryMode", "api"));



    case "showOocTools": return (checked("showOocTools"));
    case "oocTemplates": return oocTemplatesFromPage();
    case "savePersonasFromPages": return (checked("savePersonasFromPages"));
    case "personaFullBackupEnabled": return (checked("personaFullBackupEnabled"));
    case "keepLocalPersonaCopies": return (checked("keepLocalPersonaCopies"));
    case "expandPersonaDescriptions": return (checked("expandPersonaDescriptions"));
    case "enablePersonaOrganizer": return (checked("enablePersonaOrganizer"));
    case "personaFolders": return (value("personaFolders", ""));
    case "personaShowLocalMetaInPicker": return (checked("personaShowLocalMetaInPicker"));
    case "showPersonaQuickSwitch": return (checked("showPersonaQuickSwitch"));
    case "autoAcceptPersonaChange": return (checked("autoAcceptPersonaChange"));
    case "personaQuickSwitchLimit": return (Math.max(1, Math.min(12, Number(value("personaQuickSwitchLimit", "6")) || 6)));


























    case "enableMainFooterManagement": return (checked("enableMainFooterManagement"));
    case "hideMainFooterEntirely": return (checked("hideMainFooterEntirely"));
    case "hideMainFooterCompany": return (checked("hideMainFooterCompany"));
    case "hideMainFooterResources": return (checked("hideMainFooterResources"));
    case "hideMainFooterCommunity": return (checked("hideMainFooterCommunity"));
    case "hideMainFooterJoinUs": return (checked("hideMainFooterJoinUs"));
    case "hideMainFooterAppDownload": return (checked("hideMainFooterAppDownload"));
    case "hideMainFooter2257": return (checked("hideMainFooter2257"));
    case "blockCards": return (checked("blockCards"));
    case "autoBlockWordMatches": return (checked("autoBlockWordMatches"));
    case "autoBlockTagMatches": return (checked("autoBlockTagMatches"));
    case "hideHomeForYouCards": return (checked("hideHomeForYouCards"));
    case "expandLongCardDescriptions": return (checked("expandLongCardDescriptions"));
    case "showCardGreetingTokenInfo": return (checked("showCardGreetingTokenInfo"));
    case "showExactMessageCounts": return (checked("showExactMessageCounts"));
    case "showBotCreationDates": return (checked("showBotCreationDates"));
    case "expandBotNamesOnHover": return (checked("expandBotNamesOnHover"));
    case "cardTokenShowGreeting": return (checked("cardTokenShowGreeting", true));
    case "cardTokenShowDescription": return (false);
    case "cardTokenShowPersonality": return (checked("cardTokenShowPersonality"));
    case "cardTokenShowScenario": return (checked("cardTokenShowScenario"));
    case "cardTokenShowExamples": return (checked("cardTokenShowExamples"));
    case "cardTokenShowCombined": return (false);
    case "hideGroupChats": return (checked("hideGroupChats"));
    case "publicPersonalityOnly": return (checked("publicPersonalityOnly"));
    case "showLorebookFilters": return (checked("showLorebookFilters"));
    case "showRulebookFilters": return (checked("showRulebookFilters"));

    case "enableMyCreationsBulkBackup": return (checked("enableMyCreationsBulkBackup"));
    case "enableAccountMigrationAssistant": return (checked("enableAccountMigrationAssistant"));
    case "showMyLorebookEditButtons": return (checked("showMyLorebookEditButtons"));
    case "showMyChatbotEditButtons": return (checked("showMyChatbotEditButtons"));

    case "showQuickUnblockButtons": return (checked("showQuickUnblockButtons"));
    case "reduceAnimatedBotImages": return (checked("reduceAnimatedBotImages"));
    case "animatedImageMode": return "hover";
    case "animatedImagesListings": return (checked("animatedImagesListings"));
    case "animatedImagesChats": return (checked("animatedImagesChats"));
    case "animatedImagesProfiles": return (checked("animatedImagesProfiles"));
    case "animatedImagesChatMedia": return (checked("animatedImagesChatMedia"));
    case "replaceCardProfileWithBlockButton": return (checked("replaceCardProfileWithBlockButton"));

    case "enableBulkCardBlocking": return (checked("enableBulkCardBlocking"));
    case "bulkCardBlockingSidebarLauncher": return (checked("bulkCardBlockingSidebarLauncher"));
    case "quickDislikeOnBlock": return (false);
    case "quickDislikeIdleEnabled": return (checked("quickDislikeOnBlock"));
    case "quickDislikeIdleMinutes": return (Math.min(60, Math.max(1, Number(value("quickDislikeIdleMinutes", "5")) || 5)));
    case "blockedBulkDislikeDelayMs": return (Math.min(10000, Math.max(250, Number(value("blockedBulkDislikeDelayMs", "750")) || 750)));

    case "allowedLanguages": return (getAllowedLanguages());

    case "blockedTags": return (linesToArray(value("blockedTags")));
    case "blockedWords": return (linesToArray(value("blockedWords")));
    case "blockedCreators": return (linesToArray(value("blockedCreators")));
    case "rulebookBlockingEnabled": return checked("rulebookBlockingEnabled", false);
    case "applyBotBlockingToRulebooks": return checked("applyBotBlockingToRulebooks", false);
    case "showRulebookBlockButtons": return checked("showRulebookBlockButtons", false);
    case "rulebookBlockedIds": return linesToArray(value("rulebookBlockedIds"));
    case "lorebookBlockingEnabled": return (checked("lorebookBlockingEnabled", false));
    case "applyBotBlockingToLorebooks": return (checked("applyBotBlockingToLorebooks", false));
    case "showLorebookBlockButtons": return (checked("showLorebookBlockButtons", false));
    case "lorebookTrackHistory": return (checked("lorebookTrackHistory", false));
    case "showLorebookConnections": return checked("showLorebookConnections", false);
    case "lorebookBlockedIds": return (linesToArray(value("lorebookBlockedIds")));
    case "blockedBotIds": return (uniqueClean(blockingDataLoaded ? blockedState.ids : (loadedSettingsSnapshot.blockedBotIds || [])));
    case "blockedBotNames": return (uniqueClean(blockingDataLoaded ? blockedState.names : (loadedSettingsSnapshot.blockedBotNames || [])));
    case "blockedBotSortMode": return (getBotSortMode("blocked"));
    case "hiddenCardMode": return (value("hiddenCardMode", "hide"));
    case "autoLoadAllOpenedChats": return (false);
    case "deepImportMaxPages": return (80);
    case "showBlockCurrentBotButton": return (false);
    case "enablePersonalUsageSummary": return (checked("enablePersonalUsageSummary"));
    case "chatAlwaysShowProfileLink": return checked("chatAlwaysShowProfileLink");
    case "chatJumpToStartShortcut": return checked("chatJumpToStartShortcut");
    case "chatOpenWindowShortcut": return checked("chatOpenWindowShortcut");
    case "chatGenerationSettingsShortcut": return checked("chatGenerationSettingsShortcut");

    case "showNewBotBadge": return checked("showNewBotBadge");
    case "debug": return (checked("debug"));
    case "textNormalizationEnabled": return (checked("textNormalizationEnabled"));
    case "normalizeFancyUnicode": return (checked("normalizeFancyUnicode"));
    case "normalizePunctuation": return (checked("normalizePunctuation"));
    case "normalizeInvisibleCharacters": return (checked("normalizeInvisibleCharacters"));
    case "normalizeDecorativeSymbols": return (checked("normalizeDecorativeSymbols"));
    default: return SETTINGS_AUTOSAVE_MISSING;
  }
}

function autosaveSettingKeysForControl(control) {
  if (!(control instanceof Element)) return [];
  if (control.classList?.contains("allowed-language")) return ["allowedLanguages"];
  if (control.matches?.("input[name='autoAfkAction']")) return ["autoAfkAction"];
  const id = String(control.id || "").trim();
  if (!id) return [];
  if (id === "quickDislikeOnBlock") return ["quickDislikeIdleEnabled"];
  if (id === "chatBubbleAiActionMode" || id === "chatBubbleUserActionMode") return [id, "chatBubblePreserveActionColors"];
  return readSingleSettingFromPage(id) === SETTINGS_AUTOSAVE_MISSING ? [] : [id];
}

function setAutosaveStatus(text = "", state = "") {
  const status = $("status");
  if (!status) return;
  status.textContent = text;
  if (state) status.dataset.state = state;
  else delete status.dataset.state;
}

function autosaveDelayForControl(control, eventType = "change") {
  if (eventType === "change") return 80;
  if (control?.matches?.("textarea")) return 900;
  if (control?.matches?.("input[type='text'], input[type='search'], input[type='url'], input[type='password']")) return 700;
  if (control?.matches?.("input[type='number']")) return 450;
  if (control?.matches?.("input[type='range']")) return 220;
  return 350;
}

function queueSettingsAutosaveValue(settingKey, nextValue, { delay = 350 } = {}) {
  const key = String(settingKey || "").trim();
  if (!key || !settingsAutosaveReady || isSettingOwnedByExcludedFeature(key)) return;
  const pendingValue = settingsAutosavePending.has(key) ? settingsAutosavePending.get(key) : loadedSettingsSnapshot[key];
  if (storageValueMatches(pendingValue, nextValue)) return;
  const originalValue = settingsAutosavePrevious.has(key) ? settingsAutosavePrevious.get(key) : loadedSettingsSnapshot[key];
  if (storageValueMatches(originalValue, nextValue)) {
    settingsAutosavePending.delete(key);
    settingsAutosavePrevious.delete(key);
    loadedSettingsSnapshot = { ...loadedSettingsSnapshot, [key]: nextValue };
    if (!settingsAutosavePending.size) { clearTimeout(settingsAutosaveTimer); settingsAutosaveTimer = 0; setAutosaveStatus("Saved automatically", "saved"); }
    return;
  }
  if (!settingsAutosavePrevious.has(key)) settingsAutosavePrevious.set(key, loadedSettingsSnapshot[key]);
  settingsAutosavePending.set(key, nextValue);
  // Optimistic in-memory update keeps dependent previews/collapse state in sync
  // while the tiny debounced storage write is waiting to flush.
  loadedSettingsSnapshot = { ...loadedSettingsSnapshot, [key]: nextValue };
  clearTimeout(settingsAutosaveTimer);
  setAutosaveStatus("Saving automatically…", "saving");
  settingsAutosaveTimer = setTimeout(() => flushSettingsAutosave().catch(() => {}), Math.max(0, Number(delay) || 0));
}

function queueSettingsAutosaveForControl(control, eventType = "change") {
  if (!settingsAutosaveReady) return;
  const keys = autosaveSettingKeysForControl(control);
  if (!keys.length) return;
  for (const key of keys) {
    const next = readSingleSettingFromPage(key);
    if (next !== SETTINGS_AUTOSAVE_MISSING) queueSettingsAutosaveValue(key, next, { delay: autosaveDelayForControl(control, eventType) });
  }
}

function queueFullSettingsDiffFromPage({ delay = 0 } = {}) {
  const current = readSettingsFromPage();
  for (const [key, next] of Object.entries(current)) {
    if (storageValueMatches(loadedSettingsSnapshot[key], next)) continue;
    queueSettingsAutosaveValue(key, next, { delay });
  }
}

function queueSettingsDiffForContainer(container, { delay = 80 } = {}) {
  if (!settingsAutosaveReady || !(container instanceof Element)) return;
  const keys = new Set();
  container.querySelectorAll("input, select, textarea").forEach(control => {
    autosaveSettingKeysForControl(control).forEach(key => keys.add(key));
  });
  for (const key of keys) {
    const next = readSingleSettingFromPage(key);
    if (next === SETTINGS_AUTOSAVE_MISSING || storageValueMatches(loadedSettingsSnapshot[key], next)) continue;
    queueSettingsAutosaveValue(key, next, { delay });
  }
}

async function persistGranularSettingsPatch(patch, previous = {}, { verify = false } = {}) {
  const entries = Object.entries(patch || {}).filter(([name]) => String(name || "").trim());
  if (!entries.length) return true;
  const payload = {};
  let indexChanged = false;
  for (const [name, next] of entries) {
    payload[granularSettingStorageKey(name)] = next;
    if (!granularSettingsIndexCache.has(name)) { granularSettingsIndexCache.add(name); indexChanged = true; }
  }
  if (indexChanged || !granularSettingsMigrationSeen) payload[GRANULAR_SETTINGS_INDEX_KEY] = [...granularSettingsIndexCache].sort();
  payload[GRANULAR_SETTINGS_MIGRATION_KEY] = true;
  payload[GRANULAR_SETTINGS_REVISION_KEY] = Date.now();
  payload[GRANULAR_SETTINGS_LAST_BATCH_KEY] = {
    at: Date.now(),
    previous: Object.fromEntries(entries.map(([name]) => [name, previous[name]]))
  };
  const ok = await rawStorageSet(payload);
  if (!ok) return false;
  granularSettingsMigrationSeen = true;
  if (!verify) return true;
  const keys = entries.map(([name]) => granularSettingStorageKey(name));
  const readback = await new Promise(resolve => {
    try { chrome.storage.local.get(keys, result => resolve(chrome.runtime.lastError ? {} : (result || {}))); }
    catch { resolve({}); }
  });
  return entries.every(([name, expected]) => storageValueMatches(readback[granularSettingStorageKey(name)], expected));
}

async function flushSettingsAutosave({ force = false } = {}) {
  clearTimeout(settingsAutosaveTimer);
  settingsAutosaveTimer = 0;
  if (settingsAutosaveFlushPromise) {
    await settingsAutosaveFlushPromise;
    if (!settingsAutosavePending.size) return true;
  }
  if (!settingsAutosavePending.size) {
    if (force) setAutosaveStatus("Saved automatically", "saved");
    return true;
  }
  const patch = Object.fromEntries(settingsAutosavePending);
  const previous = Object.fromEntries([...settingsAutosavePending.keys()].map(key => [key, settingsAutosavePrevious.get(key)]));
  settingsAutosavePending.clear();
  settingsAutosavePrevious.clear();
  const diagStarted = typeof performance !== "undefined" ? performance.now() : 0;
  const diagOperationId = optionsDiagnosticState.active
    ? `settings-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    : "";
  if (diagOperationId) optionsDiag("settings", "operation-start", {
    operationId: diagOperationId,
    operation: "autosave-flush",
    settingCount: Object.keys(patch).length,
    forced: !!force
  });
  settingsAutosaveFlushPromise = (async () => {
    setAutosaveStatus(force ? "Saving now…" : "Saving automatically…", "saving");
    const ok = await persistGranularSettingsPatch(patch, previous, { verify: force });
    if (!ok) {
      for (const [key, value] of Object.entries(patch)) {
        if (settingsAutosavePending.has(key)) {
          // A newer edit arrived while this failed batch was in flight. Keep
          // the newer value, but roll its safety baseline back to the value
          // that was actually persisted before this failed batch.
          settingsAutosavePrevious.set(key, previous[key]);
          continue;
        }
        settingsAutosavePrevious.set(key, previous[key]);
        settingsAutosavePending.set(key, value);
      }
      setAutosaveStatus("Couldn’t save — press Save now to retry", "error");
      if (diagOperationId) {
        const durationMs = diagStarted ? Math.round((performance.now() - diagStarted) * 10) / 10 : 0;
        optionsDiag("settings", "operation-end", {
          operationId: diagOperationId, operation: "autosave-flush", outcome: "failed",
          settingCount: Object.keys(patch).length, forced: !!force, durationMs
        }, { critical: durationMs >= 200 });
      }
      return false;
    }
    // Do not let an older in-flight batch overwrite a newer optimistic edit
    // that was queued while this write was awaiting Chrome storage.
    const nextSnapshot = { ...loadedSettingsSnapshot };
    for (const [key, value] of Object.entries(patch)) {
      if (!settingsAutosavePending.has(key)) nextSnapshot[key] = value;
    }
    loadedSettingsSnapshot = nextSnapshot;
    applyOptionsPerformancePreferences(loadedSettingsSnapshot);
    applyOptionsAccessibilityPreview(loadedSettingsSnapshot);
    setAutosaveStatus("Saved automatically", "saved");
    if (diagOperationId) {
      const durationMs = diagStarted ? Math.round((performance.now() - diagStarted) * 10) / 10 : 0;
      optionsDiag("settings", "operation-end", {
        operationId: diagOperationId, operation: "autosave-flush", outcome: "ok",
        settingCount: Object.keys(patch).length, forced: !!force, durationMs
      }, { critical: durationMs >= 200 });
    }
    return true;
  })();
  const ok = await settingsAutosaveFlushPromise;
  settingsAutosaveFlushPromise = null;
  if (settingsAutosavePending.size && !settingsAutosaveTimer) settingsAutosaveTimer = setTimeout(() => flushSettingsAutosave().catch(() => {}), 120);
  return ok;
}

function queueAuxiliaryOptionsSave(kind, delay = 700) {
  if (!settingsAutosaveReady) return;
  auxiliaryOptionsSavePending.add(kind);
  clearTimeout(auxiliaryOptionsSaveTimer);
  auxiliaryOptionsSaveTimer = setTimeout(() => flushAuxiliaryOptionsSave().catch(() => {}), delay);
}

async function flushAuxiliaryOptionsSave() {
  clearTimeout(auxiliaryOptionsSaveTimer);
  auxiliaryOptionsSaveTimer = 0;
  if (!auxiliaryOptionsSavePending.size) return true;
  const kinds = new Set(auxiliaryOptionsSavePending);
  auxiliaryOptionsSavePending.clear();
  const payload = {};
  if (kinds.has("ooc")) payload[OOC_TEMPLATES_KEY] = oocTemplatesFromPage();
  if (kinds.has("creatorWebhook")) {
    creatorBotWebhookState = normalizeCreatorBotWebhookConfig({
      enabled: checked("creatorBotDiscordWebhookEnabled"),
      url: value("creatorBotDiscordWebhookUrl", "")
    });
    payload[CREATOR_BOT_WEBHOOK_KEY] = creatorBotWebhookState;
  }
  if (!Object.keys(payload).length) return true;
  const ok = await rawStorageSet(payload);
  if (!ok) setAutosaveStatus("Couldn’t save — press Save now to retry", "error");
  return ok;
}

function setupSettingsAutosave() {
  const saveButton = $("save");
  if (saveButton) {
    saveButton.textContent = "Save now";
    saveButton.title = "Settings save automatically. Use Save now to force and verify any pending changes.";
  }
  document.addEventListener("input", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.matches?.(".ooc-template-name, .ooc-template-text")) { queueAuxiliaryOptionsSave("ooc", 900); return; }
    if (target.id === "creatorBotDiscordWebhookUrl") { queueAuxiliaryOptionsSave("creatorWebhook", 900); return; }
    queueSettingsAutosaveForControl(target, "input");
  });
  document.addEventListener("change", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.id === "creatorBotDiscordWebhookEnabled" || target.id === "creatorBotDiscordWebhookUrl") { queueAuxiliaryOptionsSave("creatorWebhook", 80); return; }
    queueSettingsAutosaveForControl(target, "change");
    // Some parent controls programmatically toggle a dependent checkbox. Recheck
    // only this Settings card after the event instead of rescanning the page.
    const card = target.closest?.(".card");
    if (card) setTimeout(() => queueSettingsDiffForContainer(card, { delay: 90 }), 0);
  });
  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest?.("button") : null;
    if (!button) return;
    if (button.id === "addOocTemplate" || button.classList.contains("ooc-template-remove") || button.classList.contains("ooc-template-append-hard")) {
      setTimeout(() => queueAuxiliaryOptionsSave("ooc", 80), 0);
    }
    if (button.matches?.("[data-chat-bubble-preset], [data-context-keeper-preset], .settings-card-reset")) {
      const card = button.closest?.(".card");
      setTimeout(() => card
        ? queueSettingsDiffForContainer(card, { delay: 60 })
        : queueFullSettingsDiffFromPage({ delay: 60 }), 0);
      return;
    }
    // Button-driven helpers often update controls directly (presets, list
    // editors, clear/ignore actions). Reconcile just their containing card so
    // those changes autosave too without a full-page settings scan.
    const card = button.closest?.(".card");
    if (card && button.id !== "save") setTimeout(() => queueSettingsDiffForContainer(card, { delay: 90 }), 0);
  });
  window.addEventListener("pagehide", () => {
    clearTimeout(settingsAutosaveTimer);
    clearTimeout(auxiliaryOptionsSaveTimer);
    if (settingsAutosavePending.size) {
      // pagehide cannot reliably await promises, but chrome.storage.set is still
      // issued immediately with the tiny pending patch.
      const patch = Object.fromEntries(settingsAutosavePending);
      const previous = Object.fromEntries([...settingsAutosavePending.keys()].map(key => [key, settingsAutosavePrevious.get(key)]));
      persistGranularSettingsPatch(patch, previous).catch(() => {});
      settingsAutosavePending.clear();
      settingsAutosavePrevious.clear();
    }
    if (auxiliaryOptionsSavePending.size) flushAuxiliaryOptionsSave().catch(() => {});
  });
}
