// On-demand Settings panel loader; native script URL resolves relative to
// Options on Chrome, Firefox and the Android embedded Settings page.
// Backup schema and normalization stay in options-tab-cleanup-core.js.
let tabCleanupPanelLoadPromise = null;
let tabCleanupPanelReady = false;
function ensureTabCleanupPanelLoaded() {
  if (tabCleanupPanelReady) return Promise.resolve(true);
  if (tabCleanupPanelLoadPromise) return tabCleanupPanelLoadPromise;
  tabCleanupPanelLoadPromise = new Promise((resolve, reject) => {
    // On Android, the native bundler embeds the original Tab Cleanup script
    // inside the Settings HTML. That code is already registered; do not try
    // loading a file:// script which doesn't exist in the Android WebView.
    if (typeof bindTabCleanupSettingsEvents === "function" &&
        typeof renderTabCleanupSessions === "function" &&
        typeof loadTabCleanupTopics === "function") {
      try {
        bindTabCleanupSettingsEvents();
        tabCleanupPanelReady = true;
        Promise.allSettled([renderTabCleanupSessions(), loadTabCleanupTopics()]);
        resolve(true);
      } catch (error) { tabCleanupPanelLoadPromise = null; reject(error); }
      return;
    }
    const script = document.createElement("script");
    script.src = "settings/options-tab-cleanup.js";
    script.async = false;
    script.onload = () => {
      try {
        if (typeof bindTabCleanupSettingsEvents !== "function" ||
            typeof renderTabCleanupSessions !== "function" ||
            typeof loadTabCleanupTopics !== "function") {
          throw new Error("Tab Cleanup module did not register");
        }
        bindTabCleanupSettingsEvents();
        tabCleanupPanelReady = true;
        Promise.allSettled([renderTabCleanupSessions(), loadTabCleanupTopics()]);
        resolve(true);
      } catch (error) { tabCleanupPanelLoadPromise = null; reject(error); }
    };
    script.onerror = () => {
      script.remove();
      tabCleanupPanelLoadPromise = null;
      reject(new Error("Could not load Tab Cleanup Settings tools"));
    };
    document.head.append(script);
  });
  return tabCleanupPanelLoadPromise;
}
function installLazyTabCleanupPanel() {
  // Existing tab navigation owns the active state. We don't add an observer
  // or recurring timer just to detect a panel that most users never open.
  const activate = () => ensureTabCleanupPanelLoaded().catch(error => {
    const status = document.getElementById("tabCleanupDiagnosticStatus");
    if (status) status.textContent = String(error?.message || error);
  });
  document.addEventListener("click", event => {
    const tab = event.target?.closest?.('.tab-button[data-tab="browser"]');
    if (tab || event.target?.closest?.('[data-page="browser"] #tabCleanupDiagnosticCard')) activate();
  }, { capture: true, passive: true });
  // Sidebar/mobile navigation and search can select tabs programmatically.
  document.addEventListener("focusin", event => {
    if (event.target?.closest?.('[data-page="browser"] #tabCleanupDiagnosticCard')) activate();
  }, { passive: true });
  if (document.querySelector('.tab-page[data-page="browser"].active')) activate();
}


// v0.2.86: keep the large Diagnostics/Support implementation out of every
// Settings launch. All existing buttons still use the original implementation.
// No polling, new observer, or change to diagnostic/storage data collection.
let optionsDiagnosticsLoadPromise = null;
let optionsDiagnosticsBound = false;
function isAndroidSupportWebView() {
  // Also required by lightweight storage diagnostics before full support UI loads.
  return !!(window.flutter_inappwebview?.callHandler || window._dsRequestExport ||
    /\bwv\b|; wv\)|Flutter/i.test(navigator.userAgent || ""));
}
function ensureOptionsDiagnosticsLoaded() {
  if (optionsDiagnosticsBound) return Promise.resolve(true);
  if (optionsDiagnosticsLoadPromise) return optionsDiagnosticsLoadPromise;
  optionsDiagnosticsLoadPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (typeof copyDiagnostics !== "function" ||
          typeof buildAllSupportInfo !== "function") {
        optionsDiagnosticsLoadPromise = null;
        reject(new Error("Diagnostics module did not register"));return;
      }
      if (!optionsDiagnosticsBound) {
        optionsDiagnosticsBound = true;
        setupControlCenterControls();
      }
      resolve(true);
    };
    // Android can embed Settings scripts inline; don't attempt a file URL if
    // the native packager already executed the original script.
    if (typeof copyDiagnostics === "function" &&
        typeof buildAllSupportInfo === "function") {finish();return;}
    const script = document.createElement("script");
    script.src = "settings/features/options-diagnostics.js";
    script.async = false;
    script.onload = finish;
    script.onerror = () => {
      script.remove();optionsDiagnosticsLoadPromise = null;
      reject(new Error("Could not load Diagnostics Settings"));
    };
    document.head.append(script);
  });
  return optionsDiagnosticsLoadPromise;
}
function setupControlCenterControls() {
  // The real binder replaces this function after the first Diagnostics load.
  // Control tab activation already calls setupControlCenterView below.
}
async function setupControlCenterView(...args) {
  await ensureOptionsDiagnosticsLoaded();
  return window.setupControlCenterView(...args);
}
async function runOptionsDiagnosticsAction(name,...args) {
  try {
    await ensureOptionsDiagnosticsLoaded();
    const action = window[name];
    if (typeof action !== "function") throw new Error(`${name} was not registered`);
    return await action(...args);
  } catch (error) {
    const status = document.getElementById("diagnosticsStatus") ||
      document.getElementById("controlSupportStatus");
    if (status) status.textContent = String(error?.message || error);
    return false;
  }
}

// Heavy Settings scan engines are not needed for the General, Chat or Appearance tabs.
// Keep the original functions and storage formats; this only delays evaluation
// until a matching tab or an existing action actually needs a module.
let botStatusRecoverableHeldCount = 0;
let botStatusHeldReviewRecordCount = 0;
let botStatusHeldReviewIds = new Set();
let botStatusTrackedStaleCount = 0;
const dsqHeavySettingsModules = Object.create(null);
function dsqLoadSettingsTool(group, path, readyName) {
  if (typeof window[readyName] === "function" &&
      window[readyName] !== dsqHeavySettingsStubs[readyName]) return Promise.resolve(true);
  if (dsqHeavySettingsModules[group]) return dsqHeavySettingsModules[group];
  dsqHeavySettingsModules[group] = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // Resolve from the installed extension, not the document's relative URL.
    // After an extension reload a stale Settings page can lose its context.
    const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
    script.src = group === "maintenance"
      ? (runtime?.getURL?.(path) || new URL(path, document.baseURI).href) : path;
    script.async = false;
    script.onload = () => {
      if (typeof window[readyName] !== "function" ||
          window[readyName] === dsqHeavySettingsStubs[readyName]) {
        script.remove();
        dsqHeavySettingsModules[group] = null;
        reject(new Error(`${path} did not register its functions`));
        return;
      }
      resolve(true);
    };
    script.onerror = () => {
      script.remove();
      dsqHeavySettingsModules[group] = null;
      reject(new Error(`Could not load ${path}`));
    };
    document.head.appendChild(script);
  }).catch(error => {
    dsqHeavySettingsModules[group] = null;
    throw error;
  });
  return dsqHeavySettingsModules[group];
}
const dsqHeavySettingsStubs = Object.create(null);
function ensureBotStatusScanTools() {
  return dsqLoadSettingsTool("status", "settings/features/options-bot-status-scan.js", "runBotAvailabilityScan");
}
function ensureBulkFeedbackTools() {
  return dsqLoadSettingsTool("feedback", "settings/features/options-bulk-feedback.js", "runBlockedBulkDislike");
}
function dsqHeavyToolStub(group, fnName, ...args) {
  const loader = group === "status" ? ensureBotStatusScanTools : ensureBulkFeedbackTools;
  return loader().then(() => {
    const fn = window[fnName];
    if (typeof fn !== "function" || fn === dsqHeavySettingsStubs[fnName]) {
      throw new Error(`Settings tool ${fnName} did not register`);
    }
    return fn(...args);
  }).catch(error => {
    const statusId = group === "status" ? "botAvailabilityScanStatus" : "blockedBotDislikeStatus";
    const el = document.getElementById(statusId);
    if (el) el.textContent = String(error?.message || error);
    throw error;
  });
}
function waitForBotStatusPace(...args) { return dsqHeavyToolStub("status", "waitForBotStatusPace", ...args); }
dsqHeavySettingsStubs["waitForBotStatusPace"] = waitForBotStatusPace;
function waitForRecommendationPace(...args) { return dsqHeavyToolStub("status", "waitForRecommendationPace", ...args); }
dsqHeavySettingsStubs["waitForRecommendationPace"] = waitForRecommendationPace;
function waitForRecommendationSteadyPace(...args) { return dsqHeavyToolStub("status", "waitForRecommendationSteadyPace", ...args); }
dsqHeavySettingsStubs["waitForRecommendationSteadyPace"] = waitForRecommendationSteadyPace;
function refreshBotStatusLastRunFeedback(...args) { return dsqHeavyToolStub("status", "refreshBotStatusLastRunFeedback", ...args); }
dsqHeavySettingsStubs["refreshBotStatusLastRunFeedback"] = refreshBotStatusLastRunFeedback;
function reviewAndRemoveIneligibleBotStatusPending(...args) { return dsqHeavyToolStub("status", "reviewAndRemoveIneligibleBotStatusPending", ...args); }
dsqHeavySettingsStubs["reviewAndRemoveIneligibleBotStatusPending"] = reviewAndRemoveIneligibleBotStatusPending;
function refreshBotStatusPauseButton(...args) { return dsqHeavyToolStub("status", "refreshBotStatusPauseButton", ...args); }
dsqHeavySettingsStubs["refreshBotStatusPauseButton"] = refreshBotStatusPauseButton;
function runBotAvailabilityScan(...args) { return dsqHeavyToolStub("status", "runBotAvailabilityScan", ...args); }
dsqHeavySettingsStubs["runBotAvailabilityScan"] = runBotAvailabilityScan;
function updateBotStatusScanEstimate(...args) { return dsqHeavyToolStub("status", "updateBotStatusScanEstimate", ...args).catch(() => false); }
dsqHeavySettingsStubs["updateBotStatusScanEstimate"] = updateBotStatusScanEstimate;
function runBlockedBulkDislike(...args) { return dsqHeavyToolStub("feedback", "runBlockedBulkDislike", ...args); }
dsqHeavySettingsStubs["runBlockedBulkDislike"] = runBlockedBulkDislike;
function bulkDislikeBlockedBots(...args) { return dsqHeavyToolStub("feedback", "bulkDislikeBlockedBots", ...args); }
dsqHeavySettingsStubs["bulkDislikeBlockedBots"] = bulkDislikeBlockedBots;
function resetAndRedoBlockedDislikes(...args) { return dsqHeavyToolStub("feedback", "resetAndRedoBlockedDislikes", ...args); }
dsqHeavySettingsStubs["resetAndRedoBlockedDislikes"] = resetAndRedoBlockedDislikes;
function clearBlockedDislikeHistory(...args) { return dsqHeavyToolStub("feedback", "clearBlockedDislikeHistory", ...args); }
dsqHeavySettingsStubs["clearBlockedDislikeHistory"] = clearBlockedDislikeHistory;
function runBlockedBulkLessLike(...args) { return dsqHeavyToolStub("feedback", "runBlockedBulkLessLike", ...args); }
dsqHeavySettingsStubs["runBlockedBulkLessLike"] = runBlockedBulkLessLike;
function bulkLessLikeBlockedBots(...args) { return dsqHeavyToolStub("feedback", "bulkLessLikeBlockedBots", ...args); }
dsqHeavySettingsStubs["bulkLessLikeBlockedBots"] = bulkLessLikeBlockedBots;
function resetAndRedoBlockedLessLikes(...args) { return dsqHeavyToolStub("feedback", "resetAndRedoBlockedLessLikes", ...args); }
dsqHeavySettingsStubs["resetAndRedoBlockedLessLikes"] = resetAndRedoBlockedLessLikes;
function clearBlockedLessLikeHistory(...args) { return dsqHeavyToolStub("feedback", "clearBlockedLessLikeHistory", ...args); }
dsqHeavySettingsStubs["clearBlockedLessLikeHistory"] = clearBlockedLessLikeHistory;
function updateBlockedBulkResumeControls(...args) { return dsqHeavyToolStub("feedback", "updateBlockedBulkResumeControls", ...args).catch(() => false); }
dsqHeavySettingsStubs["updateBlockedBulkResumeControls"] = updateBlockedBulkResumeControls;
function updateBlockedLessLikeResumeControls(...args) { return dsqHeavyToolStub("feedback", "updateBlockedLessLikeResumeControls", ...args).catch(() => false); }
dsqHeavySettingsStubs["updateBlockedLessLikeResumeControls"] = updateBlockedLessLikeResumeControls;
// One-time work is performed only when the corresponding tab becomes visible.
let dsqBotStatusRateLoaded = false;
function dsqRefreshHeavyToolsForTab(tabName, { activateStatus = false } = {}) {
  if (tabName === "saved" && activateStatus && document.getElementById("scanBotAvailability")) {
    return ensureBotStatusScanTools().then(async () => {
      if (typeof optionsDataLoaded !== "undefined" && optionsDataLoaded) {
        const queues = await refreshBotStatusPauseButton();
        if (queues?.readError) throw new Error("Could not read saved Bot Status queues. Retry preparation before scanning.");
        await refreshBotStatusLastRunFeedback();
        if (!dsqBotStatusRateLoaded) {
          dsqBotStatusRateLoaded = true;
          await storageGet([BOT_STATUS_LAST_RATE_KEY]).then(result => {
            const rate = Number(result?.[BOT_STATUS_LAST_RATE_KEY] || 0);
            if (rate >= 100 && rate <= 120000) botStatusPreviousScanRateMs = rate;
            if (typeof updateBotStatusScanEstimate === "function") updateBotStatusScanEstimate();
          }).catch(() => { dsqBotStatusRateLoaded = false; });
        }
        updateBotStatusScanEstimate();
      }
      return true;
    }).catch(error => { const el = document.getElementById("botAvailabilityScanStatus"); if (el) el.textContent = String(error.message || error); return false; });
  } else if (tabName === "blocking" &&
             (document.getElementById("bulkDislikeBlockedBots") || document.getElementById("bulkLessLikeBlockedBots"))) {
    ensureBulkFeedbackTools().then(() => {
      if (typeof optionsDataLoaded !== "undefined" && optionsDataLoaded) {
        updateBlockedBulkResumeControls();
        updateBlockedLessLikeResumeControls();
      }
    }).catch(error => { const el = document.getElementById("blockedBotDislikeStatus"); if (el) el.textContent = String(error.message || error); });
  }
}

// v0.2.92: blocked/archived maintenance is a deliberate user action (or a
// post-upload maintenance request), not part of normal Settings boot. Keep
// the original safe delete/recovery implementation unchanged and load it only
// when one of its four entry points is called. Existing Settings button
// handlers can keep calling the same global names.
function ensureBotStatusMaintenanceTools() {
  return dsqLoadSettingsTool("maintenance", "settings/features/options-bot-status-maintenance.js", "cleanupArchivedBlockedBots");
}
function dsqStatusMaintenanceStub(name, ...args) {
  return ensureBotStatusMaintenanceTools().then(() => {
    document.getElementById("dsBotStatusMaintenanceRetry")?.remove();
    const action = window[name];
    if (typeof action !== "function" || action === dsqHeavySettingsStubs[name]) {
      throw new Error(`Bot Status maintenance action ${name} did not register`);
    }
    return action(...args);
  }).catch(error => {
    const status = document.getElementById("blockedArchiveCleanupStatus") ||
      document.getElementById("botAvailabilityScanStatus");
    if (status) {
      status.textContent = `Maintenance unavailable: ${String(error?.message || error)}. Retry loading the status, or reload QoL and reopen Settings if it still fails. No cleanup is retried automatically.`;
      if (!document.getElementById("dsBotStatusMaintenanceRetry")) {
        const retry = document.createElement("button");
        retry.id = "dsBotStatusMaintenanceRetry";
        retry.type = "button";
        retry.textContent = "Retry maintenance status";
        retry.addEventListener("click", async () => {
          retry.disabled = true;
          try { await refreshBlockedArchiveCleanupStatus(); }
          catch {} finally { retry.disabled = false; }
        });
        status.insertAdjacentElement("afterend", retry);
      }
    }
    throw error;
  });
}
function cleanupArchivedBlockedBots(...args) { return dsqStatusMaintenanceStub("cleanupArchivedBlockedBots", ...args); }
dsqHeavySettingsStubs.cleanupArchivedBlockedBots = cleanupArchivedBlockedBots;
function refreshBlockedArchiveCleanupStatus(...args) { return dsqStatusMaintenanceStub("refreshBlockedArchiveCleanupStatus", ...args); }
dsqHeavySettingsStubs.refreshBlockedArchiveCleanupStatus = refreshBlockedArchiveCleanupStatus;
function compactOlderBlockedBotData(...args) { return dsqStatusMaintenanceStub("compactOlderBlockedBotData", ...args); }
dsqHeavySettingsStubs.compactOlderBlockedBotData = compactOlderBlockedBotData;
function cleanConfirmedUnavailableBots(...args) { return dsqStatusMaintenanceStub("cleanConfirmedUnavailableBots", ...args); }
dsqHeavySettingsStubs.cleanConfirmedUnavailableBots = cleanConfirmedUnavailableBots;


// The creator-backup manager is only needed when its Settings tab or an
// explicit manual export opens. This lightweight adapter preserves its public
// entry points, with one shared in-flight load and retry after a load failure.
// No observers, polling or new saved data are introduced.
let dsqCreatorBackupModulePromise = null;
let dsqCreatorBackupModuleReady = false;
const dsqCreatorBackupStubs = Object.create(null);
function ensureCreatorBackupModuleLoaded() {
  if (dsqCreatorBackupModuleReady) return Promise.resolve(true);
  if (dsqCreatorBackupModulePromise) return dsqCreatorBackupModulePromise;
  dsqCreatorBackupModulePromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (typeof window.loadCreatorBackupManager !== "function" ||
          window.loadCreatorBackupManager === dsqCreatorBackupStubs.loadCreatorBackupManager ||
          typeof window.setupCreatorBackupManager !== "function" ||
          window.setupCreatorBackupManager === dsqCreatorBackupStubs.setupCreatorBackupManager) {
        dsqCreatorBackupModulePromise = null;
        reject(new Error("Creator backup manager did not register"));
        return;
      }
      try {
        window.setupCreatorBackupManager();
        dsqCreatorBackupModuleReady = true;
        resolve(true);
      } catch (error) {
        dsqCreatorBackupModulePromise = null;
        reject(error);
      }
    };
    // Android packagers may have embedded the original script already.
    if (typeof window.loadCreatorBackupManager === "function" &&
        window.loadCreatorBackupManager !== dsqCreatorBackupStubs.loadCreatorBackupManager) {
      finish();
      return;
    }
    const script = document.createElement("script");
    script.src = "settings/features/options-creator-backups.js";
    script.async = false;
    script.onload = finish;
    script.onerror = () => {
      script.remove();
      dsqCreatorBackupModulePromise = null;
      reject(new Error("Could not load Creator Backup Settings"));
    };
    document.head.appendChild(script);
  });
  return dsqCreatorBackupModulePromise;
}
function dsqCreatorBackupCall(method, args) {
  return ensureCreatorBackupModuleLoaded().then(() => {
    const actual = window[method];
    if (typeof actual !== "function" || actual === dsqCreatorBackupStubs[method]) {
      throw new Error(`Creator backup action ${method} did not register`);
    }
    return actual(...args);
  }).catch(error => {
    const status = document.getElementById("creatorBackupSummary");
    if (status) status.textContent = String(error?.message || error);
    throw error;
  });
}
function loadCreatorBackupManager(...args) { return dsqCreatorBackupCall("loadCreatorBackupManager", args); }
dsqCreatorBackupStubs.loadCreatorBackupManager = loadCreatorBackupManager;
function renderCreatorBackupManager(...args) { return dsqCreatorBackupCall("renderCreatorBackupManager", args); }
dsqCreatorBackupStubs.renderCreatorBackupManager = renderCreatorBackupManager;
function downloadPortableBotProfile(...args) { return dsqCreatorBackupCall("downloadPortableBotProfile", args); }
dsqCreatorBackupStubs.downloadPortableBotProfile = downloadPortableBotProfile;
function downloadBotArchiveEntry(...args) { return dsqCreatorBackupCall("downloadBotArchiveEntry", args); }
dsqCreatorBackupStubs.downloadBotArchiveEntry = downloadBotArchiveEntry;
function creatorBackupDate(timestamp) {
  const time = Number(timestamp) || 0;
  if (!time) return "Unknown date";
  try { return new Date(time).toLocaleString(); } catch { return "Unknown date"; }
}
function setupCreatorBackupManager() {
  // The normal Settings tab navigation calls loadCreatorBackupManager when
  // Bot Tools is selected, including deep links and Settings search.
  if (typeof activeOptionsTab === "function" && activeOptionsTab() === "bot-tools") {
    void ensureCreatorBackupModuleLoaded().catch(error => {
      const status = document.getElementById("creatorBackupSummary");
      if (status) status.textContent = String(error?.message || error);
    });
  }
}
dsqCreatorBackupStubs.setupCreatorBackupManager = setupCreatorBackupManager;
