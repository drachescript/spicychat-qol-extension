(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS || window.__dsQolRuntimeImprovements) return;
  window.__dsQolRuntimeImprovements = true;

  const GENERIC_NAMES = new Set([
    "unknown", "unknown bot", "unknown character", "chatbot", "character", "bot", "for you", "recommended for you",
    "chatbot under review", "character under review", "under review", "view chatbot", "open chatbot",
    "private chatbot", "deleted chatbot", "not available", "unavailable"
  ]);
  const clean = value => String(value || "").replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  const isGenericName = (value, id = "") => {
    const text = clean(value).toLowerCase();
    return !text || text === String(id || "").toLowerCase() || GENERIC_NAMES.has(text) || /^(?:for you|recommended for you|chatbot under review|character under review|unknown (?:bot|character))(?:\b|[.!…])/i.test(text);
  };
  const cleanDisplayName = (value, id = "") => {
    let text = typeof DS.normalizeTextForDisplay === "function" ? DS.normalizeTextForDisplay(value) : clean(value);
    text = clean(text);
    if (isGenericName(text, id)) return "";
    const keepSeparator = token => /^(?:\||\/|[-–—]|[x×])$/i.test(token);
    const ornamentOnly = token => /^(?:୨୧|[⏝⟡⁀➴ೃ࿔̊☾✦★☆♡♥ღ༄࿐])+$/u.test(token);
    text = text.split(/\s+/).filter(token => {
      if (ornamentOnly(token)) return false;
      if (/[\p{L}\p{N}]/u.test(token)) return true;
      return keepSeparator(token);
    }).join(" ")
      .replace(/^(?:\||\/|[-–—]|[x×])\s+/i, "")
      .replace(/\s+(?:\||\/|[-–—]|[x×])$/i, "")
      .replace(/(?:\s+\|){2,}/g, " |")
      .replace(/\s+/g, " ")
      .trim();
    return isGenericName(text, id) ? "" : text.slice(0, 180);
  };

  DS.cleanBotDisplayName = cleanDisplayName;

  // Keep stored raw metadata intact, but stop generic UI badges / decorative wrappers
  // from winning over an actual character title when new card metadata is captured.
  const originalGetCardTitle = DS.getCardTitle?.bind(DS);
  if (originalGetCardTitle) {
    DS.getCardTitle = function improvedGetCardTitle(card) {
      const title = cleanDisplayName(originalGetCardTitle(card));
      if (title) return title;
      const candidates = [...(card?.querySelectorAll?.("h1,h2,h3,[data-testid*='name'],[data-testid*='title'],p,span") || [])];
      for (const el of candidates) {
        const value = cleanDisplayName(el.textContent || "");
        if (value) return value;
      }
      return "";
    };
  }
  const originalMakeBotMeta = DS.makeBotMeta?.bind(DS);
  if (originalMakeBotMeta) {
    DS.makeBotMeta = function improvedMakeBotMeta(input = {}) {
      const meta = originalMakeBotMeta(input) || {};
      const id = clean(input.id || meta.id);
      return {
        ...meta,
        id,
        name: cleanDisplayName(input.name || meta.name, id) || cleanDisplayName(meta.name, id) || "",
        profileUrl: id ? `${location.origin}/chatbot/${id}` : clean(meta.profileUrl)
      };
    };
  }

  function lessLikeAfterBlock(meta = {}) {
    const settings = DS.state?.settings || {};
    if (!settings.quickLessLikeOnBlock) return;
    const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
    if (env.android || window.innerWidth <= 760) return;
    const id = clean(meta.id || meta.botId).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
    chrome.runtime.sendMessage({
      type: "DS_QUICK_LESS_LIKE_BOT",
      botId: id,
      botName: cleanDisplayName(meta.name || meta.botName, id) || "",
      source: "block-opt-in"
    }).catch?.(() => null);
  }

  const originalBlockCurrent = DS.blockCurrentBot?.bind(DS);
  if (originalBlockCurrent) {
    DS.blockCurrentBot = async function blockCurrentBotWithLessLike(...args) {
      const result = await originalBlockCurrent(...args);
      if (result?.ok && result?.id) lessLikeAfterBlock(result);
      return result;
    };
  }
  const originalBlockCard = DS.blockBotFromCard?.bind(DS);
  if (originalBlockCard) {
    DS.blockBotFromCard = async function blockBotFromCardWithLessLike(card, anchor, ...args) {
      const id = DS.botIdFromHref?.(anchor?.href || "") || DS.chatIdFromHref?.(anchor?.href || "") || "";
      const meta = DS.makeBotMeta?.({ id, card, anchor }) || { id };
      const result = await originalBlockCard(card, anchor, ...args);
      if (id && DS.state?.blockedBotIdSet?.has?.(id)) lessLikeAfterBlock(meta);
      return result;
    };
  }

  // Feed Bot Status Center from ordinary browsing too. This is a compact metadata
  // index, not chat history: only id/name/creator/image/profile URL + last seen time.
  const BROWSE_STATUS_KEY = "botDiscoveryIndexV1";
  const browseSeenThisSession = new Map();
  let browseSaveTimer = 0;
  let pendingBrowse = new Map();

  function storageGetLocal(keys) {
    return new Promise(resolve => {
      try { chrome.storage.local.get(keys, result => resolve(chrome.runtime.lastError ? {} : (result || {}))); }
      catch { resolve({}); }
    });
  }
  function storageSetLocal(value) {
    return new Promise(resolve => {
      try { chrome.storage.local.set(value, () => resolve(!chrome.runtime.lastError)); }
      catch { resolve(false); }
    });
  }
  function cardCreator(card) {
    const link = card?.querySelector?.("a[href*='/creator/']");
    const visible = clean(link?.textContent || "");
    if (visible) return visible.startsWith("@") ? visible : `@${visible}`;
    try {
      const handle = new URL(link?.href || "", location.origin).pathname.match(/^\/creator\/([^/?#]+)/i)?.[1] || "";
      return handle ? `@${decodeURIComponent(handle)}` : "";
    } catch { return ""; }
  }
  function browseCardSnapshot(card, anchor) {
    const href = String(anchor?.href || "");
    const id = clean(DS.botIdFromHref?.(href) || DS.chatIdFromHref?.(href) || "").toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    const name = cleanDisplayName(DS.getCardTitle?.(card) || "", id);
    const image = clean(DS.getCardImageUrl?.(card) || card?.querySelector?.("img")?.currentSrc || card?.querySelector?.("img")?.src || "");
    return { id, name, creator: cardCreator(card), image, profileUrl: `${location.origin}/chatbot/${id}`, lastSeenAt: Date.now() };
  }
  function queueBrowseSave(snapshot) {
    if (!snapshot?.id) return;
    const fingerprint = `${snapshot.name}|${snapshot.creator}|${snapshot.image}`;
    const previous = browseSeenThisSession.get(snapshot.id);
    if (previous === fingerprint) return;
    browseSeenThisSession.set(snapshot.id, fingerprint);
    pendingBrowse.set(snapshot.id, snapshot);
    clearTimeout(browseSaveTimer);
    browseSaveTimer = setTimeout(flushBrowseDiscoveries, 900);
  }
  async function flushBrowseDiscoveries() {
    browseSaveTimer = 0;
    const updates = [...pendingBrowse.values()];
    pendingBrowse.clear();
    if (!updates.length) return;
    const stored = await storageGetLocal([BROWSE_STATUS_KEY]);
    const source = stored[BROWSE_STATUS_KEY] && typeof stored[BROWSE_STATUS_KEY] === "object" ? stored[BROWSE_STATUS_KEY] : {};
    const meta = source.meta && typeof source.meta === "object" ? { ...source.meta } : { ...source };
    let changed = false;
    for (const item of updates) {
      const existing = meta[item.id] && typeof meta[item.id] === "object" ? meta[item.id] : {};
      const oldName = cleanDisplayName(existing.name || "", item.id);
      const nextName = item.name || oldName || "";
      const next = {
        ...existing,
        id: item.id,
        name: nextName,
        creator: clean(existing.creator || item.creator || "") || item.creator || "",
        image: clean(existing.image || item.image || "") || item.image || "",
        profileUrl: `${location.origin}/chatbot/${item.id}`,
        chatUrl: clean(existing.chatUrl || "") || `${location.origin}/chat/${item.id}`,
        lastSeenAt: item.lastSeenAt
      };
      const oldFingerprint = `${oldName}|${clean(existing.creator)}|${clean(existing.image)}|${clean(existing.profileUrl)}`;
      const newFingerprint = `${nextName}|${next.creator}|${next.image}|${next.profileUrl}`;
      if (oldFingerprint !== newFingerprint || Date.now() - Number(existing.lastSeenAt || 0) > 30 * 60 * 1000) {
        meta[item.id] = next;
        changed = true;
      }
    }
    if (!changed) return;

    // The discovery index is intentionally bounded and derived. Full status
    // history lives in Bot Status Center's separate availability store.
    const rows = Object.values(meta).sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0));
    for (const row of rows.slice(2500)) delete meta[row.id];
    await storageSetLocal({ [BROWSE_STATUS_KEY]: { meta } });
  }
  function discoverVisibleCards() {
    const params = new URLSearchParams(location.search || "");
    const isWorker = document.documentElement.hasAttribute("data-ds-qol-background-worker") ||
      [...params.keys()].some(key => /^ds(?:Qol)?(?:ListingRefill|Quick|BotStatus|Recommendation|LessLike)/i.test(key));
    if (document.hidden || isWorker || DS.state?.quickLessLikeWorker || DS.state?.quickDislikeWorker || DS.state?.botStatusWorker) return;
    const cards = DS.collectCards?.() || [];
    for (const item of cards.slice(0, 160)) {
      const snapshot = browseCardSnapshot(item.card, item.anchor);
      if (snapshot) queueBrowseSave(snapshot);
    }
  }
  setInterval(discoverVisibleCards, 5000);
  setTimeout(discoverVisibleCards, 1800);

  // Adaptive long-chat escalation. The existing performance-mode file does the
  // rendering/window work; this watcher decides when to force its strongest tier.
  // v0.2.28 deliberately never reloads the page on its own. A disruptive recovery
  // action must stay user initiated (the long-chat control already exposes Refresh chat).
  const AUTO_TIER_DATASET = "dsQolAutoPerformanceTier";
  const HEAP_SOFT = 700 * 1024 * 1024;
  const HEAP_HARD = 900 * 1024 * 1024;
  const STARTUP_QUIET_MS = 8000;
  let baselineTier = "";
  let escalated = false;
  let clearPasses = 0;
  let performanceRouteKey = "";
  let escalatedRouteKey = "";
  const longTasks = [];

  function routeKey() {
    return `${location.pathname || ""}${location.search || ""}`;
  }

  function startChatStartupQuiet(reason = "route") {
    if (!DS.isSingleChatPage?.()) return;
    const now = Date.now();
    DS.state = DS.state || {};
    DS.state.chatStartupQuietRoute = routeKey();
    DS.state.chatStartupQuietStartedAt = now;
    DS.state.chatStartupQuietUntil = now + STARTUP_QUIET_MS;
    DS.state.chatStartupLastMessageMutationAt = now;
    DS.runtimeLog?.("info", "performance", `Chat startup quiet window started (${reason})`, {
      route: DS.state.chatStartupQuietRoute,
      quietMs: STARTUP_QUIET_MS
    });
  }

  function resetPerformancePressure(reason = "route") {
    const nextRoute = routeKey();
    if (escalated && escalatedRouteKey && escalatedRouteKey !== nextRoute) {
      DS.state.settings.runtimePerformanceMode = baselineTier || DS.state.settings.runtimePerformanceMode || "adaptive";
      escalated = false;
      escalatedRouteKey = "";
      document.documentElement.removeAttribute("data-ds-qol-auto-performance-tier");
      DS.state.performanceModeRevision = -1;
    }
    longTasks.length = 0;
    clearPasses = 0;
    performanceRouteKey = nextRoute;
    document.documentElement.removeAttribute("data-ds-qol-severe-chat-lag");
    if (DS.isSingleChatPage?.()) startChatStartupQuiet(reason);
  }

  try {
    new PerformanceObserver(list => {
      const now = performance.now();
      for (const entry of list.getEntries()) longTasks.push({ at: now, duration: Number(entry.duration || 0) });
      while (longTasks.length && now - longTasks[0].at > 30000) longTasks.shift();
    }).observe({ type: "longtask", buffered: true });
  } catch {}

  function metricSnapshot() {
    const mounted = document.querySelectorAll("[id^='message-']").length;
    const dom = document.getElementsByTagName("*").length;
    const heap = Number(performance?.memory?.usedJSHeapSize || 0);
    const recent = longTasks.filter(item => performance.now() - item.at <= 30000);
    const longTaskMs = recent.reduce((sum, item) => sum + item.duration, 0);
    const severeTasks = recent.filter(item => item.duration >= 500).length;
    return { mounted, dom, heap, longTaskMs, severeTasks };
  }

  function softReasons(m) {
    const out = [];
    if (m.mounted >= 300) out.push("mounted");
    if (m.dom >= 15000) out.push("dom");
    if (m.heap >= HEAP_SOFT) out.push("heap");
    if (m.longTaskMs >= 2500 || m.severeTasks >= 3) out.push("longtasks");
    return out;
  }

  function hardReasons(m) {
    const out = [];
    if (m.mounted >= 500) out.push("mounted");
    if (m.dom >= 22000) out.push("dom");
    if (m.heap >= HEAP_HARD) out.push("heap");
    if (m.longTaskMs >= 5000 || m.severeTasks >= 5) out.push("longtasks");
    return out;
  }

  function hasRealScalePressure(m) {
    return m.mounted >= 300 || m.dom >= 12000 || m.heap >= HEAP_SOFT;
  }

  function hasSustainedLag(m) {
    return m.longTaskMs >= 5000 || m.severeTasks >= 5;
  }

  function formatMetrics(m) {
    return `mounted=${m.mounted}, DOM=${m.dom}, heap=${m.heap ? `${Math.round(m.heap / 1048576)}MB` : "n/a"}, longTask30s=${Math.round(m.longTaskMs)}ms`;
  }

  function startupQuietActive() {
    if (!DS.isSingleChatPage?.()) return false;
    const now = Date.now();
    const until = Number(DS.state?.chatStartupQuietUntil || 0);
    if (!until || now >= until) return false;
    return true;
  }

  function evaluatePerformance() {
    const currentRoute = routeKey();
    if (currentRoute !== performanceRouteKey) {
      resetPerformancePressure("route-change");
      return;
    }

    // Initial history mounting is expected to be bursty. Do not feed those
    // Long Tasks into automatic escalation; main.js also defers nonessential
    // QoL work during the same quiet window.
    if (startupQuietActive()) {
      longTasks.length = 0;
      return;
    }

    if (!DS.isSingleChatPage?.() || !DS.state?.settings?.enabled || !DS.state?.settings?.chatPerformanceMode) {
      document.documentElement.removeAttribute("data-ds-qol-severe-chat-lag");
      if (escalated) {
        DS.state.settings.runtimePerformanceMode = baselineTier || DS.state.settings.runtimePerformanceMode;
        escalated = false;
        escalatedRouteKey = "";
        document.documentElement.removeAttribute(`data-${AUTO_TIER_DATASET.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`);
        DS.state.performanceModeRevision = -1;
        DS.applyPerformanceMode?.();
      }
      return;
    }

    const m = metricSnapshot();
    const reasons = softReasons(m);
    const hard = hardReasons(m);
    const severeScaledLag = hasRealScalePressure(m) && hasSustainedLag(m);

    if (reasons.length) {
      clearPasses = 0;
      if (!escalated) {
        baselineTier = String(DS.state.settings.runtimePerformanceMode || "adaptive");
        DS.state.settings.runtimePerformanceMode = "maximum";
        escalated = true;
        escalatedRouteKey = currentRoute;
        document.documentElement.dataset.dsQolAutoPerformanceTier = "maximum";
        DS.state.performanceModeRevision = -1;
        DS.applyPerformanceMode?.();
        console.info(`[SpicyChat QoL] chat performance escalated: ${formatMetrics(m)}, reason=${reasons.join("+")}`);
      }
    } else if (escalated) {
      // Do not flap Maximum -> lower tier -> Maximum in the same chat. The old
      // behavior repeatedly rewrote message classes during exactly the periods
      // where SpicyChat was already struggling. Maximum now remains sticky for
      // this route and is restored to the user's baseline only after changing chats.
      clearPasses += 1;
    }

    // Never call location.reload() here. Only flag genuinely large + sustained
    // lag so diagnostics can explain why Maximum mode was chosen. Once Maximum
    // mode is active, its long-chat strip exposes the existing user-controlled
    // Refresh chat action (with draft preservation).
    if (severeScaledLag) {
      document.documentElement.setAttribute("data-ds-qol-severe-chat-lag", "1");
      if (!DS.state?.lastSevereChatLagLogAt || Date.now() - Number(DS.state.lastSevereChatLagLogAt) > 30000) {
        DS.state.lastSevereChatLagLogAt = Date.now();
        const detail = `Maximum mode is active and reload remains user-controlled: ${formatMetrics(m)}, reason=${hard.join("+") || reasons.join("+")}`;
        DS.runtimeLog?.("info", "performance", "Severe chat lag detected", { detail });
        console.info(`[SpicyChat QoL] severe chat lag detected; ${detail}`);
      }
    } else {
      document.documentElement.removeAttribute("data-ds-qol-severe-chat-lag");
    }
  }

  resetPerformancePressure("startup");
  setInterval(evaluatePerformance, 5000);
  setTimeout(evaluatePerformance, 2500);
})();

/* BEGIN BOT METADATA RECOVERY CAPTURE */
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS || DS.__botMetadataRecoveryCaptureLoaded) return;
  DS.__botMetadataRecoveryCaptureLoaded = true;

  const KEY = "botDiscoveryIndexV1";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const GENERIC = new Set([
    "unknown", "unknown bot", "unknown character", "chatbot", "character", "bot",
    "for you", "recommended for you", "chatbot under review", "character under review",
    "under review", "private chatbot", "deleted chatbot", "unavailable", "not available",
    "404", "404 not found", "not found", "page not found", "error", "error loading chatbot"
  ]);
  const clean = value => String(value || "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/\s+/g, " ").trim();

  function goodName(value, id = "") {
    let text = clean(value);
    if (!text) return "";
    const lower = text.toLowerCase();
    if (lower === String(id || "").toLowerCase() || GENERIC.has(lower)) return "";
    if (/^(?:for you|recommended for you|chatbot under review|character under review|404(?: not found)?|not found|page not found)(?:\b|[.!…])/i.test(text)) return "";
    text = text
      .replace(/^chat with\s+/i, "")
      .replace(/\s+(?:on|[-–—]\s*)spicychat(?:\.ai)?\s*$/i, "")
      .trim();
    return text && !GENERIC.has(text.toLowerCase()) ? text.slice(0, 180) : "";
  }

  function currentBotId() {
    const match = String(location.pathname || "").match(/^\/(?:chatbot|chat)\/([0-9a-f-]{36})(?:\/|$)/i);
    const id = String(match?.[1] || "").toLowerCase();
    return UUID_RE.test(id) ? id : "";
  }

  function metaContent(selector) {
    return clean(document.querySelector(selector)?.getAttribute?.("content") || "");
  }

  function parseJsonLdName(id) {
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const value = JSON.parse(node.textContent || "{}");
        const rows = Array.isArray(value) ? value : [value];
        for (const row of rows) {
          const name = goodName(row?.name, id);
          if (name) return name;
        }
      } catch {}
    }
    return "";
  }

  function visibleName(id) {
    const candidates = [
      document.querySelector("main h1"),
      document.querySelector("main h2"),
      document.querySelector("header h1"),
      document.querySelector("header h2"),
      document.querySelector("[data-testid*='character-name' i]"),
      document.querySelector("[data-testid*='chatbot-name' i]")
    ].filter(Boolean);
    for (const node of candidates) {
      const name = goodName(node.textContent, id);
      if (name) return name;
    }

    const og = goodName(metaContent('meta[property="og:title"]'), id);
    if (og) return og;
    const title = goodName(document.title, id);
    if (title) return title;
    return parseJsonLdName(id);
  }

  function currentCreator() {
    const anchor = document.querySelector("a[href*='/creator/']");
    const visible = clean(anchor?.textContent || "").replace(/^@/, "");
    if (visible) return visible;
    try {
      const slug = new URL(anchor?.href || "", location.origin).pathname.match(/^\/creator\/([^/?#]+)/i)?.[1] || "";
      return slug ? decodeURIComponent(slug) : "";
    } catch { return ""; }
  }

  function currentImage() {
    const og = metaContent('meta[property="og:image"]');
    if (og) return og;
    const image = document.querySelector("main img[src*='cdn.nd-api.com'], header img[src*='cdn.nd-api.com']");
    return clean(image?.currentSrc || image?.src || "");
  }

  function currentDescription() {
    const og = metaContent('meta[property="og:description"]');
    if (og && !/spicychat/i.test(og.replace(/AI chatbot/ig, ""))) return og.slice(0, 1200);
    return clean(metaContent('meta[name="description"]')).slice(0, 1200);
  }

  function getLocal(keys) {
    return new Promise(resolve => {
      try { chrome.storage.local.get(keys, value => resolve(chrome.runtime.lastError ? {} : (value || {}))); }
      catch { resolve({}); }
    });
  }

  function setLocal(value) {
    return new Promise(resolve => {
      try { chrome.storage.local.set(value, () => resolve(!chrome.runtime.lastError)); }
      catch { resolve(false); }
    });
  }

  async function captureCurrentPage() {
    const id = currentBotId();
    if (!id) return;

    const name = visibleName(id);
    const creator = currentCreator();
    const image = currentImage();
    const description = currentDescription();
    if (!name && !creator && !image && !description) return;

    const stored = await getLocal([KEY]);
    const source = stored[KEY] && typeof stored[KEY] === "object" ? stored[KEY] : {};
    const meta = source.meta && typeof source.meta === "object" ? { ...source.meta } : { ...source };
    const previous = meta[id] && typeof meta[id] === "object" ? meta[id] : {};

    // Quality-aware merge: a blank/error/placeholder value never replaces good
    // historical metadata. A real value from a rendered chat/profile may repair
    // a bad old record.
    const previousName = goodName(previous.name, id);
    const next = {
      ...previous,
      id,
      name: name || previousName || "",
      creator: creator || clean(previous.creator),
      image: image || clean(previous.image),
      description: description || clean(previous.description),
      profileUrl: `${location.origin}/chatbot/${id}`,
      chatUrl: /^\/chat\//i.test(location.pathname || "")
        ? `${location.origin}${location.pathname}`
        : clean(previous.chatUrl),
      lastSeenAt: Date.now(),
      source: /^\/chatbot\//i.test(location.pathname || "") ? "profile" : "chat"
    };

    const before = JSON.stringify({
      name: previousName,
      creator: clean(previous.creator),
      image: clean(previous.image),
      description: clean(previous.description),
      profileUrl: clean(previous.profileUrl),
      chatUrl: clean(previous.chatUrl)
    });
    const after = JSON.stringify({
      name: next.name,
      creator: next.creator,
      image: next.image,
      description: next.description,
      profileUrl: next.profileUrl,
      chatUrl: next.chatUrl
    });
    if (before === after && Date.now() - Number(previous.lastSeenAt || 0) < 30 * 60 * 1000) return;

    meta[id] = next;
    const rows = Object.values(meta).sort((a, b) => Number(b?.lastSeenAt || 0) - Number(a?.lastSeenAt || 0));
    for (const row of rows.slice(2500)) {
      const rowId = clean(row?.id).toLowerCase();
      if (rowId && rowId !== id) delete meta[rowId];
    }
    await setLocal({ [KEY]: { meta } });
  }

  let routeTimer = 0;
  const schedule = (delay = 300) => {
    clearTimeout(routeTimer);
    routeTimer = setTimeout(() => captureCurrentPage().catch(() => {}), delay);
  };

  schedule(700);
  setTimeout(() => schedule(0), 2400);
  window.addEventListener("popstate", () => schedule(350), true);
  window.addEventListener("pageshow", () => schedule(300), true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule(250);
  }, true);
  document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("a[href]")) schedule(650);
  }, true);
})();
/* END BOT METADATA RECOVERY CAPTURE */
