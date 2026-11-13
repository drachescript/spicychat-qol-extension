// Storage datasets, feature-index and setting-dependency configuration.
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
  { parent: "showQuickPanel", name: "Mini Panel", children: ["quickPanelShowCustomPictures", "quickPanelShowContextKeeper", "quickPanelShowFocusMode", "quickPanelShowCharacterProfile", "quickPanelShowSavedSnippets", "quickPanelShowCreatorPreview", "quickPanelShowImageGenerator", "quickPanelShowRulebookDiagnostics", "quickPanelDraggable", "quickPanelDefaultClosed", "quickPanelEnabledByDefaultInTab", "quickPanelAutoCollapseOverlap", "quickPanelShowStatus", "quickPanelShowLoadedMessageCount", "quickPanelStatusShowOpened", "quickPanelStatusShowBlocked", "quickPanelShowFeatureSummary", "quickPanelShowOptions", "quickPanelShowFillNow", "quickPanelShowSmartFilterPins", "quickPanelShowChatSearch", "quickPanelShowChatSort", "quickPanelShowScanVisible", "quickPanelShowLoadAll", "quickPanelShowOoc", "quickPanelShowAutoVoice", "quickPanelShowAutoAsterisk", "quickPanelShowTranslation", "quickPanelShowPersona", "quickPanelShowExport", "quickPanelShowSoundscapes"] },
  { parent: "showCardGreetingTokenInfo", name: "Bot card token info", children: ["cardTokenShowGreeting", "cardTokenShowPersonality", "cardTokenShowScenario", "cardTokenShowExamples"] },
  { parent: "replaceCardProfileWithBlockButton", name: "QoL card block button", children: ["quickDislikeOnBlock", "showBlockButtonOnMyCreations"] },
  { parent: "enableBulkCardBlocking", name: "Bulk card selection", children: ["bulkCardBlockingSidebarLauncher"] },
  { parent: "quickDislikeOnBlock", name: "Quick Dislike on QoL Block", children: ["quickDislikeIdleMinutes"] },
  { parent: "enableRecommendationHelpers", name: "Recommendation helpers", children: ["recommendationHideFavoriteBots", "recommendationHideOwnBots", "recommendationOnlyUnopened", "recommendationOnlyLorebook", "recommendationSessionHideButtons", "recommendationRandomButton", "recommendationHideLaterBots", "recommendationHideNotInterested", "recommendationPreferFavoriteCreators", "recommendationPreferredTags", "recommendationAvoidTags", "recommendationAvoidWords", "recommendationShowReasonBadges"] },
  { parent: "reduceAnimatedBotImages", name: "Animated bot images", children: ["animatedImagesListings", "animatedImagesChats", "animatedImagesProfiles", "animatedImagesChatMedia"] },
  { parent: "textNormalizationEnabled", name: "Text normalization", children: ["normalizeFancyUnicode", "normalizePunctuation", "normalizeInvisibleCharacters", "normalizeDecorativeSymbols", "normalizeEmojis"] },
  { parent: "autoFillListings", name: "Listing refill", children: ["showListingRefillButton"] },
  { parent: "showListingFilterStats", name: "Listing filter stats", children: ["showListingFilterStatsDetails"] },
  { parent: "blockCards", name: "Blocked tag / word / creator rules", children: ["autoBlockWordMatches", "autoBlockTagMatches"] },
  { parent: "showRandomChatButton", name: "Random Chat", children: ["randomChatUseLastHomeFilters", "randomChatIncludeOpened", "randomChatIncludeLater", "randomChatIncludeFavorites"] },
  { parent: "showChatTopBarTools", name: "Chat top-bar tools", children: ["chatTopBarInlineCreator", "hideChatTopBarRatingButton", "hideChatTopBarModelButton", "hideChatTopBarContextDot", "hideChatDropdownVoiceUpsell", "hideChatDropdownMemoryItem"] },
  { parent: "enableChatTextReplacements", name: "Chat text replacements", children: ["chatTextReplacementPreview", "chatTextReplacementShowChatPresetControl"] },
  { parent: "showChatSearch", name: "Search Inside Current Chat", children: ["chatSearchShowPanel", "chatSearchShowFindButton", "chatSearchExactPhrase", "chatSearchCaseSensitive", "chatSearchWholeWord", "chatSearchRegex", "chatSearchLoadUntilMatch"] },
  { parent: "enableMessageBookmarks", name: "Message bookmarks", children: ["messageBookmarkButtons", "enableChatHistoryNavigator"] },
  { parent: "enableChatContinuationAssistant", name: "Chat Continuation / Transfer", children: [] },
  { parent: "enableFocusMode", name: "Focus / Immersive Mode", children: ["focusHideSidebar", "focusHideTopBar", "focusHideChatHeader", "focusHideQolPanel"] },
  { parent: "enableContextKeeper", name: "Context Keeper", children: ["contextKeeperAutoCapture", "contextKeeperAutoSensitivity", "contextKeeperAutoEveryMessages", "contextKeeperAutoMaxDetails", "contextKeeperMessageButtons", "contextKeeperAutoRecall", "contextKeeperRelevantRecall", "contextKeeperRecallEverySends", "contextKeeperRecallMaxChars"] },
  { parent: "enableStoryDayTracker", name: "Internal Day Tracker", children: ["storyDayTrackerMode", "storyDayTrackerIncludeInContext", "storyDayTrackerShowQuickPanel"] },
  { parent: "enableRpStateTracker", name: "RP State Tracker", children: ["rpStateTrackerMode", "rpStateInjectMode", "rpStateMaxContextChars", "rpStateShowQuickPanel"] },
  { parent: "enableGlobalMemory", name: "Global Memory", children: ["globalMemoryText", "globalMemorySendMode", "globalMemoryOocWrapper", "globalMemoryShowChatButton"] },
  { parent: "enableChatNudges", name: "Chat Nudges", children: ["chatNudgeDefaultHours", "chatNudgeBrowserNotifications"] },
  { parent: "enableTranslation", name: "Message translation", children: ["translationShowMessageButtons", "translationGreetingButton", "translationAutoGreeting", "translationAutoAi", "translationAutoUser", "translationAllowRemoteFallback", "translationPerChatControls"] },
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
  { parent: "enableChatSceneNotes", name: "Per-chat Scene Notes", children: ["chatSceneNotesAutoInclude", "chatSceneNotesAutoMode", "chatSceneNotesEnableBotApply"] },
  { parent: "enableLorebookConsistency", name: "Lorebook response consistency", children: ["lorebookConsistencyShowMatches", "lorebookConsistencyAutoQueue", "lorebookConsistencyMaxEntries"] },
  { parent: "enableSoundscapes", name: "Soundscapes", children: ["soundscapeShowChatControl", "soundscapeMasterVolume", "soundscapeOnChat", "soundscapeOnHome", "soundscapeOnChats", "soundscapeOnProfiles", "soundscapeOnOther"] },
  { parent: "enableRpFormatRepair", name: "RP Format Repair", children: ["rpFormatRepairAuto", "rpFormatConvertBoldActions", "rpFormatRemoveActionParens", "rpFormatPreserveInlineEmphasis", "rpFormatPreserveSemanticQuotes", "rpFormatPreserveBackticks", "rpFormatShowMessageButtons"] },
  { parent: "enableChatBackgrounds", name: "Custom Pictures · Backgrounds", children: ["chatSceneGalleriesEnabled", "chatBackgroundDim", "chatBackgroundBlur", "chatBackgroundFit", "chatBackgroundPosition"] },
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


