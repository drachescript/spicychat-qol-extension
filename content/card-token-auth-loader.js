(() => {
  "use strict";

  // Keep the MAIN-world auth bridge limited to features that need authenticated
  // SpicyChat API access. Chat routes get a very early one-shot start so the
  // bridge cannot miss SpicyChat's first authenticated message-history XHR.
  const LOADER_ID = "ds-card-token-main-bridge-loader";
  const CONTROL_EVENT = "ds-qol-card-token-bridge-control-v1";
  let requested = false;
  let bridgeWanted = false;

  function sendControl(enabled) {
    try {
      window.dispatchEvent(new CustomEvent(CONTROL_EVENT, { detail: { enabled: !!enabled } }));
    } catch {}
  }

  function inject() {
    if (requested || document.documentElement?.getAttribute("data-ds-card-token-main-bridge") === "2") {
      sendControl(bridgeWanted);
      return;
    }
    requested = true;
    const script = document.createElement("script");
    script.id = LOADER_ID;
    script.src = chrome.runtime.getURL("content/card-token-main.js");
    script.async = false;
    script.onload = () => {
      script.remove();
      sendControl(bridgeWanted);
    };
    script.onerror = () => {
      requested = false;
      script.remove();
    };
    const append = () => {
      const root = document.documentElement || document.head || document.body;
      if (root) root.appendChild(script);
    };
    if (document.documentElement || document.head || document.body) append();
    else document.addEventListener("readystatechange", append, { once: true });
  }

  window.DSCardTokenBridgeLoader = {
    ensure() { bridgeWanted = true; inject(); },
    disable() { bridgeWanted = false; sendControl(false); }
  };

  function isBotProfileRoute() {
    return /^\/(?:[a-z]{2}\/)?chatbot\/[0-9a-f-]{20,}(?:[/?#]|$)/i.test(String(location.pathname || ""));
  }

  function isChatRoute() {
    return /^\/(?:[a-z]{2}\/)?chat\/[0-9a-f-]{20,}(?:\/[0-9a-f-]{20,})?(?:[/?#]|$)/i.test(String(location.pathname || ""));
  }

  function isChatListRoute() {
    return /^\/(?:[a-z]{2}\/)?chats?\/?$/i.test(String(location.pathname || ""));
  }

  function isRecommendationWorkerRoute() {
    try { return new URLSearchParams(location.search || "").get("dsQolRecommendationWorker") === "1"; }
    catch { return false; }
  }

  if (isRecommendationWorkerRoute()) {
    try { document.documentElement?.setAttribute("data-ds-qol-recommendation-worker", "1"); } catch {}
  }

  function syncFromSettings(settings) {
    const publicArchiveNeedsProfileBridge = !!settings?.botArchiveRememberSeenPublic && isBotProfileRoute();
    // Export can also be opened from the QoL panel even when the title-bar
    // Export button is hidden, so every enabled chat route needs auth capture.
    const chatExportNeedsAuthBridge = isChatRoute();
    const chatListImportNeedsAuthBridge = isChatListRoute();
    const enabled = !!(settings && settings.enabled !== false && (
      settings.showCardGreetingTokenInfo ||
      settings.deepSleepDisabledFeatures === false ||
      publicArchiveNeedsProfileBridge ||
      chatExportNeedsAuthBridge ||
      chatListImportNeedsAuthBridge ||
      isRecommendationWorkerRoute()
    ));
    bridgeWanted = enabled;
    if (enabled) inject();
    else sendControl(false);
  }

  // Chat history is usually fetched very early during page boot. Start the
  // lightweight MAIN-world bridge immediately on chat routes so it can observe
  // SpicyChat's own authenticated /messages XHR before an export is requested.
  // Settings still decide whether the hooks remain active after startup.
  if (isChatRoute() || isChatListRoute() || isRecommendationWorkerRoute()) {
    bridgeWanted = true;
    inject();
  }

  const GRANULAR_SETTING_PREFIX = "dsSettingV1:";
  const watchedSettingNames = ["enabled", "showCardGreetingTokenInfo", "deepSleepDisabledFeatures", "botArchiveRememberSeenPublic"];
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
    chrome.storage.local.get(["settings", ...watchedSettingNames.map(settingStorageKey)], result => syncFromSettings(hydrateWatchedSettings(result || {})));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !applyWatchedChanges(changes)) return;
      syncFromSettings(watchedSettings);
    });
  } catch {
    // If storage is unavailable, the early chat-route bridge may remain active;
    // this preserves API export rather than losing auth capture entirely.
  }
})();
