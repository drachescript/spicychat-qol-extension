// One-shot WebExtension API compatibility for early document-start loaders.
// Orion/iOS can expose a working runtime without runtime.id, and some
// implementations accept only Promise calls (or only callback calls).
(() => {
  "use strict";
  if (globalThis.DSQBrowserApiCompat?.version >= 2) return;

  // Prefer Chromium's chrome API, but a browser API may be the only working
  // implementation in Firefox/Orion. Do not treat a failed read as empty data.
  function uniqueProviders(getter) {
    const providers = [getter(globalThis.chrome), getter(globalThis.browser)];
    return providers.filter((value, index) => value && providers.indexOf(value) === index);
  }

  function readLocal(keys) {
    const providers = uniqueProviders(root => root?.storage?.local)
      .filter(store => typeof store.get === "function");
    if (!providers.length) return Promise.resolve(null);
    return new Promise(resolve => {
      let done = false;
      let sourceIndex = 0;
      let sourceTimer = null;
      const deadline = setTimeout(() => finish(null), 6500);
      function finish(value) {
        if (done) return;
        done = true;
        clearTimeout(deadline);
        clearTimeout(sourceTimer);
        resolve(value && typeof value === "object" && !Array.isArray(value) ? value : null);
      }
      function nextProvider() {
        if (done) return;
        clearTimeout(sourceTimer);
        if (sourceIndex >= providers.length) return finish(null);
        const storage = providers[sourceIndex++];
        let active = true;
        const complete = (value, failed = false) => {
          if (done || !active) return;
          active = false;
          clearTimeout(sourceTimer);
          if (failed || !value || typeof value !== "object" || Array.isArray(value)) nextProvider();
          else finish(value);
        };
        if (sourceIndex < providers.length) {
          // Only try a second API after a stalled primary. Do not duplicate
          // normal storage reads or hold a failing API open indefinitely.
          sourceTimer = setTimeout(() => complete(null, true), 3200);
        }
        const callback = value => {
          let error = false;
          try { error = !!(globalThis.chrome?.runtime?.lastError || globalThis.browser?.runtime?.lastError); }
          catch { error = true; }
          complete(value, error);
        };
        const accept = (result, retryWithoutCallback = false) => {
          if (result && typeof result.then === "function") {
            Promise.resolve(result).then(value => complete(value), () => {
              if (retryWithoutCallback) readWithoutCallback();
              else complete(null, true);
            });
          } else if (result && typeof result === "object") complete(result);
          else if (!retryWithoutCallback) complete(null, true);
        };
        // Some Promise-only shims reject a callback asynchronously instead of
        // throwing. Retry once without a callback; never retry a valid read.
        function readWithoutCallback() {
          if (!active || done) return;
          try { accept(storage.get(keys)); }
          catch { complete(null, true); }
        }
        try { accept(storage.get(keys, callback), true); }
        catch { readWithoutCallback(); }
      }
      nextProvider();
    });
  }

  function watchLocal(handler) {
    const events = uniqueProviders(root => root?.storage?.onChanged);
    for (const event of events) {
      if (typeof event.addListener !== "function") continue;
      try { event.addListener(handler); return true; } catch {}
    }
    return false;
  }

  function listenRuntime(handler) {
    const events = uniqueProviders(root => root?.runtime?.onMessage);
    for (const event of events) {
      if (typeof event.addListener !== "function") continue;
      try { event.addListener(handler); return true; } catch {}
    }
    return false;
  }

  function extensionUrl(relativePath) {
    const runtimes = uniqueProviders(root => root?.runtime);
    for (const runtime of runtimes) {
      if (typeof runtime.getURL !== "function") continue;
      try {
        const url = runtime.getURL(relativePath);
        // Native WebView wrappers can return app-local HTTPS or asset URLs;
        // trust only getURL() from the extension runtime, never page input.
        if (typeof url === "string" && url.trim()) return url;
      } catch {}
    }
    return null;
  }

  globalThis.DSQBrowserApiCompat = Object.freeze({ version: 2, readLocal, watchLocal, listenRuntime, extensionUrl });
})();
