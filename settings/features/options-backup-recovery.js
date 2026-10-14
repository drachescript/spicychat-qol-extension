// Feature-owned options helpers: backup-recovery. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function openRecoverySnapshotDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is unavailable."));
    const request = indexedDB.open(RECOVERY_SNAPSHOT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECOVERY_SNAPSHOT_DB_STORE)) {
        db.createObjectStore(RECOVERY_SNAPSHOT_DB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open recovery storage."));
    request.onblocked = () => reject(new Error("Recovery storage is busy in another tab."));
  });
}

async function recoverySnapshotDbOperation(mode, operation) {
  const db = await openRecoverySnapshotDb();
  try {
    return await new Promise((resolve, reject) => {
      let transaction;
      try { transaction = db.transaction(RECOVERY_SNAPSHOT_DB_STORE, mode); }
      catch (error) { reject(error); return; }
      const store = transaction.objectStore(RECOVERY_SNAPSHOT_DB_STORE);
      let request;
      try { request = operation(store); }
      catch (error) { try { transaction.abort(); } catch {} reject(error); return; }
      let value;
      request.onsuccess = () => { value = request.result; };
      request.onerror = () => { /* transaction abort handles the failure */ };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error || request.error || new Error("Recovery storage transaction was aborted."));
      transaction.onerror = () => { /* transaction abort handles the failure */ };
    });
  } finally { db.close(); }
}

function getCompressedRecoverySnapshotRow() {
  return recoverySnapshotDbOperation("readonly", store => store.get(RECOVERY_SNAPSHOT_DB_ID));
}

function putCompressedRecoverySnapshotRow(row) {
  return recoverySnapshotDbOperation("readwrite", store => store.put(row));
}

function deleteCompressedRecoverySnapshotRow() {
  return recoverySnapshotDbOperation("readwrite", store => store.delete(RECOVERY_SNAPSHOT_DB_ID));
}

async function recoverySnapshotChecksum(bytes) {
  if (!crypto?.subtle) throw new Error("Secure recovery verification is unavailable.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, "0")).join("");
}

function recoverySnapshotRowMeta(row) {
  if (!row || row.codec !== "gzip-json-v1") return null;
  return {
    version: 2, createdAt: Number(row.createdAt) || 0,
    reason: String(row.reason || "manual"),
    extensionVersion: String(row.extensionVersion || ""),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    codec: "gzip-json-v1", storage: "indexeddb",
    storedBytes: Number(row.storedBytes) || 0,
    originalBytes: Number(row.originalBytes) || 0
  };
}

async function readCompressedRecoverySnapshot(row) {
  if (!row || row.codec !== "gzip-json-v1") throw new Error("Unsupported recovery snapshot format.");
  const bytes = row.payload instanceof Uint8Array ? row.payload : new Uint8Array(row.payload || []);
  if (!bytes.byteLength || bytes.byteLength > RECOVERY_SNAPSHOT_MAX_GZIP_BYTES ||
      bytes.byteLength !== Number(row.storedBytes)) throw new Error("Recovery snapshot failed the size integrity check.");
  if (await recoverySnapshotChecksum(bytes) !== row.sha256) throw new Error("Recovery snapshot failed the checksum verification.");
  if (typeof DecompressionStream !== "function") throw new Error("This browser cannot decompress the saved recovery snapshot.");
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks = [];
  let decodedBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      decodedBytes += value.byteLength;
      if (decodedBytes > RECOVERY_SNAPSHOT_MAX_JSON_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error("Recovery snapshot exceeded the decoded-size safety limit.");
      }
      chunks.push(value);
    }
  } finally { try { reader.releaseLock(); } catch {} }
  if (!decodedBytes || decodedBytes !== Number(row.originalBytes)) {
    throw new Error("Recovery snapshot failed the decoded-size check.");
  }
  const snapshot = normalizeRecoverySnapshot(JSON.parse(await new Blob(chunks).text()));
  if (!snapshot) throw new Error("Recovery snapshot does not contain a valid QoL backup.");
  return snapshot;
}

function normalizeRecoverySnapshot(value) {
  const raw = value && typeof value === "object" ? value : {};
  if (!raw.backup || typeof raw.backup !== "object" || Array.isArray(raw.backup)) return null;
  return {
    createdAt: Number(raw.createdAt) || 0,
    reason: String(raw.reason || "manual"),
    extensionVersion: String(raw.extensionVersion || ""),
    scopes: Array.isArray(raw.scopes) ? raw.scopes.map(String) : [],
    backup: raw.backup
  };
}

function recoverySnapshotMetaFromSnapshot(snapshot) {
  const normalized = normalizeRecoverySnapshot(snapshot);
  if (!normalized) return null;
  return {
    version: 1,
    createdAt: normalized.createdAt,
    reason: normalized.reason,
    extensionVersion: normalized.extensionVersion,
    scopes: [...normalized.scopes]
  };
}

function normalizeRecoverySnapshotMeta(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const createdAt = Number(raw.createdAt) || 0;
  if (!createdAt && !raw.reason && !Array.isArray(raw.scopes)) return null;
  return {
    version: Number(raw.version) || 1,
    createdAt,
    reason: String(raw.reason || "recovery snapshot"),
    extensionVersion: String(raw.extensionVersion || ""),
    scopes: Array.isArray(raw.scopes) ? raw.scopes.map(String) : [],
    legacy: !!raw.legacy,
    bytes: Math.max(0, Number(raw.bytes) || 0),
    codec: String(raw.codec || ""),
    storage: String(raw.storage || ""),
    storedBytes: Math.max(0, Number(raw.storedBytes) || 0),
    originalBytes: Math.max(0, Number(raw.originalBytes) || 0)
  };
}

async function readRecoverySnapshotMeta() {
  const result = await storageGet([RECOVERY_SNAPSHOT_META_KEY]);
  const meta = normalizeRecoverySnapshotMeta(result[RECOVERY_SNAPSHOT_META_KEY]);
  if (meta) return meta;

  // Quick metadata is absent on older installations; check the one-record
  // compressed store before checking for a legacy chrome.storage.local copy.
  try {
    const row = await getCompressedRecoverySnapshotRow();
    const summary = recoverySnapshotRowMeta(row);
    if (summary) return summary;
  } catch { /* legacy snapshot may still exist */ }
  // Legacy snapshots may be enormous: check bytes without deserializing them.
  const bytes = Number(await storageBytesInUse(RECOVERY_SNAPSHOT_KEY));
  if (Number.isFinite(bytes) && bytes > 0) {
    return { version: 1, createdAt: 0, reason: "legacy recovery snapshot", extensionVersion: "", scopes: [], legacy: true, bytes };
  }
  return null;
}

async function refreshRecoverySnapshotStatus() {
  const host = $("recoverySnapshotStatus");
  if (!host) return;
  const meta = await readRecoverySnapshotMeta();
  if (!meta) {
    host.textContent = "No local recovery snapshot saved yet.";
    return;
  }
  if (meta.legacy && !meta.createdAt) {
    host.textContent = `Recovery snapshot available${meta.bytes ? ` · ${formatControlBytes(meta.bytes)}` : ""}. Details load only when you choose Load last snapshot, so Settings does not deserialize the full backup at startup.`;
    return;
  }
  const when = meta.createdAt ? new Date(meta.createdAt).toLocaleString() : "unknown time";
  const mediaNote = meta.scopes.includes("localMedia")
    ? " Local media was included because that category was part of the protected action."
    : " Local media bytes are not included.";
  const sizeNote = meta.storage === "indexeddb"
    ? ` Compressed IndexedDB copy: ${formatControlBytes(meta.storedBytes)} (from ${formatControlBytes(meta.originalBytes)} JSON; hard limit 24 MiB).`
    : " Legacy local snapshot (not compressed).";
  host.textContent = `Last snapshot: ${when} · ${meta.reason}.${sizeNote}${mediaNote} API keys/webhook URLs are never copied.`;
}

function hideImportRecoveryActions() {
  const actions = $("importRecoveryActions");
  if (actions) actions.hidden = true;
  if ($("importRecoveryMessage")) $("importRecoveryMessage").textContent = "";
}

function showImportRecoveryActions(message) {
  const actions = $("importRecoveryActions");
  if (actions) actions.hidden = false;
  if ($("importRecoveryMessage")) $("importRecoveryMessage").textContent = String(message || "Import stopped safely before changing anything.");
}

async function createRecoverySnapshot(reason = "manual", sourceData = null, scopes = null) {
  const result = sourceData || await readBackupSourceData();
  const requestedScopes = scopes instanceof Set ? scopes : new Set(scopes || []);
  const selectedScopes = requestedScopes.size
    ? new Set([...requestedScopes].filter(scope => BACKUP_SCOPE_IDS.includes(scope)))
    : new Set(LIGHTWEIGHT_BACKUP_SCOPE_IDS);
  if (!selectedScopes.size) throw new Error("No recovery data was selected");

  const snapshot = {
    createdAt: Date.now(),
    reason: String(reason || "manual"),
    extensionVersion: chrome.runtime.getManifest()?.version || "",
    scopes: [...selectedScopes],
    backup: buildExportPayload(selectedScopes, result)
  };
  try {
    if (typeof CompressionStream !== "function") {
      throw new Error("This browser cannot create compressed recovery snapshots. Download a full backup before changing local data.");
    }
    const json = JSON.stringify(snapshot);
    // Do not save huge accidental imports into browser-local recovery storage.
    // A hard limit also bounds the amount we later decompress into memory.
    const rawBytes = new Blob([json]).size;
    if (rawBytes > RECOVERY_SNAPSHOT_MAX_JSON_BYTES) {
      throw new Error("Recovery data exceeds 160 MiB. No changes were made; export a full .json.gz backup instead.");
    }
    const gzip = await gzipBackupText(json);
    if (!gzip.size || gzip.size > RECOVERY_SNAPSHOT_MAX_GZIP_BYTES) {
      throw new Error(`Compressed recovery exceeds the 24 MiB safety limit (${(gzip.size / 1048576).toFixed(1)} MiB). No changes were made; download a backup before proceeding.`);
    }
    const bytes = new Uint8Array(await gzip.arrayBuffer());
    const row = {
      id: RECOVERY_SNAPSHOT_DB_ID, codec: "gzip-json-v1",
      createdAt: snapshot.createdAt, reason: snapshot.reason,
      extensionVersion: snapshot.extensionVersion, scopes: snapshot.scopes,
      originalBytes: rawBytes, storedBytes: bytes.byteLength,
      sha256: await recoverySnapshotChecksum(bytes), payload: bytes
    };
    await putCompressedRecoverySnapshotRow(row);
    // Read-back verification before allowing any destructive action.
    const stored = await getCompressedRecoverySnapshotRow();
    if (!stored || stored.storedBytes !== row.storedBytes || stored.sha256 !== row.sha256 ||
        await recoverySnapshotChecksum(stored.payload) !== row.sha256) {
      throw new Error("Recovery snapshot could not be verified after saving.");
    }
    // Do not retain an old gigantic uncompressed snapshot alongside the verified copy.
    // Failure to delete the legacy copy is non-destructive; it can still be cleared manually.
    if (!await storageRemove([RECOVERY_SNAPSHOT_KEY])) {
      throw new Error("Could not remove the old uncompressed safety copy. No protected changes were made.");
    }
    if (!await storageSetVerified({ [RECOVERY_SNAPSHOT_META_KEY]: recoverySnapshotRowMeta(row) })) {
      throw new Error("Recovery snapshot metadata could not be verified.");
    }
    await refreshRecoverySnapshotStatus();
    return recoverySnapshotRowMeta(row);
  } catch (error) {
    if (!error.code) error.code = "RECOVERY_SNAPSHOT_FAILED";
    throw error;
  }
}

async function createManualRecoverySnapshot() {
  try {
    await createRecoverySnapshot("manual snapshot");
    showSettingsToast("Local recovery snapshot saved.");
  } catch (error) {
    showSettingsToast(`Recovery snapshot not saved: ${error?.message || "storage error"}`);
  }
}

async function loadRecoverySnapshotIntoImport() {
  let snapshot = null;
  try {
    const compressed = await getCompressedRecoverySnapshotRow();
    if (compressed) snapshot = await readCompressedRecoverySnapshot(compressed);
    else {
      // Backward compatibility: older recovery snapshots remain readable.
      const result = await storageGet([RECOVERY_SNAPSHOT_KEY]);
      snapshot = normalizeRecoverySnapshot(result[RECOVERY_SNAPSHOT_KEY]);
    }
  } catch (error) {
    showSettingsToast(`Recovery snapshot could not be opened: ${error?.message || error}`);
    return;
  }
  if (!snapshot) { showSettingsToast("No recovery snapshot is available."); return; }
  const meta = recoverySnapshotMetaFromSnapshot(snapshot);
  if (meta) await storageSet({ [RECOVERY_SNAPSHOT_META_KEY]: {
    ...meta, ...(await readRecoverySnapshotMeta())
  } });
  const box = $("settingsJson");
  if (box) box.value = JSON.stringify(snapshot.backup, null, 2);
  pendingImportPayload = null;
  cancelImportPreview();
  previewImportSettings();
  const replace = document.querySelector('input[name="importMode"][value="replace"]');
  if (replace) { replace.checked = true; refreshImportPreviewImpact(); }
  $("importPreview")?.scrollIntoView({ behavior: "smooth", block: "center" });
  showSettingsToast("Recovery snapshot loaded into the normal import preview. Nothing has been restored yet.");
}

async function clearRecoverySnapshot() {
  if (!confirm("Clear the saved local recovery snapshot? This does not change your current QoL data.")) return;
  let removed = false;
  try {
    await deleteCompressedRecoverySnapshotRow();
    const legacyCleared = await storageRemoveVerified([RECOVERY_SNAPSHOT_KEY]);
    const metadataCleared = legacyCleared && await storageRemoveVerified([RECOVERY_SNAPSHOT_META_KEY]);
    const remaining = await getCompressedRecoverySnapshotRow();
    removed = !!metadataCleared && !remaining;
  } catch { removed = false; }
  await refreshRecoverySnapshotStatus();
  showSettingsToast(removed ? "Recovery snapshot cleared." : "Recovery snapshot could not be fully cleared or verified.");
}
