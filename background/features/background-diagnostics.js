"use strict";

// Feature-owned background helpers: diagnostics. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function qolDiagnosticLevelRank(level) {
  return String(level || "normal") === "deep" ? 2 : 1;
}

function qolDiagnosticSensitiveKey(key = "") {
  return /(authorization|cookie|token|secret|password|webhook|request.?body|response.?body|headers?|chat.?text|message.?text|prompt|ooc|persona.?description|lorebook.?content|keywords?|definition|personality|scenario|example.?dialog|greeting|description|content|raw|html)/i.test(String(key || ""));
}

function qolDiagnosticFingerprint(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function qolDiagnosticSafe(value, depth = 0, keyHint = "") {
  if (qolDiagnosticSensitiveKey(keyHint)) {
    if (typeof value === "string") return { changed: true, chars: value.length, fingerprint: `fnv1a-${qolDiagnosticFingerprint(value)}` };
    if (Array.isArray(value)) return { changed: true, count: value.length };
    if (value && typeof value === "object") return { changed: true, keys: Object.keys(value).length };
    return value == null ? value : { changed: true, kind: typeof value };
  }
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 180);
  if (depth >= 4) return undefined;
  if (Array.isArray(value)) return value.slice(0, 32).map(item => qolDiagnosticSafe(item, depth + 1, keyHint)).filter(item => item !== undefined);
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 60)) {
      const safe = qolDiagnosticSafe(item, depth + 1, key);
      if (safe !== undefined) out[String(key).slice(0, 90)] = safe;
    }
    return out;
  }
  return undefined;
}

function qolDiagnosticHasSubscribers(level = "normal") {
  const needed = qolDiagnosticLevelRank(level);
  for (const sub of qolDiagnosticSubscribers.values()) {
    if (sub?.active && qolDiagnosticLevelRank(sub.traceLevel) >= needed) return true;
  }
  return false;
}

function qolDiagnosticForwardToTab(tabId, event) {
  try {
    chrome.tabs.sendMessage(Number(tabId), { type: "DS_QOL_DIAGNOSTIC_BACKGROUND_EVENT", event }, () => {
      try { void chrome.runtime.lastError; } catch {}
    });
  } catch {}
}

function qolBackgroundTrace(type, feature = "background", meta = {}, options = {}) {
  const level = options?.level === "deep" ? "deep" : "normal";
  if (!qolDiagnosticHasSubscribers(level)) return null;
  const row = {
    seq: ++qolDiagnosticBackgroundSeq,
    ts: Date.now(),
    type: String(type || "background-event").slice(0, 80),
    feature: String(feature || "background").slice(0, 80),
    level,
    critical: !!options?.critical,
    meta: qolDiagnosticSafe(meta || {}) || {}
  };
  qolDiagnosticBackgroundBuffer.push(row);
  if (qolDiagnosticBackgroundBuffer.length > QOL_DIAG_BACKGROUND_BUFFER_MAX) qolDiagnosticBackgroundBuffer.splice(0, qolDiagnosticBackgroundBuffer.length - QOL_DIAG_BACKGROUND_BUFFER_MAX);
  const needed = qolDiagnosticLevelRank(level);
  for (const [tabId, sub] of qolDiagnosticSubscribers.entries()) {
    if (!sub?.active || qolDiagnosticLevelRank(sub.traceLevel) < needed) continue;
    qolDiagnosticForwardToTab(tabId, row);
  }
  return row;
}

function qolDiagnosticEndpoint(value) {
  try {
    const url = new URL(String(value || ""), "https://spicychat.ai");
    const path = url.pathname
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, ":id")
      .replace(/\/webhooks\/[^/]+\/[^/]+/ig, "/webhooks/:redacted");
    return `${url.origin}${path}`.slice(0, 240);
  } catch {
    return String(value || "").split(/[?#]/, 1)[0].slice(0, 240);
  }
}

function qolBackgroundNetworkStart(feature, method, url, meta = {}) {
  if (!qolDiagnosticHasSubscribers("normal")) return null;
  const token = {
    requestId: `bgnet-${(++qolDiagnosticBackgroundNetworkSeq).toString(36)}`,
    feature: String(feature || "background-network").slice(0, 80),
    method: String(method || "GET").toUpperCase().slice(0, 12),
    endpoint: qolDiagnosticEndpoint(url),
    startedAt: Date.now()
  };
  qolBackgroundTrace("network-start", token.feature, {
    requestId: token.requestId, method: token.method, endpoint: token.endpoint, ...meta
  });
  return token;
}

function qolBackgroundNetworkEnd(token, result = {}) {
  if (!token || token.ended) return;
  token.ended = true;
  qolBackgroundTrace("network-end", token.feature, {
    requestId: token.requestId,
    method: token.method,
    endpoint: token.endpoint,
    durationMs: Math.max(0, Date.now() - Number(token.startedAt || Date.now())),
    status: Number(result?.status || 0),
    ok: result?.ok === true,
    outcome: String(result?.outcome || (result?.ok ? "ok" : "failed")).slice(0, 80)
  }, { critical: result?.ok === false });
}

function qolDiagnosticSubscribe(sender, message) {
  const tabId = Number(sender?.tab?.id || 0);
  if (!tabId) return { ok: false, error: "No sender tab." };
  if (message?.active === false) {
    qolDiagnosticSubscribers.delete(tabId);
    return { ok: true, active: false, latestSeq: qolDiagnosticBackgroundSeq };
  }
  const traceLevel = String(message?.traceLevel || "normal") === "deep" ? "deep" : "normal";
  const afterSeq = Math.max(0, Number(message?.afterSeq || 0));
  qolDiagnosticSubscribers.set(tabId, {
    active: true,
    traceLevel,
    pageSessionId: String(message?.pageSessionId || "").slice(0, 120),
    subscribedAt: Date.now()
  });
  const replay = qolDiagnosticBackgroundBuffer.filter(row => Number(row.seq || 0) > afterSeq && qolDiagnosticLevelRank(row.level) <= qolDiagnosticLevelRank(traceLevel)).slice(-QOL_DIAG_BACKGROUND_BUFFER_MAX);
  for (const row of replay) qolDiagnosticForwardToTab(tabId, row);
  return { ok: true, active: true, traceLevel, replayed: replay.length, latestSeq: qolDiagnosticBackgroundSeq };
}

function grantNextBackgroundJob() {
  if (backgroundJobLease || !backgroundJobQueue.length) return;
  const next = backgroundJobQueue.shift();
  if (!next) return;
  const now = Date.now();
  const leaseId = `bgjob-${(++backgroundJobSeq).toString(36)}-${now.toString(36)}`;
  const maxHoldMs = Math.max(1000, Math.min(60000, Number(next.maxHoldMs || 30000)));
  const timer = setTimeout(() => {
    if (backgroundJobLease?.leaseId !== leaseId) return;
    backgroundJobLease = null;
    grantNextBackgroundJob();
  }, maxHoldMs);
  backgroundJobLease = {
    leaseId,
    jobType: next.jobType,
    ownerTabId: Number(next.ownerTabId || 0) || 0,
    detail: String(next.detail || "").slice(0, 120),
    grantedAt: now,
    timer
  };
  const waitMs = Math.max(0, now - next.requestedAt);
  qolBackgroundTrace("scheduler", "background-job", { action: "granted", leaseId, jobType: next.jobType, waitMs, queueDepth: backgroundJobQueue.length, ownerTabId: Number(next.ownerTabId || 0) }, { level: "deep" });
  next.resolve({ ok: true, leaseId, jobType: next.jobType, waitMs });
}

function acquireBackgroundJob(jobType, options = {}) {
  const type = String(jobType || "generic").slice(0, 50);
  return new Promise(resolve => {
    backgroundJobQueue.push({
      jobType: type,
      ownerTabId: Number(options.ownerTabId || 0) || 0,
      detail: String(options.detail || "").slice(0, 120),
      maxHoldMs: Math.max(1000, Number(options.maxHoldMs || 30000)),
      requestedAt: Date.now(),
      resolve
    });
    grantNextBackgroundJob();
  });
}

function releaseBackgroundJob(leaseId) {
  const id = String(leaseId || "");
  if (!id || backgroundJobLease?.leaseId !== id) return false;
  clearTimeout(backgroundJobLease.timer);
  backgroundJobLease = null;
  grantNextBackgroundJob();
  return true;
}

async function withBackgroundJob(jobType, options, callback) {
  const requestedAt = Date.now();
  const lease = await acquireBackgroundJob(jobType, options);
  const startedAt = Date.now();
  qolBackgroundTrace("operation-start", String(jobType || "background-job"), { operationId: lease?.leaseId || "", operation: "background-job", leaseId: lease?.leaseId || "", waitMs: Number(lease?.waitMs || 0), ownerTabId: Number(options?.ownerTabId || 0), detail: String(options?.detail || "").slice(0, 120) });
  try {
    const result = await callback(lease);
    qolBackgroundTrace("operation-end", String(jobType || "background-job"), { operationId: lease?.leaseId || "", operation: "background-job", leaseId: lease?.leaseId || "", outcome: "ok", durationMs: Date.now() - startedAt, totalMs: Date.now() - requestedAt });
    return result;
  } catch (error) {
    qolBackgroundTrace("error", String(jobType || "background-job"), { operationId: lease?.leaseId || "", operation: "background-job", leaseId: lease?.leaseId || "", class: String(error?.name || "Error"), message: String(error?.message || error || "").slice(0, 180), durationMs: Date.now() - startedAt }, { critical: true });
    throw error;
  } finally {
    releaseBackgroundJob(lease?.leaseId);
  }
}


"use strict";
// Support history is stored separately in IndexedDB. Each new snapshot is a
// small write, rather than rewriting a large chrome.storage.local value on
// every sample. Existing V1 history is migrated atomically and never discarded.
const DSQ_SUPPORT_HISTORY_KEY = "dsSupportHistoryV1"; // migration only
const DSQ_SUPPORT_DB_NAME = "SpicyChatQoLSupportHistory";
const DSQ_SUPPORT_BATCH_SIZE = 256;
const DSQ_SUPPORT_METRICS = [
  "mutations", "observerBatches", "qolOnlyMutations", "composerOnlyMutationSkips",
  "runtimeKernelRuns", "messageLaneRuns", "messageLaneScheduleRequests",
  "messageCacheHits", "messageCacheMisses", "messageCacheInvalidations",
  "quickPanelUpdateCoalesced", "typingDeferrals", "hiddenSkips",
  "longTasks", "maxLongTaskMs", "blockedBotMutationSkips",
  "routeFeatureStepSkips", "disabledFeatureStepSkips"
];
let dsqSupportHistoryQueue = Promise.resolve();
let dsqSupportDbPromise = null;
const dsqSupportRecentTabs = new Map();
function dsqSupportSerial(task) {
  const result = dsqSupportHistoryQueue.then(task, task);
  dsqSupportHistoryQueue = result.catch(() => {});
  return result;
}
function dsqSupportEmptyMeta() { return { key: "state", schema: 2, next: 1, count: 0, pending: 0, dropped: 0, segments: 0 }; }
function dsqSupportOpen() {
  if (!dsqSupportDbPromise) dsqSupportDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DSQ_SUPPORT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("rows")) db.createObjectStore("rows", { keyPath: "seq" });
      if (!db.objectStoreNames.contains("segments")) db.createObjectStore("segments", { keyPath: "from" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); dsqSupportDbPromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("Could not open saved support history"));
    request.onblocked = () => reject(new Error("Support history database is blocked by another tab"));
  }).catch(error => { dsqSupportDbPromise = null; throw error; });
  return dsqSupportDbPromise;
}
function dsqSupportTransaction(db, stores, mode, apply) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let value;
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error || new Error("Support history write failed"));
    tx.onabort = () => reject(tx.error || new Error("Support history write was cancelled"));
    try { value = apply(tx); } catch (error) { try { tx.abort(); } catch {} reject(error); }
  });
}
function dsqSupportRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Support history read failed"));
  });
}
async function dsqSupportMeta(db) {
  const tx = db.transaction("meta", "readonly");
  return (await dsqSupportRequest(tx.objectStore("meta").get("state"))) || null;
}
async function dsqSupportDb() {
  const db = await dsqSupportOpen();
  if (await dsqSupportMeta(db)) return db;
  // A failed migration leaves the original chrome.storage.local record intact.
  const legacy = (await chrome.storage.local.get(DSQ_SUPPORT_HISTORY_KEY))?.[DSQ_SUPPORT_HISTORY_KEY];
  const valid = legacy?.schema === 1 && Array.isArray(legacy.rows) && Array.isArray(legacy.chunks);
  if (legacy != null && !valid) throw new Error("Older support history has an unknown format. Original data was kept.");
  const oldRows = valid ? legacy.rows : [];
  const oldSegments = valid ? legacy.chunks : [];
  // An invalid row must block migration, not be filtered out and lost.
  if (oldRows.some(row => !Number.isSafeInteger(row?.seq) || row.seq < 1) ||
      oldSegments.some(chunk => !Number.isSafeInteger(chunk?.from) || !Number.isSafeInteger(chunk?.through) ||
        chunk.through < chunk.from || !Number.isSafeInteger(chunk?.count) || chunk.count < 1 ||
        typeof chunk?.gzip !== "string")) {
    throw new Error("Older support history contains an invalid record. Original data was kept.");
  }
  const state = dsqSupportEmptyMeta();
  state.next = valid ? Math.max(1, Number(legacy.next) || 1) : 1;
  state.pending = oldRows.length;
  state.segments = oldSegments.length;
  state.count = oldRows.length + oldSegments.reduce((n, chunk) => n + Math.max(0, Number(chunk.count) || 0), 0);
  state.dropped = valid ? Math.max(0, Number(legacy.dropped) || 0) : 0;
  await dsqSupportTransaction(db, ["meta", "rows", "segments"], "readwrite", tx => {
    for (const row of oldRows) tx.objectStore("rows").put(row);
    for (const chunk of oldSegments) tx.objectStore("segments").put(chunk);
    tx.objectStore("meta").put(state);
  });
  // Only remove legacy storage AFTER the complete IndexedDB transaction.
  if (valid) {
    try { await chrome.storage.local.remove(DSQ_SUPPORT_HISTORY_KEY); } catch {}
  }
  return db;
}
async function dsqSupportGzip(text) {
  if (typeof CompressionStream !== "function") return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function dsqSupportUngzip(value) {
  if (typeof DecompressionStream !== "function") throw new Error("This browser cannot read compressed support history");
  let bytes = value;
  if (typeof value === "string") {
    const raw = atob(value);
    bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  }
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
async function dsqSupportCompact(db, state) {
  if (state.pending < DSQ_SUPPORT_BATCH_SIZE) return;
  if (typeof CompressionStream !== "function") return; // keep originals; never discard samples
  const rows = [];
  await new Promise((resolve, reject) => {
    const tx = db.transaction("rows", "readonly");
    const cursor = tx.objectStore("rows").openCursor();
    cursor.onerror = () => reject(cursor.error);
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item || rows.length >= DSQ_SUPPORT_BATCH_SIZE) return resolve();
      rows.push(item.value);
      item.continue();
    };
    tx.onabort = () => reject(tx.error);
  });
  if (rows.length < DSQ_SUPPORT_BATCH_SIZE) return;
  const gzip = await dsqSupportGzip(JSON.stringify(rows));
  if (!gzip?.length) return;
  const updated = { ...state, pending: Math.max(0, state.pending - rows.length), segments: state.segments + 1 };
  await dsqSupportTransaction(db, ["meta", "rows", "segments"], "readwrite", tx => {
    tx.objectStore("segments").put({ from: rows[0].seq, through: rows[rows.length - 1].seq, count: rows.length, gzip });
    for (const row of rows) tx.objectStore("rows").delete(row.seq);
    tx.objectStore("meta").put(updated);
  });
}
function dsqSupportSafeRow(value) {
  const metrics = {};
  for (const name of DSQ_SUPPORT_METRICS) {
    const number = Number(value?.metrics?.[name]);
    if (Number.isFinite(number) && number >= 0) metrics[name] = Math.min(1e12, Math.round(number * 10) / 10);
  }
  const type = String(value?.page || "other");
  const page = ["chat", "chats", "listing", "editor", "lorebook", "other"].includes(type) ? type : "other";
  const version = String(value?.version || "unknown").replace(/[^0-9A-Za-z._-]/g, "").slice(0, 24);
  const levels = {};
  for (const key of ["warn", "error"]) levels[key] = Math.max(0, Math.min(10000, Number(value?.levels?.[key]) || 0));
  return { at: Date.now(), page, version, metrics, levels };
}
async function dsqSupportAppend(value, sender) {
  const url = String(sender?.url || sender?.tab?.url || "");
  if (!sender?.tab?.id || !/^https:\/\/(?:www\.)?spicychat\.ai\//i.test(url)) return { ok: false, error: "Not a SpicyChat tab." };
  const tabId = sender.tab.id;
  if (Date.now() - Number(dsqSupportRecentTabs.get(tabId) || 0) < 45000) return { ok: true, skipped: true };
  const db = await dsqSupportDb();
  const state = await dsqSupportMeta(db);
  const row = dsqSupportSafeRow(value);
  row.seq = state.next;
  const updated = { ...state, next: row.seq + 1, count: state.count + 1, pending: state.pending + 1 };
  await dsqSupportTransaction(db, ["rows", "meta"], "readwrite", tx => {
    tx.objectStore("rows").put(row);
    tx.objectStore("meta").put(updated);
  });
  dsqSupportRecentTabs.set(tabId, Date.now());
  // Compaction failure never deletes the original row; later checks can retry.
  try { await dsqSupportCompact(db, updated); } catch {}
  return { ok: true, stored: true };
}
async function dsqSupportStoredRows(db) {
  const tx = db.transaction(["rows", "segments"], "readonly");
  const [rows, segments] = await Promise.all([
    dsqSupportRequest(tx.objectStore("rows").getAll()),
    dsqSupportRequest(tx.objectStore("segments").getAll())
  ]);
  return { rows, segments };
}
async function dsqSupportExport(options = {}) {
  const db = await dsqSupportDb();
  const state = await dsqSupportMeta(db);
  if (options?.summaryOnly) return { ok: true, count: state.count, dropped: state.dropped, through: state.next - 1,
    storedIn: "IndexedDB", compressedBatches: state.segments };
  const stored = await dsqSupportStoredRows(db);
  const rows = [...stored.rows];
  for (const chunk of stored.segments) {
    let data;
    try { data = JSON.parse(await dsqSupportUngzip(chunk.gzip)); }
    catch { return { ok: false, error: "Some saved checks could not be read. No history was removed." }; }
    if (!Array.isArray(data) || data.length !== Number(chunk.count)) {
      return { ok: false, error: "A saved history batch is incomplete. No history was removed." };
    }
    rows.push(...data);
  }
  rows.sort((a, b) => Number(a.seq) - Number(b.seq));
  if (rows.length !== Number(state.count)) {
    return { ok: false, error: "Support history changed while reading. Please try again; no history was removed." };
  }
  const lines = [
    `History: ${rows.length} saved checks across extension updates; ${Number(state.dropped || 0)} older checks already removed by the previous storage limit.`,
    "New checks are kept separately in IndexedDB and older ones are compressed. History is kept until you export and clear it or explicitly clear it.",
    "Only version, page type, numeric performance counters and warning/error counts are stored. No chat text, prompts, tokens or account IDs."
  ];
  for (const row of rows) {
    const metrics = Object.entries(row.metrics || {}).map(([key, item]) => `${key}=${item}`).join("; ");
    lines.push(`${new Date(row.at).toISOString()} | v${row.version} | ${row.page} | warnings=${row.levels?.warn || 0}; errors=${row.levels?.error || 0}${metrics ? ` | ${metrics}` : ""}`);
  }
  return { ok: true, text: lines.join("\n"), count: rows.length, dropped: state.dropped || 0, through: state.next - 1 };
}
async function dsqSupportClear(through = null) {
  const db = await dsqSupportDb();
  const state = await dsqSupportMeta(db);
  if (through == null) {
    const reset = { ...dsqSupportEmptyMeta(), next: state.next };
    await dsqSupportTransaction(db, ["rows", "segments", "meta"], "readwrite", tx => {
      tx.objectStore("rows").clear();
      tx.objectStore("segments").clear();
      tx.objectStore("meta").put(reset);
    });
    dsqSupportRecentTabs.clear();
    return { ok: true, cleared: state.count };
  }
  const target = Number(through);
  if (!Number.isSafeInteger(target) || target < 0) return { ok: false, error: "Invalid support history checkpoint." };
  const { rows, segments } = await dsqSupportStoredRows(db);
  let removed = rows.filter(row => Number(row.seq) <= target).length;
  const crossing = [];
  for (const chunk of segments) {
    if (Number(chunk.through) <= target) { removed += Number(chunk.count) || 0; continue; }
    if (Number(chunk.from) > target) continue;
    let data;
    try { data = JSON.parse(await dsqSupportUngzip(chunk.gzip)); }
    catch { return { ok: false, error: "Cannot safely split saved checks. No history was cleared." }; }
    if (!Array.isArray(data) || data.length !== Number(chunk.count))
      return { ok: false, error: "Saved checks were incomplete. No history was cleared." };
    const newer = data.filter(row => Number(row.seq) > target);
    const gzip = newer.length ? await dsqSupportGzip(JSON.stringify(newer)).catch(() => null) : null;
    if (newer.length && !gzip) return { ok: false, error: "Cannot safely save newer checks. No history was cleared." };
    removed += data.length - newer.length;
    crossing.push({ old: chunk.from, newer, gzip });
  }
  const updated = { ...state,
    count: Math.max(0, state.count - removed),
    pending: rows.filter(row => Number(row.seq) > target).length,
    segments: segments.filter(chunk => Number(chunk.from) > target).length + crossing.filter(x => x.newer.length).length,
    dropped: 0 // past-limit removals were disclosed in the exported report
  };
  await dsqSupportTransaction(db, ["rows", "segments", "meta"], "readwrite", tx => {
    const rowStore = tx.objectStore("rows"), segmentsStore = tx.objectStore("segments");
    for (const row of rows) if (Number(row.seq) <= target) rowStore.delete(row.seq);
    for (const chunk of segments) if (Number(chunk.through) <= target) segmentsStore.delete(chunk.from);
    for (const item of crossing) {
      segmentsStore.delete(item.old);
      if (item.newer.length) segmentsStore.put({
        from: item.newer[0].seq, through: item.newer[item.newer.length - 1].seq,
        count: item.newer.length, gzip: item.gzip
      });
    }
    tx.objectStore("meta").put(updated);
  });
  return { ok: true, cleared: removed, remaining: updated.count };
}
function dsqSupportHistoryRequest(message, sender, sendResponse) {
  const action = String(message?.type || "");
  // Browsers may omit sender.url for a same-extension Settings request.
  // Never let a web/content-script tab read or clear this private history.
  const senderUrl = String(sender?.url || sender?.documentUrl || "");
  const sameExtension = sender?.id === chrome.runtime.id;
  const optionsSource = senderUrl
    ? senderUrl.split(/[?#]/, 1)[0] === chrome.runtime.getURL("options.html")
    : sameExtension; // Only a verified no-tab extension sender may omit its URL.
  const isOptions = !sender?.tab && sameExtension && optionsSource;
  if (action !== "DS_SUPPORT_HISTORY_APPEND" && !isOptions) {
    sendResponse({ ok: false, error: "Support history is available only from QoL Settings." }); return false;
  }
  const task = action === "DS_SUPPORT_HISTORY_APPEND" ? () => dsqSupportAppend(message.row, sender)
    : action === "DS_SUPPORT_HISTORY_GET" ? () => dsqSupportExport(message)
    : action === "DS_SUPPORT_HISTORY_CLEAR" ? () => dsqSupportClear(message.through)
    : null;
  if (!task) return false;
  dsqSupportSerial(task).then(sendResponse, error => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
}
