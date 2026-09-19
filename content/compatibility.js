(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const PRESENCE_KEY = "dsSaiToolkitPresence";
  const DEFERRED_FEATURES = new Set([
    "generation-profiles",
    "generation-metadata",
    "chat-export",
    "home-for-you",
    "failed-message-helper"
  ]);

  let observer = null;
  let detectionTimer = null;
  let presenceSaved = false;

  function metadataRequested(settings) {
    return !!(
      settings?.showGenerationMetadata ||
      settings?.showMessageTimestamps ||
      settings?.showGenerationModel ||
      settings?.showGenerationElapsed ||
      settings?.showGenerationSettings
    );
  }

  function hasSaiToolkitMarker() {
    return !!document.querySelector([
      "#sai-toolkit-sidebar-btn",
      "#sai-toolkit-mobile-btn",
      "#sai-toolkit-button-css",
      "[id^='sai-toolkit-']",
      ".sai-wysiwyg-editor",
      "button[aria-label='SAI-Toolkit-button']",
      ".toolkit-button-text"
    ].join(", "));
  }

  async function rememberPresence() {
    if (presenceSaved || !DS.isExtensionContextValid?.()) return;
    presenceSaved = true;

    await DS.storageSet?.({
      [PRESENCE_KEY]: {
        detected: true,
        detectedAt: Date.now(),
        url: location.href
      }
    });
  }

  DS.detectSaiToolkit = function detectSaiToolkit({ persist = true } = {}) {
    const detected = hasSaiToolkitMarker();
    DS.state.saiToolkitDetected = detected;
    window.__DSQ_SAI_TOOLKIT_DETECTED__ = detected;

    const settings = DS.state?.settings || {};
    const metadataEnabled = !!settings.enabled && metadataRequested(settings) && !(settings.saiToolkitCompatibility !== false && detected);
    try { window.__DSQ_SET_GENERATION_METADATA_ENABLED__?.(metadataEnabled); } catch {}

    if (detected && persist) {
      rememberPresence().catch(() => {});
    }

    return detected;
  };

  DS.shouldDeferToSaiToolkit = function shouldDeferToSaiToolkit(feature) {
    const settings = DS.state?.settings || {};
    const name = String(feature || "");
    if (settings.saiToolkitCompatibility === false) return false;
    if (!DEFERRED_FEATURES.has(name)) return false;
    if (DS.detectSaiToolkit?.({ persist: true }) !== true) return false;

    // Toolkit exposes the active Message Recovery flag to its page-context
    // interceptor through SpicyChat localStorage. Only defer QoL's helper when
    // Toolkit recovery is actually enabled, not merely because Toolkit exists.
    if (name === "failed-message-helper") {
      try { return localStorage.getItem("sai_message_recovery_enabled") === "true"; }
      catch { return false; }
    }

    return true;
  };

  DS.startSaiToolkitDetection = function startSaiToolkitDetection() {
    if (DS.detectSaiToolkit?.({ persist: true })) return;
    if (observer || !document.documentElement) return;

    observer = new MutationObserver(() => {
      clearTimeout(detectionTimer);
      detectionTimer = setTimeout(() => {
        if (!DS.detectSaiToolkit?.({ persist: true })) return;
        observer?.disconnect();
        observer = null;
        DS.scheduleRun?.({ priority: "critical", source: "sai-toolkit-detected" });
        DS.scheduleRun?.({ priority: "slow", source: "sai-toolkit-detected" });
      }, 180);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  DS.SAI_TOOLKIT_PRESENCE_KEY = PRESENCE_KEY;
})();
