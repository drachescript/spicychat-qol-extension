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
  const stored = await storageGet([OPTIONS_SOURCE_TAB_KEY, HELPER_LIFECYCLE_DIAG_KEY, STALE_RUNTIME_TABS_KEY]);
  const storedId = Number(stored[OPTIONS_SOURCE_TAB_KEY]);
  const helperLifecycleDiagnostics = stored[HELPER_LIFECYCLE_DIAG_KEY] || null;
  const staleTabs = stored[STALE_RUNTIME_TABS_KEY] || {};
  const tabs = await querySpicyChatTabsRobust();
  const allCandidates = tabs.filter(tab => tab?.id && !isDedicatedWorkerTab(tab));
  const loaded = allCandidates.filter(tab => !tab.discarded);
  const candidates = (loaded.length ? loaded : allCandidates).sort((a, b) => {
    if (!!a.active !== !!b.active) return a.active ? -1 : 1;
    if (Number(a.id) === storedId && Number(b.id) !== storedId) return -1;
    if (Number(b.id) === storedId && Number(a.id) !== storedId) return 1;
    return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
  });
  // Lightweight read-only pings run in parallel. The old 900ms sequential
  // snapshot loop could outlive the entire 3.5s Settings support timeout.
  // Full layout/performance snapshots run on at most two candidates, one at
  // a time, to avoid doing heavy DOM work on several tabs simultaneously.
  const pinged = await Promise.all(candidates.map(async tab => ({
    tab, ping: await sendTabMessage(tab.id, { type: "DS_TAB_DIAGNOSTIC_PING" }, 650)
  })));
  const responsive = pinged.filter(row => row.ping?.ok);
  const notResponding = pinged.filter(row => !row.ping?.ok);
  const selected = [...responsive, ...notResponding].slice(0, 2);
  const snapshots = [];
  const androidWebView = /Android/i.test(String(navigator.userAgent || ""));
  for (const row of selected) {
    const [pageDiagnostics, tabState] = await Promise.all([
      // Mobile can be busy with a native React render at the moment the user
      // requests a report. Allow longer for ONE on-demand snapshot, not for
      // periodic checks. Desktop retains the short response deadline.
      sendTabMessage(row.tab.id, { type: "DS_GET_PAGE_DIAGNOSTICS" }, androidWebView ? 2400 : 1100),
      row.ping?.ok ? Promise.resolve(null) : sendTabMessage(row.tab.id, { type: "DS_GET_QOL_TAB_STATE" }, 650)
    ]);
    snapshots.push({ tab: row.tab, pageDiagnostics, tabState });
    if (pageDiagnostics?.ok) break;
  }
  // A cheap explicit probe distinguishes a responsive content runtime from a
  // timed-out full snapshot. Never use these partial counters as full live data.
  let lightProbe = null;
  if (!snapshots.some(row => row.pageDiagnostics?.ok) && responsive.length) {
    lightProbe = await sendTabMessage(responsive[0].tab.id, { type: "DS_GET_PAGE_DIAGNOSTICS_LIGHT" }, androidWebView ? 1400 : 700);
  }
  const probe = {
    tabsFound: allCandidates.length,
    tabsPinged: pinged.length,
    pingsAnswered: responsive.length,
    snapshotsAttempted: selected.length,
    snapshotsAnswered: snapshots.filter(row => row.pageDiagnostics?.ok).length,
    tabsFlaggedStale: candidates.filter(tab => !!staleTabs[String(tab.id)]).length,
    sampledPausedTabs: snapshots.filter(row => row.tabState?.ok && row.tabState?.paused === true).length,
    sampledStateReplies: snapshots.filter(row => row.tabState?.ok).length,
    lightRuntimeAnswered: !!lightProbe?.ok,
    lightRuntimeReady: !!lightProbe?.runtimeReady,
    probeScope: "read-only; full snapshot only when available"
  };
  const winner = snapshots.find(row => row.pageDiagnostics?.ok);
  if (winner) {
    await storageSet({ [OPTIONS_SOURCE_TAB_KEY]: winner.tab.id });
    return { ok: true, runtimeAvailable: true, url: winner.tab.url || "", title: winner.tab.title || "",
      pageDiagnostics: winner.pageDiagnostics, helperLifecycleDiagnostics, tabId: winner.tab.id, probe };
  }
  const fallback = candidates[0] || allCandidates[0] || null;
  const runtimeStatus = !fallback ? "no-spicychat-tab"
    : probe.lightRuntimeAnswered ? "runtime-lightweight-ok-full-snapshot-timeout"
    : probe.pingsAnswered ? "runtime-ping-ok-diagnostics-unreachable"
    : probe.sampledPausedTabs ? "sampled-tabs-intentionally-paused"
    : probe.sampledStateReplies ? "runtime-state-handler-ok-diagnostics-unreachable"
    : probe.tabsFlaggedStale ? "runtime-marked-stale-after-update"
    : "page-found-runtime-unreachable";
  const runtimeError = !fallback ? "No open SpicyChat tab was found."
    : probe.lightRuntimeAnswered ? "QoL answered a lightweight runtime check, but its full snapshot timed out. Live performance data remains unavailable; the runtime is not necessarily disabled."
    : probe.pingsAnswered ? "Some QoL tab handlers answered a lightweight ping, but none of the sampled tabs finished the full diagnostic snapshot. QoL may still be active."
    : probe.sampledPausedTabs ? "At least one sampled SpicyChat tab has QoL intentionally paused, so that tab cannot return full runtime diagnostics."
    : probe.sampledStateReplies ? "A QoL tab-state handler answered, but sampled full diagnostic handlers did not. This is not evidence that all QoL features are disabled."
    : probe.tabsFlaggedStale ? "At least one tab is marked stale from an extension update. Reload that tab to attach the current QoL scripts."
    : "SpicyChat tabs were found, but their diagnostic pings did not answer. The cause is unconfirmed; try reloading an affected tab after the extension update.";
  return {
    ok: !!fallback, runtimeAvailable: false, runtimeStatus, runtimeError,
    url: fallback?.url || "", title: fallback?.title || "", pageDiagnostics: null,
    helperLifecycleDiagnostics, tabId: fallback?.id || 0, probe
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
