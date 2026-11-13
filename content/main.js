// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  // In normal installs, split scheduler factories register in manifest order.
  // A mixed/late extension load must not create a half-initialized runtime.
  const mainFactories = [
    ["createMainMessageLaneRuntime", "content/main-message-lane-runtime.js"],
    ["createMainCriticalPass", "content/main-critical-pass.js"],
    ["createMainSlowPass", "content/main-slow-pass.js"]
  ];
  let mainBootstrapStarted = false;
  let mainBootstrapRetries = 0;
  function startMainWhenReady() {
    if (mainBootstrapStarted || window.__DSQ_TAB_GATE__?.paused) return;
    const ds = window.DragonScriptQoL;
    const missing = mainFactories.filter(([name]) => typeof ds?.[name] !== "function");
    if (missing.length) {
      if (mainBootstrapRetries++ < 8) {
        setTimeout(startMainWhenReady, 75);
        return;
      }
      // Never replace a required lane with a silent no-op.
      console.error("[DragonScript QoL] Main runtime not started: missing modules: " +
        missing.map(([, file]) => file).join(", ") +
        ". Check the installed build, then reload the extension and this page.");
      return;
    }
    mainBootstrapStarted = true;
    initializeMainRuntime();
  }
  function initializeMainRuntime() {
  const DS = window.DragonScriptQoL;
  const { messageQuickActionsEnabled, deepSleepEnabled, anySetting,
    chatTopBarWanted, composerWanted, chatUiWanted, topBarWanted,
    notificationsWanted, cardFilteringWanted, cardBlockUiWanted,
    modelSelectorWanted, generationMetadataWanted, personaToolsWanted,
    memoryManagerWanted, botEditorRoute, lorebookEditorRoute } = DS.mainFeatureDemand;
  const { loadedChatMessageCount, invalidateLoadedChatMessageCount,
    messageRootMutationSets, updateLoadedChatMessageCountFromMutations } =
    DS.createMainChatMessageCounter({ runtimeCounters });
  // Keep the existing count API available for the Mini Panel and diagnostics.
  DS.getLoadedChatMessageCount = loadedChatMessageCount;
  const { normalizeSlowDirtyGroups, slowDirtyHas, blockedStoreChangeStats } = DS.mainSchedulerUtils;
  const { nodeIsOrContainsChatMessage, mutationIsMessageScoped, mutationsAreComposerOnly, mutationsAreChatLocal, mutationsAddOrRemoveMessageRoots, addedMessageRootCount, messageRootForMutationNode, collectMessageCacheMutationTargets } = DS.mainMessageMutations;
  const { mutationRemovedPersistentChatShortcut, mutationRemovedPersistentChatHeaderControl,
    mutationAddedNativeChatHeader, mutationTouchesNativeChatHeader, mutationIsOnlyQolUi } = DS.mainDomMutationClassifiers;
  const { isCardListingContext, mutationsMayAffectCards, mutationsAddBotCards } = DS.mainCardMutationClassifiers;
  const { applyRuntimePerformancePresentation, installTypingPerformanceTracker } = DS.mainPresentationHelpers;
  const { scheduleNonChatPresentationRecovery } = DS.createMainRouteRecovery({ runtimeCounters });
  const { prepareEditedMessageForSave, syncMessageEditGuards,
    nodeInsidePendingMessageEdit, resetMessageEditGuards } = DS.createMainMessageEditGuards({
    runtimeCounters, pauseReruns, getPauseRerunsUntil: () => laneState.pauseRerunsUntil,
    desktopAppPerformanceGuardActive
  });
  const { scheduleChatHistoryBatchRefresh, isLikelyHistoryInsertionBurst } =
    DS.createMainChatHistoryBatches({ runtimeCounters, loadedChatMessageCount });
  const { repairEssentialChatControls, scheduleEssentialChatControls, clearEssentialChatDirtyRoots } =
    DS.createMainEssentialChatControls({ runtimeCounters });
  const { primeLargeChatMessageLane, scheduleLazyHistoryEnhancement } =
    DS.createMainLazyHistory({ runtimeCounters });
  const { changedSettingNames, slowDirtyForSettingChanges } = DS.mainStorageDirtyGroups;
  const { rerunAfterMenuSettles, installChatMenuGuards } = DS.createMainChatMenuGuards({
    pauseReruns, scheduleChatHistoryBatchRefresh, prepareEditedMessageForSave
  });
  const { discardedWakeSessionActive, noteDiscardedWakeVisible,
    startChatStartupQuietWindow, chatStartupQuietActive, scheduleChatStartupQuietResume,
    chatStartupWarmupActive, chatStartupWarmupRemainingMs } = DS.createMainChatStartupGuard({
    loadedChatMessageCount, scheduleSavedOpenedLane, primeLargeChatMessageLane
  });
  const { creatorProfileStartupQuietActive, scheduleCreatorProfileQuietResume,
    startCreatorProfileStartupQuietWindow } = DS.createMainCreatorProfileQuiet({ runtimeCounters });
  const { clearBlockedRefreshBatch, scheduleBlockedRefreshAfterBurst } =
    DS.createMainBlockedRefresh({ runtimeCounters });
  const { checkRouteChange } = DS.createMainRouteChange({
    runtimeCounters,
    clearSlowThrottle: () => slowStepThrottle.clear(),
    clearEssentialChatDirtyRoots,
    clearMessageEnhancerQuiet: () => {
      clearTimeout(laneState.messageEnhancerQuietTimer);
      laneState.messageEnhancerQuietTimer = null;
    },
    resetMessageEditGuards, clearBlockedRefreshBatch,
    invalidateLoadedChatMessageCount, loadedChatMessageCount,
    startChatStartupQuietWindow, startCreatorProfileStartupQuietWindow,
    scheduleNonChatPresentationRecovery, scheduleSavedOpenedLane, pauseReruns
  });
  const installRefreshTrackers = DS.createMainRefreshTrackers({
    runtimeCounters, checkRouteChange, scheduleNonChatPresentationRecovery,
    scheduleSavedOpenedLane, primeLargeChatMessageLane, scheduleLazyHistoryEnhancement,
    discardedWakeSessionActive, noteDiscardedWakeVisible,
    scheduleChatStartupQuietResume, longTaskOverlapNames
  });

  let pauseRerunTimer = null;
  let idleHandle = null;
  let savedOpenedLaneTimer = null;
  let savedOpenedLaneRunning = false;
  let savedOpenedLanePending = false;
  const laneState = {
    pauseRerunsUntil: 0,
    criticalTimer: null,
    messageLaneTimer: null,
    messageEnhancerQuietTimer: null,
    messageLaneDueAt: 0,
    messageLaneRunning: false,
    messageLanePending: false,
    slowTimer: null,
    slowScheduledAt: 0,
    slowQuietTimer: null,
    criticalRunning: false,
    criticalPending: false,
    slowRunning: false,
    slowPending: false,
    slowSliceState: null,
  };
  const slowStepThrottle = new Map();
  const SLOW_SLICE_BUDGET_MS = 10;
  const slowDirtyGroups = new Set(["all"]);

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
    if (!laneState.slowRunning || laneState.criticalRunning || laneState.messageLaneRunning || savedOpenedLaneRunning) return;
    const slice = laneState.slowSliceState;
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
    if (laneState.slowSliceState === slice) slice.sliceStarted = performance.now();
  }

  // Scroll-button visual ownership lives in scroll-to-top.js.
  // Keep a safe no-op when Custom physically excludes that feature.
  function syncNativeScrollBackToTopVisibility() {
    DS.syncNativeScrollBackToTopVisibility?.();
  }

  function pauseReruns(ms = 6500) {
    laneState.pauseRerunsUntil = Math.max(laneState.pauseRerunsUntil, Date.now() + ms);

    clearTimeout(pauseRerunTimer);
    pauseRerunTimer = setTimeout(() => {
      DS.scheduleRun?.({ priority: "critical", source: "menu-settled" });
      DS.scheduleRun?.({ priority: "slow", source: "menu-settled" });
    }, ms + 150);
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

  function androidWebViewPerformanceGuardActive() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || DS.isQolWorkerTab?.()) return false;
    const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
    return !!env.android;
  }

  DS.isDesktopAppPerformanceGuardActive = desktopAppPerformanceGuardActive;

  function runtimeCounters() {
    return DS.state.runtimePerformance || (DS.state.runtimePerformance = { mutations: 0, qolOnlyMutations: 0, chatLocalMutations: 0, composerOnlyMutationSkips: 0, schedules: 0, criticalSchedules: 0, slowSchedules: 0, deferredWhileScrolling: 0, hiddenSkips: 0, messageLaneSchedules: 0, messageLaneRuns: 0, desktopAppGuardDelays: 0 });
  }

  async function runPersonaPickerLowImpact(source = "runtime") {
    if (!DS.isPersonaPickerOpen?.()) return false;
    const counters = runtimeCounters();
    counters.personaPickerLowImpactRuns = Number(counters.personaPickerLowImpactRuns || 0) + 1;
    counters.lastPersonaPickerLowImpactSource = String(source || "runtime");
    await runStep("persona picker low-impact", () => DS.applyPersonaPickerLightweight?.());
    return true;
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

  function listingSafeStepGroup(name) {
    // Aggregate by known work class, not by bot names, URLs or user data.
    if (/sidebar|banner|premium/i.test(name)) return "layout";
    if (/card|listing|recommendation/i.test(name)) return "listing";
    return "other";
  }

  async function runThrottledFeatureStep(name, wanted, minIntervalMs, fn, force = false) {
    const resolvedWanted = typeof wanted === "function" ? !!wanted() : !!wanted;
    const settings = DS.state?.settings || {};
    if (deepSleepEnabled(settings) && !resolvedWanted) {
      // Not an attempted scan. Keep disabled features asleep and out of the
      // slow-step throttle counters even when a route is repeatedly updated.
      return runFeatureStep(name, false, fn);
    }

    const now = Date.now();
    const route = location.href;
    const previous = slowStepThrottle.get(name);
    const interval = Math.max(0, Number(minIntervalMs) || 0);
    if (!force && previous?.route === route && now - Number(previous.at || 0) < interval) {
      const counters = runtimeCounters();
      counters.slowStepThrottleSkips = Number(counters.slowStepThrottleSkips || 0) + 1;
      // Bounded category counters distinguish throttled profile checks from
      // actual expensive listing scans without recording private page data.
      const group = name.includes("profile") || name.includes("creator moderation")
        ? "profile" : listingSafeStepGroup(name);
      const buckets = counters.slowStepThrottleCategories || (counters.slowStepThrottleCategories = {});
      buckets[group] = Number(buckets[group] || 0) + 1;
      return null;
    }

    slowStepThrottle.set(name, { route, at: now });
    const counters = runtimeCounters();
    counters.throttledStepRuns = Number(counters.throttledStepRuns || 0) + 1;
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


  DS.createMainMessageLaneRuntime({ androidWebViewPerformanceGuardActive, applyRuntimePerformancePresentation, chatStartupQuietActive, desktopAppPerformanceGuardActive, generationMetadataWanted, loadedChatMessageCount, messageQuickActionsEnabled, runFeatureStep, runStep, runtimeCounters, runtimeProfile, scheduleChatStartupQuietResume, shouldPauseHiddenTab, laneState });

  let androidChatListQuietRoute = "";
  let androidChatListQuietUntil = 0;
  function deferAndroidChatListWorkForFirstPaint() {
    if (!androidWebViewPerformanceGuardActive()) return false;
    const route = location.pathname;
    if (androidChatListQuietRoute !== route) {
      androidChatListQuietRoute = route;
      androidChatListQuietUntil = Date.now() + 1500;
    }
    const remaining = androidChatListQuietUntil - Date.now();
    if (remaining <= 0) return false;
    runtimeCounters().androidChatListFirstPaintDeferrals = Number(runtimeCounters().androidChatListFirstPaintDeferrals || 0) + 1;
    scheduleSavedOpenedLane("android-chat-list-first-paint", remaining + 80);
    return true;
  }

  async function runSavedOpenedLane(source = "saved-opened") {
    if (savedOpenedLaneRunning) {
      savedOpenedLanePending = true;
      return;
    }

    const settings = DS.state?.settings || {};
    if (!settings.enabled || DS.state.quickDislikeWorker || DS.state.listingRefillWorker) return;

    const singleChat = !!DS.isSingleChatPage?.();
    const chatList = !!DS.isChatListPage?.();
    if (!chatList) androidChatListQuietRoute = "";
    if (!singleChat && !chatList) return;
    // Android /chats is React-heavy during its first paint. Keep user-visible
    // native rendering ahead of the optional opened-history scan, then run it.
    if (chatList && deferAndroidChatListWorkForFirstPaint()) return;

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

  DS.createMainCriticalPass({ anySetting, botEditorRoute, cardBlockUiWanted, cardFilteringWanted, chatStartupQuietActive, chatStartupWarmupActive, chatStartupWarmupRemainingMs, chatTopBarWanted, chatUiWanted, composerWanted, deepSleepEnabled, discardedWakeSessionActive, isCardListingContext, lorebookEditorRoute, memoryManagerWanted, messageQuickActionsEnabled, rerunAfterMenuSettles, runDisabledCleanup, runDiscardedWakeEssentialChatPass, runFeatureStep, runPersonaPickerLowImpact, runRoutedFeatureStep, runSavedOpenedLane, runStep, runtimeCounters, runtimePlan, runtimeProfile, scheduleChatStartupQuietResume, shouldPauseHiddenTab, syncNativeScrollBackToTopVisibility, laneState });

  const { optionalUiQuietDeadline } = DS.createMainSlowPass({ anySetting, cardFilteringWanted, chatStartupQuietActive, creatorProfileStartupQuietActive, generationMetadataWanted, isCardListingContext, modelSelectorWanted, notificationsWanted, personaToolsWanted, rerunAfterMenuSettles, runDisabledCleanup, runFeatureStep, runPersonaPickerLowImpact, runRoutedFeatureStep, runStep, runThrottledFeatureStep, runtimeCounters, runtimePlan, runtimeProfile, scheduleChatStartupQuietResume, scheduleCreatorProfileQuietResume, scheduleSlowRun, slowDirtyHas, syncNativeScrollBackToTopVisibility, takeSlowDirtyGroups, topBarWanted, laneState });

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
    const androidGuard = androidWebViewPerformanceGuardActive();
    const maxWait = DS.isSingleChatPage?.()
      ? (androidGuard
          ? (profile === "maximum" ? (messageCount >= 250 ? 12000 : 10000) : 8000)
          : appGuard
          ? (profile === "maximum" ? (messageCount >= 250 ? 12000 : 10000) : profile === "aggressive" ? (messageCount >= 250 ? 10000 : 8000) : (messageCount >= 250 ? 8000 : 6000))
          : (profile === "maximum" ? (messageCount >= 250 ? 7000 : 5600) : profile === "aggressive" ? (messageCount >= 250 ? 5200 : 4000) : profile === "adaptive" ? (messageCount >= 250 ? 4200 : 3200) : 2400))
      : (profile === "maximum" ? 4400 : profile === "aggressive" ? 3200 : 2200);

    // v0.1.8.48 changed cosmetic cleanup to a debounced idle lane. On pages
    // with frequent React mutations that debounce could be reset forever, so
    // sidebar/top-bar/premium cleanup would eventually stop being reapplied.
    // Keep the debounce for performance, but cap how long it may be postponed.
    if (!laneState.slowScheduledAt) laneState.slowScheduledAt = now;

    let desiredAt = now + Math.max(0, Number(delay) || 0);
    const quietUntil = optionalUiQuietDeadline();
    if (quietUntil > now) {
      desiredAt = Math.max(desiredAt, quietUntil + 260);
      const perf = runtimeCounters();
      perf.sharedQuietScheduleDeferrals = Number(perf.sharedQuietScheduleDeferrals || 0) + 1;
    }
    // Avoid triggering the message-enhancement and cosmetic lanes on the same
    // frame immediately after a quiet spell; critical work is unaffected.
    if (laneState.messageLaneDueAt > now && Math.abs(desiredAt - laneState.messageLaneDueAt) < 240) {
      desiredAt = laneState.messageLaneDueAt + 240;
      const perf = runtimeCounters();
      perf.optionalLaneStaggers = Number(perf.optionalLaneStaggers || 0) + 1;
    }
    const latestAt = laneState.slowScheduledAt + maxWait;
    const runAt = Math.min(desiredAt, latestAt);
    const wait = Math.max(0, runAt - now);

    clearTimeout(laneState.slowTimer);
    cancelIdleHandle();

    laneState.slowTimer = setTimeout(() => {
      laneState.slowTimer = null;
      laneState.slowScheduledAt = 0;

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
        idleHandle = requestIdleCallback(run, { timeout: androidGuard ? 3200 : appGuard ? 2400 : 900 });
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

      // WebView can freeze when optional decoration competes with native React
      // updates. Keep explicit/immediate actions unaffected; debounce only
      // background maintenance and retain a bounded slow-lane deadline.
      if (!immediate && androidWebViewPerformanceGuardActive()) {
        criticalDelay = Math.max(criticalDelay, profile === "maximum" ? (huge ? 1100 : 850) : (huge ? 850 : 650));
        slowDelay = Math.max(slowDelay, profile === "maximum" ? (huge ? 6500 : 4500) : (huge ? 4800 : 3300));
        counters.androidRuntimeDeferrals = Number(counters.androidRuntimeDeferrals || 0) + 1;
      }

      // Avoid scheduling cosmetic repair work against wheel/touch rendering.
      if (!immediate && Date.now() < Number(DS.state.userScrollingUntil || 0)) {
        criticalDelay = Math.max(criticalDelay, desktopAppPerformanceGuardActive() ? (profile === "maximum" ? 1600 : profile === "aggressive" ? 1300 : 950) : (profile === "maximum" ? 950 : profile === "aggressive" ? 760 : 520));
        slowDelay = Math.max(slowDelay, desktopAppPerformanceGuardActive() ? (profile === "maximum" ? 7500 : profile === "aggressive" ? 6000 : 4500) : (profile === "maximum" ? 3800 : profile === "aggressive" ? 3000 : 1900));
        if (androidWebViewPerformanceGuardActive()) {
          criticalDelay = Math.max(criticalDelay, profile === "maximum" ? 1450 : 1000);
          slowDelay = Math.max(slowDelay, profile === "maximum" ? 7800 : 5400);
        }
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

    if (!immediate && DS.isSingleChatPage?.() &&
        (window.innerWidth <= 760 || !!DS.getRuntimeEnvironment?.()?.android) &&
        Date.now() < Number(DS.state.userTypingUntil || 0)) {
      slowDelay = Math.max(slowDelay, Number(DS.state.userTypingUntil) - Date.now() + 180);
      counters.mobileTypingScheduleDeferrals = Number(counters.mobileTypingScheduleDeferrals || 0) + 1;
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
      clearTimeout(laneState.criticalTimer);
      laneState.criticalTimer = setTimeout(() => DS.runCritical?.(), criticalDelay);
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
            DS.syncNativeInputTimingObserver?.();
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
    installChatMenuGuards();
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

  // Resume startup only after all required factories have registered.
  if (DS.__qolMainStartupPending) {
    DS.__qolMainStartupPending = false;
    Promise.resolve().then(() => DS.startMainRuntime?.()).catch(error => {
      console.error("[DragonScript QoL] Deferred main startup failed", error);
    });
  }
  } // initializeMainRuntime

  startMainWhenReady();

})();

}
