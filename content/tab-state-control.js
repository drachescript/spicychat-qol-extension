(() => {
  "use strict";
  // Always loads first, before the optional runtime modules. Reading sessionStorage
  // here is synchronous, so a paused reload never boots the feature modules.
  const KEY = "ds-qol-tab-paused-v1";
  const gate = {
    get paused() { try { return sessionStorage.getItem(KEY) === "1" && !this.worker; } catch { return false; } },
    get worker() {
      try {
        if (/dsQol(?:BotStatusWorker|RecommendationWorker|LorebookBackupWorker|ListingRefillWorker|QuickDislikeWorker|QuickLessLikeWorker)=1/i.test(location.search)) return true;
        return /^(?:bot-status|lorebook-backup|recommendation|listing-refill|quick-dislike|less-like)$/.test(String(sessionStorage.getItem("dsQolBackgroundWorkerKind") || ""));
      } catch { return false; }
    }
  };
  window.__DSQ_TAB_GATE__ = gate;
  if (!gate.paused) return;
  let globalEnabled = true;
  try {
    chrome.storage.local.get(["settings", "dsSettingV1:enabled"], data => {
      if (data?.["dsSettingV1:enabled"] !== undefined) globalEnabled = data["dsSettingV1:enabled"] !== false;
      else globalEnabled = data?.settings?.enabled !== false;
    });
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "DS_GET_QOL_TAB_STATE") {
        sendResponse({ ok: true, globalEnabled, paused: gate.paused, enabled: globalEnabled && !gate.paused });
      } else if (message?.type === "DS_SET_QOL_TAB_STATE") {
        const enabled = message.enabled !== false;
        try {
          if (enabled) sessionStorage.removeItem(KEY);
          else sessionStorage.setItem(KEY, "1");
        } catch {}
        sendResponse({ ok: true, globalEnabled, paused: !enabled, enabled: globalEnabled && enabled });
        if (enabled) setTimeout(() => { try { location.reload(); } catch {} }, 100);
      }
      return false;
    });
  } catch {}
})();
