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
    manualPauseUntil: 0
  };

  function settings() {
    return DS.state?.settings || DS.DEFAULT_SETTINGS || {};
  }

  function currentPath() {
    return String(location.pathname || "").replace(/\/+$/, "") || "/";
  }

  function isMyCreations() {
    return currentPath() === MY_CREATIONS_PATH;
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

  function listingSignature() {
    const ids = Array.from(currentBotIds());
    return `${ids.length}|${ids.slice(0, 3).join(",")}|${ids.slice(-3).join(",")}|${pageCountSetting()}`;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitForButton(timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!isMyCreations()) return null;
      const button = loadMoreButton();
      if (button) return button;
      // If SpicyChat is currently fetching, wait for its native control to
      // become enabled/reappear instead of treating the list as finished.
      await sleep(180);
    }
    return null;
  }

  function waitForGrowth(beforeIds, timeoutMs = 10000) {
    return new Promise(resolve => {
      let done = false;
      let timer = null;
      const root = document.body || document.documentElement;

      const finish = grew => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        observer.disconnect();
        resolve({ grew: !!grew, ids: currentBotIds(true) });
      };

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
        if (!isMyCreations()) return finish(false);
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes || []) {
            if (anchorAddsNewBot(node)) return finish(true);
          }
        }
      });

      if (!root) return finish(false);
      observer.observe(root, { childList: true, subtree: true });
      timer = setTimeout(() => finish(false), Math.max(500, timeoutMs));

      // Cover the tiny gap between the native click and observer installation
      // with one immediate check, rather than rescanning the whole page every
      // 160 ms for up to ten seconds.
      const now = currentBotIds();
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
  }

  function scheduleAutoLoadRetry(delay = 500) {
    clearTimeout(state.autoLoadRetryTimer);
    state.autoLoadRetryTimer = null;
    if (!isMyCreations() || !settings().enabled || !settings().autoLoadMyCreations) {
      stopAutoLoadObserver();
      return;
    }
    state.autoLoadRetryTimer = setTimeout(() => {
      state.autoLoadRetryTimer = null;
      DS.applyMyCreationsAutoLoad?.();
    }, Math.max(100, delay));
  }

  function watchForNativeLoadMore() {
    stopAutoLoadObserver();
    if (!isMyCreations() || !settings().enabled || !settings().autoLoadMyCreations || state.autoLoadRunning) return;
    if (loadMoreButton()) return scheduleAutoLoadRetry(80);
    if (!document.body) return scheduleAutoLoadRetry(400);

    // Route-scoped and temporary: disconnect as soon as the native Load More
    // appears. This covers React mounting it after the normal slow QoL pass.
    state.autoLoadObserver = new MutationObserver(() => {
      if (!isMyCreations()) return stopAutoLoadObserver();
      if (!loadMoreButton({ allowBusy: true })) return;
      stopAutoLoadObserver();
      scheduleAutoLoadRetry(120);
    });
    state.autoLoadObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(stopAutoLoadObserver, 10000);
  }

  DS.applyMyCreationsAutoLoad = async function rc87MyCreationsAutoLoad() {
    if (!isMyCreations()) {
      state.autoLoadCompletedSignature = "";
      state.autoLoadRunning = false;
      stopAutoLoadObserver();
      return;
    }

    const cfg = settings();
    if (!cfg.enabled || !cfg.autoLoadMyCreations || state.autoLoadRunning) return;
    if (Date.now() < Number(state.manualPauseUntil || 0)) {
      scheduleAutoLoadRetry(Math.max(200, state.manualPauseUntil - Date.now() + 150));
      return;
    }

    const requestedPages = pageCountSetting();
    const startSignature = listingSignature();
    if (state.autoLoadCompletedSignature && state.autoLoadCompletedSignature === startSignature) return;

    state.autoLoadRunning = true;
    DS.state.myCreationsAutoLoadRunning = true;
    stopAutoLoadObserver();
    let loaded = 0;
    let attempted = false;

    try {
      for (let page = 0; page < requestedPages; page += 1) {
        const button = await waitForButton(page === 0 ? 5000 : 8000);
        if (!button) break;

        const beforeIds = currentBotIds();
        attempted = true;
        DS.runtimeLog?.("info", "my-creations-auto-load", "Clicking native My Creations Load More", {
          batch: page + 1,
          requested: requestedPages,
          beforeTotal: beforeIds.size
        });

        if (!clickNativeLoadMore(button)) break;
        const result = await waitForGrowth(beforeIds, 10000);
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
        await sleep(220);
      }

      DS.state.myCreationsAutoLoadLastPages = requestedPages;
      // Only remember a completed signature after at least one successful
      // native load. If React simply had not mounted the button yet, a later
      // route-scoped retry is still allowed to do the work.
      if (loaded > 0) {
        state.autoLoadCompletedSignature = listingSignature();
        DS.state.myCreationsAutoLoadLastFingerprint = state.autoLoadCompletedSignature;
        DS.bumpDomRevision?.();
        DS.runtimeLog?.("info", "my-creations-auto-load", "My Creations auto-load complete", {
          loaded,
          requested: requestedPages,
          total: currentBotIds().size
        });
      } else if (!attempted) {
        watchForNativeLoadMore();
      }
    } finally {
      state.autoLoadRunning = false;
      DS.state.myCreationsAutoLoadRunning = false;
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
    const route = `${location.pathname || ""}${location.search || ""}`;
    if (route !== state.lastRoute) {
      state.lastRoute = route;
      state.autoLoadCompletedSignature = "";
    }
    if (isMyCreations()) {
      scheduleAutoLoadRetry(350);
      setTimeout(() => scheduleAutoLoadRetry(0), 1300);
      setTimeout(() => scheduleAutoLoadRetry(0), 3200);
    } else {
      clearTimeout(state.autoLoadRetryTimer);
      stopAutoLoadObserver();
    }
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
      state.manualPauseUntil = Date.now() + 12000;
      clearTimeout(state.autoLoadRetryTimer);
      state.autoLoadRetryTimer = null;
      setTimeout(() => scheduleAutoLoadRetry(0), 12200);
      return;
    }
    if (event.target.closest("a[href]")) setTimeout(routeRefresh, 80);
  }, true);

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      setTimeout(() => {
        if (isMyCreations()) scheduleAutoLoadRetry(250);
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
