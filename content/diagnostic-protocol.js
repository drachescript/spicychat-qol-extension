(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || DS.__diagnosticProtocolInstalled) return;
  DS.__diagnosticProtocolInstalled = true;

  const PROTOCOL = "dragon-spicychat-qol-diagnostics-v1";
  const SOURCE = "dragons-spicychat-qol";
  // Compatibility source intentionally starts with `spicychat-qol` because
  // older Inspector builds discovered QoL telemetry through that prefix.
  const COMPAT_SOURCE = "spicychat-qol-diagnostics";
  const INSPECTOR_SOURCE = "dragons-spicychat-diagnostic-extension";
  const REQUEST_EVENT = "dragons-spicychat-diagnostic-extension:request";
  const RESPONSE_EVENT = "dragons-spicychat-qol:diagnostic";
  const METRICS_INTERVAL_MS = 15000;
  const PRESENCE_INTERVAL_MS = 60000;
  const ACTIVE_TTL_MS = 30 * 60 * 1000;

  const sessionId = (() => {
    try { return crypto.randomUUID(); } catch {}
    return `dsq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  })();

  const state = {
    inspectorActiveUntil: 0,
    lastKnownVersion: "",
    lastKnownTechnicalVersion: "",
    inspectorVersion: "",
    inspectorSessionId: "",
    metricsTimer: null,
    presenceTimer: null,
    operationSeq: 0,
    networkSeq: 0,
    operationsStarted: 0,
    operationsEnded: 0,
    networkStarted: 0,
    networkEnded: 0,
    lastHandshakeAt: 0,
    lastMetricsAt: 0,
    activeOperations: new Map(),
    ownershipObserver: null,
    ownershipMarked: 0,
    ownershipNoopSkips: 0
  };

  function manifestInfo() {
    try {
      const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime || null;
      const manifest = runtime?.getManifest?.() || {};
      const version = String(manifest.version_name || manifest.version || "").trim();
      const technicalVersion = String(manifest.version || "").trim();
      if (version && version !== "unknown") state.lastKnownVersion = version;
      if (technicalVersion && technicalVersion !== "unknown") state.lastKnownTechnicalVersion = technicalVersion;
    } catch {}
    return {
      version: state.lastKnownVersion || "unknown",
      technicalVersion: state.lastKnownTechnicalVersion || "unknown"
    };
  }

  function browserName() {
    const ua = String(navigator.userAgent || "");
    if (/OPR\//i.test(ua)) return "Opera";
    if (/Firefox\//i.test(ua)) return "Firefox";
    if (/Edg\//i.test(ua)) return "Edge";
    if (/Brave/i.test(ua) || navigator.brave) return "Brave/Chromium";
    if (/Chrome\//i.test(ua)) return "Chrome/Chromium";
    return "Unknown";
  }

  function pageState() {
    const page = DS.getPageState?.() || {};
    const plan = DS.getRuntimePlan?.(page) || null;
    const build = DS.getBuildProfile?.() || window.__DSQ_BUILD_PROFILE__ || {};
    const groups = DS.RUNTIME_BUNDLE_GROUPS || {};
    const activeBundles = [];
    if (plan) {
      for (const name of Object.keys(groups)) {
        if (DS.runtimePlanAllows?.(plan, name)) activeBundles.push(name);
      }
    }
    return {
      routeType: String(page.routeType || "other").slice(0, 80),
      runtimePlan: String(plan?.key || "unknown").slice(0, 120),
      build: {
        id: String(build?.id || "full").slice(0, 80),
        label: String(build?.label || "Full").slice(0, 80),
        generated: !!build?.generated,
        bundles: Array.isArray(build?.bundles) ? build.bundles.map(value => String(value).slice(0, 60)).slice(0, 20) : []
      },
      activeBundles
    };
  }

  function runState() {
    const settings = DS.state?.settings || {};
    const tabPaused = !!DS.state?.tabQolPaused;
    if (settings.enabled === false) return "disabled";
    if (tabPaused) return "paused";
    return "active";
  }

  function safeValue(value, depth = 0) {
    if (value == null) return value;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") return value.slice(0, 160);
    if (depth >= 3) return undefined;
    if (Array.isArray(value)) {
      return value.slice(0, 24).map(item => safeValue(item, depth + 1)).filter(item => item !== undefined);
    }
    if (typeof value === "object") {
      const out = {};
      for (const [key, item] of Object.entries(value).slice(0, 40)) {
        const safe = safeValue(item, depth + 1);
        if (safe !== undefined) out[String(key).slice(0, 80)] = safe;
      }
      return out;
    }
    return undefined;
  }

  function active() {
    return Date.now() < state.inspectorActiveUntil;
  }

  function looksQolOwned(element) {
    if (!(element instanceof Element)) return false;
    if (element.dataset?.dsOwner === "qol" || element.dataset?.dsOwned === "1") return true;
    if (String(element.id || "").startsWith("ds-")) return true;
    return Array.from(element.classList || []).some(name => String(name).startsWith("ds-"));
  }

  function autoMarkOwned(element) {
    if (!(element instanceof Element) || !looksQolOwned(element)) return false;
    let changed = false;
    if (element.dataset.dsOwned !== "1") { element.dataset.dsOwned = "1"; changed = true; }
    if (element.dataset.dsOwner !== "qol") { element.dataset.dsOwner = "qol"; changed = true; }
    if (!element.dataset.dsFeature) { element.dataset.dsFeature = "qol-ui"; changed = true; }
    if (changed) state.ownershipMarked += 1;
    else state.ownershipNoopSkips += 1;
    return changed;
  }

  function markOwnedSubtree(root) {
    if (!(root instanceof Element)) return;
    autoMarkOwned(root);
    root.querySelectorAll?.("[id^='ds-'], [data-ds-owned='1']").forEach(autoMarkOwned);
  }

  function startOwnershipObserver() {
    if (state.ownershipObserver || !document.documentElement) return;
    state.ownershipObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) markOwnedSubtree(node);
      }
    });
    state.ownershipObserver.observe(document.documentElement, { childList: true, subtree: true });
    document.querySelectorAll?.("[id^='ds-'], [data-ds-owned='1']").forEach(autoMarkOwned);
  }

  function activatePeer(data = {}) {
    state.inspectorActiveUntil = Date.now() + ACTIVE_TTL_MS;
    const peer = data?.payload && typeof data.payload === "object" ? { ...data, ...data.payload } : data;
    if (typeof peer.inspectorVersion === "string") state.inspectorVersion = peer.inspectorVersion.slice(0, 80);
    if (typeof peer.inspectorSessionId === "string") state.inspectorSessionId = peer.inspectorSessionId.slice(0, 120);
    startMetricsTimer();
    startOwnershipObserver();
  }

  function envelope(type, payload = {}) {
    return {
      protocol: PROTOCOL,
      source: SOURCE,
      type,
      ts: Date.now(),
      pageSessionId: sessionId,
      payload: safeValue(payload) || {}
    };
  }

  function emit(type, payload = {}, { force = false } = {}) {
    if (!force && !active()) return false;
    const message = envelope(type, payload);
    try { window.postMessage(message, location.origin); } catch {}

    // Keep a small backwards/forwards-compatible page message alongside the
    // protocol envelope. It contains only version/build/session metadata plus
    // the same already-sanitized payload; no chat text, auth, headers or saved
    // content is added here.
    try {
      const versions = manifestInfo();
      const page = pageState();
      window.postMessage({
        source: COMPAT_SOURCE,
        type,
        feature: String(payload?.feature || "").slice(0, 80),
        version: versions.version,
        technicalVersion: versions.technicalVersion,
        build: String(page?.build?.id || "full").slice(0, 80),
        sessionId,
        protocol: PROTOCOL,
        payload: safeValue(payload) || {}
      }, "*");
    } catch {}

    try {
      document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
        detail: JSON.stringify(message)
      }));
    } catch {}
    return true;
  }

  function selectedRuntimeCounters() {
    const perf = DS.state?.runtimePerformance || {};
    const pick = names => Object.fromEntries(names.map(name => [name, Number(perf[name] || 0)]));
    return {
      observer: pick([
        "observerBatches", "mutations", "qolOnlyMutations", "observerQolOnlyBatches",
        "observerMixedQolBatches", "chatLocalMutations", "composerOnlyMutationSkips",
        "messageCacheMutationCandidateNodes", "messageCacheMutationRoots", "messageCacheMutationNodesCollapsed"
      ]),
      scheduler: pick([
        "schedules", "criticalSchedules", "slowSchedules", "messageLaneSchedules", "messageLaneRuns",
        "messageLaneScheduleCoalesced", "deferredWhileScrolling", "hiddenSkips", "slowLaneQuietDeferrals",
        "routeFeatureStepSkips", "routeFeatureGroupSkips", "buildBundleStepSkips"
      ]),
      listing: pick([
        "listingNonCardCriticalSkips", "listingScheduleDeferrals", "slowStepThrottleSkips",
        "blockedBotMutationSkips", "blockedBotRefreshDeferrals", "blockedBotRefreshFlushes",
        "cardTokenBackgroundAuthSkips", "cardTokenHiddenQueuePauses"
      ]),
      chat: pick([
        "historyBatches", "historyBatchDeferrals", "messageCountIncrementalUpdates", "messageCountIncrementalRoots",
        "loadedMessageRootCacheHits", "loadedMessageRootCacheMisses", "messageLaneDirtyRoots",
        "rpFormatHistoryDeferrals", "rpFormatChunkPasses", "rpFormatChunkMessages",
        "generationMetadataScopedPasses", "generationMetadataScopedMessages", "generationMetadataHistoryDeferrals"
      ]),
      storage: pick([
        "storageWriteRequests", "storageWriteBatches", "storageWriteKeys", "storageWriteMergedKeys",
        "storageWriteImmediateFlushes"
      ]),
      protocol: {
        operationsStarted: state.operationsStarted,
        operationsEnded: state.operationsEnded,
        networkStarted: state.networkStarted,
        networkEnded: state.networkEnded,
        ownershipMarked: state.ownershipMarked,
        ownershipNoopSkips: state.ownershipNoopSkips
      }
    };
  }

  function metricsSnapshot(reason = "interval") {
    const page = pageState();
    return {
      reason,
      state: runState(),
      routeType: page.routeType,
      runtimePlan: page.runtimePlan,
      counters: selectedRuntimeCounters()
    };
  }

  function emitMetrics(reason = "interval") {
    state.lastMetricsAt = Date.now();
    emit("metrics", metricsSnapshot(reason));
  }

  function startMetricsTimer() {
    if (state.metricsTimer) return;
    state.metricsTimer = setInterval(() => {
      if (!active()) {
        clearInterval(state.metricsTimer);
        state.metricsTimer = null;
        state.ownershipObserver?.disconnect?.();
        state.ownershipObserver = null;
        return;
      }
      emitMetrics("interval");
    }, METRICS_INTERVAL_MS);
  }

  function handshakePayload(reason = "hello") {
    const versions = manifestInfo();
    const page = pageState();
    return {
      reason,
      protocolVersion: 1,
      qolVersion: versions.version,
      qolTechnicalVersion: versions.technicalVersion,
      browser: browserName(),
      presenceState: "present",
      runState: runState(),
      pageSessionId: sessionId,
      routeType: page.routeType,
      runtimePlan: page.runtimePlan,
      build: page.build,
      activeBundles: page.activeBundles,
      enabledModules: page.activeBundles,
      privacy: {
        chatText: false,
        savedContent: false,
        authSecrets: false,
        requestHeaders: false,
        requestBodies: false
      }
    };
  }

  function sendHandshake(reason = "hello") {
    state.lastHandshakeAt = Date.now();
    emit("handshake", handshakePayload(reason), { force: true });
  }

  function fnv1a(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function sanitizedEndpoint(value) {
    let url;
    try { url = new URL(String(value || ""), location.origin); }
    catch { return "unknown"; }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const parts = String(url.pathname || "/").split("/").map(part => {
      if (!part) return part;
      if (uuid.test(part)) return ":id";
      if (/^\d{6,}$/.test(part)) return ":id";
      if (part.length >= 28 && /^[A-Za-z0-9_-]+$/.test(part)) return ":id";
      return part.slice(0, 80);
    });
    const host = url.origin === location.origin ? "spicychat.ai" : String(url.host || "external").slice(0, 100);
    return `${host}${parts.join("/")}`.slice(0, 240);
  }

  DS.markQolOwned = function markQolOwned(element, feature = "qol") {
    if (!(element instanceof Element)) return element;
    const wantedFeature = feature ? String(feature).slice(0, 80) : "";
    let changed = false;
    if (element.dataset.dsOwned !== "1") { element.dataset.dsOwned = "1"; changed = true; }
    if (element.dataset.dsOwner !== "qol") { element.dataset.dsOwner = "qol"; changed = true; }
    if (wantedFeature && element.dataset.dsFeature !== wantedFeature) { element.dataset.dsFeature = wantedFeature; changed = true; }
    if (changed) state.ownershipMarked += 1;
    else state.ownershipNoopSkips += 1;
    return element;
  };

  DS.diagOperationStart = function diagOperationStart(feature, operation = "run", meta = {}) {
    if (!active()) return null;
    const token = {
      id: `op-${(++state.operationSeq).toString(36)}`,
      feature: String(feature || "unknown").slice(0, 80),
      operation: String(operation || "run").slice(0, 80),
      startedAt: performance.now()
    };
    state.operationsStarted += 1;
    state.activeOperations.set(token.feature, token.id);
    emit("operation-start", {
      id: token.id,
      attribution: "confirmed-qol",
      feature: token.feature,
      operation: token.operation,
      meta: safeValue(meta)
    });
    return token;
  };

  DS.diagOperationEnd = function diagOperationEnd(token, result = {}) {
    if (!token) return false;
    if (state.activeOperations.get(token.feature) === token.id) state.activeOperations.delete(token.feature);
    if (!active()) return false;
    state.operationsEnded += 1;
    const durationMs = Math.max(0, performance.now() - Number(token.startedAt || performance.now()));
    const counts = result?.counts && typeof result.counts === "object" ? result.counts : result;
    emit("operation-end", {
      id: token.id,
      attribution: "confirmed-qol",
      feature: token.feature,
      operation: token.operation,
      durationMs: Math.round(durationMs * 10) / 10,
      counts: {
        scanned: Number(counts?.scanned || 0),
        changed: Number(counts?.changed || 0),
        skipped: Number(counts?.skipped || 0),
        errors: Number(counts?.errors || 0)
      },
      outcome: String(result?.outcome || "ok").slice(0, 40)
    });
    return true;
  };

  DS.diagNetworkStart = function diagNetworkStart(feature, method, url, meta = {}) {
    if (!active()) return null;
    const endpoint = sanitizedEndpoint(url);
    const normalizedMethod = String(method || "GET").toUpperCase().slice(0, 12);
    const token = {
      id: `net-${(++state.networkSeq).toString(36)}`,
      feature: String(feature || "unknown").slice(0, 80),
      method: normalizedMethod,
      endpoint,
      fingerprint: `fnv1a-${fnv1a(`${normalizedMethod} ${endpoint}`)}`,
      triggerOperationId: state.activeOperations.get(String(feature || "unknown").slice(0, 80)) || "",
      startedAt: performance.now()
    };
    state.networkStarted += 1;
    emit("network-start", {
      requestId: token.id,
      attribution: "confirmed-qol",
      triggerOperationId: token.triggerOperationId,
      feature: token.feature,
      method: token.method,
      endpoint: token.endpoint,
      fingerprint: token.fingerprint,
      meta: safeValue(meta)
    });
    return token;
  };

  DS.diagNetworkEnd = function diagNetworkEnd(token, result = {}) {
    if (!token || !active()) return false;
    state.networkEnded += 1;
    const durationMs = Math.max(0, performance.now() - Number(token.startedAt || performance.now()));
    emit("network-end", {
      requestId: token.id,
      attribution: "confirmed-qol",
      triggerOperationId: token.triggerOperationId,
      feature: token.feature,
      method: token.method,
      endpoint: token.endpoint,
      fingerprint: token.fingerprint,
      durationMs: Math.round(durationMs * 10) / 10,
      status: Number(result?.status || 0),
      ok: result?.ok === true,
      outcome: String(result?.outcome || (result?.ok ? "ok" : "failed")).slice(0, 60)
    });
    return true;
  };

  DS.getDiagnosticProtocolState = function getDiagnosticProtocolState() {
    const versions = manifestInfo();
    return {
      protocol: PROTOCOL,
      protocolVersion: 1,
      qolVersion: versions.version,
      qolTechnicalVersion: versions.technicalVersion,
      pageSessionId: sessionId,
      inspectorConnected: active(),
      inspectorVersion: state.inspectorVersion || "",
      inspectorSessionId: state.inspectorSessionId || "",
      runState: runState(),
      lastHandshakeAt: state.lastHandshakeAt,
      lastMetricsAt: state.lastMetricsAt,
      counters: {
        operationsStarted: state.operationsStarted,
        operationsEnded: state.operationsEnded,
        networkStarted: state.networkStarted,
        networkEnded: state.networkEnded,
        ownershipMarked: state.ownershipMarked,
        ownershipNoopSkips: state.ownershipNoopSkips
      }
    };
  };

  function handleRequest(data) {
    if (!data || data.protocol !== PROTOCOL || data.source !== INSPECTOR_SOURCE) return;
    const type = String(data.type || "");
    activatePeer(data);
    if (type === "hello" || type === "ping") {
      sendHandshake(type);
      emitMetrics(type);
      return;
    }
    if (type === "request-metrics" || type === "snapshot") {
      emitMetrics(type);
      return;
    }
    if (type === "request-handshake") {
      sendHandshake(type);
    }
  }

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    handleRequest(event.data);
  }, false);

  document.addEventListener(REQUEST_EVENT, event => {
    try {
      const data = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
      handleRequest(data);
    } catch {}
  }, false);

  function publishDiscoveryMarkers() {
    const root = document.documentElement;
    if (!root) return;
    const versions = manifestInfo();
    const page = pageState();
    DS.setDatasetIfChanged?.(root, "dsQolDiagnosticProtocol", PROTOCOL);
    if (versions.version !== "unknown" || !root.dataset.dsQolVersion) DS.setDatasetIfChanged?.(root, "dsQolVersion", versions.version);
    if (versions.technicalVersion !== "unknown" || !root.dataset.dsQolTechnicalVersion) DS.setDatasetIfChanged?.(root, "dsQolTechnicalVersion", versions.technicalVersion);
    DS.setDatasetIfChanged?.(root, "dsQolBuild", String(page?.build?.id || "full"));
    DS.setDatasetIfChanged?.(root, "dsQolPageSession", sessionId);
  }

  function startPresenceHeartbeat() {
    if (state.presenceTimer) return;
    state.presenceTimer = setInterval(() => {
      // Hidden/AFK tabs do not need another page message every minute. The
      // marker remains on <html>, and a fresh presence event is sent when the
      // page becomes visible again.
      if (document.visibilityState === "visible") sendHandshake("presence");
    }, PRESENCE_INTERVAL_MS);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    publishDiscoveryMarkers();
    sendHandshake("visible");
  }, false);

  publishDiscoveryMarkers();
  startPresenceHeartbeat();
  setTimeout(() => sendHandshake("startup"), 0);
  // Firefox/early document_start can briefly expose the page before the
  // extension runtime manifest is reachable. Retry a few cheap discovery-only
  // publishes so the marker recovers instead of staying `unknown` for the
  // entire page session.
  [250, 1000, 3000].forEach(delay => setTimeout(() => {
    const before = manifestInfo();
    publishDiscoveryMarkers();
    if (before.version !== "unknown" || before.technicalVersion !== "unknown") sendHandshake("version-recovery");
  }, delay));

  // A tiny discovery marker lets the Inspector know which protocol to ask for
  // without exposing settings, page content, auth, or any saved user data.
  try { publishDiscoveryMarkers(); } catch {}

  DS.runtimeLog?.("info", "diagnostic-protocol", "Dragon's SpicyChat Diagnostic Extension compatibility protocol ready", {
    protocol: PROTOCOL,
    sessionId
  });
})();
