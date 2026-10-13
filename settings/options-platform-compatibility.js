// Shared Settings device/environment and unsupported-feature display controllers.
// Loaded before options.js; function bodies resolve shared Settings helpers at invocation.
function detectSettingsEnvironment() {
  const shared = PLATFORM_API?.detectEnvironment?.();
  const ua = navigator.userAgent || "";
  const android = shared ? !!shared.android : /Android/i.test(ua);
  const webview = shared ? !!shared.webview : (android && (/;\s*wv\)/i.test(ua) || /Version\/4\.0.*Chrome\/\d+.*Mobile Safari/i.test(ua)));
  let displayMode = "browser";
  try {
    if (window.matchMedia?.("(display-mode: window-controls-overlay)")?.matches) displayMode = "window-controls-overlay";
    else if (window.matchMedia?.("(display-mode: standalone)")?.matches) displayMode = "standalone";
    else if (window.matchMedia?.("(display-mode: minimal-ui)")?.matches) displayMode = "minimal-ui";
    else if (window.matchMedia?.("(display-mode: fullscreen)")?.matches) displayMode = "fullscreen";
  } catch {}
  const installedApp = displayMode !== "browser" || navigator.standalone === true || !!window.__spicyChatQolAndroidApp;
  const firefox = /Firefox\/|FxiOS\//i.test(ua);
  const waterfox = /Waterfox/i.test(ua);
  const opera = /\bOPR\//i.test(ua);
  const chromium = /Chrome\//i.test(ua) && !firefox && !waterfox;
  return {
    android,
    webview,
    installedApp,
    displayMode,
    firefox,
    waterfox,
    opera,
    chromium,
    ua,
    platform: shared?.platform || (android ? "android" : "desktop"),
    capabilities: shared?.capabilities || {},
    label: shared?.label || (android ? "Android" : "Desktop browser")
  };
}

function refreshAndroidSettingsVisibility(forceShow = false) {
  const env = detectSettingsEnvironment();
  let manual = false;
  try { manual = localStorage.getItem("dsShowAndroidSettings") === "1"; } catch {}
  const show = forceShow || manual || env.android || env.webview || env.installedApp;
  const tab = $("androidTabButton");
  if (tab) tab.hidden = !show;

  let text = env.webview
    ? "Android WebView detected."
    : env.android
      ? "Android/mobile browser detected (including Firefox-family browsers)."
      : env.installedApp
        ? `Installed/standalone web-app mode detected (${env.displayMode}).`
        : "Normal desktop browser tab detected.";
  const compactForced = checked("androidTopBarMenu") && value("androidAppControlsMode", "auto") !== "off";
  if (compactForced) text += " Compact QoL top-bar menu is manually enabled here, so detection will not block it.";
  else if (value("androidAppControlsMode", "auto") === "off") text += " Compact/mobile controls are set to Never.";

  if ($("androidEnvironmentStatus")) $("androidEnvironmentStatus").textContent = text;
  if ($("androidSettingsEnvironmentStatus")) $("androidSettingsEnvironmentStatus").textContent = text;
  return show;
}

function applyAndroidRecommendedUi() {
  setControlValue("androidAppControlsMode", "android");
  setControlValue("androidTopBarMenu", true);
  setControlValue("androidHideComposerShortcuts", true);
  setControlValue("androidTopBarOoc", true);
  setControlValue("androidTopBarAsterisk", true);
  setControlValue("androidTopBarFormatting", true);
  setControlValue("androidTopBarTranslation", false);
  setControlValue("androidTopBarScroll", true);
  setControlValue("androidTopBarPersona", true);
  setControlValue("androidTopBarModel", true);
  setControlValue("chatPerformanceMode", true);
  setControlValue("pauseQolInHiddenTabs", true);
  refreshAndroidSettingsVisibility(true);
  showSettingsToast("Mobile Recommended applied. Changes save automatically.");
}

function setupAndroidSettings() {
  refreshAndroidSettingsVisibility(false);
  $("showAndroidAppSettings")?.addEventListener("click", () => {
    try { localStorage.setItem("dsShowAndroidSettings", "1"); } catch {}
    refreshAndroidSettingsVisibility(true);
    setActiveTab("android");
  });
  $("hideAndroidAppSettings")?.addEventListener("click", () => {
    try { localStorage.removeItem("dsShowAndroidSettings"); } catch {}
    const env = detectSettingsEnvironment();
    if (!env.webview) {
      $("androidTabButton")?.setAttribute("hidden", "");
      setActiveTab("general");
    }
  });
  $("applyAndroidRecommended")?.addEventListener("click", applyAndroidRecommendedUi);
  $("androidTopBarMenu")?.addEventListener("change", () => refreshAndroidSettingsVisibility(true));
  $("androidAppControlsMode")?.addEventListener("change", () => refreshAndroidSettingsVisibility(true));
}


function settingIsCustomizedForPlatform(name, settings = loadedSettingsSnapshot) {
  if (!name || !settings || typeof settings !== "object") return false;
  const desired = settings[name];
  const fallback = DEFAULT_SETTINGS[name];
  return !storageValueMatches(desired, fallback);
}

function platformCompatibilityForControl(control) {
  if (!control?.id || !PLATFORM_API) return { supported: true, requires: [], reason: "" };
  if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, control.id)) {
    return PLATFORM_API.settingCompatibility?.(control.id, PLATFORM_API.detectEnvironment?.()) || { supported: true, requires: [], reason: "" };
  }
  return PLATFORM_API.actionCompatibility?.(control, PLATFORM_API.detectEnvironment?.()) || { supported: true, requires: [], reason: "" };
}

function platformBadgeHost(control) {
  if (!control) return null;
  const label = control.closest?.("label");
  if (label) return label.querySelector("span") || label;
  return null;
}

function markPlatformUnsupportedControl(control, compatibility, settings = loadedSettingsSnapshot) {
  if (!control || compatibility?.supported !== false) return;
  if (control.dataset.dsPlatformOriginalDisabled === undefined) {
    control.dataset.dsPlatformOriginalDisabled = control.disabled ? "1" : "0";
  }
  control.dataset.dsPlatformUnsupported = "1";
  control.disabled = true;
  control.setAttribute("aria-disabled", "true");
  if (compatibility.reason) control.title = compatibility.reason;

  const row = control.closest?.("label, .button-row, .sub-card");
  if (row) row.classList.add("ds-platform-unsupported-row");

  const isSetting = Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, control.id);
  if (!isSetting) return;
  const host = platformBadgeHost(control);
  if (!host) return;
  let badge = [...(host.querySelectorAll?.(".ds-platform-badge") || [])].find(item => item.dataset.for === control.id) || null;
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "ds-platform-badge";
    badge.dataset.for = control.id;
    host.appendChild(badge);
  }
  const desired = settings?.[control.id];
  const saved = typeof desired === "boolean" ? desired : settingIsCustomizedForPlatform(control.id, settings);
  badge.classList.toggle("is-inactive", saved);
  badge.textContent = saved ? "Desktop only · saved" : "Desktop only";
  badge.title = compatibility.reason || "Saved here but inactive on Android.";
}

function clearPlatformCompatibilityMarks() {
  document.querySelectorAll('[data-ds-platform-unsupported="1"]').forEach(control => {
    const original = control.dataset.dsPlatformOriginalDisabled;
    if (original !== undefined) control.disabled = original === "1";
    control.removeAttribute("data-ds-platform-unsupported");
    control.removeAttribute("aria-disabled");
    delete control.dataset.dsPlatformOriginalDisabled;
  });
  document.querySelectorAll(".ds-platform-unsupported-row").forEach(row => row.classList.remove("ds-platform-unsupported-row"));
  document.querySelectorAll(".ds-platform-badge").forEach(badge => badge.remove());
}

function refreshPlatformCompatibilityUi(settings = loadedSettingsSnapshot) {
  if (!PLATFORM_API) return;
  const env = PLATFORM_API.detectEnvironment?.() || detectSettingsEnvironment();
  document.documentElement.dataset.dsPlatform = env.platform || (env.android ? "android" : "desktop");
  const notice = $("platformCompatibilityNotice");
  const noticeText = $("platformCompatibilityNoticeText");
  if (notice) notice.hidden = !env.android;
  if (noticeText && env.android) {
    noticeText.textContent = "Desktop-only bulk, helper-tab and real-browser-tab controls are dimmed here. Their saved values are kept unchanged, so syncing from Android will not switch those desktop preferences off.";
  }

  clearPlatformCompatibilityMarks();
  if (!env.android) return;

  const controls = [...document.querySelectorAll("input[id], select[id], textarea[id], button[id]")];
  for (const control of controls) {
    const compatibility = platformCompatibilityForControl(control);
    if (!compatibility.supported) markPlatformUnsupportedControl(control, compatibility, settings);
  }

  // Manager bulk bars are action UI rather than persisted settings, so not all
  // of their controls have "bulk" in the individual id. Disable the whole
  // action surface on Android while leaving the underlying saved lists usable.
  const bulkReason = { supported: false, reason: "Bulk operations are desktop-only in QoL for now." };
  document.querySelectorAll(".bot-manager-bulkbar button, .bot-manager-bulkbar select, .bot-manager-bulkbar input").forEach(control => {
    markPlatformUnsupportedControl(control, bulkReason, settings);
  });
}

function setupPlatformCompatibility() {
  refreshPlatformCompatibilityUi();
  document.addEventListener("change", event => {
    if (!(event.target instanceof Element)) return;
    window.setTimeout(() => refreshPlatformCompatibilityUi(), 0);
  }, true);
}

