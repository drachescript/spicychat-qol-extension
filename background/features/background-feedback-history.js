"use strict";

// Feature-owned background helpers: feedback-history. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeQuickDislikeHistory(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bots = source.bots && typeof source.bots === "object" ? source.bots : {};
  const normalized = {};
  for (const [id, value] of Object.entries(bots)) {
    if (!/^[0-9a-f-]{20,}$/i.test(String(id || ""))) continue;
    const status = String(value?.status || "");
    if (!["disliked", "already-disliked", "already-rated-or-unavailable", "unavailable-private-or-deleted", "unavailable-creator-blocked"].includes(status)) continue;
    normalized[id] = {
      status,
      name: String(value?.name || "").slice(0, 160),
      handledAt: Number(value?.handledAt || value?.at || 0) || Date.now(),
      crossHandledBy: value?.crossHandledBy === "less-like" ? "less-like" : "",
      ratingSource: ["dislike", "less-like"].includes(value?.ratingSource) ? value.ratingSource : "",
      ratingAt: Number(value?.ratingAt || 0) || 0,
      requestSent: value?.requestSent === true
    };
  }
  return { version: 1, bots: normalized };
}

async function getQuickDislikeHistory() {
  if (recommendationFeedbackQuickDislikeCache) return recommendationFeedbackQuickDislikeCache;
  const result = await storageGet([QUICK_DISLIKE_HISTORY_KEY]);
  recommendationFeedbackQuickDislikeCache = normalizeQuickDislikeHistory(result[QUICK_DISLIKE_HISTORY_KEY]);
  return recommendationFeedbackQuickDislikeCache;
}

async function rememberQuickDislike(botId, botName, status, origin = {}) {
  if (!["disliked", "already-disliked", "already-rated-or-unavailable", "unavailable-private-or-deleted", "unavailable-creator-blocked"].includes(status)) return null;
  const history = await getQuickDislikeHistory();
  history.bots[botId] = {
    status,
    name: String(botName || history.bots[botId]?.name || "").slice(0, 160),
    handledAt: Date.now(),
    crossHandledBy: origin.crossHandledBy === "less-like" ? "less-like" : "",
    ratingSource: origin.ratingSource === "less-like" ? "less-like" : (status === "disliked" ? "dislike" : ""),
    ratingAt: Number(origin.ratingAt || 0) || (status === "disliked" ? Date.now() : 0),
    requestSent: status === "disliked" && origin.requestSent === true
  };

  // Keep this local ledger bounded even for very old installations.
  const entries = Object.entries(history.bots);
  if (entries.length > 5000) {
    entries
      .sort((a, b) => Number(b[1]?.handledAt || 0) - Number(a[1]?.handledAt || 0))
      .slice(5000)
      .forEach(([id]) => delete history.bots[id]);
  }

  await storageSet({ [QUICK_DISLIKE_HISTORY_KEY]: history });
  return history.bots[botId];
}

function normalizeQuickLessLikeHistory(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bots = source.bots && typeof source.bots === "object" ? source.bots : {};
  const normalized = {};
  for (const [id, value] of Object.entries(bots)) {
    if (!/^[0-9a-f-]{20,}$/i.test(String(id || ""))) continue;
    const status = String(value?.status || "");
    if (!["less-liked", "unavailable"].includes(status)) continue;
    normalized[id] = {
      status,
      name: String(value?.name || "").slice(0, 160),
      handledAt: Number(value?.handledAt || value?.at || 0) || Date.now(),
      stage: String(value?.stage || "").slice(0, 80),
      reason: String(value?.reason || "").slice(0, 300),
      httpStatus: Number(value?.httpStatus || 0) || 0
    };
  }
  return { version: 1, bots: normalized };
}

function normalizeQuickLessLikePending(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bots = source.bots && typeof source.bots === "object" ? source.bots : {};
  return { version: 1, bots: { ...bots } };
}

function trimQuickLessLikeHistory(history) {
  const entries = Object.entries(history?.bots || {});
  if (entries.length > 5000) {
    entries
      .sort((a, b) => Number(b[1]?.handledAt || 0) - Number(a[1]?.handledAt || 0))
      .slice(5000)
      .forEach(([id]) => delete history.bots[id]);
  }
  return history;
}

async function readQuickLessLikeHistoryFromStorage() {
  const result = await storageGet([QUICK_LESS_LIKE_HISTORY_KEY, QUICK_LESS_LIKE_PENDING_KEY]);
  const history = normalizeQuickLessLikeHistory(result[QUICK_LESS_LIKE_HISTORY_KEY]);
  const pending = normalizeQuickLessLikePending(result[QUICK_LESS_LIKE_PENDING_KEY]);
  for (const [id, value] of Object.entries(pending.bots || {})) {
    if (!/^[0-9a-f-]{20,}$/i.test(String(id || ""))) continue;
    const status = String(value?.status || "");
    if (!["less-liked", "unavailable"].includes(status)) continue;
    history.bots[id] = {
      status,
      name: String(value?.name || history.bots[id]?.name || "").slice(0, 160),
      handledAt: Number(value?.handledAt || 0) || Date.now(),
      stage: String(value?.stage || "").slice(0, 80),
      reason: String(value?.reason || "").slice(0, 300),
      httpStatus: Number(value?.httpStatus || 0) || 0
    };
  }
  return { history: trimQuickLessLikeHistory(history), pending };
}

async function getQuickLessLikeCrossHistory() {
  if (recommendationFeedbackQuickLessLikeCache) return recommendationFeedbackQuickLessLikeCache;
  const loaded = await readQuickLessLikeHistoryFromStorage();
  recommendationFeedbackQuickLessLikeCache = loaded.history;
  return recommendationFeedbackQuickLessLikeCache;
}

async function getQuickLessLikeHistory(runId = "") {
  const id = String(runId || "").trim();
  if (id && quickLessLikeHistoryCacheRunId === id && quickLessLikeHistoryCache) {
    return quickLessLikeHistoryCache;
  }
  const loaded = await readQuickLessLikeHistoryFromStorage();
  if (id) {
    quickLessLikeHistoryCacheRunId = id;
    quickLessLikeHistoryCache = loaded.history;
    quickLessLikePendingCache = loaded.pending;
    quickLessLikeHistoryLastFlushAt = Date.now();
  }
  return loaded.history;
}

async function flushQuickLessLikeHistory(force = false, runId = "") {
  const id = String(runId || quickLessLikeHistoryCacheRunId || "").trim();
  if (!id || quickLessLikeHistoryCacheRunId !== id || !quickLessLikeHistoryCache) return true;
  const pending = quickLessLikePendingCache || { version: 1, bots: {} };
  const pendingCount = Object.keys(pending.bots || {}).length;
  if (!pendingCount) return true;
  const ageMs = quickLessLikeHistoryLastFlushAt ? Date.now() - quickLessLikeHistoryLastFlushAt : Infinity;
  if (!force && pendingCount < QUICK_LESS_LIKE_HISTORY_FLUSH_EVERY && ageMs < QUICK_LESS_LIKE_HISTORY_FLUSH_MAX_AGE_MS) return false;
  trimQuickLessLikeHistory(quickLessLikeHistoryCache);
  await storageSet({
    [QUICK_LESS_LIKE_HISTORY_KEY]: quickLessLikeHistoryCache,
    [QUICK_LESS_LIKE_PENDING_KEY]: { version: 1, bots: {} }
  });
  quickLessLikePendingCache = { version: 1, bots: {} };
  quickLessLikeHistoryLastFlushAt = Date.now();
  return true;
}

async function rememberQuickLessLikeEntry(botId, entry, { immediate = false, runId = "" } = {}) {
  const id = String(runId || "").trim();
  if (!id) {
    const loaded = await readQuickLessLikeHistoryFromStorage();
    loaded.history.bots[botId] = entry;
    trimQuickLessLikeHistory(loaded.history);
    recommendationFeedbackQuickLessLikeCache = loaded.history;
    await storageSet({
      [QUICK_LESS_LIKE_HISTORY_KEY]: loaded.history,
      [QUICK_LESS_LIKE_PENDING_KEY]: { version: 1, bots: {} }
    });
    return loaded.history.bots[botId];
  }

  const history = await getQuickLessLikeHistory(id);
  const pending = quickLessLikePendingCache || (quickLessLikePendingCache = { version: 1, bots: {} });
  history.bots[botId] = entry;
  pending.bots[botId] = entry;
  trimQuickLessLikeHistory(history);
  recommendationFeedbackQuickLessLikeCache = history;
  // Persist the compact success journal before returning so an interrupted run
  // cannot repeat a known-successful rating. Full multi-thousand-entry history
  // compaction is deferred to a large/time-based checkpoint and run end.
  await storageSet({ [QUICK_LESS_LIKE_PENDING_KEY]: pending });
  await flushQuickLessLikeHistory(immediate, id);
  return history.bots[botId];
}

async function rememberQuickLessLike(botId, botName, options = {}) {
  const history = await getQuickLessLikeHistory(options?.runId || "");
  return rememberQuickLessLikeEntry(botId, {
    status: "less-liked",
    name: String(botName || history.bots[botId]?.name || "").slice(0, 160),
    handledAt: Date.now()
  }, options);
}

async function rememberQuickLessLikeUnavailable(botId, botName, result = {}, options = {}) {
  const history = await getQuickLessLikeHistory(options?.runId || "");
  return rememberQuickLessLikeEntry(botId, {
    status: "unavailable",
    name: String(botName || history.bots[botId]?.name || "").slice(0, 160),
    handledAt: Date.now(),
    stage: String(result?.stage || "response").slice(0, 80),
    reason: String(result?.reason || "Character was not found while sending Less Like feedback.").slice(0, 300),
    httpStatus: Number(result?.httpStatus || 0) || 0
  }, options);
}

// A previously unavailable bot can recover. A later *confirmed available*
// Bot Status result is the only reason to retry a previously skipped 404.
async function feedbackUnavailableSuperseded(botId, handledAt) {
  const previousAt = Number(handledAt || 0);
  if (!previousAt) return false;
  try {
    const stored = await storageGet(["botAvailability"]);
    const result = stored?.botAvailability?.meta?.[botId];
    return result?.status === "available" && Number(result.checkedAt || 0) > previousAt;
  } catch { return false; } // Preserve previous dedupe when storage is unavailable.
}

async function completedRecommendationFeedbackForBot(botId, targetMode = "") {
  const id = String(botId || "").trim().toLowerCase();
  if (!id) return null;
  const mode = String(targetMode || "").trim();

  if (mode !== "less-like") {
    const lessLike = await getQuickLessLikeCrossHistory();
    const entry = lessLike?.bots?.[id];
    if (entry?.status === "less-liked") {
      return {
        source: "less-like",
        status: "less-liked",
        handledAt: Number(entry.handledAt || 0) || 0,
        name: String(entry.name || ""),
        stage: String(entry.stage || "")
      };
    }
  }

  if (mode !== "dislike") {
    const dislike = await getQuickDislikeHistory();
    const entry = dislike?.bots?.[id];
    if (["disliked", "already-disliked"].includes(String(entry?.status || ""))) {
      return {
        source: "dislike",
        status: String(entry.status || ""),
        handledAt: Number(entry.handledAt || 0) || 0,
        name: String(entry.name || "")
      };
    }
  }

  return null;
}

function queueRecommendationFeedbackForBot(botId, task) {
  const id = String(botId || "").trim().toLowerCase();
  if (!id || typeof task !== "function") return Promise.resolve().then(task);
  const prior = recommendationFeedbackBotChains.get(id) || Promise.resolve();
  const current = prior.catch(() => {}).then(task);
  recommendationFeedbackBotChains.set(id, current);
  current.finally(() => {
    if (recommendationFeedbackBotChains.get(id) === current) recommendationFeedbackBotChains.delete(id);
  }).catch(() => {});
  return current;
}

function makeQuickDislikeJobId(botId) {
  return `qd-${String(botId || "").slice(0, 12)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function quickDislikeWorkerTabs() {
  const tabs = await tabsQuery({});
  return tabs.filter(tab => tab?.id && isQuickDislikeWorkerUrl(tab.url || tab.pendingUrl || ""));
}

async function closeQuickDislikeTab(tabId, event = "quickDislikeOrphanClosed", detail = {}) {
  const id = Number(tabId);
  if (!Number.isFinite(id)) return false;
  const result = await tabsRemove(id);
  quickDislikeWorkerTabIds.delete(id);
  if (Number(quickDislikePersistentWorkerTabId) === id) quickDislikePersistentWorkerTabId = null;
  for (const [runId, workerTabId] of quickDislikeBulkWorkerTabs.entries()) {
    if (Number(workerTabId) === id) quickDislikeBulkWorkerTabs.delete(runId);
  }
  if (result?.ok) await recordHelperLifecycle(event, { tabId: id, ...detail });
  return !!result?.ok;
}

async function cleanupStaleQuickDislikeWorkers() {
  const runtimeSession = await getHelperRuntimeSession();
  const active = await getActiveQuickDislikeJobs();
  const history = await getQuickDislikeHistory();
  const now = Date.now();
  let closed = 0;
  for (const tab of await quickDislikeWorkerTabs()) {
    const tabId = Number(tab.id);
    const info = quickDislikeWorkerUrlInfo(tab.url || tab.pendingUrl || "");
    if (!info || !Number.isFinite(tabId)) continue;
    quickDislikeWorkerTabIds.add(tabId);
    const activeJob = info.jobId ? active.jobs[info.jobId] : null;
    const age = info.startedAt ? now - info.startedAt : Number.POSITIVE_INFINITY;
    const priorSession = !!(runtimeSession.id && info.sessionId && info.sessionId !== runtimeSession.id);
    const confirmed = !!(info.botId && history.bots[info.botId]);
    const legacy = !info.jobId || !info.botId || !info.startedAt;
    const persistentIdle = !!info.persistent && !priorSession && !activeJob;
    if (persistentIdle && age < QUICK_DISLIKE_PERSISTENT_IDLE_MAX_AGE_MS) {
      quickDislikePersistentWorkerTabId = tabId;
      continue;
    }
    const stale = age >= (info.persistent ? QUICK_DISLIKE_PERSISTENT_IDLE_MAX_AGE_MS : QUICK_DISLIKE_ABSOLUTE_MAX_AGE_MS) ||
      (priorSession && age >= QUICK_DISLIKE_INTERRUPTED_GRACE_MS);
    if ((confirmed && !info.persistent) || (legacy && !info.persistent) || (!activeJob && stale) || (activeJob && age >= QUICK_DISLIKE_ABSOLUTE_MAX_AGE_MS)) {
      const event = confirmed ? "quickDislikeConfirmedHelperClosed" : (priorSession ? "quickDislikeInterruptedGcClosed" : "quickDislikeGcClosed");
      if (await closeQuickDislikeTab(tabId, event, { jobId: info.jobId, botId: info.botId, ageMs: Number.isFinite(age) ? age : -1 })) closed += 1;
    }
  }
  return closed;
}

async function cleanupPriorHelperSessionTabs() {
  const runtimeSession = await getHelperRuntimeSession();
  if (!runtimeSession.id) return { quickDislike: 0, listingRefill: 0 };
  let quickClosed = 0;
  let refillClosed = 0;
  for (const tab of await tabsQuery({})) {
    const rawUrl = tab?.url || tab?.pendingUrl || "";
    const quick = quickDislikeWorkerUrlInfo(rawUrl);
    if (quick && tab?.id && (!quick.sessionId || quick.sessionId !== runtimeSession.id)) {
      if (await closeQuickDislikeTab(Number(tab.id), "quickDislikePriorSessionClosed", { jobId: quick.jobId, botId: quick.botId })) quickClosed += 1;
      continue;
    }
    const refill = listingRefillWorkerUrlInfo(rawUrl);
    if (refill && tab?.id && (!refill.sessionId || refill.sessionId !== runtimeSession.id)) {
      const result = await tabsRemove(Number(tab.id));
      if (result?.ok) {
        listingRefillWorkerTabIds.delete(Number(tab.id));
        for (const [runId, workerTabId] of listingRefillPageWorkerTabs.entries()) {
          if (Number(workerTabId) === Number(tab.id)) listingRefillPageWorkerTabs.delete(runId);
        }
        refillClosed += 1;
        await recordHelperLifecycle("listingRefillPriorSessionClosed", { tabId: Number(tab.id), runId: refill.runId });
      }
    }
  }
  return { quickDislike: quickClosed, listingRefill: refillClosed };
}

async function recoverInterruptedQuickDislikeJobs() {
  const runtimeSession = await getHelperRuntimeSession();
  const active = await getActiveQuickDislikeJobs();
  const jobRows = Object.values(active.jobs);
  const helpers = await quickDislikeWorkerTabs();
  const history = await getQuickDislikeHistory();
  const now = Date.now();

  const byJob = new Map();
  for (const tab of helpers) {
    const info = quickDislikeWorkerUrlInfo(tab.url || tab.pendingUrl || "");
    if (!info) continue;
    quickDislikeWorkerTabIds.add(Number(tab.id));
    if (!info.jobId) continue;
    const list = byJob.get(info.jobId) || [];
    list.push({ tab, info });
    byJob.set(info.jobId, list);
  }

  for (const [jobId, rows] of byJob.entries()) {
    if (rows.length <= 1) continue;
    rows.sort((a, b) => Number(b.tab.lastAccessed || 0) - Number(a.tab.lastAccessed || 0));
    for (const duplicate of rows.slice(1)) {
      await closeQuickDislikeTab(Number(duplicate.tab.id), "quickDislikeDuplicateClosed", { jobId, botId: duplicate.info.botId });
    }
  }

  for (const job of jobRows) {
    const jobId = String(job.jobId || "");
    const botId = String(job.botId || "").toLowerCase();
    const rows = byJob.get(jobId) || [];
    if (history.bots[botId]) {
      for (const row of rows) await closeQuickDislikeTab(Number(row.tab.id), "quickDislikeRecoveredConfirmed", { jobId, botId });
      await removeActiveQuickDislikeJob(jobId);
      continue;
    }

    const age = now - Number(job.createdAt || job.startedAt || now);
    const recoveryCount = Number(job.recoveryCount || 0);
    if (age > QUICK_DISLIKE_RECOVERY_MAX_AGE_MS || recoveryCount >= 2) {
      for (const row of rows) await closeQuickDislikeTab(Number(row.tab.id), "quickDislikeRecoveryAbandoned", { jobId, botId, ageMs: age, recoveryCount });
      await removeActiveQuickDislikeJob(jobId);
      await recordHelperLifecycle("quickDislikeRecoveryAbandoned", { jobId, botId, ageMs: age, recoveryCount });
      continue;
    }

    for (const row of rows) await closeQuickDislikeTab(Number(row.tab.id), "quickDislikeReloadInterrupted", { jobId, botId });
    await recordHelperLifecycle("quickDislikeReloadInterrupted", { jobId, botId, recoveryCount });
    await upsertActiveQuickDislikeJob({ ...job, recoveryCount: recoveryCount + 1, status: "recovering", tabId: 0, startedAt: Date.now() });
    queueQuickDislikeBot({
      type: "DS_QUICK_DISLIKE_BOT",
      botId,
      botName: job.botName || botId,
      chatUrl: job.chatUrl || `https://spicychat.ai/chat/${botId}`,
      quickDislikeJobId: jobId,
      recoveryCount: recoveryCount + 1,
      recoveredAfterReload: true,
      force: false
    }).then(result => recordHelperLifecycle(result?.ok ? "quickDislikeRecoveryCompleted" : "quickDislikeRecoveryFailed", {
      jobId,
      botId,
      status: result?.status || "no-response"
    })).catch(() => recordHelperLifecycle("quickDislikeRecoveryFailed", { jobId, botId, status: "exception" }));
  }

  // Legacy/orphan helpers that have no persisted active job are not allowed to
  // live forever. Same-session helpers get a short grace; prior-session helpers
  // are handled by the one-minute session cleanup alarm.
  await cleanupStaleQuickDislikeWorkers();
  return { activeJobs: jobRows.length, helperTabs: helpers.length, sessionId: runtimeSession.id || "" };
}

async function initializeHelperLifecycleRecovery() {
  // The background bootstrap plus onInstalled/onStartup can fire very close
  // together. Reuse one initialization promise per service-worker lifetime so
  // the same persisted interrupted job cannot be recovered twice in parallel.
  if (helperLifecycleInitPromise) return helperLifecycleInitPromise;
  helperLifecycleInitPromise = (async () => {
    const runtimeSession = await getHelperRuntimeSession();
    await recoverInterruptedQuickDislikeJobs();
    await cleanupStaleListingRefillWorkers({ closeLegacy: true });
    chrome.alarms.create(QUICK_DISLIKE_GC_ALARM, { periodInMinutes: 1 });
    chrome.alarms.create(LISTING_REFILL_GC_ALARM, { periodInMinutes: 30 });
    if (runtimeSession.created) {
      chrome.alarms.create(HELPER_SESSION_GRACE_ALARM, { delayInMinutes: 1 });
      await recordHelperLifecycle("helperRuntimeSessionStarted", { sessionId: runtimeSession.id });
    }
  })();
  return helperLifecycleInitPromise;
}

async function runQuickDislikeBot(message) {
  const totalStartedAt = Date.now();
  const botId = String(message?.botId || "").trim().toLowerCase();
  const botName = String(message?.botName || "").trim().slice(0, 160);
  if (!/^[0-9a-f-]{20,}$/i.test(botId)) return { ok: false, status: "invalid-bot" };
  if (message?.bulkRunId && isQuickDislikeBulkRunCanceled(message.bulkRunId)) return { ok: false, status: "bulk-canceled" };

  if (message?.force !== true) {
    const history = await getQuickDislikeHistory();
    const remembered = history.bots[botId];
    if (remembered && !(remembered.status === "unavailable-private-or-deleted" &&
        await feedbackUnavailableSuperseded(botId, remembered.handledAt))) return {
      ok: true, status: "already-handled", rememberedStatus: remembered.status,
      handledAt: remembered.handledAt || 0, ratingAt: remembered.ratingAt || 0,
      crossHandledBy: remembered.crossHandledBy || "",
      ratingSource: remembered.ratingSource || "", requestSent: false, networkAttempts: 0
    };

    const crossHandled = await completedRecommendationFeedbackForBot(botId, "dislike");
    if (crossHandled?.source === "less-like") {
      const originalSource = crossHandled.stage === "cross-feedback-dedupe" ? "dislike" : "less-like";
      const rememberedCross = await rememberQuickDislike(botId, botName || crossHandled.name || "", "already-disliked", {
        crossHandledBy: "less-like", ratingSource: originalSource, ratingAt: crossHandled.handledAt || 0,
        requestSent: false
      });
      await recordHelperLifecycle("recommendationFeedbackCrossDedupe", { botId, skipped: "dislike", completedBy: "less-like" });
      return { ok: true, status: "already-handled", rememberedStatus: "already-disliked",
        handledAt: rememberedCross?.handledAt || Date.now(), ratingAt: rememberedCross?.ratingAt || crossHandled.handledAt || 0,
        crossHandledBy: "less-like", ratingSource: originalSource,
        networkAttempts: 0, requestSent: false };
    }
  }

  // v0.2.30: Quick Dislike now uses the same persistent signed-feedback helper
  // as Less Like. This retires the old per-bot /chat navigation worker while
  // preserving separate Dislike history/UI and the shared cross-flow dedupe.
  let result;
  try {
    result = await runDirectCharacterFeedback(message, "dislike");
  } finally {
    if (!String(message?.bulkRunId || "").trim()) await releaseQuickLessLikeStandaloneWorker();
  }

  if (result?.ok && result.status === "disliked") {
    const remembered = await rememberQuickDislike(botId, botName, "disliked", { requestSent: result.requestSent === true });
    if (remembered) {
      result.handledAt = remembered.handledAt || Date.now();
      result.ratingAt = remembered.ratingAt || 0;
      result.ratingSource = "dislike";
    }
  } else if (result?.status === "bot-not-found") {
    const remembered = await rememberQuickDislike(botId, botName, "unavailable-private-or-deleted");
    result = { ...result, ok: true, status: "unavailable-private-or-deleted", rememberedStatus: "unavailable-private-or-deleted", handledAt: remembered?.handledAt || Date.now() };
  } else if (result?.status === "character-restricted") {
    const remembered = await rememberQuickDislike(botId, botName, "unavailable-private-or-deleted");
    result = { ...result, ok: true, status: "unavailable-private-or-deleted", rememberedStatus: "unavailable-private-or-deleted", handledAt: remembered?.handledAt || Date.now() };
  }

  await recordHelperLifecycle(result?.ok ? "quickDislikeCompleted" : "quickDislikeFailed", {
    botId,
    status: result?.status || "unknown",
    executor: "persistent-recommendation-worker",
    elapsedMs: Date.now() - totalStartedAt
  });
  return { ...result, totalMs: Date.now() - totalStartedAt, executor: "persistent-recommendation-worker" };
}
