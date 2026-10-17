// Shared feature transition/cleanup coordinator for Full and future Custom builds.
// This runtime owns no timers, observers or global listeners of its own.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const active = new Map();
  const stopping = new Set();
  const disabled = new Set();

  // Only attach an automatic stop hook when the feature has an explicit,
  // existing idempotent cleanup. Other features keep their existing guards.
  const stopActions = Object.freeze({
    "OOC": () => DS.removeOocTools?.(),
    "chat search": () => DS.removeChatSearch?.(),
    "chat bookmarks": () => DS.removeChatBookmarks?.(),
    "chat backgrounds": () => DS.removeChatBackgrounds?.(),
    "rulebook diagnostics": () => DS.removeRulebookDiagnostics?.(),
    "focus mode": () => DS.removeFocusMode?.(),
    "chat nudges": () => DS.removeChatNudges?.(),
    "context keeper": () => DS.removeContextKeeper?.(),
    "reply instructions": () => DS.removeReplyInstructions?.(),
    "lorebook consistency": () => DS.removeLorebookConsistency?.(),
    "translation": () => DS.removeTranslationTools?.(),
    "generation profiles": () => DS.removeGenerationProfileTools?.(),
    "generation metadata": () => DS.removeGenerationMetadata?.(),
    "bot organizer": () => DS.removeBotOrganizer?.(),
    "bot organizer settled": () => DS.removeBotOrganizer?.(),
    "bot organizer context": () => DS.removeBotOrganizer?.(),
    "smart filter presets": () => DS.removeSmartFilterPresets?.(),
    "lorebook search filter": () => DS.removeLorebookSearchFilter?.(),
    "rulebook listing tools": () => DS.removeRulebookListingTools?.(),
    "lorebook listing tools": () => DS.removeLorebookListingTools?.(),
    "creation audit": () => DS.removeCreationAudit?.(),
    "my creations filters": () => DS.removeMyCreationsFilters?.(),
    "my creations view memory": () => DS.removeMyCreationsViewMemory?.(),
    "my creations backup": () => DS.removeMyCreationsBackupTools?.(),
    "bot editor save actions": () => DS.removeBotEditorSaveActions?.(),
    "bot editor snippets": () => DS.removeBotEditorSnippetTools?.(),
    "bot editor draft history": () => DS.removeBotEditorDraftHistory?.(),
    "bot editor backup": () => DS.removeBotBackupTools?.(),
    "creation bulk input tools": () => DS.removeCreationBulkInputTools?.(),
    "creator writing assistant": () => DS.removeCreatorWritingAssistant?.(),
    "creator moderation warnings": () => DS.removeCreatorModerationWarnings?.(),
    "card workflow": () => DS.removeCardWorkflow?.(),
    "recommendation helpers": () => DS.removeRecommendationHelpers?.(),
    "chat bubbles": () => DS.removeChatBubbleCustomization?.(),
    "formatting toolbar": () => DS.removeFormattingToolbar?.(),
    "alternate dialogue": () => DS.removeAlternateDialogueStyling?.(),
    "RP format repair": () => DS.removeRpFormatRepair?.(),
    "Android app controls": () => DS.removeAndroidAppControls?.(),
    "animation controls": () => DS.removeAnimationControls?.(),
    "soundscapes": () => DS.removeSoundscapes?.(),
    "scroll to top": () => DS.removeScrollToTopButton?.(),
    "selection remember": () => DS.removeSelectionRemember?.(),
    "profile export": () => DS.removeProfileExport?.(),
    "persona organizer": () => DS.removePersonaOrganizer?.(),
    "saved chat actions": () => DS.applySavedChatQuickActions?.(),
    "model selector": () => DS.removeModelSelectorQuickMenu?.(),
    "card greeting token info": () => DS.removeCardGreetingTokenInfo?.(),
    "later buttons": () => DS.removeLaterBotButtons?.(),
    "creator favorite buttons": () => DS.removeCreatorFavoriteButtons?.(),
    "creator follow buttons": () => DS.removeCreatorFollowButtons?.(),
    "listing name sort": () => DS.removeListingSortTools?.(),
    "listing refill": () => DS.removeListingRefillButton?.(),
    "main footer": () => DS.removeMainFooterManagement?.(),
    "public lorebook blocking/history": () => DS.applyPublicLorebookQoL?.(),
  });

  function markActive(name, group = "core") {
    const key = String(name || "");
    if (!key) return;
    active.set(key, String(group || "core"));
    disabled.delete(key);
  }

  async function stop(name, reason = "disabled") {
    const key = String(name || "");
    if (!active.has(key) || stopping.has(key)) return false;
    active.delete(key);
    disabled.add(key);
    const cleanup = stopActions[key];
    if (!cleanup) return false;
    stopping.add(key);
    try {
      await cleanup();
      const stats = DS.state?.runtimePerformance;
      if (stats) stats.featureLifecycleStops = (stats.featureLifecycleStops || 0) + 1;
    } catch (error) {
      DS.runtimeLog?.("warn", "feature-lifecycle", `Cleanup failed for ${key} (${reason})`, error);
    } finally {
      stopping.delete(key);
    }
    return true;
  }

  async function reconcileRoute(plan, canRunGroup) {
    if (typeof canRunGroup !== "function") return;
    for (const [name, group] of [...active.entries()]) {
      if (group === "core" || group === "global") continue;
      if (!canRunGroup(plan, group)) await stop(name, "route-change");
    }
  }

  async function reconcileSettings(changedKeys, settings = {}) {
    if (!changedKeys?.size) return;
    if (settings?.enabled === false) return; // Full disable has the ordered shutdown.
    // These are explicit setting-to-feature mappings. Do not infer teardown
    // from similarly named settings or clear the user's persistent values.
    const keyed = {
      "OOC": ["showOocTools", "replaceChatImageWithOocButton", "quickPanelShowOoc"],
      "chat backgrounds": ["enableChatBackgrounds", "enableCustomCharacterPictures", "enableCustomPersonaPictures"],
      "rulebook diagnostics": ["enableRulebookDiagnostics"],
      "focus mode": ["enableFocusMode"],
      "chat bookmarks": ["enableMessageBookmarks"],
      "chat search": ["showChatSearch"],
      "chat nudges": ["enableChatNudges"],
      "soundscapes": ["enableSoundscapes"],
      "bot organizer": ["enableBotOrganizer"],
      "bot organizer settled": ["enableBotOrganizer"],
      "bot organizer context": ["enableBotOrganizer"],
      "smart filter presets": ["enableSmartFilterPresets"],
      "my creations view memory": ["rememberMyCreationsView"],
      "creation audit": ["enableCreationAudit"],
      "creator writing assistant": ["enableCreatorWritingAssistant"],
      "persona organizer": ["enablePersonaOrganizer"],
      "rulebook listing tools": ["showRulebookFilters"],
      "lorebook listing tools": ["showLorebookFilters"],
      "lorebook search filter": ["showLorebookFilters"],
    };
    for (const [name, keys] of Object.entries(keyed)) {
      if (!keys.some(key => changedKeys.has(key))) continue;
      if (keys.some(key => !!settings[key])) continue;
      await stop(name, "settings-change");
    }
  }

  async function shutdownAll({ runStep, syncNativeScrollBackToTopVisibility } = {}) {
    if (DS.state.disabledCleanupDone) return;
    DS.state.disabledCleanupDone = true;
    if (typeof runStep !== "function") throw Error("Feature shutdown requires main scheduler runner");

    await runStep("remove disabled panel", () => DS.removeQuickPanelIfDisabled?.());
    await runStep("accessibility cleanup", () => DS.applyAccessibilitySettings?.());
    syncNativeScrollBackToTopVisibility();
    await runStep("scroll to top cleanup", () => DS.removeScrollToTopButton?.());
    await runStep("soundscape cleanup", () => DS.removeSoundscapes?.());
    await runStep("chat background cleanup", () => DS.removeChatBackgrounds?.());
    await runStep("rulebook diagnostics cleanup", () => DS.removeRulebookDiagnostics?.());
    await runStep("unhide disabled cleanup", () => DS.unhideAllDragonScriptElements?.());
    await runStep("card hide watchdog cleanup", () => DS.removeCardHideSafetyWatchdog?.());
    await runStep("top bar native restore", () => DS.applyTopBarCleanup?.());
    await runStep("sidebar native restore", () => DS.applySidebarCleanup?.());
    await runStep("main footer native restore", () => DS.removeMainFooterManagement?.());
    await runStep("listing refill button cleanup", () => DS.removeListingRefillButton?.());
    await runStep("listing sort cleanup", () => DS.removeListingSortTools?.());
    await runStep("card description native restore", () => DS.applyCardDescriptionExpansion?.());
    await runStep("remove creator buttons", () => DS.removeCreatorFavoriteButtons?.());
    await runStep("remove creator follow buttons", () => DS.removeCreatorFollowButtons?.());
    await runStep("remove favorite history", () => DS.removeFavoriteHistoryButton?.());
    await runStep("remove later buttons", () => DS.removeLaterBotButtons?.());
    await runStep("remove tag template button", () => {
      (DS.qsa?.(".ds-tag-template-button") || []).forEach(button => button.remove());
    });
    await runStep("remove bot editor snippets", () => DS.removeBotEditorSnippetTools?.());
    await runStep("remove bot editor save actions", () => DS.removeBotEditorSaveActions?.());
    await runStep("remove bot editor draft history", () => DS.removeBotEditorDraftHistory?.());
    await runStep("remove bot editor local memory", () => DS.removeBotEditorLocalMemory?.());
    await runStep("remove bot backup tools", () => DS.removeBotBackupTools?.());
    await runStep("remove lorebook backup tools", () => DS.removeLorebookBackup?.());
    await runStep("remove creation bulk input tools", () => DS.removeCreationBulkInputTools?.());
    await runStep("remove card greeting token info", () => DS.removeCardGreetingTokenInfo?.());
    await runStep("remove generation profiles", () => DS.removeGenerationProfileTools?.());
    await runStep("remove generation metadata", () => DS.removeGenerationMetadata?.());
    await runStep("remove model quick menu", () => DS.removeModelSelectorQuickMenu?.());
    await runStep("chat top bar cleanup", () => DS.applyChatTopBarTools?.());
    await runStep("chat UI cleanup", () => DS.applyChatUiCleanup?.());
    await runStep("chat search cleanup", () => DS.removeChatSearch?.());
    await runStep("chat bookmarks cleanup", () => DS.removeChatBookmarks?.());
    await runStep("focus mode cleanup", () => DS.removeFocusMode?.());
    await runStep("context keeper cleanup", () => DS.removeContextKeeper?.());
    await runStep("lorebook consistency cleanup", () => DS.removeLorebookConsistency?.());
    await runStep("reply instructions cleanup", () => DS.removeReplyInstructions?.());
    await runStep("chat nudges cleanup", () => DS.removeChatNudges?.());
    await runStep("selection remember cleanup", () => DS.removeSelectionRemember?.());
    await runStep("composer cleanup", () => DS.applyComposerControl?.());
    await runStep("message removal cleanup", () => DS.applyMessageRemovalGuard?.());
    await runStep("failed helper cleanup", () => DS.applyFailedMessageHelper?.());
    await runStep("message options cleanup", () => DS.applyMessageOptions?.());
    await runStep("auto voice cleanup", () => DS.applyAutoVoice?.());
    await runStep("saved chat actions cleanup", () => DS.applySavedChatQuickActions?.());
    await runStep("memory manager cleanup", () => DS.applyMemoryManagerTools?.());
    await runStep("chat text replacements cleanup", () => DS.removeChatTextReplacements?.());
    await runStep("translation cleanup", () => DS.removeTranslationTools?.());
    await runStep("moderation warning cleanup", () => DS.removeCreatorModerationWarnings?.());
    await runStep("persona page cleanup", () => DS.applyPersonaPageTools?.());
    await runStep("persona organizer cleanup", () => DS.removePersonaOrganizer?.());
    await runStep("lorebook listing cleanup", () => DS.removeLorebookListingTools?.());
    await runStep("rulebook listing cleanup", () => DS.removeRulebookListingTools?.());
    await runStep("lorebook search filter cleanup", () => DS.removeLorebookSearchFilter?.());
    await runStep("smart filter cleanup", () => DS.removeSmartFilterPresets?.());
    await runStep("creation audit cleanup", () => DS.removeCreationAudit?.());
    await runStep("my creations filter cleanup", () => DS.removeMyCreationsFilters?.());
    await runStep("my creations backup cleanup", () => DS.removeMyCreationsBackupTools?.());
    await runStep("recommendation helper cleanup", () => DS.removeRecommendationHelpers?.());
    await runStep("bot organizer cleanup", () => DS.removeBotOrganizer?.());
    await runStep("card workflow cleanup", () => DS.removeCardWorkflow?.());
    await runStep("formatting toolbar cleanup", () => DS.removeFormattingToolbar?.());
    await runStep("alternate dialogue cleanup", () => DS.removeAlternateDialogueStyling?.());
    await runStep("RP format cleanup", () => DS.removeRpFormatRepair?.());
    await runStep("chat bubble cleanup", () => DS.removeChatBubbleCustomization?.());
    await runStep("Android app cleanup", () => DS.removeAndroidAppControls?.());
    await runStep("animation cleanup", () => DS.removeAnimationControls?.());
    await runStep("lorebook entry cleanup", () => DS.applyLorebookEntryExpanders?.());
    await runStep("performance cleanup", () => DS.applyPerformanceMode?.());
    await runStep("update panel", () => DS.updateQuickPanel?.());
    await runStep("OOC cleanup", () => DS.removeOocTools?.());
    active.clear();
    disabled.clear();
  }

  DS.featureLifecycle = Object.freeze({
    markActive, stop, reconcileRoute, reconcileSettings, shutdownAll,
    activeFeatures: () => [...active.keys()],
    hasCleanup: name => Object.prototype.hasOwnProperty.call(stopActions, String(name || ""))
  });
})();
}
