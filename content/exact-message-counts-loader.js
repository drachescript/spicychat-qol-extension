// Avoid installing early API/network hooks on per-tab-disabled page loads.
if (!(() => { try {
    if (sessionStorage.getItem("ds-qol-tab-paused-v1") !== "1") return false;
    return !(/dsQol(?:BotStatusWorker|RecommendationWorker|LorebookBackupWorker|ListingRefillWorker|QuickDislikeWorker|QuickLessLikeWorker)=1/i.test(location.search) || /^(?:bot-status|lorebook-backup|recommendation|listing-refill|quick-dislike|less-like)$/.test(String(sessionStorage.getItem("dsQolBackgroundWorkerKind") || "")));
  } catch { return false; } })()) {
(() => {
  "use strict";

  const bootstrapParams = new URLSearchParams(location.search || "");
  const botStatusBootstrap = bootstrapParams.get("dsQolBotStatusWorker") === "1";
  if (botStatusBootstrap) {
    // Persist this before SpicyChat's router gets a chance to rewrite/reload the
    // Home URL. sessionStorage is tab-scoped, so it never marks other tabs.
    try { sessionStorage.setItem("dsQolBackgroundWorkerKind", "bot-status"); } catch {}
  }
  let sessionWorkerKind = "";
  try { sessionWorkerKind = String(sessionStorage.getItem("dsQolBackgroundWorkerKind") || ""); } catch {}
  if (
    sessionWorkerKind === "bot-status" ||
    botStatusBootstrap ||
    bootstrapParams.get("dsQolRecommendationWorker") === "1" ||
    bootstrapParams.get("dsQuickLessLike") === "1"
  ) {
    // Dedicated API helpers must not install the Typesense/exact-count bridge.
    // Their URL marker is bootstrap-only; durable worker identity is handled by
    // the background tab/session heartbeat after SpicyChat rewrites the URL.
    return;
  }

  const SOURCE = "spicychat-qol-exact-message-counts";
  const CONTROL_SOURCE = "spicychat-qol-exact-message-counts-control";
  const BUFFER_KEY = "__DSQ_EXACT_MESSAGE_COUNT_BUFFER__";
  let injected = false;
  let enabled = false;

  window[BUFFER_KEY] = Array.isArray(window[BUFFER_KEY]) ? window[BUFFER_KEY] : [];

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== SOURCE) return;
    const buffer = window[BUFFER_KEY];
    buffer.push(event.data);
    if (buffer.length > 80) buffer.splice(0, buffer.length - 80);
  });

  function sendState() {
    try {
      window.postMessage({
        source: CONTROL_SOURCE,
        type: "DSQ_EXACT_MESSAGE_COUNTS_ENABLED",
        enabled
      }, "*");
    } catch {}
  }

  function injectBridge() {
    if (injected) {
      sendState();
      return;
    }
    injected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("content/exact-message-counts-bridge.js");
    script.async = false;
    script.dataset.dsQolExactMessageCountsBridge = "1";
    script.addEventListener("load", () => {
      sendState();
      script.remove();
    }, { once: true });
    script.addEventListener("error", () => {
      injected = false;
      script.remove();
    }, { once: true });
    (document.documentElement || document.head || document).appendChild(script);
  }

  function setEnabled(next) {
    enabled = !!next;
    if (enabled) injectBridge();
    else if (injected) sendState();
  }

  function applySettings(settings) {
    setEnabled(!!(settings?.enabled && (settings?.showExactMessageCounts || settings?.showBotCreationDates)));
  }

  // A disabled feature must not install a MAIN-world network bridge.
  // Enabled users still get the bridge after settings hydrate; an initial
  // Typesense request may precede that hydration and require a later listing
  // request before the first count can be shown.

  const GRANULAR_SETTING_PREFIX = "dsSettingV1:";
  const watchedSettingNames = ["enabled", "showExactMessageCounts", "showBotCreationDates"];
  const watchedSettings = {};

  function settingStorageKey(name) { return `${GRANULAR_SETTING_PREFIX}${name}`; }

  function hydrateWatchedSettings(result = {}) {
    const next = { ...(result.settings || {}) };
    for (const name of watchedSettingNames) {
      const key = settingStorageKey(name);
      if (Object.prototype.hasOwnProperty.call(result, key)) next[name] = result[key];
    }
    Object.assign(watchedSettings, next);
    return watchedSettings;
  }

  function applyWatchedChanges(changes = {}) {
    let changed = false;
    if (changes.settings) { Object.assign(watchedSettings, changes.settings.newValue || {}); changed = true; }
    for (const name of watchedSettingNames) {
      const change = changes[settingStorageKey(name)];
      if (!change) continue;
      if (change.newValue === undefined) delete watchedSettings[name];
      else watchedSettings[name] = change.newValue;
      changed = true;
    }
    return changed;
  }

  try {
    chrome.storage.local.get(["settings", ...watchedSettingNames.map(settingStorageKey)], result => applySettings(hydrateWatchedSettings(result || {})));
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !applyWatchedChanges(changes)) return;
      applySettings(watchedSettings);
    });
  } catch {}
})();

}
