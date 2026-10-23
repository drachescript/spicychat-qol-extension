// Saving and downloading QoL data. Must load after core.js.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.saveOpenedChats = async function saveOpenedChats(options = {}) {
    if (options.skipBlockedCleanup !== true) {
      await DS.enforceBlockedPriorityOverOpened?.({ persist: false });
    }

    const payload = {};
    if (options.metaOnly !== true) payload[DS.OPENED_KEY] = [...DS.state.openedChats];
    if (options.idsOnly !== true) payload[DS.OPENED_META_KEY] = DS.state.openedChatMeta || {};
    await DS.storageSet(payload);

    if (DS.state?.settings?.showQuickPanel) DS.updateQuickPanel?.();
  };

  DS.saveOpenedChatMeta = function saveOpenedChatMeta(id, meta = {}) {
    if (!id) return;

    DS.state.openedChatMeta = DS.state.openedChatMeta || {};
    DS.state.openedChatMeta[id] = {
      ...(DS.state.openedChatMeta[id] || {}),
      ...meta,
      id,
      savedAt: meta.savedAt || DS.state.openedChatMeta[id]?.savedAt || Date.now(),
      lastSeenAt: Date.now()
    };
  };

  // A rapid series of card blocks must survive storage.onChanged events from
  // earlier saves. Keep these optimistic additions until the corresponding
  // write has settled, and merge them into every incoming storage snapshot.
  const pendingBlockAdds = new Map();
  let blockedWriteTail = Promise.resolve();
  DS.pendingBlockedBotAdds = pendingBlockAdds;
  DS.notePendingBotBlock = function notePendingBotBlock(id, meta = {}) {
    const botId = String(id || "").trim().toLowerCase();
    if (!botId) return null;
    const record = { meta: { ...(meta || {}), id: botId }, state: "pending" };
    pendingBlockAdds.set(botId, record);
    return record;
  };
  DS.forgetPendingBotBlock = function forgetPendingBotBlock(id) {
    pendingBlockAdds.delete(String(id || "").trim().toLowerCase());
  };
  DS.finishPendingBotBlock = function finishPendingBotBlock(id, record, saved) {
    const botId = String(id || "").trim().toLowerCase();
    const current = pendingBlockAdds.get(botId);
    if (!current || (record && current !== record)) return;
    if (!saved) {
      pendingBlockAdds.delete(botId);
      return;
    }
    current.state = "saved";
    // Keep the optimistic ID briefly so delayed storage events from an older
    // block cannot overwrite the new one before the most recent event arrives.
    setTimeout(() => {
      if (pendingBlockAdds.get(botId) === current) pendingBlockAdds.delete(botId);
    }, 2000);
  };

  DS.saveBlockedBots = function saveBlockedBots() {
    // Serialize full-list writes. chrome.storage.local.set is last-write-wins,
    // so two overlapping writes of a 5k+ ID list can otherwise lose a click.
    const write = async () => {
      const store = DS.state.blockedBots || (DS.state.blockedBots = { ids: [], names: [], meta: {} });
      store.ids = DS.uniqueClean([...(store.ids || []), ...pendingBlockAdds.keys()]);
      store.names = DS.uniqueClean(store.names || []);
      if (!store.meta || typeof store.meta !== "object") store.meta = {};
      for (const [id, pending] of pendingBlockAdds) {
        store.meta[id] = { ...(store.meta[id] || {}), ...pending.meta };
      }
      // rawBlockedBots mirrors confirmed storage, not an optimistic snapshot.
      // Changing it before chrome.storage reports success can resurrect a
      // failed block after the next settings refresh.
      DS.refreshFastLookupCaches?.();

      const removedOpened = await DS.enforceBlockedPriorityOverOpened?.({ persist: false }) || 0;
      // Snapshot after the await, never pass a mutable live object into the
      // shared write queue. New clicks will be written by the next queued save.
      const current = DS.state.blockedBots || store;
      const snapshot = {
        ids: DS.uniqueClean([...(current.ids || []), ...pendingBlockAdds.keys()]),
        names: DS.uniqueClean(current.names || []),
        meta: { ...(current.meta || {}) }
      };
      for (const [id, pending] of pendingBlockAdds) {
        snapshot.meta[id] = { ...(snapshot.meta[id] || {}), ...pending.meta };
      }
      const payload = { [DS.BLOCKED_BOTS_KEY]: snapshot };
      if (removedOpened) {
        payload[DS.OPENED_KEY] = [...DS.state.openedChats];
        payload[DS.OPENED_META_KEY] = { ...(DS.state.openedChatMeta || {}) };
      }
      const saved = await DS.storageSet(payload, { immediate: true });
      // storageSet resolves false on failure; it does not necessarily throw.
      if (saved !== true) throw new Error("Blocked bot storage save failed");
      DS.state.rawBlockedBots = {
        ids: [...snapshot.ids], names: [...snapshot.names], meta: { ...snapshot.meta }
      };
      if (DS.state?.settings?.showQuickPanel) DS.updateQuickPanel?.();
      return true;
    };
    const result = blockedWriteTail.catch(() => {}).then(write);
    blockedWriteTail = result.catch(() => {});
    return result;
  };

  // Block controls must not report success or hide their card merely because
  // an optimistic in-memory lookup contains the ID. Wait for the stored copy.
  DS.confirmBotBlockStored = async function confirmBotBlockStored(id) {
    const botId = String(id || "").trim().toLowerCase();
    if (!botId) return false;
    const saved = await DS.storageGet([DS.BLOCKED_BOTS_KEY]);
    const ids = saved?.[DS.BLOCKED_BOTS_KEY]?.ids;
    return Array.isArray(ids) && ids.some(value => String(value || "").toLowerCase() === botId);
  };

  DS.saveNotInterestedBots = async function saveNotInterestedBots() {
    DS.state.notInterestedBots.ids =
      DS.uniqueClean(DS.state.notInterestedBots.ids);

    if (!DS.state.notInterestedBots.meta || typeof DS.state.notInterestedBots.meta !== "object") {
      DS.state.notInterestedBots.meta = {};
    }

    DS.refreshFastLookupCaches?.();

    await DS.storageSet({
      [DS.NOT_INTERESTED_KEY]: DS.state.notInterestedBots
    });

    if (DS.state?.settings?.showQuickPanel) DS.updateQuickPanel?.();
  };

  DS.saveFavoriteCreators = async function saveFavoriteCreators(store = DS.state.favoriteCreators) {
    DS.state.favoriteCreators = typeof DS.normalizeCreatorStore === "function"
      ? DS.normalizeCreatorStore(store)
      : store;

    await DS.storageSet({
      [DS.FAVORITE_CREATORS_KEY]: DS.state.favoriteCreators
    });

    if (DS.state?.settings?.showQuickPanel) DS.updateQuickPanel?.();
  };

  DS.saveFollowedCreators = async function saveFollowedCreators(store = DS.state.followedCreators) {
    DS.state.followedCreators = typeof DS.normalizeFollowedCreatorStore === "function"
      ? DS.normalizeFollowedCreatorStore(store)
      : store;

    await DS.storageSet({
      [DS.FOLLOWED_CREATORS_KEY]: DS.state.followedCreators
    });

    if (DS.state?.settings?.showQuickPanel) DS.updateQuickPanel?.();
  };

  DS.saveFavoriteBots = async function saveFavoriteBots(store = DS.state.favoriteBots) {
    const source = store && typeof store === "object" ? store : {};
    const normalized = {
      ids: DS.uniqueClean(Array.isArray(source.ids) ? source.ids : []),
      meta: source.meta && typeof source.meta === "object" ? source.meta : {}
    };

    DS.state.favoriteBots = normalized;
    DS.refreshFastLookupCaches?.();
    await DS.storageSet({
      [DS.FAVORITE_BOTS_KEY]: normalized
    });
  };

  DS.saveBotOrganization = async function saveBotOrganization(store = DS.state.botOrganization) {
    const next = store && typeof store === "object" ? store : { collections: [], meta: {} };
    DS.state.botOrganization = {
      collections: DS.uniqueClean(Array.isArray(next.collections) ? next.collections : []),
      folderCovers: next.folderCovers && typeof next.folderCovers === "object" ? next.folderCovers : {},
      folderScopes: next.folderScopes && typeof next.folderScopes === "object" ? next.folderScopes : {},
      meta: next.meta && typeof next.meta === "object" ? next.meta : {}
    };
    const saved = await DS.storageSet({
      [DS.BOT_ORGANIZER_KEY]: DS.state.botOrganization
    });
    if (saved === false) throw new Error("QoL could not save the bot folders. Please try again.");
    if (DS.state?.settings?.showQuickPanel) DS.updateQuickPanel?.();
    return true;
  };

  DS.saveChatOrganization = async function saveChatOrganization(store = DS.state.chatOrganization) {
    const next = store && typeof store === "object" ? store : { meta: {} };
    DS.state.chatOrganization = {
      meta: next.meta && typeof next.meta === "object" ? next.meta : {}
    };
    await DS.storageSet({
      [DS.CHAT_ORGANIZER_KEY]: DS.state.chatOrganization
    });
    if (DS.state?.settings?.showQuickPanel) DS.updateQuickPanel?.();
  };

  DS.saveRecentlySeenBots = async function saveRecentlySeenBots(store = DS.state.recentlySeenBots) {
    const next = store && typeof store === "object" ? store : { entries: [] };
    DS.state.recentlySeenBots = {
      entries: Array.isArray(next.entries) ? next.entries : []
    };
    await DS.storageSet({
      [DS.RECENTLY_SEEN_BOTS_KEY]: DS.state.recentlySeenBots
    });
    if (DS.state?.settings?.showQuickPanel) DS.updateQuickPanel?.();
  };

  DS.saveLaterBots = async function saveLaterBots(store = DS.state.laterBots) {
    const next = store && typeof store === "object" ? store : { ids: [], meta: {} };

    DS.state.laterBots = {
      ids: DS.uniqueClean(Array.isArray(next.ids) ? next.ids : []),
      meta: next.meta && typeof next.meta === "object" ? next.meta : {}
    };

    DS.refreshFastLookupCaches?.();

    await DS.storageSet({
      [DS.LATER_BOTS_KEY]: DS.state.laterBots
    });

    if (DS.state?.settings?.showQuickPanel) DS.updateQuickPanel?.();
  };


  DS.requestDownloadPermission = function requestDownloadPermission() {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: "DS_REQUEST_DOWNLOAD_PERMISSION" }, response => {
          if (chrome.runtime.lastError) return resolve(false);
          resolve(!!response?.ok);
        });
      } catch {
        resolve(false);
      }
    });
  };

  DS.downloadTextFile = async function downloadTextFile(
    text,
    filename = "spicychat-qol-export.txt",
    mimeType = "text/plain;charset=utf-8",
    options = {}
  ) {
    const value = String(text ?? "");
    const safeName = String(filename || "spicychat-qol-export.txt")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 180) || "spicychat-qol-export.txt";
    const safeMime = String(mimeType || "application/octet-stream").slice(0, 120);
    if (!value) return { ok: false, error: "Export payload is empty." };

    // Android wrappers should keep using the native/system saver when exposed.
    try {
      if (typeof window._dsRequestExport === "function") {
        window._dsRequestExport(value, safeName);
        return { ok: true, method: "android" };
      }
    } catch {}
    try {
      const bridge = window.flutter_inappwebview;
      if (bridge?.callHandler) {
        try {
          await bridge.callHandler("saveFile", JSON.stringify({
            text: value,
            content: value,
            filename: safeName,
            fileName: safeName,
            mimeType: safeMime
          }));
          return { ok: true, method: "android" };
        } catch {}
      }
    } catch {}

    // Ask for the optional downloads permission while the initiating click is
    // still fresh. Firefox/Opera can be stricter about downloads started after
    // a long async crawl, so the background download manager is preferred when
    // permission is available. Denial is harmless: the Blob fallback remains.
    if (options.requestPermission !== false) {
      try { await DS.requestDownloadPermission?.(); } catch {}
    }

    try {
      const managed = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          type: "DS_DOWNLOAD_TEXT_FILE",
          text: value,
          filename: safeName,
          mimeType: safeMime
        }, response => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response || null);
        });
      });
      if (managed?.ok) return { ok: true, method: "browser-manager", downloadId: managed.downloadId };
    } catch {}

    // Permission-free fallback for Chromium/Opera/Firefox. Keep the object URL
    // alive long enough for browsers that consume the click asynchronously.
    try {
      const blob = new Blob([value], { type: safeMime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeName;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      (document.body || document.documentElement).appendChild(anchor);
      try {
        anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      } catch {
        anchor.click();
      }
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { ok: true, method: "blob-link" };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  };

  DS.savePersonas = async function savePersonas(personas) {
    DS.state.savedPersonas = DS.cleanPersonas(personas);

    await DS.storageSet({
      [DS.PERSONAS_KEY]: DS.state.savedPersonas
    });

    if (DS.state?.settings?.showQuickPanel) DS.updateQuickPanel?.();
  };
})();
}
