(() => {
  "use strict";

  const root = globalThis;
  if (root.SpicyChatQoLPlatform?.schemaVersion >= 1) return;

  const schemaVersion = 1;
  const syncSchemaVersion = 1;

  const CAPABILITY_LABELS = Object.freeze({
    styling: "styles and visual changes",
    editing: "editing tools",
    currentPageTools: "current-page tools",
    realBrowserTabs: "real browser tabs",
    helperTabs: "second/helper browser tabs",
    bulkOperations: "bulk operations",
    backgroundWorkers: "desktop background/browser automation"
  });

  const PLATFORM_CAPABILITIES = Object.freeze({
    desktop: Object.freeze({
      styling: true,
      editing: true,
      currentPageTools: true,
      realBrowserTabs: true,
      helperTabs: true,
      bulkOperations: true,
      backgroundWorkers: true
    }),
    android: Object.freeze({
      styling: true,
      editing: true,
      currentPageTools: true,
      realBrowserTabs: false,
      helperTabs: false,
      bulkOperations: false,
      backgroundWorkers: false
    })
  });

  const EXPLICIT_SETTING_RULES = Object.freeze({
    // Real desktop-tab management.
    autoAfkEnabled: ["realBrowserTabs", "backgroundWorkers"],
    autoAfkHours: ["realBrowserTabs", "backgroundWorkers"],
    autoAfkChats: ["realBrowserTabs", "backgroundWorkers"],
    autoAfkHome: ["realBrowserTabs", "backgroundWorkers"],
    autoAfkProfiles: ["realBrowserTabs", "backgroundWorkers"],
    autoAfkAction: ["realBrowserTabs", "backgroundWorkers"],
    autoAfkProtectActive: ["realBrowserTabs", "backgroundWorkers"],
    autoAfkResetOnActivate: ["realBrowserTabs", "backgroundWorkers"],
    duplicateTabGuardEnabled: ["realBrowserTabs"],
    duplicateTabChats: ["realBrowserTabs"],
    duplicateTabHome: ["realBrowserTabs"],
    duplicateTabProfiles: ["realBrowserTabs"],
    duplicateTabFocusExisting: ["realBrowserTabs"],
    duplicateTabKeepMode: ["realBrowserTabs"],
    pauseQolInHiddenTabs: ["realBrowserTabs"],
    hideTabNotificationBadge: ["realBrowserTabs"],
    autoReadNotifications: ["realBrowserTabs", "backgroundWorkers"],
    botEditorSaveChatNewTab: ["realBrowserTabs"],
    closeChatTabAfterSavingLater: ["realBrowserTabs"],

    // Features that deliberately open/reuse an inactive helper tab.
    autoFillListings: ["helperTabs"],
    showListingRefillButton: ["helperTabs"],
    autoFillTargetCards: ["helperTabs"],
    autoFillMaxClicks: ["helperTabs"],
    quickPanelShowFillNow: ["helperTabs"],
    showRandomChatButton: ["helperTabs"],
    randomChatUseLastHomeFilters: ["helperTabs"],
    randomChatIncludeOpened: ["helperTabs"],
    randomChatIncludeLater: ["helperTabs"],
    randomChatIncludeFavorites: ["helperTabs"],
    quickDislikeOnBlock: ["helperTabs"],
    quickDislikeIdleEnabled: ["helperTabs"],
    quickDislikeIdleMinutes: ["helperTabs"],
    showQuickDislikeButtons: ["helperTabs"],

    // Desktop background checks/notifications.
    enableCreatorBotNotifications: ["backgroundWorkers"],
    creatorBotCheckMinutes: ["backgroundWorkers"],
    creatorBotBrowserNotifications: ["backgroundWorkers"],

    // "Load all" is intentionally treated as a bulk operation on Android.
    quickPanelShowLoadAll: ["bulkOperations"],
    autoLoadAllOpenedChats: ["bulkOperations"],

    // Despite the historical "Bulk" name these are normal single-editor
    // clipboard helpers, not multi-item jobs. Keep them available on Android.
    lorebookBulkKeywordPaste: [],
    botTagBulkPaste: []
  });

  const EXPLICIT_FEATURE_RULES = Object.freeze({
    "creator-new-bot-watch": { requires: ["backgroundWorkers"], mode: "all" },
    "listing-refill": { requires: ["helperTabs"], mode: "all" },
    "quick-dislike": { requires: ["helperTabs"], mode: "all" },
    "blocked-bulk-dislike": { requires: ["bulkOperations", "helperTabs"], mode: "all" },
    "bulk-card-blocking": { requires: ["bulkOperations"], mode: "all" },
    "random-chat": { requires: ["helperTabs"], mode: "all" },
    "bot-status-center": { requires: ["bulkOperations", "helperTabs"], mode: "partial" },
    "saved-bots-hub": { requires: ["bulkOperations"], mode: "partial" },
    "chat-organizer": { requires: ["bulkOperations"], mode: "partial" },
    "bot-organizer": { requires: ["bulkOperations"], mode: "partial" },
    "favorite-history": { requires: ["bulkOperations"], mode: "partial" },
    "later": { requires: ["bulkOperations"], mode: "partial" }
  });

  const EXPLICIT_ACTION_RULES = Object.freeze({
    scanBotAvailability: ["bulkOperations", "helperTabs"],
    scanUncheckedBotAvailability: ["bulkOperations", "helperTabs"],
    scanStaleBotAvailability: ["bulkOperations", "helperTabs"],
    stopBotAvailabilityScan: ["bulkOperations", "helperTabs"],
    bulkDislikeBlockedBots: ["bulkOperations", "helperTabs"],
    resumeBlockedDislikeRun: ["bulkOperations", "helperTabs"],
    retryFailedBlockedDislikes: ["bulkOperations", "helperTabs"],
    resetAndRedoBlockedDislikes: ["bulkOperations", "helperTabs"],
    bulkLessLikeBlockedBots: ["bulkOperations", "helperTabs"],
    miniPanelPreviewFill: ["helperTabs"],
    miniPanelPreviewLoad: ["bulkOperations"],
    creatorBotRequestNotifications: ["backgroundWorkers"],
    creatorBotCheckNow: ["backgroundWorkers"],
    creatorBotDiscordWebhookEnabled: ["backgroundWorkers"],
    creatorBotDiscordWebhookUrl: ["backgroundWorkers"],
    creatorBotWebhookTest: ["backgroundWorkers"]
  });

  function normalizeRequirements(value) {
    return [...new Set((Array.isArray(value) ? value : []).map(item => String(item || "").trim()).filter(Boolean))];
  }

  function detectEnvironment() {
    const ua = String(root.navigator?.userAgent || "");
    const explicitAndroid = !!(
      root.__spicyChatQolAndroidWebView ||
      root.__spicyChatQolAndroidApp ||
      root.AndroidBridge ||
      root.SpicyChatQoLAndroidBridge
    );
    const android = explicitAndroid || /Android/i.test(ua);
    const webview = android && (
      explicitAndroid ||
      /;\s*wv\)/i.test(ua) ||
      /Version\/4\.0.*Chrome\/\d+.*Mobile Safari/i.test(ua)
    );
    const platform = android ? "android" : "desktop";
    const capabilities = PLATFORM_CAPABILITIES[platform];
    return {
      schemaVersion,
      platform,
      android,
      webview,
      desktop: !android,
      capabilities: { ...capabilities },
      label: android ? (webview ? "Android app / WebView" : "Android browser") : "Desktop browser"
    };
  }

  function ruleForSetting(name) {
    const id = String(name || "").trim();
    if (!id) return { requires: [], source: "default" };
    if (Object.prototype.hasOwnProperty.call(EXPLICIT_SETTING_RULES, id)) {
      return { requires: normalizeRequirements(EXPLICIT_SETTING_RULES[id]), source: "explicit" };
    }
    if (/bulk/i.test(id)) return { requires: ["bulkOperations"], source: "bulk-name" };
    if (/^tabCleanup/i.test(id)) return { requires: ["realBrowserTabs"], source: "tab-cleanup" };
    return { requires: [], source: "default" };
  }

  function ruleForAction(elementOrId) {
    const element = elementOrId && typeof elementOrId === "object" ? elementOrId : null;
    const id = String(element ? (element.id || "") : (elementOrId || "")).trim();
    if (id && Object.prototype.hasOwnProperty.call(EXPLICIT_ACTION_RULES, id)) {
      return { requires: normalizeRequirements(EXPLICIT_ACTION_RULES[id]), source: "explicit" };
    }
    if (id && /bulk/i.test(id)) return { requires: ["bulkOperations"], source: "bulk-id" };
    if (id && /^tabCleanup/i.test(id)) return { requires: ["realBrowserTabs"], source: "tab-cleanup" };

    const text = String(element?.textContent || element?.getAttribute?.("aria-label") || element?.getAttribute?.("title") || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!text) return { requires: [], source: "default" };

    // Only text-guard controls that are clearly QoL-owned. This avoids touching
    // native SpicyChat controls that happen to use similar wording.
    const qolOwnedAncestor = element?.closest?.("#ds-qol-panel, [id^='ds-'], [class*='ds-']") || null;
    const qolOwned = !!(
      id.startsWith("ds-") ||
      qolOwnedAncestor ||
      [...(element?.classList || [])].some(token => String(token).startsWith("ds-"))
    );
    if (!qolOwned) return { requires: [], source: "default" };

    let ancestor = element;
    for (let depth = 0; ancestor && depth < 7; depth += 1, ancestor = ancestor.parentElement) {
      const signature = `${ancestor.id || ""} ${ancestor.className || ""}`;
      if (/bulk/i.test(signature) && (ancestor === qolOwnedAncestor || ancestor.closest?.("[id^='ds-'], [class*='ds-']"))) {
        return { requires: ["bulkOperations"], source: "qol-bulk-container" };
      }
    }

    if (/\b(select chats|select bots|bulk action|load all|stop recommending remaining|dislike remaining)\b/.test(text)) {
      return { requires: ["bulkOperations"], source: "qol-action-text" };
    }
    if (/\b(fill now|random chat)\b/.test(text)) {
      return { requires: ["helperTabs"], source: "qol-action-text" };
    }
    return { requires: [], source: "default" };
  }

  function missingCapabilities(requirements, environment = detectEnvironment()) {
    const caps = environment?.capabilities || PLATFORM_CAPABILITIES[environment?.platform] || PLATFORM_CAPABILITIES.desktop;
    return normalizeRequirements(requirements).filter(name => caps[name] !== true);
  }

  function reasonForMissing(missing) {
    const set = new Set(missing || []);
    if (set.has("helperTabs")) return "Needs a second/helper browser tab, which the Android app does not provide.";
    if (set.has("bulkOperations")) return "Bulk operations are desktop-only in QoL for now.";
    if (set.has("realBrowserTabs")) return "Manages real browser tabs and is unavailable in the Android app.";
    if (set.has("backgroundWorkers")) return "Relies on desktop background/browser automation and is unavailable in the Android app.";
    return "Not supported on this device.";
  }

  function compatibilityFromRule(rule, environment = detectEnvironment()) {
    const requires = normalizeRequirements(rule?.requires);
    const missing = missingCapabilities(requires, environment);
    return {
      supported: missing.length === 0,
      requires,
      missing,
      reason: missing.length ? reasonForMissing(missing) : "",
      platform: environment.platform,
      environment
    };
  }

  function settingCompatibility(name, environment = detectEnvironment()) {
    return {
      setting: String(name || ""),
      ...compatibilityFromRule(ruleForSetting(name), environment)
    };
  }

  function actionCompatibility(elementOrId, environment = detectEnvironment()) {
    return {
      action: typeof elementOrId === "string" ? elementOrId : String(elementOrId?.id || ""),
      ...compatibilityFromRule(ruleForAction(elementOrId), environment)
    };
  }

  function featureCompatibility(entry, environment = detectEnvironment()) {
    const env = environment || detectEnvironment();
    const id = String(entry?.id || "");
    const explicit = EXPLICIT_FEATURE_RULES[id] || null;
    const settings = Array.isArray(entry?.settings)
      ? entry.settings.map(String)
      : (entry?.setting ? [String(entry.setting)] : []);

    let requires = explicit ? normalizeRequirements(explicit.requires) : [];
    let mode = explicit?.mode || "all";

    if (!explicit && /desktop browser/i.test(String(entry?.platform || ""))) {
      requires = ["helperTabs"];
    }
    if (!explicit && /bulk/i.test(`${id} ${entry?.name || ""}`)) {
      requires = ["bulkOperations"];
    }

    const settingStates = settings.map(name => settingCompatibility(name, env));
    if (!requires.length && settingStates.length) {
      const unsupported = settingStates.filter(item => !item.supported);
      if (unsupported.length === settingStates.length) {
        requires = [...new Set(unsupported.flatMap(item => item.requires))];
      } else if (unsupported.length) {
        requires = [...new Set(unsupported.flatMap(item => item.requires))];
        mode = "partial";
      }
    }

    const base = compatibilityFromRule({ requires }, env);
    const androidSupport = compatibilityFromRule({ requires }, { ...env, platform: "android", android: true, desktop: false, capabilities: PLATFORM_CAPABILITIES.android });
    const desktopSupport = compatibilityFromRule({ requires }, { ...env, platform: "desktop", android: false, desktop: true, capabilities: PLATFORM_CAPABILITIES.desktop });
    const partialOnAndroid = mode === "partial" && !androidSupport.supported && desktopSupport.supported;
    const partial = partialOnAndroid && env.platform === "android";

    let kind = "all";
    let label = "Desktop + Android";
    if (!androidSupport.supported && desktopSupport.supported) {
      kind = partialOnAndroid ? "partial-android" : "desktop-only";
      label = partialOnAndroid ? "Partial on Android" : "Desktop only";
    } else if (androidSupport.supported && !desktopSupport.supported) {
      kind = "android-only";
      label = "Android only";
    }

    return {
      ...base,
      supported: partial ? true : base.supported,
      fullySupported: base.supported,
      partial,
      partialOnAndroid,
      kind,
      label,
      androidSupported: androidSupport.supported || partialOnAndroid,
      desktopSupported: desktopSupport.supported,
      reason: partial ? `${base.reason} The rest of this feature still works here.` : base.reason
    };
  }

  function fallbackForUnsupported(name, defaults, desiredValue) {
    // Unsupported boolean capabilities must be OFF at runtime even when an old
    // child setting historically defaulted to true (for example Lorebook bulk
    // menu items). The desired/account value is still kept untouched.
    if (typeof desiredValue === "boolean") return false;
    if (defaults && Object.prototype.hasOwnProperty.call(defaults, name)) return defaults[name];
    return false;
  }

  function applyEffectiveSettings(desiredSettings, defaults = {}, environment = detectEnvironment()) {
    const desired = desiredSettings && typeof desiredSettings === "object" ? desiredSettings : {};
    const effective = { ...desired };
    const dormant = {};
    for (const [name, desiredValue] of Object.entries(desired)) {
      const compatibility = settingCompatibility(name, environment);
      if (compatibility.supported) continue;
      const fallback = fallbackForUnsupported(name, defaults, desiredValue);
      effective[name] = fallback;
      if (!Object.is(desiredValue, fallback)) {
        dormant[name] = {
          desiredValue,
          effectiveValue: fallback,
          requires: compatibility.requires,
          reason: compatibility.reason
        };
      }
    }
    return { settings: effective, dormant, environment };
  }

  function syncableSettingsDocument(settings, extra = {}) {
    const desired = settings && typeof settings === "object" ? settings : {};
    return {
      schemaVersion: syncSchemaVersion,
      compatibilitySchemaVersion: schemaVersion,
      revision: Number(extra.revision || 0),
      updatedAt: String(extra.updatedAt || new Date().toISOString()),
      settings: { ...desired }
    };
  }

  function backupMetadata(environment = detectEnvironment()) {
    return {
      compatibilitySchemaVersion: schemaVersion,
      exportedFromPlatform: environment.platform,
      exportedFromEnvironment: environment.label
    };
  }

  const api = {
    schemaVersion,
    syncSchemaVersion,
    capabilityLabels: CAPABILITY_LABELS,
    platformCapabilities: PLATFORM_CAPABILITIES,
    detectEnvironment,
    ruleForSetting,
    ruleForAction,
    settingCompatibility,
    actionCompatibility,
    featureCompatibility,
    applyEffectiveSettings,
    syncableSettingsDocument,
    backupMetadata,
    supports(capability, environment = detectEnvironment()) {
      return environment?.capabilities?.[String(capability || "")] === true;
    }
  };

  root.SpicyChatQoLPlatform = Object.freeze(api);

  // Android/WebView can still receive synced desktop preferences. Guard the
  // small number of QoL actions that have no individual setting (for example
  // Select chats / Load all) so a preserved desktop preference cannot start a
  // bulk/helper-tab workflow on mobile. Capture phase runs before feature
  // handlers and does no background polling or DOM observation.
  const initialEnvironment = detectEnvironment();
  try {
    root.document?.documentElement?.setAttribute?.("data-ds-platform", initialEnvironment.platform);
  } catch {}
  if (initialEnvironment.android && root.document?.addEventListener) {
    root.document.addEventListener("click", event => {
      const target = event.target instanceof Element
        ? event.target.closest("button, a, [role='button'], input[type='button'], input[type='submit']")
        : null;
      if (!target) return;
      const compatibility = actionCompatibility(target, initialEnvironment);
      if (compatibility.supported) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      target.setAttribute?.("title", compatibility.reason);
      try { root.DragonScriptQoL?.setQuickStatus?.(`Desktop only: ${compatibility.reason}`); } catch {}
    }, true);
  }
})();
