"use strict";

// Feature-owned background helpers: storage. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function alarmName(tabId) {
  return `${LOAD_ALL_ALARM_PREFIX}${tabId}`;
}

function tabIdFromAlarm(name) {
  if (!name.startsWith(LOAD_ALL_ALARM_PREFIX)) return null;

  const raw = name.slice(LOAD_ALL_ALARM_PREFIX.length);
  const id = Number(raw);

  return Number.isFinite(id) ? id : null;
}

function scheduleLoadStep(tabId) {
  if (!tabId) return;

  activeLoaders.add(tabId);

  chrome.alarms.create(alarmName(tabId), {
    delayInMinutes: 0.1
  });
}

function stopLoader(tabId) {
  if (!tabId) return;

  activeLoaders.delete(tabId);
  chrome.alarms.clear(alarmName(tabId));
}

function settingStorageKey(name) {
  return `${GRANULAR_SETTING_PREFIX}${String(name || "").trim()}`;
}

function settingNameFromStorageKey(key) {
  const value = String(key || "");
  return value.startsWith(GRANULAR_SETTING_PREFIX) ? value.slice(GRANULAR_SETTING_PREFIX.length) : "";
}

function largeStorageCompressionAvailable() {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function" && typeof TextEncoder === "function" && typeof TextDecoder === "function";
}

function largeStorageSummary(key, value) {
  const summary = {};
  for (const field of LARGE_STORAGE_SUMMARY_FIELDS[key] || []) {
    if (!Object.prototype.hasOwnProperty.call(value || {}, field)) continue;
    const item = value[field];
    if (item == null || ["string", "number", "boolean"].includes(typeof item)) summary[field] = item;
  }
  return summary;
}

async function largeStorageStreamBytes(bytes, kind) {
  const stream = kind === "compress" ? new CompressionStream("gzip") : new DecompressionStream("gzip");
  const source = new Blob([bytes]).stream();
  return new Uint8Array(await new Response(source.pipeThrough(stream)).arrayBuffer());
}

async function packLargeStorageRecord(key, record) {
  let json;
  try { json = JSON.stringify(record.value); }
  catch { return record; }
  if (typeof json !== "string") return record;
  const bytes = new TextEncoder().encode(json);
  if (!largeStorageCompressionAvailable() || bytes.byteLength < LARGE_STORAGE_MIN_BYTES || bytes.byteLength > LARGE_STORAGE_MAX_UNPACKED_BYTES) return record;
  try {
    const packed = await largeStorageStreamBytes(bytes, "compress");
    if (packed.byteLength > bytes.byteLength * (1 - LARGE_STORAGE_MIN_SAVINGS)) return record;
    // Verify that compression is reversible before replacing the original.
    const restored = await largeStorageStreamBytes(packed, "decompress");
    if (restored.byteLength !== bytes.byteLength || new TextDecoder().decode(restored) !== json) return record;
    return {
      id: record.id, codec: LARGE_STORAGE_CODEC, payload: packed,
      bytesBefore: bytes.byteLength, summary: largeStorageSummary(key, record.value)
    };
  } catch {
    return record; // Unsupported/failed compression must never block storage.
  }
}

async function unpackLargeStorageRecord(row) {
  if (!row || !row.codec) return row?.value && typeof row.value === "object" ? row.value : null;
  if (row.codec !== LARGE_STORAGE_CODEC) throw new Error("Unknown QoL stored-record codec; refusing to discard the saved record.");
  if (!largeStorageCompressionAvailable()) throw new Error("This browser cannot decompress existing QoL stored records.");
  const data = row.payload instanceof Uint8Array ? row.payload : new Uint8Array(row.payload || []);
  if (!data.byteLength || Number(row.bytesBefore || 0) > LARGE_STORAGE_MAX_UNPACKED_BYTES) throw new Error("Invalid compressed QoL stored record.");
  const restored = await largeStorageStreamBytes(data, "decompress");
  if (restored.byteLength > LARGE_STORAGE_MAX_UNPACKED_BYTES || (row.bytesBefore && restored.byteLength !== row.bytesBefore)) throw new Error("Damaged QoL compressed stored record.");
  const value = JSON.parse(new TextDecoder().decode(restored));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid decoded QoL stored record.");
  return value;
}

async function unpackLargeStorageRows(rows) {
  // Bound the number of simultaneous gzip streams on large reads.
  const result = new Array(rows.length);
  for (let i = 0; i < rows.length; i += 6) {
    await Promise.all(rows.slice(i, i + 6).map(async (row, j) => {
      result[i + j] = { id: row.id, value: await unpackLargeStorageRecord(row) };
    }));
  }
  return result;
}

async function packLargeStorageRecords(key, records) {
  const packed = [];
  for (let i = 0; i < records.length; i += 6) {
    packed.push(...await Promise.all(records.slice(i, i + 6).map(row => packLargeStorageRecord(key, row))));
  }
  return packed;
}

async function optimizeLargeStoragePage(key, { afterId = "", limit = 30 } = {}) {
  if (!LARGE_STORAGE_KEYS.has(key)) throw new Error("Unknown QoL storage category.");
  if (!largeStorageCompressionAvailable()) throw new Error("Gzip compression is unavailable in this browser.");
  await ensureLargeStorageMigrated(key);
  const db = await openLargeStorageDb();
  const safeLimit = Math.max(1, Math.min(LARGE_STORAGE_OPTIMIZE_BATCH_LIMIT, Number(limit) || 30));
  const startId = String(afterId || "");
  const source = db.transaction(key, "readonly").objectStore(key);
  const range = startId ? IDBKeyRange.lowerBound(startId, true) : null;
  const rows = await idbRequest(source.getAll(range, safeLimit));
  const candidates = [];
  let alreadyCompressed = 0;
  let tooSmall = 0;
  for (const row of rows || []) {
    if (row?.codec === LARGE_STORAGE_CODEC) { alreadyCompressed++; continue; }
    if (!row?.value || typeof row.value !== "object") continue;
    const packed = await packLargeStorageRecord(key, { id: row.id, value: row.value });
    if (packed.codec === LARGE_STORAGE_CODEC) {
      candidates.push({ id: row.id, previous: JSON.stringify(row.value), packed });
    } else tooSmall++;
  }
  let converted = 0;
  let concurrentChanges = 0;
  if (candidates.length) {
    const tx = db.transaction(key, "readwrite");
    const store = tx.objectStore(key);
    const done = idbTransactionDone(tx);
    for (const entry of candidates) {
      const req = store.get(entry.id);
      req.onsuccess = () => {
        const latest = req.result;
        if (!latest || latest.codec || JSON.stringify(latest.value) !== entry.previous) { concurrentChanges++; return; }
        store.put(entry.packed);
        converted++;
      };
    }
    await done;
  }
  const nextAfterId = rows?.length ? String(rows[rows.length - 1].id) : startId;
  return {
    ok: true, key, scanned: rows.length, converted, alreadyCompressed, tooSmall,
    concurrentChanges, nextAfterId, done: rows.length < safeLimit
  };
}

function largeStorageRequestedKeys(keys) {
  if (keys == null) return [...LARGE_STORAGE_KEYS];
  const list = typeof keys === "string" ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys || {}));
  return [...new Set(list.filter(key => LARGE_STORAGE_KEYS.has(String(key || ""))))];
}

function largeStorageLocalKeys(keys) {
  if (keys == null) return null;
  if (typeof keys === "string") return LARGE_STORAGE_KEYS.has(keys) ? [] : [keys];
  if (Array.isArray(keys)) return keys.filter(key => !LARGE_STORAGE_KEYS.has(String(key || "")));
  if (keys && typeof keys === "object") {
    return Object.fromEntries(Object.entries(keys).filter(([key]) => !LARGE_STORAGE_KEYS.has(String(key || ""))));
  }
  return keys;
}

function openLargeStorageDb() {
  if (largeStorageDbPromise) return largeStorageDbPromise;
  largeStorageDbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(LARGE_STORAGE_DB_NAME, LARGE_STORAGE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const key of LARGE_STORAGE_KEYS) {
          if (!db.objectStoreNames.contains(key)) db.createObjectStore(key, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(LARGE_STORAGE_META_STORE)) {
          db.createObjectStore(LARGE_STORAGE_META_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open QoL large-data IndexedDB."));
      request.onblocked = () => reject(new Error("QoL large-data IndexedDB upgrade was blocked."));
    } catch (error) {
      reject(error);
    }
  }).catch(error => {
    largeStorageDbPromise = null;
    throw error;
  });
  return largeStorageDbPromise;
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function idbTransactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
  });
}

function normalizeLargeStorageRecords(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawMeta = source.meta && typeof source.meta === "object" && !Array.isArray(source.meta) ? source.meta : source;
  const records = [];
  for (const [rawId, rawValue] of Object.entries(rawMeta || {})) {
    const id = String(rawId || rawValue?.id || "").trim();
    if (!id || !rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) continue;
    records.push({ id, value: rawValue });
  }
  return records;
}

async function largeStorageMeta(key) {
  const db = await openLargeStorageDb();
  const tx = db.transaction(LARGE_STORAGE_META_STORE, "readonly");
  return (await idbRequest(tx.objectStore(LARGE_STORAGE_META_STORE).get(key))) || null;
}

async function writeLargeStorageMeta(key, extra = {}) {
  const db = await openLargeStorageDb();
  const tx = db.transaction(LARGE_STORAGE_META_STORE, "readwrite");
  tx.objectStore(LARGE_STORAGE_META_STORE).put({ key, migrated: true, updatedAt: Date.now(), ...extra });
  await idbTransactionDone(tx);
  return true;
}

async function replaceLargeStorage(key, value, { markMigrated = true } = {}) {
  if (!LARGE_STORAGE_KEYS.has(key)) return false;
  const records = await packLargeStorageRecords(key, normalizeLargeStorageRecords(value));
  const db = await openLargeStorageDb();
  const tx = db.transaction([key, LARGE_STORAGE_META_STORE], "readwrite");
  const store = tx.objectStore(key);
  store.clear();
  for (const record of records) store.put(record);
  if (markMigrated) {
    tx.objectStore(LARGE_STORAGE_META_STORE).put({
      key,
      migrated: true,
      updatedAt: Date.now(),
      count: records.length
    });
  }
  await idbTransactionDone(tx);
  return true;
}

async function mergeLargeStorageEntries(key, entries) {
  if (!LARGE_STORAGE_KEYS.has(key)) return false;
  const startedAt = Date.now();
  await ensureLargeStorageMigrated(key);
  const records = normalizeLargeStorageRecords({ meta: entries });
  if (!records.length) return true;
  const packedRecords = await packLargeStorageRecords(key, records);
  const db = await openLargeStorageDb();
  const tx = db.transaction([key, LARGE_STORAGE_META_STORE], "readwrite");
  const store = tx.objectStore(key);
  for (const record of packedRecords) store.put(record);
  tx.objectStore(LARGE_STORAGE_META_STORE).put({ key, migrated: true, updatedAt: Date.now() });
  await idbTransactionDone(tx);
  qolBackgroundTrace("storage", "indexeddb", { action: "merge", key, records: records.length, durationMs: Date.now() - startedAt });
  return true;
}

async function readLargeStorage(key) {
  if (!LARGE_STORAGE_KEYS.has(key)) return { meta: {} };
  const startedAt = Date.now();
  await ensureLargeStorageMigrated(key);
  const db = await openLargeStorageDb();
  const tx = db.transaction(key, "readonly");
  const rows = await unpackLargeStorageRows(await idbRequest(tx.objectStore(key).getAll()));
  const meta = {};
  for (const row of rows || []) {
    const id = String(row?.id || "").trim();
    if (id && row?.value && typeof row.value === "object") meta[id] = row.value;
  }
  qolBackgroundTrace("storage", "indexeddb", { action: "read-all", key, records: Object.keys(meta).length, durationMs: Date.now() - startedAt });
  return { meta };
}

async function readLargeStorageRecords(key, ids = []) {
  if (!LARGE_STORAGE_KEYS.has(key)) return {};
  const startedAt = Date.now();
  await ensureLargeStorageMigrated(key);
  const cleanIds = [...new Set((Array.isArray(ids) ? ids : [ids]).map(id => String(id || "").trim()).filter(Boolean))];
  if (!cleanIds.length) return {};
  const db = await openLargeStorageDb();
  const tx = db.transaction(key, "readonly");
  const store = tx.objectStore(key);
  const rows = await Promise.all(cleanIds.map(id => idbRequest(store.get(id)).catch(() => null)));
  const decoded = await unpackLargeStorageRows(rows.filter(Boolean));
  const byId = new Map(decoded.map(row => [row.id, row.value]));
  const out = {};
  for (let i = 0; i < cleanIds.length; i += 1) {
    const value = byId.get(cleanIds[i]);
    if (value && typeof value === "object") out[cleanIds[i]] = value;
  }
  qolBackgroundTrace("storage", "indexeddb", { action: "read-records", key, requested: cleanIds.length, records: Object.keys(out).length, durationMs: Date.now() - startedAt }, { level: "deep" });
  return out;
}

async function removeLargeStorageRecords(key, ids = []) {
  if (!LARGE_STORAGE_KEYS.has(key)) return { ok: false, key, removed: 0, count: 0 };
  const startedAt = Date.now();
  await ensureLargeStorageMigrated(key);
  const cleanIds = [...new Set((Array.isArray(ids) ? ids : [ids]).map(id => String(id || "").trim()).filter(Boolean))];
  if (!cleanIds.length) return { ok: true, key, removed: 0, count: Number((await largeStorageMeta(key).catch(() => null))?.count || 0) };

  const db = await openLargeStorageDb();
  const tx = db.transaction([key, LARGE_STORAGE_META_STORE], "readwrite");
  const store = tx.objectStore(key);
  let removed = 0;
  for (const id of cleanIds) {
    const existing = await idbRequest(store.get(id)).catch(() => null);
    if (!existing) continue;
    store.delete(id);
    removed += 1;
  }
  const count = Number(await idbRequest(store.count()).catch(() => 0)) || 0;
  tx.objectStore(LARGE_STORAGE_META_STORE).put({ key, migrated: true, updatedAt: Date.now(), count });
  await idbTransactionDone(tx);
  qolBackgroundTrace("storage", "indexeddb", { action: "remove-records", key, requested: cleanIds.length, removed, count, durationMs: Date.now() - startedAt }, { level: "deep" });
  return { ok: true, key, removed, count };
}

async function readLargeStoragePage(key, { afterId = "", limit = 250 } = {}) {
  if (!LARGE_STORAGE_KEYS.has(key)) return { key, rows: [], nextAfterId: "", done: true };
  const startedAt = Date.now();
  await ensureLargeStorageMigrated(key);
  const db = await openLargeStorageDb();
  const tx = db.transaction(key, "readonly");
  const store = tx.objectStore(key);
  const safeLimit = Math.max(25, Math.min(500, Number(limit) || 250));
  const cursorAfter = String(afterId || "").trim();
  const range = cursorAfter ? IDBKeyRange.lowerBound(cursorAfter, true) : null;
  const rows = await idbRequest(store.getAll(range, safeLimit));
  const decodedRows = await unpackLargeStorageRows(rows);
  const cleanRows = [];
  for (const row of decodedRows) {
    const id = String(row?.id || "").trim();
    if (!id || !row?.value || typeof row.value !== "object") continue;
    cleanRows.push({ id, value: row.value });
  }
  const nextAfterId = rows.length ? String(rows[rows.length - 1].id) : cursorAfter;
  const result = { key, rows: cleanRows, nextAfterId, done: (rows || []).length < safeLimit };
  qolBackgroundTrace("storage", "indexeddb", { action: "read-page", key, records: cleanRows.length, limit: safeLimit, done: result.done, durationMs: Date.now() - startedAt }, { level: "deep" });
  return result;
}

async function clearLargeStorage(key) {
  if (!LARGE_STORAGE_KEYS.has(key)) return false;
  const db = await openLargeStorageDb();
  const tx = db.transaction([key, LARGE_STORAGE_META_STORE], "readwrite");
  tx.objectStore(key).clear();
  tx.objectStore(LARGE_STORAGE_META_STORE).put({ key, migrated: true, updatedAt: Date.now(), count: 0 });
  await idbTransactionDone(tx);
  try { await new Promise(resolve => chrome.storage.local.remove([key], () => resolve())); } catch {}
  return true;
}

async function ensureLargeStorageMigrated(key) {
  if (!LARGE_STORAGE_KEYS.has(key)) return true;
  if (largeStorageMigrationPromises.has(key)) return largeStorageMigrationPromises.get(key);
  const promise = (async () => {
    const existingMeta = await largeStorageMeta(key).catch(() => null);
    if (existingMeta?.migrated) return true;

    // One-time .29 migration. Import the legacy monolithic object, verify the
    // per-record IDB count, then remove ONLY that legacy chrome.storage key.
    const legacy = await new Promise(resolve => {
      try { chrome.storage.local.get([key], value => resolve(value?.[key])); }
      catch { resolve(undefined); }
    });
    const records = normalizeLargeStorageRecords(legacy);
    await replaceLargeStorage(key, legacy);

    const db = await openLargeStorageDb();
    const tx = db.transaction(key, "readonly");
    const count = Number(await idbRequest(tx.objectStore(key).count())) || 0;
    if (count < records.length) throw new Error(`Large storage migration verification failed for ${key}.`);

    await writeLargeStorageMeta(key, { count });
    try { await new Promise(resolve => chrome.storage.local.remove([key], () => resolve())); } catch {}
    return true;
  })().finally(() => largeStorageMigrationPromises.delete(key));
  largeStorageMigrationPromises.set(key, promise);
  return promise;
}

async function getLargeStorageValues(keys) {
  const requested = largeStorageRequestedKeys(keys);
  const data = {};
  for (const key of requested) data[key] = await readLargeStorage(key);
  return data;
}

async function getLargeStorageStats() {
  const startedAt = Date.now();
  const stats = {};
  for (const key of LARGE_STORAGE_KEYS) {
    await ensureLargeStorageMigrated(key);
    const db = await openLargeStorageDb();
    const tx = db.transaction(key, "readonly");
    stats[key] = Number(await idbRequest(tx.objectStore(key).count())) || 0;
  }
  qolBackgroundTrace("storage", "indexeddb", { action: "stats", stores: Object.keys(stats).length, records: Object.values(stats).reduce((sum, value) => sum + Number(value || 0), 0), durationMs: Date.now() - startedAt }, { level: "deep" });
  return stats;
}

async function setLargeStorageValues(values) {
  const startedAt = Date.now();
  const source = values && typeof values === "object" && !Array.isArray(values) ? values : {};
  const changed = [];
  for (const key of LARGE_STORAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    await replaceLargeStorage(key, source[key]);
    try { await new Promise(resolve => chrome.storage.local.remove([key], () => resolve())); } catch {}
    changed.push(key);
  }
  qolBackgroundTrace("storage", "indexeddb", { action: "replace", keys: changed, stores: changed.length, durationMs: Date.now() - startedAt });
  return { ok: true, keys: changed };
}

async function storageGet(keys) {
  const largeKeys = largeStorageRequestedKeys(keys);
  let largeData = {};
  if (largeKeys.length) {
    try { largeData = await getLargeStorageValues(keys); } catch {}
  }

  const localKeys = largeStorageLocalKeys(keys);
  const requested = typeof localKeys === "string" ? [localKeys] : (Array.isArray(localKeys) ? localKeys : null);
  const wantsSettings = keys == null || requested?.includes("settings");
  const firstKeys = !wantsSettings || localKeys == null ? localKeys : [...new Set([...(requested || []), GRANULAR_SETTINGS_INDEX_KEY, GRANULAR_SETTINGS_MIGRATION_KEY])];
  const first = await new Promise(resolve => chrome.storage.local.get(firstKeys, resolve));
  const result = first || {};
  if (wantsSettings) {
    const index = [...new Set((Array.isArray(result[GRANULAR_SETTINGS_INDEX_KEY]) ? result[GRANULAR_SETTINGS_INDEX_KEY] : []).map(name => String(name || "").trim()).filter(Boolean))];
    granularSettingsIndexCache = new Set(index);
    const granular = localKeys == null || !index.length
      ? result
      : await new Promise(resolve => chrome.storage.local.get(index.map(settingStorageKey), resolve));
    const hadLegacy = result.settings && typeof result.settings === "object";
    const merged = hadLegacy ? { ...result.settings } : {};
    let found = false;
    for (const name of index) {
      const key = settingStorageKey(name);
      if (!Object.prototype.hasOwnProperty.call(granular || {}, key)) continue;
      merged[name] = granular[key];
      found = true;
    }
    if (hadLegacy || found) result.settings = merged;
    else delete result.settings;
  }
  return { ...result, ...largeData };
}

async function storageSet(values) {
  const payload = values && typeof values === "object" ? { ...values } : {};
  const largePayload = {};
  for (const key of LARGE_STORAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    largePayload[key] = payload[key];
    delete payload[key];
  }
  if (Object.keys(largePayload).length) await setLargeStorageValues(largePayload);
  if (payload.settings && typeof payload.settings === "object") {
    const settings = payload.settings;
    delete payload.settings;
    let indexChanged = false;
    for (const [name, value] of Object.entries(settings)) {
      payload[settingStorageKey(name)] = value;
      if (!granularSettingsIndexCache.has(name)) { granularSettingsIndexCache.add(name); indexChanged = true; }
    }
    if (indexChanged) payload[GRANULAR_SETTINGS_INDEX_KEY] = [...granularSettingsIndexCache].sort();
    payload[GRANULAR_SETTINGS_MIGRATION_KEY] = true;
    payload[GRANULAR_SETTINGS_REVISION_KEY] = Date.now();
  }
  if (!Object.keys(payload).length) return true;
  return new Promise(resolve => chrome.storage.local.set(payload, () => resolve(!chrome.runtime.lastError)));
}

function botStatusDeltaEntries(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const [rawId, rawEntry] of Object.entries(source)) {
    const id = String(rawId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue;
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    out[id] = rawEntry;
  }
  return out;
}

function persistBotStatusDelta(message = {}) {
  const availabilityUpdates = botStatusDeltaEntries(message.availabilityUpdates);
  const archiveUpdates = botStatusDeltaEntries(message.archiveUpdates);
  const availabilityIds = Object.keys(availabilityUpdates);
  const archiveIds = Object.keys(archiveUpdates);

  if (!availabilityIds.length && !archiveIds.length) {
    return Promise.resolve({ ok: true, availability: 0, archive: 0 });
  }

  botStatusPersistQueue = botStatusPersistQueue.catch(() => null).then(async () => {
    try {
      // v0.2.29: per-bot IDB writes. A one-bot Bot Status result no longer
      // clones and rewrites the complete archive/availability objects.
      if (availabilityIds.length) await mergeLargeStorageEntries("botAvailability", availabilityUpdates);
      if (archiveIds.length) await mergeLargeStorageEntries("botArchive", archiveUpdates);
      return { ok: true, availability: availabilityIds.length, archive: archiveIds.length };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error),
        availability: availabilityIds.length,
        archive: archiveIds.length
      };
    }
  });

  return botStatusPersistQueue;
}


"use strict";
// Local conversation Lorebook writes share one queue across SpicyChat tabs.
// Read-only consumers still use chrome.storage.local directly. Never touches
// native Lorebooks or sends chat information to the network.
(() => {
  const TYPE = 'DS_CHAT_LOREBOOK_MUTATE';
  const KEY = 'dsQolChatLorebookDraftsV1';
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const CHAT = new RegExp(`^conversation:(${UUID})$`, 'i');
  const PATH = new RegExp(`/(?:chat)/${UUID}/(${UUID})(?:/|$)`, 'i');
  const pipelines = new Map();
  const norm = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  const storageGet = () => new Promise((resolve, reject) => chrome.storage.local.get(KEY, result => {
    const error = chrome.runtime.lastError;
    error ? reject(new Error(error.message)) : resolve(result?.[KEY] || {});
  }));
  const storageSet = data => new Promise((resolve, reject) => chrome.storage.local.set({[KEY]:data}, () => {
    const error = chrome.runtime.lastError;
    error ? reject(new Error(error.message)) : resolve();
  }));
  const isRecord = (record, chatId) => !!record && typeof record === 'object' &&
    record.chatId === chatId && /^[0-9a-f-]{36}$/i.test(String(record.entryId||'')) &&
    typeof record.name === 'string' && !!record.name.trim() && record.name.length <= 50 &&
    typeof record.content === 'string' && !!record.content.trim() && record.content.length <= 2000 &&
    Array.isArray(record.keywords) && record.keywords.length <= 12 &&
    record.keywords.every(word => typeof word === 'string' && word.length <= 80) &&
    JSON.stringify(record).length <= 12000;
  function find(list, key) {
    if (typeof key !== 'string') return null;
    if (key.startsWith('id:')) {
      const matches = list.map((entry,index) => ({entry,index})).filter(x => x.entry?.entryId === key.slice(3));
      return matches.length === 1 ? matches[0] : null;
    }
    const legacy = /^legacy:(\d+)$/.exec(key);
    const index = legacy ? Number(legacy[1]) : -1;
    return index >= 0 && index < list.length && !list[index]?.entryId ? {entry:list[index], index} : null;
  }
  function unique(list, record, except=-1) {
    if(list.some((entry,index) => index !== except && (entry.entryId === record.entryId ||
      (norm(entry.name) === norm(record.name) && norm(entry.content) === norm(record.content))))) {
      throw new Error('This local Lorebook entry already exists. Refresh the editor.');
    }
  }
  async function change(message, sender) {
    const chatId = String(message?.chatId || '');
    const wanted = CHAT.exec(chatId)?.[1]?.toLowerCase();
    const uri = String(sender?.url || sender?.tab?.url || '');
    let parsed;
    try { parsed = new URL(uri); } catch { throw new Error('Invalid SpicyChat tab.'); }
    const actual = PATH.exec(parsed.pathname)?.[1]?.toLowerCase();
    if(parsed.protocol !== 'https:' || !['spicychat.ai','www.spicychat.ai'].includes(parsed.hostname) ||
        !wanted || !actual || wanted !== actual) throw new Error('Conversation mismatch. No local Lorebook changes made.');
    const all = await storageGet();
    const current = Array.isArray(all[chatId]) ? [...all[chatId]] : [];
    const op = String(message?.op || '');
    let count=0;
    if(op === 'create') {
      const record=message.record;
      if(!isRecord(record,chatId)) throw new Error('Invalid local Lorebook entry.');
      if(current.length >= 200) throw new Error('Local Lorebook has reached 200 entries.');
      unique(current,record); current.push(record);count=1;
    } else if(op === 'replace' || op === 'delete') {
      const match = find(current,message.key);
      if(!match || typeof message.expected !== 'string' || JSON.stringify(match.entry) !== message.expected)
        throw new Error('This local Lorebook entry changed in another tab. Refresh before editing.');
      if(op === 'delete') current.splice(match.index,1);
      else {
        const record=message.record;
        if(!isRecord(record,chatId) || (match.entry?.entryId && match.entry.entryId !== record.entryId))
          throw new Error('Invalid or mismatched local Lorebook revision.');
        unique(current,record,match.index);current[match.index]=record;
      }
      count=1;
    } else if(op === 'import') {
      const incoming=message.records;
      if(!Array.isArray(incoming) || incoming.length > 200 || !incoming.every(x=>isRecord(x,chatId) && x.disabled===true))
        throw new Error('Invalid or non-reviewed Lorebook import.');
      const known=new Set(current.map(x=>JSON.stringify([norm(x.name),norm(x.content)])));
      const ids=new Set(current.map(x=>x.entryId));
      for(const record of incoming) {
        const fingerprint=JSON.stringify([norm(record.name),norm(record.content)]);
        if(known.has(fingerprint))continue;
        if(ids.has(record.entryId))throw new Error('A local Lorebook ID is already in use.');
        known.add(fingerprint);ids.add(record.entryId);current.push(record);count++;
      }
      if(current.length>200)throw new Error('Import would exceed the 200-entry local Lorebook limit.');
    } else throw new Error('Unsupported local Lorebook operation.');
    if(count) {all[chatId]=current;await storageSet(all);}
    return {count,total:current.length};
  }
  dsqRegisterBackgroundMessageHandler(TYPE,'chat-lorebook-manager',(message,sender,respond) => {
    // All writers to this shared storage object must serialize, even when
    // they target different conversations (storage.local.set replaces it whole).
    const previous = pipelines.get(KEY) || Promise.resolve();
    const result = previous.catch(()=>{}).then(()=>change(message,sender));
    const tail = result.catch(()=>{});
    pipelines.set(KEY,tail);
    tail.finally(()=>{if(pipelines.get(KEY)===tail)pipelines.delete(KEY);});
    result.then(data=>respond({ok:true,result:data}),error=>respond({ok:false,error:String(error?.message||error)}));
    return true;
  });
})();

// Context Keeper's shared local store contains several conversations. Serialize
// all QoL Context Keeper changes across tabs, comparing each conversation with
// the snapshot used to edit it before writing. No native API calls.
(() => {
  const TYPE = 'DS_CONTEXT_KEEPER_MUTATE';
  const KEY = 'contextKeeperData';
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const CHAT = new RegExp(`^conversation:(${UUID})$`, 'i');
  const PATH = new RegExp(`^/chat/${UUID}/(${UUID})(?:/|$)`, 'i');
  let queue = Promise.resolve();
  const get = () => new Promise((resolve, reject) => chrome.storage.local.get(KEY, data =>
    chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(data?.[KEY] || {})));
  const put = value => new Promise((resolve, reject) => chrome.storage.local.set({[KEY]:value}, () =>
    chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
  async function mutate(message, sender) {
    let page;
    try { page = new URL(String(sender?.tab?.url || sender?.url || '')); }
    catch { throw new Error('Context Keeper requires a signed-in SpicyChat chat tab.'); }
    const conversation = PATH.exec(page.pathname)?.[1]?.toLowerCase();
    if(page.protocol !== 'https:' || !['spicychat.ai','www.spicychat.ai'].includes(page.hostname) ||
       !sender?.tab?.id || !conversation) throw new Error('Invalid Context Keeper source tab.');
    const patches = message?.patches;
    if(!Array.isArray(patches) || patches.length < 1 || patches.length > 5 ||
       JSON.stringify(patches).length > 2500000) throw new Error('Invalid Context Keeper patch.');
    const unique = new Set();
    for(const patch of patches) {
      const id = CHAT.exec(String(patch?.chatId || ''))?.[1]?.toLowerCase();
      if(!id || id !== conversation || unique.has(id) ||
         (patch.previous != null && (typeof patch.previous !== 'object' || Array.isArray(patch.previous))) ||
         (patch.value != null && (typeof patch.value !== 'object' || Array.isArray(patch.value))) ||
         (patch.value && (!Array.isArray(patch.value.details) || patch.value.details.length > 2000)))
        throw new Error('Context Keeper conversation mismatch or invalid entry.');
      unique.add(id);
    }
    const old = await get();
    const current = old && typeof old === 'object' && !Array.isArray(old) ? old : {};
    for (const patch of patches) {
      if(JSON.stringify(current[patch.chatId] ?? null) !== JSON.stringify(patch.previous ?? null))
        throw new Error('This Context Keeper conversation changed in another tab. Refresh before saving.');
    }
    const next = {...current};
    for (const patch of patches) {
      if(patch.value == null) delete next[patch.chatId];
      else next[patch.chatId] = patch.value;
    }
    await put(next);
    return message.recordChange ? {before:current,after:next} : {};
  }
  dsqRegisterBackgroundMessageHandler(TYPE,'context-keeper',(message,sender,respond) => {
    const task = queue.catch(()=>{}).then(()=>mutate(message,sender));
    queue = task.catch(()=>{});
    task.then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:String(error?.message||error)}));
    return true;
  });
})();
