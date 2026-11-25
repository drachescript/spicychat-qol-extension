if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || DS.__rc87FixesLoaded) return;
  DS.__rc87FixesLoaded = true;

  const MY_CREATIONS_PATH = "/my-creations/chatbots";
  const LOAD_MORE_SELECTOR = 'button[data-testid="ChatbotMy-LoadMoreButton"]';
  const BOT_LINK_RE = /\/(?:chat|chatbot)\/([0-9a-f-]{20,})(?:[/?#]|$)/i;
  const state = {
    autoLoadRunning: false,
    autoLoadCompletedSignature: "",
    autoLoadRetryTimer: null,
    autoLoadObserver: null,
    panelAdjustTimer: null,
    lastRoute: "",
    manualPauseUntil: 0,
    generation: 0,
    nextAttemptAt: 0,
    cancelGrowth: null,
    observerTimer: null,
    signatureCache: null
  };

  function settings() {
    return DS.state?.settings || DS.DEFAULT_SETTINGS || {};
  }

  function currentPath() {
    return String(location.pathname || "").replace(/\/+$/, "") || "/";
  }

  function isMyCreations() {
    return currentPath().replace(/^\/[a-z]{2,3}(?:-[a-z0-9]{2,8})*(?=\/my-creations\/chatbots$)/i, "") === MY_CREATIONS_PATH;
  }

  function isVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function loadMoreButton({ allowBusy = false } = {}) {
    if (!isMyCreations()) return null;
    const button = document.querySelector(LOAD_MORE_SELECTOR);
    if (!(button instanceof HTMLButtonElement) || !isVisible(button)) return null;
    if (!allowBusy && (button.disabled || button.getAttribute("aria-disabled") === "true")) return null;
    return button;
  }

  function currentBotIds(fresh = false) {
    const ids = new Set();
    const cards = fresh ? null : DS.collectCards?.();
    if (Array.isArray(cards)) {
      for (const item of cards) {
        const href = item?.anchor?.getAttribute?.("href") || item?.anchor?.href || "";
        const match = String(href).match(BOT_LINK_RE);
        if (match?.[1]) ids.add(match[1].toLowerCase());
      }
      return ids;
    }
    document.querySelectorAll("a[href*='/chat/'],a[href*='/chatbot/']").forEach(anchor => {
      const match = String(anchor.getAttribute("href") || anchor.href || "").match(BOT_LINK_RE);
      if (match?.[1]) ids.add(match[1].toLowerCase());
    });
    return ids;
  }

  function pageCountSetting() {
    return Math.max(1, Math.min(30, Number(settings().myCreationsAutoLoadPages) || 1));
  }

  function listingSignature(fresh = false) {
    const revision = Number(DS.state?.domRevision || 0);
    const key = `${routeKey()}|${revision}|${pageCountSetting()}`;
    if (!fresh && state.signatureCache?.key === key && Date.now() - state.signatureCache.at < 1500) return state.signatureCache.value;
    const ids = Array.from(currentBotIds(true));
    const value = `${ids.length}|${ids.slice(0, 3).join(",")}|${ids.slice(-3).join(",")}|${pageCountSetting()}`;
    state.signatureCache = { key, value, at: Date.now() };
    return value;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function routeKey() { return `${location.pathname || ""}${location.search || ""}`; }
  function ownsRun(token, route) {
    return token === state.generation && route === routeKey() && isMyCreations() && settings().enabled && settings().autoLoadMyCreations && Date.now() >= state.manualPauseUntil;
  }
  function cancelRun() {
    state.generation++;
    state.cancelGrowth?.();
    clearTimeout(state.autoLoadRetryTimer);
    state.autoLoadRetryTimer = null;
    stopAutoLoadObserver();
  }
  DS.cancelMyCreationsAutoLoad = () => {
    if (routeKey() === state.lastRoute) return;
    cancelRun();
    state.lastRoute = routeKey();
    state.autoLoadCompletedSignature = "";
    state.nextAttemptAt = 0;
    state.signatureCache = null;
    state.manualPauseUntil = 0;
  };
  async function waitForButton(token, route, timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!ownsRun(token, route)) return null;
      const button = loadMoreButton();
      if (button) return button;
      // If SpicyChat is currently fetching, wait for its native control to
      // become enabled/reappear instead of treating the list as finished.
      await sleep(180);
    }
    return null;
  }

  function waitForGrowth(beforeIds, token, route, timeoutMs = 10000) {
    return new Promise(resolve => {
      let done = false;
      let timer = null;
      const root = document.body || document.documentElement;

      const finish = grew => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        observer.disconnect();
        if (state.cancelGrowth === cancel) state.cancelGrowth = null;
        const valid = ownsRun(token, route);
        resolve({ grew: valid && !!grew, ids: valid ? currentBotIds(true) : new Set(), cancelled: !valid });
      };

      const cancel = () => finish(false);
      const anchorAddsNewBot = node => {
        if (!(node instanceof Element)) return false;
        const anchors = [];
        if (node.matches?.("a[href*='/chat/'],a[href*='/chatbot/']")) anchors.push(node);
        node.querySelectorAll?.("a[href*='/chat/'],a[href*='/chatbot/']").forEach(anchor => anchors.push(anchor));
        for (const anchor of anchors) {
          const href = String(anchor.getAttribute?.("href") || anchor.href || "");
          const match = href.match(BOT_LINK_RE);
          const id = match?.[1]?.toLowerCase();
          if (id && !beforeIds.has(id)) return true;
        }
        return false;
      };

      const observer = new MutationObserver(mutations => {
        if (!ownsRun(token, route)) return finish(false);
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes || []) {
            if (anchorAddsNewBot(node)) return finish(true);
          }
        }
      });

      if (!root || !ownsRun(token, route)) return finish(false);
      state.cancelGrowth = cancel;
      observer.observe(root, { childList: true, subtree: true });
      timer = setTimeout(() => finish(false), Math.max(500, timeoutMs));

      // Cover the tiny gap between the native click and observer installation
      // with one immediate check, rather than rescanning the whole page every
      // 160 ms for up to ten seconds.
      const now = currentBotIds(true);
      if (now.size > beforeIds.size || [...now].some(id => !beforeIds.has(id))) finish(true);
    });
  }

  function clickNativeLoadMore(button) {
    if (!(button instanceof HTMLButtonElement) || !button.isConnected) return false;
    try {
      // The native HTMLElement click is intentionally the primary path here.
      // It is the exact control the user can click manually and is less
      // sensitive to synthetic pointer helpers changing over time.
      button.click();
      return true;
    } catch {
      try {
        DS.realClick?.(button, { scroll: false });
        return true;
      } catch {
        return false;
      }
    }
  }

  function stopAutoLoadObserver() {
    state.autoLoadObserver?.disconnect();
    state.autoLoadObserver = null;
    clearTimeout(state.observerTimer);
    state.observerTimer = null;
  }

  function scheduleAutoLoadRetry(delay = 500) {
    clearTimeout(state.autoLoadRetryTimer);
    state.autoLoadRetryTimer = null;
    if (!isMyCreations() || !settings().enabled || !settings().autoLoadMyCreations) {
      stopAutoLoadObserver();
      return;
    }
    const route = routeKey();
    const token = state.generation;
    state.autoLoadRetryTimer = setTimeout(() => {
      state.autoLoadRetryTimer = null;
      if (token === state.generation && route === routeKey()) Promise.resolve(DS.applyMyCreationsAutoLoad?.()).catch(() => {});
    }, Math.max(100, delay));
  }

  function watchForNativeLoadMore() {
    stopAutoLoadObserver();
    if (!isMyCreations() || !settings().enabled || !settings().autoLoadMyCreations || state.autoLoadRunning) return;
    if (loadMoreButton()) { state.nextAttemptAt = 0; return scheduleAutoLoadRetry(80); }
    if (!document.body) return scheduleAutoLoadRetry(400);

    // Route-scoped and temporary: disconnect as soon as the native Load More
    // appears. This covers React mounting it after the normal slow QoL pass.
    state.autoLoadObserver = new MutationObserver(() => {
      if (!isMyCreations()) return stopAutoLoadObserver();
      if (!loadMoreButton({ allowBusy: true })) return;
      stopAutoLoadObserver();
      state.nextAttemptAt = 0;
      scheduleAutoLoadRetry(120);
    });
    state.autoLoadObserver.observe(document.body, { childList: true, subtree: true });
    state.observerTimer = setTimeout(stopAutoLoadObserver, 10000);
  }

  DS.applyMyCreationsAutoLoad = async function rc87MyCreationsAutoLoad() {
    DS.cancelMyCreationsAutoLoad();
    if (!isMyCreations()) return;

    const cfg = settings();
    if (!cfg.enabled || !cfg.autoLoadMyCreations || state.autoLoadRunning) return;
    if (state.autoLoadObserver || state.autoLoadRetryTimer) return;
    if (Date.now() < Number(state.manualPauseUntil || 0)) {
      scheduleAutoLoadRetry(Math.max(200, state.manualPauseUntil - Date.now() + 150));
      return;
    }

    if (Date.now() < state.nextAttemptAt) return;
    const requestedPages = pageCountSetting();
    const startSignature = listingSignature();
    if (state.autoLoadCompletedSignature && state.autoLoadCompletedSignature === startSignature) return;

    const token = state.generation;
    const route = routeKey();
    const started = performance.now();
    let nativeWaitMs = 0, settleWaitMs = 0;
    const diag = DS.diagOperationStart?.("my-creations-auto-load", "native-pagination", { phase: "detached-from-slow-pass", requestedPages });
    state.autoLoadRunning = true;
    DS.state.myCreationsAutoLoadRunning = true;
    stopAutoLoadObserver();
    let loaded = 0;
    let attempted = false;

    try {
      for (let page = 0; page < requestedPages; page += 1) {
        if (!ownsRun(token, route)) break;
        let waitStarted = performance.now();
        const button = await waitForButton(token, route, page === 0 ? 5000 : 8000);
        nativeWaitMs += performance.now() - waitStarted;
        if (!button || !ownsRun(token, route)) break;

        const beforeIds = currentBotIds(true);
        attempted = true;
        DS.runtimeLog?.("info", "my-creations-auto-load", "Clicking native My Creations Load More", {
          batch: page + 1,
          requested: requestedPages,
          beforeTotal: beforeIds.size
        });

        if (!clickNativeLoadMore(button)) break;
        waitStarted = performance.now();
        const result = await waitForGrowth(beforeIds, token, route, 10000);
        nativeWaitMs += performance.now() - waitStarted;
        if (result.cancelled || !ownsRun(token, route)) break;
        if (!result.grew) {
          DS.runtimeLog?.("warn", "my-creations-auto-load", "Native Load More produced no new cards", {
            batch: page + 1,
            requested: requestedPages,
            beforeTotal: beforeIds.size,
            afterTotal: result.ids.size
          });
          break;
        }

        loaded += 1;
        DS.state.myCreationsAutoLoadLoadedPages = loaded;
        waitStarted = performance.now();
        await sleep(220);
        settleWaitMs += performance.now() - waitStarted;
      }

      if (!ownsRun(token, route)) return;
      DS.state.myCreationsAutoLoadLastPages = requestedPages;
      // A click which yielded no new cards also suppresses repeated retries
      // on the unchanged listing. Native/manual changes or a new route can
      // start a new run; a missing button uses the bounded observer below.
      if (loaded > 0 || attempted) {
        state.autoLoadCompletedSignature = listingSignature(true);
        DS.state.myCreationsAutoLoadLastFingerprint = state.autoLoadCompletedSignature;
        if (loaded) DS.bumpDomRevision?.();
        DS.runtimeLog?.("info", "my-creations-auto-load", "My Creations auto-load complete", {
          loaded,
          requested: requestedPages,
          total: currentBotIds().size
        });
      } else if (!attempted) {
        // Avoid repeating a five-second wait on every unrelated mutation.
        state.nextAttemptAt = Date.now() + 10000;
      }
    } finally {
      state.autoLoadRunning = false;
      DS.state.myCreationsAutoLoadRunning = false;
      const wallMs = performance.now() - started;
      DS.diagOperationEnd?.(diag, { outcome: ownsRun(token, route) ? (loaded ? "loaded" : "no-growth") : "cancelled", meta: { requestedPages, loaded, wallMs, nativeWaitMs, settleWaitMs, otherWallMs: Math.max(0, wallMs - nativeWaitMs - settleWaitMs), timingKind: "wall; native wait includes network/render; not CPU" } });
      if (ownsRun(token, route) && !attempted) watchForNativeLoadMore();
      else if (token !== state.generation && isMyCreations() && settings().enabled && settings().autoLoadMyCreations && !state.autoLoadRetryTimer && !state.autoLoadObserver) scheduleAutoLoadRetry(Math.max(100, state.manualPauseUntil - Date.now() + 150));
      // If a successful first batch was requested but React still has another
      // busy/reappearing button, the loop already waited for it. No persistent
      // observer remains after completion.
    }
  };

  // Panel placement is handled by rc87-panel-position.js immediately after
  // quick-panel.js, before the listing modules paint. Keep these names as
  // compatibility no-ops for any older callers without reintroducing the
  // measure-then-jump behavior that caused the visible twitch.
  function adjustMiniPanelPosition() {}
  function schedulePanelAdjustment() {
    DS.rc86RefreshBulkBlockUi?.();
  }

  function routeRefresh() {
    const changed = routeKey() !== state.lastRoute;
    DS.cancelMyCreationsAutoLoad();
    if (changed && isMyCreations()) scheduleAutoLoadRetry(350);
    schedulePanelAdjustment(120);
    DS.rc86RefreshBulkBlockUi?.();
  }

  window.addEventListener("popstate", () => setTimeout(routeRefresh, 50), true);
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const manualLoadMore = event.target.closest(LOAD_MORE_SELECTOR);
    if (manualLoadMore && event.isTrusted && isMyCreations()) {
      // Never compete with a user's native Load More click. Let SpicyChat own
      // the click/request completely, then allow optional auto-load to resume
      // after the native list has had time to settle.
      cancelRun();
      state.manualPauseUntil = Date.now() + 12000;
      state.autoLoadCompletedSignature = "";
      scheduleAutoLoadRetry(12200);
      return;
    }
    if (event.target.closest("a[href]")) setTimeout(routeRefresh, 80);
  }, true);

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !DS.hasSettingStorageChanges?.(changes)) return;
      const toggled = !!changes[DS.settingStorageKey?.("autoLoadMyCreations")] || (changes.settings && changes.settings.oldValue?.autoLoadMyCreations !== changes.settings.newValue?.autoLoadMyCreations);
      if (toggled) { state.autoLoadCompletedSignature = ""; state.nextAttemptAt = 0; }
      setTimeout(() => {
        if (isMyCreations()) {
          if (!settings().enabled || !settings().autoLoadMyCreations) cancelRun();
          else if (!state.autoLoadRunning && !state.autoLoadRetryTimer && !state.autoLoadObserver) scheduleAutoLoadRetry(250);
        }
        schedulePanelAdjustment(50);
        DS.rc86RefreshBulkBlockUi?.();
      }, 0);
    });
  } catch {}

  DS.rc87Refresh = routeRefresh;
  DS.rc87AdjustMiniPanel = adjustMiniPanelPosition;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", routeRefresh, { once: true });
  } else {
    routeRefresh();
  }
})();

}
