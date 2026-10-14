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
