"use strict";
// Optional background service, imported before background event registration.
function autoAfkProtectedTab(tab, action, settings) {
  if (!tab) return true;
  if (settings.autoAfkProtectActive !== false && tab.active) return true;

  // Safety rules from the tab-discard design: never touch pinned or audible tabs.
  if (tab.pinned || tab.audible) return true;

  // Respect the browser/user decision that a tab is not eligible for automatic discard.
  if ((action || "discard") === "discard" && tab.autoDiscardable === false) return true;

  return false;
}

function autoAfkLastActivity(tab, activity) {
  const stored = Number(activity?.[String(tab?.id)]);
  const browserLastAccessed = Number(tab?.lastAccessed);

  let latest = Number.isFinite(stored) ? stored : 0;
  if (Number.isFinite(browserLastAccessed)) latest = Math.max(latest, browserLastAccessed);

  return latest || Date.now();
}

async function getAutoAfkSettings() {
  const result = await storageGet(["settings"]);
  const raw = result.settings || {};
  const settings = {
    ...AUTO_AFK_DEFAULTS,
    ...raw
  };
  // Preserve old custom hour values until Settings has saved the new minute field.
  if (!Object.prototype.hasOwnProperty.call(raw, "autoAfkMinutes")) {
    const legacyHours = Math.min(720, Math.max(0.25, Number(raw.autoAfkHours) || 12));
    settings.autoAfkMinutes = Math.round(legacyHours * 60);
  }
  return settings;
}

async function getAutoAfkActivity() {
  const result = await storageGet([AUTO_AFK_ACTIVITY_KEY]);
  const value = result[AUTO_AFK_ACTIVITY_KEY];
  return value && typeof value === "object" ? value : {};
}

async function markAutoAfkActivity(tabId, timestamp = Date.now()) {
  if (!tabId) return;
  const activity = await getAutoAfkActivity();
  activity[String(tabId)] = Number(timestamp) || Date.now();
  await storageSet({ [AUTO_AFK_ACTIVITY_KEY]: activity });
}

async function removeAutoAfkActivity(tabId) {
  if (!tabId) return;
  const activity = await getAutoAfkActivity();
  const key = String(tabId);
  if (!(key in activity)) return;
  delete activity[key];
  await storageSet({ [AUTO_AFK_ACTIVITY_KEY]: activity });
}

async function syncAutoAfkTabs() {
  const tabs = await tabsQuery({
    url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"]
  });
  const activity = await getAutoAfkActivity();
  const now = Date.now();
  const existingIds = new Set();
  let changed = false;

  for (const tab of tabs) {
    if (!tab?.id) continue;

    const key = String(tab.id);
    existingIds.add(key);

    if (!Number.isFinite(Number(activity[key]))) {
      const browserLastAccessed = Number(tab.lastAccessed);
      activity[key] = Number.isFinite(browserLastAccessed) && browserLastAccessed > 0
        ? Math.min(now, browserLastAccessed)
        : now;
      changed = true;
    }
  }

  for (const key of Object.keys(activity)) {
    if (!existingIds.has(key)) {
      delete activity[key];
      changed = true;
    }
  }

  if (changed) await storageSet({ [AUTO_AFK_ACTIVITY_KEY]: activity });
  return activity;
}

let lowMemoryProtectionScanTimer = 0;
const LOW_MEMORY_WAKE_GRACE_MS = 90000;
const LOW_MEMORY_WAKE_BURST_ALLOWANCE = 2;
const lowMemoryWakeGraceUntil = new Map();

function markLowMemoryWakeGrace(tabId, now = Date.now()) {
  const id = Number(tabId || 0);
  if (!id) return;
  lowMemoryWakeGraceUntil.set(id, now + LOW_MEMORY_WAKE_GRACE_MS);
}

function lowMemoryWakeGraceActive(tabId, now = Date.now()) {
  const id = Number(tabId || 0);
  const until = Number(lowMemoryWakeGraceUntil.get(id) || 0);
  if (!until) return false;
  if (until <= now) {
    lowMemoryWakeGraceUntil.delete(id);
    return false;
  }
  return true;
}

function normalizedAutoAfkMinutes(settings = {}) {
  const raw = Number(settings.autoAfkMinutes);
  if (Number.isFinite(raw) && raw > 0) return Math.min(43200, Math.max(15, Math.round(raw)));
  const hours = Math.min(720, Math.max(0.25, Number(settings.autoAfkHours) || 12));
  return Math.min(43200, Math.max(15, Math.round(hours * 60)));
}

function isDedicatedWorkerTab(tab) {
  const id = Number(tab?.id || 0);
  const url = String(tab?.url || tab?.pendingUrl || "");
  if (!id) return false;
  return (
    tabCleanupWorkerTabIds.has(id) ||
    quickDislikeWorkerTabIds.has(id) ||
    quickLessLikeWorkerTabIds.has(id) ||
    botStatusWorkerTabIds.has(id) ||
    listingRefillWorkerTabIds.has(id) ||
    personaRefreshWorkerTabIds.has(id) ||
    Number(lorebookExportHelperTabId || 0) === id ||
    Number(botExportHelperTabId || 0) === id ||
    isLorebookExportWorkerUrl(url) ||
    isBotExportWorkerUrl(url) ||
    isQuickDislikeWorkerUrl(url) ||
    isQuickLessLikeWorkerUrl(url) ||
    isBotStatusWorkerUrl(url) ||
    isListingRefillWorkerUrl(url) ||
    isPersonaRefreshWorkerUrl(url)
  );
}

function lowMemoryProtectedTab(tab) {
  if (!tab) return true;
  // PC protection always keeps the tab the user is looking at. Pinned/audible
  // tabs and browser-declared non-discardable tabs are never sacrificed either.
  if (tab.active || tab.pinned || tab.audible || tab.autoDiscardable === false) return true;
  return false;
}

function scheduleLowMemoryProtectionScan(delayMs = 300) {
  clearTimeout(lowMemoryProtectionScanTimer);
  lowMemoryProtectionScanTimer = setTimeout(() => {
    lowMemoryProtectionScanTimer = 0;
    runAutoAfkScan().catch(() => {});
  }, Math.max(100, Number(delayMs) || 300));
}

async function configureAutoAfkAlarm(sync = false) {
  const settings = await getAutoAfkSettings();
  const cleanupEnabled = settings.enabled !== false && !!settings.autoAfkEnabled;
  const lowMemoryEnabled = settings.enabled !== false && !!settings.lowMemoryProtectionEnabled;

  if (!cleanupEnabled && !lowMemoryEnabled) {
    chrome.alarms.clear(AUTO_AFK_ALARM);
    return;
  }

  if (sync) await syncAutoAfkTabs();

  chrome.alarms.create(AUTO_AFK_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: AUTO_AFK_SCAN_MINUTES
  });

  if (sync) await runAutoAfkScan();
}

async function writeAutoAfkStatus(status) {
  try {
    await storageSet({ [AUTO_AFK_STATUS_KEY]: status });
  } catch {}
}

async function runAutoAfkScan() {
  const settings = await getAutoAfkSettings();
  const now = Date.now();
  const minutes = normalizedAutoAfkMinutes(settings);
  const hours = minutes / 60;
  const action = settings.autoAfkAction || "discard";
  const timerEnabled = settings.enabled !== false && !!settings.autoAfkEnabled;
  const lowMemoryEnabled = settings.enabled !== false && !!settings.lowMemoryProtectionEnabled;
  const awakeLimit = Math.min(20, Math.max(1, Number(settings.maxAwakeSpicyTabs) || 3));
  const summary = {
    at: now,
    enabled: timerEnabled || lowMemoryEnabled,
    timerEnabled,
    lowMemoryEnabled,
    minutes,
    hours,
    action,
    awakeLimit,
    totalSpicyTabs: 0,
    normalTabs: 0,
    workerTabs: 0,
    loadedNormal: 0,
    discardedNormal: 0,
    loadedWorkers: 0,
    monitored: 0,
    protected: 0,
    recent: 0,
    eligible: 0,
    cleaned: 0,
    lruDiscarded: 0,
    alreadyDiscarded: 0,
    failed: 0,
    nextDueAt: null,
    errors: []
  };

  if (!summary.enabled) {
    await writeAutoAfkStatus(summary);
    return summary;
  }

  const cutoff = now - minutes * 60 * 1000;
  const tabs = await tabsQuery({
    url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"]
  });
  summary.totalSpicyTabs = tabs.length;

  const activity = await getAutoAfkActivity();
  let activityChanged = false;

  // Keep LRU timestamps current even when timer cleanup itself is disabled.
  for (const tab of tabs) {
    if (!tab?.id) continue;
    const key = String(tab.id);
    const browserLastAccessed = Number(tab.lastAccessed);
    const storedBefore = Number(activity[key]);
    if (!Number.isFinite(storedBefore)) {
      activity[key] = Number.isFinite(browserLastAccessed) && browserLastAccessed > 0
        ? Math.min(now, browserLastAccessed)
        : now;
      activityChanged = true;
    }
    const lastActive = autoAfkLastActivity(tab, activity);
    if (!Number.isFinite(storedBefore) || lastActive > Number(activity[key] || 0)) {
      activity[key] = lastActive;
      activityChanged = true;
    }
  }

  const workers = tabs.filter(isDedicatedWorkerTab);
  const normalTabs = tabs.filter(tab => !isDedicatedWorkerTab(tab));
  summary.workerTabs = workers.length;
  summary.normalTabs = normalTabs.length;
  summary.loadedWorkers = workers.filter(tab => !tab.discarded).length;
  summary.loadedNormal = normalTabs.filter(tab => !tab.discarded).length;
  summary.discardedNormal = normalTabs.filter(tab => !!tab.discarded).length;

  // Low-memory protection is independent from the AFK timer. Dedicated active
  // workers never count against the limit. Recently visited/woken tabs get a
  // short grace period so switching among a large discarded-tab pile does not
  // immediately ping-pong the tab back to sleep. During that grace we allow a
  // tiny +2 burst, then the normal one-minute scan trims back by LRU.
  if (lowMemoryEnabled && summary.loadedNormal > awakeLimit) {
    const loadedCandidates = normalTabs.filter(tab => !tab.discarded && !lowMemoryProtectedTab(tab));
    const graceCount = loadedCandidates.filter(tab => lowMemoryWakeGraceActive(tab.id, now)).length;
    const severeOverflow = summary.loadedNormal > awakeLimit + LOW_MEMORY_WAKE_BURST_ALLOWANCE + 2;
    const effectiveLimit = graceCount && !severeOverflow
      ? Math.min(20, awakeLimit + LOW_MEMORY_WAKE_BURST_ALLOWANCE)
      : awakeLimit;
    const candidates = loadedCandidates
      .filter(tab => severeOverflow || !lowMemoryWakeGraceActive(tab.id, now))
      .sort((a, b) => {
        const aGrace = lowMemoryWakeGraceActive(a.id, now) ? 1 : 0;
        const bGrace = lowMemoryWakeGraceActive(b.id, now) ? 1 : 0;
        if (aGrace !== bGrace) return aGrace - bGrace;
        return autoAfkLastActivity(a, activity) - autoAfkLastActivity(b, activity);
      });
    let needed = Math.max(0, summary.loadedNormal - effectiveLimit);
    summary.wakeGraceTabs = graceCount;
    summary.effectiveAwakeLimit = effectiveLimit;
    qolBackgroundTrace("pc-protection", "pc-protection", {
      action: "evaluate",
      loadedNormal: summary.loadedNormal,
      discardedNormal: summary.discardedNormal,
      loadedWorkers: summary.loadedWorkers,
      awakeLimit,
      effectiveAwakeLimit: effectiveLimit,
      wakeGraceTabs: graceCount,
      severeOverflow,
      candidateCount: candidates.length,
      needed
    }, { level: "deep" });
    for (const tab of candidates) {
      if (needed <= 0) break;
      const lastActive = autoAfkLastActivity(tab, activity);
      const result = await tabsDiscard(tab.id);
      if (result.ok) {
        summary.lruDiscarded += 1;
        summary.loadedNormal = Math.max(0, summary.loadedNormal - 1);
        summary.discardedNormal += 1;
        needed -= 1;
        qolBackgroundTrace("pc-protection", "pc-protection", {
          action: "discard-success",
          lastUsedAgoMs: Math.max(0, now - Number(lastActive || now)),
          loadedNormal: summary.loadedNormal,
          awakeLimit,
          effectiveAwakeLimit: Number(summary.effectiveAwakeLimit || awakeLimit),
          remainingNeeded: needed
        });
      } else {
        summary.failed += 1;
        if (result.error && summary.errors.length < 3) summary.errors.push(result.error);
        qolBackgroundTrace("pc-protection", "pc-protection", {
          action: "discard-failed",
          lastUsedAgoMs: Math.max(0, now - Number(lastActive || now)),
          loadedNormal: summary.loadedNormal,
          awakeLimit,
          effectiveAwakeLimit: Number(summary.effectiveAwakeLimit || awakeLimit),
          remainingNeeded: needed,
          errorClass: result.error ? "discard-error" : "unknown"
        }, { critical: true });
      }
    }
  } else if (lowMemoryEnabled) {
    qolBackgroundTrace("pc-protection", "pc-protection", {
      action: "evaluate",
      loadedNormal: summary.loadedNormal,
      discardedNormal: summary.discardedNormal,
      loadedWorkers: summary.loadedWorkers,
      awakeLimit,
      candidateCount: 0,
      needed: 0
    }, { level: "deep" });
  }

  if (timerEnabled) {
    for (const tab of normalTabs) {
      if (!tab?.id || !autoAfkApplies(tab.url, settings)) continue;
      summary.monitored += 1;
      const key = String(tab.id);
      const lastActive = autoAfkLastActivity(tab, activity);

      if (autoAfkProtectedTab(tab, action, settings)) {
        summary.protected += 1;
        continue;
      }

      if (action === "discard" && tab.discarded) {
        summary.alreadyDiscarded += 1;
        continue;
      }

      if (lastActive > cutoff) {
        summary.recent += 1;
        const dueAt = lastActive + minutes * 60 * 1000;
        if (!summary.nextDueAt || dueAt < summary.nextDueAt) summary.nextDueAt = dueAt;
        continue;
      }

      summary.eligible += 1;
      if (action === "close") {
        const result = await tabsRemove(tab.id);
        if (result.ok) {
          summary.cleaned += 1;
          delete activity[key];
          activityChanged = true;
        } else {
          summary.failed += 1;
          if (result.error && summary.errors.length < 3) summary.errors.push(result.error);
        }
        continue;
      }

      const result = await tabsDiscard(tab.id);
      if (result.ok) {
        summary.cleaned += 1;
      } else {
        summary.failed += 1;
        if (result.error && summary.errors.length < 3) summary.errors.push(result.error);
      }
    }
  }

  const existingIds = new Set(tabs.filter(tab => tab?.id).map(tab => String(tab.id)));
  for (const key of Object.keys(activity)) {
    if (!existingIds.has(key)) {
      delete activity[key];
      activityChanged = true;
    }
  }

  if (activityChanged) await storageSet({ [AUTO_AFK_ACTIVITY_KEY]: activity });
  await writeAutoAfkStatus(summary);
  return summary;
}


// Optional alarm handler owned by performance-mode. Omitted modules do not register a handler.
(globalThis.__DSQ_BACKGROUND_ALARM_HANDLERS__ ||= Object.create(null))["ds-auto-afk-scan-v1"] = {
  owner: "performance-mode",
  run: () => { runAutoAfkScan(); }
};
