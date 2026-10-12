"use strict";
// Runtime messages, tab/storage events and alarms. Imports after background.js.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "DS_QOL_DIAGNOSTIC_SUBSCRIBE") {
    sendResponse(qolDiagnosticSubscribe(sender, message));
    return false;
  }

  if (message?.type === "DS_QOL_DIAGNOSTIC_STATUS_QUERY") {
    let traceLevel = "off";
    for (const sub of qolDiagnosticSubscribers.values()) {
      if (!sub?.active) continue;
      if (sub.traceLevel === "deep") { traceLevel = "deep"; break; }
      traceLevel = "normal";
    }
    sendResponse({ ok: true, active: traceLevel !== "off", traceLevel, subscribers: qolDiagnosticSubscribers.size, latestSeq: qolDiagnosticBackgroundSeq });
    return false;
  }

  if (message?.type === "DS_QOL_DIAGNOSTIC_BACKGROUND_EMIT") {
    const level = message?.level === "deep" ? "deep" : "normal";
    const event = qolBackgroundTrace(String(message?.event || "event"), String(message?.feature || "options"), message?.meta || {}, { level, critical: !!message?.critical });
    sendResponse({ ok: true, seq: Number(event?.seq || 0) });
    return false;
  }
  const tabId = sender.tab?.id;

  if (message?.type === "DS_BOT_STATUS_PERSIST_DELTA") {
    persistBotStatusDelta(message).then(sendResponse).catch(error => {
      sendResponse({ ok: false, error: error?.message || String(error) });
    });
    return true;
  }

  if (message?.type === "DS_REQUEST_DOWNLOAD_PERMISSION") {
    if (!chrome.permissions?.contains || !chrome.permissions?.request) {
      sendResponse({ ok: false, status: "permissions-api-unavailable" });
      return false;
    }
    chrome.permissions.contains({ permissions: ["downloads"] }, allowed => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, status: "permission-check-failed", error: chrome.runtime.lastError.message });
        return;
      }
      if (allowed) {
        sendResponse({ ok: true, alreadyGranted: true });
        return;
      }
      try {
        chrome.permissions.request({ permissions: ["downloads"] }, granted => {
          const error = chrome.runtime.lastError?.message || "";
          sendResponse({
            ok: !!granted && !error,
            granted: !!granted,
            status: granted ? "granted" : "not-granted",
            error
          });
        });
      } catch (error) {
        sendResponse({ ok: false, status: "request-failed", error: error?.message || String(error) });
      }
    });
    return true;
  }

  if (message?.type === "DS_DOWNLOAD_TEXT_FILE") {
    const text = String(message.text ?? "");
    const filename = String(message.filename || "spicychat-qol-export.json")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 180) || "spicychat-qol-export.json";
    const mimeType = String(message.mimeType || "application/octet-stream").slice(0, 120);
    if (!text || text.length > 12_000_000) {
      sendResponse({ ok: false, error: "Export payload is empty or too large." });
      return false;
    }
    if (!chrome.permissions?.contains || !chrome.downloads?.download) {
      sendResponse({ ok: false, status: "download-manager-unavailable" });
      return false;
    }
    chrome.permissions.contains({ permissions: ["downloads"] }, allowed => {
      if (chrome.runtime.lastError || !allowed) {
        sendResponse({ ok: false, status: "downloads-permission-not-granted" });
        return;
      }
      try {
        const bytes = new TextEncoder().encode(text);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const url = `data:${mimeType};base64,${btoa(binary)}`;
        chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false }, id => {
          if (chrome.runtime.lastError || !Number.isFinite(Number(id))) {
            sendResponse({ ok: false, error: chrome.runtime.lastError?.message || "Download manager rejected the file." });
          } else {
            sendResponse({ ok: true, downloadId: Number(id) });
          }
        });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    });
    return true;
  }

  if (message?.type === "DS_LOREBOOK_EXPORT_HELPER") {
    const url = String(message.url || "");
    const token = String(message.token || "").trim().slice(0, 140);
    const target = String(message.target || "").trim().slice(0, 20);
    const id = String(message.id || "").trim().slice(0, 200);
    if (!/^https:\/\/(?:www\.)?spicychat\.ai\/lorebook\/edit\//i.test(url) || !token || !["details", "entries"].includes(target)) {
      sendResponse({ ok: false, error: "Invalid Lorebook helper request." });
      return false;
    }
    queueLorebookExportHelper({ url, token, target, id })
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, tabId: 0, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_WIKI_REQUEST_PERMISSION") {
    const origin = wikiOriginPattern(message.url);
    if (!origin) {
      sendResponse({ ok: false, error: "Enter a valid http:// or https:// page URL." });
      return;
    }
    requestOptionalOrigin(origin).then(sendResponse);
    return true;
  }

  if (message?.type === "DS_WIKI_FETCH") {
    fetchWikiPageSource(message.url)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }


  if (message?.type === "DS_CHARACTER_INDEX_METADATA_FETCH") {
    fetchCharacterIndexMetadata(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error), metadata: [], missing: [] }));
    return true;
  }

  if (message?.type === "DS_EXACT_MESSAGE_COUNTS_FETCH") {
    fetchExactMessageCounts(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error), counts: [] }));
    return true;
  }

  if (message?.type === "DS_CARD_TOKEN_BRIDGE_DIAG") {
    sendResponse(recordCardTokenBridge(message));
    return;
  }

  if (message?.type === "DS_CARD_TOKEN_FETCH") {
    fetchCardTokenCharacter(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QOL_BACKGROUND_WORKER_IDENTITY_QUERY") {
    const senderTabId = Number(sender?.tab?.id || 0);
    restoreBotStatusWorkerSession()
      .then(() => {
        const isBotStatus = !!senderTabId && (
          Number(botStatusWorkerTabId || 0) === senderTabId ||
          botStatusWorkerTabIds.has(senderTabId)
        );
        if (isBotStatus) {
          noteBotStatusWorkerHeartbeat(senderTabId, message?.sessionId || "");
          sendResponse({
            ok: true,
            worker: "bot-status",
            tabId: senderTabId,
            owned: !!botStatusWorkerOwned,
            sessionId: botStatusWorkerSessionId || "",
            heartbeatTtlMs: BOT_STATUS_WORKER_HEARTBEAT_TTL_MS,
            throttledTtlMs: BOT_STATUS_WORKER_THROTTLED_TTL_MS
          });
        } else {
          sendResponse({ ok: true, worker: "", tabId: senderTabId });
        }
      })
      .catch(error => sendResponse({ ok: false, worker: "", error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_PACE_WAIT") {
    const delayMs = Math.max(0, Math.min(10000, Number(message?.delayMs || 0)));
    // Keep the extension service worker/message channel alive for scan pacing.
    // This avoids relying on setTimeout cadence in a backgrounded Options tab,
    // which Chromium can throttle for minutes at a time.
    setTimeout(() => sendResponse({ ok: true, waitedMs: delayMs, at: Date.now() }), delayMs);
    return true;
  }

  if (message?.type === "DS_RECOMMENDATION_PACE_WAIT") {
    const delayMs = Math.max(0, Math.min(30000, Number(message?.delayMs || 0)));
    // Recommendation queues use service-worker-owned pacing too. Hidden
    // Options-page timers were the reason old Quick Dislike stretched a
    // sub-second interval into multi-minute gaps.
    setTimeout(() => sendResponse({ ok: true, waitedMs: delayMs, at: Date.now() }), delayMs);
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_GET") {
    getLargeStorageValues(message?.keys ?? null)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, data: {}, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_GET_RECORDS") {
    const key = String(message?.key || "");
    readLargeStorageRecords(key, message?.ids || [])
      .then(records => sendResponse({ ok: true, key, records }))
      .catch(error => sendResponse({ ok: false, key, records: {}, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_REMOVE_RECORDS") {
    const key = String(message?.key || "");
    removeLargeStorageRecords(key, message?.ids || [])
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, key, removed: 0, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_GET_PAGE") {
    const key = String(message?.key || "");
    readLargeStoragePage(key, { afterId: message?.afterId || "", limit: message?.limit })
      .then(page => sendResponse({ ok: true, ...page }))
      .catch(error => sendResponse({ ok: false, key, rows: [], done: true, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_OPTIMIZE_PAGE") {
    const key = String(message?.key || "");
    optimizeLargeStoragePage(key, { afterId: message?.afterId || "", limit: message?.limit })
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, key, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_STATS") {
    getLargeStorageStats()
      .then(stats => sendResponse({ ok: true, stats }))
      .catch(error => sendResponse({ ok: false, stats: {}, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_SET") {
    setLargeStorageValues(message?.values || {})
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_MERGE") {
    const key = String(message?.key || "");
    mergeLargeStorageEntries(key, message?.entries || {})
      .then(ok => sendResponse({ ok: !!ok, key }))
      .catch(error => sendResponse({ ok: false, key, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_LARGE_STORAGE_REMOVE") {
    const keys = largeStorageRequestedKeys(message?.keys ?? null);
    Promise.all(keys.map(clearLargeStorage))
      .then(() => sendResponse({ ok: true, keys }))
      .catch(error => sendResponse({ ok: false, keys, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_WORKER_HEARTBEAT") {
    const senderTabId = Number(sender?.tab?.id || 0);
    restoreBotStatusWorkerSession()
      .then(async () => {
        const accepted = noteBotStatusWorkerHeartbeat(senderTabId, message?.sessionId || "");
        if (accepted && senderTabId) {
          botStatusWorkerTabIds.add(senderTabId);
          if (!botStatusWorkerSessionId) {
            botStatusWorkerSessionId = String(message?.sessionId || createBotStatusWorkerSessionId());
            await rememberBotStatusWorker(senderTabId, !!botStatusWorkerOwned, botStatusWorkerSessionId);
          }
        }
        sendResponse({
          ok: accepted,
          worker: accepted ? "bot-status" : "",
          sessionId: accepted ? (botStatusWorkerSessionId || "") : "",
          heartbeatTtlMs: BOT_STATUS_WORKER_HEARTBEAT_TTL_MS,
          throttledTtlMs: BOT_STATUS_WORKER_THROTTLED_TTL_MS
        });
      })
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_RUN_EVENT") {
    const event = String(message.event || "bot-status-event").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "bot-status-event";
    recordHelperLifecycle(event, message.detail || {})
      .then(diag => sendResponse({ ok: true, event: diag?.lastEvent || event }))
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error || "") }));
    const tabId = Number(botStatusWorkerTabId || 0);
    if (tabId) tabsSendMessage(tabId, { type: "DS_BOT_STATUS_DIAG_EVENT", event, detail: message.detail || {} }).catch?.(() => null);
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_HELPER_PREPARE") {
    prepareBotStatusWorker({ forceOwnHelper: message?.forceOwnHelper !== false })
      .then(worker => sendResponse({
        ok: !!worker?.tabId && worker?.ready !== false,
        ready: worker?.ready !== false,
        tabId: Number(worker?.tabId || 0),
        owned: !!worker?.owned,
        sessionId: String(worker?.sessionId || botStatusWorkerSessionId || ""),
        status: worker?.status || (worker?.tabId ? "ready" : "worker-tab-failed")
      }))
      .catch(error => sendResponse({ ok: false, ready: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_HELPER_CHECK") {
    runBotStatusHelperCheck(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LOREBOOK_STATUS_HELPER_CHECK") {
    runLorebookStatusHelperCheck(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "unknown", httpStatus: 0, reason: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LOREBOOK_STATUS_PUBLIC_CHECK_BATCH") {
    checkPublicLorebookIndexBatch(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LOREBOOK_PUBLIC_RECOVERY_FETCH") {
    fetchPublicLorebookRecovery(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "entry-query-failed", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_BOT_STATUS_HELPER_RELEASE") {
    releaseBotStatusWorker()
      .then(released => sendResponse({ ok: true, released }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_DISLIKE_CANCEL_BULK") {
    sendResponse({ ok: markQuickDislikeBulkRunCanceled(message.bulkRunId) });
    return;
  }

  if (message?.type === "DS_QUICK_DISLIKE_RELEASE_BULK") {
    Promise.all([
      releaseQuickDislikeBulkWorker(message.bulkRunId),
      releaseQuickLessLikeBulkWorker(message.bulkRunId)
    ])
      .then(values => sendResponse({ ok: true, released: values.some(Boolean) }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_DISLIKE_BOT") {
    queueQuickDislikeBot(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_LESS_LIKE_CANCEL_BULK") {
    sendResponse({ ok: markQuickLessLikeBulkRunCanceled(message.bulkRunId) });
    return;
  }

  if (message?.type === "DS_QUICK_LESS_LIKE_RELEASE_BULK") {
    releaseQuickLessLikeBulkWorker(message.bulkRunId)
      .then(released => sendResponse({ ok: true, released }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_LESS_LIKE_PREPARE_BULK") {
    prepareQuickLessLikeBulkWorker(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "recommendation-worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_QUICK_LESS_LIKE_BOT") {
    queueQuickLessLikeBot({ ...message, sourceTabId: tabId })
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }


  if (message?.type === "DS_RANDOM_CHAT_PICK") {
    pickRandomChatCandidates(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "random-chat-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LISTING_REFILL_PAGE") {
    runListingRefillPageWorker({ ...message, sourceTabId: tabId })
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LISTING_REFILL_RELEASE") {
    releaseListingRefillPageWorker(message.runId)
      .then(released => sendResponse({ ok: true, released }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LISTING_REFILL_FAVORITE") {
    runListingRefillFavoriteWorker(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }


  if (message?.type === "DS_CONTEXT_WINDOW_NOTIFICATION") {
    (async () => {
      const allowed = await hasOptionalPermission("notifications");
      if (!allowed) { sendResponse({ ok: false, status: "permission-missing" }); return; }
      const percent = Math.min(100, Math.max(0, Number(message.percent) || 0));
      const used = Math.max(0, Number(message.used) || 0);
      const limit = Math.max(0, Number(message.limit) || 0);
      const delivered = await createBrowserNotification(`ds-context-window:${Date.now()}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: `SpicyChat context ${Math.round(percent)}% full`,
        message: `${Math.round(used).toLocaleString()} / ${Math.round(limit).toLocaleString()} tokens. Older RP messages may soon drop from the model's context.`
      });
      sendResponse({ ok: delivered });
    })().catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_CHAT_NUDGE_SYNC" || message?.type === "DS_CHAT_NUDGE_SCAN_NOW") {
    runChatNudgeScan()
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_CREATOR_BOT_SCAN_NOW") {
    queueCreatorBotScan({ force: true, reason: "manual" })
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_CREATOR_BOT_WEBHOOK_TEST") {
    sendCreatorBotDiscordWebhook(message.url, null, { test: true })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_PERSONA_RENDERED_SNAPSHOT") {
    runPersonaRenderedSnapshotWorker(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "worker-error", error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_FETCH_PERSONA_IMAGE_DATA_URL") {
    fetchPersonaImageDataUrl(message.url)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_AUTO_AFK_ACTIVITY") {
    (async () => {
      const settings = await getAutoAfkSettings();
      if (settings.enabled === false || (!settings.autoAfkEnabled && !settings.lowMemoryProtectionEnabled) || !tabId) {
        sendResponse({ ok: false });
        return;
      }

      // Auto-AFK is independent from PC Protection. Focus/open/blur/activity
      // updates are useful to the AFK clock whenever Auto-AFK itself is on.
      if (settings.autoAfkEnabled || settings.lowMemoryProtectionEnabled) {
        await markAutoAfkActivity(tabId);
      }
      if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(350);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "DS_AUTO_AFK_RUN_NOW") {
    runAutoAfkScan()
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }


  if (message?.type === "DS_DUPLICATE_TABS_RUN_NOW") {
    queueDuplicateTabScan({ focusExisting: false })
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_DIAGNOSTIC_COLLECT") {
    collectOpenSpicyChatTabDiagnostic()
      .then(report => sendResponse({ ok: true, report }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_DIAGNOSTIC_ENRICH_ONE") {
    enrichOpenBotMetadata(message.botId, { force: !!message.force })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_DIAGNOSTIC_WORKER_CLOSE") {
    closeTabCleanupWorker()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_DIAGNOSTIC_WORKER_FOCUS") {
    focusTabCleanupWorker()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_SESSION_REOPEN") {
    reopenTabSessionItems(message.items, String(message.mode || "current"))
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_SESSION_MATCH_OPEN") {
    matchOpenTabSessionItems(message.items, message.protectPinned !== false)
      .then(summary => sendResponse({ ok: true, ...summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_TAB_SESSION_CLOSE_MATCHES") {
    closeMatchedTabSessionItems(message.tabIds, message.protectPinned !== false)
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_OPTIONS_OPEN_COMMAND_PALETTE" || message?.type === "DS_OPTIONS_CLEAR_COMMAND_PALETTE") {
    getOptionsSourceTab().then(tab => {
      if (!tab?.id) { sendResponse({ ok: false, error: "No open SpicyChat source tab found." }); return; }
      const type = message.type === "DS_OPTIONS_OPEN_COMMAND_PALETTE" ? "DS_OPEN_COMMAND_PALETTE" : "DS_CLEAR_COMMAND_PALETTE_HISTORY";
      chrome.tabs.sendMessage(tab.id, { type, query: String(message.query || "") }, response => {
        if (chrome.runtime.lastError) sendResponse({ ok: false, error: chrome.runtime.lastError.message || "Could not reach the SpicyChat tab." });
        else sendResponse(response || { ok: true });
      });
    });
    return true;
  }

  if (message?.type === "DS_OPTIONS_GET_QUICK_PANEL_TAB_STATE") {
    relayQuickPanelStateToOptions({ type: "DS_GET_QUICK_PANEL_TAB_STATE" })
      .then(sendResponse);
    return true;
  }

  if (message?.type === "DS_OPTIONS_SET_QUICK_PANEL_TAB_STATE") {
    relayQuickPanelStateToOptions({
      type: "DS_SET_QUICK_PANEL_TAB_STATE",
      enabled: !!message.enabled
    }).then(sendResponse);
    return true;
  }


  if (message?.type === "DS_QOL_TRANSLATE" && message.provider === "libre") {
    libreTranslate(message)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_DEEPL_TRANSLATE_BATCH") {
    deeplTranslateBatch(message)
      .then(translations => sendResponse({ ok: true, translations }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_DEEPL_TRANSLATE") {
    deeplTranslate(message)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_DEEPL_TEST") {
    deeplRequest("/v2/usage")
      .then(data => sendResponse({
        ok: true,
        characterCount: Number(data.character_count || 0),
        characterLimit: Number(data.character_limit || 0)
      }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_DEEPL_USAGE") {
    deeplRequest("/v2/usage")
      .then(data => sendResponse({
        ok: true,
        characterCount: Number(data.character_count || 0),
        characterLimit: Number(data.character_limit || 0)
      }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_GET_SPICYCHAT_TAB_SUMMARY") {
    getSpicyChatTabSummary()
      .then(summary => sendResponse({ ok: true, summary }))
      .catch(error => sendResponse({ ok: false, summary: null, error: String(error?.message || error || "") }));
    return true;
  }

  if (message?.type === "DS_GET_DIAGNOSTIC_CONTEXT") {
    getReachableDiagnosticContext().then(sendResponse).catch(() => sendResponse({ ok: false, runtimeAvailable: false, url: "", title: "", pageDiagnostics: null }));
    return true;
  }

  if (message?.type === "DS_RECOVER_OPTIONS_SOURCE_PAGE" || message?.type === "DS_CLEAR_PAGE_RUNTIME_LOG") {
    getOptionsSourceTab().then(tab => {
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No open SpicyChat tab found." });
        return;
      }
      const pageType = message.type === "DS_CLEAR_PAGE_RUNTIME_LOG" ? "DS_CLEAR_RUNTIME_LOG" : "DS_RECOVER_CURRENT_PAGE";
      try {
        chrome.tabs.sendMessage(tab.id, { type: pageType }, response => {
          if (chrome.runtime.lastError) {
            if (message.type === "DS_RECOVER_OPTIONS_SOURCE_PAGE") {
              chrome.tabs.reload(tab.id, {}, () => {
                const reloadError = chrome.runtime.lastError?.message || "";
                sendResponse(reloadError
                  ? { ok: false, error: reloadError }
                  : { ok: true, reloaded: true, status: "source-tab-reloaded" });
              });
              return;
            }
            sendResponse({ ok: false, error: chrome.runtime.lastError.message || "Could not reach the SpicyChat tab." });
            return;
          }
          sendResponse({ ok: response?.ok !== false, ...(response || {}) });
        });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    });
    return true;
  }

  if (message?.type === "DS_OPEN_OPTIONS_CHANGELOG") {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html#changelog") }, tab => {
      sendResponse({ ok: !!tab && !chrome.runtime.lastError });
    });
    return true;
  }

  if (message?.type === "DS_OPEN_OPTIONS_FROM_POPUP") {
    rememberOptionsSourceTab(Number(message.tabId)).catch(() => {});
    chrome.runtime.openOptionsPage(() => {
      sendResponse({ ok: !chrome.runtime.lastError });
    });
    return true;
  }

  if (message?.type === "DS_OPEN_OPTIONS_TARGET") {
    const sourceTabId = Number(message.tabId || tabId || 0);
    rememberOptionsSourceTab(sourceTabId).catch(() => {});
    const target = String(message.target || "general").replace(/[^a-z0-9-]/gi, "") || "general";
    const query = String(message.query || "").trim().slice(0, 180);
    const url = chrome.runtime.getURL(`options.html${query ? `?search=${encodeURIComponent(query)}` : ""}#${target}`);
    chrome.tabs.create({ url }, created => {
      if (created && !chrome.runtime.lastError) {
        sendResponse({ ok: true });
        return;
      }
      chrome.runtime.openOptionsPage(() => sendResponse({ ok: !chrome.runtime.lastError }));
    });
    return true;
  }

  if (message?.type === "DS_OPEN_OPTIONS") {
    rememberOptionsSourceTab(tabId).catch(() => {});
    const url = chrome.runtime.getURL("options.html#general");
    chrome.tabs.create({ url }, created => {
      if (created && !chrome.runtime.lastError) { sendResponse({ ok: true }); return; }
      chrome.runtime.openOptionsPage(() => sendResponse({ ok: !chrome.runtime.lastError }));
    });
    return true;
  }

  if (message?.type === "DS_CLOSE_CURRENT_TAB") {
    if (!tabId) {
      sendResponse({ ok: false });
      return false;
    }

    chrome.tabs.remove(tabId, () => {
      sendResponse({ ok: !chrome.runtime.lastError });
    });

    return true;
  }

  if (message?.type === "DS_BACKGROUND_JOB_ACQUIRE") {
    acquireBackgroundJob(message.jobType, {
      ownerTabId: tabId,
      detail: message.detail,
      maxHoldMs: message.maxHoldMs
    }).then(sendResponse).catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_BACKGROUND_JOB_RELEASE") {
    sendResponse({ ok: releaseBackgroundJob(message.leaseId) });
    return false;
  }

  if (message?.type === "DS_QUICK_LESS_LIKE_CLIENT_TIMING" || message?.type === "DS_QUICK_LESS_LIKE_RUN_TIMING") {
    const targetTabId = Number(message?.feedbackTabId || message?.tabId || 0);
    if (!targetTabId) {
      sendResponse({ ok: false, status: "missing-target-tab" });
      return false;
    }
    const forwardType = message.type === "DS_QUICK_LESS_LIKE_RUN_TIMING"
      ? "DS_QUICK_LESS_LIKE_RUN_TIMING"
      : "DS_QUICK_LESS_LIKE_TIMING";
    tabsSendMessage(targetTabId, {
      type: forwardType,
      botId: String(message?.botId || ""),
      runId: String(message?.runId || ""),
      phase: String(message?.phase || ""),
      timing: message?.timing && typeof message.timing === "object" ? message.timing : {},
      meta: message?.meta && typeof message.meta === "object" ? message.meta : {}
    }).then(response => sendResponse({ ok: !!response?.ok, response })).catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "DS_LOAD_ALL_CHATS_START") {
    scheduleLoadStep(tabId);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "DS_LOAD_ALL_CHATS_STOP") {
    stopLoader(tabId);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "DS_LOAD_ALL_CHATS_RESCHEDULE") {
    scheduleLoadStep(tabId);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "DS_LOAD_ALL_CHATS_DONE") {
    stopLoader(tabId);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === AUTO_AFK_ALARM) {
    runAutoAfkScan();
    return;
  }

  if (alarm.name === CHAT_NUDGE_ALARM) {
    runChatNudgeScan();
    return;
  }

  if (alarm.name === CREATOR_BOT_WATCH_ALARM) {
    queueCreatorBotScan({ force: false, reason: "alarm" });
    return;
  }

  if (alarm.name === LISTING_REFILL_GC_ALARM) {
    cleanupStaleListingRefillWorkers({ closeLegacy: true });
    return;
  }

  if (alarm.name === QUICK_DISLIKE_GC_ALARM) {
    cleanupStaleQuickDislikeWorkers();
    return;
  }

  if (alarm.name === HELPER_SESSION_GRACE_ALARM) {
    cleanupPriorHelperSessionTabs();
    return;
  }

  const tabId = tabIdFromAlarm(alarm.name);

  if (!tabId || !activeLoaders.has(tabId)) return;

  chrome.tabs.sendMessage(
    tabId,
    { type: "DS_LOAD_ALL_CHATS_STEP" },
    response => {
      if (chrome.runtime.lastError) {
        stopLoader(tabId);
        return;
      }

      if (response?.running) {
        scheduleLoadStep(tabId);
      } else {
        stopLoader(tabId);
      }
    }
  );
});

if (chrome.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener(notificationId => {
    const id = String(notificationId || "");
    let botId = "";

    if (id.startsWith("ds-chat-nudge:")) {
      const parts = id.split(":");
      botId = decodeURIComponent(parts[1] || "");
    } else if (id.startsWith("ds-creator-bot:")) {
      botId = decodeURIComponent(id.slice("ds-creator-bot:".length));
    } else {
      return;
    }

    if (!botId) return;
    chrome.tabs.create({ url: `https://spicychat.ai/chat/${encodeURIComponent(botId)}` }, () => void chrome.runtime.lastError);
    try { chrome.notifications.clear(notificationId, () => void chrome.runtime.lastError); } catch {}
  });
}

chrome.tabs.onActivated.addListener(async activeInfo => {
  const settings = await getAutoAfkSettings();
  const tab = await tabsGet(activeInfo.tabId);
  if (!tab || !isSpicyChatUrl(tab.url) || isDedicatedWorkerTab(tab)) return;

  // After a QoL update, inactive SpicyChat pages still contain the previous
  // content-script runtime. The first time one becomes the active tab, reload
  // it once so the current version attaches automatically. This is separate
  // from PC Protection and Auto-AFK and is guarded per tab+version.
  if (settings.enabled !== false && await maybeAutoReloadStaleActiveTab(tab, "tab-activated")) return;
  if (settings.enabled === false) return;

  if (settings.lowMemoryProtectionEnabled) markLowMemoryWakeGrace(tab.id);

  // Auto-AFK is fundamentally "not focused for X time". Selecting a
  // SpicyChat tab always refreshes its own AFK timestamp, regardless of PC
  // Protection. PC Protection merely reuses the same timestamp for LRU order.
  if (settings.autoAfkEnabled || settings.lowMemoryProtectionEnabled) {
    await markAutoAfkActivity(tab.id);
  }
  if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(250);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (quickLessLikeWorkerTabIds.has(Number(tabId)) && (changeInfo.url || changeInfo.status === "loading")) {
    quickLessLikeReadyWorkerTabs.delete(Number(tabId));
  }
  const spicyUrl = tab?.url || changeInfo.url || tab?.pendingUrl;
  if (!isSpicyChatUrl(spicyUrl)) return;
  if (botStatusWorkerTabIds.has(Number(tabId))) {
    // The query parameter is bootstrap-only. SpicyChat's Home router is free to
    // replace the URL; the tab/session/heartbeat remain the worker identity.
    // Never navigate the helper back to the marker URL just because it vanished.
    return;
  }
  if (quickDislikeWorkerTabIds.has(Number(tabId)) || quickLessLikeWorkerTabIds.has(Number(tabId)) || botStatusWorkerTabIds.has(Number(tabId)) || listingRefillWorkerTabIds.has(Number(tabId)) || personaRefreshWorkerTabIds.has(Number(tabId)) || isQuickDislikeWorkerUrl(spicyUrl) || isQuickLessLikeWorkerUrl(spicyUrl) || isBotStatusWorkerUrl(spicyUrl) || isListingRefillWorkerUrl(spicyUrl) || isPersonaRefreshWorkerUrl(spicyUrl)) return;

  // A real page load after an extension update receives the current content
  // scripts again, so its stale-runtime warning can be cleared safely.
  if (changeInfo.status === "complete") {
    setTimeout(() => verifyOneSpicyTabRuntime(tabId).catch(() => {}), 900);
  }

  if (changeInfo.url) {
    const duplicateSettings = await getDuplicateTabSettings();
    if (duplicateSettings.enabled !== false && duplicateSettings.duplicateTabGuardEnabled) {
      queueDuplicateTabScan({ initiatorTabId: tabId, focusExisting: !!tab?.active });
    }
  }

  const settings = await getAutoAfkSettings();
  if (settings.enabled === false) return;
  if (settings.lowMemoryProtectionEnabled && (changeInfo.discarded === false || (changeInfo.status === "complete" && tab?.active))) {
    markLowMemoryWakeGrace(tabId);
  }

  // A URL change means a new normal SpicyChat page was opened in this tab.
  if ((settings.autoAfkEnabled || settings.lowMemoryProtectionEnabled) &&
      (changeInfo.url || (changeInfo.status === "complete" && tab?.active))) {
    await markAutoAfkActivity(tabId);
  }
  if (settings.lowMemoryProtectionEnabled && (changeInfo.url || changeInfo.status === "complete")) {
    scheduleLowMemoryProtectionScan(tab?.active ? 250 : 700);
  }
});

chrome.tabs.onCreated.addListener(tab => {
  if (!tab?.id || !isSpicyChatUrl(tab.url || tab.pendingUrl)) return;
  if (isQuickDislikeWorkerUrl(tab.url || tab.pendingUrl)) {
    quickDislikeWorkerTabIds.add(Number(tab.id));
    return;
  }
  if (isQuickLessLikeWorkerUrl(tab.url || tab.pendingUrl)) {
    quickLessLikeWorkerTabIds.add(Number(tab.id));
    return;
  }
  if (isBotStatusWorkerUrl(tab.url || tab.pendingUrl)) {
    botStatusWorkerTabIds.add(Number(tab.id));
    botStatusWorkerTabId = Number(tab.id);
    return;
  }
  if (isListingRefillWorkerUrl(tab.url || tab.pendingUrl)) {
    listingRefillWorkerTabIds.add(Number(tab.id));
    return;
  }
  if (isPersonaRefreshWorkerUrl(tab.url || tab.pendingUrl)) {
    personaRefreshWorkerTabIds.add(Number(tab.id));
    return;
  }

  getDuplicateTabSettings().then(settings => {
    if (settings.enabled !== false && settings.duplicateTabGuardEnabled) {
      queueDuplicateTabScan({ initiatorTabId: tab.id, focusExisting: !!tab.active });
    }
  });

  getAutoAfkSettings().then(settings => {
    if (settings.enabled === false) return;
    if (settings.autoAfkEnabled || settings.lowMemoryProtectionEnabled) {
      markAutoAfkActivity(tab.id);
    }
    if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(500);
  });
});

chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  getAutoAfkSettings().then(async settings => {
    if (settings.enabled === false) return;
    const tabs = await tabsQuery({ active: true, windowId });
    const tab = tabs[0];
    if (tab?.id && isSpicyChatUrl(tab.url) && !isDedicatedWorkerTab(tab)) {
      if (settings.autoAfkEnabled || settings.lowMemoryProtectionEnabled) {
        await markAutoAfkActivity(tab.id);
      }
      if (settings.lowMemoryProtectionEnabled) scheduleLowMemoryProtectionScan(250);
    }
  });
});

chrome.tabs.onRemoved.addListener(tabId => {
  qolDiagnosticSubscribers.delete(Number(tabId));
  lowMemoryWakeGraceUntil.delete(Number(tabId));
  clearStaleRuntimeTab(tabId).catch(() => {});
  // Close any refill helper that belongs to a source tab the user just closed.
  for (const [runId, sourceTabId] of [...listingRefillSourceTabs.entries()]) {
    if (Number(sourceTabId) !== Number(tabId)) continue;
    listingRefillSourceTabs.delete(runId);
    releaseListingRefillPageWorker(runId).catch(() => {});
  }

  if (Number(tabId) === Number(tabCleanupWorkerTabId)) tabCleanupWorkerTabId = null;
  tabCleanupWorkerTabIds.delete(Number(tabId));
  quickDislikeWorkerTabIds.delete(Number(tabId));
  if (Number(quickDislikePersistentWorkerTabId) === Number(tabId)) quickDislikePersistentWorkerTabId = null;
  for (const [runId, workerTabId] of quickDislikeBulkWorkerTabs.entries()) {
    if (Number(workerTabId) === Number(tabId)) quickDislikeBulkWorkerTabs.delete(runId);
  }
  quickLessLikeWorkerTabIds.delete(Number(tabId));
  quickLessLikeReadyWorkerTabs.delete(Number(tabId));
  if (Number(quickLessLikePersistentWorkerTabId) === Number(tabId)) {
    quickLessLikePersistentWorkerTabId = null;
    storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: 0 }).catch(() => {});
  }
  const removedBotStatusWorker = botStatusWorkerTabIds.has(Number(tabId)) || Number(botStatusWorkerTabId) === Number(tabId);
  const expectedBotStatusClose = botStatusWorkerExpectedCloseIds.delete(Number(tabId));
  botStatusWorkerTabIds.delete(Number(tabId));
  if (Number(botStatusWorkerTabId) === Number(tabId)) {
    botStatusWorkerTabId = null;
    botStatusWorkerOwned = false;
    botStatusWorkerHeartbeatAt = 0;
    botStatusWorkerSessionId = "";
    rememberBotStatusWorker(0, false, "").catch(() => {});
  }
  if (removedBotStatusWorker && !expectedBotStatusClose) recordHelperLifecycle("bot-status-worker-lost", { tabId: Number(tabId), reason: "tab-closed-unexpected" }).catch(() => {});
  for (const [runId, workerTabId] of quickLessLikeBulkWorkerTabs.entries()) {
    if (Number(workerTabId) === Number(tabId)) {
      quickLessLikeBulkWorkerTabs.delete(runId);
      quickLessLikeClosedBulkRuns.set(String(runId), Date.now());
    }
  }
  for (const [runId, directTabId] of quickLessLikeDirectBulkTabs.entries()) {
    if (Number(directTabId) === Number(tabId)) quickLessLikeDirectBulkTabs.delete(runId);
  }
  listingRefillWorkerTabIds.delete(Number(tabId));
  for (const [runId, workerTabId] of listingRefillPageWorkerTabs.entries()) {
    if (Number(workerTabId) === Number(tabId)) listingRefillPageWorkerTabs.delete(runId);
  }
  personaRefreshWorkerTabIds.delete(Number(tabId));
  removeAutoAfkActivity(tabId);
  storageGet([OPTIONS_SOURCE_TAB_KEY]).then(result => {
    if (Number(result[OPTIONS_SOURCE_TAB_KEY]) === Number(tabId)) {
      chrome.storage.local.remove(OPTIONS_SOURCE_TAB_KEY);
    }
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[QUICK_DISLIKE_HISTORY_KEY]) {
    recommendationFeedbackQuickDislikeCache = normalizeQuickDislikeHistory(changes[QUICK_DISLIKE_HISTORY_KEY].newValue);
  }
  // The Less Like bulk journal changes after every confirmed action, so do not
  // invalidate the cross-feedback cache for journal-only writes. A main-history
  // change (including a user reset) invalidates it; the next lookup rehydrates
  // main history + any still-pending journal entries exactly once.
  if (changes[QUICK_LESS_LIKE_HISTORY_KEY]) recommendationFeedbackQuickLessLikeCache = null;
  if (changes[CHAT_NUDGE_STORE_KEY]) runChatNudgeScan();

  if (changes[FOLLOWED_CREATORS_KEY]) {
    const beforeFollowed = normalizeFollowedCreatorStore(changes[FOLLOWED_CREATORS_KEY].oldValue);
    const afterFollowed = normalizeFollowedCreatorStore(changes[FOLLOWED_CREATORS_KEY].newValue);
    const beforeSet = new Set(beforeFollowed.handles);
    const added = afterFollowed.handles.filter(handle => !beforeSet.has(handle));
    if (added.length) queueCreatorBotScan({ force: true, handles: added, reason: "followed-added" });
  }

  const granularChanges = Object.entries(changes || {})
    .map(([key, change]) => [settingNameFromStorageKey(key), change])
    .filter(([name]) => !!name);
  if (!changes.settings && !granularChanges.length) return;

  (async () => {
    let beforeSettings = {};
    let afterSettings = {};
    if (changes.settings) {
      beforeSettings = changes.settings.oldValue || {};
      afterSettings = changes.settings.newValue || {};
    } else {
      afterSettings = (await storageGet(["settings"])).settings || {};
      beforeSettings = { ...afterSettings };
      for (const [name, change] of granularChanges) {
        if (change?.oldValue === undefined) delete beforeSettings[name];
        else beforeSettings[name] = change.oldValue;
      }
    }

    const before = { ...AUTO_AFK_DEFAULTS, ...beforeSettings };
    const after = { ...AUTO_AFK_DEFAULTS, ...afterSettings };
    const justEnabled = (!before.autoAfkEnabled && !!after.autoAfkEnabled) ||
      (!before.lowMemoryProtectionEnabled && !!after.lowMemoryProtectionEnabled);
    configureAutoAfkAlarm(justEnabled);

    const duplicateBefore = { ...DUPLICATE_TAB_DEFAULTS, ...beforeSettings };
    const duplicateAfter = { ...DUPLICATE_TAB_DEFAULTS, ...afterSettings };
    const duplicateJustEnabled = !duplicateBefore.duplicateTabGuardEnabled && !!duplicateAfter.duplicateTabGuardEnabled;
    if (duplicateAfter.enabled !== false && duplicateAfter.duplicateTabGuardEnabled && duplicateJustEnabled) {
      queueDuplicateTabScan({ focusExisting: false });
    }

    const nudgeJustEnabled = !before.enableChatNudges && !!after.enableChatNudges;
    if (nudgeJustEnabled) runChatNudgeScan();
    configureChatNudgeAlarm(nudgeJustEnabled);

    const creatorWatchJustEnabled = !before.enableCreatorBotNotifications && !!after.enableCreatorBotNotifications;
    const creatorWatchIntervalChanged = Number(before.creatorBotCheckMinutes || 60) !== Number(after.creatorBotCheckMinutes || 60);
    if (creatorWatchJustEnabled) queueCreatorBotScan({ force: true, reason: "enabled" });
    if (creatorWatchJustEnabled || creatorWatchIntervalChanged || before.enabled !== after.enabled) {
      configureCreatorBotWatchAlarm(creatorWatchJustEnabled);
    }
  })().catch(() => {});
});

chrome.runtime.onInstalled.addListener(details => {
  rememberReleaseNotice(details)
    .catch(() => {})
    .finally(() => {
      if (details?.reason === "install") {
        try {
          chrome.storage.local.set({ dsFirstRunSetupPendingV1: true, dsFirstRunSetupCompletedV1: false, dsFirstRunOptInDefaultsAppliedV1: false }, () => {
            chrome.runtime.openOptionsPage(() => void chrome.runtime.lastError);
          });
        } catch {
          chrome.runtime.openOptionsPage(() => void chrome.runtime.lastError);
        }
      }
    });
  if (details?.reason === "update") {
    // Existing content scripts keep running the old extension context until the
    // site reloads. Mark all normal SpicyChat tabs stale, then reload only the
    // currently focused active one. Other stale tabs reload once when the user
    // activates them later. The per-tab+version guard prevents reload loops.
    markOpenSpicyTabsStaleAfterUpdate(
      chrome.runtime.getManifest?.().version || "",
      details?.previousVersion || ""
    ).then(async () => {
      const settings = await getAutoAfkSettings();
      if (settings.enabled !== false) await autoReloadFocusedStaleTab("extension-update");
    }).catch(() => {});
  }
  syncAutoAfkTabs().finally(() => configureAutoAfkAlarm(false));
  getDuplicateTabSettings().then(settings => {
    if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
  });
  configureChatNudgeAlarm(true);
  configureCreatorBotWatchAlarm(true);
  initializeHelperLifecycleRecovery();
});

chrome.runtime.onStartup.addListener(() => {
  syncAutoAfkTabs().finally(() => configureAutoAfkAlarm(false));
  // Restored/pinned tabs can occasionally survive browser startup without the
  // current content runtime. Detect that case passively and show a reload badge
  // instead of pretending QoL is active or forcing a page reload.
  setTimeout(() => verifyOpenSpicyTabRuntimes().catch(() => {}), 4500);
  getDuplicateTabSettings().then(settings => {
    if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
  });
  configureChatNudgeAlarm(true);
  configureCreatorBotWatchAlarm(false).finally(() => queueCreatorBotScan({ force: false, reason: "startup" }));
  initializeHelperLifecycleRecovery();
});

configureAutoAfkAlarm(false);
getDuplicateTabSettings().then(settings => {
  if (settings.enabled !== false && settings.duplicateTabGuardEnabled) queueDuplicateTabScan({ focusExisting: false });
});
configureChatNudgeAlarm(false);
configureCreatorBotWatchAlarm(false);
initializeHelperLifecycleRecovery();

// v0.2.25 account/device sync is intentionally isolated from the large
// background worker coordinator. Keep it in its own file, but load it from the
// canonical background.js because the release builder pins this entry point for
// both Chromium and Firefox packages. Chromium runs a service worker; Firefox's
// generated manifest may run a background page instead, so support both loaders.
try {
  if (typeof importScripts === "function") {
    importScripts("shared/sync-service.js");
  } else if (typeof document !== "undefined") {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("shared/sync-service.js");
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }
} catch (error) {
  console.warn("[SpicyChat QoL] Sync service failed to load", error);
}
