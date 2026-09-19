(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const SOURCE = "spicychat-qol-exact-message-counts";
  const BUFFER_KEY = "__DSQ_EXACT_MESSAGE_COUNT_BUFFER__";
  const counts = new Map();
  const pending = new Set();
  const retryAfter = new Map();
  let fetchTimer = 0;

  const SUCCESS_CACHE_MS = 10 * 60 * 1000;
  const MISSING_RETRY_MS = 2 * 60 * 1000;
  const ERROR_RETRY_MS = 30 * 1000;
  const BATCH_SIZE = 48;

  function cleanId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function formatCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return Math.round(number).toLocaleString("en-US");
  }

  function enabled() {
    const settings = DS.state?.settings || {};
    return !!(settings.enabled && settings.showExactMessageCounts);
  }

  function botIdFromCard(card, item = null) {
    const href = item?.anchor?.href || card?.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']")?.href || "";
    return cleanId(DS.botIdFromHref?.(href) || DS.chatIdFromHref?.(href));
  }

  function countNode(card) {
    const icon = card?.querySelector?.("svg.lucide-message-square-text");
    if (!icon) return null;
    const row = icon.parentElement;
    if (!row) return null;
    return [...row.querySelectorAll("p, span")].find(node => node !== icon && String(node.textContent || "").trim()) || null;
  }

  function restoreNode(node) {
    if (!node?.dataset || node.dataset.dsExactMessageCountApplied !== "1") return;
    if (node.dataset.dsExactMessageCountOriginal !== undefined) node.textContent = node.dataset.dsExactMessageCountOriginal;
    if (node.dataset.dsExactMessageCountOriginalTitle !== undefined) {
      const title = node.dataset.dsExactMessageCountOriginalTitle;
      if (title) node.setAttribute("title", title);
      else node.removeAttribute("title");
    }
    delete node.dataset.dsExactMessageCountApplied;
    delete node.dataset.dsExactMessageCountValue;
  }

  function applyToCard(card, item = null) {
    const node = countNode(card);
    if (!node) return false;

    if (!enabled()) {
      restoreNode(node);
      return false;
    }

    const id = botIdFromCard(card, item);
    const exact = id ? counts.get(id) : null;
    if (!Number.isFinite(exact)) return false;

    if (node.dataset.dsExactMessageCountApplied !== "1") {
      node.dataset.dsExactMessageCountOriginal = String(node.textContent || "");
      node.dataset.dsExactMessageCountOriginalTitle = String(node.getAttribute("title") || "");
    }
    const formatted = formatCount(exact);
    node.textContent = formatted;
    node.title = `Exact public message count: ${formatted}`;
    node.dataset.dsExactMessageCountApplied = "1";
    node.dataset.dsExactMessageCountValue = String(exact);
    return true;
  }

  function scheduleFetch() {
    if (!enabled() || fetchTimer) return;
    fetchTimer = window.setTimeout(() => {
      fetchTimer = 0;
      fetchMissingCounts();
    }, 120);
  }

  function queueMissingId(id) {
    if (!id || counts.has(id) || pending.has(id)) return;
    if ((retryAfter.get(id) || 0) > Date.now()) return;
    pending.add(id);
  }

  function apply() {
    if (!enabled()) {
      document.querySelectorAll("[data-ds-exact-message-count-applied='1']").forEach(restoreNode);
      return;
    }

    const seen = new Set();
    let queued = false;
    for (const item of DS.collectCards?.() || []) {
      if (!item?.card || seen.has(item.card)) continue;
      seen.add(item.card);
      const id = botIdFromCard(item.card, item);
      if (id && !counts.has(id)) {
        const before = pending.size;
        queueMissingId(id);
        queued = queued || pending.size !== before;
      }
      applyToCard(item.card, item);
    }
    if (queued) scheduleFetch();
  }

  function acceptRows(rows) {
    let changed = false;
    const now = Date.now();
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = cleanId(row?.id);
      const count = Number(row?.count);
      if (!id || !Number.isFinite(count) || count < 0) continue;
      const rounded = Math.round(count);
      retryAfter.set(id, now + SUCCESS_CACHE_MS);
      pending.delete(id);
      if (counts.get(id) === rounded) continue;
      counts.set(id, rounded);
      changed = true;
    }
    if (changed) {
      apply();
      DS.scheduleRun?.();
    }
  }

  function runtimeMessage(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function fetchMissingCounts() {
    if (!enabled() || !pending.size) return;
    const ids = [...pending].slice(0, BATCH_SIZE);
    ids.forEach(id => pending.delete(id));

    const response = await runtimeMessage({ type: "DS_EXACT_MESSAGE_COUNTS_FETCH", ids });
    if (response?.ok) {
      acceptRows(response.counts);
      const found = new Set((response.counts || []).map(row => cleanId(row?.id)).filter(Boolean));
      const missing = Array.isArray(response.missing) ? response.missing.map(cleanId).filter(Boolean) : ids.filter(id => !found.has(id));
      const until = Date.now() + MISSING_RETRY_MS;
      missing.forEach(id => retryAfter.set(id, until));
    } else {
      const until = Date.now() + ERROR_RETRY_MS;
      ids.forEach(id => retryAfter.set(id, until));
    }

    if (pending.size) scheduleFetch();
  }

  function receive(message) {
    if (message?.source !== SOURCE || message?.type !== "DSQ_EXACT_MESSAGE_COUNTS") return;
    acceptRows(message.counts);
  }

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    receive(event.data);
  });

  for (const message of window[BUFFER_KEY] || []) receive(message);

  DS.getExactBotMessageCount = id => {
    const value = counts.get(cleanId(id));
    return Number.isFinite(value) ? value : null;
  };
  DS.applyExactMessageCounts = apply;
})();
