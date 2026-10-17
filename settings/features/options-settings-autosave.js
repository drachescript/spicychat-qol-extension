// Feature-owned options helpers: settings-autosave. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function readSettingsFromPage() {
  const oocTemplates = oocTemplatesFromPage();

  return {
    enabled: checked("enabled"),
    saiToolkitCompatibility: checked("saiToolkitCompatibility", false),
    globalNsfwMode: value("globalNsfwMode", "ignore"),

    autoAfkEnabled: checked("autoAfkEnabled"),
    autoAfkMinutes: Math.min(43200, Math.max(15, Number(value("autoAfkMinutes", "720")) || 720)),
    autoAfkHours: Math.min(720, Math.max(0.25, (Number(value("autoAfkMinutes", "720")) || 720) / 60)),
    lowMemoryProtectionEnabled: checked("lowMemoryProtectionEnabled"),
    maxAwakeSpicyTabs: Math.min(20, Math.max(1, Number(value("maxAwakeSpicyTabs", "3")) || 3)),
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
    localTagMatchEnabled: checked("localTagMatchEnabled"),
    localTagMatchRules: value("localTagMatchRules"),
    localTagMatchFetchPublic: checked("localTagMatchFetchPublic"),
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
    enableCreatorTriggerPreview: checked("enableCreatorTriggerPreview"),
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
    hideFeatureReleasePopups: checked("hideFeatureReleasePopups"),
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
    enableMemoryVault: checked("enableMemoryVault"),
    showCopyMemoryAction: checked("showCopyMemoryAction"),
    memoryAutoLoadAll: checked("memoryAutoLoadAll"),
    enableChatTextReplacements: checked("enableChatTextReplacements"),
    chatTextReplacementRules: value("chatTextReplacementRules", ""),
    enableChatMutedWords: checked("enableChatMutedWords"),
    chatMutedWords: value("chatMutedWords", ""),
    chatTextReplacementPresets: value("chatTextReplacementPresets", ""),
    chatTextReplacementShowChatPresetControl: checked("chatTextReplacementShowChatPresetControl"),
    chatTextReplacementScope: ["ai", "user", "both"].includes(value("chatTextReplacementScope")) ? value("chatTextReplacementScope") : "ai",
    chatTextReplacementMode: value("chatTextReplacementMode") === "save" ? "save" : "display",
    chatTextReplacementPreview: checked("chatTextReplacementPreview"),
    enableTranslation: checked("enableTranslation"),
    translationShowMessageButtons: checked("translationShowMessageButtons"),
    translationAutoAi: checked("translationAutoAi"),
    translationAutoUser: checked("translationAutoUser"),
    translationProvider: value("translationProvider", "deepl"),
    libreTranslateUrl: value("libreTranslateUrl", "").trim(),
    translationAllowRemoteFallback: checked("translationAllowRemoteFallback"),
    translationPerChatControls: checked("translationPerChatControls"),
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
    botStatusScanSpeed: Object.prototype.hasOwnProperty.call(BOT_STATUS_SCAN_SPEED_DELAYS, value("botStatusScanSpeed", "safe")) ? value("botStatusScanSpeed", "safe") : "safe",
    botStatusStaleDays: [1, 7, 14, 30].includes(Number(value("botStatusStaleDays", "7"))) ? Number(value("botStatusStaleDays", "7")) : 7,
    botStatusMaxBots: Math.min(100000, Math.max(0, Math.floor(Number(value("botStatusMaxBots", "0")) || 0))),
    botStatusMaxMinutes: Math.min(1440, Math.max(0, Math.floor(Number(value("botStatusMaxMinutes", "0")) || 0))),
    lorebookStatusScanSpeed: Object.prototype.hasOwnProperty.call(LOREBOOK_STATUS_SCAN_SPEED_DELAYS, value("lorebookStatusScanSpeed", "safe")) ? value("lorebookStatusScanSpeed", "safe") : "safe",
    lorebookStatusStaleDays: [1, 7, 14, 30].includes(Number(value("lorebookStatusStaleDays", "7"))) ? Number(value("lorebookStatusStaleDays", "7")) : 7,
    importOpenedFromChatsPage: checked("importOpenedFromChatsPage"),
    hideOpenedChats: checked("hideOpenedChats"),
    openedBotSortMode: value("openedBotSortMode", "newest"),
    qolInterfaceScale: [100, 110, 125, 150].includes(Number(value("qolInterfaceScale", "100"))) ? Number(value("qolInterfaceScale", "100")) : 100,
    chatTextScale: [100, 110, 125, 150].includes(Number(value("chatTextScale", "100"))) ? Number(value("chatTextScale", "100")) : 100,
    chatLineSpacing: ["native", "comfortable", "spacious"].includes(value("chatLineSpacing", "native")) ? value("chatLineSpacing", "native") : "native",
    settingsReadingFont: Object.hasOwn(SETTINGS_READING_FONTS, value("settingsReadingFont", "native")) ? value("settingsReadingFont", "native") : "native",
    settingsReadingSize: SETTINGS_READING_SIZES.includes(Number(value("settingsReadingSize", "100"))) ? Number(value("settingsReadingSize", "100")) : 100,
    settingsReadingLineSpacing: SETTINGS_READING_LINE_SPACING.includes(value("settingsReadingLineSpacing", "native")) ? value("settingsReadingLineSpacing", "native") : "native",
    settingsReadingLetterSpacing: SETTINGS_READING_LETTER_SPACING.includes(value("settingsReadingLetterSpacing", "native")) ? value("settingsReadingLetterSpacing", "native") : "native",
    settingsReadingContrast: checked("settingsReadingContrast"),
    settingsReadingLargerControls: checked("settingsReadingLargerControls"),
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
    quickPanelShowLoadedMessageCount: checked("quickPanelShowLoadedMessageCount"),
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
    enableChatIndex: checked("enableChatIndex"),
    chatIndexEnhanceNativeSearch: checked("chatIndexEnhanceNativeSearch"),
    chatIndexStandaloneLauncher: checked("chatIndexStandaloneLauncher"),
    quickPanelShowOoc: checked("quickPanelShowOoc", true),
    quickPanelShowAutoVoice: checked("quickPanelShowAutoVoice", true),
    quickPanelShowAutoAsterisk: checked("quickPanelShowAutoAsterisk", true),
    quickPanelShowTranslation: checked("quickPanelShowTranslation"),
    quickPanelShowPersona: checked("quickPanelShowPersona", true),
    quickPanelShowExport: checked("quickPanelShowExport", true),
    quickPanelShowSoundscapes: checked("quickPanelShowSoundscapes"),
    quickPanelShowCustomPictures: checked("quickPanelShowCustomPictures"),
    quickPanelShowContextKeeper: checked("quickPanelShowContextKeeper"),
    quickPanelShowFocusMode: checked("quickPanelShowFocusMode"),
    quickPanelShowCharacterProfile: checked("quickPanelShowCharacterProfile"),
    quickPanelShowSavedSnippets: checked("quickPanelShowSavedSnippets"),
    quickPanelShowCreatorPreview: checked("quickPanelShowCreatorPreview"),
    quickPanelShowImageGenerator: checked("quickPanelShowImageGenerator"),
    quickPanelShowRulebookDiagnostics: checked("quickPanelShowRulebookDiagnostics"),
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
    botOrganizerExplorerFolders: checked("botOrganizerExplorerFolders"),
    favoritePageFoldersEnabled: checked("favoritePageFoldersEnabled"),
    favoritePageSortEnabled: checked("favoritePageSortEnabled"),
    lorebookUnknownSafeFilter: checked("lorebookUnknownSafeFilter"),
    botCollections: value("botCollections", ""),
    botOrganizerShowCardMeta: checked("botOrganizerShowCardMeta", true),
    botOrganizerBulkTools: checked("botOrganizerBulkTools", true),

    autoFillListings: checked("autoFillListings"),
    paginationTopJumpBox: checked("paginationTopJumpBox"),
    paginationQuickJumpMenu: checked("paginationQuickJumpMenu"),
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
    enableCustomCharacterPictures: checked("enableCustomCharacterPictures"),
    enableCustomPersonaPictures: checked("enableCustomPersonaPictures"),
    chatSceneGalleriesEnabled: checked("chatSceneGalleriesEnabled"),
    chatBackgroundUseAvatar: checked("chatBackgroundUseAvatar"),
    chatBackgroundAnimateAvatar: checked("chatBackgroundAnimateAvatar"),
    chatBackgroundBubbleOpacity: Math.max(25, Math.min(100, Number(value("chatBackgroundBubbleOpacity", "100")) || 100)),
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
    chatBubbleAiFont: value("chatBubbleAiFont", "inherit"),
    chatBubbleAiActionFont: value("chatBubbleAiActionFont", "inherit"),
    chatBubbleAiDialogueFont: value("chatBubbleAiDialogueFont", "inherit"),
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
    chatBubbleUserFont: value("chatBubbleUserFont", "inherit"),
    chatBubbleUserActionFont: value("chatBubbleUserActionFont", "inherit"),
    chatBubbleUserDialogueFont: value("chatBubbleUserDialogueFont", "inherit"),
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

    stackChatMessages: checked("stackChatMessages"),
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
    contextKeeperAutoRecall: checked("contextKeeperAutoRecall"),
    contextKeeperRecallEverySends: [1,3,5,10].includes(Number(value("contextKeeperRecallEverySends"))) ? Number(value("contextKeeperRecallEverySends")) : 5,
    contextKeeperRecallMaxChars: [450,900,1400].includes(Number(value("contextKeeperRecallMaxChars"))) ? Number(value("contextKeeperRecallMaxChars")) : 900,
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
    autoRetryFailedMessageSends: checked("autoRetryFailedMessageSends"),
    chatPerformanceMode: checked("chatPerformanceMode"),
    runtimePerformanceMode: ["normal", "adaptive", "aggressive", "maximum"].includes(value("runtimePerformanceMode")) ? value("runtimePerformanceMode") : "adaptive",
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
    enableCommandPalette: checked("enableCommandPalette", false),
    commandPaletteShortcut: ["ctrl-k", "ctrl-shift-k", "alt-k", "off"].includes(value("commandPaletteShortcut")) ? value("commandPaletteShortcut") : "ctrl-k",
    commandPaletteShowSavedItems: checked("commandPaletteShowSavedItems", true),
    deepSleepDisabledFeatures: true,
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
    chatExportHistoryMode: value("chatExportHistoryMode", "api"),
    chatExportIncludeBotInfo: checked("chatExportIncludeBotInfo"),
    chatExportIncludeRulebook: checked("chatExportIncludeRulebook"),
    enableRulebookDiagnostics: checked("enableRulebookDiagnostics"),
    storyReadingLayout: checked("storyReadingLayout"),
    chatExportIncludeOocDirectives: checked("chatExportIncludeOocDirectives"),
    chatExportIncludeGenerationDetails: checked("chatExportIncludeGenerationDetails"),
    chatExportNumberMessages: checked("chatExportNumberMessages"),
    chatExportIncludeAvatars: checked("chatExportIncludeAvatars"),
    chatExportDefaultFormat: value("chatExportDefaultFormat", "text"),
    chatExportHtmlLayout: value("chatExportHtmlLayout", "bubbles"),
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

    showQolSidebarButton: checked("showQolSidebarButton"),
    restorePersonasSidebarPosition: checked("restorePersonasSidebarPosition"),
    qolSidebarButtonPlacement: value("qolSidebarButtonPlacement", "after-sai"),
    hideSidebarLogo: checked("hideSidebarLogo"),
    hideSidebarHome: checked("hideSidebarHome"),
    hideSidebarChats: checked("hideSidebarChats"),
    hideSidebarPersonas: checked("hideSidebarPersonas"),
    hideSidebarNewBadges: checked("hideSidebarNewBadges"),
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
    autoBlockWordMatches: checked("autoBlockWordMatches"),
    autoBlockTagMatches: checked("autoBlockTagMatches"),
    hideHomeForYouCards: checked("hideHomeForYouCards"),
    expandLongCardDescriptions: checked("expandLongCardDescriptions"),
    showCardGreetingTokenInfo: checked("showCardGreetingTokenInfo"),
    showExactMessageCounts: checked("showExactMessageCounts"),
    showBotCreationDates: checked("showBotCreationDates"),
    expandBotNamesOnHover: checked("expandBotNamesOnHover"),
    cardTokenShowGreeting: checked("cardTokenShowGreeting", true),
    cardTokenShowDescription: false,
    cardTokenShowPersonality: checked("cardTokenShowPersonality"),
    cardTokenShowScenario: checked("cardTokenShowScenario"),
    cardTokenShowExamples: checked("cardTokenShowExamples"),
    cardTokenShowCombined: false,
    hideGroupChats: checked("hideGroupChats"),
    showLorebookFilters: checked("showLorebookFilters"),
    showRulebookFilters: checked("showRulebookFilters"),
    enableSmartFilterPresets: checked("enableSmartFilterPresets"),
    enableCreationAudit: checked("enableCreationAudit"),
    creationAuditQuickStatus: checked("creationAuditQuickStatus"),
    enableCreatorWritingAssistant: checked("enableCreatorWritingAssistant"),
    creatorWritingUseBrowserAi: checked("creatorWritingUseBrowserAi"),
    creatorWritingDictionary: value("creatorWritingDictionary"),
    creatorWritingTargetLanguage: value("creatorWritingTargetLanguage", "English"),
    enableProfileExport: checked("enableProfileExport"),
    enableMyCreationsFilters: checked("enableMyCreationsFilters"),
    enableMyCreationsBulkBackup: checked("enableMyCreationsBulkBackup"),
    showMyLorebookEditButtons: checked("showMyLorebookEditButtons"),
    showMyChatbotEditButtons: checked("showMyChatbotEditButtons"),
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
    showQuickLessLikeButtons: checked("showQuickLessLikeButtons"),
    showQuickDislikeButtons: checked("showQuickDislikeButtons"),
    showQuickUnblockButtons: checked("showQuickUnblockButtons"),
    reduceAnimatedBotImages: checked("reduceAnimatedBotImages"),
    animatedImageMode: "hover",
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
    debug: checked("debug")
  };
}

function readSingleSettingFromPage(settingKey) {
  switch (String(settingKey || "")) {
    case "enabled": return (checked("enabled"));
    case "saiToolkitCompatibility": return (checked("saiToolkitCompatibility", false));
    case "globalNsfwMode": return (value("globalNsfwMode", "ignore"));
    case "autoAfkEnabled": return (checked("autoAfkEnabled"));
    case "autoAfkMinutes": return (Math.min(43200, Math.max(15, Number(value("autoAfkMinutes", "720")) || 720)));
    case "autoAfkHours": return (Math.min(720, Math.max(0.25, (Number(value("autoAfkMinutes", "720")) || 720) / 60)));
    case "lowMemoryProtectionEnabled": return (checked("lowMemoryProtectionEnabled"));
    case "maxAwakeSpicyTabs": return (Math.min(20, Math.max(1, Number(value("maxAwakeSpicyTabs", "3")) || 3)));
    case "autoAfkChats": return (checked("autoAfkChats", true));
    case "autoAfkHome": return (checked("autoAfkHome"));
    case "autoAfkProfiles": return (checked("autoAfkProfiles"));
    case "autoAfkAction": return ($("autoAfkActionClose")?.checked ? "close" : "discard");
    case "autoAfkProtectActive": return (checked("autoAfkProtectActive", true));
    case "autoAfkResetOnActivate": return (checked("autoAfkResetOnActivate", true));
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
    case "autoTags": return (checked("autoTags"));
    case "enableTagAliases": return (checked("enableTagAliases"));
    case "tagAliasRules": return (value("tagAliasRules"));
    case "tagAliasShowDisplay": return (checked("tagAliasShowDisplay"));
    case "localTagMatchEnabled": return (checked("localTagMatchEnabled"));
    case "localTagMatchRules": return (value("localTagMatchRules"));
    case "localTagMatchFetchPublic": return (checked("localTagMatchFetchPublic"));
    case "showTagTemplateButton": return (checked("showTagTemplateButton"));
    case "showChatTagLinks": return (checked("showChatTagLinks"));
    case "showChatTagAddButtons": return (checked("showChatTagAddButtons"));
    case "botEditorShowCharButton": return (checked("botEditorShowCharButton"));
    case "botEditorShowUserButton": return (checked("botEditorShowUserButton"));
    case "botEditorShowContinueButton": return (checked("botEditorShowContinueButton"));
    case "botEditorShowNoControlButton": return (checked("botEditorShowNoControlButton"));
    case "botEditorShowCustomSnippets": return (checked("botEditorShowCustomSnippets"));
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
    case "lorebookConsistencyAutoQueue": return (checked("lorebookConsistencyAutoQueue", true));
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
    case "enableGenerationProfiles": return (checked("enableGenerationProfiles"));
    case "showGenerationMetadata": return (checked("showGenerationMetadata"));
    case "showMessageTimestamps": return (checked("showMessageTimestamps"));
    case "messageTimestamp24Hour": return (checked("messageTimestamp24Hour"));
    case "messageTimestampDateFirst": return (checked("messageTimestampDateFirst"));
    case "messageTimestampShowSeconds": return (checked("messageTimestampShowSeconds"));
    case "showGenerationModel": return (checked("showGenerationModel"));
    case "showGenerationElapsed": return (checked("showGenerationElapsed"));
    case "showGenerationSettings": return (checked("showGenerationSettings"));
    case "compactGenerationMetadata": return (checked("compactGenerationMetadata"));
    case "enableContextWindowWarning": return (checked("enableContextWindowWarning"));
    case "contextWarningThreshold": return (Math.min(99, Math.max(50, Number(value("contextWarningThreshold", "85")) || 85)));
    case "contextWarningManualLimit": return (Math.max(0, Number(value("contextWarningManualLimit", "0")) || 0));
    case "contextWarningBrowserNotifications": return (checked("contextWarningBrowserNotifications"));
    case "includeTags": return (linesToArray(value("includeTags")));
    case "excludeTags": return (linesToArray(value("excludeTags")));
    case "hidePremium": return (checked("hidePremium"));
    case "hideFloatingPremiumPopups": return (checked("hideFloatingPremiumPopups"));
    case "hideAdvertBanners": return (checked("hideAdvertBanners"));
    case "expandModelSelectorDescriptions": return (checked("expandModelSelectorDescriptions"));
    case "hideModelUpgradeButtons": return (checked("hideModelUpgradeButtons"));
    case "customizeModelQuickMenu": return (checked("customizeModelQuickMenu"));
    case "modelQuickFavoritesOnly": return (checked("modelQuickFavoritesOnly"));
    case "modelFavoriteNames": return (value("modelFavoriteNames", ""));
    case "modelHiddenNames": return (value("modelHiddenNames", ""));
    case "hideNotifications": return (checked("hideNotifications"));
    case "hideFeatureReleasePopups": return (checked("hideFeatureReleasePopups"));
    case "hideTabNotificationBadge": return (checked("hideTabNotificationBadge"));
    case "autoReadNotifications": return (checked("autoReadNotifications"));
    case "hideTopBarLanguage": return (checked("hideTopBarLanguage"));
    case "hideTopBarNotifications": return (checked("hideTopBarNotifications"));
    case "hideTopBarTheme": return (checked("hideTopBarTheme"));
    case "topBarProfilePillMode": return (value("topBarProfilePillMode", "normal"));
    case "topBarProfilePillCustomText": return (value("topBarProfilePillCustomText", ""));
    case "topBarProfilePillPersonaPrefix": return (checked("topBarProfilePillPersonaPrefix"));
    case "showChatTopBarTools": return (checked("showChatTopBarTools"));
    case "chatTopBarInlineCreator": return (checked("chatTopBarInlineCreator"));
    case "chatTopBarAddLaterButton": return (checked("chatTopBarAddLaterButton"));
    case "closeChatTabAfterSavingLater": return (checked("closeChatTabAfterSavingLater"));
    case "showPerCharacterChatHistory": return (checked("showPerCharacterChatHistory"));
    case "showQuickNewChatButton": return (checked("showQuickNewChatButton"));
    case "hideChatTopBarRatingButton": return (checked("hideChatTopBarRatingButton"));
    case "enableNativeRatingHelpers": return (checked("enableNativeRatingHelpers"));
    case "hideChatTopBarModelButton": return (checked("hideChatTopBarModelButton"));
    case "hideChatTopBarContextDot": return (checked("hideChatTopBarContextDot"));
    case "hideChatDropdownVoiceUpsell": return (checked("hideChatDropdownVoiceUpsell"));
    case "hideChatDropdownMemoryItem": return (checked("hideChatDropdownMemoryItem"));
    case "enableBulkMemoryManager": return (checked("enableBulkMemoryManager"));
    case "enableMemoryVault": return (checked("enableMemoryVault"));
    case "showCopyMemoryAction": return (checked("showCopyMemoryAction"));
    case "memoryAutoLoadAll": return (checked("memoryAutoLoadAll"));
    case "enableChatTextReplacements": return (checked("enableChatTextReplacements"));
    case "chatTextReplacementRules": return (value("chatTextReplacementRules", ""));
    case "enableChatMutedWords": return (checked("enableChatMutedWords"));
    case "chatMutedWords": return (value("chatMutedWords", ""));
    case "chatTextReplacementPresets": return (value("chatTextReplacementPresets", ""));
    case "chatTextReplacementShowChatPresetControl": return (checked("chatTextReplacementShowChatPresetControl"));
    case "chatTextReplacementScope": return (["ai", "user", "both"].includes(value("chatTextReplacementScope")) ? value("chatTextReplacementScope") : "ai");
    case "chatTextReplacementMode": return (value("chatTextReplacementMode") === "save" ? "save" : "display");
    case "chatTextReplacementPreview": return (checked("chatTextReplacementPreview"));
    case "enableTranslation": return (checked("enableTranslation"));
    case "translationShowMessageButtons": return (checked("translationShowMessageButtons"));
    case "translationAutoAi": return (checked("translationAutoAi"));
    case "translationAutoUser": return (checked("translationAutoUser"));
    case "translationProvider": return (value("translationProvider", "deepl"));
    case "libreTranslateUrl": return (value("libreTranslateUrl", "").trim());
    case "translationAllowRemoteFallback": return (checked("translationAllowRemoteFallback"));
    case "translationPerChatControls": return (checked("translationPerChatControls"));
    case "translationTargetLanguage": return (value("translationTargetLanguage", "EN-US"));
    case "translationUnderstoodLanguages": return (value("translationUnderstoodLanguages", "EN"));
    case "translationProtectedTerms": return (value("translationProtectedTerms", ""));
    case "showChatListTools": return (checked("showChatListTools"));
    case "enableChatOrganizer": return (checked("enableChatOrganizer"));
    case "chatCollections": return (value("chatCollections", ""));
    case "showSavedChatQuickActions": return (checked("showSavedChatQuickActions"));
    case "showRandomChatButton": return (checked("showRandomChatButton"));
    case "randomChatUseLastHomeFilters": return (checked("randomChatUseLastHomeFilters"));
    case "randomChatIncludeOpened": return (checked("randomChatIncludeOpened"));
    case "randomChatIncludeLater": return (checked("randomChatIncludeLater"));
    case "randomChatIncludeFavorites": return (checked("randomChatIncludeFavorites"));
    case "chatListSortMode": return (value("chatListSortMode", "default"));
    case "chatListSearchMode": return ("all");
    case "chatListOpenedFilter": return (["all", "opened", "unopened"].includes(value("chatListOpenedFilter")) ? value("chatListOpenedFilter") : "all");
    case "chatListMessageFilter": return (["all", "0", "1-9", "10-49", "50-99", "100-499", "500+", "unknown"].includes(value("chatListMessageFilter")) ? value("chatListMessageFilter") : "all");
    case "chatListSavedFilter": return (["all", "favorite", "later", "both", "saved", "neither"].includes(value("chatListSavedFilter")) ? value("chatListSavedFilter") : "all");
    case "chatListBlockedFilter": return (["all", "blocked", "unblocked"].includes(value("chatListBlockedFilter")) ? value("chatListBlockedFilter") : "all");
    case "trackOpenedChats": return (checked("trackOpenedChats"));
    case "botStatusScanSpeed": return (Object.prototype.hasOwnProperty.call(BOT_STATUS_SCAN_SPEED_DELAYS, value("botStatusScanSpeed", "safe")) ? value("botStatusScanSpeed", "safe") : "safe");
    case "botStatusStaleDays": return ([1, 7, 14, 30].includes(Number(value("botStatusStaleDays", "7"))) ? Number(value("botStatusStaleDays", "7")) : 7);
    case "lorebookStatusScanSpeed": return (Object.prototype.hasOwnProperty.call(LOREBOOK_STATUS_SCAN_SPEED_DELAYS, value("lorebookStatusScanSpeed", "safe")) ? value("lorebookStatusScanSpeed", "safe") : "safe");
    case "lorebookStatusStaleDays": return ([1, 7, 14, 30].includes(Number(value("lorebookStatusStaleDays", "7"))) ? Number(value("lorebookStatusStaleDays", "7")) : 7);
    case "importOpenedFromChatsPage": return (checked("importOpenedFromChatsPage"));
    case "hideOpenedChats": return (checked("hideOpenedChats"));
    case "openedBotSortMode": return (value("openedBotSortMode", "newest"));
    case "qolInterfaceScale": return ([100, 110, 125, 150].includes(Number(value("qolInterfaceScale", "100"))) ? Number(value("qolInterfaceScale", "100")) : 100);
    case "chatTextScale": return ([100, 110, 125, 150].includes(Number(value("chatTextScale", "100"))) ? Number(value("chatTextScale", "100")) : 100);
    case "chatLineSpacing": return (["native", "comfortable", "spacious"].includes(value("chatLineSpacing", "native")) ? value("chatLineSpacing", "native") : "native");
    case "settingsReadingFont": return Object.hasOwn(SETTINGS_READING_FONTS, value("settingsReadingFont", "native")) ? value("settingsReadingFont", "native") : "native";
    case "settingsReadingSize": return SETTINGS_READING_SIZES.includes(Number(value("settingsReadingSize", "100"))) ? Number(value("settingsReadingSize", "100")) : 100;
    case "settingsReadingLineSpacing": return SETTINGS_READING_LINE_SPACING.includes(value("settingsReadingLineSpacing", "native")) ? value("settingsReadingLineSpacing", "native") : "native";
    case "settingsReadingLetterSpacing": return SETTINGS_READING_LETTER_SPACING.includes(value("settingsReadingLetterSpacing", "native")) ? value("settingsReadingLetterSpacing", "native") : "native";
    case "settingsReadingContrast": return checked("settingsReadingContrast");
    case "settingsReadingLargerControls": return checked("settingsReadingLargerControls");
    case "showQuickPanel": return (checked("showQuickPanel"));
    case "quickPanelPlacement": return (value("quickPanelPlacement", "bottom-right") || "bottom-right");
    case "quickPanelDraggable": return (checked("quickPanelDraggable"));
    case "quickPanelDefaultClosed": return (checked("quickPanelDefaultClosed"));
    case "quickPanelEnabledByDefaultInTab": return (checked("quickPanelEnabledByDefaultInTab", true));
    case "quickPanelWidth": return (Math.min(440, Math.max(200, Number(value("quickPanelWidth", "280")) || 280)));
    case "quickPanelUiScale": return (Math.min(125, Math.max(80, Number(value("quickPanelUiScale", "100")) || 100)));
    case "quickPanelMaxHeightPercent": return (Math.min(95, Math.max(25, Number(value("quickPanelMaxHeightPercent", "80")) || 80)));
    case "quickPanelCustomXPercent": return (Math.min(100, Math.max(0, Number.isFinite(Number(value("quickPanelCustomXPercent", "70"))) ? Number(value("quickPanelCustomXPercent", "70")) : 70)));
    case "quickPanelCustomYPercent": return (Math.min(100, Math.max(0, Number.isFinite(Number(value("quickPanelCustomYPercent", "12"))) ? Number(value("quickPanelCustomYPercent", "12")) : 12)));
    case "quickPanelAutoCollapseOverlap": return (checked("quickPanelAutoCollapseOverlap", true));
    case "quickPanelShowStatus": return (checked("quickPanelShowStatus", true));
    case "quickPanelShowLoadedMessageCount": return (checked("quickPanelShowLoadedMessageCount"));
    case "quickPanelStatusShowOpened": return (checked("quickPanelStatusShowOpened", true));
    case "quickPanelStatusShowBlocked": return (checked("quickPanelStatusShowBlocked", true));
    case "popupShowOpenedCount": return (checked("popupShowOpenedCount", false));
    case "popupShowBlockedCount": return (checked("popupShowBlockedCount", false));
    case "popupShowStorageDetails": return (checked("popupShowStorageDetails"));
    case "quickPanelShowFeatureSummary": return (checked("quickPanelShowFeatureSummary"));
    case "quickPanelShowOptions": return (checked("quickPanelShowOptions", true));
    case "quickPanelShowFillNow": return (checked("quickPanelShowFillNow", true));
    case "quickPanelShowSmartFilterPins": return (checked("quickPanelShowSmartFilterPins"));
    case "quickPanelShowChatSearch": return (checked("quickPanelShowChatSearch", true));
    case "quickPanelShowChatSort": return (checked("quickPanelShowChatSort", true));
    case "quickPanelShowScanVisible": return (checked("quickPanelShowScanVisible", true));
    case "quickPanelShowLoadAll": return (checked("quickPanelShowLoadAll", true));
    case "enableChatIndex": return checked("enableChatIndex");
    case "chatIndexEnhanceNativeSearch": return checked("chatIndexEnhanceNativeSearch");
    case "chatIndexStandaloneLauncher": return checked("chatIndexStandaloneLauncher");
    case "quickPanelShowOoc": return (checked("quickPanelShowOoc", true));
    case "quickPanelShowAutoVoice": return (checked("quickPanelShowAutoVoice", true));
    case "quickPanelShowAutoAsterisk": return (checked("quickPanelShowAutoAsterisk", true));
    case "quickPanelShowTranslation": return (checked("quickPanelShowTranslation"));
    case "quickPanelShowPersona": return (checked("quickPanelShowPersona", true));
    case "quickPanelShowExport": return (checked("quickPanelShowExport", true));
    case "quickPanelShowSoundscapes": return (checked("quickPanelShowSoundscapes"));
    case "quickPanelShowCustomPictures": return checked("quickPanelShowCustomPictures");
    case "quickPanelShowContextKeeper": return checked("quickPanelShowContextKeeper");
    case "quickPanelShowFocusMode": return checked("quickPanelShowFocusMode");
    case "quickPanelShowCharacterProfile": return checked("quickPanelShowCharacterProfile");
    case "quickPanelShowSavedSnippets": return checked("quickPanelShowSavedSnippets");
    case "quickPanelShowCreatorPreview": return checked("quickPanelShowCreatorPreview");
    case "quickPanelShowImageGenerator": return checked("quickPanelShowImageGenerator");
    case "quickPanelShowRulebookDiagnostics": return checked("quickPanelShowRulebookDiagnostics");
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
    case "showFavoriteHistoryButton": return (checked("showFavoriteHistoryButton"));
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
    case "enableBotOrganizer": return (checked("enableBotOrganizer"));
    case "botOrganizerExplorerFolders": return (checked("botOrganizerExplorerFolders"));
    case "botCollections": return (value("botCollections", ""));
    case "botOrganizerShowCardMeta": return (checked("botOrganizerShowCardMeta", true));
    case "botOrganizerBulkTools": return (checked("botOrganizerBulkTools", true));
    case "autoFillListings": return (checked("autoFillListings"));
    case "paginationTopJumpBox": return (checked("paginationTopJumpBox"));
    case "showListingRefillButton": return (checked("showListingRefillButton"));
    case "showListingFilterStats": return (checked("showListingFilterStats"));
    case "showListingFilterStatsDetails": return (checked("showListingFilterStatsDetails"));
    case "autoFillTargetCards": return (Math.max(1, Math.min(200, Number(value("autoFillTargetCards", "50")) || 50)));
    case "autoFillMaxClicks": return (Math.max(1, Math.min(30, Number(value("autoFillMaxClicks", "8")) || 8)));
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
    case "styleAlternateDialogue": return (checked("styleAlternateDialogue"));
    case "alternateDialogueScope": return (["ai", "user", "both"].includes(value("alternateDialogueScope")) ? value("alternateDialogueScope") : "ai");
    case "alternateDialogueStyle": return (value("alternateDialogueStyle", "dialogue"));
    case "alternateDialogueCustomColors": return (checked("alternateDialogueCustomColors"));
    case "alternateDialogueTextColor": return (value("alternateDialogueTextColor", "#f4d35e"));
    case "alternateDialogueBackgroundColor": return (value("alternateDialogueBackgroundColor", "#1f2430"));
    case "alternateDialogueBorderColor": return (value("alternateDialogueBorderColor", "#596273"));
    case "enableReplyInstructions": return (checked("enableReplyInstructions"));
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
    case "chatSceneGalleriesEnabled": return (checked("chatSceneGalleriesEnabled"));
    case "chatBackgroundDim": return (Math.min(90, Math.max(0, Number(value("chatBackgroundDim", "45")) || 0)));
    case "chatBackgroundBlur": return (Math.min(30, Math.max(0, Number(value("chatBackgroundBlur", "0")) || 0)));
    case "chatBackgroundFit": return (["cover", "contain", "tile"].includes(value("chatBackgroundFit", "cover")) ? value("chatBackgroundFit", "cover") : "cover");
    case "chatBackgroundPosition": return (["center", "top", "bottom", "left", "right"].includes(value("chatBackgroundPosition", "center")) ? value("chatBackgroundPosition", "center") : "center");
    case "enableChatBubbleCustomization": return (checked("enableChatBubbleCustomization"));
    case "persistSpicyChatUserAppearance": return (checked("persistSpicyChatUserAppearance"));
    case "chatBubbleAiBackground": return (value("chatBubbleAiBackground", "#27282d"));
    case "chatBubbleAiTextMode": return (["native", "custom"].includes(value("chatBubbleAiTextMode")) ? value("chatBubbleAiTextMode") : "custom");
    case "chatBubbleAiText": return (value("chatBubbleAiText", "#f2f2f2"));
    case "chatBubbleAiActionMode": return (["native", "base", "custom"].includes(value("chatBubbleAiActionMode")) ? value("chatBubbleAiActionMode") : "native");
    case "chatBubbleAiActionText": return (value("chatBubbleAiActionText", "#79c8f5"));
    case "chatBubbleAiDialogueMode": return (["native", "base", "custom"].includes(value("chatBubbleAiDialogueMode")) ? value("chatBubbleAiDialogueMode") : "base");
    case "chatBubbleAiDialogueText": return (value("chatBubbleAiDialogueText", "#f2f2f2"));
    case "chatBubbleAiFont": return (value("chatBubbleAiFont", "inherit"));
    case "chatBubbleAiActionFont": return (value("chatBubbleAiActionFont", "inherit"));
    case "chatBubbleAiDialogueFont": return (value("chatBubbleAiDialogueFont", "inherit"));
    case "chatBubbleAiBorder": return (value("chatBubbleAiBorder", "#555861"));
    case "chatBubbleAiBorderWidth": return (Math.min(12, Math.max(0, Number(value("chatBubbleAiBorderWidth", "0")) || 0)));
    case "chatBubbleAiBorderStyle": return (["solid", "dashed", "dotted", "double"].includes(value("chatBubbleAiBorderStyle")) ? value("chatBubbleAiBorderStyle") : "solid");
    case "chatBubbleAiBorderOpacity": return (Math.min(100, Math.max(0, Number(value("chatBubbleAiBorderOpacity", "100")) || 0)));
    case "chatBubbleAiOpacity": return (Math.min(100, Math.max(30, Number(value("chatBubbleAiOpacity", "100")) || 100)));
    case "chatBubbleAiRadius": return (Math.min(40, Math.max(4, Number(value("chatBubbleAiRadius", "20")) || 20)));
    case "chatBubbleAiShape": return (["native", "rounded", "square", "speech", "cat", "cloud"].includes(value("chatBubbleAiShape")) ? value("chatBubbleAiShape") : "native");
    case "chatBubbleAiDecorationMode": return (["bubble", "custom"].includes(value("chatBubbleAiDecorationMode")) ? value("chatBubbleAiDecorationMode") : "bubble");
    case "chatBubbleAiDecorationColor": return (value("chatBubbleAiDecorationColor", "#27282d"));
    case "chatBubbleAiCatEarLayout": return (["auto", "left", "right", "split"].includes(value("chatBubbleAiCatEarLayout")) ? value("chatBubbleAiCatEarLayout") : "auto");
    case "chatBubbleAiShadow": return (checked("chatBubbleAiShadow"));
    case "chatBubbleUserBackground": return (value("chatBubbleUserBackground", "#253f52"));
    case "chatBubbleUserTextMode": return (["native", "custom"].includes(value("chatBubbleUserTextMode")) ? value("chatBubbleUserTextMode") : "custom");
    case "chatBubbleUserText": return (value("chatBubbleUserText", "#f5f5f5"));
    case "chatBubbleUserActionMode": return (["native", "base", "custom"].includes(value("chatBubbleUserActionMode")) ? value("chatBubbleUserActionMode") : "native");
    case "chatBubbleUserActionText": return (value("chatBubbleUserActionText", "#79c8f5"));
    case "chatBubbleUserDialogueMode": return (["native", "base", "custom"].includes(value("chatBubbleUserDialogueMode")) ? value("chatBubbleUserDialogueMode") : "base");
    case "chatBubbleUserDialogueText": return (value("chatBubbleUserDialogueText", "#f5f5f5"));
    case "chatBubbleUserFont": return (value("chatBubbleUserFont", "inherit"));
    case "chatBubbleUserActionFont": return (value("chatBubbleUserActionFont", "inherit"));
    case "chatBubbleUserDialogueFont": return (value("chatBubbleUserDialogueFont", "inherit"));
    case "chatBubbleUserBorder": return (value("chatBubbleUserBorder", "#52718a"));
    case "chatBubbleUserBorderWidth": return (Math.min(12, Math.max(0, Number(value("chatBubbleUserBorderWidth", "0")) || 0)));
    case "chatBubbleUserBorderStyle": return (["solid", "dashed", "dotted", "double"].includes(value("chatBubbleUserBorderStyle")) ? value("chatBubbleUserBorderStyle") : "solid");
    case "chatBubbleUserBorderOpacity": return (Math.min(100, Math.max(0, Number(value("chatBubbleUserBorderOpacity", "100")) || 0)));
    case "chatBubbleUserOpacity": return (Math.min(100, Math.max(30, Number(value("chatBubbleUserOpacity", "100")) || 100)));
    case "chatBubbleUserRadius": return (Math.min(40, Math.max(4, Number(value("chatBubbleUserRadius", "20")) || 20)));
    case "chatBubbleUserShape": return (["native", "rounded", "square", "speech", "cat", "cloud"].includes(value("chatBubbleUserShape")) ? value("chatBubbleUserShape") : "native");
    case "chatBubbleUserDecorationMode": return (["bubble", "custom"].includes(value("chatBubbleUserDecorationMode")) ? value("chatBubbleUserDecorationMode") : "bubble");
    case "chatBubbleUserDecorationColor": return (value("chatBubbleUserDecorationColor", "#253f52"));
    case "chatBubbleUserCatEarLayout": return (["auto", "left", "right", "split"].includes(value("chatBubbleUserCatEarLayout")) ? value("chatBubbleUserCatEarLayout") : "auto");
    case "chatBubbleUserShadow": return (checked("chatBubbleUserShadow"));
    case "chatBubblePreserveActionColors": return (value("chatBubbleAiActionMode", "native") !== "base" || value("chatBubbleUserActionMode", "native") !== "base");
    case "hideChatVoiceButton": return (checked("hideChatVoiceButton"));
    case "hideUnlockCustomVoices": return (checked("hideUnlockCustomVoices"));
    case "stackChatMessages": return (checked("stackChatMessages"));
    case "showMessageQuickActions": return (checked("showMessageQuickActions"));
    case "showChatSearch": return (checked("showChatSearch"));
    case "chatSearchShowPanel": return (checked("chatSearchShowPanel", true));
    case "chatSearchShowFindButton": return (checked("chatSearchShowFindButton"));
    case "chatSearchExactPhrase": return (checked("chatSearchExactPhrase"));
    case "chatSearchCaseSensitive": return (checked("chatSearchCaseSensitive"));
    case "chatSearchWholeWord": return (checked("chatSearchWholeWord"));
    case "chatSearchRegex": return (checked("chatSearchRegex"));
    case "chatSearchLoadUntilMatch": return (checked("chatSearchLoadUntilMatch"));
    case "enableMessageBookmarks": return (checked("enableMessageBookmarks"));
    case "messageBookmarkButtons": return (checked("messageBookmarkButtons", true));
    case "enableFocusMode": return (checked("enableFocusMode"));
    case "focusHideSidebar": return (checked("focusHideSidebar", true));
    case "focusHideTopBar": return (checked("focusHideTopBar", true));
    case "focusHideChatHeader": return (checked("focusHideChatHeader", true));
    case "focusHideQolPanel": return (checked("focusHideQolPanel", true));
    case "enableSavedTextSnippets": return (checked("enableSavedTextSnippets"));
    case "enableContextKeeper": return (checked("enableContextKeeper"));
    case "contextKeeperAutoCapture": return (checked("contextKeeperAutoCapture", true));
    case "contextKeeperAutoSensitivity": return (["strict", "balanced", "broad"].includes(value("contextKeeperAutoSensitivity")) ? value("contextKeeperAutoSensitivity") : "balanced");
    case "contextKeeperAutoEveryMessages": return (Math.max(1, Math.min(20, Number(value("contextKeeperAutoEveryMessages", "4")) || 4)));
    case "contextKeeperAutoMaxDetails": return (Math.max(20, Math.min(300, Number(value("contextKeeperAutoMaxDetails", "120")) || 120)));
    case "contextKeeperMessageButtons": return (checked("contextKeeperMessageButtons"));
    case "enableSelectionRemember": return (checked("enableSelectionRemember"));
    case "contextKeeperRecapSize": return (["compact", "balanced", "full"].includes(value("contextKeeperRecapSize")) ? value("contextKeeperRecapSize") : "balanced");
    case "contextKeeperAutoRecall": return checked("contextKeeperAutoRecall");
    case "contextKeeperRecallEverySends": return ([1,3,5,10].includes(Number(value("contextKeeperRecallEverySends"))) ? Number(value("contextKeeperRecallEverySends")) : 5);
    case "contextKeeperRecallMaxChars": return ([450,900,1400].includes(Number(value("contextKeeperRecallMaxChars"))) ? Number(value("contextKeeperRecallMaxChars")) : 900);
    case "enableStoryDayTracker": return (checked("enableStoryDayTracker"));
    case "storyDayTrackerMode": return (["manual", "conservative", "assisted"].includes(value("storyDayTrackerMode")) ? value("storyDayTrackerMode") : "conservative");
    case "storyDayTrackerIncludeInContext": return (checked("storyDayTrackerIncludeInContext", true));
    case "storyDayTrackerShowQuickPanel": return (checked("storyDayTrackerShowQuickPanel", true));
    case "enableRpStateTracker": return (checked("enableRpStateTracker"));
    case "rpStateTrackerMode": return (["manual", "conservative", "assisted"].includes(value("rpStateTrackerMode")) ? value("rpStateTrackerMode") : "conservative");
    case "rpStateInjectMode": return (["manual", "changed", "every"].includes(value("rpStateInjectMode")) ? value("rpStateInjectMode") : "changed");
    case "rpStateMaxContextChars": return (Math.max(300, Math.min(3000, Number(value("rpStateMaxContextChars", "1200")) || 1200)));
    case "rpStateShowQuickPanel": return (checked("rpStateShowQuickPanel", true));
    case "enableChatNudges": return (checked("enableChatNudges"));
    case "chatNudgeDefaultHours": return ([5, 8, 24, 48, 168].includes(Number(value("chatNudgeDefaultHours", "24"))) ? Number(value("chatNudgeDefaultHours", "24")) : 24);
    case "chatNudgeBrowserNotifications": return (checked("chatNudgeBrowserNotifications", true));
    case "enableSoundscapes": return (checked("enableSoundscapes"));
    case "soundscapeShowChatControl": return (checked("soundscapeShowChatControl", true));
    case "soundscapeMasterVolume": return (Number.isFinite(Number(value("soundscapeMasterVolume", "65"))) ? Math.min(100, Math.max(0, Number(value("soundscapeMasterVolume", "65")))) : 65);
    case "soundscapeOnChat": return (checked("soundscapeOnChat", true));
    case "soundscapeOnHome": return (checked("soundscapeOnHome"));
    case "soundscapeOnChats": return (checked("soundscapeOnChats"));
    case "soundscapeOnProfiles": return (checked("soundscapeOnProfiles"));
    case "soundscapeOnOther": return (checked("soundscapeOnOther"));
    case "messageQuickActionCopy": return (checked("messageQuickActionCopy"));
    case "messageQuickActionEdit": return (checked("messageQuickActionEdit"));
    case "messageQuickActionRemoveImage": return (checked("messageQuickActionRemoveImage"));
    case "messageQuickActionResend": return (checked("messageQuickActionResend"));
    case "messageQuickActionConfirmRemoveImage": return (checked("messageQuickActionConfirmRemoveImage"));
    case "messageQuickActionReport": return (checked("messageQuickActionReport"));
    case "allowTypingWhileAiResponding": return (checked("allowTypingWhileAiResponding"));
    case "keepChatPositionWhileTyping": return (checked("keepChatPositionWhileTyping"));
    case "showScrollToTopButton": return (checked("showScrollToTopButton"));
    case "showScrollToBottomButton": return (checked("showScrollToBottomButton"));
    case "scrollNavOnHome": return (checked("scrollNavOnHome", true));
    case "scrollNavOnChats": return (checked("scrollNavOnChats", true));
    case "scrollNavOnChat": return (checked("scrollNavOnChat", true));
    case "scrollNavOnCreation": return (checked("scrollNavOnCreation", true));
    case "scrollNavOnProfiles": return (checked("scrollNavOnProfiles", true));
    case "scrollNavOnOther": return (checked("scrollNavOnOther", true));
    case "scrollTopLoadPreviousMessages": return (checked("scrollTopLoadPreviousMessages"));
    case "scrollTopLoadPreviousMode": return (["one", "all"].includes(value("scrollTopLoadPreviousMode")) ? value("scrollTopLoadPreviousMode") : "all");
    case "scrollTopLoadPreviousTiming": return (["before", "background"].includes(value("scrollTopLoadPreviousTiming")) ? value("scrollTopLoadPreviousTiming") : "before");
    case "botArchiveRememberSeenPublic": return (checked("botArchiveRememberSeenPublic"));
    case "botBackupToolsEnabled": return (checked("botBackupToolsEnabled"));
    case "botArchiveOwnEditorBackups": return (checked("botArchiveOwnEditorBackups"));
    case "lorebookBackupToolsEnabled": return (checked("lorebookBackupToolsEnabled"));
    case "lorebookBackupsEnabled": return (checked("lorebookBackupsEnabled"));
    case "botArchiveOwnRevisionLimit": return (Math.max(1, Math.min(50, Number(value("botArchiveOwnRevisionLimit", "10")) || 10)));
    case "botArchiveOnProfileVisit": return (checked("botArchiveOnProfileVisit"));
    case "botArchiveOnChatOpen": return (checked("botArchiveOnChatOpen"));
    case "botArchiveRefreshHours": return ([6, 24, 72, 168].includes(Number(value("botArchiveRefreshHours"))) ? Number(value("botArchiveRefreshHours")) : 24);
    case "protectDraftDuringMessageRemoval": return (checked("protectDraftDuringMessageRemoval"));
    case "failedMessageHelper": return (checked("failedMessageHelper"));
    case "autoRetryFailedMessageSends": return (checked("autoRetryFailedMessageSends"));
    case "chatPerformanceMode": return (checked("chatPerformanceMode"));
    case "runtimePerformanceMode": return (["normal", "adaptive", "aggressive", "maximum"].includes(value("runtimePerformanceMode")) ? value("runtimePerformanceMode") : "adaptive");
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
    case "enableCommandPalette": return (checked("enableCommandPalette", false));
    case "commandPaletteShortcut": return (["ctrl-k", "ctrl-shift-k", "alt-k", "off"].includes(value("commandPaletteShortcut")) ? value("commandPaletteShortcut") : "ctrl-k");
    case "commandPaletteShowSavedItems": return (checked("commandPaletteShowSavedItems", true));
    case "deepSleepDisabledFeatures": return true;
    case "performanceDiagnostics": return (checked("performanceDiagnostics"));
    case "enableLocalChangeHistory": return (checked("enableLocalChangeHistory"));
    case "showUpdateNotifications": return (checked("showUpdateNotifications", false));
    case "androidAppControlsMode": return (["auto", "android", "always", "off"].includes(value("androidAppControlsMode")) ? value("androidAppControlsMode") : "auto");
    case "androidTopBarMenu": return (checked("androidTopBarMenu"));
    case "androidHideComposerShortcuts": return (checked("androidHideComposerShortcuts", true));
    case "androidTopBarOoc": return (checked("androidTopBarOoc", true));
    case "androidTopBarAsterisk": return (checked("androidTopBarAsterisk", true));
    case "androidTopBarFormatting": return (checked("androidTopBarFormatting", true));
    case "androidTopBarTranslation": return (checked("androidTopBarTranslation"));
    case "androidTopBarScroll": return (checked("androidTopBarScroll", true));
    case "androidTopBarPersona": return (checked("androidTopBarPersona", true));
    case "androidTopBarModel": return (checked("androidTopBarModel", true));
    case "showChatExportButton": return (checked("showChatExportButton"));
    case "chatExportLoadPreviousMessages": return (checked("chatExportLoadPreviousMessages"));
    case "chatExportHistoryMode": return (value("chatExportHistoryMode", "api"));
    case "chatExportIncludeBotInfo": return (checked("chatExportIncludeBotInfo"));
    case "chatExportIncludeRulebook": return (checked("chatExportIncludeRulebook"));
    case "enableRulebookDiagnostics": return checked("enableRulebookDiagnostics");
    case "storyReadingLayout": return checked("storyReadingLayout");
    case "chatExportIncludeOocDirectives": return (checked("chatExportIncludeOocDirectives"));
    case "chatExportIncludeGenerationDetails": return (checked("chatExportIncludeGenerationDetails"));
    case "chatExportNumberMessages": return (checked("chatExportNumberMessages"));
    case "chatExportIncludeAvatars": return (checked("chatExportIncludeAvatars"));
    case "chatExportDefaultFormat": return (value("chatExportDefaultFormat", "text"));
    case "chatExportHtmlLayout": return (value("chatExportHtmlLayout", "bubbles"));
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
    case "showQolSidebarButton": return (checked("showQolSidebarButton"));
    case "qolSidebarButtonPlacement": return (value("qolSidebarButtonPlacement", "after-sai"));
    case "hideSidebarLogo": return (checked("hideSidebarLogo"));
    case "hideSidebarHome": return (checked("hideSidebarHome"));
    case "hideSidebarChats": return (checked("hideSidebarChats"));
    case "hideSidebarPersonas": return (checked("hideSidebarPersonas"));
    case "hideSidebarNewBadges": return (checked("hideSidebarNewBadges"));
    case "hideSidebarCreateMenu": return (checked("hideSidebarCreateMenu"));
    case "hideSidebarCreateChatbot": return (checked("hideSidebarCreateChatbot"));
    case "hideSidebarCreateLorebook": return (checked("hideSidebarCreateLorebook"));
    case "hideSidebarCreateGroup": return (checked("hideSidebarCreateGroup"));
    case "hideSidebarCreateVoice": return (checked("hideSidebarCreateVoice"));
    case "hideSidebarMyCreationsMenu": return (checked("hideSidebarMyCreationsMenu"));
    case "hideSidebarMyChatbots": return (checked("hideSidebarMyChatbots"));
    case "hideSidebarMyLorebooks": return (checked("hideSidebarMyLorebooks"));
    case "hideSidebarMyGroups": return (checked("hideSidebarMyGroups"));
    case "hideSidebarMyVoices": return (checked("hideSidebarMyVoices"));
    case "hideSidebarFavorites": return (checked("hideSidebarFavorites"));
    case "hideSidebarRecommendations": return (checked("hideSidebarRecommendations"));
    case "hideSidebarLeaderboard": return (checked("hideSidebarLeaderboard"));
    case "hideSidebarBlockedCreators": return (checked("hideSidebarBlockedCreators"));
    case "hideSidebarSubscribe": return (checked("hideSidebarSubscribe"));
    case "hideSidebarHelp": return (checked("hideSidebarHelp"));
    case "hideSidebarSocialLinks": return (false);
    case "hideSidebarSocialDiscord": return (checked("hideSidebarSocialDiscord"));
    case "hideSidebarSocialX": return (checked("hideSidebarSocialX"));
    case "hideSidebarSocialReddit": return (checked("hideSidebarSocialReddit"));
    case "hideSidebarFooterLinks": return (false);
    case "hideSidebarFooterTerms": return (checked("hideSidebarFooterTerms"));
    case "hideSidebarFooterPrivacy": return (checked("hideSidebarFooterPrivacy"));
    case "hideSidebarFooterRefunds": return (checked("hideSidebarFooterRefunds"));
    case "hideSidebarFooterReporting": return (checked("hideSidebarFooterReporting"));
    case "hideSidebarFooterGuidelines": return (checked("hideSidebarFooterGuidelines"));
    case "hideSidebarFooterSupport": return (checked("hideSidebarFooterSupport"));
    case "hideSidebarFooterAffiliates": return (checked("hideSidebarFooterAffiliates"));
    case "hideSidebarAppDownload": return (false);
    case "hideSidebarAppDownloadGooglePlay": return (checked("hideSidebarAppDownloadGooglePlay"));
    case "hideSidebarAppDownloadAppStore": return (checked("hideSidebarAppDownloadAppStore"));
    case "hideSidebarAppDownloadGeneric": return (checked("hideSidebarAppDownloadGeneric"));
    case "hideSidebarWebVersion": return (checked("hideSidebarWebVersion"));
    case "hideSidebarSignOut": return (checked("hideSidebarSignOut"));
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
    case "showLorebookFilters": return (checked("showLorebookFilters"));
    case "showRulebookFilters": return (checked("showRulebookFilters"));
    case "enableSmartFilterPresets": return (checked("enableSmartFilterPresets"));
    case "enableCreationAudit": return (checked("enableCreationAudit"));
    case "creationAuditQuickStatus": return (checked("creationAuditQuickStatus"));
    case "enableCreatorWritingAssistant": return (checked("enableCreatorWritingAssistant"));
    case "creatorWritingUseBrowserAi": return (checked("creatorWritingUseBrowserAi"));
    case "creatorWritingDictionary": return (value("creatorWritingDictionary"));
    case "creatorWritingTargetLanguage": return (value("creatorWritingTargetLanguage", "English"));
    case "enableProfileExport": return (checked("enableProfileExport"));
    case "enableMyCreationsFilters": return (checked("enableMyCreationsFilters"));
    case "enableMyCreationsBulkBackup": return (checked("enableMyCreationsBulkBackup"));
    case "showMyLorebookEditButtons": return (checked("showMyLorebookEditButtons"));
    case "showMyChatbotEditButtons": return (checked("showMyChatbotEditButtons"));
    case "restorePersonasSidebarPosition": return (checked("restorePersonasSidebarPosition"));
    case "rememberMyCreationsView": return (checked("rememberMyCreationsView"));
    case "autoLoadMyCreations": return (checked("autoLoadMyCreations"));
    case "myCreationsAutoLoadPages": return (Math.max(1, Math.min(30, Number(value("myCreationsAutoLoadPages", "1")) || 1)));
    case "enableRecommendationHelpers": return (checked("enableRecommendationHelpers"));
    case "recommendationHideLaterBots": return (checked("recommendationHideLaterBots"));
    case "recommendationHideNotInterested": return (checked("recommendationHideNotInterested"));
    case "recommendationPreferFavoriteCreators": return (checked("recommendationPreferFavoriteCreators"));
    case "recommendationPreferredTags": return (value("recommendationPreferredTags"));
    case "recommendationAvoidTags": return (value("recommendationAvoidTags"));
    case "recommendationShowReasonBadges": return (checked("recommendationShowReasonBadges"));
    case "recommendationHideFavoriteBots": return (checked("recommendationHideFavoriteBots"));
    case "recommendationHideOwnBots": return (checked("recommendationHideOwnBots"));
    case "recommendationOnlyUnopened": return (checked("recommendationOnlyUnopened"));
    case "recommendationOnlyLorebook": return (checked("recommendationOnlyLorebook"));
    case "recommendationSessionHideButtons": return (checked("recommendationSessionHideButtons"));
    case "recommendationRandomButton": return (checked("recommendationRandomButton"));
    case "cardDensityMode": return (["normal", "compact", "dense"].includes(value("cardDensityMode")) ? value("cardDensityMode") : "normal");
    case "cardClickBehavior": return (["default", "profile"].includes(value("cardClickBehavior")) ? value("cardClickBehavior") : "default");
    case "showCopyBotInfoButtons": return (checked("showCopyBotInfoButtons"));
    case "trackRecentlySeenBots": return (checked("trackRecentlySeenBots"));
    case "showRecentlySeenButton": return (checked("showRecentlySeenButton"));
    case "recentlySeenLimit": return (Math.max(10, Math.min(250, Number(value("recentlySeenLimit", "100")) || 100)));
    case "enableBotComparison": return (checked("enableBotComparison"));
    case "showQuickNotInterestedButtons": return (checked("showQuickNotInterestedButtons"));
    case "showQuickLessLikeButtons": return (checked("showQuickLessLikeButtons"));
    case "showQuickDislikeButtons": return (checked("showQuickDislikeButtons"));
    case "showQuickUnblockButtons": return (checked("showQuickUnblockButtons"));
    case "reduceAnimatedBotImages": return (checked("reduceAnimatedBotImages"));
    case "animatedImageMode": return "hover";
    case "animatedImagesListings": return (checked("animatedImagesListings"));
    case "animatedImagesChats": return (checked("animatedImagesChats"));
    case "animatedImagesProfiles": return (checked("animatedImagesProfiles"));
    case "animatedImagesChatMedia": return (checked("animatedImagesChatMedia"));
    case "replaceCardProfileWithBlockButton": return (checked("replaceCardProfileWithBlockButton"));
    case "showBlockButtonOnMyCreations": return (checked("showBlockButtonOnMyCreations"));
    case "enableBulkCardBlocking": return (checked("enableBulkCardBlocking"));
    case "bulkCardBlockingSidebarLauncher": return (checked("bulkCardBlockingSidebarLauncher"));
    case "quickDislikeOnBlock": return (false);
    case "quickDislikeIdleEnabled": return (checked("quickDislikeOnBlock"));
    case "quickDislikeIdleMinutes": return (Math.min(60, Math.max(1, Number(value("quickDislikeIdleMinutes", "5")) || 5)));
    case "blockedBulkDislikeDelayMs": return (Math.min(10000, Math.max(250, Number(value("blockedBulkDislikeDelayMs", "750")) || 750)));
    case "enableLanguageFilter": return (checked("enableLanguageFilter"));
    case "allowedLanguages": return (getAllowedLanguages());
    case "languageSelectionMode": return (["include", "exclude"].includes(value("languageSelectionMode")) ? value("languageSelectionMode") : "include");
    case "languageFilterMode": return ("conservative");
    case "languageAutoDetectUntagged": return (checked("languageAutoDetectUntagged"));
    case "languageShowDetectedBadge": return (checked("languageShowDetectedBadge"));
    case "blockedTags": return (linesToArray(value("blockedTags")));
    case "blockedWords": return (linesToArray(value("blockedWords")));
    case "blockedCreators": return (linesToArray(value("blockedCreators")));
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
  if (!key || !settingsAutosaveReady) return;
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
