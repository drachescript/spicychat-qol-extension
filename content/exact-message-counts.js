(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const SOURCE = "spicychat-qol-exact-message-counts";
  const BUFFER_KEY = "__DSQ_EXACT_MESSAGE_COUNT_BUFFER__";
  const counts = new Map();
  const createdAt = new Map();
  const createdAtKnown = new Set();
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

  function normalizeCreatedAt(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value < 10_000_000_000 ? value * 1000 : value;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && String(value).trim() !== "") {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatCreatedAt(value) {
    const timestamp = normalizeCreatedAt(value);
    if (!Number.isFinite(timestamp)) return "";
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit"
    });
  }

  function removeCreationDate(card) {
    card?.querySelectorAll?.(".ds-bot-created-date").forEach(node => node.remove());
  }

  function removeProfileCreationDate() {
    document.querySelectorAll(".ds-bot-profile-created-date").forEach(node => node.remove());
  }

  function creationDateAnchor(card) {
    const icon = card?.querySelector?.("svg.lucide-message-square-text");
    if (!icon) return null;

    // The first parent is only the message-count stat. The previous v0.2.14
    // implementation inserted the date beside that group, which made the date
    // compete with SpicyChat's right-side token/stat count for horizontal room.
    // Anchor after the *whole* bottom stats row instead so the date gets its own
    // line directly underneath and can never push the native count away.
    let current = icon.parentElement;
    for (let depth = 0; current && current !== card && depth < 6; depth += 1) {
      const className = String(current.className || "");
      if (/\bjustify-between\b/.test(className) && current.querySelector?.("svg.lucide-message-square-text")) {
        return current;
      }
      current = current.parentElement;
    }

    const messageStat = icon.parentElement;
    const messageGroup = messageStat?.parentElement;
    const fallbackRow = messageGroup?.parentElement;
    if (fallbackRow && card.contains(fallbackRow)) return fallbackRow;
    if (messageGroup && card.contains(messageGroup)) return messageGroup;
    return messageStat;
  }

  function profileBotId() {
    const match = String(location.pathname || "").match(/^\/chatbot\/([0-9a-f-]{20,})(?:\/|$)/i);
    return cleanId(match?.[1]);
  }

  function profileCreationDateAnchor() {
    const tokenLink = document.querySelector('a[aria-label="tokens-info"]');
    if (!tokenLink) return null;
    return tokenLink;
  }

  function featureSettings() {
    const settings = DS.state?.settings || {};
    return {
      enabled: !!settings.enabled,
      counts: !!settings.showExactMessageCounts,
      dates: !!settings.showBotCreationDates
    };
  }

  function enabled() {
    const settings = featureSettings();
    return settings.enabled && (settings.counts || settings.dates);
  }

  function exactCountsEnabled() {
    const settings = featureSettings();
    return settings.enabled && settings.counts;
  }

  function creationDatesEnabled() {
    const settings = featureSettings();
    return settings.enabled && settings.dates;
  }

  function applyCreationDate(card, id) {
    if (!(card instanceof Element)) return false;
    if (!creationDatesEnabled()) {
      removeCreationDate(card);
      return false;
    }

    // On a chatbot profile, collectCards() can also see the profile summary as
    // a card-like container. The profile has its own dedicated Created label
    // beside Tokens, so never add the listing-card Created line there too.
    const profileId = profileBotId();
    const profileTokenLink = profileId ? document.querySelector('a[aria-label="tokens-info"]') : null;
    if (profileId && id === profileId && profileTokenLink && card.contains(profileTokenLink)) {
      removeCreationDate(card);
      return false;
    }

    const value = id ? createdAt.get(id) : null;
    const formatted = formatCreatedAt(value);
    if (!formatted) {
      removeCreationDate(card);
      return false;
    }

    let node = card.querySelector(".ds-bot-created-date");
    const text = `Created: ${formatted}`;
    if (!node) {
      const anchor = creationDateAnchor(card);
      if (!anchor?.parentElement) return false;
      node = document.createElement("div");
      node.className = "ds-bot-created-date";
      node.dataset.dsOwned = "1";
      anchor.insertAdjacentElement("afterend", node);
    }
    if (node.textContent !== text) node.textContent = text;
    const raw = String(value);
    if (node.dataset.dsCreatedAt !== raw) node.dataset.dsCreatedAt = raw;
    return true;
  }

  function applyProfileCreationDate(id = profileBotId()) {
    if (!creationDatesEnabled() || !id) {
      removeProfileCreationDate();
      return false;
    }

    const value = createdAt.get(id);
    const formatted = formatCreatedAt(value);
    if (!formatted) {
      removeProfileCreationDate();
      return false;
    }

    const anchor = profileCreationDateAnchor();
    if (!anchor?.parentElement) return false;

    let node = document.querySelector(".ds-bot-profile-created-date");
    const text = `Created: ${formatted}`;
    if (!node) {
      node = document.createElement("div");
      node.className = "ds-bot-profile-created-date";
      node.dataset.dsOwned = "1";
      anchor.insertAdjacentElement("afterend", node);
    }
    if (node.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", node);
    if (node.textContent !== text) node.textContent = text;
    const raw = String(value);
    if (node.dataset.dsCreatedAt !== raw) node.dataset.dsCreatedAt = raw;
    if (node.dataset.dsBotId !== id) node.dataset.dsBotId = id;
    return true;
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

  function noteStableWriteSkip() {
    if (!DS.state?.runtimeCounters) return;
    DS.state.runtimeCounters.exactMessageCountStableWriteSkips =
      Number(DS.state.runtimeCounters.exactMessageCountStableWriteSkips || 0) + 1;
  }

  function restoreNode(node) {
    if (!node?.dataset || node.dataset.dsExactMessageCountApplied !== "1") return;
    const originalText = node.dataset.dsExactMessageCountOriginal;
    const originalTitle = node.dataset.dsExactMessageCountOriginalTitle;
    if (originalText !== undefined && node.textContent !== originalText) node.textContent = originalText;
    if (originalTitle !== undefined) {
      const currentTitle = node.getAttribute("title") || "";
      if (originalTitle) {
        if (currentTitle !== originalTitle) node.setAttribute("title", originalTitle);
      } else if (currentTitle) {
        node.removeAttribute("title");
      }
    }
    delete node.dataset.dsExactMessageCountApplied;
    delete node.dataset.dsExactMessageCountValue;
  }

  function applyToCard(card, item = null) {
    if (!(card instanceof Element)) return false;
    const node = countNode(card);

    if (!enabled()) {
      if (node) restoreNode(node);
      removeCreationDate(card);
      return false;
    }

    const id = botIdFromCard(card, item);
    const dateApplied = applyCreationDate(card, id);

    // Creation dates are independent from Exact Message Counts. Turning exact
    // counts off restores SpicyChat's native rounded count while leaving the
    // optional Created line alone.
    if (!exactCountsEnabled()) {
      if (node) restoreNode(node);
      return dateApplied;
    }

    if (!node) return dateApplied;
    const exact = id ? counts.get(id) : null;
    if (!Number.isFinite(exact)) return dateApplied;

    const formatted = formatCount(exact);
    const exactValue = String(exact);
    const expectedTitle = `Exact public message count: ${formatted}`;

    // Inspector showed repeated exact-count writes even when the same value was
    // already rendered. Treat the fully-correct state as a stable pass and do
    // not touch text/title/dataset again.
    if (
      node.dataset.dsExactMessageCountApplied === "1" &&
      node.dataset.dsExactMessageCountValue === exactValue &&
      String(node.textContent || "") === formatted &&
      String(node.getAttribute("title") || "") === expectedTitle
    ) {
      noteStableWriteSkip();
      return true;
    }

    if (node.dataset.dsExactMessageCountApplied !== "1") {
      node.dataset.dsExactMessageCountOriginal = String(node.textContent || "");
      node.dataset.dsExactMessageCountOriginalTitle = String(node.getAttribute("title") || "");
    }
    if (String(node.textContent || "") !== formatted) node.textContent = formatted;
    if (String(node.getAttribute("title") || "") !== expectedTitle) node.title = expectedTitle;
    if (node.dataset.dsExactMessageCountApplied !== "1") node.dataset.dsExactMessageCountApplied = "1";
    if (node.dataset.dsExactMessageCountValue !== exactValue) node.dataset.dsExactMessageCountValue = exactValue;
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
    if (!id || pending.has(id)) return;
    const needCount = exactCountsEnabled() && !counts.has(id);
    const needDate = creationDatesEnabled() && !createdAtKnown.has(id);
    if (!needCount && !needDate) return;
    if ((retryAfter.get(id) || 0) > Date.now()) return;
    pending.add(id);
  }

  function apply() {
    if (!enabled()) {
      document.querySelectorAll("[data-ds-exact-message-count-applied='1']").forEach(restoreNode);
      document.querySelectorAll(".ds-bot-created-date").forEach(node => node.remove());
      removeProfileCreationDate();
      return;
    }

    const seen = new Set();
    let queued = false;

    // Bot profile pages do not have listing cards, so explicitly queue the
    // current profile ID and render its creation date after SpicyChat's Tokens
    // stat. This reuses the same cached public createdAt lookup as listing cards.
    const profileId = profileBotId();
    if (profileId && creationDatesEnabled()) {
      const before = pending.size;
      queueMissingId(profileId);
      queued = queued || pending.size !== before;
      applyProfileCreationDate(profileId);
    } else {
      removeProfileCreationDate();
    }

    for (const item of DS.collectCards?.() || []) {
      if (!item?.card || seen.has(item.card)) continue;
      seen.add(item.card);
      const id = botIdFromCard(item.card, item);
      if (id) {
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
      const hasCreatedField = Object.prototype.hasOwnProperty.call(row || {}, "createdAt");
      const created = hasCreatedField ? normalizeCreatedAt(row?.createdAt) : null;
      pending.delete(id);

      let rowChanged = false;
      if (counts.get(id) !== rounded) {
        counts.set(id, rounded);
        rowChanged = true;
      }

      // Native SpicyChat Typesense responses do not always include createdAt.
      // Only mark the date as resolved when the source explicitly supplied the
      // field. This lets the background query fill it once without refetching
      // forever if Typesense genuinely has no date for a bot.
      if (hasCreatedField) {
        createdAtKnown.add(id);
        if (Number.isFinite(created)) {
          if (createdAt.get(id) !== created) {
            createdAt.set(id, created);
            rowChanged = true;
          }
        } else if (createdAt.has(id)) {
          createdAt.delete(id);
          rowChanged = true;
        }
      }

      const countResolved = !exactCountsEnabled() || counts.has(id);
      const dateResolved = !creationDatesEnabled() || createdAtKnown.has(id);
      if (countResolved && dateResolved) retryAfter.set(id, now + SUCCESS_CACHE_MS);
      else retryAfter.delete(id);
      changed = changed || rowChanged;
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
  DS.getBotCreatedAt = id => {
    const value = createdAt.get(cleanId(id));
    return Number.isFinite(value) ? value : null;
  };
  DS.applyExactMessageCounts = apply;
})();
