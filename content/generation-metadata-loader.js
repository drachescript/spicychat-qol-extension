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
    // Background API helpers do not need generation metadata/timestamp
    // interception. Keep only the auth/API bridge required by their task.
    return;
  }

  const SOURCE = "spicychat-qol-generation-metadata";
  const CONTROL_SOURCE = "spicychat-qol-generation-metadata-control";
  const BUFFER_KEY = "__DSQ_GENERATION_METADATA_BUFFER__";

  // Early quota events can arrive before document_idle. Never silently drop
  // them just because the visual tracker has not initialized.
  const quotaBuffer=window.__DSQ_QUOTA_BUFFER__={rows:[],dropped:0};
  window.addEventListener('ds-qol-quota-scoped-v1',event=>{
    let row;try{row=JSON.parse(event.detail);}catch{return;}
    if(!row||!['scope','bind','generation'].includes(row.type))return;
    if(typeof window.__DSQ_QUOTA_RECEIVE__==='function'){window.__DSQ_QUOTA_RECEIVE__(row);return;}
    if(quotaBuffer.rows.length>=256){quotaBuffer.rows.shift();quotaBuffer.dropped++;}
    quotaBuffer.rows.push(row);
  });
  let injected = false;
  let enabled = false;
  let quotaEnabled = false;

  window[BUFFER_KEY] = Array.isArray(window[BUFFER_KEY]) ? window[BUFFER_KEY] : [];

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== SOURCE) return;

    if (window.__DSQ_GENERATION_METADATA_READY__) return;
    const buffer = window[BUFFER_KEY];
    buffer.push(event.data);
    if (buffer.length > 160) buffer.splice(0, buffer.length - 160);
  });

  function sendState() {
    window.postMessage({
      source: CONTROL_SOURCE,
      type: "DSQ_GENERATION_METADATA_ENABLED",
      enabled, quotaEnabled
    }, "*");
  }

  function injectBridge() {
    if (injected) {
      sendState();
      return;
    }

    const path = "content/generation-metadata-bridge.js";
    let url = globalThis.DSQBrowserApiCompat?.extensionUrl?.(path);
    // Preserve older Android/WebExtension injectors without the helper.
    if (!url) try { url = globalThis.chrome?.runtime?.getURL?.(path); } catch {}
    if (!url) try { url = globalThis.browser?.runtime?.getURL?.(path); } catch {}
    if (!url) return;
    injected = true;
    const script = document.createElement("script");
    script.src = url;
    script.async = false;
    script.dataset.dsQolGenerationMetadataBridge = "1";
    script.addEventListener("load", () => {
      sendState();
      script.remove();
    }, { once: true });
    script.addEventListener("error", () => {
      injected = false; // Permit a settings-triggered retry after transient failures.
      script.remove();
    }, { once: true });
    const append = () => {
      const root = document.documentElement || document.head || document.body;
      if (!root) return;
      try { root.appendChild(script); }
      catch { injected = false; script.remove(); }
    };

    if (document.documentElement || document.head || document.body) append();
    else document.addEventListener("readystatechange", append, { once: true });
  }

  function setEnabled(nextEnabled, nextQuota = quotaEnabled) {
    const next = !!nextEnabled, quota = !!nextQuota;
    if (enabled === next && quotaEnabled === quota) {
      if ((next || quota) && !injected) injectBridge();
      return;
    }
    enabled = next; quotaEnabled = quota;
    if (enabled || quotaEnabled) injectBridge();
    else if (injected) sendState();
  }

  function applySettings(settings) {
    // Capture generation responses whenever QoL requests metadata or context
    // diagnostics, regardless of which extension draws the visual statistics.
    setEnabled(!!settings?.enabled && metadataRequested(settings), !!settings?.enabled && settings?.dailyMessageLimitTrackerEnabled === true);
  }


  function metadataRequested(settings) {
    return !!(
      settings?.showGenerationMetadata ||
      settings?.showMessageTimestamps ||
      settings?.showGenerationModel ||
      settings?.showGenerationElapsed ||
      settings?.showGenerationSettings ||
      settings?.enableContextWindowWarning ||
      settings?.nativeMemoryQualityProbe
    );
  }

  window.__DSQ_SET_GENERATION_METADATA_ENABLED__ = setEnabled;

  const GRANULAR_SETTING_PREFIX = "dsSettingV1:";
  const watchedSettingNames = ["enabled", "saiToolkitCompatibility", "showGenerationMetadata", "showMessageTimestamps", "showGenerationModel", "showGenerationElapsed", "showGenerationSettings", "enableContextWindowWarning", "nativeMemoryQualityProbe", "dailyMessageLimitTrackerEnabled"];
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

  // A missing storage reply must not enable an optional interceptor.
  const compat = globalThis.DSQBrowserApiCompat;
  void compat?.readLocal?.(["settings", ...watchedSettingNames.map(settingStorageKey)]).then(result => {
    if (result) applySettings(hydrateWatchedSettings(result));
  }).catch(() => {});
  compat?.watchLocal?.((changes, areaName) => {
    if (areaName !== "local" || !applyWatchedChanges(changes)) return;
    applySettings(watchedSettings);
  });
})();

}
