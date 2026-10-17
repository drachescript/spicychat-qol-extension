"use strict";

// Feature-owned background helpers: worker-less-like. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function quickLessLikeWorkerUrlInfo(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!isSpicyChatUrl(parsed.href)) return null;
    const recommendationWorker = parsed.searchParams.get("dsQolRecommendationWorker") === "1";
    const legacyWorker = parsed.searchParams.get("dsQuickLessLike") === "1";
    if (!recommendationWorker && !legacyWorker) return null;
    return {
      jobId: String(parsed.searchParams.get("dsLessLikeJobId") || "").trim(),
      botId: String(parsed.searchParams.get("dsLessLikeBotId") || "").trim().toLowerCase(),
      botName: String(parsed.searchParams.get("dsLessLikeBotName") || "").trim(),
      bulkRunId: String(parsed.searchParams.get("dsLessLikeBulkRunId") || "").trim(),
      startedAt: Number(parsed.searchParams.get("dsLessLikeStartedAt") || 0) || 0,
      sessionId: String(parsed.searchParams.get("dsHelperSession") || "").trim(),
      persistent: recommendationWorker || parsed.searchParams.get("dsLessLikePersistent") === "1",
      recommendationWorker
    };
  } catch {
    return null;
  }
}

function isQuickLessLikeWorkerUrl(url) {
  return !!quickLessLikeWorkerUrlInfo(url);
}

function isSpicyChatHomeUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!isSpicyChatUrl(parsed.href)) return false;
    const path = String(parsed.pathname || "/").replace(/\/+$/, "") || "/";
    return path === "/";
  } catch {
    return false;
  }
}

function isKnownQuickLessLikeRecommendationWorkerTab(tabId, url = "") {
  const id = Number(tabId || 0);
  if (!Number.isFinite(id) || !id || !isSpicyChatHomeUrl(url)) return false;
  const info = quickLessLikeWorkerUrlInfo(url);
  if (info?.recommendationWorker) return true;
  if (quickLessLikeWorkerTabIds.has(id)) return true;
  if (Number(quickLessLikePersistentWorkerTabId) === id) return true;
  for (const workerTabId of quickLessLikeBulkWorkerTabs.values()) {
    if (Number(workerTabId) === id) return true;
  }
  return false;
}

function stampQuickLessLikeWorkerUrl(url, { jobId = "", botId = "", botName = "", bulkRunId = "", startedAt = Date.now(), sessionId = "" } = {}) {
  const next = new URL(String(url));
  next.searchParams.set("dsQuickLessLike", "1");
  next.searchParams.set("dsLessLikePersistent", "1");
  const values = {
    dsLessLikeJobId: String(jobId || "").trim(),
    dsLessLikeBotId: String(botId || "").trim().toLowerCase(),
    dsLessLikeBotName: String(botName || "").trim(),
    dsLessLikeBulkRunId: String(bulkRunId || "").trim(),
    dsHelperSession: String(sessionId || "").trim()
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  next.searchParams.set("dsLessLikeStartedAt", String(Number(startedAt) || Date.now()));
  return next;
}

function stampQuickDislikeWorkerUrl(url, { jobId = "", botId = "", bulkRunId = "", startedAt = Date.now(), sessionId = "" } = {}) {
  const next = new URL(String(url));
  next.searchParams.set("dsQuickDislike", "1");
  next.searchParams.set("dsQuickPersistent", "1");
  const values = {
    dsQuickJobId: String(jobId || "").trim(),
    dsQuickBotId: String(botId || "").trim().toLowerCase(),
    dsQuickBulkRunId: String(bulkRunId || "").trim(),
    dsHelperSession: String(sessionId || "").trim()
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  next.searchParams.set("dsQuickStartedAt", String(Number(startedAt) || Date.now()));
  return next;
}

function isPersonaRefreshWorkerUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return isSpicyChatUrl(parsed.href) && parsed.searchParams.get("dsPersonaRefresh") === "1";
  } catch {
    return false;
  }
}

function isListingRefillWorkerUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return isSpicyChatUrl(parsed.href) && parsed.searchParams.get("dsListingRefill") === "1";
  } catch {
    return false;
  }
}

function listingRefillWorkerUrlInfo(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!isSpicyChatUrl(parsed.href) || parsed.searchParams.get("dsListingRefill") !== "1") return null;
    return {
      runId: String(parsed.searchParams.get("dsRefillRunId") || "").trim(),
      startedAt: Number(parsed.searchParams.get("dsRefillStartedAt") || 0) || 0,
      sessionId: String(parsed.searchParams.get("dsHelperSession") || "").trim()
    };
  } catch { return null; }
}

function stampListingRefillWorkerUrl(url, runId = "", startedAt = Date.now(), sessionId = "") {
  const next = new URL(String(url));
  next.searchParams.set("dsListingRefill", "1");
  const id = String(runId || "").trim();
  if (id) next.searchParams.set("dsRefillRunId", id);
  else next.searchParams.delete("dsRefillRunId");
  const session = String(sessionId || "").trim();
  if (session) next.searchParams.set("dsHelperSession", session);
  else next.searchParams.delete("dsHelperSession");
  next.searchParams.set("dsRefillStartedAt", String(Number(startedAt) || Date.now()));
  return next;
}

async function cleanupStaleListingRefillWorkers({ preserveRunId = "", closeLegacy = true } = {}) {
  const keep = String(preserveRunId || "").trim();
  const now = Date.now();
  let closed = 0;
  const tabs = await tabsQuery({});
  for (const tab of tabs) {
    const info = listingRefillWorkerUrlInfo(tab?.url || tab?.pendingUrl || "");
    if (!info || !tab?.id) continue;
    const legacyOrOrphan = !info.runId || !info.startedAt;
    const stale = info.startedAt > 0 && now - info.startedAt >= LISTING_REFILL_WORKER_MAX_AGE_MS;
    if (keep && info.runId === keep && !stale) continue;
    if (!(stale || (closeLegacy && legacyOrOrphan))) continue;
    await tabsRemove(Number(tab.id));
    listingRefillWorkerTabIds.delete(Number(tab.id));
    for (const [runId, workerTabId] of listingRefillPageWorkerTabs.entries()) {
      if (Number(workerTabId) === Number(tab.id)) listingRefillPageWorkerTabs.delete(runId);
    }
    closed += 1;
  }
  return closed;
}

async function findListingRefillWorkersForRun(runId) {
  const id = String(runId || "").trim();
  if (!id) return [];
  const tabs = await tabsQuery({});
  return tabs.filter(tab => listingRefillWorkerUrlInfo(tab?.url || tab?.pendingUrl || "")?.runId === id);
}

async function findListingRefillWorkerForRun(runId) {
  const tabs = await findListingRefillWorkersForRun(runId);
  if (!tabs.length) return null;
  tabs.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  return tabs[0] || null;
}

async function closeDuplicateListingRefillWorkers(runId, keepTabId) {
  const tabs = await findListingRefillWorkersForRun(runId);
  let closed = 0;
  for (const tab of tabs) {
    if (!tab?.id || Number(tab.id) === Number(keepTabId)) continue;
    await tabsRemove(Number(tab.id));
    listingRefillWorkerTabIds.delete(Number(tab.id));
    closed += 1;
  }
  return closed;
}

function markQuickDislikeBulkRunCanceled(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  const now = Date.now();
  canceledQuickDislikeBulkRuns.set(id, now);
  for (const [key, at] of canceledQuickDislikeBulkRuns.entries()) {
    if (now - Number(at || 0) > 30 * 60 * 1000) canceledQuickDislikeBulkRuns.delete(key);
  }
  return true;
}

function isQuickDislikeBulkRunCanceled(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  const at = Number(canceledQuickDislikeBulkRuns.get(id) || 0);
  if (!at) return false;
  if (Date.now() - at > 30 * 60 * 1000) {
    canceledQuickDislikeBulkRuns.delete(id);
    return false;
  }
  return true;
}

async function releaseQuickDislikeBulkWorker(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  const tabIds = new Set();
  const mapped = Number(quickDislikeBulkWorkerTabs.get(id));
  if (Number.isFinite(mapped)) tabIds.add(mapped);
  quickDislikeBulkWorkerTabs.delete(id);
  for (const tab of await tabsQuery({})) {
    const info = quickDislikeWorkerUrlInfo(tab?.url || tab?.pendingUrl || "");
    if (info?.bulkRunId === id && tab?.id) tabIds.add(Number(tab.id));
  }
  let released = false;
  for (const tabId of tabIds) {
    if (Number(tabId) === Number(quickDislikePersistentWorkerTabId)) {
      released = true;
      continue;
    }
    quickDislikeWorkerTabIds.delete(tabId);
    await tabsRemove(tabId);
    released = true;
  }
  return released;
}

async function findQuickDislikeWorkersForBulkRun(runId) {
  const id = String(runId || "").trim();
  if (!id) return [];
  const tabs = await tabsQuery({});
  return tabs.filter(tab => quickDislikeWorkerUrlInfo(tab?.url || tab?.pendingUrl || "")?.bulkRunId === id);
}

async function findPersistentQuickDislikeWorker(sessionId = "") {
  const mapped = Number(quickDislikePersistentWorkerTabId);
  if (Number.isFinite(mapped)) {
    const tab = await tabsGet(mapped);
    const info = tab ? quickDislikeWorkerUrlInfo(tab.url || tab.pendingUrl || "") : null;
    if (tab && info?.persistent && (!sessionId || !info.sessionId || info.sessionId === sessionId)) return tab;
    quickDislikePersistentWorkerTabId = null;
  }

  const tabs = await quickDislikeWorkerTabs();
  const candidates = tabs.filter(tab => {
    const info = quickDislikeWorkerUrlInfo(tab.url || tab.pendingUrl || "");
    return !!info?.persistent && (!sessionId || !info.sessionId || info.sessionId === sessionId);
  });
  candidates.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  const tab = candidates[0] || null;
  if (tab?.id) quickDislikePersistentWorkerTabId = Number(tab.id);
  return tab;
}

async function navigateQuickDislikeWorkerTab(tabId, targetUrl, botId, jobId) {
  const response = await tabsSendMessage(tabId, {
    type: "DS_QUICK_DISLIKE_NAVIGATE",
    targetUrl: targetUrl.href,
    botId,
    jobId
  });
  return response?.ok === true;
}

async function closeDuplicateQuickDislikeWorkers(runId, keepTabId) {
  const tabs = await findQuickDislikeWorkersForBulkRun(runId);
  let closed = 0;
  for (const tab of tabs) {
    if (!tab?.id || Number(tab.id) === Number(keepTabId)) continue;
    await tabsRemove(Number(tab.id));
    quickDislikeWorkerTabIds.delete(Number(tab.id));
    closed += 1;
  }
  if (closed) await recordHelperLifecycle("quickDislikeDuplicateClosed", { bulkRunId: String(runId || ""), closed });
  return closed;
}

async function prepareQuickDislikeWorkerTab(url, bulkRunId = "", job = {}) {
  const runId = String(bulkRunId || "").trim();
  const runtimeSession = await getHelperRuntimeSession();
  const jobId = String(job?.jobId || "").trim();
  const botId = String(job?.botId || "").trim().toLowerCase();
  const startedAt = Number(job?.startedAt || 0) || Date.now();
  const stampedFor = source => stampQuickDislikeWorkerUrl(source, {
    jobId,
    botId,
    bulkRunId: runId,
    startedAt,
    sessionId: runtimeSession.id
  });

  let existing = null;
  let recovered = false;

  if (runId) {
    const mappedId = Number(quickDislikeBulkWorkerTabs.get(runId));
    if (Number.isFinite(mappedId)) existing = await tabsGet(mappedId);
    if (!existing) {
      const runTabs = await findQuickDislikeWorkersForBulkRun(runId);
      runTabs.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
      existing = runTabs[0] || null;
      recovered = !!existing;
    }
  }

  if (!existing) existing = await findPersistentQuickDislikeWorker(runtimeSession.id);

  if (existing?.id) {
    const existingId = Number(existing.id);
    const target = stampedFor(url);
    let reusedWithoutReload = false;
    try {
      reusedWithoutReload = await navigateQuickDislikeWorkerTab(existingId, target, botId, jobId);
    } catch {}

    if (!reusedWithoutReload) {
      const updated = await tabsUpdate(existingId, { url: target.href, active: false });
      if (!updated?.ok) {
        quickDislikeWorkerTabIds.delete(existingId);
        if (Number(quickDislikePersistentWorkerTabId) === existingId) quickDislikePersistentWorkerTabId = null;
        if (runId) quickDislikeBulkWorkerTabs.delete(runId);
        existing = null;
      }
    }

    if (existing) {
      quickDislikeWorkerTabIds.add(existingId);
      quickDislikePersistentWorkerTabId = existingId;
      if (runId) quickDislikeBulkWorkerTabs.set(runId, existingId);
      const duplicateClosed = runId ? await closeDuplicateQuickDislikeWorkers(runId, existingId) : 0;
      if (recovered) await recordHelperLifecycle("quickDislikeHelperRecovered", { bulkRunId: runId, jobId, tabId: existingId });
      if (reusedWithoutReload) await recordHelperLifecycle("quickDislikeSpaReused", { bulkRunId: runId, jobId, botId, tabId: existingId });
      return {
        ok: true,
        tabId: existingId,
        reusable: true,
        reused: true,
        reusedWithoutReload,
        recovered,
        duplicateClosed
      };
    }
  }

  const created = await tabsCreate({ url: stampedFor(url).href, active: false });
  const tabId = Number(created?.tab?.id);
  if (!created.ok || !Number.isFinite(tabId)) {
    return { ok: false, tabId: null, reusable: true, error: created.error || "" };
  }
  quickDislikeWorkerTabIds.add(tabId);
  quickDislikePersistentWorkerTabId = tabId;
  if (runId) quickDislikeBulkWorkerTabs.set(runId, tabId);
  return { ok: true, tabId, reusable: true, reused: false, reusedWithoutReload: false, recovered: false, duplicateClosed: 0 };
}

function markQuickLessLikeBulkRunCanceled(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  const now = Date.now();
  canceledQuickLessLikeBulkRuns.set(id, now);
  for (const [key, at] of canceledQuickLessLikeBulkRuns.entries()) {
    if (now - Number(at || 0) > 30 * 60 * 1000) canceledQuickLessLikeBulkRuns.delete(key);
  }
  return true;
}

function isQuickLessLikeBulkRunCanceled(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  const at = Number(canceledQuickLessLikeBulkRuns.get(id) || 0);
  if (!at) return false;
  if (Date.now() - at > 30 * 60 * 1000) {
    canceledQuickLessLikeBulkRuns.delete(id);
    return false;
  }
  return true;
}

async function quickLessLikeWorkerTabs() {
  const tabs = await tabsQuery({});
  return tabs.filter(tab => isQuickLessLikeWorkerUrl(tab?.url || tab?.pendingUrl || ""));
}

async function releaseQuickLessLikeBulkWorker(runId) {
  const id = String(runId || "").trim();
  if (!id) return false;
  try { await flushQuickLessLikeHistory(true, id); } catch {}
  if (quickLessLikeHistoryCacheRunId === id) {
    quickLessLikeHistoryCacheRunId = "";
    quickLessLikeHistoryCache = null;
    quickLessLikePendingCache = null;
    quickLessLikeHistoryLastFlushAt = 0;
  }
  quickLessLikeDirectBulkTabs.delete(id);
  quickLessLikeClosedBulkRuns.delete(id);
  const tabIds = new Set();
  const mapped = Number(quickLessLikeBulkWorkerTabs.get(id));
  if (Number.isFinite(mapped)) tabIds.add(mapped);
  quickLessLikeBulkWorkerTabs.delete(id);
  for (const tab of await quickLessLikeWorkerTabs()) {
    const info = quickLessLikeWorkerUrlInfo(tab?.url || tab?.pendingUrl || "");
    if (info?.bulkRunId === id && tab?.id) tabIds.add(Number(tab.id));
  }
  let released = false;
  for (const tabId of tabIds) {
    quickLessLikeWorkerTabIds.delete(tabId);
    quickLessLikeReadyWorkerTabs.delete(tabId);
    await tabsRemove(tabId);
    if (Number(tabId) === Number(quickLessLikePersistentWorkerTabId)) {
      quickLessLikePersistentWorkerTabId = null;
      await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: 0 });
    }
    released = true;
    await recordHelperLifecycle("quickLessLikeRecommendationWorkerReleased", { tabId, runId: id });
  }
  return released;
}

async function findPersistentQuickLessLikeWorker(sessionId = "") {
  let mapped = Number(quickLessLikePersistentWorkerTabId);
  if (!Number.isFinite(mapped) || !mapped) {
    const stored = await storageSessionGet([QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]);
    mapped = Number(stored[QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY] || 0);
  }
  if (Number.isFinite(mapped) && mapped > 0) {
    const tab = await tabsGet(mapped);
    const url = tab?.url || tab?.pendingUrl || "";
    if (tab && isSpicyChatHomeUrl(url)) {
      // Home replaces the helper query with listing-filter query params after boot.
      // Keep using the known tab instead of mistaking that SPA rewrite for navigation.
      quickLessLikeWorkerTabIds.add(mapped);
      quickLessLikePersistentWorkerTabId = mapped;
      await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: mapped });
      return tab;
    }
    quickLessLikePersistentWorkerTabId = null;
    await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: 0 });
  }

  const tabs = await quickLessLikeWorkerTabs();
  const candidates = [];
  for (const tab of tabs) {
    const info = quickLessLikeWorkerUrlInfo(tab.url || tab.pendingUrl || "");
    if (!info?.persistent) continue;
    if (sessionId && info.sessionId && info.sessionId !== sessionId) {
      if (tab?.id) {
        quickLessLikeWorkerTabIds.delete(Number(tab.id));
        await tabsRemove(Number(tab.id));
      }
      continue;
    }
    candidates.push(tab);
  }
  candidates.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  const tab = candidates[0] || null;
  if (tab?.id) {
    const tabId = Number(tab.id);
    quickLessLikeWorkerTabIds.add(tabId);
    quickLessLikePersistentWorkerTabId = tabId;
    await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: tabId });
  }
  return tab;
}

async function navigateQuickLessLikeWorkerTab(tabId, targetUrl, botId, botName, jobId) {
  const response = await tabsSendMessage(tabId, {
    type: "DS_QUICK_LESS_LIKE_NAVIGATE",
    targetUrl: targetUrl.href,
    botId,
    botName,
    jobId
  });
  return response?.ok === true;
}

async function prepareQuickLessLikeWorkerTab(url, bulkRunId = "", job = {}) {
  const runId = String(bulkRunId || "").trim();
  const runtimeSession = await getHelperRuntimeSession();
  const jobId = String(job?.jobId || "").trim();
  const botId = String(job?.botId || "").trim().toLowerCase();
  const botName = String(job?.botName || "").trim();
  const startedAt = Number(job?.startedAt || 0) || Date.now();
  const stampedFor = source => stampQuickLessLikeWorkerUrl(source, {
    jobId, botId, botName, bulkRunId: runId, startedAt, sessionId: runtimeSession.id
  });

  let existing = null;
  if (runId) {
    const mappedId = Number(quickLessLikeBulkWorkerTabs.get(runId));
    if (Number.isFinite(mappedId)) existing = await tabsGet(mappedId);
  }
  if (!existing) existing = await findPersistentQuickLessLikeWorker(runtimeSession.id);

  if (existing?.id) {
    const existingId = Number(existing.id);
    const target = stampedFor(url);
    let reusedWithoutReload = false;
    try { reusedWithoutReload = await navigateQuickLessLikeWorkerTab(existingId, target, botId, botName, jobId); } catch {}
    if (!reusedWithoutReload) {
      const updated = await tabsUpdate(existingId, { url: target.href, active: false });
      if (!updated?.ok) {
        quickLessLikeWorkerTabIds.delete(existingId);
        if (Number(quickLessLikePersistentWorkerTabId) === existingId) quickLessLikePersistentWorkerTabId = null;
        if (runId) quickLessLikeBulkWorkerTabs.delete(runId);
        existing = null;
      }
    }
    if (existing) {
      quickLessLikeWorkerTabIds.add(existingId);
      quickLessLikePersistentWorkerTabId = existingId;
      if (runId) quickLessLikeBulkWorkerTabs.set(runId, existingId);
      return { ok: true, tabId: existingId, reusable: true, reused: true, reusedWithoutReload };
    }
  }

  const created = await tabsCreate({ url: stampedFor(url).href, active: false });
  const tabId = Number(created?.tab?.id);
  if (!created.ok || !Number.isFinite(tabId)) return { ok: false, tabId: null, reusable: true, error: created.error || "" };
  quickLessLikeWorkerTabIds.add(tabId);
  quickLessLikePersistentWorkerTabId = tabId;
  if (runId) quickLessLikeBulkWorkerTabs.set(runId, tabId);
  return { ok: true, tabId, reusable: true, reused: false, reusedWithoutReload: false };
}

function quickLessLikeSearchUrl(botName, botId) {
  const url = new URL("https://spicychat.ai/");
  const key = "public_characters_alias/sort/_text_match(buckets: 3):desc,num_messages_24h:desc[query]";
  url.searchParams.set(key, String(botName || botId || "").trim());
  return url;
}

function quickLessLikeRecommendationWorkerUrl() {
  return new URL(QUICK_LESS_LIKE_RECOMMENDATION_WORKER_URL);
}

async function preferredQuickLessLikeRecommendationWorkerUrl() {
  try {
    const stored = await storageLocalGet([QUICK_LESS_LIKE_TOKEN_CACHE_KEY]);
    const cached = stored?.[QUICK_LESS_LIKE_TOKEN_CACHE_KEY] || {};
    const token = String(cached?.token || "").trim();
    const at = Number(cached?.at || 0);
    if (token.length >= 16 && token.length <= 180 && at > 0 && Date.now() - at < 24 * 60 * 60 * 1000) {
      return new URL(QUICK_LESS_LIKE_LIGHT_WORKER_URL);
    }
  } catch {}
  return quickLessLikeRecommendationWorkerUrl();
}

async function createOrReuseQuickLessLikeRecommendationWorker(runId = "") {
  const id = String(runId || "").trim();
  if (id && quickLessLikeClosedBulkRuns.has(id)) {
    return { ok: false, status: "recommendation-worker-closed", tabId: 0 };
  }
  let tab = null;
  const mapped = id ? Number(quickLessLikeBulkWorkerTabs.get(id) || 0) : 0;
  if (Number.isFinite(mapped) && mapped > 0) tab = await tabsGet(mapped);
  if (!tab) tab = await findPersistentQuickLessLikeWorker();
  if (tab?.id) {
    const tabId = Number(tab.id);
    quickLessLikeWorkerTabIds.add(tabId);
    quickLessLikePersistentWorkerTabId = tabId;
    if (id) quickLessLikeBulkWorkerTabs.set(id, tabId);
    const currentUrl = tab.url || tab.pendingUrl || "";
    const info = quickLessLikeWorkerUrlInfo(currentUrl);
    const knownWorkerHome = isKnownQuickLessLikeRecommendationWorkerTab(tabId, currentUrl);
    if (!info?.recommendationWorker && !knownWorkerHome) {
      const preferredUrl = await preferredQuickLessLikeRecommendationWorkerUrl();
      const updated = await tabsUpdate(tabId, { url: preferredUrl.href, active: false });
      if (!updated?.ok) return { ok: false, status: "recommendation-worker-navigation-failed", tabId };
      quickLessLikeReadyWorkerTabs.delete(tabId);
      await recordHelperLifecycle("quickLessLikeRecommendationWorkerResetHome", { tabId, runId: id });
    } else {
      await recordHelperLifecycle("quickLessLikeRecommendationWorkerReused", { tabId, runId: id });
    }
    await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: tabId });
    return { ok: true, status: "recommendation-worker-available", tabId };
  }
  const preferredUrl = await preferredQuickLessLikeRecommendationWorkerUrl();
  const created = await tabsCreate({ url: preferredUrl.href, active: false });
  const tabId = Number(created?.tab?.id || 0);
  if (!created?.ok || !Number.isFinite(tabId) || !tabId) {
    return { ok: false, status: "recommendation-worker-create-failed", tabId: 0, error: created?.error || "" };
  }
  quickLessLikeWorkerTabIds.add(tabId);
  quickLessLikePersistentWorkerTabId = tabId;
  if (id) quickLessLikeBulkWorkerTabs.set(id, tabId);
  await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: tabId });
  await recordHelperLifecycle("quickLessLikeRecommendationWorkerCreated", { tabId, runId: id });
  return { ok: true, status: "recommendation-worker-created", tabId };
}

async function probeQuickLessLikeRecommendationWorker(tabId, force = false, timeoutMs = 12000) {
  const id = Number(tabId || 0);
  if (!Number.isFinite(id) || !id) return { ok: false, ready: false, status: "recommendation-worker-missing" };
  const cachedAt = Number(quickLessLikeReadyWorkerTabs.get(id) || 0);
  if (!force && cachedAt && Date.now() - cachedAt < QUICK_LESS_LIKE_READY_TTL_MS) {
    return { ok: true, ready: true, status: "recommendation-worker-ready", cached: true, tabId: id };
  }
  const deadline = Date.now() + Math.max(2000, Number(timeoutMs || 12000));
  let last = null;
  while (Date.now() < deadline) {
    const tab = await tabsGet(id);
    if (!tab) return { ok: false, ready: false, status: "recommendation-worker-closed", tabId: id };
    const currentUrl = tab.url || tab.pendingUrl || "";
    if (!isKnownQuickLessLikeRecommendationWorkerTab(id, currentUrl)) {
      return { ok: false, ready: false, status: "recommendation-worker-wrong-page", tabId: id };
    }
    const response = await tabsSendMessage(id, { type: "DS_QUICK_LESS_LIKE_WORKER_READY" });
    if (response) last = response;
    if (response?.ready) {
      quickLessLikeReadyWorkerTabs.set(id, Date.now());
      await recordHelperLifecycle("quickLessLikeRecommendationWorkerReady", {
        tabId: id,
        nativeSignedSamples: Number(response?.nativeSignedSamples || 0),
        candidateTokenCount: Number(response?.candidateTokenCount || 0),
        recombeeValidated: !!response?.recombeeValidated,
        tokenSource: String(response?.tokenSource || "")
      });
      return { ...response, tabId: id };
    }
    if (["not-recommendation-worker", "not-worker"].includes(String(response?.status || ""))) {
      return { ...response, ok: false, ready: false, tabId: id };
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return {
    ...(last || {}), ok: false, ready: false, status: "recommendation-worker-not-ready", tabId: id,
    reason: String(last?.reason || "SpicyChat Home did not expose a ready recommendation/auth context in time.")
  };
}

function cachedReadyQuickLessLikeBulkWorker(runId = "") {
  const id = String(runId || "").trim();
  if (!id || quickLessLikeClosedBulkRuns.has(id)) return null;
  const tabId = Number(quickLessLikeBulkWorkerTabs.get(id) || 0);
  const readyAt = Number(quickLessLikeReadyWorkerTabs.get(tabId) || 0);
  if (!tabId || !readyAt || Date.now() - readyAt >= QUICK_LESS_LIKE_READY_TTL_MS) return null;
  return {
    ok: true,
    ready: true,
    status: "recommendation-worker-ready-cached",
    cached: true,
    tabId
  };
}

async function ensureQuickLessLikeRecommendationWorker(runId = "", { allowReload = true } = {}) {
  const worker = await createOrReuseQuickLessLikeRecommendationWorker(runId);
  if (!worker?.ok) return worker;
  const tabId = Number(worker.tabId || 0);
  let ready = await probeQuickLessLikeRecommendationWorker(tabId, false);
  if (ready?.ready) return { ...ready, ok: true, tabId };
  if (!allowReload || ready?.status === "recommendation-worker-closed") return ready;

  // Do not throw away a healthy Home runtime just because token discovery is
  // still finishing. A native signed Recombee sample, usable auth/user state,
  // or discovered candidates all prove that the helper itself is alive. Give
  // that same page a short extra window instead of paying for another complete
  // SpicyChat startup (OAuth, settings, banners, queue, etc.).
  const hasRecommendationEvidence = !!(
    Number(ready?.nativeSignedSamples || 0) > 0 ||
    Number(ready?.candidateTokenCount || 0) > 0 ||
    ready?.recombeeValidated
  );
  if (hasRecommendationEvidence) {
    const extended = await probeQuickLessLikeRecommendationWorker(tabId, true, 5000);
    if (extended?.ready) return { ...extended, ok: true, tabId };
    // A reload would discard the native signed request we can use to verify the
    // real token offline. Preserve this worker and report not-ready instead of
    // rebooting SpicyChat and falling back to blind candidate POSTs.
    return { ...(extended || ready), ok: false, ready: false, tabId };
  }

  const tab = await tabsGet(tabId);
  if (!tab) return { ok: false, ready: false, status: "recommendation-worker-closed", tabId };
  const reset = await tabsUpdate(tabId, { url: quickLessLikeRecommendationWorkerUrl().href, active: false });
  if (!reset?.ok) return { ok: false, ready: false, status: "recommendation-worker-navigation-failed", tabId };
  quickLessLikeReadyWorkerTabs.delete(tabId);
  await recordHelperLifecycle("quickLessLikeRecommendationWorkerReloaded", { tabId, runId: String(runId || "") });
  ready = await probeQuickLessLikeRecommendationWorker(tabId, true);
  return { ...ready, tabId };
}

async function prepareQuickLessLikeBulkWorker(message) {
  const runId = String(message?.bulkRunId || "").trim();
  if (!runId) return { ok: false, status: "invalid-run" };
  quickLessLikeClosedBulkRuns.delete(runId);
  return ensureQuickLessLikeRecommendationWorker(runId, { allowReload: true });
}

async function releaseQuickLessLikeStandaloneWorker() {
  const tabId = Number(quickLessLikePersistentWorkerTabId || 0);
  if (!Number.isFinite(tabId) || !tabId) return false;
  if ([...quickLessLikeBulkWorkerTabs.values()].some(value => Number(value) === tabId)) return false;
  quickLessLikeWorkerTabIds.delete(tabId);
  quickLessLikeReadyWorkerTabs.delete(tabId);
  quickLessLikePersistentWorkerTabId = null;
  await storageSessionSet({ [QUICK_LESS_LIKE_WORKER_SESSION_TAB_KEY]: 0 });
  const result = await tabsRemove(tabId);
  if (result?.ok) await recordHelperLifecycle("quickLessLikeRecommendationWorkerSingleClosed", { tabId });
  return !!result?.ok;
}

async function runDirectCharacterFeedback(message, mode) {
  const totalStartedAt = Date.now();
  const botId = String(message?.botId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(botId) || !["less-like", "dislike"].includes(mode)) return { ok: false, status: "invalid-bot" };
  const runId = String(message?.bulkRunId || "").trim();
  if (runId && quickLessLikeClosedBulkRuns.has(runId)) {
    return { ok: false, status: "recommendation-worker-closed", feedbackTabsTried: 0, requestSent: false, networkAttempts: 0 };
  }

  const workerStartedAt = Date.now();
  // Bulk runs already prepared and validated one dedicated helper. Reuse its
  // cached tab identity directly instead of tabs.get + lifecycle/session writes
  // for every bot. A real send failure still falls through to the existing
  // self-heal/closed-worker path below.
  const worker = cachedReadyQuickLessLikeBulkWorker(runId)
    || await ensureQuickLessLikeRecommendationWorker(runId, { allowReload: true });
  const workerReadyMs = Date.now() - workerStartedAt;
  if (!worker?.ready) {
    return { ...worker, ok: false, feedbackTabsTried: worker?.tabId ? 1 : 0, requestSent: false, networkAttempts: 0, workerReadyMs, totalMs: Date.now() - totalStartedAt };
  }

  const tabId = Number(worker.tabId || 0);
  let coordinatorWaitMs = 0;
  let feedbackMs = 0;
  let response = null;
  let result = null;

  const sendFeedback = async () => {
    const feedbackStartedAt = Date.now();
    response = await tabsSendMessage(tabId, {
      type: "DS_DIRECT_CHARACTER_FEEDBACK", mode, botId,
      botName: String(message?.botName || "").slice(0, 160)
    });
    feedbackMs += Date.now() - feedbackStartedAt;
    return response;
  };

  const lease = await acquireBackgroundJob("recommendation-feedback", {
    ownerTabId: tabId,
    detail: botId,
    maxHoldMs: 50000
  });
  coordinatorWaitMs += Number(lease?.waitMs || 0);
  try {
    await sendFeedback();
  } finally {
    releaseBackgroundJob(lease?.leaseId);
  }

  result = response?.status ? { ...response, feedbackTabId: tabId, feedbackTabsTried: 1 } : {
    ok: false, status: "direct-feedback-unavailable", feedbackTabId: tabId, feedbackTabsTried: 1,
    requestSent: false, networkAttempts: 0
  };
  const mayHaveSentRating = !!result?.requestSent || Number(result?.networkAttempts || 0) > 0;
  const recoverableBeforeSend = new Set([
    "direct-feedback-unavailable", "recombee-token-not-found", "recombee-user-not-found",
    "character-auth-not-ready", "character-auth-rejected", "not-worker"
  ]);
  if (!result?.ok && !mayHaveSentRating && recoverableBeforeSend.has(String(result?.status || ""))) {
    quickLessLikeReadyWorkerTabs.delete(tabId);
    const reset = await tabsUpdate(tabId, { url: quickLessLikeRecommendationWorkerUrl().href, active: false });
    if (reset?.ok) {
      await recordHelperLifecycle("quickLessLikeRecommendationWorkerSelfHeal", { tabId, runId, status: String(result?.status || "") });
      const healed = await probeQuickLessLikeRecommendationWorker(tabId, true);
      if (healed?.ready) {
        const retryLease = await acquireBackgroundJob("recommendation-feedback", { ownerTabId: tabId, detail: `${botId}:retry`, maxHoldMs: 50000 });
        coordinatorWaitMs += Number(retryLease?.waitMs || 0);
        try {
          await sendFeedback();
        } finally {
          releaseBackgroundJob(retryLease?.leaseId);
        }
        if (response?.status) result = { ...response, feedbackTabId: tabId, feedbackTabsTried: 1, workerRecovered: true };
      } else {
        result = { ...healed, ok: false, feedbackTabId: tabId, feedbackTabsTried: 1, requestSent: false, networkAttempts: 0 };
      }
    } else if (!(await tabsGet(tabId)) || (runId && quickLessLikeClosedBulkRuns.has(runId))) {
      result = { ok: false, status: "recommendation-worker-closed", feedbackTabId: tabId, feedbackTabsTried: 1, requestSent: false, networkAttempts: 0 };
    }
  }
  if (result?.ok && ["less-liked", "disliked"].includes(result?.status)) quickLessLikeReadyWorkerTabs.set(tabId, Date.now());
  return {
    ...result,
    workerReadyMs,
    coordinatorWaitMs,
    feedbackMs,
    availabilityMs: Number(result?.availabilityMs || 0),
    ratingMs: Number(result?.ratingMs || 0),
    userLookupMs: Number(result?.userLookupMs || 0),
    totalMs: Date.now() - totalStartedAt
  };
}

async function runQuickLessLikeBot(message) {
  const totalStartedAt = Date.now();
  const botId = String(message?.botId || "").trim().toLowerCase();
  const botName = String(message?.botName || "").trim().slice(0, 160);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(botId)) return { ok: false, status: "invalid-bot" };
  if (message?.bulkRunId && isQuickLessLikeBulkRunCanceled(message.bulkRunId)) return { ok: false, status: "bulk-canceled" };
  if (message?.force !== true) {
    const history = await getQuickLessLikeHistory(message?.bulkRunId || "");
    const remembered = history.bots[botId];
    if (remembered && !(remembered.status === "unavailable" &&
        await feedbackUnavailableSuperseded(botId, remembered.handledAt))) return { ok: true, status: "already-handled", rememberedStatus: remembered.status || "less-liked", handledAt: remembered.handledAt || 0 };

    const crossHandled = await completedRecommendationFeedbackForBot(botId, "less-like");
    if (crossHandled?.source === "dislike") {
      const handledAt = crossHandled.handledAt || Date.now();
      await rememberQuickLessLikeEntry(botId, {
        status: "less-liked",
        name: String(botName || crossHandled.name || "").slice(0, 160),
        handledAt,
        stage: "cross-feedback-dedupe",
        reason: "A successful Dislike rating for this bot is already recorded, so QoL skipped a duplicate recommendation rating POST.",
        httpStatus: 0
      }, {
        immediate: !String(message?.bulkRunId || "").trim(),
        runId: String(message?.bulkRunId || "").trim()
      });
      await recordHelperLifecycle("recommendationFeedbackCrossDedupe", {
        botId,
        skipped: "less-like",
        completedBy: "dislike"
      });
      return {
        ok: true,
        status: "already-handled",
        rememberedStatus: "less-liked",
        handledAt,
        crossHandledBy: "dislike",
        networkAttempts: 0,
        requestSent: false
      };
    }
  }

  let result;
  try {
    result = await runDirectCharacterFeedback(message, "less-like");
  } finally {
    if (!String(message?.bulkRunId || "").trim()) await releaseQuickLessLikeStandaloneWorker();
  }

  const historyStartedAt = Date.now();
  if (result?.ok && result.status === "less-liked") {
    const remembered = await rememberQuickLessLike(botId, botName, { immediate: !String(message?.bulkRunId || "").trim(), runId: String(message?.bulkRunId || "").trim() });
    if (remembered) result.handledAt = remembered.handledAt || Date.now();
  } else if (result?.status === "bot-not-found" && (result?.availabilityConfirmed || Number(message?.retryAttempt || 0) >= 1)) {
    const remembered = await rememberQuickLessLikeUnavailable(botId, botName, result, { immediate: !String(message?.bulkRunId || "").trim(), runId: String(message?.bulkRunId || "").trim() });
    result = {
      ...result,
      ok: true,
      status: "unavailable",
      rememberedStatus: "unavailable",
      handledAt: remembered?.handledAt || Date.now()
    };
  }
  const historyPersistMs = Date.now() - historyStartedAt;
  const timed = {
    ...result,
    historyPersistMs,
    totalMs: Date.now() - totalStartedAt
  };
  const feedbackTabId = Number(timed?.feedbackTabId || 0);
  if (feedbackTabId && !String(message?.bulkRunId || "").trim()) {
    tabsSendMessage(feedbackTabId, {
      type: "DS_QUICK_LESS_LIKE_TIMING",
      botId,
      timing: {
        workerReadyMs: Number(timed.workerReadyMs || 0),
        coordinatorWaitMs: Number(timed.coordinatorWaitMs || 0),
        feedbackMs: Number(timed.feedbackMs || timed.elapsedMs || 0),
        availabilityMs: Number(timed.availabilityMs || 0),
        ratingMs: Number(timed.ratingMs || 0),
        userLookupMs: Number(timed.userLookupMs || 0),
        historyPersistMs,
        totalMs: Number(timed.totalMs || 0),
        requestElapsedMs: Number(timed.elapsedMs || 0),
        networkAttempts: Number(timed.networkAttempts || 0),
        status: String(timed.status || "")
      }
    }).catch?.(() => null);
  }
  return timed;
}
