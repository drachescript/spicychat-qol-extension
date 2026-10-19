/* Presets adjust related options only when chosen; individual user opt-outs are preserved. */
const MAXIMUM_PERFORMANCE_AUTO_OPTIONS = Object.freeze([
  "chatPerformanceMode",
  "desktopAppPerformanceGuard",
  "pauseQolInHiddenTabs",
  "autoPerformanceLargeChats",
  "deferQolWhileTyping",
  "pauseQolWhileMessageEditing",
  "reduceQolAnimations",
  "reduceOptionsAnimations"
]);

function maximumPerformanceOptOuts() {
  const stored = loadedSettingsSnapshot?.maximumPerformanceOptOuts;
  return new Set(Array.isArray(stored) ? stored.filter(id => MAXIMUM_PERFORMANCE_AUTO_OPTIONS.includes(id)) : []);
}

function applyMaximumPerformancePreset() {
  if (value("runtimePerformanceMode") !== "maximum") return;
  const excluded = maximumPerformanceOptOuts();
  for (const id of MAXIMUM_PERFORMANCE_AUTO_OPTIONS) {
    const input = $(id);
    if (!input || input.disabled || excluded.has(id) || input.checked) continue;
    input.checked = true;
    if (settingsAutosaveReady) queueSettingsAutosaveForControl(input, "change");
  }
  // Instrumentation is deliberately not auto-enabled: it adds measurement overhead.
  applyOptionsPerformancePreferences({ reduceOptionsAnimations: checked("reduceOptionsAnimations") });
  if (settingsAutosaveReady) {
    queueSettingsAutosaveValue("maximumPerformancePresetInitialized", true, { delay: 90 });
  }
}

function setupMaximumPerformancePreset() {
  $("runtimePerformanceMode")?.addEventListener("change", applyMaximumPerformancePreset);
  for (const id of MAXIMUM_PERFORMANCE_AUTO_OPTIONS) {
    $(id)?.addEventListener("change", () => {
      if (!settingsAutosaveReady || value("runtimePerformanceMode") !== "maximum") return;
      const excluded = maximumPerformanceOptOuts();
      if (checked(id)) excluded.delete(id);
      else excluded.add(id);
      queueSettingsAutosaveValue("maximumPerformanceOptOuts", [...excluded].sort(), { delay: 90 });
    });
  }
}

function initializeMaximumPerformancePreset() {
  // One-time migration for users who already had Maximum selected before this
  // feature existed. Later reloads must not override deliberate OFF choices.
  if (value("runtimePerformanceMode") === "maximum" &&
      loadedSettingsSnapshot?.maximumPerformancePresetInitialized !== true) {
    applyMaximumPerformancePreset();
  }
}
