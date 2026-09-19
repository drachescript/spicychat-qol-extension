(() => {
  "use strict";

  // Keep the MAIN-world auth bridge completely asleep when card token info is
  // disabled. This avoids wrapping page fetch/XHR on the large majority of
  // installs that do not use token estimates.
  const LOADER_ID = "ds-card-token-main-bridge-loader";
  const CONTROL_EVENT = "ds-qol-card-token-bridge-control-v1";
  let requested = false;

  function sendControl(enabled) {
    try {
      window.dispatchEvent(new CustomEvent(CONTROL_EVENT, { detail: { enabled: !!enabled } }));
    } catch {}
  }

  function inject() {
    if (requested || document.documentElement?.getAttribute("data-ds-card-token-main-bridge") === "2") {
      sendControl(true);
      return;
    }
    requested = true;
    const script = document.createElement("script");
    script.id = LOADER_ID;
    script.src = chrome.runtime.getURL("content/card-token-main.js");
    script.async = false;
    script.onload = () => {
      script.remove();
      sendControl(true);
    };
    script.onerror = () => {
      requested = false;
      script.remove();
    };
    (document.documentElement || document.head || document).appendChild(script);
  }

  window.DSCardTokenBridgeLoader = {
    ensure() { inject(); },
    disable() { sendControl(false); }
  };

  function isBotProfileRoute() {
    return /^\/(?:[a-z]{2}\/)?chatbot\/[0-9a-f-]{20,}(?:[/?#]|$)/i.test(String(location.pathname || ""));
  }

  function syncFromSettings(settings) {
    const publicArchiveNeedsProfileBridge = !!settings?.botArchiveRememberSeenPublic && isBotProfileRoute();
    const enabled = !!(settings && settings.enabled !== false && (settings.showCardGreetingTokenInfo || settings.deepSleepDisabledFeatures === false || publicArchiveNeedsProfileBridge));
    if (enabled) inject();
    else sendControl(false);
  }

  try {
    chrome.storage.local.get(["settings"], result => syncFromSettings(result?.settings || {}));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      syncFromSettings(changes.settings.newValue || {});
    });
  } catch {
    // If storage is unavailable, stay asleep rather than patching the page by
    // default. card-token-info will simply use its background fallback.
  }
})();
