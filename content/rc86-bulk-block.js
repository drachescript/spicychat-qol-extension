(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || DS.__rc86BulkBlockLoaded) return;
  DS.__rc86BulkBlockLoaded = true;

  const TOOLBAR_ID = "ds-bulk-block-toolbar";
  const CARD_SELECT_CLASS = "ds-bulk-block-select";
  const SELECTED_CLASS = "ds-bulk-block-selected";
  const STYLE_ID = "ds-rc86-bulk-block-style";
  const HEADER_HOST_ID = "ds-listing-qol-controls";
  const BOT_LINK_RE = /\/(?:chat|chatbot)\/([0-9a-f-]{20,})(?:[/?#]|$)/i;
  const DEFAULT_IDLE_MINUTES = 5;
  const MIN_IDLE_MINUTES = 1;
  const MAX_IDLE_MINUTES = 60;
  const QUICK_DISLIKE_GAP_MS = 15000;
  const BULK_CLICK_GAP_MS = 120;
  const SESSION_QUEUE_KEY = "dsQuickDislikeIdleQueueV1";

  const state = {
    routeKey: "",
    selectionMode: false,
    selectedIds: new Set(),
    selectedMeta: new Map(),
    selectionObserver: null,
    launcherRetryTimer: null,
    launcherRetryUntil: 0,
    refreshTimer: null,
    bulkBlocking: false,
    lastUserActivityAt: Date.now(),
    lastBotActionAt: Date.now(),
    queueTimer: null,
    queueRunning: false,
    quickDislikeQueue: [],
    quickDislikeByBotId: new Map()
  };

  function counters() {
    return DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
  }

  function settings() {
    return DS.state?.settings || DS.DEFAULT_SETTINGS || {};
  }

  function quickDislikeEnabled() {
    if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || "")) return false;
    return !!settings().quickDislikeIdleEnabled;
  }

  function idleMinutes() {
    const value = Number(settings().quickDislikeIdleMinutes);
    return Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Number.isFinite(value) ? value : DEFAULT_IDLE_MINUTES));
  }

  function supportedListingRoute() {
    const path = String(location.pathname || "").replace(/\/+$/, "") || "/";
    return path === "/" || path === "/recommended-bots" || /^\/creator\/[^/]+$/i.test(path);
  }

  function routeKey() {
    return `${location.pathname || ""}${location.search || ""}`;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TOOLBAR_ID}{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:10020;display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid rgba(148,163,184,.32);border-radius:10px;background:rgba(17,24,39,.94);color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.28);backdrop-filter:blur(8px);font:500 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #${TOOLBAR_ID} button{appearance:none;border:1px solid rgba(148,163,184,.32);border-radius:7px;background:rgba(55,65,81,.88);color:inherit;padding:6px 9px;cursor:pointer;font:inherit}
      #${TOOLBAR_ID} button:hover{background:rgba(75,85,99,.96)}
      #${TOOLBAR_ID} button[data-primary="1"]{background:rgba(126,34,206,.95);border-color:rgba(168,85,247,.7)}
      #${TOOLBAR_ID} button:disabled{opacity:.45;cursor:default}
      #ds-bulk-block-sidebar-control{width:100%;box-sizing:border-box;border:1px solid rgba(75,85,99,.55);border-radius:8px;background:rgba(31,41,55,.22);padding:7px}
      #ds-bulk-block-launcher{width:100%;box-sizing:border-box;appearance:none;border:1px solid rgba(148,163,184,.35);border-radius:7px;background:rgba(55,65,81,.72);color:inherit;padding:8px 10px;cursor:pointer;font:600 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}
      #ds-bulk-block-launcher:hover{background:rgba(75,85,99,.9)}
      #ds-bulk-block-launcher[aria-pressed="true"]{background:rgba(126,34,206,.96);border-color:rgba(216,180,254,.72);color:#fff}
      .${CARD_SELECT_CLASS}{position:absolute!important;top:7px!important;left:7px!important;z-index:80!important;width:28px!important;height:28px!important;min-width:28px!important;padding:0!important;border:1px solid rgba(216,180,254,.9)!important;border-radius:8px!important;background:rgba(126,34,206,.96)!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;font:700 16px/1 system-ui!important;pointer-events:none!important;box-shadow:0 2px 8px rgba(0,0,0,.28)!important}
      .${SELECTED_CLASS}{outline:2px solid rgba(168,85,247,.92)!important;outline-offset:2px!important;cursor:pointer!important}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function cleanListingText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function listingRoot() {
    return document.querySelector('[data-testid="SearchClientCharacterListing"]');
  }

  function findNsfwLabel(root) {
    if (!root) return null;
    for (const label of root.querySelectorAll("label")) {
      if (!label.querySelector('input[type="checkbox"]')) continue;
      if (/\bNSFW\b/i.test(cleanListingText(label.textContent))) return label;
    }
    return null;
  }

  function nearestCommonAncestor(a, b, stop) {
    if (!(a instanceof Element) || !(b instanceof Element)) return null;
    const seen = new Set();
    let node = a;
    while (node) {
      seen.add(node);
      if (node === stop) break;
      node = node.parentElement;
    }
    node = b;
    while (node) {
      if (seen.has(node)) return node;
      if (node === stop) break;
      node = node.parentElement;
    }
    return null;
  }

  function directChildUnder(node, ancestor) {
    if (!(node instanceof Element) || !(ancestor instanceof Element)) return null;
    let current = node;
    while (current.parentElement && current.parentElement !== ancestor) current = current.parentElement;
    return current.parentElement === ancestor ? current : null;
  }

  function findListingTopRow(root = listingRoot()) {
    if (!root) return null;
    const search = root.querySelector(
      'input[placeholder*="Dive into" i], input[placeholder*="start searching" i], input[type="search"]'
    );
    const nsfw = findNsfwLabel(root);
    if (!(search instanceof Element) || !(nsfw instanceof Element)) return null;
    const common = nearestCommonAncestor(search, nsfw, root);
    return common && common !== root ? common : null;
  }

  function cleanupListingHeaderActionHost() {
    const host = document.getElementById(HEADER_HOST_ID);
    if (host && !host.children.length) host.remove();
  }

  function ensureListingHeaderActionHost() {
    const root = listingRoot();
    const row = findListingTopRow(root);
    if (!(row instanceof HTMLElement)) return null;

    let host = document.getElementById(HEADER_HOST_ID);
    if (!(host instanceof HTMLElement)) {
      host = document.createElement("div");
      host.id = HEADER_HOST_ID;
      host.className = "ds-listing-header-controls";
      host.dataset.dsOwned = "1";
    }

    const nsfw = findNsfwLabel(root);
    const nativeRight = nsfw ? directChildUnder(nsfw, row) : null;
    if (nativeRight && nativeRight !== host) {
      if (host.parentElement !== row || host.nextElementSibling !== nativeRight) row.insertBefore(host, nativeRight);
    } else if (host.parentElement !== row) {
      row.appendChild(host);
    }
    return host;
  }

  function botIdFromHref(href) {
    return (String(href || "").match(BOT_LINK_RE)?.[1] || "").toLowerCase();
  }

  function cardBotId(card) {
    if (!(card instanceof Element)) return "";
    const direct = botIdFromHref(card.getAttribute?.("href"));
    if (direct) return direct;
    for (const anchor of card.querySelectorAll?.("a[href*='/chat/'],a[href*='/chatbot/']") || []) {
      const id = botIdFromHref(anchor.getAttribute("href") || anchor.href);
      if (id) return id;
    }
    return "";
  }

  function cardBotName(card) {
    const node = card?.querySelector?.("a[aria-label^='chat-with-'][title],a[href*='/chat/'][title],a[href*='/chatbot/'][title],a[aria-label^='chat-with-'],img[alt]");
    return String(node?.getAttribute?.("title") || node?.getAttribute?.("alt") || node?.textContent || "").trim();
  }

  function looksLikeBotCard(node, id) {
    if (!(node instanceof HTMLElement) || !id) return false;
    if (node.id === "root" || node === document.body || node === document.documentElement) return false;
    if (node.matches("#ds-qol-panel, #ds-bulk-block-toolbar, #ds-bulk-block-launcher")) return false;
    const rect = node.getBoundingClientRect?.();
    if (rect && (rect.width > Math.max(760, innerWidth * 0.72) || rect.height > Math.max(900, innerHeight * 1.15))) return false;
    const links = node.querySelectorAll?.("a[href*='/chat/'],a[href*='/chatbot/']") || [];
    let matching = 0;
    for (const anchor of links) if (botIdFromHref(anchor.getAttribute("href") || anchor.href) === id) matching += 1;
    if (!matching) return false;
    if (node.querySelector?.(".ds-card-block-button")) return true;
    if (node.matches?.("article,[data-testid*='card' i],[class*='rounded-xl'],[class*='rounded-lg']")) return true;
    return !!node.querySelector?.("img");
  }

  function cardFromAnchor(anchor) {
    if (!(anchor instanceof Element)) return null;
    const id = botIdFromHref(anchor.getAttribute("href") || anchor.href);
    if (!id) return null;

    const preferred = anchor.closest?.("article,[data-testid*='ChatbotCard'],[data-testid*='CharacterCard'],div.relative.group,div[class*='rounded-xl']");
    if (preferred && looksLikeBotCard(preferred, id)) return preferred;

    let node = anchor.parentElement;
    let best = null;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      if (looksLikeBotCard(node, id)) best = node;
      if (node.querySelector?.(".ds-card-block-button") && cardBotId(node) === id) return node;
    }
    return best;
  }

  function cardForBlockButton(button) {
    if (!(button instanceof Element)) return null;
    let node = button.parentElement;
    for (let depth = 0; node && depth < 10; depth++, node = node.parentElement) {
      const id = cardBotId(node);
      if (id && node.querySelector?.(".ds-card-block-button")) return node;
    }
    return null;
  }

  function cardFromTarget(target) {
    if (!(target instanceof Element)) return null;
    const block = target.closest?.(".ds-card-block-button");
    if (block) return cardForBlockButton(block);
    const anchor = target.closest?.("a[href*='/chat/'],a[href*='/chatbot/']");
    if (anchor) return cardFromAnchor(anchor);

    let node = target;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      const id = cardBotId(node);
      if (id && looksLikeBotCard(node, id)) return node;
    }
    return null;
  }

  function selectableCards() {
    const byId = new Map();

    // Use the normal QoL block button when it is already on the card.
    document.querySelectorAll(".ds-card-block-button").forEach(button => {
      const card = cardForBlockButton(button);
      const id = cardBotId(card);
      if (card && id && !byId.has(id)) byId.set(id, card);
    });

    // Fallback path: selection remains available while React is still mounting
    // the block buttons, so Select mode does not depend on that cosmetic control.
    document.querySelectorAll("a[href*='/chat/'],a[href*='/chatbot/']").forEach(anchor => {
      const id = botIdFromHref(anchor.getAttribute("href") || anchor.href);
      if (!id || byId.has(id)) return;
      const card = cardFromAnchor(anchor);
      if (card) byId.set(id, card);
    });

    return Array.from(byId.values()).filter(card => {
      const rect = card.getBoundingClientRect?.();
      return !rect || (rect.width > 40 && rect.height > 40);
    });
  }

  function updateToolbar() {
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar) return;
    const count = state.selectedIds.size;
    const countNode = toolbar.querySelector("[data-role='count']");
    const block = toolbar.querySelector("[data-action='block']");
    const clear = toolbar.querySelector("[data-action='clear']");
    const all = toolbar.querySelector("[data-action='all']");
    const done = toolbar.querySelector("[data-action='done']");
    if (countNode) DS.setTextIfChanged?.(countNode, `${count} selected`);
    if (block) {
      DS.setTextIfChanged?.(block, `Block selected (${count})`);
      const disabled = !count || state.bulkBlocking;
      if (block.disabled !== disabled) block.disabled = disabled;
    }
    if (clear && clear.disabled !== (!count || state.bulkBlocking)) clear.disabled = !count || state.bulkBlocking;
    if (all && all.disabled !== state.bulkBlocking) all.disabled = state.bulkBlocking;
    if (done && done.disabled !== state.bulkBlocking) done.disabled = state.bulkBlocking;
    syncLaunchers();
  }

  function syncSelectionVisual(card) {
    if (!(card instanceof HTMLElement)) return;
    const id = cardBotId(card);
    const selected = !!id && state.selectedIds.has(id);
    card.classList.toggle(SELECTED_CLASS, selected);
    let badge = card.querySelector(`.${CARD_SELECT_CLASS}`);
    if (selected && !badge) {
      badge = document.createElement("span");
      badge.className = CARD_SELECT_CLASS;
      badge.textContent = "✓";
      badge.setAttribute("aria-hidden", "true");
      const position = getComputedStyle(card).position;
      if (!position || position === "static") card.style.position = "relative";
      card.appendChild(badge);
    } else if (!selected) {
      badge?.remove();
    }
  }

  function selectionInfoFromCard(card, botId = cardBotId(card)) {
    const id = String(botId || "").trim().toLowerCase();
    if (!id) return null;
    const previous = state.selectedMeta.get(id) || {};
    const image = card?.querySelector?.("img[alt]")?.getAttribute?.("src") || previous.image || "";
    const creatorNode = card?.querySelector?.("a[aria-label='creator'],a[href*='/creator/']");
    const creator = String(creatorNode?.textContent || creatorNode?.getAttribute?.("title") || previous.creator || "").replace(/^@/, "").trim();
    const description = String(
      card?.getAttribute?.("data-ds-description-signature") ||
      card?.querySelector?.("[data-ds-description-signature]")?.getAttribute?.("data-ds-description-signature") ||
      previous.description || ""
    ).trim();
    return {
      botId: id,
      botName: cardBotName(card) || previous.botName || id,
      image,
      creator,
      description,
      chatUrl: previous.chatUrl || `https://spicychat.ai/chat/${id}`,
      profileUrl: previous.profileUrl || `https://spicychat.ai/chatbot/${id}`
    };
  }

  function rememberSelectedCard(card, botId = cardBotId(card)) {
    const info = selectionInfoFromCard(card, botId);
    if (!info) return;
    state.selectedIds.add(info.botId);
    state.selectedMeta.set(info.botId, info);
  }

  function forgetSelectedId(botId) {
    const id = String(botId || "").trim().toLowerCase();
    if (!id) return;
    state.selectedIds.delete(id);
    state.selectedMeta.delete(id);
  }

  function toggleCardSelection(card) {
    const id = cardBotId(card);
    if (!id) return;
    if (state.selectedIds.has(id)) forgetSelectedId(id);
    else rememberSelectedCard(card, id);
    syncSelectionVisual(card);
    updateToolbar();
  }

  function decorateSelectionCards() {
    if (!state.selectionMode || !supportedListingRoute()) return;
    for (const card of selectableCards()) syncSelectionVisual(card);
  }

  function decorateSelectionSubtree(root) {
    if (!state.selectionMode || !supportedListingRoute() || !(root instanceof Element) || DS.isQolOwnedNode?.(root)) return;
    const cards = new Set();
    const direct = cardFromTarget(root);
    if (direct) cards.add(direct);
    root.querySelectorAll?.(".ds-card-block-button").forEach(button => {
      const card = cardForBlockButton(button);
      if (card) cards.add(card);
    });
    root.querySelectorAll?.("a[href*='/chat/'],a[href*='/chatbot/']").forEach(anchor => {
      const card = cardFromAnchor(anchor);
      if (card) cards.add(card);
    });
    for (const card of cards) syncSelectionVisual(card);
    if (cards.size) {
      const perf = counters();
      perf.bulkBlockScopedCardDecorations = Number(perf.bulkBlockScopedCardDecorations || 0) + cards.size;
    }
  }

  function removeSelectionDecorations() {
    document.querySelectorAll(`.${CARD_SELECT_CLASS}`).forEach(node => node.remove());
    document.querySelectorAll(`.${SELECTED_CLASS}`).forEach(node => node.classList.remove(SELECTED_CLASS));
  }

  function scheduleDecorate() {
    if (!state.selectionMode) return;
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => {
      state.refreshTimer = null;
      decorateSelectionCards();
    }, 120);
  }

  function startSelectionObserver() {
    if (state.selectionObserver || !document.body) return;
    state.selectionObserver = new MutationObserver(mutations => {
      if (!state.selectionMode) return;
      let decorated = false;
      for (const mutation of mutations) {
        if (DS.mutationIsQolOnly?.(mutation)) continue;
        for (const node of mutation.addedNodes || []) {
          if (!(node instanceof Element) || DS.isQolOwnedNode?.(node)) continue;
          decorateSelectionSubtree(node);
          decorated = true;
        }
      }
      // If React replaced a wrapper without exposing card descendants in the
      // added subtree, keep one debounced fallback instead of rescanning on
      // every mutation record.
      if (!decorated && mutations.some(m => m.addedNodes?.length)) scheduleDecorate();
    });
    state.selectionObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopSelectionObserver() {
    state.selectionObserver?.disconnect();
    state.selectionObserver = null;
    clearTimeout(state.refreshTimer);
    state.refreshTimer = null;
  }

  function setSelectionMode(enabled) {
    state.selectionMode = !!enabled && supportedListingRoute();
    if (state.selectionMode) {
      ensureStyle();
      ensureSelectionToolbar();
      decorateSelectionCards();
      startSelectionObserver();
    } else {
      stopSelectionObserver();
      removeSelectionDecorations();
      state.selectedIds.clear();
      state.selectedMeta.clear();
      document.getElementById(TOOLBAR_ID)?.remove();
    }
    syncLaunchers();
    updateToolbar();
  }

  function persistQuickDislikeQueue() {
    try {
      const payload = state.quickDislikeQueue.slice(0, 200).map(item => ({
        botId: item.botId,
        queuedAt: item.queuedAt,
        attempts: Math.max(0, Number(item.attempts || 0) || 0),
        message: item.message
      }));
      if (payload.length) sessionStorage.setItem(SESSION_QUEUE_KEY, JSON.stringify(payload));
      else sessionStorage.removeItem(SESSION_QUEUE_KEY);
    } catch {}
  }

  function restoreQuickDislikeQueue() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(SESSION_QUEUE_KEY) || "[]");
      if (!Array.isArray(raw)) return;
      for (const saved of raw.slice(0, 200)) {
        const botId = String(saved?.botId || saved?.message?.botId || "").trim().toLowerCase();
        if (!botId || state.quickDislikeByBotId.has(botId)) continue;
        const item = {
          botId,
          queuedAt: Number(saved?.queuedAt) || Date.now(),
          attempts: Math.max(0, Number(saved?.attempts || 0) || 0),
          message: {
            type: "DS_QUICK_DISLIKE_BOT",
            botId,
            botName: String(saved?.message?.botName || botId),
            chatUrl: String(saved?.message?.chatUrl || `https://spicychat.ai/chat/${botId}`)
          }
        };
        state.quickDislikeByBotId.set(botId, item);
        state.quickDislikeQueue.push(item);
      }
      counters().quickDislikeIdleQueueSize = state.quickDislikeQueue.length;
    } catch {}
  }

  function scheduleQuickDislikeQueue(extraDelay = 0) {
    clearTimeout(state.queueTimer);
    state.queueTimer = null;
    if (!state.quickDislikeQueue.length || state.queueRunning) return;
    const wait = Math.max(extraDelay, queueIdleMsRemaining(), 250);
    const perf = counters();
    perf.quickDislikeIdleQueueSize = state.quickDislikeQueue.length;
    perf.quickDislikeIdleWaitMs = wait;
    state.queueTimer = setTimeout(processQuickDislikeQueue, wait);
  }

  function markBotAction() {
    const now = Date.now();
    state.lastBotActionAt = now;
    state.lastUserActivityAt = Math.max(state.lastUserActivityAt, now);
    scheduleQuickDislikeQueue();
  }

  function markActivity(botAction = false) {
    const now = Date.now();
    state.lastUserActivityAt = now;
    if (botAction) state.lastBotActionAt = now;
    scheduleQuickDislikeQueue();
  }

  function queueIdleMsRemaining() {
    const required = idleMinutes() * 60 * 1000;
    const since = Date.now() - Math.max(state.lastUserActivityAt, state.lastBotActionAt);
    return Math.max(0, required - since);
  }

  function invokeQuickDislike(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          try {
            if (chrome.runtime.lastError) return resolve(null);
          } catch {}
          resolve(response || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function processQuickDislikeQueue() {
    state.queueTimer = null;
    if (state.queueRunning || !state.quickDislikeQueue.length) return;
    if (!quickDislikeEnabled()) {
      state.quickDislikeQueue.length = 0;
      state.quickDislikeByBotId.clear();
      persistQuickDislikeQueue();
      counters().quickDislikeIdleQueueSize = 0;
      return;
    }
    if (state.bulkBlocking || queueIdleMsRemaining() > 0) return scheduleQuickDislikeQueue();

    const item = state.quickDislikeQueue.shift();
    if (!item) return;
    persistQuickDislikeQueue();
    state.queueRunning = true;
    const perf = counters();
    const attempt = Math.max(0, Number(item.attempts || 0) || 0) + 1;
    const token = DS.diagOperationStart?.("quick-dislike", "queued-worker", { botId: item.botId, attempt });
    perf.quickDislikeIdleStarts = Number(perf.quickDislikeIdleStarts || 0) + 1;
    perf.quickDislikeIdleQueueSize = state.quickDislikeQueue.length;

    const response = await invokeQuickDislike({ ...item.message, queueAttempt: attempt });
    const terminal = !!response?.ok;
    let retrying = false;

    if (terminal) {
      state.quickDislikeByBotId.delete(item.botId);
      perf.quickDislikeIdleCompleted = Number(perf.quickDislikeIdleCompleted || 0) + 1;
    } else if (attempt < 3 && quickDislikeEnabled()) {
      item.attempts = attempt;
      item.queuedAt = Date.now();
      state.quickDislikeQueue.push(item);
      retrying = true;
      perf.quickDislikeIdleRetries = Number(perf.quickDislikeIdleRetries || 0) + 1;
      persistQuickDislikeQueue();
    } else {
      state.quickDislikeByBotId.delete(item.botId);
      perf.quickDislikeIdleFailures = Number(perf.quickDislikeIdleFailures || 0) + 1;
    }

    DS.diagOperationEnd?.(token, {
      scanned: 1,
      changed: response?.status === "disliked" ? 1 : 0,
      skipped: response?.ok && response?.status !== "disliked" ? 1 : 0,
      status: response?.status || "no-response",
      retrying,
      attempt
    });

    perf.quickDislikeIdleQueueSize = state.quickDislikeQueue.length;
    state.queueRunning = false;
    if (state.quickDislikeQueue.length) scheduleQuickDislikeQueue(QUICK_DISLIKE_GAP_MS);
  }

  function isBotBlocked(botId) {
    const id = String(botId || "").toLowerCase();
    if (!id) return false;
    const runtimeIds = Array.isArray(DS.state?.blockedBots?.ids) ? DS.state.blockedBots.ids : [];
    const settingIds = Array.isArray(settings().blockedBotIds) ? settings().blockedBotIds : [];
    return runtimeIds.some(value => String(value || "").toLowerCase() === id) ||
      settingIds.some(value => String(value || "").toLowerCase() === id);
  }

  function queueQuickDislikeInfo(info) {
    if (!quickDislikeEnabled()) return;
    const botId = String(info?.botId || "").trim().toLowerCase();
    if (!botId || state.quickDislikeByBotId.has(botId)) {
      if (botId) counters().quickDislikeIdleDedupe = Number(counters().quickDislikeIdleDedupe || 0) + 1;
      return;
    }
    const botName = String(info?.botName || botId).trim() || botId;
    const item = {
      botId,
      queuedAt: Date.now(),
      attempts: 0,
      message: {
        type: "DS_QUICK_DISLIKE_BOT",
        botId,
        botName,
        chatUrl: `https://spicychat.ai/chat/${botId}`
      }
    };
    state.quickDislikeByBotId.set(botId, item);
    state.quickDislikeQueue.push(item);
    persistQuickDislikeQueue();
    const perf = counters();
    perf.quickDislikeIdleQueued = Number(perf.quickDislikeIdleQueued || 0) + 1;
    perf.quickDislikeIdleQueueSize = state.quickDislikeQueue.length;
    markBotAction();
  }

  function queueAfterConfirmedBlock(card) {
    if (!quickDislikeEnabled() || !card) return;
    const info = { botId: cardBotId(card), botName: cardBotName(card) };
    if (!info.botId) return;
    const check = attempt => {
      if (isBotBlocked(info.botId)) {
        queueQuickDislikeInfo(info);
        return;
      }
      if (attempt < 2) setTimeout(() => check(attempt + 1), attempt ? 450 : 140);
    };
    setTimeout(() => check(0), 40);
  }

  function ensureSelectionToolbar() {
    if (!state.selectionMode || !supportedListingRoute()) {
      document.getElementById(TOOLBAR_ID)?.remove();
      return;
    }
    ensureStyle();
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) return updateToolbar();

    toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.dataset.dsOwned = "1";

    const count = document.createElement("span");
    count.dataset.role = "count";
    count.textContent = "0 selected";

    const selectAll = document.createElement("button");
    selectAll.type = "button";
    selectAll.dataset.action = "all";
    selectAll.textContent = "Select loaded";
    selectAll.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      markActivity(true);
      for (const card of selectableCards()) {
        const id = cardBotId(card);
        if (id) rememberSelectedCard(card, id);
      }
      decorateSelectionCards();
      updateToolbar();
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.dataset.action = "clear";
    clear.textContent = "Clear";
    clear.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      markActivity(true);
      state.selectedIds.clear();
      state.selectedMeta.clear();
      decorateSelectionCards();
      updateToolbar();
    });

    const block = document.createElement("button");
    block.type = "button";
    block.dataset.action = "block";
    block.dataset.primary = "1";
    block.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      blockSelectedBots();
    });

    const done = document.createElement("button");
    done.type = "button";
    done.dataset.action = "done";
    done.textContent = "Done";
    done.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      markActivity(true);
      setSelectionMode(false);
    });

    toolbar.append(count, selectAll, clear, block, done);
    document.body.appendChild(toolbar);
    updateToolbar();
  }

  function makeLauncher(id, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = id;
    button.textContent = label;
    button.dataset.dsOwned = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      markActivity(true);
      setSelectionMode(!state.selectionMode);
    });
    return button;
  }

  function stopLauncherRetry() {
    clearTimeout(state.launcherRetryTimer);
    state.launcherRetryTimer = null;
    state.launcherRetryUntil = 0;
  }

  function scheduleLauncherRetry() {
    if (state.launcherRetryTimer || !supportedListingRoute() || !settings().enableBulkCardBlocking) return;
    if (!state.launcherRetryUntil) state.launcherRetryUntil = Date.now() + 15000;
    state.launcherRetryTimer = setTimeout(() => {
      state.launcherRetryTimer = null;
      if (!supportedListingRoute() || !settings().enableBulkCardBlocking || Date.now() > state.launcherRetryUntil) {
        stopLauncherRetry();
        return;
      }
      ensurePageLauncher();
      if (!document.getElementById("ds-bulk-block-launcher")) scheduleLauncherRetry();
    }, 250);
  }

  function ensurePageLauncher() {
    const id = "ds-bulk-block-launcher";
    const wrapperId = "ds-bulk-block-sidebar-control";
    if (!supportedListingRoute() || !settings().enableBulkCardBlocking) {
      stopLauncherRetry();
      document.getElementById(wrapperId)?.remove();
      document.getElementById(id)?.remove();
      cleanupListingHeaderActionHost();
      return;
    }
    ensureStyle();

    const useLegacySidebar = !!settings().bulkCardBlockingSidebarLauncher;
    const existingButton = document.getElementById(id);
    const existingWrapper = document.getElementById(wrapperId);

    if (!useLegacySidebar) {
      // The default placement lives between SpicyChat's search controls and
      // the NSFW/sort controls. This remains available even when Narrow by is
      // collapsed and does not depend on an expanded capability group.
      if (existingWrapper instanceof HTMLElement) existingWrapper.remove();
      let host = null;
      try { host = ensureListingHeaderActionHost(); } catch {}
      if (!(host instanceof HTMLElement)) {
        existingButton?.remove();
        scheduleLauncherRetry();
        return;
      }
      stopLauncherRetry();

      let button = document.getElementById(id);
      if (!(button instanceof HTMLButtonElement) || button.parentElement !== host) {
        button?.remove();
        button = makeLauncher(id, "Select bots");
      }
      button.classList.add("ds-listing-header-action");
      if (button.parentElement !== host) host.appendChild(button);
      button.textContent = state.selectionMode ? `Selecting (${state.selectedIds.size})` : "Select bots";
      button.setAttribute("aria-pressed", state.selectionMode ? "true" : "false");
      return;
    }

    // Optional legacy placement: keep Select bots directly below Narrow by
    // Group Size, matching the pre-109 layout.
    const groupSize = document.querySelector('[data-testid="GroupSizeCapabilityGate"]');
    if (!(groupSize instanceof HTMLElement) || !(groupSize.parentElement instanceof HTMLElement)) {
      existingButton?.remove();
      existingWrapper?.remove();
      cleanupListingHeaderActionHost();
      scheduleLauncherRetry();
      return;
    }
    stopLauncherRetry();

    if (existingButton && existingWrapper && existingButton.parentElement !== existingWrapper) existingButton.remove();
    let wrapper = document.getElementById(wrapperId);
    let button = document.getElementById(id);
    if (!(wrapper instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
      wrapper?.remove();
      button?.remove();
      wrapper = document.createElement("div");
      wrapper.id = wrapperId;
      wrapper.dataset.dsOwned = "1";
      button = makeLauncher(id, "Select bots");
      wrapper.appendChild(button);
    }
    button.classList.remove("ds-listing-header-action");

    if (groupSize.nextElementSibling !== wrapper) groupSize.after(wrapper);
    button.textContent = state.selectionMode ? `Selecting (${state.selectedIds.size})` : "Select bots";
    button.setAttribute("aria-pressed", state.selectionMode ? "true" : "false");
    cleanupListingHeaderActionHost();
  }

  function ensurePanelLauncher() {
    const id = "ds-qol-select-bots";
    const panel = document.getElementById("ds-qol-panel");
    const body = panel?.querySelector?.(".ds-qol-body");
    if (!body || !supportedListingRoute() || !settings().enableBulkCardBlocking) {
      document.getElementById(id)?.closest?.(".ds-qol-row")?.remove();
      return;
    }

    let button = document.getElementById(id);
    if (!button) {
      const row = document.createElement("div");
      row.className = "ds-qol-row";
      row.id = "ds-qol-select-bots-row";
      button = makeLauncher(id, "Select bots");
      row.appendChild(button);
      const normalRow = body.querySelector("#ds-qol-normal-row");
      if (normalRow) normalRow.before(row);
      else body.prepend(row);
    }
    button.textContent = state.selectionMode ? `Selecting (${state.selectedIds.size})` : "Select bots";
    button.setAttribute("aria-pressed", state.selectionMode ? "true" : "false");
  }

  function syncLaunchers() {
    ensurePageLauncher();
    ensurePanelLauncher();
  }

  function createToolbar() {
    if (!supportedListingRoute() || !settings().enableBulkCardBlocking) {
      stopLauncherRetry();
      document.getElementById("ds-bulk-block-sidebar-control")?.remove();
      document.getElementById("ds-bulk-block-launcher")?.remove();
      document.getElementById("ds-qol-select-bots-row")?.remove();
      document.getElementById(TOOLBAR_ID)?.remove();
      cleanupListingHeaderActionHost();
      if (state.selectionMode) setSelectionMode(false);
      return;
    }
    ensureStyle();
    syncLaunchers();
    if (state.selectionMode) ensureSelectionToolbar();
  }

  async function resolveBlockButton(card) {
    if (!(card instanceof HTMLElement)) return null;
    let button = card.querySelector(".ds-card-block-button");
    if (button instanceof HTMLElement) return button;
    try { await DS.applyCardBlockButtons?.(); } catch {}
    button = card.querySelector(".ds-card-block-button");
    if (button instanceof HTMLElement) return button;
    await new Promise(resolve => setTimeout(resolve, 80));
    return card.querySelector(".ds-card-block-button");
  }

  function localFavoriteProtected(card, botId) {
    if (!settings().protectFavoritesFromBlocking) return false;
    const id = String(botId || "").toLowerCase();
    const localIds = DS.state?.favoriteBotIdSet instanceof Set
      ? DS.state.favoriteBotIdSet
      : new Set(Array.isArray(DS.state?.favoriteBots?.ids) ? DS.state.favoriteBots.ids : []);
    if ([...localIds].some(value => String(value || "").toLowerCase() === id)) return true;
    return !!card?.querySelector?.("button[aria-label='unfavorite'],button[aria-label*='unfavorite' i]");
  }

  function hideConfirmedBlockedCard(card) {
    if (!(card instanceof HTMLElement)) return;
    card.dataset.dsBulkBlocked = "1";
    card.classList.remove(SELECTED_CLASS);
    card.style.setProperty("display", "none", "important");
  }

  async function readPersistedBlocked(botId) {
    const id = String(botId || "").trim().toLowerCase();
    if (!id || typeof DS.storageGet !== "function") return false;
    try {
      const result = await DS.storageGet([DS.BLOCKED_BOTS_KEY || "blockedBots"]);
      const stored = result?.[DS.BLOCKED_BOTS_KEY || "blockedBots"];
      return (Array.isArray(stored?.ids) ? stored.ids : []).some(value => String(value || "").trim().toLowerCase() === id);
    } catch {
      return false;
    }
  }

  async function waitForBlockedConfirmation(botId, timeoutMs = 3200) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (isBotBlocked(botId)) return true;
      if (await readPersistedBlocked(botId)) return true;
      await new Promise(resolve => setTimeout(resolve, 140));
    }
    return false;
  }

  async function forceBlockThroughSharedState(card, botId) {
    const id = String(botId || "").trim().toLowerCase();
    if (!id || typeof DS.saveBlockedBots !== "function") return false;
    try {
      const store = DS.state.blockedBots || (DS.state.blockedBots = { ids: [], names: [], meta: {} });
      if (!Array.isArray(store.ids)) store.ids = [];
      if (!Array.isArray(store.names)) store.names = [];
      if (!store.meta || typeof store.meta !== "object") store.meta = {};
      if (!store.ids.some(value => String(value || "").trim().toLowerCase() === id)) store.ids.push(id);
      store.meta[id] = {
        ...(store.meta[id] || {}),
        id,
        name: cardBotName(card) || id,
        chatUrl: `https://spicychat.ai/chat/${id}`,
        profileUrl: `https://spicychat.ai/chatbot/${id}`,
        savedAt: Date.now()
      };
      DS.refreshFastLookupCaches?.();
      await DS.saveBlockedBots();
      return await waitForBlockedConfirmation(id, 2200);
    } catch (error) {
      console.warn("[SpicyChat QoL] Shared-state bulk block fallback failed", error);
      return false;
    }
  }

  async function fallbackBlockSelected(cards) {
    const blockedIds = [];
    const failedIds = [];
    const protectedIds = [];
    for (const card of cards) {
      const id = cardBotId(card);
      if (!id) continue;
      if (localFavoriteProtected(card, id)) {
        protectedIds.push(id);
        continue;
      }
      const button = await resolveBlockButton(card);
      if (!(button instanceof HTMLElement) || !button.isConnected) {
        failedIds.push(id);
        continue;
      }
      markBotAction();
      let confirmed = false;
      try {
        // First use the exact normal QoL block button action.
        button.click();
        confirmed = await waitForBlockedConfirmation(id, 1500);
      } catch {}

      if (!confirmed && button.isConnected && typeof DS.realClick === "function") {
        try {
          DS.realClick(button, { scroll: false });
          confirmed = await waitForBlockedConfirmation(id, 1500);
        } catch {}
      }

      if (!confirmed) {
        // If SpicyChat ignores the click, save through QoL's normal Blocked store instead.
        // This keeps the fallback on the same data path as a regular block.
        confirmed = await forceBlockThroughSharedState(card, id);
      }

      if (confirmed) {
        blockedIds.push(id);
        queueAfterConfirmedBlock(card);
        hideConfirmedBlockedCard(card);
      } else {
        failedIds.push(id);
      }
      if (cards.length > 1) await new Promise(resolve => setTimeout(resolve, BULK_CLICK_GAP_MS));
    }
    return { ok: !failedIds.length, blockedIds, failedIds, protectedIds };
  }

  function storageLocalGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, result => {
          try {
            const err = chrome.runtime?.lastError;
            if (err) return reject(new Error(err.message || String(err)));
          } catch {}
          resolve(result || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageLocalSet(payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(payload, () => {
          try {
            const err = chrome.runtime?.lastError;
            if (err) return reject(new Error(err.message || String(err)));
          } catch {}
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function normalizeBlockedStore(value) {
    const source = value && typeof value === "object" ? value : {};
    const ids = [];
    const seen = new Set();
    for (const raw of Array.isArray(source.ids) ? source.ids : []) {
      const id = String(raw || "").trim().toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    const names = [];
    const seenNames = new Set();
    for (const raw of Array.isArray(source.names) ? source.names : []) {
      const name = String(raw || "").trim();
      const key = name.toLowerCase();
      if (!name || seenNames.has(key)) continue;
      seenNames.add(key);
      names.push(name);
    }
    return {
      ids,
      names,
      meta: source.meta && typeof source.meta === "object" && !Array.isArray(source.meta)
        ? { ...source.meta }
        : {}
    };
  }

  function syncRuntimeBlockedStore(persisted) {
    try {
      const legacyIds = Array.isArray(settings().blockedBotIds) ? settings().blockedBotIds : [];
      const legacyNames = Array.isArray(settings().blockedBotNames) ? settings().blockedBotNames : [];
      DS.state.rawBlockedBots = {
        ids: [...persisted.ids],
        names: [...persisted.names],
        meta: persisted.meta
      };
      DS.state.blockedBots = {
        ids: typeof DS.uniqueClean === "function"
          ? DS.uniqueClean([...legacyIds, ...persisted.ids])
          : [...new Set([...legacyIds, ...persisted.ids])],
        names: typeof DS.uniqueClean === "function"
          ? DS.uniqueClean([...legacyNames, ...persisted.names])
          : [...new Set([...legacyNames, ...persisted.names])],
        meta: persisted.meta
      };
      DS.refreshFastLookupCaches?.();
    } catch {}
  }

  async function persistSelectedBlocks(records) {
    const key = DS.BLOCKED_BOTS_KEY || "blockedBots";
    const beforeStore = normalizeBlockedStore((await storageLocalGet([key]))?.[key]);
    const runtime = normalizeBlockedStore(DS.state?.blockedBots);
    const existing = normalizeBlockedStore({
      ids: [...beforeStore.ids, ...runtime.ids],
      names: [...beforeStore.names, ...runtime.names],
      meta: { ...beforeStore.meta, ...runtime.meta }
    });
    const blocked = [];
    const protectedIds = [];
    const now = Date.now();
    const idSet = new Set(existing.ids.map(id => String(id).toLowerCase()));
    // Older 87 bulk-select builds incorrectly copied every selected bot name
    // into the legacy name-only blocker list as well as the ID list. That is
    // why the Blocked manager showed a duplicate "name-only block" beside an
    // ID-backed entry. Remove only names we can prove came from bulk-select
    // metadata, while leaving genuine manual name rules untouched.
    const bulkGeneratedNames = new Set(Object.values(existing.meta || {})
      .filter(item => item && item.source === "bulk-select" && item.id)
      .map(item => String(item.name || "").trim().toLowerCase())
      .filter(Boolean));
    if (bulkGeneratedNames.size) existing.names = existing.names.filter(name => !bulkGeneratedNames.has(String(name || "").trim().toLowerCase()));
    const currentCards = new Map(selectableCards().map(card => [cardBotId(card), card]));

    for (const record of records) {
      const id = String(record?.botId || "").trim().toLowerCase();
      if (!id) continue;
      const card = currentCards.get(id) || null;
      if (localFavoriteProtected(card, id)) {
        protectedIds.push(id);
        continue;
      }
      const name = String(record?.botName || cardBotName(card) || id).trim() || id;
      if (!idSet.has(id)) {
        idSet.add(id);
        existing.ids.push(id);
      }
      existing.meta[id] = {
        ...(existing.meta[id] || {}),
        id,
        name,
        image: record?.image || existing.meta[id]?.image || "",
        creator: record?.creator || existing.meta[id]?.creator || "",
        description: record?.description || existing.meta[id]?.description || "",
        chatUrl: record?.chatUrl || existing.meta[id]?.chatUrl || `https://spicychat.ai/chat/${id}`,
        profileUrl: record?.profileUrl || existing.meta[id]?.profileUrl || `https://spicychat.ai/chatbot/${id}`,
        savedAt: existing.meta[id]?.savedAt || now,
        lastSeenAt: now,
        source: "bulk-select"
      };
      blocked.push({ id, card, name });
    }

    if (!blocked.length) return { blockedIds: [], protectedIds, failedIds: [] };

    // Save through the same Blocked store used by a normal block. The old bulk
    // path wrote storage directly, which could leave the live lookup out of sync.
    DS.state.blockedBots = {
      ids: [...existing.ids],
      names: [...existing.names],
      meta: { ...existing.meta }
    };
    DS.refreshFastLookupCaches?.();

    let normalSaveWorked = false;
    if (typeof DS.saveBlockedBots === "function") {
      try {
        await DS.saveBlockedBots();
        normalSaveWorked = true;
      } catch (error) {
        console.warn("[SpicyChat QoL] Bulk Blocked save failed", error);
      }
    }
    if (!normalSaveWorked) {
      // Compatibility fallback for builds where saveBlockedBots is not exposed.
      await storageLocalSet({ [key]: existing });
    }

    let verify = normalizeBlockedStore((await storageLocalGet([key]))?.[key]);
    let verified = new Set(verify.ids.map(id => String(id).toLowerCase()));
    const failedItems = blocked.filter(item => !verified.has(item.id));

    // If a particular ID still did not persist, use that card's exact normal ×
    // action as a final fallback. This deliberately runs only for failures, not
    // for the whole batch.
    if (failedItems.length) {
      const fallbackCards = failedItems.map(item => currentCards.get(item.id)).filter(Boolean);
      if (fallbackCards.length) {
        try { await fallbackBlockSelected(fallbackCards); } catch {}
        verify = normalizeBlockedStore((await storageLocalGet([key]))?.[key]);
        verified = new Set(verify.ids.map(id => String(id).toLowerCase()));
      }
    }

    const blockedIds = blocked.filter(item => verified.has(item.id)).map(item => item.id);
    const failedIds = blocked.filter(item => !verified.has(item.id)).map(item => item.id);

    if (blockedIds.length && typeof DS.recordLocalChange === "function") {
      try {
        await DS.recordLocalChange(
          `Blocked ${blockedIds.length} selected bot${blockedIds.length === 1 ? "" : "s"}`,
          { [key]: beforeStore },
          { [key]: verify }
        );
      } catch {}
    }

    syncRuntimeBlockedStore(verify);

    for (const item of blocked) {
      if (!verified.has(item.id)) continue;
      queueQuickDislikeInfo({ botId: item.id, botName: item.name });
      if (item.card) hideConfirmedBlockedCard(item.card);
    }

    try { await DS.enforceBlockedPriorityOverOpened?.({ persist: true }); } catch {}
    try { DS.bumpDomRevision?.(); } catch {}
    try { DS.updateQuickPanel?.(); } catch {}

    return { blockedIds, protectedIds, failedIds };
  }

  async function blockSelectedBots() {
    if (state.bulkBlocking || !state.selectedIds.size) return;
    const wanted = new Set(state.selectedIds);
    const currentCards = new Map(selectableCards().map(card => [cardBotId(card), card]));
    const records = [...wanted].map(id => {
      const remembered = state.selectedMeta.get(id);
      const card = currentCards.get(id);
      return remembered || selectionInfoFromCard(card, id) || { botId: id, botName: id };
    });

    // Selection is ID-backed now, so React can rerender/virtualize cards between
    // selecting them and pressing Block selected without turning the batch into
    // a no-op.
    if (!records.length) {
      updateToolbar();
      DS.setQuickStatus?.("No selected bot IDs were available to block.", true);
      return;
    }

    state.bulkBlocking = true;
    markActivity(true);
    updateToolbar();
    const perf = counters();
    perf.bulkBlockRuns = Number(perf.bulkBlockRuns || 0) + 1;
    perf.bulkBlockRequested = Number(perf.bulkBlockRequested || 0) + wanted.size;

    let result = { blockedIds: [], protectedIds: [], failedIds: [] };
    try {
      result = await persistSelectedBlocks(records);
      perf.bulkBlockCanonicalSaveRuns = Number(perf.bulkBlockCanonicalSaveRuns || 0) + 1;
    } catch (error) {
      console.warn("[SpicyChat QoL] Bulk block save failed", error);
      result.failedIds = records.map(record => record.botId).filter(Boolean);
    }

    const blockedIds = new Set(result.blockedIds || []);
    const protectedIds = new Set(result.protectedIds || []);
    const failedIds = new Set(result.failedIds || []);
    for (const id of blockedIds) forgetSelectedId(id);
    for (const id of protectedIds) forgetSelectedId(id);

    perf.bulkBlockClicked = Number(perf.bulkBlockClicked || 0) + blockedIds.size;
    perf.bulkBlockSaved = Number(perf.bulkBlockSaved || 0) + blockedIds.size;
    perf.bulkBlockProtected = Number(perf.bulkBlockProtected || 0) + protectedIds.size;
    perf.bulkBlockFailed = Number(perf.bulkBlockFailed || 0) + failedIds.size;
    perf.bulkBlockSkipped = Number(perf.bulkBlockSkipped || 0) + Math.max(0, wanted.size - blockedIds.size);

    state.bulkBlocking = false;
    markBotAction();

    if (!failedIds.size && !state.selectedIds.size) {
      setSelectionMode(false);
      if (blockedIds.size) DS.setQuickStatus?.(`Blocked ${blockedIds.size} selected bot${blockedIds.size === 1 ? "" : "s"}.`, true);
      else if (protectedIds.size) DS.setQuickStatus?.("Selected favorites were protected from blocking.", true);
    } else {
      // Failed entries stay selected so a failed save is visible instead of
      // being reported as a successful batch.
      state.selectedIds = new Set([...state.selectedIds].filter(id => failedIds.has(id)));
      for (const id of [...state.selectedMeta.keys()]) if (!state.selectedIds.has(id)) state.selectedMeta.delete(id);
      decorateSelectionCards();
      updateToolbar();
      DS.setQuickStatus?.(`Blocked ${blockedIds.size}; ${failedIds.size || state.selectedIds.size} still selected because the Blocked store could not be verified.`, true);
    }
    createToolbar();
  }

  function installSelectionClickHandler() {
    document.addEventListener("click", event => {
      if (!state.selectionMode || !supportedListingRoute() || !(event.target instanceof Element)) return;
      if (event.target.closest(`#${TOOLBAR_ID},#ds-bulk-block-launcher,#ds-qol-panel,.ds-card-block-button`)) return;
      const card = cardFromTarget(event.target);
      if (!card) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      markActivity(true);
      toggleCardSelection(card);
    }, true);
  }

  function isFavoriteTarget(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest([
      "button[aria-label='favorite']",
      "button[aria-label='unfavorite']",
      "button[aria-label*='favorite' i]",
      "[data-ds-favorite]"
    ].join(","));
  }

  function installActivityListeners() {
    const passive = { capture: true, passive: true };
    document.addEventListener("pointerdown", event => {
      if (!event.isTrusted) return;
      markActivity(!!event.target?.closest?.(".ds-card-block-button") || isFavoriteTarget(event.target));
    }, passive);
    document.addEventListener("touchstart", event => {
      if (!event.isTrusted) return;
      markActivity(!!event.target?.closest?.(".ds-card-block-button") || isFavoriteTarget(event.target));
    }, passive);
    document.addEventListener("wheel", event => {
      if (event.isTrusted) markActivity(false);
    }, passive);
    document.addEventListener("keydown", event => {
      if (event.isTrusted) markActivity(false);
    }, { capture: true });
    document.addEventListener("click", event => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const blockButton = event.target.closest(".ds-card-block-button");
      if (blockButton) {
        const card = cardForBlockButton(blockButton);
        markBotAction();
        queueAfterConfirmedBlock(card);
        return;
      }
      if (isFavoriteTarget(event.target)) markBotAction();
    }, true);
  }

  function refreshRouteUi() {
    const current = routeKey();
    if (state.routeKey !== current) {
      state.routeKey = current;
      if (state.selectionMode) setSelectionMode(false);
    }
    createToolbar();
  }

  installSelectionClickHandler();
  installActivityListeners();
  restoreQuickDislikeQueue();
  scheduleQuickDislikeQueue();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      setTimeout(() => {
        refreshRouteUi();
        if (!quickDislikeEnabled() && state.quickDislikeQueue.length) {
          state.quickDislikeQueue.length = 0;
          state.quickDislikeByBotId.clear();
          persistQuickDislikeQueue();
        }
        scheduleQuickDislikeQueue();
      }, 0);
    });
  } catch {}

  const routeRefresh = () => setTimeout(refreshRouteUi, 80);
  window.addEventListener("popstate", routeRefresh, true);
  document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("a[href]")) routeRefresh();
  }, true);
  document.addEventListener("visibilitychange", () => scheduleQuickDislikeQueue(), { passive: true });

  const boot = () => {
    refreshRouteUi();
    setTimeout(refreshRouteUi, 500);
    setTimeout(refreshRouteUi, 1600);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  DS.queueQuickDislikeAfterBlock = function queueQuickDislikeAfterBlock(meta = {}) {
    if (!quickDislikeEnabled()) return false;
    const botId = String(meta.botId || meta.id || "").trim().toLowerCase();
    if (!botId) return false;
    queueQuickDislikeInfo({
      botId,
      botName: String(meta.botName || meta.name || botId).trim() || botId
    });
    return true;
  };
  DS.rc86RefreshBulkBlockUi = refreshRouteUi;
  DS.rc86QuickDislikeIdleState = state;
})();
