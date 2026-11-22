// One-shot WebExtension API compatibility for early document-start loaders.
// Orion/iOS can expose a working runtime without runtime.id, and some
// implementations accept only Promise calls (or only callback calls).
(() => {
  "use strict";
  if (globalThis.DSQBrowserApiCompat?.version >= 1) return;

  function api() {
    return globalThis.chrome?.storage?.local || globalThis.browser?.storage?.local || null;
  }

  // Do not return {} for an absent or failed reply: that would incorrectly
  // make a not-yet-hydrated setting look explicitly enabled or disabled.
  function readLocal(keys) {
    const storage = api();
    if (typeof storage?.get !== "function") return Promise.resolve(null);
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => finish(null), 6500);
      function finish(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value && typeof value === "object" && !Array.isArray(value) ? value : null);
      }
      function callback(value) {
        try {
          if (globalThis.chrome?.runtime?.lastError || globalThis.browser?.runtime?.lastError) return finish(null);
        } catch {}
        finish(value);
      }
      function accept(result) {
        if (result && typeof result.then === "function") {
          Promise.resolve(result).then(finish, () => finish(null));
        } else if (result && typeof result === "object") {
          finish(result);
        }
      }
      try {
        accept(storage.get(keys, callback));
      } catch {
        // Promise-only WebExtension implementations may reject a callback.
        try { accept(storage.get(keys)); } catch { finish(null); }
      }
    });
  }

  function watchLocal(handler) {
    const changeEvent = globalThis.chrome?.storage?.onChanged || globalThis.browser?.storage?.onChanged;
    if (typeof changeEvent?.addListener !== "function") return false;
    try { changeEvent.addListener(handler); return true; } catch { return false; }
  }

  globalThis.DSQBrowserApiCompat = Object.freeze({ version: 1, readLocal, watchLocal });
})();
