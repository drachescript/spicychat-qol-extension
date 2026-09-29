(() => {
  "use strict";

  const bootstrapParams = new URLSearchParams(location.search || "");
  const botStatusBootstrap = bootstrapParams.get("dsQolBotStatusWorker") === "1";
  if (botStatusBootstrap) {
    // Persist this before SpicyChat's router gets a chance to rewrite/reload the
    // Home URL. sessionStorage is tab-scoped, so it never marks other tabs.
    try { sessionStorage.setItem("dsQolBackgroundWorkerKind", "bot-status"); } catch {}
  }
  let sessionWorkerKind = "";
  try { sessionWorkerKind = String(sessionStorage.getItem("dsQolBackgroundWorkerKind") || ""); } catch {}
  if (
    sessionWorkerKind === "bot-status" ||
    botStatusBootstrap ||
    bootstrapParams.get("dsQolRecommendationWorker") === "1" ||
    bootstrapParams.get("dsQuickLessLike") === "1"
  ) {
    // Dedicated API helpers must not install the Typesense/exact-count bridge.
    // Their URL marker is bootstrap-only; durable worker identity is handled by
    // the background tab/session heartbeat after SpicyChat rewrites the URL.
    return;
  }

  const SOURCE = "spicychat-qol-exact-message-counts";
  const CONTROL_SOURCE = "spicychat-qol-exact-message-counts-control";
  const BUFFER_KEY = "__DSQ_EXACT_MESSAGE_COUNT_BUFFER__";
  let injected = false;
  let enabled = false;

  window[BUFFER_KEY] = Array.isArray(window[BUFFER_KEY]) ? window[BUFFER_KEY] : [];

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== SOURCE) return;
    const buffer = window[BUFFER_KEY];
    buffer.push(event.data);
    if (buffer.length > 80) buffer.splice(0, buffer.length - 80);
  });

  function sendState() {
    try {
      window.postMessage({
        source: CONTROL_SOURCE,
        type: "DSQ_EXACT_MESSAGE_COUNTS_ENABLED",
        enabled
      }, "*");
    } catch {}
  }

  function injectBridge() {
    if (injected) {
      sendState();
      return;
    }
    injected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("content/exact-message-counts-bridge.js");
    script.async = false;
    script.dataset.dsQolExactMessageCountsBridge = "1";
    script.addEventListener("load", () => {
      sendState();
      script.remove();
    }, { once: true });
    script.addEventListener("error", () => {
      injected = false;
      script.remove();
    }, { once: true });
    (document.documentElement || document.head || document).appendChild(script);
  }

  function setEnabled(next) {
    enabled = !!next;
    if (enabled) injectBridge();
    else if (injected) sendState();
  }

  function applySettings(settings) {
    setEnabled(!!(settings?.enabled && (settings?.showExactMessageCounts || settings?.showBotCreationDates)));
  }

  // Install the MAIN-world bridge immediately at document_start. Waiting for
  // chrome.storage.local.get() creates a race with SpicyChat's initial
  // Typesense request, which can leave the exact-count cache empty until the
  // page performs another search. The bridge only observes Typesense responses
  // that SpicyChat already fetched; the settings still control whether exact
  // counts and/or creation dates are displayed.
  injectBridge();

  try {
    chrome.storage.local.get("settings", result => applySettings(result?.settings || {}));
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.settings) return;
      applySettings(changes.settings.newValue || {});
    });
  } catch {}
})();
