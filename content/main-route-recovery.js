// Main runtime support: route recovery.
// Loaded before main.js; no observers or page work start during module loading.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainRouteRecovery = function createMainRouteRecovery({ runtimeCounters }) {
    let routePresentationRecoveryTimers = [];
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
    return Object.freeze({ scheduleNonChatPresentationRecovery });
  };

})();
}
