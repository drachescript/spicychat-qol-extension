// Start after core scheduler, diagnostics, and split runtime modules are registered.
if (!window.__DSQ_TAB_GATE__?.paused) {
  const DS = window.DragonScriptQoL;
  if (typeof DS?.startMainRuntime === "function") {
    DS.startMainRuntime();
  } else if (DS) {
    // A late scheduler factory can defer main.js startup briefly. Its successful
    // initialization consumes this flag and starts the runtime exactly once.
    DS.__qolMainStartupPending = true;
  }
}
