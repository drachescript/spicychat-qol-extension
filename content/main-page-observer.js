// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  // Observer implementation stays decoupled from the scheduler's private state.
  // Nothing is observed until main.js installs it on an enabled page.
  DS.installMainPageObserver = function installMainPageObserver(dependencies) {
    const {runtimeCounters, checkRouteChange, scheduleEssentialChatControls, messageRootMutationSets, scheduleChatStartupQuietResume, mutationsMayAffectChatListRows, scheduleSavedOpenedLane, shouldPauseHiddenTab, syncMessageEditGuards, mutationRemovedPersistentChatShortcut, mutationRemovedPersistentChatHeaderControl, mutationAddedNativeChatHeader, mutationIsOnlyQolUi, mutationsAddOrRemoveMessageRoots, mutationIsMessageScoped, mutationTouchesNativeChatHeader, mutationsAreComposerOnly, collectMessageCacheMutationTargets, nodeInsidePendingMessageEdit, updateLoadedChatMessageCountFromMutations, addedMessageRootCount, runtimeProfile, isLikelyHistoryInsertionBurst, scheduleChatHistoryBatchRefresh, loadedChatMessageCount, isCardListingContext, mutationsMayAffectCards, mutationsAreChatLocal, mutationsAddBotCards} = dependencies;
    DS.observePage = function observePage() {
    if (DS.isQolPausedForTab?.()) return;
    let lastNonCardListingScheduleAt = 0;
    const CHAT_VISIBILITY_DIAGNOSTIC_KEY = "dsQolChatVisibilitySummary";
    const CHAT_VISIBILITY_FIELDS = [
      "chatUnexpectedEmptyTransitions", "chatUnexpectedEmptyRecovered", "chatUnexpectedEmptyUnresolved",
      "chatUnexpectedEmptyLastAt", "chatUnexpectedEmptyLastBefore", "chatUnexpectedEmptyLastAfter",
      "chatUnexpectedEmptyLastRecoveryMs", "chatUnexpectedEmptyLastVisibility", "chatUnexpectedEmptyLastGeneration"
    ];
    function persistEmptySummary() {
      try {
        const counters = runtimeCounters();
        const summary = { savedAt: Date.now() };
        for (const key of CHAT_VISIBILITY_FIELDS) summary[key] = counters[key] ?? null;
        sessionStorage.setItem(CHAT_VISIBILITY_DIAGNOSTIC_KEY, JSON.stringify(summary));
      } catch { /* Diagnostics must never interrupt SpicyChat. */ }
    }
    try {
      const summary = JSON.parse(sessionStorage.getItem(CHAT_VISIBILITY_DIAGNOSTIC_KEY) || "null");
      if (summary && Date.now() - Number(summary.savedAt || 0) < 24 * 60 * 60 * 1000) {
        const counters = runtimeCounters();
        for (const key of CHAT_VISIBILITY_FIELDS) {
          if (summary[key] != null && counters[key] == null) counters[key] = summary[key];
        }
      }
    } catch { /* Ignore missing or malformed previous summaries. */ }
    // Only check again after a suspicious disappearance, never poll normal chats.
    let emptyWatch = null;
    let emptyWatchTimer = 0;
    function stopEmptyWatch() {
      if (emptyWatchTimer) clearTimeout(emptyWatchTimer);
      emptyWatchTimer = 0;
      emptyWatch = null;
    }
    function checkEmptyRecovery() {
      if (!emptyWatch) return;
      const watch = emptyWatch;
      if (location.pathname !== watch.route || !DS.isSingleChatPage?.()) {
        stopEmptyWatch();
        return;
      }
      // Read actual roots after React settles. No message content is inspected.
      const mounted = document.querySelectorAll("div[id^='message-']").length;
      if (mounted > 0) {
        const counters = runtimeCounters();
        counters.chatUnexpectedEmptyRecovered = Number(counters.chatUnexpectedEmptyRecovered || 0) + 1;
        counters.chatUnexpectedEmptyLastRecoveryMs = Date.now() - watch.at;
        counters.chatUnexpectedEmptyLastAfter = mounted;
        persistEmptySummary();
        DS.diagPerformance?.("chat-message-roots-recovered", {
          afterMessages: mounted, elapsedMs: counters.chatUnexpectedEmptyLastRecoveryMs
        });
        stopEmptyWatch();
      } else if (Date.now() - watch.at >= 4500) {
        const counters = runtimeCounters();
        counters.chatUnexpectedEmptyUnresolved = Number(counters.chatUnexpectedEmptyUnresolved || 0) + 1;
        counters.chatUnexpectedEmptyLastAfter = 0;
        persistEmptySummary();
        DS.diagPerformance?.("chat-message-roots-still-empty", {
          elapsedMs: Date.now() - watch.at, visibility: document.visibilityState
        });
        stopEmptyWatch();
      } else {
        emptyWatchTimer = setTimeout(checkEmptyRecovery, 1600);
      }
    }
    function checkGenerationState() {
      try {
        if (typeof DS.isGenerationActive === "function") return DS.isGenerationActive() ? "active" : "inactive";
        if (typeof DS.isChatGenerationActive === "function") return DS.isChatGenerationActive() ? "active" : "inactive";
      } catch {}
      return "unknown";
    }
    const observer = new MutationObserver(mutations => {
      if (DS.isQolPausedForTab?.()) return;
      const callbackStartedAt = performance.now();
      try {
      const counters = runtimeCounters();
      counters.observerBatches = Number(counters.observerBatches || 0) + 1;
      counters.mutations += mutations.length;
      if (checkRouteChange()) {
        stopEmptyWatch();
        return;
      }

      if (DS.isSingleChatPage?.()) {
        const roots = new Set();
        let composerMounted = false;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes || []) {
            if (!(node instanceof Element)) continue;
            if (node.matches?.("textarea")) composerMounted = true;
            const directRoot = node.matches?.("div[id^='message-']")
              ? node : node.closest?.("div[id^='message-']");
            if (directRoot && (node === directRoot || node.matches?.("button[aria-label='message-dropdown']"))) {
              roots.add(directRoot);
            }
            if (!directRoot && node.childElementCount <= 12) {
              const dropdown = node.querySelector?.("button[aria-label='message-dropdown']");
              if (dropdown) {
                const root = dropdown.closest("div[id^='message-']");
                if (root) roots.add(root);
              }
              if (!composerMounted && node.querySelector?.("textarea")) composerMounted = true;
            }
            if (roots.size >= 16) break;
          }
          if (roots.size >= 16) break;
        }
        if (roots.size || composerMounted) scheduleEssentialChatControls("native-toolbar-mount", roots);
      }

      if (DS.isSingleChatPage?.() && Number(DS.state?.chatStartupQuietUntil || 0) > Date.now()) {
        const changedMessages = messageRootMutationSets(mutations);
        if (changedMessages.added.size || changedMessages.removed.size) {
          DS.state.chatStartupLastMessageMutationAt = Date.now();
          scheduleChatStartupQuietResume("history-mutation");
        }
      }

      // Chat-list population is data/state work, not cosmetic work. Schedule its
      // tiny lane before hidden-tab/performance early returns so saved/opened
      // status cannot become stale when React fills the list in the background.
      if (mutationsMayAffectChatListRows(mutations)) {
        scheduleSavedOpenedLane("chat-list-mutation", 160);
      }

      // Product-update auto-read must be able to run while the page is hidden.
      // The normal slow lane intentionally sleeps in background tabs, so only
      // wake this tiny targeted path when AnnounceKit/notification DOM changed.
      if (
        document.hidden &&
        DS.state?.settings?.autoReadNotifications &&
        DS.mutationsMayAffectNotifications?.(mutations)
      ) {
        DS.maybeAutoReadNotifications?.("notification-dom-mutation");
      }

      if (shouldPauseHiddenTab()) return;

      // Detect native message edit mode before any QoL feature sees the changed
      // subtree. This is intentionally event-driven (no edit polling loop).
      syncMessageEditGuards(mutations);

      const persistentChatShortcutRemoved = mutations.some(mutationRemovedPersistentChatShortcut);
      if (persistentChatShortcutRemoved) {
        // React sometimes removes only our injected composer shortcut while
        // rebuilding the text box. QoL-only mutations are normally ignored to
        // prevent observer loops, so explicitly repair persistent chat controls.
        DS.scheduleRun?.({
          priority: "critical",
          immediate: true,
          source: "persistent-chat-shortcut-removed"
        });
      }

      const persistentChatHeaderRemoved = DS.isSingleChatPage?.() && mutations.some(mutationRemovedPersistentChatHeaderControl);
      const nativeChatHeaderAdded = DS.isSingleChatPage?.() && mutations.some(mutationAddedNativeChatHeader);
      if (persistentChatHeaderRemoved || nativeChatHeaderAdded) {
        counters.chatHeaderRepairRequests = Number(counters.chatHeaderRepairRequests || 0) + 1;
        counters.lastChatHeaderRepairSource = persistentChatHeaderRemoved ? "QoL controls removed" : "native header mounted";
        // The chat header is frequently remounted as one React subtree. When
        // that happens, all injected title buttons can disappear in the same
        // QoL-only removal batch, which used to be intentionally ignored by
        // the observer. Repair the interactive header immediately instead of
        // waiting for an unrelated later mutation/slow cosmetic pass.
        DS.scheduleRun?.({
          priority: "critical",
          immediate: true,
          source: persistentChatHeaderRemoved ? "persistent-chat-header-removed" : "native-chat-header-mounted"
        });
      }

      // QoL can add/remove several ds-* nodes in the same observer delivery as
      // a real SpicyChat mutation. Previously a mixed batch made the full batch
      // look native and could wake the scheduler again because of our own UI.
      // Persistent-control repair has already inspected the original batch, so
      // strip QoL-owned records before deciding what page work is actually due.
      const nativeMutations = mutations.filter(mutation => !mutationIsOnlyQolUi(mutation));
      const ignoredQolMutations = mutations.length - nativeMutations.length;
      if (ignoredQolMutations > 0) {
        counters.qolOnlyMutations += ignoredQolMutations;
        if (!nativeMutations.length) {
          counters.observerQolOnlyBatches = Number(counters.observerQolOnlyBatches || 0) + 1;
          return;
        }
        counters.observerMixedQolBatches = Number(counters.observerMixedQolBatches || 0) + 1;
        mutations = nativeMutations;
      }

      const isChatPage = !!DS.isSingleChatPage?.();
      const messageRootsChanged = isChatPage ? mutationsAddOrRemoveMessageRoots(mutations) : false;
      const nonMessageMutations = isChatPage ? mutations.filter(mutation => !mutationIsMessageScoped(mutation)) : mutations;
      // Model/banner invalidation is intentionally evaluated only against
      // non-message mutations. A newly mounted/re-rendered chat message must
      // never make either global UI feature inspect the chat tree.
      const modelSelectorMutation = isChatPage && nonMessageMutations.length > 0 && !!DS.modelSelectorMutationsRelevant?.(nonMessageMutations);
      const advertBannerMutation = nonMessageMutations.length > 0 && !!DS.advertBannerMutationsRelevant?.(nonMessageMutations);
      const chatHeaderMutation = isChatPage && nonMessageMutations.some(mutationTouchesNativeChatHeader);

      // Contenteditable composers can emit many tiny character/child mutations
      // while the user types. Persistent shortcut/header repair has already run
      // above, and no saved-message root changed, so there is nothing for the
      // QoL message lane to process yet. Wait for the actual sent message/other
      // page mutation instead of waking chat features for each composer update.
      if (!messageRootsChanged && isChatPage && mutationsAreComposerOnly(mutations)) {
        counters.composerOnlyMutationSkips = Number(counters.composerOnlyMutationSkips || 0) + mutations.length;
        DS.state.lastChatMutationAt = Date.now();
        return;
      }

      // Collapse all nested text/span mutations in the same message to one cache
      // invalidation target. During token streaming one rendered message can
      // produce many nested mutation records; invalidating the same message for
      // each node only creates counter churn and extra DOM walking.
      if (isChatPage) {
        const summary = collectMessageCacheMutationTargets(mutations);
        counters.messageCacheMutationCandidateNodes = Number(counters.messageCacheMutationCandidateNodes || 0) + summary.candidateNodes;
        counters.messageCacheMutationRoots = Number(counters.messageCacheMutationRoots || 0) + summary.roots.size;
        counters.messageCacheMutationNodesCollapsed = Number(counters.messageCacheMutationNodesCollapsed || 0) + Math.max(0, summary.candidateNodes - summary.roots.size);
        for (const root of summary.roots) {
          if (nodeInsidePendingMessageEdit(root)) {
            counters.messageEditMutationSkips = Number(counters.messageEditMutationSkips || 0) + 1;
            continue;
          }
          if (summary.textRoots.has(root)) {
            DS.invalidateMessageCacheForNode?.(root);
          } else {
            DS.markMessageRootDirty?.(root);
            counters.messageCacheNonTextSkips = Number(counters.messageCacheNonTextSkips || 0) + 1;
          }
        }
      }

      if (messageRootsChanged) {
        const previousMounted = loadedChatMessageCount();
        updateLoadedChatMessageCountFromMutations(mutations);
        const currentMounted = loadedChatMessageCount();
        if (emptyWatch) checkEmptyRecovery();
        if (previousMounted >= 3 && currentMounted === 0 && !DS.state?.bulkChatHistoryLoadActive && !emptyWatch) {
          const at = Date.now();
          counters.chatUnexpectedEmptyTransitions = Number(counters.chatUnexpectedEmptyTransitions || 0) + 1;
          counters.chatUnexpectedEmptyLastAt = at;
          counters.chatUnexpectedEmptyLastBefore = previousMounted;
          counters.chatUnexpectedEmptyLastAfter = 0;
          counters.chatUnexpectedEmptyLastVisibility = document.visibilityState;
          counters.chatUnexpectedEmptyLastGeneration = checkGenerationState();
          emptyWatch = { at, route: location.pathname };
          persistEmptySummary();
          emptyWatchTimer = setTimeout(checkEmptyRecovery, 1300);
          // Report DOM state only. Do not force reload or collect message text/IDs.
          DS.diagPerformance?.("chat-message-roots-unmounted", {
            beforeMessages: previousMounted, afterMessages: 0,
            visibility: document.visibilityState, generation: counters.chatUnexpectedEmptyLastGeneration
          });
        }
      }

      // Loading previous chat history can prepend dozens of message roots in a
      // burst. Debounce QoL work until that batch settles instead of rescanning
      // the growing chat after every React insertion. This also covers manual
      // use of SpicyChat's own Load Previous Messages button.
      const addedRoots = isChatPage ? addedMessageRootCount(mutations) : 0;
      if (isChatPage && addedRoots > 0 && addedRoots < 3 && !DS.state.bulkChatHistoryLoadActive) {
        // A normal newly-mounted user/AI message gets a short native-render-first
        // window. Message decoration and performance folding resume afterwards.
        const now = Date.now();
        const quietMs = runtimeProfile() === "maximum" ? 1900 : runtimeProfile() === "aggressive" ? 1650 : 1350;
        DS.state.chatReplyRenderQuietUntil = Math.max(Number(DS.state.chatReplyRenderQuietUntil || 0), now + quietMs);
        DS.state.chatEnhancerQuietUntil = Math.max(Number(DS.state.chatEnhancerQuietUntil || 0), now + quietMs);
        counters.replyRenderQuietWindows = Number(counters.replyRenderQuietWindows || 0) + 1;
        DS.diagPerformance?.("reply-quiet-start", { durationTargetMs: quietMs, addedMessageRoots: addedRoots, profile: runtimeProfile() });
      }
      if (
        !DS.state.bulkChatHistoryLoadActive &&
        isChatPage &&
        (addedRoots >= 3 || isLikelyHistoryInsertionBurst(addedRoots))
      ) {
        scheduleChatHistoryBatchRefresh();
        return;
      }
      if (isChatPage && Date.now() < Number(DS.state.chatHistoryBatchUntil || 0)) {
        scheduleChatHistoryBatchRefresh();
        return;
      }

      if (DS.state.bulkChatHistoryLoadActive) {
        // The bulk loader deliberately pauses broad reconciliation. Keep the
        // dirty message roots/counts, but collapse structural cache invalidation
        // to one revision bump when the full load finishes.
        DS.state.bulkChatHistoryLoadNeedsRefresh = true;
        return;
      }

      const chatLocal = isChatPage && runtimeProfile() !== "normal" && mutationsAreChatLocal(mutations);
      if (chatLocal) {
        const now = Date.now();
        DS.state.lastChatMutationAt = now;
        if (DS.state?.settings?.chatPerformanceMode && loadedChatMessageCount() >= 80) {
          const profile = runtimeProfile();
          const quietMs = profile === "maximum" ? 1400 : (profile === "aggressive" ? 1150 : 950);
          DS.state.chatEnhancerQuietUntil = Math.max(Number(DS.state.chatEnhancerQuietUntil || 0), now + quietMs);
          counters.chatEnhancerQuietExtensions = Number(counters.chatEnhancerQuietExtensions || 0) + 1;
          DS.diagPerformance?.("reply-quiet-extend", { durationTargetMs: quietMs, profile });
        }
      }

      // Keep the expensive whole-page DOM revision stable during token streaming.
      // A real message-root add/remove still bumps it so static long-chat classes
      // and other structure caches refresh, while text edits use messageTextRevision.
      const cardListing = !isChatPage && isCardListingContext();
      // A blocked ID is authoritative even during the 2-minute refresh batch.
      // This checks only added/updated links, not the other 48+ listing cards.
      if (cardListing) DS.hideBlockedCardMounts?.(mutations);
      const affectsCards = cardListing ? mutationsMayAffectCards(mutations) : false;
      if (cardListing && affectsCards) DS.markListingDirtyCards?.(mutations);
      if (chatLocal) {
        if (messageRootsChanged) DS.bumpDomRevision?.();
      } else if (!cardListing || affectsCards) {
        DS.bumpDomRevision?.();
      }

      // Most message streaming/edit mutations only need the direct chat lane.
      // Do not wake sidebar/cards/cosmetic work for every token/textarea change.
      if (chatLocal) {
        counters.chatLocalMutations += mutations.length;
        DS.scheduleMessageLane?.("chat-local-mutation");
      } else if (
        cardListing &&
        affectsCards &&
        Date.now() < Number(DS.state.blockingMutationQuietUntil || 0) &&
        !mutationsAddBotCards(mutations)
      ) {
        // A single block already updates storage and hides the clicked card.
        // Ignore the immediate removal/reflow observer burst; the two-minute
        // settled block refresh still performs the complete listing repair. New
        // cards are never ignored, so refill/infinite-load remains responsive.
        counters.blockedBotMutationSkips = Number(counters.blockedBotMutationSkips || 0) + mutations.length;
      } else if (cardListing && !affectsCards) {
        // Non-card listing mutations (banner timers, counters, lazy UI, etc.) do
        // not need the critical card-filter lane. Keep them in the throttled
        // cosmetic lane instead of rescanning every loaded bot card.
        counters.listingNonCardCriticalSkips = Number(counters.listingNonCardCriticalSkips || 0) + 1;
        const now = Date.now();
        if (now - lastNonCardListingScheduleAt >= 1800) {
          lastNonCardListingScheduleAt = now;
          DS.scheduleRun?.({ priority: "slow", source: "listing-non-card-mutation" });
        } else {
          counters.listingNonCardCoalesced = Number(counters.listingNonCardCoalesced || 0) + 1;
        }
      } else if (isChatPage) {
        // Chat DOM changes still get the interactive/critical repair lane, but
        // the slow lane is invalidation-driven. A new message or unrelated
        // React mutation must not wake Model Selector / Advert Banners.
        DS.scheduleRun?.({ priority: "critical", source: "dom-mutation" });
        const dirty = [];
        if (chatHeaderMutation) {
          dirty.push("interface", "chat-chrome", "model");
          DS.markModelSelectorDirty?.("chat-header-mutation");
        }
        if (modelSelectorMutation && !dirty.includes("model")) dirty.push("model");
        if (advertBannerMutation) dirty.push("adverts");
        if (dirty.length) {
          DS.scheduleRun?.({ priority: "slow", source: "chat-targeted-mutation", dirty });
        } else {
          counters.chatUnrelatedSlowPassSkips = Number(counters.chatUnrelatedSlowPassSkips || 0) + 1;
          DS.diagScheduler?.("skipped", { lane: "slow", reason: "chat-mutation-no-slow-dirty" });
        }
      } else {
        DS.scheduleRun?.({ source: "dom-mutation" });
      }
      } finally {
        const elapsedMs = performance.now() - callbackStartedAt;
        // Track only actual expensive callbacks; no message contents are read.
        if (elapsedMs >= 24) {
          const perf = runtimeCounters();
          perf.heavyPageObserverCallbacks = Number(perf.heavyPageObserverCallbacks || 0) + 1;
          perf.pageObserverWorstMs = Math.max(Number(perf.pageObserverWorstMs || 0), Math.round(elapsedMs * 10) / 10);
          DS.diagPerformance?.("page-observer-slow", { durationMs: Math.round(elapsedMs * 10) / 10,
            mutationCount: mutations.length, chat: !!DS.isSingleChatPage?.() });
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      // React may recycle the same anchor for another bot without adding a node.
      // Track only href changes; other attributes (especially QoL classes) remain ignored.
      attributes: true,
      attributeFilter: ["href"],
      subtree: true
    });

    // SPA navigation normally changes the DOM and is caught above. An
    // unfocused tab does not need route polling every 2s: its observer still
    // handles real DOM navigation, and main.js checks the route on visibility.
    setInterval(() => {
      if (document.hidden || DS.isQolPausedForTab?.()) {
        const perf = DS.state?.runtimePerformance;
        if (perf) perf.hiddenRoutePollSkips = Number(perf.hiddenRoutePollSkips || 0) + 1;
        return;
      }
      checkRouteChange();
    }, 2000);
  };
  };
})();

}
