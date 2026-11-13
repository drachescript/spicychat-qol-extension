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
