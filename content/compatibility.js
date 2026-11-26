if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const PRESENCE_KEY = "dsSaiToolkitPresence";
  const CAP_ATTR = "data-sai-toolkit-capabilities";
  const CAP_EVENT = "sai-toolkit-capabilities-changed";
  // v1 publisher contract: {schemaVersion:1, toolkitVersion:"1.3.2",
  // features:{generationStats:true,timestamps:false,...}}. Missing values
  // remain unknown. Only allowlisted feature booleans/enum states are retained.
  const CAP_NAMES = ["generationStats", "timestamps", "messageIds", "generationProfiles", "hideForYou", "failedMessageRecovery", "sidebarLayout", "customMessageColors", "backgroundImage", "roundedProfileImages", "squareMessageEdges"];
  const aliases = {"generation-metadata":"generationStats", "generation-profiles":"generationProfiles", "home-for-you":"hideForYou", "failed-message-helper":"failedMessageRecovery"};
  let observer = null, detectionTimer = null, detectionDeadlineTimer = null;
  let detectionAttemptFinished = false, presenceSaved = false;
  const featureCache = new Map();
  let lastPresenceCheckAt = 0, cachedPresence = false, lastRaw, parsed = null;
  let refreshTimer = null, lastRoute = "", lastRefreshSignature = "", lastHomeSearch = null, homePageOne = true;

  function capabilityData() {
    const raw = document.documentElement?.getAttribute(CAP_ATTR) || "";
    if (raw === lastRaw) return parsed;
    lastRaw = raw;
    featureCache.clear();
    lastPresenceCheckAt = 0;
    parsed = null;
    if (!raw || raw.length > 8192) return null;
    try {
      const obj = JSON.parse(raw);
      const version = obj.toolkitVersion ?? obj.version;
      const features = obj.features;
      if ((obj.schemaVersion ?? obj.schema) !== 1 || typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[.\-+][a-z0-9.\-]+)?$/i.test(version) || version.length > 48 || !features || typeof features !== "object" || Array.isArray(features)) return null;
      const states = {};
      for (const key of CAP_NAMES) {
        const value = Object.prototype.hasOwnProperty.call(features,key) ? features[key] : undefined;
        states[key] = value === true || value === "enabled" ? "enabled" : value === false || value === "disabled" ? "disabled" : "unknown";
      }
      parsed = { version, states };
    } catch {}
    return parsed;
  }

  function hasSaiToolkitMarker() {
    return !!document.querySelector("#toolkit-modal-root,#sai-toolkit-sidebar-btn,#sai-toolkit-mobile-btn,#sai-toolkit-button-css,[id^='sai-toolkit-'],.generation-stats,#profile-controls,#profile-controls-placeholder,button[aria-label='SAI-Toolkit-button'],.toolkit-button-text");
  }

  function styleActive(id) {
    const node = document.getElementById(id) || document.getElementById(id + "-early");
    return node && !node.disabled && !node.sheet?.disabled && String(node.textContent || "").trim() ? node : null;
  }

  function legacyStatus(name) {
    // Do not read draft modal checkboxes (including the profiles force flag).
    // A closed dialog or absent DOM evidence is unknown, not disabled.
    if (name === "hideForYou" && document.querySelector('[data-hidden-by-script="true"] .relative.group.rounded-xl.bg-gray-3 .bg-purple-9')) return "enabled";
    if (name === "generationProfiles" && document.querySelector("#profile-controls:not([hidden]):not([aria-hidden='true'])")) return "enabled";
    if (name === "failedMessageRecovery") {
      try { if (localStorage.getItem("sai_message_recovery_enabled") === "true") return "enabled"; } catch {}
    }
    if (name === "sidebarLayout" && styleActive("sai-toolkit-sidebar-layout")) return "enabled";
    if (name === "roundedProfileImages" && styleActive("sai-toolkit-rounded-profile-images")) return "enabled";
    if (name === "squareMessageEdges" && styleActive("sai-toolkit-square-message-edges")) return "enabled";
    if (name === "customMessageColors" || name === "backgroundImage") {
      const style = styleActive("sai-toolkit-style-overrides");
      if (style) {
        // Look only for the declaration kind; never return CSS values or image data.
        const text = String(style.textContent || "");
        if (name === "backgroundImage" && /background-image\s*:\s*url\(/i.test(text)) return "enabled";
        if (name === "customMessageColors" && /\.py-md[^{}]*\{[^{}]*background-color\s*:/i.test(text)) return "enabled";
      }
    }
    return "unknown";
  }

  async function rememberPresence() {
    if (presenceSaved || !DS.isExtensionContextValid?.()) return;
    presenceSaved = true;
    await DS.storageSet?.({ [PRESENCE_KEY]: { detected: true, detectedAt: Date.now(), url: location.href } });
  }

  DS.detectSaiToolkit = function({persist = true} = {}) {
    const cap = capabilityData();
    const now = Date.now();
    if (!lastPresenceCheckAt || now - lastPresenceCheckAt >= 300) {
      cachedPresence = !!cap || hasSaiToolkitMarker();
      lastPresenceCheckAt = now;
    }
    DS.state.saiToolkitDetected = cachedPresence;
    window.__DSQ_SAI_TOOLKIT_DETECTED__ = cachedPresence;
    if (cachedPresence && persist) rememberPresence().catch(() => {});
    return cachedPresence;
  };
  DS.getSaiToolkitFeatureStatus = function(feature) {
    const name = aliases[feature] || feature;
    if (!CAP_NAMES.includes(name)) return "unknown";
    const cap = capabilityData();
    if (cap) return cap.states[name];
    const cached = featureCache.get(name);
    if (cached && Date.now() - cached.at < 300) return cached.value;
    const value = DS.detectSaiToolkit({persist:false}) ? legacyStatus(name) : (lastRaw ? "unknown" : "absent");
    featureCache.set(name, {value, at:Date.now()});
    return value;
  };
  DS.shouldDeferToSaiToolkit = function(feature) {
    if (DS.state?.settings?.saiToolkitCompatibility === false) return false;
    const name = aliases[feature] || feature;
    if (name === "hideForYou") {
      // v1.3.2 stops hiding on paginated results and Recommended. A global
      // enabled capability does not grant ownership on those routes.
      if (!DS.isHomePage?.()) return false;
      const search = location.search || "";
      if (lastHomeSearch !== search) {
        lastHomeSearch = search;
        homePageOne = ![...new URLSearchParams(search)].some(([key,value])=>/\[page\]$/i.test(key) && value !== "1");
      }
      if (!homePageOne) return false;
    }
    return DS.getSaiToolkitFeatureStatus(name) === "enabled";
  };
  DS.getSaiToolkitCompatibilitySnapshot = function() {
    const cap = capabilityData();
    const detected = DS.detectSaiToolkit({persist:false});
    const states = Object.fromEntries(CAP_NAMES.map(k=>[k,DS.getSaiToolkitFeatureStatus(k)]));
    const settings = DS.state?.settings || {};
    const chat = !!DS.isSingleChatPage?.();
    const enabled = settings.enabled !== false && settings.saiToolkitCompatibility !== false;
    const active = {
      timestamps: chat && !!(settings.showMessageTimestamps || settings.showGenerationMetadata),
      generationStats: chat && !!(settings.showGenerationModel || settings.showGenerationSettings || settings.showGenerationMetadata),
      generationProfiles: chat && !!settings.enableGenerationProfiles,
      hideForYou: !!settings.hideHomeForYouCards,
      failedMessageRecovery: chat && !!settings.failedMessageHelper,
      customMessageColors: chat && !!(settings.enableChatBubbleCustomization || settings.enableChatBackgrounds),
      backgroundImage: chat && !!settings.enableChatBackgrounds,
      squareMessageEdges: chat && !!settings.enableChatBubbleCustomization
    };
    const deferred = enabled ? Object.keys(active).filter(k=>active[k] && DS.shouldDeferToSaiToolkit(k)) : [];
    const exclusive = chat && settings.enabled !== false ? Object.entries({
      "Elapsed generation time": settings.showGenerationElapsed || settings.showGenerationMetadata,
      "Token estimates":settings.showMessageTokenEstimate,
      "Context warnings":settings.enableContextWindowWarning,
      "Automatic retry":settings.autoRetryFailedMessageSends,
      "Bubble fonts / borders / text styles":settings.enableChatBubbleCustomization,
      "Character pictures":settings.enableCustomCharacterPictures,
      "Persona pictures":settings.enableCustomPersonaPictures
    }).filter(([,v])=>v).map(([k])=>k) : [];
    return {detected, version:cap?.version || null, capabilityInterface:cap ? "v1" : lastRaw ? "invalid-or-unsupported" : "unavailable", states, compatibility:settings.saiToolkitCompatibility !== false, deferred, exclusive, sampledAt:Date.now()};
  };
  function stopSaiToolkitDetection() {
    observer?.disconnect(); observer = null;
    clearTimeout(detectionTimer); clearTimeout(detectionDeadlineTimer);
    detectionTimer = detectionDeadlineTimer = null;
  }
  function refreshCompatibility() {
    featureCache.clear(); lastPresenceCheckAt = 0;
    if (refreshTimer !== null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      const snapshot = DS.getSaiToolkitCompatibilitySnapshot();
      if (snapshot.detected) rememberPresence().catch(()=>{});
      const signature = JSON.stringify([snapshot.detected,snapshot.version,snapshot.states,snapshot.compatibility]);
      if (signature === lastRefreshSignature) return;
      lastRefreshSignature = signature;
      if (!snapshot.compatibility || DS.state?.settings?.enabled === false || DS.isQolPausedForTab?.()) return;
      if (DS.isSingleChatPage?.()) {
        DS.invalidateGenerationMetadataCompatibility?.();
        // CSS-only ownership refresh is independent of the large-chat lane.
        DS.applyChatBubbleCustomization?.();
        DS.scheduleRun?.({priority:"both",dirty:["sai-metadata","sai-profile","interface"],source:"sai-toolkit-capabilities"});
      } else {
        // The filter key includes the ownership state; existing dirty-card
        // reconciliation and route protections still govern the listing pass.
        DS.scheduleRun?.({priority:"critical",source:"sai-toolkit-capabilities"});
      }
    }, 50);
  }
  document.addEventListener(CAP_EVENT, refreshCompatibility);
  // A root-only attribute observer covers a publisher that writes before dispatch.
  // Unlike the startup presence observer, this never watches message subtrees.
  const rootObserver = new MutationObserver(refreshCompatibility);
  if (document.documentElement) rootObserver.observe(document.documentElement,{attributes:true,attributeFilter:[CAP_ATTR]});
  DS.startSaiToolkitDetection = function() {
    const route = location.pathname;
    if (route !== lastRoute) { lastRoute = route; featureCache.clear(); lastPresenceCheckAt = 0; }
    if (DS.detectSaiToolkit({persist:true})) { stopSaiToolkitDetection(); return; }
    if (observer || detectionAttemptFinished || !document.documentElement) return;
    observer = new MutationObserver(() => {
      if (detectionTimer) return;
      detectionTimer = setTimeout(() => {
        detectionTimer = null;
        if (!DS.detectSaiToolkit({persist:true})) return;
        stopSaiToolkitDetection(); refreshCompatibility();
      },180);
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    detectionDeadlineTimer = setTimeout(()=>{detectionAttemptFinished=true;stopSaiToolkitDetection();},8000);
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
