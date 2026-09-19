(() => {
  "use strict";

  const DS = window.DragonScriptQoL = window.DragonScriptQoL || {};

  DS.EXT_NAME = "SpicyChat QoL";
  DS.OPENED_KEY = "openedChats";
  DS.OPENED_META_KEY = "openedChatMeta";
  DS.OOC_TEMPLATES_KEY = "oocTemplates";
  DS.BLOCKED_BOTS_KEY = "blockedBots";
  DS.NOT_INTERESTED_KEY = "notInterestedBots";
  DS.PERSONAS_KEY = "personas";
  DS.PERSONA_ORG_KEY = "personaOrganization";
  DS.LEGACY_PERSONAS_KEY = "savedPersonas";
  DS.FAVORITE_CREATORS_KEY = "favoriteCreators";
  DS.FOLLOWED_CREATORS_KEY = "followedCreators";
  DS.FAVORITE_BOTS_KEY = "favoriteBots";
  DS.LATER_BOTS_KEY = "laterBots";
  DS.BOT_ORGANIZER_KEY = "botOrganization";
  DS.CHAT_ORGANIZER_KEY = "chatOrganization";
  DS.CHARACTER_QOL_PROFILES_KEY = "characterQolProfiles";
  DS.SAVED_TEXT_SNIPPETS_KEY = "savedTextSnippets";
  DS.CONTEXT_KEEPER_DATA_KEY = "contextKeeperData";
  DS.BOT_ARCHIVE_KEY = "botArchive";
  DS.LOREBOOK_BACKUPS_KEY = "lorebookBackups";
  DS.LOCAL_CHANGE_HISTORY_KEY = "localActionHistory";
  DS.CHAT_BOOKMARKS_KEY = "chatBookmarks";
  DS.RECENTLY_SEEN_BOTS_KEY = "recentlySeenBots";
  DS.PENDING_OPTIONS_NAV_KEY = "pendingOptionsNavigation";

  const RUNTIME_LOG_SESSION_KEY = "ds-qol-runtime-log-v1";
  const RUNTIME_LOG_LIMIT = 160;

  function safeRuntimeLogValue(value, max = 280) {
    if (value == null) return "";
    if (value instanceof Error) return String(value.name || "Error") + (value.message ? `: ${value.message}` : "");
    if (typeof value === "string") return value.slice(0, max);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      const shallow = {};
      for (const [key, item] of Object.entries(value).slice(0, 12)) {
        if (/text|message|content|prompt|memory|persona|note/i.test(key)) continue;
        shallow[key] = typeof item === "object" ? "[object]" : String(item).slice(0, 80);
      }
      return JSON.stringify(shallow).slice(0, max);
    } catch {
      return String(value).slice(0, max);
    }
  }

  function readRuntimeLog() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(RUNTIME_LOG_SESSION_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.slice(-RUNTIME_LOG_LIMIT) : [];
    } catch {
      return [];
    }
  }

  const initialRuntimeLog = readRuntimeLog();
  DS.runtimeLog = function runtimeLog(level = "info", area = "core", message = "", detail = "") {
    const entry = {
      at: Date.now(),
      level: String(level || "info").slice(0, 16),
      area: String(area || "core").slice(0, 80),
      message: safeRuntimeLogValue(message, 320),
      detail: safeRuntimeLogValue(detail, 320)
    };
    const log = DS.state.runtimeLog || (DS.state.runtimeLog = []);
    log.push(entry);
    if (log.length > RUNTIME_LOG_LIMIT) log.splice(0, log.length - RUNTIME_LOG_LIMIT);
    try { sessionStorage.setItem(RUNTIME_LOG_SESSION_KEY, JSON.stringify(log)); } catch {}
    return entry;
  };
  DS.getRuntimeLog = function getRuntimeLog(limit = 60) {
    const count = Math.max(1, Math.min(RUNTIME_LOG_LIMIT, Number(limit) || 60));
    return [...(DS.state.runtimeLog || [])].slice(-count);
  };
  DS.clearRuntimeLog = function clearRuntimeLog() {
    DS.state.runtimeLog = [];
    try { sessionStorage.removeItem(RUNTIME_LOG_SESSION_KEY); } catch {}
  };
  function sanitizeParsedMarkup(root) {
    root.querySelectorAll?.("script, iframe, object, embed, link[rel='import']").forEach(node => node.remove());
    root.querySelectorAll?.("*").forEach(node => {
      for (const attr of [...(node.attributes || [])]) {
        const name = String(attr.name || "").toLowerCase();
        const value = String(attr.value || "").trim();
        if (name.startsWith("on") || name === "srcdoc") node.removeAttribute(attr.name);
        if ((name === "href" || name === "src" || name === "xlink:href") && /^javascript:/i.test(value)) node.removeAttribute(attr.name);
      }
    });
    return root;
  }

  function parseSanitizedHtml(markup) {
    const doc = new DOMParser().parseFromString(String(markup || ""), "text/html");
    sanitizeParsedMarkup(doc.body);
    return doc;
  }

  DS.parseSafeMarkupFirstElement = function parseSafeMarkupFirstElement(markup) {
    const doc = parseSanitizedHtml(markup);
    const first = doc.body.firstElementChild;
    return first ? document.importNode(first, true) : null;
  };

  DS.setSafeMarkup = function setSafeMarkup(host, markup) {
    if (!host) return null;
    const doc = parseSanitizedHtml(markup);
    const fragment = document.createDocumentFragment();
    for (const child of [...doc.body.childNodes]) fragment.appendChild(document.importNode(child, true));
    host.replaceChildren(fragment);
    return host;
  };

  DS.setSafeSvgMarkup = function setSafeSvgMarkup(host, markup) {
    if (!host) return null;
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${String(markup || "")}</svg>`, "image/svg+xml");
    const svgRoot = doc.documentElement;
    sanitizeParsedMarkup(svgRoot);
    const fragment = document.createDocumentFragment();
    for (const child of [...svgRoot.childNodes]) fragment.appendChild(document.importNode(child, true));
    host.replaceChildren(fragment);
    return host;
  };

  DS.DEFAULT_OOC_TEMPLATE =
    "[OOC: Never control {user} or the user in any way. Do not speak for {user}. Do not describe what {user} thinks, feels, wants, notices, decides, does, or how {user} reacts. Do not move {user} forward in the scene. Only the user may write {user}'s words, actions, thoughts, emotions, expressions, and decisions. You may control only your character, NPCs, side characters, enemies, and the environment. End every response in a way that leaves {user} free to respond.]";

  DS.DEFAULT_SETTINGS = {
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
    lorebookBackupToolsEnabled: false,
    lorebookBackupsEnabled: false,
    lorebookAutoStartNew: false,
    lorebookBulkKeywordPaste: false,
    lorebookExpandEntryEditor: false,
    lorebookExpandTags: false,
    botTagBulkPaste: false,
    showLorebookEntryExpandButtons: false,
    botEditorDefaultVisibility: "ignore",
    autoAgreeCreationGuidelines: false,
    creatorModerationWarnings: false,
    creatorModerationWarningsChatbots: false,
    creatorModerationWarningMode: "balanced",
    creatorModerationWarningIgnoredTerms: "",
    creatorModerationWarningCustomTerms: "",
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
    favoriteBotCreatorFilter: "",
    favoriteBotStateFilter: "all",
    favoriteBotRelationFilter: "all",
    favoriteBotFolderFilter: "all",
    showLaterBotButtons: false,
  enableSavedListsOverlay: false,
    laterBotCreatorFilter: "",
    laterBotStateFilter: "all",
    protectLaterBotsFromFiltering: false,
    hideLaterBotsFromListings: false,
    laterBotSortMode: "newest",
    laterBotRelationFilter: "all",
    laterBotFolderFilter: "all",
    enableBotOrganizer: false,
    botCollections: "",
    botOrganizerShowCardMeta: true,
    botOrganizerBulkTools: true,
    hideHomeForYouCards: false,
    expandLongCardDescriptions: false,
    showCardGreetingTokenInfo: false,
    showExactMessageCounts: false,
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
    quickDislikeOnBlock: false, // legacy/internal: v86 migrates this to the idle-aware setting below
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
    oocTemplates: [DS.DEFAULT_OOC_TEMPLATE],

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
    deepSleepDisabledFeatures: true,
    performanceDiagnostics: false,
    enableLocalChangeHistory: false,
    showUpdateNotifications: false,
    enableCommandPalette: false,
    commandPaletteShortcut: "ctrl-k",
    commandPaletteShowSavedItems: true,

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

  const TAB_QOL_PAUSED_KEY = "ds-qol-tab-paused-v1";

  function readTabQolPaused() {
    try { return sessionStorage.getItem(TAB_QOL_PAUSED_KEY) === "1"; }
    catch { return false; }
  }

  DS.isQolPausedForTab = function isQolPausedForTab() {
    return readTabQolPaused();
  };

  DS.getQolTabState = function getQolTabState() {
    const globalEnabled = DS.state?.globalEnabledSetting !== false;
    const paused = globalEnabled && readTabQolPaused();
    return {
      globalEnabled,
      paused,
      enabled: globalEnabled && !paused
    };
  };

  DS.applyQolTabEnabledOverride = function applyQolTabEnabledOverride(settings) {
    const target = settings && typeof settings === "object" ? settings : {};
    const globalEnabled = target.enabled !== false;
    DS.state.globalEnabledSetting = globalEnabled;
    DS.state.tabQolPaused = globalEnabled && readTabQolPaused();
    target.enabled = globalEnabled && !DS.state.tabQolPaused;
    return target;
  };

  DS.setQolEnabledForTab = function setQolEnabledForTab(enabled) {
    try {
      if (enabled) sessionStorage.removeItem(TAB_QOL_PAUSED_KEY);
      else sessionStorage.setItem(TAB_QOL_PAUSED_KEY, "1");
    } catch {}

    const globalEnabled = DS.state?.globalEnabledSetting !== false;
    DS.state.tabQolPaused = globalEnabled && !enabled;
    if (DS.state?.settings) DS.state.settings.enabled = globalEnabled && !!enabled;
    DS.state.disabledCleanupDone = false;
    DS.runtimeLog?.("info", "tab-control", enabled ? "QoL enabled for this tab" : "QoL paused for this tab");
    DS.scheduleRun?.({ immediate: true, source: "tab-qol-toggle" });
    return DS.getQolTabState?.() || { globalEnabled, paused: !enabled, enabled: globalEnabled && !!enabled };
  };

  DS.state = {
    globalEnabledSetting: true,
    tabQolPaused: false,
    settings: { ...DS.DEFAULT_SETTINGS },
    openedChats: new Set(),
    openedChatMeta: {},
    blockedBots: {
      ids: [],
      names: [],
      meta: {}
    },
    rawBlockedBots: {
      ids: [],
      names: [],
      meta: {}
    },
    notInterestedBots: {
      ids: [],
      meta: {}
    },
    savedPersonas: [],
    favoriteCreators: { handles: [], meta: {} },
    followedCreators: { handles: [], meta: {} },
    favoriteBots: { ids: [], meta: {} },
    laterBots: { ids: [], meta: {} },
    botOrganization: { meta: {} },
    chatOrganization: { meta: {} },
    recentlySeenBots: { entries: [] },
    characterQolProfiles: {},
    runTimer: null,
    lastUrl: location.href,
    manualImportRunning: false,
    quickPanelStatusTimer: null,
    chatListSorting: false,
    lastPersonaSaveHash: "",
    autoFillRunning: false,
    autoFillClicks: 0,
    autoFillUrl: location.href,
    domRevision: 0,
    messageTextRevision: 0,
    messageDirtyRoots: new Set(),
    messageLaneRoots: null,
    loadedMessageRootsCache: { route: "", revision: -1, roots: [] },
    cardCache: null,
    cardCacheRevision: -1,
    cardCacheUrl: "",
    openedImportRevision: -1,
    lastMarkedChatId: "",
    blockedBotIdSet: new Set(),
    blockedBotNormalizedNameSet: new Set(),
    notInterestedBotIdSet: new Set(),
    favoriteBotIdSet: new Set(),
    laterBotIdSet: new Set(),
    preparedMatchers: {
      blockedNames: [],
      blockedTags: [],
      blockedWords: [],
      blockedCreators: []
    },
    performanceStats: {},
    runtimeLog: initialRuntimeLog,
    runtimePerformance: { sampleStartedAt: Date.now(), mutations: 0, qolOnlyMutations: 0, chatLocalMutations: 0, composerOnlyMutationSkips: 0, schedules: 0, criticalSchedules: 0, slowSchedules: 0, deferredWhileScrolling: 0, hiddenSkips: 0, messageCacheHits: 0, messageCacheMisses: 0, messageCacheInvalidations: 0, messageCacheInvalidationRequests: 0, messageCacheInvalidationDeduped: 0, messageCacheNonTextSkips: 0, messageCacheFingerprintSkips: 0, messageLaneScheduleCoalesced: 0, quickPanelLayoutSkips: 0, quickPanelStateSkips: 0, routeFeatureStepSkips: 0, routeFeatureGroupSkips: 0, storageWriteRequests: 0, storageWriteBatches: 0, storageWriteKeys: 0, storageWriteMergedKeys: 0, storageWriteImmediateFlushes: 0 },
    messageTextCache: new WeakMap(),
    messageTextFingerprints: new WeakMap()
  };

  DS.runtimeLog("info", "core", "Content runtime initialized", location.pathname || "/");

  DS.isMessageEditPending = function isMessageEditPending(root) {
    if (!root?.isConnected) return false;
    if (root?.dataset?.dsEditSavePending) return true;
    return !!root.querySelector?.("textarea, [contenteditable='true']");
  };

  DS.getCurrentMessageLaneRoots = function getCurrentMessageLaneRoots() {
    const roots = Array.isArray(DS.state?.messageLaneRoots) ? DS.state.messageLaneRoots : [];
    return roots.filter(root => root?.isConnected && !DS.isMessageEditPending?.(root));
  };

  DS.getLoadedMessageRoots = function getLoadedMessageRoots(options = {}) {
    if (!DS.isSingleChatPage?.()) return [];
    const route = String(location.pathname || "");
    const revision = Number(DS.state.domRevision || 0);
    const cache = DS.state.loadedMessageRootsCache || (DS.state.loadedMessageRootsCache = { route: "", revision: -1, roots: [] });
    const cachedRoots = Array.isArray(cache.roots) ? cache.roots : [];
    const reusable = !options.fresh && cache.route === route && cache.revision === revision && cachedRoots.every(root => root?.isConnected);
    if (reusable) {
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.loadedMessageRootCacheHits = Number(counters.loadedMessageRootCacheHits || 0) + 1;
      return cachedRoots;
    }
    const roots = Array.from(document.querySelectorAll("div[id^='message-']"))
      .filter(root => !root.parentElement?.closest?.("div[id^='message-']"));
    cache.route = route;
    cache.revision = revision;
    cache.roots = roots;
    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.loadedMessageRootCacheMisses = Number(counters.loadedMessageRootCacheMisses || 0) + 1;
    return roots;
  };

  DS.markMessageRootDirty = function markMessageRootDirty(root) {
    if (!(root instanceof Element) || !root.matches?.("div[id^='message-']")) return false;
    const dirty = DS.state.messageDirtyRoots || (DS.state.messageDirtyRoots = new Set());
    const wasDirty = dirty.has(root);
    dirty.add(root);
    return !wasDirty;
  };

  function messageTextFingerprint(root) {
    const host = root?.querySelector?.("div[class*='overflow-wrap']");
    if (!host) return "";
    const text = String(host.textContent || "");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${hash >>> 0}`;
  }

  DS.invalidateMessageCacheForNode = function invalidateMessageCacheForNode(node) {
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el) return false;

    const roots = new Set();
    if (el.matches?.("div[id^='message-']")) roots.add(el);
    const closest = el.closest?.("div[id^='message-']");
    if (closest) roots.add(closest);
    if (!roots.size) {
      el.querySelectorAll?.("div[id^='message-']").forEach(root => {
        if (!root.parentElement?.closest?.("div[id^='message-']")) roots.add(root);
      });
    }
    if (!roots.size) return false;

    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.messageCacheInvalidationRequests = Number(counters.messageCacheInvalidationRequests || 0) + roots.size;
    let actual = 0;
    let deduped = 0;
    for (const root of roots) {
      const newlyDirty = DS.markMessageRootDirty(root);
      const fingerprints = DS.state.messageTextFingerprints || (DS.state.messageTextFingerprints = new WeakMap());
      const previousFingerprint = fingerprints.get(root);
      if (previousFingerprint) {
        const currentFingerprint = messageTextFingerprint(root);
        if (currentFingerprint && currentFingerprint === previousFingerprint) {
          counters.messageCacheFingerprintSkips = Number(counters.messageCacheFingerprintSkips || 0) + 1;
          if (!newlyDirty) deduped += 1;
          continue;
        }
      }
      const hadCachedText = !!DS.state.messageTextCache?.delete?.(root);
      if (newlyDirty || hadCachedText) actual += 1;
      else deduped += 1;
    }
    if (actual) DS.state.messageTextRevision = Number(DS.state.messageTextRevision || 0) + actual;
    counters.messageCacheInvalidations = Number(counters.messageCacheInvalidations || 0) + actual;
    counters.messageCacheInvalidationDeduped = Number(counters.messageCacheInvalidationDeduped || 0) + deduped;
    return actual > 0;
  };

  DS.getCachedMessageText = function getCachedMessageText(root) {
    if (!(root instanceof Element)) return "";
    const cache = DS.state.messageTextCache || (DS.state.messageTextCache = new WeakMap());
    const cached = cache.get(root);
    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    if (typeof cached === "string") {
      counters.messageCacheHits = Number(counters.messageCacheHits || 0) + 1;
      return cached;
    }
    counters.messageCacheMisses = Number(counters.messageCacheMisses || 0) + 1;
    const visible = el => {
      try { const style = getComputedStyle(el); return style.display !== "none" && style.visibility !== "hidden"; } catch { return true; }
    };
    const host = root.querySelector("div[class*='overflow-wrap']");
    let text = "";
    if (host) {
      const spans = [...host.querySelectorAll("span.leading-6")].filter(visible).map(el => String(el.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
      if (spans.length) text = spans.join("\n");
    }
    if (!text) {
      const clone = root.cloneNode(true);
      clone.querySelectorAll("button,svg,.ds-message-quick-actions,.ds-message-bookmark-button,.ds-generation-metadata,.ds-rp-repair-toggle,.ds-translation-output").forEach(el => el.remove());
      text = String(clone.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    }
    cache.set(root, text);
    const fingerprint = messageTextFingerprint(root);
    if (fingerprint) (DS.state.messageTextFingerprints || (DS.state.messageTextFingerprints = new WeakMap())).set(root, fingerprint);
    return text;
  };

  DS.bumpDomRevision = function bumpDomRevision() {
    DS.state.domRevision = Number(DS.state.domRevision || 0) + 1;
    if (DS.state.loadedMessageRootsCache) DS.state.loadedMessageRootsCache.revision = -1;
    DS.state.cardCache = null;
    DS.state.cardCacheRevision = -1;
    DS.state.cardCacheUrl = "";
  };

  function prepareMatcherList(values) {
    const output = [];
    const seen = new Set();

    for (const rawValue of values || []) {
      const raw = String(rawValue || "").trim();
      if (!raw) continue;

      const needle = typeof DS.searchableTextForMatching === "function"
        ? DS.searchableTextForMatching(raw)
        : raw.toLowerCase().replace(/\s+/g, " ").trim();

      // Blocking/filter text often contains nicknames, punctuation and compact
      // fandom abbreviations (for example Simon 'Ghost', TF141 or TaskForce 141).
      // Keep the normal matcher, but also prepare a separator/camel-case tolerant
      // form so the card blocker can compare the same wording across display styles.
      const flexibleSource = raw
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Za-z])([0-9])/g, "$1 $2")
        .replace(/([0-9])([A-Za-z])/g, "$1 $2");
      const flexibleNeedle = typeof DS.searchableTextForMatching === "function"
        ? DS.searchableTextForMatching(flexibleSource)
        : flexibleSource.toLowerCase().replace(/\s+/g, " ").trim();
      const tokens = String(flexibleNeedle || needle || "").split(" ").filter(Boolean);
      const compact = tokens.join("");

      const dedupeKey = `${needle}|${flexibleNeedle}`;
      if (!needle || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      output.push({ raw, needle, flexibleNeedle, tokens, compact });
    }

    return output;
  }

  DS.refreshFastLookupCaches = function refreshFastLookupCaches() {
    const settings = DS.state?.settings || {};
    const blocked = DS.state?.blockedBots || { ids: [], names: [] };
    const notInterested = DS.state?.notInterestedBots || { ids: [] };
    const favorites = DS.state?.favoriteBots || { ids: [] };
    const later = DS.state?.laterBots || { ids: [] };

    DS.state.blockedBotIdSet = new Set(blocked.ids || []);
    DS.state.blockedBotNormalizedNameSet = new Set((blocked.names || []).map(value => DS.normalize?.(value) || "").filter(Boolean));
    DS.state.notInterestedBotIdSet = new Set(notInterested.ids || []);
    DS.state.favoriteBotIdSet = new Set(favorites.ids || []);
    DS.state.laterBotIdSet = new Set(later.ids || []);
    DS.state.preparedMatchers = {
      blockedNames: prepareMatcherList(blocked.names || []),
      blockedTags: prepareMatcherList(settings.blockedTags || []),
      blockedWords: prepareMatcherList(settings.blockedWords || []),
      blockedCreators: prepareMatcherList(settings.blockedCreators || [])
    };
  };

  DS.isBlockedForOpenedHistory = function isBlockedForOpenedHistory(idValue, meta = {}) {
    const id = String(idValue || "").trim();
    const blocked = DS.state?.blockedBots || { ids: [], names: [] };

    if (id && (DS.state.blockedBotIdSet?.has(id) || (blocked.ids || []).includes(id))) {
      return true;
    }

    const name = DS.normalize?.(meta?.name || meta?.title || "") || "";
    if (!name) return false;

    return DS.state.blockedBotNormalizedNameSet?.has(name) || false;
  };

  DS.enforceBlockedPriorityOverOpened = async function enforceBlockedPriorityOverOpened(options = {}) {
    const opened = DS.state?.openedChats;
    if (!(opened instanceof Set) || !opened.size) return 0;

    DS.state.openedChatMeta = DS.state.openedChatMeta || {};
    let removed = 0;

    for (const id of [...opened]) {
      const meta = DS.state.openedChatMeta[id] || {};
      if (!DS.isBlockedForOpenedHistory?.(id, meta)) continue;
      opened.delete(id);
      delete DS.state.openedChatMeta[id];
      removed++;
    }

    if (removed && options.persist !== false) {
      await DS.storageSet({
        [DS.OPENED_KEY]: [...opened],
        [DS.OPENED_META_KEY]: DS.state.openedChatMeta
      });
      DS.updateQuickPanel?.();
    }

    return removed;
  };

  DS.isExtensionContextValid = function isExtensionContextValid() {
    try {
      return !!(chrome?.runtime?.id && chrome?.storage?.local);
    } catch {
      return false;
    }
  };

  const storageWriteQueue = {
    payload: {},
    waiters: [],
    timer: null,
    flushing: null,
    flushingKeys: new Set()
  };

  function normalizeStoragePayload(obj) {
    const payload = obj && typeof obj === "object" ? { ...obj } : {};
    // The per-tab QoL pause is session-only. Content modules often save a
    // cloned settings object, so never allow the effective paused `enabled`
    // value to leak into persistent/global settings.
    if (payload.settings && typeof payload.settings === "object") {
      payload.settings = {
        ...payload.settings,
        enabled: DS.state?.globalEnabledSetting !== false
      };
    }
    return payload;
  }

  function requestedStorageKeys(keys) {
    if (keys == null) return null;
    if (typeof keys === "string") return new Set([keys]);
    if (Array.isArray(keys)) return new Set(keys.map(String));
    if (typeof keys === "object") return new Set(Object.keys(keys));
    return new Set();
  }

  function pendingWriteTouches(keys) {
    const pending = Object.keys(storageWriteQueue.payload || {});
    const flushing = [...(storageWriteQueue.flushingKeys || [])];
    if (!pending.length && !flushing.length) return false;
    const requested = requestedStorageKeys(keys);
    if (requested === null) return true;
    return pending.some(key => requested.has(key)) || flushing.some(key => requested.has(key));
  }

  function rawStorageGet(keys) {
    return new Promise(resolve => {
      try {
        if (!DS.isExtensionContextValid()) {
          resolve({});
          return;
        }

        chrome.storage.local.get(keys, result => {
          try {
            if (chrome.runtime.lastError) {
              resolve({});
              return;
            }
          } catch {}
          resolve(result || {});
        });
      } catch (error) {
        console.warn(`[${DS.EXT_NAME}] storage get skipped`, error);
        resolve({});
      }
    });
  }

  async function flushStorageWriteQueue() {
    clearTimeout(storageWriteQueue.timer);
    storageWriteQueue.timer = null;

    if (storageWriteQueue.flushing) {
      await storageWriteQueue.flushing;
      if (Object.keys(storageWriteQueue.payload || {}).length) return flushStorageWriteQueue();
      return true;
    }

    const payload = storageWriteQueue.payload;
    const waiters = storageWriteQueue.waiters;
    storageWriteQueue.payload = {};
    storageWriteQueue.waiters = [];
    const keys = Object.keys(payload || {});
    if (!keys.length) {
      waiters.forEach(resolve => resolve(true));
      return true;
    }

    const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.storageWriteBatches = Number(counters.storageWriteBatches || 0) + 1;
    counters.storageWriteKeys = Number(counters.storageWriteKeys || 0) + keys.length;

    storageWriteQueue.flushingKeys = new Set(keys);
    storageWriteQueue.flushing = new Promise(resolve => {
      try {
        if (!DS.isExtensionContextValid()) {
          resolve(false);
          return;
        }
        chrome.storage.local.set(payload, () => {
          try {
            if (chrome.runtime.lastError) {
              resolve(false);
              return;
            }
          } catch {}
          resolve(true);
        });
      } catch (error) {
        console.warn(`[${DS.EXT_NAME}] storage save skipped`, error);
        resolve(false);
      }
    });

    const ok = await storageWriteQueue.flushing;
    storageWriteQueue.flushing = null;
    storageWriteQueue.flushingKeys.clear();
    waiters.forEach(resolve => resolve(ok));

    if (Object.keys(storageWriteQueue.payload || {}).length && !storageWriteQueue.timer) {
      storageWriteQueue.timer = setTimeout(() => flushStorageWriteQueue(), 24);
    }
    return ok;
  }

  DS.flushStorageWrites = flushStorageWriteQueue;

  DS.storageGet = async function storageGet(keys) {
    // Preserve read-after-write semantics while still allowing unrelated keys to
    // be read without waiting for a queued batch.
    if (pendingWriteTouches(keys)) await flushStorageWriteQueue();
    return rawStorageGet(keys);
  };

  DS.storageSet = function storageSet(obj, options = {}) {
    const payload = normalizeStoragePayload(obj);
    const keys = Object.keys(payload);
    if (!keys.length) return Promise.resolve(true);

    const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.storageWriteRequests = Number(counters.storageWriteRequests || 0) + 1;
    let merged = 0;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(storageWriteQueue.payload, key)) merged += 1;
      storageWriteQueue.payload[key] = payload[key];
    }
    counters.storageWriteMergedKeys = Number(counters.storageWriteMergedKeys || 0) + merged;

    const promise = new Promise(resolve => storageWriteQueue.waiters.push(resolve));
    if (options?.immediate) {
      counters.storageWriteImmediateFlushes = Number(counters.storageWriteImmediateFlushes || 0) + 1;
      flushStorageWriteQueue();
    } else if (!storageWriteQueue.timer) {
      storageWriteQueue.timer = setTimeout(() => flushStorageWriteQueue(), 24);
    }
    return promise;
  };

  DS.openOptionsTarget = async function openOptionsTarget(target = "general", params = {}) {
    const safeTarget = String(target || "general").replace(/[^a-z0-9_-]/gi, "") || "general";
    const detail = params && typeof params === "object" ? params : {};
    const pending = {
      target: safeTarget,
      search: String(detail.search || "").slice(0, 300),
      backup: String(detail.backup || "").slice(0, 160),
      lorebookBackup: String(detail.lorebookBackup || "").slice(0, 160),
      at: Date.now()
    };

    // Persist the requested destination before asking the browser/app to open
    // Settings. The Android WebView shim intentionally returns relative values
    // from runtime.getURL(), so navigating to an extension URL from page JS can
    // otherwise become a spicychat.ai 404/edit route. A shared storage handoff
    // works in Chrome, Firefox, and the Android wrapper.
    try {
      const saved = await DS.storageSet?.({ [DS.PENDING_OPTIONS_NAV_KEY]: pending }, { immediate: true });
      if (saved === false) throw new Error("options destination could not be saved");
    } catch (error) {
      DS.runtimeLog?.("warn", "options", "Could not save pending Settings destination", error);
    }

    return new Promise(resolve => {
      let settled = false;
      const finish = value => { if (!settled) { settled = true; resolve(!!value); } };
      const fallback = () => {
        try {
          chrome.runtime?.openOptionsPage?.(() => finish(true));
          window.setTimeout(() => finish(true), 400);
        } catch (error) {
          DS.runtimeLog?.("warn", "options", "Could not open Settings", error);
          finish(false);
        }
      };
      try {
        chrome.runtime?.sendMessage?.({ type: "DS_OPEN_OPTIONS" }, response => {
          let failed = false;
          try { failed = !!chrome.runtime?.lastError; } catch {}
          if (!failed && response?.ok !== false) finish(true);
          else fallback();
        });
        window.setTimeout(() => { if (!settled) fallback(); }, 800);
      } catch {
        fallback();
      }
    });
  };

  // Do not leave a small queued write behind when the user backgrounds/closes a
  // tab. The callback may finish after pagehide, but chrome.storage owns the IO.
  window.addEventListener("pagehide", () => {
    try { DS.flushStorageWrites?.(); } catch {}
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      try { DS.flushStorageWrites?.(); } catch {}
    }
  }, true);

  function cloneLocalHistoryValue(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  DS.getLocalChangeHistory = async function getLocalChangeHistory() {
    const result = await DS.storageGet([DS.LOCAL_CHANGE_HISTORY_KEY]);
    return Array.isArray(result[DS.LOCAL_CHANGE_HISTORY_KEY]) ? result[DS.LOCAL_CHANGE_HISTORY_KEY] : [];
  };

  DS.recordLocalChange = async function recordLocalChange(label, beforePayload, afterPayload = {}) {
    if (!DS.state?.settings?.enableLocalChangeHistory) return false;
    const before = cloneLocalHistoryValue(beforePayload);
    const after = cloneLocalHistoryValue(afterPayload);
    if (!before || typeof before !== "object") return false;

    const entry = {
      id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: String(label || "QoL change").replace(/\s+/g, " ").trim().slice(0, 140),
      at: Date.now(),
      before,
      after: after && typeof after === "object" ? after : {},
      undoable: true
    };

    // Keep history intentionally small. Very large snapshots are logged without
    // rollback data rather than silently filling extension storage.
    try {
      if (JSON.stringify(entry).length > 220000) {
        entry.before = {};
        entry.after = {};
        entry.undoable = false;
      }
    } catch {
      entry.before = {};
      entry.after = {};
      entry.undoable = false;
    }

    const history = await DS.getLocalChangeHistory();
    history.unshift(entry);
    await DS.storageSet({ [DS.LOCAL_CHANGE_HISTORY_KEY]: history.slice(0, 12) });
    return true;
  };

  DS.undoLocalChange = async function undoLocalChange(changeId = "") {
    const history = await DS.getLocalChangeHistory();
    const index = changeId ? history.findIndex(item => item?.id === changeId) : history.findIndex(item => item?.undoable);
    if (index < 0) return { ok: false, reason: "Nothing undoable" };
    const entry = history[index];
    if (!entry?.undoable || !entry.before || typeof entry.before !== "object") return { ok: false, reason: "That entry cannot be undone" };
    const payload = {};
    for (const [key, value] of Object.entries(entry.before)) payload[key] = cloneLocalHistoryValue(value);
    if (!Object.keys(payload).length) return { ok: false, reason: "No rollback snapshot" };
    const current = await DS.storageGet(Object.keys(payload));
    for (const [key, expected] of Object.entries(entry.after || {})) {
      if (JSON.stringify(current[key]) !== JSON.stringify(expected)) {
        return { ok: false, reason: "That data changed again after this history entry" };
      }
    }
    const ok = await DS.storageSet(payload);
    if (!ok) return { ok: false, reason: "Storage write failed" };
    history.splice(index, 1);
    await DS.storageSet({ [DS.LOCAL_CHANGE_HISTORY_KEY]: history });
    return { ok: true, entry };
  };

  DS.clearLocalChangeHistory = async function clearLocalChangeHistory() {
    await DS.storageSet({ [DS.LOCAL_CHANGE_HISTORY_KEY]: [] });
  };

  DS.uniqueClean = values => [
    ...new Set(
      (values || [])
        .map(x => String(x).trim())
        .filter(Boolean)
    )
  ];


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

  DS.normalizeTextForMatching = function normalizeTextForMatching(value, options = {}) {
    const settings = DS.state?.settings || DS.DEFAULT_SETTINGS || {};
    const enabled = settings.textNormalizationEnabled !== false;

    let text = String(value || "");

    if (!enabled) {
      return text;
    }

    if (settings.normalizeInvisibleCharacters !== false) {
      text = text
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
        .replace(/[\u00AD]/g, "");
    }

    if (settings.normalizeFancyUnicode !== false) {
      if (typeof text.normalize === "function") {
        try {
          text = text.normalize("NFKC");
        } catch {}
      }

      text = normalizeMathematicalLatinFallback(text);
    }

    if (settings.normalizePunctuation !== false) {
      text = text
        .replace(/[‘’‚‛`´]/g, "'")
        .replace(/[“”„‟]/g, '"')
        .replace(/[‐‑‒–—―]/g, "-")
        .replace(/[⁄∕]/g, "/")
        .replace(/[…]/g, "...")
        .replace(/[•·∙]/g, " ");
    }

    if (settings.normalizeDecorativeSymbols || options.stripDecorativeSymbols) {
      text = text
        .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, " ")
        .replace(/[★☆✦✧✩✪✫✬✭✮✯✰♡♥❤💕💖💗💘💝💞💟]/gu, " ")
        .replace(/[꧁꧂◦°⋆]+/gu, " ")
        // Decorative title suffixes often mix historic glyph blocks, combining
        // marks and sub/superscript operators (for example 𓏲࣪₊). Only strip
        // these when the user explicitly enables decorative-symbol cleanup.
        .replace(/[\u{13000}-\u{1342F}]/gu, " ")
        .replace(/[\u08E3-\u0902₊₋₌⁺⁻⁼]+/gu, " ")
        .replace(/[|｜¦]+/g, " | ");
    }

    return text;
  };

  DS.normalizeTextForDisplay = function normalizeTextForDisplay(value) {
    return DS.normalizeTextForMatching(value)
      .replace(/\s+/g, " ")
      .trim();
  };

  DS.normalizeTextPreview = function normalizeTextPreview(value) {
    return DS.normalizeTextForMatching(value, { stripDecorativeSymbols: true })
      .replace(/\s+/g, " ")
      .trim();
  };

  DS.oocLabelFromText = function oocLabelFromText(text, index = 0) {
  const clean = String(text || "")
    .replace(/^\s*\[?OOC\s*:?\s*/i, "")
    .replace(/\]?\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean || clean === ":") {
    return `OOC ${index + 1}`;
  }

  return clean.length > 28 ? `${clean.slice(0, 28)}...` : clean;
};

DS.normalizeOocTemplates = function normalizeOocTemplates(value) {
  let items = [];

  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === "string" && value.trim()) {
    items = value
      .split(/\n\s*---\s*\n/g)
      .map(text => text.trim())
      .filter(Boolean);
  }

  if (!items.length) {
    items = [{ name: "Strict no-control", text: DS.DEFAULT_OOC_TEMPLATE }];
  }

  return items
    .map((item, index) => {
      if (typeof item === "string") {
        const text = item.trim();
        if (!text) return null;

        return {
          id: `ooc-${Date.now()}-${index}`,
          name: DS.oocLabelFromText(text, index),
          text
        };
      }

      if (!item || typeof item !== "object") return null;

      const text = String(item.text || item.body || item.value || "").trim();
      if (!text) return null;

      const name =
        String(item.name || item.title || "").trim() ||
        DS.oocLabelFromText(text, index);

      return {
        id: String(item.id || `ooc-${Date.now()}-${index}`),
        name,
        text
      };
    })
    .filter(Boolean);
};


  DS.cleanPersonaName = function cleanPersonaName(value) {
    let text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return "";

    text = text
      .replace(/\s*\bDefault\b\s*$/i, "")
      .replace(/Default$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    return text;
  };

  DS.cleanPersonas = function cleanPersonas(personas) {
    const byKey = new Map();

    for (const persona of personas || []) {
      if (!persona || typeof persona !== "object") continue;

      const id = String(persona.id || "").trim();
      const name = DS.cleanPersonaName(persona.name || persona.label || "");
      if (!id && !name) continue;

      byKey.set(id || name.toLowerCase(), {
        ...persona,
        id,
        name
      });
    }

    return [...byKey.values()];
  };

  DS.loadState = async function loadState() {
    const result = await DS.storageGet([
      "settings",
      DS.OPENED_KEY,
      DS.OPENED_META_KEY,
      DS.OOC_TEMPLATES_KEY,
      DS.BLOCKED_BOTS_KEY,
      DS.NOT_INTERESTED_KEY,
      DS.PERSONAS_KEY,
      DS.LEGACY_PERSONAS_KEY,
      DS.FAVORITE_CREATORS_KEY,
      DS.FOLLOWED_CREATORS_KEY,
      DS.FAVORITE_BOTS_KEY,
      DS.LATER_BOTS_KEY,
      DS.BOT_ORGANIZER_KEY,
      DS.CHAT_ORGANIZER_KEY,
      DS.RECENTLY_SEEN_BOTS_KEY,
      DS.CHARACTER_QOL_PROFILES_KEY,
      "generationMetadataDefaultsMigrationV01841",
      "backupOptInMigrationV01990",
      "quickDislikeOptInMigrationV019119"
    ]);

    const rawSettings = result.settings || {};
    const settings = {
      ...DS.DEFAULT_SETTINGS,
      ...rawSettings
    };
    // Capture the persisted master switch before migrations perform any writes.
    DS.state.globalEnabledSetting = settings.enabled !== false;

    if (!("chatBubbleAiActionMode" in rawSettings)) {
      settings.chatBubbleAiActionMode = rawSettings.chatBubblePreserveActionColors === false ? "base" : "native";
    }
    if (!("chatBubbleUserActionMode" in rawSettings)) {
      settings.chatBubbleUserActionMode = rawSettings.chatBubblePreserveActionColors === false ? "base" : "native";
    }

    let shouldSaveMigratedSettings = false;
    const migrationPayload = {};

    // v0.1.9.86: the old immediate Quick Dislike flag is migrated to the
    // idle-aware queue. Keeping the legacy key false prevents older blocking
    // code from starting helper tabs immediately after every block.
    if (!("quickDislikeIdleEnabled" in rawSettings)) {
      settings.quickDislikeIdleEnabled = !!rawSettings.quickDislikeOnBlock;
      shouldSaveMigratedSettings = true;
    }
    if (settings.quickDislikeOnBlock) {
      settings.quickDislikeOnBlock = false;
      shouldSaveMigratedSettings = true;
    }

    // v0.1.9.119: automatic dislike-after-blocking is explicitly opt-in.
    // Turn any previously persisted automatic state off once on upgrade so it
    // cannot keep running just because an older build/preset enabled it.
    if (result.quickDislikeOptInMigrationV019119 !== true) {
      settings.quickDislikeIdleEnabled = false;
      settings.quickDislikeOnBlock = false;
      shouldSaveMigratedSettings = true;
      migrationPayload.quickDislikeOptInMigrationV019119 = true;
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

    // v0.1.9.104: split "show backup tools" from "automatic saves".
    // If an older install already opted into automatic backups, keep the
    // corresponding manual controls enabled after the split.
    if (!("botBackupToolsEnabled" in rawSettings) && rawSettings.botArchiveOwnEditorBackups === true) {
      settings.botBackupToolsEnabled = true;
      shouldSaveMigratedSettings = true;
    }
    if (!("lorebookBackupToolsEnabled" in rawSettings) && rawSettings.lorebookBackupsEnabled === true) {
      settings.lorebookBackupToolsEnabled = true;
      shouldSaveMigratedSettings = true;
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

    if (shouldSaveMigratedSettings || Object.keys(migrationPayload).length) {
      await DS.storageSet({
        ...(shouldSaveMigratedSettings ? { settings } : {}),
        ...migrationPayload
      });
    }

    settings.oocTemplates = DS.normalizeOocTemplates(
      Array.isArray(result[DS.OOC_TEMPLATES_KEY])
        ? result[DS.OOC_TEMPLATES_KEY]
        : settings.oocTemplates
    );

    const savedBlocked = result[DS.BLOCKED_BOTS_KEY] || {};
    const savedNotInterested = result[DS.NOT_INTERESTED_KEY] || {};
    const savedFavoriteBots = result[DS.FAVORITE_BOTS_KEY] || {};
    const savedLaterBots = result[DS.LATER_BOTS_KEY] || {};
    const savedBotOrganization = result[DS.BOT_ORGANIZER_KEY] || {};
    const savedChatOrganization = result[DS.CHAT_ORGANIZER_KEY] || {};
    const savedRecentlySeenBots = result[DS.RECENTLY_SEEN_BOTS_KEY] || {};

    DS.applyQolTabEnabledOverride?.(settings);
    DS.state.settings = settings;

    DS.state.openedChats = new Set(
      Array.isArray(result[DS.OPENED_KEY])
        ? result[DS.OPENED_KEY]
        : []
    );

    DS.state.openedChatMeta =
      result[DS.OPENED_META_KEY] && typeof result[DS.OPENED_META_KEY] === "object"
        ? result[DS.OPENED_META_KEY]
        : {};

    DS.state.rawBlockedBots = {
      ids: Array.isArray(savedBlocked.ids) ? [...savedBlocked.ids] : [],
      names: Array.isArray(savedBlocked.names) ? [...savedBlocked.names] : [],
      meta: savedBlocked.meta && typeof savedBlocked.meta === "object" ? savedBlocked.meta : {}
    };

    DS.state.blockedBots = {
      ids: DS.uniqueClean([
        ...(Array.isArray(settings.blockedBotIds)
          ? settings.blockedBotIds
          : []),

        ...(Array.isArray(savedBlocked.ids)
          ? savedBlocked.ids
          : [])
      ]),

      names: DS.uniqueClean([
        ...(Array.isArray(settings.blockedBotNames)
          ? settings.blockedBotNames
          : []),

        ...(Array.isArray(savedBlocked.names)
          ? savedBlocked.names
          : [])
      ]),
      meta: savedBlocked.meta && typeof savedBlocked.meta === "object"
        ? savedBlocked.meta
        : {}
    };

    DS.state.notInterestedBots = {
      ids: DS.uniqueClean(Array.isArray(savedNotInterested.ids) ? savedNotInterested.ids : []),
      meta: savedNotInterested.meta && typeof savedNotInterested.meta === "object"
        ? savedNotInterested.meta
        : {}
    };

    DS.state.favoriteCreators = typeof DS.normalizeCreatorStore === "function"
      ? DS.normalizeCreatorStore(result[DS.FAVORITE_CREATORS_KEY])
      : (result[DS.FAVORITE_CREATORS_KEY] || { handles: [], meta: {} });

    DS.state.followedCreators = typeof DS.normalizeFollowedCreatorStore === "function"
      ? DS.normalizeFollowedCreatorStore(result[DS.FOLLOWED_CREATORS_KEY])
      : (result[DS.FOLLOWED_CREATORS_KEY] || { handles: [], meta: {} });

    DS.state.favoriteBots = {
      ids: DS.uniqueClean(Array.isArray(savedFavoriteBots.ids) ? savedFavoriteBots.ids : []),
      meta: savedFavoriteBots.meta && typeof savedFavoriteBots.meta === "object"
        ? savedFavoriteBots.meta
        : {}
    };

    DS.state.laterBots = {
      ids: DS.uniqueClean(Array.isArray(savedLaterBots.ids) ? savedLaterBots.ids : []),
      meta: savedLaterBots.meta && typeof savedLaterBots.meta === "object"
        ? savedLaterBots.meta
        : {}
    };

    DS.state.botOrganization = {
      meta: savedBotOrganization.meta && typeof savedBotOrganization.meta === "object"
        ? savedBotOrganization.meta
        : {}
    };

    DS.state.chatOrganization = {
      meta: savedChatOrganization.meta && typeof savedChatOrganization.meta === "object"
        ? savedChatOrganization.meta
        : {}
    };

    DS.state.recentlySeenBots = {
      entries: Array.isArray(savedRecentlySeenBots.entries) ? savedRecentlySeenBots.entries : []
    };

    DS.state.characterQolProfiles = typeof DS.normalizeCharacterQolProfiles === "function"
      ? DS.normalizeCharacterQolProfiles(result[DS.CHARACTER_QOL_PROFILES_KEY])
      : (result[DS.CHARACTER_QOL_PROFILES_KEY] && typeof result[DS.CHARACTER_QOL_PROFILES_KEY] === "object"
        ? result[DS.CHARACTER_QOL_PROFILES_KEY]
        : {});

    const currentPersonas = Array.isArray(result[DS.PERSONAS_KEY])
      ? result[DS.PERSONAS_KEY]
      : [];

    const legacyPersonas = Array.isArray(result[DS.LEGACY_PERSONAS_KEY])
      ? result[DS.LEGACY_PERSONAS_KEY]
      : [];

    DS.state.savedPersonas = DS.cleanPersonas([
      ...currentPersonas,
      ...legacyPersonas
    ]);

    DS.refreshFastLookupCaches?.();
    await DS.enforceBlockedPriorityOverOpened?.();
  };

  function rebuildBlockedStateFromCache() {
    const raw = DS.state.rawBlockedBots || { ids: [], names: [], meta: {} };
    const settings = DS.state.settings || {};

    DS.state.blockedBots = {
      ids: DS.uniqueClean([
        ...(Array.isArray(settings.blockedBotIds) ? settings.blockedBotIds : []),
        ...(Array.isArray(raw.ids) ? raw.ids : [])
      ]),
      names: DS.uniqueClean([
        ...(Array.isArray(settings.blockedBotNames) ? settings.blockedBotNames : []),
        ...(Array.isArray(raw.names) ? raw.names : [])
      ]),
      meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {}
    };
  }

  // chrome.storage.onChanged already gives us the new values. Applying those
  // directly avoids rereading every large saved list after a small setting
  // change, which is especially noticeable on Android/WebView installs.
  DS.applyStorageChanges = function applyStorageChanges(changes = {}) {
    let refreshLookups = false;

    if (changes.settings) {
      const rawSettings = changes.settings.newValue || {};
      const normalizedSettings = { ...rawSettings };
      if (!("quickDislikeIdleEnabled" in normalizedSettings)) {
        normalizedSettings.quickDislikeIdleEnabled = !!normalizedSettings.quickDislikeOnBlock;
      }
      normalizedSettings.quickDislikeOnBlock = false;
      DS.state.settings = { ...DS.DEFAULT_SETTINGS, ...normalizedSettings };
      DS.applyQolTabEnabledOverride?.(DS.state.settings);
      DS.state.settings.oocTemplates = DS.normalizeOocTemplates(
        changes[DS.OOC_TEMPLATES_KEY]?.newValue ?? rawSettings.oocTemplates ?? DS.state.settings.oocTemplates
      );
      rebuildBlockedStateFromCache();
      refreshLookups = true;
    }

    if (changes[DS.OOC_TEMPLATES_KEY] && !changes.settings) {
      DS.state.settings.oocTemplates = DS.normalizeOocTemplates(changes[DS.OOC_TEMPLATES_KEY].newValue);
    }

    if (changes[DS.OPENED_KEY]) {
      DS.state.openedChats = new Set(Array.isArray(changes[DS.OPENED_KEY].newValue) ? changes[DS.OPENED_KEY].newValue : []);
    }

    if (changes[DS.OPENED_META_KEY]) {
      const next = changes[DS.OPENED_META_KEY].newValue;
      DS.state.openedChatMeta = next && typeof next === "object" ? next : {};
    }

    if (changes[DS.BLOCKED_BOTS_KEY]) {
      const next = changes[DS.BLOCKED_BOTS_KEY].newValue || {};
      DS.state.rawBlockedBots = {
        ids: Array.isArray(next.ids) ? [...next.ids] : [],
        names: Array.isArray(next.names) ? [...next.names] : [],
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
      rebuildBlockedStateFromCache();
      refreshLookups = true;
    }

    if (changes[DS.NOT_INTERESTED_KEY]) {
      const next = changes[DS.NOT_INTERESTED_KEY].newValue || {};
      DS.state.notInterestedBots = {
        ids: DS.uniqueClean(Array.isArray(next.ids) ? next.ids : []),
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
      refreshLookups = true;
    }

    if (changes[DS.FAVORITE_CREATORS_KEY]) {
      const next = changes[DS.FAVORITE_CREATORS_KEY].newValue || {};
      DS.state.favoriteCreators = typeof DS.normalizeCreatorStore === "function"
        ? DS.normalizeCreatorStore(next)
        : {
            handles: DS.uniqueClean(Array.isArray(next.handles) ? next.handles : []),
            meta: next.meta && typeof next.meta === "object" ? next.meta : {}
          };
    }

    if (changes[DS.FOLLOWED_CREATORS_KEY]) {
      const next = changes[DS.FOLLOWED_CREATORS_KEY].newValue || {};
      DS.state.followedCreators = {
        handles: DS.uniqueClean(Array.isArray(next.handles) ? next.handles : []),
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
    }

    if (changes[DS.FAVORITE_BOTS_KEY]) {
      const next = changes[DS.FAVORITE_BOTS_KEY].newValue || {};
      DS.state.favoriteBots = {
        ids: DS.uniqueClean(Array.isArray(next.ids) ? next.ids : []),
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
      refreshLookups = true;
    }

    if (changes[DS.LATER_BOTS_KEY]) {
      const next = changes[DS.LATER_BOTS_KEY].newValue || {};
      DS.state.laterBots = {
        ids: DS.uniqueClean(Array.isArray(next.ids) ? next.ids : []),
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
      refreshLookups = true;
    }

    if (changes[DS.BOT_ORGANIZER_KEY]) {
      const next = changes[DS.BOT_ORGANIZER_KEY].newValue || {};
      DS.state.botOrganization = {
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
    }

    if (changes[DS.CHAT_ORGANIZER_KEY]) {
      const next = changes[DS.CHAT_ORGANIZER_KEY].newValue || {};
      DS.state.chatOrganization = {
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
      DS.updateQuickPanel?.();
    }

    if (changes[DS.RECENTLY_SEEN_BOTS_KEY]) {
      const next = changes[DS.RECENTLY_SEEN_BOTS_KEY].newValue || {};
      DS.state.recentlySeenBots = {
        entries: Array.isArray(next.entries) ? next.entries : []
      };
    }

    if (changes[DS.CHARACTER_QOL_PROFILES_KEY]) {
      const next = changes[DS.CHARACTER_QOL_PROFILES_KEY].newValue || {};
      DS.state.characterQolProfiles = typeof DS.normalizeCharacterQolProfiles === "function"
        ? DS.normalizeCharacterQolProfiles(next)
        : (next && typeof next === "object" ? next : {});
    }

    if (changes[DS.PERSONAS_KEY] || changes[DS.LEGACY_PERSONAS_KEY]) {
      const current = changes[DS.PERSONAS_KEY]
        ? (Array.isArray(changes[DS.PERSONAS_KEY].newValue) ? changes[DS.PERSONAS_KEY].newValue : [])
        : DS.state.savedPersonas;
      const legacy = changes[DS.LEGACY_PERSONAS_KEY]
        ? (Array.isArray(changes[DS.LEGACY_PERSONAS_KEY].newValue) ? changes[DS.LEGACY_PERSONAS_KEY].newValue : [])
        : [];
      DS.state.savedPersonas = DS.cleanPersonas([...(current || []), ...legacy]);
    }

    if (refreshLookups) DS.refreshFastLookupCaches?.();

    // Opened-history writes are already filtered at capture time and during
    // state load. Re-running the full blocked-vs-opened sweep for every opened
    // metadata write becomes very expensive with thousands of records.
    if (changes[DS.BLOCKED_BOTS_KEY] || changes.settings) {
      DS.enforceBlockedPriorityOverOpened?.().catch?.(() => {});
    }
  };

  DS.saveOpenedChats = async function saveOpenedChats(options = {}) {
    if (options.skipBlockedCleanup !== true) {
      await DS.enforceBlockedPriorityOverOpened?.({ persist: false });
    }

    const payload = {};
    if (options.metaOnly !== true) payload[DS.OPENED_KEY] = [...DS.state.openedChats];
    if (options.idsOnly !== true) payload[DS.OPENED_META_KEY] = DS.state.openedChatMeta || {};
    await DS.storageSet(payload);

    DS.updateQuickPanel?.();
  };

  DS.saveOpenedChatMeta = function saveOpenedChatMeta(id, meta = {}) {
    if (!id) return;

    DS.state.openedChatMeta = DS.state.openedChatMeta || {};
    DS.state.openedChatMeta[id] = {
      ...(DS.state.openedChatMeta[id] || {}),
      ...meta,
      id,
      savedAt: meta.savedAt || DS.state.openedChatMeta[id]?.savedAt || Date.now(),
      lastSeenAt: Date.now()
    };
  };

  DS.saveBlockedBots = async function saveBlockedBots() {
    DS.state.blockedBots.ids =
      DS.uniqueClean(DS.state.blockedBots.ids);

    DS.state.blockedBots.names =
      DS.uniqueClean(DS.state.blockedBots.names);

    if (!DS.state.blockedBots.meta || typeof DS.state.blockedBots.meta !== "object") {
      DS.state.blockedBots.meta = {};
    }

    DS.state.rawBlockedBots = {
      ids: [...DS.state.blockedBots.ids],
      names: [...DS.state.blockedBots.names],
      meta: DS.state.blockedBots.meta
    };
    DS.refreshFastLookupCaches?.();

    const removedOpened = await DS.enforceBlockedPriorityOverOpened?.({ persist: false }) || 0;
    const payload = {
      [DS.BLOCKED_BOTS_KEY]: DS.state.blockedBots
    };
    if (removedOpened) {
      payload[DS.OPENED_KEY] = [...DS.state.openedChats];
      payload[DS.OPENED_META_KEY] = DS.state.openedChatMeta || {};
    }

    await DS.storageSet(payload);

    DS.updateQuickPanel?.();
  };


  DS.saveNotInterestedBots = async function saveNotInterestedBots() {
    DS.state.notInterestedBots.ids =
      DS.uniqueClean(DS.state.notInterestedBots.ids);

    if (!DS.state.notInterestedBots.meta || typeof DS.state.notInterestedBots.meta !== "object") {
      DS.state.notInterestedBots.meta = {};
    }

    DS.refreshFastLookupCaches?.();

    await DS.storageSet({
      [DS.NOT_INTERESTED_KEY]: DS.state.notInterestedBots
    });

    DS.updateQuickPanel?.();
  };

  DS.saveFavoriteCreators = async function saveFavoriteCreators(store = DS.state.favoriteCreators) {
    DS.state.favoriteCreators = typeof DS.normalizeCreatorStore === "function"
      ? DS.normalizeCreatorStore(store)
      : store;

    await DS.storageSet({
      [DS.FAVORITE_CREATORS_KEY]: DS.state.favoriteCreators
    });

    DS.updateQuickPanel?.();
  };

  DS.saveFollowedCreators = async function saveFollowedCreators(store = DS.state.followedCreators) {
    DS.state.followedCreators = typeof DS.normalizeFollowedCreatorStore === "function"
      ? DS.normalizeFollowedCreatorStore(store)
      : store;

    await DS.storageSet({
      [DS.FOLLOWED_CREATORS_KEY]: DS.state.followedCreators
    });

    DS.updateQuickPanel?.();
  };

  DS.saveFavoriteBots = async function saveFavoriteBots(store = DS.state.favoriteBots) {
    const source = store && typeof store === "object" ? store : {};
    const normalized = {
      ids: DS.uniqueClean(Array.isArray(source.ids) ? source.ids : []),
      meta: source.meta && typeof source.meta === "object" ? source.meta : {}
    };

    DS.state.favoriteBots = normalized;
    DS.refreshFastLookupCaches?.();
    await DS.storageSet({
      [DS.FAVORITE_BOTS_KEY]: normalized
    });
  };

  DS.saveBotOrganization = async function saveBotOrganization(store = DS.state.botOrganization) {
    const next = store && typeof store === "object" ? store : { meta: {} };
    DS.state.botOrganization = {
      meta: next.meta && typeof next.meta === "object" ? next.meta : {}
    };
    await DS.storageSet({
      [DS.BOT_ORGANIZER_KEY]: DS.state.botOrganization
    });
    DS.updateQuickPanel?.();
  };

  DS.saveChatOrganization = async function saveChatOrganization(store = DS.state.chatOrganization) {
    const next = store && typeof store === "object" ? store : { meta: {} };
    DS.state.chatOrganization = {
      meta: next.meta && typeof next.meta === "object" ? next.meta : {}
    };
    await DS.storageSet({
      [DS.CHAT_ORGANIZER_KEY]: DS.state.chatOrganization
    });
    DS.updateQuickPanel?.();
  };

  DS.saveRecentlySeenBots = async function saveRecentlySeenBots(store = DS.state.recentlySeenBots) {
    const next = store && typeof store === "object" ? store : { entries: [] };
    DS.state.recentlySeenBots = {
      entries: Array.isArray(next.entries) ? next.entries : []
    };
    await DS.storageSet({
      [DS.RECENTLY_SEEN_BOTS_KEY]: DS.state.recentlySeenBots
    });
    DS.updateQuickPanel?.();
  };

  DS.saveLaterBots = async function saveLaterBots(store = DS.state.laterBots) {
    const next = store && typeof store === "object" ? store : { ids: [], meta: {} };

    DS.state.laterBots = {
      ids: DS.uniqueClean(Array.isArray(next.ids) ? next.ids : []),
      meta: next.meta && typeof next.meta === "object" ? next.meta : {}
    };

    DS.refreshFastLookupCaches?.();

    await DS.storageSet({
      [DS.LATER_BOTS_KEY]: DS.state.laterBots
    });

    DS.updateQuickPanel?.();
  };

  DS.savePersonas = async function savePersonas(personas) {
    DS.state.savedPersonas = DS.cleanPersonas(personas);

    await DS.storageSet({
      [DS.PERSONAS_KEY]: DS.state.savedPersonas
    });

    DS.updateQuickPanel?.();
  };
})();