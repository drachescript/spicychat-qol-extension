"use strict";

(() => {
  const API_BASE = "https://syncqol.drache.uk";
  const STATE_KEY = "qolSyncStateV1";
  const AUTH_KEY = "qolSyncAuthV1";
  const GRANULAR_PREFIX = "dsSettingV1:";
  const INDEX_KEY = "dsSettingsIndexV1";
  const MIGRATION_KEY = "dsGranularSettingsV1";
  const REVISION_KEY = "dsSettingsRevisionV1";
  const ALARM_NAME = "ds-qol-account-sync-v1";
  const SYNC_INTERVAL_MINUTES = 5;
  const REQUEST_TIMEOUT_MS = 30000;
  const MAX_PUSH_KEYS = 20;

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

  async function currentLocalSettings() {
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
      if (Object.prototype.hasOwnProperty.call(values, key)) settings[name] = values[key];
    }
    return { settings, index, localRevision: Number(first[REVISION_KEY] || 0) || 0 };
  }

  async function ensureSyncAlarm() {
    const { state, auth } = await getStateAndAuth();
    if (!state.accountId || !auth.token || state.paused || state.automatic === false) {
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
    const changeEntries = Object.entries(changes || {}).filter(([key]) => !!String(key || "").trim());
    const cleanDeleted = [...new Set((deletedKeys || []).map(key => String(key || "").trim()).filter(Boolean))];
    if (!changeEntries.length && !cleanDeleted.length) return { ok: true, applied: 0 };

    const { state, auth } = await getStateAndAuth();
    if (!state.accountId || !auth.token || state.paused || state.automatic === false) return { ok: false, skipped: true, reason: "not-linked-or-paused" };

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
      const patch = {
        // Do not advance lastRevision here. A different device may have written
        // unrelated settings between our last pull and this accepted push. We
        // only advance the pull cursor after GET /v1/sync has actually delivered
        // every intervening revision, otherwise those remote changes could be
        // skipped forever.
        lastSyncAt: now(),
        lastSyncAttemptAt: now(),
        lastError: "",
        lastErrorAt: 0,
        lastStatus: `Uploaded ${Number(result.applied || changeEntries.length + cleanDeleted.length)} setting${Number(result.applied || changeEntries.length + cleanDeleted.length) === 1 ? "" : "s"}`
      };
      if (options.localRevision) patch.lastLocalStorageRevision = Math.max(state.lastLocalStorageRevision, Number(options.localRevision || 0));
      await saveStatePatch(patch);
      return { ok: true, ...result };
    } catch (error) {
      if (error?.status === 409 && error?.code === "sync_conflict") {
        await saveStatePatch({
          lastSyncAttemptAt: now(),
          lastError: "Settings changed on another device. Pulling the latest cloud values before retrying.",
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
        localRevision: isLast ? Number(options.localRevision || 0) : 0
      });
      if (!result?.ok) return result;
      applied += Number(result.applied || Object.keys(batch.changes).length + batch.deletedKeys.length);
      revision = Number(result.revision || revision || 0);
    }
    return { ok: true, applied, revision };
  }

  async function pushFullLocalSettings({ baseRevision = null } = {}) {
    const local = await currentLocalSettings();
    const entries = Object.entries(local.settings);
    if (!entries.length) {
      await saveStatePatch({ lastLocalStorageRevision: local.localRevision, lastSyncAt: now(), lastStatus: "Nothing to upload", lastError: "", lastErrorAt: 0 });
      return { ok: true, applied: 0 };
    }

    const result = await pushPatchBatches(local.settings, [], {
      baseRevision,
      localRevision: local.localRevision
    });
    if (!result?.ok) return result;
    const applied = Number(result.applied || entries.length);
    await saveStatePatch({ lastLocalStorageRevision: local.localRevision, lastStatus: `Uploaded ${applied} settings`, lastError: "", lastErrorAt: 0 });
    return { ok: true, applied, revision: result.revision };
  }

  async function applyRemotePayload(changes, deletedKeys) {
    const changeEntries = Object.entries(changes || {});
    const deletes = [...new Set((deletedKeys || []).map(key => String(key || "").trim()).filter(Boolean))];
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

  async function pullRemote({ since = null } = {}) {
    const { state, auth } = await getStateAndAuth();
    if (!state.accountId || !auth.token || state.paused || state.automatic === false) return { ok: false, skipped: true, reason: "not-linked-or-paused" };

    let cursor = since == null ? state.lastRevision : Math.max(0, Number(since || 0));
    let finalRevision = state.lastRevision;
    let changed = 0;
    try {
      for (let page = 0; page < 20; page += 1) {
        const result = await api(`/v1/sync?since=${encodeURIComponent(cursor)}`, { token: auth.token });
        await applyRemotePayload(result.changes || {}, result.deletedKeys || []);
        changed += Object.keys(result.changes || {}).length + (result.deletedKeys || []).length;
        finalRevision = Math.max(finalRevision, Number(result.revision || 0));
        if (!result.hasMore) break;
        const nextCursor = Math.max(cursor, Number(result.maxReturnedRevision || cursor));
        if (nextCursor <= cursor) break;
        cursor = nextCursor;
      }
      const local = await storageGet([REVISION_KEY]);
      await saveStatePatch({
        lastRevision: finalRevision,
        lastSyncAt: now(),
        lastSyncAttemptAt: now(),
        lastError: "",
        lastErrorAt: 0,
        lastStatus: changed ? `Downloaded ${changed} setting${changed === 1 ? "" : "s"}` : "Up to date",
        // A remote apply does not touch dsSettingsRevisionV1. Preserve the last
        // known local-only revision marker for crash recovery.
        lastLocalStorageRevision: state.lastLocalStorageRevision || Number(local[REVISION_KEY] || 0) || 0
      });
      return { ok: true, changed, revision: finalRevision };
    } catch (error) {
      return recordFailure(error, "Download failed");
    }
  }

  async function syncNowInternal({ forceFullRecovery = false } = {}) {
    const { state, auth } = await getStateAndAuth();
    if (!state.accountId || !auth.token) return { ok: false, error: "not_linked", message: "This device is not linked to a QoL account." };
    if (state.paused) return { ok: false, error: "paused", message: "Automatic sync is paused on this device." };

    // dsSettingsRevisionV1 can legitimately still be 0 on an existing profile
    // whose settings were migrated before account sync existed. That means it
    // cannot be the only signal that an initial upload is still required.
    // Keep a lightweight snapshot so a freshly-created account that is still at
    // cloud revision 0 can seed itself even after a previous initial upload
    // failed (for example because one logical setting exceeded an old limit).
    const localSnapshot = await currentLocalSettings();
    const localRevision = Number(localSnapshot.localRevision || 0) || 0;
    const localSettingCount = Object.keys(localSnapshot.settings || {}).length;
    const hadUnsyncedLocalRevision = localRevision > Number(state.lastLocalStorageRevision || 0);

    const pulled = await pullRemote();
    if (!pulled?.ok) return pulled;

    const cloudStillEmpty = Number(pulled.revision || 0) === 0 && localSettingCount > 0;
    if (forceFullRecovery || hadUnsyncedLocalRevision || cloudStillEmpty) {
      const afterPullState = (await getStateAndAuth()).state;
      const pushed = await pushFullLocalSettings({ baseRevision: afterPullState.lastRevision });
      if (!pushed?.ok) return pushed;
      const repulled = await pullRemote();
      if (!repulled?.ok) return repulled;
    }

    const finalState = (await getStateAndAuth()).state;
    // A non-empty local settings document plus cloud revision 0 is not a real
    // successful sync. Treat it as incomplete instead of showing the user a
    // false-positive "QoL settings synced" message.
    if (localSettingCount > 0 && Number(finalState.lastRevision || 0) === 0) {
      return recordFailure(new Error("Cloud sync finished without recording a settings revision. Retry Sync now."), "Sync incomplete");
    }

    return { ok: true, revision: finalState.lastRevision };
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
          clientVersion: String(meta.clientVersion || "0.2.25").slice(0, 40)
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
        [AUTH_KEY]: { token: String(result.deviceToken || "") }
      });
      await ensureSyncAlarm();
      const pushed = await pushFullLocalSettings({ baseRevision: state.lastRevision });
      if (!pushed?.ok) {
        return {
          ok: true,
          accountId: state.accountId,
          deviceId: state.deviceId,
          initialSyncOk: false,
          sync: pushed
        };
      }
      const pulled = await pullRemote({ since: 0 });
      return {
        ok: true,
        accountId: state.accountId,
        deviceId: state.deviceId,
        initialSyncOk: !!pulled?.ok,
        sync: pulled
      };
    } catch (error) {
      return recordFailure(error, "Account creation failed");
    }
  }

  async function linkAccount(code, meta = {}) {
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
          clientVersion: String(meta.clientVersion || "0.2.25").slice(0, 40)
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
        lastStatus: "Linked — downloading account settings"
      };
      await storageSet({ [STATE_KEY]: state, [AUTH_KEY]: { token: String(result.deviceToken || "") } });
      await ensureSyncAlarm();
      const pulled = await pullRemote({ since: 0 });
      const local = await storageGet([REVISION_KEY]);
      await saveStatePatch({ lastLocalStorageRevision: Number(local[REVISION_KEY] || 0) || 0 });
      return {
        ok: true,
        accountId: state.accountId,
        deviceId: state.deviceId,
        initialSyncOk: !!pulled?.ok,
        sync: pulled
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
    await storageRemove([AUTH_KEY]);
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

  async function status() {
    const { state, auth } = await getStateAndAuth();
    return {
      ok: true,
      apiBase: API_BASE,
      linked: !!(state.accountId && auth.token),
      hasCredential: !!auth.token,
      state
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
        const first = await pushPatchBatches(changes, deleted, { localRevision });
        if (first?.conflict) {
          const pulled = await pullRemote();
          if (pulled?.ok) {
            const state = (await getStateAndAuth()).state;
            const retry = await pushPatchBatches(changes, deleted, { baseRevision: state.lastRevision, localRevision });
            if (retry?.ok) await pullRemote();
          }
          return;
        }
        if (first?.ok) await pullRemote();
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
  });

  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm?.name !== ALARM_NAME) return;
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
        case "DS_QOL_SYNC_LINK_ACCOUNT": return queued(() => linkAccount(message.code, message.meta || {}));
        case "DS_QOL_SYNC_CREATE_LINK_CODE": return queued(() => createLinkCode());
        case "DS_QOL_SYNC_NOW": return queued(() => syncNowInternal({ forceFullRecovery: !!message.forceFullRecovery }));
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

  ensureSyncAlarm().then(() => {
    setTimeout(() => queued(() => syncNowInternal()).catch(() => {}), 1800);
  }).catch(() => {});
})();
