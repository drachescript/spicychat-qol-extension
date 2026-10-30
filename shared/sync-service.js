"use strict";

(() => {
  const API_BASE = "https://syncqol.drache.uk";
  const STATE_KEY = "qolSyncStateV1";
  const AUTH_KEY = "qolSyncAuthV1";
  const DEVICE_PREFS_KEY = "qolSyncDevicePrefsV1";
  const GRANULAR_PREFIX = "dsSettingV1:";
  const INDEX_KEY = "dsSettingsIndexV1";
  const MIGRATION_KEY = "dsGranularSettingsV1";
  const REVISION_KEY = "dsSettingsRevisionV1";
  const ALARM_NAME = "ds-qol-account-sync-v1";
  const LIST_SETTLED_ALARM = "ds-qol-list-sync-settled-v1";
  const LIST_QUIET_UNTIL_KEY = "qolSyncListQuietUntilV1";
  const SYNC_INTERVAL_MINUTES = 360;
  const LIST_EDIT_SETTLE_MS = 90000; // Let long-running list imports/cleanups finish before publishing.
  const REQUEST_TIMEOUT_MS = 30000;
  const MAX_PUSH_KEYS = 20;
  const LIST_LEDGER_KEY = "qolSyncListLedgerV1";
  const LIST_DATA_PREFIX = "qolDataV1_";
  const LIST_SHARDS = 32;
  const LIST_SOURCES = Object.freeze({
    blockedBots: { storage: "blockedBots", kind: "object" },
    favoriteBots: { storage: "favoriteBots", kind: "object" },
    laterBots: { storage: "laterBots", kind: "object" },
    notInterestedBots: { storage: "notInterestedBots", kind: "object" },
    openedChats: { storage: "openedChats", kind: "array" }
  });
  const LIST_NAMES = Object.keys(LIST_SOURCES);
  const VALID_LIST_MODES = new Set(["off", "two-way", "upload-only", "download-only"]);
  const expectedListWrites = new Map();


  let pendingLocalPatch = new Map();
  let pendingLocalDeleted = new Set();
  let pushTimer = null;
  let syncChain = Promise.resolve();
  const remoteExpectedWrites = new Map();

  function now() {
    return Date.now();
  }

  function randomUuid() {
    try {
      return crypto.randomUUID();
    } catch {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }

  function normalizeState(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      schemaVersion: 1,
      deviceId: String(source.deviceId || "").trim(),
      deviceCreatedAt: Math.max(0, Number(source.deviceCreatedAt || 0)),
      accountId: String(source.accountId || "").trim(),
      linkedAt: Math.max(0, Number(source.linkedAt || 0)),
      automatic: source.automatic !== false,
      paused: source.paused === true,
      lastRevision: Math.max(0, Number(source.lastRevision || 0)),
      lastListRevision: Math.max(0, Number(source.lastListRevision || 0)),
      lastSyncAt: Math.max(0, Number(source.lastSyncAt || 0)),
      lastSyncAttemptAt: Math.max(0, Number(source.lastSyncAttemptAt || 0)),
      lastLocalStorageRevision: Math.max(0, Number(source.lastLocalStorageRevision || 0)),
      lastError: String(source.lastError || "").slice(0, 500),
      lastErrorAt: Math.max(0, Number(source.lastErrorAt || 0)),
      lastStatus: String(source.lastStatus || "").slice(0, 80)
    };
  }

  function normalizeAuth(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      token: String(source.token || "").trim()
    };
  }

  const VALID_SYNC_MODES = new Set(["off", "two-way", "upload-only", "download-only", "manual"]);
  const MERGEABLE_SET_KEYS = new Set([
    "blockedWords", "blockedTags", "blockedCreators", "blockedBotIds", "blockedBotNames",
    "includeTags", "excludeTags", "notInterestedBotIds", "notInterestedBotNames"
  ]);

  function normalizeDevicePrefs(value, fallbackMode = "two-way") {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const requestedMode = String(source.mode || fallbackMode || "two-way");
    const allowedKeys = Array.isArray(source.allowedKeys)
      ? [...new Set(source.allowedKeys.map(key => String(key || "").trim()).filter(Boolean))].sort()
      : null;
    const listModes = {};
    for (const name of LIST_NAMES) {
      const mode = String(source.listModes?.[name] || "off");
      listModes[name] = VALID_LIST_MODES.has(mode) ? mode : "off";
    }
    return {
      schemaVersion: 2,
      mode: VALID_SYNC_MODES.has(requestedMode) ? requestedMode : "two-way",
      allowedKeys,
      listModes,
      scopes: Array.isArray(source.scopes) ? [...new Set(source.scopes.map(scope => String(scope || "").trim()).filter(Boolean))] : [],
      fullDownloadNeeded: source.fullDownloadNeeded === true,
      fullUploadNeeded: source.fullUploadNeeded === true
    };
  }

  function allowedKeySet(prefs) {
    return Array.isArray(prefs?.allowedKeys) ? new Set(prefs.allowedKeys) : null;
  }

  function keyAllowed(prefs, key) {
    if (parseListDataKey(key)) return true; // The list direction is checked separately.
    const allowed = allowedKeySet(prefs);
    return !allowed || allowed.has(String(key || ""));
  }

  function filterChangesForDevice(changes, deletedKeys, prefs) {
    const filteredChanges = {};
    for (const [key, value] of Object.entries(changes || {})) {
      if (keyAllowed(prefs, key)) filteredChanges[key] = value;
    }
    const filteredDeleted = [...new Set((deletedKeys || []).map(key => String(key || "").trim()).filter(Boolean))]
      .filter(key => keyAllowed(prefs, key) && !Object.prototype.hasOwnProperty.call(filteredChanges, key));
    return { changes: filteredChanges, deletedKeys: filteredDeleted };
  }

  function canAutoUpload(prefs) {
    return prefs?.mode === "two-way" || prefs?.mode === "upload-only";
  }
  function listMayUpload(prefs, name) {
    return ["two-way", "upload-only"].includes(prefs?.listModes?.[name]);
  }
  function listMayDownload(prefs, name) {
    return ["two-way", "download-only"].includes(prefs?.listModes?.[name]);
  }
  function anyListsActive(prefs) {
    return LIST_NAMES.some(name => prefs?.listModes?.[name] !== "off");
  }
  function parseListDataKey(key) {
    const m = /^qolDataV1_(blockedBots|favoriteBots|laterBots|notInterestedBots|openedChats)_([a-f0-9]{32})_(\d{2})$/.exec(String(key || ""));
    return m && Number(m[3]) < LIST_SHARDS ? { scope: m[1], device: m[2], shard: Number(m[3]) } : null;
  }
  function listShard(id) {
    // UUIDv7s share long leading timestamp prefixes. Hash the entire ID,
    // otherwise thousands of bots could land in one oversized cloud record.
    let h = 2166136261;
    for (const c of String(id || "").toLowerCase()) {
      h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    }
    return (h >>> 0) % LIST_SHARDS;
  }
  function listDataKey(scope, deviceId, shard) {
    return `${LIST_DATA_PREFIX}${scope}_${deviceId.replace(/-/g, "").toLowerCase()}_${String(shard).padStart(2, "0")}`;
  }
  function listIds(value, scope) {
    const source = scope === "openedChats" ? value : value?.ids;
    const ids = (Array.isArray(source) ? source : [])
      .map(id => String(id || "").trim().toLowerCase())
      .filter(id => /^[0-9a-f-]{20,80}$/.test(id));
    // The blocked list supports manual name patterns as well as bot IDs.
    // Keep them as separate, recognizable members of the compact ID journal.
    if (scope === "blockedBots" && Array.isArray(value?.names)) {
      ids.push(...value.names.map(name => `name:${String(name || "").trim().toLowerCase()}`)
        .filter(name => /^name:.{1,120}$/.test(name) && !/[\x00-\x1f]/.test(name)));
    }
    return [...new Set(ids)].sort();
  }
  function validListMember(value) {
    return typeof value === "string" && (/^[0-9a-f-]{20,80}$/.test(value) || /^name:[^\x00-\x1f]{1,120}$/.test(value));
  }
  function normalizeListLedger(value) {
    const src = value && typeof value === "object" ? value : {};
    return { version: 1, local: src.local || {}, cloud: src.cloud || {}, lastIds: src.lastIds || {}, dirty: src.dirty || {} };
  }
  function chooseListOp(a, b) {
    if (!a) return b;
    if (!b) return a;
    const ta = Number(a[0] || 0), tb = Number(b[0] || 0);
    if (ta !== tb) return tb > ta ? b : a;
    // If clocks tie, prefer a block over removing one (safer than dropping it).
    return Number(b[1] || 0) > Number(a[1] || 0) ? b : a;
  }
  async function readListLedger() {
    const r = await storageGet([LIST_LEDGER_KEY]);
    return normalizeListLedger(r[LIST_LEDGER_KEY]);
  }
  async function writeListLedger(ledger) {
    if (!await storageSet({ [LIST_LEDGER_KEY]: ledger })) throw new Error("Could not save the local sync ledger");
  }


  function canAutoDownload(prefs) {
    return prefs?.mode === "two-way" || prefs?.mode === "download-only";
  }

  function sameAllowedKeys(a, b) {
    const left = Array.isArray(a) ? [...a].sort() : null;
    const right = Array.isArray(b) ? [...b].sort() : null;
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function storageGet(keys) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(keys, result => resolve(chrome.runtime.lastError ? {} : (result || {})));
      } catch {
        resolve({});
      }
    });
  }

  function storageSet(value) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set(value, () => resolve(!chrome.runtime.lastError));
      } catch {
        resolve(false);
      }
    });
  }

  function storageRemove(keys) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.remove(keys, () => resolve(!chrome.runtime.lastError));
      } catch {
        resolve(false);
      }
    });
  }

  async function getStateAndAuth() {
    const data = await storageGet([STATE_KEY, AUTH_KEY]);
    const state = normalizeState(data[STATE_KEY]);
    const auth = normalizeAuth(data[AUTH_KEY]);
    if (!state.deviceId) {
      state.deviceId = randomUuid();
      state.deviceCreatedAt = now();
      await storageSet({ [STATE_KEY]: state });
    }
    return { state, auth };
  }

  async function getSyncContext() {
    const data = await storageGet([STATE_KEY, AUTH_KEY, DEVICE_PREFS_KEY]);
    const state = normalizeState(data[STATE_KEY]);
    const auth = normalizeAuth(data[AUTH_KEY]);
    const prefs = normalizeDevicePrefs(data[DEVICE_PREFS_KEY]);
    if (!state.deviceId) {
      state.deviceId = randomUuid();
      state.deviceCreatedAt = now();
      await storageSet({ [STATE_KEY]: state });
    }
    return { state, auth, prefs };
  }

  async function saveDevicePrefs(value) {
    const next = normalizeDevicePrefs(value);
    await storageSet({ [DEVICE_PREFS_KEY]: next });
    return next;
  }

  async function saveStatePatch(patch) {
    const current = await storageGet([STATE_KEY]);
    const next = { ...normalizeState(current[STATE_KEY]), ...(patch || {}) };
    await storageSet({ [STATE_KEY]: next });
    return next;
  }

  function safeErrorMessage(error) {
    if (!error) return "Unknown sync error";
    if (typeof error === "string") return error.slice(0, 500);
    return String(error.message || error.error || error.statusText || error).slice(0, 500);
  }

  async function api(path, { method = "GET", token = "", body = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || REQUEST_TIMEOUT_MS));
    try {
      const headers = { Accept: "application/json" };
      if (body !== null) headers["Content-Type"] = "application/json";
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal
      });
      let payload = null;
      try { payload = await response.json(); }
      catch { payload = null; }
      if (!response.ok) {
        const err = new Error(payload?.message || `Sync API returned HTTP ${response.status}`);
        err.code = payload?.error || `http_${response.status}`;
        err.status = response.status;
        err.payload = payload;
        throw err;
      }
      return payload || { ok: true };
    } finally {
      clearTimeout(timer);
    }
  }

  function equalValue(a, b) {
    if (Object.is(a, b)) return true;
    if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
    try { return JSON.stringify(a) === JSON.stringify(b); }
    catch { return false; }
  }

  async function currentLocalSettings(prefs = null) {
    const first = await storageGet([INDEX_KEY, REVISION_KEY]);
    const index = [...new Set((Array.isArray(first[INDEX_KEY]) ? first[INDEX_KEY] : [])
      .map(name => String(name || "").trim())
      .filter(Boolean))].sort();
    if (!index.length) return { settings: {}, index: [], localRevision: Number(first[REVISION_KEY] || 0) || 0 };
    const keys = index.map(name => `${GRANULAR_PREFIX}${name}`);
    const values = await storageGet(keys);
    const settings = {};
    for (const name of index) {
      const key = `${GRANULAR_PREFIX}${name}`;
      if (Object.prototype.hasOwnProperty.call(values, key) && (!prefs || keyAllowed(prefs, name))) settings[name] = values[key];
    }
    return { settings, index, localRevision: Number(first[REVISION_KEY] || 0) || 0 };
  }

  async function ensureSyncAlarm() {
    const { state, auth, prefs } = await getSyncContext();
    if (!state.accountId || !auth.token || state.paused || state.automatic === false ||
      (prefs.mode === "manual" && !anyListsActive(prefs)) ||
      (prefs.mode === "off" && !anyListsActive(prefs))) {
      try { await chrome.alarms.clear(ALARM_NAME); } catch {}
      return;
    }
    try {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: SYNC_INTERVAL_MINUTES });
    } catch {}
  }

  function queued(task) {
    const run = syncChain.then(task, task);
    syncChain = run.catch(() => {});
    return run;
  }

  async function recordFailure(error, status = "Error") {
    const message = safeErrorMessage(error);
    await saveStatePatch({
      lastSyncAttemptAt: now(),
      lastError: message,
      lastErrorAt: now(),
      lastStatus: status
    });
    return { ok: false, error: error?.code || "sync_error", message };
  }

  async function pushPatch(changes, deletedKeys = [], options = {}) {
    const { state, auth, prefs } = await getSyncContext();
    if (!state.accountId || !auth.token) return { ok: false, skipped: true, reason: "not-linked" };
    if (!options.force && (state.paused || state.automatic === false || !canAutoUpload(prefs))) {
      return { ok: false, skipped: true, reason: "upload-disabled-on-this-device" };
    }

    const filtered = filterChangesForDevice(changes, deletedKeys, prefs);
    const changeEntries = Object.entries(filtered.changes);
    const cleanDeleted = filtered.deletedKeys;
    if (!changeEntries.length && !cleanDeleted.length) return { ok: true, applied: 0, filtered: true };

    const payloadChanges = Object.fromEntries(changeEntries);
    try {
      const result = await api("/v1/sync", {
        method: "POST",
        token: auth.token,
        body: {
          changes: payloadChanges,
          deletedKeys: cleanDeleted,
          baseRevision: options.baseRevision == null ? state.lastRevision : Number(options.baseRevision || 0)
        }
      });
      const appliedCount = Number(result.applied || changeEntries.length + cleanDeleted.length);
      const patch = {
        lastSyncAt: now(),
        lastSyncAttemptAt: now(),
        lastError: "",
        lastErrorAt: 0,
        lastStatus: `Uploaded ${appliedCount} setting${appliedCount === 1 ? "" : "s"}`
      };
      if (options.localRevision) patch.lastLocalStorageRevision = Math.max(state.lastLocalStorageRevision, Number(options.localRevision || 0));
      await saveStatePatch(patch);
      return { ok: true, ...result };
    } catch (error) {
      if (error?.status === 409 && error?.code === "sync_conflict") {
        await saveStatePatch({
          lastSyncAttemptAt: now(),
          lastError: "Settings changed on another device. Resolving the cloud revision before retrying.",
          lastErrorAt: now(),
          lastStatus: "Conflict"
        });
        return { ok: false, conflict: true, revision: Number(error?.payload?.revision || 0), conflictKeys: error?.payload?.conflictKeys || [] };
      }
      return recordFailure(error, "Upload failed");
    }
  }

  function logicalPatchBatches(changes, deletedKeys = []) {
    const changeMap = new Map(Object.entries(changes || {}).filter(([key]) => !!String(key || "").trim()));
    const deleted = [...new Set((deletedKeys || []).map(key => String(key || "").trim()).filter(Boolean))]
      .filter(key => !changeMap.has(key));
    const ordered = [
      ...[...changeMap.keys()].map(key => ({ key, deleted: false })),
      ...deleted.map(key => ({ key, deleted: true }))
    ];
    const batches = [];
    for (let start = 0; start < ordered.length; start += MAX_PUSH_KEYS) {
      const slice = ordered.slice(start, start + MAX_PUSH_KEYS);
      const batchChanges = {};
      const batchDeleted = [];
      for (const item of slice) {
        if (item.deleted) batchDeleted.push(item.key);
        else batchChanges[item.key] = changeMap.get(item.key);
      }
      batches.push({ changes: batchChanges, deletedKeys: batchDeleted });
    }
    return batches;
  }

  async function pushPatchBatches(changes, deletedKeys = [], options = {}) {
    const batches = logicalPatchBatches(changes, deletedKeys);
    if (!batches.length) return { ok: true, applied: 0, revision: options.baseRevision ?? null };
    let revision = options.baseRevision == null ? null : Number(options.baseRevision || 0);
    let applied = 0;
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const isLast = index === batches.length - 1;
      const result = await pushPatch(batch.changes, batch.deletedKeys, {
        baseRevision: revision,
        // Only mark the local storage revision as synced after every logical
        // batch made it to the server.
        localRevision: isLast ? Number(options.localRevision || 0) : 0,
        force: !!options.force
      });
      if (!result?.ok) return result;
      applied += Number(result.applied || Object.keys(batch.changes).length + batch.deletedKeys.length);
      revision = Number(result.revision || revision || 0);
    }
    return { ok: true, applied, revision };
  }

  async function pushFullLocalSettings({ baseRevision = null, force = false } = {}) {
    const { prefs } = await getSyncContext();
    const local = await currentLocalSettings(prefs);
    const entries = Object.entries(local.settings);
    if (!entries.length) {
      await saveStatePatch({ lastLocalStorageRevision: local.localRevision, lastSyncAt: now(), lastStatus: "Nothing selected to upload", lastError: "", lastErrorAt: 0 });
      const currentPrefs = (await getSyncContext()).prefs;
      await saveDevicePrefs({ ...currentPrefs, fullUploadNeeded: false });
      return { ok: true, applied: 0 };
    }

    const result = await pushPatchBatches(local.settings, [], {
      baseRevision,
      localRevision: local.localRevision,
      force
    });
    if (!result?.ok) return result;
    const applied = Number(result.applied || entries.length);
    await saveStatePatch({ lastLocalStorageRevision: local.localRevision, lastStatus: `Uploaded ${applied} settings`, lastError: "", lastErrorAt: 0 });
    const currentPrefs = (await getSyncContext()).prefs;
    await saveDevicePrefs({ ...currentPrefs, fullUploadNeeded: false });
    return { ok: true, applied, revision: result.revision };
  }

  async function applyRemotePayload(changes, deletedKeys, prefs, { dataOnly = false } = {}) {
    // QoL lists are NOT settings: never insert transport keys into the granular
    // settings index, and never overwrite whole lists from a single device.
    const incomingData = Object.entries(changes || {}).filter(([key]) => parseListDataKey(key));
    const deletedData = (deletedKeys || []).filter(key => parseListDataKey(key));
    if (incomingData.length || deletedData.length) {
      const ledger = await readListLedger();
      for (const [key, value] of incomingData) {
        const parsed = parseListDataKey(key);
        if (parsed && listMayDownload(prefs, parsed.scope)) ledger.cloud[key] = value;
      }
      for (const key of deletedData) delete ledger.cloud[key];
      await writeListLedger(ledger);
    }
    const ordinaryChanges = dataOnly || !canAutoDownload(prefs) ? {} :
      Object.fromEntries(Object.entries(changes || {}).filter(([key]) => !parseListDataKey(key)));
    const ordinaryDeletes = dataOnly || !canAutoDownload(prefs) ? [] :
      (deletedKeys || []).filter(key => !parseListDataKey(key));
    const filtered = filterChangesForDevice(ordinaryChanges, ordinaryDeletes, prefs);
    const changeEntries = Object.entries(filtered.changes);
    const deletes = filtered.deletedKeys;
    if (!changeEntries.length && !deletes.length) return { changed: 0 };

    const first = await storageGet([INDEX_KEY]);
    const index = new Set((Array.isArray(first[INDEX_KEY]) ? first[INDEX_KEY] : []).map(String).filter(Boolean));
    const setPayload = { [MIGRATION_KEY]: true };
    const removeKeys = [];

    for (const [name, value] of changeEntries) {
      const key = `${GRANULAR_PREFIX}${name}`;
      remoteExpectedWrites.set(key, { deleted: false, value });
      setPayload[key] = value;
      index.add(name);
    }
    for (const name of deletes) {
      const key = `${GRANULAR_PREFIX}${name}`;
      remoteExpectedWrites.set(key, { deleted: true });
      removeKeys.push(key);
      index.delete(name);
    }
    setPayload[INDEX_KEY] = [...index].sort();

    if (removeKeys.length) await storageRemove(removeKeys);
    await storageSet(setPayload);
    return { changed: changeEntries.length + deletes.length };
  }

  async function observeRemoteRevision({ since = null } = {}) {
    const { state, auth } = await getSyncContext();
    if (!state.accountId || !auth.token) return { ok: false, error: "not_linked" };
    let cursor = since == null ? state.lastRevision : Math.max(0, Number(since || 0));
    let finalRevision = state.lastRevision;
    try {
      for (let page = 0; page < 40; page += 1) {
        const result = await api(`/v1/sync?since=${encodeURIComponent(cursor)}`, { token: auth.token });
        finalRevision = Math.max(finalRevision, Number(result.revision || 0));
        if (!result.hasMore) break;
        const nextCursor = Math.max(cursor, Number(result.maxReturnedRevision || cursor));
        if (nextCursor <= cursor) break;
        cursor = nextCursor;
      }
      await saveStatePatch({ lastRevision: finalRevision, lastSyncAttemptAt: now(), lastError: "", lastErrorAt: 0 });
      return { ok: true, revision: finalRevision };
    } catch (error) {
      return recordFailure(error, "Could not read cloud revision");
    }
  }

  async function pullRemote({ since = null, force = false, full = false, dataOnly = false } = {}) {
    const { state, auth, prefs } = await getSyncContext();
    if (!state.accountId || !auth.token) return { ok: false, skipped: true, reason: "not-linked" };
    if (!force && (state.paused || state.automatic === false || (!canAutoDownload(prefs) && !anyListsActive(prefs)))) {
      return { ok: false, skipped: true, reason: "download-disabled-on-this-device" };
    }

    let cursor = full ? 0 : (since == null ? state.lastRevision : Math.max(0, Number(since || 0)));
    let finalRevision = full ? 0 : state.lastRevision;
    let changed = 0;
    try {
      let completed = false;
      for (let page = 0; page < 40; page += 1) {
        const result = await api(`/v1/sync?since=${encodeURIComponent(cursor)}`, { token: auth.token });
        const applied = await applyRemotePayload(result.changes || {}, result.deletedKeys || [], prefs, { dataOnly });
        changed += Number(applied.changed || 0);
        finalRevision = Math.max(finalRevision, Number(result.revision || 0));
        if (!result.hasMore) { completed = true; break; }
        const nextCursor = Math.max(cursor, Number(result.maxReturnedRevision || cursor));
        if (nextCursor <= cursor) throw new Error("Sync pagination stopped before all cloud data was read");
        cursor = nextCursor;
      }
      if (!completed) throw new Error("Sync has more than 40 cloud pages; no list merge was applied");
      // Only merge after the entire response was received. Never partially
      // remove local IDs if the cloud read has failed halfway through.
      await mergeRemoteLists(prefs);
      const local = await storageGet([REVISION_KEY]);
      await saveStatePatch({
        lastRevision: finalRevision,
        lastSyncAt: now(),
        lastSyncAttemptAt: now(),
        lastError: "",
        lastErrorAt: 0,
        lastStatus: changed ? `Downloaded ${changed} setting${changed === 1 ? "" : "s"}` : "Up to date",
        lastLocalStorageRevision: state.lastLocalStorageRevision || Number(local[REVISION_KEY] || 0) || 0
      });
      if (full || prefs.fullDownloadNeeded) {
        const currentPrefs = (await getSyncContext()).prefs;
        await saveDevicePrefs({ ...currentPrefs, fullDownloadNeeded: false });
      }
      return { ok: true, changed, revision: finalRevision };
    } catch (error) {
      return recordFailure(error, "Download failed");
    }
  }

  // ID-only list sync avoids copying private chat content, archived bot copies,
  // images, or entire bot records to the settings server. The per-device journal
  // has one latest operation per ID, so repeated refreshes don't add duplicates.
  async function initializeSelectedLists(prefs) {
    const ledger = await readListLedger();
    let modified = false;
    for (const [scope, info] of Object.entries(LIST_SOURCES)) {
      if (prefs.listModes[scope] === "off") continue;
      if (Array.isArray(ledger.lastIds[scope])) continue;
      const row = await storageGet([info.storage]);
      const ids = listIds(row[info.storage], scope);
      ledger.local[scope] = ledger.local[scope] || {};
      ledger.dirty[scope] = ledger.dirty[scope] || [];
      for (const id of ids) {
        ledger.local[scope][id] = [1, 1];
        const shard = listShard(id);
        if (!ledger.dirty[scope].includes(shard)) ledger.dirty[scope].push(shard);
      }
      ledger.lastIds[scope] = ids;
      modified = true;
    }
    if (modified) await writeListLedger(ledger);
    return { ok: true };
  }

  async function recordLocalListChange(scope, value) {
    const { prefs } = await getSyncContext();
    if (prefs.listModes[scope] === "off") return;
    const next = listIds(value, scope);
    const expected = expectedListWrites.get(scope);
    if (expected && JSON.stringify(next) === expected) {
      expectedListWrites.delete(scope);
      return;
    }
    expectedListWrites.delete(scope);
    const ledger = await readListLedger();
    if (!Array.isArray(ledger.lastIds[scope])) {
      // Never guess which old entries were removed before syncing was enabled.
      await initializeSelectedLists(prefs);
      return;
    }
    const before = new Set(ledger.lastIds[scope]);
    const after = new Set(next);
    const additions = next.filter(id => !before.has(id));
    const removals = [...before].filter(id => !after.has(id));
    if (!additions.length && !removals.length) return;
    ledger.lastIds[scope] = next;
    ledger.local[scope] = ledger.local[scope] || {};
    ledger.dirty[scope] = ledger.dirty[scope] || [];
    // If a download-only device changes locally, keep the change local. It
    // becomes publishable only when upload is explicitly selected later.
    const stamp = now();
    for (const [ids, enabled] of [[additions, 1], [removals, 0]]) {
      for (const id of ids) {
        ledger.local[scope][id] = [stamp, enabled];
        const shard = listShard(id);
        if (!ledger.dirty[scope].includes(shard)) ledger.dirty[scope].push(shard);
      }
    }
    await writeListLedger(ledger);
    if (listMayUpload(prefs, scope)) {
      // MV3 service workers can be suspended before a 90-second timeout.
      // Persist the deadline and use alarms instead of an in-memory timer.
      const quietUntil = now() + LIST_EDIT_SETTLE_MS;
      if (!await storageSet({ [LIST_QUIET_UNTIL_KEY]: quietUntil })) {
        throw new Error("Could not save the pending list-sync deadline");
      }
      chrome.alarms.create(LIST_SETTLED_ALARM, { when: quietUntil });
    }
  }

  function exceptionRuleHash(values) {
    const normalized = [...new Set((Array.isArray(values) ? values : []).map(v => String(v || "").normalize("NFKC").trim().toLocaleLowerCase()).filter(Boolean))].sort();
    let hash = 2166136261;
    for (const c of normalized.join("\u001f")) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return `${normalized.length}:${(hash >>> 0).toString(16)}`;
  }
  async function rememberRemoteUnblocks(ids) {
    const r = await storageGet(["dsSettingV1:blockedWords", "dsSettingV1:blockedTags", "autoBlockWordExceptionsV1", "autoBlockTagExceptionsV1"]);
    const out = {};
    for (const [rulesSetting, storageKey] of [["blockedWords", "autoBlockWordExceptionsV1"], ["blockedTags", "autoBlockTagExceptionsV1"]]) {
      const rulesKey = exceptionRuleHash(r[`dsSettingV1:${rulesSetting}`]);
      if (rulesKey.startsWith("0:")) continue;
      const previous = r[storageKey];
      const value = previous?.rulesKey === rulesKey && previous.ids && typeof previous.ids === "object" ? { ...previous.ids } : {};
      for (const id of ids) value[id] = now();
      const trimmed = Object.entries(value).sort((a,b) => Number(b[1] || 0) - Number(a[1] || 0)).slice(0,1000);
      out[storageKey] = { version: 1, rulesKey, ids: Object.fromEntries(trimmed) };
    }
    if (Object.keys(out).length) await storageSet(out);
  }

  async function mergeRemoteLists(prefs) {
    const ledger = await readListLedger();
    for (const [scope, info] of Object.entries(LIST_SOURCES)) {
      if (!listMayDownload(prefs, scope)) continue;
      const best = {};
      for (const [id, op] of Object.entries(ledger.local[scope] || {})) best[id] = op;
      for (const [key, snapshot] of Object.entries(ledger.cloud || {})) {
        if (parseListDataKey(key)?.scope !== scope || !Array.isArray(snapshot?.entries)) continue;
        for (const [id, timestamp, enabled] of snapshot.entries) {
          if (!validListMember(id) || (id.startsWith("name:") && scope !== "blockedBots")) continue;
          best[id] = chooseListOp(best[id], [timestamp, enabled]);
        }
      }
      const data = await storageGet([info.storage]);
      const oldValue = data[info.storage];
      const oldIds = listIds(oldValue, scope);
      const nextIds = Object.keys(best).filter(id => Number(best[id]?.[1]) === 1).sort();
      if (JSON.stringify(oldIds) === JSON.stringify(nextIds)) continue;
      if (scope === "blockedBots") {
        // A remote unblock must not immediately be undone by local auto-block
        // matching on a word or tag card. Grant the same rule-scoped exemption
        // as the local quick-unblock path.
        const removed = oldIds.filter(id => !id.startsWith("name:") && !nextIds.includes(id));
        if (removed.length) await rememberRemoteUnblocks(removed);
      }
      const value = info.kind === "array" ? nextIds : {
        ...(oldValue && typeof oldValue === "object" ? oldValue : {}),
        ids: nextIds.filter(id => !id.startsWith("name:")),
        ...(scope === "blockedBots" ? { names: nextIds.filter(id => id.startsWith("name:")).map(id => id.slice(5)) } : {})
      };
      expectedListWrites.set(scope, JSON.stringify(nextIds));
      const saved = await storageSet({ [info.storage]: value });
      if (!saved) {
        expectedListWrites.delete(scope);
        throw new Error(`Could not merge ${scope} into local storage`);
      }
      ledger.lastIds[scope] = nextIds;
    }
    await writeListLedger(ledger);
  }

  async function syncListData({ explicit = false } = {}) {
    const { state, auth, prefs } = await getSyncContext();
    if (!state.accountId || !auth.token) return { ok: false, error: "not_linked" };
    if (state.paused && !explicit) return { ok: true, skipped: true, reason: "paused" };
    if (!anyListsActive(prefs)) return { ok: true, lists: 0, skipped: true };
    await initializeSelectedLists(prefs);
    if (LIST_NAMES.some(scope => listMayDownload(prefs, scope))) {
      // Use a dedicated list cursor. Settings-only uploads may have advanced
      // the settings cursor without actually downloading the saved lists.
      const listState = (await getSyncContext()).state;
      const pulled = await pullRemote({ since: listState.lastListRevision, force: true, dataOnly: true });
      if (!pulled?.ok) return pulled;
      await saveStatePatch({ lastListRevision: pulled.revision });
    } else {
      const observed = await observeRemoteRevision();
      if (!observed?.ok) return observed;
    }
    let applied = 0;
    let ledger = await readListLedger();
    let revision = (await getSyncContext()).state.lastRevision;
    for (const scope of LIST_NAMES) {
      if (!listMayUpload(prefs, scope)) continue;
      const dirty = [...new Set(ledger.dirty[scope] || [])].sort((a,b) => a-b);
      for (const shard of dirty) {
        const entries = Object.entries(ledger.local[scope] || {})
          .filter(([id]) => listShard(id) === shard)
          .map(([id, op]) => [id, Number(op[0]) || 1, Number(op[1]) === 1 ? 1 : 0]);
        const key = listDataKey(scope, state.deviceId, shard);
        const patch = { [key]: { version: 1, scope, entries } };
        let result = await pushPatch(patch, [], { force: true, baseRevision: revision });
        if (result?.conflict) {
          const latest = await observeRemoteRevision();
          if (!latest?.ok) return latest;
          revision = latest.revision;
          result = await pushPatch(patch, [], { force: true, baseRevision: revision });
        }
        if (!result?.ok) return result;
        revision = Number(result.revision || revision);
        applied++;
        ledger.dirty[scope] = (ledger.dirty[scope] || []).filter(value => value !== shard);
        await writeListLedger(ledger); // checkpoint each successful shard
      }
    }
    await saveStatePatch({ lastRevision: revision, lastStatus: applied ? `Synced ${applied} saved-list part${applied === 1 ? "" : "s"}` : "Saved lists up to date" });
    await storageRemove([LIST_QUIET_UNTIL_KEY]);
    return { ok: true, lists: applied, revision };
  }

  async function mergeConflictArrays(changes, conflictKeys = []) {
    const keys = new Set((conflictKeys || []).map(String));
    if (!keys.size) return { ...(changes || {}) };
    const storageKeys = [...keys].filter(key => MERGEABLE_SET_KEYS.has(key)).map(key => `${GRANULAR_PREFIX}${key}`);
    const current = storageKeys.length ? await storageGet(storageKeys) : {};
    const merged = { ...(changes || {}) };
    for (const key of keys) {
      if (!MERGEABLE_SET_KEYS.has(key) || !Array.isArray(merged[key])) continue;
      const remoteValue = current[`${GRANULAR_PREFIX}${key}`];
      if (!Array.isArray(remoteValue)) continue;
      const seen = new Set();
      merged[key] = [...remoteValue, ...merged[key]].filter(value => {
        const marker = typeof value === "string" ? value.trim().toLocaleLowerCase() : JSON.stringify(value);
        if (!marker || seen.has(marker)) return false;
        seen.add(marker);
        return true;
      });
    }
    return merged;
  }

  async function manualUpload() {
    const context = await getSyncContext();
    if (!context.state.accountId || !context.auth.token) return { ok: false, error: "not_linked", message: "This device is not linked to a QoL account." };
    const observed = await observeRemoteRevision();
    if (!observed?.ok) return observed;
    let result = await pushFullLocalSettings({ baseRevision: observed.revision, force: true });
    if (result?.conflict) {
      const latest = await observeRemoteRevision();
      if (!latest?.ok) return latest;
      result = await pushFullLocalSettings({ baseRevision: latest.revision, force: true });
    }
    if (result?.ok) await observeRemoteRevision();
    return result;
  }

  async function manualDownload() {
    return pullRemote({ since: 0, force: true, full: true });
  }

  async function syncNowInternal({ forceFullRecovery = false, explicit = false } = {}) {
    // A bulk update can write lists repeatedly for minutes. Wait for its
    // quiet period rather than merging partially updated lists mid-operation.
    if (!explicit) {
      const snapshot = await storageGet([LIST_QUIET_UNTIL_KEY]);
      const quietUntil = Number(snapshot[LIST_QUIET_UNTIL_KEY] || 0);
      if (quietUntil > now()) {
        chrome.alarms.create(LIST_SETTLED_ALARM, { when: quietUntil });
        return { ok: true, skipped: true, reason: "list_update_in_progress" };
      }
    }
    const { state, auth, prefs } = await getSyncContext();
    if (!state.accountId || !auth.token) return { ok: false, error: "not_linked", message: "This device is not linked to a QoL account." };
    if (state.paused && !explicit) return { ok: false, error: "paused", message: "Automatic sync is paused on this device." };

    const localBefore = await storageGet([REVISION_KEY]);
    const localRevision = Number(localBefore[REVISION_KEY] || 0) || 0;
    const hadUnsyncedLocalRevision = localRevision > Number(state.lastLocalStorageRevision || 0);

    if (prefs.mode === "manual" || prefs.mode === "off") {
      if (prefs.mode === "manual" && explicit) {
        const downloaded = await manualDownload();
        if (!downloaded?.ok) return downloaded;
        const uploaded = await manualUpload();
        if (!uploaded?.ok) return uploaded;
      }
      return syncListData({ explicit });
    }

    if (prefs.mode === "upload-only") {
      if (!explicit && !forceFullRecovery && !hadUnsyncedLocalRevision && !prefs.fullUploadNeeded) {
        return syncListData({ explicit });
      }
      const uploaded = await manualUpload();
      if (!uploaded?.ok) return uploaded;
      return syncListData({ explicit });
    }

    const pulled = await pullRemote({ full: prefs.fullDownloadNeeded });
    if (!pulled?.ok) return pulled;

    if (prefs.mode === "download-only") {
      // Local edits are intentionally not cloud-authoritative on this device.
      await saveStatePatch({ lastLocalStorageRevision: localRevision });
      return syncListData({ explicit });
    }

    if (forceFullRecovery || hadUnsyncedLocalRevision || prefs.fullUploadNeeded) {
      const afterPullState = (await getSyncContext()).state;
      const pushed = await pushFullLocalSettings({ baseRevision: afterPullState.lastRevision });
      if (!pushed?.ok) return pushed;
      const repulled = await pullRemote();
      if (!repulled?.ok) return repulled;
    }

    return syncListData({ explicit });
  }

  async function createAccount(meta = {}) {
    const current = await getStateAndAuth();
    if (current.state.accountId && current.auth.token) return { ok: false, error: "already_linked", message: "This device is already linked." };

    try {
      const result = await api("/v1/account", {
        method: "POST",
        body: {
          deviceName: String(meta.deviceName || "QoL desktop").slice(0, 80),
          platform: String(meta.platform || "desktop").slice(0, 40),
          clientVersion: String(meta.clientVersion || "0.2.26").slice(0, 40)
        }
      });
      const state = {
        ...normalizeState(current.state),
        deviceId: String(result.deviceId || current.state.deviceId || randomUuid()),
        accountId: String(result.accountId || ""),
        linkedAt: now(),
        automatic: true,
        paused: false,
        lastRevision: Math.max(0, Number(result.revision || 0)),
        lastSyncAt: 0,
        lastSyncAttemptAt: now(),
        lastError: "",
        lastErrorAt: 0,
        lastStatus: "Account created"
      };
      await storageSet({
        [STATE_KEY]: state,
        [AUTH_KEY]: { token: String(result.deviceToken || "") },
        [DEVICE_PREFS_KEY]: normalizeDevicePrefs({ mode: "upload-only", allowedKeys: null, scopes: [], fullUploadNeeded: true, fullDownloadNeeded: false })
      });
      await ensureSyncAlarm();
      const pushed = await pushFullLocalSettings({ baseRevision: state.lastRevision, force: true });
      if (!pushed?.ok) {
        return {
          ok: true,
          accountId: state.accountId,
          deviceId: state.deviceId,
          initialSyncOk: false,
          sync: pushed
        };
      }
      await observeRemoteRevision();
      return {
        ok: true,
        accountId: state.accountId,
        deviceId: state.deviceId,
        initialSyncOk: true,
        sync: pushed
      };
    } catch (error) {
      return recordFailure(error, "Account creation failed");
    }
  }

  async function linkAccount(code, meta = {}, initialOptions = {}) {
    const normalizedCode = String(code || "").trim();
    if (!normalizedCode) return { ok: false, error: "missing_code", message: "Enter a link code first." };
    const current = await getStateAndAuth();
    if (current.state.accountId && current.auth.token) return { ok: false, error: "already_linked", message: "This device is already linked." };

    try {
      const result = await api("/v1/link", {
        method: "POST",
        body: {
          code: normalizedCode,
          deviceName: String(meta.deviceName || "QoL desktop").slice(0, 80),
          platform: String(meta.platform || "desktop").slice(0, 40),
          clientVersion: String(meta.clientVersion || "0.2.26").slice(0, 40)
        }
      });
      const state = {
        ...normalizeState(current.state),
        deviceId: String(result.deviceId || current.state.deviceId || randomUuid()),
        accountId: String(result.accountId || ""),
        linkedAt: now(),
        automatic: true,
        paused: false,
        lastRevision: 0,
        lastSyncAt: 0,
        lastSyncAttemptAt: now(),
        lastError: "",
        lastErrorAt: 0,
        lastStatus: "Linked — waiting for this device's sync choices"
      };
      await storageSet({
        [STATE_KEY]: state,
        [AUTH_KEY]: { token: String(result.deviceToken || "") },
        [DEVICE_PREFS_KEY]: normalizeDevicePrefs({
          mode: initialOptions?.mode === "download-only" ? "download-only" : "off",
          allowedKeys: initialOptions?.blockedOnly ? [] : null,
          listModes: initialOptions?.blockedOnly ? { blockedBots: initialOptions?.blockedListMode === "download-only" ? "download-only" : "two-way" } : {},
          fullDownloadNeeded: initialOptions?.mode === "download-only", fullUploadNeeded: false
        })
      });
      const context = await getSyncContext();
      await ensureSyncAlarm();
      let firstSync = { ok: true, changed: 0, skipped: true };
      if (context.prefs.mode === "download-only") firstSync = await pullRemote({ since: 0, force: true, full: true });
      if (context.prefs.listModes.blockedBots === "two-way" && firstSync?.ok) {
        firstSync = await syncListData({ explicit: true });
      }
      const local = await storageGet([REVISION_KEY]);
      await saveStatePatch({ lastLocalStorageRevision: Number(local[REVISION_KEY] || 0) || 0 });
      return {
        ok: true,
        accountId: state.accountId,
        deviceId: state.deviceId,
        initialSyncOk: !!firstSync?.ok,
        sync: firstSync
      };
    } catch (error) {
      return recordFailure(error, "Link failed");
    }
  }

  async function createLinkCode() {
    const { state, auth } = await getStateAndAuth();
    if (!state.accountId || !auth.token) return { ok: false, error: "not_linked", message: "Create or link a QoL account first." };
    try {
      return await api("/v1/link-code", { method: "POST", token: auth.token, body: {} });
    } catch (error) {
      return recordFailure(error, "Could not create link code");
    }
  }

  async function listDevices() {
    const { state, auth } = await getStateAndAuth();
    if (!state.accountId || !auth.token) return { ok: false, error: "not_linked", message: "This device is not linked." };
    try {
      return await api("/v1/devices", { token: auth.token });
    } catch (error) {
      return recordFailure(error, "Could not load devices");
    }
  }

  async function revokeDevice(deviceId) {
    const { state, auth } = await getStateAndAuth();
    if (!state.accountId || !auth.token) return { ok: false, error: "not_linked", message: "This device is not linked." };
    const target = String(deviceId || "").trim();
    if (!target) return { ok: false, error: "missing_device", message: "Choose a device first." };
    try {
      const result = await api(`/v1/devices/${encodeURIComponent(target)}`, { method: "DELETE", token: auth.token });
      if (target === state.deviceId) {
        await disconnectLocal();
      }
      return result;
    } catch (error) {
      return recordFailure(error, "Could not unlink device");
    }
  }

  async function disconnectLocal() {
    const data = await storageGet([STATE_KEY]);
    const current = normalizeState(data[STATE_KEY]);
    const next = {
      ...current,
      deviceId: randomUuid(),
      deviceCreatedAt: now(),
      accountId: "",
      linkedAt: 0,
      automatic: true,
      paused: false,
      lastRevision: 0,
      lastSyncAt: 0,
      lastSyncAttemptAt: 0,
      lastLocalStorageRevision: 0,
      lastError: "",
      lastErrorAt: 0,
      lastStatus: "Not linked"
    };
    await storageRemove([AUTH_KEY, DEVICE_PREFS_KEY]);
    await storageSet({ [STATE_KEY]: next });
    try { await chrome.alarms.clear(ALARM_NAME); } catch {}
    pendingLocalPatch.clear();
    pendingLocalDeleted.clear();
    return { ok: true };
  }

  async function setPaused(paused) {
    const { state, auth } = await getStateAndAuth();
    if (!state.accountId || !auth.token) return { ok: false, error: "not_linked", message: "This device is not linked." };
    await saveStatePatch({ paused: !!paused, lastStatus: paused ? "Paused" : "Resumed" });
    await ensureSyncAlarm();
    if (!paused) return syncNowInternal();
    return { ok: true, paused: true };
  }

  async function setDevicePrefs(input = {}) {
    const context = await getSyncContext();
    const previous = context.prefs;
    const requested = normalizeDevicePrefs({ ...previous, ...(input || {}) });
    const allowedChanged = !sameAllowedKeys(previous.allowedKeys, requested.allowedKeys);
    const uploadBecameActive = !canAutoUpload(previous) && canAutoUpload(requested);
    const downloadBecameActive = !canAutoDownload(previous) && canAutoDownload(requested);
    const next = {
      ...requested,
      fullUploadNeeded: previous.fullUploadNeeded || allowedChanged || uploadBecameActive,
      fullDownloadNeeded: previous.fullDownloadNeeded || allowedChanged || downloadBecameActive
    };
    await saveDevicePrefs(next);
    if (LIST_NAMES.some(name => listMayDownload(requested, name) && !listMayDownload(previous, name))) {
      // A newly enabled download scope must fetch old cloud data too, not just
      // changes since the previous (unrelated) scope's last revision.
      await saveStatePatch({ lastListRevision: 0 });
    }
    await ensureSyncAlarm();
    if (LIST_NAMES.some(name => requested.listModes[name] !== "off" && previous.listModes[name] === "off")) {
      const initialized = await initializeSelectedLists(next);
      if (!initialized?.ok) return initialized;
    }
    return { ok: true, prefs: next };
  }

  async function status() {
    const { state, auth, prefs } = await getSyncContext();
    return {
      ok: true,
      apiBase: API_BASE,
      linked: !!(state.accountId && auth.token),
      hasCredential: !!auth.token,
      state,
      prefs,
      pendingCount: pendingLocalPatch.size + pendingLocalDeleted.size,
      supportedLists: LIST_NAMES
    };
  }

  function schedulePatchPush(localRevision = 0) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      const changes = Object.fromEntries(pendingLocalPatch);
      const deleted = [...pendingLocalDeleted];
      pendingLocalPatch.clear();
      pendingLocalDeleted.clear();
      queued(async () => {
        const { state, prefs } = await getSyncContext();
        if (state.paused) {
          // Keep lastLocalStorageRevision behind while paused so Resume can
          // detect that local settings changed and perform a recovery sync.
          return;
        }
        if (!canAutoUpload(prefs)) {
          // Download-only/manual devices intentionally do not auto-publish
          // local edits. Switching back to an upload-capable mode marks a full
          // upload as needed in setDevicePrefs().
          await saveStatePatch({ lastLocalStorageRevision: Math.max(Number(state.lastLocalStorageRevision || 0), Number(localRevision || 0)) });
          return;
        }
        let first = await pushPatchBatches(changes, deleted, { localRevision });
        if (first?.conflict) {
          let retryChanges = changes;
          if (prefs.mode === "two-way") {
            const pulled = await pullRemote();
            if (!pulled?.ok) return;
            retryChanges = await mergeConflictArrays(changes, first.conflictKeys);
          } else {
            const observed = await observeRemoteRevision();
            if (!observed?.ok) return;
          }
          const latest = (await getSyncContext()).state;
          first = await pushPatchBatches(retryChanges, deleted, { baseRevision: latest.lastRevision, localRevision });
        }
        if (first?.ok && prefs.mode === "two-way") await pullRemote();
        else if (first?.ok) await observeRemoteRevision();
      }).catch(() => {});
    }, 650);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    let localRevision = Number(changes?.[REVISION_KEY]?.newValue || 0) || 0;
    let sawLocalSettingChange = false;

    for (const [storageKey, change] of Object.entries(changes || {})) {
      if (!storageKey.startsWith(GRANULAR_PREFIX)) continue;
      const settingKey = storageKey.slice(GRANULAR_PREFIX.length);
      if (!settingKey) continue;

      const expected = remoteExpectedWrites.get(storageKey);
      if (expected) {
        const matches = expected.deleted
          ? change?.newValue === undefined
          : equalValue(change?.newValue, expected.value);
        if (matches) {
          remoteExpectedWrites.delete(storageKey);
          continue;
        }
        remoteExpectedWrites.delete(storageKey);
      }

      sawLocalSettingChange = true;
      if (change?.newValue === undefined) {
        pendingLocalPatch.delete(settingKey);
        pendingLocalDeleted.add(settingKey);
      } else {
        pendingLocalDeleted.delete(settingKey);
        pendingLocalPatch.set(settingKey, change.newValue);
      }
    }

    if (sawLocalSettingChange) schedulePatchPush(localRevision || now());
    for (const [scope, info] of Object.entries(LIST_SOURCES)) {
      if (changes?.[info.storage]) queued(() => recordLocalListChange(scope, changes[info.storage].newValue)).catch(() => {});
    }
  });

  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm?.name !== ALARM_NAME && alarm?.name !== LIST_SETTLED_ALARM) return;
    queued(() => syncNowInternal()).catch(() => {});
  });

  chrome.runtime.onStartup.addListener(() => {
    ensureSyncAlarm().then(() => setTimeout(() => queued(() => syncNowInternal()).catch(() => {}), 1500)).catch(() => {});
  });

  chrome.runtime.onInstalled.addListener(() => {
    ensureSyncAlarm().then(() => setTimeout(() => queued(() => syncNowInternal()).catch(() => {}), 1500)).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = String(message?.type || "");
    if (!type.startsWith("DS_QOL_SYNC_")) return false;

    const run = async () => {
      switch (type) {
        case "DS_QOL_SYNC_STATUS": return status();
        case "DS_QOL_SYNC_CREATE_ACCOUNT": return queued(() => createAccount(message.meta || {}));
        case "DS_QOL_SYNC_LINK_ACCOUNT": return queued(() => linkAccount(message.code, message.meta || {}, message.initialOptions || {}));
        case "DS_QOL_SYNC_CREATE_LINK_CODE": return queued(() => createLinkCode());
        case "DS_QOL_SYNC_NOW": return queued(() => syncNowInternal({ forceFullRecovery: !!message.forceFullRecovery, explicit: true }));
        case "DS_QOL_SYNC_UPLOAD": return queued(() => manualUpload());
        case "DS_QOL_SYNC_DOWNLOAD": return queued(() => manualDownload());
        case "DS_QOL_SYNC_SET_DEVICE_PREFS": return queued(() => setDevicePrefs(message.prefs || {}));
        case "DS_QOL_SYNC_LIST_DEVICES": return queued(() => listDevices());
        case "DS_QOL_SYNC_REVOKE_DEVICE": return queued(() => revokeDevice(message.deviceId));
        case "DS_QOL_SYNC_SET_PAUSED": return queued(() => setPaused(!!message.paused));
        case "DS_QOL_SYNC_DISCONNECT_LOCAL": return queued(() => disconnectLocal());
        default: return { ok: false, error: "unknown_sync_action", message: "Unknown QoL sync action." };
      }
    };

    run().then(sendResponse).catch(error => sendResponse({ ok: false, error: "sync_error", message: safeErrorMessage(error) }));
    return true;
  });

  ensureSyncAlarm().then(async () => {
    const saved = await storageGet([LIST_QUIET_UNTIL_KEY]);
    const quietUntil = Number(saved[LIST_QUIET_UNTIL_KEY] || 0);
    if (quietUntil > now()) chrome.alarms.create(LIST_SETTLED_ALARM, { when: quietUntil });
    setTimeout(() => queued(() => syncNowInternal()).catch(() => {}), 1800);
  }).catch(() => {});
})();
