// Core runtime lane: message. Keep scheduling state shared with main.js.
// The factory registers no observers, starts no timers, and processes no UI
// until the main scheduler invokes its exported pass.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainMessageLaneRuntime = (ctx) => {
    const { androidWebViewPerformanceGuardActive, applyRuntimePerformancePresentation, chatStartupQuietActive, desktopAppPerformanceGuardActive, generationMetadataWanted, loadedChatMessageCount, messageQuickActionsEnabled, runFeatureStep, runStep, runtimeCounters, runtimeProfile, scheduleChatStartupQuietResume, shouldPauseHiddenTab, laneState } = ctx;
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
    if (laneState.messageLaneRunning) { laneState.messageLanePending = true; DS.diagScheduler?.("coalesced", { lane: "message", reason: "already-running" }); return; }
    const laneStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
    const laneToken = DS.isDiagnosticTraceActive?.("normal") ? DS.diagOperationStart?.("message-lane", "run", {
      source: String(DS.state?.diagMessageLaneSource || "message-mutation"),
      queueDelayMs: Math.max(0, Date.now() - Number(DS.state?.diagMessageLaneScheduledAt || Date.now())),
      parentOperationId: ""
    }) : null;
    DS.state.diagMessageLaneOperationId = laneToken?.id || "";
    laneState.messageLaneRunning = true;
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
      if (Date.now() < laneState.pauseRerunsUntil || DS.isChatHeaderMenuOpen?.()) return;

      const enhancerQuietUntil = Number(DS.state.chatEnhancerQuietUntil || 0);
      if (settings.chatPerformanceMode && enhancerQuietUntil > Date.now()) {
        await runStep("performance mode", () => DS.applyPerformanceMode?.());
        const counters = runtimeCounters();
        counters.chatEnhancerQuietDeferrals = Number(counters.chatEnhancerQuietDeferrals || 0) + 1;
        clearTimeout(laneState.messageEnhancerQuietTimer);
        const wait = Math.max(40, enhancerQuietUntil - Date.now() + 20);
        laneState.messageEnhancerQuietTimer = window.setTimeout(() => {
          laneState.messageEnhancerQuietTimer = null;
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
      if (settings.enableChatContinuationAssistant || DS.state.chatContinuationWasActive) await runStep("chat continuation", () => DS.applyChatContinuationAssistant?.());
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
          clearTimeout(laneState.slowQuietTimer);
          laneState.slowQuietTimer = window.setTimeout(() => {
            laneState.slowQuietTimer = null;
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
          clearTimeout(laneState.slowQuietTimer);
          laneState.slowQuietTimer = null;
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
      DS.state.lastMessageLaneFinishedAt = Date.now();
      DS.state.diagMessageLaneOperationId = "";
      laneState.messageLaneRunning = false;
      if (laneState.messageLanePending) {
        laneState.messageLanePending = false;
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
    // Android WebView shares its renderer with native SpicyChat. Let native
    // message mounting, touch/scroll and streaming settle before optional
    // per-message decoration. Event-driven toolbar repair still runs promptly.
    if (androidWebViewPerformanceGuardActive()) {
      delay = Math.max(delay, profile === "maximum" ? (huge ? 1800 : 1350) : (huge ? 1250 : 950));
      counters.androidMessageLaneDeferrals = Number(counters.androidMessageLaneDeferrals || 0) + 1;
    }

    if (Date.now() < Number(DS.state.userScrollingUntil || 0)) {
      delay = Math.max(delay, androidWebViewPerformanceGuardActive() ? (profile === "maximum" ? 2500 : 1700) : desktopAppPerformanceGuardActive() ? (profile === "maximum" ? 2200 : (profile === "aggressive" ? 1500 : 1100)) : (profile === "maximum" ? 1100 : (profile === "aggressive" ? 700 : 460)));
      counters.deferredWhileScrolling = Number(counters.deferredWhileScrolling || 0) + 1;
    }
    if (Date.now() < Number(DS.state.nativeActionQuietUntil || 0)) {
      delay = Math.max(delay, Number(DS.state.nativeActionQuietUntil) - Date.now() + 160);
      counters.nativeActionQuietDeferrals = Number(counters.nativeActionQuietDeferrals || 0) + 1;
    }
    if ((DS.state?.settings?.deferQolWhileTyping || window.innerWidth <= 760 || !!DS.getRuntimeEnvironment?.()?.android) && Date.now() < Number(DS.state.userTypingUntil || 0)) {
      delay = Math.max(delay, Math.max(900, Number(DS.state.userTypingUntil || 0) - Date.now() + 160));
      counters.typingDeferrals = Number(counters.typingDeferrals || 0) + 1;
    }
    laneState.messageLaneDueAt = Date.now() + delay;
    DS.state.diagMessageLaneScheduledAt = Date.now();
    DS.state.diagMessageLaneSource = String(source || "message-mutation").slice(0, 120);
    DS.diagScheduler?.("scheduled", { lane: "message", source: DS.state.diagMessageLaneSource, delayMs: delay, profile, huge, hidden: !!document.hidden });
    if (laneState.messageLaneTimer) {
      counters.messageLaneScheduleCoalesced = Number(counters.messageLaneScheduleCoalesced || 0) + 1;
      DS.diagScheduler?.("coalesced", { lane: "message", source: DS.state.diagMessageLaneSource, dueInMs: Math.max(0, laneState.messageLaneDueAt - Date.now()) });
      return;
    }

    const armMessageLaneTimer = () => {
      const wait = Math.max(0, laneState.messageLaneDueAt - Date.now());
      laneState.messageLaneTimer = setTimeout(() => {
        laneState.messageLaneTimer = null;
        if (Date.now() + 5 < laneState.messageLaneDueAt) {
          armMessageLaneTimer();
          return;
        }
        laneState.messageLaneDueAt = 0;
        runChatMessageLane();
      }, wait);
    };
    armMessageLaneTimer();
  };
    return { scheduleMessageLane: DS.scheduleMessageLane };
  };
})();
}
