// Main runtime support: refresh trackers.
// Factories register functions but do not start observers until the main runtime is active.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainRefreshTrackers = function createMainRefreshTrackers({
    runtimeCounters, checkRouteChange, scheduleNonChatPresentationRecovery,
    scheduleSavedOpenedLane, primeLargeChatMessageLane,
    scheduleLazyHistoryEnhancement, discardedWakeSessionActive,
    noteDiscardedWakeVisible, scheduleChatStartupQuietResume,
    longTaskOverlapNames
  }) {
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

      // Firefox/Android long-press selection shares the main thread with React
      // and the native selection toolbar. Never cancel pointer/touch/selection
      // events; simply keep optional QoL presentation work out of the way.
      // Short bounded windows and no timers/DOM observers are added here.
      let mobileMessageTouchActive = false;
      let mobileSelectionLastAt = 0;
      const isMobileSelectionContext = () => {
        const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
        return !!env.android || /Android/i.test(navigator.userAgent || "");
      };
      const messageForSelectionNode = node => {
        const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        return el?.closest?.("div[id^='message-']") || null;
      };
      const quietMobileSelection = (duration, kind) => {
        const now = Date.now();
        DS.state.nativeActionQuietUntil = Math.max(Number(DS.state.nativeActionQuietUntil || 0), now + duration);
        const perf = runtimeCounters();
        if (kind === "start") perf.mobileTextSelectionStarts = Number(perf.mobileTextSelectionStarts || 0) + 1;
        if (kind === "change") perf.mobileTextSelectionChanges = Number(perf.mobileTextSelectionChanges || 0) + 1;
        perf.mobileTextSelectionLastAt = now;
      };
      document.addEventListener("pointerdown", event => {
        if (event.pointerType !== "touch" || !DS.state?.settings?.enabled ||
            !DS.isSingleChatPage?.() || !isMobileSelectionContext()) return;
        mobileMessageTouchActive = !!messageForSelectionNode(event.target);
        if (mobileMessageTouchActive) quietMobileSelection(650, "start");
      }, { capture: true, passive: true });
      document.addEventListener("pointerup", () => {
        if (!mobileMessageTouchActive) return;
        mobileMessageTouchActive = false;
        quietMobileSelection(750, "end");
      }, { capture: true, passive: true });
      document.addEventListener("pointercancel", () => { mobileMessageTouchActive = false; }, { capture: true, passive: true });
      document.addEventListener("selectionchange", () => {
        if (!DS.state?.settings?.enabled || !DS.isSingleChatPage?.() ||
            !isMobileSelectionContext()) return;
        const now = Date.now();
        if (now - mobileSelectionLastAt < 240) return;
        const selection = window.getSelection?.();
        if (!selection || selection.isCollapsed || !messageForSelectionNode(selection.anchorNode)) return;
        mobileSelectionLastAt = now;
        quietMobileSelection(1100, "change");
      }, { passive: true });

      // Protect native Regenerate/Send interactions from nonessential QoL work.
      // Never preventDefault(), synthesize a click, or inspect message text.
      document.addEventListener("pointerdown", event => {
        if (!DS.isSingleChatPage?.() || !DS.state?.settings?.enabled) return;
        const button = event.target?.closest?.("button");
        if (!button || button.matches?.("[id^='ds-'],[class*='ds-qol']") || button.closest?.("#ds-qol-panel,[data-ds-qol-owned]")) return;
        const label = String(button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent || "").trim().slice(0, 90);
        const mobile = window.innerWidth <= 760 || !!(DS.getRuntimeEnvironment?.()?.android);
        const generationAction = /\b(?:regenerat(?:e|ion)?|reroll|retry|send(?: message)?)\b/i.test(label);
        const mobileEditOrRating = mobile && /\b(?:edit|save|cancel|rating|rate|dislike|like|thumbs?\s*(?:up|down))\b/i.test(label);
        if (!generationAction && !mobileEditOrRating) return;
        DS.state.nativeActionQuietUntil = Math.max(Number(DS.state.nativeActionQuietUntil || 0), Date.now() + (mobile ? 1450 : 1100));
        const counters = runtimeCounters();
        counters.nativeActionGuardStarts = Number(counters.nativeActionGuardStarts || 0) + 1;
        if (mobileEditOrRating) counters.mobileNativeActionQuietStarts = Number(counters.mobileNativeActionQuietStarts || 0) + 1;
      }, { capture: true, passive: true });

      // Event Timing is optional. Never install this browser-level observer when
      // detailed diagnostics are off; enabling diagnostics later activates it.
      DS.syncNativeInputTimingObserver = () => {
        const wantsInputTiming = !!DS.state?.settings?.performanceDiagnostics;
        if (!wantsInputTiming) {
          DS.state.nativeInputObserver?.disconnect?.();
          DS.state.nativeInputObserver = null;
          return;
        }
        if (DS.state.nativeInputObserver) return;
        try {
          if (typeof PerformanceObserver !== "function" ||
              !PerformanceObserver.supportedEntryTypes?.includes?.("event")) return;
          const inputObserver = new PerformanceObserver(list => {
            if (!DS.state?.settings?.performanceDiagnostics || document.hidden || !DS.isSingleChatPage?.()) return;
            const counters = runtimeCounters();
            for (const entry of list.getEntries()) {
              if (entry.name !== "click") continue;
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
        } catch {}
      };
      DS.syncNativeInputTimingObserver();

      // Runtime Improvements owns the shared long-task observer when installed.
      // A Custom Lite package without that module keeps the local fallback.
      const consumeLongTasks = entries => {
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
          // Overlap is correlation only: third-party and native rendering may run
          // in the same browser task. Avoid attributing the full task to QoL.
          if (overlaps.length) {
            counters.longTasksWithQolOverlap = Number(counters.longTasksWithQolOverlap || 0) + 1;
            counters.maxLongTaskWithQolOverlapMs = Math.max(Number(counters.maxLongTaskWithQolOverlapMs || 0), rounded);
          } else {
            counters.longTasksWithoutQolOverlap = Number(counters.longTasksWithoutQolOverlap || 0) + 1;
            counters.maxLongTaskWithoutQolOverlapMs = Math.max(Number(counters.maxLongTaskWithoutQolOverlapMs || 0), rounded);
          }
        }
      };
      if (typeof DS.subscribeRuntimeLongTasks === "function") {
        DS.state.longTaskSubscription = DS.subscribeRuntimeLongTasks(consumeLongTasks);
        runtimeCounters().sharedLongTaskObserverReuses = Number(runtimeCounters().sharedLongTaskObserverReuses || 0) + 1;
      } else {
        try {
          if (typeof PerformanceObserver === "function" && PerformanceObserver.supportedEntryTypes?.includes?.("longtask")) {
            const observer = new PerformanceObserver(list => {
              const entries = list.getEntries();
              if (entries.length && DS.isSingleChatPage?.()) {
                DS.state.chatStartupLastLongTaskAt = Date.now();
              }
              consumeLongTasks(entries);
            });
            observer.observe({ type: "longtask" });
            DS.state.longTaskObserver = observer;
          }
        } catch {}
      }
    }


    return installRefreshTrackers;
  };

})();
}
