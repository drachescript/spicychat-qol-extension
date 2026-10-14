"use strict";

// Feature-owned background helpers: update-recovery. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

async function readStaleRuntimeTabs() {
  const result = await storageGet([STALE_RUNTIME_TABS_KEY]);
  const value = result?.[STALE_RUNTIME_TABS_KEY];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function writeStaleRuntimeTabs(value = {}) {
  const clean = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  await storageSet({ [STALE_RUNTIME_TABS_KEY]: clean });
  return clean;
}

function markRuntimeReloadBadge(tabId, stale = true) {
  const id = Number(tabId || 0);
  if (!id || !chrome.action) return;
  try { chrome.action.setBadgeText({ tabId: id, text: stale ? "↻" : "" }, () => void chrome.runtime.lastError); } catch {}
  if (stale) {
    try { chrome.action.setBadgeBackgroundColor({ tabId: id, color: "#9a5a00" }, () => void chrome.runtime.lastError); } catch {}
    try { chrome.action.setTitle({ tabId: id, title: "SpicyChat QoL updated — stale tabs reload once automatically when active" }, () => void chrome.runtime.lastError); } catch {}
  } else {
    try { chrome.action.setTitle({ tabId: id, title: "SpicyChat QoL" }, () => void chrome.runtime.lastError); } catch {}
  }
}

async function markOpenSpicyTabsStaleAfterUpdate(version = "", previousVersion = "") {
  const tabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const stale = {};
  const now = Date.now();
  for (const tab of tabs) {
    if (!tab?.id || isDedicatedWorkerTab(tab)) continue;
    stale[String(tab.id)] = {
      at: now,
      version: String(version || ""),
      previousVersion: String(previousVersion || ""),
      url: String(tab.url || tab.pendingUrl || "").slice(0, 500),
      reason: "extension-update"
    };
    markRuntimeReloadBadge(tab.id, true);
  }
  await writeStaleRuntimeTabs(stale);
  return stale;
}

async function readStaleRuntimeAutoReloads() {
  const stored = await storageSessionGet([STALE_RUNTIME_AUTO_RELOAD_SESSION_KEY]);
  const value = stored?.[STALE_RUNTIME_AUTO_RELOAD_SESSION_KEY];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function writeStaleRuntimeAutoReloads(value = {}) {
  const clean = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  await storageSessionSet({ [STALE_RUNTIME_AUTO_RELOAD_SESSION_KEY]: clean });
  return clean;
}

async function maybeAutoReloadStaleActiveTab(tabOrId, trigger = "active") {
  const tab = typeof tabOrId === "object" && tabOrId
    ? tabOrId
    : await tabsGet(Number(tabOrId || 0));
  const id = Number(tab?.id || 0);
  if (!id || !tab?.active || tab.discarded || tab.status === "loading" || !isSpicyChatUrl(tab.url || tab.pendingUrl) || isDedicatedWorkerTab(tab)) return false;

  const stale = await readStaleRuntimeTabs();
  const entry = stale[String(id)];
  if (!entry) return false;

  // Auto-reload only when we know the page is stale because QoL itself was
  // updated, or when a live diagnostic ping explicitly reported an older
  // runtime version. A generic timeout/non-response keeps the manual fallback
  // instead of risking a reload loop for an unrelated page problem.
  const reason = String(entry.reason || "");
  if (!new Set(["extension-update", "runtime-version-mismatch"]).has(reason)) return false;

  const version = String(chrome.runtime.getManifest?.().version || entry.version || "unknown");
  const guardKey = `${id}:${version}`;
  const attempts = await readStaleRuntimeAutoReloads();
  if (attempts[guardKey]) return false;

  attempts[guardKey] = { at: Date.now(), reason, trigger: String(trigger || "active") };
  await writeStaleRuntimeAutoReloads(attempts);

  const result = await tabsReload(id, {});
  if (!result.ok) {
    delete attempts[guardKey];
    await writeStaleRuntimeAutoReloads(attempts);
    markRuntimeReloadBadge(id, true);
    return false;
  }
  return true;
}

async function autoReloadFocusedStaleTab(trigger = "extension-update") {
  const tabs = await tabsQuery({
    active: true,
    lastFocusedWindow: true,
    url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"]
  });
  const tab = tabs.find(item => item?.id && !isDedicatedWorkerTab(item));
  if (!tab) return false;
  return maybeAutoReloadStaleActiveTab(tab, trigger);
}

async function clearStaleRuntimeTab(tabId) {
  const id = Number(tabId || 0);
  if (!id) return false;
  const stale = await readStaleRuntimeTabs();
  const key = String(id);
  if (Object.prototype.hasOwnProperty.call(stale, key)) {
    delete stale[key];
    await writeStaleRuntimeTabs(stale);
  }
  markRuntimeReloadBadge(id, false);
  return true;
}

async function verifyOneSpicyTabRuntime(tabId) {
  const id = Number(tabId || 0);
  if (!id) return false;
  const tab = await tabsGet(id);
  if (!tab || tab.discarded || !isSpicyChatUrl(tab.url || tab.pendingUrl) || isDedicatedWorkerTab(tab)) {
    await clearStaleRuntimeTab(id);
    return true;
  }
  const expected = String(chrome.runtime.getManifest?.().version || "");
  const response = await tabsSendMessageWithTimeout(id, { type: "DS_TAB_DIAGNOSTIC_PING" }, 1800);
  const fresh = !!(response?.ok && String(response?.version || "") === expected);
  if (fresh) {
    await clearStaleRuntimeTab(id);
    return true;
  }
  const staleReason = response?.__dsTimeout
    ? "runtime-ping-timeout"
    : (response?.ok ? "runtime-version-mismatch" : "runtime-not-responding");
  const stale = await readStaleRuntimeTabs();
  stale[String(id)] = {
    at: Date.now(),
    version: expected,
    url: String(tab.url || tab.pendingUrl || "").slice(0, 500),
    reason: staleReason
  };
  await writeStaleRuntimeTabs(stale);
  markRuntimeReloadBadge(id, true);

  // A confirmed older runtime on the active tab is safe to repair
  // automatically. Timeouts/non-responses keep the manual fallback because
  // they can indicate an unrelated page problem rather than a version gap.
  if (staleReason === "runtime-version-mismatch" && tab.active) {
    const settings = await getAutoAfkSettings();
    if (settings.enabled !== false) {
      await maybeAutoReloadStaleActiveTab(tab, "runtime-version-mismatch");
    }
  }
  return false;
}

async function verifyOpenSpicyTabRuntimes() {
  const tabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  for (const tab of tabs) {
    if (!tab?.id || tab.discarded || isDedicatedWorkerTab(tab)) continue;
    await verifyOneSpicyTabRuntime(tab.id);
  }
}

async function rememberReleaseNotice(details = {}) {
  const version = chrome.runtime.getManifest?.().version || "";
  const reason = String(details.reason || "");
  const previousVersion = String(details.previousVersion || "");
  if (!version || !["install", "update"].includes(reason)) return;

  const existing = await storageGet([LAST_SEEN_VERSION_KEY, INSTALLED_VERSION_KEY]);
  if (reason === "update" && existing[INSTALLED_VERSION_KEY] === version) return;

  const payload = {
    [INSTALLED_VERSION_KEY]: version,
    [RELEASE_NOTICE_KEY]: {
      reason,
      version,
      previousVersion,
      at: Date.now()
    }
  };

  // Fresh installs do not need every historical setting marked as new.
  // On the first update after this system is introduced, start badges from
  // the version the user actually came from.
  if (!existing[LAST_SEEN_VERSION_KEY]) {
    payload[LAST_SEEN_VERSION_KEY] = reason === "update" && previousVersion
      ? previousVersion
      : version;
  }

  await storageSet(payload);
}

async function rememberOptionsSourceTab(tabId) {
  if (!tabId) return false;
  const tab = await tabsGet(tabId);
  if (!tab || !isSpicyChatUrl(tab.url)) return false;
  await storageSet({ [OPTIONS_SOURCE_TAB_KEY]: tabId });
  return true;
}

async function getOptionsSourceTab() {
  const stored = await storageGet([OPTIONS_SOURCE_TAB_KEY]);
  const storedId = Number(stored[OPTIONS_SOURCE_TAB_KEY]);

  if (Number.isFinite(storedId)) {
    const tab = await tabsGet(storedId);
    if (tab && isSpicyChatUrl(tab.url)) return tab;
  }

  const tabs = await querySpicyChatTabsRobust();

  const candidates = tabs
    .filter(tab => tab?.id)
    .sort((a, b) => {
      if (!!a.active !== !!b.active) return a.active ? -1 : 1;
      return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
    });

  const tab = candidates[0] || null;
  if (tab?.id) await storageSet({ [OPTIONS_SOURCE_TAB_KEY]: tab.id });
  return tab;
}

function sendTabMessage(tabId, message, timeoutMs = 900) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = setTimeout(() => finish(null), Math.max(250, Number(timeoutMs || 900)));
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        try { if (chrome.runtime.lastError) return finish(null); } catch {}
        finish(response || null);
      });
    } catch {
      finish(null);
    }
  });
}

async function getReachableDiagnosticContext() {
  const stored = await storageGet([OPTIONS_SOURCE_TAB_KEY, HELPER_LIFECYCLE_DIAG_KEY]);
  const storedId = Number(stored[OPTIONS_SOURCE_TAB_KEY]);
  const helperLifecycleDiagnostics = stored[HELPER_LIFECYCLE_DIAG_KEY] || null;
  const tabs = await querySpicyChatTabsRobust();
  const allCandidates = tabs.filter(tab => tab?.id);
  const loaded = allCandidates.filter(tab => !tab.discarded);
  const candidates = (loaded.length ? loaded : allCandidates).sort((a, b) => {
    if (!!a.active !== !!b.active) return a.active ? -1 : 1;
    if (Number(a.id) === storedId && Number(b.id) !== storedId) return -1;
    if (Number(b.id) === storedId && Number(a.id) !== storedId) return 1;
    return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
  });
  for (const tab of candidates) {
    const pageDiagnostics = await sendTabMessage(tab.id, { type: "DS_GET_PAGE_DIAGNOSTICS" }, 900);
    if (!pageDiagnostics) continue;
    await storageSet({ [OPTIONS_SOURCE_TAB_KEY]: tab.id });
    return { ok: true, runtimeAvailable: true, url: tab.url || "", title: tab.title || "", pageDiagnostics, helperLifecycleDiagnostics, tabId: tab.id };
  }
  const fallback = candidates[0] || allCandidates[0] || null;
  return {
    ok: !!fallback,
    runtimeAvailable: false,
    runtimeStatus: fallback ? "page-found-runtime-unreachable" : "no-spicychat-tab",
    runtimeError: fallback ? "A SpicyChat tab was found, but its QoL content runtime did not answer diagnostics. Reload that tab after an extension update to attach the current QoL runtime." : "No open SpicyChat tab was found.",
    url: fallback?.url || "", title: fallback?.title || "", pageDiagnostics: null, helperLifecycleDiagnostics, tabId: fallback?.id || 0
  };
}

async function relayQuickPanelStateToOptions(message) {
  const tab = await getOptionsSourceTab();
  if (!tab?.id) return { ok: false };

  return new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, message, response => {
      if (chrome.runtime.lastError || !response?.ok) {
        resolve({ ok: false });
        return;
      }

      resolve({
        ...response,
        ok: true,
        tabId: tab.id,
        tabLabel: tab.title || "the current SpicyChat tab"
      });
    });
  });
}

function storageLocalGet(keys) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(keys, result => resolve(result || {}));
    } catch {
      resolve({});
    }
  });
}

async function reopenTabSessionItems(items, mode = "current") {
  const cleaned = (Array.isArray(items) ? items : []).map(item => ({
    url: String(item?.url || "").trim(),
    windowId: Number(item?.windowId) || 0,
    index: Number(item?.index) || 0
  })).filter(item => /^https:\/\/(?:www\.)?spicychat\.ai\//i.test(item.url));
  if (!cleaned.length) return { opened: 0, failed: 0, windows: 0, skippedExisting: 0, openedUrls: [], skippedExistingUrls: [], failedUrls: [], errors: [] };

  const normalize = url => {
    try {
      const parsed = new URL(String(url || ""));
      parsed.hostname = "spicychat.ai";
      parsed.hash = "";
      const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
      return `${parsed.protocol}//${parsed.hostname}${pathname}${parsed.search}`;
    } catch { return String(url || "").replace(/#.*$/, ""); }
  };

  const existingTabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const existingUrls = new Set(existingTabs.map(tab => normalize(tab.url || tab.pendingUrl || "")).filter(Boolean));
  const skippedExistingItems = cleaned.filter(item => existingUrls.has(normalize(item.url)));
  const pending = cleaned.filter(item => !existingUrls.has(normalize(item.url)));
  const skippedExisting = skippedExistingItems.length;
  if (!pending.length) return { opened: 0, failed: 0, windows: 0, skippedExisting, openedUrls: [], skippedExistingUrls: skippedExistingItems.map(item => item.url), failedUrls: [], errors: [] };

  const errors = [];
  const openedUrls = [];
  const failedUrls = [];
  let opened = 0;
  let windows = 0;
  const createIntoWindow = async (windowId, list) => {
    for (const item of list) {
      const createProperties = { url: item.url, active: false };
      if (Number.isFinite(Number(windowId)) && Number(windowId) > 0) createProperties.windowId = Number(windowId);
      const result = await tabsCreate(createProperties);
      if (result.ok) {
        opened += 1;
        openedUrls.push(item.url);
      } else {
        failedUrls.push(item.url);
        errors.push(result.error || `Could not reopen ${item.url}`);
      }
      await new Promise(resolve => setTimeout(resolve, 650));
    }
  };

  if (mode === "new-window") {
    const first = pending[0];
    const created = await windowsCreate({ url: first.url, focused: true });
    if (!created.ok) return { opened: 0, failed: pending.length, windows: 0, skippedExisting, openedUrls: [], skippedExistingUrls: skippedExistingItems.map(item => item.url), failedUrls: pending.map(item => item.url), errors: [created.error || "Could not create a new window"] };
    opened = 1;
    openedUrls.push(first.url);
    windows = 1;
    await createIntoWindow(created.window?.id, pending.slice(1));
  } else if (mode === "saved-windows") {
    const groups = new Map();
    for (const item of pending) {
      const key = item.windowId || -1;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.index - b.index);
      const first = list[0];
      const created = await windowsCreate({ url: first.url, focused: windows === 0 });
      if (!created.ok) {
        for (const item of list) failedUrls.push(item.url);
        errors.push(created.error || "Could not create a restored window");
        continue;
      }
      opened += 1;
      openedUrls.push(first.url);
      windows += 1;
      await createIntoWindow(created.window?.id, list.slice(1));
    }
  } else {
    await createIntoWindow(undefined, pending);
  }

  return { opened, failed: failedUrls.length, windows, skippedExisting, openedUrls, skippedExistingUrls: skippedExistingItems.map(item => item.url), failedUrls, errors: errors.slice(0, 20) };
}

function tabSessionExactUrlKey(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!/(^|\.)spicychat\.ai$/i.test(parsed.hostname)) return "";
    parsed.hostname = "spicychat.ai";
    parsed.hash = "";
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.hostname}${pathname}${parsed.search}`;
  } catch {
    return "";
  }
}

async function matchOpenTabSessionItems(items, protectPinned = true) {
  const requested = (Array.isArray(items) ? items : [])
    .map(item => ({ ...item, key: tabSessionExactUrlKey(item?.url) }))
    .filter(item => item.key);
  const wanted = new Set(requested.map(item => item.key));
  const openTabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const matches = [];
  let pinnedSkipped = 0;
  const matchedKeys = new Set();
  for (const tab of openTabs) {
    if (!tab?.id) continue;
    const url = String(tab.url || tab.pendingUrl || "");
    const key = tabSessionExactUrlKey(url);
    if (!key || !wanted.has(key)) continue;
    matchedKeys.add(key);
    if (protectPinned && tab.pinned) {
      pinnedSkipped += 1;
      continue;
    }
    matches.push({
      tabId: tab.id,
      url,
      title: String(tab.title || ""),
      windowId: Number(tab.windowId) || 0,
      index: Number(tab.index) || 0,
      active: !!tab.active,
      pinned: !!tab.pinned,
      discarded: !!tab.discarded,
      lastAccessed: Number(tab.lastAccessed) || 0
    });
  }
  const missing = requested.filter(item => !matchedKeys.has(item.key)).length;
  return { matches, pinnedSkipped, missing };
}

async function closeMatchedTabSessionItems(tabIds, protectPinned = true) {
  const ids = [...new Set((Array.isArray(tabIds) ? tabIds : []).map(Number).filter(Number.isFinite))];
  let closed = 0;
  let pinnedSkipped = 0;
  let failed = 0;
  const errors = [];
  for (const tabId of ids) {
    const tab = await tabsGet(tabId);
    if (!tab) {
      failed += 1;
      continue;
    }
    if (protectPinned && tab.pinned) {
      pinnedSkipped += 1;
      continue;
    }
    const result = await tabsRemove(tabId);
    if (result.ok) closed += 1;
    else {
      failed += 1;
      if (result.error) errors.push(result.error);
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return { closed, pinnedSkipped, failed, errors: errors.slice(0, 20) };
}
