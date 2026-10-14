// Feature-owned options helpers: foundation. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function optionsDiagLevelRank(level) {
  return String(level || "normal") === "deep" ? 2 : 1;
}

async function refreshOptionsDiagnosticState(force = false) {
  if (!force && Date.now() - Number(optionsDiagnosticState.checkedAt || 0) < 5000) return optionsDiagnosticState;
  optionsDiagnosticState.checkedAt = Date.now();
  try {
    const response = await runtimeMessageWithTimeout({ type: "DS_QOL_DIAGNOSTIC_STATUS_QUERY" }, 1200);
    optionsDiagnosticState.active = !!response?.active;
    optionsDiagnosticState.traceLevel = response?.traceLevel === "deep" ? "deep" : (response?.active ? "normal" : "off");
  } catch {
    optionsDiagnosticState.active = false;
    optionsDiagnosticState.traceLevel = "off";
  }
  return optionsDiagnosticState;
}

function optionsDiag(feature, event, meta = {}, { level = "normal", critical = false } = {}) {
  if (!optionsDiagnosticState.active || optionsDiagLevelRank(optionsDiagnosticState.traceLevel) < optionsDiagLevelRank(level)) return false;
  try {
    chrome.runtime?.sendMessage?.({
      type: "DS_QOL_DIAGNOSTIC_BACKGROUND_EMIT",
      feature: String(feature || "options").slice(0, 80),
      event: String(event || "event").slice(0, 80),
      meta,
      level,
      critical: !!critical
    });
    return true;
  } catch { return false; }
}

function optionsPerfFinish(kind, started) {
  if (!started || typeof performance === "undefined") return 0;
  const elapsed = Math.max(0, performance.now() - started);
  if (kind === "read") {
    OPTIONS_PERFORMANCE.storageReads += 1;
    OPTIONS_PERFORMANCE.storageReadTotalMs += elapsed;
    OPTIONS_PERFORMANCE.storageReadMaxMs = Math.max(OPTIONS_PERFORMANCE.storageReadMaxMs, elapsed);
  } else if (kind === "write") {
    OPTIONS_PERFORMANCE.storageWrites += 1;
    OPTIONS_PERFORMANCE.storageWriteTotalMs += elapsed;
    OPTIONS_PERFORMANCE.storageWriteMaxMs = Math.max(OPTIONS_PERFORMANCE.storageWriteMaxMs, elapsed);
  }
  return elapsed;
}

function storageKeyLabel(keys) {
  if (keys == null) return "all storage";
  const list = Array.isArray(keys) ? keys : (typeof keys === "string" ? [keys] : Object.keys(keys || {}));
  if (!list.length) return "no keys";
  if (list.length <= 4) return list.join(", ");
  return `${list.slice(0, 4).join(", ")} +${list.length - 4} more`;
}

function recordSlowStorageRead(keys, elapsed) {
  if (elapsed < 100) return;
  const record = { keys: storageKeyLabel(keys), ms: Math.round(elapsed * 10) / 10, bytes: 0, at: Date.now() };
  OPTIONS_PERFORMANCE.slowStorageReads.push(record);
  OPTIONS_PERFORMANCE.slowStorageReads.sort((a, b) => Number(b.ms || 0) - Number(a.ms || 0));
  OPTIONS_PERFORMANCE.slowStorageReads = OPTIONS_PERFORMANCE.slowStorageReads.slice(0, 5);
  try {
    chrome.storage.local.getBytesInUse(keys, bytes => {
      if (!chrome.runtime?.lastError) record.bytes = Math.max(0, Number(bytes || 0));
    });
  } catch {}
}

function nextUiFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function nextOptionsIdleSlice(timeout = 220) {
  OPTIONS_PERFORMANCE.heavyManagerIdleSlices += 1;
  if (typeof requestIdleCallback === "function") {
    return new Promise(resolve => requestIdleCallback(() => resolve(), { timeout }));
  }
  return nextUiFrame();
}

function debounceCallback(callback, delay = 140) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

function activeOptionsTab() {
  return document.querySelector(".tab-button.active")?.dataset.tab || "general";
}

function invalidateHeavyTab(tabName) {
  if (tabName) renderedHeavyTabs.delete(tabName);
}

function invalidateDuplicateCache() {
  botDuplicateMatchesCache = new Map();
  botDuplicateCacheScope = "";
  botDuplicateCacheReady = false;
}

function refreshStorageUsageIfVisible() {
  if (activeOptionsTab() === "data") refreshStorageUsage().catch(() => {});
}

function markSavedStoreDirty(kind) {
  if (!kind) return;
  dirtySavedStores.add(kind);
  if (["blocked", "notInterested"].includes(kind)) {
    invalidateHeavyTab("blocking");
    invalidateHeavyTab("saved");
  } else invalidateHeavyTab("saved");
}

function granularSettingStorageKey(name) {
  return `${GRANULAR_SETTING_PREFIX}${String(name || "").trim()}`;
}

function granularSettingName(storageKey) {
  const key = String(storageKey || "");
  return key.startsWith(GRANULAR_SETTING_PREFIX) ? key.slice(GRANULAR_SETTING_PREFIX.length) : "";
}

function normalizeGranularSettingsIndex(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(name => String(name || "").trim()).filter(Boolean))].sort();
}

function storageRequestIncludes(keys, wanted) {
  if (keys == null) return true;
  if (typeof keys === "string") return keys === wanted;
  if (Array.isArray(keys)) return keys.includes(wanted);
  if (keys && typeof keys === "object") return Object.prototype.hasOwnProperty.call(keys, wanted);
  return false;
}

function storageRequestedKeyList(keys) {
  if (keys == null) return null;
  if (typeof keys === "string") return [keys];
  if (Array.isArray(keys)) return [...keys];
  if (keys && typeof keys === "object") return Object.keys(keys);
  return [];
}

function largeStorageKeysForRequest(keys) {
  if (keys == null) return [...LARGE_STORAGE_KEYS];
  const list = typeof keys === "string" ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys || {}));
  return [...new Set(list.filter(key => LARGE_STORAGE_KEYS.has(String(key || ""))))];
}

function localStorageKeysForRequest(keys) {
  if (keys == null) return null;
  if (typeof keys === "string") return LARGE_STORAGE_KEYS.has(keys) ? [] : [keys];
  if (Array.isArray(keys)) return keys.filter(key => !LARGE_STORAGE_KEYS.has(String(key || "")));
  if (keys && typeof keys === "object") {
    return Object.fromEntries(Object.entries(keys).filter(([key]) => !LARGE_STORAGE_KEYS.has(String(key || ""))));
  }
  return keys;
}

function chromeLocalGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, result => {
        const error = chrome.runtime.lastError?.message || "";
        if (error) reject(new Error(error));
        else resolve(result || {});
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function readLargeStorageKeyPaged(key) {
  const diagStarted = optionsDiagnosticState.active && typeof performance !== "undefined" ? performance.now() : 0;
  const meta = {};
  let afterId = "";
  let pageCount = 0;

  while (pageCount < 1000) {
    pageCount += 1;
    const response = await runtimeMessageWithTimeout({
      type: "DS_LARGE_STORAGE_GET_PAGE",
      key,
      afterId,
      limit: 250
    }, 15000);
    if (!response?.ok || !Array.isArray(response.rows)) return null;

    for (const row of response.rows) {
      const id = String(row?.id || "").trim();
      if (!id || !row?.value || typeof row.value !== "object") continue;
      meta[id] = row.value;
    }

    if (response.done || !response.rows.length) {
      if (diagStarted) optionsDiag("options-storage", "read-large-paged", { key, pages: pageCount, records: Object.keys(meta).length, durationMs: Math.round((performance.now() - diagStarted) * 10) / 10 });
      return { meta };
    }
    const nextAfterId = String(response.nextAfterId || "").trim();
    if (!nextAfterId || nextAfterId === afterId) return null;
    afterId = nextAfterId;
  }

  return null;
}

async function readLargeStorageForRequest(keys) {
  const requested = largeStorageKeysForRequest(keys);
  if (!requested.length) return {};

  // Large Bot Status / recovery stores can exceed a reliable single extension
  // message once several thousand rich snapshots have accumulated. Read each
  // store in small IndexedDB pages so Settings never mistakes a message-size
  // failure for an empty archive. Older backgrounds fall back to one-key reads.
  const data = {};
  for (const key of requested) {
    const paged = await readLargeStorageKeyPaged(key);
    if (paged) {
      data[key] = paged;
      continue;
    }

    const response = await runtimeMessage({ type: "DS_LARGE_STORAGE_GET", keys: [key] });
    if (!response?.ok) return null;
    data[key] = response.data?.[key] && typeof response.data[key] === "object"
      ? response.data[key]
      : { meta: {} };
  }
  return data;
}

async function readLargeStorageStats() {
  const response = await runtimeMessage({ type: "DS_LARGE_STORAGE_STATS" });
  return response?.ok && response.stats && typeof response.stats === "object" ? response.stats : {};
}

async function removeLargeStorageRecords(key, ids = []) {
  const cleanIds = [...new Set((Array.isArray(ids) ? ids : [ids]).map(id => String(id || "").trim()).filter(Boolean))];
  if (!LARGE_STORAGE_KEYS.has(String(key || "")) || !cleanIds.length) return { ok: true, key: String(key || ""), removed: 0 };
  const response = await runtimeMessageWithTimeout({ type: "DS_LARGE_STORAGE_REMOVE_RECORDS", key: String(key), ids: cleanIds }, 15000);
  return response?.ok ? response : { ok: false, key: String(key), removed: 0, error: response?.error || "Large-storage record removal failed." };
}

async function storageGetChecked(keys) {
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  const finish = value => {
    const elapsed = optionsPerfFinish("read", started);
    recordSlowStorageRead(keys, elapsed);
    if (optionsDiagnosticState.active) {
      const requestedKeys = keys == null ? ["*"] : (typeof keys === "string" ? [keys] : (Array.isArray(keys) ? keys.map(String) : Object.keys(keys || {})));
      optionsDiag("options-storage", "read", { keys: requestedKeys.slice(0, 24), keyCount: requestedKeys.length, durationMs: Math.round(Number(elapsed || 0) * 10) / 10, largeKeyCount: largeStorageKeysForRequest(keys).length }, { critical: Number(elapsed || 0) >= 200 });
    }
    return value;
  };

  try {
    const wantsLarge = largeStorageKeysForRequest(keys).length > 0;
    const largeData = wantsLarge ? await readLargeStorageForRequest(keys) : {};
    const largeSupported = largeData !== null;
    const wantsSettings = storageRequestIncludes(keys, "settings");
    const localRequest = largeSupported ? localStorageKeysForRequest(keys) : keys;
    const requested = localRequest == null
      ? null
      : (Array.isArray(localRequest) ? localRequest : storageRequestedKeyList(localRequest));
    const firstKeys = requested === null
      ? null
      : [...new Set([...(requested || []), ...(wantsSettings ? [GRANULAR_SETTINGS_INDEX_KEY, GRANULAR_SETTINGS_MIGRATION_KEY] : [])])];

    const data = await chromeLocalGet(firstKeys);
    const shouldSynthesize = wantsSettings || requested === null;
    if (shouldSynthesize) {
      const index = normalizeGranularSettingsIndex(data[GRANULAR_SETTINGS_INDEX_KEY]);
      granularSettingsIndexCache = new Set(index);
      granularSettingsMigrationSeen = data[GRANULAR_SETTINGS_MIGRATION_KEY] === true;
      const granularKeys = index.map(granularSettingStorageKey);
      const granular = !granularKeys.length || requested === null ? data : await chromeLocalGet(granularKeys);

      const hadLegacy = Object.prototype.hasOwnProperty.call(data, "settings") && data.settings && typeof data.settings === "object";
      const merged = hadLegacy ? { ...(data.settings || {}) } : {};
      let granularFound = false;
      for (const name of index) {
        const key = granularSettingStorageKey(name);
        if (!Object.prototype.hasOwnProperty.call(granular || {}, key)) continue;
        merged[name] = granular[key];
        granularFound = true;
      }
      if (hadLegacy || granularFound) data.settings = merged;
      else delete data.settings;

      for (const name of index) delete data[granularSettingStorageKey(name)];
      if (!storageRequestIncludes(keys, GRANULAR_SETTINGS_INDEX_KEY)) delete data[GRANULAR_SETTINGS_INDEX_KEY];
      if (!storageRequestIncludes(keys, GRANULAR_SETTINGS_MIGRATION_KEY)) delete data[GRANULAR_SETTINGS_MIGRATION_KEY];
      if (!storageRequestIncludes(keys, GRANULAR_SETTINGS_REVISION_KEY)) delete data[GRANULAR_SETTINGS_REVISION_KEY];
      if (!storageRequestIncludes(keys, GRANULAR_SETTINGS_LAST_BATCH_KEY)) delete data[GRANULAR_SETTINGS_LAST_BATCH_KEY];
    }

    if (largeSupported) Object.assign(data, largeData || {});
    return finish({ ok: true, data, error: "" });
  } catch (error) {
    return finish({ ok: false, data: {}, error: error?.message || String(error || "Browser storage read failed") });
  }
}

async function storageGet(keys) {
  const result = await storageGetChecked(keys);
  return result.data;
}

function rawStorageSet(obj) {
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  return new Promise(resolve => {
    const finish = value => { optionsPerfFinish("write", started); resolve(value); };
    try {
      chrome.storage.local.set(obj, () => finish(!chrome.runtime.lastError));
    } catch { finish(false); }
  });
}

function expandSettingsStoragePayload(obj) {
  const payload = obj && typeof obj === "object" && !Array.isArray(obj) ? { ...obj } : {};
  const settings = payload.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return payload;
  delete payload.settings;

  let indexChanged = false;
  for (const [name, value] of Object.entries(settings)) {
    if (!String(name || "").trim()) continue;
    payload[granularSettingStorageKey(name)] = value;
    if (!granularSettingsIndexCache.has(name)) {
      granularSettingsIndexCache.add(name);
      indexChanged = true;
    }
  }
  if (indexChanged || !granularSettingsMigrationSeen) {
    payload[GRANULAR_SETTINGS_INDEX_KEY] = [...granularSettingsIndexCache].sort();
  }
  payload[GRANULAR_SETTINGS_MIGRATION_KEY] = true;
  payload[GRANULAR_SETTINGS_REVISION_KEY] = Date.now();
  granularSettingsMigrationSeen = true;
  return payload;
}

async function storageSet(obj) {
  const expanded = expandSettingsStoragePayload(obj);
  const largeValues = {};
  for (const key of LARGE_STORAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(expanded, key)) continue;
    largeValues[key] = expanded[key];
    delete expanded[key];
  }

  let largeOk = true;
  if (Object.keys(largeValues).length) {
    const response = await runtimeMessage({ type: "DS_LARGE_STORAGE_SET", values: largeValues });
    largeOk = !!response?.ok;
    if (!largeOk) {
      // Compatibility fallback for a mismatched/older background.
      Object.assign(expanded, largeValues);
      largeOk = true;
    }
  }
  const localOk = Object.keys(expanded).length ? await rawStorageSet(expanded) : true;
  return !!(largeOk && localOk);
}

async function storageRemove(keys) {
  const list = storageRequestedKeyList(keys) ?? [];
  const largeKeys = list.filter(key => LARGE_STORAGE_KEYS.has(String(key || "")));
  let expanded = list.filter(key => !LARGE_STORAGE_KEYS.has(String(key || "")));
  if (list.includes("settings")) {
    if (!granularSettingsIndexCache.size) {
      try {
        const current = await chromeLocalGet([GRANULAR_SETTINGS_INDEX_KEY]);
        granularSettingsIndexCache = new Set(normalizeGranularSettingsIndex(current?.[GRANULAR_SETTINGS_INDEX_KEY]));
      } catch {}
    }
    expanded = [...new Set([
      ...expanded,
      ...[...granularSettingsIndexCache].map(granularSettingStorageKey),
      GRANULAR_SETTINGS_INDEX_KEY,
      GRANULAR_SETTINGS_MIGRATION_KEY,
      GRANULAR_SETTINGS_REVISION_KEY,
      GRANULAR_SETTINGS_LAST_BATCH_KEY
    ])];
  }

  let largeOk = true;
  if (largeKeys.length) {
    const response = await runtimeMessage({ type: "DS_LARGE_STORAGE_REMOVE", keys: largeKeys });
    largeOk = !!response?.ok;
    if (!largeOk) {
      expanded.push(...largeKeys);
      largeOk = true;
    }
  }

  let localOk = true;
  if (expanded.length) {
    localOk = await new Promise(resolve => {
      try { chrome.storage.local.remove(expanded, () => resolve(!chrome.runtime.lastError)); }
      catch { resolve(false); }
    });
  }
  if (localOk && list.includes("settings")) {
    granularSettingsIndexCache.clear();
    granularSettingsMigrationSeen = false;
  }
  return !!(largeOk && localOk);
}

async function ensureGranularSettingsMigration(rawSettings) {
  if (granularSettingsMigrationSeen) return true;
  const source = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings) ? rawSettings : {};
  const payload = {};
  for (const [name, value] of Object.entries(source)) {
    payload[granularSettingStorageKey(name)] = value;
    granularSettingsIndexCache.add(name);
  }
  payload[GRANULAR_SETTINGS_INDEX_KEY] = [...granularSettingsIndexCache].sort();
  payload[GRANULAR_SETTINGS_MIGRATION_KEY] = true;
  payload[GRANULAR_SETTINGS_REVISION_KEY] = Date.now();
  const ok = await rawStorageSet(payload);
  if (ok) granularSettingsMigrationSeen = true;
  return ok;
}

function storageValueMatches(actual, expected) {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
    return actual.every((value, index) => storageValueMatches(value, expected[index]));
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const actualKeys = Object.keys(actual).filter(key => actual[key] !== undefined).sort();
    const expectedKeys = Object.keys(expected).filter(key => expected[key] !== undefined).sort();
    if (actualKeys.length !== expectedKeys.length) return false;
    return actualKeys.every((key, index) =>
      key === expectedKeys[index] && storageValueMatches(actual[key], expected[key])
    );
  }
  return false;
}

async function storageSetVerified(obj) {
  const payload = obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  const keys = Object.keys(payload);
  if (!keys.length) return true;
  if (!await storageSet(payload)) return false;
  const readback = await storageGetChecked(keys);
  if (!readback.ok) return false;
  return keys.every(key =>
    Object.prototype.hasOwnProperty.call(readback.data, key) &&
    storageValueMatches(readback.data[key], payload[key])
  );
}

async function storageRemoveVerified(keys) {
  const list = [...new Set((Array.isArray(keys) ? keys : [keys]).map(key => String(key || "").trim()).filter(Boolean))];
  if (!list.length) return true;
  if (!await storageRemove(list)) return false;
  const readback = await storageGetChecked(list);
  if (!readback.ok) return false;
  return list.every(key => !Object.prototype.hasOwnProperty.call(readback.data, key));
}

function runtimeMessage(message) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

function runtimeMessageWithTimeout(message, timeoutMs = 15000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish({ __dsTimeout: true }), Math.max(500, Number(timeoutMs) || 15000));
    runtimeMessage(message).then(finish).catch(() => finish(null));
  });
}

function promiseWithSupportTimeout(promise, timeoutMs, fallbackText) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise(resolve => setTimeout(() => resolve(String(fallbackText || `Timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), Math.max(1000, Number(timeoutMs) || 15000)))
  ]);
}

function promiseWithValueTimeout(promise, timeoutMs, fallbackValue = null) {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallbackValue),
    new Promise(resolve => setTimeout(() => resolve(fallbackValue), Math.max(250, Number(timeoutMs) || 15000)))
  ]);
}

function permissionRequest(permission) {
  return new Promise(resolve => {
    try { chrome.permissions.request(permission, result => resolve(!!result && !chrome.runtime.lastError)); }
    catch { resolve(false); }
  });
}

function ensureDeepLPermission() {
  // permissions.request must start directly from the button click. Calling it
  // immediately also succeeds without a prompt when permission is already granted.
  return permissionRequest({ origins: DEEPL_ORIGINS });
}

function storageBytesInUse(keys = null) {
  return new Promise(resolve => {
    try {
      if (typeof chrome.storage.local.getBytesInUse !== "function") {
        resolve(null);
        return;
      }
      chrome.storage.local.getBytesInUse(keys, bytes => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(Number(bytes) || 0);
      });
    } catch {
      resolve(null);
    }
  });
}

function compareVersions(a, b) {
  const left = String(a || "0").split(".").map(x => Number(x) || 0);
  const right = String(b || "0").split(".").map(x => Number(x) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function displayReleaseVersion(value) {
  const raw = String(value || "").trim();
  if (!raw) return raw;

  // Chrome/Firefox update ordering must stay above the old 0.1.9.641 store
  // build, so technical manifests continue at 0.1.9.700+. Keep the UI on
  // the human release sequence: 0.1.9.700 -> 0.1.9.70, .701 -> .71, etc.
  const parts = raw.split(".");
  if (parts.length === 4 && parts[0] === "0" && parts[1] === "1" && parts[2] === "9") {
    const technical = Number(parts[3]);
    if (Number.isInteger(technical) && technical >= 700) {
      return `0.1.9.${technical - 630}`;
    }
  }

  const manifest = chrome.runtime.getManifest?.() || {};
  if (raw === String(manifest.version || "") && manifest.version_name) {
    return String(manifest.version_name);
  }
  return raw;
}

function showSettingsToast(message, undoAction = null) {
  const toast = $("settingsToast");
  const text = $("settingsToastText");
  const undo = $("settingsToastUndo");
  if (!toast || !text || !undo) return;

  clearTimeout(settingsToastTimer);
  settingsUndoAction = typeof undoAction === "function" ? undoAction : null;
  text.textContent = String(message || "Done.");
  undo.hidden = !settingsUndoAction;
  toast.hidden = false;

  settingsToastTimer = setTimeout(() => {
    toast.hidden = true;
    settingsUndoAction = null;
  }, settingsUndoAction ? 8000 : 3200);
}

function cloneJson(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

function setupSettingsToast() {
  $("settingsToastUndo")?.addEventListener("click", async () => {
    const action = settingsUndoAction;
    settingsUndoAction = null;
    if (!action) return;
    try {
      await action();
      showSettingsToast("Undone.");
    } catch {
      showSettingsToast("Undo failed.");
    }
  });
}

function formatAutoAfkStatus(summary) {
  if (!summary || typeof summary !== "object") {
    return "No cleanup / memory-protection check recorded yet.";
  }

  const when = Number(summary.at)
    ? new Date(Number(summary.at)).toLocaleString()
    : "unknown time";

  if (!summary.enabled) {
    return `Last check ${when}: Auto-AFK and Low memory / PC protection were disabled.`;
  }

  const parts = [`Last check ${when}`];
  if (summary.lowMemoryEnabled) {
    parts.push(
      `PC protection ${Number(summary.loadedNormal || 0)} normal tabs awake / limit ${Number(summary.awakeLimit || 5)}`,
      `${Number(summary.discardedNormal || 0)} normal tabs unloaded`,
      `${Number(summary.workerTabs || 0)} worker tabs (${Number(summary.loadedWorkers || 0)} loaded)`,
      `${Number(summary.lruDiscarded || 0)} LRU-unloaded this check`
    );
  }
  if (summary.timerEnabled) {
    const actionWord = summary.action === "close" ? "closed" : "unloaded";
    const minutes = Number(summary.minutes || (Number(summary.hours || 12) * 60));
    const duration = minutes < 60 ? `${minutes} min` : (minutes % 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes / 60}h`);
    parts.push(
      `Auto-AFK ${duration}`,
      `${Number(summary.monitored || 0)} monitored`,
      `${Number(summary.protected || 0)} protected`,
      `${Number(summary.recent || 0)} still active`,
      `${Number(summary.eligible || 0)} eligible`,
      `${Number(summary.cleaned || 0)} ${actionWord}`
    );
    if (Number(summary.alreadyDiscarded || 0) > 0) parts.push(`${Number(summary.alreadyDiscarded)} already unloaded`);
    if (Number(summary.nextDueAt) > Date.now()) parts.push(`next eligible around ${new Date(Number(summary.nextDueAt)).toLocaleString()}`);
  }
  if (Number(summary.failed || 0) > 0) parts.push(`${Number(summary.failed)} failed`);
  if (Array.isArray(summary.errors) && summary.errors[0]) parts.push(`browser error: ${summary.errors[0]}`);

  return `${parts.join("; ")}.`;
}

function renderAutoAfkStatus(summary) {
  const el = $("autoAfkStatus");
  if (el) el.textContent = formatAutoAfkStatus(summary);
}

async function runAutoAfkCheckNow() {
  const button = $("autoAfkCheckNow");
  if (button) button.disabled = true;

  try {
    // Save the controls first so the check uses exactly what is visible here.
    await flushSettingsAutosave({ force: true });
    const response = await runtimeMessage({ type: "DS_AUTO_AFK_RUN_NOW" });

    if (response?.ok) {
      renderAutoAfkStatus(response.summary);
    } else {
      renderAutoAfkStatus({
        at: Date.now(),
        enabled: true,
        monitored: 0,
        protected: 0,
        recent: 0,
        eligible: 0,
        cleaned: 0,
        failed: 1,
        errors: [response?.error || "Could not contact the extension background worker"]
      });
    }
  } finally {
    if (button) button.disabled = false;
  }
}

function formatDuplicateTabStatus(summary) {
  if (!summary || typeof summary !== "object") return "No duplicate-tab check recorded yet.";

  const when = Number(summary.at)
    ? new Date(Number(summary.at)).toLocaleString()
    : "unknown time";

  if (!summary.enabled) return `Last check ${when}: duplicate tab guard was disabled.`;

  const parts = [
    `Last check ${when}: ${Number(summary.checked || 0)} matching SpicyChat tabs checked`,
    `${Number(summary.groups || 0)} duplicate groups`,
    `${Number(summary.duplicates || 0)} extra tabs found`,
    `${Number(summary.closed || 0)} closed`
  ];

  if (Number(summary.protected || 0) > 0) parts.push(`${Number(summary.protected)} pinned/protected`);
  if (Number(summary.focusedExisting || 0) > 0) parts.push("returned to the existing tab");
  if (Number(summary.failed || 0) > 0) parts.push(`${Number(summary.failed)} failed`);
  if (Array.isArray(summary.errors) && summary.errors[0]) parts.push(`browser error: ${summary.errors[0]}`);
  parts.push(summary.keepMode === "existing" ? "kept already-open tabs" : "kept newly opened tabs when known");

  return `${parts.join("; ")}.`;
}

function renderDuplicateTabStatus(summary) {
  const el = $("duplicateTabStatus");
  if (el) el.textContent = formatDuplicateTabStatus(summary);
}

async function runDuplicateTabCheckNow() {
  const button = $("duplicateTabCheckNow");
  if (button) button.disabled = true;

  try {
    await flushSettingsAutosave({ force: true });
    const response = await runtimeMessage({ type: "DS_DUPLICATE_TABS_RUN_NOW" });
    if (response?.ok) {
      renderDuplicateTabStatus(response.summary);
    } else {
      renderDuplicateTabStatus({
        at: Date.now(),
        enabled: true,
        checked: 0,
        groups: 0,
        duplicates: 0,
        closed: 0,
        failed: 1,
        errors: [response?.error || "Could not contact the extension background worker"]
      });
    }
  } finally {
    if (button) button.disabled = false;
  }
}

function $(id) {
  return document.getElementById(id);
}

function checked(id, fallback = false) {
  const el = $(id);
  return el ? !!el.checked : fallback;
}

function value(id, fallback = "") {
  const el = $(id);
  return el ? el.value : fallback;
}

function linesToArray(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function blockerSearchableText(value) {
  let text = String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2");
  try {
    text = normalizeTextPreviewValue(text);
  } catch {}
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blockedWordRulesKeyFromValues(values) {
  const normalized = [...new Set((values || []).map(value => {
    let text = String(value || "").trim();
    try { text = text.normalize("NFKC"); } catch {}
    return text.toLocaleLowerCase();
  }).filter(Boolean))].sort();
  let hash = 2166136261;
  const payload = normalized.join("\u001f");
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${normalized.length}:${(hash >>> 0).toString(16)}`;
}

async function rememberAutoBlockWordExceptions(ids) {
  const cleanIds = [...new Set((ids || []).map(id => String(id || "").trim().toLowerCase()).filter(Boolean))];
  if (!cleanIds.length) return;
  try {
    const specs = [
      [AUTO_BLOCK_WORD_EXCEPTIONS_KEY, linesToArray(value("blockedWords", ""))],
      [AUTO_BLOCK_TAG_EXCEPTIONS_KEY, linesToArray(value("blockedTags", ""))]
    ];
    const stored = await storageGet(specs.map(([key]) => key));
    const payload = {};
    for (const [key, rules] of specs) {
      const rulesKey = blockedWordRulesKeyFromValues(rules);
      if (rulesKey.startsWith("0:")) continue;
      const previous = stored?.[key];
      const entries = previous?.rulesKey === rulesKey && previous?.ids && typeof previous.ids === "object" && !Array.isArray(previous.ids)
        ? { ...previous.ids }
        : {};
      const now = Date.now();
      cleanIds.forEach(id => { entries[id] = now; });
      const trimmed = Object.fromEntries(Object.entries(entries)
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
        .slice(0, 1000));
      payload[key] = { version: 1, rulesKey, ids: trimmed };
    }
    if (Object.keys(payload).length) await storageSet(payload);
  } catch {}
}

function prepareBlockerTestRules(values) {
  return (values || []).map(rawValue => {
    const raw = String(rawValue || "").trim();
    if (!raw) return null;
    const needle = blockerSearchableText(raw);
    const tokens = needle.split(" ").filter(Boolean);
    return { raw, needle, tokens, compact: tokens.join("") };
  }).filter(rule => rule?.needle);
}

function compactBlockerWindowMatch(haystack, rule) {
  const target = String(rule?.compact || "");
  if (!target || target.length < 3) return false;
  const hayTokens = String(haystack || "").split(" ").filter(Boolean);
  const maxWindow = Math.min(hayTokens.length, Math.max(1, rule.tokens.length) + 3);
  for (let start = 0; start < hayTokens.length; start++) {
    let joined = "";
    for (let size = 1; size <= maxWindow && start + size <= hayTokens.length; size++) {
      joined += hayTokens[start + size - 1];
      if (joined === target) return true;
      if (joined.length > target.length + 2) break;
    }
  }
  return false;
}

function findBlockerTestMatch(sample, rules, allowUnordered = false) {
  const haystack = blockerSearchableText(sample);
  if (!haystack) return null;
  const padded = ` ${haystack} `;
  const haySet = new Set(haystack.split(" ").filter(Boolean));
  for (const rule of prepareBlockerTestRules(rules)) {
    if (padded.includes(` ${rule.needle} `) || compactBlockerWindowMatch(haystack, rule)) return rule;
    if (allowUnordered) {
      const meaningful = rule.tokens.filter(token => /^\p{L}{3,}$/u.test(token));
      if (meaningful.length >= 2 && rule.tokens.every(token => haySet.has(token))) return rule;
    }
  }
  return null;
}

function runBlockerRuleTest() {
  const result = $("blockerTestResult");
  if (!result) return;
  const sampleText = value("blockerTestText", "");
  const sampleCreator = value("blockerTestCreator", "").replace(/^@+/, "");
  const sampleTags = value("blockerTestTags", "");
  if (!sampleText.trim() && !sampleCreator.trim() && !sampleTags.trim()) {
    result.dataset.state = "warning";
    result.textContent = "Enter a name/description, creator, or tags sample first.";
    return;
  }

  const matches = [];
  const word = findBlockerTestMatch(sampleText, linesToArray(value("blockedWords", "")), true);
  if (word) matches.push(`blocked word: ${word.raw}`);
  const creator = findBlockerTestMatch(sampleCreator, linesToArray(value("blockedCreators", "")), false);
  if (creator) matches.push(`blocked creator: ${creator.raw}`);
  const tag = findBlockerTestMatch(sampleTags, linesToArray(value("blockedTags", "")), false);
  if (tag) matches.push(`blocked tag: ${tag.raw}`);

  if (matches.length) {
    result.dataset.state = checked("blockCards") ? "match" : "warning";
    result.textContent = checked("blockCards")
      ? `Would be blocked by ${matches.join("; ")}.`
      : `Rule match found (${matches.join("; ")}), but “Block character cards by text” is currently off.`;
    return;
  }

  const normalized = [sampleText, sampleCreator, sampleTags].filter(Boolean).map(blockerSearchableText).filter(Boolean).join(" | ");
  result.dataset.state = "clear";
  result.textContent = `No current text/creator/tag rule matched.${normalized ? ` Normalized sample: ${normalized}` : ""}`;
}

function setupBlockerTester() {
  $("testBlockerRules")?.addEventListener("click", runBlockerRuleTest);
  $("clearBlockerTest")?.addEventListener("click", () => {
    setControlValue("blockerTestText", "");
    setControlValue("blockerTestCreator", "");
    setControlValue("blockerTestTags", "");
    const result = $("blockerTestResult");
    if (result) {
      delete result.dataset.state;
      result.textContent = "Enter a sample and press Test current rules.";
    }
  });
  ["blockerTestText", "blockerTestCreator", "blockerTestTags"].forEach(id => {
    $(id)?.addEventListener("keydown", event => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) runBlockerRuleTest();
    });
  });
}

function arrayToLines(arr) {
  return (arr || []).join("\n");
}

function uniqueClean(values) {
  return [
    ...new Set(
      (values || [])
        .map(x => String(x).trim())
        .filter(Boolean)
    )
  ];
}

function setChecked(id, enabled) {
  const el = $(id);
  if (el) {
    el.checked = !!enabled;
    if (settingsAutosaveReady) queueSettingsAutosaveForControl(el, "change");
  }
}

function setValue(id, next) {
  const el = $(id);
  if (el) {
    el.value = next;
    if (settingsAutosaveReady) queueSettingsAutosaveForControl(el, "change");
  }
}

function setAllowedLanguages(values) {
  const allowed = new Set(Array.isArray(values) ? values : []);

  document.querySelectorAll(".allowed-language").forEach(input => {
    input.checked = allowed.has(input.value);
  });
}

function getAllowedLanguages() {
  return [...document.querySelectorAll(".allowed-language:checked")]
    .map(input => input.value)
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function makeElement(tag, { className = "", text = null, attrs = {}, dataset = {} } = {}, children = []) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== null && text !== undefined) el.textContent = String(text);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (value === true) el.setAttribute(name, "");
    else el.setAttribute(name, String(value));
  }
  for (const [name, value] of Object.entries(dataset || {})) {
    if (value !== null && value !== undefined) el.dataset[name] = String(value);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function setEmptyState(host, text) {
  if (!host) return;
  host.replaceChildren(makeElement("div", { className: "bot-manager-empty", text }));
}

function managerImageSourceLooksAnimated(srcValue) {
  const src = String(srcValue || "").toLowerCase();
  if (/\.(?:gif|apng)(?:$|[?#])/.test(src)) return true;
  if (/(?:format|fm)=gif(?:$|[&#])/.test(src)) return true;
  // SpicyChat avatar WebPs may be animated; treating CDN avatar WebPs as
  // candidates is harmless for static files and keeps animated ones hover-only.
  return /cdn\.nd-api\.com\/avatars\/.*\.webp(?:$|[?#])/i.test(src);
}

function drawManagerImageFrame(image, canvas) {
  if (!image?.naturalWidth || !image?.naturalHeight || !canvas) return false;
  try {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return true;
  } catch {
    return false;
  }
}

function freezeManagerAnimatedImage(image) {
  const state = managerAnimatedImageState.get(image);
  if (!state) return;
  state.hovering = false;
  drawManagerImageFrame(image, state.canvas);
  image.style.display = "none";
  state.canvas.hidden = false;
}

function installManagerAnimationGuard() {
  if (managerAnimationGuardInstalled) return;
  managerAnimationGuardInstalled = true;
  const freezeAll = () => {
    for (const image of managerAnimatedImageState.keys()) freezeManagerAnimatedImage(image);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") freezeAll();
  }, true);
  window.addEventListener("blur", freezeAll, true);
}

function setupManagerHoverAnimation(image, host) {
  if (!image?.isConnected || !host?.isConnected) return;
  if (!managerImageSourceLooksAnimated(image.dataset.dsSrc || image.currentSrc || image.src)) return;
  if (managerAnimatedImageState.has(image)) return;
  if (!image.complete || !image.naturalWidth) {
    image.addEventListener("load", () => setupManagerHoverAnimation(image, host), { once: true });
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "bot-manager-image ds-manager-image-freeze-frame";
  canvas.setAttribute("aria-hidden", "true");
  if (!drawManagerImageFrame(image, canvas)) return;
  host.appendChild(canvas);

  const state = { host, canvas, hovering: false };
  managerAnimatedImageState.set(image, state);
  installManagerAnimationGuard();

  const enter = () => {
    state.hovering = true;
    if (document.visibilityState !== "visible" || document.hasFocus?.() === false) {
      state.hovering = false;
      return;
    }
    canvas.hidden = true;
    image.style.display = "";
  };
  const leave = () => freezeManagerAnimatedImage(image);
  state.enter = enter;
  state.leave = leave;
  host.addEventListener("mouseenter", enter);
  host.addEventListener("mouseleave", leave);
  freezeManagerAnimatedImage(image);
}

function makeDeferredManagerImage(src) {
  const value = String(src || "").trim();
  const host = makeElement("span", { className: "bot-manager-media" });
  const image = makeElement("img", {
    className: "bot-manager-image",
    attrs: { alt: "", loading: "lazy", decoding: "async", src: value || null },
    dataset: { dsSrc: value }
  });
  host.appendChild(image);
  if (value) {
    image.addEventListener("load", () => setupManagerHoverAnimation(image, host), { once: true });
    if (image.complete && image.naturalWidth) window.setTimeout(() => setupManagerHoverAnimation(image, host), 0);
  }
  return host;
}

function releaseManagerImages(root = document) {
  // Never strip src from Settings images. Removing it made saved cards stop
  // pointing at their real CDN URL after tab/section changes. Just freeze any
  // animated manager image when its page is no longer active.
  for (const [image, state] of managerAnimatedImageState) {
    if (!image.isConnected) {
      try {
        state.host?.removeEventListener("mouseenter", state.enter);
        state.host?.removeEventListener("mouseleave", state.leave);
        state.canvas?.remove();
      } catch {}
      managerAnimatedImageState.delete(image);
      continue;
    }
    if (root === document || root.contains?.(image)) freezeManagerAnimatedImage(image);
  }
}

function resumeManagerImages(root = document) {
  root?.querySelectorAll?.("img.bot-manager-image[data-ds-src]").forEach(image => {
    const src = String(image.dataset.dsSrc || "").trim();
    if (src && !image.getAttribute("src")) image.setAttribute("src", src);
    const host = image.closest?.(".bot-manager-media");
    if (host) setupManagerHoverAnimation(image, host);
  });
}

function normalizeMathematicalLatinFallback(value) {
  const ranges = [
    [0x2102, 0x2102, 0x43], [0x210A, 0x210A, 0x67],
    [0x210B, 0x210B, 0x48], [0x210C, 0x210C, 0x48],
    [0x210D, 0x210D, 0x48], [0x210E, 0x210E, 0x68],
    [0x2110, 0x2110, 0x49], [0x2111, 0x2111, 0x49],
    [0x2112, 0x2112, 0x4C], [0x2113, 0x2113, 0x6C],
    [0x2115, 0x2115, 0x4E], [0x2119, 0x211B, 0x50],
    [0x211C, 0x211C, 0x52], [0x211D, 0x211D, 0x52],
    [0x2124, 0x2124, 0x5A], [0x2128, 0x2128, 0x5A],
    [0x212A, 0x212A, 0x4B], [0x212C, 0x212D, 0x42],
    [0x212F, 0x212F, 0x65], [0x2130, 0x2131, 0x45],
    [0x2133, 0x2133, 0x4D], [0x2134, 0x2134, 0x6F],
    [0x2139, 0x2139, 0x69], [0x2145, 0x2145, 0x44],
    [0x2146, 0x2147, 0x64], [0x2148, 0x2149, 0x69],
    [0x1D400, 0x1D419, 0x41], [0x1D41A, 0x1D433, 0x61],
    [0x1D434, 0x1D44D, 0x41], [0x1D44E, 0x1D454, 0x61],
    [0x1D456, 0x1D467, 0x69], [0x1D468, 0x1D481, 0x41],
    [0x1D482, 0x1D49B, 0x61], [0x1D49C, 0x1D49C, 0x41],
    [0x1D49E, 0x1D49F, 0x43], [0x1D4A2, 0x1D4A2, 0x47],
    [0x1D4A5, 0x1D4A6, 0x4A], [0x1D4A9, 0x1D4AC, 0x4E],
    [0x1D4AE, 0x1D4B5, 0x53], [0x1D4B6, 0x1D4B9, 0x61],
    [0x1D4BB, 0x1D4BB, 0x66], [0x1D4BD, 0x1D4C3, 0x68],
    [0x1D4C5, 0x1D4CF, 0x70], [0x1D4D0, 0x1D4E9, 0x41],
    [0x1D4EA, 0x1D503, 0x61], [0x1D504, 0x1D505, 0x41],
    [0x1D507, 0x1D50A, 0x44], [0x1D50D, 0x1D514, 0x4A],
    [0x1D516, 0x1D51C, 0x53], [0x1D51E, 0x1D537, 0x61],
    [0x1D538, 0x1D539, 0x41], [0x1D53B, 0x1D53E, 0x44],
    [0x1D540, 0x1D544, 0x49], [0x1D546, 0x1D546, 0x4F],
    [0x1D54A, 0x1D550, 0x53], [0x1D552, 0x1D56B, 0x61],
    [0x1D56C, 0x1D585, 0x41], [0x1D586, 0x1D59F, 0x61],
    [0x1D5A0, 0x1D5B9, 0x41], [0x1D5BA, 0x1D5D3, 0x61],
    [0x1D5D4, 0x1D5ED, 0x41], [0x1D5EE, 0x1D607, 0x61],
    [0x1D608, 0x1D621, 0x41], [0x1D622, 0x1D63B, 0x61],
    [0x1D63C, 0x1D655, 0x41], [0x1D656, 0x1D66F, 0x61],
    [0x1D670, 0x1D689, 0x41], [0x1D68A, 0x1D6A3, 0x61],
    [0x1D7CE, 0x1D7D7, 0x30], [0x1D7D8, 0x1D7E1, 0x30],
    [0x1D7E2, 0x1D7EB, 0x30], [0x1D7EC, 0x1D7F5, 0x30],
    [0x1D7F6, 0x1D7FF, 0x30]
  ];

  let output = "";

  for (const character of String(value || "")) {
    const codePoint = character.codePointAt(0);
    let replacement = character;

    for (const [start, end, asciiStart] of ranges) {
      if (codePoint < start || codePoint > end) continue;
      replacement = String.fromCharCode(asciiStart + (codePoint - start));
      break;
    }

    output += replacement;
  }

  return output;
}

function normalizeSmallCapLatin(value) {
  let output = "";
  for (const character of String(value || "")) output += SMALL_CAP_LATIN_MAP.get(character) || character;
  return output;
}

function stripOrphanCombiningMarks(value) {
  let output = "";
  let previousBase = false;
  for (const character of String(value || "")) {
    if (/\p{M}/u.test(character)) {
      if (previousBase) output += character;
      continue;
    }
    output += character;
    previousBase = /[\p{L}\p{N}]/u.test(character);
    if (/\s|[\p{P}\p{S}]/u.test(character)) previousBase = false;
  }
  return output;
}

function normalizeTextPreviewValue(value) {
  const settings = readTextNormalizationSettingsFromPage();
  let text = String(value || "");

  if (!settings.textNormalizationEnabled) return text.trim();

  if (settings.normalizeInvisibleCharacters) {
    text = text
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
      .replace(/[\u00AD]/g, "");
  }

  if (settings.normalizeFancyUnicode) {
    if (typeof text.normalize === "function") {
      try {
        text = text.normalize("NFKC");
      } catch {}
    }
    text = normalizeMathematicalLatinFallback(text);
    text = normalizeSmallCapLatin(text);
  }

  if (settings.normalizePunctuation) {
    text = text
      .replace(/[‘’‚‛`´]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[‐‑‒–—―]/g, "-")
      .replace(/[⁄∕]/g, "/")
      .replace(/[…]/g, "...")
      .replace(/[•·∙]/g, " ");
  }

  if (settings.normalizeDecorativeSymbols) {
    text = text
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, " ")
      .replace(/[★☆✦✧✩✪✫✬✭✮✯✰♡♥❤💕💖💗💘💝💞💟]/gu, " ")
      .replace(/[꧁꧂◦°⋆]+/gu, " ")
      .replace(/[ᩚ]/gu, " ")
      .replace(/[\u{13000}-\u{1342F}]/gu, " ")
      .replace(/[\u08E3-\u0902₊₋₌⁺⁻⁼]+/gu, " ")
      .replace(/[|｜¦]+/g, " | ");
    text = stripOrphanCombiningMarks(text);
  }

  return text.replace(/\s+/g, " ").trim();
}

function displayNormalizedSavedText(value) {
  return normalizeTextPreviewValue(value);
}

function splitManagerSearchTerms(value) {
  const raw = displayNormalizedSavedText(value || "").toLowerCase();
  return raw.split(",")
    .map(term => term.replace(/\s+/g, " " ).trim())
    .filter(Boolean)
    .slice(0, 20);
}

function managerHaystackMatchesTerms(haystack, terms) {
  if (!Array.isArray(terms) || !terms.length) return true;
  const text = displayNormalizedSavedText(haystack || "").toLowerCase();
  return terms.every(term => text.includes(term));
}

function readTextNormalizationSettingsFromPage() {
  return {
    textNormalizationEnabled: checked("textNormalizationEnabled"),
    normalizeFancyUnicode: checked("normalizeFancyUnicode"),
    normalizePunctuation: checked("normalizePunctuation"),
    normalizeInvisibleCharacters: checked("normalizeInvisibleCharacters"),
    normalizeDecorativeSymbols: checked("normalizeDecorativeSymbols")
  };
}

function updateTextNormalizationPreview() {
  const input = $("textNormalizationPreviewInput");
  const output = $("textNormalizationPreviewOutput");
  if (!input || !output) return;

  output.textContent = normalizeTextPreviewValue(input.value || "");
}

function setVersionText() {
  const versionEl = $("versionText");
  if (!versionEl) return;

  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version_name || displayReleaseVersion(manifest.version)}`;
}

function resetHeavySavedDataState() {
  blockingDataLoaded = false;
  savedListsDataLoaded = false;
  savedRecoveryDataLoaded = false;
  blockingDataLoadPromise = null;
  savedListsDataLoadPromise = null;
  savedRecoveryDataLoadPromise = null;
  savedRecoveryLazySetup = false;
  if (savedRecoveryLazyObserver) {
    try { savedRecoveryLazyObserver.disconnect(); } catch {}
    savedRecoveryLazyObserver = null;
  }
  blockedState = { ids: [], names: [], meta: {} };
  notInterestedState = { ids: [], meta: {} };
  quickDislikeHistoryState = { version: 1, bots: {} };
  quickDislikeBulkState = { version: 1, status: "idle", pendingIds: [], failedIds: [], startedAt: 0, updatedAt: 0, currentId: "", lastMode: "remaining" };
  quickLessLikeHistoryState = { version: 1, bots: {} };
  quickLessLikeBulkState = { version: 2, status: "idle", pendingIds: [], failedIds: [], failureMeta: {}, startedAt: 0, updatedAt: 0, currentId: "", lastMode: "remaining", totalBots: 0, nextQueuePosition: 0, attempted: 0, succeeded: 0, failedCount: 0, retried: 0, skipped: 0, pacing: {} };
  currentOpened = [];
  openedChatMetaState = {};
  favoriteCreatorState = { handles: [], meta: {} };
  followedCreatorState = { handles: [], meta: {} };
  creatorBotWatchState = { version: 1, creators: {}, recent: [], lastRunAt: 0, lastScanAt: 0, lastDurationMs: 0, lastCheckedCreators: 0, lastNewCount: 0, lastFailureCount: 0, lastReason: "", lastWebhookAt: 0, lastWebhookError: "" };
  creatorBotWebhookState = { enabled: false, url: "" };
  favoriteBotState = { ids: [], meta: {} };
  laterBotState = { ids: [], meta: {} };
  recentlySeenBotState = { entries: [] };
  botOrganizationState = { meta: {} };
  botAvailabilityState = { meta: {} };
  botArchiveState = { meta: {} };
  botUnavailableRecoveryState = { version: 1, meta: {} };
  setBotStatusIgnoredIds([]);
}

function validBotId(value) {
  return BOT_ID_RE.test(String(value || "").trim());
}

function setBotStatusIgnoredIds(value) {
  botStatusIgnoredIdsState = uniqueClean(Array.isArray(value) ? value : []).map(id => String(id || "").trim().toLowerCase()).filter(validBotId);
  botStatusIgnoredIdSetState = new Set(botStatusIgnoredIdsState);
  return botStatusIgnoredIdsState;
}

function botStatusIdIgnored(idValue) {
  return botStatusIgnoredIdSetState.has(String(idValue || "").trim().toLowerCase());
}

function filterMetaToValidBotIds(metaValue) {
  const source = metaValue && typeof metaValue === "object" ? metaValue : {};
  const out = {};
  for (const [id, value] of Object.entries(source)) {
    if (validBotId(id)) out[id] = value;
  }
  return out;
}

function filterBulkStateIds(stateValue, normalizeFn) {
  const state = normalizeFn(stateValue);
  state.pendingIds = state.pendingIds.filter(validBotId);
  state.failedIds = state.failedIds.filter(validBotId);
  if (state.failureMeta && typeof state.failureMeta === "object") {
    state.failureMeta = Object.fromEntries(Object.entries(state.failureMeta).filter(([id]) => validBotId(id)));
  }
  if (!validBotId(state.currentId)) state.currentId = "";
  return state;
}

async function cleanupMalformedBlockingRecords(settings = {}) {
  let changed = false;
  const cleanStore = storeValue => {
    const store = normalizeBotStore(storeValue);
    const ids = store.ids.filter(validBotId);
    const meta = filterMetaToValidBotIds(store.meta);
    if (ids.length !== store.ids.length || Object.keys(meta).length !== Object.keys(store.meta || {}).length || (store.names || []).length) changed = true;
    return { ids, names: [], meta };
  };
  blockedState = cleanStore(blockedState);
  notInterestedState = cleanStore(notInterestedState);

  const cleanHistory = (value, normalizeFn) => {
    const state = normalizeFn(value);
    const bots = filterMetaToValidBotIds(state.bots);
    if (Object.keys(bots).length !== Object.keys(state.bots || {}).length) changed = true;
    return { ...state, bots };
  };
  quickDislikeHistoryState = cleanHistory(quickDislikeHistoryState, normalizeQuickDislikeHistory);
  quickLessLikeHistoryState = cleanHistory(quickLessLikeHistoryState, normalizeQuickLessLikeHistory);
  const dislikeBulk = filterBulkStateIds(quickDislikeBulkState, normalizeQuickDislikeBulkState);
  const lessLikeBulk = filterBulkStateIds(quickLessLikeBulkState, normalizeQuickLessLikeBulkState);
  if (JSON.stringify(dislikeBulk) !== JSON.stringify(quickDislikeBulkState)) changed = true;
  if (JSON.stringify(lessLikeBulk) !== JSON.stringify(quickLessLikeBulkState)) changed = true;
  quickDislikeBulkState = dislikeBulk;
  quickLessLikeBulkState = lessLikeBulk;

  const savedBlockedIds = uniqueClean(settings.blockedBotIds || []).filter(validBotId);
  if (savedBlockedIds.length !== uniqueClean(settings.blockedBotIds || []).length || uniqueClean(settings.blockedBotNames || []).length) changed = true;
  settings.blockedBotIds = savedBlockedIds;
  settings.blockedBotNames = [];
  if (!changed) return false;
  await storageSet({
    settings,
    [BLOCKED_BOTS_KEY]: blockedState,
    [NOT_INTERESTED_KEY]: notInterestedState,
    [QUICK_DISLIKE_HISTORY_KEY]: quickDislikeHistoryState,
    [QUICK_DISLIKE_BULK_STATE_KEY]: quickDislikeBulkState,
    [QUICK_LESS_LIKE_HISTORY_KEY]: quickLessLikeHistoryState,
    [QUICK_LESS_LIKE_BULK_STATE_KEY]: quickLessLikeBulkState
  });
  return true;
}

async function cleanupMalformedSavedBotRecords({ includeAvailability = true } = {}) {
  let changed = false;
  const cleanBotStore = storeValue => {
    const store = normalizeBotStore(storeValue);
    const ids = store.ids.filter(validBotId);
    const meta = filterMetaToValidBotIds(store.meta);
    if (ids.length !== store.ids.length || Object.keys(meta).length !== Object.keys(store.meta || {}).length || (store.names || []).length) changed = true;
    return { ids, names: [], meta };
  };

  const openedBefore = uniqueClean(currentOpened);
  currentOpened = openedBefore.filter(validBotId);
  if (currentOpened.length !== openedBefore.length) changed = true;
  const oldOpenedMetaCount = Object.keys(openedChatMetaState || {}).length;
  openedChatMetaState = filterMetaToValidBotIds(openedChatMetaState);
  if (oldOpenedMetaCount !== Object.keys(openedChatMetaState).length) changed = true;
  favoriteBotState = cleanBotStore(favoriteBotState);
  laterBotState = cleanBotStore(laterBotState);

  const recentBefore = normalizeRecentlySeenStore(recentlySeenBotState).entries;
  const recent = recentBefore.filter(item => validBotId(item.id));
  if (recent.length !== recentBefore.length) changed = true;
  recentlySeenBotState = { entries: recent };

  const org = normalizeBotOrganization(botOrganizationState);
  const orgMeta = filterMetaToValidBotIds(org.meta);
  if (Object.keys(orgMeta).length !== Object.keys(org.meta || {}).length) changed = true;
  botOrganizationState = { ...org, meta: orgMeta };

  if (includeAvailability) {
    const availability = normalizeBotAvailability(botAvailabilityState);
    const availabilityMeta = filterMetaToValidBotIds(availability.meta);
    if (Object.keys(availabilityMeta).length !== Object.keys(availability.meta || {}).length) changed = true;
    botAvailabilityState = { meta: availabilityMeta };
  }

  const watch = normalizeCreatorBotWatchState(creatorBotWatchState);
  const recentWatch = watch.recent.filter(item => validBotId(item.id));
  if (recentWatch.length !== watch.recent.length) changed = true;
  for (const creator of Object.values(watch.creators || {})) {
    const ids = uniqueClean(creator.seenIds || []).filter(validBotId);
    if (ids.length !== uniqueClean(creator.seenIds || []).length) changed = true;
    creator.seenIds = ids;
  }
  creatorBotWatchState = { ...watch, recent: recentWatch };

  // Intentionally never remove BOT_ARCHIVE_KEY entries here: recovery copies
  // are allowed to outlive the live bot and may be the only remaining copy.
  if (!changed) return false;
  await storageSet({
    [OPENED_KEY]: currentOpened,
    [OPENED_META_KEY]: openedChatMetaState,
    [FAVORITE_BOTS_KEY]: favoriteBotState,
    [LATER_BOTS_KEY]: laterBotState,
    [RECENTLY_SEEN_BOTS_KEY]: recentlySeenBotState,
    [BOT_ORGANIZER_KEY]: botOrganizationState,
    ...(includeAvailability ? { [BOT_AVAILABILITY_KEY]: botAvailabilityState } : {}),
    [CREATOR_BOT_WATCH_KEY]: creatorBotWatchState
  });
  return true;
}

async function ensureBlockingDataLoaded() {
  if (blockingDataLoaded) return true;
  if (blockingDataLoadPromise) return blockingDataLoadPromise;

  blockingDataLoadPromise = (async () => {
    const result = await storageGet(["settings", ...BLOCKING_DATA_KEYS]);
    const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
    blockedState = normalizeBotStore(result[BLOCKED_BOTS_KEY]);
    renderAutoBlockMatchCounters();
    blockedState.ids = uniqueClean([...(settings.blockedBotIds || []), ...blockedState.ids]);
    blockedState.names = uniqueClean([...(settings.blockedBotNames || []), ...blockedState.names]);
    notInterestedState = normalizeBotStore(result[NOT_INTERESTED_KEY]);
    quickDislikeHistoryState = normalizeQuickDislikeHistory(result[QUICK_DISLIKE_HISTORY_KEY]);
    quickDislikeBulkState = normalizeQuickDislikeBulkState(result[QUICK_DISLIKE_BULK_STATE_KEY]);
    quickLessLikeHistoryState = normalizeQuickLessLikeHistory(result[QUICK_LESS_LIKE_HISTORY_KEY]);
    quickLessLikeBulkState = normalizeQuickLessLikeBulkState(result[QUICK_LESS_LIKE_BULK_STATE_KEY]);
    await cleanupMalformedBlockingRecords(settings);
    blockingDataLoaded = true;
    return true;
  })().finally(() => {
    blockingDataLoadPromise = null;
  });
  return blockingDataLoadPromise;
}

function largeSavedStoreRecordCount(key, value) {
  if (key === BOT_ARCHIVE_KEY) return Object.keys(normalizeBotArchive(value).meta).length;
  if (key === BOT_AVAILABILITY_KEY) return Object.keys(normalizeBotAvailability(value).meta).length;
  if (key === LOREBOOK_STATUS_KEY) return Object.keys(normalizeLorebookStatusStore(value).meta).length;
  return 0;
}

async function retryMissingLargeSavedStores(resultValue, requestedKeys = [BOT_ARCHIVE_KEY, BOT_AVAILABILITY_KEY]) {
  const result = resultValue && typeof resultValue === "object" ? { ...resultValue } : {};
  const requested = [...new Set((requestedKeys || []).filter(key => LARGE_STORAGE_KEYS.has(key)))];
  if (!requested.length) return result;

  let stats = {};
  try { stats = await readLargeStorageStats(); } catch {}
  const retryKeys = requested.filter(key => (
    largeSavedStoreRecordCount(key, result[key]) === 0 && Number(stats?.[key] || 0) > 0
  ));
  if (!retryKeys.length) return result;

  // A just-reloaded extension can briefly answer the first large-store request
  // before IndexedDB is ready. Retry the exact missing stores once instead of
  // locking recovery UI or a backup export into an empty result for the session.
  await new Promise(resolve => setTimeout(resolve, 80));
  try {
    const recovered = await readLargeStorageForRequest(retryKeys);
    if (recovered && typeof recovered === "object") Object.assign(result, recovered);
  } catch {}
  return result;
}

async function ensureSavedListsDataLoaded() {
  if (savedListsDataLoaded) return true;
  if (savedListsDataLoadPromise) return savedListsDataLoadPromise;

  savedListsDataLoadPromise = (async () => {
    let result = await storageGet(SAVED_LIST_DATA_KEYS);
    result = await retryMissingLargeSavedStores(result);
    currentOpened = Array.isArray(result[OPENED_KEY]) ? result[OPENED_KEY] : [];
    openedChatMetaState = normalizeMetaStore(result[OPENED_META_KEY]);
    favoriteCreatorState = normalizeCreatorStore(result[FAVORITE_CREATORS_KEY]);
    followedCreatorState = normalizeCreatorStore(result[FOLLOWED_CREATORS_KEY]);
    creatorBotWatchState = normalizeCreatorBotWatchState(result[CREATOR_BOT_WATCH_KEY]);
    favoriteBotState = normalizeBotStore(result[FAVORITE_BOTS_KEY]);
    laterBotState = normalizeBotStore(result[LATER_BOTS_KEY]);
    recentlySeenBotState = normalizeRecentlySeenStore(result[RECENTLY_SEEN_BOTS_KEY]);
    botOrganizationState = normalizeBotOrganization(result[BOT_ORGANIZER_KEY]);
    setBotStatusIgnoredIds(result[BOT_STATUS_IGNORED_KEY]);
    await ensureBlockingDataLoaded();
    await cleanupMalformedSavedBotRecords({ includeAvailability: false });
    const blockedPriorityCleanup = enforceBlockedPriorityOverOpenedState({ markDirty: false });
    if (blockedPriorityCleanup.removed) {
      await storageSet({
        [OPENED_KEY]: blockedPriorityCleanup.ids,
        [OPENED_META_KEY]: blockedPriorityCleanup.meta
      });
    }
    if ($("openedCount")) $("openedCount").textContent = `${currentOpened.length} stored`;
    savedListsDataLoaded = true;
    invalidateDuplicateCache();
    return true;
  })().finally(() => {
    savedListsDataLoadPromise = null;
  });
  return savedListsDataLoadPromise;
}

async function ensureSavedRecoveryDataLoaded() {
  if (savedRecoveryDataLoaded) return true;
  if (savedRecoveryDataLoadPromise) return savedRecoveryDataLoadPromise;

  savedRecoveryDataLoadPromise = (async () => {
    await ensureSavedListsDataLoaded();
    let result = await storageGet(SAVED_RECOVERY_DATA_KEYS);
    result = await retryMissingLargeSavedStores(result, [BOT_ARCHIVE_KEY, BOT_AVAILABILITY_KEY]);
    botAvailabilityState = normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]);
    botArchiveState = normalizeBotArchive(result[BOT_ARCHIVE_KEY]);
    botUnavailableRecoveryState = normalizeBotUnavailableRecovery(result[BOT_UNAVAILABLE_RECOVERY_KEY]);
    savedRecoveryDataLoaded = true;
    await cleanupMalformedSavedBotRecords({ includeAvailability: true });
    invalidateDuplicateCache();
    return true;
  })().finally(() => {
    savedRecoveryDataLoadPromise = null;
  });
  return savedRecoveryDataLoadPromise;
}

async function ensureHeavySavedDataLoaded(tabName = "all") {
  if (tabName === "blocking") return ensureBlockingDataLoaded();
  // Saved Bots Hub includes Blocked and Not Interested status, so the Saved
  // tab needs both stores even though the dedicated blocking managers remain
  // lazily rendered only on Discovery & Filters.
  if (tabName === "saved") {
    await Promise.all([ensureBlockingDataLoaded(), ensureSavedListsDataLoaded()]);
    return true;
  }
  await Promise.all([ensureBlockingDataLoaded(), ensureSavedListsDataLoaded(), ensureSavedRecoveryDataLoaded()]);
  return true;
}

async function renderSavedRecoveryPlaceholders() {
  if (savedRecoveryDataLoaded) return;
  let stats = {};
  try { stats = await readLargeStorageStats(); } catch {}
  const archiveCount = Math.max(0, Number(stats?.[BOT_ARCHIVE_KEY] || 0));
  const availabilityCount = Math.max(0, Number(stats?.[BOT_AVAILABILITY_KEY] || 0));
  const messages = {
    savedBotInfoManager: archiveCount
      ? `${archiveCount.toLocaleString()} saved ${archiveCount === 1 ? "copy" : "copies"} available. Open this section to load them.`
      : "Saved recovery copies load only when this section is opened.",
    deletedSavedBotManager: "Deleted / unavailable recovery loads only when this section is opened.",
    botAvailabilityManager: availabilityCount
      ? `${availabilityCount.toLocaleString()} Bot Status ${availabilityCount === 1 ? "record" : "records"} available. Open this section to load them.`
      : "Bot Status data loads only when this section is opened."
  };
  for (const [id, message] of Object.entries(messages)) {
    const host = $(id);
    if (host) setEmptyState(host, message);
  }
}

async function loadAndRenderSavedRecoveryManagers(source = "opened") {
  if (savedRecoveryDataLoaded) return true;
  ["savedBotInfoManager", "deletedSavedBotManager", "botAvailabilityManager"].forEach(id => {
    const host = $(id);
    if (host) setEmptyState(host, "Loading recovery/status data...");
  });
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  await ensureSavedRecoveryDataLoaded();
  if (activeOptionsTab() !== "saved") return true;
  const sameNameCollisions = botSameNameCollisionIndex();
  renderSavedBotInfo({ sameNameCollisions });
  renderDeletedSavedBots({ sameNameCollisions });
  renderBotAvailability({ sameNameCollisions, skipRecoveryRerender: true });
  refreshArchiveTransferUi().catch(() => {});
  if (started && optionsDiagnosticState.active) {
    optionsDiag("options-saved-bots", "lazy-recovery-load", {
      source: String(source || "opened"),
      durationMs: Math.round((performance.now() - started) * 10) / 10,
      archiveRecords: Object.keys(normalizeBotArchive(botArchiveState).meta).length,
      availabilityRecords: Object.keys(normalizeBotAvailability(botAvailabilityState).meta).length
    }, { critical: (performance.now() - started) >= 200 });
  }
  return true;
}

function setupSavedRecoveryLazyActivation() {
  if (savedRecoveryLazySetup || savedRecoveryDataLoaded) return;
  savedRecoveryLazySetup = true;
  const cards = [...new Set(["savedBotInfoManager", "deletedSavedBotManager", "botAvailabilityManager"]
    .map(id => $(id)?.closest?.("section.card.ds-settings-card-collapsible"))
    .filter(Boolean))];
  if (!cards.length) return;

  const activate = source => {
    if (savedRecoveryDataLoaded || activeOptionsTab() !== "saved") return;
    loadAndRenderSavedRecoveryManagers(source).catch(() => {});
  };

  for (const card of cards) card.addEventListener("ds-settings-card-opened", () => activate("section-opened"));
  if (typeof IntersectionObserver === "function") {
    savedRecoveryLazyObserver = new IntersectionObserver(entries => {
      if (savedRecoveryDataLoaded || activeOptionsTab() !== "saved") return;
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.target.classList.contains("ds-settings-card-collapsed")) continue;
        activate("section-visible");
        break;
      }
    }, { root: null, rootMargin: "240px 0px", threshold: 0.01 });
    cards.forEach(card => savedRecoveryLazyObserver.observe(card));
  }
}

async function renderHeavyManagersForTab(tabName) {
  if (!optionsDataLoaded || !["saved", "blocking"].includes(tabName)) return;
  if (renderedHeavyTabs.has(tabName)) return;

  const token = ++heavyRenderToken;
  const loadingHosts = tabName === "saved"
    ? ["savedBotInfoManager", "deletedSavedBotManager", "lorebookCenterRecent", "savedBotsHubManager", "favoriteCreatorManager", "followedCreatorManager", "creatorBotRecentList", "favoriteBotManager", "laterBotManager", "openedBotManager", "botAvailabilityManager"]
    : ["blockedBotManager", "notInterestedBotManager"];
  loadingHosts.forEach(id => {
    const host = $(id);
    if (host && !host.children.length) setEmptyState(host, "Loading saved data...");
  });

  await ensureHeavySavedDataLoaded(tabName);
  if (tabName === "saved") {
    // Lorebook status is normally tiny compared with Bot Status / recovery.
    // Keep its existing automatic load so the section does not appear empty,
    // while the multi-thousand-record bot datasets remain lazy below.
    try { await refreshLorebookCenter(); }
    catch { renderLorebookCenter(); }
  }
  if (token !== heavyRenderToken || activeOptionsTab() !== tabName) return;

  const renderers = tabName === "saved"
    ? [
        renderSavedBotsHub,
        renderFavoriteCreators,
        renderFollowedCreators,
        renderCreatorBotWatchStatus,
        () => renderBotManager("favorite"),
        () => renderBotManager("later"),
        () => renderBotManager("opened")
      ]
    : [
        () => renderBotManager("blocked"),
        () => renderBotManager("notInterested")
      ];

  // Yield between managers so opening a tab never locks the entire options
  // page while several thousand saved entries are being normalized/sorted.
  // Prefer actual browser idle time when available; requestAnimationFrame alone
  // can still put a large manager render directly into a frame the user needs.
  for (const render of renderers) {
    await nextOptionsIdleSlice();
    if (token !== heavyRenderToken || activeOptionsTab() !== tabName) return;
    render();
  }

  renderedHeavyTabs.add(tabName);
  if (tabName === "saved") {
    renderSavedRecoveryPlaceholders().catch(() => {});
    setupSavedRecoveryLazyActivation();
  }
}

function releaseTemporaryOptionsMemory() {
  heavyRenderToken += 1;
  renderedHeavyTabs.clear();
  invalidateDuplicateCache();
  releaseManagerImages(document);
  resetHeavySavedDataState();

  creatorBackupManagerLoaded = false;
  creatorBackupManagerLoading = false;
  creatorBackupManagerState = {
    bots: normalizeBotArchive(null),
    lorebooks: normalizeLorebookBackups(null),
    settings: { ...DEFAULT_SETTINGS }
  };

  const heavyHosts = [
    "savedBotInfoManager", "deletedSavedBotManager", "lorebookCenterRecent",
    "savedBotsHubManager", "favoriteCreatorManager", "followedCreatorManager",
    "creatorBotRecentList", "favoriteBotManager", "laterBotManager",
    "openedBotManager", "botAvailabilityManager", "blockedBotManager",
    "notInterestedBotManager", "creatorBackupManager"
  ];
  heavyHosts.forEach(id => {
    const host = $(id);
    if (host) setEmptyState(host, "Temporary Settings data released. Open this section again to reload it.");
  });

  lastPerformanceSelfCheckText = "";
  OPTIONS_PERFORMANCE.slowStorageReads = [];
  showSettingsToast("Released temporary Settings memory. Saved QoL data was not deleted.");
}

function setActiveTab(tabName) {
  const previousTab = activeOptionsTab();
  if (previousTab && previousTab !== tabName) {
    const previousPage = document.querySelector(`.tab-page[data-page="${CSS.escape(previousTab)}"]`);
    if (previousPage) releaseManagerImages(previousPage);
  }

  document.querySelectorAll(".tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  const mobileSectionsCurrent = $("mobileSectionsCurrent");
  if (mobileSectionsCurrent) {
    const currentButton = document.querySelector(`.tab-button[data-tab="${CSS.escape(tabName)}"]`);
    mobileSectionsCurrent.textContent = String(currentButton?.firstChild?.textContent || currentButton?.textContent || tabName)
      .trim().replace(/\s+/g, " ");
  }

  document.querySelectorAll(".tab-page").forEach(page => {
    page.classList.toggle("active", page.dataset.page === tabName);
  });

  const footer = $("settingsFooter");
  if (footer) footer.classList.toggle("hidden", tabName === "help" || tabName === "changelog");

  try { sessionStorage.setItem("spicychatQolOptionsTab", tabName); } catch {}
  try { localStorage.setItem("spicychatQolLastOptionsTabV1", tabName); } catch {}
  // The Settings launcher opens options.html#general. Keep the hash in step
  // with the selected section so refreshing does not force General again.
  try {
    if (location.hash !== `#${tabName}`) {
      history.replaceState(history.state, "", `${location.pathname}${location.search}#${tabName}`);
    }
  } catch {}

  // Lightweight pages can become usable before the large saved-data load is
  // finished. Heavy managers render only after their tab is actually opened.
  if (tabName === "changelog") loadChangelog();
  if (tabName === "features") DS_FEATURE_INDEX_REFRESH?.();
  if (tabName === "bot-tools") loadCreatorBackupManager().catch(() => {});
  if (tabName === "control" && optionsDataLoaded) setupControlCenterView().catch(() => {});
  if (tabName === "account" && optionsDataLoaded) refreshAccountSyncUi().catch(() => {});
  if (tabName === "data" && optionsDataLoaded) {
    refreshStorageUsage().catch(() => {});
    renderLocalChangeHistory().catch(() => {});
    refreshRecoverySnapshotStatus().catch(() => {});
    initializeExportScopeSelection().catch(() => {});
  }
  if (tabName === "browser" && optionsDataLoaded) {
    renderTabCleanupSessions().catch(() => {});
    loadTabCleanupTopics().catch(() => {});
  }
  renderHeavyManagersForTab(tabName);
  const currentPage = document.querySelector(`.tab-page[data-page="${CSS.escape(tabName)}"]`);
  if (currentPage) window.setTimeout(() => resumeManagerImages(currentPage), 0);
}

function setupTabs() {
  const mobileToggle = $("mobileSectionsToggle");
  const mobileNavigation = $("optionsTabsNav");
  const closeMobileNavigation = () => {
    mobileNavigation?.classList.remove("is-mobile-open");
    mobileToggle?.setAttribute("aria-expanded", "false");
  };
  mobileToggle?.addEventListener("click", () => {
    if (!mobileNavigation) return;
    const open = mobileNavigation.classList.toggle("is-mobile-open");
    mobileToggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !mobileNavigation?.classList.contains("is-mobile-open")) return;
    closeMobileNavigation();
    mobileToggle?.focus();
  });
  document.addEventListener("click", event => {
    if (!mobileNavigation?.classList.contains("is-mobile-open")) return;
    if (mobileToggle?.contains(event.target) || mobileNavigation.contains(event.target)) return;
    closeMobileNavigation();
  });
  window.matchMedia("(min-width: 721px)").addEventListener?.("change", closeMobileNavigation);
  document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab);
      closeMobileNavigation();
    });
  });

  let savedTab = "";
  let persistentTab = "";
  try { savedTab = sessionStorage.getItem("spicychatQolOptionsTab") || ""; } catch {}
  try { persistentTab = localStorage.getItem("spicychatQolLastOptionsTabV1") || ""; } catch {}
  const hashTab = String(location.hash || "").replace(/^#/, "");
  const validTabs = new Set([...document.querySelectorAll(".tab-button")].map(button => button.dataset.tab));
  const preferredTabs = hashTab && hashTab !== "general"
    ? [hashTab, savedTab, persistentTab, "general"]
    : [savedTab, persistentTab, hashTab, "general"];
  const targetTab = preferredTabs.find(tab => validTabs.has(tab)) || "general";
  setActiveTab(targetTab);
}

function setupPageIntros() {
  document.querySelectorAll(".tab-page").forEach(page => {
    const tabName = page.dataset.page || "";
    const text = PAGE_INTROS[tabName];
    if (!text || page.querySelector(":scope > .page-intro")) return;
    const intro = document.createElement("p");
    intro.className = "page-intro";
    intro.textContent = text;
    page.prepend(intro);
  });
}

function cardSearchText(card) {
  // textContent does not force style/layout calculation for every hidden tab.
  // innerText did, which made Options startup increasingly expensive as more
  // settings cards were added.
  return String(card?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function setSettingsSearchExpanded(expanded, { focus = false } = {}) {
  const card = $("settingsSearchCard");
  const toggle = $("settingsSearchToggle");
  const body = $("settingsSearchBody");
  if (!card || !toggle || !body) return;
  const open = !!expanded;
  card.classList.toggle("is-collapsed", !open);
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  body.hidden = !open;
  if (open && focus) window.setTimeout(() => $("settingsSearch")?.focus(), 0);
}

function setupSettingsSearch() {
  const SEARCH_ALIASES = {
    autoFillListings: "refill fill page listing autofill hidden cards",
    paginationTopJumpBox: "page number jump go top chatbot listing pagination 20000",
    paginationQuickJumpMenu: "pagination page jump dropdown random page quick menu ellipsis dots 20000",
    expandBotNamesOnHover: "bot name title expander full name hover tap cut off",
    showListingRefillButton: "refill fill now manual listing",
    showListingFilterStats: "bot blocking filters blocked filtered bots result count stats results found listing statistics",
    showListingFilterStatsDetails: "bot blocking filters blocked filtered breakdown details language tags words creators listing statistics",
    autoLoadMyCreations: "my creations automatic auto load more bots pages creator",
    myCreationsAutoLoadPages: "my creations auto load more pages batches count",
    enableChatBackgrounds: "background wallpaper image custom chat",
    chatBackgroundFit: "background cover contain tile repeat",
    chatBackgroundPosition: "background alignment position",
    enableCreationAudit: "creator creation qa audit tags placeholders definition",
    showMessageTimestamps: "timestamp time date messages",
    enableMessageBookmarks: "bookmark pin saved message jump",
    blockedBotSearch: "block blocked manager dislike",
    favoriteBotSearch: "favorites favourite liked bots manager",
    laterBotSearch: "later saved bots manager",
    settingsJson: "backup restore import export json",
    enableReplyInstructions: "reply response instruction instructions style shorter length emoji roleplay ooc persistent bot behavior",
    enableGlobalMemory: "global memory baseline notes all chats universal memory recurring facts behavior ooc",
    enableRpStateTracker: "roleplay state tracker inventory equipment worn clothing stats hp health gold currency current location quest objective party injury status",
    enableLorebookConsistency: "lorebook response consistency post response keyword outgoing ai self lookup continuity",
    enableRpFormatRepair: "roleplay rp formatting repair asterisk dialogue",
    showChatSearch: "find search current chat messages regex",
    enableBulkCardBlocking: "select bots bulk blocking multi select bot cards home recommendations creator pages",
    bulkCardBlockingSidebarLauncher: "select bots placement narrow by group size sidebar",
    rememberBotImagePrompt: "remember save restore chatbot character image generation prompt edit editor refresh",
    settingsNavigationStyle: "settings layout navigation tabs classic grouped categories options appearance",
  settingsContentLayout: "settings layout cards single column adaptive columns two column options appearance",
  settingsPageWidth: "settings layout width comfortable wide full page options appearance",
  collapseSettingsSectionsByDefault: "settings sections collapsed collapse options dropdown dropdowns accordion accordions less scrolling compact settings",
    enableCommandPalette: "command palette ctrl k shortcut quick search navigation actions control center",
    commandPaletteShortcut: "keyboard shortcut hotkey ctrl k command palette",
    commandPaletteShowSavedItems: "command palette saved bots lorebooks personas favorites later",
    qolInterfaceScale: "accessibility text size font size larger bigger settings interface ui eye strain readability",
    chatTextScale: "accessibility chat message text font size larger bigger eye strain readability",
    chatLineSpacing: "accessibility chat line spacing comfortable spacious readability eye strain",
    settingsReadingFont: "settings accessibility dyslexia fonts open dyslexic verdana reading",
    settingsReadingSize: "settings text size zoom readability",
    settingsReadingLineSpacing: "settings accessibility line spacing readability",
    settingsReadingLetterSpacing: "settings accessibility letter spacing dyslexia",
    settingsReadingContrast: "settings accessibility stronger contrast",
    settingsReadingLargerControls: "settings accessibility bigger buttons touch controls",
    chatListBlockedFilter: "chat list blocked bots filter blocked state"
  };

  const GENERIC_SEARCH_TERMS = "setting settings option options preference preferences pref control controls configuration config";
  const GENERIC_QUERY_TERMS = new Set(GENERIC_SEARCH_TERMS.split(/\s+/));
  const featureRegistry = Array.isArray(window.SpicyChatQoLFeatureRegistry) ? window.SpicyChatQoLFeatureRegistry : [];

  function registrySearchTextFor(controlId, targetId, cardId) {
    const id = String(controlId || targetId || "");
    const parts = [];
    for (const entry of featureRegistry) {
      const settings = Array.isArray(entry?.settings) ? entry.settings : [];
      const matched = (id && (entry?.setting === id || settings.includes(id) || entry?.target === id)) || (cardId && entry?.target === cardId);
      if (!matched) continue;
      parts.push(entry.name, entry.category, entry.description, ...(entry.aliases || []));
    }
    return parts.filter(Boolean).join(" ");
  }

  const input = $("settingsSearch");
  const host = $("settingsSearchResults");
  const toggle = $("settingsSearchToggle");
  if (!input || !host) return;

  // The first activation lazily builds the cross-tab search index. Keep the
  // user's expanded state while that second-stage setup runs; otherwise an
  // empty search box immediately collapses again after the first click.
  const firstSetup = !input.dataset.dsSearchIndexReady;
  if (firstSetup) {
    setSettingsSearchExpanded(!!input.value.trim());
  }

  if (firstSetup) {
    input.dataset.dsSearchIndexReady = "1";
    const activate = () => {
      if (input.dataset.dsSearchActivating === "1") return;
      input.dataset.dsSearchActivating = "1";
      setSettingsSearchExpanded(true, { focus: true });
      window.setTimeout(() => { delete input.dataset.dsSearchActivating; setupSettingsSearch(); }, 0);
    };
    toggle?.addEventListener("click", activate, { once: true });
    input.addEventListener("focus", activate, { once: true });
    return;
  }
  toggle?.addEventListener("click", () => {
    const card = $("settingsSearchCard");
    const currentlyOpen = !card?.classList.contains("is-collapsed");
    if (currentlyOpen && input.value.trim()) { input.focus(); return; }
    setSettingsSearchExpanded(!currentlyOpen, { focus: !currentlyOpen });
  });
  input.addEventListener("focus", () => setSettingsSearchExpanded(true));

  function cleanSearchText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nearestSubheading(target, card) {
    let found = "";
    card.querySelectorAll("h3").forEach(heading => {
      if (heading === target || (heading.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        found = cleanSearchText(heading.textContent);
      }
    });
    return found;
  }

  function labelPrimaryText(label) {
    if (!label) return "";
    const directSpan = label.querySelector(":scope > span");
    if (directSpan) return cleanSearchText(directSpan.textContent);

    // Do not let select options, dependency helper buttons, validation text,
    // or dynamic counters become the visible search-result label.
    const clone = label.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, button, small, .hint, .setting-dependency-note").forEach(node => node.remove());
    return cleanSearchText(clone.textContent);
  }

  function targetLabel(target) {
    if (!target) return "Setting";
    if (target.matches("label")) return labelPrimaryText(target);
    if (target.matches("button")) return cleanSearchText(target.textContent || target.getAttribute("aria-label"));
    const label = target.closest("label");
    if (label) return labelPrimaryText(label);
    return cleanSearchText(target.textContent || target.getAttribute?.("aria-label")) || "Setting";
  }

  function isSearchNoiseButton(button) {
    if (!button) return true;
    if (button.closest([
      ".settings-search-results",
      ".bot-manager-list",
      ".bot-manager-pager",
      ".bot-manager-bulkbar",
      ".bot-availability-list",
      ".tab-cleanup-session-list",
      ".tab-cleanup-topic-list",
      ".tab-cleanup-review-list",
      ".creator-relation-list",
      ".control-health-results",
      ".control-storage-grid"
    ].join(","))) return true;
    if (button.matches(".settings-card-toggle, .settings-card-pin, .settings-card-reset")) return true;

    const text = cleanSearchText(button.textContent || button.getAttribute("aria-label"));
    return /^(?:show\s+(?:\d+\s+more|first\s+\d+|\d+)|load\s+more|open\s+profile|open\s+chat|copy\s+link|select|remove|recheck)$/i.test(text);
  }

  // Search *features*, not the thousands of nested Settings labels, synced
  // storage keys, repeated creator-specific switches, or manager row controls.
  // A feature gets one searchable result and still links to its real Settings.
  const items = [];
  for (const entry of featureRegistry) {
    if (!entry?.id || !entry?.name || entry.planned) continue;
    const candidates = [entry.target, entry.setting, ...(Array.isArray(entry.settings) ? entry.settings : [])]
      .filter(Boolean).map(id => document.getElementById(String(id))).filter(Boolean);
    const target = candidates.find(node => node.closest(".tab-page")) || null;
    const card = target?.closest(".card") || null;
    const page = target?.closest(".tab-page") || null;
    const tabName = page?.dataset.page || "features";
    const tabButton = document.querySelector(`.tab-button[data-tab="${CSS.escape(tabName)}"]`);
    const tabLabel = cleanSearchText(tabButton?.textContent) || "Features";
    const name = cleanSearchText(entry.name);
    // Curated aliases are intentionally searchable; free-form descriptions,
    // category names and setting IDs aren't (they caused unrelated matches).
    // Search actual feature names only. Aliases/descriptions are kept in the
    // registry for help text, not used to flood feature discovery results.
    const aliases = [];
    items.push({
      index: items.length,
      target: target || $("featureIndexSearch") || $("featureIndexList"),
      control: target?.matches?.("input, select, textarea, button") ? target : null,
      card: card || $("featureIndexList"),
      tabName,
      tabLabel,
      cardHeading: name,
      subheading: "",
      label: name,
      kind: "feature",
      searchText: cleanSearchText([name, ...aliases].join(" ")).toLowerCase(),
      targetText: name.toLowerCase()
    });
  }

  const clearResults = () => {
    host.hidden = true;
    host.replaceChildren();
  };

  const scoreMatch = (item, query, terms) => {
    let score = 0;
    if (item.kind === "feature") score += 120;
    if (item.targetText === query) score += 1000;
    else if (item.targetText.startsWith(query)) score += 700;
    else if (item.targetText.includes(query)) score += 500;
    if (item.label.toLowerCase().includes(query)) score += 350;
    if (item.subheading.toLowerCase().includes(query)) score += 180;
    if (item.cardHeading.toLowerCase().includes(query)) score += 90;
    for (const term of terms) {
      if (item.targetText.includes(term)) score += 35;
      if (item.label.toLowerCase().startsWith(term)) score += 20;
    }
    return score;
  };

  const revealAndScrollTo = item => {
    setActiveTab(item.tabName);
    if (item.tabName === "features" && item.kind === "feature") {
      const featureSearch = $("featureIndexSearch");
      if (featureSearch) { featureSearch.value = item.label; featureSearch.dispatchEvent(new Event("input", { bubbles: true })); }
    }
    expandSettingsCardForTarget(item.target);
    recordRecentSettingsCard(item.card);

    // A matching setting can live inside a collapsed <details>. Open all of
    // those ancestors before measuring/scrolling so the browser can actually
    // land on the requested control.
    let details = item.target.closest?.("details") || null;
    while (details) {
      details.open = true;
      details = details.parentElement?.closest?.("details") || null;
    }

    document.querySelectorAll(".ds-search-target").forEach(target => target.classList.remove("ds-search-target"));

    // Tab display changes and heavy-tab rendering can alter layout. Waiting two
    // frames makes the final scroll use the setting's real post-tab position.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = item.target?.isConnected ? item.target : item.card;
      if (!target) return;
      target.classList.add("ds-search-target");

      const focusTarget = item.control?.isConnected
        ? item.control
        : target.querySelector?.("input, select, textarea, button");
      const isNativeSelect = focusTarget?.tagName === "SELECT";

      // Do not programmatically focus settings after a search jump. The old
      // delayed focus could steal focus just after the user clicked a native
      // <select>, immediately collapsing the browser's dropdown. Select targets
      // also use an instant jump so an in-progress smooth scroll cannot dismiss
      // the popup while the user is choosing an option.
      target.scrollIntoView({
        behavior: isNativeSelect ? "auto" : "smooth",
        block: "center",
        inline: "nearest"
      });

      window.setTimeout(() => target.classList.remove("ds-search-target"), 2200);
    }));
  };

  function fuzzyTermMatch(text, term) {
    const hay = String(text || "").toLowerCase();
    const needle = String(term || "").toLowerCase();
    if (!needle) return true;
    if (hay.includes(needle)) return true;
    // Short queries such as "tag" must not match unrelated titles simply
    // because t, a and g appear somewhere in a long feature name.
    if (needle.length <= 4) return false;
    // One typo in a *word* is enough; do not fuzzy-match across whole labels.
    const withinOneEdit = word => {
      if (Math.abs(word.length - needle.length) > 1) return false;
      let i = 0, j = 0, edits = 0;
      while (i < word.length && j < needle.length) {
        if (word[i] === needle[j]) { i++; j++; continue; }
        if (++edits > 1) return false;
        if (word.length > needle.length) i++;
        else if (word.length < needle.length) j++;
        else { i++; j++; }
      }
      return edits + (word.length - i) + (needle.length - j) <= 1;
    };
    return hay.split(/[^\p{L}\p{N}]+/u).some(word => word && withinOneEdit(word));
  }

  let lastMatches = [];

  const render = () => {
    const rawQuery = String(input.value || "").trim().toLowerCase();
    const rawTerms = rawQuery.split(/\s+/).filter(Boolean);
    if (!rawTerms.length) {
      clearResults();
      return;
    }

    // Words such as "preference", "setting", "option" and "config" describe
    // what the user is searching, not the feature itself. Treat them as
    // modifiers when a more specific term is present. Previously a query like
    // "preference" accidentally favored Context Keeper because its help text
    // literally contains "preferences".
    const terms = rawTerms.filter(term => !GENERIC_QUERY_TERMS.has(term));
    const genericOnly = terms.length === 0;
    const query = terms.join(" ");

    const directItems = genericOnly
      ? items
      : items.filter(item => terms.every(term => item.searchText.includes(term)));
    const candidateItems = directItems.length || genericOnly
      ? directItems
      : items.filter(item => terms.every(term => fuzzyTermMatch(item.searchText, term)));
    const matches = candidateItems
      .map(item => ({ item, score: genericOnly ? 0 : scoreMatch(item, query, terms) + (directItems.includes(item) ? 0 : -120) }))
      .sort((a, b) => {
        if (genericOnly) return a.item.index - b.item.index;
        return b.score - a.score || a.item.label.length - b.item.label.length;
      })
      .slice(0, 50);

    lastMatches = matches;
    host.hidden = false;

    if (!matches.length) {
      host.replaceChildren(makeElement("div", {
        className: "settings-search-empty",
        text: `No features matched “${rawQuery}”.`
      }));
      return;
    }

    const buttons = matches.map(({ item }) => {
      const path = [item.tabLabel, item.cardHeading];
      if (item.subheading && item.subheading !== item.cardHeading) path.push(item.subheading);
      const exact = item.kind === "feature" ? "Open feature settings" : item.label;
      const button = makeElement("button", {
        className: "settings-search-result",
        attrs: { type: "button" },
        dataset: { searchItemIndex: item.index }
      }, [
        makeElement("strong", { text: path.join(" › ") }),
        makeElement("small", { text: exact })
      ]);
      return button;
    });

    host.replaceChildren(...buttons);

    host.querySelectorAll(".settings-search-result").forEach(button => {
      button.addEventListener("click", () => {
        const item = items.find(candidate => candidate.index === Number(button.dataset.searchItemIndex));
        if (!item) return;
        input.value = "";
        clearResults();
        revealAndScrollTo(item);
      });
    });
  };

  const renderDebounced = debounceCallback(() => { OPTIONS_PERFORMANCE.searchRenders += 1; render(); }, 120);
  input.addEventListener("input", renderDebounced);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && lastMatches.length) {
      event.preventDefault();
      const item = lastMatches[0]?.item;
      if (item) {
        input.value = "";
        clearResults();
        revealAndScrollTo(item);
      }
      return;
    }
    if (event.key !== "Escape") return;
    input.value = "";
    clearResults();
  });

  try {
    const initial = new URLSearchParams(location.search || "").get("search") || "";
    if (initial) {
      input.value = initial;
      setTimeout(() => { render(); input.focus(); }, 80);
    }
  } catch {}
}

function applyFeatureChangeBadges(lastSeenVersion) {
  document.querySelectorAll(".feature-badge").forEach(badge => badge.remove());
  const currentVersion = chrome.runtime.getManifest?.().version || "0";
  let visible = 0;

  Object.entries(FEATURE_CHANGE_MARKERS).forEach(([id, marker]) => {
    if (compareVersions(marker.version, currentVersion) > 0) return;
    if (lastSeenVersion && compareVersions(marker.version, lastSeenVersion) <= 0) return;

    const control = $(id);
    const label = control?.closest("label");
    const target = label?.querySelector("span") || label;
    if (!target) return;

    const badge = document.createElement("span");
    badge.className = "feature-badge";
    badge.textContent = marker.label || "New";
    badge.title = `${marker.label || "Changed"} in v${displayReleaseVersion(marker.version)}`;
    target.appendChild(badge);
    visible += 1;
  });

  CARD_CHANGE_MARKERS.forEach(marker => {
    if (compareVersions(marker.version, currentVersion) > 0) return;
    if (lastSeenVersion && compareVersions(marker.version, lastSeenVersion) <= 0) return;
    const target = document.querySelector(marker.selector);
    if (!target) return;
    const badge = document.createElement("span");
    badge.className = "feature-badge";
    badge.textContent = marker.label || "New";
    badge.title = `${marker.label || "Changed"} in v${displayReleaseVersion(marker.version)}`;
    target.appendChild(badge);
    visible += 1;
  });

  const summary = $("settingsUpdateSummary");
  if (summary) {
    summary.hidden = visible === 0;
    summary.textContent = visible
      ? `${visible} setting${visible === 1 ? " is" : "s are"} new or updated since the version you last reviewed.`
      : "";
  }

  const tabBadge = $("changelogUpdateBadge");
  if (tabBadge) {
    tabBadge.hidden = visible === 0;
    tabBadge.textContent = visible ? String(visible) : "";
    tabBadge.title = visible ? `${visible} new or updated setting${visible === 1 ? "" : "s"}` : "";
  }
}

function setPageSetting(id, value) {
  const el = $(id);
  if (!el) return;
  if (el.type === "checkbox" || el.type === "radio") el.checked = !!value;
  else el.value = value;
}

async function applyPreset(name) {
  const preset = name === "both"
    ? { ...PRESET_VALUES.recommended, ...PRESET_VALUES.creator }
    : PRESET_VALUES[name];
  if (!preset) return;

  OPTIONAL_FEATURE_KEYS.forEach(key => setPageSetting(key, false));
  BASELINE_SAFETY_ON_KEYS.forEach(key => setPageSetting(key, true));
  Object.entries(preset).forEach(([key, value]) => setPageSetting(key, value));
  setPageSetting("enabled", true);

  // Keep safety/behavior sub-options sensible even though their parent features remain opt-in.
  setPageSetting("autoAfkProtectActive", true);
  setPageSetting("autoAfkResetOnActivate", true);
  setPageSetting("autoAfkChats", true);
  setPageSetting("duplicateTabChats", true);
  setPageSetting("duplicateTabFocusExisting", true);
  setPageSetting("quickPanelEnabledByDefaultInTab", true);
  setPageSetting("quickPanelAutoCollapseOverlap", true);

  await save();
  const status = $("presetStatus");
  if (status) {
    const labels = { minimal: "Minimal", recommended: "Recommended", creator: "Creator-only", both: "Chatting + creator" };
    status.textContent = `${labels[name] || "Quick"} setup applied and saved.`;
  }
}

async function applyOptInBaseline({ showStatus = false } = {}) {
  OPTIONAL_FEATURE_KEYS.forEach(key => setPageSetting(key, false));
  BASELINE_SAFETY_ON_KEYS.forEach(key => setPageSetting(key, true));
  setPageSetting("enabled", true);
  await save();
  if (showStatus) {
    const status = $("presetStatus");
    if (status) status.textContent = "Optional features turned off. Your saved lists and presets were kept.";
  }
}

async function disableOptionalFeatures() {
  await applyOptInBaseline({ showStatus: true });
}

async function finishFirstRunSetup() {
  await storageSet({
    [FIRST_RUN_SETUP_PENDING_KEY]: false,
    [FIRST_RUN_SETUP_COMPLETED_KEY]: true
  });
}

function closeFirstRunSetupDialog() {
  const dialog = $("firstRunSetupDialog");
  if (!dialog) return;
  try { dialog.close(); } catch { dialog.removeAttribute("open"); }
}

async function chooseFirstRunSetup(choice) {
  const normalized = String(choice || "").toLowerCase();
  if (normalized === "chatting") await applyPreset("recommended");
  else if (normalized === "creator") await applyPreset("creator");
  else if (normalized === "both") await applyPreset("both");
  else if (normalized === "off") await disableOptionalFeatures();
  else return false;
  await finishFirstRunSetup();
  closeFirstRunSetupDialog();
  return true;
}

async function showFirstRunSetupDialog({ manual = false } = {}) {
  const dialog = $("firstRunSetupDialog");
  if (!dialog) return false;
  if (!manual) {
    const state = await storageGet([FIRST_RUN_SETUP_PENDING_KEY, FIRST_RUN_SETUP_COMPLETED_KEY, FIRST_RUN_OPT_IN_DEFAULTS_KEY]);
    if (state[FIRST_RUN_SETUP_COMPLETED_KEY] === true || state[FIRST_RUN_SETUP_PENDING_KEY] !== true) return false;
    // A genuinely fresh install should not inherit checked child/sub-options
    // just because their parent feature has sensible historical defaults. Save
    // a clean opt-in baseline once; the user's wizard choice is applied after.
    if (state[FIRST_RUN_OPT_IN_DEFAULTS_KEY] !== true) {
      await applyOptInBaseline();
      await storageSet({ [FIRST_RUN_OPT_IN_DEFAULTS_KEY]: true });
    }
  }
  try {
    if (!dialog.open) dialog.showModal();
  } catch {
    dialog.setAttribute("open", "");
  }
  return true;
}

function setupFirstRunWizard() {
  document.querySelectorAll("[data-first-run-choice]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const buttons = [...document.querySelectorAll("[data-first-run-choice]")];
      buttons.forEach(item => { item.disabled = true; });
      chooseFirstRunSetup(button.dataset.firstRunChoice).catch(error => {
        console.error("[SpicyChat QoL] first-run setup failed", error);
      }).finally(() => buttons.forEach(item => { item.disabled = false; }));
    });
  });
  $("firstRunCustomize")?.addEventListener("click", async () => {
    await finishFirstRunSetup();
    closeFirstRunSetupDialog();
    const card = $("quickSetupCard");
    card?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  });
}

function setupPresets() {
  $("applyMinimalPreset")?.addEventListener("click", () => applyPreset("minimal"));
  $("applyRecommendedPreset")?.addEventListener("click", () => applyPreset("recommended"));
  $("applyCreatorPreset")?.addEventListener("click", () => applyPreset("creator"));
  $("startCustomSetup")?.addEventListener("click", () => showFirstRunSetupDialog({ manual: true }));
  $("disableOptionalFeatures")?.addEventListener("click", disableOptionalFeatures);
  setupFirstRunWizard();
}
