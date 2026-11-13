// Core runtime lane: slow. Keep scheduling state shared with main.js.
// The factory registers no observers, starts no timers, and processes no UI
// until the main scheduler invokes its exported pass.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainSlowPass = (ctx) => {
    const { anySetting, cardFilteringWanted, chatStartupQuietActive, creatorProfileStartupQuietActive, generationMetadataWanted, isCardListingContext, modelSelectorWanted, notificationsWanted, personaToolsWanted, rerunAfterMenuSettles, runDisabledCleanup, runFeatureStep, runPersonaPickerLowImpact, runRoutedFeatureStep, runStep, runThrottledFeatureStep, runtimeCounters, runtimePlan, runtimeProfile, scheduleChatStartupQuietResume, scheduleCreatorProfileQuietResume, scheduleSlowRun, slowDirtyHas, syncNativeScrollBackToTopVisibility, takeSlowDirtyGroups, topBarWanted, laneState } = ctx;
  async function runTargetedChatSlowPass(dirty, settings, plan, options = {}) {
    const counters = runtimeCounters();
    counters.targetedChatSlowPasses = Number(counters.targetedChatSlowPasses || 0) + 1;
    counters.lastTargetedChatSlowGroups = [...dirty].join(",");

    if (slowDirtyHas(dirty, "interface")) {
      await runStep("remove disabled panel", () => DS.removeQuickPanelIfDisabled?.());
      await runFeatureStep("top bar", topBarWanted(settings) || !!document.querySelector("[data-ds-reason^='topbar:']"), () => DS.applyTopBarCleanup?.());
      const sidebarWanted = !!settings.showLaterFavoritesTab || !!settings.showQolSidebarButton || !!settings.restorePersonasSidebarPosition || !!DS.sidebarPersonasMoved?.() || Object.keys(settings).some(key => key.startsWith("hideSidebar") && settings[key]);
      await runFeatureStep("sidebar", sidebarWanted || !!document.querySelector("[data-ds-reason^='sidebar:'],#ds-qol-sidebar-btn,#ds-qol-sidebar-later"), () => DS.applySidebarCleanup?.());
      await runFeatureStep("main footer", !!settings.enableMainFooterManagement || !!document.querySelector("[data-ds-reason^='main-footer:'],[data-ds-main-footer-root]"), () => DS.applyMainFooterManagement?.());
      await runFeatureStep("notifications", notificationsWanted(settings) || !!document.querySelector("[data-ds-reason='notifications'], [data-ds-reason='notifications:release-popup']"), () => DS.handleNotifications?.());
    }

    if (slowDirtyHas(dirty, "adverts")) {
      const advertWanted = !!settings.hideAdvertBanners || !!document.querySelector("[data-ds-reason^='advert']");
      if (advertWanted || DS.isAdvertBannerCleanupDirty?.()) {
        await runFeatureStep("advert banners", true, () => DS.applyAdvertBannerCleanup?.());
      }
    }

    if (slowDirtyHas(dirty, "model")) {
      const wanted = modelSelectorWanted(settings) || !!DS.state.modelQuickMenuWasActive || !!document.querySelector(".ds-model-favorite-button,.ds-model-upgrade-hidden,[data-ds-reason^='model-selector:']");
      if (wanted || DS.isModelSelectorDirty?.()) {
        await runFeatureStep("model selector", true, () => DS.applyModelSelectorTools?.());
      }
    }

    if (slowDirtyHas(dirty, "chat-chrome")) {
      if (settings.showSwipeJumpButtons || settings.showSwipeJumpToNumber || settings.restoreFirstSwipeOnLoad || document.querySelector(".ds-qol-swipe-jump")) {
        await runFeatureStep("swipe navigation", true, () => DS.applySwipeNavigation?.());
      }
      await runRoutedFeatureStep(plan, "chat", "generation profiles", () => !!settings.enableGenerationProfiles || !!document.querySelector("[data-ds-generation-profile]"), () => DS.applyGenerationProfileTools?.());
      await runFeatureStep("chat tags", !!settings.showChatTagLinks || !!settings.showChatTagAddButtons, () => DS.applyChatTagTools?.());
      await runFeatureStep("personas", personaToolsWanted(settings), () => DS.applyPersonas?.());
      await runFeatureStep("OOC", !!settings.showOocTools || !!settings.replaceChatImageWithOocButton || !!settings.quickPanelShowOoc, () => DS.applyOocTools?.());
      if (settings.enableReplyInstructions || settings.enableGlobalMemory || DS.state.replyInstructionsWasActive) await runStep("reply instructions", () => DS.applyReplyInstructions?.());
        if (settings.enableChatSceneNotes || document.querySelector(".ds-qol-scene-notes-button")) await runStep("chat scene notes", () => DS.applyChatSceneNotes?.());
      if (settings.enableLorebookConsistency || settings.enableCreatorTriggerPreview || document.querySelector(".ds-lorebook-consistency-bar") || document.getElementById("ds-qol-creator-debug-launch")) await runStep("lorebook consistency", () => DS.applyLorebookConsistency?.());
    }

    if (slowDirtyHas(dirty, "rulebook-picker")) {
      await runFeatureStep("public rulebook blocking",
        !!settings.rulebookBlockingEnabled || (!!settings.enableLanguageFilter && !!settings.languageFilterRulebooks) || !!document.querySelector('[data-ds-reason^="rulebook:block:"], [data-ds-reason^="rulebook:language:"], .ds-rulebook-block-button'),
        () => DS.applyPublicRulebookQoL?.());
    }

    if (slowDirtyHas(dirty, "message-ui")) {
      if (settings.showQuickPanel || document.getElementById("ds-qol-panel")) {
        await runFeatureStep("update panel", true, () => DS.updateQuickPanel?.());
      }
    }
  }

  function optionalUiQuietDeadline() {
    if (!DS.isSingleChatPage?.()) return 0;
    const state = DS.state || {};
    return Math.max(Number(state.userTypingUntil || 0),
      Number(state.nativeActionQuietUntil || 0),
      Number(state.chatEnhancerQuietUntil || 0),
      Number(state.chatReplyRenderQuietUntil || 0),
      Number(state.userScrollingUntil || 0),
      Number(state.chatHistoryBatchUntil || 0));
  }

  DS.runSlow = async function runSlow(options = {}) {
    if (DS.isQolPausedForTab?.()) return;
    if (laneState.slowRunning) {
      laneState.slowPending = true;
      return;
    }

    if (laneState.criticalRunning) {
      DS.scheduleRun?.({ priority: "slow", source: "critical-running" });
      return;
    }

    // Hidden tabs do not need cosmetic DOM work. Critical tracking/filtering has
    // its own lane and the slow lane is refreshed immediately when the tab is shown.
    if (document.hidden && !options.force) return;
    // Non-chat listings and Rulebook Explore were previously excluded from
    // the scroll quiet window used for chats. Preserve the pending dirty
    // groups and check again once native scrolling has settled. No polling.
    if (!options.force && (isCardListingContext() || DS.isRulebookExplorePage?.())) {
      const remaining = Number(DS.state?.userScrollingUntil || 0) - Date.now();
      if (remaining > 0) {
        const counters = runtimeCounters();
        counters.listingScrollSlowPassDeferrals = Number(counters.listingScrollSlowPassDeferrals || 0) + 1;
        scheduleSlowRun(remaining + 160);
        return;
      }
    }
    // Optional work waits for all native interaction windows (including
    // streaming and editing); critical tracking is never held here.
    if (!options.force && Date.now() < optionalUiQuietDeadline()) {
      DS.scheduleRun?.({ priority: "slow", source: "native-interaction-quiet" });
      const perf = runtimeCounters();
      perf.sharedQuietDeferrals = Number(perf.sharedQuietDeferrals || 0) + 1;
      return;
    }

    const slowQueueDelayMs = Math.max(0, Date.now() - Number(DS.state?.diagSlowScheduledAt || Date.now()));
    const slowToken = DS.isDiagnosticTraceActive?.("normal") ? DS.diagOperationStart?.("runtime", "slow-pass", {
      trigger: String(DS.state?.diagSlowSource || DS.state?.lastRunTrigger || "").slice(0, 120),
      force: !!options.force,
      queueDelayMs: slowQueueDelayMs,
      parentOperationId: ""
    }) : null;
    DS.state.diagSlowOperationId = slowToken?.id || "";
    laneState.slowRunning = true;
    laneState.slowSliceState = typeof performance !== "undefined" ? { sliceStarted: performance.now(), activeMs: 0, slices: 1, dirtyGroups: [] } : null;

    try {
      const settings = DS.state?.settings || {};
      if (DS.state.quickDislikeWorker) return;
      if (DS.state.bulkChatHistoryLoadActive) {
        DS.state.bulkChatHistoryLoadNeedsRefresh = true;
        return;
      }
      if (Date.now() < Number(DS.state.chatHistoryBatchUntil || 0)) {
        DS.scheduleRun?.({ priority: "slow", source: "history-batch-low-impact" });
        return;
      }
      if (!settings.enabled) {
        await runDisabledCleanup();
        return;
      }

      if (await runPersonaPickerLowImpact("slow")) return;

      if (Date.now() < laneState.pauseRerunsUntil || (DS.isSingleChatPage?.() && DS.isChatHeaderMenuOpen?.())) {
        rerunAfterMenuSettles();
        return;
      }

      const page = DS.getPageState?.() || {};
      const singleChat = !!page.isSingleChatPage;
      const chatList = !!page.isChatListPage;
      const listing = isCardListingContext() && !DS.isLaterFavoritesTabActive?.();
      const plan = DS.getRuntimePlan?.(page, { listing }) || runtimePlan(listing);
      runtimeCounters().currentRuntimePlan = plan.key || page.routeType || "other";
      const profile = runtimeProfile();
      const listingMaintenanceInterval = profile === "maximum" ? 5200 : profile === "aggressive" ? 3600 : profile === "adaptive" ? 2200 : 1200;
      const listingCardInterval = profile === "maximum" ? 2600 : profile === "aggressive" ? 1800 : profile === "adaptive" ? 1200 : 700;

      if (singleChat && chatStartupQuietActive()) {
        runtimeCounters().chatStartupQuietSlowDeferrals = Number(runtimeCounters().chatStartupQuietSlowDeferrals || 0) + 1;
        await runStep("performance mode", () => DS.applyPerformanceMode?.());
        scheduleChatStartupQuietResume("slow");
        return;
      }

      const dirty = takeSlowDirtyGroups(options);
      if (laneState.slowSliceState) laneState.slowSliceState.dirtyGroups = [...dirty];
      if (!dirty.size) {
        runtimeCounters().slowPassCleanSkips = Number(runtimeCounters().slowPassCleanSkips || 0) + 1;
        DS.diagScheduler?.("skipped", { lane: "slow", reason: "nothing-dirty" });
        return;
      }

      // A settled message/reply should never wake unrelated document-wide
      // cosmetic work. Only explicitly invalidated chat groups run here. Route,
      // settings and non-chat passes still use the full compatibility path.
      if (singleChat && !dirty.has("all")) {
        await runTargetedChatSlowPass(dirty, settings, plan, options);
        return;
      }

      await runStep("remove disabled panel", () => DS.removeQuickPanelIfDisabled?.());
      await runFeatureStep("S.AI Toolkit detection", !!settings.saiToolkitCompatibility, () => DS.startSaiToolkitDetection?.());
      syncNativeScrollBackToTopVisibility();
      await runFeatureStep("scroll to top", !!settings.showScrollToTopButton || !!settings.showScrollToBottomButton || !!document.querySelector("#ds-scroll-to-top,#ds-scroll-to-bottom"), () => DS.applyScrollToTopButton?.());
      await runFeatureStep("swipe navigation", !!settings.showSwipeJumpButtons || !!settings.showSwipeJumpToNumber || !!settings.restoreFirstSwipeOnLoad || !!document.querySelector(".ds-qol-swipe-jump"), () => DS.applySwipeNavigation?.());
      await runFeatureStep("soundscapes", !!settings.enableSoundscapes || !!document.querySelector("[data-ds-soundscape],#ds-soundscape-player,.ds-chat-soundscape-wrapper"), () => DS.applySoundscapes?.());
      await runFeatureStep("tag aliases", !!settings.enableTagAliases || !!document.querySelector("[data-ds-tag-alias-original]"), () => DS.applyTagAliases?.());
      await runFeatureStep("local tag matching", !!settings.localTagMatchEnabled, () => DS.applyLocalTagMatching?.());
      await runFeatureStep("persona full backup button", !!settings.personaFullBackupEnabled || !!document.getElementById("ds-full-persona-backup"), () => DS.applyPersonaFullBackup?.());
      await runFeatureStep("profile export", !!settings.enableProfileExport || !!document.getElementById("ds-profile-export-button"), () => DS.applyProfileExport?.());
      await runFeatureStep("creator writing assistant", !!settings.enableCreatorWritingAssistant || !!document.querySelector(".ds-creator-writing-button"), () => DS.applyCreatorWritingAssistant?.());
      await runFeatureStep("native rating helpers", !!settings.enableNativeRatingHelpers || !!document.getElementById("ds-native-rating-quick"), () => DS.applyNativeRatingHelpers?.());
      await runFeatureStep("saved lists overlay", !!settings.enableSavedListsOverlay || !!document.getElementById("ds-saved-lists-open"), () => DS.applySavedListsOverlay?.());
      await runFeatureStep("create panel", !!settings.showQuickPanel || !!document.getElementById("ds-qol-panel"), () => DS.createQuickPanel?.());

      // These are small, persistent visibility fixes. Run them before heavier
      // listing/banner work so a busy chat cannot leave SpicyChat UI elements
      // visible just because the cosmetic lane was delayed.
      await runFeatureStep("top bar", topBarWanted(settings) || !!document.querySelector("[data-ds-reason^='topbar:']"), () => DS.applyTopBarCleanup?.());
      const sidebarWanted = !!settings.showLaterFavoritesTab || !!settings.showQolSidebarButton || !!settings.restorePersonasSidebarPosition || !!DS.sidebarPersonasMoved?.() || Object.keys(settings).some(key => key.startsWith("hideSidebar") && settings[key]);
      if (listing) {
        await runThrottledFeatureStep("sidebar", sidebarWanted || !!document.querySelector("[data-ds-reason^='sidebar:'],#ds-qol-sidebar-btn,#ds-qol-sidebar-later"), listingMaintenanceInterval, () => DS.applySidebarCleanup?.(), !!options.force);
      } else {
        await runFeatureStep("sidebar", sidebarWanted || !!document.querySelector("[data-ds-reason^='sidebar:'],#ds-qol-sidebar-btn,#ds-qol-sidebar-later"), () => DS.applySidebarCleanup?.());
      }
      await runFeatureStep("main footer", !!settings.enableMainFooterManagement || !!document.querySelector("[data-ds-reason^='main-footer:'],[data-ds-main-footer-root]"), () => DS.applyMainFooterManagement?.());

      const favoriteDataWanted = anySetting(settings, ["trackFavoriteBots", "neverHideFavorites", "protectFavoritesFromBlocking", "showFavoriteHistoryButton", "recommendationHideFavoriteBots", "enableFavoritesRecovery"]);
      await runRoutedFeatureStep(plan, "listings", "favorite bots import", favoriteDataWanted, () => DS.importVisibleFavoriteBots?.());
      await runRoutedFeatureStep(plan, "listings", "public personality control", () => !!document.querySelector('[data-testid="FeaturesCapabilityGate-Header"]'), () => DS.syncPublicPersonalityControl?.());
      await runRoutedFeatureStep(plan, "listings", "favorite history", () => !!settings.showFavoriteHistoryButton || !!settings.enableFavoritesRecovery || !!settings.favoritePageFoldersEnabled || !!settings.favoritePageSortEnabled || !!document.querySelector("[data-ds-favorite-history],#ds-favorite-history,#ds-favorite-qol-controls"), () => DS.applyFavoriteHistoryButton?.());
      await runRoutedFeatureStep(plan, "listings", "NSFW toggle", String(settings.globalNsfwMode || "ignore") !== "ignore", () => DS.setGlobalNsfwSwitch?.());
      await runRoutedFeatureStep(plan, "listings", "tag template", !!settings.autoTags, () => DS.applyAutoTags?.());
      await runRoutedFeatureStep(plan, "listings", "tag template button", () => !!settings.showTagTemplateButton || !!document.querySelector(".ds-tag-template-button"), () => DS.addTagTemplateButton?.());
      if (listing) {
        await runThrottledFeatureStep("premium cleanup", !!settings.hidePremium || !!settings.hideFloatingPremiumPopups || !!document.querySelector("[data-ds-reason^='premium']"), listingMaintenanceInterval, () => DS.hidePremiumStuff?.(), !!options.force);
        if (options.force || DS.isAdvertBannerCleanupDirty?.()) {
          await runThrottledFeatureStep("advert banners", !!settings.hideAdvertBanners || !!document.querySelector("[data-ds-reason^='advert']") || !!DS.isAdvertBannerCleanupDirty?.(), listingMaintenanceInterval, () => DS.applyAdvertBannerCleanup?.(), !!options.force);
        }
      } else {
        await runFeatureStep("premium cleanup", !!settings.hidePremium || !!settings.hideFloatingPremiumPopups || !!document.querySelector("[data-ds-reason^='premium']"), () => DS.hidePremiumStuff?.());
        if (options.force || DS.isAdvertBannerCleanupDirty?.()) {
          await runFeatureStep("advert banners", true, () => DS.applyAdvertBannerCleanup?.());
        }
      }
      await runFeatureStep("notifications", notificationsWanted(settings) || !!document.querySelector("[data-ds-reason='notifications'], [data-ds-reason='notifications:release-popup']"), () => DS.handleNotifications?.());

      await runRoutedFeatureStep(plan, "chat", "generation profiles", () => !!settings.enableGenerationProfiles || !!document.querySelector("[data-ds-generation-profile]"), () => DS.applyGenerationProfileTools?.());
      await runRoutedFeatureStep(plan, "personaTools", "persona page", personaToolsWanted(settings), () => DS.applyPersonaPageTools?.());
      await runRoutedFeatureStep(plan, "personaTools", "persona organizer", () => !!settings.enablePersonaOrganizer || !!document.querySelector("[data-ds-persona-organizer]"), () => DS.applyPersonaOrganizer?.());
      await runRoutedFeatureStep(plan, "lorebook", "lorebook entry expanders", () => !!settings.showLorebookEntryExpandButtons || !!document.querySelector("[data-ds-lorebook-expand]"), () => DS.applyLorebookEntryExpanders?.());
      if (!creatorProfileStartupQuietActive() && DS.runtimePlanAllows?.(plan, "creatorModeration") && (settings.creatorModerationWarnings || settings.creatorModerationWarningsChatbots || DS.state.creatorModerationWarningsWasActive)) {
        await runThrottledFeatureStep("creator moderation warnings", true, 1800, () => DS.applyCreatorModerationWarnings?.(), !!options.force);
      } else if (!DS.runtimePlanAllows?.(plan, "creatorModeration")) {
        runtimeCounters().routeFeatureStepSkips = Number(runtimeCounters().routeFeatureStepSkips || 0) + 1;
      } else if (creatorProfileStartupQuietActive()) {
        runtimeCounters().creatorProfileStartupQuietDeferrals = Number(runtimeCounters().creatorProfileStartupQuietDeferrals || 0) + 1;
        scheduleCreatorProfileQuietResume();
      }
      if (!creatorProfileStartupQuietActive() && (settings.botArchiveOnProfileVisit || !!settings.botArchiveRememberSeenPublic) && plan.profiles) {
        await runThrottledFeatureStep("bot archive profile capture", true, 2500, () => DS.applyBotArchive?.(), !!options.force);
      }
      if (plan.profiles) {
        await runThrottledFeatureStep(
          "bot profile creation date",
          !!settings.showBotCreationDates || !!settings.showNewBotBadge || !!document.querySelector(".ds-bot-profile-created-date,.ds-bot-new-badge"),
          listingCardInterval,
          () => DS.applyExactMessageCounts?.(),
          !!options.force
        );
      }

      if (singleChat) {
        if (options.force || DS.isModelSelectorDirty?.()) {
          await runFeatureStep("model selector", modelSelectorWanted(settings) || !!DS.state.modelQuickMenuWasActive || !!DS.isModelSelectorDirty?.(), () => DS.applyModelSelectorTools?.());
          await runFeatureStep("model quick access", !!settings.enableModelQuickAccess || !!document.querySelector(".ds-model-quick-access"), () => DS.applyModelQuickAccess?.());
        }
        await runFeatureStep("chat lorebook manager", !!settings.enableChatLorebookManager || !!document.getElementById("ds-chat-lorebook-modal"), () => DS.applyChatLorebookManager?.());
        await runFeatureStep("private lorebook bridge", !!settings.enablePrivateLorebookBridge || !!document.getElementById("ds-private-lorebook-bridge") || !!document.getElementById("ds-private-lorebook-bridge-launch"), () => DS.applyPrivateLorebookBridge?.());
        await runFeatureStep("chat tags", !!settings.showChatTagLinks || !!settings.showChatTagAddButtons, () => DS.applyChatTagTools?.());
        await runFeatureStep("generation metadata", generationMetadataWanted(settings) || !!document.querySelector(".ds-generation-metadata,#ds-context-window-warning"), () => DS.applyGenerationMetadata?.());
        await runFeatureStep("personas", personaToolsWanted(settings), () => DS.applyPersonas?.());
        await runFeatureStep("OOC", !!settings.showOocTools || !!settings.replaceChatImageWithOocButton || !!settings.quickPanelShowOoc, () => DS.applyOocTools?.());
        if (settings.enableReplyInstructions || settings.enableGlobalMemory || DS.state.replyInstructionsWasActive) await runStep("reply instructions", () => DS.applyReplyInstructions?.());
        if (settings.enableChatSceneNotes || document.querySelector(".ds-qol-scene-notes-button")) await runStep("chat scene notes", () => DS.applyChatSceneNotes?.());
        if (settings.enableLorebookConsistency || settings.enableCreatorTriggerPreview || document.querySelector(".ds-lorebook-consistency-bar") || document.getElementById("ds-qol-creator-debug-launch")) await runStep("lorebook consistency", () => DS.applyLorebookConsistency?.());
      }

      if (chatList) {
        await runFeatureStep("chat list", !!settings.showChatListTools || !!settings.enableChatOrganizer || !!settings.enableChatPins || !!settings.chatListTwoColumns || !!settings.chatListPopoutShortcut || !!settings.chatListRenameShortcut || !!document.querySelector("[data-ds-chat-list-tools],#ds-chat-organizer-toolbar,#ds-qol-pinned-chats,.ds-chat-pin-toggle,.ds-qol-chat-grid-two,.ds-qol-chat-card-extras"), () => DS.applyChatListTools?.());
        await runFeatureStep("chat pins", !!settings.enableChatPins || !!document.querySelector("#ds-qol-pinned-chats,.ds-chat-pin-toggle"), () => DS.applyChatPins?.());
      } else {
        if (document.getElementById("ds-chat-organizer-toolbar") || document.querySelector(".ds-chat-row-hidden-by-folder,.ds-chat-org-select")) DS.removeChatOrganizer?.();
        if (document.getElementById("ds-qol-pinned-chats") || document.querySelector(".ds-chat-pin-toggle")) DS.removeChatPins?.();
      }

      // Public Lorebook Explore is not a generic bot-card listing. Run its
      // existing page pass directly, so the language filter works without
      // activating unrelated bot listing features.
      if (page.isLorebookExplorePage) {
        await runFeatureStep("public lorebook blocking/history",
          !!settings.lorebookTrackHistory || !!settings.lorebookBlockingEnabled ||
          !!settings.showLorebookBlockButtons || !!settings.lorebookExpandTags ||
          (Array.isArray(settings.lorebookBlockedIds) && settings.lorebookBlockedIds.length > 0) ||
          (!!settings.enableLanguageFilter && !!settings.languageFilterLorebooks) ||
          !!document.querySelector("[data-ds-reason^='lorebook:block'], [data-ds-reason^='lorebook:language:'], .ds-lorebook-block-button"),
          () => DS.applyPublicLorebookQoL?.());
      }

      // Rulebooks Explore uses its own route, not the normal bot listing route.
      await runFeatureStep("public rulebook blocking",
        ((page.isRulebookExplorePage || (singleChat && !!document.querySelector('[data-testid="ConversationRulebookPicker-Modal"] [data-testid="RulebookDiscoverTab"]'))) && (settings.rulebookBlockingEnabled === true || (settings.enableLanguageFilter === true && settings.languageFilterRulebooks === true)))
          || !!document.querySelector('[data-ds-reason^="rulebook:block:"], [data-ds-reason^="rulebook:language:"], .ds-rulebook-block-button'),
        () => DS.applyPublicRulebookQoL?.());

      if (listing) {
        await runFeatureStep("random chat", !!settings.showRandomChatButton || !!document.getElementById("ds-qol-random-chat"), () => DS.applyRandomChatButton?.());
        await runFeatureStep("pagination tools", true, () => DS.applyPaginationTools?.());
        await runFeatureStep("bot name expander", true, () => DS.applyBotNameExpander?.());
        // Recommendation helpers load local creator identity before the final
        // card pass so own-bot filtering can work without extra page requests.
        await runThrottledFeatureStep("recommendation helpers", !!settings.enableRecommendationHelpers || !!document.querySelector("[data-ds-recommendation-helper]"), listingMaintenanceInterval, () => DS.applyRecommendationHelpers?.(), !!options.force);
        // Description expansion runs only after promo/banner cleanup and a fresh
        // blocking/opened-card pass so hidden cards do not expand first and flash.
        await runThrottledFeatureStep("card hiding settled", cardFilteringWanted(settings) || !!document.querySelector("[data-ds-hidden-card],.ds-card-hidden,.ds-card-dimmed"), listingCardInterval, () => DS.applyCardHiding?.(), !!options.force);
        await runFeatureStep("listing refill dedupe", !!document.querySelector("[data-ds-autofill-extra='1']"), () => DS.removeDuplicateListingRefillCards?.());
        await runFeatureStep("lorebook listing tools", !!settings.showLorebookFilters || !!document.querySelector("[data-ds-lorebook-filter]"), () => DS.applyLorebookListingTools?.());
        await runFeatureStep("rulebook listing tools", !!settings.showRulebookFilters || !!document.getElementById("ds-rulebook-filter-toolbar"), () => DS.applyRulebookListingTools?.());
        await runFeatureStep("lorebook search filter", !!settings.showLorebookFilters || !!document.getElementById("ds-lorebook-search-filter") || !!document.querySelector(".ds-lorebook-search-filter-hidden"), () => DS.applyLorebookSearchFilter?.());
        await runFeatureStep("lorebook tag expansion", !!settings.lorebookExpandTags || !!document.querySelector("[data-ds-lorebook-tags-expanded]"), () => DS.applyLorebookTagExpansion?.());
        await runFeatureStep("public lorebook blocking/history", !!settings.lorebookTrackHistory || !!settings.lorebookBlockingEnabled || !!settings.showLorebookBlockButtons || (Array.isArray(settings.lorebookBlockedIds) && settings.lorebookBlockedIds.length > 0) || (!!settings.enableLanguageFilter && !!settings.languageFilterLorebooks) || !!document.querySelector("[data-ds-reason^='lorebook:block'], [data-ds-reason^='lorebook:language:'], .ds-lorebook-block-button"), () => DS.applyPublicLorebookQoL?.());
        await runFeatureStep("smart filter presets", !!settings.enableSmartFilterPresets || !!document.querySelector("[data-ds-smart-filter]"), () => DS.applySmartFilterPresets?.());
        await runThrottledFeatureStep("exact message counts / creation dates", !!settings.showExactMessageCounts || !!settings.showBotCreationDates || !!settings.showNewBotBadge || !!document.querySelector("[data-ds-exact-message-count-applied=\"1\"], .ds-bot-created-date, .ds-bot-new-badge"), listingCardInterval, () => DS.applyExactMessageCounts?.(), !!options.force);
        await runFeatureStep("my creations view memory", !!settings.rememberMyCreationsView, () => DS.applyMyCreationsViewMemory?.());
        await runFeatureStep("my creations auto-load", !!settings.autoLoadMyCreations, () => DS.applyMyCreationsAutoLoad?.());
        await runFeatureStep("my creations backup", true, () => DS.applyMyCreationsBackupTools?.());
        await runThrottledFeatureStep("creation audit", !!settings.enableCreationAudit || !!document.querySelector("[data-ds-creation-audit]"), listingCardInterval, () => DS.applyCreationAudit?.(), !!options.force);
        await runThrottledFeatureStep("my creations filters", !!settings.enableMyCreationsFilters || !!document.querySelector("[data-ds-my-creations-filter]"), listingCardInterval, () => DS.applyMyCreationsFilters?.(), !!options.force);
        await runFeatureStep("bot organizer settled", !!settings.enableBotOrganizer || !!document.querySelector("[data-ds-bot-organizer],.ds-bot-organizer"), () => DS.applyBotOrganizer?.());
        await runThrottledFeatureStep("creator favorite buttons", !!settings.showCreatorFavoriteButtons || !!document.querySelector(".ds-creator-fav-button"), listingCardInterval, () => DS.updateCreatorFavoriteButtons?.(), !!options.force);
        await runThrottledFeatureStep("creator follow buttons", !!settings.showFollowCreatorButtons || !!document.querySelector(".ds-creator-follow-button"), listingCardInterval, () => DS.updateCreatorFollowButtons?.(), !!options.force);
        await runThrottledFeatureStep("later buttons", !!settings.showLaterBotButtons || !!document.querySelector(".ds-later-bot-button"), listingCardInterval, () => DS.updateLaterBotButtons?.(), !!options.force);
        await runThrottledFeatureStep("previously chatted indicator", !!settings.enablePreviouslyChattedIndicator || !!document.querySelector(".ds-chatted-indicator"), listingCardInterval, () => DS.applyPreviouslyChattedIndicator?.(), !!options.force);
        await runThrottledFeatureStep("card descriptions", !!settings.expandLongCardDescriptions || !!document.querySelector("[data-ds-description-expanded]"), listingCardInterval, () => DS.applyCardDescriptionExpansion?.(), !!options.force);
        await runThrottledFeatureStep("card greeting token info", !!settings.showCardGreetingTokenInfo || !!document.querySelector(".ds-card-token-info"), listingCardInterval, () => DS.applyCardGreetingTokenInfo?.(), !!options.force);
        await runThrottledFeatureStep("listing auto-fill", !!settings.autoFillListings || !!settings.showListingRefillButton || !!settings.showListingFilterStats || !!DS.state.listingRefillWorker, listingCardInterval, () => DS.applyListingAutoFill?.(), !!options.force);
        await runStep("listing name sort", () => DS.applyListingSortTools?.());
      }

      if (!listing) {
        await runFeatureStep("recommendation helper cleanup", !!DS.state.recommendationHelpersWasActive || !!document.querySelector("[data-ds-recommendation-helper]"), () => DS.removeRecommendationHelpers?.());
        await runFeatureStep("smart filter cleanup", !!document.querySelector("[data-ds-smart-filter],#ds-smart-filter-toolbar"), () => DS.removeSmartFilterPresets?.());
        await runFeatureStep("lorebook search filter cleanup", !!document.getElementById("ds-lorebook-search-filter") || !!document.querySelector(".ds-lorebook-search-filter-hidden"), () => DS.removeLorebookSearchFilter?.());
        await runFeatureStep("listing name sort cleanup", !!document.getElementById("ds-listing-name-sort"), () => DS.removeListingSortTools?.());
        await runFeatureStep("my creations view memory cleanup", !!settings.rememberMyCreationsView, () => DS.removeMyCreationsViewMemory?.());
        await runFeatureStep("creation audit cleanup", !!DS.state.creationAuditWasActive || !!document.querySelector("[data-ds-creation-audit]"), () => DS.removeCreationAudit?.());
        await runFeatureStep("my creations filter cleanup", !!DS.state.myCreationsFiltersWasActive || !!document.querySelector("[data-ds-my-creations-filter]"), () => DS.removeMyCreationsFilters?.());
        await runFeatureStep("my creations backup cleanup", !!DS.state.myCreationsBackupWasActive || !!document.getElementById("ds-my-creations-backup-bar") || !!document.querySelector(".ds-my-lorebook-edit-button"), () => DS.removeMyCreationsBackupTools?.());
        if (!singleChat && !page.isBotProfilePage) {
          await runFeatureStep("bot organizer cleanup", !!DS.state.botOrganizerWasActive || !!document.querySelector("[data-ds-bot-organizer],.ds-bot-organizer,#ds-bot-organizer-toolbar,#ds-bot-organizer-context-button"), () => DS.removeBotOrganizer?.());
        }
        await runFeatureStep("card greeting token cleanup", !!document.querySelector(".ds-card-token-info"), () => DS.removeCardGreetingTokenInfo?.());
      }

      if (DS.runtimePlanAllows?.(plan, "discovery") && (
        settings.trackRecentlySeenBots ||
        settings.cardDensityMode !== "normal" ||
        settings.showCopyBotInfoButtons ||
        settings.showRecentlySeenButton ||
        settings.enableBotComparison ||
        settings.showQuickNotInterestedButtons ||
        settings.showQuickLessLikeButtons ||
        settings.showQuickMoreLikeButtons ||
        settings.showQuickDislikeButtons ||
        settings.showQuickUnblockButtons ||
        DS.state.cardWorkflowWasActive
      )) {
        await runStep("card workflow", () => DS.applyCardWorkflow?.());
      } else if (!DS.runtimePlanAllows?.(plan, "discovery")) {
        runtimeCounters().routeFeatureStepSkips = Number(runtimeCounters().routeFeatureStepSkips || 0) + 1;
      }
      await runFeatureStep("animation controls", !!settings.reduceAnimatedBotImages || anySetting(settings, ["animatedImagesListings", "animatedImagesChats", "animatedImagesProfiles", "animatedImagesChatMedia"]) || !!DS.state.animationControlsWasActive, () => DS.applyAnimationControls?.());
      await runFeatureStep("update panel", !!settings.showQuickPanel || !!document.getElementById("ds-qol-panel"), () => DS.updateQuickPanel?.());
    } finally {
      let activeMs = 0;
      let slices = 0;
      let dirtyGroups = [];
      if (laneState.slowSliceState && typeof performance !== "undefined") {
        activeMs = Number(laneState.slowSliceState.activeMs || 0) + Math.max(0, performance.now() - Number(laneState.slowSliceState.sliceStarted || performance.now()));
        slices = Number(laneState.slowSliceState.slices || 1);
        dirtyGroups = Array.isArray(laneState.slowSliceState.dirtyGroups) ? laneState.slowSliceState.dirtyGroups : [];
      }
      if (slowToken) DS.diagOperationEnd?.(slowToken, { outcome: "ok", meta: { activeMs: Math.round(activeMs * 10) / 10, slices, dirtyGroups, queueDelayMs: slowQueueDelayMs } });
      DS.diagScheduler?.("finished", { lane: "slow", durationActiveMs: Math.round(activeMs * 10) / 10, slices, dirtyGroups });
      laneState.slowSliceState = null;
      DS.state.diagSlowOperationId = "";
      DS.state.diagSlowScheduledAt = 0;
      laneState.slowRunning = false;

      if (laneState.slowPending) {
        laneState.slowPending = false;
        DS.scheduleRun?.({ priority: "slow", source: "slow-pending" });
      }
    }
  };
    return { runSlow: DS.runSlow, optionalUiQuietDeadline };
  };
})();
}
