"use strict";

// Feature-owned background helpers: worker-bot-status. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function isBotStatusWorkerUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return isSpicyChatUrl(parsed.href) && parsed.searchParams.get("dsQolBotStatusWorker") === "1";
  } catch { return false; }
}

function isUsableBotStatusPage(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!isSpicyChatUrl(parsed.href)) return false;
    // Do not borrow a tab that belongs to another QoL helper workflow.
    if (parsed.searchParams.get("dsQolRecommendationWorker") === "1") return false;
    if (parsed.searchParams.get("dsQuickDislike") === "1") return false;
    if (parsed.searchParams.get("dsListFill") === "1") return false;
    if (parsed.searchParams.get("dsBotStatus") === "1") return false;
    return true;
  } catch { return false; }
}

function createBotStatusWorkerSessionId() {
  try {
    if (crypto?.randomUUID) return `bot-status:${crypto.randomUUID()}`;
  } catch {}
  return `bot-status:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function botStatusWorkerLastActivityAt() {
  return Math.max(Number(botStatusWorkerHeartbeatAt || 0), Number(botStatusWorkerActivityAt || 0));
}

function botStatusHeartbeatFresh(tab = null) {
  const lastAt = botStatusWorkerLastActivityAt();
  if (!lastAt) return false;
  const inactiveOwnedHelper = !!botStatusWorkerOwned && tab?.active !== true;
  const ttl = (inactiveOwnedHelper || botStatusWorkerRequestActive)
    ? BOT_STATUS_WORKER_THROTTLED_TTL_MS
    : BOT_STATUS_WORKER_HEARTBEAT_TTL_MS;
  return Date.now() - lastAt <= ttl;
}

async function runTrackedBotStatusRequest(task) {
  botStatusWorkerRequestActive = true;
  botStatusWorkerActivityAt = Date.now();
  try {
    return await task();
  } finally {
    botStatusWorkerRequestActive = false;
    botStatusWorkerActivityAt = Date.now();
  }
}

function noteBotStatusWorkerHeartbeat(tabId, sessionId = "") {
  const id = Number(tabId || 0);
  if (!id || Number(botStatusWorkerTabId || 0) !== id) return false;
  const supplied = String(sessionId || "").trim();
  if (supplied && botStatusWorkerSessionId && supplied !== botStatusWorkerSessionId) return false;
  if (supplied && !botStatusWorkerSessionId) botStatusWorkerSessionId = supplied;
  botStatusWorkerHeartbeatAt = Date.now();
  return true;
}

function botStatusRestartDelayMs(nextRestartCount) {
  const count = Math.max(1, Number(nextRestartCount || 1));
  if (count <= 1) return 0;
  if (count === 2) return 5000;
  if (count === 3) return 15000;
  if (count === 4) return 30000;
  return 60000;
}

async function waitForBotStatusRestartBackoff() {
  const waitMs = Math.max(0, Number(botStatusWorkerRestartBackoffUntil || 0) - Date.now());
  if (!waitMs) return;
  await recordHelperLifecycle("bot-status-worker-backoff", {
    waitMs,
    restartCount: Number(botStatusWorkerRestartCount || 0)
  });
  await new Promise(resolve => setTimeout(resolve, waitMs));
}

async function probeBotStatusWorker(tabId, timeoutMs = 7000) {
  const id = Number(tabId || 0);
  if (!id) return { ok: false, ready: false, status: "worker-missing" };
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 7000);
  let last = null;
  while (Date.now() < deadline) {
    const tab = await tabsGet(id);
    if (!tab) return { ok: false, ready: false, status: "worker-closed" };
    const remaining = Math.max(500, deadline - Date.now());
    await tabsSendMessageWithTimeout(id, {
      type: "DS_BOT_STATUS_MARK_WORKER",
      phase: "probe",
      sessionId: botStatusWorkerSessionId || ""
    }, Math.min(900, remaining));
    const response = await tabsSendMessageWithTimeout(id, {
      type: "DS_BOT_STATUS_WORKER_READY",
      sessionId: botStatusWorkerSessionId || ""
    }, Math.min(1400, remaining));
    if (response?.__dsTimeout) last = { ok: false, ready: false, status: "worker-message-timeout" };
    else if (response) last = response;
    if (response?.ready) {
      botStatusWorkerActivityAt = Date.now();
      noteBotStatusWorkerHeartbeat(id, response?.sessionId || botStatusWorkerSessionId);
      return { ...response, ok: true, ready: true, tabId: id, sessionId: botStatusWorkerSessionId || response?.sessionId || "" };
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return { ...(last || {}), ok: false, ready: false, status: last?.status || "worker-timeout", tabId: id };
}

async function rememberBotStatusWorker(tabId, owned, sessionId = botStatusWorkerSessionId) {
  const id = Number(tabId || 0);
  const nextSessionId = id ? String(sessionId || botStatusWorkerSessionId || createBotStatusWorkerSessionId()) : "";
  botStatusWorkerSessionId = nextSessionId;
  if (!id) {
    botStatusWorkerHeartbeatAt = 0;
    botStatusWorkerActivityAt = 0;
    botStatusWorkerRequestActive = false;
  }
  await storageSessionSet({
    [BOT_STATUS_WORKER_SESSION_TAB_KEY]: id || 0,
    [BOT_STATUS_WORKER_SESSION_OWNED_KEY]: !!owned,
    [BOT_STATUS_WORKER_SESSION_ID_KEY]: nextSessionId
  });
}

async function restoreBotStatusWorkerSession() {
  if (Number(botStatusWorkerTabId || 0)) return;
  const stored = await storageSessionGet([
    BOT_STATUS_WORKER_SESSION_TAB_KEY,
    BOT_STATUS_WORKER_SESSION_OWNED_KEY,
    BOT_STATUS_WORKER_SESSION_ID_KEY
  ]);
  const id = Number(stored?.[BOT_STATUS_WORKER_SESSION_TAB_KEY] || 0);
  if (!id) return;
  const tab = await tabsGet(id);
  if (!tab || !isUsableBotStatusPage(tab.url || tab.pendingUrl || "")) {
    await rememberBotStatusWorker(0, false);
    return;
  }
  botStatusWorkerTabId = id;
  botStatusWorkerOwned = !!stored?.[BOT_STATUS_WORKER_SESSION_OWNED_KEY];
  botStatusWorkerSessionId = String(stored?.[BOT_STATUS_WORKER_SESSION_ID_KEY] || botStatusWorkerSessionId || createBotStatusWorkerSessionId());
  if (botStatusWorkerOwned) botStatusWorkerTabIds.add(id);
}

async function releaseBotStatusWorker({ reason = "normal-release" } = {}) {
  await restoreBotStatusWorkerSession();
  const id = Number(botStatusWorkerTabId || 0);
  const owned = !!botStatusWorkerOwned;
  botStatusWorkerTabId = null;
  botStatusWorkerOwned = false;
  botStatusWorkerHeartbeatAt = 0;
  botStatusWorkerActivityAt = 0;
  botStatusWorkerRequestActive = false;
  botStatusWorkerTabIds.clear();
  await rememberBotStatusWorker(0, false, "");
  if (!id || !owned) return 0;
  const tab = await tabsGet(id);
  if (!tab) return 0;
  botStatusWorkerExpectedCloseIds.add(id);
  await tabsRemove(id);
  await recordHelperLifecycle("bot-status-worker-released", { tabId: id, reason: String(reason || "normal-release") });
  return 1;
}

async function findBorrowableBotStatusTab() {
  const tabs = await tabsQuery({});
  const candidates = tabs
    .filter(tab => tab?.id && isUsableBotStatusPage(tab.url || tab.pendingUrl || ""))
    .sort((a, b) => Number(b.active || false) - Number(a.active || false) || Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  for (const tab of candidates) {
    const ready = await probeBotStatusWorker(Number(tab.id), 1200);
    if (ready?.ready) return Number(tab.id);
  }
  return 0;
}

async function prepareBotStatusWorker({ forceOwnHelper = false } = {}) {
  await restoreBotStatusWorkerSession();
  let tab = Number.isFinite(Number(botStatusWorkerTabId)) ? await tabsGet(Number(botStatusWorkerTabId)) : null;

  // Bulk Bot Status scans deliberately use one QoL-owned Home helper. Do not
  // keep borrowing an arbitrary profile/editor/chat tab just because it has the
  // content scripts loaded; those pages can have different auth/runtime state.
  if (forceOwnHelper && tab?.id && !botStatusWorkerOwned) {
    botStatusWorkerTabId = null;
    botStatusWorkerOwned = false;
    botStatusWorkerTabIds.clear();
    await rememberBotStatusWorker(0, false);
    tab = null;
  }

  if (tab?.id) {
    const ready = await probeBotStatusWorker(Number(tab.id), botStatusWorkerOwned ? 10000 : 1500);
    if (ready?.ready) {
      await rememberBotStatusWorker(Number(tab.id), !!botStatusWorkerOwned, ready?.sessionId || botStatusWorkerSessionId);
      await recordHelperLifecycle("bot-status-worker-ready", {
        tabId: Number(tab.id),
        reused: true,
        owned: !!botStatusWorkerOwned,
        sessionId: botStatusWorkerSessionId || ""
      });
      return { tabId: Number(tab.id), owned: !!botStatusWorkerOwned, ready: true, sessionId: botStatusWorkerSessionId || "" };
    }
    // A router URL change is no longer treated as worker death. If the worker
    // is still heartbeating, keep the durable tab identity and let the API
    // request retry through the existing serial deadline.
    if (botStatusWorkerOwned && botStatusHeartbeatFresh(tab)) {
      await recordHelperLifecycle("bot-status-worker-throttle-aware-alive", {
        tabId: Number(tab.id),
        status: String(ready?.status || "not-ready"),
        active: !!tab.active,
        requestActive: !!botStatusWorkerRequestActive,
        heartbeatAgeMs: botStatusWorkerHeartbeatAt ? Date.now() - Number(botStatusWorkerHeartbeatAt) : -1,
        activityAgeMs: botStatusWorkerLastActivityAt() ? Date.now() - botStatusWorkerLastActivityAt() : -1,
        throttleGraceMs: BOT_STATUS_WORKER_THROTTLED_TTL_MS
      });
      return {
        tabId: Number(tab.id),
        owned: true,
        ready: true,
        status: "heartbeat-alive",
        sessionId: botStatusWorkerSessionId || ""
      };
    }
    await recordHelperLifecycle("bot-status-worker-lost", { tabId: Number(tab.id), owned: !!botStatusWorkerOwned, status: String(ready?.status || "not-ready") });
    if (botStatusWorkerOwned) {
      botStatusWorkerExpectedCloseIds.add(Number(tab.id));
      await tabsRemove(Number(tab.id));
    }
    botStatusWorkerTabId = null;
    botStatusWorkerOwned = false;
    botStatusWorkerHeartbeatAt = 0;
    botStatusWorkerActivityAt = 0;
    botStatusWorkerRequestActive = false;
    botStatusWorkerTabIds.clear();
    await rememberBotStatusWorker(0, false, "");
  }

  if (!forceOwnHelper) {
    const borrowedId = await findBorrowableBotStatusTab();
    if (borrowedId) {
      botStatusWorkerTabId = borrowedId;
      botStatusWorkerOwned = false;
      await rememberBotStatusWorker(borrowedId, false);
      return { tabId: borrowedId, owned: false };
    }
  }

  await waitForBotStatusRestartBackoff();
  const existing = (await tabsQuery({})).filter(item => item?.id && isBotStatusWorkerUrl(item.url || item.pendingUrl || ""));
  existing.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  let helper = existing[0] || null;
  for (const duplicate of existing.slice(1)) await tabsRemove(Number(duplicate.id));
  if (!botStatusWorkerSessionId) botStatusWorkerSessionId = createBotStatusWorkerSessionId();
  if (!helper?.id) {
    await recordHelperLifecycle("bot-status-worker-opening", {
      reason: "create-owned-home-helper",
      sessionId: botStatusWorkerSessionId
    });
    const created = await tabsCreate({ url: BOT_STATUS_HOME_WORKER_URL, active: false });
    helper = created?.ok ? created.tab : null;
    if (helper?.id) await recordHelperLifecycle("bot-status-worker-restart", {
      tabId: Number(helper.id),
      reason: "new-owned-helper",
      sessionId: botStatusWorkerSessionId,
      restartCount: Number(botStatusWorkerRestartCount || 0)
    });
  }
  const tabId = Number(helper?.id || 0);
  if (!tabId) return { tabId: 0, owned: false };
  botStatusWorkerTabId = tabId;
  botStatusWorkerOwned = true;
  botStatusWorkerTabIds.clear();
  botStatusWorkerTabIds.add(tabId);
  await rememberBotStatusWorker(tabId, true, botStatusWorkerSessionId);
  const ready = await probeBotStatusWorker(tabId, 10000);
  if (!ready?.ready) {
    await recordHelperLifecycle("bot-status-worker-lost", { tabId, owned: true, status: String(ready?.status || "worker-timeout"), reason: "startup-not-ready" });
    return { tabId, owned: true, ready: false, status: ready?.status || "worker-timeout" };
  }
  noteBotStatusWorkerHeartbeat(tabId, ready?.sessionId || botStatusWorkerSessionId);
  await recordHelperLifecycle("bot-status-worker-ready", {
    tabId,
    reused: false,
    owned: true,
    sessionId: botStatusWorkerSessionId || ""
  });
  await tabsSendMessage(tabId, {
    type: "DS_BOT_STATUS_DIAG_EVENT",
    event: "bot-status-worker-ready",
    detail: { tabId, owned: true, sessionId: botStatusWorkerSessionId || "" }
  });
  return { tabId, owned: true, ready: true, sessionId: botStatusWorkerSessionId || "" };
}

function botStatusApiResponseIsTransient(response) {
  const status = String(response?.status || "");
  if (["api-bridge-not-ready", "auth-unavailable", "worker-no-response"].includes(status)) return true;
  const reason = String(response?.reason || "");
  return /auth(?:entication)?[^.;]{0,30}(?:unavailable|not ready)|no reusable auth|bridge[^.;]{0,30}(?:unavailable|timeout|not ready)/i.test(reason);
}

async function waitForBotStatusApiCheck(tabId, botId, timeoutMs = 12000) {
  const id = Number(tabId || 0);
  if (!id) return null;
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 12000);
  let response = null;
  do {
    const remaining = Math.max(500, deadline - Date.now());
    response = await tabsSendMessageWithTimeout(id, { type: "DS_BOT_STATUS_API_CHECK", botId }, Math.min(12000, remaining));
    if (response?.__dsTimeout) {
      return { ok: false, ready: true, status: "worker-timeout", httpStatus: 0, reason: "Bot Status helper did not answer this API check in time." };
    }
    if (response && !botStatusApiResponseIsTransient(response)) return response;
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 400));
  } while (Date.now() < deadline);
  return response || { ok: false, ready: true, status: "worker-timeout", httpStatus: 0, reason: "Bot Status helper timed out before returning a result." };
}

// Reuse only recent affirmative ad-hoc checks. Explicit/full scans always
// bypass this cache; private, missing and ambiguous results are never reused.
const botStatusRecentAnswers = new Map();
const botStatusPendingAnswers = new Map();
const BOT_STATUS_RECENT_TTL_MS = 3 * 60_000;
const botStatusCheckStats = { requested: 0, cached: 0, coalesced: 0, checked: 0,
  available: 0, restricted: 0, unavailable: 0, failed: 0, rateLimited: 0 };
let botStatusApiCooldownUntil = 0;

async function runBotStatusHelperCheck(message) {
  const id = String(message?.botId || "").trim().toLowerCase();
  botStatusCheckStats.requested++;
  const explicit = !!message?.forceOwnHelper || !!message?.forceRefresh || !!message?.bulkScan || !!message?.keepHelper;
  if (Date.now() < botStatusApiCooldownUntil) {
    return { ok: false, ready: true, status: "rate-limited", httpStatus: 429,
      retryAfterMs: botStatusApiCooldownUntil - Date.now(), reason: "Bot Status checks paused after HTTP 429. Retry after the cooldown." };
  }
  if (!explicit) {
    const cached = botStatusRecentAnswers.get(id);
    if (cached && Date.now() - cached.savedAt <= BOT_STATUS_RECENT_TTL_MS) {
      botStatusCheckStats.cached++;
      return { ...cached.response, cacheHit: true, cachedAt: cached.savedAt };
    }
  }
  const key = `${id}:${explicit ? "fresh" : "ordinary"}`;
  const pending = botStatusPendingAnswers.get(key);
  if (pending) { botStatusCheckStats.coalesced++; return pending; }
  const task = (async () => {
    const result = await runUncachedBotStatusHelperCheck(message);
    botStatusCheckStats.checked++;
    const status = String(result?.status || "unknown");
    if (Object.prototype.hasOwnProperty.call(botStatusCheckStats, status)) botStatusCheckStats[status]++;
    else if (!result?.ok) botStatusCheckStats.failed++;
    if (Number(result?.httpStatus) === 429 || status === "rate-limited") {
      botStatusCheckStats.rateLimited++;
      botStatusApiCooldownUntil = Date.now() + Math.max(30_000, Math.min(5 * 60_000, Number(result?.retryAfterMs || 60_000)));
    }
    if (!explicit && status === "available" && result?.ok && result?.archiveSnapshot) {
      botStatusRecentAnswers.set(id, { savedAt: Date.now(), response: result });
      if (botStatusRecentAnswers.size > 800) {
        for (const key of botStatusRecentAnswers.keys()) {
          botStatusRecentAnswers.delete(key);
          if (botStatusRecentAnswers.size <= 600) break;
        }
      }
    }
    return result;
  })();
  botStatusPendingAnswers.set(key, task);
  try { return await task; }
  finally { if (botStatusPendingAnswers.get(key) === task) botStatusPendingAnswers.delete(key); }
}

function currentBotStatusCheckStats() {
  return { ...botStatusCheckStats, cacheEntries: botStatusRecentAnswers.size,
    inFlight: botStatusPendingAnswers.size,
    cooldownMs: Math.max(0, botStatusApiCooldownUntil - Date.now()) };
}

async function runUncachedBotStatusHelperCheck(message) {
  const botId = String(message?.botId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(botId)) return { ok: false, status: "invalid-bot" };

  const forceOwnHelper = !!message?.forceOwnHelper;
  let worker = await prepareBotStatusWorker({ forceOwnHelper });
  let tabId = Number(worker?.tabId || 0);
  if (!tabId) return { ok: false, ready: true, status: "worker-tab-failed", httpStatus: 0, reason: "Could not create or reuse the Bot Status helper." };

  // QoL-owned Home helpers get one total API deadline rather than stacking an
  // initial long request plus another long retry. A broken bot/runtime can
  // therefore never pin the whole serial scan indefinitely.
  let response = null;
  response = await runTrackedBotStatusRequest(() => withBackgroundJob("bot-status", { ownerTabId: tabId, detail: botId, maxHoldMs: 15000 }, async () => {
    if (worker.owned || forceOwnHelper) {
      return await waitForBotStatusApiCheck(tabId, botId, 12000);
    }
    const direct = await tabsSendMessageWithTimeout(tabId, { type: "DS_BOT_STATUS_API_CHECK", botId }, 10000);
    if (direct?.__dsTimeout) {
      return { ok: false, ready: true, status: "worker-timeout", httpStatus: 0, reason: "Bot Status helper did not answer this API check in time." };
    }
    return direct;
  }));

  const status = String(response?.status || "");
  const shouldRetryOnOwnHelper = !forceOwnHelper && !worker.owned && (!response || ["api-bridge-not-ready", "auth-unavailable", "worker-error", "unknown", "worker-timeout"].includes(status));
  if (shouldRetryOnOwnHelper) {
    botStatusWorkerTabId = null;
    botStatusWorkerOwned = false;
    await rememberBotStatusWorker(0, false);
    worker = await prepareBotStatusWorker({ forceOwnHelper: true });
    tabId = Number(worker?.tabId || 0);
    if (tabId) response = await runTrackedBotStatusRequest(() => withBackgroundJob("bot-status", { ownerTabId: tabId, detail: `${botId}:retry`, maxHoldMs: 15000 }, () => waitForBotStatusApiCheck(tabId, botId, 12000)));
  }

  const finalStatus = String(response?.status || "");
  if (finalStatus === "worker-timeout" && worker.owned) {
    const workerTab = await tabsGet(tabId);
    if (botStatusHeartbeatFresh(workerTab)) {
      // The page is alive; only this character request timed out. Keep the
      // worker and let the serial queue continue instead of rebuilding Home.
      await recordHelperLifecycle("bot-status-request-timeout-worker-alive", {
        tabId,
        heartbeatAgeMs: botStatusWorkerHeartbeatAt ? Date.now() - Number(botStatusWorkerHeartbeatAt) : -1,
        activityAgeMs: botStatusWorkerLastActivityAt() ? Date.now() - botStatusWorkerLastActivityAt() : -1,
        requestActive: !!botStatusWorkerRequestActive
      });
    } else {
      // Only a real request + heartbeat timeout is allowed to discard the
      // durable worker identity. Repeated restarts back off instead of hammering Home.
      botStatusWorkerRestartCount = Math.max(0, Number(botStatusWorkerRestartCount || 0)) + 1;
      const delayMs = botStatusRestartDelayMs(botStatusWorkerRestartCount);
      botStatusWorkerRestartBackoffUntil = Date.now() + delayMs;
      await recordHelperLifecycle("bot-status-worker-timeout", {
        tabId,
        restartCount: botStatusWorkerRestartCount,
        nextRestartDelayMs: delayMs,
        heartbeatAgeMs: botStatusWorkerHeartbeatAt ? Date.now() - botStatusWorkerHeartbeatAt : -1
      });
      await releaseBotStatusWorker({ reason: "request-and-heartbeat-timeout" });
    }
  } else {
    if (response && !["worker-error", "api-bridge-not-ready", "auth-unavailable", "worker-no-response"].includes(finalStatus)) {
      botStatusWorkerRestartCount = 0;
      botStatusWorkerRestartBackoffUntil = 0;
      noteBotStatusWorkerHeartbeat(tabId, worker?.sessionId || botStatusWorkerSessionId);
    }
    if (!message?.keepHelper) await releaseBotStatusWorker({ reason: "normal-release" });
  }
  return response || { ok: false, ready: true, status: "worker-no-response", httpStatus: 0, reason: "Bot Status helper returned no response." };
}
