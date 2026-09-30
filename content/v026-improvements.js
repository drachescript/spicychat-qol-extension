(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS || window.__dsQolV026Improvements) return;
  window.__dsQolV026Improvements = true;

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
    DS.getCardTitle = function v026GetCardTitle(card) {
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
    DS.makeBotMeta = function v026MakeBotMeta(input = {}) {
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
    DS.blockCurrentBot = async function v026BlockCurrentBot(...args) {
      const result = await originalBlockCurrent(...args);
      if (result?.ok && result?.id) lessLikeAfterBlock(result);
      return result;
    };
  }
  const originalBlockCard = DS.blockBotFromCard?.bind(DS);
  if (originalBlockCard) {
    DS.blockBotFromCard = async function v026BlockBotFromCard(card, anchor, ...args) {
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
  const AUTO_TIER_DATASET = "dsQolAutoPerformanceTier";
  const HEAP_SOFT = 700 * 1024 * 1024;
  const HEAP_HARD = 900 * 1024 * 1024;
  let baselineTier = "";
  let escalated = false;
  let clearPasses = 0;
  let lastHardRefresh = 0;
  const longTasks = [];
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
  function formatMetrics(m) {
    return `mounted=${m.mounted}, DOM=${m.dom}, heap=${m.heap ? `${Math.round(m.heap / 1048576)}MB` : "n/a"}, longTask30s=${Math.round(m.longTaskMs)}ms`;
  }
  function generationActive() {
    return [...document.querySelectorAll("button")].some(button => /stop\s+(generating|generation|reply)|cancel\s+generation/i.test(`${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.textContent || ""}`));
  }
  function nearBottom() {
    const root = document.scrollingElement || document.documentElement;
    return root.scrollHeight - (root.scrollTop + innerHeight) < 1000;
  }
  function composer() {
    return [...document.querySelectorAll("textarea,[contenteditable='true']")].find(el => !el.closest?.("[id^='message-'],#ds-qol-panel,#ds-chat-export-modal") && el.getClientRects?.().length) || null;
  }
  function composerText(el) {
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? String(el.value || "") : String(el?.textContent || "");
  }
  function emergencyRefresh(m, reasons) {
    if (!nearBottom() || generationActive() || Date.now() - lastHardRefresh < 120000) return false;
    lastHardRefresh = Date.now();
    try {
      sessionStorage.setItem("dsQolPerformanceReloadV1", JSON.stringify({ routeKey: `${location.pathname || ""}${location.search || ""}`, draft: composerText(composer()), at: Date.now(), scrollBottom: true }));
      sessionStorage.setItem("dsQolPerformanceEmergencyReloadAtV1", String(Date.now()));
    } catch {}
    console.warn(`[SpicyChat QoL] chat performance emergency refresh: ${formatMetrics(m)}, reason=${reasons.join("+")}`);
    location.reload();
    return true;
  }
  function evaluatePerformance() {
    if (!DS.isSingleChatPage?.() || !DS.state?.settings?.enabled || !DS.state?.settings?.chatPerformanceMode) {
      if (escalated) {
        DS.state.settings.runtimePerformanceMode = baselineTier || DS.state.settings.runtimePerformanceMode;
        escalated = false;
        document.documentElement.removeAttribute(`data-${AUTO_TIER_DATASET.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`);
        DS.state.performanceModeRevision = -1;
        DS.applyPerformanceMode?.();
      }
      return;
    }
    const m = metricSnapshot();
    const reasons = softReasons(m);
    const hard = hardReasons(m);
    if (hard.length && emergencyRefresh(m, hard)) return;
    if (reasons.length) {
      clearPasses = 0;
      if (!escalated) {
        baselineTier = String(DS.state.settings.runtimePerformanceMode || "adaptive");
        DS.state.settings.runtimePerformanceMode = "maximum";
        escalated = true;
        document.documentElement.dataset.dsQolAutoPerformanceTier = "maximum";
        DS.state.performanceModeRevision = -1;
        DS.applyPerformanceMode?.();
        console.info(`[SpicyChat QoL] chat performance escalated: ${formatMetrics(m)}, reason=${reasons.join("+")}`);
      }
    } else if (escalated) {
      clearPasses += 1;
      if (clearPasses >= 3 && m.mounted < 220 && m.dom < 11000 && (!m.heap || m.heap < 500 * 1024 * 1024) && m.longTaskMs < 900) {
        DS.state.settings.runtimePerformanceMode = baselineTier || "adaptive";
        escalated = false;
        clearPasses = 0;
        document.documentElement.removeAttribute("data-ds-qol-auto-performance-tier");
        DS.state.performanceModeRevision = -1;
        DS.applyPerformanceMode?.();
        console.info(`[SpicyChat QoL] chat performance de-escalated: ${formatMetrics(m)}`);
      }
    }
  }
  setInterval(evaluatePerformance, 5000);
  setTimeout(evaluatePerformance, 2500);
})();
