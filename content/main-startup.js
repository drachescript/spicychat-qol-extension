// Start the main runtime after the core scheduler and diagnostics are registered.
if (!window.__DSQ_TAB_GATE__?.paused) {
  window.DragonScriptQoL?.startMainRuntime?.();
}
