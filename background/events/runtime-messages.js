"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundRuntimeMessages() {
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
}
