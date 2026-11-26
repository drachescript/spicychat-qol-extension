// On-demand Settings discovery, presets, and local preference history.
// No profile data, chat text, network requests, polling or extra startup reads.
const SETTINGS_PREFERENCE_HISTORY_KEY = "dsSettingsPreferenceHistoryV1";
const SETTINGS_ADDITIONAL_PRESETS = Object.freeze({
  performance: ["desktopAppPerformanceGuard", "autoPerformanceLargeChats", "protectDraftDuringMessageRemoval"],
  mobile: ["androidTopBarMenu", "keepChatHeaderVisibleWhileTyping", "showScrollToTopButton", "showScrollToBottomButton", "protectDraftDuringMessageRemoval"],
  archive: ["trackOpenedChats", "trackFavoriteBots", "showLaterBotButtons", "botBackupToolsEnabled", "botArchiveOnProfileVisit", "lorebookBackupToolsEnabled", "showChatExportButton"],
  research: ["showChatExportButton", "showBulkChatResearchExport", "chatExportIncludeBotInfo", "chatExportIncludeGenerationDetails"],
  roleplay: ["showFormattingToolbar", "enableSavedTextSnippets", "showChatSearch", "enableMessageBookmarks", "enableChatSceneNotes"],
  privacy: ["protectDraftDuringMessageRemoval", "hideTabNotificationBadge", "hideFloatingPremiumPopups", "hideAdvertBanners"]
});
function settingsPreferenceLabel(key) {
  const control = $(key);
  const label = control?.closest("label");
  const text = label?.querySelector(":scope > span")?.textContent;
  if (text?.trim()) return text.trim().replace(/\s+/g, " ");
  return String(key || "Setting").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}
function settingsPreferencePresetPlan(name) {
  const preset = name === "both" ? { ...PRESET_VALUES.recommended, ...PRESET_VALUES.creator } : PRESET_VALUES[name];
  const extra = SETTINGS_ADDITIONAL_PRESETS[name];
  if (!preset && !extra) return null;
  const keys = preset ? Object.keys(preset).filter(k => preset[k] === true) : extra;
  return [...new Set(["enabled", ...BASELINE_SAFETY_ON_KEYS, ...keys])].filter(key =>
    typeof DEFAULT_SETTINGS[key] === "boolean" && !isSettingOwnedByExcludedFeature(key) && loadedSettingsSnapshot[key] !== true);
}
let settingsPresetReviewName = "";
let settingsPresetReviewedKeys = "";
function previewSettingsPreferencePreset(name) {
  const review = $("settingsPresetReview"), list = $("settingsPresetReviewList"), status = $("presetStatus");
  if (!settingsAutosaveReady) { if (status) status.textContent = "Settings are still loading."; return; }
  const plan = settingsPreferencePresetPlan(name);
  if (!plan || !review || !list) return;
  settingsPresetReviewName = name;
  settingsPresetReviewedKeys = plan.join("\n");
  review.hidden = false;
  review.open = true;
  $("settingsPresetReviewSummary").textContent = `${name[0].toUpperCase()}${name.slice(1)}: ${plan.length} settings to enable. No existing features will be disabled. ${name === "privacy" ? "These are local interface controls, not a privacy guarantee or a change to SpicyChat data handling." : name === "archive" ? "Local backup tools only; no public Archive submission is enabled." : ""}`;
  list.replaceChildren(...plan.map(key => makeElement("li", { text: settingsPreferenceLabel(key) })));
  $("settingsPresetConfirm").disabled = !plan.length;
}
function settingsDiscoveryIncludes(item, view, basic) {
  const entry = item.entry || {};
  const keys = item.controlIds || [];
  if (basic && (item.tabName === "advanced" || /diagnostic|developer|experimental|migration|recovery|research|compatibility/i.test(entry.name || ""))) return false;
  if (view === "enabled") {
    if (!settingsAutosaveReady || entry.builtIn || entry.planned) return false;
    const candidates = entry.setting ? [entry.setting] : Array.isArray(entry.settings) ? entry.settings : keys;
    const considered = entry.statusMode === "primary" ? candidates.slice(0, 1) : candidates;
    const enabled = key => {
      const dependency = dependencyParentFor(key);
      return loadedSettingsSnapshot[key] === true && (!dependency || loadedSettingsSnapshot[dependency.parent] === true);
    };
    if (loadedSettingsSnapshot.enabled === false) return false;
    return considered.length > 0 && (entry.statusMode === "all" ? considered.every(enabled) : considered.some(enabled));
  }
  if (view === "new") return [entry.added, entry.updated].some(v => v && compareVersions(v, "0.2.98") > 0) || keys.some(k => FEATURE_CHANGE_MARKERS[k]?.version === "0.3.0");
  if (view === "pinned") {
    const info = settingsCardInfo(item.card);
    return !!info && settingsDiscoveryPinnedKeys.has(info.key);
  }
  return true;
}
let settingsDiscoveryPinnedKeys = new Set();
function refreshSettingsDiscoveryPins() { settingsDiscoveryPinnedKeys = new Set(pinnedSettingsSections()); }
function preferenceHistoryRows() {
  const raw = readLocalJson(SETTINGS_PREFERENCE_HISTORY_KEY, []);
  return Array.isArray(raw) ? raw.filter(row => row && typeof row.key === "string" && Object.hasOwn(DEFAULT_SETTINGS, row.key) && Number.isFinite(row.at)).slice(0, 60) : [];
}
function recordSettingsPreferenceChanges(patch, previous) {
  try {
    const at = Date.now();
    const rows = Object.entries(patch).filter(([key, value]) => Object.hasOwn(DEFAULT_SETTINGS, key) && !storageValueMatches(value, previous[key])).map(([key, value]) => ({
      key, at,
      // Only reversible boolean values; never store private strings, arrays or objects.
      ...(typeof value === "boolean" && typeof previous[key] === "boolean" ? { before: previous[key], after: value } : {})
    }));
    if (!rows.length) return;
    writeLocalJson(SETTINGS_PREFERENCE_HISTORY_KEY, [...rows, ...preferenceHistoryRows()].slice(0, 60));
    window.dsqRefreshPreferenceDiscovery?.();
  } catch {} // Optional history must never make a successful settings save fail.
}
async function undoSettingsPreference(row, button) {
  if (!settingsAutosaveReady || typeof row.before !== "boolean" || typeof row.after !== "boolean" || row.key === "enabled" || isSettingOwnedByExcludedFeature(row.key)) return;
  button.disabled = true;
  try {
    if (!await flushSettingsAutosave({ force: true })) throw new Error("Pending settings could not be saved.");
    // Refuse stale undo, including changes made elsewhere since this entry.
    const latest = preferenceHistoryRows().find(item => item.key === row.key);
    if (!latest || latest.at !== row.at || latest.after !== row.after) throw new Error("A newer change exists.");
    const fresh = await storageGetChecked(["settings"]);
    if (!fresh.ok || fresh.data.settings?.[row.key] !== row.after || loadedSettingsSnapshot[row.key] !== row.after) throw new Error("The saved value changed elsewhere; reopen Settings before undoing.");
    setPageSetting(row.key, row.before);
    queueSettingsAutosaveValue(row.key, row.before, { delay: 0 });
    if (!await flushSettingsAutosave({ force: true })) throw new Error("Undo save could not be verified.");
    updateSettingDependencies(); applySettingsEnabledOnlyFilter(); DS_FEATURE_INDEX_REFRESH?.();
    showSettingsToast("Previous toggle value restored.");
  } catch (error) { showSettingsToast(String(error?.message || error)); }
  finally { button.disabled = false; window.dsqRefreshPreferenceDiscovery?.(); }
}
function renderSettingsPreferenceHistory(host, query) {
  const seen = new Set();
  const rows = preferenceHistoryRows().filter(row => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return `${settingsPreferenceLabel(row.key)} ${row.key}`.toLowerCase().includes(query);
  });
  const clear = makeElement("button", { text: "Clear preference history", attrs: { type: "button" } });
  clear.addEventListener("click", () => { if (confirm("Clear local Settings preference history? Your settings will stay unchanged.")) { writeLocalJson(SETTINGS_PREFERENCE_HISTORY_KEY, []); renderSettingsPreferenceHistory(host, query); } });
  const result = rows.map(row => {
    const info = makeElement("div", { className: "ds-preference-history-info" }, [makeElement("strong", { text: settingsPreferenceLabel(row.key) }), makeElement("small", { text: `${new Date(row.at).toLocaleString()}${typeof row.after === "boolean" ? ` · ${row.after ? "Enabled" : "Disabled"}` : " · Value changed"}` })]);
    const open = makeElement("button", { text: "Open", attrs: { type: "button" } });
    open.addEventListener("click", () => { if (!revealSettingsTarget(row.key)) showSettingsToast("Open this setting through its usual category."); });
    const actions = [info, open];
    if (row.key !== "enabled" && typeof row.before === "boolean" && typeof row.after === "boolean" && loadedSettingsSnapshot[row.key] === row.after) {
      const undo = makeElement("button", { text: "Undo", attrs: { type: "button" } });
      undo.addEventListener("click", () => undoSettingsPreference(row, undo)); actions.push(undo);
    }
    return makeElement("div", { className: "ds-preference-history-row" }, actions);
  });
  host.hidden = false;
  host.replaceChildren(makeElement("p", { className: "hint", text: "Local history of saved settings changes. Undo is available for the latest unchanged toggle; private text values are not recorded." }), ...(result.length ? result : [makeElement("p", { text: "No matching saved changes yet." })]), clear);
}
let settingsPerformanceLive = null;
async function readSettingsPerformanceLive() {
  const button = $("settingsPerfRuntime"), status = $("settingsPerfRuntimeSummary");
  if (!button || button.disabled) return;
  button.disabled = true; status.textContent = "Reading current runtime and saved queue checkpoints…";
  try {
    const [context, queues] = await Promise.allSettled([
      runtimeMessageWithTimeout({ type: "DS_GET_DIAGNOSTIC_CONTEXT" }, 12000),
      promiseWithValueTimeout(storageGetChecked([BOT_STATUS_PAUSED_QUEUE_KEY, "botStatusPausedStaleQueueV1"]), 4000, { ok: false })
    ]);
    const current = context.status === "fulfilled" ? context.value : null;
    const available = !!(current?.runtimeAvailable && current?.pageDiagnostics);
    const runtime = available ? current.pageDiagnostics.runtimePerformance || {} : null;
    const stored = queues.status === "fulfilled" && queues.value?.ok ? queues.value.data : null;
    const counts = key => { const q = stored?.[key]; return { pending: Array.isArray(q?.ids) ? q.ids.length : 0, held: Array.isArray(q?.heldIds) ? q.heldIds.length : 0, phase: ["running", "paused"].includes(q?.phase) ? q.phase : "none", updatedAt: Number(q?.updatedAt || 0) }; };
    settingsPerformanceLive = { capturedAt: Date.now(), runtime: runtime ? { longTasks: Number(runtime.longTasks || 0), maxLongTaskMs: Number(runtime.maxLongTaskMs || 0), mutationSubtreeSkips: Number(runtime.messageMutationNestedSubtreeSkips || 0), messageLaneRuns: Number(runtime.messageLaneRuns || 0) } : null,
      queues: stored ? { regular: counts(BOT_STATUS_PAUSED_QUEUE_KEY), stale: counts("botStatusPausedStaleQueueV1") } : null };
    const q = settingsPerformanceLive.queues;
    status.textContent = `${runtime ? `${settingsPerformanceLive.runtime.longTasks} browser Long Tasks (not necessarily QoL), max ${settingsPerformanceLive.runtime.maxLongTaskMs.toFixed(1)} ms.` : "Live runtime unavailable; not a zero measurement."} ${q ? `Durable regular queue: ${q.regular.pending} pending, ${q.regular.held} held; stale: ${q.stale.pending} pending, ${q.stale.held} held. Running checkpoint does not establish live execution.` : "Queue counts unavailable."}`;
  } catch { status.textContent = "Runtime or queue snapshot unavailable. Existing records remain unchanged."; }
  finally { button.disabled = false; }
}
function settingsPerformanceSnapshot() {
  const phases = Object.entries(OPTIONS_PERFORMANCE.phases || {}).sort((a,b) => b[1].maxMs-a[1].maxMs).slice(0,20);
  return { version: optionsTelemetryIdentity.version, build: optionsTelemetryIdentity.build, revision: optionsTelemetryIdentity.revision,
    settings: { storageReads: OPTIONS_PERFORMANCE.storageReads, storageReadMaxMs: OPTIONS_PERFORMANCE.storageReadMaxMs, storageWrites: OPTIONS_PERFORMANCE.storageWrites, storageWriteMaxMs: OPTIONS_PERFORMANCE.storageWriteMaxMs, longTaskSupported: !!OPTIONS_PERFORMANCE.longTaskSupported, searchRenders: OPTIONS_PERFORMANCE.searchRenders },
    scan: { runningInThisPage: !!botAvailabilityScanRunning, preparationInThisPage: typeof botStatusScanInvocationActive !== "undefined" && !!botStatusScanInvocationActive, queue: "See Bot Status for durable pending / held counts" },
    live: settingsPerformanceLive, phases: Object.fromEntries(phases), timing: "Wall timings unless explicitly named processing; frame proxies are not measured input latency; browser Long Tasks are not attributed to QoL." };
}
function renderSettingsPerformanceCenter() {
  const snapshot = settingsPerformanceSnapshot();
  $("settingsPerfSummary").textContent = `QoL ${snapshot.version} (${snapshot.build}) · ${snapshot.settings.storageReads} storage reads, max ${Number(snapshot.settings.storageReadMaxMs || 0).toFixed(1)} ms · ${snapshot.settings.storageWrites} writes · Bot Status ${snapshot.scan.runningInThisPage ? "running in this page" : "not running in this page"}.`;
  $("settingsPerfOperations").replaceChildren(...Object.entries(snapshot.phases).map(([name,v]) => makeElement("div", { className: "ds-perf-operation" }, [makeElement("strong", { text: name }), makeElement("small", { text: `${v.count} calls · max ${v.maxMs.toFixed(1)} ms · last ${v.lastMs.toFixed(1)} ms · total ${v.totalMs.toFixed(1)} ms` })])));
  return snapshot;
}
function setupSettingsPreferenceTools() {
  $("settingsPreviewPreset")?.addEventListener("click", () => previewSettingsPreferencePreset($("settingsExtraPreset").value));
  $("settingsPresetConfirm")?.addEventListener("click", async event => {
    const button = event.currentTarget, name = settingsPresetReviewName;
    const latest = settingsPreferencePresetPlan(name);
    if (!latest || latest.join("\n") !== settingsPresetReviewedKeys) { previewSettingsPreferencePreset(name); return; }
    button.disabled = true;
    try { if (await applyPreset(name)) $("settingsPresetReview").hidden = true; }
    catch (error) { $("presetStatus").textContent = String(error?.message || error); }
    finally { button.disabled = false; }
  });
  $("settingsPerformanceCenter")?.addEventListener("toggle", event => { if (event.currentTarget.open) renderSettingsPerformanceCenter(); });
  $("settingsPerfRefresh")?.addEventListener("click", renderSettingsPerformanceCenter);
  $("settingsPerfRuntime")?.addEventListener("click", readSettingsPerformanceLive);
  $("settingsPerfCopy")?.addEventListener("click", async () => {
    const text = JSON.stringify(renderSettingsPerformanceCenter(), null, 2);
    try { await navigator.clipboard.writeText(text); showSettingsToast("Performance snapshot copied."); }
    catch { showSupportReportFallback(text); }
  });
  $("openBotStatusWorkspace")?.addEventListener("click", () => {
    const hint = $("botStatusWorkspaceHint");
    try {
      const url = chrome.runtime.getURL("options.html?scanWorkspace=1#saved");
      const opened = window.open(url, "_blank");
      if (!opened) throw new Error("The browser blocked the scan workspace.");
      try { opened.opener = null; } catch {}
      if (hint) hint.textContent = "Start or resume in the dedicated tab. Keep that tab open; existing duplicate-scan and checkpoint protections apply.";
    } catch { if (hint) hint.textContent = "Unable to open a separate tab. You can still use the normal Bot Status scan controls."; }
  });
  if (new URLSearchParams(location.search).get("scanWorkspace") === "1") {
    document.title = "QoL Bot Status scan workspace";
    if ($("openBotStatusWorkspace")) $("openBotStatusWorkspace").hidden = true;
  }
  // Keyboard shortcut only on the Settings document, not on the SpicyChat page.
  document.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
    event.preventDefault(); setSettingsSearchExpanded(true, { focus: true }); $("settingsSearch")?.focus();
  });
}
