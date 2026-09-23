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

  // SpicyChat beta/experimental capability detection. This is passive: it only
  // learns from controls/routes SpicyChat already rendered for the signed-in
  // account. It never attempts to unlock a feature or probes private APIs.
  const SPICYCHAT_BETA_CAPABILITIES_KEY = "dsSpicyChatBetaCapabilitiesV1";
  let betaDetectionTimer = null;
  let betaObserver = null;
  let betaCacheLoaded = false;
  let betaStored = null;

  function betaPath() {
    return String(location.pathname || "/").replace(/^\/[a-z]{2}(?=\/)/i, "").replace(/\/+$/, "") || "/";
  }

  function buttonByExactText(text) {
    const wanted = String(text || "").trim().toLowerCase();
    return [...document.querySelectorAll("button")].find(button => String(button.textContent || "").trim().toLowerCase() === wanted) || null;
  }

  function observeSpicyChatBetaCapabilities() {
    const path = betaPath();
    const exploreLink = document.querySelector('a[href="/lorebooks/explore"],a[href^="/lorebooks/explore?"],a[href*="spicychat.ai/lorebooks/explore"]');
    const publicLabel = document.querySelector('[data-translate-key="lorebook:form.field.visibility.public"]');
    const publicButton = publicLabel?.closest?.("button") || buttonByExactText("Public");
    const storySwitch = buttonByExactText("Switch to Story Mode");

    let publicLorebooks = "unknown";
    let storyMode = "unknown";
    const evidence = [];

    if (exploreLink || path === "/lorebooks/explore" || path.startsWith("/lorebooks/explore/")) {
      publicLorebooks = "available";
      evidence.push("lorebooks-explore");
    } else if (publicButton && (/^\/lorebook\/(?:create|edit)(?:\/|$)/i.test(path) || /^\/lorebook\/[^/]+\/edit(?:\/|$)/i.test(path))) {
      publicLorebooks = publicButton.disabled || publicButton.getAttribute("aria-disabled") === "true" ? "unavailable" : "available";
      evidence.push(publicLorebooks === "available" ? "public-lorebook-control" : "public-lorebook-disabled");
    }

    if (path === "/story" || path.startsWith("/story/")) {
      storyMode = "available";
      evidence.push("story-route");
    } else if (storySwitch) {
      storyMode = "available";
      evidence.push("story-menu");
    }

    return { publicLorebooks, storyMode, evidence, path };
  }

  async function loadBetaCapabilityCache() {
    if (betaCacheLoaded) return betaStored;
    betaCacheLoaded = true;
    try {
      const result = await DS.storageGet?.([SPICYCHAT_BETA_CAPABILITIES_KEY]) || {};
      betaStored = result[SPICYCHAT_BETA_CAPABILITIES_KEY] || null;
    } catch {
      betaStored = null;
    }
    return betaStored;
  }

  function mergeCapability(previousValue, observedValue) {
    if (observedValue === "available" || observedValue === "unavailable") return observedValue;
    return ["available", "unavailable"].includes(previousValue) ? previousValue : "unknown";
  }

  async function persistBetaCapabilities(observed) {
    const previous = await loadBetaCapabilityCache() || {};
    const previousCaps = previous.capabilities || {};
    const capabilities = {
      publicLorebooks: mergeCapability(previousCaps.publicLorebooks, observed.publicLorebooks),
      storyMode: mergeCapability(previousCaps.storyMode, observed.storyMode)
    };
    const detected = Object.values(capabilities).includes("available");
    const evidence = [...new Set([...(Array.isArray(previous.evidence) ? previous.evidence : []), ...(observed.evidence || [])])].slice(-12);
    const now = Date.now();
    const changed =
      previous.detected !== detected ||
      previousCaps.publicLorebooks !== capabilities.publicLorebooks ||
      previousCaps.storyMode !== capabilities.storyMode ||
      evidence.join("|") !== (Array.isArray(previous.evidence) ? previous.evidence : []).join("|");
    const stale = now - Number(previous.lastCheckedAt || 0) > 6 * 60 * 60 * 1000;
    const next = {
      schema: 1,
      detected,
      capabilities,
      evidence,
      firstDetectedAt: detected ? (Number(previous.firstDetectedAt) || now) : Number(previous.firstDetectedAt) || 0,
      lastDetectedAt: detected ? now : Number(previous.lastDetectedAt) || 0,
      lastCheckedAt: now,
      lastPath: observed.path || betaPath()
    };

    betaStored = next;
    DS.state.spicyChatBetaCapabilities = next;
    window.__DSQ_SPICYCHAT_BETA_CAPABILITIES__ = next;
    document.documentElement.dataset.dsSpicychatBeta = detected ? "1" : "0";
    document.documentElement.dataset.dsSpicychatPublicLorebooks = capabilities.publicLorebooks;
    document.documentElement.dataset.dsSpicychatStoryMode = capabilities.storyMode;

    if ((changed || stale) && DS.isExtensionContextValid?.()) {
      await DS.storageSet?.({ [SPICYCHAT_BETA_CAPABILITIES_KEY]: next });
    }
    return next;
  }

  DS.detectSpicyChatBetaCapabilities = async function detectSpicyChatBetaCapabilities() {
    return persistBetaCapabilities(observeSpicyChatBetaCapabilities());
  };

  DS.hasSpicyChatBetaCapability = function hasSpicyChatBetaCapability(name) {
    return DS.state?.spicyChatBetaCapabilities?.capabilities?.[String(name || "")] === "available";
  };

  DS.startSpicyChatBetaDetection = function startSpicyChatBetaDetection() {
    const run = () => DS.detectSpicyChatBetaCapabilities?.().catch(() => {});
    run();
    clearTimeout(betaDetectionTimer);
    betaDetectionTimer = setTimeout(run, 700);

    if (!betaObserver && document.documentElement) {
      let observerStopsAt = Date.now() + 12000;
      betaObserver = new MutationObserver(mutations => {
        let relevant = false;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes || []) {
            if (!(node instanceof Element)) continue;
            if (node.matches?.('a[href*="/lorebooks/explore"],button') || node.querySelector?.('a[href*="/lorebooks/explore"],button')) { relevant = true; break; }
          }
          if (relevant) break;
        }
        if (!relevant) return;
        clearTimeout(betaDetectionTimer);
        betaDetectionTimer = setTimeout(run, 120);
        if (Date.now() > observerStopsAt) { betaObserver?.disconnect(); betaObserver = null; }
      });
      betaObserver.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { betaObserver?.disconnect(); betaObserver = null; }, 12500);
    }
  };

  document.addEventListener("click", event => {
    const target = event.target?.closest?.("button,a");
    if (!target) return;
    const text = String(target.textContent || "").trim().toLowerCase();
    const href = String(target.getAttribute?.("href") || "");
    if (text === "switch to story mode" || href.includes("/lorebooks/explore")) {
      clearTimeout(betaDetectionTimer);
      betaDetectionTimer = setTimeout(() => DS.detectSpicyChatBetaCapabilities?.().catch(() => {}), 0);
    }
  }, true);

  window.addEventListener("pageshow", () => DS.startSpicyChatBetaDetection?.(), { once: true });
  setTimeout(() => DS.startSpicyChatBetaDetection?.(), 0);

  DS.SPICYCHAT_BETA_CAPABILITIES_KEY = SPICYCHAT_BETA_CAPABILITIES_KEY;

})();
