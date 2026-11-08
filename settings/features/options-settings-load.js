// Feature-owned options helpers: settings-load. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

async function load() {
  settingsAutosaveReady = false;
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
    OOC_TEMPLATES_KEY,
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
    LIBRE_TRANSLATE_KEY,
    CHAT_BACKGROUNDS_KEY,
    CREATOR_BOT_WEBHOOK_KEY,
    ARCHIVE_IMPORT_ENDPOINT_KEY,
    ARCHIVE_IMPORT_TOKEN_KEY,
    ARCHIVE_UPLOAD_STATE_KEY,
    ARCHIVE_CONTRIBUTION_ENABLED_KEY,
    ARCHIVE_CONTRIBUTION_STATE_KEY,
    "generationMetadataDefaultsMigrationV01841",
    "backupOptInMigrationV01990",
    "quickDislikeOptInMigrationV019119",
    "oocHardPresetMigrationV022",
    "lorebookPublicOptInMigrationV031"
  ]);

  const rawSettings = result.settings || {};
  await ensureGranularSettingsMigration(rawSettings);
  const settings = { ...DEFAULT_SETTINGS, ...rawSettings };
  if (!Object.prototype.hasOwnProperty.call(rawSettings, "autoAfkMinutes")) {
    const legacyHours = Math.min(720, Math.max(0.25, Number(rawSettings.autoAfkHours) || 12));
    settings.autoAfkMinutes = Math.min(43200, Math.max(15, Math.round(legacyHours * 60)));
  }
  loadedSettingsSnapshot = { ...settings };
  creatorBotWebhookState = normalizeCreatorBotWebhookConfig(result[CREATOR_BOT_WEBHOOK_KEY]);
  applyOptionsPerformancePreferences(settings);
  applyOptionsAccessibilityPreview(settings);
  if (!("chatBubbleAiActionMode" in rawSettings)) settings.chatBubbleAiActionMode = rawSettings.chatBubblePreserveActionColors === false ? "base" : "native";
  if (!("chatBubbleUserActionMode" in rawSettings)) settings.chatBubbleUserActionMode = rawSettings.chatBubblePreserveActionColors === false ? "base" : "native";
  showFirstRunNoticeIfNeeded(result[RELEASE_NOTICE_KEY]);
  const migrationPayload = {};
  let shouldSaveMigratedSettings = false;

  // v0.2.31: Public Lorebook controls are opt-in from first release.
  // Also reset prerelease development installs that briefly received ON defaults.
  if (result.lorebookPublicOptInMigrationV031 !== true) {
    settings.lorebookBlockingEnabled = false;
    settings.applyBotBlockingToLorebooks = false;
    settings.showLorebookBlockButtons = false;
    settings.lorebookTrackHistory = false;
    settings.lorebookPublicToolsEnabled = false; // legacy prerelease master switch
    shouldSaveMigratedSettings = true;
    migrationPayload.lorebookPublicOptInMigrationV031 = true;
  }

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
    const rulebooks = caps.rulebooks || "unknown";
    const statusText = beta.detected ? "Detected on this browser profile" : (pub === "unavailable" ? "Not detected on this browser profile" : "Not detected yet");
    if (betaStatus) {
      const label = document.createElement("strong");
      label.textContent = "Status:";
      const checkedText = beta.lastCheckedAt
        ? ` · checked ${new Date(Number(beta.lastCheckedAt)).toLocaleString()}`
        : "";
      betaStatus.replaceChildren(label, document.createTextNode(` ${statusText}${checkedText}`));
    }
    if (betaDetails) {
      const parts = [`Public Lorebooks: ${pub}`, `Story Mode: ${story}`];
      // Rulebooks are an early SpicyChat beta. Do not advertise a dead option
      // to normal accounts; show the capability only after this browser profile
      // has actually exposed Rulebook UI/routes.
      if (rulebooks !== "unknown") parts.push(`Rulebooks: ${rulebooks}`);
      betaDetails.textContent = parts.join(" · ");
    }
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






  setChecked("botEditorAutoOpenAdvanced", !!settings.botEditorAutoOpenAdvanced);
  setChecked("rememberBotImagePrompt", !!settings.rememberBotImagePrompt);
  setChecked("botEditorSaveActions", !!settings.botEditorSaveActions);
  setChecked("botEditorSaveChatNewTab", !!settings.botEditorSaveChatNewTab);
  setChecked("enableBotEditorDraftHistory", !!settings.enableBotEditorDraftHistory);
  setValue("botEditorDraftHistoryLimit", Math.max(3, Math.min(20, Number(settings.botEditorDraftHistoryLimit) || 8)));
  setChecked("enableWikiLorebookImporter", !!settings.enableWikiLorebookImporter);
  setChecked("enableLorebookConsistency", !!settings.enableLorebookConsistency);
  setChecked("enableCreatorTriggerPreview", !!settings.enableCreatorTriggerPreview);
  setChecked("lorebookConsistencyShowMatches", settings.lorebookConsistencyShowMatches !== false);
  setChecked("lorebookConsistencyAutoQueue", settings.lorebookConsistencyAutoQueue === true);
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
  setChecked("lorebookEntryQuickToggle", !!settings.lorebookEntryQuickToggle);
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
  setChecked("lorebookExpandTags", !!settings.lorebookExpandTags);
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
  refreshContextWarningNotificationPermissionStatus();
  if ($("generationProfileCount")) {
    const profileCount = result[GENERATION_PROFILES_KEY] && typeof result[GENERATION_PROFILES_KEY] === "object"
      ? Object.keys(result[GENERATION_PROFILES_KEY]).length
      : 0;
    $("generationProfileCount").textContent = `${profileCount} saved`;
  }



  setChecked("lowMemoryProtectionEnabled", !!settings.lowMemoryProtectionEnabled);
  setValue("maxAwakeSpicyTabs", String(Math.min(20, Math.max(1, Number(settings.maxAwakeSpicyTabs) || 3))));





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






  setChecked("chatTopBarAddLaterButton", !!settings.chatTopBarAddLaterButton);
  setChecked("closeChatTabAfterSavingLater", !!settings.closeChatTabAfterSavingLater);
  setChecked("showPerCharacterChatHistory", !!settings.showPerCharacterChatHistory);
  setChecked("showQuickNewChatButton", !!settings.showQuickNewChatButton);

  setChecked("enableBulkMemoryManager", !!settings.enableBulkMemoryManager);
  setChecked("enableMemoryVault", !!settings.enableMemoryVault);
  setChecked("showCopyMemoryAction", !!settings.showCopyMemoryAction);
  setChecked("memoryAutoLoadAll", !!settings.memoryAutoLoadAll);

  setValue("deeplApiKey", String(result[DEEPL_API_KEY] || ""));
  setValue("libreTranslateApiKey", String(result[LIBRE_TRANSLATE_KEY] || ""));
  const deeplStatus = $("deeplStatus");
  if (deeplStatus) deeplStatus.textContent = result[DEEPL_API_KEY] ? "DeepL API key saved. Test it before relying on auto translate." : "DeepL is not configured yet.";

  setChecked("showChatListTools", settings.showChatListTools);
  setChecked("enableChatOrganizer", !!settings.enableChatOrganizer);
  setChecked("chatAlwaysShowProfileLink", !!settings.chatAlwaysShowProfileLink);
  setChecked("chatJumpToStartShortcut", !!settings.chatJumpToStartShortcut);
  setChecked("chatOpenWindowShortcut", !!settings.chatOpenWindowShortcut);
  setChecked("chatGenerationSettingsShortcut", !!settings.chatGenerationSettingsShortcut);
  setValue("chatCollections", settings.chatCollections || "");
  setChecked("showSavedChatQuickActions", !!settings.showSavedChatQuickActions);





  setValue("chatListSortMode", settings.chatListSortMode || "default");
  setValue("chatListOpenedFilter", ["all", "opened", "unopened"].includes(settings.chatListOpenedFilter) ? settings.chatListOpenedFilter : "all");
  setValue("chatListMessageFilter", ["all", "0", "1-9", "10-49", "50-99", "100-499", "500+", "unknown"].includes(settings.chatListMessageFilter) ? settings.chatListMessageFilter : "all");
  setValue("chatListSavedFilter", ["all", "favorite", "later", "both", "saved", "neither"].includes(settings.chatListSavedFilter) ? settings.chatListSavedFilter : "all");
  setValue("chatListBlockedFilter", ["all", "blocked", "unblocked"].includes(settings.chatListBlockedFilter) ? settings.chatListBlockedFilter : "all");

  setChecked("trackOpenedChats", settings.trackOpenedChats);
  setValue("lorebookStatusScanSpeed", Object.prototype.hasOwnProperty.call(LOREBOOK_STATUS_SCAN_SPEED_DELAYS, settings.lorebookStatusScanSpeed) ? settings.lorebookStatusScanSpeed : "safe");
  setValue("lorebookStatusStaleDays", [1, 7, 14, 30].includes(Number(settings.lorebookStatusStaleDays)) ? String(Number(settings.lorebookStatusStaleDays)) : "7");
  setChecked("importOpenedFromChatsPage", settings.importOpenedFromChatsPage);
  setChecked("hideOpenedChats", settings.hideOpenedChats);
  setValue("openedBotSortMode", settings.openedBotSortMode || "newest");





  setChecked("popupShowOpenedCount", !!settings.popupShowOpenedCount);
  setChecked("popupShowBlockedCount", !!settings.popupShowBlockedCount);
  setChecked("popupShowStorageDetails", !!settings.popupShowStorageDetails);









  setChecked("enableChatIndex", settings.enableChatIndex === true);
  setChecked("chatIndexEnhanceNativeSearch", settings.chatIndexEnhanceNativeSearch === true);
  setChecked("chatIndexStandaloneLauncher", settings.chatIndexStandaloneLauncher === true);







  setChecked("showAutoImageInlineButton", settings.showAutoImageInlineButton === true);

  setChecked("compactAfterHiding", settings.compactAfterHiding);
  setChecked("neverHideFavorites", !!settings.neverHideFavorites);
  setChecked("protectFavoritesFromBlocking", !!settings.protectFavoritesFromBlocking);
  setChecked("showCreatorFavoriteButtons", !!settings.showCreatorFavoriteButtons);
  setChecked("showCreatorFavoriteButtonsOnMyChatbots", !!settings.showCreatorFavoriteButtonsOnMyChatbots);
  setChecked("protectFavoriteCreatorsFromFiltering", !!settings.protectFavoriteCreatorsFromFiltering);
  setChecked("showFollowCreatorButtons", !!settings.showFollowCreatorButtons);
  setChecked("enableCreatorBotNotifications", !!settings.enableCreatorBotNotifications);
  setValue("creatorBotCheckMinutes", String(CREATOR_BOT_WATCH_INTERVALS.includes(Number(settings.creatorBotCheckMinutes)) ? Number(settings.creatorBotCheckMinutes) : 60));
  setChecked("creatorBotBrowserNotifications", !!settings.creatorBotBrowserNotifications);
  setChecked("creatorBotDiscordWebhookEnabled", !!creatorBotWebhookState.enabled);
  setValue("creatorBotDiscordWebhookUrl", creatorBotWebhookState.url || "");
  setChecked("trackFavoriteBots", !!settings.trackFavoriteBots);
  setChecked("showFavoritesBulkSelect", settings.showFavoritesBulkSelect !== false);
  setChecked("showFavoritesScanButton", settings.showFavoritesScanButton !== false);
  setChecked("showFavoriteHistoryButton", !!settings.showFavoriteHistoryButton);
  setChecked("enableFavoritesRecovery", !!settings.enableFavoritesRecovery);
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


  setChecked("favoritePageFoldersEnabled", !!settings.favoritePageFoldersEnabled);
  setChecked("favoritePageSortEnabled", !!settings.favoritePageSortEnabled);
  setChecked("lorebookUnknownSafeFilter", !!settings.lorebookUnknownSafeFilter);

  setChecked("hideHomeForYouCards", settings.hideHomeForYouCards);
  setChecked("expandLongCardDescriptions", settings.expandLongCardDescriptions);
  setChecked("showCardGreetingTokenInfo", !!settings.showCardGreetingTokenInfo);
  setChecked("showExactMessageCounts", !!settings.showExactMessageCounts);
  setChecked("showBotCreationDates", !!settings.showBotCreationDates);
  setChecked("showNewBotBadge", !!settings.showNewBotBadge);
  setChecked("expandBotNamesOnHover", !!settings.expandBotNamesOnHover);


  setChecked("cardTokenShowGreeting", settings.cardTokenShowGreeting !== false);
  setChecked("cardTokenShowPersonality", !!settings.cardTokenShowPersonality);
  setChecked("cardTokenShowScenario", !!settings.cardTokenShowScenario);
  setChecked("cardTokenShowExamples", !!settings.cardTokenShowExamples);


  setChecked("showListingRefillButton", !!settings.showListingRefillButton);
  setChecked("showListingFilterStats", !!settings.showListingFilterStats);
  setChecked("showListingFilterStatsDetails", !!settings.showListingFilterStatsDetails);


  setChecked("hideChatPlusButton", settings.hideChatPlusButton);
  setChecked("hideChatImageButton", settings.hideChatImageButton);
  setChecked("replaceChatImageWithOocButton", !!settings.replaceChatImageWithOocButton);
  setChecked("showAsteriskButton", !!settings.showAsteriskButton);
  setValue("composerShortcutPlacement", ["inside-right", "outside-left", "outside-right"].includes(settings.composerShortcutPlacement) ? settings.composerShortcutPlacement : "inside-right");
  setValue("chatEnterKeyBehavior", ["site-default", "send", "newline"].includes(settings.chatEnterKeyBehavior) ? settings.chatEnterKeyBehavior : "site-default");
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
  setChecked("enableCustomCharacterPictures", !!settings.enableCustomCharacterPictures);
  setChecked("enableCustomPersonaPictures", !!settings.enableCustomPersonaPictures);
  setChecked("enableCustomPictureLibrary", !!settings.enableCustomPictureLibrary);
  setChecked("enableChatBackgrounds", !!settings.enableChatBackgrounds);
  setChecked("chatSceneGalleriesEnabled", !!settings.chatSceneGalleriesEnabled);
  setChecked("chatBackgroundUseAvatar", !!settings.chatBackgroundUseAvatar);
  setChecked("chatBackgroundAnimateAvatar", !!settings.chatBackgroundAnimateAvatar);
  setValue("chatBackgroundBubbleOpacity", String(settings.chatBackgroundBubbleOpacity ?? 100));
  setValue("chatBackgroundDim", String(settings.chatBackgroundDim ?? 45));
  setValue("chatBackgroundBlur", String(settings.chatBackgroundBlur ?? 0));
  setValue("chatBackgroundFit", settings.chatBackgroundFit || "cover");
  setValue("chatBackgroundPosition", settings.chatBackgroundPosition || "center");








































  updateAppearanceColorControlStates();
  updateMessageQuickActionControlStates();
  setChecked("hideChatVoiceButton", settings.hideChatVoiceButton);
  setChecked("hideUnlockCustomVoices", settings.hideUnlockCustomVoices);


  setValue("rpStateTrackerMode", ["manual", "conservative", "assisted"].includes(settings.rpStateTrackerMode) ? settings.rpStateTrackerMode : "conservative");
  setValue("rpStateInjectMode", ["manual", "changed", "every"].includes(settings.rpStateInjectMode) ? settings.rpStateInjectMode : "changed");
  setValue("rpStateMaxContextChars", String(Math.max(300, Math.min(3000, Number(settings.rpStateMaxContextChars) || 1200))));
  setChecked("rpStateShowQuickPanel", settings.rpStateShowQuickPanel === true);

  renderChatNudgeManager(result[CHAT_NUDGE_STORE_KEY]);
  refreshChatNudgePermissionStatus();
  if ($("soundscapesCard") && typeof armLazySoundscapeManager === "function") armLazySoundscapeManager();

  updateMessageQuickActionControlStates();
  setChecked("allowTypingWhileAiResponding", !!settings.allowTypingWhileAiResponding);
  setChecked("keepChatPositionWhileTyping", !!settings.keepChatPositionWhileTyping);

  setValue("botStatusArchiveEndpoint", normalizeArchiveImportEndpoint(result[ARCHIVE_IMPORT_ENDPOINT_KEY] || DEFAULT_ARCHIVE_IMPORT_ENDPOINT) || DEFAULT_ARCHIVE_IMPORT_ENDPOINT);
  setValue("botStatusArchiveToken", String(result[ARCHIVE_IMPORT_TOKEN_KEY] || ""));
  setChecked("enableBotStatusArchiveContribution", result[ARCHIVE_CONTRIBUTION_ENABLED_KEY] === true);
  setChecked("protectDraftDuringMessageRemoval", !!settings.protectDraftDuringMessageRemoval);
  setChecked("failedMessageHelper", !!settings.failedMessageHelper);
  setChecked("autoRetryFailedMessageSends", !!settings.autoRetryFailedMessageSends);
  setChecked("chatPerformanceMode", !!settings.chatPerformanceMode);
  setValue("runtimePerformanceMode", ["normal", "adaptive", "aggressive", "maximum"].includes(settings.runtimePerformanceMode) ? settings.runtimePerformanceMode : "adaptive");
  setChecked("desktopAppPerformanceGuard", settings.desktopAppPerformanceGuard !== false);
  setChecked("pauseQolInHiddenTabs", !!settings.pauseQolInHiddenTabs);
  setChecked("autoPerformanceLargeChats", !!settings.autoPerformanceLargeChats);
  setValue("largeChatPerformanceThreshold", Math.max(100, Math.min(5000, Number(settings.largeChatPerformanceThreshold) || 300)));
  setChecked("deferQolWhileTyping", !!settings.deferQolWhileTyping);
  setChecked("pauseQolWhileMessageEditing", settings.pauseQolWhileMessageEditing !== false);
  setChecked("reduceQolAnimations", !!settings.reduceQolAnimations);
  setChecked("reduceOptionsAnimations", !!settings.reduceOptionsAnimations);
  setValue("settingsNavigationStyle", ["classic", "grouped"].includes(settings.settingsNavigationStyle) ? settings.settingsNavigationStyle : "classic");
  setValue("settingsContentLayout", ["single", "adaptive"].includes(settings.settingsContentLayout) ? settings.settingsContentLayout : "single");
  setValue("settingsPageWidth", ["comfortable", "wide"].includes(settings.settingsPageWidth) ? settings.settingsPageWidth : "comfortable");
  applyOptionsLayoutPreferences(settings);
  setChecked("collapseSettingsSectionsByDefault", !!settings.collapseSettingsSectionsByDefault);

  setChecked("deepSleepDisabledFeatures", true);
  setChecked("performanceDiagnostics", !!settings.performanceDiagnostics);
  setChecked("enableLocalChangeHistory", !!settings.enableLocalChangeHistory);
  setChecked("showUpdateNotifications", !!settings.showUpdateNotifications);











  setChecked("chatExportLoadPreviousMessages", !!settings.chatExportLoadPreviousMessages);



  setValue("chatExportHistoryMode", settings.chatExportHistoryMode || "api");

  setChecked("showOocTools", settings.showOocTools);
  renderOocTemplates(settings.oocTemplates);

  setChecked("savePersonasFromPages", settings.savePersonasFromPages);
  setChecked("personaFullBackupEnabled", !!settings.personaFullBackupEnabled);
  setChecked("keepLocalPersonaCopies", !!settings.keepLocalPersonaCopies);
  setChecked("expandPersonaDescriptions", !!settings.expandPersonaDescriptions);
  setChecked("enablePersonaOrganizer", !!settings.enablePersonaOrganizer);
  setValue("personaFolders", settings.personaFolders || "");
  setChecked("personaShowLocalMetaInPicker", settings.personaShowLocalMetaInPicker !== false);
  setChecked("showPersonaQuickSwitch", !!settings.showPersonaQuickSwitch);
  setChecked("autoAcceptPersonaChange", settings.autoAcceptPersonaChange);
  setValue("personaQuickSwitchLimit", String(settings.personaQuickSwitchLimit || 6));

  [
    "enableMainFooterManagement", "hideMainFooterEntirely", "hideMainFooterCompany",
    "hideMainFooterResources", "hideMainFooterCommunity", "hideMainFooterJoinUs",
    "hideMainFooterAppDownload", "hideMainFooter2257"
  ].forEach(key => setChecked(key, !!settings[key]));

  setChecked("blockCards", settings.blockCards);
  setChecked("autoBlockWordMatches", !!settings.autoBlockWordMatches);
  setChecked("autoBlockTagMatches", !!settings.autoBlockTagMatches);
  setChecked("hideGroupChats", settings.hideGroupChats);
  setChecked("publicPersonalityOnly", !!settings.publicPersonalityOnly);
  setChecked("showLorebookFilters", !!settings.showLorebookFilters);
  setChecked("showRulebookFilters", !!settings.showRulebookFilters);

  setChecked("enableMyCreationsBulkBackup", !!settings.enableMyCreationsBulkBackup);
  setChecked("enableAccountMigrationAssistant", !!settings.enableAccountMigrationAssistant);
  setChecked("showMyLorebookEditButtons", !!settings.showMyLorebookEditButtons);
  setChecked("showMyChatbotEditButtons", !!settings.showMyChatbotEditButtons);



  setChecked("showQuickUnblockButtons", !!settings.showQuickUnblockButtons);
  setChecked("reduceAnimatedBotImages", !!settings.reduceAnimatedBotImages);
  setValue("animatedImageMode", "hover");
  setChecked("animatedImagesListings", !!settings.animatedImagesListings);
  setChecked("animatedImagesChats", !!settings.animatedImagesChats);
  setChecked("animatedImagesProfiles", !!settings.animatedImagesProfiles);
  setChecked("animatedImagesChatMedia", !!settings.animatedImagesChatMedia);
  setChecked("replaceCardProfileWithBlockButton", settings.replaceCardProfileWithBlockButton);

  setChecked("enableBulkCardBlocking", !!settings.enableBulkCardBlocking);
  setChecked("bulkCardBlockingSidebarLauncher", !!settings.bulkCardBlockingSidebarLauncher);
  setChecked("quickDislikeOnBlock", settings.quickDislikeIdleEnabled === true);
  setValue("quickDislikeIdleMinutes", Math.min(60, Math.max(1, Number(settings.quickDislikeIdleMinutes) || 5)));
  setValue("blockedBulkDislikeDelayMs", Math.min(10000, Math.max(250, Number(settings.blockedBulkDislikeDelayMs) || 750)));

  setAllowedLanguages(settings.allowedLanguages);

  setChecked("textNormalizationEnabled", !!settings.textNormalizationEnabled);
  setChecked("normalizeFancyUnicode", !!settings.normalizeFancyUnicode);
  setChecked("normalizePunctuation", !!settings.normalizePunctuation);
  setChecked("normalizeInvisibleCharacters", !!settings.normalizeInvisibleCharacters);
  setChecked("normalizeDecorativeSymbols", settings.normalizeDecorativeSymbols);
  updateTextNormalizationPreview();
  setValue("blockedTags", arrayToLines(settings.blockedTags));
  setValue("blockedWords", arrayToLines(settings.blockedWords));
  setValue("blockedCreators", arrayToLines(settings.blockedCreators));
  setChecked("lorebookBlockingEnabled", settings.lorebookBlockingEnabled === true);
  setChecked("applyBotBlockingToLorebooks", settings.applyBotBlockingToLorebooks === true);
  setChecked("showLorebookBlockButtons", settings.showLorebookBlockButtons === true);
  setChecked("lorebookTrackHistory", settings.lorebookTrackHistory === true);
  setChecked("showLorebookConnections", settings.showLorebookConnections === true);
  setValue("lorebookBlockedIds", arrayToLines(settings.lorebookBlockedIds));
  setValue("blockedBotSortMode", settings.blockedBotSortMode || "newest");
  setValue("hiddenCardMode", settings.hiddenCardMode || "hide");

  setChecked("enablePersonalUsageSummary", !!settings.enablePersonalUsageSummary);
  setChecked("debug", settings.debug);

  if ($("openedCount")) $("openedCount").textContent = savedListsDataLoaded ? `${currentOpened.length} stored` : "loads with Saved Lists";
  if ($("personaCount")) $("personaCount").textContent = `${currentPersonas.length} stored`;

  optionsDataLoaded = true;
  // Load controls owned by installed feature panels; omitted panels have no handlers.
  for (const loadFeatureSetting of Object.values(window.__DSQ_FEATURE_SETTINGS_LOADERS__ || {})) {
    loadFeatureSetting(settings);
  }
  settingsAutosaveReady = true;
  initializeMaximumPerformancePreset();
  updateBlockedBulkResumeControls();
  updateSettingDependencies();
  refreshPlatformCompatibilityUi(settings);
  DS_FEATURE_INDEX_REFRESH?.();
  await applyPendingOptionsNavigation(result[PENDING_OPTIONS_NAV_KEY]);
  const activeTab = activeOptionsTab();
  renderHeavyManagersForTab(activeTab);
  if (activeTab === "data") {
    refreshStorageUsage().catch(() => {});
    renderLocalChangeHistory().catch(() => {});
    refreshRecoverySnapshotStatus().catch(() => {});
    initializeExportScopeSelection().catch(() => {});
  }
  if (activeTab === "browser") {
    renderTabCleanupSessions().catch(() => {});
    loadTabCleanupTopics().catch(() => {});
  }
  if (activeTab === "control") setupControlCenterView().catch(() => {});
  if (activeTab === "account") refreshAccountSyncUi().catch(() => {});
  if (activeTab === "changelog") loadChangelog();
  renderMiniPanelPreview();
  applyFeatureChangeBadges(String(result[LAST_SEEN_VERSION_KEY] || ""));
  applySettingsSectionDefault(settings);
  applySettingsEnabledOnlyFilter();
  refreshSettingsSectionShortcuts();

  dirtySavedStores.clear();
  setAutosaveStatus("Saved automatically", "saved");
  if (loadStarted && typeof performance !== "undefined") OPTIONS_PERFORMANCE.loadMs = Math.max(0, performance.now() - loadStarted);
  showFirstRunSetupDialog().catch(() => {});
}
