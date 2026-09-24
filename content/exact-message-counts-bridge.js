(() => {
  "use strict";

  if (window.__DSQ_EXACT_MESSAGE_COUNTS_BRIDGE__) return;
  window.__DSQ_EXACT_MESSAGE_COUNTS_BRIDGE__ = true;

  const SOURCE = "spicychat-qol-exact-message-counts";

  // Capture the public count data from SpicyChat's own Typesense responses even
  // while the display option is off. This makes the data available immediately
  // if the option is enabled later and, more importantly, avoids losing the
  // first listing response while extension settings are still loading.

  function urlText(value) {
    if (typeof value === "string") return value;
    if (value && typeof value.url === "string") return value.url;
    try { return String(value || ""); } catch { return ""; }
  }

  function isTypesenseSearch(url) {
    const value = urlText(url);
    return /\/multi_search(?:[/?#]|$)/i.test(value) || /\/collections\/[^/]+\/documents\/search(?:[/?#]|$)/i.test(value);
  }

  function numeric(value) {
    if (typeof value === "string" && !/^\s*\d+(?:\.\d+)?\s*$/.test(value)) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
  }

  function botId(document) {
    const candidates = [
      document?.id,
      document?.uuid,
      document?.character_id,
      document?.characterId,
      document?.chatbot_id,
      document?.chatbotId
    ];
    for (const value of candidates) {
      const id = String(value || "").trim().toLowerCase();
      if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id)) return id;
    }
    return "";
  }

  function exactCount(document) {
    const candidates = [
      document?.num_messages,
      document?.numMessages,
      document?.message_count,
      document?.messageCount,
      document?.messages_count,
      document?.messagesCount,
      document?.total_messages,
      document?.totalMessages
    ];
    for (const value of candidates) {
      const count = numeric(value);
      if (count != null) return count;
    }
    return null;
  }

  function createdAtValue(document) {
    return document?.createdAt ?? document?.created_at ?? null;
  }

  function collectHits(data) {
    const rows = [];
    const pushHit = hit => {
      const document = hit?.document && typeof hit.document === "object" ? hit.document : hit;
      if (!document || typeof document !== "object") return;
      const id = botId(document);
      const count = exactCount(document);
      if (id && count != null) {
        const createdAt = createdAtValue(document);
        const row = { id, count };
        if (createdAt != null) row.createdAt = createdAt;
        rows.push(row);
      }
    };

    const visitResult = result => {
      if (!result || typeof result !== "object") return;
      if (Array.isArray(result.hits)) result.hits.forEach(pushHit);
      if (Array.isArray(result.grouped_hits)) {
        for (const group of result.grouped_hits) {
          if (Array.isArray(group?.hits)) group.hits.forEach(pushHit);
        }
      }
    };

    if (Array.isArray(data?.results)) data.results.forEach(visitResult);
    visitResult(data);

    const deduped = new Map();
    for (const row of rows) {
      const previous = deduped.get(row.id);
      const merged = { id: row.id, count: row.count };
      const createdAt = row.createdAt ?? previous?.createdAt;
      if (createdAt != null) merged.createdAt = createdAt;
      deduped.set(row.id, merged);
    }
    return [...deduped.values()];
  }

  function emitFromData(data) {
    const counts = collectHits(data);
    if (!counts.length) return;
    try {
      window.postMessage({ source: SOURCE, type: "DSQ_EXACT_MESSAGE_COUNTS", counts }, "*");
    } catch {}
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function (...args) {
      const result = originalFetch.apply(this, args);
      if (!isTypesenseSearch(args[0])) return result;
      Promise.resolve(result).then(response => {
        if (!response?.clone) return;
        response.clone().json().then(emitFromData).catch(() => {});
      }).catch(() => {});
      return result;
    };
  }

  const XHR = window.XMLHttpRequest;
  const originalOpen = XHR?.prototype?.open;
  const originalSend = XHR?.prototype?.send;
  if (XHR?.prototype && originalOpen && originalSend) {
    XHR.prototype.open = function (method, url, ...rest) {
      this.__dsqExactMessageCountSearch = isTypesenseSearch(url);
      return originalOpen.call(this, method, url, ...rest);
    };

    XHR.prototype.send = function (...args) {
      if (this.__dsqExactMessageCountSearch) {
        this.addEventListener("load", () => {
          let data = null;
          try {
            if (this.responseType === "json") data = this.response;
            else data = JSON.parse(this.responseText || "null");
          } catch {}
          if (data) emitFromData(data);
        }, { once: true });
      }
      return originalSend.apply(this, args);
    };
  }
})();
