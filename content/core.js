// Keep a paused tab free of extension DOM work and runtime initialization.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL = window.DragonScriptQoL || {};

  // Per-tab runtime gate: only affects QoL's ISOLATED content-script world.
  // Native SpicyChat uses a separate JS world and keeps its own timers/observers.
  // Pausing leaves already-added HTML/CSS untouched; resume uses a page reload.
  const QOL_TAB_PAUSE_KEY = "ds-qol-tab-paused-v1";
  DS.isQolWorkerTab = function () {
    try {
      if (/dsQol(?:BotStatusWorker|RecommendationWorker|LorebookBackupWorker|ListingRefillWorker|QuickDislikeWorker|QuickLessLikeWorker)=1/i.test(location.search)) return true;
      return /^(?:bot-status|lorebook-backup|recommendation|listing-refill|quick-dislike|less-like)$/.test(String(sessionStorage.getItem("dsQolBackgroundWorkerKind") || ""));
    } catch { return false; }
  };
  const nativeQolTimers = {
    timeout: window.setTimeout.bind(window),
    interval: window.setInterval.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    clearInterval: window.clearInterval.bind(window),
    raf: window.requestAnimationFrame?.bind(window),
    cancelRaf: window.cancelAnimationFrame?.bind(window),
    idle: window.requestIdleCallback?.bind(window),
    cancelIdle: window.cancelIdleCallback?.bind(window)
  };
  const qolTimeouts = new Set();
  const qolIntervals = new Set();
  const qolFrames = new Set();
  const qolIdleCalls = new Set();
  const qolObservers = new Set();
  const qolDocumentListeners = [];
  let qolRuntimeSuspended = false;
  const tabPausedForRuntime = () => qolRuntimeSuspended || (!DS.isQolWorkerTab() && (() => {
    try { return sessionStorage.getItem(QOL_TAB_PAUSE_KEY) === "1"; }
    catch { return false; }
  })());
  // Preserve native functions for the state-control message listener's reload.
  DS.reloadAfterTabResume = () => nativeQolTimers.timeout(() => { try { location.reload(); } catch {} }, 100);
  if (!DS.isQolWorkerTab()) {
    // Track document/window event handlers, too. These otherwise keep reacting
    // to native scroll, keyboard and visibility events after a live tab pause.
    for (const target of [window, document]) {
      const nativeAdd = target.addEventListener.bind(target);
      const nativeRemove = target.removeEventListener.bind(target);
      target.addEventListener = function (type, callback, options) {
        if (tabPausedForRuntime()) return;
        const result = nativeAdd(type, callback, options);
        qolDocumentListeners.push({ nativeRemove, type, callback, options });
        return result;
      };
    }
    window.setTimeout = function (callback, delay, ...args) {
      if (tabPausedForRuntime()) return 0;
      if (typeof callback !== "function") return nativeQolTimers.timeout(callback, delay, ...args);
      let id = 0;
      id = nativeQolTimers.timeout((...params) => {
        qolTimeouts.delete(id);
        if (!tabPausedForRuntime()) callback(...params);
      }, delay, ...args);
      qolTimeouts.add(id);
      return id;
    };
    window.setInterval = function (callback, delay, ...args) {
      if (tabPausedForRuntime()) return 0;
      const id = nativeQolTimers.interval((...params) => {
        if (!tabPausedForRuntime()) {
          if (typeof callback === "function") callback(...params);
        }
      }, delay, ...args);
      qolIntervals.add(id);
      return id;
    };
    window.clearTimeout = function (id) { qolTimeouts.delete(id); return nativeQolTimers.clearTimeout(id); };
    window.clearInterval = function (id) { qolIntervals.delete(id); return nativeQolTimers.clearInterval(id); };
    if (nativeQolTimers.raf) {
      window.requestAnimationFrame = function (callback) {
        if (tabPausedForRuntime()) return 0;
        let id = 0;
        id = nativeQolTimers.raf(time => {
          qolFrames.delete(id);
          if (!tabPausedForRuntime()) callback(time);
        });
        qolFrames.add(id);
        return id;
      };
      window.cancelAnimationFrame = function (id) { qolFrames.delete(id); return nativeQolTimers.cancelRaf(id); };
    }
    if (nativeQolTimers.idle) {
      window.requestIdleCallback = function (callback, options) {
        if (tabPausedForRuntime()) return 0;
        let id = 0;
        id = nativeQolTimers.idle(deadline => {
          qolIdleCalls.delete(id);
          if (!tabPausedForRuntime()) callback(deadline);
        }, options);
        qolIdleCalls.add(id);
        return id;
      };
      window.cancelIdleCallback = function (id) { qolIdleCalls.delete(id); return nativeQolTimers.cancelIdle(id); };
    }
    if (typeof window.MutationObserver === "function") {
      const NativeObserver = window.MutationObserver;
      window.MutationObserver = class QoLTrackedMutationObserver extends NativeObserver {
        constructor(callback) {
          super((mutations, observer) => { if (!tabPausedForRuntime()) callback(mutations, observer); });
        }
        observe(...args) {
          if (tabPausedForRuntime()) return;
          const result = super.observe(...args);
          qolObservers.add(this);
          return result;
        }
        disconnect() { qolObservers.delete(this); return super.disconnect(); }
      };
    }
    if (typeof window.PerformanceObserver === "function") {
      const NativeObserver = window.PerformanceObserver;
      window.PerformanceObserver = class QoLTrackedPerformanceObserver extends NativeObserver {
        constructor(callback) {
          super((entries, observer) => { if (!tabPausedForRuntime()) callback(entries, observer); });
        }
        observe(...args) {
          if (tabPausedForRuntime()) return;
          const result = super.observe(...args);
          qolObservers.add(this);
          return result;
        }
        disconnect() { qolObservers.delete(this); return super.disconnect(); }
      };
    }
  }
  DS.pauseQolTabRuntime = function () {
    if (DS.isQolWorkerTab()) return;
    qolRuntimeSuspended = true;
    for (const id of qolTimeouts) nativeQolTimers.clearTimeout(id);
    for (const id of qolIntervals) nativeQolTimers.clearInterval(id);
    for (const id of qolFrames) nativeQolTimers.cancelRaf?.(id);
    for (const id of qolIdleCalls) nativeQolTimers.cancelIdle?.(id);
    for (const observer of qolObservers) { try { observer.disconnect(); } catch {} }
    for (const { nativeRemove, type, callback, options } of qolDocumentListeners) {
      try { nativeRemove(type, callback, options); } catch {}
    }
    qolTimeouts.clear(); qolIntervals.clear(); qolFrames.clear(); qolIdleCalls.clear(); qolObservers.clear();
    qolDocumentListeners.length = 0;
    try { window.DSCardTokenBridgeLoader?.disable?.(); } catch {}
    try { window.dispatchEvent(new CustomEvent("ds-qol-card-token-bridge-control-v1", { detail: { enabled: false } })); } catch {}
  };


  DS.EXT_NAME = "SpicyChat QoL";
  DS.OPENED_KEY = "openedChats";
  DS.OPENED_META_KEY = "openedChatMeta";
  DS.OOC_TEMPLATES_KEY = "oocTemplates";
  DS.BLOCKED_BOTS_KEY = "blockedBots";
  DS.NOT_INTERESTED_KEY = "notInterestedBots";
  DS.PERSONAS_KEY = "personas";
  DS.PERSONA_ORG_KEY = "personaOrganization";
  DS.LEGACY_PERSONAS_KEY = "savedPersonas";
  DS.FAVORITE_CREATORS_KEY = "favoriteCreators";
  DS.FOLLOWED_CREATORS_KEY = "followedCreators";
  DS.FAVORITE_BOTS_KEY = "favoriteBots";
  DS.LATER_BOTS_KEY = "laterBots";
  DS.BOT_ORGANIZER_KEY = "botOrganization";
  DS.CHAT_ORGANIZER_KEY = "chatOrganization";
  DS.CHARACTER_QOL_PROFILES_KEY = "characterQolProfiles";
  DS.SAVED_TEXT_SNIPPETS_KEY = "savedTextSnippets";
  DS.CONTEXT_KEEPER_DATA_KEY = "contextKeeperData";
  DS.BOT_ARCHIVE_KEY = "botArchive";
  DS.BOT_AVAILABILITY_KEY = "botAvailability";
  DS.LOREBOOK_STATUS_KEY = "lorebookStatus";
  DS.LOREBOOK_BACKUPS_KEY = "lorebookBackups";
  DS.LOCAL_CHANGE_HISTORY_KEY = "localActionHistory";
  DS.CHAT_BOOKMARKS_KEY = "chatBookmarks";
  DS.RECENTLY_SEEN_BOTS_KEY = "recentlySeenBots";
  DS.PENDING_OPTIONS_NAV_KEY = "pendingOptionsNavigation";
  DS.GRANULAR_SETTING_PREFIX = "dsSettingV1:";
  DS.GRANULAR_SETTINGS_INDEX_KEY = "dsSettingsIndexV1";
  DS.GRANULAR_SETTINGS_MIGRATION_KEY = "dsGranularSettingsV1";
  DS.GRANULAR_SETTINGS_REVISION_KEY = "dsSettingsRevisionV1";

  const RUNTIME_LOG_SESSION_KEY = "ds-qol-runtime-log-v1";
  const RUNTIME_LOG_LIMIT = 160;
  const LARGE_STORAGE_KEYS = new Set([DS.BOT_ARCHIVE_KEY, DS.BOT_AVAILABILITY_KEY]);

  function safeRuntimeLogValue(value, max = 280) {
    if (value == null) return "";
    if (value instanceof Error) return String(value.name || "Error") + (value.message ? `: ${value.message}` : "");
    if (typeof value === "string") return value.slice(0, max);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      const shallow = {};
      for (const [key, item] of Object.entries(value).slice(0, 12)) {
        if (/text|message|content|prompt|memory|persona|note/i.test(key)) continue;
        shallow[key] = typeof item === "object" ? "[object]" : String(item).slice(0, 80);
      }
      return JSON.stringify(shallow).slice(0, max);
    } catch {
      return String(value).slice(0, max);
    }
  }

  function readRuntimeLog() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(RUNTIME_LOG_SESSION_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.slice(-RUNTIME_LOG_LIMIT) : [];
    } catch {
      return [];
    }
  }

  const initialRuntimeLog = readRuntimeLog();
  DS.runtimeLog = function runtimeLog(level = "info", area = "core", message = "", detail = "") {
    const entry = {
      at: Date.now(),
      level: String(level || "info").slice(0, 16),
      area: String(area || "core").slice(0, 80),
      message: safeRuntimeLogValue(message, 320),
      detail: safeRuntimeLogValue(detail, 320)
    };
    const log = DS.state.runtimeLog || (DS.state.runtimeLog = []);
    log.push(entry);
    if (log.length > RUNTIME_LOG_LIMIT) log.splice(0, log.length - RUNTIME_LOG_LIMIT);
    try { sessionStorage.setItem(RUNTIME_LOG_SESSION_KEY, JSON.stringify(log)); } catch {}
    return entry;
  };
  DS.getRuntimeLog = function getRuntimeLog(limit = 60) {
    const count = Math.max(1, Math.min(RUNTIME_LOG_LIMIT, Number(limit) || 60));
    return [...(DS.state.runtimeLog || [])].slice(-count);
  };
  DS.clearRuntimeLog = function clearRuntimeLog() {
    DS.state.runtimeLog = [];
    try { sessionStorage.removeItem(RUNTIME_LOG_SESSION_KEY); } catch {}
  };
  function sanitizeParsedMarkup(root) {
    root.querySelectorAll?.("script, iframe, object, embed, link[rel='import']").forEach(node => node.remove());
    root.querySelectorAll?.("*").forEach(node => {
      for (const attr of [...(node.attributes || [])]) {
        const name = String(attr.name || "").toLowerCase();
        const value = String(attr.value || "").trim();
        if (name.startsWith("on") || name === "srcdoc") node.removeAttribute(attr.name);
        if ((name === "href" || name === "src" || name === "xlink:href") && /^javascript:/i.test(value)) node.removeAttribute(attr.name);
      }
    });
    return root;
  }

  function parseSanitizedHtml(markup) {
    const doc = new DOMParser().parseFromString(String(markup || ""), "text/html");
    sanitizeParsedMarkup(doc.body);
    return doc;
  }

  DS.parseSafeMarkupFirstElement = function parseSafeMarkupFirstElement(markup) {
    const doc = parseSanitizedHtml(markup);
    const first = doc.body.firstElementChild;
    return first ? document.importNode(first, true) : null;
  };

  DS.setSafeMarkup = function setSafeMarkup(host, markup) {
    if (!host) return null;
    const doc = parseSanitizedHtml(markup);
    const fragment = document.createDocumentFragment();
    for (const child of [...doc.body.childNodes]) fragment.appendChild(document.importNode(child, true));
    host.replaceChildren(fragment);
    return host;
  };

  DS.setSafeSvgMarkup = function setSafeSvgMarkup(host, markup) {
    if (!host) return null;
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${String(markup || "")}</svg>`, "image/svg+xml");
    const svgRoot = doc.documentElement;
    sanitizeParsedMarkup(svgRoot);
    const fragment = document.createDocumentFragment();
    for (const child of [...svgRoot.childNodes]) fragment.appendChild(document.importNode(child, true));
    host.replaceChildren(fragment);
    return host;
  };

  // Settings defaults are provided by core-settings-defaults.js.

  const TAB_QOL_PAUSED_KEY = QOL_TAB_PAUSE_KEY;

  function readTabQolPaused() {
    try { return !DS.isQolWorkerTab?.() && sessionStorage.getItem(TAB_QOL_PAUSED_KEY) === "1"; }
    catch { return false; }
  }

  DS.isQolPausedForTab = function isQolPausedForTab() {
    return readTabQolPaused();
  };

  DS.getQolTabState = function getQolTabState() {
    const globalEnabled = DS.state?.globalEnabledSetting !== false;
    const paused = globalEnabled && readTabQolPaused();
    return {
      globalEnabled,
      paused,
      enabled: globalEnabled && !paused
    };
  };

  DS.applyQolTabEnabledOverride = function applyQolTabEnabledOverride(settings) {
    const target = settings && typeof settings === "object" ? settings : {};
    const globalEnabled = target.enabled !== false;
    DS.state.globalEnabledSetting = globalEnabled;
    DS.state.tabQolPaused = globalEnabled && readTabQolPaused();
    target.enabled = globalEnabled && !DS.state.tabQolPaused;
    return target;
  };

  DS.setQolEnabledForTab = function setQolEnabledForTab(enabled) {
    try {
      if (enabled) sessionStorage.removeItem(TAB_QOL_PAUSED_KEY);
      else sessionStorage.setItem(TAB_QOL_PAUSED_KEY, "1");
    } catch {}

    const globalEnabled = DS.state?.globalEnabledSetting !== false;
    DS.state.tabQolPaused = globalEnabled && !enabled;
    if (DS.state?.settings) DS.state.settings.enabled = globalEnabled && !!enabled;
    DS.state.disabledCleanupDone = false;
    DS.runtimeLog?.("info", "tab-control", enabled ? "QoL enabled for this tab" : "QoL paused for this tab");
    if (!enabled) DS.pauseQolTabRuntime?.();
    // A suspended runtime is not restarted in-place. A fresh load is required
    // to reinstall its detached observers and registered timeouts safely.
    else DS.reloadAfterTabResume?.();
    return DS.getQolTabState?.() || { globalEnabled, paused: !enabled, enabled: globalEnabled && !!enabled };
  };

  DS.state = {
    globalEnabledSetting: true,
    tabQolPaused: false,
    settings: { ...DS.DEFAULT_SETTINGS },
    openedChats: new Set(),
    openedChatMeta: {},
    blockedBots: {
      ids: [],
      names: [],
      meta: {}
    },
    rawBlockedBots: {
      ids: [],
      names: [],
      meta: {}
    },
    notInterestedBots: {
      ids: [],
      meta: {}
    },
    savedPersonas: [],
    favoriteCreators: { handles: [], meta: {} },
    followedCreators: { handles: [], meta: {} },
    favoriteBots: { ids: [], meta: {} },
    laterBots: { ids: [], meta: {} },
    botOrganization: { collections: [], meta: {} },
    chatOrganization: { meta: {} },
    recentlySeenBots: { entries: [] },
    characterQolProfiles: {},
    runTimer: null,
    lastUrl: location.href,
    manualImportRunning: false,
    quickPanelStatusTimer: null,
    chatListSorting: false,
    lastPersonaSaveHash: "",
    autoFillRunning: false,
    autoFillClicks: 0,
    autoFillUrl: location.href,
    domRevision: 0,
    messageTextRevision: 0,
    messageDirtyRoots: new Set(),
    messageRootRevisions: new WeakMap(),
    messageLaneRoots: null,
    messageResumeLazyUntil: 0,
    messageLazyScrollTimer: null,
    messageEnhancerSeen: new WeakSet(),
    messageEnhancerConfigSignature: "",
    loadedMessageRootsCache: { route: "", revision: -1, roots: [] },
    cardCache: null,
    cardCacheRevision: -1,
    cardCacheUrl: "",
    openedImportRevision: -1,
    lastMarkedChatId: "",
    blockedBotIdSet: new Set(),
    blockedBotNormalizedNameSet: new Set(),
    notInterestedBotIdSet: new Set(),
    favoriteBotIdSet: new Set(),
    laterBotIdSet: new Set(),
    preparedMatchers: {
      blockedNames: [],
      blockedTags: [],
      blockedWords: [],
      blockedCreators: []
    },
    performanceStats: {},
    runtimeLog: initialRuntimeLog,
    runtimePerformance: { sampleStartedAt: Date.now(), mutations: 0, qolOnlyMutations: 0, chatLocalMutations: 0, composerOnlyMutationSkips: 0, schedules: 0, criticalSchedules: 0, slowSchedules: 0, deferredWhileScrolling: 0, hiddenSkips: 0, messageCacheHits: 0, messageCacheMisses: 0, messageCacheInvalidations: 0, messageCacheInvalidationRequests: 0, messageCacheInvalidationDeduped: 0, messageCacheNonTextSkips: 0, messageCacheFingerprintSkips: 0, messageLaneScheduleCoalesced: 0, messageLaneChunkedPasses: 0, messageLaneChunkedRoots: 0, messageLaneDeferredRoots: 0, messageEnhancerIncrementalLanePasses: 0, messageEnhancerIncrementalLaneRoots: 0, criticalMessageEnhancerPassesDeferred: 0, quickPanelLayoutSkips: 0, quickPanelStateSkips: 0, quickPanelRenderQuietDeferrals: 0, routeFeatureStepSkips: 0, routeFeatureGroupSkips: 0, storageWriteRequests: 0, storageWriteBatches: 0, storageWriteKeys: 0, storageWriteMergedKeys: 0, storageWriteImmediateFlushes: 0 },
    messageTextCache: new WeakMap(),
    messageTextFingerprints: new WeakMap(),
    persistedSettings: { ...DS.DEFAULT_SETTINGS },
    platformEnvironment: null,
    platformDormantSettings: {}
  };

  DS.getPlatformEnvironment = function getPlatformEnvironment() {
    const platformApi = globalThis.SpicyChatQoLPlatform;
    const environment = platformApi?.detectEnvironment?.() || {
      platform: /Android/i.test(String(navigator.userAgent || "")) ? "android" : "desktop",
      android: /Android/i.test(String(navigator.userAgent || "")),
      desktop: !/Android/i.test(String(navigator.userAgent || "")),
      capabilities: {}
    };
    DS.state.platformEnvironment = environment;
    try {
      document.documentElement?.setAttribute?.("data-ds-platform", environment.platform || "desktop");
    } catch {}
    return environment;
  };

  DS.platformSupports = function platformSupports(capability) {
    const api = globalThis.SpicyChatQoLPlatform;
    const env = DS.state.platformEnvironment || DS.getPlatformEnvironment();
    if (typeof api?.supports === "function") return api.supports(capability, env);
    return true;
  };

  DS.settingCompatibility = function settingCompatibility(name) {
    const api = globalThis.SpicyChatQoLPlatform;
    const env = DS.state.platformEnvironment || DS.getPlatformEnvironment();
    return api?.settingCompatibility?.(name, env) || { supported: true, setting: String(name || ""), requires: [], missing: [], reason: "" };
  };

  DS.applyPlatformCompatibility = function applyPlatformCompatibility(desiredSettings) {
    const desired = desiredSettings && typeof desiredSettings === "object" ? { ...desiredSettings } : {};
    const api = globalThis.SpicyChatQoLPlatform;
    const env = DS.getPlatformEnvironment();
    if (typeof api?.applyEffectiveSettings !== "function") {
      DS.state.platformDormantSettings = {};
      return desired;
    }
    const result = api.applyEffectiveSettings(desired, DS.DEFAULT_SETTINGS, env);
    DS.state.platformDormantSettings = result?.dormant && typeof result.dormant === "object" ? result.dormant : {};
    return result?.settings && typeof result.settings === "object" ? result.settings : desired;
  };

  DS.getDesiredSetting = function getDesiredSetting(name) {
    const key = String(name || "");
    return Object.prototype.hasOwnProperty.call(DS.state.persistedSettings || {}, key)
      ? DS.state.persistedSettings[key]
      : DS.DEFAULT_SETTINGS[key];
  };

  DS.runtimeLog("info", "core", "Content runtime initialized", location.pathname || "/");

  DS.bumpDomRevision = function bumpDomRevision() {
    DS.state.domRevision = Number(DS.state.domRevision || 0) + 1;
    if (DS.state.loadedMessageRootsCache) DS.state.loadedMessageRootsCache.revision = -1;
    DS.state.cardCache = null;
    DS.state.cardCacheRevision = -1;
    DS.state.cardCacheUrl = "";
  };

  DS.bumpCardFilterStateRevision = function bumpCardFilterStateRevision() {
    DS.state.cardFilterStateRevision = Number(DS.state.cardFilterStateRevision || 0) + 1;
    DS.state.cardHidingLastPassKey = "";
  };

  function prepareMatcherList(values) {
    const output = [];
    const seen = new Set();

    for (const rawValue of values || []) {
      const raw = String(rawValue || "").trim();
      if (!raw) continue;

      const needle = typeof DS.searchableTextForMatching === "function"
        ? DS.searchableTextForMatching(raw)
        : raw.toLowerCase().replace(/\s+/g, " ").trim();

      // Blocking/filter text often contains nicknames, punctuation and compact
      // fandom abbreviations (for example Simon 'Ghost', TF141 or TaskForce 141).
      // Keep the normal matcher, but also prepare a separator/camel-case tolerant
      // form so the card blocker can compare the same wording across display styles.
      const flexibleSource = raw
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Za-z])([0-9])/g, "$1 $2")
        .replace(/([0-9])([A-Za-z])/g, "$1 $2");
      const flexibleNeedle = typeof DS.searchableTextForMatching === "function"
        ? DS.searchableTextForMatching(flexibleSource)
        : flexibleSource.toLowerCase().replace(/\s+/g, " ").trim();
      const tokens = String(flexibleNeedle || needle || "").split(" ").filter(Boolean);
      const compact = tokens.join("");

      const dedupeKey = `${needle}|${flexibleNeedle}`;
      if (!needle || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      output.push({ raw, needle, flexibleNeedle, tokens, compact });
    }

    return output;
  }

  DS.refreshFastLookupCaches = function refreshFastLookupCaches() {
    const settings = DS.state?.settings || {};
    const blocked = DS.state?.blockedBots || { ids: [], names: [] };
    const notInterested = DS.state?.notInterestedBots || { ids: [] };
    const favorites = DS.state?.favoriteBots || { ids: [] };
    const later = DS.state?.laterBots || { ids: [] };

    DS.state.blockedBotIdSet = new Set(blocked.ids || []);
    DS.state.blockedBotNormalizedNameSet = new Set((blocked.names || []).map(value => DS.normalize?.(value) || "").filter(Boolean));
    DS.state.notInterestedBotIdSet = new Set(notInterested.ids || []);
    DS.state.favoriteBotIdSet = new Set(favorites.ids || []);
    DS.state.laterBotIdSet = new Set(later.ids || []);
    DS.state.preparedMatchers = {
      blockedNames: prepareMatcherList(blocked.names || []),
      blockedTags: prepareMatcherList(settings.blockedTags || []),
      blockedWords: prepareMatcherList(settings.blockedWords || []),
      blockedCreators: prepareMatcherList(settings.blockedCreators || [])
    };
  };

  DS.isBlockedForOpenedHistory = function isBlockedForOpenedHistory(idValue, meta = {}) {
    const id = String(idValue || "").trim();
    const blocked = DS.state?.blockedBots || { ids: [], names: [] };

    if (id && (DS.state.blockedBotIdSet?.has(id) || (blocked.ids || []).includes(id))) {
      return true;
    }

    const name = DS.normalize?.(meta?.name || meta?.title || "") || "";
    if (!name) return false;

    return DS.state.blockedBotNormalizedNameSet?.has(name) || false;
  };

  DS.enforceBlockedPriorityOverOpened = async function enforceBlockedPriorityOverOpened(options = {}) {
    const opened = DS.state?.openedChats;
    if (!(opened instanceof Set) || !opened.size) return 0;

    DS.state.openedChatMeta = DS.state.openedChatMeta || {};
    let removed = 0;

    for (const id of [...opened]) {
      const meta = DS.state.openedChatMeta[id] || {};
      if (!DS.isBlockedForOpenedHistory?.(id, meta)) continue;
      opened.delete(id);
      delete DS.state.openedChatMeta[id];
      removed++;
    }

    if (removed && options.persist !== false) {
      await DS.storageSet({
        [DS.OPENED_KEY]: [...opened],
        [DS.OPENED_META_KEY]: DS.state.openedChatMeta
      });
      DS.updateQuickPanel?.();
    }

    return removed;
  };

  DS.isExtensionContextValid = function isExtensionContextValid() {
    try {
      return !!(chrome?.runtime?.id && chrome?.storage?.local);
    } catch {
      return false;
    }
  };

  // Browser extension updates/reloads can invalidate an already-injected
  // content-script context while leaving its old DOM decorations behind.
  // Only self-reload when this page STARTED with a real extension context and
  // later lost it; Android/WebView shims that never had chrome.runtime are not
  // affected. This fixes stale pages where controls such as Keep/blocking stop
  // being maintained even though their previously-created DOM is still visible.
  const EXTENSION_CONTEXT_WAS_VALID_AT_START = DS.isExtensionContextValid();
  const EXTENSION_CONTEXT_RECOVERY_KEY = "dsQolInvalidatedContextReloadV1";
  const EXTENSION_CONTEXT_RECOVERY_GUARD_MS = 5 * 60 * 1000;
  let extensionContextRecoveryPending = false;

  function extensionContextRecoveryRoute() {
    return `${String(location.pathname || "")}${String(location.search || "")}`.slice(0, 600);
  }

  function recoverInvalidatedExtensionContext(trigger = "watchdog") {
    if (!EXTENSION_CONTEXT_WAS_VALID_AT_START || extensionContextRecoveryPending) return false;
    if (DS.isExtensionContextValid()) return false;
    if (document.visibilityState !== "visible") return false;

    const route = extensionContextRecoveryRoute();
    const now = Date.now();
    try {
      const previous = JSON.parse(sessionStorage.getItem(EXTENSION_CONTEXT_RECOVERY_KEY) || "null");
      if (previous && previous.route === route && Number(previous.at || 0) > now - EXTENSION_CONTEXT_RECOVERY_GUARD_MS) {
        return false;
      }
      sessionStorage.setItem(EXTENSION_CONTEXT_RECOVERY_KEY, JSON.stringify({ route, at: now, trigger: String(trigger || "watchdog") }));
    } catch {}

    extensionContextRecoveryPending = true;
    try {
      DS.runtimeLog?.("warn", "core", "Extension context invalidated; reloading page once", { trigger: String(trigger || "watchdog") });
    } catch {}
    setTimeout(() => {
      try { location.reload(); } catch {}
    }, 120);
    return true;
  }

  if (EXTENSION_CONTEXT_WAS_VALID_AT_START) {
    window.setInterval(() => recoverInvalidatedExtensionContext("interval"), 15000);
    window.addEventListener("focus", () => recoverInvalidatedExtensionContext("focus"), true);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) recoverInvalidatedExtensionContext("visible");
    }, true);
  }

  const storageWriteQueue = {
    payload: {},
    waiters: [],
    timer: null,
    flushing: null,
    flushingKeys: new Set()
  };

  DS.state.settingsIndex = DS.state.settingsIndex instanceof Set ? DS.state.settingsIndex : new Set();
  DS.settingStorageKey = name => `${DS.GRANULAR_SETTING_PREFIX}${String(name || "").trim()}`;
  DS.settingNameFromStorageKey = key => {
    const value = String(key || "");
    return value.startsWith(DS.GRANULAR_SETTING_PREFIX) ? value.slice(DS.GRANULAR_SETTING_PREFIX.length) : "";
  };
  DS.hasSettingStorageChanges = changes => !!changes?.settings || Object.keys(changes || {}).some(key => key.startsWith(DS.GRANULAR_SETTING_PREFIX));

  function settingStorageValueMatches(left, right) {
    if (Object.is(left, right)) return true;
    if (left == null || right == null || typeof left !== "object" || typeof right !== "object") return false;
    try { return JSON.stringify(left) === JSON.stringify(right); }
    catch { return false; }
  }

  function appendGranularSettingsPatch(payload, patch, { comparePersisted = false, protectEnabled = false } = {}) {
    const source = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
    const persisted = DS.state?.persistedSettings || {};
    let indexChanged = false;
    let added = 0;
    for (const [name, rawValue] of Object.entries(source)) {
      if (!String(name || "").trim()) continue;
      const value = protectEnabled && name === "enabled"
        ? DS.state?.globalEnabledSetting !== false
        : rawValue;
      if (comparePersisted && settingStorageValueMatches(persisted[name], value)) continue;
      payload[DS.settingStorageKey(name)] = value;
      added += 1;
      if (!DS.state.settingsIndex.has(name)) { DS.state.settingsIndex.add(name); indexChanged = true; }
    }
    if (added) {
      if (indexChanged) payload[DS.GRANULAR_SETTINGS_INDEX_KEY] = [...DS.state.settingsIndex].sort();
      payload[DS.GRANULAR_SETTINGS_MIGRATION_KEY] = true;
      payload[DS.GRANULAR_SETTINGS_REVISION_KEY] = Date.now();
    }
    return added;
  }

  function normalizeStoragePayload(obj) {
    const payload = obj && typeof obj === "object" ? { ...obj } : {};

    // New v0.2.24 callers can provide just the setting(s) they changed. This is
    // the preferred path: it avoids walking or serializing the full settings
    // object for a one-checkbox update.
    if (payload.settingsPatch && typeof payload.settingsPatch === "object") {
      const patch = payload.settingsPatch;
      delete payload.settingsPatch;
      appendGranularSettingsPatch(payload, patch);
    }

    // Compatibility path for older modules that still hand over a cloned full
    // settings object. Compare it with the last persisted snapshot and emit
    // only actual differences instead of hundreds of granular storage writes.
    if (payload.settings && typeof payload.settings === "object") {
      const settings = payload.settings;
      delete payload.settings;
      appendGranularSettingsPatch(payload, settings, { comparePersisted: true, protectEnabled: true });
    }
    return payload;
  }

  // Bounded size estimate for diagnostics only. It samples containers rather
  // than serializing large saved-bot/chat datasets, so tracing cannot create a
  // second copy of a multi-megabyte value just to report storage cost.
  function diagnosticApproxBytes(value, depth = 0, budget = { nodes: 0 }) {
    if (value == null) return 4;
    if (++budget.nodes > 160 || depth > 4) return 0;
    if (typeof value === "boolean") return 4;
    if (typeof value === "number") return 8;
    if (typeof value === "string") return Math.min(2_000_000, value.length * 2);
    if (Array.isArray(value)) {
      const count = value.length;
      const sampleCount = Math.min(count, 16);
      let sampled = 8;
      for (let i = 0; i < sampleCount; i++) sampled += diagnosticApproxBytes(value[i], depth + 1, budget);
      return sampleCount && count > sampleCount ? Math.round(sampled * (count / sampleCount)) : sampled;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value);
      const sample = entries.slice(0, 24);
      let sampled = 16;
      for (const [key, item] of sample) sampled += key.length * 2 + diagnosticApproxBytes(item, depth + 1, budget);
      return sample.length && entries.length > sample.length ? Math.round(sampled * (entries.length / sample.length)) : sampled;
    }
    return 0;
  }

  DS.saveSettingsPatch = function saveSettingsPatch(patch, options = {}) {
    const clean = patch && typeof patch === "object" && !Array.isArray(patch) ? { ...patch } : {};
    const names = Object.keys(clean).filter(name => String(name || "").trim());
    if (!names.length) return Promise.resolve(true);
    if (DS.state?.settings) Object.assign(DS.state.settings, clean);
    return DS.storageSet({ settingsPatch: clean }, options);
  };

  function requestedStorageKeys(keys) {
    if (keys == null) return null;
    if (typeof keys === "string") return new Set([keys]);
    if (Array.isArray(keys)) return new Set(keys.map(String));
    if (typeof keys === "object") return new Set(Object.keys(keys));
    return new Set();
  }

  function pendingWriteTouches(keys) {
    const pending = Object.keys(storageWriteQueue.payload || {});
    const flushing = [...(storageWriteQueue.flushingKeys || [])];
    if (!pending.length && !flushing.length) return false;
    const requested = requestedStorageKeys(keys);
    if (requested === null) return true;
    return pending.some(key => requested.has(key)) || flushing.some(key => requested.has(key));
  }


  function largeStorageRequestedKeys(keys) {
    if (keys == null) return [...LARGE_STORAGE_KEYS];
    const list = typeof keys === "string" ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys || {}));
    return [...new Set(list.filter(key => LARGE_STORAGE_KEYS.has(String(key || ""))))];
  }

  function localStorageKeysWithoutLarge(keys) {
    if (keys == null) return null;
    if (typeof keys === "string") return LARGE_STORAGE_KEYS.has(keys) ? [] : [keys];
    if (Array.isArray(keys)) return keys.filter(key => !LARGE_STORAGE_KEYS.has(String(key || "")));
    if (keys && typeof keys === "object") {
      return Object.fromEntries(Object.entries(keys).filter(([key]) => !LARGE_STORAGE_KEYS.has(String(key || ""))));
    }
    return keys;
  }

  function sendRuntimeMessage(message) {
    return new Promise(resolve => {
      try {
        const runtime = chrome?.runtime;
        if (!runtime?.sendMessage) return resolve(null);
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          resolve(value || null);
        };
        const maybe = runtime.sendMessage(message, response => {
          try { void chrome.runtime?.lastError; } catch {}
          finish(response);
        });
        if (maybe && typeof maybe.then === "function") {
          maybe.then(finish).catch(() => finish(null));
        }
      } catch {
        resolve(null);
      }
    });
  }

  async function readLargeStorage(keys) {
    const requested = largeStorageRequestedKeys(keys);
    if (!requested.length) return {};
    const response = await sendRuntimeMessage({ type: "DS_LARGE_STORAGE_GET", keys: requested });
    if (!response?.ok) return null; // Android/older-background compatibility
    return response.data && typeof response.data === "object" ? response.data : {};
  }

  function rawStorageGet(keys) {
    return new Promise(resolve => {
      try {
        if (!DS.isExtensionContextValid()) {
          resolve({});
          return;
        }

        chrome.storage.local.get(keys, result => {
          try {
            if (chrome.runtime.lastError) {
              resolve({});
              return;
            }
          } catch {}
          resolve(result || {});
        });
      } catch (error) {
        console.warn(`[${DS.EXT_NAME}] storage get skipped`, error);
        resolve({});
      }
    });
  }

  async function flushStorageWriteQueue() {
    clearTimeout(storageWriteQueue.timer);
    storageWriteQueue.timer = null;

    if (storageWriteQueue.flushing) {
      await storageWriteQueue.flushing;
      if (Object.keys(storageWriteQueue.payload || {}).length) return flushStorageWriteQueue();
      return true;
    }

    const payload = storageWriteQueue.payload;
    const waiters = storageWriteQueue.waiters;
    storageWriteQueue.payload = {};
    storageWriteQueue.waiters = [];
    const keys = Object.keys(payload || {});
    const diagWriteStarted = keys.length && DS.isDiagnosticTraceActive?.("normal") && typeof performance !== "undefined" ? performance.now() : 0;
    if (!keys.length) {
      waiters.forEach(resolve => resolve(true));
      return true;
    }

    const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.storageWriteBatches = Number(counters.storageWriteBatches || 0) + 1;
    counters.storageWriteKeys = Number(counters.storageWriteKeys || 0) + keys.length;

    storageWriteQueue.flushingKeys = new Set(keys);
    storageWriteQueue.flushing = (async () => {
      try {
        if (!DS.isExtensionContextValid()) return false;

        const largeValues = {};
        const localPayload = { ...payload };
        for (const key of LARGE_STORAGE_KEYS) {
          if (!Object.prototype.hasOwnProperty.call(localPayload, key)) continue;
          largeValues[key] = localPayload[key];
          delete localPayload[key];
        }

        let largeOk = true;
        if (Object.keys(largeValues).length) {
          const response = await sendRuntimeMessage({ type: "DS_LARGE_STORAGE_SET", values: largeValues });
          largeOk = !!response?.ok;
          if (!largeOk) {
            // Compatibility path for Android/WebView or an older background.
            Object.assign(localPayload, largeValues);
            largeOk = true;
          }
        }

        let localOk = true;
        if (Object.keys(localPayload).length) {
          localOk = await new Promise(resolve => {
            try {
              chrome.storage.local.set(localPayload, () => {
                try {
                  if (chrome.runtime.lastError) return resolve(false);
                } catch {}
                resolve(true);
              });
            } catch {
              resolve(false);
            }
          });
        }
        return !!(largeOk && localOk);
      } catch (error) {
        console.warn(`[${DS.EXT_NAME}] storage save skipped`, error);
        return false;
      }
    })();

    const ok = await storageWriteQueue.flushing;
    storageWriteQueue.flushing = null;
    storageWriteQueue.flushingKeys.clear();
    if (diagWriteStarted) {
      DS.diagStorage?.("write", {
        backend: keys.some(key => LARGE_STORAGE_KEYS.has(key)) ? (keys.some(key => !LARGE_STORAGE_KEYS.has(key)) ? "mixed" : "indexeddb") : "chrome.storage.local",
        keyCount: keys.length,
        largeKeyCount: keys.filter(key => LARGE_STORAGE_KEYS.has(key)).length,
        keys: keys.slice(0, 24),
        approxBytes: diagnosticApproxBytes(payload),
        durationMs: Math.round((performance.now() - diagWriteStarted) * 10) / 10,
        ok: !!ok,
        batched: true
      });
    }
    if (ok) {
      const persisted = { ...(DS.state?.persistedSettings || {}) };
      for (const [storageKey, value] of Object.entries(payload || {})) {
        const settingName = DS.settingNameFromStorageKey(storageKey);
        if (settingName) persisted[settingName] = value;
      }
      DS.state.persistedSettings = persisted;
    }
    waiters.forEach(resolve => resolve(ok));

    if (Object.keys(storageWriteQueue.payload || {}).length && !storageWriteQueue.timer) {
      storageWriteQueue.timer = setTimeout(() => flushStorageWriteQueue(), 24);
    }
    return ok;
  }

  DS.flushStorageWrites = flushStorageWriteQueue;

  DS.storageGet = async function storageGet(keys) {
    const diagReadStarted = DS.isDiagnosticTraceActive?.("normal") && typeof performance !== "undefined" ? performance.now() : 0;
    if (pendingWriteTouches(keys)) await flushStorageWriteQueue();

    const wantsLarge = largeStorageRequestedKeys(keys).length > 0;
    const largeData = wantsLarge ? await readLargeStorage(keys) : {};
    const largeSupported = largeData !== null;

    // Android/WebView and old background builds can keep using the legacy local
    // object until they gain the extension-owned IDB service.
    const localKeys = largeSupported ? localStorageKeysWithoutLarge(keys) : keys;
    const requested = typeof localKeys === "string" ? [localKeys] : (Array.isArray(localKeys) ? localKeys : null);
    const wantsSettings = keys == null || requested?.includes("settings");
    const firstKeys = keys == null
      ? null
      : [...new Set([...(requested || []), ...(wantsSettings ? [DS.GRANULAR_SETTINGS_INDEX_KEY, DS.GRANULAR_SETTINGS_MIGRATION_KEY] : [])])];
    const result = await rawStorageGet(firstKeys);
    if (wantsSettings) {
      const index = [...new Set((Array.isArray(result[DS.GRANULAR_SETTINGS_INDEX_KEY]) ? result[DS.GRANULAR_SETTINGS_INDEX_KEY] : []).map(name => String(name || "").trim()).filter(Boolean))];
      DS.state.settingsIndex = new Set(index);
      const granular = keys == null || !index.length ? result : await rawStorageGet(index.map(DS.settingStorageKey));
      const hadLegacy = result.settings && typeof result.settings === "object";
      const merged = hadLegacy ? { ...result.settings } : {};
      let found = false;
      for (const name of index) {
        const storageKey = DS.settingStorageKey(name);
        if (!Object.prototype.hasOwnProperty.call(granular, storageKey)) continue;
        merged[name] = granular[storageKey];
        found = true;
      }
      if (hadLegacy || found) result.settings = merged;
      else delete result.settings;
    }
    const finalResult = largeSupported ? { ...result, ...(largeData || {}) } : result;
    if (diagReadStarted) {
      const requestedKeys = keys == null ? ["*"] : (typeof keys === "string" ? [keys] : (Array.isArray(keys) ? keys.map(String) : Object.keys(keys || {})));
      let largeRecords = 0;
      for (const key of largeStorageRequestedKeys(keys)) {
        const value = finalResult?.[key];
        const meta = value?.meta && typeof value.meta === "object" ? value.meta : value;
        if (meta && typeof meta === "object") largeRecords += Object.keys(meta).length;
      }
      DS.diagStorage?.("read", {
        backend: wantsLarge ? (requestedKeys.some(key => key !== "*" && !LARGE_STORAGE_KEYS.has(key)) ? "mixed" : "indexeddb") : "chrome.storage.local",
        keyCount: requestedKeys.length,
        keys: requestedKeys.slice(0, 24),
        largeRecords,
        approxBytes: diagnosticApproxBytes(finalResult),
        durationMs: Math.round((performance.now() - diagReadStarted) * 10) / 10
      });
    }
    return finalResult;
  };

  DS.storageSet = function storageSet(obj, options = {}) {
    const payload = normalizeStoragePayload(obj);
    const keys = Object.keys(payload);
    if (!keys.length) return Promise.resolve(true);

    const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.storageWriteRequests = Number(counters.storageWriteRequests || 0) + 1;
    if (DS.isDiagnosticTraceActive?.("normal")) {
      DS.diagStorage?.("write-queued", {
        keyCount: keys.length,
        keys: keys.slice(0, 24),
        largeKeyCount: keys.filter(key => LARGE_STORAGE_KEYS.has(key)).length,
        immediate: !!options?.immediate
      });
    }
    let merged = 0;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(storageWriteQueue.payload, key)) merged += 1;
      storageWriteQueue.payload[key] = payload[key];
    }
    counters.storageWriteMergedKeys = Number(counters.storageWriteMergedKeys || 0) + merged;

    const promise = new Promise(resolve => storageWriteQueue.waiters.push(resolve));
    if (options?.immediate) {
      counters.storageWriteImmediateFlushes = Number(counters.storageWriteImmediateFlushes || 0) + 1;
      flushStorageWriteQueue();
    } else if (!storageWriteQueue.timer) {
      storageWriteQueue.timer = setTimeout(() => flushStorageWriteQueue(), 24);
    }
    return promise;
  };

  DS.largeStorageGetRecords = async function largeStorageGetRecords(key, ids = []) {
    const diagStarted = DS.isDiagnosticTraceActive?.("deep") && typeof performance !== "undefined" ? performance.now() : 0;
    key = String(key || "");
    if (!LARGE_STORAGE_KEYS.has(key)) return {};
    const cleanIds = [...new Set((Array.isArray(ids) ? ids : [ids]).map(id => String(id || "").trim()).filter(Boolean))];
    if (!cleanIds.length) return {};
    const response = await sendRuntimeMessage({ type: "DS_LARGE_STORAGE_GET_RECORDS", key, ids: cleanIds });
    if (response?.ok && response.records && typeof response.records === "object") {
      if (diagStarted) DS.diagStorage?.("read-records", { backend: "indexeddb", key, requested: cleanIds.length, records: Object.keys(response.records).length, durationMs: Math.round((performance.now() - diagStarted) * 10) / 10 });
      return response.records;
    }

    // Android/WebView can inject a newer content bundle before the native
    // wrapper/background learns the IDB message protocol. Fall back to the
    // legacy local object rather than making archive/status data appear empty.
    const result = await DS.storageGet([key]);
    const source = result?.[key] && typeof result[key] === "object" ? result[key] : {};
    const meta = source.meta && typeof source.meta === "object" ? source.meta : source;
    return Object.fromEntries(cleanIds.map(id => [id, meta?.[id]]).filter(([, value]) => value && typeof value === "object"));
  };

  DS.largeStorageGetRecord = async function largeStorageGetRecord(key, id) {
    const cleanId = String(id || "").trim();
    if (!cleanId) return null;
    const records = await DS.largeStorageGetRecords(key, [cleanId]);
    return records[cleanId] || null;
  };

  DS.largeStorageMerge = async function largeStorageMerge(key, entries = {}) {
    const diagStarted = DS.isDiagnosticTraceActive?.("normal") && typeof performance !== "undefined" ? performance.now() : 0;
    key = String(key || "");
    if (!LARGE_STORAGE_KEYS.has(key)) return false;
    const clean = entries && typeof entries === "object" && !Array.isArray(entries) ? entries : {};
    if (!Object.keys(clean).length) return true;
    const response = await sendRuntimeMessage({ type: "DS_LARGE_STORAGE_MERGE", key, entries: clean });
    if (response?.ok) {
      if (diagStarted) DS.diagStorage?.("merge", { backend: "indexeddb", key, records: Object.keys(clean).length, durationMs: Math.round((performance.now() - diagStarted) * 10) / 10, ok: true });
      return true;
    }

    // Same compatibility fallback as reads: merge into the legacy local object
    // when the companion background does not expose the v0.2.29 IDB service.
    const result = await DS.storageGet([key]);
    const current = result?.[key] && typeof result[key] === "object" ? result[key] : {};
    const rawMeta = current.meta && typeof current.meta === "object" ? current.meta : current;
    const next = { ...(current.meta ? current : {}), meta: { ...(rawMeta || {}), ...clean } };
    return !!(await DS.storageSet({ [key]: next }, { immediate: true }));
  };


  DS.openOptionsTarget = async function openOptionsTarget(target = "general", params = {}) {
    const safeTarget = String(target || "general").replace(/[^a-z0-9_-]/gi, "") || "general";
    const detail = params && typeof params === "object" ? params : {};
    const pending = {
      target: safeTarget,
      search: String(detail.search || "").slice(0, 300),
      backup: String(detail.backup || "").slice(0, 160),
      lorebookBackup: String(detail.lorebookBackup || "").slice(0, 160),
      at: Date.now()
    };

    // Persist the requested destination before asking the browser/app to open
    // Settings. The Android WebView shim intentionally returns relative values
    // from runtime.getURL(), so navigating to an extension URL from page JS can
    // otherwise become a spicychat.ai 404/edit route. A shared storage handoff
    // works in Chrome, Firefox, and the Android wrapper.
    // Persist the target as a best-effort Android/fallback handoff, but never
    // make opening Settings wait for storage. A wedged write previously made
    // every in-page Settings button appear completely dead.
    try {
      Promise.resolve(DS.storageSet?.({ [DS.PENDING_OPTIONS_NAV_KEY]: pending }, { immediate: true }))
        .then(saved => {
          if (saved === false) DS.runtimeLog?.("warn", "options", "Pending Settings destination was not saved");
        })
        .catch(error => DS.runtimeLog?.("warn", "options", "Could not save pending Settings destination", error));
    } catch (error) {
      DS.runtimeLog?.("warn", "options", "Could not queue pending Settings destination", error);
    }

    return new Promise(resolve => {
      let settled = false;
      const finish = value => { if (!settled) { settled = true; resolve(!!value); } };
      const fallback = () => {
        try {
          chrome.runtime?.openOptionsPage?.(() => finish(true));
          window.setTimeout(() => finish(true), 400);
        } catch (error) {
          DS.runtimeLog?.("warn", "options", "Could not open Settings", error);
          finish(false);
        }
      };
      try {
        chrome.runtime?.sendMessage?.({
          type: "DS_OPEN_OPTIONS_TARGET",
          target: safeTarget,
          query: pending.search || ""
        }, response => {
          let failed = false;
          try { failed = !!chrome.runtime?.lastError; } catch {}
          if (!failed && response?.ok) finish(true);
          else fallback();
        });
        window.setTimeout(() => { if (!settled) fallback(); }, 1000);
      } catch {
        fallback();
      }
    });
  };

  // Do not leave a small queued write behind when the user backgrounds/closes a
  // tab. The callback may finish after pagehide, but chrome.storage owns the IO.
  window.addEventListener("pagehide", () => {
    try { DS.flushStorageWrites?.(); } catch {}
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      try { DS.flushStorageWrites?.(); } catch {}
    }
  }, true);

  function cloneLocalHistoryValue(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  DS.getLocalChangeHistory = async function getLocalChangeHistory() {
    const result = await DS.storageGet([DS.LOCAL_CHANGE_HISTORY_KEY]);
    return Array.isArray(result[DS.LOCAL_CHANGE_HISTORY_KEY]) ? result[DS.LOCAL_CHANGE_HISTORY_KEY] : [];
  };

  DS.recordLocalChange = async function recordLocalChange(label, beforePayload, afterPayload = {}) {
    if (!DS.state?.settings?.enableLocalChangeHistory) return false;
    const before = cloneLocalHistoryValue(beforePayload);
    const after = cloneLocalHistoryValue(afterPayload);
    if (!before || typeof before !== "object") return false;

    const entry = {
      id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: String(label || "QoL change").replace(/\s+/g, " ").trim().slice(0, 140),
      at: Date.now(),
      before,
      after: after && typeof after === "object" ? after : {},
      undoable: true
    };

    // Keep history intentionally small. Very large snapshots are logged without
    // rollback data rather than silently filling extension storage.
    try {
      if (JSON.stringify(entry).length > 220000) {
        entry.before = {};
        entry.after = {};
        entry.undoable = false;
      }
    } catch {
      entry.before = {};
      entry.after = {};
      entry.undoable = false;
    }

    const history = await DS.getLocalChangeHistory();
    history.unshift(entry);
    await DS.storageSet({ [DS.LOCAL_CHANGE_HISTORY_KEY]: history.slice(0, 12) });
    return true;
  };

  DS.undoLocalChange = async function undoLocalChange(changeId = "") {
    const history = await DS.getLocalChangeHistory();
    const index = changeId ? history.findIndex(item => item?.id === changeId) : history.findIndex(item => item?.undoable);
    if (index < 0) return { ok: false, reason: "Nothing undoable" };
    const entry = history[index];
    if (!entry?.undoable || !entry.before || typeof entry.before !== "object") return { ok: false, reason: "That entry cannot be undone" };
    const payload = {};
    for (const [key, value] of Object.entries(entry.before)) payload[key] = cloneLocalHistoryValue(value);
    if (!Object.keys(payload).length) return { ok: false, reason: "No rollback snapshot" };
    const current = await DS.storageGet(Object.keys(payload));
    for (const [key, expected] of Object.entries(entry.after || {})) {
      if (JSON.stringify(current[key]) !== JSON.stringify(expected)) {
        return { ok: false, reason: "That data changed again after this history entry" };
      }
    }
    const ok = await DS.storageSet(payload);
    if (!ok) return { ok: false, reason: "Storage write failed" };
    history.splice(index, 1);
    await DS.storageSet({ [DS.LOCAL_CHANGE_HISTORY_KEY]: history });
    return { ok: true, entry };
  };

  DS.clearLocalChangeHistory = async function clearLocalChangeHistory() {
    await DS.storageSet({ [DS.LOCAL_CHANGE_HISTORY_KEY]: [] });
  };

  DS.uniqueClean = values => [
    ...new Set(
      (values || [])
        .map(x => String(x).trim())
        .filter(Boolean)
    )
  ];


  // Converts common Unicode "fancy text" letters and digits to ASCII even on
  // older Android WebViews where String.normalize("NFKC") can be incomplete.
  function normalizeMathematicalLatinFallback(value) {
    const ranges = [
      [0x2102, 0x2102, 0x43], [0x210A, 0x210A, 0x67],
      [0x210B, 0x210B, 0x48], [0x210C, 0x210C, 0x48],
      [0x210D, 0x210D, 0x48], [0x210E, 0x210E, 0x68],
      [0x2110, 0x2110, 0x49], [0x2111, 0x2111, 0x49],
      [0x2112, 0x2112, 0x4C], [0x2113, 0x2113, 0x6C],
      [0x2115, 0x2115, 0x4E], [0x2119, 0x211B, 0x50],
      [0x211C, 0x211C, 0x52], [0x211D, 0x211D, 0x52],
      [0x2124, 0x2124, 0x5A], [0x2128, 0x2128, 0x5A],
      [0x212A, 0x212A, 0x4B], [0x212C, 0x212D, 0x42],
      [0x212F, 0x212F, 0x65], [0x2130, 0x2131, 0x45],
      [0x2133, 0x2133, 0x4D], [0x2134, 0x2134, 0x6F],
      [0x2139, 0x2139, 0x69], [0x2145, 0x2145, 0x44],
      [0x2146, 0x2147, 0x64], [0x2148, 0x2149, 0x69],
      [0x1D400, 0x1D419, 0x41], [0x1D41A, 0x1D433, 0x61],
      [0x1D434, 0x1D44D, 0x41], [0x1D44E, 0x1D454, 0x61],
      [0x1D456, 0x1D467, 0x69], [0x1D468, 0x1D481, 0x41],
      [0x1D482, 0x1D49B, 0x61], [0x1D49C, 0x1D49C, 0x41],
      [0x1D49E, 0x1D49F, 0x43], [0x1D4A2, 0x1D4A2, 0x47],
      [0x1D4A5, 0x1D4A6, 0x4A], [0x1D4A9, 0x1D4AC, 0x4E],
      [0x1D4AE, 0x1D4B5, 0x53], [0x1D4B6, 0x1D4B9, 0x61],
      [0x1D4BB, 0x1D4BB, 0x66], [0x1D4BD, 0x1D4C3, 0x68],
      [0x1D4C5, 0x1D4CF, 0x70], [0x1D4D0, 0x1D4E9, 0x41],
      [0x1D4EA, 0x1D503, 0x61], [0x1D504, 0x1D505, 0x41],
      [0x1D507, 0x1D50A, 0x44], [0x1D50D, 0x1D514, 0x4A],
      [0x1D516, 0x1D51C, 0x53], [0x1D51E, 0x1D537, 0x61],
      [0x1D538, 0x1D539, 0x41], [0x1D53B, 0x1D53E, 0x44],
      [0x1D540, 0x1D544, 0x49], [0x1D546, 0x1D546, 0x4F],
      [0x1D54A, 0x1D550, 0x53], [0x1D552, 0x1D56B, 0x61],
      [0x1D56C, 0x1D585, 0x41], [0x1D586, 0x1D59F, 0x61],
      [0x1D5A0, 0x1D5B9, 0x41], [0x1D5BA, 0x1D5D3, 0x61],
      [0x1D5D4, 0x1D5ED, 0x41], [0x1D5EE, 0x1D607, 0x61],
      [0x1D608, 0x1D621, 0x41], [0x1D622, 0x1D63B, 0x61],
      [0x1D63C, 0x1D655, 0x41], [0x1D656, 0x1D66F, 0x61],
      [0x1D670, 0x1D689, 0x41], [0x1D68A, 0x1D6A3, 0x61],
      [0x1D7CE, 0x1D7D7, 0x30], [0x1D7D8, 0x1D7E1, 0x30],
      [0x1D7E2, 0x1D7EB, 0x30], [0x1D7EC, 0x1D7F5, 0x30],
      [0x1D7F6, 0x1D7FF, 0x30]
    ];

    let output = "";

    for (const character of String(value || "")) {
      const codePoint = character.codePointAt(0);
      let replacement = character;

      for (const [start, end, asciiStart] of ranges) {
        if (codePoint < start || codePoint > end) continue;
        replacement = String.fromCharCode(asciiStart + (codePoint - start));
        break;
      }

      output += replacement;
    }

    return output;
  }

  const SMALL_CAP_LATIN_MAP = new Map(Object.entries({
    "ᴀ":"a", "ʙ":"b", "ᴄ":"c", "ᴅ":"d", "ᴇ":"e", "ꜰ":"f", "ɢ":"g", "ʜ":"h",
    "ɪ":"i", "ᴊ":"j", "ᴋ":"k", "ʟ":"l", "ᴍ":"m", "ɴ":"n", "ᴏ":"o", "ᴘ":"p",
    "ʀ":"r", "ꜱ":"s", "ᴛ":"t", "ᴜ":"u", "ᴠ":"v", "ᴡ":"w", "ʏ":"y", "ᴢ":"z"
  }));

  function normalizeSmallCapLatin(value) {
    let output = "";
    for (const character of String(value || "")) output += SMALL_CAP_LATIN_MAP.get(character) || character;
    return output;
  }

  function stripOrphanCombiningMarks(value) {
    let output = "";
    let previousBase = false;
    for (const character of String(value || "")) {
      if (/\p{M}/u.test(character)) {
        if (previousBase) output += character;
        continue;
      }
      output += character;
      previousBase = /[\p{L}\p{N}]/u.test(character);
      if (/\s|[\p{P}\p{S}]/u.test(character)) previousBase = false;
    }
    return output;
  }

  const STYLED_LATIN_LOOKALIKES = Object.freeze({
    // Cyrillic letters commonly used as Latin lookalikes in stylized titles.
    "ѕ":"s", "т":"t", "у":"y", "н":"h", "я":"r", "є":"e", "м":"m",
    "а":"a", "е":"e", "о":"o", "р":"p", "с":"c", "і":"i", "к":"k",
    "х":"x", "в":"b", "ԁ":"d",
    // Greek/math confusables used alongside Cyrillic in faux-English titles.
    "ι":"i", "ω":"w", "α":"a", "η":"n", "σ":"o", "ο":"o", "ν":"v",
    "є":"e", "ε":"e", "ρ":"p", "υ":"u", "τ":"t", "κ":"k",
    "∂":"d", "ℓ":"l"
  });

  function normalizeMixedScriptLatin(value) {
    const raw = String(value || "");
    const greek = (raw.match(/[\u0370-\u03ff]/g) || []).length;
    const cyrillic = (raw.match(/[\u0400-\u052f]/g) || []).length;
    const latin = (raw.match(/[A-Za-z]/g) || []).length;
    const mathStyled = /[∂ℓ]/u.test(raw);
    // Resist changing actual non-English descriptions: require strong mixed-
    // script decoration instead of transliterating single-script text.
    if ((greek < 2 || cyrillic < 2) && !(mathStyled && (greek + cyrillic) >= 3 && latin >= 3)) return raw;
    let out = "";
    for (const char of raw) out += STYLED_LATIN_LOOKALIKES[char] || char;
    return out;
  }

  DS.normalizeTextForMatching = function normalizeTextForMatching(value, options = {}) {
    const settings = DS.state?.settings || DS.DEFAULT_SETTINGS || {};
    const enabled = settings.textNormalizationEnabled !== false;

    let text = String(value || "");

    if (!enabled) {
      return text;
    }

    if (settings.normalizeInvisibleCharacters !== false) {
      text = text
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
        .replace(/[\u00AD]/g, "");
    }

    if (settings.normalizeFancyUnicode !== false) {
      if (typeof text.normalize === "function") {
        try {
          text = text.normalize("NFKC");
        } catch {}
      }

      text = normalizeMathematicalLatinFallback(text);
      text = normalizeSmallCapLatin(text);
      text = normalizeMixedScriptLatin(text);
    }

    if (settings.normalizePunctuation !== false) {
      text = text
        .replace(/[‘’‚‛`´]/g, "'")
        .replace(/[“”„‟]/g, '"')
        .replace(/[‐‑‒–—―]/g, "-")
        .replace(/[⁄∕]/g, "/")
        .replace(/[…]/g, "...")
        .replace(/[•·∙]/g, " ");
    }

    if (settings.normalizeDecorativeSymbols || options.stripDecorativeSymbols) {
      text = text
        .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, " ")
        .replace(/[★☆✦✧✩✪✫✬✭✮✯✰♡♥❤💕💖💗💘💝💞💟]/gu, " ")
        .replace(/[꧁꧂◦°⋆]+/gu, " ")
        .replace(/[ᩚ]/gu, " ")
        // Decorative title suffixes often mix historic glyph blocks, combining
        // marks and sub/superscript operators (for example 𓏲࣪₊). Only strip
        // these when the user explicitly enables decorative-symbol cleanup.
        .replace(/[\u{13000}-\u{1342F}]/gu, " ")
        .replace(/[\u08E3-\u0902₊₋₌⁺⁻⁼]+/gu, " ")
        .replace(/[|｜¦]+/g, " | ");
      text = stripOrphanCombiningMarks(text);
    }

    return text;
  };

  DS.normalizeTextForDisplay = function normalizeTextForDisplay(value) {
    return DS.normalizeTextForMatching(value)
      .replace(/\s+/g, " ")
      .trim();
  };

  DS.normalizeTextPreview = function normalizeTextPreview(value) {
    return DS.normalizeTextForMatching(value, { stripDecorativeSymbols: true })
      .replace(/\s+/g, " ")
      .trim();
  };

  DS.oocLabelFromText = function oocLabelFromText(text, index = 0) {
  const clean = String(text || "")
    .replace(/^\s*\[?OOC\s*:?\s*/i, "")
    .replace(/\]?\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean || clean === ":") {
    return `OOC ${index + 1}`;
  }

  return clean.length > 28 ? `${clean.slice(0, 28)}...` : clean;
};

DS.normalizeOocTemplates = function normalizeOocTemplates(value) {
  let items = [];

  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === "string" && value.trim()) {
    items = value
      .split(/\n\s*---\s*\n/g)
      .map(text => text.trim())
      .filter(Boolean);
  }

  if (!items.length) {
    items = [
      { id: DS.DEFAULT_OOC_TEMPLATE_ID, name: "Strict no-control", text: DS.DEFAULT_OOC_TEMPLATE, builtIn: true },
      { id: DS.HARD_OOC_TEMPLATE_ID, name: "Hard no-control + formatting", text: DS.HARD_OOC_TEMPLATE, builtIn: true }
    ];
  }

  return items
    .map((item, index) => {
      if (typeof item === "string") {
        const text = item.trim();
        if (!text) return null;

        return {
          id: `ooc-${Date.now()}-${index}`,
          name: DS.oocLabelFromText(text, index),
          text
        };
      }

      if (!item || typeof item !== "object") return null;

      const text = String(item.text || item.body || item.value || "").trim();
      if (!text) return null;

      const name =
        String(item.name || item.title || "").trim() ||
        DS.oocLabelFromText(text, index);

      return {
        id: String(item.id || `ooc-${Date.now()}-${index}`),
        name,
        text,
        builtIn: item.builtIn === true
      };
    })
    .filter(Boolean);
};


  DS.cleanPersonaName = function cleanPersonaName(value) {
    let text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return "";

    text = text
      .replace(/\s*\bDefault\b\s*$/i, "")
      .replace(/Default$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    return text;
  };

  DS.cleanPersonas = function cleanPersonas(personas) {
    const byKey = new Map();

    for (const persona of personas || []) {
      if (!persona || typeof persona !== "object") continue;

      const id = String(persona.id || "").trim();
      const name = DS.cleanPersonaName(persona.name || persona.label || "");
      if (!id && !name) continue;

      byKey.set(id || name.toLowerCase(), {
        ...persona,
        id,
        name
      });
    }

    return [...byKey.values()];
  };

  DS.loadState = async function loadState() {
    const result = await DS.storageGet([
      "settings",
      DS.OPENED_KEY,
      DS.OPENED_META_KEY,
      DS.OOC_TEMPLATES_KEY,
      DS.BLOCKED_BOTS_KEY,
      DS.NOT_INTERESTED_KEY,
      DS.PERSONAS_KEY,
      DS.LEGACY_PERSONAS_KEY,
      DS.FAVORITE_CREATORS_KEY,
      DS.FOLLOWED_CREATORS_KEY,
      DS.FAVORITE_BOTS_KEY,
      DS.LATER_BOTS_KEY,
      DS.BOT_ORGANIZER_KEY,
      DS.CHAT_ORGANIZER_KEY,
      DS.RECENTLY_SEEN_BOTS_KEY,
      DS.CHARACTER_QOL_PROFILES_KEY,
      "generationMetadataDefaultsMigrationV01841",
      "backupOptInMigrationV01990",
      "quickDislikeOptInMigrationV019119",
      "oocHardPresetMigrationV022",
      "chatExportPanelMigrationV0217",
      "performanceDefaultsMigrationV0230",
      "lorebookPublicOptInMigrationV031"
    ]);

    const rawSettings = result.settings || {};
    const settings = {
      ...DS.DEFAULT_SETTINGS,
      ...rawSettings
    };
    // Capture the persisted master switch before migrations perform any writes.
    DS.state.globalEnabledSetting = settings.enabled !== false;

    if (!("chatBubbleAiActionMode" in rawSettings)) {
      settings.chatBubbleAiActionMode = rawSettings.chatBubblePreserveActionColors === false ? "base" : "native";
    }
    if (!("chatBubbleUserActionMode" in rawSettings)) {
      settings.chatBubbleUserActionMode = rawSettings.chatBubblePreserveActionColors === false ? "base" : "native";
    }

    let shouldSaveMigratedSettings = false;
    const migrationPayload = {};

    if (result.chatExportPanelMigrationV0217 !== true) {
      if (settings.showChatExportButton && settings.quickPanelShowExport === false) {
        settings.quickPanelShowExport = true;
        shouldSaveMigratedSettings = true;
      }
      migrationPayload.chatExportPanelMigrationV0217 = true;
    }

    // v0.2.30: the old recommended performance defaults were 500 mounted
    // messages and 5 awake SpicyChat tabs. Move only those exact old defaults
    // to the new measured recommendations; non-default custom values are kept.
    if (result.performanceDefaultsMigrationV0230 !== true) {
      if (!("largeChatPerformanceThreshold" in rawSettings) || Number(rawSettings.largeChatPerformanceThreshold) === 500) {
        settings.largeChatPerformanceThreshold = 300;
        shouldSaveMigratedSettings = true;
      }
      if (!("maxAwakeSpicyTabs" in rawSettings) || Number(rawSettings.maxAwakeSpicyTabs) === 5) {
        settings.maxAwakeSpicyTabs = 3;
        shouldSaveMigratedSettings = true;
      }
      migrationPayload.performanceDefaultsMigrationV0230 = true;
    }

    // v0.2.31: Public Lorebook blocking/history is opt-in from first release.
    // Reset the prerelease test controls once so development installs also
    // get the intended OFF defaults before the .31 feature ships.
    if (result.lorebookPublicOptInMigrationV031 !== true) {
      settings.lorebookBlockingEnabled = false;
      settings.applyBotBlockingToLorebooks = false;
      settings.showLorebookBlockButtons = false;
      settings.lorebookTrackHistory = false;
      settings.lorebookPublicToolsEnabled = false; // legacy prerelease master switch
      shouldSaveMigratedSettings = true;
      migrationPayload.lorebookPublicOptInMigrationV031 = true;
    }

    // v0.1.9.86: the old immediate Quick Dislike flag is migrated to the
    // idle-aware queue. Keeping the legacy key false prevents older blocking
    // code from starting helper tabs immediately after every block.
    if (!("quickDislikeIdleEnabled" in rawSettings)) {
      settings.quickDislikeIdleEnabled = !!rawSettings.quickDislikeOnBlock;
      shouldSaveMigratedSettings = true;
    }
    if (settings.quickDislikeOnBlock) {
      settings.quickDislikeOnBlock = false;
      shouldSaveMigratedSettings = true;
    }

    // v0.1.9.119: automatic dislike-after-blocking is explicitly opt-in.
    // Turn any previously persisted automatic state off once on upgrade so it
    // cannot keep running just because an older build/preset enabled it.
    if (result.quickDislikeOptInMigrationV019119 !== true) {
      settings.quickDislikeIdleEnabled = false;
      settings.quickDislikeOnBlock = false;
      shouldSaveMigratedSettings = true;
      migrationPayload.quickDislikeOptInMigrationV019119 = true;
    }

    if (result.backupOptInMigrationV01990 !== true) {
      settings.botArchiveRememberSeenPublic = false;
      settings.botBackupToolsEnabled = false;
      settings.botArchiveOwnEditorBackups = false;
      settings.botArchiveOnProfileVisit = false;
      settings.botArchiveOnChatOpen = false;
      settings.lorebookBackupToolsEnabled = false;
      settings.lorebookBackupsEnabled = false;
      shouldSaveMigratedSettings = true;
      migrationPayload.backupOptInMigrationV01990 = true;
    }

    // v0.1.9.104: split "show backup tools" from "automatic saves".
    // If an older install already opted into automatic backups, keep the
    // corresponding manual controls enabled after the split.
    if (!("botBackupToolsEnabled" in rawSettings) && rawSettings.botArchiveOwnEditorBackups === true) {
      settings.botBackupToolsEnabled = true;
      shouldSaveMigratedSettings = true;
    }
    if (!("lorebookBackupToolsEnabled" in rawSettings) && rawSettings.lorebookBackupsEnabled === true) {
      settings.lorebookBackupToolsEnabled = true;
      shouldSaveMigratedSettings = true;
    }

    if (result.generationMetadataDefaultsMigrationV01841 !== true) {
      const hasIndividualMetadataChoice = !!(
        settings.showMessageTimestamps ||
        settings.showGenerationModel ||
        settings.showGenerationElapsed ||
        settings.showGenerationSettings
      );
      if (!settings.showGenerationMetadata && !hasIndividualMetadataChoice) {
        settings.showMessageTimestamps = false;
        settings.messageTimestamp24Hour = false;
        settings.messageTimestampDateFirst = false;
        settings.messageTimestampShowSeconds = false;
        settings.showGenerationModel = false;
        settings.showGenerationElapsed = false;
        settings.showGenerationSettings = false;
        settings.compactGenerationMetadata = false;
        shouldSaveMigratedSettings = true;
      }
      migrationPayload.generationMetadataDefaultsMigrationV01841 = true;
    }

    if (shouldSaveMigratedSettings || Object.keys(migrationPayload).length) {
      await DS.storageSet({
        ...(shouldSaveMigratedSettings ? { settings } : {}),
        ...migrationPayload
      });
    }

    settings.oocTemplates = DS.normalizeOocTemplates(
      Array.isArray(result[DS.OOC_TEMPLATES_KEY])
        ? result[DS.OOC_TEMPLATES_KEY]
        : settings.oocTemplates
    );

    // v0.2.2: add the second built-in hard OOC exactly once. Existing OOC
    // entries are left byte-for-byte alone; in particular an edited first
    // default is never replaced with a newer canonical copy.
    if (result.oocHardPresetMigrationV022 !== true) {
      const templates = DS.normalizeOocTemplates(settings.oocTemplates);
      const hasHard = templates.some(item =>
        String(item?.id || "") === DS.HARD_OOC_TEMPLATE_ID ||
        String(item?.text || "").trim() === DS.HARD_OOC_TEMPLATE
      );
      if (!hasHard) {
        templates.push({
          id: DS.HARD_OOC_TEMPLATE_ID,
          name: "Hard no-control + formatting",
          text: DS.HARD_OOC_TEMPLATE,
          builtIn: true
        });
      }
      settings.oocTemplates = templates;
      await DS.storageSet({
        [DS.OOC_TEMPLATES_KEY]: templates,
        oocHardPresetMigrationV022: true
      });
    }

    const savedBlocked = result[DS.BLOCKED_BOTS_KEY] || {};
    const savedNotInterested = result[DS.NOT_INTERESTED_KEY] || {};
    const savedFavoriteBots = result[DS.FAVORITE_BOTS_KEY] || {};
    const savedLaterBots = result[DS.LATER_BOTS_KEY] || {};
    const savedBotOrganization = result[DS.BOT_ORGANIZER_KEY] || {};
    const savedChatOrganization = result[DS.CHAT_ORGANIZER_KEY] || {};
    const savedRecentlySeenBots = result[DS.RECENTLY_SEEN_BOTS_KEY] || {};

    // Keep the desired/persisted snapshot separate from the live settings.
    // v0.2.25 applies device compatibility only to the runtime copy: Android
    // keeps desktop-only preferences saved, but does not activate them.
    DS.state.persistedSettings = { ...settings };
    const runtimeSettings = DS.applyPlatformCompatibility(settings);
    DS.applyQolTabEnabledOverride?.(runtimeSettings);
    DS.state.settings = runtimeSettings;

    DS.state.openedChats = new Set(
      Array.isArray(result[DS.OPENED_KEY])
        ? result[DS.OPENED_KEY]
        : []
    );

    DS.state.openedChatMeta =
      result[DS.OPENED_META_KEY] && typeof result[DS.OPENED_META_KEY] === "object"
        ? result[DS.OPENED_META_KEY]
        : {};

    DS.state.rawBlockedBots = {
      ids: Array.isArray(savedBlocked.ids) ? [...savedBlocked.ids] : [],
      names: Array.isArray(savedBlocked.names) ? [...savedBlocked.names] : [],
      meta: savedBlocked.meta && typeof savedBlocked.meta === "object" ? savedBlocked.meta : {}
    };

    DS.state.blockedBots = {
      ids: DS.uniqueClean([
        ...(Array.isArray(settings.blockedBotIds)
          ? settings.blockedBotIds
          : []),

        ...(Array.isArray(savedBlocked.ids)
          ? savedBlocked.ids
          : [])
      ]),

      names: DS.uniqueClean([
        ...(Array.isArray(settings.blockedBotNames)
          ? settings.blockedBotNames
          : []),

        ...(Array.isArray(savedBlocked.names)
          ? savedBlocked.names
          : [])
      ]),
      meta: savedBlocked.meta && typeof savedBlocked.meta === "object"
        ? savedBlocked.meta
        : {}
    };

    DS.state.notInterestedBots = {
      ids: DS.uniqueClean(Array.isArray(savedNotInterested.ids) ? savedNotInterested.ids : []),
      meta: savedNotInterested.meta && typeof savedNotInterested.meta === "object"
        ? savedNotInterested.meta
        : {}
    };

    DS.state.favoriteCreators = typeof DS.normalizeCreatorStore === "function"
      ? DS.normalizeCreatorStore(result[DS.FAVORITE_CREATORS_KEY])
      : (result[DS.FAVORITE_CREATORS_KEY] || { handles: [], meta: {} });

    DS.state.followedCreators = typeof DS.normalizeFollowedCreatorStore === "function"
      ? DS.normalizeFollowedCreatorStore(result[DS.FOLLOWED_CREATORS_KEY])
      : (result[DS.FOLLOWED_CREATORS_KEY] || { handles: [], meta: {} });

    DS.state.favoriteBots = {
      ids: DS.uniqueClean(Array.isArray(savedFavoriteBots.ids) ? savedFavoriteBots.ids : []),
      meta: savedFavoriteBots.meta && typeof savedFavoriteBots.meta === "object"
        ? savedFavoriteBots.meta
        : {}
    };

    DS.state.laterBots = {
      ids: DS.uniqueClean(Array.isArray(savedLaterBots.ids) ? savedLaterBots.ids : []),
      meta: savedLaterBots.meta && typeof savedLaterBots.meta === "object"
        ? savedLaterBots.meta
        : {}
    };

    DS.state.botOrganization = {
      collections: DS.uniqueClean(Array.isArray(savedBotOrganization.collections) ? savedBotOrganization.collections : []),
      folderCovers: savedBotOrganization.folderCovers && typeof savedBotOrganization.folderCovers === "object" ? savedBotOrganization.folderCovers : {},
      folderScopes: savedBotOrganization.folderScopes && typeof savedBotOrganization.folderScopes === "object" ? savedBotOrganization.folderScopes : {},
      meta: savedBotOrganization.meta && typeof savedBotOrganization.meta === "object"
        ? savedBotOrganization.meta
        : {}
    };

    DS.state.chatOrganization = {
      meta: savedChatOrganization.meta && typeof savedChatOrganization.meta === "object"
        ? savedChatOrganization.meta
        : {}
    };

    DS.state.recentlySeenBots = {
      entries: Array.isArray(savedRecentlySeenBots.entries) ? savedRecentlySeenBots.entries : []
    };

    DS.state.characterQolProfiles = typeof DS.normalizeCharacterQolProfiles === "function"
      ? DS.normalizeCharacterQolProfiles(result[DS.CHARACTER_QOL_PROFILES_KEY])
      : (result[DS.CHARACTER_QOL_PROFILES_KEY] && typeof result[DS.CHARACTER_QOL_PROFILES_KEY] === "object"
        ? result[DS.CHARACTER_QOL_PROFILES_KEY]
        : {});

    const currentPersonas = Array.isArray(result[DS.PERSONAS_KEY])
      ? result[DS.PERSONAS_KEY]
      : [];

    const legacyPersonas = Array.isArray(result[DS.LEGACY_PERSONAS_KEY])
      ? result[DS.LEGACY_PERSONAS_KEY]
      : [];

    DS.state.savedPersonas = DS.cleanPersonas([
      ...currentPersonas,
      ...legacyPersonas
    ]);

    DS.refreshFastLookupCaches?.();
    await DS.enforceBlockedPriorityOverOpened?.();
  };

  function rebuildBlockedStateFromCache() {
    const raw = DS.state.rawBlockedBots || { ids: [], names: [], meta: {} };
    const settings = DS.state.settings || {};

    DS.state.blockedBots = {
      ids: DS.uniqueClean([
        ...(Array.isArray(settings.blockedBotIds) ? settings.blockedBotIds : []),
        ...(Array.isArray(raw.ids) ? raw.ids : [])
      ]),
      names: DS.uniqueClean([
        ...(Array.isArray(settings.blockedBotNames) ? settings.blockedBotNames : []),
        ...(Array.isArray(raw.names) ? raw.names : [])
      ]),
      meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {}
    };
  }

  // chrome.storage.onChanged already gives us the new values. Applying those
  // directly avoids rereading every large saved list after a small setting
  // change, which is especially noticeable on Android/WebView installs.
  DS.applyStorageChanges = function applyStorageChanges(changes = {}) {
    let refreshLookups = false;
    let cardFilterStateChanged = false;

    const granularSettings = Object.entries(changes || {})
      .map(([storageKey, change]) => [DS.settingNameFromStorageKey(storageKey), change])
      .filter(([name]) => !!name);

    if (changes.settings) {
      const rawSettings = changes.settings.newValue || {};
      const normalizedSettings = { ...rawSettings };
      if (!("quickDislikeIdleEnabled" in normalizedSettings)) {
        normalizedSettings.quickDislikeIdleEnabled = !!normalizedSettings.quickDislikeOnBlock;
      }
      normalizedSettings.quickDislikeOnBlock = false;
      const persisted = { ...DS.DEFAULT_SETTINGS, ...normalizedSettings };
      DS.state.persistedSettings = persisted;
      DS.state.globalEnabledSetting = persisted.enabled !== false;
      const next = DS.applyPlatformCompatibility(persisted);
      DS.applyQolTabEnabledOverride?.(next);
      DS.state.settings = next;
      DS.state.settings.oocTemplates = DS.normalizeOocTemplates(
        changes[DS.OOC_TEMPLATES_KEY]?.newValue ?? rawSettings.oocTemplates ?? DS.state.settings.oocTemplates
      );
      rebuildBlockedStateFromCache();
      refreshLookups = true;
      cardFilterStateChanged = true;
    } else if (granularSettings.length) {
      const persisted = { ...(DS.state.persistedSettings || DS.DEFAULT_SETTINGS) };
      for (const [name, change] of granularSettings) {
        persisted[name] = change?.newValue === undefined ? DS.DEFAULT_SETTINGS[name] : change.newValue;
        DS.state.settingsIndex.add(name);
      }
      if (!("quickDislikeIdleEnabled" in persisted)) persisted.quickDislikeIdleEnabled = !!persisted.quickDislikeOnBlock;
      persisted.quickDislikeOnBlock = false;
      DS.state.persistedSettings = persisted;
      DS.state.globalEnabledSetting = persisted.enabled !== false;
      const next = DS.applyPlatformCompatibility(persisted);
      DS.applyQolTabEnabledOverride?.(next);
      DS.state.settings = next;
      rebuildBlockedStateFromCache();
      refreshLookups = true;
      cardFilterStateChanged = true;
    }

    if (changes[DS.OOC_TEMPLATES_KEY] && !changes.settings) {
      DS.state.settings.oocTemplates = DS.normalizeOocTemplates(changes[DS.OOC_TEMPLATES_KEY].newValue);
    }

    if (changes[DS.OPENED_KEY]) {
      DS.state.openedChats = new Set(Array.isArray(changes[DS.OPENED_KEY].newValue) ? changes[DS.OPENED_KEY].newValue : []);
      cardFilterStateChanged = true;
    }

    if (changes[DS.OPENED_META_KEY]) {
      const next = changes[DS.OPENED_META_KEY].newValue;
      DS.state.openedChatMeta = next && typeof next === "object" ? next : {};
    }

    if (changes[DS.BLOCKED_BOTS_KEY]) {
      const next = changes[DS.BLOCKED_BOTS_KEY].newValue || {};
      DS.state.rawBlockedBots = {
        ids: Array.isArray(next.ids) ? [...next.ids] : [],
        names: Array.isArray(next.names) ? [...next.names] : [],
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
      rebuildBlockedStateFromCache();
      refreshLookups = true;
      cardFilterStateChanged = true;
    }

    if (changes[DS.NOT_INTERESTED_KEY]) {
      const next = changes[DS.NOT_INTERESTED_KEY].newValue || {};
      DS.state.notInterestedBots = {
        ids: DS.uniqueClean(Array.isArray(next.ids) ? next.ids : []),
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
      refreshLookups = true;
      cardFilterStateChanged = true;
    }

    if (changes[DS.FAVORITE_CREATORS_KEY]) {
      const next = changes[DS.FAVORITE_CREATORS_KEY].newValue || {};
      DS.state.favoriteCreators = typeof DS.normalizeCreatorStore === "function"
        ? DS.normalizeCreatorStore(next)
        : {
            handles: DS.uniqueClean(Array.isArray(next.handles) ? next.handles : []),
            meta: next.meta && typeof next.meta === "object" ? next.meta : {}
          };
      cardFilterStateChanged = true;
    }

    if (changes[DS.FOLLOWED_CREATORS_KEY]) {
      const next = changes[DS.FOLLOWED_CREATORS_KEY].newValue || {};
      DS.state.followedCreators = {
        handles: DS.uniqueClean(Array.isArray(next.handles) ? next.handles : []),
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
    }

    if (changes[DS.FAVORITE_BOTS_KEY]) {
      const next = changes[DS.FAVORITE_BOTS_KEY].newValue || {};
      DS.state.favoriteBots = {
        ids: DS.uniqueClean(Array.isArray(next.ids) ? next.ids : []),
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
      refreshLookups = true;
      cardFilterStateChanged = true;
    }

    if (changes[DS.LATER_BOTS_KEY]) {
      const next = changes[DS.LATER_BOTS_KEY].newValue || {};
      DS.state.laterBots = {
        ids: DS.uniqueClean(Array.isArray(next.ids) ? next.ids : []),
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
      refreshLookups = true;
      cardFilterStateChanged = true;
    }

    if (changes[DS.BOT_ORGANIZER_KEY]) {
      const next = changes[DS.BOT_ORGANIZER_KEY].newValue || {};
      DS.state.botOrganization = {
        collections: DS.uniqueClean(Array.isArray(next.collections) ? next.collections : []),
        folderCovers: next.folderCovers && typeof next.folderCovers === "object" ? next.folderCovers : {},
        folderScopes: next.folderScopes && typeof next.folderScopes === "object" ? next.folderScopes : {},
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
    }

    if (changes[DS.CHAT_ORGANIZER_KEY]) {
      const next = changes[DS.CHAT_ORGANIZER_KEY].newValue || {};
      DS.state.chatOrganization = {
        meta: next.meta && typeof next.meta === "object" ? next.meta : {}
      };
      DS.updateQuickPanel?.();
    }

    if (changes[DS.RECENTLY_SEEN_BOTS_KEY]) {
      const next = changes[DS.RECENTLY_SEEN_BOTS_KEY].newValue || {};
      DS.state.recentlySeenBots = {
        entries: Array.isArray(next.entries) ? next.entries : []
      };
      cardFilterStateChanged = true;
    }

    if (changes[DS.CHARACTER_QOL_PROFILES_KEY]) {
      const next = changes[DS.CHARACTER_QOL_PROFILES_KEY].newValue || {};
      DS.state.characterQolProfiles = typeof DS.normalizeCharacterQolProfiles === "function"
        ? DS.normalizeCharacterQolProfiles(next)
        : (next && typeof next === "object" ? next : {});
    }

    if (changes[DS.PERSONAS_KEY] || changes[DS.LEGACY_PERSONAS_KEY]) {
      const current = changes[DS.PERSONAS_KEY]
        ? (Array.isArray(changes[DS.PERSONAS_KEY].newValue) ? changes[DS.PERSONAS_KEY].newValue : [])
        : DS.state.savedPersonas;
      const legacy = changes[DS.LEGACY_PERSONAS_KEY]
        ? (Array.isArray(changes[DS.LEGACY_PERSONAS_KEY].newValue) ? changes[DS.LEGACY_PERSONAS_KEY].newValue : [])
        : [];
      DS.state.savedPersonas = DS.cleanPersonas([...(current || []), ...legacy]);
    }

    if (refreshLookups) DS.refreshFastLookupCaches?.();
    if (cardFilterStateChanged) DS.bumpCardFilterStateRevision?.();

    // Opened-history writes are already filtered at capture time and during
    // state load. Re-running the full blocked-vs-opened sweep for every opened
    // metadata write becomes very expensive with thousands of records.
    if (changes[DS.BLOCKED_BOTS_KEY] || changes.settings || granularSettings.length) {
      DS.enforceBlockedPriorityOverOpened?.().catch?.(() => {});
    }
  };

  // Shared store writers live in core-storage-writers.js.
})();

}
