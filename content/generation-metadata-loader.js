(() => {
  "use strict";

  const SOURCE = "spicychat-qol-generation-metadata";
  const CONTROL_SOURCE = "spicychat-qol-generation-metadata-control";
  const BUFFER_KEY = "__DSQ_GENERATION_METADATA_BUFFER__";

  let injected = false;
  let enabled = false;

  window[BUFFER_KEY] = Array.isArray(window[BUFFER_KEY]) ? window[BUFFER_KEY] : [];

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== SOURCE) return;

    if (window.__DSQ_GENERATION_METADATA_READY__) return;
    const buffer = window[BUFFER_KEY];
    buffer.push(event.data);
    if (buffer.length > 160) buffer.splice(0, buffer.length - 160);
  });

  function sendState() {
    window.postMessage({
      source: CONTROL_SOURCE,
      type: "DSQ_GENERATION_METADATA_ENABLED",
      enabled
    }, "*");
  }

  function injectBridge() {
    if (injected) {
      sendState();
      return;
    }

    injected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("content/generation-metadata-bridge.js");
    script.async = false;
    script.dataset.dsQolGenerationMetadataBridge = "1";
    script.addEventListener("load", () => {
      sendState();
      script.remove();
    }, { once: true });
    script.addEventListener("error", () => script.remove(), { once: true });
    const append = () => {
      const root = document.documentElement || document.head || document.body;
      if (root) root.appendChild(script);
    };

    if (document.documentElement || document.head || document.body) append();
    else document.addEventListener("readystatechange", append, { once: true });
  }

  function setEnabled(nextEnabled) {
    enabled = !!nextEnabled;
    if (enabled) injectBridge();
    else if (injected) sendState();
  }

  function applySettings(settings) {
    const toolkitDeferred = !!settings?.saiToolkitCompatibility && !!window.__DSQ_SAI_TOOLKIT_DETECTED__;
    setEnabled(!!settings?.enabled && metadataRequested(settings) && (!toolkitDeferred || !!settings?.enableContextWindowWarning));
  }


  function metadataRequested(settings) {
    return !!(
      settings?.showGenerationMetadata ||
      settings?.showMessageTimestamps ||
      settings?.showGenerationModel ||
      settings?.showGenerationElapsed ||
      settings?.showGenerationSettings ||
      settings?.enableContextWindowWarning
    );
  }

  window.__DSQ_SET_GENERATION_METADATA_ENABLED__ = setEnabled;

  try {
    chrome.storage.local.get("settings", result => {
      applySettings(result?.settings || {});
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.settings) return;
      applySettings(changes.settings.newValue || {});
    });
  } catch {}
})();
