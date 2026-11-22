if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const PRESENCE_KEY = "dsSaiToolkitPresence";
  const DEFERRED_FEATURES = new Set([
    "generation-profiles",
    "generation-metadata",
    "home-for-you",
    "failed-message-helper"
  ]);

  let observer = null;
  let detectionTimer = null;
  let detectionDeadlineTimer = null;
  let detectionAttemptFinished = false;
  let presenceSaved = false;
  const featureCache = new Map();
  let lastPresenceCheckAt = 0;
  let cachedPresence = false;

  function hasSaiToolkitMarker() {
    // Current v1.3.1 markers; do not use retired WYSIWYG/classic-style UI.
    return !!document.querySelector([
      "#toolkit-modal-root",
      "#sai-toolkit-sidebar-btn",
      "#sai-toolkit-mobile-btn",
      "#sai-toolkit-button-css",
      "[id^='sai-toolkit-']",
      ".generation-stats[data-version-id]",
      ".generation-stats",
      "#profile-controls",
      "#profile-controls-placeholder",
      "button[aria-label='SAI-Toolkit-button']",
      ".toolkit-button-text"
    ].join(", "));
  }

  function toolkitFeatureCheckbox(feature) {
    // Toolkit v1.3.1's settings dialog uses an open shadow root. It can be
    // absent on normal pages: that means unknown, NOT disabled. Never read the
    // other extension's private storage or modify its settings.
    const shadow = document.getElementById("toolkit-modal-root")?.shadowRoot;
    const selectors = {
      "generation-metadata": ["#showstats-checkbox", "#showtimestamp-checkbox", "#show-message-ids-checkbox"],
      "home-for-you": ["#hideforyou-checkbox"],
      "generation-profiles": ["#generation-profiles-checkbox"],
      "failed-message-helper": ["#message-recovery-checkbox"]
    };
    const controls = (selectors[feature] || []).map(sel => shadow?.querySelector(sel)).filter(Boolean);
    if (!controls.length) return "unknown";
    return controls.some(input => input.checked) ? "enabled" : "disabled";
  }

  async function rememberPresence() {
    if (presenceSaved || !DS.isExtensionContextValid?.()) return;
    presenceSaved = true;
    await DS.storageSet?.({ [PRESENCE_KEY]: {
      detected: true, detectedAt: Date.now(), url: location.href
    } });
  }

  DS.detectSaiToolkit = function detectSaiToolkit({ persist = true } = {}) {
    const now = Date.now();
    if (!lastPresenceCheckAt || now - lastPresenceCheckAt >= 300) {
      cachedPresence = hasSaiToolkitMarker();
      lastPresenceCheckAt = now;
    }
    const detected = cachedPresence;
    DS.state.saiToolkitDetected = detected;
    window.__DSQ_SAI_TOOLKIT_DETECTED__ = detected;
    // Metadata network capture is independent of Toolkit's *visual* ownership.
    // The document-start loader owns the bridge's enabled state; do not turn
    // it off when a Toolkit DOM marker arrives after page initialization.
    if (detected && persist) rememberPresence().catch(() => {});
    return detected;
  };

  DS.getSaiToolkitFeatureStatus = function getSaiToolkitFeatureStatus(feature) {
    const name = String(feature || "");
    if (!DEFERRED_FEATURES.has(name)) return "unknown";
    const cached = featureCache.get(name);
    if (cached && Date.now() - cached.at < 300) return cached.value;
    if (DS.detectSaiToolkit?.({ persist: false }) !== true) {
      featureCache.set(name, { value: "absent", at: Date.now() });
      return "absent";
    }
    let value = "unknown";

    // The page-context recovery hook in Toolkit v1.3.1 publishes a reliable
    // enabled flag here, and removes it on disable. A visible settings toggle
    // is useful when first opening the dialog but is never required.
    const visibleControl = toolkitFeatureCheckbox(name);
    if (name === "failed-message-helper") {
      // Toolkit v1.3.1 removes this key when disabled; absence before the
      // interceptor initializes must therefore remain unknown, not guessed.
      if (visibleControl !== "unknown") value = visibleControl;
      else {
        try {
          if (localStorage.getItem("sai_message_recovery_enabled") === "true") value = "enabled";
        } catch {}
      }
    } else if (visibleControl !== "unknown") {
      value = visibleControl;
    } else if (name === "generation-metadata" && document.querySelector(".generation-stats")) {
      value = "enabled";
    } else if (name === "generation-profiles" && document.querySelector("#profile-controls:not([hidden])")) {
      value = "enabled";
    }
    featureCache.set(name, { value, at: Date.now() });
    return value;
  };

  DS.shouldDeferToSaiToolkit = function shouldDeferToSaiToolkit(feature) {
    if (DS.state?.settings?.saiToolkitCompatibility === false) return false;
    return DS.getSaiToolkitFeatureStatus?.(feature) === "enabled";
  };

  function stopSaiToolkitDetection() {
    observer?.disconnect();
    observer = null;
    clearTimeout(detectionTimer);
    clearTimeout(detectionDeadlineTimer);
    detectionTimer = null;
    detectionDeadlineTimer = null;
  }

  DS.startSaiToolkitDetection = function startSaiToolkitDetection() {
    if (DS.detectSaiToolkit?.({ persist: true })) {
      stopSaiToolkitDetection();
      return;
    }
    if (observer || detectionAttemptFinished || !document.documentElement) return;

    // Toolkit may insert its controls after QoL loads. Listen only briefly:
    // never leave a whole-page observer active when Toolkit isn't installed.
    observer = new MutationObserver(() => {
      if (detectionTimer) return;
      detectionTimer = setTimeout(() => {
        detectionTimer = null;
        if (!DS.detectSaiToolkit?.({ persist: true })) return;
        stopSaiToolkitDetection();
        DS.scheduleRun?.({ priority: "critical", source: "sai-toolkit-detected" });
        DS.scheduleRun?.({ priority: "slow", source: "sai-toolkit-detected" });
      }, 180);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    detectionDeadlineTimer = setTimeout(() => {
      detectionAttemptFinished = true;
      stopSaiToolkitDetection();
    }, 8000);
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
    const rulebookLink = document.querySelector([
      'a[href="/rulebooks/explore"]',
      'a[href^="/rulebooks/explore?"]',
      'a[href="/rulebooks/editor"]',
      'a[href^="/rulebooks/editor?"]',
      'a[href="/my-creations/rulebooks"]',
      'a[href^="/my-creations/rulebooks?"]',
      'a[href^="/rulebook/"]',
      '[data-testid^="Rulebook"]',
      'a[href^="/rulebooks/"]',
      '[data-testid="chat-attach-rulebook-menu-item"]',
      '[data-testid="ConversationRulebookPicker"]'
    ].join(", "));

    let publicLorebooks = "unknown";
    let storyMode = "unknown";
    let rulebooks = "unknown";
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

    if (
      rulebookLink ||
      path === "/rulebooks" ||
      path.startsWith("/rulebooks/") ||
      path === "/rulebook" ||
      path.startsWith("/rulebook/") ||
      path === "/my-creations/rulebooks" ||
      path.startsWith("/my-creations/rulebooks/")
    ) {
      rulebooks = "available";
      evidence.push("rulebooks-ui");
    }

    return { publicLorebooks, storyMode, rulebooks, evidence, path };
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
      storyMode: mergeCapability(previousCaps.storyMode, observed.storyMode),
      rulebooks: mergeCapability(previousCaps.rulebooks, observed.rulebooks)
    };
    const detected = Object.values(capabilities).includes("available");
    const evidence = [...new Set([...(Array.isArray(previous.evidence) ? previous.evidence : []), ...(observed.evidence || [])])].slice(-12);
    const now = Date.now();
    const changed =
      previous.detected !== detected ||
      previousCaps.publicLorebooks !== capabilities.publicLorebooks ||
      previousCaps.storyMode !== capabilities.storyMode ||
      previousCaps.rulebooks !== capabilities.rulebooks ||
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
    document.documentElement.dataset.dsSpicychatRulebooks = capabilities.rulebooks;

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
            const selector = 'a[href*="/lorebooks/explore"],a[href*="/rulebooks/"],a[href*="/rulebook/"],a[href*="/my-creations/rulebooks"],[data-testid^="Rulebook"],[data-testid="chat-attach-rulebook-menu-item"],[data-testid="ConversationRulebookPicker"]';
            if (node.matches?.(selector) || node.querySelector?.(selector)) { relevant = true; break; }
            // Avoid rechecking beta capabilities whenever React adds unrelated
            // buttons to chat, Rulebook editors, or the meter playtest.
            const buttons = node.matches?.('button') ? [node] : (node.querySelectorAll?.('button') || []);
            for (const button of buttons) {
              const label = String(button.textContent || '').trim().toLowerCase();
              if (label === 'switch to story mode' || label === 'public' ||
                  button.querySelector?.('[data-translate-key="lorebook:form.field.visibility.public"]')) {
                relevant = true;
                break;
              }
            }
            if (relevant) break;
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
    if (
      text === "switch to story mode" ||
      href.includes("/lorebooks/explore") ||
      href.includes("/rulebooks/") ||
      href.includes("/rulebook/") ||
      href.includes("/my-creations/rulebooks")
    ) {
      clearTimeout(betaDetectionTimer);
      betaDetectionTimer = setTimeout(() => DS.detectSpicyChatBetaCapabilities?.().catch(() => {}), 0);
    }
  }, true);

  window.addEventListener("pageshow", () => DS.startSpicyChatBetaDetection?.(), { once: true });
  setTimeout(() => DS.startSpicyChatBetaDetection?.(), 0);

  DS.SPICYCHAT_BETA_CAPABILITIES_KEY = SPICYCHAT_BETA_CAPABILITIES_KEY;

})();

}
