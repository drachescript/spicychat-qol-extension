// Final Options event wiring and startup. Shared config/state load immediately before this script.
// Fail clearly if a partial update left a Settings module missing.
const missingOptionsControllerModules = [
  ["settings/options-runtime-state.js", typeof OPTIONS_PERFORMANCE !== "undefined" && typeof loadedSettingsSnapshot !== "undefined"],
  ["settings/options-feature-presets.js", typeof PRESET_VALUES !== "undefined" && typeof OPTIONAL_FEATURE_KEYS !== "undefined"],
  ["settings/options-bot-metadata.js", typeof BOT_ID_RE !== "undefined" && typeof BOT_SNAPSHOT_FIELDS !== "undefined"],
  ["settings/options-saved-managers-state.js", typeof BOT_STATUS_ARCHIVE_EXPORT_SCHEMA !== "undefined" && typeof savedBotsHubUiState !== "undefined"],
  ["settings/options-chat-bubble-config.js", typeof CHAT_BUBBLE_TEXT_DEFAULTS !== "undefined" && typeof CHAT_BUBBLE_PRESETS !== "undefined"],
  ["settings/options-backup-schema.js", typeof BACKUP_STORAGE_KEYS !== "undefined" && typeof SETTINGS_BACKUP_GROUPS !== "undefined"],
  ["settings/options-ui-config.js", typeof STORAGE_DATASET_DEFS !== "undefined" && typeof CHAT_BUBBLE_FIELD_IDS !== "undefined"]
].filter(([, ready]) => !ready).map(([name]) => name);
if (missingOptionsControllerModules.length) {
  const message = `QoL Settings is missing required file(s): ${missingOptionsControllerModules.join(", ")}. Extract the complete update and reopen Settings.`;
  const notice = document.createElement("p");
  notice.setAttribute("role", "alert");
  notice.textContent = message;
  notice.style.cssText = "color:#ffb4a9;font-weight:600;max-width:80ch";
  (document.querySelector("main > header") || document.body)?.append(notice);
  throw new Error(message);
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


$("chatBackgroundGlobalUpload")?.addEventListener("change", async event => { await importGlobalChatBackground(event.target.files); event.target.value = ""; });
$("useGlobalChatBackgroundUrl")?.addEventListener("click", () => importGlobalChatBackgroundUrl());
$("refreshGlobalChatBackgroundUrl")?.addEventListener("click", () => importGlobalChatBackgroundUrl({ refresh: true }));
$("clearGlobalChatBackground")?.addEventListener("click", clearGlobalChatBackground);
$("clearPerChatBackgrounds")?.addEventListener("click", clearPerChatBackgrounds);
$("chatBackgroundFit")?.addEventListener("change", renderChatBackgroundOptions);
$("chatBackgroundPosition")?.addEventListener("change", renderChatBackgroundOptions);

$("clearOpened")?.addEventListener("click", clearOpened);
$("exportSettings")?.addEventListener("click", exportSettings);
$("selectActiveUsedExportScopes")?.addEventListener("click", () => selectActiveUsedExportScopes());
$("selectAllExportScopes")?.addEventListener("click", () => document.querySelectorAll("[data-export-scope]").forEach(input => { input.checked = true; }));
$("clearExportScopes")?.addEventListener("click", () => document.querySelectorAll("[data-export-scope]").forEach(input => { input.checked = false; }));
$("backupQuickPresets")?.addEventListener("click", event => {
  const preset = event.target?.closest?.("[data-backup-preset]")?.dataset?.backupPreset;
  const presets = {
    settings: SETTINGS_BACKUP_SCOPE_IDS,
    lists: ["blocked", "notInterested", "favoriteBots", "laterBots", "opened", "favoriteCreators", "followedCreators", "botOrganization", "chatOrganization"],
    creator: ["lorebookBackups", "lorebookStatus", "chatbotLorebookLinks", "botEditorDraftHistory", "botArchive", "characterQolProfiles", "personas", "personaOrganization"],
    pictures: ["localMedia"]
  };
  if (!Object.prototype.hasOwnProperty.call(presets, preset)) return;
  const wanted = new Set(presets[preset]);
  document.querySelectorAll("[data-export-scope]").forEach(input => { input.checked = wanted.has(input.dataset.exportScope); });
});
$("validateImport")?.addEventListener("click", validateImportBackup);
$("previewImport")?.addEventListener("click", previewImportSettings);
document.querySelectorAll("input[name='importMode']").forEach(input => input.addEventListener("change", refreshImportPreviewImpact));
$("selectAllImportScopes")?.addEventListener("click", () => { document.querySelectorAll("[data-import-scope]").forEach(input => { input.checked = true; }); refreshImportPreviewImpact(); });
$("clearImportScopes")?.addEventListener("click", () => { document.querySelectorAll("[data-import-scope]").forEach(input => { input.checked = false; }); refreshImportPreviewImpact(); });
$("importSettings")?.addEventListener("click", importSettings);
$("cancelImportPreview")?.addEventListener("click", cancelImportPreview);
$("activateRestoredSync")?.addEventListener("change", refreshImportPreviewImpact);
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
$("checkLocalStorageSizes")?.addEventListener("click", checkLocalStorageSizes);
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
$("dsSupportHistoryRefresh")?.addEventListener("click", refreshSavedSupportStatus);
$("dsSupportHistoryClear")?.addEventListener("click", clearSavedSupportHistory);
$("copyDiagnostics")?.addEventListener("click", copyDiagnostics);
$("downloadDiagnostics")?.addEventListener("click", downloadDiagnostics);
$("copyPerformanceReport")?.addEventListener("click", copyPerformanceReport);
$("refreshPerformanceTroubleshooter")?.addEventListener("click", refreshPerformanceTroubleshooter);
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
[
  "textNormalizationEnabled",
  "normalizeFancyUnicode",
  "normalizePunctuation",
  "normalizeInvisibleCharacters",
  "normalizeDecorativeSymbols",
  "normalizeEmojis",
  "textNormalizationPreviewInput"
].forEach(id => $(id)?.addEventListener("input", updateTextNormalizationPreview));
[
  "textNormalizationEnabled",
  "normalizeFancyUnicode",
  "normalizePunctuation",
  "normalizeInvisibleCharacters",
  "normalizeDecorativeSymbols",
  "normalizeEmojis"
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

  // IndexedDB recovery stores are lazily loaded. Do not normalize a very
  // large changed payload until the corresponding recovery UI is in use.
  if (changes[BOT_AVAILABILITY_KEY] && savedRecoveryDataLoaded) {
    botAvailabilityState = normalizeBotAvailability(changes[BOT_AVAILABILITY_KEY].newValue);
    savedRefreshKinds.add("availability");
  }

  if (changes[BOT_UNAVAILABLE_RECOVERY_KEY] && savedRecoveryDataLoaded) {
    botUnavailableRecoveryState = normalizeBotUnavailableRecovery(changes[BOT_UNAVAILABLE_RECOVERY_KEY].newValue);
    savedRefreshKinds.add("availability");
  }

  const backupSettings = ["botArchiveOnProfileVisit", "botBackupToolsEnabled", "botArchiveOwnEditorBackups", "lorebookBackupToolsEnabled", "lorebookBackupsEnabled"];
  const backupSettingsChanged = granularSettingChanges.some(([name]) => backupSettings.includes(name)) ||
    (!!changes.settings && backupSettings.some(name => changes.settings.oldValue?.[name] !== changes.settings.newValue?.[name]));
  if (changes[BOT_ARCHIVE_KEY] || changes[LOREBOOK_BACKUPS_KEY]) {
    creatorBackupManagerLoaded = false;
    if (activeOptionsTab() === "bot-tools") loadCreatorBackupManager({ force: true }).catch(() => {});
  } else if (backupSettingsChanged && creatorBackupManagerLoaded) {
    // Changes to the five backup switches update the existing snapshot; an
    // unrelated setting must not re-read thousands of saved bot copies.
    creatorBackupManagerState.settings = { ...DEFAULT_SETTINGS, ...(loadedSettingsSnapshot || {}) };
    if (activeOptionsTab() === "bot-tools") renderCreatorBackupManager();
  }

  if (changes[BOT_ARCHIVE_KEY] && savedRecoveryDataLoaded) {
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

// Favorites → Later uses only verified local writes here. Native Favorites
// are changed later, from the real SpicyChat page, never through an assumed API.
const FAVORITES_COMPLETE_SCAN_KEY = "dsFavoritesScanStateV1";
const FAVORITES_LATER_CLEANUP_KEY = "dsFavoritesLaterCleanupV1";
function laterFavoritesActionStatus(text) {
  const el = $("laterFavoriteActionStatus");
  if (el) el.textContent = text;
}
async function prepareLaterFavoritesCleanup({ moveAll = false } = {}) {
  const buttons = [$("laterMoveCurrentFavorites"), $("laterUnfavoriteOverlap")].filter(Boolean);
  buttons.forEach(button => button.disabled = true);
  try {
    const stored = await storageGet([FAVORITE_BOTS_KEY, LATER_BOTS_KEY, FAVORITES_COMPLETE_SCAN_KEY, FAVORITES_LATER_CLEANUP_KEY]);
    const scan = stored[FAVORITES_COMPLETE_SCAN_KEY];
    if (!scan?.lastCompleteAt || !scan?.count) throw Error("Run a complete Scan Favorites first.");
    const favorites = normalizeBotStore(stored[FAVORITE_BOTS_KEY]);
    const later = normalizeBotStore(stored[LATER_BOTS_KEY]);
    // New scans save the exact IDs. Older v0.2.63 complete scans had only
    // counts; retain compatibility with those already completed scans.
    const completeIds = Array.isArray(scan.ids) && scan.ids.length === scan.count
      ? scan.ids : (favorites.ids || []).filter(id => favorites.meta?.[id]?.favoriteMembership === 'current');
    if (!completeIds.length) throw Error("No confirmed current Favorites saved. Scan Favorites again.");
    if (!Array.isArray(scan.ids) && completeIds.length !== scan.count) {
      throw Error(`Favorite History has ${completeIds.length} current entries, but the complete scan reported ${scan.count}. Run Scan Favorites once more for an exact list.`);
    }
    const laterSet = new Set(later.ids || []);
    const targets = completeIds.filter(id => moveAll || laterSet.has(id));
    const missingFromLater = targets.filter(id => !laterSet.has(id));
    if (!targets.length) { laterFavoritesActionStatus("No current Favorites overlap Later."); return; }
    const intro = moveAll ? `Save ${missingFromLater.length} new bots to Later and prepare to unfavorite ${targets.length} scanned Favorites?` : `Prepare to unfavorite ${targets.length} scanned Favorites that are already in Later?`;
    const accountWarning = Number.isSafeInteger(scan.accountCount) && scan.accountCount > completeIds.length
      ? `\n\nNote: SpicyChat shows ${scan.accountCount} account Favorites, but only ${completeIds.length} were returned by the Chatbots listing. The ${scan.accountCount - completeIds.length} unlisted bots are NOT included or treated as removed.` : '';
    if (!window.confirm(`${intro}${accountWarning}\n\nNo SpicyChat favorites will be changed until you start the native cleanup on the Favorites page.`)) return;
    if (moveAll && missingFromLater.length) {
      // Don't overwrite existing Later dates, notes, or metadata.
      for (const id of missingFromLater) {
        const meta = favorites.meta?.[id] || {};
        later.ids.push(id);
        later.meta[id] = { ...meta, savedAt: Date.now() };
      }
      await storageSet({ [LATER_BOTS_KEY]: later });
      const verified = await storageGet([LATER_BOTS_KEY]);
      const savedIds = new Set(verified[LATER_BOTS_KEY]?.ids || []);
      if (targets.some(id => !savedIds.has(id))) throw Error("Could not verify every Later save. No unfavorite job was started.");
      laterBotState = normalizeBotStore(verified[LATER_BOTS_KEY]);
      renderBotManager("later");
    }
    const prior = stored[FAVORITES_LATER_CLEANUP_KEY];
    const stillActive = prior?.version === 1 && prior.ids?.length &&
      new Set([...(prior.confirmed || []), ...(prior.pending || []), ...(prior.skipped || [])]).size < prior.ids.length;
    if (stillActive && !window.confirm("Replace the existing unfinished Favorites cleanup queue? Previously confirmed removals stay in Favorite History.")) return;
    const job = { version: 1, ids: targets, confirmed: [], pending: [], skipped: [], createdAt: Date.now(), updatedAt: Date.now(), source: moveAll ? 'move-favorites-to-later' : 'later-overlap' };
    await storageSet({ [FAVORITES_LATER_CLEANUP_KEY]: job });
    const savedJob = await storageGet([FAVORITES_LATER_CLEANUP_KEY]);
    if (savedJob[FAVORITES_LATER_CLEANUP_KEY]?.ids?.length !== targets.length) throw Error("Could not verify cleanup queue. No favorites were changed.");
    laterFavoritesActionStatus(`${moveAll ? `Saved ${missingFromLater.length} new bots to Later. ` : ''}Prepared ${targets.length} native unfavorites. Open/refresh Favorites and press Unfavorite Later overlap. You can stop or resume it there.`);
  } catch (error) {
    laterFavoritesActionStatus(`Favorites → Later: ${error?.message || error}`);
  } finally { buttons.forEach(button => button.disabled = false); }
}
$("laterMoveCurrentFavorites")?.addEventListener("click", () => { void prepareLaterFavoritesCleanup({ moveAll: true }); });
$("laterUnfavoriteOverlap")?.addEventListener("click", () => { void prepareLaterFavoritesCleanup({ moveAll: false }); });

setupTabs();
setupMaximumPerformancePreset();
setupSettingsAutosave();


const aboutProjectIcon = document.querySelector('.about-project-icon');
if (aboutProjectIcon) {
  const handleAboutProjectIconError = () => {
    aboutProjectIcon.removeEventListener('error', handleAboutProjectIconError);
    aboutProjectIcon.src = 'icons/icon128.png';
  };
  aboutProjectIcon.addEventListener('error', handleAboutProjectIconError, { once: true });
}

load();

$("refreshPersonalUsage")?.addEventListener("click", refreshPersonalUsageSummary);

try { window.addEventListener("focus", () => refreshOptionsDiagnosticState(true).catch(() => {})); } catch {}
