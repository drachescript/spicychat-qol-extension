(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || DS.__diagnosticProtocolInstalled) return;
  DS.__diagnosticProtocolInstalled = true;

  const PROTOCOL = "dragon-spicychat-qol-diagnostics-v1";
  const PROTOCOL_V2 = "dragon-spicychat-qol-diagnostics-v2";
  const SUPPORTED_PROTOCOLS = Object.freeze([PROTOCOL, PROTOCOL_V2]);
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
  const MODULE_HASHES = Object.freeze({
    main: "sha256-371e87f8723a9678",
    chatExport: "sha256-a915b9a4154e4613",
    performanceMode: "sha256-ada42fe35568ff31",
    failedMessageHelper: "sha256-3ef0a4001b7b450c",
    cardTokenInfo: "sha256-2f91f11a928a5585",
    cardTokenMain: "sha256-8cfce077e7384568",
    composer: "sha256-3dfe6a03ed53d28b",
    quickDislikePage: "sha256-4d6511d16af0d917",
    background: "sha256-f4d2a2005d6bd60c",
    listings: "sha256-6f962e90cff0f8ea",
    sidebar: "sha256-5da9ff3689094626",
    core: "sha256-431d9df59ff729ba",
    messageOptions: "sha256-31b04492a9aeeeaf",
    generationMetadata: "sha256-2ea2eeaf12f7cda0",
    exactMessageCounts: "sha256-15fe59ecf8e0f621",
    exactMessageCountsLoader: "sha256-e8f887f052840a62",
    generationMetadataLoader: "sha256-57fc7a5f0e2088a1",
    options: "sha256-c99be5a78e74c435",
    botStatusWorkerManager: "sha256-f4d2a2005d6bd60c",
    runtimePlan: "sha256-55adb9a5b251865f",
    backgroundWorkerCoordinator: "sha256-f4d2a2005d6bd60c",
    topBar: "sha256-0bfe298c950c4fb0",
    premiumNotifications: "sha256-51db5eaf035bdd13",
    alternateDialogue: "sha256-48e127cb8c009b8f",
    rpFormatRepair: "sha256-7d8d4eccc00fd171",
    chatBookmarks: "sha256-b5bef9dc7ccc5007",
    contextKeeper: "sha256-84cc997669a2d44d",
    textReplacements: "sha256-50c3a17a336a277d",
    translation: "sha256-4da617738c52b5bb",
    lorebookBackup: "sha256-2e6c579a8ef94337",
    botBackup: "sha256-97332168dc5a61d5",
    personas: "sha256-36591f179bd2083e",
    featureRegistry: "sha256-99e0d66674c43758",
    runtimeImprovements: "sha256-2935f06569916433",
    modelSelector: "sha256-019827b2425c2069",
    adBanners: "sha256-504c2528443a9146",
  });

  const sessionId = (() => {
    try { return crypto.randomUUID(); } catch {}
    return `dsq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  })();

  const state = {
    inspectorActiveUntil: 0,
    lastKnownVersion: "",
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
    lastHandshakeSignature: "",
    lastMetricsAt: 0,
    activeOperations: new Map(),
    ownershipObserver: null,
    ownershipMarked: 0,
    ownershipNoopSkips: 0
  };

  const v2State = {
    recording: false,
    traceLevel: "off",
    traceSeq: 0,
    queued: [],
    flushTimer: null,
    emitted: 0,
    dropped: 0,
    coalesced: 0,
    maxDetailed: 50000,
    aggregate: new Map(),
    operationStack: [],
    routeTimer: null,
    lastRoute: `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`,
    userActionInstalled: false,
    settingsListenerInstalled: false,
    backgroundListenerInstalled: false,
    backgroundLastSeq: 0,
    domSummaryTimer: null,
    domSummary: null,
    performanceMode: "",
    peerProtocol: PROTOCOL,
    peerSupportsV2: false
  };

  function traceLevelRank(level) {
    if (level === "deep") return 2;
    if (level === "normal") return 1;
    return 0;
  }

  function v2Active(minLevel = "normal") {
    return active() && v2State.recording && traceLevelRank(v2State.traceLevel) >= traceLevelRank(minLevel);
  }

  function workerContext() {
    try {
      const url = new URL(location.href);
      const html = document.documentElement;
      let worker = String(DS.state?.qolBackgroundWorker || html?.getAttribute("data-ds-qol-background-worker") || "").slice(0, 80);
      let helperSession = String(DS.state?.qolBackgroundWorkerSessionId || html?.getAttribute("data-ds-qol-background-worker-session") || url.searchParams.get("dsHelperSession") || "").slice(0, 120);
      if (!worker) {
        if (url.searchParams.get("dsQolBotStatusWorker") === "1") worker = "bot-status";
        else if (url.searchParams.get("dsQolRecommendationWorker") === "1" || url.searchParams.get("dsQuickLessLike") === "1") worker = "less-like";
        else if (url.searchParams.get("dsQuickDislike") === "1") worker = "quick-dislike";
        else if (url.searchParams.get("dsListingRefill") === "1" || url.searchParams.get("dsListFill") === "1") worker = "listing-refill";
        else if (url.searchParams.get("dsPersonaRefresh") === "1") worker = "persona-refresh";
      }
      return { worker, workerSessionId: helperSession };
    } catch { return { worker: "", workerSessionId: "" }; }
  }

  function sensitiveKey(key = "") {
    return /(authorization|cookie|token|secret|password|webhook|request.?body|response.?body|headers?|chat.?text|message.?text|prompt|ooc|persona.?description|lorebook.?content|keywords?|definition|personality|scenario|example.?dialog|greeting|description|content|raw|html)/i.test(String(key || ""));
  }

  function summarizeSensitive(value) {
    if (value == null) return value;
    if (typeof value === "string") return { changed: true, chars: value.length, fingerprint: `fnv1a-${fnv1a(value)}` };
    if (Array.isArray(value)) return { changed: true, count: value.length };
    if (typeof value === "object") return { changed: true, keys: Object.keys(value).length };
    return { changed: true, kind: typeof value };
  }

  function safeTraceValue(value, depth = 0, keyHint = "") {
    if (sensitiveKey(keyHint)) return summarizeSensitive(value);
    if (value == null) return value;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      if (/url$/i.test(keyHint) || /^url$/i.test(keyHint)) return sanitizedEndpoint(value);
      return value.slice(0, 180);
    }
    if (depth >= 4) return undefined;
    if (Array.isArray(value)) return value.slice(0, 32).map(item => safeTraceValue(item, depth + 1, keyHint)).filter(item => item !== undefined);
    if (typeof value === "object") {
      const out = {};
      for (const [key, item] of Object.entries(value).slice(0, 60)) {
        const safe = safeTraceValue(item, depth + 1, key);
        if (safe !== undefined) out[String(key).slice(0, 90)] = safe;
      }
      return out;
    }
    return undefined;
  }

  // v2 has exactly one canonical page transport. Older Inspectors still use
  // the legacy v1 postMessage/CustomEvent compatibility path below, but once
  // a v2 peer is negotiated detailed telemetry must not be duplicated across
  // multiple page channels.
  function postProtocolMessage(message) {
    try { window.postMessage(message, location.origin); } catch {}
  }

  function v2Envelope(type, payload = {}) {
    const worker = workerContext();
    return {
      protocol: PROTOCOL_V2,
      protocolVersion: 2,
      source: SOURCE,
      type,
      ts: Date.now(),
      monoMs: Math.round((performance?.now?.() || 0) * 1000) / 1000,
      pageSessionId: sessionId,
      runtimeSessionId: sessionId,
      worker: worker.worker,
      workerSessionId: worker.workerSessionId,
      payload: safeTraceValue(payload) || {}
    };
  }

  function emitV2Control(type, payload = {}, { force = false } = {}) {
    if (!force && !active()) return false;
    postProtocolMessage(v2Envelope(type, payload));
    return true;
  }

  function aggregateTrace(event) {
    const feature = String(event.feature || "qol").slice(0, 80);
    const name = String(event.event || event.operation || event.action || event.type || "event").slice(0, 100);
    const key = `${event.type}|${feature}|${name}`;
    const row = v2State.aggregate.get(key) || { type: event.type, feature, name, count: 0, firstTs: event.ts, lastTs: event.ts };
    row.count += 1;
    row.lastTs = event.ts;
    v2State.aggregate.set(key, row);
    v2State.coalesced += 1;
  }

  function flushTraceBatch(force = false) {
    clearTimeout(v2State.flushTimer);
    v2State.flushTimer = null;
    if (!active() || !v2State.recording) {
      v2State.queued.length = 0;
      return false;
    }
    if (!v2State.queued.length && !force) return false;
    const events = v2State.queued.splice(0, 250);
    if (events.length) {
      emitV2Control("trace-batch", {
        traceLevel: v2State.traceLevel,
        firstSeq: events[0]?.seq || 0,
        lastSeq: events[events.length - 1]?.seq || 0,
        events,
        dropped: v2State.dropped,
        coalesced: v2State.coalesced
      }, { force: true });
    }
    if (v2State.queued.length) v2State.flushTimer = setTimeout(() => flushTraceBatch(), 0);
    return !!events.length;
  }

  function queueTrace(type, payload = {}, { level = "normal", critical = false } = {}) {
    if (!v2Active(level)) return false;
    const seq = ++v2State.traceSeq;
    const event = {
      seq,
      ts: Date.now(),
      monoMs: Math.round((performance?.now?.() || 0) * 1000) / 1000,
      type: String(type || "event").slice(0, 80),
      pageSessionId: sessionId,
      ...safeTraceValue(payload || {})
    };
    const preserve = critical || event.type === "error" || event.type === "performance-mode-change" || Number(event.durationMs || 0) >= 50;
    if (v2State.emitted >= v2State.maxDetailed && !preserve) {
      aggregateTrace(event);
      return false;
    }
    if (v2State.queued.length >= 5000 && !preserve) {
      v2State.dropped += 1;
      return false;
    }
    v2State.emitted += 1;
    v2State.queued.push(event);
    if (critical || v2State.queued.length >= 200) flushTraceBatch(true);
    else if (!v2State.flushTimer) v2State.flushTimer = setTimeout(() => flushTraceBatch(), 75);
    return true;
  }

  function flushTraceAggregates() {
    if (!v2Active("normal") || !v2State.aggregate.size) return;
    const rows = [...v2State.aggregate.values()].slice(0, 250);
    v2State.aggregate.clear();
    queueTrace("trace-aggregate", { rows, coalescedTotal: v2State.coalesced }, { critical: true });
  }

  function currentParentOperationId() {
    return String(v2State.operationStack[v2State.operationStack.length - 1] || "");
  }

  function safeSettingSummary(value) {
    if (value == null || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "string") return value.length <= 40 && !/[\n\r]/.test(value) ? value : summarizeSensitive(value);
    if (Array.isArray(value)) return { count: value.length, fingerprint: `fnv1a-${fnv1a(JSON.stringify(value).slice(0, 20000))}` };
    if (typeof value === "object") return { keys: Object.keys(value).length, fingerprint: `fnv1a-${fnv1a(JSON.stringify(value).slice(0, 20000))}` };
    return { kind: typeof value };
  }

  function configureOwnershipObserver() {
    state.ownershipObserver?.disconnect?.();
    state.ownershipObserver = null;
    // A v2 Inspector that is merely installed/connected should add virtually
    // no diagnostic work. Ownership observation is useful only while a v2
    // recording is active. Keep the old behavior for a legacy v1 Inspector.
    if (!active() || !document.documentElement) return;
    if (v2State.peerSupportsV2 && !v2State.recording) return;
    const deep = v2Active("deep");
    state.ownershipObserver = new MutationObserver(mutations => {
      let added = 0, removed = 0, attributes = 0, qolOwned = 0;
      const features = {};
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          attributes += 1;
          const target = mutation.target;
          if (looksQolOwned(target)) {
            qolOwned += 1;
            const feature = String(target?.dataset?.dsFeature || "qol-ui").slice(0, 80);
            features[feature] = Number(features[feature] || 0) + 1;
          }
          continue;
        }
        added += mutation.addedNodes?.length || 0;
        removed += mutation.removedNodes?.length || 0;
        for (const node of mutation.addedNodes || []) {
          if (node instanceof Element) {
            markOwnedSubtree(node);
            if (looksQolOwned(node)) {
              qolOwned += 1;
              const feature = String(node.dataset?.dsFeature || "qol-ui").slice(0, 80);
              features[feature] = Number(features[feature] || 0) + 1;
            }
          }
        }
        for (const node of mutation.removedNodes || []) {
          if (node instanceof Element && looksQolOwned(node)) qolOwned += 1;
        }
      }
      if (deep && (added || removed || attributes || qolOwned)) {
        const summary = v2State.domSummary || (v2State.domSummary = { added: 0, removed: 0, attributes: 0, qolOwned: 0, batches: 0, features: {} });
        summary.added += added; summary.removed += removed; summary.attributes += attributes; summary.qolOwned += qolOwned; summary.batches += 1;
        for (const [feature, count] of Object.entries(features)) summary.features[feature] = Number(summary.features[feature] || 0) + Number(count || 0);
        if (!v2State.domSummaryTimer) v2State.domSummaryTimer = setTimeout(() => {
          const out = v2State.domSummary;
          v2State.domSummary = null;
          v2State.domSummaryTimer = null;
          if (out) queueTrace("dom-summary", out, { level: "deep" });
        }, 100);
      }
    });
    state.ownershipObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: deep, attributeFilter: deep ? ["class", "style", "hidden", "aria-hidden", "data-ds-owned", "data-ds-owner", "data-ds-feature"] : undefined });
    document.querySelectorAll?.("[id^='ds-'], [data-ds-owned='1']").forEach(autoMarkOwned);
  }

  function installUserActionTrace() {
    if (v2State.userActionInstalled) return;
    v2State.userActionInstalled = true;
    document.addEventListener("click", event => {
      if (!v2Active("normal")) return;
      const target = event.target instanceof Element ? event.target.closest("[data-ds-owned='1'],[data-ds-owner='qol'],[id^='ds-'],[class*='ds-']") : null;
      if (!target) return;
      const feature = String(target.dataset?.dsFeature || target.closest?.("[data-ds-feature]")?.dataset?.dsFeature || "qol-ui").slice(0, 80);
      const action = String(target.id || [...(target.classList || [])].find(name => String(name).startsWith("ds-")) || target.getAttribute?.("role") || target.tagName || "click").slice(0, 100);
      queueTrace("user-action", { feature, action, inputType: String(target.getAttribute?.("type") || "").slice(0, 30) });
    }, true);
  }

  function installSettingTrace() {
    if (v2State.settingsListenerInstalled) return;
    v2State.settingsListenerInstalled = true;
    try {
      chrome.storage?.onChanged?.addListener((changes, area) => {
        if (!v2Active("normal") || area !== "local") return;
        for (const [key, change] of Object.entries(changes || {})) {
          if (!String(key).startsWith("dsSettingV1:")) continue;
          const name = String(key).slice("dsSettingV1:".length, 120);
          queueTrace("setting-change", {
            feature: "settings",
            name,
            old: safeSettingSummary(change?.oldValue),
            new: safeSettingSummary(change?.newValue)
          });
        }
      });
    } catch {}
  }

  function installBackgroundTraceListener() {
    if (v2State.backgroundListenerInstalled) return;
    v2State.backgroundListenerInstalled = true;
    try {
      chrome.runtime?.onMessage?.addListener(message => {
        if (message?.type !== "DS_QOL_DIAGNOSTIC_BACKGROUND_EVENT") return;
        const row = message.event && typeof message.event === "object" ? message.event : {};
        v2State.backgroundLastSeq = Math.max(v2State.backgroundLastSeq, Number(row.seq || 0));
        const eventType = String(row.type || "background").slice(0, 80);
        const safeMeta = safeTraceValue(row.meta || {}) || {};
        const payload = {
          source: "background",
          backgroundSeq: Number(row.seq || 0),
          backgroundTs: Number(row.ts || 0),
          feature: String(row.feature || "background").slice(0, 80),
          ...safeMeta
        };
        if (eventType === "operation-start" || eventType === "operation-end") {
          payload.id = String(safeMeta.operationId || safeMeta.leaseId || `bgop-${Number(row.seq || 0)}`).slice(0, 120);
          payload.parentOperationId = String(safeMeta.parentOperationId || "").slice(0, 120);
          payload.attribution = "confirmed-qol-background";
        }
        queueTrace(eventType, payload, { level: row.level === "deep" ? "deep" : "normal", critical: !!row.critical });
      });
    } catch {}
  }

  function setTracePeer(data = {}) {
    const peer = data?.payload && typeof data.payload === "object" ? { ...data, ...data.payload } : data;
    const requestedLevel = String(peer.traceLevel || peer.level || (peer.recording === false ? "off" : "normal")).toLowerCase();
    const incomingV2 = data?.protocol === PROTOCOL_V2 || Number(peer.protocolVersion || 0) >= 2;
    // A newer Inspector may still emit legacy v1 discovery/ping messages for
    // compatibility. Do not let those messages silently turn an active v2
    // recording back off.
    if (incomingV2) {
      v2State.peerSupportsV2 = true;
      v2State.peerProtocol = PROTOCOL_V2;
      if (peer.recording === false) v2State.recording = false;
      else if (peer.recording === true || data?.type === "recording-start") v2State.recording = true;
      v2State.traceLevel = v2State.recording ? (requestedLevel === "deep" ? "deep" : (v2State.traceLevel === "deep" && !peer.traceLevel ? "deep" : "normal")) : "off";
    } else if (!v2State.peerSupportsV2) {
      v2State.peerProtocol = PROTOCOL;
      v2State.recording = false;
      v2State.traceLevel = "off";
    }
    configureOwnershipObserver();
    installUserActionTrace();
    installSettingTrace();
    installBackgroundTraceListener();
    try {
      chrome.runtime?.sendMessage?.({
        type: "DS_QOL_DIAGNOSTIC_SUBSCRIBE",
        active: !!v2State.recording,
        traceLevel: v2State.traceLevel,
        pageSessionId: sessionId,
        afterSeq: Number(v2State.backgroundLastSeq || 0)
      });
    } catch {}
  }

  function stopTracePeer() {
    flushTraceAggregates();
    flushTraceBatch(true);
    v2State.recording = false;
    v2State.traceLevel = "off";
    clearInterval(v2State.routeTimer);
    v2State.routeTimer = null;
    clearInterval(state.metricsTimer);
    state.metricsTimer = null;
    try { chrome.runtime?.sendMessage?.({ type: "DS_QOL_DIAGNOSTIC_SUBSCRIBE", active: false, pageSessionId: sessionId }); } catch {}
    configureOwnershipObserver();
  }

  function v2HandshakePayload(reason = "hello") {
    const versions = manifestInfo();
    const page = pageState();
    return {
      reason,
      protocolVersion: 2,
      supportedProtocols: [1, 2],
      protocolIds: SUPPORTED_PROTOCOLS,
      qolVersion: versions.version,
      browser: browserName(),
      presenceState: "present",
      runState: runState(),
      recording: !!v2State.recording,
      traceLevel: v2State.traceLevel,
      pageSessionId: sessionId,
      routeType: page.routeType,
      runtimePlan: page.runtimePlan,
      build: page.build,
      activeBundles: page.activeBundles,
      capabilities: ["operations", "nested-operations", "network", "storage", "scheduler", "dom-summary", "workers", "settings", "background", "user-actions", "performance", "route", "batching", "sequence", "drop-tracking"],
      privacy: {
        chatText: false,
        lorebookContent: false,
        lorebookKeywords: false,
        personaContent: false,
        oocText: false,
        privateDefinitions: false,
        authSecrets: false,
        requestHeaders: false,
        requestBodies: false
      },
      trace: {
        maxDetailedEventsPerPage: v2State.maxDetailed,
        batchDelayMs: 75,
        maxBatchEvents: 250,
        backgroundReplaySupported: true,
        sequence: v2State.traceSeq,
        dropped: v2State.dropped,
        coalesced: v2State.coalesced
      }
    };
  }

  function sendV2Handshake(reason = "hello") {
    return emitV2Control("handshake", v2HandshakePayload(reason), { force: true });
  }

  function startV2RouteMonitor() {
    if (v2State.routeTimer || !v2State.recording) return;
    v2State.routeTimer = setInterval(() => {
      if (!v2Active("normal")) return;
      const route = `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`;
      if (route !== v2State.lastRoute) {
        const previous = v2State.lastRoute;
        v2State.lastRoute = route;
        queueTrace("route-change", { feature: "runtime", from: previous.slice(0, 220), to: route.slice(0, 220), routeType: pageState().routeType }, { critical: true });
      }
      const mode = String(DS.state?.runtimePerformance?.mode || document.documentElement?.dataset?.dsQolAutoPerformanceTier || DS.state?.settings?.runtimePerformanceMode || "adaptive");
      if (mode && mode !== v2State.performanceMode) {
        const old = v2State.performanceMode;
        v2State.performanceMode = mode;
        if (old) queueTrace("performance-mode-change", { feature: "performance", from: old, to: mode }, { critical: true });
      }
    }, 500);
  }

  function manifestInfo() {
    try {
      const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime || null;
      const manifest = runtime?.getManifest?.() || {};
      const version = String(manifest.version || "").trim();
      if (version && version !== "unknown") state.lastKnownVersion = version;
    } catch {}
    return {
      version: state.lastKnownVersion || "unknown"
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
        revision: String(build?.revision || "unknown").slice(0, 100),
        bundles: Array.isArray(build?.bundles) ? build.bundles.map(value => String(value).slice(0, 60)).slice(0, 20) : [],
        moduleHashes: MODULE_HASHES
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

  function settingsSnapshot() {
    const settings = DS.state?.settings || {};
    return {
      enabled: settings.enabled !== false,
      runtimePerformanceMode: String(settings.runtimePerformanceMode || "adaptive").slice(0, 40),
      chatPerformanceMode: !!settings.chatPerformanceMode,
      performanceDiagnostics: !!settings.performanceDiagnostics,
      desktopAppPerformanceGuard: settings.desktopAppPerformanceGuard !== false,
      pauseQolInHiddenTabs: settings.pauseQolInHiddenTabs !== false,
      deepSleepDisabledFeatures: settings.deepSleepDisabledFeatures !== false,
      showChatExportButton: !!settings.showChatExportButton,
      chatExportLoadPreviousMessages: !!settings.chatExportLoadPreviousMessages,
      chatExportHistoryMode: String(settings.chatExportHistoryMode || "api").slice(0, 20),
      showQolSidebarButton: !!settings.showQolSidebarButton,
      qolSidebarButtonPlacement: String(settings.qolSidebarButtonPlacement || "after-sai").slice(0, 40),
      autoRetryFailedMessageSends: !!settings.autoRetryFailedMessageSends,
      autoFillListings: !!settings.autoFillListings,
      quickDislikeIdleEnabled: !!settings.quickDislikeIdleEnabled
    };
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
    const ownedAncestor = element.parentElement?.closest?.("[data-ds-owned='1'],[data-ds-owner='qol']");
    if (ownedAncestor) {
      state.ownershipAncestorSkips = Number(state.ownershipAncestorSkips || 0) + 1;
      return false;
    }
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
    configureOwnershipObserver();
  }

  function activatePeer(data = {}) {
    state.inspectorActiveUntil = Date.now() + ACTIVE_TTL_MS;
    const peer = data?.payload && typeof data.payload === "object" ? { ...data, ...data.payload } : data;
    if (typeof peer.inspectorVersion === "string") state.inspectorVersion = peer.inspectorVersion.slice(0, 80);
    if (typeof peer.inspectorSessionId === "string") state.inspectorSessionId = peer.inspectorSessionId.slice(0, 120);
    startMetricsTimer();
    setTracePeer(data);
    startOwnershipObserver();
    startV2RouteMonitor();
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
    // A v2 Inspector gets detailed activity from the single batched v2
    // transport. Do not also emit the same logical operation through the two
    // legacy v1 transports. Discovery/handshake still remains compatible.
    const legacyDetailed = new Set([
      "feature-event", "operation-start", "operation-end",
      "network-start", "network-end"
    ]);
    if (v2State.peerSupportsV2 && legacyDetailed.has(String(type || ""))) return false;
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
        "criticalMessageEnhancerPassesDeferred", "quickPanelRenderQuietDeferrals",
        "routeFeatureStepSkips", "routeFeatureGroupSkips", "buildBundleStepSkips"
      ]),
      listing: pick([
        "listingNonCardCriticalSkips", "listingScheduleDeferrals", "slowStepThrottleSkips",
        "cardHidingStablePassSkips", "blockedBotMutationSkips", "blockedBotRefreshDeferrals", "blockedBotRefreshFlushes",
        "cardTokenBackgroundAuthSkips", "cardTokenHiddenQueuePauses"
      ]),
      chat: pick([
        "historyBatches", "historyBatchDeferrals", "messageCountIncrementalUpdates", "messageCountIncrementalRoots",
        "loadedMessageRootCacheHits", "loadedMessageRootCacheMisses", "messageLaneDirtyRoots",
        "messageLaneChunkedPasses", "messageLaneChunkedRoots", "messageLaneDeferredRoots",
        "messageEnhancerIncrementalLanePasses", "messageEnhancerIncrementalLaneRoots",
        "rpFormatHistoryDeferrals", "rpFormatChunkPasses", "rpFormatChunkMessages",
        "generationMetadataScopedPasses", "generationMetadataScopedMessages", "generationMetadataHistoryDeferrals",
        "chatExportApiRuns", "chatExportApiFailures", "chatExportApiLastMessages", "chatExportApiLastExpected",
        "chatExportApiLastPages", "chatExportApiLastMs", "chatExportApiLastNetworkMs", "chatExportApiLastRequestMs",
        "chatExportApiLastProcessingMs", "chatExportApiLastRetries", "chatExportApiLastAuthRefreshes",
        "chatExportNativeRuns", "chatExportNativeLastMessages", "chatExportNativeLastMounted", "chatExportNativeLastParsedRoots",
        "chatExportNativeLastRetries", "chatExportNativeLastMs", "chatExportLastSerializeMs", "chatExportLastSerializedChars"
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
      attributionNotes: {
        nativeQueuePolling: "SpicyChat /queue polling is site-owned; do not attribute it to QoL without direct QoL network markers.",
        nativeBannerBursts: "Repeated /cms/banners requests reproduce without QoL and are site-owned baseline traffic.",
        nativePartnerStorage: "isPartner_* storage writes are currently treated as native/unconfirmed, not QoL-owned."
      },
      routeType: page.routeType,
      runtimePlan: page.runtimePlan,
      environment: {
        visibilityState: String(document.visibilityState || "unknown"),
        focused: typeof document.hasFocus === "function" ? !!document.hasFocus() : null,
        mountedMessages: Number(DS.getLoadedChatMessageCount?.() || document.querySelectorAll("[id^='message-']").length || 0),
        domNodes: document.getElementsByTagName("*").length,
        heapBytes: Number(performance?.memory?.usedJSHeapSize || 0),
        recentLongTaskMs10s: Number(DS.state?.runtimePerformance?.autoPressureLongTask10s || 0),
        recentLongTaskMs30s: Number(DS.state?.runtimePerformance?.autoPressureLongTask30s || 0),
        effectiveRuntimeMode: String(DS.state?.runtimePerformance?.mode || document.documentElement?.dataset?.dsQolAutoPerformanceTier || DS.state?.settings?.runtimePerformanceMode || "adaptive")
      },
      settings: settingsSnapshot(),
      timings: DS.getPerformanceReport?.().slice(0, 30) || [],
      counters: selectedRuntimeCounters(),
      trace: {
        protocolVersion: 2,
        recording: !!v2State.recording,
        traceLevel: v2State.traceLevel,
        sequence: v2State.traceSeq,
        emitted: v2State.emitted,
        dropped: v2State.dropped,
        coalesced: v2State.coalesced,
        queued: v2State.queued.length,
        backgroundLastSeq: v2State.backgroundLastSeq
      }
    };
  }

  function emitMetrics(reason = "interval") {
    state.lastMetricsAt = Date.now();
    flushTraceAggregates();
    const snapshot = metricsSnapshot(reason);
    if (v2State.peerSupportsV2) emitV2Control("metrics", snapshot, { force: true });
    else emit("metrics", snapshot);
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
      if (v2State.peerSupportsV2 && !v2State.recording) return;
      emitMetrics("interval");
    }, METRICS_INTERVAL_MS);
  }

  function handshakePayload(reason = "hello") {
    const versions = manifestInfo();
    const page = pageState();
    return {
      reason,
      protocolVersion: 1,
      supportedProtocolVersions: [1, 2],
      supportedProtocols: SUPPORTED_PROTOCOLS,
      qolVersion: versions.version,
      browser: browserName(),
      presenceState: "present",
      runState: runState(),
      pageSessionId: sessionId,
      routeType: page.routeType,
      runtimePlan: page.runtimePlan,
      build: page.build,
      buildRevision: page.build.revision,
      moduleHashes: MODULE_HASHES,
      settings: settingsSnapshot(),
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
    const payload = handshakePayload(reason);
    const now = Date.now();
    const signature = JSON.stringify({
      qolVersion: payload.qolVersion,
      runState: payload.runState,
      routeType: payload.routeType,
      runtimePlan: payload.runtimePlan,
      buildRevision: payload.buildRevision,
      settings: payload.settings,
      activeBundles: payload.activeBundles
    });
    if (signature === state.lastHandshakeSignature && now - Number(state.lastHandshakeAt || 0) < 2500 && !["startup", "visible", "version-recovery"].includes(reason)) {
      return false;
    }
    state.lastHandshakeSignature = signature;
    state.lastHandshakeAt = now;
    emit("handshake", payload, { force: true });
    return true;
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

  DS.diagEvent = function diagEvent(feature, event, meta = {}) {
    return emit("feature-event", {
      feature: String(feature || "qol").slice(0, 80),
      event: String(event || "event").slice(0, 100),
      ...safeValue(meta || {})
    });
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
    const extraMeta = result && typeof result === "object" ? { ...result } : {};
    const explicitMeta = extraMeta.meta && typeof extraMeta.meta === "object" ? { ...extraMeta.meta } : {};
    delete extraMeta.meta;
    delete extraMeta.counts;
    delete extraMeta.scanned;
    delete extraMeta.changed;
    delete extraMeta.skipped;
    delete extraMeta.errors;
    delete extraMeta.outcome;
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
      outcome: String(result?.outcome || "ok").slice(0, 40),
      meta: safeValue({ ...explicitMeta, ...extraMeta })
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

  // Diagnostic Protocol v2 layers richer, batched telemetry on top of the
  // established v1 calls. Existing feature code does not need to know which
  // Inspector version is connected.
  const legacyDiagEvent = DS.diagEvent;
  const legacyDiagOperationStart = DS.diagOperationStart;
  const legacyDiagOperationEnd = DS.diagOperationEnd;
  const legacyDiagNetworkStart = DS.diagNetworkStart;
  const legacyDiagNetworkEnd = DS.diagNetworkEnd;

  DS.diagEvent = function diagEventV2(feature, event, meta = {}) {
    if (v2State.peerSupportsV2 && !v2State.recording) return false;
    const result = legacyDiagEvent?.(feature, event, meta);
    queueTrace("feature-event", { feature: String(feature || "qol").slice(0, 80), event: String(event || "event").slice(0, 100), ...safeTraceValue(meta || {}) });
    return result;
  };

  DS.diagOperationStart = function diagOperationStartV2(feature, operation = "run", meta = {}) {
    if (v2State.peerSupportsV2 && !v2State.recording) return null;
    const token = legacyDiagOperationStart?.(feature, operation, meta);
    if (!token) return token;
    token.parentOperationId = Object.prototype.hasOwnProperty.call(meta || {}, "parentOperationId")
      ? String(meta?.parentOperationId || "")
      : String(currentParentOperationId() || "");
    token.heapBefore = Number(performance?.memory?.usedJSHeapSize || 0);
    v2State.operationStack.push(token.id);
    queueTrace("operation-start", {
      id: token.id,
      parentOperationId: token.parentOperationId,
      attribution: "confirmed-qol",
      feature: token.feature,
      operation: token.operation,
      heapBefore: token.heapBefore || 0,
      meta: safeTraceValue(meta || {})
    });
    return token;
  };

  DS.diagOperationEnd = function diagOperationEndV2(token, result = {}) {
    if (token) {
      const index = v2State.operationStack.lastIndexOf(token.id);
      if (index >= 0) v2State.operationStack.splice(index, 1);
      const durationMs = Math.max(0, performance.now() - Number(token.startedAt || performance.now()));
      const heapAfter = Number(performance?.memory?.usedJSHeapSize || 0);
      const safeResult = safeTraceValue(result || {}) || {};
      queueTrace("operation-end", {
        id: token.id,
        parentOperationId: String(token.parentOperationId || ""),
        attribution: "confirmed-qol",
        feature: String(token.feature || "unknown").slice(0, 80),
        operation: String(token.operation || "run").slice(0, 80),
        outcome: String(result?.outcome || "ok").slice(0, 60),
        counts: safeTraceValue(result?.counts || {}) || {},
        meta: safeTraceValue(result?.meta || {}) || {},
        durationMs: Math.round(durationMs * 10) / 10,
        heapBefore: Number(token.heapBefore || 0),
        heapAfter,
        heapDelta: token.heapBefore && heapAfter ? heapAfter - token.heapBefore : 0,
        result: safeResult
      }, { critical: durationMs >= 200 });
    }
    return legacyDiagOperationEnd?.(token, result) || false;
  };

  DS.diagNetworkStart = function diagNetworkStartV2(feature, method, url, meta = {}) {
    if (v2State.peerSupportsV2 && !v2State.recording) return null;
    const token = legacyDiagNetworkStart?.(feature, method, url, meta);
    if (!token) return token;
    token.parentOperationId = token.triggerOperationId || currentParentOperationId();
    queueTrace("network-start", {
      requestId: token.id,
      parentOperationId: token.parentOperationId,
      attribution: "confirmed-qol",
      feature: token.feature,
      method: token.method,
      endpoint: token.endpoint,
      fingerprint: token.fingerprint,
      meta: safeTraceValue(meta || {})
    });
    return token;
  };

  DS.diagNetworkEnd = function diagNetworkEndV2(token, result = {}) {
    if (token) {
      const durationMs = Math.max(0, performance.now() - Number(token.startedAt || performance.now()));
      queueTrace("network-end", {
        requestId: token.id,
        parentOperationId: String(token.parentOperationId || token.triggerOperationId || ""),
        attribution: "confirmed-qol",
        feature: token.feature,
        method: token.method,
        endpoint: token.endpoint,
        fingerprint: token.fingerprint,
        durationMs: Math.round(durationMs * 10) / 10,
        status: Number(result?.status || 0),
        ok: result?.ok === true,
        outcome: String(result?.outcome || (result?.ok ? "ok" : "failed")).slice(0, 60)
      }, { critical: !result?.ok || durationMs >= 1000 });
    }
    return legacyDiagNetworkEnd?.(token, result) || false;
  };

  DS.traceEvent = function traceEvent(feature, event, meta = {}, options = {}) {
    return queueTrace("feature-event", { feature: String(feature || "qol").slice(0, 80), event: String(event || "event").slice(0, 100), ...safeTraceValue(meta || {}) }, options);
  };

  DS.trace = function trace(feature = "qol") {
    const safeFeature = String(feature || "qol").slice(0, 80);
    return {
      event: (event, meta = {}, options = {}) => DS.traceEvent(safeFeature, event, meta, options),
      start: (operation, meta = {}) => DS.diagOperationStart(safeFeature, operation, meta),
      end: (token, result = {}) => DS.diagOperationEnd(token, result)
    };
  };

  DS.diagScheduler = function diagScheduler(action, meta = {}) {
    return queueTrace("scheduler", { feature: String(meta?.feature || "runtime-scheduler").slice(0, 80), action: String(action || "event").slice(0, 80), ...safeTraceValue(meta || {}) }, { level: "deep", critical: action === "error" });
  };

  DS.diagStorage = function diagStorage(action, meta = {}) {
    return queueTrace("storage", { feature: "storage", action: String(action || "event").slice(0, 80), parentOperationId: currentParentOperationId(), ...safeTraceValue(meta || {}) });
  };

  DS.diagWorker = function diagWorker(action, meta = {}) {
    return queueTrace("worker", { feature: String(meta?.feature || "worker").slice(0, 80), action: String(action || "event").slice(0, 80), ...safeTraceValue(meta || {}) }, { critical: /crash|lost|replace|error/i.test(String(action || "")) });
  };

  DS.diagUserAction = function diagUserAction(feature, action, meta = {}) {
    return queueTrace("user-action", { feature: String(feature || "qol").slice(0, 80), action: String(action || "action").slice(0, 100), ...safeTraceValue(meta || {}) });
  };

  DS.diagPerformance = function diagPerformance(event, meta = {}) {
    const name = String(event || "sample").slice(0, 80);
    if (name === "mode-change" && meta?.to) v2State.performanceMode = String(meta.to).slice(0, 40);
    return queueTrace("performance", { feature: "performance", event: name, ...safeTraceValue(meta || {}) }, { critical: name === "mode-change" });
  };

  DS.diagError = function diagError(feature, operation, error, meta = {}) {
    const message = String(error?.message || error || "error").slice(0, 180);
    const stack = String(error?.stack || "").split("\n").slice(0, 6).map(line => line.replace(/https?:\/\/[^\s)]+/g, match => sanitizedEndpoint(match))).join("\n");
    return queueTrace("error", {
      feature: String(feature || "qol").slice(0, 80),
      operation: String(operation || "run").slice(0, 100),
      class: String(error?.name || "Error").slice(0, 80),
      message,
      stack,
      parentOperationId: currentParentOperationId(),
      meta: safeTraceValue(meta || {})
    }, { critical: true });
  };

  DS.isDiagnosticInspectorConnected = () => active();
  DS.isDiagnosticTraceActive = (level = "normal") => v2Active(level);
  DS.getDiagnosticTraceLevel = () => v2State.traceLevel;

  DS.getDiagnosticProtocolState = function getDiagnosticProtocolState() {
    const versions = manifestInfo();
    return {
      protocol: v2State.peerSupportsV2 ? PROTOCOL_V2 : PROTOCOL,
      protocolVersion: v2State.peerSupportsV2 ? 2 : 1,
      supportedProtocols: SUPPORTED_PROTOCOLS,
      traceLevel: v2State.traceLevel,
      recording: !!v2State.recording,
      qolVersion: versions.version,
      buildRevision: pageState().build.revision,
      moduleHashes: MODULE_HASHES,
      settings: settingsSnapshot(),
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
    if (!data || !SUPPORTED_PROTOCOLS.includes(data.protocol) || data.source !== INSPECTOR_SOURCE) return;
    const type = String(data.type || "");
    const isV2 = data.protocol === PROTOCOL_V2 || Number(data?.protocolVersion || data?.payload?.protocolVersion || 0) >= 2;
    activatePeer(data);
    if (type === "recording-stop" || type === "stop" || data?.recording === false || data?.payload?.recording === false) {
      stopTracePeer();
      if (isV2) sendV2Handshake("recording-stop");
      else sendHandshake("recording-stop");
      return;
    }
    if (type === "hello" || type === "ping" || type === "recording-start") {
      if (isV2) {
        sendV2Handshake(type);
        emitMetrics(type);
      } else if (sendHandshake(type)) {
        emitMetrics(type);
      }
      return;
    }
    if (type === "request-metrics" || type === "snapshot") {
      emitMetrics(type);
      if (isV2) flushTraceBatch(true);
      return;
    }
    if (type === "request-trace-flush") {
      flushTraceAggregates();
      flushTraceBatch(true);
      return;
    }
    if (type === "request-handshake") {
      if (isV2) sendV2Handshake(type);
      else sendHandshake(type);
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
    DS.setDatasetIfChanged?.(root, "dsQolDiagnosticProtocolLatest", PROTOCOL_V2);
    DS.setDatasetIfChanged?.(root, "dsQolDiagnosticProtocols", "v1,v2");
    if (versions.version !== "unknown" || !root.dataset.dsQolVersion) DS.setDatasetIfChanged?.(root, "dsQolVersion", versions.version);
    if (root.hasAttribute("data-ds-qol-technical-version")) root.removeAttribute("data-ds-qol-technical-version");
    DS.setDatasetIfChanged?.(root, "dsQolBuild", String(page?.build?.id || "full"));
    DS.setDatasetIfChanged?.(root, "dsQolRevision", String(page?.build?.revision || "unknown"));
    DS.setDatasetIfChanged?.(root, "dsQolPageSession", sessionId);
  }

  function sendDiscoveryHandshake(reason = "presence") {
    if (v2State.peerSupportsV2) return sendV2Handshake(reason);
    const legacy = sendHandshake(reason);
    sendV2Handshake(reason);
    return legacy;
  }

  function startPresenceHeartbeat() {
    if (state.presenceTimer) return;
    state.presenceTimer = setInterval(() => {
      // Hidden/AFK tabs do not need another page message every minute. The
      // marker remains on <html>, and a fresh presence event is sent when the
      // page becomes visible again.
      if (document.visibilityState === "visible") sendDiscoveryHandshake("presence");
    }, PRESENCE_INTERVAL_MS);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    publishDiscoveryMarkers();
    sendDiscoveryHandshake("visible");
  }, false);

  publishDiscoveryMarkers();
  startPresenceHeartbeat();
  setTimeout(() => { sendDiscoveryHandshake("startup"); }, 0);
  // Firefox/early document_start can briefly expose the page before the
  // extension runtime manifest is reachable. Retry a few cheap discovery-only
  // publishes so the marker recovers instead of staying `unknown` for the
  // entire page session.
  [250, 1000, 3000].forEach(delay => setTimeout(() => {
    const before = manifestInfo();
    if (before.version !== "unknown") return;
    publishDiscoveryMarkers();
    const after = manifestInfo();
    if (after.version !== "unknown") sendDiscoveryHandshake("version-recovery");
  }, delay));

  // A tiny discovery marker lets the Inspector know which protocol to ask for
  // without exposing settings, page content, auth, or any saved user data.
  try { publishDiscoveryMarkers(); } catch {}

  DS.runtimeLog?.("info", "diagnostic-protocol", "Dragon's SpicyChat Diagnostic Extension compatibility protocol ready", {
    protocol: PROTOCOL_V2,
    supportedProtocols: SUPPORTED_PROTOCOLS,
    sessionId
  });
})();
