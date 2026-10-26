// Feature-owned options helpers: diagnostics. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function performancePageFamily(path) {
  const value = String(path || "");
  if (/^\/chat\/:id/.test(value) || /^\/chat\//.test(value)) return "chat";
  if (/^\/chatbot\/edit/.test(value) || /^\/chatbot\/create/.test(value)) return "bot-editor";
  if (/^\/lorebook\/(?:edit|create)/.test(value)) return "lorebook-editor";
  if (/^\/creator\//.test(value)) return "creator";
  if (/^\/my-creations\//.test(value)) return "my-creations";
  if (/^\/chats/.test(value)) return "chat-list";
  if (value === "/" || /^\/(?:recommended-bots|favorite-bots)/.test(value)) return "listing";
  return "other";
}

function performanceSnapshotFromContext(context) {
  const runtimeAvailable = !!(context?.runtimeAvailable && context?.pageDiagnostics);
  const runtime = context?.pageDiagnostics?.runtimePerformance || {};
  const perf = Array.isArray(context?.pageDiagnostics?.performance) ? context.pageDiagnostics.performance : [];
  const byName = name => perf.find(entry => String(entry?.name || "").toLowerCase() === name)?.maxMs || 0;
  const page = sanitizeDiagnosticPath(context?.url || "");
  const sampleStartedAt = Number(runtime.sampleStartedAt || 0);
  const sampleSeconds = sampleStartedAt ? Math.max(1, (Date.now() - sampleStartedAt) / 1000) : 0;
  return {
    savedAt: Date.now(),
    page,
    pageFamily: performancePageFamily(page),
    sampleSeconds: Math.round(sampleSeconds * 10) / 10,
    schedulerRuns: Number(runtime.runtimeKernelRuns || 0),
    longTaskMaxMs: Number(runtime.maxLongTaskMs || 0),
    longTasks: Number(runtime.longTasks || 0),
    messageLaneRequests: Number(runtime.messageLaneScheduleRequests || runtime.messageLaneSchedules || 0),
    messageLaneRuns: Number(runtime.messageLaneRuns || 0),
    messageLaneCoalesced: Number(runtime.messageLaneScheduleCoalesced || 0),
    cacheInvalidations: Number(runtime.messageCacheInvalidations || 0),
    mutations: Number(runtime.mutations || 0),
    quickPanelUpdateMaxMs: Number(byName("update panel") || 0),
    quickPanelCreateMaxMs: Number(byName("create panel") || 0),
    quickPanelRefreshCoalesced: Number(runtime.quickPanelUpdateCoalesced || 0),
    runtimePlanCacheHits: Number(runtime.runtimePlanCacheHits || 0),
    buildBundleStepSkips: Number(runtime.buildBundleStepSkips || 0)
  };
}

async function savePerformanceBaseline() {
  const status = $("controlSupportStatus");
  const context = await runtimeMessageWithTimeout({ type: "DS_GET_DIAGNOSTIC_CONTEXT" }, 12000);
  if (!context?.pageDiagnostics) {
    if (status) status.textContent = "No reachable source SpicyChat tab. Open Settings from a SpicyChat tab and try again.";
    return null;
  }
  const snapshot = performanceSnapshotFromContext(context);
  await storageSet({ [PERFORMANCE_BASELINE_KEY]: snapshot });
  if (status) status.textContent = `Performance baseline saved from ${snapshot.page || "the source page"}.`;
  return snapshot;
}

function percentChange(current, baseline) {
  const a = Number(current || 0), b = Number(baseline || 0);
  if (!b) return a ? "new" : "same";
  const pct = ((a - b) / b) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%`;
}

async function comparePerformanceBaseline({ returnText = false } = {}) {
  const result = await storageGet([PERFORMANCE_BASELINE_KEY]);
  const baseline = result[PERFORMANCE_BASELINE_KEY];
  const context = await runtimeMessageWithTimeout({ type: "DS_GET_DIAGNOSTIC_CONTEXT" }, 3000);
  if (!baseline || !context?.pageDiagnostics) {
    const text = !baseline ? "No performance baseline saved yet." : "No reachable source SpicyChat tab for comparison.";
    if (!returnText) { const status = $("controlSupportStatus"); if (status) status.textContent = text; }
    return text;
  }
  const current = performanceSnapshotFromContext(context);
  const baselineSeconds = Number(baseline.sampleSeconds || 0);
  const currentSeconds = Number(current.sampleSeconds || 0);
  const sameFamily = !!baseline.pageFamily && baseline.pageFamily === current.pageFamily;
  const durationRatio = baselineSeconds && currentSeconds ? Math.max(baselineSeconds, currentSeconds) / Math.max(1, Math.min(baselineSeconds, currentSeconds)) : Infinity;
  if (!baseline.pageFamily || !baselineSeconds) {
    const text = "The saved baseline uses the older comparison format. This is expected once after the comparison update: save a new performance baseline now, then compare again after using the same page type for a similar amount of time.";
    if (!returnText) { const status = $("controlSupportStatus"); if (status) status.textContent = text; }
    return text;
  }
  if (!sameFamily || durationRatio > 4) {
    const text = `Baseline not directly comparable: saved ${baseline.pageFamily || baseline.page || "unknown"} for ${Math.round(baselineSeconds)}s, current ${current.pageFamily || current.page || "unknown"} for ${Math.round(currentSeconds)}s. Save a baseline on the same page type after a similar amount of use.`;
    if (!returnText) { const status = $("controlSupportStatus"); if (status) status.textContent = text; }
    return text;
  }
  const perMinute = (value, seconds) => Number(value || 0) * 60 / Math.max(1, Number(seconds || 1));
  const rawMetrics = [
    ["Browser long-task max", "longTaskMaxMs", "ms"],
    ["Mini Panel update max", "quickPanelUpdateMaxMs", "ms"],
    ["Mini Panel create max", "quickPanelCreateMaxMs", "ms"]
  ];
  const rateMetrics = [
    ["Message-lane requests/min", "messageLaneRequests"],
    ["Message-lane runs/min", "messageLaneRuns"],
    ["Cache invalidations/min", "cacheInvalidations"],
    ["DOM mutations/min", "mutations"],
    ["Mini Panel coalesced/min", "quickPanelRefreshCoalesced"],
    ["Runtime-plan cache hits/min", "runtimePlanCacheHits"],
    ["Omitted-bundle skips/min", "buildBundleStepSkips"]
  ];
  const lines = rawMetrics.map(([label, key, unit]) => `${label}: ${baseline[key] || 0}${unit} → ${current[key] || 0}${unit} (${percentChange(current[key], baseline[key])})`);
  for (const [label, key] of rateMetrics) {
    const before = perMinute(baseline[key], baselineSeconds);
    const after = perMinute(current[key], currentSeconds);
    lines.push(`${label}: ${before.toFixed(1)} → ${after.toFixed(1)} (${percentChange(after, before)})`);
  }
  const heading = `Baseline saved ${new Date(Number(baseline.savedAt || 0)).toLocaleString()} · ${baseline.pageFamily} · ${Math.round(baselineSeconds)}s vs ${Math.round(currentSeconds)}s`;
  if (returnText) return [heading, ...lines].join("\n");
  const host = $("controlPerformanceDiff");
  if (host) host.replaceChildren(...lines.map(line => makeElement("div", { className: "control-performance-row", text: line })));
  const status = $("controlSupportStatus");
  if (status) status.textContent = `Compared with a matching ${baseline.pageFamily} baseline. Count metrics are normalized per minute.`;
  return lines.join("\n");
}

async function setupControlCenterView() {
  if (activeOptionsTab() !== "control") return;
  await Promise.all([renderCreatorWorkspace(), renderControlStorageBreakdown()]);
}

function setupControlCenterControls() {
  setupSupportReportFallbackButtons();
  setupSupportFeaturePrivacyControls();
  $("openCommandPaletteFromOptions")?.addEventListener("click", async () => {
    await flushSettingsAutosave({ force: true });
    const status = $("commandPaletteStatus");
    const response = await runtimeMessage({ type: "DS_OPTIONS_OPEN_COMMAND_PALETTE" });
    if (status) status.textContent = response?.ok ? "Palette opened in the SpicyChat source tab." : (response?.error || "Open Settings from a SpicyChat tab first.");
  });
  $("clearCommandPaletteHistory")?.addEventListener("click", async () => {
    const status = $("commandPaletteStatus");
    const response = await runtimeMessage({ type: "DS_OPTIONS_CLEAR_COMMAND_PALETTE" });
    if (status) status.textContent = response?.ok ? "Palette pins and recent actions cleared on the source SpicyChat site." : (response?.error || "Could not reach the source SpicyChat tab.");
  });
  $("openCreatorBackupManager")?.addEventListener("click", () => jumpToOptionsSearch("bot-tools", "backup manager"));
  $("openCreationAuditSettings")?.addEventListener("click", () => jumpToOptionsSearch("bot-tools", "creation audit"));
  $("openWikiImporterSettings")?.addEventListener("click", () => jumpToOptionsSearch("bot-tools", "wiki web lorebook import"));
  $("openDataTools")?.addEventListener("click", () => setActiveTab("data"));
  $("runFullDataHealth")?.addEventListener("click", runFullDataHealth);
  $("runMigrationDryRun")?.addEventListener("click", runMigrationDryRun);
  $("savePerformanceBaseline")?.addEventListener("click", savePerformanceBaseline);
  $("comparePerformanceBaseline")?.addEventListener("click", () => comparePerformanceBaseline());
  $("controlCopySupport")?.addEventListener("click", async () => {
    const status = $("controlSupportStatus");
    if (status) status.textContent = "Building diagnostics, performance, self-check, data health and baseline comparison…";
    const copied = await copyAllSupportInfo();
    if (status) status.textContent = copied
      ? "Full support check copied. It includes no chat text or saved private content."
      : isAndroidSupportWebView()
        ? "Clipboard unavailable; use Support report text in Quick diagnostics."
        : "Clipboard access failed; the full support check was placed in Data & Backup instead.";
  });
  $("controlDownloadSupport")?.addEventListener("click", async () => {
    const status = $("controlSupportStatus");
    if (status) status.textContent = "Building full support check for download…";
    const downloaded = await downloadAllSupportInfo();
    if (status) status.textContent = downloaded
      ? (isAndroidSupportWebView()
          ? (lastAndroidSupportExportState === "native"
              ? "Android accepted the support export request. Check Downloads; completion isn't verified and history was kept."
              : "Android couldn't save a file. The report was copied instead, and saved history was kept.")
          : "Support download requested. Check Downloads; support history was kept unless completion was confirmed.")
      : (isAndroidSupportWebView()
          ? "Android could not export this report. The text remains in Quick diagnostics under Support report text; support history was kept."
          : "Could not download the full support check; review Quick diagnostics for details.");
  });
}

function supportReportFilename(kind = "support-info") {
  const manifest = chrome.runtime.getManifest?.() || {};
  const version = String(manifest.version_name || displayReleaseVersion(manifest.version || "unknown") || "unknown")
    .replace(/[^0-9A-Za-z._-]+/g, "-");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeKind = String(kind || "support-info").replace(/[^0-9A-Za-z._-]+/g, "-");
  return `spicychat-qol-${safeKind}-v${version}-${stamp}.txt`;
}

let lastAndroidSupportExportState = "";
// Android fallback has its own report area. Never repurpose the settings
// import/backup editor for a diagnostic text export.
function showSupportReportFallback(text) {
  const box = $("dsSupportFallbackText");
  const host = $("dsSupportTextFallback");
  if (!box || !host) return false;
  box.value = String(text || "");
  host.hidden = false;
  return true;
}
function setupSupportReportFallbackButtons() {
  $("dsSupportFallbackCopy")?.addEventListener("click", async () => {
    const body = $("dsSupportFallbackText")?.value || "";
    try {
      await navigator.clipboard.writeText(body);
      const status = $("diagnosticsStatus");
      if (status) status.textContent = "Support report text copied.";
    } catch {
      $("dsSupportFallbackText")?.focus();
      $("dsSupportFallbackText")?.select();
      const status = $("diagnosticsStatus");
      if (status) status.textContent = "Clipboard unavailable. Report selected for manual copying.";
    }
  });
  $("dsSupportFallbackSelect")?.addEventListener("click", () => {
    const box = $("dsSupportFallbackText");
    box?.focus();
    box?.select();
  });
}


function isAndroidSupportWebView() {
  return !!(window.flutter_inappwebview?.callHandler || window._dsRequestExport ||
    /\bwv\b|; wv\)|Flutter/i.test(navigator.userAgent || ""));
}

// File saving is a native Android action, not a web anchor download. The
// bridge may acknowledge the request without confirming that a file exists.
// Never clear history on the strength of this acknowledgement alone.
async function requestAndroidSupportFile(text, filename) {
  const body = String(text || "");
  if (!body) return false;
  const bridge = window.flutter_inappwebview;
  if (bridge?.callHandler) {
    const payload = { text: body, content: body, filename, fileName: filename,
      mimeType: "text/plain;charset=utf-8", byteLength: new TextEncoder().encode(body).byteLength };
    for (const handler of ["exportChat", "saveFile"]) {
      try {
        // Do not leave Options stuck forever if a WebView handler has stalled.
        // An uncertain request must not be retried through a second handler:
        // the first one might still finish and create a duplicate download.
        let timer;
        const response = await Promise.race([
          Promise.resolve().then(() => bridge.callHandler(handler, JSON.stringify(payload)))
            .then(value => ({ value }), error => ({ error })),
          new Promise(resolve => { timer = setTimeout(() => resolve({ timedOut: true }), 25000); })
        ]);
        clearTimeout(timer);
        if (response.timedOut) return false;
        if (response.error) continue;
        let result = response.value;
        // Some Flutter handlers return JSON strings, others objects/booleans.
        if (typeof result === "string" && result.trim().startsWith("{")) {
          try { result = JSON.parse(result); } catch {}
        }
        if (result === false || result?.success === false || result?.ok === false || result?.error) continue;
        const reportedBytes = result && typeof result === "object"
          ? Number(result.bytesWritten ?? result.savedBytes ?? result.fileSize ?? result.byteCount ?? NaN)
          : NaN;
        // An explicit zero-byte result is a failed export, not a success.
        if (Number.isFinite(reportedBytes) && reportedBytes <= 0) continue;
        return true; // Accepted, NOT a confirmed file write.
      } catch {}
    }
  }
  if (typeof window._dsRequestExport === "function") {
    try {
      const result = await window._dsRequestExport(body, filename);
      return result !== false && result?.success !== false && result?.ok !== false;
    } catch {}
  }
  return false;
}

async function preserveAndroidSupportFallback(text) {
  const hasReportArea = showSupportReportFallback(text);
  const box = hasReportArea ? null : $("settingsJson");
  if (box) box.value = String(text || "");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(text || ""));
      return { copied: true, selectable: hasReportArea || !!box };
    }
  } catch {}
  if (box) {
    setActiveTab("data");
    box.focus();
    box.select();
  }
  return { copied: false, selectable: hasReportArea || !!box };
}

async function downloadSupportText(text, filename, successMessage = "Support report downloaded.") {
  const status = $("diagnosticsStatus");
  const body = String(text || "");
  if (!body.trim()) {
    if (status) status.textContent = "There is no report to download yet.";
    return false;
  }

  const mime = "text/plain;charset=utf-8";
  if (isAndroidSupportWebView()) {
    const accepted = await requestAndroidSupportFile(body, filename);
    const fallback = await preserveAndroidSupportFallback(body);
    lastAndroidSupportExportState = accepted ? "native" : fallback.copied ? "copied" : "manual";
    if (status) status.textContent = accepted
      ? `Sent ${filename} to Android's file exporter. Check Downloads; the app cannot confirm the file was written.${fallback.copied ? " A copy was also placed on the clipboard." : ""}`
      : (fallback.copied
          ? "Android file export was unavailable. Report copied instead; no file has been verified."
          : "Android file export and clipboard are unavailable. Report is available in Support report text for manual copying.");
    // Copying text is NOT evidence that a file download started.
    return accepted;
  }
  try {
    if (await tryNativeBackupSave(body, filename, mime)) {
      if (status) status.textContent = successMessage;
      return true;
    }
  } catch {}

  try {
    if (chrome.permissions?.contains) {
      const allowed = await new Promise(resolve => {
        try { chrome.permissions.contains({ permissions: ["downloads"] }, value => resolve(!chrome.runtime.lastError && !!value)); }
        catch { resolve(false); }
      });
      if (allowed && await browserManagerDownload(body, filename, mime, true)) {
        if (status) status.textContent = successMessage;
        return true;
      }
    }
  } catch {}

  try {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (status) status.textContent = successMessage;
    return true;
  } catch (error) {
    const box = $("settingsJson");
    if (box) {
      box.value = body;
      setActiveTab("data");
      box.focus();
      box.select();
    }
    if (status) status.textContent = `Download failed${error?.message ? `: ${error.message}` : "."} The report was placed in Data / Backup instead.`;
    return false;
  }
}

function sanitizeDiagnosticPath(url) {
  try {
    const parsed = new URL(url || "");
    return parsed.pathname
      .replace(/\/(chat|chats|chatbot|story|lorebook)\/[0-9a-f-]{8,}/ig, "/$1/:id")
      .replace(/\/(creator|profile)\/[^/]+/ig, "/$1/:name");
  } catch {
    return "unknown";
  }
}

// Support files are regularly shared in public bug threads. Report feature counts
// by category by default; exact option names need an explicit, session-only choice.
function supportIncludeFeatureNames() {
  return !!document.querySelector('[data-ds-support-feature-names]:checked');
}

function supportFeatureCounts(enabledKeys) {
  const categories = {
    "Chat and memory": 0,
    "Bot discovery and filtering": 0,
    "Lorebooks and creation": 0,
    "Personas": 0,
    "Interface and appearance": 0,
    "Other tools": 0
  };
  for (const name of enabledKeys) {
    if (/context|memory|chat|message|ooc|reply|rpstate|story|generation|translation|bookmark/i.test(name)) categories["Chat and memory"]++;
    else if (/block|filter|favorite|later|creatorBot|listing|card|botStatus|dislike|lessLike/i.test(name)) categories["Bot discovery and filtering"]++;
    else if (/lorebook|botCreation|creation|editor|tagAlias|wiki/i.test(name)) categories["Lorebooks and creation"]++;
    else if (/persona/i.test(name)) categories.Personas++;
    else if (/hide|show|background|bubble|scroll|sidebar|panel|theme|focus|image|animation/i.test(name)) categories["Interface and appearance"]++;
    else categories["Other tools"]++;
  }
  return Object.entries(categories).map(([category, count]) => `${category} ${count}`).join("; ");
}

// Only simple metrics and sanitized names are exported. No chat content is
// collected by this sanitizer and no report is uploaded anywhere.
function sanitizeSupportReportText(raw) {
  return String(raw || "")
    .replace(/\b(?:https?:\/\/|wss?:\/\/)[^\s<>"']+/gi, "[URL omitted]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[ID omitted]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email omitted]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+\/-]+/gi, "$1 [redacted]")
    .replace(/((?:["']?)(?:authorization|cookie|x-guest-userid|guestuserid|access_token|refresh_token|sessionId|api_key)(?:["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;|}]+)/gi, "$1[redacted]");
}

function setupSupportFeaturePrivacyControls() {
  const toggles = [...document.querySelectorAll('[data-ds-support-feature-names]')];
  for (const toggle of toggles) {
    toggle.checked = false;
    toggle.addEventListener('change', () => {
      for (const other of toggles) if (other !== toggle) other.checked = toggle.checked;
    });
  }
}

async function copyDiagnostics({ returnOnly = false } = {}) {
  const status = $("diagnosticsStatus");
  if (status && !returnOnly) status.textContent = "Building diagnostic info...";

  const diagnosticStorageKeys = [
    "settings",
    OPENED_KEY,
    BLOCKED_BOTS_KEY,
    NOT_INTERESTED_KEY,
    FAVORITE_CREATORS_KEY,
    FOLLOWED_CREATORS_KEY,
    FAVORITE_BOTS_KEY,
    LATER_BOTS_KEY,
    BOT_ORGANIZER_KEY,
    CHAT_ORGANIZER_KEY,
    PERSONAS_KEY,
    LEGACY_PERSONAS_KEY,
    PERSONA_ORG_KEY,
    OOC_TEMPLATES_KEY,
    GENERATION_PROFILES_KEY,
    SMART_FILTER_PRESETS_KEY,
    SMART_FILTER_PINNED_KEY,
    BOT_EDITOR_DRAFT_HISTORY_KEY,
    CHAT_BOOKMARKS_KEY,
    SAI_TOOLKIT_PRESENCE_KEY,
    SPICYCHAT_BETA_CAPABILITIES_KEY,
    "cardTokenFetchDiagnosticsV1"
  ];

  // Support diagnostics must degrade per source instead of losing the whole
  // section because one large/local store stalls after an extension restart.
  const [resultValue, context, bytesValue, largeStatsValue, recoverySnapshotMeta] = await Promise.all([
    promiseWithValueTimeout(storageGet(diagnosticStorageKeys), 3500, null),
    runtimeMessageWithTimeout({ type: "DS_GET_DIAGNOSTIC_CONTEXT" }, 3500),
    promiseWithValueTimeout(storageBytesInUse(null), 2000, null),
    promiseWithValueTimeout(readLargeStorageStats(), 2500, null),
    promiseWithValueTimeout(readRecoverySnapshotMeta(), 2000, null)
  ]);
  const result = resultValue && typeof resultValue === "object" ? resultValue : {};
  const bytes = Number(bytesValue);
  const largeStorageStats = largeStatsValue && typeof largeStatsValue === "object" ? largeStatsValue : {};
  const largeStorageStatsAvailable = !!(largeStatsValue && typeof largeStatsValue === "object");
  const largeStorageCount = key => {
    if (!largeStorageStatsAvailable || !Object.prototype.hasOwnProperty.call(largeStorageStats, key)) return "unavailable";
    const value = Number(largeStorageStats[key]);
    return Number.isFinite(value) ? String(value) : "unavailable";
  };
  const partialSources = [];
  if (!resultValue) partialSources.push("local dataset summary");
  if (!Number.isFinite(bytes)) partialSources.push("storage size");
  if (!largeStatsValue) partialSources.push("large-data counts");

  const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  const enabledFeatures = OPTIONAL_FEATURE_KEYS.filter(key => settings[key] === true);
  const personas = Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY] : result[LEGACY_PERSONAS_KEY];

  const diagnosticLines = [
    "SpicyChat QoL diagnostics",
    `Generated: ${new Date().toISOString()}`,
    `Version: ${chrome.runtime.getManifest?.().version_name || displayReleaseVersion(chrome.runtime.getManifest?.().version || "unknown")}`,
    `Browser: ${navigator.userAgent}`,
    `Platform: ${navigator.platform || "unknown"}`,
    (() => { const p = context?.pageDiagnostics?.buildProfile; return context?.runtimeAvailable && context?.pageDiagnostics ? `Build profile: ${p?.label || p?.id || "Full"}; bundles ${(p?.bundles || []).join(", ") || "unknown"}` : "Build profile: unavailable with runtime data"; })(),
    `SpicyChat page: ${sanitizeDiagnosticPath(context?.url || "")}`,
    `Runtime data: ${context?.runtimeAvailable && context?.pageDiagnostics ? "available" : `unavailable — ${context?.runtimeStatus || "runtime-unreachable"}${context?.runtimeError ? ` (${context.runtimeError})` : ""}; runtime counters below are omitted or unavailable`}`,
    (() => { const p = context?.pageDiagnostics?.diagnosticProtocol; return p ? `Dragon's SpicyChat Diagnostic Extension protocol: v${Number(p.protocolVersion || 1)}; ${p.inspectorConnected ? `paired${p.inspectorVersion ? ` with Inspector ${p.inspectorVersion}` : " with Inspector"}` : "Inspector not currently paired"}; QoL ${p.runState || "unknown"}` : "Dragon's SpicyChat Diagnostic Extension protocol: unavailable with runtime data"; })(),
    `S.AI Toolkit detected: ${result[SAI_TOOLKIT_PRESENCE_KEY]?.detected ? "yes" : "no"}`,
    (() => { const beta = result[SPICYCHAT_BETA_CAPABILITIES_KEY] || {}; const caps = beta.capabilities || {}; const rulebooks = caps.rulebooks && caps.rulebooks !== "unknown" ? `; Rulebooks ${caps.rulebooks}` : ""; return `SpicyChat beta/experimental access: ${beta.detected ? "detected" : "not detected"}; Public Lorebooks ${caps.publicLorebooks || "unknown"}; Story Mode ${caps.storyMode || "unknown"}${rulebooks}`; })(),
    `S.AI compatibility enabled: ${settings.saiToolkitCompatibility ? "yes" : "no"}`,
    Number.isFinite(bytes) ? `chrome.storage.local: ${(bytes / 1024).toFixed(1)} KB` : "chrome.storage.local: unavailable",
    `Backup schema supported: v${BACKUP_FORMAT_VERSION}`,
    (() => {
      const platform = PLATFORM_API?.detectEnvironment?.() || detectSettingsEnvironment();
      const desired = { ...DEFAULT_SETTINGS, ...(loadedSettingsSnapshot || settings) };
      const compatibility = PLATFORM_API?.applyEffectiveSettings?.(desired, DEFAULT_SETTINGS, platform);
      const dormantCount = Object.keys(compatibility?.dormant || {}).length;
      return `QoL device compatibility: ${platform?.label || platform?.platform || "unknown"}; schema v${Number(PLATFORM_API?.schemaVersion || 0) || "unavailable"}; ${dormantCount} saved preference${dormantCount === 1 ? "" : "s"} inactive on this device`;
    })(),
    recoverySnapshotMeta ? `Recovery snapshot: yes (${recoverySnapshotMeta.createdAt ? new Date(recoverySnapshotMeta.createdAt).toISOString() : "details load on demand"}; ${recoverySnapshotMeta.reason})` : "Recovery snapshot: none",
    `Opened: ${countStoreItems(result[OPENED_KEY], "opened")}`,
    `Blocked: ${countStoreItems(result[BLOCKED_BOTS_KEY])}`,
    `Not interested: ${countStoreItems(result[NOT_INTERESTED_KEY])}`,
    `Favorite bots: ${countStoreItems(result[FAVORITE_BOTS_KEY])}`,
    `Favorite creators: ${countStoreItems(result[FAVORITE_CREATORS_KEY], "creator")}`,
    `Followed creators: ${countStoreItems(result[FOLLOWED_CREATORS_KEY], "creator")}`,
    `Later: ${countStoreItems(result[LATER_BOTS_KEY])}`,
    `Bot organization: ${Object.keys(result[BOT_ORGANIZER_KEY]?.meta || {}).length}`,
    `Chat organization: ${Object.keys(normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]).meta).length}`,
    `Bot availability checks: ${largeStorageCount(BOT_AVAILABILITY_KEY)}`,
    `Saved bot copies: ${largeStorageCount(BOT_ARCHIVE_KEY)}`,
    `Tracked Lorebook status: ${largeStorageCount(LOREBOOK_STATUS_KEY)}`,
    `Large-data IndexedDB: ${largeStorageCount(BOT_AVAILABILITY_KEY)} availability records · ${largeStorageCount(BOT_ARCHIVE_KEY)} archive records · ${largeStorageCount(LOREBOOK_STATUS_KEY)} Lorebook status records`,
    `Personas: ${countStoreItems(personas, "persona")}`,
    `Persona organization: ${Object.keys(result[PERSONA_ORG_KEY]?.meta || {}).length}`,
    `OOC presets: ${countStoreItems(result[OOC_TEMPLATES_KEY], "ooc")}`,
    `Generation profiles: ${countStoreItems(result[GENERATION_PROFILES_KEY], "profiles")}`,
    `Smart filter presets: ${normalizeSmartFilterPresets(result[SMART_FILTER_PRESETS_KEY]).length}; pinned: ${normalizeSmartFilterPins(result[SMART_FILTER_PINNED_KEY], result[SMART_FILTER_PRESETS_KEY]).length}`,
    `Editor draft snapshots: ${Object.values(normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]).entries).reduce((n, list) => n + list.length, 0)}`,
    `Message bookmarks: ${Object.values(result[CHAT_BOOKMARKS_KEY] || {}).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0)}`,
    `Enabled optional features: ${enabledFeatures.length} of ${OPTIONAL_FEATURE_KEYS.length} available; ${supportFeatureCounts(enabledFeatures)}`,
    ...(supportIncludeFeatureNames() ? [`Enabled feature names (explicit opt-in): ${enabledFeatures.join(", ") || "none"}`] : []),
    ...(partialSources.length ? [`Partial diagnostics: ${partialSources.join(", ")} timed out or were unavailable; the rest of this section is still valid.`] : [])
  ];

  const runtimeLog = Array.isArray(context?.pageDiagnostics?.runtimeLog) ? context.pageDiagnostics.runtimeLog.slice(-60) : [];
  if (runtimeLog.length) {
    const grouped = new Map();
    for (const entry of runtimeLog) {
      const area = String(entry?.area || "runtime").replace(/[^a-z0-9-]/gi, "").slice(0, 32) || "runtime";
      const level = /^(warn|error)$/i.test(entry?.level || "") ? String(entry.level).toLowerCase() : "info";
      const group = `${area}/${level}`;
      grouped.set(group, (grouped.get(group) || 0) + 1);
    }
    diagnosticLines.push(`QoL runtime log: ${runtimeLog.length} events (only category and severity totals, no messages or IDs)`);
    diagnosticLines.push(`  ${[...grouped].map(([label, count]) => `${label} ${count}`).join("; ")}`);
  } else {
    diagnosticLines.push(context?.runtimeAvailable ? "QoL runtime log: no recent entries" : "QoL runtime log: unavailable because no open SpicyChat content runtime responded");
  }

  const tokenFetchDiag = result.cardTokenFetchDiagnosticsV1 && typeof result.cardTokenFetchDiagnosticsV1 === "object" ? result.cardTokenFetchDiagnosticsV1 : null;
  if (tokenFetchDiag) {
    diagnosticLines.push(`Card token fetch: background ${Number(tokenFetchDiag.requests || 0)} requests / ${Number(tokenFetchDiag.successes || 0)} success; MAIN-world ${Number(tokenFetchDiag.mainWorldRequests || 0)} requests / ${Number(tokenFetchDiag.mainWorldSuccesses || 0)} success / ${Number(tokenFetchDiag.mainWorldFailures || 0)} failed, captured-auth ${Number(tokenFetchDiag.mainWorldCapturedAuth || 0)}; ${Number(tokenFetchDiag.timeouts || 0)} background timeouts; HTTP 401 ${Number(tokenFetchDiag.http401 || 0)}, 403 ${Number(tokenFetchDiag.http403 || 0)}, 404 ${Number(tokenFetchDiag.http404 || 0)}, 429 ${Number(tokenFetchDiag.http429 || 0)}, other ${Number(tokenFetchDiag.httpOther || 0)}; network ${Number(tokenFetchDiag.networkFailures || 0)}; parse ${Number(tokenFetchDiag.parseFailures || 0)}; auth provided ${Number(tokenFetchDiag.authProvided || 0)} / missing ${Number(tokenFetchDiag.authMissing || 0)}; IndexedDB auth ${Number(tokenFetchDiag.indexedDbAuth || 0)}; last ${tokenFetchDiag.lastStatus || "none"}${Number(tokenFetchDiag.lastHttpStatus || 0) ? ` HTTP ${Number(tokenFetchDiag.lastHttpStatus || 0)}` : ""} in ${Number(tokenFetchDiag.lastElapsedMs || 0)} ms`);
  } else {
    diagnosticLines.push("Card token fetch: no background fetch attempts recorded yet");
  }
  {
    const archiveRuntime = context?.pageDiagnostics?.runtimePerformance || {};
    diagnosticLines.push(`Bot archive preservation: ${Number(archiveRuntime.botArchiveSeenQueued || 0)} public observations queued; ${Number(archiveRuntime.botArchiveSeenMerged || 0)} merged in ${Number(archiveRuntime.botArchiveSeenBatches || 0)} batched flushes; ${Number(archiveRuntime.botArchiveSeenUnchanged || 0)} unchanged snapshots skipped; ${Number(archiveRuntime.botArchiveWrites || 0)} archive writes; ${Number(archiveRuntime.ownBotBackupSaves || 0)} own-bot editor saves`);
  }

  const refill = context?.pageDiagnostics?.listingRefill;
  if (refill) {
    diagnosticLines.push(`Listing refill: ${Number(refill.visible || 0)}/${Number(refill.target || settings.autoFillTargetCards || 50)} visible; ${Number(refill.hidden || 0)} hidden; ${Number(refill.pagesLoaded || 0)} helper pages; ${Number(refill.received || 0)} cards received; ${Number(refill.metadataExtracted || 0)} metadata records; ${Number(refill.tagsRestored || 0)} tag rows rebuilt; ${Number(refill.appended || 0)} added; ${Number(refill.duplicates || 0)} duplicates; ${Number(refill.blockedRejected || 0)} blocked rejects (${Number(refill.blockedBotRejected || 0)} explicit bots, ${Number(refill.blockedCreatorRejected || 0)} creators, ${Number(refill.blockedTagRejected || 0)} tags, ${Number(refill.blockedWordRejected || 0)} words); ${Number(refill.languageRejected || 0)} language rejects; ${Number(refill.smartFilterRejected || 0)} Smart Filter rejects; ${Number(refill.helperFailures || 0)} helper failures; ${Number(refill.helperReuses || 0)} helper reuses; ${Number(refill.helperRecoveries || 0)} helper recoveries; ${Number(refill.helperGcClosed || 0)} stale helper tabs closed; last page ${Number(refill.lastPage || 0) || "—"}; ${refill.running ? (refill.stopping ? "stopping" : "running") : (refill.paused ? "paused" : "idle")}${refill.lastError ? `; last error: ${refill.lastError}` : ""}`);
  }

  if (settings.performanceDiagnostics && Array.isArray(context?.pageDiagnostics?.performance)) {
    const perf = context.pageDiagnostics.performance.slice(0, 15);
    diagnosticLines.push(`QoL performance mode: ${context?.pageDiagnostics?.runtimePerformance?.mode || settings.runtimePerformanceMode || "adaptive"}`);
    const runtime = context?.pageDiagnostics?.runtimePerformance || {};
    diagnosticLines.push(`QoL scheduler: plan ${runtime.currentRuntimePlan || "unknown"}; ${Number(runtime.schedules || 0)} schedules; ${Number(runtime.messageLaneRuns || 0)} message-lane runs; ${Number(runtime.messageLaneScheduleCoalesced || 0)} duplicate lane schedules coalesced; ${Number(runtime.messageLaneDirtyRoots || 0)} dirty roots processed; last lane ${Number(runtime.lastMessageLaneDirtyRoots || 0)} roots; ${Number(runtime.historyBatches || 0)} history batches; ${Number(runtime.slowLaneQuietDeferrals || 0)} quiet-gap deferrals; ${Number(runtime.disabledFeatureStepSkips || 0)} disabled-feature steps skipped; ${Number(runtime.routeFeatureStepSkips || 0)} off-route feature steps skipped; ${Number(runtime.buildBundleStepSkips || 0)} omitted-bundle steps skipped; ${Number(runtime.runtimeKernelRuns || 0)} individual feature dispatches (several per pass); ${Number(runtime.runtimePlanCacheHits || 0)} runtime-plan cache hits; ${Number(runtime.mutations || 0)} mutations; ${Number(runtime.chatLocalMutations || 0)} chat-local; ${Number(runtime.qolOnlyMutations || 0)} QoL-only ignored; ${Number(runtime.deferredWhileScrolling || 0)} scroll deferrals; ${Number(runtime.desktopAppGuardDelays || 0)} desktop-app guard delays; ${Number(runtime.quickPanelStateSkips || 0)} unchanged Mini Panel refreshes skipped; ${Number(runtime.quickPanelLayoutSkips || 0)} unchanged Mini Panel layouts skipped; ${Number(runtime.quickPanelUpdateCoalesced || 0)} rapid Mini Panel refreshes coalesced; ${Number(runtime.loadedChatMessages || 0)} loaded messages; history low-impact ${runtime.historyBatchActive ? "active" : "inactive"}`);
    diagnosticLines.push(`Message decoration: ${Number(runtime.messageLaneChunkedPasses || 0)} chunked passes; ${Number(runtime.messageLaneChunkedRoots || 0)} roots in chunks; ${Number(runtime.messageLaneDeferredRoots || 0)} older roots deferred; ${Number(runtime.messageEnhancerIncrementalLanePasses || 0)} lane-only enhancer passes; ${Number(runtime.criticalMessageEnhancerPassesDeferred || 0)} critical full-message passes moved to the incremental lane; Mini Panel render-quiet deferrals ${Number(runtime.quickPanelRenderQuietDeferrals || 0)}`);
    diagnosticLines.push(`Storage write batching: ${Number(runtime.storageWriteRequests || 0)} save requests → ${Number(runtime.storageWriteBatches || 0)} browser writes; ${Number(runtime.storageWriteMergedKeys || 0)} same-key writes merged; ${Number(runtime.storageWriteImmediateFlushes || 0)} immediate flushes`);
    diagnosticLines.push(`Message edit guard: ${Number(runtime.messageEditGuardsStarted || 0)} started; ${Number(runtime.messageEditGuardsSettled || 0)} settled; ${Number(runtime.messageEditMutationSkips || 0)} edit mutations skipped; ${Number(runtime.messageEditLaneSkips || 0)} lane runs skipped; ${Number(runtime.messageEditCriticalSkips || 0)} critical runs skipped`);
    diagnosticLines.push(`Chat header self-repair: ${Number(runtime.chatHeaderRepairRequests || 0)} repair requests; last source ${runtime.lastChatHeaderRepairSource || "none"}`);
    if (context?.pageDiagnostics?.chatLayout) {
      const layout = context.pageDiagnostics.chatLayout;
      diagnosticLines.push(`Chat layout: viewport ${Number(layout.viewport || 0)} px; root ${Number(layout.root || 0)} px; composer host ${Number(layout.composer || 0)} px; title host ${Number(layout.titleHost || 0)} px; title ${Number(layout.title || 0)} px`);
      diagnosticLines.push(`Composer shortcuts: ${layout.shortcutPlacement || "none"}; holder ${Number(layout.shortcutWidth || 0)} px; ${Number(layout.shortcutControls || 0)} controls; textarea right padding ${layout.textareaPaddingRight || "unknown"}; overlap ${layout.shortcutOverlap ? "YES" : "no"}`);
    }
    diagnosticLines.push(`Opened-history persistence: queued ${Number(runtime.openedSaveQueued || 0)}; coalesced ${Number(runtime.openedSaveCoalesced || 0)}; flushes ${Number(runtime.openedSaveFlushes || 0)}; pending ${Number(runtime.openedSavePending || 0)}; last ${Number(runtime.openedSaveLastMs || 0)} ms`);
    diagnosticLines.push(`Saved/opened lane: ${Number(runtime.savedOpenedLaneSchedules || 0)} schedules; ${Number(runtime.savedOpenedLaneRuns || 0)} runs; last source ${runtime.lastSavedOpenedLaneSource || "none"}`);
    const blockBatchRemaining = runtime.blockedBotRefreshPending ? Math.max(0, Math.ceil((Number(runtime.blockedBotRefreshSettleAt || 0) - Date.now()) / 1000)) : 0;
    diagnosticLines.push(`Blocked-bot refresh batching: ${Number(runtime.blockedBotRefreshDeferrals || 0)} deferred single-block changes; ${Number(runtime.blockedBotRefreshFlushes || 0)} settled refreshes; ${runtime.blockedBotRefreshPending ? `pending (${blockBatchRemaining}s remaining)` : "idle"}`);
    diagnosticLines.push(`Listing name sort: ${runtime.listingSortMode || "native"}; ${Number(runtime.listingSortLoadedCards || 0)} loaded cards; ${Number(runtime.listingSortReorders || 0)} DOM reorders`);
    diagnosticLines.push(`Notification auto-read: ${Number(runtime.notificationAutoReadAttempts || 0)} attempts; ${Number(runtime.notificationAutoReadClicks || 0)} native clicks; ${Number(runtime.notificationAutoReadSuccesses || 0)} cleared; ${Number(runtime.notificationAutoReadUncleared || 0)} still unread; ${Number(runtime.notificationAutoReadMissingButtons || 0)} missing-button checks; ${Number(runtime.notificationAutoReadFailures || 0)} failures; last source ${runtime.notificationAutoReadLastSource || "none"}`);
    diagnosticLines.push(`Incremental chat work: search ${Number(runtime.chatSearchIncrementalUpdates || 0)} updates / ${Number(runtime.chatSearchFullPasses || 0)} full passes; message actions ${Number(runtime.messageOptionsIncrementalUpdates || 0)}; alternate dialogue ${Number(runtime.alternateDialogueIncrementalUpdates || 0)}; translation ${Number(runtime.translationIncrementalUpdates || 0)}`);
    diagnosticLines.push(`Installed desktop-app performance guard: ${runtime.desktopAppGuardActive ? "active" : "inactive"}`);
    diagnosticLines.push(`Chat visibility: ${Number(runtime.chatUnexpectedEmptyTransitions || 0)} sudden empty transitions; ${Number(runtime.chatUnexpectedEmptyRecovered || 0)} recovered without reload; ${Number(runtime.chatUnexpectedEmptyUnresolved || 0)} still empty after checks; last before ${Number(runtime.chatUnexpectedEmptyLastBefore || 0)} messages; last empty ${Number(runtime.chatUnexpectedEmptyLastAt || 0) ? new Date(Number(runtime.chatUnexpectedEmptyLastAt)).toISOString() : "none"}; last recovery ${Number(runtime.chatUnexpectedEmptyLastRecoveryMs || 0)} ms; visibility ${runtime.chatUnexpectedEmptyLastVisibility || "unknown"}; generation ${runtime.chatUnexpectedEmptyLastGeneration || "unknown"}`);
    { const v = context?.pageDiagnostics?.runtimeContext?.chatVisibility;
      if (v) diagnosticLines.push(formatChatVisibilityStatus(v));
    }
    diagnosticLines.push(`Message cache: ${Number(runtime.messageCacheHits || 0)} hits; ${Number(runtime.messageCacheMisses || 0)} misses; ${Number(runtime.messageCacheInvalidations || 0)} actual invalidations; ${Number(runtime.messageCacheInvalidationRequests || 0)} requests; ${Number(runtime.messageCacheInvalidationDeduped || 0)} duplicate invalidations avoided; ${Number(runtime.messageCacheNonTextSkips || 0)} non-text message mutations kept cached; ${Number(runtime.messageCacheFingerprintSkips || 0)} unchanged-text invalidations skipped`);
    if (Number(runtime.longTasks || 0)) diagnosticLines.push(`Browser long tasks: ${Number(runtime.longTasks || 0)}; last ${Number(runtime.lastLongTaskMs || 0)} ms; max ${Number(runtime.maxLongTaskMs || 0)} ms; QoL-overlap ${Number(runtime.longTasksWithQolOverlap || 0)}; no-QoL-overlap ${Number(runtime.longTasksWithoutQolOverlap || 0)}; last overlap ${runtime.lastLongTaskOverlap || "none"}`);
    diagnosticLines.push(`Slow native click events: ${Number(runtime.nativeSlowClickSamples || 0)}; worst input delay ${Number(runtime.nativeWorstInputDelayMs || 0)} ms; worst click duration ${Number(runtime.nativeWorstClickMs || 0)} ms; last category ${runtime.nativeLastSlowClickCategory || "none"}`);
    diagnosticLines.push(`QoL performance entries: ${perf.length}`);
    perf.forEach(entry => diagnosticLines.push(`  ${entry.name}: ${entry.calls} calls, avg ${entry.averageMs} ms, max ${entry.maxMs} ms, last ${entry.lastMs || 0} ms, total ${entry.totalMs} ms`));
  }
  if (context?.pageDiagnostics?.androidEnvironment) {
    const env = context.pageDiagnostics.androidEnvironment;
    diagnosticLines.push(`Android detected: ${env.android ? "yes" : "no"}; WebView detected: ${env.webview ? "yes" : "no"}; installed/standalone app: ${env.installedApp ? `yes (${env.displayMode || "standalone"})` : "no"}; Firefox-family: ${env.firefox || env.waterfox ? "yes" : "no"}; Opera: ${env.opera ? "yes" : "no"}`);
  }
  const text = sanitizeSupportReportText(diagnosticLines.join("\n"));
  if (returnOnly) return text;

  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = "Copied. No chat text or saved private content was included.";
  } catch {
    const box = $("settingsJson");
    if (box) {
      box.value = text;
      setActiveTab("data");
      box.focus();
      box.select();
    }
    if (status) status.textContent = "Clipboard access failed, so the diagnostic text was placed in Data / Backup instead.";
  }
  return text;
}

async function downloadDiagnostics() {
  const status = $("diagnosticsStatus");
  if (status) status.textContent = "Building diagnostic info for download...";
  try {
    const text = await copyDiagnostics({ returnOnly: true });
    return downloadSupportText(text, supportReportFilename("diagnostics"), "Diagnostic info downloaded. No chat text was included.");
  } catch (error) {
    if (status) status.textContent = `Could not build diagnostic info: ${error?.message || String(error || "unknown error")}`;
    return false;
  }
}

function formatChatVisibilityStatus(v) {
  if (!v) return "Current chat DOM: unavailable";
  const mounted = Number(v.mounted || 0);
  const checked = Number(v.inspected || 0);
  const hidden = Number(v.hidden || 0);
  const folded = Number(v.qolFolded || 0);
  const details = [
    `${Number(v.cssHidden || 0)} CSS-hidden`,
    `${Number(v.zeroLayout || 0)} no-size`,
    `${Number(v.transparent || 0)} transparent`,
    `${folded} intentionally folded by QoL`
  ];
  return `Current chat DOM: ${mounted} mounted; ${hidden}/${checked} recent messages not rendered (${details.join(", ")}); source tab ${v.sourceTabVisible === false ? "in background" : v.sourceTabVisible === true ? "visible" : "visibility unknown"}; chat performance CSS ${v.performanceMode ? "on" : "off"}; composer present ${v.composerPresent ? "yes" : "no"}. This checks layout only, not whether chat text was deleted.`;
}

function performanceWarningLines(context, settings) {
  const lines = [];
  const runtime = context?.pageDiagnostics?.runtimePerformance || {};
  const perf = Array.isArray(context?.pageDiagnostics?.performance) ? context.pageDiagnostics.performance : [];
  for (const entry of perf.slice(0, 20)) {
    const max = Number(entry?.maxMs || 0);
    if (max >= 5000) lines.push(`CRITICAL wall-time spike: ${entry.name} max ${max} ms (may include async waiting; compare browser long tasks).`);
    else if (max >= 1000) lines.push(`Large wall-time spike: ${entry.name} max ${max} ms.`);
    else if (max >= 250) lines.push(`Slow QoL step: ${entry.name} max ${max} ms.`);
  }
  const visibility = context?.pageDiagnostics?.runtimeContext?.chatVisibility;
  if (visibility && Number(visibility.inspected || 0) >= 2 &&
      Number(visibility.hidden || 0) === Number(visibility.inspected || 0) &&
      Number(visibility.qolFolded || 0) === 0) {
    lines.push(`Possible hidden-chat UI: all ${Number(visibility.inspected)} recent message roots are present but not rendered; ${Number(visibility.cssHidden || 0)} CSS-hidden, ${Number(visibility.zeroLayout || 0)} no-size, ${Number(visibility.transparent || 0)} transparent. ${visibility.sourceTabVisible === false ? "The source chat tab was in the background when checked, so this alone cannot confirm a visible-page failure." : "The source chat tab was visible when checked."} This does not prove messages were deleted or that QoL caused it.`);
  }
  const invalidations = Number(runtime.messageCacheInvalidations || 0);
  const requests = Number(runtime.messageCacheInvalidationRequests || 0);
  if (requests >= 500 && invalidations / Math.max(1, requests) > 0.8) lines.push(`High message-cache churn: ${invalidations}/${requests} invalidation requests caused real invalidations.`);
  if (Number(runtime.maxLongTaskMs || 0) >= 250) {
    const overlapMax = Number(runtime.maxLongTaskWithQolOverlapMs || 0);
    const noOverlapMax = Number(runtime.maxLongTaskWithoutQolOverlapMs || 0);
    if (noOverlapMax >= 250 && noOverlapMax >= overlapMax) lines.push(`Browser main-thread stall observed: max ${noOverlapMax} ms with no timed QoL step overlapping it.`);
    else if (overlapMax >= 250) lines.push(`Browser main-thread stall observed: max ${overlapMax} ms while a QoL step was active (${runtime.lastLongTaskOverlap || "overlap source unavailable"}).`);
    else lines.push(`Browser main-thread stall observed: max long task ${Number(runtime.maxLongTaskMs || 0)} ms.`);
  }
  if (Number(runtime.loadedChatMessages || 0) >= Number(settings.largeChatPerformanceThreshold || 300) && !settings.autoPerformanceLargeChats) lines.push(`Large chat detected (${Number(runtime.loadedChatMessages || 0)} messages) while automatic large-chat performance mode is off.`);
  return lines;
}

async function copyPerformanceReport({ returnOnly = false } = {}) {
  const status = $("diagnosticsStatus");
  if (status && !returnOnly) status.textContent = "Building performance report...";
  const [stored, context, liveTabValue] = await Promise.all([
    storageGet(["settings", "cardTokenFetchDiagnosticsV1", AUTO_AFK_STATUS_KEY]),
    runtimeMessageWithTimeout({ type: "DS_GET_DIAGNOSTIC_CONTEXT" }, 3500),
    runtimeMessageWithTimeout({ type: "DS_GET_SPICYCHAT_TAB_SUMMARY" }, 1500)
  ]);
  const liveTabSummary = liveTabValue?.ok && liveTabValue.summary && typeof liveTabValue.summary === "object" ? liveTabValue.summary : null;
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  const manifest = chrome.runtime.getManifest?.() || {};
  const runtimeAvailable = !!(context?.runtimeAvailable && context?.pageDiagnostics);
  const runtime = context?.pageDiagnostics?.runtimePerformance || {};
  const perf = Array.isArray(context?.pageDiagnostics?.performance) ? context.pageDiagnostics.performance.slice(0, 20) : [];
  const env = context?.pageDiagnostics?.androidEnvironment || detectSettingsEnvironment();
  const warnings = runtimeAvailable ? performanceWarningLines(context, settings)
    : ["No SpicyChat QoL runtime replied. Page performance counters below are unavailable, not zero measurements; reload the affected tab after updating QoL."];
  const sampleContext = context?.pageDiagnostics?.runtimeContext || {};
  const backgroundSample = runtimeAvailable && sampleContext.visibilityState === "hidden";
  const sampledPath = String(context?.url || "").replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/, 1)[0];
  const offChatSample = runtimeAvailable && !/^\/chat\//.test(sampledPath);
  const sampleScope = !runtimeAvailable ? "No content runtime available; only Settings measurements were collected."
    : backgroundSample ? "Background tab: current activity and zero Long Task samples cannot describe responsiveness in a visible chat."
    : offChatSample ? "Not a chat page: message counters and chat latency were not measured here."
    : "Visible chat or page sample; measurements reflect this tab, not all open SpicyChat tabs.";
  const readAvg = OPTIONS_PERFORMANCE.storageReads ? OPTIONS_PERFORMANCE.storageReadTotalMs / OPTIONS_PERFORMANCE.storageReads : 0;
  const writeAvg = OPTIONS_PERFORMANCE.storageWrites ? OPTIONS_PERFORMANCE.storageWriteTotalMs / OPTIONS_PERFORMANCE.storageWrites : 0;
  let lines = [
    "SpicyChat QoL performance report",
    `Generated: ${new Date().toISOString()}`,
    `Version: ${manifest.version_name || displayReleaseVersion(manifest.version || "unknown")}`,
    `Browser: ${navigator.userAgent}`,
    `Platform: ${navigator.platform || "unknown"}`,
    (() => { const p = context?.pageDiagnostics?.buildProfile; return context?.runtimeAvailable && context?.pageDiagnostics ? `Build profile: ${p?.label || p?.id || "Full"}; bundles ${(p?.bundles || []).join(", ") || "unknown"}` : "Build profile: unavailable with runtime data"; })(),
    `SpicyChat page: ${sanitizeDiagnosticPath(context?.url || "")}`,
    `Runtime data: ${runtimeAvailable ? "available" : "unavailable — no open SpicyChat tab responded; Options-page measurements below are still valid"}`,
    `Sample scope: ${sampleScope}`,
    (() => { const p = context?.pageDiagnostics?.diagnosticProtocol; return p ? `Dragon's SpicyChat Diagnostic Extension protocol: v${Number(p.protocolVersion || 1)}; ${p.inspectorConnected ? `paired${p.inspectorVersion ? ` with Inspector ${p.inspectorVersion}` : " with Inspector"}` : "Inspector not currently paired"}; QoL ${p.runState || "unknown"}; operation markers ${Number(p.counters?.operationsStarted || 0)}/${Number(p.counters?.operationsEnded || 0)}; network markers ${Number(p.counters?.networkStarted || 0)}/${Number(p.counters?.networkEnded || 0)}` : "Dragon's SpicyChat Diagnostic Extension protocol: unavailable"; })(),
    `Environment: Android ${env.android ? "yes" : "no"}; WebView ${env.webview ? "yes" : "no"}; installed/standalone ${env.installedApp ? `yes (${env.displayMode || "standalone"})` : "no"}; Firefox-family ${env.firefox || env.waterfox ? "yes" : "no"}; Opera ${env.opera ? "yes" : "no"}`,
    (() => { const d = stored.cardTokenFetchDiagnosticsV1 || {}; return `Card token fetch: background ${Number(d.requests || 0)}/${Number(d.successes || 0)} success; MAIN ${Number(d.mainWorldRequests || 0)}/${Number(d.mainWorldSuccesses || 0)} success / ${Number(d.mainWorldFailures || 0)} failed, captured-auth ${Number(d.mainWorldCapturedAuth || 0)}; timeouts ${Number(d.timeouts || 0)}; 401 ${Number(d.http401 || 0)}; 403 ${Number(d.http403 || 0)}; 429 ${Number(d.http429 || 0)}; network ${Number(d.networkFailures || 0)}; auth missing ${Number(d.authMissing || 0)}; IndexedDB auth ${Number(d.indexedDbAuth || 0)}; last ${d.lastStatus || "none"} ${Number(d.lastElapsedMs || 0)} ms`; })(),
    `Bot archive preservation: ${Number(runtime.botArchiveSeenQueued || 0)} public observations queued; ${Number(runtime.botArchiveSeenMerged || 0)} merged in ${Number(runtime.botArchiveSeenBatches || 0)} batches; ${Number(runtime.botArchiveSeenUnchanged || 0)} unchanged snapshots skipped; ${Number(runtime.botArchiveWrites || 0)} archive writes; ${Number(runtime.ownBotBackupSaves || 0)} own-bot editor saves`,
    `Performance mode: configured ${settings.runtimePerformanceMode || "adaptive"}; effective ${runtime.mode || settings.runtimePerformanceMode || "adaptive"}`,
    (() => { const c = context?.pageDiagnostics?.runtimeContext || {}; return `Runtime context: visibility ${c.visibilityState || "unknown"}; focus ${c.focused == null ? "unknown" : (c.focused ? "yes" : "no")}; mounted ${Number(c.mountedMessages || runtime.loadedChatMessages || 0)}; DOM ${Number(c.domNodes || 0)}; heap ${Number(c.heapBytes || 0) ? `${Math.round(Number(c.heapBytes) / 1048576)} MB` : "n/a"}; Long Task 10s ${Number(c.recentLongTaskMs10s || 0)} ms; 30s ${Number(c.recentLongTaskMs30s || 0)} ms`; })(),
    `Performance controls: large-chat auto ${settings.autoPerformanceLargeChats ? "on" : "off"} @ ${Number(settings.largeChatPerformanceThreshold || 300)} messages; defer while typing ${settings.deferQolWhileTyping ? "on" : "off"}; edit quieting ${settings.pauseQolWhileMessageEditing !== false ? "on" : "off"}; hidden-tab pause ${settings.pauseQolInHiddenTabs ? "on" : "off"}; desktop-app guard ${settings.desktopAppPerformanceGuard !== false ? "on" : "off"}; disabled-feature deep sleep always on; reduced QoL animations ${settings.reduceQolAnimations ? "on" : "off"}`,
    (() => { const a = liveTabSummary || stored[AUTO_AFK_STATUS_KEY] || {}; const source = liveTabSummary ? "live" : (a.at ? "last scan" : "unavailable"); return `SpicyChat tabs (${source}): ${Number(a.totalSpicyTabs || 0)} total; ${Number(a.loadedNormal || 0)} normal loaded; ${Number(a.discardedNormal || 0)} normal unloaded; ${Number(a.workerTabs || 0)} workers (${Number(a.loadedWorkers || 0)} loaded); PC protection ${settings.lowMemoryProtectionEnabled ? `on, limit ${Math.min(20, Math.max(1, Number(settings.maxAwakeSpicyTabs) || 3))}` : "off"}`; })(),
    `Loaded chat messages: ${Number(runtime.loadedChatMessages || 0)}`,
    `Chat visibility: ${Number(runtime.chatUnexpectedEmptyTransitions || 0)} sudden empty transitions; ${Number(runtime.chatUnexpectedEmptyRecovered || 0)} recovered without reload; ${Number(runtime.chatUnexpectedEmptyUnresolved || 0)} still empty after checks; last before ${Number(runtime.chatUnexpectedEmptyLastBefore || 0)} messages`,
    (() => { const v = context?.pageDiagnostics?.runtimeContext?.chatVisibility; return formatChatVisibilityStatus(v); })(),
    ...((settings.performanceDiagnostics && Array.isArray(context?.pageDiagnostics?.slowFeatureSamples))
      ? context.pageDiagnostics.slowFeatureSamples.slice(-30).map(item => `Slow QoL step: ${String(item.feature || "unknown").slice(0,90)} ${Number(item.durationMs || 0).toFixed(1)} ms on ${String(item.route || "").slice(0,90)} (${new Date(Number(item.at || Date.now())).toISOString()})`)
      : []),
    `Scheduler: plan ${runtime.currentRuntimePlan || "unknown"}; ${Number(runtime.schedules || 0)} scheduling requests (not completed passes); ${Number(runtime.messageLaneSchedules || 0)} message-lane schedule requests; ${Number(runtime.messageLaneScheduleCoalesced || 0)} duplicate requests coalesced; ${Number(runtime.messageLaneRuns || 0)} runs; ${Number(runtime.messageLaneDirtyRoots || 0)} dirty roots; ${Number(runtime.disabledFeatureStepSkips || 0)} disabled-feature steps skipped; ${Number(runtime.routeFeatureStepSkips || 0)} off-route feature steps skipped; ${Number(runtime.buildBundleStepSkips || 0)} omitted-bundle steps skipped; ${Number(runtime.runtimeKernelRuns || 0)} kernel-dispatched feature runs; ${Number(runtime.runtimePlanCacheHits || 0)} runtime-plan cache hits; ${Number(runtime.typingDeferrals || 0)} typing deferrals; ${Number(runtime.deferredWhileScrolling || 0)} scroll deferrals; ${Number(runtime.desktopAppGuardDelays || 0)} installed-app delays; ${Number(runtime.quickPanelStateSkips || 0)} unchanged Mini Panel refreshes skipped; ${Number(runtime.quickPanelLayoutSkips || 0)} unchanged Mini Panel layouts skipped; ${Number(runtime.quickPanelUpdateCoalesced || 0)} rapid Mini Panel refreshes coalesced`,
    `Android QoL pacing: ${env.android ? "active" : "not Android"}; ${Number(runtime.androidMessageLaneDeferrals || 0)} delayed message updates; ${Number(runtime.androidRuntimeDeferrals || 0)} delayed maintenance passes. These counts are scheduling changes, not measured UI lag.`,
    `Message decoration: ${Number(runtime.messageLaneChunkedPasses || 0)} chunked passes; ${Number(runtime.messageLaneChunkedRoots || 0)} roots processed in chunks; ${Number(runtime.messageLaneDeferredRoots || 0)} older roots deferred; ${Number(runtime.messageEnhancerIncrementalLanePasses || 0)} lane-only enhancer passes; ${Number(runtime.criticalMessageEnhancerPassesDeferred || 0)} critical full-message passes deferred; Mini Panel render-quiet deferrals ${Number(runtime.quickPanelRenderQuietDeferrals || 0)}`,
    `Storage write batching: ${Number(runtime.storageWriteRequests || 0)} save requests → ${Number(runtime.storageWriteBatches || 0)} browser writes; ${Number(runtime.storageWriteMergedKeys || 0)} same-key writes merged; ${Number(runtime.storageWriteImmediateFlushes || 0)} immediate flushes`,
    `Mutations: ${Number(runtime.mutations || 0)} total in ${Number(runtime.observerBatches || 0)} observer batches; ${Number(runtime.chatLocalMutations || 0)} chat-local; ${Number(runtime.composerOnlyMutationSkips || 0)} composer-only skipped; ${Number(runtime.qolOnlyMutations || 0)} QoL-owned ignored (${Number(runtime.observerQolOnlyBatches || 0)} pure + ${Number(runtime.observerMixedQolBatches || 0)} mixed batches)`,
    `Message edit guard: ${Number(runtime.messageEditGuardsStarted || 0)} started; ${Number(runtime.messageEditGuardsSettled || 0)} settled; ${Number(runtime.messageEditMutationSkips || 0)} edit mutations skipped; ${Number(runtime.messageEditLaneSkips || 0)} lane runs skipped; ${Number(runtime.messageEditCriticalSkips || 0)} critical runs skipped`,
    `Chat header self-repair: ${Number(runtime.chatHeaderRepairRequests || 0)} repair requests; last source ${runtime.lastChatHeaderRepairSource || "none"}`,
    ...(context?.pageDiagnostics?.chatLayout ? [
      `Chat layout: viewport ${Number(context.pageDiagnostics.chatLayout.viewport || 0)} px; root ${Number(context.pageDiagnostics.chatLayout.root || 0)} px; composer host ${Number(context.pageDiagnostics.chatLayout.composer || 0)} px; title host ${Number(context.pageDiagnostics.chatLayout.titleHost || 0)} px; title ${Number(context.pageDiagnostics.chatLayout.title || 0)} px`,
      `Composer shortcuts: ${context.pageDiagnostics.chatLayout.shortcutPlacement || "none"}; holder ${Number(context.pageDiagnostics.chatLayout.shortcutWidth || 0)} px; ${Number(context.pageDiagnostics.chatLayout.shortcutControls || 0)} controls; textarea right padding ${context.pageDiagnostics.chatLayout.textareaPaddingRight || "unknown"}; overlap ${context.pageDiagnostics.chatLayout.shortcutOverlap ? "YES" : "no"}`
    ] : []),
    `Opened-history persistence: queued ${Number(runtime.openedSaveQueued || 0)}; coalesced ${Number(runtime.openedSaveCoalesced || 0)}; flushes ${Number(runtime.openedSaveFlushes || 0)}; pending ${Number(runtime.openedSavePending || 0)}; last ${Number(runtime.openedSaveLastMs || 0)} ms`,
    `Auto-AFK: ${settings.autoAfkEnabled ? "on" : "off"}; ${Math.min(43200, Math.max(15, Number(settings.autoAfkMinutes) || 720))} min; action ${settings.autoAfkAction === "close" ? "close" : "discard"}; scopes ${(() => { const scopes = [settings.autoAfkChats !== false ? "chats" : "", settings.autoAfkHome ? "home" : "", settings.autoAfkProfiles ? "profiles" : ""].filter(Boolean); return scopes.length ? scopes.join(", ") : (settings.autoAfkEnabled ? "chats (legacy fallback)" : "none"); })()}; low-memory ${settings.lowMemoryProtectionEnabled ? `on @ ${Math.min(20, Math.max(1, Number(settings.maxAwakeSpicyTabs) || 3))} awake tabs` : "off"}`,
    `Disabled-feature deep sleep: always on; ${Number(runtime.disabledFeatureStepSkips || 0)} scheduler steps skipped`,
    `Saved/opened lane: ${Number(runtime.savedOpenedLaneSchedules || 0)} schedules; ${Number(runtime.savedOpenedLaneRuns || 0)} runs; last source ${runtime.lastSavedOpenedLaneSource || "none"}`,
    `Blocked-bot refresh batching: ${Number(runtime.blockedBotRefreshDeferrals || 0)} deferred single-block changes; ${Number(runtime.blockedBotRefreshFlushes || 0)} settled refreshes; ${Number(runtime.blockedBotMutationSkips || 0)} immediate listing mutations skipped; ${runtime.blockedBotRefreshPending ? `pending (${Math.max(0, Math.ceil((Number(runtime.blockedBotRefreshSettleAt || 0) - Date.now()) / 1000))}s remaining)` : "idle"}`,
    `Slow-step throttle: ${Number(runtime.throttledStepRuns || 0)} permitted checks; ${Number(runtime.slowStepThrottleSkips || 0)} repeated checks prevented (not completed scans); by group ${Object.entries(runtime.slowStepThrottleCategories || {}).filter(([k]) => ["layout", "listing", "profile", "other"].includes(k)).map(([k,v]) => `${k} ${Number(v) || 0}`).join(", ") || "none"}`,
    `Listing workload guard: ${Number(runtime.listingNonCardCriticalSkips || 0)} non-card critical passes skipped; ${Number(runtime.listingScheduleDeferrals || 0)} mutation bursts coalesced; ${Number(runtime.listingDuplicateRefillCardsRemoved || 0)} duplicate refill cards removed; ${Number(runtime.cardTokenHiddenQueuePauses || 0)} hidden-tab token queue pauses`,
    `Listing name sort: ${runtime.listingSortMode || "native"}; ${Number(runtime.listingSortLoadedCards || 0)} loaded cards; ${Number(runtime.listingSortReorders || 0)} DOM reorders; ${Number(runtime.listingSortNoopSkips || 0)} identical passes skipped; ${Number(runtime.listingSortAlreadyOrdered || 0)} first-pass no-ops`,
    `Notification auto-read: ${Number(runtime.notificationAutoReadAttempts || 0)} attempts; ${Number(runtime.notificationAutoReadClicks || 0)} native clicks; ${Number(runtime.notificationAutoReadSuccesses || 0)} cleared; ${Number(runtime.notificationAutoReadUncleared || 0)} still unread; ${Number(runtime.notificationAutoReadMissingButtons || 0)} missing-button checks; ${Number(runtime.notificationAutoReadFailures || 0)} failures; last source ${runtime.notificationAutoReadLastSource || "none"}`,
    `Message cache: ${Number(runtime.messageCacheHits || 0)} hits; ${Number(runtime.messageCacheMisses || 0)} misses; ${Number(runtime.messageCacheInvalidations || 0)} actual invalidations; ${Number(runtime.messageCacheInvalidationRequests || 0)} requests; ${Number(runtime.messageCacheInvalidationDeduped || 0)} duplicates avoided; ${Number(runtime.messageCacheNonTextSkips || 0)} non-text mutations kept cached; ${Number(runtime.messageCacheFingerprintSkips || 0)} unchanged-text invalidations skipped; observer collapsed ${Number(runtime.messageCacheMutationCandidateNodes || 0)} changed nodes to ${Number(runtime.messageCacheMutationRoots || 0)} message-root targets (${Number(runtime.messageCacheMutationNodesCollapsed || 0)} node walks avoided)`,
    `Browser long tasks: ${Number(runtime.longTasks || 0)}; max ${Number(runtime.maxLongTaskMs || 0)} ms; last ${Number(runtime.lastLongTaskMs || 0)} ms; QoL-overlap ${Number(runtime.longTasksWithQolOverlap || 0)}; no-QoL-overlap ${Number(runtime.longTasksWithoutQolOverlap || 0)}; last overlap ${runtime.lastLongTaskOverlap || "none"}`,
    `Native click timing (Event Timing, slow events only): ${Number(runtime.nativeSlowClickSamples || 0)} samples; worst input delay ${Number(runtime.nativeWorstInputDelayMs || 0)} ms; worst click duration ${Number(runtime.nativeWorstClickMs || 0)} ms; last category ${runtime.nativeLastSlowClickCategory || "none"}; optional work delayed for native actions ${Number(runtime.nativeActionQuietDeferrals || 0)} times`,
    `Mobile native text-selection quieting: ${Number(runtime.mobileTextSelectionStarts || 0)} touch starts; ${Number(runtime.mobileTextSelectionChanges || 0)} selected-text changes; no native selection events blocked`,
    `Card-token request guard: MAIN bridge ${Number(runtime.cardTokenMainCircuitTrips || 0)} trips / ${Number(runtime.cardTokenMainCircuitSkips || 0)} skipped retries${Number(runtime.cardTokenMainCircuitUntil || 0) > Date.now() ? ` / cooling down ${Math.ceil((Number(runtime.cardTokenMainCircuitUntil) - Date.now()) / 1000)}s` : ""}; auth ${Number(runtime.cardTokenAuthCircuitTrips || 0)} rejected / ${Number(runtime.cardTokenAuthSkips || 0)} no-auth skips; background no-auth ${Number(runtime.cardTokenBackgroundAuthSkips || 0)} skipped`,
    `Options page: load ${OPTIONS_PERFORMANCE.loadMs.toFixed(1)} ms; DOM ${document.getElementsByTagName("*").length} nodes; storage reads ${OPTIONS_PERFORMANCE.storageReads} avg ${readAvg.toFixed(2)} ms max ${OPTIONS_PERFORMANCE.storageReadMaxMs.toFixed(2)} ms; writes ${OPTIONS_PERFORMANCE.storageWrites} avg ${writeAvg.toFixed(2)} ms max ${OPTIONS_PERFORMANCE.storageWriteMaxMs.toFixed(2)} ms`,
    ...(OPTIONS_PERFORMANCE.slowStorageReads.length ? [`Options slow storage reads: ${OPTIONS_PERFORMANCE.slowStorageReads.map(item => `${item.keys} ${item.ms} ms${item.bytes ? ` (${(item.bytes / 1024).toFixed(1)} KB)` : ""}`).join("; ")}`] : []),
    `Options search renders: settings ${OPTIONS_PERFORMANCE.searchRenders}; feature catalogue ${OPTIONS_PERFORMANCE.featureRenders}`,
    `Options heavy UI: ${OPTIONS_PERFORMANCE.heavyManagerIdleSlices} idle slices; ${OPTIONS_PERFORMANCE.savedManagerRefreshBatches} saved-manager refresh batches covering ${OPTIONS_PERFORMANCE.savedManagerRefreshKinds} manager kinds; ${OPTIONS_PERFORMANCE.blockedManagerRefreshBatches} blocked-manager refresh batches`,
    `Warnings: ${warnings.length}`,
    ...warnings.map(line => `  ! ${line}`),
    `QoL timing entries: ${perf.length}`,
    ...perf.map(entry => `  ${entry.name}: ${entry.calls} calls, avg ${entry.averageMs} ms, max ${entry.maxMs} ms, last ${entry.lastMs || 0} ms, total ${entry.totalMs} ms`)
  ];
  if (!runtimeAvailable) {
    const runtimePrefixes = ["Bot archive preservation:", "Performance mode:", "Loaded chat messages:", "Scheduler:", "Storage write batching:", "Mutations:", "Message edit guard:", "Chat header self-repair:", "Chat layout:", "Opened-history persistence:", "Auto-AFK:", "Disabled-feature deep sleep:", "Saved/opened lane:", "Blocked-bot refresh batching:", "Listing workload guard:", "Listing name sort:", "Notification auto-read:", "Message cache:", "Browser long tasks:", "Card-token request guard:", "QoL timing entries:"];
    lines = lines.filter(line => !runtimePrefixes.some(prefix => String(line).startsWith(prefix)) && !/^  .+: \d+ calls,/.test(String(line)));
  }
  const text = lines.join("\n");
  if (returnOnly) return text;

  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = `Performance report copied${warnings.length ? ` with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}. No chat text was included.`;
  } catch {
    const box = $("settingsJson");
    if (box) { box.value = text; setActiveTab("data"); box.focus(); box.select(); }
    if (status) status.textContent = "Clipboard access failed, so the performance report was placed in Data / Backup instead.";
  }
  return text;
}

async function downloadPerformanceReport() {
  const status = $("diagnosticsStatus");
  if (status) status.textContent = "Building performance report for download...";
  try {
    const text = await copyPerformanceReport({ returnOnly: true });
    return downloadSupportText(text, supportReportFilename("performance"), "Performance report downloaded. No chat text was included.");
  } catch (error) {
    if (status) status.textContent = `Could not build performance report: ${error?.message || String(error || "unknown error")}`;
    return false;
  }
}

async function buildPerformanceSelfCheckText() {
  const started = performance.now();
  const readStarted = performance.now();
  const readPromise = storageGetChecked(["settings"]).then(read => ({ read, storageMs: performance.now() - readStarted }));
  const contextPromise = runtimeMessageWithTimeout({ type: "DS_GET_DIAGNOSTIC_CONTEXT" }, 3000);
  const [{ read, storageMs }, context] = await Promise.all([readPromise, contextPromise]);
  const settings = { ...DEFAULT_SETTINGS, ...(read.data?.settings || {}) };
  const warnings = performanceWarningLines(context, settings);
  if (!context?.pageDiagnostics) warnings.push("SpicyChat's QoL runtime did not answer. Page-specific performance checks were unavailable; reload the affected SpicyChat tab and try again.");
  if (storageMs >= 350) warnings.push(`Settings storage took ${storageMs.toFixed(0)} ms to respond. This is a measured delay, not proof that QoL caused the slowdown.`);
  const total = performance.now() - started;
  const domNodes = document.getElementsByTagName("*").length;
  const manifest = chrome.runtime.getManifest?.() || {};
  const lines = [
    "SpicyChat QoL performance self-check",
    `Generated: ${new Date().toISOString()}`,
    `Version: ${manifest.version_name || displayReleaseVersion(manifest.version || "unknown")}`,
    `Browser: ${navigator.userAgent}`,
    `Platform: ${navigator.platform || "unknown"}`,
    `SpicyChat page: ${sanitizeDiagnosticPath(context?.url || "")}`,
    `Self-check total: ${total.toFixed(1)} ms`,
    `Settings storage read: ${storageMs.toFixed(1)} ms${read.ok ? "" : ` (failed: ${read.error || "unknown error"})`}`,
    `Settings DOM: ${domNodes} nodes`,
    `Source SpicyChat tab: ${context?.pageDiagnostics ? "reachable" : "unavailable"}`,
    (() => { const p = context?.pageDiagnostics?.diagnosticProtocol; return p ? `Dragon's SpicyChat Diagnostic Extension: ${p.inspectorConnected ? `paired${p.inspectorVersion ? ` (${p.inspectorVersion})` : ""}` : "not paired"}; protocol v${Number(p.protocolVersion || 1)}; QoL ${p.runState || "unknown"}` : "Dragon's SpicyChat Diagnostic Extension: protocol unavailable"; })(),
    `Warnings: ${warnings.length}`,
    ...warnings.map(line => `  ! ${line}`)
  ];
  return lines.join("\n");
}

async function buildFastSupportSnapshot() {
  const manifest = chrome.runtime.getManifest?.() || {};
  const [quickStored, bytesValue, largeStatsValue, liveTabValue] = await Promise.all([
    promiseWithValueTimeout(storageGet(["settings", AUTO_AFK_STATUS_KEY]), 1500, null),
    promiseWithValueTimeout(storageBytesInUse(null), 1500, null),
    promiseWithValueTimeout(readLargeStorageStats(), 1500, null),
    promiseWithValueTimeout(runtimeMessageWithTimeout({ type: "DS_GET_SPICYCHAT_TAB_SUMMARY" }, 1200), 1400, null)
  ]);
  const stored = quickStored && typeof quickStored === "object" ? quickStored : {};
  const largeStatsReady = !!(largeStatsValue && typeof largeStatsValue === "object");
  const largeStats = largeStatsReady ? largeStatsValue : {};
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  const afk = stored[AUTO_AFK_STATUS_KEY] || {};
  const liveTabs = liveTabValue?.ok && liveTabValue.summary && typeof liveTabValue.summary === "object" ? liveTabValue.summary : null;
  const tabState = liveTabs || afk;
  const bytes = Number(bytesValue);
  const tabLabel = liveTabs
    ? "Live tab check"
    : afk.at
      ? `Last tab scan ${new Date(Number(afk.at)).toISOString()}`
      : "Tab check unavailable";
  return [
    "SpicyChat QoL fast support snapshot",
    `Generated: ${new Date().toISOString()}`,
    `Version: ${manifest.version_name || displayReleaseVersion(manifest.version || "unknown")}`,
    `Browser: ${navigator.userAgent}`,
    `Platform: ${navigator.platform || "unknown"}`,
    `Options DOM: ${document.getElementsByTagName("*").length} nodes`,
    `chrome.storage.local: ${Number.isFinite(bytes) ? `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 1 : 2)} MB` : "size read timed out"}`,
    `Auto-AFK: ${settings.autoAfkEnabled ? "on" : "off"} @ ${Math.min(43200, Math.max(15, Number(settings.autoAfkMinutes) || 720))} min`,
    largeStatsReady
      ? `Large-data IndexedDB: ${Number(largeStats[BOT_AVAILABILITY_KEY] || 0)} availability · ${Number(largeStats[BOT_ARCHIVE_KEY] || 0)} archive records · ${Number(largeStats[LOREBOOK_STATUS_KEY] || 0)} Lorebook status records`
      : "Large-data IndexedDB: fast check timed out; full support sections continue independently",
    `PC protection: ${settings.lowMemoryProtectionEnabled ? `on; keep ${Math.min(20, Math.max(1, Number(settings.maxAwakeSpicyTabs) || 3))} normal tabs awake` : "off"}`,
    `${tabLabel}: ${Number(tabState.totalSpicyTabs || 0)} SpicyChat tabs; ${Number(tabState.loadedNormal || 0)} normal loaded; ${Number(tabState.discardedNormal || 0)} normal unloaded; ${Number(tabState.workerTabs || 0)} workers`,
    "This snapshot is deliberately lightweight and should still appear when a content runtime or a heavier support section is stuck."
  ].join("\n");
}

// Saved support history is a small, privacy-safe timeline kept across normal
// updates. This is not a copy of chat messages or the full Settings database.
async function readSavedSupportHistory({ summaryOnly = false } = {}) {
  const timeoutMs = summaryOnly ? (isAndroidSupportWebView() ? 5500 : 12000)
    : (isAndroidSupportWebView() ? 12000 : 45000);
  const result = await runtimeMessageWithTimeout({ type: "DS_SUPPORT_HISTORY_GET", summaryOnly }, timeoutMs).catch(() => null);
  const error = String(result?.error || (result?.__dsTimeout ? "The history lookup timed out." : "Support history could not be checked.")).slice(0, 180);
  return result?.ok ? result : { ok: false, text: error, count: 0, through: 0 };
}
async function refreshSavedSupportStatus() {
  const label = $("dsSupportHistoryStatus");
  if (!label) return;
  // A status refresh must not decompress every archived report into Settings.
  const history = await readSavedSupportHistory({ summaryOnly: true });
  label.textContent = history.ok
    ? `${history.count} saved checks (${history.compressedBatches || 0} compressed batches)${history.dropped ? ` · ${history.dropped} checks were already removed by the old history limit` : ""}. Saved separately from Settings. Download all support info to export; clear manually if the file can't be verified.`
    : `Saved support history could not be checked: ${history.text}`;
}
async function clearSavedSupportHistory() {
  if (!confirm("Clear saved support history? This cannot be undone unless you downloaded a copy.")) return;
  const result = await runtimeMessageWithTimeout({ type: "DS_SUPPORT_HISTORY_CLEAR" }, 12000).catch(() => null);
  if (result?.ok) {
    await runtimeMessageWithTimeout({ type: "DS_CLEAR_PAGE_RUNTIME_LOG" }, 1500).catch(() => null);
    const status = $("diagnosticsStatus");
    if (status) status.textContent = "Saved support history cleared. New checks will be recorded as you use SpicyChat.";
    await refreshSavedSupportStatus();
  } else {
    const status = $("diagnosticsStatus");
    if (status) status.textContent = "Could not clear saved support history. Nothing was deleted.";
  }
}
// Download verification is deliberately separate from starting a download. A
// clicked <a download> cannot prove that the browser actually saved a file.
async function downloadSupportVerified(text, compressed) {
  const raw = compressed && typeof CompressionStream === "function"
    ? await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).blob()
    : new Blob([text], { type: "text/plain;charset=utf-8" });
  const isGzip = compressed && raw.type !== "text/plain;charset=utf-8";
  if (!raw.size) throw new Error("The generated support file was empty.");
  const filename = isGzip ? supportReportFilename("support-info").replace(/\.txt$/, ".txt.gz") : supportReportFilename("support-info");
  if (isAndroidSupportWebView()) {
    // Do not send compressed blobs to text-only Android export handlers.
    // The report remains available for copying even if the APK cannot save it.
    const started = await downloadSupportText(text, supportReportFilename("support-info"), "Support file requested on Android.");
    return { started, verified: false, isGzip: false };
  }
  let permission = false;
  try { permission = !!chrome.downloads?.download && !!chrome.downloads?.onChanged &&
    await new Promise(resolve => chrome.permissions.contains({ permissions: ["downloads"] }, allowed =>
      resolve(!chrome.runtime.lastError && !!allowed))); } catch {}
  if (permission) {
    const url = URL.createObjectURL(raw);
    try {
      const result = await new Promise(resolve => {
        let id = null, settled = false;
        const done = (verified, started) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          chrome.downloads.onChanged.removeListener(onChanged);
          resolve({ verified, started, isGzip });
        };
        const onChanged = delta => {
          if (delta.id !== id) return;
          if (delta.state?.current === "complete") done(true, true);
          else if (delta.state?.current === "interrupted") done(false, true);
        };
        const timer = setTimeout(() => done(false, id !== null), 45000);
        chrome.downloads.onChanged.addListener(onChanged);
        chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false }, downloadId => {
          if (chrome.runtime.lastError || !Number.isSafeInteger(downloadId) || downloadId < 0) done(false, false);
          else {
            id = downloadId;
            // Handles a completed small download before the callback is delivered.
            chrome.downloads.search({ id }, matches => {
              if (settled || chrome.runtime.lastError) return;
              const state = matches?.[0]?.state;
              if (state === "complete") done(true, true);
              else if (state === "interrupted") done(false, true);
            });
          }
        });
      });
      if (result.started) return result;
    } catch {}
    finally { setTimeout(() => URL.revokeObjectURL(url), 90000); }
  }
  // Fallback can trigger a download but can't confirm browser completion.
  if (isGzip) {
    const url = URL.createObjectURL(raw);
    try {
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      return { started: true, verified: false, isGzip: true };
    } finally { setTimeout(() => URL.revokeObjectURL(url), 90000); }
  }
  const started = await downloadSupportText(text, filename, "Support report download started.");
  return { started, verified: false, isGzip: false };
}

async function buildAllSupportInfo({ history = null } = {}) {
  return withSharedSupportRuntimeSnapshot(async () => {
  const historyPromise = history ? Promise.resolve(history) : readSavedSupportHistory();
  const sectionTimeoutMs = 7000;
  const timed = (promise, label) => promiseWithSupportTimeout(
    promise,
    sectionTimeoutMs,
    `${label} timed out after ${Math.round(sectionTimeoutMs / 1000)} seconds. Other support sections still continued.`
  );

  // Diagnostics and lightweight Data Health have their own per-source caps, so
  // they return useful partial results instead of letting one slow store erase
  // the entire section. Independent report sections still run in parallel.
  const fastSnapshotPromise = buildFastSupportSnapshot().catch(error =>
    `Fast snapshot could not be built: ${error?.message || String(error || "unknown error")}`
  );
  const diagnosticPromise = copyDiagnostics({ returnOnly: true })
    .catch(error => `Diagnostic info could not be built: ${error?.message || String(error || "unknown error")}`);
  const performancePromise = timed(copyPerformanceReport({ returnOnly: true }), "Performance report")
    .catch(error => `Performance report could not be built: ${error?.message || String(error || "unknown error")}`);
  const selfCheckPromise = timed(buildPerformanceSelfCheckText(), "Performance self-check")
    .catch(error => `Performance self-check could not be built: ${error?.message || String(error || "unknown error")}`);
  const healthPromise = (async () => {
    const health = await collectDataHealth({ lightweight: true });
    return [health.summaryText, ...(health.rows || []).map(row => `${String(row.state || "ok").toUpperCase()}: ${row.label}: ${row.detail}`)].join("\n");
  })().catch(error => `Data health check failed: ${error?.message || String(error)}`);
  const baselinePromise = promiseWithValueTimeout(storageGet([PERFORMANCE_BASELINE_KEY]), 1500, {})
    .then(stored => stored?.[PERFORMANCE_BASELINE_KEY]
      ? timed(comparePerformanceBaseline({ returnText: true }), "Performance baseline comparison").catch(() => "")
      : "");

  const [fastSnapshot, diagnosticText, performanceText, selfCheckText, healthValue, baselineText] =
    await Promise.all([fastSnapshotPromise, diagnosticPromise, performancePromise, selfCheckPromise, healthPromise, baselinePromise]);
  lastPerformanceSelfCheckText = selfCheckText;

  const sections = [
    "SpicyChat QoL support info",
    `Generated: ${new Date().toISOString()}`,
    "Paste or attach this whole report when someone asks for QoL diagnostics/support info.",
    "Support builder: lightweight state is captured first; heavier sections run in parallel and are independently capped.",
    "",
    "===== FAST SNAPSHOT =====",
    fastSnapshot,
    "",
    "===== DIAGNOSTIC INFO =====",
    diagnosticText,
    "",
    "===== PERFORMANCE REPORT =====",
    performanceText,
    "",
    "===== PERFORMANCE SELF-CHECK =====",
    selfCheckText,
    "",
    "===== DATA HEALTH =====",
    healthValue
  ];
  if (String(baselineText || "").trim()) {
    sections.push("", "===== PERFORMANCE BASELINE COMPARISON =====", baselineText);
  }
  const saved = await historyPromise;
  if (saved?.ok && saved.count) sections.push("", "===== SAVED SUPPORT HISTORY =====", saved.text);
  else sections.push("", "===== SAVED SUPPORT HISTORY =====", saved?.ok ? "No saved checks yet." : `Could not read saved support history: ${saved?.text || "unknown error"}`);
  return sanitizeSupportReportText(sections.join("\n"));
  });
}

async function copyAllSupportInfo() {
  const status = $("diagnosticsStatus");
  if (status) status.textContent = "Building full support report...";
  const text = await buildAllSupportInfo();
  if (isAndroidSupportWebView()) showSupportReportFallback(text);

  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = "Full support report copied. Paste it into Discord, GitHub, or wherever you were asked to send it.";
    return true;
  } catch {
    if (isAndroidSupportWebView() && showSupportReportFallback(text)) {
      $("dsSupportFallbackText")?.focus();
      $("dsSupportFallbackText")?.select();
      if (status) status.textContent = "Clipboard access failed. Support report text is selected below for manual copying.";
    } else {
      const box = $("settingsJson");
      if (box) {
        box.value = text;
        setActiveTab("data");
        box.focus();
        box.select();
      }
      if (status) status.textContent = "Clipboard access failed; the full report was placed in Data / Backup for manual copying.";
    }
    return false;
  }
}

async function downloadAllSupportInfo() {
  const status = $("diagnosticsStatus");
  if (status) status.textContent = "Building full support report for download...";
  try {
    // Capture the checkpoint before building. A later sample must survive.
    // A slow/corrupt history archive must not prevent a new current report.
    // Its error is written into the report, and no history is deleted.
    const history = await readSavedSupportHistory();
    const text = await buildAllSupportInfo({ history });
    const compressed = new TextEncoder().encode(text).byteLength > 256 * 1024;
    const saved = await downloadSupportVerified(text, compressed);
    if (!saved.started) {
      if (status) status.textContent = isAndroidSupportWebView()
        ? "Android did not accept the support file export. The report is in Support report text below; saved history was kept."
        : "Could not start the support download. Saved history was kept.";
      return false;
    }
    if (!saved.verified) {
      if (status) status.textContent = isAndroidSupportWebView()
        ? (lastAndroidSupportExportState === "native"
            ? "Android accepted the file export request. Check Downloads; file completion could not be verified. Support history was kept."
            : "Android file export was unavailable. The report remains in Support report text below; support history was kept.")
        : "Report download started, but saving the file could not be verified. Support history was kept.";
      await refreshSavedSupportStatus();
      return true;
    }
    if (!history?.ok || !history.through) {
      if (status) status.textContent = "Report saved. Saved support history could not be verified and was kept.";
      return true;
    }
    const cleared = await runtimeMessageWithTimeout({ type: "DS_SUPPORT_HISTORY_CLEAR", through: history.through }, 45000).catch(() => null);
    if (cleared?.ok) {
      await refreshSavedSupportStatus();
      if (status) status.textContent = `Full support report saved${saved.isGzip ? " as .txt.gz" : ""}. ${cleared.cleared || 0} included history checks cleared; any newer checks were kept.`;
    } else if (status) status.textContent = "Report saved, but its saved history could not be cleared. History was kept; you can retry later.";
    return true;
  } catch (error) {
    if (status) status.textContent = `Could not download support info: ${error?.message || String(error || "unknown error")}. History was kept.`;
    return false;
  }
}

async function runPerformanceSelfCheck({ returnOnly = false } = {}) {
  const status = $("diagnosticsStatus");
  if (status && !returnOnly) status.textContent = "Running local performance self-check...";
  try {
    const text = await buildPerformanceSelfCheckText();
    lastPerformanceSelfCheckText = text;
    if (!returnOnly && status) {
      const summary = text.split("\n").find(line => line.startsWith("Self-check total:")) || "Self-check finished.";
      const warnings = Number((text.match(/^  ! /gm) || []).length);
      status.textContent = `${summary.replace("Self-check total:", "Self-check:")} ${warnings} warning${warnings === 1 ? "" : "s"}.`;
    }
    return text;
  } catch (error) {
    const text = `SpicyChat QoL performance self-check\nGenerated: ${new Date().toISOString()}\nSelf-check failed: ${error?.message || String(error || "unknown error")}`;
    lastPerformanceSelfCheckText = text;
    if (!returnOnly && status) status.textContent = `Performance self-check failed: ${error?.message || String(error || "unknown error")}`;
    return text;
  }
}

async function downloadPerformanceSelfCheck() {
  const status = $("diagnosticsStatus");
  if (status) status.textContent = "Running performance self-check for download...";
  const text = await runPerformanceSelfCheck({ returnOnly: true });
  return downloadSupportText(text, supportReportFilename("performance-self-check"), "Performance self-check downloaded.");
}

async function resetPerformanceCounters() {
  const status = $("diagnosticsStatus");
  const response = await runtimeMessage({ type: "DS_RESET_PAGE_PERFORMANCE" });
  OPTIONS_PERFORMANCE.storageReads = 0;
  OPTIONS_PERFORMANCE.storageReadTotalMs = 0;
  OPTIONS_PERFORMANCE.storageReadMaxMs = 0;
  OPTIONS_PERFORMANCE.storageWrites = 0;
  OPTIONS_PERFORMANCE.storageWriteTotalMs = 0;
  OPTIONS_PERFORMANCE.storageWriteMaxMs = 0;
  OPTIONS_PERFORMANCE.searchRenders = 0;
  OPTIONS_PERFORMANCE.featureRenders = 0;
  OPTIONS_PERFORMANCE.heavyManagerIdleSlices = 0;
  OPTIONS_PERFORMANCE.savedManagerRefreshBatches = 0;
  OPTIONS_PERFORMANCE.savedManagerRefreshKinds = 0;
  OPTIONS_PERFORMANCE.blockedManagerRefreshBatches = 0;
  OPTIONS_PERFORMANCE.slowStorageReads = [];
  if (status) status.textContent = response?.ok ? "Performance counters reset for Settings and the source SpicyChat tab." : "Settings counters reset. No reachable SpicyChat source tab responded.";
}

// On-demand local performance summary: no new background watcher or remote calls.
async function refreshPerformanceTroubleshooter() {
  const output = $("performanceTroubleshooterResults");
  if (!output) return;
  output.textContent = "Reading local feature timings…";
  const response = await runtimeMessageWithTimeout({ type: "DS_GET_DIAGNOSTIC_CONTEXT" }, 3500).catch(() => null);
  const runtime = response?.pageDiagnostics;
  if (!runtime || response?.runtimeAvailable === false) {
    output.textContent = "No responsive SpicyChat page was found. Open a chat with QoL enabled, then try again. Android WebView may not expose this runtime to Settings; use Copy all support info in that case.";
    return;
  }
  const enabled = !!$("performanceDiagnostics")?.checked;
  const entries = Array.isArray(runtime.performance) ? runtime.performance : [];
  const rows = entries.filter(entry => Number.isFinite(Number(entry?.totalMs)) && Number(entry.totalMs) > 0)
    .sort((a,b) => Number(b.totalMs || 0) - Number(a.totalMs || 0)).slice(0, 8);
  const notes = [
    `Page: ${sanitizeDiagnosticPath(response?.url || "") || "unknown"}`,
    `Local timing collection: ${enabled ? "ON" : "OFF"}`,
    "These are elapsed timings (which may include waiting), not proven CPU usage or causation."
  ];
  if (!rows.length) notes.push("No feature timings collected yet. Enable local performance timings, use a chat for a while, then refresh.");
  else {
    notes.push("Top recorded QoL steps by total elapsed time:");
    rows.forEach(item => notes.push(`• ${String(item.name || "step").slice(0,70)}: ${Number(item.totalMs || 0).toFixed(1)} ms total; ${Number(item.calls || 0)} calls; ${Number(item.maxMs || 0).toFixed(1)} ms max`));
  }
  const counters = runtime.runtimePerformance || {};
  notes.push(`Observer batches: ${Number(counters.observerBatches || 0)}; message-lane runs: ${Number(counters.messageLaneRuns || 0)}; skipped disabled steps: ${Number(counters.disabledFeatureStepSkips || 0)}`);
  const emptyTransitions = Number(counters.chatUnexpectedEmptyTransitions || 0);
  if (emptyTransitions) notes.push(`Possible blank-chat transitions: ${emptyTransitions}; recovered ${Number(counters.chatUnexpectedEmptyRecovered || 0)}; still empty after checks ${Number(counters.chatUnexpectedEmptyUnresolved || 0)}; last previous count ${Number(counters.chatUnexpectedEmptyLastBefore || 0)}; generation ${counters.chatUnexpectedEmptyLastGeneration || "unknown"} (DOM-only observation; no proof of deletion)`);
  output.textContent = notes.join("\n");
}
