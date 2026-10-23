// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  // Kept available even when the main QoL feature runtime is disabled.
  DS.installMainDiagnostics = function installMainDiagnostics({ runtimeProfile, loadedChatMessageCount, desktopAppPerformanceGuardActive }) {
  try {
    chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
      if (message?.type === "DS_GET_QOL_TAB_STATE") {
        sendResponse({ ok: true, ...(DS.getQolTabState?.() || {}) });
        return false;
      }
      if (message?.type === "DS_SET_QOL_TAB_STATE") {
        const state = DS.setQolEnabledForTab?.(message.enabled !== false) || DS.getQolTabState?.() || {};
        sendResponse({ ok: true, ...state });
        return false;
      }
      if (message?.type === "DS_GET_PAGE_DIAGNOSTICS") {
        const chatLayout = (() => {
          if (!DS.isSingleChatPage?.()) return null;
          const root = document.getElementById("root");
          const composer = document.querySelector("textarea[placeholder='Message...']");
          const composerHost = composer?.closest?.("form") || composer?.parentElement?.parentElement || null;
          const title = document.querySelector("a[aria-label='chatbot-profile'], a[href*='/chatbot/']");
          const width = node => { try { return Math.round(node?.getBoundingClientRect?.().width || 0); } catch { return 0; } };
          const shortcutHolder = document.getElementById("ds-rc88-composer-inline-tools");
          const shortcutControls = shortcutHolder ? [...shortcutHolder.children].filter(node => node instanceof HTMLElement) : [];
          const rects = shortcutControls.map(node => { try { return node.getBoundingClientRect(); } catch { return null; } }).filter(Boolean);
          let shortcutOverlap = false;
          for (let i = 0; i < rects.length && !shortcutOverlap; i += 1) {
            for (let j = i + 1; j < rects.length; j += 1) {
              const a = rects[i], b = rects[j];
              if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) { shortcutOverlap = true; break; }
            }
          }
          return {
            viewport: Math.round(window.innerWidth || document.documentElement.clientWidth || 0),
            root: width(root),
            composer: width(composerHost),
            titleHost: width(title?.parentElement),
            title: width(title),
            shortcutPlacement: shortcutHolder?.dataset?.dsPlacement || "none",
            shortcutWidth: width(shortcutHolder),
            shortcutControls: shortcutControls.length,
            shortcutOverlap,
            textareaPaddingRight: composer ? getComputedStyle(composer).paddingRight : ""
          };
        })();
        // Run only when the user requests diagnostics, not in the hot observer.
        // Inspect styling and layout of three recent message roots; never read
        // message text or expose chat IDs. Hidden DOM is different from unmount.
        const chatVisibility = (() => {
          if (!DS.isSingleChatPage?.()) return null;
          const roots = [...document.querySelectorAll("div[id^='message-']")];
          const sample = roots.slice(-3);
          const counts = { hidden: 0, cssHidden: 0, zeroLayout: 0, transparent: 0, qolFolded: 0 };
          for (const root of sample) {
            // A folded old message is deliberately hidden by QoL, not a lost
            // native message. Keep it separate from genuinely suspicious UI.
            const folded = !!root.closest?.(".ds-chat-message-windowed") || root.classList?.contains("ds-chat-message-windowed");
            if (folded) counts.qolFolded++;
            let cause = "";
            try {
              for (let node = root, depth = 0; node && depth < 12; node = node.parentElement, depth++) {
                const style = getComputedStyle(node);
                if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden") {
                  cause = "css";
                  break;
                }
                if (Number(style.opacity) === 0) {
                  cause = "transparent";
                  break;
                }
              }
              if (!cause) {
                const rect = root.getBoundingClientRect();
                if (root.getClientRects().length === 0 || rect.width <= 0 || rect.height <= 0) cause = "zero-layout";
              }
            } catch { /* A diagnostic must not affect the live page. */ }
            if (cause) {
              counts.hidden++;
              if (cause === "css") counts.cssHidden++;
              else if (cause === "transparent") counts.transparent++;
              else counts.zeroLayout++;
            }
          }
          return {
            mounted: roots.length,
            inspected: sample.length,
            ...counts,
            sourceTabVisible: document.visibilityState === "visible",
            performanceMode: document.documentElement.classList.contains("ds-chat-performance"),
            composerPresent: !!document.querySelector("textarea, [contenteditable='true']")
          };
        })();
        sendResponse({
          ok: true,
          tabQol: DS.getQolTabState?.() || null,
          performance: DS.getPerformanceReport?.() || [],
          slowFeatureSamples: DS.getSlowFeatureSamples?.().slice(-80) || [],
          runtimePerformance: { ...(DS.state.runtimePerformance || {}), mode: runtimeProfile(), loadedChatMessages: loadedChatMessageCount(), desktopAppGuardActive: desktopAppPerformanceGuardActive(), historyBatchActive: Date.now() < Number(DS.state.chatHistoryBatchUntil || 0) || !!DS.state.bulkChatHistoryLoadActive },
          runtimeContext: {
            chatVisibility,
            visibilityState: String(document.visibilityState || "unknown"),
            focused: typeof document.hasFocus === "function" ? !!document.hasFocus() : null,
            mountedMessages: loadedChatMessageCount(),
            domNodes: document.getElementsByTagName("*").length,
            heapBytes: Number(performance?.memory?.usedJSHeapSize || 0),
            effectiveRuntimeMode: runtimeProfile(),
            recentLongTaskMs10s: Number(DS.state?.runtimePerformance?.autoPressureLongTask10s || 0),
            recentLongTaskMs30s: Number(DS.state?.runtimePerformance?.autoPressureLongTask30s || 0)
          },
          listingRefill: DS.getListingAutoFillStatus?.() || null,
          chatLayout,
          androidEnvironment: DS.getAndroidEnvironment?.() || null,
          buildProfile: DS.getBuildProfile?.() || null,
          diagnosticProtocol: DS.getDiagnosticProtocolState?.() || null,
          runtimeLog: DS.getRuntimeLog?.(80) || [],
          activeModules: {
            rpFormatRepair: !!DS.state.rpFormatRepairWasActive,
            chatBubbles: !!DS.state.chatBubbleCustomizationWasActive,
            translation: !!DS.state.translationWasActive,
            androidControls: !!DS.state.androidAppControlsWasActive
          }
        });
        return false;
      }
      if (message?.type === "DS_RESET_PAGE_PERFORMANCE") {
        DS.state.performanceStats = {};
        DS.state.performanceWindows = [];
        const keepModeCounters = { mode: runtimeProfile(), loadedChatMessages: loadedChatMessageCount(), sampleStartedAt: Date.now() };
        DS.state.runtimePerformance = {
          mutations: 0, qolOnlyMutations: 0, chatLocalMutations: 0, composerOnlyMutationSkips: 0, schedules: 0, criticalSchedules: 0, slowSchedules: 0,
          deferredWhileScrolling: 0, hiddenSkips: 0, messageLaneSchedules: 0, messageLaneRuns: 0, messageLaneDirtyRoots: 0,
          messageLaneChunkedPasses: 0, messageLaneChunkedRoots: 0, messageLaneDeferredRoots: 0,
          messageEnhancerIncrementalLanePasses: 0, messageEnhancerIncrementalLaneRoots: 0, criticalMessageEnhancerPassesDeferred: 0,
          typingDeferrals: 0, desktopAppGuardDelays: 0, messageCacheHits: 0, messageCacheMisses: 0,
          messageCacheInvalidations: 0, messageCacheInvalidationRequests: 0, messageCacheInvalidationDeduped: 0,
          messageCacheMutationCandidateNodes: 0, messageCacheMutationRoots: 0, messageCacheMutationNodesCollapsed: 0,
          observerBatches: 0, observerQolOnlyBatches: 0, observerMixedQolBatches: 0, blockedBotMutationSkips: 0, listingSortNoopSkips: 0, listingSortAlreadyOrdered: 0,
          routeFeatureStepSkips: 0, routeFeatureGroupSkips: 0, buildBundleStepSkips: 0, runtimeKernelRuns: 0, runtimePlanCacheHits: 0,
          quickPanelStateSkips: 0, quickPanelUpdateCoalesced: 0, quickPanelLayoutSkips: 0, quickPanelRenderQuietDeferrals: 0,
          storageWriteRequests: 0, storageWriteBatches: 0, storageWriteKeys: 0, storageWriteMergedKeys: 0, storageWriteImmediateFlushes: 0,
          ...keepModeCounters
        };
        DS.runtimeLog?.("info", "diagnostics", "Performance counters reset");
        sendResponse({ ok: true });
        return false;
      }
      if (message?.type === "DS_RECOVER_CURRENT_PAGE") {
        DS.runtimeLog?.("warn", "recovery", "Manual page recovery requested");
        sendResponse({ ok: true });
        setTimeout(() => { try { location.reload(); } catch {} }, 80);
        return false;
      }
      if (message?.type === "DS_CLEAR_RUNTIME_LOG") {
        DS.clearRuntimeLog?.();
        DS.runtimeLog?.("info", "diagnostics", "Runtime log cleared");
        sendResponse({ ok: true });
        return false;
      }
      return false;
    });
  } catch {}

  };
})();

}
