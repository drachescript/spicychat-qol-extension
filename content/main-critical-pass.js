// Core runtime lane: critical. Keep scheduling state shared with main.js.
// The factory registers no observers, starts no timers, and processes no UI
// until the main scheduler invokes its exported pass.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainCriticalPass = (ctx) => {
    const { anySetting, botEditorRoute, cardBlockUiWanted, cardFilteringWanted, chatStartupQuietActive, chatStartupWarmupActive, chatStartupWarmupRemainingMs, chatTopBarWanted, chatUiWanted, composerWanted, deepSleepEnabled, discardedWakeSessionActive, isCardListingContext, lorebookEditorRoute, memoryManagerWanted, messageQuickActionsEnabled, rerunAfterMenuSettles, runDisabledCleanup, runDiscardedWakeEssentialChatPass, runFeatureStep, runPersonaPickerLowImpact, runRoutedFeatureStep, runSavedOpenedLane, runStep, runtimeCounters, runtimePlan, runtimeProfile, scheduleChatStartupQuietResume, shouldPauseHiddenTab, syncNativeScrollBackToTopVisibility, laneState } = ctx;
  DS.runCritical = async function runCritical() {
    if (DS.isQolPausedForTab?.()) return;
    const passToken = DS.isDiagnosticTraceActive?.("normal") ? DS.diagOperationStart?.("runtime", "critical-pass", {
      trigger: String(DS.state?.lastRunTrigger || "").slice(0, 120),
      parentOperationId: ""
    }) : null;
    if (laneState.criticalRunning) {
      if (passToken) DS.diagOperationEnd?.(passToken, { outcome: "coalesced" });
      laneState.criticalPending = true;
      return;
    }

    DS.state.diagCriticalOperationId = passToken?.id || "";
    laneState.criticalRunning = true;

    try {
      const settings = DS.state?.settings || {};

      await runStep("accessibility", () => DS.applyAccessibilitySettings?.());
      await runStep("chat width", () => DS.applyChatWidthSettings?.());

      if (DS.state.quickDislikeWorker) return;
      if (DS.state.bulkChatHistoryLoadActive) {
        DS.state.bulkChatHistoryLoadNeedsRefresh = true;
        return;
      }

      if (!settings.enabled) {
        await runDisabledCleanup();
        return;
      }

      // The chat-start/change-persona modal is a transient native surface.
      // While it is open, broad chat/listing reconciliation only competes with
      // SpicyChat's own picker rendering and can cause periodic half-second
      // stalls. Keep only the tiny persona-specific pass alive until it closes.
      if (await runPersonaPickerLowImpact("critical")) return;

      DS.state.disabledCleanupDone = false;
      const deepSleep = deepSleepEnabled(settings);
      if (!deepSleep || cardFilteringWanted(settings) || document.querySelector("[data-ds-hidden-card],.ds-card-hidden,.ds-card-dimmed")) {
        DS.ensureCardHideSafetyWatchdog?.();
        await runStep("card hide safety recovery", () => DS.recoverAccidentalCardPageHide?.());
      } else {
        runtimeCounters().disabledFeatureStepSkips = Number(runtimeCounters().disabledFeatureStepSkips || 0) + 1;
      }
      syncNativeScrollBackToTopVisibility();

      if (/^\/favorite-bots\/?$/i.test(location.pathname)) DS.refreshFavoritesLaterTab?.();
      const page = DS.getPageState?.() || {};
      const singleChat = !!page.isSingleChatPage;
      const chatList = !!page.isChatListPage;
      const listing = isCardListingContext() && !DS.isLaterFavoritesTabActive?.();
      const plan = DS.getRuntimePlan?.(page, { listing }) || runtimePlan(listing);
      runtimeCounters().currentRuntimePlan = plan.key || page.routeType || "other";
      await DS.featureLifecycle?.reconcileRoute?.(plan, DS.runtimeKernel?.canRunRouteGroup);

      // Large-list paint protection belongs to the listing lane. In .117 the
      // CSS/helper existed, but applyPerformanceMode was only invoked from chat
      // routes so My Creations never received the guard.
      if (listing) {
        await runRoutedFeatureStep(plan, "listings", "listing paint guard", true, () => DS.applyListingPerformanceMode?.());
      } else if (DS.state.listingPerformanceWasActive) {
        await runStep("listing paint cleanup", () => DS.removeListingPerformanceMode?.());
      }

      if (singleChat) {
        // Avoid running the draft-removal guard against a message that React is
        // currently editing. It is both unnecessary and a source of extra work
        // on high-latency installed/PWA sessions.
        if (!DS.hasActiveMessageEditor?.()) {
          await runFeatureStep("message removal draft guard", !!settings.protectDraftDuringMessageRemoval, () => DS.applyMessageRemovalGuard?.());
          await runFeatureStep("failed message helper", !!settings.failedMessageHelper || !!settings.autoRetryFailedMessageSends || !!document.querySelector(".ds-failed-message-helper,[data-ds-failed-message-helper],[data-testid='ChatSendErrorBanner']"), () => DS.applyFailedMessageHelper?.());
        }
        await runStep("performance mode", () => DS.applyPerformanceMode?.());
        if (!discardedWakeSessionActive()) await runSavedOpenedLane("critical-single-chat");
        if (chatStartupQuietActive()) {
          if (discardedWakeSessionActive()) await runDiscardedWakeEssentialChatPass(settings);
          runtimeCounters().chatStartupQuietCriticalDeferrals = Number(runtimeCounters().chatStartupQuietCriticalDeferrals || 0) + 1;
          scheduleChatStartupQuietResume("critical");
          return;
        }
        if (settings.pauseQolWhileMessageEditing !== false && DS.hasActiveMessageEditor?.()) {
          const counters = runtimeCounters();
          counters.messageEditCriticalSkips = Number(counters.messageEditCriticalSkips || 0) + 1;
          return;
        }
      }

      if (shouldPauseHiddenTab()) return;

      if (Date.now() < laneState.pauseRerunsUntil) {
        rerunAfterMenuSettles();
        return;
      }

      if (singleChat && DS.isChatHeaderMenuOpen?.()) {
        rerunAfterMenuSettles();
        return;
      }

      if (singleChat && runtimeProfile() === "normal") {
        const dirtySet = DS.state.messageDirtyRoots || (DS.state.messageDirtyRoots = new Set());
        const laneRoots = [...dirtySet].filter(root => root?.isConnected && !DS.isMessageEditPending?.(root));
        dirtySet.clear();
        DS.state.messageLaneRoots = laneRoots;
        const counters = runtimeCounters();
        counters.messageLaneDirtyRoots = Number(counters.messageLaneDirtyRoots || 0) + laneRoots.length;
        counters.lastMessageLaneDirtyRoots = laneRoots.length;
      }

      // Priority lane: filtering/opened tracking first, then the chat controls
      // the user interacts with directly. Cosmetic cleanup runs later when idle.
      if (chatList) {
        await runSavedOpenedLane("critical-chat-list");
      } else {
        await runFeatureStep("saved chat actions cleanup", !!settings.showSavedChatQuickActions || !!document.querySelector(".ds-saved-chat-quick-actions,.ds-saved-chat-card-with-actions"), () => DS.applySavedChatQuickActions?.());
      }

      if (!listing) {
        await runRoutedFeatureStep(plan, "profiles", "creator follow buttons", () => !!settings.showFollowCreatorButtons || !!document.querySelector(".ds-creator-follow-button"), () => DS.updateCreatorFollowButtons?.());
      }

      // Save & Stay / Save & Chat also needs to run just after SpicyChat
      // navigates away from a create/edit page so a pending save action can finish.
      await runFeatureStep("bot editor save actions", !!settings.botEditorSaveActions || !!document.querySelector("[data-ds-bot-editor-save-action]"), () => DS.applyBotEditorSaveActions?.());
      await runRoutedFeatureStep(plan, "botEditor", "bot editor draft history", () => !!settings.enableBotEditorDraftHistory || !!document.querySelector("[data-ds-bot-editor-history]"), () => DS.applyBotEditorDraftHistory?.());
      if (settings.botArchiveOnChatOpen && singleChat) {
        const warmupMs = chatStartupWarmupRemainingMs();
        if (typeof DS.scheduleBotArchiveChatRefresh === "function") {
          DS.scheduleBotArchiveChatRefresh({
            delayMs: Math.max(250, warmupMs + 250),
            reason: warmupMs > 0 ? "chat-startup-warmup" : "chat-open"
          });
        } else if (!chatStartupWarmupActive()) {
          // Compatibility fallback for a partially-updated bundle: still never
          // await archive/network work inside the critical chat pass.
          setTimeout(() => { DS.applyBotArchive?.().catch?.(() => {}); }, 250);
        }
      }

      if (listing) {
        await runFeatureStep("card hiding", cardFilteringWanted(settings) || !!document.querySelector("[data-ds-hidden-card],.ds-card-hidden,.ds-card-dimmed"), () => DS.applyCardHiding?.());
        await runFeatureStep("card block buttons", cardBlockUiWanted(settings) || !!document.querySelector(".ds-card-block-button"), () => DS.applyCardBlockButtons?.());
        await runFeatureStep("previously chatted indicator", !!settings.enablePreviouslyChattedIndicator || !!document.querySelector(".ds-chatted-indicator"), () => DS.applyPreviouslyChattedIndicator?.());
        await runFeatureStep("bot organizer", !!settings.enableBotOrganizer || !!document.querySelector("[data-ds-bot-organizer],.ds-bot-organizer"), () => DS.applyBotOrganizer?.());
      } else if (singleChat || DS.isBotProfilePage?.()) {
        await runFeatureStep("bot organizer context", !!settings.enableBotOrganizer || !!document.querySelector("[data-ds-bot-organizer],.ds-bot-organizer"), () => DS.applyBotOrganizer?.());
      }

      if (listing || page.isBotProfilePage || document.querySelector(".ds-archive-website-link")) {
        await runFeatureStep("archive website links",
          !!settings.showArchiveWebsiteLinks || !!document.querySelector(".ds-archive-website-link"),
          () => DS.applyArchiveWebsiteLinks?.());
      }

      if (singleChat) {
        // The targeted slow lane can skip general feature startup on chats.
        // Install the light swipe observer during the critical chat pass once,
        // so First/Last buttons also appear when no full slow pass occurs.
        if ((settings.showSwipeJumpButtons || settings.showSwipeJumpToNumber || settings.restoreFirstSwipeOnLoad) &&
            !DS.isSwipeNavigationActive?.()) {
          await runFeatureStep("swipe navigation startup", true, () => DS.applySwipeNavigation?.());
        }
        DS.refreshMessageEnhancerConfig?.(settings);
        await runFeatureStep("previously chatted recording", !!settings.enablePreviouslyChattedIndicator, () => DS.applyPreviouslyChattedIndicator?.());
        await runFeatureStep("chat top bar", chatTopBarWanted(settings) || !!DS.state.chatTopBarWasActive, () => DS.applyChatTopBarTools?.());
        await runFeatureStep("chat backgrounds", !!(settings.enableChatBackgrounds || settings.enableCustomCharacterPictures || settings.enableCustomPersonaPictures || settings.enableCustomPictureLibrary || settings.showAutoImageInlineButton) || !!DS.state.chatBackgroundsWasActive, () => DS.applyChatBackgrounds?.());
        await runFeatureStep("rulebook diagnostics", !!settings.enableRulebookDiagnostics || !!document.getElementById("ds-rulebook-diagnostics"), () => DS.applyRulebookDiagnostics?.());
        await runFeatureStep("chat background button placement", !!(settings.enableChatBackgrounds || settings.enableCustomCharacterPictures || settings.enableCustomPersonaPictures || settings.enableCustomPictureLibrary || settings.showAutoImageInlineButton) || !!DS.state.chatBackgroundsWasActive, () => DS.applyChatBackgroundControlPlacement?.());
        await runFeatureStep("chat UI", chatUiWanted(settings) || !!DS.state.chatUiCleanupWasActive, () => DS.applyChatUiCleanup?.());
        if (settings.enableMessageBookmarks || DS.state.chatBookmarksWasActive) await runStep("chat bookmarks", () => DS.applyChatBookmarks?.());
        if (settings.enableChatContinuationAssistant || DS.state.chatContinuationWasActive) await runStep("chat continuation", () => DS.applyChatContinuationAssistant?.());
        if (settings.showChatSearch || DS.state.chatSearchWasActive) await runStep("chat search", () => DS.applyChatSearch?.());
        await runFeatureStep("focus mode", !!settings.enableFocusMode || document.documentElement.classList.contains("ds-focus-mode"), () => DS.applyFocusMode?.());
        await runFeatureStep("character QoL profile", !!settings.enableCharacterQolProfiles, () => DS.applyCharacterQolProfile?.());
        {
          const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
          await runFeatureStep("Android app controls", !!env.android || !!settings.androidTopBarMenu || String(settings.androidAppControlsMode || "auto") === "always" || !!DS.state.androidAppControlsWasActive, () => DS.applyAndroidAppControls?.());
        }
        await runFeatureStep("composer", composerWanted(settings) || !!DS.state.composerControlWasActive, () => DS.applyComposerControl?.());
        await runFeatureStep("mobile chat layout", true, () => DS.applyMobileChatLayoutFixes?.());
        if (settings.enableReplyInstructions || settings.enableGlobalMemory || settings.enableRpStateTracker || DS.state.replyInstructionsWasActive) await runStep("reply instructions", () => DS.applyReplyInstructions?.());
        if (settings.enableChatSceneNotes || document.querySelector(".ds-qol-scene-notes-button")) await runStep("chat scene notes", () => DS.applyChatSceneNotes?.());
        if (settings.showFormattingToolbar || DS.state.formattingToolbarWasActive) await runStep("formatting toolbar", () => DS.applyFormattingToolbar?.());
        // Adaptive/aggressive/maximum chat profiles use the dedicated message
        // lane below. Running the same message decorators again in the critical
        // lane turns a tiny reply mutation into a second whole-chat scan.
        // Normal mode keeps the older direct path for compatibility.
        const incrementalMessageProfile = runtimeProfile() !== "normal";
        if (!incrementalMessageProfile) {
          if (DS.isRpFormatRepairEnabledForCurrentCharacter?.() || settings.enableRpFormatRepair || DS.state.rpFormatRepairWasActive) await runStep("RP format repair", () => DS.applyRpFormatRepair?.());
          if (settings.styleAlternateDialogue || DS.state.alternateDialogueWasActive) await runStep("alternate dialogue", () => DS.applyAlternateDialogueStyling?.());
          if (settings.enableChatBubbleCustomization || DS.state.chatBubbleCustomizationWasActive) await runStep("chat bubbles", () => DS.applyChatBubbleCustomization?.());
          if (messageQuickActionsEnabled(settings) || DS.state.messageOptionsWasActive) await runStep("message options", () => DS.applyMessageOptions?.());
          if (settings.enableStoryDayTracker || DS.state.storyDayTrackerWasActive) await runStep("story day tracker", () => DS.applyStoryDayTracker?.());
          if (settings.enableRpStateTracker || DS.state.rpStateTrackerWasActive) await runStep("RP state tracker", () => DS.applyRpStateTracker?.());
          if (settings.enableContextKeeper || DS.state.contextKeeperWasActive) await runStep("context keeper", () => DS.applyContextKeeper?.());
          if (settings.enableChatNudges || DS.state.chatNudgesWasActive) await runStep("chat nudges", () => DS.applyChatNudges?.());
          if (settings.enableSelectionRemember || DS.state.selectionRememberWasActive) await runStep("selection remember", () => DS.applySelectionRemember?.());
          await runFeatureStep("auto voice", !!DS.isAutoVoiceEnabled?.(), () => DS.applyAutoVoice?.());
          await runStep("auto images", () => DS.applyAutoImage?.());
          if (settings.enableChatTextReplacements || DS.state.chatTextReplacementsWasActive) await runStep("chat text replacements", () => DS.applyChatTextReplacements?.());
          if (settings.enableTranslation || DS.state.translationWasActive) await runStep("translation", () => DS.applyTranslationTools?.());
          DS.markMessageEnhancerVisited?.(DS.getMessageEnhancerRoots?.({ newest: 24, margin: 1400 }) || []);
        } else {
          const counters = runtimeCounters();
          counters.criticalMessageEnhancerPassesDeferred = Number(counters.criticalMessageEnhancerPassesDeferred || 0) + 1;
          DS.scheduleMessageLane?.("critical-incremental-message-lane");
        }
        if (settings.enableLorebookConsistency || settings.enableCreatorTriggerPreview || document.querySelector(".ds-lorebook-consistency-bar") || document.getElementById("ds-qol-creator-debug-launch")) await runStep("lorebook consistency", () => DS.applyLorebookConsistency?.());
        await runFeatureStep("memory manager", memoryManagerWanted(settings) || !!document.querySelector("[data-ds-memory-manager],#ds-memory-manager"), () => DS.applyMemoryManagerTools?.());
      } else {
        if (DS.state.chatTopBarWasActive) {
          await runStep("chat top bar cleanup", () => DS.applyChatTopBarTools?.());
        }
        if (DS.state.chatBackgroundsWasActive) {
          await runStep("chat background cleanup", () => DS.removeChatBackgrounds?.());
        }
        if (document.getElementById("ds-rulebook-diagnostics")) await runStep("rulebook diagnostics cleanup", () => DS.removeRulebookDiagnostics?.());
        if (DS.state.chatUiCleanupWasActive) {
          await runStep("chat UI cleanup", () => DS.applyChatUiCleanup?.());
        }
        if (DS.state.chatNudgesWasActive) {
          await runStep("chat nudges cleanup", () => DS.removeChatNudges?.());
        }
        if (DS.state.chatSearchWasActive) {
          await runStep("chat search cleanup", () => DS.removeChatSearch?.());
        }
        if (DS.state.chatBookmarksWasActive) await runStep("chat bookmarks cleanup", () => DS.removeChatBookmarks?.());
        if (DS.state.composerControlWasActive) {
          await runStep("composer cleanup", () => DS.applyComposerControl?.());
        }
        if (DS.state.replyInstructionsWasActive) await runStep("reply instructions cleanup", () => DS.removeReplyInstructions?.());
        if (DS.state.formattingToolbarWasActive) {
          await runStep("formatting toolbar cleanup", () => DS.removeFormattingToolbar?.());
        }
        if (DS.state.alternateDialogueWasActive) {
          await runStep("alternate dialogue cleanup", () => DS.removeAlternateDialogueStyling?.());
        }
        if (DS.state.rpFormatRepairWasActive) {
          await runStep("RP format cleanup", () => DS.removeRpFormatRepair?.());
        }
        if (DS.state.androidAppControlsWasActive) {
          await runStep("Android app cleanup", () => DS.removeAndroidAppControls?.());
        }
        if (DS.state.chatBubbleCustomizationWasActive) {
          await runStep("chat bubble cleanup", () => DS.removeChatBubbleCustomization?.());
        }
        if (DS.state.messageOptionsWasActive) {
          await runStep("message options cleanup", () => DS.applyMessageOptions?.());
        }
        if (DS.state.selectionRememberWasActive) {
          await runStep("selection remember cleanup", () => DS.removeSelectionRemember?.());
        }
        await runFeatureStep("auto voice cleanup", !!DS.isAutoVoiceEnabled?.(), () => DS.applyAutoVoice?.());
        await runStep("auto images cleanup", () => DS.applyAutoImage?.());
        if (DS.state.chatTextReplacementsWasActive) {
          await runStep("chat text replacements cleanup", () => DS.removeChatTextReplacements?.());
        }
        if (DS.state.translationWasActive) await runStep("translation cleanup", () => DS.removeTranslationTools?.());
        if (document.documentElement.classList.contains("ds-chat-performance")) {
          await runStep("performance cleanup", () => DS.applyPerformanceMode?.());
        }
      }

      await runFeatureStep("story reading layout", !!settings.storyReadingLayout || document.documentElement.classList.contains("ds-qol-story-reading-layout"), () => DS.applyStoryReadingLayout?.());
      if (plan.botEditor || plan.lorebookEditor) {
        const snippetWanted = anySetting(settings, ["botEditorShowCharButton", "botEditorShowUserButton", "botEditorShowContinueButton", "botEditorShowNoControlButton", "botEditorShowCustomSnippets", "botEditorAutoOpenAdvanced"]);
        const bulkInputWanted = anySetting(settings, ["lorebookBulkKeywordPaste", "lorebookExpandEntryEditor", "botTagBulkPaste"]);
        await runFeatureStep("bot editor snippets", snippetWanted || !!document.querySelector("[data-ds-bot-editor-snippet]"), () => DS.applyBotEditorSnippetTools?.());
        await runFeatureStep("creation bulk input tools", bulkInputWanted || !!document.querySelector("[data-ds-creation-bulk-input]"), () => DS.applyCreationBulkInputTools?.());
      } else {
        runtimeCounters().routeFeatureGroupSkips = Number(runtimeCounters().routeFeatureGroupSkips || 0) + 1;
      }
      await runRoutedFeatureStep(plan, "lorebookEditor", "wiki lorebook importer", () => (!!settings.enableWikiLorebookImporter && lorebookEditorRoute()) || !!document.querySelector("[data-ds-wiki-lorebook-import]") || !!document.getElementById("ds-wiki-lorebook-modal"), () => DS.applyWikiLorebookImporter?.());
      if (settings.showLorebookConnections || document.getElementById("ds-lorebook-connections") || document.getElementById("ds-lorebook-author-filter")) {
        await runFeatureStep("lorebook connections", true, () => DS.applyLorebookConnections?.());
      }
      if (/^\/lorebook\/[0-9a-f-]{20,}(?:\/|$)/i.test(String(location.pathname || ""))) {
        await runFeatureStep("public lorebook profile/history", !!settings.lorebookTrackHistory || !!settings.lorebookBlockingEnabled || !!settings.showLorebookBlockButtons || (Array.isArray(settings.lorebookBlockedIds) && settings.lorebookBlockedIds.length > 0), () => DS.applyPublicLorebookQoL?.());
      }
      await runFeatureStep("chat lorebook manager", !!settings.enableChatLorebookManager, () => DS.applyChatLorebookManager?.());
      await runFeatureStep("private lorebook bridge", !!settings.enablePrivateLorebookBridge || !!document.getElementById("ds-private-lorebook-bridge-launch"), () => DS.applyPrivateLorebookBridge?.());
      const lorebookWorkflowWanted = anySetting(settings, ["lorebookDefaultEntriesTab", "lorebookRememberEntrySort", "lorebookProtectEntryDrafts", "lorebookEditShortcuts", "lorebookEntryManager"]);
      await runRoutedFeatureStep(plan, "lorebook", "lorebook workflow tools", () => lorebookWorkflowWanted || !!document.getElementById("ds-lorebook-manager-toolbar") || !!document.querySelector(".ds-lb-draft-banner,.ds-lb-edit-page-shortcut,[data-ds-edit-lorebook-menu]"), () => DS.applyLorebookWorkflowTools?.());
      await runRoutedFeatureStep(plan, "botEditor", "bot editor local memory", () => !!botEditorRoute() && (!!settings.enableCreationAudit || !!settings.rememberBotImagePrompt || !!DS.state.botEditorLocalMemoryWasActive), () => DS.applyBotEditorLocalMemory?.());
      await runRoutedFeatureStep(plan, "botEditor", "bot editor backup", () => (!!settings.botBackupToolsEnabled && botEditorRoute()) || !!DS.state.botBackupWasActive || !!document.getElementById("ds-bot-backup-tools"), () => DS.applyBotBackupTools?.());
      await runRoutedFeatureStep(plan, "botEditor", "creator backup field restore", () => !!botEditorRoute() || !!document.getElementById("ds-qol-field-restore-banner"), () => DS.applyCreatorWorkspaceRestore?.());
      await runRoutedFeatureStep(plan, "botEditor", "private scene scenario handoff", () => !!(settings.enableChatSceneNotes && settings.chatSceneNotesEnableBotApply && botEditorRoute()) || !!document.getElementById("ds-qol-scene-bot-handoff"), () => DS.applyBotSceneScenarioHandoff?.());
      await runRoutedFeatureStep(plan, "lorebookEditor", "lorebook backup", () => (!!settings.lorebookBackupToolsEnabled && lorebookEditorRoute()) || !!DS.state.lorebookBackupWasActive || !!document.getElementById("ds-lorebook-backup-tools"), () => DS.applyLorebookBackup?.());
    } finally {
      if (passToken) DS.diagOperationEnd?.(passToken, { outcome: "ok" });
      DS.state.diagCriticalOperationId = "";
      if (runtimeProfile() === "normal") DS.state.messageLaneRoots = null;
      laneState.criticalRunning = false;

      if (laneState.criticalPending) {
        laneState.criticalPending = false;
        clearTimeout(laneState.criticalTimer);
        laneState.criticalTimer = setTimeout(() => DS.runCritical?.(), 60);
      }
    }
  };
    return { runCritical: DS.runCritical };
  };
})();
}
