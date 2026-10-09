/* SpicyChat QoL storage measurements.
 * Read-only: scans stored row headers/payloads without decompressing or changing data.
 * Per-store sizes are byte-level estimates of serialized records, NOT filesystem sizes.
 */
(() => {
  "use strict";
  const DB_NAME = "dragon-spicychat-qol-large-v1";
  const RECOVERY_DB_NAME = "dragon-spicychat-qol-recovery-v1";
  const RECOVERY_STORE = "snapshots";
  const STORES = [
    ["botAvailability", "Bot Status"],
    ["botArchive", "Bot Archive"],
    ["lorebookStatus", "Lorebook Status"]
  ];
  const DISPLAY_STORES = [...STORES, ["recoverySnapshot", "Safety snapshot"]];
  const HISTORY_KEY = "dsQolStorageMeasurementsV1";
  // Small UI snapshots only. Stored locally so a Settings refresh restores results
  // without repeating a potentially expensive IndexedDB scan.
  const DISPLAY_KEY = "dsQolStorageMeasurementsDisplayV1";
  const enc = new TextEncoder();
  const ui = id => document.getElementById(id);
  const sizeOf = value => {
    try { return enc.encode(JSON.stringify(value)).byteLength; }
    catch { return 0; }
  };
  const pretty = bytes => {
    if (!Number.isFinite(bytes)) return "Unavailable";
    if (Math.abs(bytes) < 1024) return `${Math.round(bytes)} B`;
    const units = ["KiB", "MiB", "GiB"];
    let value = bytes;
    let unit = -1;
    do { value /= 1024; unit++; } while (Math.abs(value) >= 1024 && unit < units.length - 1);
    return `${value.toFixed(Math.abs(value) < 10 ? 2 : 1)} ${units[unit]}`;
  };
  const deltaText = value => `${value > 0 ? "+" : value < 0 ? "−" : ""}${pretty(Math.abs(value))}`;
  const getLocal = keys => new Promise(resolve => {
    try { chrome.storage.local.get(keys, result => resolve(chrome.runtime.lastError ? null : result)); }
    catch { resolve(null); }
  });
  const setLocal = value => new Promise(resolve => {
    try { chrome.storage.local.set(value, () => resolve(!chrome.runtime.lastError)); }
    catch { resolve(false); }
  });
  const getBytesInUse = key => new Promise(resolve => {
    try {
      if (typeof chrome.storage.local.getBytesInUse !== "function") return resolve(null);
      chrome.storage.local.getBytesInUse(key, number => resolve(chrome.runtime.lastError ? null : Number(number)));
    } catch { resolve(null); }
  });
  const getKeys = () => new Promise(resolve => {
    try {
      if (typeof chrome.storage.local.getKeys !== "function") return resolve(null);
      chrome.storage.local.getKeys(keys => resolve(chrome.runtime.lastError ? null : keys));
    } catch { resolve(null); }
  });
  const idbRequest = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
  });
  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open IndexedDB"));
    // If the store does not yet exist, never create it by accident.
    request.onupgradeneeded = () => request.transaction.abort();
    request.onblocked = () => reject(new Error("IndexedDB read was blocked"));
  });
  const empty = () => ({ records: 0, compressed: 0, uncompressed: 0, payloadBytes: 0,
    approximateRowBytes: 0, logicalBytes: 0, error: "" });
  const openRecoveryDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(RECOVERY_DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not read recovery storage"));
    // Do not create a new database just because the user clicked Measure.
    request.onupgradeneeded = () => request.transaction.abort();
    request.onblocked = () => reject(new Error("Recovery storage is busy"));
  });
  async function measureRecoverySnapshot() {
    const summary = empty();
    let db;
    try {
      // Avoid opening (or accidentally upgrading) a database that does not exist.
      const databases = typeof indexedDB.databases === "function"
        ? await indexedDB.databases().catch(() => null) : null;
      if (Array.isArray(databases)) {
        if (!databases.some(item => item?.name === RECOVERY_DB_NAME)) return summary;
      } else {
        const meta = (await getLocal(["dsRecoverySnapshotMetaV1"]))?.dsRecoverySnapshotMetaV1;
        if (meta?.storage !== "indexeddb") return summary;
      }
      db = await openRecoveryDb();
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) return summary;
      const row = await idbRequest(db.transaction(RECOVERY_STORE, "readonly")
        .objectStore(RECOVERY_STORE).get("latest"));
      if (!row) return summary;
      const compressed = row.codec === "gzip-json-v1";
      const payload = Number(row.payload?.byteLength ?? row.payload?.length ?? 0) || 0;
      summary.records = 1;
      summary.compressed = compressed ? 1 : 0;
      summary.uncompressed = compressed ? 0 : 1;
      summary.payloadBytes = payload;
      summary.logicalBytes = Number(row.originalBytes) || 0;
      summary.approximateRowBytes = payload + sizeOf({
        id: row.id, codec: row.codec, originalBytes: row.originalBytes,
        storedBytes: row.storedBytes, createdAt: row.createdAt,
        reason: row.reason, scopes: row.scopes, sha256: row.sha256
      });
      return summary;
    } catch (error) {
      // Missing database is normal until a recovery snapshot is created.
      if (/AbortError|aborted/i.test(String(error?.name || error?.message))) return summary;
      summary.error = String(error?.message || error);
      return summary;
    } finally { try { db?.close(); } catch {} }
  }

  async function scanStore(db, key, update) {
    const summary = empty();
    if (!db.objectStoreNames.contains(key)) return summary;
    let afterId = null;
    while (true) {
      const tx = db.transaction(key, "readonly");
      const store = tx.objectStore(key);
      const range = afterId == null ? undefined : IDBKeyRange.lowerBound(afterId, true);
      const rows = await idbRequest(store.getAll(range, 200));
      if (!rows.length) break;
      for (const row of rows) {
        summary.records++;
        if (row.codec === "gzip-json-v1" && row.payload != null) {
          // payload.byteLength is the exact size of the stored gzip bytes.
          const payloadBytes = Number(row.payload.byteLength ?? row.payload.length ?? 0);
          summary.compressed++;
          summary.payloadBytes += payloadBytes;
          summary.logicalBytes += Number(row.bytesBefore) || 0;
          // The extra fields are stored too; IDB's on-disk indexes/pages aren't measurable per store.
          summary.approximateRowBytes += payloadBytes + sizeOf({ id: row.id, codec: row.codec,
            bytesBefore: row.bytesBefore, summary: row.summary });
        } else if (row.value && typeof row.value === "object") {
          summary.uncompressed++;
          const jsonBytes = sizeOf(row.value);
          summary.payloadBytes += jsonBytes;
          summary.logicalBytes += jsonBytes;
          summary.approximateRowBytes += sizeOf({ id: row.id, value: row.value });
        } else {
          // Unknown formats should be visible, not represented as zero bytes.
          summary.approximateRowBytes += sizeOf(row);
        }
      }
      afterId = rows[rows.length - 1].id;
      if (typeof update === "function") update(summary.records);
      if (rows.length < 200) break;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return summary;
  }

  async function measure() {
    const result = { measuredAt: Date.now(), localBytes: null, originBytes: null,
      originQuota: null, idb: {}, payloadBytes: 0, approximateRowBytes: 0,
      logicalBytes: 0, records: 0, errors: [] };
    const dbPromise = openDb();
    const localPromise = getBytesInUse(null);
    // Origin totals include other extension-origin data, caching and IDB overhead.
    const originPromise = (async () => {
      try { return await navigator.storage?.estimate?.(); } catch { return null; }
    })();
    let db;
    try {
      db = await dbPromise;
      for (const [key, label] of STORES) {
        setStatus(`Measuring ${label} stored records...`);
        try {
          const item = await scanStore(db, key);
          result.idb[key] = item;
          result.payloadBytes += item.payloadBytes;
          result.approximateRowBytes += item.approximateRowBytes;
          result.logicalBytes += item.logicalBytes;
          result.records += item.records;
        } catch (error) {
          result.errors.push(`${label}: ${error?.message || error}`);
          result.idb[key] = { ...empty(), error: String(error?.message || error) };
        }
      }
    } catch (error) {
      result.errors.push(`IndexedDB: ${error?.message || error}`);
    } finally {
      try { db?.close(); } catch {}
    }
    const recovery = await measureRecoverySnapshot();
    result.idb.recoverySnapshot = recovery;
    result.payloadBytes += recovery.payloadBytes;
    result.approximateRowBytes += recovery.approximateRowBytes;
    result.logicalBytes += recovery.logicalBytes;
    result.records += recovery.records;
    if (recovery.error) result.errors.push(`Safety snapshot: ${recovery.error}`);
    result.localBytes = await localPromise;
    const origin = await originPromise;
    result.originBytes = Number.isFinite(origin?.usage) ? origin.usage : null;
    result.originQuota = Number.isFinite(origin?.quota) ? origin.quota : null;
    return result;
  }

  function setStatus(message) { if (ui("dsStorageMetricStatus")) ui("dsStorageMetricStatus").textContent = message; }
  let previous = null;
  let operationBefore = null;
  let busyPromise = null;
  let history = null;
  let manualBaseline = null;
  let largestKeysSnapshot = null;
  const saveDisplay = async () => {
    // A measurement never saves the actual bot data, only aggregate sizes/counts.
    return setLocal({ [DISPLAY_KEY]: {
      version: 1, latest: previous, manualBaseline, largestKeys: largestKeysSnapshot
    } });
  };
  const formatTime = timestamp => timestamp ? new Date(timestamp).toLocaleString() : "Unknown";
  const card = (title, value, note) => {
    const el = document.createElement("div");
    el.className = "control-storage-card";
    el.style.cssText = "display:flex;flex-direction:column;gap:3px;min-width:150px;flex:1";
    const strong = document.createElement("strong"); strong.textContent = title;
    const amount = document.createElement("span"); amount.textContent = value;
    const small = document.createElement("small"); small.textContent = note;
    el.append(strong, amount, small);
    return el;
  };
  function render(result) {
    const cards = ui("dsStorageMetricCards");
    const rows = ui("dsStorageMetricRows");
    if (!cards || !rows || !result) return;
    cards.replaceChildren(
      card("chrome.storage.local", pretty(result.localBytes), "Chrome-reported bytes in use"),
      card("IndexedDB payload", pretty(result.payloadBytes), "Stored gzip/raw data bytes"),
      card("IndexedDB record estimate", pretty(result.approximateRowBytes), "Payload + serialized fields; excludes DB overhead"),
      card("IndexedDB logical JSON", pretty(result.logicalBytes), "Size before gzip compression")
    );
    rows.replaceChildren();
    for (const [key, label] of DISPLAY_STORES) {
      const item = result.idb[key];
      const line = document.createElement("div");
      line.className = "control-storage-row";
      line.style.cssText = "padding:6px 0;border-bottom:1px solid var(--border-color,rgba(128,128,128,.2))";
      line.textContent = item?.error ? `${label}: ${item.error}` : item
        ? `${label}: ${item.records.toLocaleString()} records (${item.compressed.toLocaleString()} gzip) · ${pretty(item.payloadBytes)} stored payload · ~${pretty(item.approximateRowBytes)} rows · ${pretty(item.logicalBytes)} logical JSON`
        : `${label}: unavailable`;
      rows.appendChild(line);
    }
    if (Number.isFinite(result.originBytes)) {
      const note = document.createElement("p"); note.className = "hint";
      note.textContent = `Browser origin estimate: ${pretty(result.originBytes)} used${Number.isFinite(result.originQuota) ? ` of ${pretty(result.originQuota)} quota` : ""}. This is a browser estimate for the entire origin, not a sum of the per-store measurements.`;
      rows.appendChild(note);
    }
    const note = document.createElement("p"); note.className = "hint";
    note.textContent = `Measured ${formatTime(result.measuredAt)}. IndexedDB payload bytes are measured from the stored compressed or raw rows; per-store physical disk usage is not exposed by the browser. These counts do not include database page/index overhead.`;
    rows.appendChild(note);
    if (result.errors.length) {
      const error = document.createElement("p"); error.className = "hint";
      error.textContent = `Incomplete measurement: ${result.errors.join(" · ")}`;
      rows.appendChild(error);
    }
    renderComparison();
  }
  function renderComparison() {
    const host = ui("dsStorageMetricComparison");
    if (!host) return;
    host.replaceChildren();
    const item = history;
    if (!item?.before || !item?.after) {
      host.textContent = "No saved before/after measurement yet. Cleanup and snapshot deduplication will record one automatically, or use Save baseline and Compare now.";
      return;
    }
    const before = item.before, after = item.after;
    const p = document.createElement("p");
    p.textContent = `${item.label || "Storage comparison"} · ${formatTime(after.measuredAt)}`;
    const table = document.createElement("div");
    table.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
    table.append(
      card("chrome.storage.local", deltaText((after.localBytes ?? 0) - (before.localBytes ?? 0)), `${pretty(before.localBytes)} → ${pretty(after.localBytes)}`),
      card("IndexedDB payload", deltaText(after.payloadBytes - before.payloadBytes), `${pretty(before.payloadBytes)} → ${pretty(after.payloadBytes)}`),
      card("IndexedDB row estimate", deltaText(after.approximateRowBytes - before.approximateRowBytes), `${pretty(before.approximateRowBytes)} → ${pretty(after.approximateRowBytes)}`),
      card("IndexedDB record count", `${after.records - before.records > 0 ? "+" : ""}${(after.records - before.records).toLocaleString()}`, `${before.records.toLocaleString()} → ${after.records.toLocaleString()}`)
    );
    host.append(p, table);
    for (const [key, label] of DISPLAY_STORES) {
      const a = after.idb?.[key], b = before.idb?.[key];
      if (!a || !b) continue;
      const text = document.createElement("div");
      text.className = "hint";
      text.textContent = `${label}: ${deltaText(a.payloadBytes - b.payloadBytes)} stored payload · ${a.records - b.records} records`;
      host.appendChild(text);
    }
  }
  async function persistComparison(label, before, after) {
    history = { version: 1, label, before, after };
    if (!await setLocal({ [HISTORY_KEY]: history })) setStatus("Comparison is visible for this session, but could not be saved.");
    renderComparison();
  }
  async function update() {
    if (busyPromise) return busyPromise;
    busyPromise = (async () => {
      setStatus("Measuring storage...");
      const result = await measure();
      previous = result;
      render(result);
      const stored = await saveDisplay();
      setStatus(result.errors.length ? "Measurement incomplete; see details above." : stored
        ? "Storage measurement complete and saved."
        : "Storage measurement complete, but saving the display failed.");
      return result;
    })();
    try { return await busyPromise; } finally { busyPromise = null; }
  }
  async function beforeOperation(label) {
    try {
      operationBefore = { label, measured: await update() };
      return true;
    } catch (error) { setStatus(`Before-measurement unavailable: ${error?.message || error}`); return false; }
  }
  async function afterOperation(label) {
    try {
      const after = await update();
      if (operationBefore?.measured && !after.errors.length && !operationBefore.measured.errors.length) {
        await persistComparison(label || operationBefore.label, operationBefore.measured, after);
      } else setStatus("Operation finished, but one measurement was incomplete; no misleading delta was saved.");
    } catch (error) { setStatus(`After-measurement unavailable: ${error?.message || error}`); }
    finally { operationBefore = null; }
  }
  async function showLargestLocalKeys() {
    const host = ui("dsStorageLargestLocalKeys");
    if (!host) return;
    host.textContent = "Checking local storage keys...";
    const keys = await getKeys();
    if (!keys) {
      host.textContent = "Individual key names are not available from this browser. No storage values were read.";
      return;
    }
    const sizes = [];
    for (let i = 0; i < keys.length; i += 20) {
      const chunk = keys.slice(i, i + 20);
      const values = await Promise.all(chunk.map(key => getBytesInUse(key)));
      chunk.forEach((key, index) => {
        if (Number.isFinite(values[index])) sizes.push({ key, bytes: values[index] });
      });
      if (i > 0 && i % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    sizes.sort((a, b) => b.bytes - a.bytes);
    largestKeysSnapshot = {
      checkedAt: Date.now(), total: keys.length, keys: sizes.slice(0, 8)
    };
    renderLargestKeys();
    if (!await saveDisplay()) setStatus("Largest-key sizes are visible but could not be saved.");
  }
  function renderLargestKeys() {
    const host = ui("dsStorageLargestLocalKeys");
    if (!host || !largestKeysSnapshot) return;
    const snapshot = largestKeysSnapshot;
    host.replaceChildren();
    const heading = document.createElement("div");
    heading.textContent = `Largest ${snapshot.keys.length} of ${snapshot.total} local storage keys (measured ${formatTime(snapshot.checkedAt)}):`;
    host.append(heading);
    for (const item of snapshot.keys) {
      const line = document.createElement("div");
      line.textContent = `${item.key}: ${pretty(item.bytes)}`;
      host.appendChild(line);
    }
  }
  async function measureBaseline() {
    const before = await update();
    manualBaseline = before;
    const saved = await saveDisplay();
    setStatus(saved ? "Baseline saved. It will be available after Settings reloads. Click Compare now after making changes." : "Baseline is available this session but could not be saved.");
  }
  async function compareBaseline() {
    if (!manualBaseline) { setStatus("Save a baseline first."); return; }
    const before = manualBaseline;
    const after = await update();
    if (!before.errors.length && !after.errors.length) {
      await persistComparison("Manual baseline comparison", before, after);
      setStatus("Compared current storage against your saved baseline.");
    } else setStatus("One storage measurement was incomplete; no misleading comparison was saved.");
  }
  const anchor = ui("storageUsage");
  if (!anchor) return;
  const section = document.createElement("section");
  section.className = "storage-measurements";
  section.style.cssText = "margin:12px 0;padding:12px;border:1px solid var(--border-color,rgba(128,128,128,.3));border-radius:8px";
  section.innerHTML = '<h3>Storage measurements</h3>' +
    '<p class="hint">Shows chrome.storage.local separately from compressed Bot Status, Bot Archive, Lorebook and safety snapshot records in IndexedDB. Nothing is changed by measuring.</p>' +
    '<div class="button-row"><button type="button" id="dsMeasureStorage">Measure storage</button><button type="button" id="dsSaveStorageBaseline">Save baseline</button><button type="button" id="dsCompareStorageBaseline">Compare now</button><button type="button" id="dsShowLocalKeys">Largest local keys</button></div>' +
    '<p class="hint" id="dsStorageMetricStatus">Click Measure storage to read stored sizes.</p>' +
    '<div id="dsStorageMetricCards" style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0"></div>' +
    '<div id="dsStorageMetricRows"></div><div class="hint" id="dsStorageLargestLocalKeys"></div>' +
    '<h4>Before / after</h4><div class="hint" id="dsStorageMetricComparison"></div>';
  // Keep measurement UI below the existing compression/optimization explanation.
  const optimizationNote = ui("optimizeStoredDataStatus");
  if (optimizationNote?.parentNode) optimizationNote.parentNode.insertBefore(section, optimizationNote.nextSibling);
  else anchor.parentNode.appendChild(section);
  ui("dsMeasureStorage").addEventListener("click", update);
  ui("dsSaveStorageBaseline").addEventListener("click", measureBaseline);
  ui("dsCompareStorageBaseline").addEventListener("click", compareBaseline);
  ui("dsShowLocalKeys").addEventListener("click", showLargestLocalKeys);
  ui("refreshStorageUsage")?.addEventListener("click", () => { update().catch(() => {}); });
  renderComparison();
  getLocal([HISTORY_KEY, DISPLAY_KEY]).then(data => {
    if (data?.[HISTORY_KEY]) history = data[HISTORY_KEY];
    const display = data?.[DISPLAY_KEY];
    if (display && display.version === 1) {
      if (display.latest && Number.isFinite(display.latest.measuredAt)) {
        previous = display.latest;
        render(previous);
        setStatus(`Restored last measurement from ${formatTime(previous.measuredAt)}. Click Measure storage to update.`);
      }
      if (display.manualBaseline?.measuredAt) manualBaseline = display.manualBaseline;
      if (display.largestKeys?.checkedAt && Array.isArray(display.largestKeys.keys)) {
        largestKeysSnapshot = display.largestKeys;
        renderLargestKeys();
      }
    }
    renderComparison();
  }).catch(() => setStatus("Saved measurements could not be loaded. Click Measure storage to retry."));
  // No measurement runs automatically on extension startup.
  globalThis.dsQolStorageMetrics = { beforeOperation, afterOperation, refresh: update };
})();
