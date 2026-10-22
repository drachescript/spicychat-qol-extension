// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const { normalizeSlowDirtyGroups, slowDirtyHas, blockedStoreChangeStats } = DS.mainSchedulerUtils;
  const { nodeIsOrContainsChatMessage, mutationIsMessageScoped, mutationsAreComposerOnly, mutationsAreChatLocal, mutationsAddOrRemoveMessageRoots, addedMessageRootCount, messageRootForMutationNode, collectMessageCacheMutationTargets } = DS.mainMessageMutations;

  let lastChatDropdownClick = 0;
  let pauseRerunsUntil = 0;
  let pauseRerunTimer = null;
  let criticalTimer = null;
  let messageLaneTimer = null;
  let messageLaneDueAt = 0;
  let messageLaneRunning = false;
  let messageLanePending = false;
  let slowTimer = null;
  let slowScheduledAt = 0;
  let slowQuietTimer = null;
  let messageEnhancerQuietTimer = null;
  let idleHandle = null;
  let criticalRunning = false;
  let criticalPending = false;
  let slowRunning = false;
  let slowPending = false;
  let chatMessageCountCache = { route: "", count: 0, dirty: true };
  let chatHistoryBatchTimer = null;
  let chatHistoryMutationBurst = { lastAt: 0, count: 0 };
  let routePresentationRecoveryTimers = [];
  let savedOpenedLaneTimer = null;
  let savedOpenedLaneRunning = false;
  let savedOpenedLanePending = false;
  let blockedRefreshTimer = null;
  let blockedRefreshUntil = 0;
  const BLOCKED_REFRESH_IDLE_MS = 120000;
  const NATIVE_SCROLL_TOP_STYLE_ID = "ds-hide-native-scroll-back-to-top";
  const messageEditSettleTimers = new Map();
  const slowStepThrottle = new Map();
  const CREATOR_PROFILE_STARTUP_QUIET_MS = 5000;
  const SLOW_SLICE_BUDGET_MS = 10;
  let creatorProfileQuietTimer = 0;
  const slowDirtyGroups = new Set(["all"]);
  let slowSliceState = null;

  function markSlowDirty(groups, source = "runtime") {
    const clean = normalizeSlowDirtyGroups(groups);
    if (!clean.length) return false;
    if (clean.includes("all")) {
      slowDirtyGroups.clear();
      slowDirtyGroups.add("all");
    } else if (!slowDirtyGroups.has("all")) {
      clean.forEach(group => slowDirtyGroups.add(group));
    }
    const counters = runtimeCounters();
    counters.slowDirtyInvalidations = Number(counters.slowDirtyInvalidations || 0) + 1;
    counters.lastSlowDirtySource = String(source || "runtime").slice(0, 120);
    counters.lastSlowDirtyGroups = [...slowDirtyGroups].join(",");
    return true;
  }

  function takeSlowDirtyGroups(options = {}) {
    if (options.force) {
      slowDirtyGroups.clear();
      return new Set(["all"]);
    }
    if (!slowDirtyGroups.size) return new Set();
    const snapshot = new Set(slowDirtyGroups);
    slowDirtyGroups.clear();
    return snapshot;
  }

  async function maybeYieldSlowSlice(stepName = "slow-step") {
    // The saved/opened, message and critical lanes share runStep(), but they
    // must not use the slow lane's slice budget or change its timing state.
    if (!slowRunning || criticalRunning || messageLaneRunning || savedOpenedLaneRunning) return;
    const slice = slowSliceState;
    if (!slice || typeof performance === "undefined") return;
    const now = performance.now();
    const elapsed = Math.max(0, now - Number(slice.sliceStarted || now));
    if (elapsed < SLOW_SLICE_BUDGET_MS) return;
    slice.activeMs += elapsed;
    slice.slices += 1;
    DS.diagScheduler?.("deferred", {
      lane: "slow",
      reason: "slice-budget",
      afterStep: String(stepName || "slow-step").slice(0, 100),
      activeSliceMs: Math.round(elapsed * 10) / 10,
      budgetMs: SLOW_SLICE_BUDGET_MS
    });
    await new Promise(resolve => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
    // Another lane can finish the slow pass while the frame is pending.
    // Never write through the global after await: it may now be null or a
    // state object belonging to a newer slow pass.
    if (slowSliceState === slice) slice.sliceStarted = performance.now();
  }

  function creatorProfileStartupQuietActive() {
    return Date.now() < Number(DS.state?.creatorProfileStartupQuietUntil || 0);
  }

  function scheduleCreatorProfileQuietResume() {
    if (!creatorProfileStartupQuietActive()) return;
    clearTimeout(creatorProfileQuietTimer);
    const delay = Math.max(80, Number(DS.state.creatorProfileStartupQuietUntil || 0) - Date.now() + 80);
    creatorProfileQuietTimer = setTimeout(() => {
      creatorProfileQuietTimer = 0;
      DS.scheduleRun?.({ priority: "critical", source: "creator-profile-startup-settled" });
      DS.scheduleRun?.({ priority: "slow", source: "creator-profile-startup-settled" });
    }, delay);
  }

  function startCreatorProfileStartupQuietWindow(source = "route") {
    const page = DS.getPageState?.() || {};
    const heavyCreatorRoute = !!(page.isBotEditor || page.isBotProfilePage);
    if (!heavyCreatorRoute) {
      DS.state.creatorProfileStartupQuietUntil = 0;
      clearTimeout(creatorProfileQuietTimer);
      creatorProfileQuietTimer = 0;
      return;
    }
    DS.state.creatorProfileStartupQuietUntil = Date.now() + CREATOR_PROFILE_STARTUP_QUIET_MS;
    const counters = runtimeCounters();
    counters.creatorProfileStartupQuietStarts = Number(counters.creatorProfileStartupQuietStarts || 0) + 1;
    counters.creatorProfileStartupQuietUntil = DS.state.creatorProfileStartupQuietUntil;
    counters.creatorProfileStartupQuietSource = String(source || "route");
    scheduleCreatorProfileQuietResume();
  }

  function isMyCreationsChatbotsPage() {
    return !!DS.getPageState?.().isMyCreationsChatbotsPage;
  }

  function removeMyCreationsBlockButtons() {
    if (!isMyCreationsChatbotsPage()) return 0;
    let removed = 0;
    document.querySelectorAll(".ds-card-block-button").forEach(button => {
      button.remove();
      removed += 1;
    });
    return removed;
  }

  function installMyCreationsBlockButtonGuard() {
    if (DS.__myCreationsBlockButtonGuardInstalled) return;
    const original = DS.applyCardBlockButtons;
    if (typeof original !== "function") return;

    DS.applyCardBlockButtons = function guardedApplyCardBlockButtons(...args) {
      const settings = DS.state?.settings || {};
      if (isMyCreationsChatbotsPage() && !settings.showBlockButtonOnMyCreations) {
        removeMyCreationsBlockButtons();
        return undefined;
      }
      return original.apply(this, args);
    };

    DS.__myCreationsBlockButtonGuardInstalled = true;
  }

  installMyCreationsBlockButtonGuard();

  function syncNativeScrollBackToTopVisibility() {
    const settings = DS.state?.settings || {};
    const shouldHide = !!(settings.enabled && settings.showScrollToTopButton);
    let style = document.getElementById(NATIVE_SCROLL_TOP_STYLE_ID);

    if (!shouldHide) {
      style?.remove();
      return;
    }

    if (!style) {
      style = document.createElement("style");
      style.id = NATIVE_SCROLL_TOP_STYLE_ID;
      style.textContent = 'button[aria-label="scroll-back-to-top"]{display:none!important;}';
      (document.head || document.documentElement).appendChild(style);
    }
  }

  function clearBlockedRefreshBatch() {
    clearTimeout(blockedRefreshTimer);
    blockedRefreshTimer = null;
    blockedRefreshUntil = 0;
    DS.state.blockingMutationQuietUntil = 0;
    const counters = runtimeCounters();
    counters.blockedBotRefreshPending = 0;
    counters.blockedBotRefreshSettleAt = 0;
  }

  function scheduleBlockedRefreshAfterBurst(source = "blocked-storage") {
    clearTimeout(blockedRefreshTimer);
    blockedRefreshUntil = Date.now() + BLOCKED_REFRESH_IDLE_MS;
    // The clicked card has already been hidden immediately. Give React and the
    // listing DOM a short quiet window so the global observer does not wake the
    // entire listing pipeline for the removal animation/reflow after every X.
    DS.state.blockingMutationQuietUntil = Date.now() + 1600;
    const counters = runtimeCounters();
    counters.blockedBotRefreshDeferrals = Number(counters.blockedBotRefreshDeferrals || 0) + 1;
    counters.blockedBotRefreshPending = 1;
    counters.blockedBotRefreshSettleAt = blockedRefreshUntil;

    blockedRefreshTimer = window.setTimeout(() => {
      blockedRefreshTimer = null;
      blockedRefreshUntil = 0;
      const settled = runtimeCounters();
      settled.blockedBotRefreshPending = 0;
      settled.blockedBotRefreshSettleAt = 0;
      settled.blockedBotRefreshFlushes = Number(settled.blockedBotRefreshFlushes || 0) + 1;
      DS.scheduleRun?.({ priority: "critical", source: `${source}-settled` });
      DS.scheduleRun?.({ priority: "slow", source: `${source}-settled` });
    }, BLOCKED_REFRESH_IDLE_MS);
  }

  function pauseReruns(ms = 6500) {
    pauseRerunsUntil = Math.max(pauseRerunsUntil, Date.now() + ms);

    clearTimeout(pauseRerunTimer);
    pauseRerunTimer = setTimeout(() => {
      DS.scheduleRun?.({ priority: "critical", source: "menu-settled" });
      DS.scheduleRun?.({ priority: "slow", source: "menu-settled" });
    }, ms + 150);
  }

  function messageEditorInside(root) {
    return root?.querySelector?.("textarea, [contenteditable='true']") || null;
  }

  function messageEditTimerKey(root) {
    return String(root?.id || root?.dataset?.dsEditGuardKey || "");
  }

  function clearMessageEditSettleTimer(root) {
    const key = messageEditTimerKey(root);
    if (!key) return;
    const timer = messageEditSettleTimers.get(key);
    if (timer) clearTimeout(timer);
    messageEditSettleTimers.delete(key);
  }

  function finalizeMessageEditGuard(root, source = "settled") {
    if (!root) return;
    clearMessageEditSettleTimer(root);
    try { delete root.dataset.dsEditSavePending; } catch {}
    try { delete root.dataset.dsEditGuardSource; } catch {}
    try { delete root.dataset.dsEditGuardKey; } catch {}
    DS.state.activeMessageEditRoots?.delete?.(root);
    try { DS.invalidateMessageCacheForNode?.(root); } catch {}

    const counters = runtimeCounters();
    counters.messageEditGuardsSettled = Number(counters.messageEditGuardsSettled || 0) + 1;

    const delay = Math.max(60, Number(pauseRerunsUntil || 0) - Date.now() + 80);
    window.setTimeout(() => {
      if (!root?.isConnected || messageEditorInside(root)) return;
      DS.scheduleMessageLane?.(`message-edit-${source}`);
      DS.scheduleRun?.({ priority: "slow", source: `message-edit-${source}` });
    }, delay);
  }

  function prepareEditedMessageForSave(root, source = "editor") {
    if (!root?.isConnected) return;

    const activeRoots = DS.state.activeMessageEditRoots || (DS.state.activeMessageEditRoots = new Set());
    activeRoots.add(root);
    clearMessageEditSettleTimer(root);

    const alreadyPending = root.dataset.dsEditSavePending === "1";
    root.dataset.dsEditSavePending = "1";
    root.dataset.dsEditGuardSource = source;
    if (root.id) root.dataset.dsEditGuardKey = root.id;

    if (alreadyPending) {
      if (source === "save") pauseReruns(900);
      return;
    }

    const counters = runtimeCounters();
    counters.messageEditGuardsStarted = Number(counters.messageEditGuardsStarted || 0) + 1;

    // Remove only QoL display transforms before SpicyChat/React owns the editor.
    // This prevents a slow installed/PWA render from leaving a formatted clone of
    // the old message visible beside the native edit UI.
    try { DS.prepareRpFormatRepairMessageForEdit?.(root); } catch {}
    try { DS.prepareAlternateDialogueMessageForEdit?.(root); } catch {}
    try { DS.restoreChatTextReplacementsForMessage?.(root); } catch {}
    try { DS.invalidateMessageCacheForNode?.(root); } catch {}

    // Entry into edit mode only needs a very short quiet period. Save gets a bit
    // longer because high-latency React updates can keep the old tree around.
    pauseReruns(source === "save" ? 900 : 260);
  }

  function scheduleMessageEditGuardFinalize(root, source = "settled") {
    if (!root?.isConnected || root.dataset.dsEditSavePending !== "1") return;
    if (messageEditorInside(root)) {
      clearMessageEditSettleTimer(root);
      return;
    }

    const key = messageEditTimerKey(root);
    if (!key) return finalizeMessageEditGuard(root, source);
    clearMessageEditSettleTimer(root);
    const delay = desktopAppPerformanceGuardActive() ? 320 : 180;
    const timer = window.setTimeout(() => {
      messageEditSettleTimers.delete(key);
      if (!root?.isConnected) {
        DS.state.activeMessageEditRoots?.delete?.(root);
        return;
      }
      if (messageEditorInside(root)) return;
      finalizeMessageEditGuard(root, source);
    }, delay);
    messageEditSettleTimers.set(key, timer);
  }

  function messageRootFromNode(node) {
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el) return null;
    if (el.matches?.("div[id^='message-']")) return el;
    return el.closest?.("div[id^='message-']") || null;
  }

  function syncMessageEditGuards(mutations) {
    if (!DS.isSingleChatPage?.()) return;
    const roots = new Set();
    for (const mutation of mutations || []) {
      // Plain streaming text mutations cannot create an editor. Inspect only
      // structural additions or a root already in the edit lifecycle.
      const targetRoot = messageRootFromNode(mutation.target);
      if (targetRoot?.dataset.dsEditSavePending === "1") roots.add(targetRoot);
      if (mutation.type !== "childList" || !mutation.addedNodes?.length) continue;
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        const possibleEditor = node.matches?.("textarea, [contenteditable='true']")
          || (node.childElementCount <= 16 && !!node.querySelector?.("textarea, [contenteditable='true']"));
        if (!possibleEditor) continue;
        const direct = messageRootFromNode(node) || targetRoot;
        if (direct) roots.add(direct);
        // A new message subtree can include multiple editable roots, but
        // searching the whole chat after every token is unnecessary.
        if (node.matches?.("div[id^='message-']")) roots.add(node);
        node.querySelectorAll?.("div[id^='message-'] textarea, div[id^='message-'] [contenteditable='true']").forEach(editor => {
          const root = messageRootFromNode(editor);
          if (root) roots.add(root);
        });
      }
    }

    for (const root of roots) {
      if (!root?.isConnected) continue;
      if (messageEditorInside(root)) prepareEditedMessageForSave(root, "editor");
      else if (root.dataset.dsEditSavePending === "1") scheduleMessageEditGuardFinalize(root, "settled");
    }
  }

  function nodeInsidePendingMessageEdit(node) {
    const root = messageRootFromNode(node);
    return !!(root && (root.dataset.dsEditSavePending === "1" || messageEditorInside(root)));
  }

  DS.hasActiveMessageEditor = function hasActiveMessageEditor() {
    const roots = DS.state.activeMessageEditRoots || (DS.state.activeMessageEditRoots = new Set());
    for (const root of [...roots]) {
      if (!root?.isConnected || !messageEditorInside(root)) roots.delete(root);
    }
    if (roots.size) return true;
    const editor = document.querySelector("div[id^='message-'] textarea, div[id^='message-'] [contenteditable='true']");
    const root = editor?.closest?.("div[id^='message-']");
    if (root) {
      roots.add(root);
      return true;
    }
    return false;
  };

  function scheduleChatHistoryBatchRefresh() {
    const counters = runtimeCounters();
    if (!chatHistoryBatchTimer) counters.historyBatches = Number(counters.historyBatches || 0) + 1;
    const quietMs = loadedChatMessageCount() >= 250 ? 1450 : 1100;
    DS.state.chatHistoryBatchUntil = Date.now() + quietMs;
    counters.historyBatchDeferrals = Number(counters.historyBatchDeferrals || 0) + 1;
    document.documentElement.classList.add("ds-qol-history-loading");
    clearTimeout(chatHistoryBatchTimer);
    chatHistoryBatchTimer = setTimeout(() => {
      chatHistoryBatchTimer = null;
      DS.state.chatHistoryBatchUntil = 0;
      if (!DS.state.bulkChatHistoryLoadActive) document.documentElement.classList.remove("ds-qol-history-loading");
      DS.bumpDomRevision?.();
      // One message-lane wake is enough here. In Normal mode it routes through
      // the critical lane; adaptive modes process the dirty message roots
      // directly and schedule the slower cosmetic lane after the chat is quiet.
      DS.scheduleMessageLane?.("history-batch-settled");
    }, quietMs + 90);
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function normalizedText(el) {
    const text = String(el?.getAttribute?.("aria-label") || el?.textContent || "");
    return DS.normalize ? DS.normalize(text) : text.toLowerCase().replace(/\s+/g, " ").trim();
  }

  function isLoadPreviousMessagesButton(button) {
    if (!(button instanceof Element)) return false;
    if (button.querySelector?.("[data-translate-key='chat:page.action.loadPreviousMessages']")) return true;
    return normalizedText(button).includes("load previous messages");
  }

  function isChatDropdownMenuElement(el) {
    if (!el || el.closest?.("#ds-qol-panel, #ds-chat-export-modal")) return false;
    if (!isVisible(el)) return false;

    const buttons = DS.qsa?.("button", el) || [];
    if (!buttons.length) return false;

    const labels = buttons.map(normalizedText).filter(Boolean);

    return labels.some(text => (
      text.includes("start new chat") ||
      text.includes("share chatbot") ||
      text.includes("view saved chats") ||
      text.includes("change persona") ||
      text.includes("generation settings") ||
      text.includes("block creator") ||
      text.includes("disable memory") ||
      text.includes("enable memory")
    ));
  }

  document.addEventListener("pointerdown", event => {
    const target = event.target;
    const dropdownButton = target?.closest?.("button[aria-label='chat-dropdown']");
    const dropdownAction = target?.closest?.("button");
    const label = normalizedText(dropdownAction);

    if (isLoadPreviousMessagesButton(dropdownAction)) {
      scheduleChatHistoryBatchRefresh();
      return;
    }

    if (dropdownAction && label === "save") {
      const messageRoot = dropdownAction.closest?.("div[id^='message-']");
      const editing = messageRoot?.querySelector?.("textarea, [contenteditable='true']");
      if (messageRoot && editing) prepareEditedMessageForSave(messageRoot, "save");
    }

    if (dropdownButton) {
      lastChatDropdownClick = Date.now();
      pauseReruns(3500);
      return;
    }

    if (
      label.includes("start new chat") ||
      label.includes("view saved chats") ||
      label.includes("change persona") ||
      label.includes("generation settings") ||
      label.includes("share chatbot")
    ) {
      pauseReruns(7500);
    }
  }, true);

  document.addEventListener("click", event => {
    const button = event.target?.closest?.("button");
    const label = normalizedText(button);

    if (
      label.includes("start new chat") ||
      label.includes("view saved chats") ||
      label.includes("change persona") ||
      label.includes("generation settings") ||
      label.includes("share chatbot")
    ) {
      pauseReruns(7500);
    }
  }, true);

  DS.isChatHeaderMenuOpen = function isChatHeaderMenuOpen() {
    const button = DS.qs?.("button[aria-label='chat-dropdown']");

    if (button && isVisible(button)) {
      const expanded = button.getAttribute("aria-expanded") === "true" || button.dataset.state === "open";
      const justClicked = Date.now() - lastChatDropdownClick < 1500;

      if (expanded || justClicked) return true;
    }

    return (DS.qsa?.("[role='menu'], [role='dialog'], div.absolute, div.fixed") || [])
      .some(isChatDropdownMenuElement);
  };

  function rerunAfterMenuSettles() {
    clearTimeout(DS.state.chatHeaderMenuTimer);
    DS.state.chatHeaderMenuTimer = setTimeout(() => {
      DS.scheduleRun?.({ priority: "critical", source: "chat-menu" });
      DS.scheduleRun?.({ priority: "slow", source: "chat-menu" });
    }, 900);
  }

  function dedicatedBackgroundWorkerKind() {
    return String(
      DS.state?.qolBackgroundWorker ||
      document.documentElement?.getAttribute?.("data-ds-qol-background-worker") ||
      ""
    ).trim();
  }

  function shouldPauseHiddenTab() {
    const settings = DS.state?.settings || {};
    // QoL-owned API/helper workers are deliberately background work. Never let
    // the normal "pause QoL in hidden tabs" preference suspend their runtime.
    if (dedicatedBackgroundWorkerKind()) return false;
    return !!(settings.enabled && settings.pauseQolInHiddenTabs && document.hidden);
  }

  const CHAT_STARTUP_QUIET_MS = 20000;
  const CHAT_STARTUP_SETTLE_MIN_MS = 2500;
  const CHAT_STARTUP_LARGE_SETTLE_MIN_MS = 8000;
  const CHAT_STARTUP_LARGE_MESSAGE_COUNT = 35;
  const CHAT_STARTUP_SETTLED_IDLE_MS = 1800;
  const CHAT_STARTUP_LONG_TASK_IDLE_MS = 1500;
  const CHAT_STARTUP_WARMUP_MS = 25000;
  const DISCARDED_WAKE_VISIBLE_QUIET_MS = 8000;

  function discardedWakeSessionActive() {
    return !!(DS.state?.discardedWakeActive && DS.isSingleChatPage?.());
  }

  function noteDiscardedWakeVisible(source = "visible") {
    if (!discardedWakeSessionActive() || document.hidden) return false;
    const now = Date.now();
    if (!Number(DS.state.discardedWakeVisibleAt || 0)) {
      DS.state.discardedWakeVisibleAt = now;
      DS.state.discardedWakeMinUntil = now + DISCARDED_WAKE_VISIBLE_QUIET_MS;
      DS.state.chatStartupQuietUntil = Math.max(Number(DS.state.chatStartupQuietUntil || 0), now + CHAT_STARTUP_QUIET_MS);
      DS.state.chatStartupWarmupUntil = Math.max(Number(DS.state.chatStartupWarmupUntil || 0), now + CHAT_STARTUP_WARMUP_MS);
      DS.state.chatStartupLastMessageMutationAt = now;
      DS.runtimeLog?.("info", "performance", `Discarded chat tab became visible (${source})`, { quietMs: DISCARDED_WAKE_VISIBLE_QUIET_MS });
      DS.diagPerformance?.("discarded-wake-visible", { source: String(source || "visible"), quietMs: DISCARDED_WAKE_VISIBLE_QUIET_MS });
    }
    return true;
  }

  function finishDiscardedWake(reason = "settled") {
    if (!DS.state?.discardedWakeActive) return;
    DS.state.discardedWakeActive = false;
    DS.state.discardedWakeFinishedAt = Date.now();
    DS.runtimeLog?.("info", "performance", `Discarded chat wake protection ended (${reason})`);
    DS.diagPerformance?.("discarded-wake-end", { reason: String(reason || "settled") });
    if (!document.hidden) {
      setTimeout(() => {
        DS.maybeAutoReadNotifications?.("discarded-wake-settled");
        scheduleSavedOpenedLane("discarded-wake-settled", 40);
        primeLargeChatMessageLane("discarded-wake-settled");
      }, 0);
    }
  }

  function chatStartupMinimumQuietMs() {
    return loadedChatMessageCount() >= CHAT_STARTUP_LARGE_MESSAGE_COUNT
      ? CHAT_STARTUP_LARGE_SETTLE_MIN_MS
      : CHAT_STARTUP_SETTLE_MIN_MS;
  }

  function startChatStartupQuietWindow(source = "route") {
    if (!DS.isSingleChatPage?.()) return false;
    DS.state = DS.state || {};
    const now = Date.now();
    const discardedWake = source === "startup" && document.wasDiscarded === true;
    DS.state.chatStartupQuietRoute = `${location.pathname || ""}${location.search || ""}`;
    DS.state.chatStartupQuietStartedAt = now;
    DS.state.chatStartupQuietUntil = now + CHAT_STARTUP_QUIET_MS;
    DS.state.chatStartupWarmupUntil = now + CHAT_STARTUP_WARMUP_MS;
    DS.state.chatStartupLastMessageMutationAt = now;
    DS.state.chatStartupLastLongTaskAt = 0;
    if (discardedWake) {
      DS.state.discardedWakeActive = true;
      DS.state.discardedWakeVisibleAt = document.hidden ? 0 : now;
      DS.state.discardedWakeMinUntil = document.hidden ? 0 : now + DISCARDED_WAKE_VISIBLE_QUIET_MS;
      DS.state.discardedWakeStartedAt = now;
    } else if (source === "route-change") {
      DS.state.discardedWakeActive = false;
      DS.state.discardedWakeVisibleAt = 0;
      DS.state.discardedWakeMinUntil = 0;
    }
    DS.runtimeLog?.("info", "performance", `Chat startup quiet window started (${source})`, {
      quietMs: CHAT_STARTUP_QUIET_MS,
      discardedWake
    });
    DS.diagPerformance?.("startup-quiet-start", { source: String(source || "route"), durationTargetMs: CHAT_STARTUP_QUIET_MS, discardedWake });
    return true;
  }

  function chatStartupQuietActive() {
    if (!DS.isSingleChatPage?.()) return false;
    const now = Date.now();
    if (discardedWakeSessionActive()) {
      if (document.hidden) return true;
      noteDiscardedWakeVisible("quiet-check");
      const discardedMinUntil = Number(DS.state?.discardedWakeMinUntil || 0);
      if (discardedMinUntil && now < discardedMinUntil) return true;
    }
    const until = Number(DS.state?.chatStartupQuietUntil || 0);
    if (!until) {
      finishDiscardedWake("quiet-cleared");
      return false;
    }
    if (now >= until) {
      DS.state.chatStartupQuietUntil = 0;
      finishDiscardedWake("timeout");
      DS.diagPerformance?.("startup-quiet-end", { reason: "timeout", elapsedMs: Math.max(0, now - Number(DS.state?.chatStartupQuietStartedAt || now)) });
      return false;
    }
    const started = Number(DS.state?.chatStartupQuietStartedAt || now);
    const lastMutation = Number(DS.state?.chatStartupLastMessageMutationAt || started);
    const lastLongTask = Number(DS.state?.chatStartupLastLongTaskAt || 0);
    const minimumQuietMs = chatStartupMinimumQuietMs();
    const mutationIdleMs = now - lastMutation;
    const longTaskIdleMs = lastLongTask > 0 ? now - lastLongTask : Number.POSITIVE_INFINITY;
    if (
      now - started >= minimumQuietMs &&
      mutationIdleMs >= CHAT_STARTUP_SETTLED_IDLE_MS &&
      longTaskIdleMs >= CHAT_STARTUP_LONG_TASK_IDLE_MS
    ) {
      DS.state.chatStartupQuietUntil = 0;
      DS.runtimeLog?.("info", "performance", "Chat startup quiet window ended after history and Long Tasks settled", {
        elapsedMs: now - started,
        settledMs: mutationIdleMs,
        longTaskIdleMs: Number.isFinite(longTaskIdleMs) ? longTaskIdleMs : -1,
        minimumQuietMs,
        mountedMessages: loadedChatMessageCount()
      });
      DS.diagPerformance?.("startup-quiet-end", {
        reason: "settled",
        elapsedMs: now - started,
        settledMs: mutationIdleMs,
        longTaskIdleMs: Number.isFinite(longTaskIdleMs) ? longTaskIdleMs : -1,
        minimumQuietMs,
        mountedMessages: loadedChatMessageCount()
      });
      finishDiscardedWake("settled");
      return false;
    }
    return true;
  }

  function scheduleChatStartupQuietResume(source = "startup") {
    if (!chatStartupQuietActive()) return false;
    if (discardedWakeSessionActive() && document.hidden) {
      clearTimeout(DS.state.chatStartupQuietTimer);
      DS.state.chatStartupQuietTimer = 0;
      return true;
    }
    if (discardedWakeSessionActive()) noteDiscardedWakeVisible(`resume-${source}`);
    const now = Date.now();
    const until = Number(DS.state.chatStartupQuietUntil || now);
    const started = Number(DS.state.chatStartupQuietStartedAt || now);
    const lastMutation = Number(DS.state.chatStartupLastMessageMutationAt || started);
    const lastLongTask = Number(DS.state.chatStartupLastLongTaskAt || 0);
    const earliestSettleCheck = Math.max(
      started + chatStartupMinimumQuietMs(),
      lastMutation + CHAT_STARTUP_SETTLED_IDLE_MS,
      lastLongTask > 0 ? lastLongTask + CHAT_STARTUP_LONG_TASK_IDLE_MS : 0,
      Number(DS.state?.discardedWakeMinUntil || 0)
    );
    const wakeAt = Math.min(until, earliestSettleCheck);
    clearTimeout(DS.state.chatStartupQuietTimer);
    DS.state.chatStartupQuietTimer = setTimeout(() => {
      DS.state.chatStartupQuietTimer = 0;
      DS.scheduleRun?.({ priority: "critical", immediate: true, source: `chat-startup-settle-${source}` });
      DS.scheduleRun?.({ priority: "slow", source: `chat-startup-settle-${source}` });
      DS.scheduleMessageLane?.(`chat-startup-settle-${source}`);
    }, Math.max(80, wakeAt - now + 25));
    return true;
  }

  function chatStartupWarmupActive() {
    if (!DS.isSingleChatPage?.()) return false;
    return Date.now() < Number(DS.state?.chatStartupWarmupUntil || 0);
  }

  function chatStartupWarmupRemainingMs() {
    return Math.max(0, Number(DS.state?.chatStartupWarmupUntil || 0) - Date.now());
  }

  DS.startChatStartupQuietWindow = startChatStartupQuietWindow;
  DS.isChatStartupQuiet = chatStartupQuietActive;
  DS.isChatStartupWarmup = chatStartupWarmupActive;
  DS.chatStartupWarmupRemainingMs = chatStartupWarmupRemainingMs;
  DS.isDiscardedWakeProtected = discardedWakeSessionActive;

  async function runDiscardedWakeEssentialChatPass(settings) {
    if (!discardedWakeSessionActive() || !DS.isSingleChatPage?.()) return;
    // A discarded-tab wake should be almost passive, but the composer and
    // layout still need their safety fixes immediately so the tab is usable.
    await runFeatureStep("chat UI", chatUiWanted(settings) || !!DS.state.chatUiCleanupWasActive, () => DS.applyChatUiCleanup?.());
    await runFeatureStep("composer", composerWanted(settings) || !!DS.state.composerControlWasActive, () => DS.applyComposerControl?.());
    await runFeatureStep("mobile chat layout", true, () => DS.applyMobileChatLayoutFixes?.());
  }

  function runtimeProfile() {
    const settings = DS.state?.settings || {};
    const configured = String(settings.runtimePerformanceMode || "adaptive");
    let mode = ["normal", "adaptive", "aggressive", "maximum"].includes(configured) ? configured : "adaptive";
    if (settings.autoPerformanceLargeChats && DS.isSingleChatPage?.()) {
      const threshold = Math.max(100, Math.min(5000, Number(settings.largeChatPerformanceThreshold) || 300));
      if (loadedChatMessageCount() >= threshold) {
        if (mode === "normal" || mode === "adaptive") mode = "aggressive";
      }
    }
    return mode;
  }

  function desktopAppPerformanceGuardActive() {
    const settings = DS.state?.settings || {};
    const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
    return !!(settings.enabled && settings.desktopAppPerformanceGuard !== false && env.installedApp && !env.android && runtimeProfile() !== "normal");
  }

  DS.isDesktopAppPerformanceGuardActive = desktopAppPerformanceGuardActive;

  function runtimeCounters() {
    return DS.state.runtimePerformance || (DS.state.runtimePerformance = { mutations: 0, qolOnlyMutations: 0, chatLocalMutations: 0, composerOnlyMutationSkips: 0, schedules: 0, criticalSchedules: 0, slowSchedules: 0, deferredWhileScrolling: 0, hiddenSkips: 0, messageLaneSchedules: 0, messageLaneRuns: 0, desktopAppGuardDelays: 0 });
  }

  function loadedChatMessageCount() {
    if (!DS.isSingleChatPage?.()) return 0;
    const route = String(location.pathname || "");
    if (chatMessageCountCache.route !== route) {
      chatMessageCountCache = { route, count: 0, dirty: true };
    }
    if (chatMessageCountCache.dirty) {
      chatMessageCountCache.count = document.querySelectorAll("[id^='message-']").length;
      chatMessageCountCache.dirty = false;
    }
    return chatMessageCountCache.count;
  }

  // Shared by lightweight UI such as the optional Mini Panel counter so those
  // surfaces do not need to rescan a long chat on every refresh.
  DS.getLoadedChatMessageCount = loadedChatMessageCount;

  function messageQuickActionsEnabled(settings = DS.state?.settings || {}) {
    return !!(
      settings.messageQuickActionCopy ||
      settings.messageQuickActionEdit ||
      settings.messageQuickActionRemoveImage ||
      settings.messageQuickActionResend ||
      settings.messageQuickActionReport
    );
  }

  function deepSleepEnabled() {
    // A disabled feature is never scheduled. Old persisted opt-outs are ignored.
    return true;
  }

  function anySetting(settings, keys) {
    return keys.some(key => !!settings?.[key]);
  }

  function chatTopBarWanted(settings) {
    return anySetting(settings, [
      "showChatTopBarTools", "chatTopBarInlineCreator", "chatTopBarAddLaterButton",
      "showPerCharacterChatHistory", "showQuickNewChatButton", "showChatExportButton", "hideChatTopBarRatingButton",
      "hideChatTopBarModelButton", "hideChatTopBarContextDot", "hideChatDropdownVoiceUpsell",
      "hideChatDropdownMemoryItem"
    ]);
  }

  function composerWanted(settings) {
    return anySetting(settings, [
      "hideChatPlusButton", "hideChatImageButton", "replaceChatImageWithOocButton",
      "showAsteriskButton", "autoPairAsterisks", "hideChatVoiceButton", "hideUnlockCustomVoices"
    ]);
  }

  function chatUiWanted(settings) {
    return composerWanted(settings) || anySetting(settings, [
      "allowTypingWhileAiResponding", "keepChatPositionWhileTyping"
    ]);
  }

  function topBarWanted(settings) {
    return anySetting(settings, ["hideTopBarLanguage", "hideTopBarNotifications", "hideTopBarTheme"]) ||
      String(settings.topBarProfilePillMode || "normal") !== "normal" || !!settings.topBarProfilePillPersonaPrefix;
  }

  function notificationsWanted(settings) {
    return anySetting(settings, ["hideNotifications", "hideTabNotificationBadge", "autoReadNotifications", "hideFeatureReleasePopups"]);
  }

  function cardFilteringWanted(settings) {
    // Saved explicit bot IDs must remain hidden even when optional word/tag
    // filters are off. The dirty-card cache keeps repeated passes inexpensive.
    if (DS.state?.blockedBotIdSet?.size) return true;
    return anySetting(settings, [
      "blockCards", "hideOpenedChats", "hideLaterBotsFromListings", "hideHomeForYouCards",
      "hideGroupChats", "enableLanguageFilter"
    ]);
  }

  function cardBlockUiWanted(settings) {
    return anySetting(settings, ["blockCards", "replaceCardProfileWithBlockButton", "showBlockButtonOnMyCreations", "enableBulkCardBlocking"]);
  }

  function modelSelectorWanted(settings) {
    return anySetting(settings, ["expandModelSelectorDescriptions", "hideModelUpgradeButtons", "customizeModelQuickMenu", "enableModelQuickAccess"]);
  }

  function generationMetadataWanted(settings) {
    return anySetting(settings, ["showGenerationMetadata", "showMessageTimestamps", "showGenerationModel", "showGenerationElapsed", "showGenerationSettings", "enableContextWindowWarning"]);
  }

  function personaToolsWanted(settings) {
    return anySetting(settings, ["autoAcceptPersonaChange", "savePersonasFromPages", "keepLocalPersonaCopies", "expandPersonaDescriptions", "enablePersonaOrganizer", "showPersonaQuickSwitch"]);
  }

  async function runPersonaPickerLowImpact(source = "runtime") {
    if (!DS.isPersonaPickerOpen?.()) return false;
    const counters = runtimeCounters();
    counters.personaPickerLowImpactRuns = Number(counters.personaPickerLowImpactRuns || 0) + 1;
    counters.lastPersonaPickerLowImpactSource = String(source || "runtime");
    await runStep("persona picker low-impact", () => DS.applyPersonaPickerLightweight?.());
    return true;
  }

  function memoryManagerWanted(settings) {
    return anySetting(settings, ["enableBulkMemoryManager", "showCopyMemoryAction", "memoryAutoLoadAll"]);
  }

  function botEditorRoute() {
    return !!DS.getPageState?.().isBotEditor;
  }

  function lorebookEditorRoute() {
    return !!DS.getPageState?.().isLorebookEditor;
  }

  async function runFeatureStep(name, wanted, fn) {
    const settings = DS.state?.settings || {};
    if (DS.runtimeKernel?.runFeature) {
      return DS.runtimeKernel.runFeature({
        name,
        group: DS.runtimeTaskGroupForName?.(name) || "core",
        wanted,
        run: fn,
        deepSleep: deepSleepEnabled(settings),
        execute: (task, taskName) => runStep(taskName || name, task)
      });
    }

    const resolvedWanted = typeof wanted === "function" ? !!wanted() : !!wanted;
    if (deepSleepEnabled(settings) && !resolvedWanted) {
      const counters = runtimeCounters();
      counters.disabledFeatureStepSkips = Number(counters.disabledFeatureStepSkips || 0) + 1;
      return null;
    }
    return runStep(name, fn);
  }

  async function runThrottledFeatureStep(name, wanted, minIntervalMs, fn, force = false) {
    const resolvedWanted = typeof wanted === "function" ? !!wanted() : !!wanted;
    const settings = DS.state?.settings || {};
    if (deepSleepEnabled(settings) && !resolvedWanted) {
      return runFeatureStep(name, false, fn);
    }

    const now = Date.now();
    const route = location.href;
    const previous = slowStepThrottle.get(name);
    const interval = Math.max(0, Number(minIntervalMs) || 0);
    if (!force && previous?.route === route && now - Number(previous.at || 0) < interval) {
      const counters = runtimeCounters();
      counters.slowStepThrottleSkips = Number(counters.slowStepThrottleSkips || 0) + 1;
      return null;
    }

    slowStepThrottle.set(name, { route, at: now });
    return runFeatureStep(name, resolvedWanted, fn);
  }

  async function runRoutedFeatureStep(plan, group, name, wanted, fn) {
    const settings = DS.state?.settings || {};
    if (creatorProfileStartupQuietActive() && ["profiles", "creator", "botEditor", "creatorModeration"].includes(String(group || ""))) {
      const counters = runtimeCounters();
      counters.creatorProfileStartupQuietDeferrals = Number(counters.creatorProfileStartupQuietDeferrals || 0) + 1;
      scheduleCreatorProfileQuietResume();
      return null;
    }
    if (DS.runtimeKernel?.runFeature) {
      return DS.runtimeKernel.runFeature({
        name,
        group,
        plan,
        wanted,
        run: fn,
        deepSleep: deepSleepEnabled(settings),
        execute: (task, taskName) => runStep(taskName || name, task)
      });
    }

    if (!DS.runtimePlanAllows?.(plan, group)) {
      const counters = runtimeCounters();
      counters.routeFeatureStepSkips = Number(counters.routeFeatureStepSkips || 0) + 1;
      return null;
    }
    const resolvedWanted = typeof wanted === "function" ? !!wanted() : !!wanted;
    return runFeatureStep(name, resolvedWanted, fn);
  }

  function runtimePlan(listingHint = undefined) {
    const page = DS.getPageState?.() || {};
    return DS.getRuntimePlan?.(page, { listing: listingHint }) || {
      page,
      chat: !!page.isSingleChatPage,
      chatList: !!page.isChatListPage,
      listings: !!listingHint,
      botEditor: !!page.isBotEditor,
      lorebookEditor: !!page.isLorebookEditor,
      profiles: !!page.isBotProfilePage,
      creator: !!page.isBotEditor,
      lorebook: !!page.isLorebookEditor,
      personas: !!page.isPersonaPage,
      interface: true
    };
  }

  function invalidateLoadedChatMessageCount() {
    chatMessageCountCache.dirty = true;
  }

  function messageRootMutationSets(mutations) {
    const added = new Set();
    const removed = new Set();
    const collect = (node, target) => {
      if (!(node instanceof Element)) return;
      if (node.matches?.("[id^='message-']")) target.add(node);
      node.querySelectorAll?.("[id^='message-']").forEach(root => target.add(root));
    };
    for (const mutation of mutations || []) {
      for (const node of mutation.addedNodes || []) collect(node, added);
      for (const node of mutation.removedNodes || []) collect(node, removed);
    }
    // React can move the exact same node in one observer delivery. A move does
    // not change the number of loaded messages.
    for (const root of [...added]) {
      if (removed.has(root)) {
        added.delete(root);
        removed.delete(root);
      }
    }
    return { added, removed };
  }

  function updateLoadedChatMessageCountFromMutations(mutations) {
    if (!DS.isSingleChatPage?.()) return;
    const route = String(location.pathname || "");
    if (chatMessageCountCache.route !== route) {
      chatMessageCountCache = { route, count: 0, dirty: true };
      return;
    }
    if (chatMessageCountCache.dirty) return;
    const { added, removed } = messageRootMutationSets(mutations);
    if (!added.size && !removed.size) return;
    chatMessageCountCache.count = Math.max(0, Number(chatMessageCountCache.count || 0) + added.size - removed.size);
    const counters = runtimeCounters();
    counters.messageCountIncrementalUpdates = Number(counters.messageCountIncrementalUpdates || 0) + 1;
    counters.messageCountIncrementalRoots = Number(counters.messageCountIncrementalRoots || 0) + added.size + removed.size;
  }

  function recordPerformanceWindow(name, started, ended) {
    if (!started || !ended || ended < started) return;
    const windows = DS.state.performanceWindows || (DS.state.performanceWindows = []);
    windows.push({ name: String(name || "QoL step"), start: started, end: ended });
    const cutoff = ended - 30000;
    while (windows.length > 120 || (windows[0] && windows[0].end < cutoff)) windows.shift();
  }

  function longTaskOverlapNames(start, end) {
    const windows = Array.isArray(DS.state.performanceWindows) ? DS.state.performanceWindows : [];
    const names = [];
    for (const window of windows) {
      if (Number(window?.end || 0) < start || Number(window?.start || 0) > end) continue;
      const name = String(window?.name || "QoL step");
      if (!names.includes(name)) names.push(name);
    }
    return names.slice(0, 4);
  }

  async function runStep(name, fn) {
    if (DS.isQolPausedForTab?.() && !DS.isQolWorkerTab?.()) return null;
    if (typeof fn !== "function") return null;
    const laneParentOperationId = String(
      DS.state?.diagMessageLaneOperationId ||
      DS.state?.diagCriticalOperationId ||
      DS.state?.diagSlowOperationId ||
      ""
    );
    const diagToken = DS.isDiagnosticTraceActive?.("normal") ? DS.diagOperationStart?.("runtime-step", String(name || "step"), {
      trigger: String(DS.state?.lastRunTrigger || "").slice(0, 120),
      bundle: String(DS.runtimeTaskGroupForName?.(name) || "core"),
      parentOperationId: laneParentOperationId
    }) : null;
    let diagOutcome = "ok";

    // Lite/custom builds can physically omit whole bundles. Direct runStep
    // callers are gated here as a final safety net so an omitted bundle does
    // not even pay for a no-op optional-chain call.
    const hintedBundle = DS.runtimeTaskGroupForName?.(name) || "core";
    if (DS.featureBuildProfile?.isTaskInstalled?.(name) === false) {
      const counters = runtimeCounters();
      counters.uninstalledFeatureStepSkips = Number(counters.uninstalledFeatureStepSkips || 0) + 1;
      if (diagToken) DS.diagOperationEnd?.(diagToken, { outcome: "skipped", meta: { reason: "feature-not-installed" } });
      return null;
    }
    if (hintedBundle !== "core" && !DS.isRuntimeBundleAvailable?.(hintedBundle)) {
      const counters = runtimeCounters();
      counters.buildBundleStepSkips = Number(counters.buildBundleStepSkips || 0) + 1;
      if (diagToken) DS.diagOperationEnd?.(diagToken, { outcome: "skipped", meta: { reason: "bundle-unavailable", bundle: hintedBundle } });
      return null;
    }

    const debug = !!DS.state?.settings?.debug;
    const traceRecording = !!DS.isDiagnosticTraceActive?.("normal");
    const collectTiming = debug || !!DS.state?.settings?.performanceDiagnostics || traceRecording;
    const started = collectTiming && typeof performance !== "undefined" ? performance.now() : 0;

    try {
      const result = await fn();
      // Direct-run tasks participate in feature stop/start tracking too.
      // Cleanup tasks must not re-arm a feature they just removed.
      if (!/(?:cleanup|restore|remove|unhide|disabled)/i.test(String(name || "")) &&
          DS.featureLifecycle?.hasCleanup?.(name)) {
        DS.featureLifecycle.markActive(name, hintedBundle);
      }
      return result;
    } catch (error) {
      diagOutcome = "error";
      DS.diagError?.("runtime-step", String(name || "step"), error, { trigger: String(DS.state?.lastRunTrigger || "").slice(0, 120) });
      DS.runtimeLog?.("error", "runStep", `${name} failed`, error);
      if (debug) {
        console.warn(`[${DS.EXT_NAME}] ${name} skipped`, error);
      }
      return null;
    } finally {
      if (collectTiming && started) {
        const ended = performance.now();
        const elapsed = ended - started;
        recordPerformanceWindow(name, started, ended);
        const stats = DS.state.performanceStats || (DS.state.performanceStats = {});
        const entry = stats[name] || (stats[name] = { calls: 0, totalMs: 0, maxMs: 0 });
        entry.calls++;
        entry.totalMs += elapsed;
        entry.maxMs = Math.max(entry.maxMs, elapsed);
        entry.lastMs = elapsed;
        entry.lastAt = Date.now();
        entry.lastTrigger = String(DS.state.lastRunTrigger || "").slice(0, 120);
        // Retain only the most recent slow steps. Useful when an older
        // Inspector cannot receive the v2 operation trace handshake.
        if (elapsed >= 24) {
          const samples = DS.state.performanceSlowSamples || (DS.state.performanceSlowSamples = []);
          samples.push({ feature: String(name || "step").slice(0, 100), durationMs: Math.round(elapsed * 10) / 10, at: Date.now(), route: String(location.pathname || "").slice(0, 100), trigger: entry.lastTrigger });
          if (samples.length > 120) samples.splice(0, samples.length - 120);
        }
      }
      if (diagToken) DS.diagOperationEnd?.(diagToken, { outcome: diagOutcome });
      await maybeYieldSlowSlice(name);
    }
  }

  // Local, content-free diagnostics. Enable Performance Diagnostics in Settings,
  // reproduce a pause, then inspect this report without requiring Inspector v2.
  DS.getSlowFeatureSamples = function getSlowFeatureSamples() {
    return [...(DS.state.performanceSlowSamples || [])];
  };

  DS.getPerformanceReport = function getPerformanceReport() {
    const stats = DS.state.performanceStats || {};
    return Object.entries(stats)
      .map(([name, value]) => ({
        name,
        calls: value.calls || 0,
        totalMs: Math.round((value.totalMs || 0) * 10) / 10,
        averageMs: value.calls ? Math.round((value.totalMs / value.calls) * 100) / 100 : 0,
        maxMs: Math.round((value.maxMs || 0) * 100) / 100,
        lastMs: Math.round((value.lastMs || 0) * 100) / 100,
        lastAt: Number(value.lastAt || 0),
        lastTrigger: String(value.lastTrigger || "")
      }))
      .sort((a, b) => b.totalMs - a.totalMs);
  };


  function applyRuntimePerformancePresentation() {
    const enabled = !!DS.state?.settings?.reduceQolAnimations;
    let style = document.getElementById("ds-qol-performance-style");
    if (document.documentElement.classList.contains("ds-qol-reduced-motion") !== enabled) {
      document.documentElement.classList.toggle("ds-qol-reduced-motion", enabled);
    }
    if (enabled && !style) {
      style = document.createElement("style");
      style.id = "ds-qol-performance-style";
      style.dataset.dsOwned = "1";
      style.textContent = `.ds-qol-reduced-motion [class*="ds-"], .ds-qol-reduced-motion [id^="ds-"] { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }`;
      (document.head || document.documentElement).appendChild(style);
    } else if (!enabled) {
      style?.remove();
    }
  }

  function installTypingPerformanceTracker() {
    if (DS.state.typingPerformanceTrackerInstalled) return;
    DS.state.typingPerformanceTrackerInstalled = true;
    const markTyping = event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.matches("textarea, [contenteditable='true']")) return;
      if (!DS.isSingleChatPage?.()) return;
      DS.state.userTypingUntil = Date.now() + 900;
    };
    document.addEventListener("input", markTyping, true);
    document.addEventListener("keydown", markTyping, true);
  }

  function isCardListingContext() {
    const page = DS.getPageState?.() || {};
    if (page.isSingleChatPage || page.isChatListPage || page.isBotProfilePage || page.isBotEditor || page.isLorebookEditor || page.isPersonaPage) return false;
    if (["listing", "creator-listing", "lorebook-listing"].includes(page.routeType)) return true;
    return !!DS.qs?.("a[href*='/chat/'], a[href*='/chatbot/']");
  }

  function takeIncrementalMessageLaneRoots(limit = 10) {
    const dirtySet = DS.state.messageDirtyRoots || (DS.state.messageDirtyRoots = new Set());
    const dirtyRoots = [...dirtySet].filter(root => root?.isConnected && !DS.isMessageEditPending?.(root));
    if (!dirtyRoots.length) {
      dirtySet.clear();
      return { roots: [], remaining: 0, chunked: false };
    }

    const max = Math.max(4, Math.min(20, Number(limit) || 10));
    if (dirtyRoots.length <= max) {
      dirtySet.clear();
      return { roots: dirtyRoots, remaining: 0, chunked: false };
    }

    // Prioritize the newest messages first. This keeps a freshly-arrived reply
    // responsive while older startup/history decoration drains in tiny idle
    // chunks behind it.
    const dirty = new Set(dirtyRoots);
    const ordered = (DS.getLoadedMessageRoots?.() || []).filter(root => dirty.has(root));
    const orderedSet = new Set(ordered);
    for (const root of dirtyRoots) {
      if (!orderedSet.has(root)) {
        ordered.push(root);
        orderedSet.add(root);
      }
    }

    const roots = ordered.slice(-max);
    const selected = new Set(roots);
    dirtySet.clear();
    for (const root of ordered) {
      if (!selected.has(root) && root?.isConnected && !DS.isMessageEditPending?.(root)) dirtySet.add(root);
    }

    const counters = runtimeCounters();
    counters.messageLaneChunkedPasses = Number(counters.messageLaneChunkedPasses || 0) + 1;
    counters.messageLaneChunkedRoots = Number(counters.messageLaneChunkedRoots || 0) + roots.length;
    counters.messageLaneDeferredRoots = Number(counters.messageLaneDeferredRoots || 0) + dirtySet.size;
    counters.lastMessageLaneChunkSize = roots.length;
    counters.lastMessageLaneDeferredRoots = dirtySet.size;
    return { roots, remaining: dirtySet.size, chunked: true };
  }

  function scheduleNextMessageLaneChunk(source = "incremental-message-chunk") {
    if (!DS.state?.messageDirtyRoots?.size) return;
    const scheduledRoute = location.href;
    const resume = () => {
      if (location.href !== scheduledRoute || DS.isQolPausedForTab?.()) return;
      DS.scheduleMessageLane?.(source);
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(resume, { timeout: 240 });
    } else {
      setTimeout(resume, 32);
    }
  }

  async function runChatMessageLane() {
    if (messageLaneRunning) { messageLanePending = true; DS.diagScheduler?.("coalesced", { lane: "message", reason: "already-running" }); return; }
    const laneStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
    const laneToken = DS.isDiagnosticTraceActive?.("normal") ? DS.diagOperationStart?.("message-lane", "run", {
      source: String(DS.state?.diagMessageLaneSource || "message-mutation"),
      queueDelayMs: Math.max(0, Date.now() - Number(DS.state?.diagMessageLaneScheduledAt || Date.now())),
      parentOperationId: ""
    }) : null;
    DS.state.diagMessageLaneOperationId = laneToken?.id || "";
    messageLaneRunning = true;
    const counters = runtimeCounters();
    counters.messageLaneRuns = Number(counters.messageLaneRuns || 0) + 1;
    try {
      const settings = DS.state?.settings || {};
      DS.refreshMessageEnhancerConfig?.(settings);
      applyRuntimePerformancePresentation();
      if (!settings.enabled || !DS.isSingleChatPage?.() || shouldPauseHiddenTab()) return;
      if (chatStartupQuietActive()) {
        await runStep("performance mode", () => DS.applyPerformanceMode?.());
        counters.chatStartupQuietMessageDeferrals = Number(counters.chatStartupQuietMessageDeferrals || 0) + 1;
        scheduleChatStartupQuietResume("message");
        return;
      }
      if (settings.pauseQolWhileMessageEditing !== false && DS.hasActiveMessageEditor?.()) {
        counters.messageEditLaneSkips = Number(counters.messageEditLaneSkips || 0) + 1;
        return;
      }
      if (DS.state.bulkChatHistoryLoadActive || DS.state.quickDislikeWorker) {
        DS.state.bulkChatHistoryLoadNeedsRefresh = !!DS.state.bulkChatHistoryLoadActive;
        return;
      }
      if (Date.now() < Number(DS.state.chatHistoryBatchUntil || 0)) {
        await runStep("performance mode", () => DS.applyPerformanceMode?.());
        return;
      }
      if (Date.now() < pauseRerunsUntil || DS.isChatHeaderMenuOpen?.()) return;

      const enhancerQuietUntil = Number(DS.state.chatEnhancerQuietUntil || 0);
      if (settings.chatPerformanceMode && enhancerQuietUntil > Date.now()) {
        await runStep("performance mode", () => DS.applyPerformanceMode?.());
        const counters = runtimeCounters();
        counters.chatEnhancerQuietDeferrals = Number(counters.chatEnhancerQuietDeferrals || 0) + 1;
        clearTimeout(messageEnhancerQuietTimer);
        const wait = Math.max(40, enhancerQuietUntil - Date.now() + 20);
        messageEnhancerQuietTimer = window.setTimeout(() => {
          messageEnhancerQuietTimer = null;
          DS.diagPerformance?.("reply-quiet-end", { reason: "timer", waitedMs: wait });
          const resume = () => DS.scheduleMessageLane?.("post-native-render-quiet");
          if (typeof requestIdleCallback === "function") requestIdleCallback(resume, { timeout: 700 });
          else setTimeout(resume, 0);
        }, wait);
        return;
      }

      const profile = runtimeProfile();
      const chunkLimit = profile === "maximum" ? 6 : profile === "aggressive" ? 8 : 10;
      const laneBatch = takeIncrementalMessageLaneRoots(chunkLimit);
      const laneRoots = laneBatch.roots;
      DS.state.messageLaneRoots = laneRoots;
      counters.messageLaneDirtyRoots = Number(counters.messageLaneDirtyRoots || 0) + laneRoots.length;
      counters.lastMessageLaneDirtyRoots = laneRoots.length;

      await runStep("performance mode", () => DS.applyPerformanceMode?.());
      if (messageQuickActionsEnabled(settings) || DS.state.messageOptionsWasActive) await runStep("message options", () => DS.applyMessageOptions?.());
      if (generationMetadataWanted(settings) || !!document.querySelector(".ds-generation-metadata,#ds-context-window-warning")) await runStep("generation metadata", () => DS.applyGenerationMetadata?.());
      if (settings.enableMessageBookmarks || DS.state.chatBookmarksWasActive) await runStep("chat bookmarks", () => DS.applyChatBookmarks?.());
      if (settings.showChatSearch || DS.state.chatSearchWasActive) await runStep("chat search", () => DS.applyChatSearch?.());
      if (DS.isRpFormatRepairEnabledForCurrentCharacter?.() || settings.enableRpFormatRepair || DS.state.rpFormatRepairWasActive) await runStep("RP format repair", () => DS.applyRpFormatRepair?.());
      if (settings.styleAlternateDialogue || DS.state.alternateDialogueWasActive) await runStep("alternate dialogue", () => DS.applyAlternateDialogueStyling?.());
      if (settings.enableChatBubbleCustomization || DS.state.chatBubbleCustomizationWasActive) await runStep("chat bubbles", () => DS.applyChatBubbleCustomization?.());
      if (settings.enableStoryDayTracker || DS.state.storyDayTrackerWasActive) await runStep("story day tracker", () => DS.applyStoryDayTracker?.());
      if (settings.enableRpStateTracker || DS.state.rpStateTrackerWasActive) await runStep("RP state tracker", () => DS.applyRpStateTracker?.());
      if (settings.enableContextKeeper || DS.state.contextKeeperWasActive) await runStep("context keeper", () => DS.applyContextKeeper?.());
      if (settings.enableChatNudges || DS.state.chatNudgesWasActive) await runStep("chat nudges", () => DS.applyChatNudges?.());
      if (settings.enableSelectionRemember || DS.state.selectionRememberWasActive) await runStep("selection remember", () => DS.applySelectionRemember?.());
      if (settings.enableChatTextReplacements || settings.enableChatMutedWords || DS.state.chatTextReplacementsWasActive) await runStep("chat text replacements", () => DS.applyChatTextReplacements?.());
      if (settings.enableTranslation || DS.state.translationWasActive) await runStep("translation", () => DS.applyTranslationTools?.());
      await runFeatureStep("auto voice", !!DS.isAutoVoiceEnabled?.(), () => DS.applyAutoVoice?.());
      await runStep("auto images", () => DS.applyAutoImage?.());
      DS.markMessageEnhancerVisited?.(laneRoots);

      const now = Date.now();
      const quietFor = now - Number(DS.state.lastChatMutationAt || 0);
      if (now - Number(DS.state.lastMessageLaneSlowAt || 0) > 2400) {
        if (runtimeProfile() !== "normal" && quietFor < 900) {
          counters.slowLaneQuietDeferrals = Number(counters.slowLaneQuietDeferrals || 0) + 1;
          clearTimeout(slowQuietTimer);
          slowQuietTimer = window.setTimeout(() => {
            slowQuietTimer = null;
            if (Date.now() - Number(DS.state.lastChatMutationAt || 0) >= 850) {
              DS.state.lastMessageLaneSlowAt = Date.now();
              if (DS.state?.settings?.showQuickPanel || document.getElementById("ds-qol-panel")) {
                DS.scheduleRun?.({ priority: "slow", source: "message-lane-quiet", dirty: ["message-ui"] });
              } else {
                DS.diagScheduler?.("skipped", { lane: "slow", reason: "message-lane-no-slow-dirty", source: "message-lane-quiet" });
              }
            }
          }, Math.max(120, 920 - quietFor));
        } else {
          clearTimeout(slowQuietTimer);
          slowQuietTimer = null;
          DS.state.lastMessageLaneSlowAt = now;
          if (settings.showQuickPanel || document.getElementById("ds-qol-panel")) {
            DS.scheduleRun?.({ priority: "slow", source: "message-lane-settled", dirty: ["message-ui"] });
          } else {
            DS.diagScheduler?.("skipped", { lane: "slow", reason: "message-lane-no-slow-dirty", source: "message-lane-settled" });
          }
        }
      }
    } finally {
      if (laneToken) DS.diagOperationEnd?.(laneToken, { outcome: "ok", meta: { durationMs: laneStartedAt ? Math.round((performance.now() - laneStartedAt) * 10) / 10 : 0 } });
      DS.diagScheduler?.("finished", { lane: "message", source: String(DS.state?.diagMessageLaneSource || ""), durationMs: laneStartedAt ? Math.round((performance.now() - laneStartedAt) * 10) / 10 : 0 });
      DS.state.messageLaneRoots = null;
      DS.state.diagMessageLaneOperationId = "";
      messageLaneRunning = false;
      if (messageLanePending) {
        messageLanePending = false;
        DS.scheduleMessageLane?.("pending");
      } else if (DS.state?.messageDirtyRoots?.size) {
        scheduleNextMessageLaneChunk();
      }
    }
  }

  DS.scheduleMessageLane = function scheduleMessageLane(source = "message-mutation") {
    if (DS.isQolPausedForTab?.()) return;
    const profile = runtimeProfile();
    if (profile === "normal") return DS.scheduleRun?.({ priority: "critical", source });
    const counters = runtimeCounters();
    counters.messageLaneSchedules = Number(counters.messageLaneSchedules || 0) + 1;
    const huge = loadedChatMessageCount() >= 250;
    let delay = profile === "maximum"
      ? (huge ? 900 : 650)
      : (profile === "aggressive" ? (huge ? 520 : 360) : (huge ? 340 : 220));

    // Chrome's installed/PWA app can be substantially more sensitive to main-
    // thread work than a normal SpicyChat tab on the same machine. While the
    // site is continuously streaming tokens, keep debouncing this lane so QoL
    // usually waits for a short quiet gap instead of joining every render.
    if (desktopAppPerformanceGuardActive()) {
      delay = Math.max(delay, profile === "maximum" ? (huge ? 1900 : 1500) : (profile === "aggressive" ? (huge ? 1250 : 950) : (huge ? 950 : 700)));
      counters.desktopAppGuardDelays = Number(counters.desktopAppGuardDelays || 0) + 1;
    }

    if (Date.now() < Number(DS.state.userScrollingUntil || 0)) {
      delay = Math.max(delay, desktopAppPerformanceGuardActive() ? (profile === "maximum" ? 2200 : (profile === "aggressive" ? 1500 : 1100)) : (profile === "maximum" ? 1100 : (profile === "aggressive" ? 700 : 460)));
      counters.deferredWhileScrolling = Number(counters.deferredWhileScrolling || 0) + 1;
    }
    if (Date.now() < Number(DS.state.nativeActionQuietUntil || 0)) {
      delay = Math.max(delay, Number(DS.state.nativeActionQuietUntil) - Date.now() + 160);
      counters.nativeActionQuietDeferrals = Number(counters.nativeActionQuietDeferrals || 0) + 1;
    }
    if (DS.state?.settings?.deferQolWhileTyping && Date.now() < Number(DS.state.userTypingUntil || 0)) {
      delay = Math.max(delay, profile === "maximum" ? 1400 : 900);
      counters.typingDeferrals = Number(counters.typingDeferrals || 0) + 1;
    }
    messageLaneDueAt = Date.now() + delay;
    DS.state.diagMessageLaneScheduledAt = Date.now();
    DS.state.diagMessageLaneSource = String(source || "message-mutation").slice(0, 120);
    DS.diagScheduler?.("scheduled", { lane: "message", source: DS.state.diagMessageLaneSource, delayMs: delay, profile, huge, hidden: !!document.hidden });
    if (messageLaneTimer) {
      counters.messageLaneScheduleCoalesced = Number(counters.messageLaneScheduleCoalesced || 0) + 1;
      DS.diagScheduler?.("coalesced", { lane: "message", source: DS.state.diagMessageLaneSource, dueInMs: Math.max(0, messageLaneDueAt - Date.now()) });
      return;
    }

    const armMessageLaneTimer = () => {
      const wait = Math.max(0, messageLaneDueAt - Date.now());
      messageLaneTimer = setTimeout(() => {
        messageLaneTimer = null;
        if (Date.now() + 5 < messageLaneDueAt) {
          armMessageLaneTimer();
          return;
        }
        messageLaneDueAt = 0;
        runChatMessageLane();
      }, wait);
    };
    armMessageLaneTimer();
  };

  async function runSavedOpenedLane(source = "saved-opened") {
    if (savedOpenedLaneRunning) {
      savedOpenedLanePending = true;
      return;
    }

    const settings = DS.state?.settings || {};
    if (!settings.enabled || DS.state.quickDislikeWorker || DS.state.listingRefillWorker) return;

    const singleChat = !!DS.isSingleChatPage?.();
    const chatList = !!DS.isChatListPage?.();
    if (!singleChat && !chatList) return;

    savedOpenedLaneRunning = true;
    const counters = runtimeCounters();
    counters.savedOpenedLaneRuns = Number(counters.savedOpenedLaneRuns || 0) + 1;
    counters.lastSavedOpenedLaneSource = source;

    try {
      // This lane intentionally ignores hidden-tab, edit-mode, menu and cosmetic
      // throttles. These operations are tiny/deduped and preserve user data/state.
      if (singleChat) {
        await runStep("mark current chat opened", () => DS.markCurrentChatAsOpened?.());
      } else if (chatList) {
        await runStep("import visible opened chats", () => DS.importVisibleOpenedChats?.());
        await runStep("saved chat actions", () => DS.applySavedChatQuickActions?.());
      }
    } finally {
      savedOpenedLaneRunning = false;
      if (savedOpenedLanePending) {
        savedOpenedLanePending = false;
        scheduleSavedOpenedLane("pending", 80);
      }
    }
  }

  function scheduleSavedOpenedLane(source = "saved-opened", delay = 100) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled) return;
    if (!DS.isSingleChatPage?.() && !DS.isChatListPage?.()) return;

    clearTimeout(savedOpenedLaneTimer);
    const counters = runtimeCounters();
    counters.savedOpenedLaneSchedules = Number(counters.savedOpenedLaneSchedules || 0) + 1;
    savedOpenedLaneTimer = setTimeout(() => {
      savedOpenedLaneTimer = null;
      runSavedOpenedLane(source).catch(error => {
        console.warn(`[${DS.EXT_NAME}] saved/opened lane failed`, error);
      });
    }, Math.max(0, Number(delay) || 0));
  }

  function mutationsMayAffectChatListRows(mutations) {
    if (!DS.isChatListPage?.()) return false;
    for (const mutation of mutations || []) {
      const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
      for (const node of nodes) {
        const el = node instanceof Element ? node : node?.parentElement;
        if (!el) continue;
        if (el.matches?.("a[href*='/chat/'], [data-testid*='Chat']")) return true;
        if (el.querySelector?.("a[href*='/chat/'], [data-testid*='Chat']")) return true;
      }
    }
    return false;
  }

  DS.scheduleSavedOpenedLane = scheduleSavedOpenedLane;

  async function runDisabledCleanup() {
    return DS.featureLifecycle?.shutdownAll({ runStep, syncNativeScrollBackToTopVisibility });
  }

  DS.runCritical = async function runCritical() {
    if (DS.isQolPausedForTab?.()) return;
    const passToken = DS.isDiagnosticTraceActive?.("normal") ? DS.diagOperationStart?.("runtime", "critical-pass", {
      trigger: String(DS.state?.lastRunTrigger || "").slice(0, 120),
      parentOperationId: ""
    }) : null;
    if (criticalRunning) {
      if (passToken) DS.diagOperationEnd?.(passToken, { outcome: "coalesced" });
      criticalPending = true;
      return;
    }

    DS.state.diagCriticalOperationId = passToken?.id || "";
    criticalRunning = true;

    try {
      const settings = DS.state?.settings || {};

      await runStep("accessibility", () => DS.applyAccessibilitySettings?.());

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

      const page = DS.getPageState?.() || {};
      const singleChat = !!page.isSingleChatPage;
      const chatList = !!page.isChatListPage;
      const listing = isCardListingContext();
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

      if (Date.now() < pauseRerunsUntil) {
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
      criticalRunning = false;

      if (criticalPending) {
        criticalPending = false;
        clearTimeout(criticalTimer);
        criticalTimer = setTimeout(() => DS.runCritical?.(), 60);
      }
    }
  };

  async function runTargetedChatSlowPass(dirty, settings, plan, options = {}) {
    const counters = runtimeCounters();
    counters.targetedChatSlowPasses = Number(counters.targetedChatSlowPasses || 0) + 1;
    counters.lastTargetedChatSlowGroups = [...dirty].join(",");

    if (slowDirtyHas(dirty, "interface")) {
      await runStep("remove disabled panel", () => DS.removeQuickPanelIfDisabled?.());
      await runFeatureStep("top bar", topBarWanted(settings) || !!document.querySelector("[data-ds-reason^='topbar:']"), () => DS.applyTopBarCleanup?.());
      const sidebarWanted = !!settings.showQolSidebarButton || !!settings.restorePersonasSidebarPosition || !!DS.sidebarPersonasMoved?.() || Object.keys(settings).some(key => key.startsWith("hideSidebar") && settings[key]);
      await runFeatureStep("sidebar", sidebarWanted || !!document.querySelector("[data-ds-reason^='sidebar:'],#ds-qol-sidebar-btn"), () => DS.applySidebarCleanup?.());
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

    if (slowDirtyHas(dirty, "message-ui")) {
      if (settings.showQuickPanel || document.getElementById("ds-qol-panel")) {
        await runFeatureStep("update panel", true, () => DS.updateQuickPanel?.());
      }
    }
  }

  DS.runSlow = async function runSlow(options = {}) {
    if (DS.isQolPausedForTab?.()) return;
    if (slowRunning) {
      slowPending = true;
      return;
    }

    if (criticalRunning) {
      DS.scheduleRun?.({ priority: "slow", source: "critical-running" });
      return;
    }

    // Hidden tabs do not need cosmetic DOM work. Critical tracking/filtering has
    // its own lane and the slow lane is refreshed immediately when the tab is shown.
    if (document.hidden && !options.force) return;
    // Defer the cosmetic lane while the user is pressing native Send/Regenerate.
    // Crucial tracking remains on its own lane and is not suppressed.
    if (!options.force && Date.now() < Number(DS.state.nativeActionQuietUntil || 0)) {
      DS.scheduleRun?.({ priority: "slow", source: "native-action-quiet" });
      runtimeCounters().nativeActionQuietDeferrals = Number(runtimeCounters().nativeActionQuietDeferrals || 0) + 1;
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
    slowRunning = true;
    slowSliceState = typeof performance !== "undefined" ? { sliceStarted: performance.now(), activeMs: 0, slices: 1, dirtyGroups: [] } : null;

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

      if (Date.now() < pauseRerunsUntil || (DS.isSingleChatPage?.() && DS.isChatHeaderMenuOpen?.())) {
        rerunAfterMenuSettles();
        return;
      }

      const page = DS.getPageState?.() || {};
      const singleChat = !!page.isSingleChatPage;
      const chatList = !!page.isChatListPage;
      const listing = isCardListingContext();
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
      if (slowSliceState) slowSliceState.dirtyGroups = [...dirty];
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
      const sidebarWanted = !!settings.showQolSidebarButton || !!settings.restorePersonasSidebarPosition || !!DS.sidebarPersonasMoved?.() || Object.keys(settings).some(key => key.startsWith("hideSidebar") && settings[key]);
      if (listing) {
        await runThrottledFeatureStep("sidebar", sidebarWanted || !!document.querySelector("[data-ds-reason^='sidebar:'],#ds-qol-sidebar-btn"), listingMaintenanceInterval, () => DS.applySidebarCleanup?.(), !!options.force);
      } else {
        await runFeatureStep("sidebar", sidebarWanted || !!document.querySelector("[data-ds-reason^='sidebar:'],#ds-qol-sidebar-btn"), () => DS.applySidebarCleanup?.());
      }
      await runFeatureStep("main footer", !!settings.enableMainFooterManagement || !!document.querySelector("[data-ds-reason^='main-footer:'],[data-ds-main-footer-root]"), () => DS.applyMainFooterManagement?.());

      const favoriteDataWanted = anySetting(settings, ["trackFavoriteBots", "neverHideFavorites", "protectFavoritesFromBlocking", "showFavoriteHistoryButton", "recommendationHideFavoriteBots"]);
      await runRoutedFeatureStep(plan, "listings", "favorite bots import", favoriteDataWanted, () => DS.importVisibleFavoriteBots?.());
      await runRoutedFeatureStep(plan, "listings", "favorite history", () => !!settings.showFavoriteHistoryButton || !!settings.favoritePageFoldersEnabled || !!settings.favoritePageSortEnabled || !!document.querySelector("[data-ds-favorite-history],#ds-favorite-history,#ds-favorite-qol-controls"), () => DS.applyFavoriteHistoryButton?.());
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
          !!settings.showBotCreationDates || !!document.querySelector(".ds-bot-profile-created-date"),
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
        await runFeatureStep("chat tags", !!settings.showChatTagLinks || !!settings.showChatTagAddButtons, () => DS.applyChatTagTools?.());
        await runFeatureStep("generation metadata", generationMetadataWanted(settings) || !!document.querySelector(".ds-generation-metadata,#ds-context-window-warning"), () => DS.applyGenerationMetadata?.());
        await runFeatureStep("personas", personaToolsWanted(settings), () => DS.applyPersonas?.());
        await runFeatureStep("OOC", !!settings.showOocTools || !!settings.replaceChatImageWithOocButton || !!settings.quickPanelShowOoc, () => DS.applyOocTools?.());
        if (settings.enableReplyInstructions || settings.enableGlobalMemory || DS.state.replyInstructionsWasActive) await runStep("reply instructions", () => DS.applyReplyInstructions?.());
        if (settings.enableChatSceneNotes || document.querySelector(".ds-qol-scene-notes-button")) await runStep("chat scene notes", () => DS.applyChatSceneNotes?.());
        if (settings.enableLorebookConsistency || settings.enableCreatorTriggerPreview || document.querySelector(".ds-lorebook-consistency-bar") || document.getElementById("ds-qol-creator-debug-launch")) await runStep("lorebook consistency", () => DS.applyLorebookConsistency?.());
      }

      if (chatList) {
        await runFeatureStep("chat list", !!settings.showChatListTools || !!settings.enableChatOrganizer || !!document.querySelector("[data-ds-chat-list-tools],#ds-chat-organizer-toolbar"), () => DS.applyChatListTools?.());
      } else if (document.getElementById("ds-chat-organizer-toolbar") || document.querySelector(".ds-chat-row-hidden-by-folder,.ds-chat-org-select")) {
        DS.removeChatOrganizer?.();
      }

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
        await runFeatureStep("public lorebook blocking/history", !!settings.lorebookTrackHistory || !!settings.lorebookBlockingEnabled || !!settings.showLorebookBlockButtons || (Array.isArray(settings.lorebookBlockedIds) && settings.lorebookBlockedIds.length > 0) || !!document.querySelector("[data-ds-reason^='lorebook:block'], .ds-lorebook-block-button"), () => DS.applyPublicLorebookQoL?.());
        await runFeatureStep("smart filter presets", !!settings.enableSmartFilterPresets || !!document.querySelector("[data-ds-smart-filter]"), () => DS.applySmartFilterPresets?.());
        await runThrottledFeatureStep("exact message counts / creation dates", !!settings.showExactMessageCounts || !!settings.showBotCreationDates || !!document.querySelector("[data-ds-exact-message-count-applied=\"1\"], .ds-bot-created-date"), listingCardInterval, () => DS.applyExactMessageCounts?.(), !!options.force);
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
      if (slowSliceState && typeof performance !== "undefined") {
        activeMs = Number(slowSliceState.activeMs || 0) + Math.max(0, performance.now() - Number(slowSliceState.sliceStarted || performance.now()));
        slices = Number(slowSliceState.slices || 1);
        dirtyGroups = Array.isArray(slowSliceState.dirtyGroups) ? slowSliceState.dirtyGroups : [];
      }
      if (slowToken) DS.diagOperationEnd?.(slowToken, { outcome: "ok", meta: { activeMs: Math.round(activeMs * 10) / 10, slices, dirtyGroups, queueDelayMs: slowQueueDelayMs } });
      DS.diagScheduler?.("finished", { lane: "slow", durationActiveMs: Math.round(activeMs * 10) / 10, slices, dirtyGroups });
      slowSliceState = null;
      DS.state.diagSlowOperationId = "";
      DS.state.diagSlowScheduledAt = 0;
      slowRunning = false;

      if (slowPending) {
        slowPending = false;
        DS.scheduleRun?.({ priority: "slow", source: "slow-pending" });
      }
    }
  };

  DS.runAll = async function runAll() {
    await DS.runCritical?.();
    await DS.runSlow?.({ force: true });
  };

  function cancelIdleHandle() {
    if (idleHandle == null) return;

    try {
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idleHandle);
    } catch {}

    idleHandle = null;
  }

  function scheduleSlowRun(delay) {
    const now = Date.now();
    const settings = DS.state?.settings || {};
    const profile = runtimeProfile();
    const messageCount = loadedChatMessageCount();
    const appGuard = desktopAppPerformanceGuardActive();
    const maxWait = DS.isSingleChatPage?.()
      ? (appGuard
          ? (profile === "maximum" ? (messageCount >= 250 ? 12000 : 10000) : profile === "aggressive" ? (messageCount >= 250 ? 10000 : 8000) : (messageCount >= 250 ? 8000 : 6000))
          : (profile === "maximum" ? (messageCount >= 250 ? 7000 : 5600) : profile === "aggressive" ? (messageCount >= 250 ? 5200 : 4000) : profile === "adaptive" ? (messageCount >= 250 ? 4200 : 3200) : 2400))
      : (profile === "maximum" ? 4400 : profile === "aggressive" ? 3200 : 2200);

    // v0.1.8.48 changed cosmetic cleanup to a debounced idle lane. On pages
    // with frequent React mutations that debounce could be reset forever, so
    // sidebar/top-bar/premium cleanup would eventually stop being reapplied.
    // Keep the debounce for performance, but cap how long it may be postponed.
    if (!slowScheduledAt) slowScheduledAt = now;

    const desiredAt = now + Math.max(0, Number(delay) || 0);
    const latestAt = slowScheduledAt + maxWait;
    const runAt = Math.min(desiredAt, latestAt);
    const wait = Math.max(0, runAt - now);

    clearTimeout(slowTimer);
    cancelIdleHandle();

    slowTimer = setTimeout(() => {
      slowTimer = null;
      slowScheduledAt = 0;

      if (document.hidden) return;

      const run = () => {
        idleHandle = null;
        DS.diagScheduler?.("ran", {
          lane: "slow",
          source: String(DS.state?.diagSlowSource || DS.state?.lastRunTrigger || "scheduled").slice(0, 120),
          queueDelayMs: Math.max(0, Date.now() - Number(DS.state?.diagSlowScheduledAt || Date.now())),
          dirtyGroups: [...slowDirtyGroups]
        });
        DS.runSlow?.();
      };

      if (typeof requestIdleCallback === "function") {
        idleHandle = requestIdleCallback(run, { timeout: appGuard ? 2400 : 900 });
      } else {
        run();
      }
    }, wait);
  }

  DS.scheduleRun = function scheduleRun(options = {}) {
    if (DS.isQolPausedForTab?.()) return;
    if (typeof options === "string") options = { source: options };

    if (DS.state.quickDislikeWorker) return;
    if (DS.state.bulkChatHistoryLoadActive) {
      DS.state.bulkChatHistoryLoadNeedsRefresh = true;
      return;
    }

    const settings = DS.state?.settings || {};
    const priority = options.priority || "both";
    const immediate = options.immediate === true;
    const profile = runtimeProfile();
    const counters = runtimeCounters();
    const messageCount = loadedChatMessageCount();
    const source = String(options.source || "scheduled").slice(0, 120);
    DS.state.lastRunTrigger = source;
    counters.lastScheduleSource = source;
    counters.schedules++;

    let criticalDelay = immediate ? 0 : 160;
    let slowDelay = immediate ? 250 : 850;

    if (DS.isSingleChatPage?.() && profile !== "normal") {
      const huge = messageCount >= 250;
      if (profile === "adaptive") {
        criticalDelay = immediate ? 0 : (huge ? 360 : 240);
        slowDelay = immediate ? 300 : (huge ? 1500 : 1100);
      } else {
        criticalDelay = immediate ? 0 : (huge ? 520 : 340);
        slowDelay = immediate ? 400 : (huge ? 2300 : 1600);
      }

      if (!immediate && desktopAppPerformanceGuardActive()) {
        criticalDelay = Math.max(criticalDelay, profile === "maximum" ? (huge ? 1100 : 900) : profile === "aggressive" ? (huge ? 900 : 700) : (huge ? 700 : 520));
        slowDelay = Math.max(slowDelay, profile === "maximum" ? (huge ? 6500 : 5000) : profile === "aggressive" ? (huge ? 5000 : 3800) : (huge ? 3600 : 2700));
        counters.desktopAppGuardDelays = Number(counters.desktopAppGuardDelays || 0) + 1;
      }

      // Avoid scheduling cosmetic repair work against wheel/touch rendering.
      if (!immediate && Date.now() < Number(DS.state.userScrollingUntil || 0)) {
        criticalDelay = Math.max(criticalDelay, desktopAppPerformanceGuardActive() ? (profile === "maximum" ? 1600 : profile === "aggressive" ? 1300 : 950) : (profile === "maximum" ? 950 : profile === "aggressive" ? 760 : 520));
        slowDelay = Math.max(slowDelay, desktopAppPerformanceGuardActive() ? (profile === "maximum" ? 7500 : profile === "aggressive" ? 6000 : 4500) : (profile === "maximum" ? 3800 : profile === "aggressive" ? 3000 : 1900));
        counters.deferredWhileScrolling++;
      }
    } else if (settings.chatPerformanceMode && DS.isSingleChatPage?.()) {
      criticalDelay = immediate ? 0 : 320;
      slowDelay = immediate ? 300 : 1200;
    }

    if (!immediate && !DS.isSingleChatPage?.() && isCardListingContext() && profile !== "normal") {
      // Large listings can generate many small native React mutations while cards,
      // images and metadata settle. Coalesce those bursts more aggressively so a
      // 100+ card page does not repeatedly rescan the whole grid on the main thread.
      criticalDelay = Math.max(criticalDelay, profile === "maximum" ? 650 : profile === "aggressive" ? 460 : 300);
      slowDelay = Math.max(slowDelay, profile === "maximum" ? 2400 : profile === "aggressive" ? 1750 : 1250);
      counters.listingScheduleDeferrals = Number(counters.listingScheduleDeferrals || 0) + 1;
      const remainingScrollMs = Math.max(0, Number(DS.state.userScrollingUntil || 0) - Date.now());
      if (remainingScrollMs > 0) {
        // Direct card-mount safety checks still run immediately; defer the
        // broader card/appearance pipelines until scrolling has settled.
        criticalDelay = Math.max(criticalDelay, remainingScrollMs + 120);
        slowDelay = Math.max(slowDelay, remainingScrollMs + 450);
        counters.listingScrollDeferrals = Number(counters.listingScrollDeferrals || 0) + 1;
      }
    }

    if (!immediate && DS.isSingleChatPage?.() && Date.now() < Number(DS.state.nativeActionQuietUntil || 0)) {
      // Do not delay critical chat tracking; only the cosmetic slow lane.
      slowDelay = Math.max(slowDelay, Number(DS.state.nativeActionQuietUntil) - Date.now() + 180);
      counters.nativeActionQuietDeferrals = Number(counters.nativeActionQuietDeferrals || 0) + 1;
    }

    if (document.hidden) {
      criticalDelay = immediate ? 0 : 700;
      counters.hiddenSkips++;
    }

    DS.diagScheduler?.("scheduled", { lane: "runtime", source, priority, immediate, criticalDelayMs: criticalDelay, slowDelayMs: slowDelay, profile, messageCount, hidden: !!document.hidden });

    if (priority !== "slow") {
      counters.criticalSchedules++;
      clearTimeout(criticalTimer);
      criticalTimer = setTimeout(() => DS.runCritical?.(), criticalDelay);
    }

    if (priority !== "critical") {
      counters.slowSchedules++;
      if (options.dirty != null || options.slowDirty != null) {
        markSlowDirty(options.dirty ?? options.slowDirty, source);
      } else if (!slowDirtyGroups.size) {
        // Existing callers that do not opt into targeted invalidation keep the
        // legacy full slow-pass behavior. Targeted callers never get widened.
        markSlowDirty("all", source);
      }
      DS.state.diagSlowScheduledAt = Number(DS.state.diagSlowScheduledAt || Date.now());
      DS.state.diagSlowSource = source;
      scheduleSlowRun(slowDelay);
    }
  };

  function nodeLooksQolOwned(node) {
    if (!(node instanceof Element)) return false;
    if (node.dataset?.dsOwner === "qol" || node.dataset?.dsOwned === "1") return true;
    if (String(node.id || "").startsWith("ds-")) return true;
    return Array.from(node.classList || []).some(name => String(name).startsWith("ds-"));
  }

  function nodeContainsPersistentChatShortcut(node) {
    if (!(node instanceof Element)) return false;

    const selector = [
      ".ds-chat-asterisk-shortcut",
      ".ds-chat-asterisk-shortcut-wrapper",
      ".ds-chat-ooc-shortcut",
      ".ds-chat-ooc-shortcut-wrapper"
    ].join(",");

    return node.matches?.(selector) || !!node.querySelector?.(selector);
  }

  function mutationRemovedPersistentChatShortcut(mutation) {
    return [...mutation.removedNodes].some(nodeContainsPersistentChatShortcut);
  }

  function nodeContainsPersistentChatHeaderControl(node) {
    if (!(node instanceof Element)) return false;
    const selector = [
      ".ds-chat-topbar-later-button",
      ".ds-chat-history-button",
      ".ds-chat-new-chat-button",
      ".ds-chat-profile-button",
      ".ds-chat-search-button",
      ".ds-creator-fav-button",
      "#ds-chat-background-control",
      "#ds-android-qol-menu-button",
      "#ds-bot-organizer-context-button"
    ].join(",");
    return node.matches?.(selector) || !!node.querySelector?.(selector);
  }

  function mutationRemovedPersistentChatHeaderControl(mutation) {
    return [...mutation.removedNodes].some(nodeContainsPersistentChatHeaderControl);
  }

  function nodeContainsNativeChatHeader(node) {
    if (!(node instanceof Element)) return false;
    const selector = "a[aria-label='chatbot-profile'], button[aria-label='chat-dropdown']";
    return node.matches?.(selector) || !!node.querySelector?.(selector);
  }

  function mutationAddedNativeChatHeader(mutation) {
    return [...mutation.addedNodes].some(nodeContainsNativeChatHeader);
  }

  function mutationTouchesNativeChatHeader(mutation) {
    const target = mutation?.target instanceof Element ? mutation.target : mutation?.target?.parentElement;
    if (target && (nodeContainsNativeChatHeader(target) || target.closest?.("a[aria-label='chatbot-profile'], button[aria-label='chat-dropdown']"))) return true;
    return [...(mutation?.addedNodes || []), ...(mutation?.removedNodes || [])].some(nodeContainsNativeChatHeader);
  }

  function mutationIsOnlyQolUi(mutation) {
    if (typeof DS.mutationIsQolOnly === "function") return DS.mutationIsQolOnly(mutation);
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    if (target?.closest?.("#ds-qol-panel, #ds-chat-export-modal")) return true;
    if (target && (nodeLooksQolOwned(target) || target.closest?.("[data-ds-owned='1']"))) return true;

    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.length > 0 && nodes.every(nodeLooksQolOwned);
  }

  function clearStaleRouteScopedUi(source = "route") {
    const page = DS.getPageState?.({ refresh: true }) || {};
    const listing = ["listing", "creator-listing", "lorebook-listing"].includes(page.routeType);
    let changed = false;

    if (!page.isBotEditor) {
      if (document.querySelector(".ds-bot-editor-history-tools")) { DS.removeBotEditorDraftHistory?.(); changed = true; }
      if (document.querySelector(".ds-bot-editor-save-actions")) { DS.removeBotEditorSaveActions?.(); changed = true; }
      if (document.getElementById("ds-bot-backup-tools")) { DS.removeBotBackupTools?.(); changed = true; }
    }

    if (!page.isBotEditor && !page.isLorebookEditor) {
      if (document.querySelector(".ds-creator-writing-button") || document.getElementById("ds-creator-writing-modal")) {
        DS.removeCreatorWritingAssistant?.();
        changed = true;
      }
    }

    if (!page.isMyCreationsChatbotsPage && document.getElementById("ds-lorebook-filter-toolbar")) {
      DS.removeLorebookListingTools?.();
      changed = true;
    }
    if (!page.isMyCreationsChatbotsPage && document.getElementById("ds-rulebook-filter-toolbar")) {
      DS.removeRulebookListingTools?.();
      changed = true;
    }

    if (changed) {
      const counters = runtimeCounters();
      counters.routeScopedUiCleanups = Number(counters.routeScopedUiCleanups || 0) + 1;
      counters.lastRouteScopedUiCleanupSource = String(source || "route");
    }
    return changed;
  }

  const STALE_NON_CHAT_PRESENTATION_CLASSES = [
    "ds-chat-custom-background",
    "ds-chat-performance",
    "ds-hide-chat-voice",
    "ds-android-hide-composer-shortcuts",
    "ds-focus-mode-active",
    "ds-focus-hide-sidebar",
    "ds-focus-hide-topbar",
    "ds-focus-hide-chat-header",
    "ds-focus-hide-qol-panel"
  ];

  function clearStaleNonChatPresentationState(source = "route") {
    if (DS.isSingleChatPage?.()) return false;

    let changed = false;
    const html = document.documentElement;

    for (const className of STALE_NON_CHAT_PRESENTATION_CLASSES) {
      if (!html.classList.contains(className)) continue;
      html.classList.remove(className);
      changed = true;
    }

    const backgroundLayer = document.getElementById("ds-chat-background-layer");
    if (backgroundLayer) {
      backgroundLayer.remove();
      changed = true;
    }

    // Prefer each feature's own cleanup too. The direct class/layer scrub above
    // happens first so an Android WebView never has to wait for the delayed
    // runtime lane before a Home/listing route becomes visible again.
    try { DS.removeChatBackgrounds?.(); } catch {}
    try { DS.removeAndroidAppControls?.(); } catch {}
    try { DS.applyPerformanceMode?.(); } catch {}
    try { DS.applyFocusMode?.(); } catch {}
    try { DS.recoverAccidentalCardPageHide?.(); } catch {}

    // Only reverse a page-scale hide when QoL itself marked #root as hidden for
    // a chat/focus/android/performance reason. Do not touch SpicyChat-owned
    // loading/visibility state or unrelated QoL hides.
    const root = document.getElementById("root");
    const rootReason = String(root?.dataset?.dsReason || "");
    if (
      root?.dataset?.dsHidden === "1" &&
      /^(?:chat|focus|android|performance)(?::|$)/i.test(rootReason)
    ) {
      root.classList.remove("ds-hidden");
      delete root.dataset.dsHidden;
      delete root.dataset.dsReason;
      root.style.removeProperty("display");
      root.style.removeProperty("visibility");
      root.style.removeProperty("opacity");
      changed = true;
    }

    if (changed) {
      const counters = runtimeCounters();
      counters.nonChatPresentationRecoveries = Number(counters.nonChatPresentationRecoveries || 0) + 1;
      counters.lastNonChatPresentationRecoveryAt = Date.now();
      counters.lastNonChatPresentationRecoverySource = String(source || "route");
    }

    return changed;
  }

  function scheduleNonChatPresentationRecovery(source = "route") {
    routePresentationRecoveryTimers.forEach(timer => clearTimeout(timer));
    routePresentationRecoveryTimers = [];

    clearStaleRouteScopedUi(`${source}:scoped-immediate`);
    if (DS.isSingleChatPage?.()) return;

    clearStaleNonChatPresentationState(`${source}:immediate`);

    // WebView/React can swap the route DOM after history.url has already
    // changed. Re-check a few times without causing a reload.
    for (const delay of [120, 500, 1400]) {
      routePresentationRecoveryTimers.push(setTimeout(() => {
        clearStaleRouteScopedUi(`${source}:scoped-${delay}`);
        if (DS.isSingleChatPage?.()) return;
        clearStaleNonChatPresentationState(`${source}:${delay}`);
        DS.scheduleRun?.({ priority: "critical", source: `route-recovery-${delay}` });
      }, delay));
    }
  }

  DS.clearStaleNonChatPresentationState = clearStaleNonChatPresentationState;
  DS.clearStaleRouteScopedUi = clearStaleRouteScopedUi;

  function checkRouteChange() {
    if (location.href === DS.state.lastUrl) return false;
    const routeCheckStartedAt = performance.now();

    DS.state.lastUrl = location.href;
    slowStepThrottle.clear();
    DS.invalidatePageStateCache?.();
    DS.handleLorebookWorkflowRouteChange?.();
    DS.state.openedImportRevision = -1;
    DS.state.lastMarkedChatId = "";
    DS.state.messageDirtyRoots?.clear?.();
    essentialChatDirtyRoots.clear();
    DS.state.messageLaneRoots = null;
    DS.state.chatEnhancerQuietUntil = 0;
    clearTimeout(messageEnhancerQuietTimer);
    messageEnhancerQuietTimer = null;
    DS.state.activeMessageEditRoots?.clear?.();
    clearBlockedRefreshBatch();
    messageEditSettleTimers.forEach(timer => clearTimeout(timer));
    messageEditSettleTimers.clear();
    invalidateLoadedChatMessageCount();
    DS.bumpDomRevision?.();

    if (DS.isSingleChatPage?.()) {
      startChatStartupQuietWindow("route-change");
      DS.diagPerformance?.("chat-navigation", { mountedMessages: loadedChatMessageCount(), phase: "route-start" });
    }
    else {
      DS.state.chatStartupQuietUntil = 0;
      DS.state.chatStartupQuietRoute = "";
      clearTimeout(DS.state.chatStartupQuietTimer);
      DS.state.chatStartupQuietTimer = 0;
    }
    startCreatorProfileStartupQuietWindow("route-change");

    sessionStorage.removeItem("dsAutoReadNotificationsDone");
    DS.resetChatListLoaderForRoute?.();

    // Route cleanup must happen BEFORE the normal 1s rerun quiet period.
    // This matters in the Android WebView, where back/SPA navigation can keep
    // the same document alive while React replaces the chat DOM underneath us.
    scheduleNonChatPresentationRecovery("route-change");

    // Opened/saved tracking must not wait behind the 1s route quiet period.
    // Run once after the URL settles and once after React has had time to mount
    // the destination chat/list DOM. Module-level dedupe keeps these cheap.
    scheduleSavedOpenedLane("route-change", 70);
    setTimeout(() => scheduleSavedOpenedLane("route-change-settled", 0), 450);

    pauseReruns(1000);
    DS.markModelSelectorDirty?.("route-change");
    DS.markAdvertBannerDirty?.("route-change");
    DS.scheduleRun?.({ immediate: true, source: "route-change", dirty: ["all"] });
    // Separate the synchronous QoL route handler cost from subsequent native
    // React mounting / deferred feature work in Inspector and support data.
    const syncMs = Math.max(0, performance.now() - routeCheckStartedAt);
    const routePerf = runtimeCounters();
    routePerf.chatNavigationSyncLastMs = Math.round(syncMs * 10) / 10;
    routePerf.chatNavigationSyncWorstMs = Math.max(Number(routePerf.chatNavigationSyncWorstMs || 0), routePerf.chatNavigationSyncLastMs);
    routePerf.chatNavigationCount = Number(routePerf.chatNavigationCount || 0) + 1;
    DS.diagPerformance?.("route-sync", { durationMs: routePerf.chatNavigationSyncLastMs, route: DS.isSingleChatPage?.() ? "chat" : "other" });
    return true;
  }

  function elementMayBelongToCardArea(element) {
    const node = element instanceof Element ? element : element?.parentElement;
    if (!node) return false;
    if (node.closest?.("a[href*='/chat/'], a[href*='/chatbot/']")) return true;
    // Only inspect ancestors that are themselves card shells. The old version
    // queried every ancestor for descendant links and could mark a *whole grid*
    // dirty when React changed an unrelated heading/sidebar sibling.
    return !!node.closest?.("div.relative.group.rounded-xl, div[class*='rounded-xl'][class*='group'], .ds-card-density-target");
  }

  function mutationsMayAffectCards(mutations) {
    if (!isCardListingContext()) return false;

    return mutations.some(mutation => {
      if (elementMayBelongToCardArea(mutation.target)) return true;

      return [...mutation.addedNodes, ...mutation.removedNodes].some(node => {
        if (!(node instanceof Element)) return false;
        if (node.matches?.("a[href*='/chat/'], a[href*='/chatbot/']")) return true;
        return !!node.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
      });
    });
  }

  function mutationsAddBotCards(mutations) {
    if (!isCardListingContext()) return false;
    return mutations.some(mutation => [...(mutation.addedNodes || [])].some(node => {
      if (!(node instanceof Element)) return false;
      if (node.matches?.("a[href*='/chat/'], a[href*='/chatbot/']")) return true;
      return !!node.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
    }));
  }

  function isLikelyHistoryInsertionBurst(addedCount) {
    if (!DS.isSingleChatPage?.() || addedCount <= 0 || loadedChatMessageCount() < 80) return false;
    const now = Date.now();
    if (now - chatHistoryMutationBurst.lastAt > 450) chatHistoryMutationBurst.count = 0;
    chatHistoryMutationBurst.lastAt = now;
    chatHistoryMutationBurst.count += addedCount;
    if (chatHistoryMutationBurst.count < 3) return false;
    chatHistoryMutationBurst.count = 0;
    return true;
  }


  // Essential chat controls must not wait for the ~20s message-decoration
  // quiet window. This pass touches only the latest few native message roots.
  let essentialChatControlsPending = false;
  const essentialChatDirtyRoots = new Set();
  function repairEssentialChatControls(source = "mount") {
    if (DS.isQolPausedForTab?.() || !DS.state?.settings?.enabled || !DS.isSingleChatPage?.()) return;
    const settings = DS.state.settings;
    try {
      if (settings.replaceChatImageWithOocButton) DS.applyEssentialOocShortcut?.();
      // Message mounts should not rebuild the Mini Panel/OOC template picker.
      // Critical Settings/route passes still reconcile it when preferences change.
      if ((settings.showOocTools || settings.quickPanelShowOoc) &&
          !document.getElementById("ds-qol-ooc-row")) DS.applyOocTools?.();
      const newRoots = [...essentialChatDirtyRoots].filter(root => root?.isConnected);
      essentialChatDirtyRoots.clear();
      // Only the native roots touched by this MutationObserver delivery.
      // The cached newest roots are used only for the first startup pass.
      const roots = newRoots.length ? newRoots.slice(-8) : (DS.getLoadedMessageRoots?.() || []).slice(-8);
      for (const root of roots) DS.repairMessageToolbarForRoot?.(root);
      DS.diagPerformance?.("essential-controls", { source, inspected: Math.min(8, roots.length) });
    } catch (error) {
      DS.runtimeLog?.("warn", "essential-controls", String(error?.message || error));
    }
  }
  function scheduleEssentialChatControls(source = "mount", roots = []) {
    for (const root of roots) if (root?.isConnected) essentialChatDirtyRoots.add(root);
    if (essentialChatControlsPending || DS.isQolPausedForTab?.()) return;
    essentialChatControlsPending = true;
    // Targeted once per animation frame; never a full-message scan.
    requestAnimationFrame(() => {
      essentialChatControlsPending = false;
      repairEssentialChatControls(source);
    });
  }

  DS.installMainPageObserver?.({
    runtimeCounters,
    checkRouteChange,
    scheduleEssentialChatControls,
    messageRootMutationSets,
    scheduleChatStartupQuietResume,
    mutationsMayAffectChatListRows,
    scheduleSavedOpenedLane,
    shouldPauseHiddenTab,
    syncMessageEditGuards,
    mutationRemovedPersistentChatShortcut,
    mutationRemovedPersistentChatHeaderControl,
    mutationAddedNativeChatHeader,
    mutationIsOnlyQolUi,
    mutationsAddOrRemoveMessageRoots,
    mutationIsMessageScoped,
    mutationTouchesNativeChatHeader,
    mutationsAreComposerOnly,
    collectMessageCacheMutationTargets,
    nodeInsidePendingMessageEdit,
    updateLoadedChatMessageCountFromMutations,
    addedMessageRootCount,
    runtimeProfile,
    isLikelyHistoryInsertionBurst,
    scheduleChatHistoryBatchRefresh,
    loadedChatMessageCount,
    isCardListingContext,
    mutationsMayAffectCards,
    mutationsAreChatLocal,
    mutationsAddBotCards
  });

  function primeLargeChatMessageLane(source = "resume") {
    if (!DS.isSingleChatPage?.()) return false;
    const roots = DS.getLoadedMessageRoots?.() || [];
    if (roots.length < 120) return false;

    DS.state.messageResumeLazyUntil = Date.now() + 8000;
    const dirty = DS.state.messageDirtyRoots || (DS.state.messageDirtyRoots = new Set());
    // Hidden tabs can accumulate hundreds of stale dirty roots. On resume,
    // discard that backlog and only enhance what the user can see plus the
    // newest messages. Older history is picked up lazily while scrolling.
    dirty.clear();
    const visible = DS.getMessageEnhancerRoots?.({ forceLazy: true, newest: 24, margin: 1400 }) || roots.slice(-24);
    let queued = 0;
    for (const root of visible) {
      if (DS.messageEnhancerHasVisited?.(root)) continue;
      if (DS.markMessageRootDirty?.(root)) queued++;
    }

    const counters = runtimeCounters();
    counters.messageResumeLazyPrunes = Number(counters.messageResumeLazyPrunes || 0) + 1;
    counters.messageResumeLazyRoots = Number(counters.messageResumeLazyRoots || 0) + queued;
    if (queued) DS.scheduleMessageLane?.(`lazy-${source}`);
    return true;
  }

  function scheduleLazyHistoryEnhancement() {
    if (!DS.isSingleChatPage?.()) return;
    clearTimeout(DS.state.messageLazyScrollTimer);
    DS.state.messageLazyScrollTimer = window.setTimeout(() => {
      DS.state.messageLazyScrollTimer = null;
      const roots = DS.getLoadedMessageRoots?.() || [];
      if (roots.length < 120) return;
      DS.state.messageResumeLazyUntil = Math.max(Number(DS.state.messageResumeLazyUntil || 0), Date.now() + 1200);
      const near = DS.getMessageEnhancerRoots?.({ forceLazy: true, newest: 8, margin: 900 }) || [];
      let added = 0;
      for (const root of near) {
        if (DS.messageEnhancerHasVisited?.(root)) continue;
        if (DS.markMessageRootDirty?.(root)) added++;
      }
      if (added) {
        const counters = runtimeCounters();
        counters.messageLazyScrollBatches = Number(counters.messageLazyScrollBatches || 0) + 1;
        counters.messageLazyScrollRoots = Number(counters.messageLazyScrollRoots || 0) + added;
        DS.scheduleMessageLane?.("lazy-history-scroll");
      }
    }, 180);
  }

  function installRefreshTrackers() {
    if (DS.state.refreshTrackersInstalled) return;
    DS.state.refreshTrackersInstalled = true;

    // One activation may emit both pageshow and visibilitychange. Do not run
    // two immediate full-page passes, especially with dozens of open tabs.
    // Coalesce only visible presentation work; background data/tracking lanes
    // and the explicit user-configured hidden-tab pause remain unchanged.
    let visibleWakeTimer = 0;
    function scheduleSettledVisibleWake(source) {
      const perf = runtimeCounters();
      perf.tabVisibleWakeRequests = Number(perf.tabVisibleWakeRequests || 0) + 1;
      if (visibleWakeTimer) {
        perf.tabVisibleWakeCoalesced = Number(perf.tabVisibleWakeCoalesced || 0) + 1;
        clearTimeout(visibleWakeTimer);
      }
      visibleWakeTimer = window.setTimeout(() => {
        visibleWakeTimer = 0;
        if (document.hidden || DS.isQolPausedForTab?.()) return;
        // A hidden tab can navigate while timers are suspended. Reconcile its
        // route before trying to repair UI belonging to the previous page.
        if (checkRouteChange()) return;
        perf.tabVisibleWakeRuns = Number(perf.tabVisibleWakeRuns || 0) + 1;
        scheduleNonChatPresentationRecovery(source);
        scheduleSavedOpenedLane(source, 40);
        primeLargeChatMessageLane(source);
        DS.scheduleRun?.({ source: `${source}-settled`, dirty: ["all"] });
      }, 160);
    }

    document.addEventListener("scroll", () => {
      DS.state.userScrollingUntil = Date.now() + 220;
      scheduleLazyHistoryEnhancement();
    }, { passive: true, capture: true });

    document.addEventListener("visibilitychange", () => {
      DS.applyPerformanceMode?.();

      if (document.hidden) {
        clearTimeout(visibleWakeTimer);
        visibleWakeTimer = 0;
        if (!discardedWakeSessionActive()) DS.maybeAutoReadNotifications?.("tab-hidden");
      } else if (discardedWakeSessionActive()) {
        clearTimeout(visibleWakeTimer);
        visibleWakeTimer = 0;
        noteDiscardedWakeVisible("visibilitychange");
        DS.scheduleRun?.({ priority: "critical", immediate: true, source: "discarded-wake-visible" });
        scheduleChatStartupQuietResume("discarded-visible");
      } else {
        scheduleSettledVisibleWake("visible");
      }
    }, true);

    window.addEventListener("pageshow", () => {
      if (discardedWakeSessionActive()) {
        if (!document.hidden) noteDiscardedWakeVisible("pageshow");
        DS.scheduleRun?.({ priority: "critical", immediate: true, source: "discarded-wake-pageshow" });
        scheduleChatStartupQuietResume("discarded-pageshow");
        return;
      }
      // pageshow can fire alongside visibilitychange when returning to a
      // background tab. A single settled wake handles both events.
      if (!document.hidden) scheduleSettledVisibleWake("pageshow");
    }, true);

    window.addEventListener("popstate", () => {
      // Let the URL/history entry settle first; checkRouteChange then performs
      // the synchronous non-chat scrub before the normal rerun quiet period.
      setTimeout(() => {
        if (!checkRouteChange()) scheduleNonChatPresentationRecovery("popstate");
      }, 0);
    }, true);

    document.addEventListener("dragonscript-qol-compact", () => {
      DS.scheduleRun?.({ priority: "slow", source: "compact" });
    }, true);

    // Protect native Regenerate/Send interactions from nonessential QoL work.
    // Never preventDefault(), synthesize a click, or inspect message text.
    document.addEventListener("pointerdown", event => {
      if (!DS.isSingleChatPage?.() || !DS.state?.settings?.enabled) return;
      const button = event.target?.closest?.("button");
      if (!button || button.matches?.("[id^='ds-'],[class*='ds-qol']") || button.closest?.("#ds-qol-panel,[data-ds-qol-owned]")) return;
      const label = String(button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent || "").trim().slice(0, 90);
      if (!/\b(?:regenerat(?:e|ion)?|reroll|retry|send(?: message)?)\b/i.test(label)) return;
      DS.state.nativeActionQuietUntil = Date.now() + 1100;
      const counters = runtimeCounters();
      counters.nativeActionGuardStarts = Number(counters.nativeActionGuardStarts || 0) + 1;
    }, { capture: true, passive: true });

    // Event Timing reveals actual input delay. Keep only aggregate timings; do
    // not collect text, full selectors, message IDs, or raw event records.
    try {
      if (typeof PerformanceObserver === "function" && PerformanceObserver.supportedEntryTypes?.includes?.("event")) {
        const inputObserver = new PerformanceObserver(list => {
          if (!DS.state?.settings?.performanceDiagnostics || document.hidden) return;
          const counters = runtimeCounters();
          for (const entry of list.getEntries()) {
            if (entry.name !== "click" || !DS.isSingleChatPage?.()) continue;
            const delay = Math.max(0, Number(entry.processingStart || 0) - Number(entry.startTime || 0));
            const duration = Math.max(0, Number(entry.duration || 0));
            const target = entry.target?.closest?.("button");
            const label = String(target?.getAttribute?.("aria-label") || target?.getAttribute?.("title") || "").slice(0, 60);
            const category = /regenerat|reroll|retry/i.test(label) ? "regenerate" : /send/i.test(label) ? "send" : "other";
            counters.nativeSlowClickSamples = Number(counters.nativeSlowClickSamples || 0) + 1;
            counters.nativeWorstInputDelayMs = Math.max(Number(counters.nativeWorstInputDelayMs || 0), Math.round(delay));
            counters.nativeWorstClickMs = Math.max(Number(counters.nativeWorstClickMs || 0), Math.round(duration));
            counters.nativeLastSlowClickCategory = category;
          }
        });
        inputObserver.observe({ type: "event", durationThreshold: 64 });
        DS.state.nativeInputObserver = inputObserver;
      }
    } catch {}

    try {
      if (typeof PerformanceObserver === "function" && PerformanceObserver.supportedEntryTypes?.includes?.("longtask")) {
        const observer = new PerformanceObserver(list => {
          const entries = list.getEntries();
          if (entries.length && DS.isSingleChatPage?.()) {
            DS.state = DS.state || {};
            DS.state.chatStartupLastLongTaskAt = Date.now();
          }
          if (!DS.state?.settings?.performanceDiagnostics && !DS.isDiagnosticTraceActive?.("normal")) return;
          const counters = runtimeCounters();
          for (const entry of entries) {
            const ms = Number(entry.duration || 0);
            const rounded = Math.round(ms * 10) / 10;
            const start = Number(entry.startTime || 0);
            const overlaps = longTaskOverlapNames(start, start + ms);
            counters.longTasks = Number(counters.longTasks || 0) + 1;
            counters.lastLongTaskMs = rounded;
            counters.maxLongTaskMs = Math.max(Number(counters.maxLongTaskMs || 0), rounded);
            counters.lastLongTaskOverlap = overlaps.join(", ") || "none";
            if (overlaps.length) {
              counters.longTasksWithQolOverlap = Number(counters.longTasksWithQolOverlap || 0) + 1;
              counters.maxLongTaskWithQolOverlapMs = Math.max(Number(counters.maxLongTaskWithQolOverlapMs || 0), rounded);
            } else {
              counters.longTasksWithoutQolOverlap = Number(counters.longTasksWithoutQolOverlap || 0) + 1;
              counters.maxLongTaskWithoutQolOverlapMs = Math.max(Number(counters.maxLongTaskWithoutQolOverlapMs || 0), rounded);
            }
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
        DS.state.longTaskObserver = observer;
      }
    } catch {}
  }

  function changedSettingNames(changes = {}) {
    const names = new Set();
    const prefix = "dsSettingV1:";
    for (const key of Object.keys(changes || {})) {
      if (String(key).startsWith(prefix)) names.add(String(key).slice(prefix.length));
    }
    const monolithic = changes.settings;
    if (monolithic) {
      const oldValue = monolithic.oldValue && typeof monolithic.oldValue === "object" ? monolithic.oldValue : {};
      const newValue = monolithic.newValue && typeof monolithic.newValue === "object" ? monolithic.newValue : {};
      for (const key of new Set([...Object.keys(oldValue), ...Object.keys(newValue)])) {
        try {
          if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) names.add(key);
        } catch { names.add(key); }
      }
    }
    return names;
  }

  function slowDirtyForSettingChanges(changes = {}) {
    const names = changedSettingNames(changes);
    if (!names.size) return ["all"];
    const modelKeys = new Set(["expandModelSelectorDescriptions", "hideModelUpgradeButtons", "customizeModelQuickMenu", "modelFavoriteNames", "modelHiddenNames", "modelQuickFavoritesOnly"]);
    const advertKeys = new Set(["hideAdvertBanners"]);
    const dirty = new Set();
    let hasOther = false;
    for (const name of names) {
      if (modelKeys.has(name)) dirty.add("model");
      else if (advertKeys.has(name)) dirty.add("adverts");
      else hasOther = true;
    }
    if (names.has("hideAdvertBanners")) DS.markAdvertBannerDirty?.("settings-change");
    if ([...names].some(name => modelKeys.has(name))) DS.markModelSelectorDirty?.("settings-change");
    if (hasOther) return ["all"];
    return dirty.size ? [...dirty] : ["all"];
  }

  try {
    if (DS.isExtensionContextValid?.()) {
      chrome.storage.onChanged.addListener(async changes => {
        const settingsChanged = !!(DS.hasSettingStorageChanges?.(changes));
        if (
          settingsChanged ||
          changes[DS.OPENED_KEY] ||
          changes[DS.OPENED_META_KEY] ||
          changes[DS.BLOCKED_BOTS_KEY] ||
          changes[DS.PERSONAS_KEY] ||
          changes[DS.NOT_INTERESTED_KEY] ||
          changes[DS.FAVORITE_CREATORS_KEY] ||
          changes[DS.FOLLOWED_CREATORS_KEY] ||
          changes[DS.FAVORITE_BOTS_KEY] ||
          changes[DS.LATER_BOTS_KEY] ||
          changes[DS.BOT_ORGANIZER_KEY] ||
          changes[DS.OOC_TEMPLATES_KEY]
        ) {
          if (settingsChanged) slowStepThrottle.clear();
          if (typeof DS.applyStorageChanges === "function") {
            DS.applyStorageChanges(changes);
          } else {
            await DS.loadState();
          }
          if (settingsChanged || changes[DS.OPENED_KEY] || changes[DS.OPENED_META_KEY]) {
            DS.state.openedImportRevision = -1;
          }
          // Reconcile active feature lifecycles against the newly loaded settings.
          // Do not run unrelated feature scans or change saved settings.
          if (settingsChanged) {
            await DS.featureLifecycle?.reconcileSettings?.(changedSettingNames(changes), DS.state?.settings);
          }
          if (settingsChanged && document.hidden && DS.state?.settings?.autoReadNotifications) {
            setTimeout(() => DS.maybeAutoReadNotifications?.("settings-change"), 0);
          }
          const granularEnabledChange = changes[DS.settingStorageKey?.("enabled") || ""];
          const masterWasDisabled = !!(
            (changes.settings && changes.settings.oldValue?.enabled !== false && changes.settings.newValue?.enabled === false) ||
            (granularEnabledChange && granularEnabledChange.oldValue !== false && granularEnabledChange.newValue === false)
          );
          if (
            settingsChanged ||
            changes[DS.OPENED_KEY] ||
            changes[DS.OPENED_META_KEY] ||
            changes[DS.FAVORITE_BOTS_KEY] ||
            changes[DS.LATER_BOTS_KEY]
          ) {
            scheduleSavedOpenedLane("storage-change", 40);
          }

          // Blocking one bot already hides that clicked card immediately. The
          // expensive part was then waking the entire listing pipeline for every
          // single block while the user was still browsing. Batch consecutive
          // single-bot additions and refresh once after two quiet minutes. Bulk
          // imports, unblocks, route changes, settings changes, and unrelated
          // storage changes still refresh immediately.
          const blockedChange = changes[DS.BLOCKED_BOTS_KEY];
          const blockedStats = blockedChange ? blockedStoreChangeStats(blockedChange) : { added: 0, removed: 0 };
          const changedKeys = Object.keys(changes || {});
          const blockBatchCompatibleKeys = new Set([DS.BLOCKED_BOTS_KEY, DS.OPENED_KEY, DS.OPENED_META_KEY]);
          const onlyBlockRelated = changedKeys.length > 0 && changedKeys.every(key => blockBatchCompatibleKeys.has(key));
          const deferSingleBlockRefresh = !!(
            blockedChange &&
            isCardListingContext() &&
            onlyBlockRelated &&
            blockedStats.added > 0 &&
            blockedStats.added <= 4 &&
            blockedStats.removed === 0
          );

          if (deferSingleBlockRefresh) {
            scheduleBlockedRefreshAfterBurst("blocked-storage");
          } else {
            if (blockedChange) clearBlockedRefreshBatch();
            const storageDirty = settingsChanged ? slowDirtyForSettingChanges(changes) : ["all"];
            DS.scheduleRun?.({ immediate: true, source: "storage-change", dirty: storageDirty });
          }

          // A few SpicyChat layouts keep React/inline layout state after a large
          // set of QoL DOM changes is removed. Run cleanup first, then reload the
          // current SpicyChat route once when the master switch is turned off so
          // the user is never left with a half-cleaned/blank layout.
          const masterWasEnabled = !!(
            (changes.settings && changes.settings.oldValue?.enabled === false && changes.settings.newValue?.enabled !== false) ||
            (granularEnabledChange && granularEnabledChange.oldValue === false && granularEnabledChange.newValue !== false)
          );
          if (masterWasEnabled) {
            setTimeout(() => { try { location.reload(); } catch {} }, 180);
          }
          if (masterWasDisabled) {
            setTimeout(async () => {
              try { await runDisabledCleanup(); } catch {}
              try { location.reload(); } catch {}
            }, 180);
          }
        }
      });
    }
  } catch (error) {
    console.warn(`[${DS.EXT_NAME}] storage listener skipped`, error);
  }

  DS.startMainRuntime = async function startMainRuntime() {
    if (DS.isQolPausedForTab?.() && !DS.isQolWorkerTab?.()) return;
    await DS.loadState();
    try { await DS.resolveBackgroundWorkerIdentity?.(); } catch {}
    DS.runtimeLog?.("info", "main", "State loaded", {
      enabled: DS.state?.settings?.enabled !== false,
      backgroundWorker: String(DS.state?.qolBackgroundWorker || "")
    });

    if (DS.state.qolBackgroundWorker) {
      DS.runtimeLog?.("info", "main", `${DS.state.qolBackgroundWorker} helper tab: normal QoL page processing skipped`);
      return;
    }
    if (DS.state.quickDislikeWorker) {
      DS.runtimeLog?.("info", "main", "Quick-dislike helper tab: normal QoL page processing skipped");
      return;
    }
    if (DS.state.recommendationWorker) {
      DS.runtimeLog?.("info", "main", "Recommendation helper tab: normal QoL page processing skipped");
      return;
    }
    if (DS.state.listingRefillWorker) {
      DS.runtimeLog?.("info", "main", "Listing helper tab: normal QoL page processing skipped");
      return;
    }
    // No feature observers, trackers, or scheduled work when Full QoL is off.
    // The storage listener remains so re-enabling can reload a clean page.
    if (DS.state.settings?.enabled === false) {
      DS.runtimeLog?.("info", "main", "Full QoL disabled: runtime not started");
      return;
    }

    DS.installOpenedClickTracker?.();
    installRefreshTrackers();
    installTypingPerformanceTracker();
    applyRuntimePerformancePresentation();
    if (DS.isSingleChatPage?.()) startChatStartupQuietWindow("startup");
    DS.observePage();
    if (DS.isSingleChatPage?.()) {
      repairEssentialChatControls("startup");
      // Tiny initial retries cover React's async first render without polling.
      setTimeout(() => scheduleEssentialChatControls("startup-settle"), 260);
      setTimeout(() => scheduleEssentialChatControls("startup-late"), 1050);
    }
    if (!discardedWakeSessionActive()) DS.maybeAutoReadNotifications?.("startup");

    // A discarded tab that wakes in the background stays nearly passive until
    // the user actually shows it. Normal tabs keep the tiny saved/opened lane.
    if (!discardedWakeSessionActive()) scheduleSavedOpenedLane("startup", 0);

    // Get filtering/chat controls in place first, then let cosmetic/heavier QoL
    // work enter the existing idle lane. Previously startup awaited the full slow
    // pass before yielding, which made SpicyChat's first render feel noticeably
    // heavier on busy listings and large chats.
    await DS.runCritical?.();
    DS.scheduleRun?.({ priority: "slow", immediate: true, source: "initial-idle-injection" });
    await DS.maybeShowUpdateToast?.();
  };
  DS.installMainDiagnostics?.({ runtimeProfile, loadedChatMessageCount, desktopAppPerformanceGuardActive });

})();

}
