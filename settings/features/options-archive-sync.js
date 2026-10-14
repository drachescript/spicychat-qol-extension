// Feature-owned options helpers: archive-sync. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeArchiveUploadState(value) {
  const raw = value && typeof value === "object" ? value : {};
  const fingerprints = raw.fingerprints && typeof raw.fingerprints === "object" && !Array.isArray(raw.fingerprints)
    ? Object.fromEntries(Object.entries(raw.fingerprints).map(([id, hash]) => [String(id), String(hash || "").slice(0, 64)]).filter(([id, hash]) => BOT_ID_RE.test(id) && hash))
    : {};
  return {
    version: 1,
    lastUploadAt: Number(raw.lastUploadAt) || 0,
    lastSentCount: Math.max(0, Number(raw.lastSentCount) || 0),
    lastSnapshotCount: Math.max(0, Number(raw.lastSnapshotCount) || 0),
    lastMode: String(raw.lastMode || ""),
    lastQueueIds: Array.isArray(raw.lastQueueIds) ? raw.lastQueueIds.map(value => String(value || "").slice(0, 160)).filter(Boolean).slice(0, 50) : [],
    fingerprints
  };
}

function normalizeArchiveImportEndpoint(value) {
  const raw = String(value || DEFAULT_ARCHIVE_IMPORT_ENDPOINT).trim() || DEFAULT_ARCHIVE_IMPORT_ENDPOINT;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function archiveHealthUrl(endpoint) {
  try {
    const url = new URL(endpoint);
    url.pathname = "/health";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function archiveUploadComparable(record) {
  const snapshot = record?.snapshot && typeof record.snapshot === "object" ? record.snapshot : {};
  const status = snapshot.statusObservation && typeof snapshot.statusObservation === "object" ? snapshot.statusObservation : {};
  return {
    botId: String(record?.botId || ""),
    snapshot: {
      source: snapshot.source || "",
      profileUrl: snapshot.profileUrl || "",
      fields: snapshot.fields || {},
      coverage: snapshot.coverage || [],
      publicHistory: snapshot.publicHistory || [],
      statusObservation: {
        status: status.status || "unknown",
        httpStatus: Number(status.httpStatus || 0),
        reason: status.reason || ""
      }
    }
  };
}

function fastArchiveFingerprint(record) {
  const text = JSON.stringify(archiveUploadComparable(record));
  let a = 0x811c9dc5;
  let b = 5381;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a ^= code;
    a = Math.imul(a, 0x01000193) >>> 0;
    b = (((b << 5) + b) ^ code) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

function archiveUploadSavedCopyRecord(entry, availability) {
  const snapshot = botStatusArchiveExportRecord(entry, availability);
  const savedMs = Number(entry?.lastSavedAt) || Number(snapshot?.snapshotAt) || Number(entry?.firstSavedAt) || 0;
  return {
    botId: String(entry?.id || "").trim(),
    savedAt: savedMs ? new Date(savedMs).toISOString() : null,
    snapshot
  };
}

async function currentArchiveUploadRecords({ updateProgress = false, progressElementId = "botStatusArchiveUploadStatus" } = {}) {
  await ensureSavedListsDataLoaded();
  const archive = normalizeBotArchive(botArchiveState);
  const availability = normalizeBotAvailability(botAvailabilityState);
  const entries = Object.values(archive.meta || {})
    .filter(botStatusArchiveExportSourceAllowed)
    .sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
  const records = [];
  const fingerprints = {};
  const statusEl = $(progressElementId);
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const record = archiveUploadSavedCopyRecord(entry, availability.meta?.[entry.id]);
    records.push(record);
    fingerprints[record.botId] = fastArchiveFingerprint(record);
    if ((i + 1) % 250 === 0 || i + 1 === entries.length) {
      if (updateProgress && statusEl) statusEl.textContent = `Preparing ${i + 1} / ${entries.length} saved copies…`;
      // Fingerprinting several thousand rich saved copies can otherwise block the
      // Options page long enough to feel frozen. Yield in small batches even
      // when this is only the quiet "changed since last upload" refresh.
      await nextUiFrame();
    }
  }
  return { records, fingerprints };
}

async function gzipArchiveUploadRecords(records, exportedAt, chunk = null, extraHeader = null) {
  if (typeof CompressionStream !== "function") throw new Error("This browser does not support gzip CompressionStream.");
  const encoder = new TextEncoder();
  const gzip = new CompressionStream("gzip");
  const blobPromise = new Response(gzip.readable).blob();
  const writer = gzip.writable.getWriter();
  const header = {
    schemaVersion: 1,
    kind: "spicychat-qol-bot-status-export",
    exportedAt,
    ...(extraHeader && typeof extraHeader === "object" ? extraHeader : {}),
    ...(chunk ? { chunk } : {})
  };
  await writer.write(encoder.encode(`${JSON.stringify(header).slice(0, -1)},"savedCopies":[`));
  for (let i = 0; i < records.length; i += 1) {
    await writer.write(encoder.encode(`${i ? "," : ""}${JSON.stringify(records[i])}`));
  }
  await writer.write(encoder.encode("]}"));
  await writer.close();
  const blob = await blobPromise;
  return new Blob([blob], { type: "application/gzip" });
}

function archiveUploadFilename(exportedAt, chunkIndex = 0, chunkCount = 1) {
  const stamp = String(exportedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  const suffix = chunkCount > 1 ? `-part-${chunkIndex + 1}-of-${chunkCount}` : "";
  return `bot-status-${stamp}${suffix}.json.gz`;
}

async function postArchiveUpload(endpoint, token, blob, { exportedAt, filename }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/gzip",
      "Content-Encoding": "gzip",
      "X-Import-Filename": filename,
      "X-Exported-At": exportedAt
    },
    body: blob,
    cache: "no-store"
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok || data?.ok === false) {
    const detail = String(data?.error || data?.message || text || `HTTP ${response.status}`).slice(0, 500);
    throw new Error(`Archive Worker rejected the upload (${response.status}): ${detail}`);
  }
  return data && typeof data === "object" ? data : { ok: true, queued: true, bytes: blob.size, compressed: true };
}

async function splitArchiveUploadRecords(records, exportedAt, extraHeader = null) {
  const chunks = [];
  const pending = [];
  for (let i = 0; i < records.length; i += ARCHIVE_UPLOAD_CHUNK_SIZE) pending.push(records.slice(i, i + ARCHIVE_UPLOAD_CHUNK_SIZE));
  while (pending.length) {
    const part = pending.shift();
    const blob = await gzipArchiveUploadRecords(part, exportedAt, null, extraHeader);
    if (blob.size <= ARCHIVE_UPLOAD_SOFT_MAX_BYTES) {
      chunks.push({ records: part, blob });
      continue;
    }
    if (part.length <= 1) throw new Error(`One saved copy compresses to ${(blob.size / 1024 / 1024).toFixed(1)} MB, above the 60 MB safe upload limit.`);
    const midpoint = Math.ceil(part.length / 2);
    pending.unshift(part.slice(midpoint), part.slice(0, midpoint));
  }
  return chunks;
}

function normalizeArchiveContributionState(value) {
  const raw = value && typeof value === "object" ? value : {};
  const base = normalizeArchiveUploadState({
    lastUploadAt: raw.lastSubmissionAt,
    lastSentCount: raw.lastSentCount,
    lastSnapshotCount: raw.lastSnapshotCount,
    lastMode: raw.lastMode,
    lastQueueIds: raw.lastSubmissionIds,
    fingerprints: raw.fingerprints
  });
  return {
    version: 1,
    lastSubmissionAt: base.lastUploadAt,
    lastSentCount: base.lastSentCount,
    lastSnapshotCount: base.lastSnapshotCount,
    lastMode: base.lastMode,
    lastSubmissionIds: base.lastQueueIds,
    lastStatus: ["pending", "approved", "rejected", "queued"].includes(String(raw.lastStatus || "").toLowerCase())
      ? String(raw.lastStatus).toLowerCase()
      : (base.lastUploadAt ? "pending" : ""),
    fingerprints: base.fingerprints
  };
}

async function loadArchiveContributionConfig() {
  const stored = await storageGet([ARCHIVE_CONTRIBUTION_ENABLED_KEY, ARCHIVE_CONTRIBUTION_STATE_KEY]);
  return {
    enabled: stored[ARCHIVE_CONTRIBUTION_ENABLED_KEY] === true,
    state: normalizeArchiveContributionState(stored[ARCHIVE_CONTRIBUTION_STATE_KEY])
  };
}

async function archiveContributionInstallHash() {
  const stored = await storageGet([ARCHIVE_CONTRIBUTION_INSTALL_ID_KEY]);
  let installId = String(stored[ARCHIVE_CONTRIBUTION_INSTALL_ID_KEY] || "").trim();
  if (!installId) {
    installId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(24)), value => value.toString(16).padStart(2, "0")).join("");
    await storageSet({ [ARCHIVE_CONTRIBUTION_INSTALL_ID_KEY]: installId });
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`spicychat-archive-public-v1:${installId}`));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

async function archiveContributionHeader() {
  return {
    submission: {
      source: "spicychat-qol-extension",
      extensionVersion: String(chrome.runtime?.getManifest?.()?.version || ""),
      anonymousInstallIdHash: await archiveContributionInstallHash()
    }
  };
}

function archiveSubmissionFilename(exportedAt, chunkIndex = 0, chunkCount = 1) {
  const stamp = String(exportedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  const suffix = chunkCount > 1 ? `-part-${chunkIndex + 1}-of-${chunkCount}` : "";
  return `bot-status-submission-${stamp}${suffix}.json.gz`;
}

async function postArchiveSubmission(blob, { exportedAt, filename }) {
  const response = await fetch(DEFAULT_ARCHIVE_SUBMISSION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/gzip",
      "Content-Encoding": "gzip",
      "X-Import-Filename": filename,
      "X-Exported-At": exportedAt
    },
    body: blob,
    cache: "no-store"
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok || data?.ok === false) {
    const detail = String(data?.error || data?.message || text || `HTTP ${response.status}`).slice(0, 500);
    throw new Error(`Archive submission endpoint rejected the upload (${response.status}): ${detail}`);
  }
  return data && typeof data === "object"
    ? data
    : { ok: true, submissionId: "", status: "pending", bytes: blob.size, compressed: true };
}

async function refreshArchiveContributionUi(prepared = null) {
  const config = await loadArchiveContributionConfig();
  const toggle = $("enableBotStatusArchiveContribution");
  const actions = $("botStatusArchiveContributionActions");
  const sendChanged = $("submitBotStatusArchiveChanged");
  const sendAll = $("submitBotStatusArchiveAll");
  const summary = $("botStatusArchiveContributionSummary");
  if (toggle && document.activeElement !== toggle) toggle.checked = config.enabled;
  if (actions) actions.hidden = !config.enabled;
  if (!config.enabled) {
    if (summary) summary.textContent = "Contribution is off. Nothing is sent unless you enable it and press the submit button.";
    return;
  }

  const { records, fingerprints } = prepared || await currentArchiveUploadRecords();
  const previous = config.state.fingerprints || {};
  const changed = records.filter(record => previous[record.botId] !== fingerprints[record.botId]).length;
  const first = !config.state.lastSubmissionAt || !Object.keys(previous).length;
  if (sendChanged) {
    sendChanged.disabled = records.length === 0 || (!first && changed === 0);
    sendChanged.textContent = first
      ? "Submit saved copies for review"
      : changed
        ? `Submit new/changed copies for review (${changed})`
        : "No new/changed copies to submit";
  }
  if (sendAll) sendAll.hidden = first || !records.length;
  if (summary) {
    if (!config.state.lastSubmissionAt) {
      summary.textContent = `${records.length.toLocaleString()} saved copies are ready for the first anonymous Archive submission.`;
    } else {
      const last = new Date(config.state.lastSubmissionAt).toLocaleString();
      const ids = config.state.lastSubmissionIds.length
        ? ` · submission ${config.state.lastSubmissionIds.map(id => id.slice(0, 12)).join(", ")}`
        : "";
      const state = config.state.lastStatus || "pending";
      summary.textContent = `Last submission: ${last} · ${config.state.lastSentCount.toLocaleString()} copies · ${state}${ids} · ${changed.toLocaleString()} saved cop${changed === 1 ? "y has" : "ies have"} changed since.`;
    }
  }
}

async function refreshArchiveTransferUi() {
  const [admin, contribution] = await Promise.all([loadArchiveUploadConfig(), loadArchiveContributionConfig()]);
  const needsPrepared = (!!admin.endpoint && !!admin.token) || contribution.enabled;
  const prepared = needsPrepared ? await currentArchiveUploadRecords() : null;
  await Promise.all([
    refreshArchiveUploadUi(prepared),
    refreshArchiveContributionUi(prepared)
  ]);
}

async function setArchiveContributionEnabled(enabled) {
  await storageSet({ [ARCHIVE_CONTRIBUTION_ENABLED_KEY]: !!enabled });
  await refreshArchiveTransferUi();
}

async function sendBotStatusArchiveContribution({ forceAll = false } = {}) {
  const changedButton = $("submitBotStatusArchiveChanged");
  const allButton = $("submitBotStatusArchiveAll");
  const status = $("botStatusArchiveContributionStatus");
  if (changedButton) changedButton.disabled = true;
  if (allButton) allButton.disabled = true;
  const setStatus = text => { if (status) status.textContent = text; };
  try {
    const config = await loadArchiveContributionConfig();
    if (!config.enabled) throw new Error("Enable public Archive contribution first.");
    setStatus("Preparing saved copies…");
    const { records, fingerprints } = await currentArchiveUploadRecords({ updateProgress: true, progressElementId: "botStatusArchiveContributionStatus" });
    if (!records.length) throw new Error("No public / Bot Status saved copies are available to submit.");
    const previous = config.state.fingerprints || {};
    const firstSubmission = !config.state.lastSubmissionAt || !Object.keys(previous).length;
    const selected = forceAll || firstSubmission
      ? records
      : records.filter(record => previous[record.botId] !== fingerprints[record.botId]);
    if (!selected.length) {
      setStatus("No new or changed saved copies to submit.");
      return;
    }

    const exportedAt = new Date().toISOString();
    const extraHeader = await archiveContributionHeader();
    setStatus(`Compressing ${selected.length.toLocaleString()} saved copies…`);
    let chunks = [];
    const fullBlob = await gzipArchiveUploadRecords(selected, exportedAt, null, extraHeader);
    if (fullBlob.size <= ARCHIVE_UPLOAD_SOFT_MAX_BYTES) chunks = [{ records: selected, blob: fullBlob }];
    else {
      setStatus(`Compressed submission is ${(fullBlob.size / 1024 / 1024).toFixed(1)} MB; splitting into safe chunks…`);
      chunks = await splitArchiveUploadRecords(selected, exportedAt, extraHeader);
    }

    const submissionIds = [];
    let finalStatus = "pending";
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      let blob = chunk.blob;
      if (chunks.length > 1) blob = await gzipArchiveUploadRecords(chunk.records, exportedAt, { index: i + 1, total: chunks.length }, extraHeader);
      if (blob.size > ARCHIVE_UPLOAD_SOFT_MAX_BYTES) throw new Error(`Chunk ${i + 1} is still above the 60 MB safe submission limit.`);
      setStatus(`Submitting bundle ${i + 1} / ${chunks.length} · ${chunk.records.length.toLocaleString()} saved copies…`);
      const result = await postArchiveSubmission(blob, {
        exportedAt,
        filename: archiveSubmissionFilename(exportedAt, i, chunks.length)
      });
      const id = String(result?.submissionId || result?.id || "").trim();
      if (id) submissionIds.push(id);
      const state = String(result?.status || "pending").toLowerCase();
      if (["pending", "approved", "rejected", "queued"].includes(state)) finalStatus = state;
    }

    const currentIds = new Set(records.map(record => record.botId));
    const nextFingerprints = forceAll || firstSubmission ? {} : { ...previous };
    for (const id of Object.keys(nextFingerprints)) if (!currentIds.has(id)) delete nextFingerprints[id];
    for (const record of selected) nextFingerprints[record.botId] = fingerprints[record.botId];
    await storageSet({
      [ARCHIVE_CONTRIBUTION_STATE_KEY]: {
        version: 1,
        lastSubmissionAt: Date.now(),
        lastSentCount: selected.length,
        lastSnapshotCount: records.length,
        lastMode: forceAll || firstSubmission ? "all" : "changed",
        lastSubmissionIds: submissionIds,
        lastStatus: finalStatus || "pending",
        fingerprints: nextFingerprints
      }
    });
    setStatus(`✓ ${selected.length.toLocaleString()} saved cop${selected.length === 1 ? "y" : "ies"} submitted for Archive review${chunks.length > 1 ? ` in ${chunks.length} bundles` : ""}. ${finalStatus === "pending" ? "Pending approval." : `Status: ${finalStatus}.`}`);
    showSettingsToast(`Archive contribution submitted: ${selected.length.toLocaleString()} saved bot cop${selected.length === 1 ? "y" : "ies"}.`);
    if (finalStatus === "approved") {
      setTimeout(() => cleanupArchivedBlockedBots({ automatic: true, maxItems: 25, candidateIds: selected.map(record => record.botId) }).catch(() => {}), 250);
    }
  } catch (error) {
    console.error("SpicyChat QoL public archive submission failed", error);
    setStatus(`Archive submission failed: ${String(error?.message || error || "unknown error")}`);
  } finally {
    if (changedButton) changedButton.disabled = false;
    if (allButton) allButton.disabled = false;
    await refreshArchiveTransferUi().catch(() => {});
  }
}

async function loadArchiveUploadConfig() {
  const stored = await storageGet([ARCHIVE_IMPORT_ENDPOINT_KEY, ARCHIVE_IMPORT_TOKEN_KEY, ARCHIVE_UPLOAD_STATE_KEY]);
  return {
    endpoint: normalizeArchiveImportEndpoint(stored[ARCHIVE_IMPORT_ENDPOINT_KEY] || DEFAULT_ARCHIVE_IMPORT_ENDPOINT),
    token: String(stored[ARCHIVE_IMPORT_TOKEN_KEY] || ""),
    state: normalizeArchiveUploadState(stored[ARCHIVE_UPLOAD_STATE_KEY])
  };
}

async function saveArchiveUploadConfig({ quiet = false } = {}) {
  const endpoint = normalizeArchiveImportEndpoint(value("botStatusArchiveEndpoint", DEFAULT_ARCHIVE_IMPORT_ENDPOINT));
  const token = String(value("botStatusArchiveToken", "")).trim();
  if (!endpoint) {
    if (!quiet) showSettingsToast("Archive endpoint must be a valid HTTPS URL.");
    return false;
  }
  await storageSet({
    [ARCHIVE_IMPORT_ENDPOINT_KEY]: endpoint,
    [ARCHIVE_IMPORT_TOKEN_KEY]: token
  });
  await refreshArchiveUploadUi();
  return true;
}

async function refreshArchiveUploadUi(prepared = null) {
  const config = await loadArchiveUploadConfig();
  const endpointInput = $("botStatusArchiveEndpoint");
  const tokenInput = $("botStatusArchiveToken");
  if (endpointInput && document.activeElement !== endpointInput) endpointInput.value = config.endpoint || DEFAULT_ARCHIVE_IMPORT_ENDPOINT;
  if (tokenInput && document.activeElement !== tokenInput && !tokenInput.value) tokenInput.value = config.token || "";

  const actions = $("botStatusArchiveUploadActions");
  const sendChanged = $("sendBotStatusArchiveChanged");
  const sendAll = $("sendBotStatusArchiveAll");
  const summary = $("botStatusArchiveUploadSummary");
  const configured = !!config.endpoint && !!config.token;
  if (actions) actions.hidden = !configured;
  if (!configured) {
    if (summary) summary.textContent = "Configure the endpoint and private import token to enable archive upload. The token stays only in extension local storage and is never included in QoL backups.";
    return;
  }

  const { records, fingerprints } = prepared || await currentArchiveUploadRecords();
  const previous = config.state.fingerprints || {};
  const changed = records.filter(record => previous[record.botId] !== fingerprints[record.botId]).length;
  const first = !config.state.lastUploadAt || !Object.keys(previous).length;
  if (sendChanged) {
    sendChanged.disabled = records.length === 0 || (!first && changed === 0);
    sendChanged.textContent = first
      ? "Send saved copies to Archive"
      : changed
        ? `Send new/changed copies to Archive (${changed})`
        : "No new/changed copies to send";
  }
  if (sendAll) sendAll.hidden = first || !records.length;
  if (summary) {
    const last = config.state.lastUploadAt ? new Date(config.state.lastUploadAt).toLocaleString() : "Never";
    summary.textContent = config.state.lastUploadAt
      ? `Last archive upload: ${last} · ${config.state.lastSnapshotCount || config.state.lastSentCount} copies at that snapshot · ${changed} saved cop${changed === 1 ? "y has" : "ies have"} changed since.`
      : `${records.length} saved copies ready for the first archive upload.`;
  }
}

async function testArchiveUploadEndpoint() {
  const button = $("testBotStatusArchiveEndpoint");
  const status = $("botStatusArchiveConfigStatus");
  if (button) button.disabled = true;
  try {
    const saved = await saveArchiveUploadConfig({ quiet: true });
    if (!saved) throw new Error("Enter a valid HTTPS endpoint first.");
    const config = await loadArchiveUploadConfig();
    const health = archiveHealthUrl(config.endpoint);
    if (!health) throw new Error("Could not derive the Worker health URL.");
    if (status) status.textContent = "Testing Worker health…";
    const response = await fetch(health, { method: "GET", cache: "no-store", headers: { Accept: "application/json,text/plain" } });
    const text = await response.text();
    if (!response.ok) throw new Error(`Health endpoint returned HTTP ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`);
    if (status) status.textContent = `✓ Worker health responded HTTP ${response.status}. Token is saved locally and will be validated on the first upload.`;
  } catch (error) {
    if (status) status.textContent = `Endpoint test failed: ${String(error?.message || error || "unknown error")}`;
  } finally {
    if (button) button.disabled = false;
  }
}

async function sendBotStatusArchiveToArchive({ forceAll = false } = {}) {
  const changedButton = $("sendBotStatusArchiveChanged");
  const allButton = $("sendBotStatusArchiveAll");
  const status = $("botStatusArchiveUploadStatus");
  if (changedButton) changedButton.disabled = true;
  if (allButton) allButton.disabled = true;
  const setStatus = text => { if (status) status.textContent = text; };
  try {
    await saveArchiveUploadConfig({ quiet: true });
    const config = await loadArchiveUploadConfig();
    if (!config.endpoint || !config.token) throw new Error("Configure both the Archive endpoint and import token first.");
    setStatus("Preparing saved copies…");
    const { records, fingerprints } = await currentArchiveUploadRecords({ updateProgress: true });
    if (!records.length) throw new Error("No public / Bot Status saved copies are available to upload.");
    const previous = config.state.fingerprints || {};
    const firstUpload = !config.state.lastUploadAt || !Object.keys(previous).length;
    const selected = forceAll || firstUpload
      ? records
      : records.filter(record => previous[record.botId] !== fingerprints[record.botId]);
    if (!selected.length) {
      setStatus("No new or changed saved copies to upload.");
      return;
    }

    const exportedAt = new Date().toISOString();
    setStatus(`Compressing ${selected.length} saved copies…`);
    let chunks = [];
    const fullBlob = await gzipArchiveUploadRecords(selected, exportedAt);
    if (fullBlob.size <= ARCHIVE_UPLOAD_SOFT_MAX_BYTES) chunks = [{ records: selected, blob: fullBlob }];
    else {
      setStatus(`Compressed upload is ${(fullBlob.size / 1024 / 1024).toFixed(1)} MB; splitting into safe chunks…`);
      chunks = await splitArchiveUploadRecords(selected, exportedAt);
    }

    const queueIds = [];
    let uploadedBytes = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      let blob = chunk.blob;
      if (chunks.length > 1) blob = await gzipArchiveUploadRecords(chunk.records, exportedAt, { index: i + 1, total: chunks.length });
      if (blob.size > ARCHIVE_UPLOAD_SOFT_MAX_BYTES) throw new Error(`Chunk ${i + 1} is still above the 60 MB safe upload limit.`);
      setStatus(`Uploading bundle ${i + 1} / ${chunks.length} · ${chunk.records.length} saved copies…`);
      const result = await postArchiveUpload(config.endpoint, config.token, blob, {
        exportedAt,
        filename: archiveUploadFilename(exportedAt, i, chunks.length)
      });
      uploadedBytes += Number(result?.bytes || blob.size) || blob.size;
      if (result?.queueId) queueIds.push(String(result.queueId));
    }

    const currentIds = new Set(records.map(record => record.botId));
    const nextFingerprints = forceAll || firstUpload ? {} : { ...previous };
    for (const id of Object.keys(nextFingerprints)) if (!currentIds.has(id)) delete nextFingerprints[id];
    for (const record of selected) nextFingerprints[record.botId] = fingerprints[record.botId];
    await storageSet({
      [ARCHIVE_UPLOAD_STATE_KEY]: {
        version: 1,
        lastUploadAt: Date.now(),
        lastSentCount: selected.length,
        lastSnapshotCount: records.length,
        lastMode: forceAll || firstUpload ? "all" : "changed",
        lastQueueIds: queueIds,
        fingerprints: nextFingerprints
      }
    });
    setStatus(`✓ ${selected.length.toLocaleString()} saved cop${selected.length === 1 ? "y" : "ies"} queued for archive import${chunks.length > 1 ? ` in ${chunks.length} bundles` : ""}. They'll be processed during the next archive run.`);
    showSettingsToast(`Archive upload queued: ${selected.length.toLocaleString()} saved bot cop${selected.length === 1 ? "y" : "ies"}.`);
    setTimeout(() => cleanupArchivedBlockedBots({ automatic: true, maxItems: 25, candidateIds: selected.map(record => record.botId) }).catch(() => {}), 250);
  } catch (error) {
    console.error("SpicyChat QoL archive upload failed", error);
    setStatus(`Archive upload failed: ${String(error?.message || error || "unknown error")}`);
  } finally {
    if (changedButton) changedButton.disabled = false;
    if (allButton) allButton.disabled = false;
    await refreshArchiveUploadUi().catch(() => {});
  }
}
