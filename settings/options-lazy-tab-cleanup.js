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
