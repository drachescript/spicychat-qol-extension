// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  // Read-only and bounded. The page observer calls this only around an
  // actual chat action/remount, and Settings calls it on demand. Never inspect
  // chat text or expose a conversation/message identifier.
  const VISIBILITY_SUMMARY_KEY = "dsQolChatStyleVisibilityV1";
  function previousVisibilityEvent() {
    try {
      const value = JSON.parse(sessionStorage.getItem(VISIBILITY_SUMMARY_KEY) || "null");
      const at = Number(value?.lastAt || 0);
      return value && Number.isFinite(at) && at > 0 && at <= Date.now() + 60000 && Date.now() - at < 86400000 ? value : null;
    } catch { return null; }
  }
  DS.getPreviousChatVisibilityEvent = previousVisibilityEvent;
  const safeClassHints = node => {
    try {
      return [...(node.classList || [])].filter(name => /^(?:ds-|hidden$|invisible$|opacity-0$|sr-only$|collapse$|content-visibility-|transition-)/i.test(name))
        .slice(0, 6).map(name => String(name)
          .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, "id")
          .replace(/[0-9a-f]{20,}/ig, "id").slice(0, 54));
    } catch { return []; }
  };
  function safeRuleSelector(selector) {
    return String(selector || "")
      .replace(/\[[^\]]*\]/g, "[attribute]")
      .replace(/#[\w-]+/g, "#id")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, "id")
      .replace(/[0-9a-f]{20,}/ig, "id").slice(0, 125);
  }
  function matchedHideRule(node, property, expected) {
    // Only invoked for a confirmed/suspected anomaly or an explicit support
    // snapshot. Stop after a fixed amount of CSSOM work, including nested rules.
    let remaining = 1200;
    let found = null;
    const testRules = (rules, sheetSource, depth = 0) => {
      if (!rules || depth > 2 || remaining <= 0) return;
      for (const rule of rules) {
        if (--remaining < 0) break;
        if (rule?.selectorText && rule.style) {
          const declared = String(rule.style.getPropertyValue?.(property) || "").trim().toLowerCase();
          if (!declared || (expected === "0" ? Number(declared) !== 0 : declared !== expected)) continue;
          try {
            if (node.matches(rule.selectorText)) found = { selector: safeRuleSelector(rule.selectorText), source: sheetSource };
          } catch {}
        } else if (rule?.cssRules) testRules(rule.cssRules, sheetSource, depth + 1);
      }
    };
    try {
      for (const sheet of document.styleSheets || []) {
        if (remaining <= 0) break;
        const ownerId = String(sheet.ownerNode?.id || "");
        const url = String(sheet.href || "");
        let qolOrigin = "";
        try { qolOrigin = typeof chrome !== "undefined" ? String(chrome.runtime?.getURL?.("") || "") : ""; } catch {}
        const source = ownerId.startsWith("ds-") || ownerId.startsWith("dsq-") ||
          (qolOrigin && url.startsWith(qolOrigin)) ? "QoL stylesheet"
          : ownerId.startsWith("sai-") ? "S.AI Toolkit stylesheet"
          : /^chrome-extension:|^moz-extension:/i.test(url) ? "other extension stylesheet"
          : "page or injected stylesheet";
        try { testRules(sheet.cssRules, source); } catch { /* Cross-origin CSS cannot be inspected. */ }
      }
    } catch {}
    return found || { selector: "unidentified", source: "unknown (or stylesheet not accessible)" };
  }
  function hiddenMessageDetail(root, inspectRule) {
    // Only the message wrapper and at most nine ancestors. Ignore offscreen
    // placement; scrolling away from a message does not make it hidden.
    for (let node = root, depth = 0; node && depth < 10; node = node.parentElement, depth++) {
      try {
        const style = getComputedStyle(node);
        let property = "", expected = "";
        if (style.display === "none") { property = "display"; expected = "none"; }
        else if (style.visibility === "hidden" || style.visibility === "collapse") { property = "visibility"; expected = style.visibility; }
        else if (style.contentVisibility === "hidden") { property = "content-visibility"; expected = "hidden"; }
        else if (Number(style.opacity) === 0) { property = "opacity"; expected = "0"; }
        if (!property) continue;
        const inline = String(node.style?.getPropertyValue?.(property) || "").trim();
        // .ds-hidden is defined by QoL's content stylesheet. Browser pages
        // cannot always enumerate extension stylesheets via CSSOM, so a
        // generic rule lookup often incorrectly reports this as unknown.
        const qolHiddenClass = !inline && property === "display" && node.classList?.contains("ds-hidden");
        const reasonValue = String(node.getAttribute?.("data-ds-reason") || "");
        const safeReason = qolHiddenClass && /^[a-z0-9:_-]{1,80}$/i.test(reasonValue) ? reasonValue : "";
        const rule = inline ? { selector: "inline style", source: "inline style" }
          : qolHiddenClass ? { selector: ".ds-hidden", source: "QoL hide class" }
          : inspectRule ? matchedHideRule(node, property, expected) : null;
        return {
          cause: property === "opacity" ? "transparent" : "css",
          property: `${property}: ${expected}`,
          ancestorDepth: depth,
          tag: String(node.tagName || "element").toLowerCase().slice(0, 18),
          classes: safeClassHints(node),
          sourceHint: rule?.source || (inline ? "inline style" : "not yet checked"),
          selectorHint: rule?.selector || "not yet checked",
          qolHideReason: safeReason || (qolHiddenClass ? "unrecorded" : ""),
          qolStyledElement: qolHiddenClass || !!safeClassHints(node).some(x => x.startsWith("ds-"))
        };
      } catch { /* This is diagnostic-only. */ }
    }
    try {
      const rect = root.getBoundingClientRect();
      if (!root.getClientRects().length || rect.height <= 0 || rect.width <= 0) {
        return { cause: "zero-layout", property: "no rendered size", ancestorDepth: 0,
          tag: "div", classes: safeClassHints(root), sourceHint: "unknown", selectorHint: "unidentified" };
      }
    } catch {}
    return null;
  }
  function featureFlagsAtCapture() {
    const s = DS.state?.settings || {};
    const enabledNames = [
      ["chatPerformanceMode", "chat performance folding"],
      ["enableChatBackgrounds", "chat backgrounds"],
      ["enableChatBubbleCustomization", "chat bubble styling"],
      ["styleAlternateDialogue", "alternate dialogue"],
      ["showMessageQuickActions", "message quick actions"],
      ["messageBookmarkButtons", "message bookmarks"],
      ["rpFormatRepairAuto", "format repair"],
      ["translationAutoAi", "AI translation"]
    ];
    return enabledNames.filter(([key]) => s[key] === true).map(([, label]) => label);
  }
  DS.readChatVisibilitySnapshot = function readChatVisibilitySnapshot({ inspectRule = false } = {}) {
    if (!DS.isSingleChatPage?.()) return null;
    const roots = [...document.querySelectorAll("div[id^='message-']")];
    const sample = roots.slice(-3);
    const counts = { hidden: 0, cssHidden: 0, zeroLayout: 0, transparent: 0, qolFolded: 0 };
    let firstHidden = null;
    for (const root of sample) {
      const folded = !!root.closest?.(".ds-chat-message-windowed, .ds-chat-message-far") ||
        !!root.classList?.contains("ds-chat-message-windowed") || !!root.classList?.contains("ds-chat-message-far");
      if (folded) { counts.qolFolded++; continue; }
      const detail = hiddenMessageDetail(root, inspectRule && !firstHidden);
      if (!detail) continue;
      counts.hidden++;
      if (detail.cause === "css") counts.cssHidden++;
      else if (detail.cause === "transparent") counts.transparent++;
      else counts.zeroLayout++;
      if (!firstHidden) firstHidden = detail;
    }
    return {
      mounted: roots.length,
      inspected: sample.length,
      ...counts,
      sourceTabVisible: document.visibilityState === "visible",
      performanceMode: document.documentElement.classList.contains("ds-chat-performance"),
      composerPresent: !!document.querySelector("textarea, [contenteditable='true']"),
      hiddenSource: firstHidden,
      recentForegroundEvent: previousVisibilityEvent(),
      activeQolDisplayFeatures: firstHidden ? featureFlagsAtCapture() : []
    };
  };
  DS.recordChatVisibilityEvent = function recordChatVisibilityEvent(snapshot, { generation, trigger, elapsedMs } = {}) {
    if (!snapshot?.sourceTabVisible || !snapshot.hiddenSource) return;
    const prior = previousVisibilityEvent();
    const event = {
      count: Math.min(1000, Number(prior?.count || 0) + 1),
      lastAt: Date.now(),
      generation: ["active", "inactive", "unknown"].includes(generation) ? generation : "unknown",
      trigger: ["send", "generation-action", "message-remount", "tab-return"].includes(trigger) ? trigger : "unknown",
      elapsedMs: Math.min(10000, Math.max(0, Math.round(Number(elapsedMs) || 0))),
      mounted: Math.min(10000, Number(snapshot.mounted || 0)),
      hidden: Math.min(3, Number(snapshot.hidden || 0)),
      inspected: Math.min(3, Number(snapshot.inspected || 0)),
      hiddenSource: snapshot.hiddenSource,
      activeQolDisplayFeatures: snapshot.activeQolDisplayFeatures
    };
    try { sessionStorage.setItem(VISIBILITY_SUMMARY_KEY, JSON.stringify(event)); } catch {}
    const counters = DS.state?.runtimePerformance || {};
    counters.chatForegroundHiddenEvents = event.count;
    counters.chatForegroundHiddenLastAt = event.lastAt;
    DS.diagPerformance?.("foreground-message-visibility", {
      mounted: event.mounted, hidden: event.hidden, generation: event.generation,
      elapsedMs: event.elapsedMs, styleSource: event.hiddenSource?.sourceHint || "unknown"
    });
  };
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
      if (message?.type === "DS_GET_PAGE_DIAGNOSTICS_LIGHT") {
        // Read-only readiness probe for WebViews. Unlike a full snapshot this
        // never walks the DOM, reads private chat content or forces layout.
        const perf = DS.state?.runtimePerformance || {};
        sendResponse({ ok: true, runtimeReady: !!DS.state?.settings,
          paused: !!DS.isQolPausedForTab?.(),
          sampleAt: Date.now(),
          sampleKind: "lightweight-no-dom",
          messageCacheInvalidations: Number(perf.messageCacheInvalidations || 0),
          messageCacheInvalidationRequests: Number(perf.messageCacheInvalidationRequests || 0) });
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
        // On-demand, read-only foreground/layout snapshot. Passive checks also
        // keep the latest sustained anomaly across reloads in sessionStorage.
        const chatVisibility = DS.readChatVisibilitySnapshot?.({ inspectRule: true }) || null;
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
