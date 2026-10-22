"use strict";

// Feature-owned background helpers: browser-tabs. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function storageSessionGet(keys) {
  return new Promise(resolve => {
    try {
      if (!chrome.storage?.session?.get) return resolve({});
      chrome.storage.session.get(keys, result => resolve(result || {}));
    } catch { resolve({}); }
  });
}

function storageSessionSet(values) {
  return new Promise(resolve => {
    try {
      if (!chrome.storage?.session?.set) return resolve(false);
      chrome.storage.session.set(values, () => resolve(!chrome.runtime.lastError));
    } catch { resolve(false); }
  });
}

async function getHelperRuntimeSession() {
  if (helperRuntimeSessionPromise) return helperRuntimeSessionPromise;
  helperRuntimeSessionPromise = (async () => {
    if (!chrome.storage?.session?.get || !chrome.storage?.session?.set) return { id: "", created: false, supported: false };
    const stored = await storageSessionGet([HELPER_RUNTIME_SESSION_KEY]);
    let id = String(stored[HELPER_RUNTIME_SESSION_KEY] || "").trim();
    if (id) return { id, created: false, supported: true };
    id = `hs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await storageSessionSet({ [HELPER_RUNTIME_SESSION_KEY]: id });
    return { id, created: true, supported: true };
  })();
  return helperRuntimeSessionPromise;
}

function normalizeActiveQuickDislikeJobs(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const jobs = source.jobs && typeof source.jobs === "object" ? source.jobs : {};
  const normalized = {};
  for (const [jobId, value] of Object.entries(jobs)) {
    const botId = String(value?.botId || "").trim().toLowerCase();
    if (!jobId || !/^[0-9a-f-]{20,}$/i.test(botId)) continue;
    normalized[jobId] = {
      jobId,
      botId,
      botName: String(value?.botName || "").slice(0, 160),
      chatUrl: String(value?.chatUrl || `https://spicychat.ai/chat/${botId}`),
      bulkRunId: String(value?.bulkRunId || "").trim(),
      createdAt: Number(value?.createdAt || value?.startedAt || 0) || Date.now(),
      startedAt: Number(value?.startedAt || 0) || Date.now(),
      tabId: Number(value?.tabId || 0) || 0,
      recoveryCount: Math.max(0, Number(value?.recoveryCount || 0) || 0),
      status: String(value?.status || "active").slice(0, 80)
    };
  }
  return { version: 1, jobs: normalized };
}

async function getActiveQuickDislikeJobs() {
  const stored = await storageGet([QUICK_DISLIKE_ACTIVE_JOBS_KEY]);
  return normalizeActiveQuickDislikeJobs(stored[QUICK_DISLIKE_ACTIVE_JOBS_KEY]);
}

async function upsertActiveQuickDislikeJob(job) {
  const jobId = String(job?.jobId || "").trim();
  if (!jobId) return null;
  const active = await getActiveQuickDislikeJobs();
  active.jobs[jobId] = { ...(active.jobs[jobId] || {}), ...job, jobId };
  const rows = Object.values(active.jobs);
  if (rows.length > 40) {
    rows.sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
    active.jobs = Object.fromEntries(rows.slice(0, 40).map(row => [row.jobId, row]));
  }
  await storageSet({ [QUICK_DISLIKE_ACTIVE_JOBS_KEY]: active });
  return active.jobs[jobId] || null;
}

async function removeActiveQuickDislikeJob(jobId) {
  const id = String(jobId || "").trim();
  if (!id) return false;
  const active = await getActiveQuickDislikeJobs();
  if (!active.jobs[id]) return false;
  delete active.jobs[id];
  await storageSet({ [QUICK_DISLIKE_ACTIVE_JOBS_KEY]: active });
  return true;
}

async function recordHelperLifecycle(event, detail = {}) {
  const name = String(event || "unknown").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "unknown";
  const stored = await storageGet([HELPER_LIFECYCLE_DIAG_KEY]);
  const diag = stored[HELPER_LIFECYCLE_DIAG_KEY] && typeof stored[HELPER_LIFECYCLE_DIAG_KEY] === "object"
    ? stored[HELPER_LIFECYCLE_DIAG_KEY]
    : { version: 1, counts: {} };
  diag.version = 1;
  diag.counts = diag.counts && typeof diag.counts === "object" ? diag.counts : {};
  diag.counts[name] = Number(diag.counts[name] || 0) + 1;
  diag.lastEvent = name;
  diag.lastAt = Date.now();
  diag.lastDetail = Object.fromEntries(Object.entries(detail || {}).slice(0, 12).map(([key, value]) => [String(key).slice(0, 60), typeof value === "number" || typeof value === "boolean" ? value : String(value ?? "").slice(0, 180)]));
  await storageSet({ [HELPER_LIFECYCLE_DIAG_KEY]: diag });
  const workerFeature = /bot-status/i.test(name) ? "bot-status" : /less-like|recommendation/i.test(name) ? "less-like" : /dislike/i.test(name) ? "quick-dislike" : /listing/i.test(name) ? "listing-refill" : /persona/i.test(name) ? "persona-refresh" : "helper";
  qolBackgroundTrace("worker", workerFeature, { action: name, ...diag.lastDetail }, { critical: /lost|timeout|restart|error|closed-unexpected/i.test(name) });
  return diag;
}

function tabsGet(tabId) {
  return new Promise(resolve => {
    chrome.tabs.get(tabId, tab => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(tab || null);
    });
  });
}

function tabsQuery(queryInfo) {
  return new Promise(resolve => chrome.tabs.query(queryInfo, tabs => resolve(tabs || [])));
}

async function querySpicyChatTabsRobust() {
  const filtered = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  if (filtered.length) return filtered;

  // Some Chromium/Firefox extension-update states have returned an empty
  // URL-filtered query even while an allowed SpicyChat tab is visibly open.
  // Fall back to the ordinary tab list and filter locally before diagnostics
  // claims the browser has zero SpicyChat tabs. Host permission still limits
  // which URLs the extension can inspect.
  const all = await tabsQuery({});
  return all.filter(tab => isSpicyChatUrl(tab?.url || tab?.pendingUrl || ""));
}

async function getSpicyChatTabSummary() {
  const tabs = await querySpicyChatTabsRobust();
  const workers = tabs.filter(isDedicatedWorkerTab);
  const normal = tabs.filter(tab => !isDedicatedWorkerTab(tab));
  return {
    at: Date.now(),
    totalSpicyTabs: tabs.length,
    loadedNormal: normal.filter(tab => !tab.discarded).length,
    discardedNormal: normal.filter(tab => !!tab.discarded).length,
    workerTabs: workers.length,
    loadedWorkers: workers.filter(tab => !tab.discarded).length
  };
}

function tabsSendMessage(tabId, message) {
  return new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

function tabsSendMessageWithTimeout(tabId, message, timeoutMs = 10000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish({ __dsTimeout: true }), Math.max(500, Number(timeoutMs) || 10000));
    tabsSendMessage(tabId, message).then(finish).catch(() => finish(null));
  });
}

function tabsDiscard(tabId) {
  return new Promise(resolve => {
    if (typeof chrome.tabs.discard !== "function") {
      resolve({ ok: false, error: "tabs.discard is not available in this browser" });
      return;
    }

    chrome.tabs.discard(tabId, tab => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !!tab && !error, tab: tab || null, error });
    });
  });
}

function tabsReload(tabId, reloadProperties = {}) {
  return new Promise(resolve => {
    if (typeof chrome.tabs?.reload !== "function") {
      resolve({ ok: false, error: "tabs.reload is not available in this browser" });
      return;
    }
    try {
      chrome.tabs.reload(tabId, reloadProperties, () => {
        const error = chrome.runtime.lastError?.message || "";
        resolve({ ok: !error, error });
      });
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
    }
  });
}

function tabsRemove(tabId) {
  return new Promise(resolve => {
    chrome.tabs.remove(tabId, () => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !error, error });
    });
  });
}

function tabsUpdate(tabId, updateProperties) {
  return new Promise(resolve => {
    chrome.tabs.update(tabId, updateProperties, tab => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !!tab && !error, tab: tab || null, error });
    });
  });
}

function tabsCreate(createProperties) {
  return new Promise(resolve => {
    if (typeof chrome.tabs?.create !== "function") {
      resolve({ ok: false, error: "tabs.create is not available" });
      return;
    }
    chrome.tabs.create(createProperties, tab => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !!tab && !error, tab: tab || null, error });
    });
  });
}

function windowsCreate(createData) {
  return new Promise(resolve => {
    if (typeof chrome.windows?.create !== "function") {
      resolve({ ok: false, error: "windows.create is not available" });
      return;
    }
    chrome.windows.create(createData, window => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !!window && !error, window: window || null, error });
    });
  });
}

function windowsUpdate(windowId, updateInfo) {
  return new Promise(resolve => {
    if (!Number.isFinite(Number(windowId)) || typeof chrome.windows?.update !== "function") {
      resolve({ ok: false, error: "windows.update is not available" });
      return;
    }

    chrome.windows.update(Number(windowId), updateInfo, window => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !!window && !error, window: window || null, error });
    });
  });
}

function scheduleCardTokenDiagWrite() {
  if (cardTokenDiagWriteTimer) return;
  cardTokenDiagWriteTimer = setTimeout(() => {
    cardTokenDiagWriteTimer = null;
    try { chrome.storage.local.set({ [CARD_TOKEN_DIAG_KEY]: { ...cardTokenDiag } }, () => void chrome.runtime.lastError); } catch {}
  }, 1200);
}

function recordCardTokenFetch(status, extra = {}) {
  cardTokenDiag.requests += status === "start" ? 1 : 0;
  if (status === "success") cardTokenDiag.successes += 1;
  if (status === "timeout") cardTokenDiag.timeouts += 1;
  if (status === "parse-failure") cardTokenDiag.parseFailures += 1;
  if (status === "network-failure") cardTokenDiag.networkFailures += 1;
  const http = Number(extra.httpStatus || 0);
  if (status === "http") {
    if (http === 401) cardTokenDiag.http401 += 1;
    else if (http === 403) cardTokenDiag.http403 += 1;
    else if (http === 404) cardTokenDiag.http404 += 1;
    else if (http === 429) cardTokenDiag.http429 += 1;
    else cardTokenDiag.httpOther += 1;
  }
  if (status === "start") {
    if (extra.authProvided) cardTokenDiag.authProvided += 1;
    else cardTokenDiag.authMissing += 1;
    if (extra.authSource === "indexeddb") cardTokenDiag.indexedDbAuth += 1;
    else if (extra.authSource && extra.authSource !== "none") cardTokenDiag.storageAuth += 1;
  }
  if (status !== "start") {
    cardTokenDiag.lastStatus = String(status || "unknown");
    cardTokenDiag.lastHttpStatus = http;
    cardTokenDiag.lastElapsedMs = Math.max(0, Math.round(Number(extra.elapsedMs || 0)));
    cardTokenDiag.lastAt = Date.now();
  }
  scheduleCardTokenDiagWrite();
}

async function fetchCardTokenCharacter(message) {
  const botId = String(message?.botId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(botId)) return { ok: false, status: "invalid-id" };
  const authToken = String(message?.authToken || "").trim();
  const guestUserId = String(message?.guestUserId || "").trim();
  const authSource = String(message?.authSource || (authToken ? "storage" : "none"));
  recordCardTokenFetch("start", { authProvided: !!authToken, authSource });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CARD_TOKEN_TIMEOUT_MS);
  const started = Date.now();
  const network = qolBackgroundNetworkStart("card-token-info", "GET", `${CARD_TOKEN_API_BASE}${encodeURIComponent(botId)}`, { transport: "background" });
  const headers = { Accept: "application/json", "x-app-id": "spicychat" };
  if (authToken && authToken.length < 12000) headers.Authorization = `Bearer ${authToken}`;
  if (/^[0-9a-f-]{20,}$/i.test(guestUserId)) headers["x-guest-userid"] = guestUserId;
  try {
    const response = await fetch(`${CARD_TOKEN_API_BASE}${encodeURIComponent(botId)}`, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers,
      signal: controller.signal
    });
    const elapsedMs = Date.now() - started;
    if (!response.ok) {
      qolBackgroundNetworkEnd(network, { status: response.status, ok: false, outcome: "http" });
      recordCardTokenFetch("http", { httpStatus: response.status, elapsedMs });
      return { ok: false, status: "http", httpStatus: response.status, elapsedMs };
    }
    let data;
    try { data = await response.json(); }
    catch (error) {
      qolBackgroundNetworkEnd(network, { status: response.status, ok: false, outcome: "parse-failure" });
      recordCardTokenFetch("parse-failure", { elapsedMs });
      return { ok: false, status: "parse-failure", elapsedMs, error: error?.message || String(error) };
    }
    qolBackgroundNetworkEnd(network, { status: response.status, ok: true, outcome: "success" });
    recordCardTokenFetch("success", { httpStatus: response.status, elapsedMs });
    return { ok: true, status: "success", httpStatus: response.status, elapsedMs, data };
  } catch (error) {
    qolBackgroundNetworkEnd(network, { status: 0, ok: false, outcome: error?.name === "AbortError" ? "timeout" : "network-failure" });
    const elapsedMs = Date.now() - started;
    if (error?.name === "AbortError") {
      recordCardTokenFetch("timeout", { elapsedMs });
      return { ok: false, status: "timeout", elapsedMs };
    }
    recordCardTokenFetch("network-failure", { elapsedMs });
    return { ok: false, status: "network-failure", elapsedMs, error: error?.message || String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function recordCardTokenBridge(message) {
  cardTokenDiag.mainWorldRequests += 1;
  const status = String(message?.status || "failed");
  if (status === "success") cardTokenDiag.mainWorldSuccesses += 1;
  else cardTokenDiag.mainWorldFailures += 1;
  if (String(message?.authSource || "") === "captured-main-world") cardTokenDiag.mainWorldCapturedAuth += 1;
  cardTokenDiag.lastStatus = `main-${status}`;
  cardTokenDiag.lastHttpStatus = Number(message?.httpStatus || 0);
  cardTokenDiag.lastElapsedMs = Math.max(0, Math.round(Number(message?.elapsedMs || 0)));
  cardTokenDiag.lastAt = Date.now();
  scheduleCardTokenDiagWrite();
  return { ok: true };
}

function isSpicyChatUrl(url) {
  try {
    const parsed = new URL(url || "");
    return parsed.protocol === "https:" && (
      parsed.hostname === "spicychat.ai" ||
      parsed.hostname === "www.spicychat.ai"
    );
  } catch {
    return false;
  }
}

function autoAfkScopeForUrl(url) {
  if (!isSpicyChatUrl(url)) return null;

  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";

    if (/^\/chat\/[^/]+/i.test(pathname)) return "chat";
    if (pathname === "/") return "home";

    if (
      /^\/profile(?:\/|$)/i.test(pathname) ||
      /^\/users?(?:\/|$)/i.test(pathname) ||
      /^\/creator(?:\/|$)/i.test(pathname) ||
      /^\/chatbot\/(?!create(?:\/|$))[^/]+/i.test(pathname) ||
      /^\/character(?:s)?(?:\/|$)/i.test(pathname)
    ) {
      return "profile";
    }
  } catch {}

  return null;
}

function autoAfkApplies(url, settings) {
  const scope = autoAfkScopeForUrl(url);
  const noExplicitScope = settings?.autoAfkEnabled === true &&
    settings.autoAfkChats === false && !settings.autoAfkHome && !settings.autoAfkProfiles;
  // Auto-AFK should never be silently "on but monitoring nothing". Older
  // installs can carry all-false scope values from the pre-granular defaults;
  // in that legacy state, chat pages remain the safe/default target.
  if (scope === "chat") return settings.autoAfkChats !== false || noExplicitScope;
  if (scope === "home") return !!settings.autoAfkHome;
  if (scope === "profile") return !!settings.autoAfkProfiles;
  return false;
}

function duplicateTabApplies(url, settings) {
  const scope = autoAfkScopeForUrl(url);
  if (scope === "chat") return settings.duplicateTabChats !== false;
  if (scope === "home") return !!settings.duplicateTabHome;
  if (scope === "profile") return !!settings.duplicateTabProfiles;
  return false;
}

function duplicateTabKey(url, settings) {
  if (!duplicateTabApplies(url, settings)) return "";

  try {
    const parsed = new URL(url);
    const scope = autoAfkScopeForUrl(url);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";

    // Hash fragments are client-side position/state, not a different SpicyChat page.
    // Keep query parameters because SpicyChat can use them for meaningful page state.
    return `${scope}:${pathname}${parsed.search}`;
  } catch {
    return "";
  }
}

async function getDuplicateTabSettings() {
  const result = await storageGet(["settings"]);
  return {
    ...DUPLICATE_TAB_DEFAULTS,
    ...(result.settings || {})
  };
}

function duplicateKeeperForGroup(group, initiatorTabId = null, keepMode = "new") {
  const tabs = Array.isArray(group) ? group.filter(tab => tab?.id) : [];
  if (!tabs.length) return null;

  // Pinned tabs are deliberately never auto-closed, so prefer one as the keeper
  // before applying the normal duplicate strategy.
  const pinned = tabs.filter(tab => tab.pinned);
  if (pinned.length) {
    const activePinned = pinned.find(tab => tab.active);
    return activePinned || pinned.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
  }

  const initiator = initiatorTabId
    ? tabs.find(tab => Number(tab.id) === Number(initiatorTabId))
    : null;

  if (initiator && keepMode === "new") return initiator;

  if (initiator && keepMode === "existing") {
    const alternatives = tabs.filter(tab => Number(tab.id) !== Number(initiatorTabId));
    if (alternatives.length) {
      const activeExisting = alternatives.find(tab => tab.active);
      return activeExisting || alternatives.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
    }
  }

  const active = tabs.find(tab => tab.active);
  if (active) return active;
  return tabs.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
}

async function focusDuplicateKeeper(tab) {
  if (!tab?.id) return;
  if (Number.isFinite(Number(tab.windowId))) await windowsUpdate(tab.windowId, { focused: true });
  await tabsUpdate(tab.id, { active: true });
}

async function writeDuplicateTabStatus(status) {
  try {
    await storageSet({ [DUPLICATE_TAB_STATUS_KEY]: status });
  } catch {}
}

async function runDuplicateTabScan(options = {}) {
  const settings = await getDuplicateTabSettings();
  const summary = {
    at: Date.now(),
    enabled: settings.enabled !== false && !!settings.duplicateTabGuardEnabled,
    checked: 0,
    groups: 0,
    duplicates: 0,
    closed: 0,
    protected: 0,
    failed: 0,
    focusedExisting: 0,
    keepMode: settings.duplicateTabKeepMode === "existing" ? "existing" : "new",
    errors: []
  };

  if (!summary.enabled) {
    await writeDuplicateTabStatus(summary);
    return summary;
  }

  const tabs = await tabsQuery({
    url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"]
  });
  const groups = new Map();

  for (const tab of tabs) {
    if (!tab?.id || isDedicatedWorkerTab(tab) || tabCleanupWorkerTabIds.has(Number(tab.id)) || quickDislikeWorkerTabIds.has(Number(tab.id)) || quickLessLikeWorkerTabIds.has(Number(tab.id)) || botStatusWorkerTabIds.has(Number(tab.id)) || listingRefillWorkerTabIds.has(Number(tab.id)) || isQuickDislikeWorkerUrl(tab.url || tab.pendingUrl) || isQuickLessLikeWorkerUrl(tab.url || tab.pendingUrl) || isBotStatusWorkerUrl(tab.url || tab.pendingUrl) || isListingRefillWorkerUrl(tab.url || tab.pendingUrl)) continue;
    const key = duplicateTabKey(tab.url || tab.pendingUrl, settings);
    if (!key) continue;
    summary.checked += 1;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }

  const initiatorTabId = Number(options.initiatorTabId) || null;
  let keeperToFocus = null;
  let initiatorWasClosed = false;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    summary.groups += 1;
    summary.duplicates += group.length - 1;

    // Automatic catches use the configured keep-new / keep-existing strategy.
    // Pinned tabs still win regardless of that preference.
    const keeper = duplicateKeeperForGroup(group, initiatorTabId && group.some(tab => Number(tab.id) === initiatorTabId) ? initiatorTabId : null, settings.duplicateTabKeepMode === "existing" ? "existing" : "new");
    if (!keeper?.id) continue;

    for (const tab of group) {
      if (!tab?.id || Number(tab.id) === Number(keeper.id)) continue;

      // Never auto-close pinned tabs. If multiple pinned copies exist, report them
      // as protected and leave the user's deliberate browser state alone.
      if (tab.pinned) {
        summary.protected += 1;
        continue;
      }

      const result = await tabsRemove(tab.id);
      if (result.ok) {
        summary.closed += 1;
        await removeAutoAfkActivity(tab.id);
        if (initiatorTabId && Number(tab.id) === initiatorTabId) {
          initiatorWasClosed = true;
          keeperToFocus = keeper;
        }
      } else {
        summary.failed += 1;
        if (result.error && summary.errors.length < 3) summary.errors.push(result.error);
      }
    }
  }

  if (initiatorWasClosed && keeperToFocus && options.focusExisting !== false && settings.duplicateTabFocusExisting !== false) {
    await focusDuplicateKeeper(keeperToFocus);
    summary.focusedExisting = 1;
  }

  await writeDuplicateTabStatus(summary);
  return summary;
}
