(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  const classText = el => DS.classText?.(el) || String(el?.className || "");
  const normalizedRowTextCache = new WeakMap();
  const messageCountCache = new WeakMap();

  function normalizedRowText(row) {
    if (!(row instanceof Element)) return "";
    const raw = String(row.textContent || "");
    const cached = normalizedRowTextCache.get(row);
    if (cached?.raw === raw) return cached.normalized;
    const normalized = DS.normalize(raw);
    normalizedRowTextCache.set(row, { raw, normalized });
    return normalized;
  }

  function setRowClass(row, className, enabled) {
    if (typeof DS.setClassState === "function") return DS.setClassState(row, className, !!enabled);
    const has = row?.classList?.contains?.(className);
    if (has === !!enabled) return false;
    row?.classList?.toggle?.(className, !!enabled);
    return true;
  }

  function setRowDataset(row, key, value) {
    if (typeof DS.setDatasetIfChanged === "function") return DS.setDatasetIfChanged(row, key, value);
    if (!row?.dataset) return false;
    const next = String(value ?? "");
    if (row.dataset[key] === next) return false;
    row.dataset[key] = next;
    return true;
  }

  function setText(node, value) {
    if (typeof DS.setTextIfChanged === "function") return DS.setTextIfChanged(node, value);
    const next = String(value ?? "");
    if (!node || node.textContent === next) return false;
    node.textContent = next;
    return true;
  }

  function hasChatLink(el) {
    return DS.qsa("a[href*='/chat/']", el).some(link => DS.chatIdFromHref(link.href));
  }

  function ancestors(el) {
    const list = [];

    for (let node = el; node && node !== document; node = node.parentElement) {
      list.push(node);
    }

    return list;
  }

  function findCommonAncestor(elements) {
    if (!elements.length) return null;

    const paths = elements.map(ancestors);

    return paths[0].find(candidate => paths.every(path => path.includes(candidate))) || null;
  }

  function isGoodChatListHost(el) {
    const cls = classText(el);

    return (
      cls.includes("flex") &&
      cls.includes("flex-col") &&
      DS.qsa("a[href*='/chat/']", el).filter(link => DS.chatIdFromHref(link.href)).length >= 2
    );
  }

  function findChatListHost(rows) {
    if (!rows.length) return null;

    const parents = [...new Set(rows.map(item => item.row.parentElement).filter(Boolean))];
    if (parents.length === 1) return parents[0];

    const common = findCommonAncestor(rows.map(item => item.row));

    if (common && common !== document.body && common.id !== "root" && isGoodChatListHost(common)) {
      return common;
    }

    let node = common;

    while (node && node !== document.body && node.id !== "root") {
      if (isGoodChatListHost(node)) return node;
      node = node.parentElement;
    }

    return parents[0] || null;
  }

  function findInsertionMarker(host) {
    const loadMore = DS.findLoadMoreButton?.();
    if (!loadMore) return null;

    return DS.findDirectChildUnder?.(host, loadMore) || null;
  }

  function unhideOldSortContainers() {
    DS.qsa("[data-ds-qol-empty-chat-batch='1']").forEach(el => {
      el.style.display = "";
      delete el.dataset.dsQolEmptyChatBatch;
    });
  }

  function hideEmptyOldParents(parents, host) {
    const loadMore = DS.findLoadMoreButton?.();

    parents.forEach(parent => {
      if (!parent || parent === host) return;
      if (loadMore && parent.contains(loadMore)) return;
      if (hasChatLink(parent)) return;

      const cls = classText(parent);
      if (!cls.includes("flex-col")) return;

      parent.dataset.dsQolEmptyChatBatch = "1";
      parent.style.display = "none";
    });
  }

  function directNodeUnder(parent, descendant) {
    if (!parent || !descendant || parent === descendant) return null;

    let child = descendant;

    while (child && child.parentElement && child.parentElement !== parent) {
      child = child.parentElement;
    }

    return child?.parentElement === parent ? child : null;
  }

  function orderAlreadyCorrect(host, sortedRows, marker) {
    const wanted = sortedRows.map(item => item.row);
    const current = [];

    for (const child of [...host.children]) {
      if (child === marker) break;
      if (wanted.includes(child)) current.push(child);
    }

    if (current.length !== wanted.length) return false;

    return current.every((child, index) => child === wanted[index]);
  }

  function numberFromText(text) {
    const clean = String(text || "").trim();
    if (!/^\d{1,6}$/.test(clean)) return null;

    const value = Number(clean);
    return Number.isFinite(value) ? value : null;
  }

  DS.collectChatRows = function collectChatRows() {
    const rows = [];
    const seen = new Set();

    DS.qsa("a[href*='/chat/']").forEach(anchor => {
      const id = DS.chatIdFromHref(anchor.href);
      if (!id) return;

      let el = anchor;

      for (let i = 0; el && i < 12; i++, el = el.parentElement) {
        if (el === document.body || el.id === "root") break;

        const cls = classText(el);
        const textLen = DS.normalize(el.textContent).length;
        const chatLinks = DS.qsa("a[href*='/chat/']", el).filter(link => DS.chatIdFromHref(link.href));

        const looksLikeRow =
          cls.includes("rounded") &&
          cls.includes("relative") &&
          chatLinks.length >= 1 &&
          chatLinks.length <= 3 &&
          textLen > 10 &&
          textLen < 2600;

        if (looksLikeRow) {
          if (!seen.has(el)) {
            seen.add(el);
            el.dataset.dsQolChatRow = "1";
            el.dataset.dsQolChatId = id;
            rows.push({ row: el, anchor, id, index: rows.length });
          }

          return;
        }
      }
    });

    return rows;
  };

  DS.getChatRowTitle = function getChatRowTitle(row) {
    const heading = DS.qsa("p.text-heading-6, span.text-heading-6, h2, h3", row)
      .map(el => String(el.textContent || "").trim())
      .find(text => text && text !== "•" && text.length <= 100);

    if (heading) return heading;

    const titleCandidates = DS.qsa("p, span, h2, h3", row)
      .map(el => String(el.textContent || "").trim())
      .filter(text => text && text !== "•" && text.length <= 100);

    return titleCandidates[0] || "";
  };

  DS.getChatRowMessageCount = function getChatRowMessageCount(row) {
    if (!(row instanceof Element)) return null;
    const rawText = String(row.textContent || "");
    const cached = messageCountCache.get(row);
    if (cached?.rawText === rawText) return cached.count;

    let count = null;
    const icons = DS.qsa("svg.lucide-message-square-text", row);

    for (const icon of icons) {
      let wrapper = icon.parentElement;

      for (let i = 0; wrapper && wrapper !== row && i < 5; i++, wrapper = wrapper.parentElement) {
        const numbers = DS.qsa("p", wrapper)
          .map(el => numberFromText(el.textContent))
          .filter(value => value !== null);

        if (numbers.length) {
          count = numbers[numbers.length - 1];
          break;
        }
      }
      if (count !== null) break;
    }

    if (count === null) {
      const text = rawText.replace(/\s+/g, " ");

      const afterTime = text.match(/(?:ago|yesterday|today)\s*[•·]\s*(\d{1,6})\b/i);
      if (afterTime) count = Number(afterTime[1]);

      if (count === null) {
        const bulletNumbers = [...text.matchAll(/[•·]\s*(\d{1,6})\b/g)]
          .map(match => Number(match[1]))
          .filter(Number.isFinite);
        if (bulletNumbers.length) count = bulletNumbers[bulletNumbers.length - 1];
      }

      if (count === null) {
        const messageWords = text.match(/(\d{1,6})\s+(?:messages?|msgs?)\b/i);
        if (messageWords) count = Number(messageWords[1]);
      }
    }

    messageCountCache.set(row, { rawText, count });
    return count;
  };

  DS.applyChatListSearch = function applyChatListSearch(rows) {
    const input = document.getElementById("ds-qol-chat-search");
    const query = DS.normalize(input?.value || "");

    for (const { row } of rows) {
      const hidden = !!query && !normalizedRowText(row).includes(query);
      setRowClass(row, "ds-chat-row-hidden-by-search", hidden);
    }
  };

  function matchesMessageFilter(count, filter) {
    if (filter === "all") return true;
    if (!Number.isFinite(count)) return filter === "unknown";
    if (filter === "0") return count === 0;
    if (filter === "1-9") return count >= 1 && count <= 9;
    if (filter === "10-49") return count >= 10 && count <= 49;
    if (filter === "50-99") return count >= 50 && count <= 99;
    if (filter === "100-499") return count >= 100 && count <= 499;
    if (filter === "500+") return count >= 500;
    return true;
  }

  function matchesSavedFilter(id, filter) {
    if (filter === "all") return true;
    const favorite = !!(id && DS.state.favoriteBotIdSet?.has(id));
    const later = !!(id && DS.state.laterBotIdSet?.has(id));
    if (filter === "favorite") return favorite;
    if (filter === "later") return later;
    if (filter === "both") return favorite && later;
    if (filter === "saved") return favorite || later;
    if (filter === "neither") return !favorite && !later;
    return true;
  }

  DS.applyChatListFilters = function applyChatListFilters(rows) {
    const settings = DS.state?.settings || {};
    const openedFilter = document.getElementById("ds-qol-chat-opened-filter")?.value || settings.chatListOpenedFilter || "all";
    const messageFilter = document.getElementById("ds-qol-chat-message-filter")?.value || settings.chatListMessageFilter || "all";
    const savedFilter = document.getElementById("ds-qol-chat-saved-filter")?.value || settings.chatListSavedFilter || "all";
    const blockedFilter = document.getElementById("ds-qol-chat-blocked-filter")?.value || settings.chatListBlockedFilter || "all";
    let visible = 0;

    for (const item of rows) {
      const opened = !!DS.state.openedChats?.has(item.id);
      const blocked = !!DS.state.blockedBotIdSet?.has(item.id);
      const count = DS.getChatRowMessageCount(item.row);
      const openedMatches = openedFilter === "all" || (openedFilter === "opened" ? opened : !opened);
      const messagesMatch = matchesMessageFilter(count, messageFilter);
      const savedMatches = matchesSavedFilter(item.id, savedFilter);
      const blockedMatches = blockedFilter === "all" || (blockedFilter === "blocked" ? blocked : !blocked);
      const matches = openedMatches && messagesMatch && savedMatches && blockedMatches;
      setRowClass(item.row, "ds-qol-chat-row-blocked", blocked);
      setRowDataset(item.row, "dsQolBlocked", blocked ? "1" : "0");
      setRowClass(item.row, "ds-chat-row-hidden-by-filter", !matches);
      if (matches && !item.row.classList.contains("ds-chat-row-hidden-by-search")) visible += 1;
    }

    const summary = document.getElementById("ds-qol-chat-filter-summary");
    if (summary) setText(summary, `Showing ${visible}/${rows.length}`);
  };

  DS.findDirectChildUnder = function findDirectChildUnder(parent, descendant) {
    return directNodeUnder(parent, descendant);
  };

  DS.sortChatRows = function sortChatRows(rows) {
    if (DS.state.chatListSorting) return;

    const rawMode =
      document.getElementById("ds-qol-chat-sort")?.value ||
      DS.state.settings.chatListSortMode ||
      "default";
    const mode = rawMode;

    if (mode === "default") return;
    if (rows.length < 2) return;

    DS.state.chatListSorting = true;

    try {
      unhideOldSortContainers();

      const host = findChatListHost(rows);
      if (!host) return;

      const oldParents = [...new Set(rows.map(item => item.row.parentElement).filter(Boolean))];

      const sorted = [...rows].sort((a, b) => {
        if (mode === "messages-asc" || mode === "messages-desc") {
          const aCount = DS.getChatRowMessageCount(a.row);
          const bCount = DS.getChatRowMessageCount(b.row);
          if (!Number.isFinite(aCount) && Number.isFinite(bCount)) return 1;
          if (Number.isFinite(aCount) && !Number.isFinite(bCount)) return -1;
          if (Number.isFinite(aCount) && Number.isFinite(bCount)) {
            const diff = mode === "messages-desc" ? bCount - aCount : aCount - bCount;
            if (diff !== 0) return diff;
          }
        } else {
          const nameA = DS.getChatRowTitle(a.row).toLowerCase();
          const nameB = DS.getChatRowTitle(b.row).toLowerCase();
          const diff = mode === "alpha-desc"
            ? nameB.localeCompare(nameA)
            : nameA.localeCompare(nameB);

          if (diff !== 0) return diff;
        }

        return a.index - b.index;
      });

      const marker = findInsertionMarker(host);

      if (orderAlreadyCorrect(host, sorted, marker)) return;

      sorted.forEach(({ row }) => {
        if (marker && marker.parentElement === host) {
          host.insertBefore(row, marker);
        } else {
          host.appendChild(row);
        }
      });

      hideEmptyOldParents(oldParents, host);
    } finally {
      setTimeout(() => {
        DS.state.chatListSorting = false;
      }, 0);
    }
  };

  const RANDOM_HOME_PAGE_KEY = "public_characters_alias/sort/_text_match(buckets: 3):desc,num_messages_24h:desc[page]";
  const LAST_HOME_DISCOVERY_URL_KEY = "dsLastHomeDiscoveryUrl";
  const RANDOM_HOME_META_TTL = 10 * 60 * 1000;
  let randomHomeMeta = null;
  let randomChatRunning = false;

  function runtimeMessage(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response || null);
        });
      } catch { resolve(null); }
    });
  }

  function secureRandomInt(maxExclusive) {
    const max = Math.floor(Number(maxExclusive) || 0);
    if (max <= 1) return 0;
    if (!globalThis.crypto?.getRandomValues) return Math.floor(Math.random() * max);
    const limit = Math.floor(0x100000000 / max) * max;
    const values = new Uint32Array(1);
    do { crypto.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % max;
  }

  function shuffledRandom(items) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = secureRandomInt(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function wrapperFromHtml(html) {
    const source = String(html || "").trim();
    if (!source) return null;

    const parsed = new DOMParser().parseFromString(source, "text/html");
    const wrapper = parsed.body.firstElementChild;
    if (!wrapper) return null;

    // Helper-tab markup comes from SpicyChat, but keep imported fragments inert
    // before attaching them to the live page.
    wrapper.querySelectorAll("script, iframe, object, embed").forEach(node => node.remove());
    for (const node of [wrapper, ...wrapper.querySelectorAll("*")]) {
      for (const attr of [...(node.attributes || [])]) {
        if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      }
    }

    return document.importNode(wrapper, true);
  }

  function botIdFromLink(anchor) {
    const href = String(anchor?.getAttribute?.("href") || anchor?.href || "");
    return DS.botIdFromHref?.(href) || DS.chatIdFromHref?.(href) || "";
  }

  function randomHomeEntriesFromCards(cardHtml, pageUrl) {
    const seen = new Set();
    const entries = [];
    for (const item of Array.isArray(cardHtml) ? cardHtml : []) {
      const html = typeof item === "string" ? item : item?.html || "";
      const wrapper = wrapperFromHtml(html);
      if (!wrapper) continue;
      const anchor = wrapper.querySelector("a[href*='/chat/']");
      if (!anchor) continue;
      try { anchor.href = new URL(anchor.getAttribute("href"), pageUrl).href; } catch {}
      const id = botIdFromLink(anchor);
      if (!id || seen.has(id)) continue;
      const card = anchor.closest("div.relative.group.rounded-xl") || anchor.closest("div[class*='rounded-xl']") || wrapper.querySelector("div.relative.group.rounded-xl") || wrapper;
      if (!card) continue;
      seen.add(id);
      entries.push({ id, href: anchor.href, anchor, card });
    }
    return entries;
  }

  async function loadRenderedRandomHomePage(page, pageKey = RANDOM_HOME_PAGE_KEY, baseUrl = `${location.origin}/`) {
    const pageUrl = randomHomePageUrl(page, pageKey, baseUrl);
    const response = await runtimeMessage({
      type: "DS_LISTING_REFILL_PAGE",
      url: pageUrl,
      expectedPage: page
    });
    if (!response?.ok) throw new Error(response?.error || response?.status || "Home helper page failed");
    return {
      cards: response.cards || [],
      page: Number(response.page || page) || page,
      pageCount: Math.max(1, Number(response.lastPage || 1) || 1),
      url: response.baseUrl || pageUrl
    };
  }

  async function randomHomeBaseUrl() {
    const settings = DS.state?.settings || {};
    if (settings.randomChatUseLastHomeFilters === false) return `${location.origin}/`;
    try {
      const stored = await DS.storageGet?.([LAST_HOME_DISCOVERY_URL_KEY]);
      const raw = String(stored?.[LAST_HOME_DISCOVERY_URL_KEY] || "");
      const url = new URL(raw || `${location.origin}/`);
      if (url.origin !== location.origin || (url.pathname.replace(/\/+$/, "") || "/") !== "/") return `${location.origin}/`;
      url.searchParams.delete("dsListingRefill");
      for (const key of [...url.searchParams.keys()]) {
        if (/\[page\]$/i.test(key)) url.searchParams.delete(key);
      }
      return url.href;
    } catch {
      return `${location.origin}/`;
    }
  }

  async function getRandomHomeMeta() {
    const baseUrl = await randomHomeBaseUrl();
    if (randomHomeMeta && randomHomeMeta.baseUrl === baseUrl && Date.now() - randomHomeMeta.loadedAt < RANDOM_HOME_META_TTL) return randomHomeMeta;
    const firstUrl = randomHomePageUrl(1, RANDOM_HOME_PAGE_KEY, baseUrl);
    const response = await runtimeMessage({ type: "DS_LISTING_REFILL_PAGE", url: firstUrl, expectedPage: 1 });
    if (!response?.ok) throw new Error(response?.error || response?.status || "Home helper page failed");
    randomHomeMeta = {
      loadedAt: Date.now(),
      pageCount: Math.max(1, Number(response.lastPage || 1) || 1),
      pageKey: RANDOM_HOME_PAGE_KEY,
      baseUrl
    };
    return randomHomeMeta;
  }

  function randomHomePageUrl(page, pageKey = RANDOM_HOME_PAGE_KEY, baseUrl = `${location.origin}/`) {
    const url = new URL(baseUrl, location.origin);
    url.searchParams.delete("dsListingRefill");
    url.searchParams.set(pageKey, String(Math.max(1, Math.floor(Number(page) || 1))));
    return url.href;
  }

  function randomEntryHideReason(entry) {
    const settings = DS.state?.settings || {};
    if (!entry?.card || !entry?.anchor) return "invalid card";
    if (settings.randomChatIncludeLater === false && DS.state?.laterBotIdSet?.has(entry.id)) return "saved for Later";
    if (settings.randomChatIncludeFavorites === false && DS.state?.favoriteBotIdSet?.has(entry.id)) return "favorite history";
    return DS.shouldHideCard?.(entry.card, entry.anchor, {
      discovery: true,
      home: true,
      ignoreOpened: settings.randomChatIncludeOpened !== false
    }) || "";
  }

  async function chooseTrueRandomHomeBot() {
    let meta = await getRandomHomeMeta();
    const attemptedPages = new Set();
    const seenBots = new Set();
    let refreshedMeta = false;

    for (let attempt = 0; attempt < Math.min(12, Math.max(4, meta.pageCount)); attempt += 1) {
      if (attemptedPages.size >= meta.pageCount) {
        if (refreshedMeta) break;
        randomHomeMeta = null;
        meta = await getRandomHomeMeta();
        attemptedPages.clear();
        refreshedMeta = true;
      }

      let page = 1;
      do { page = secureRandomInt(meta.pageCount) + 1; } while (attemptedPages.has(page) && attemptedPages.size < meta.pageCount);
      attemptedPages.add(page);
      DS.setQuickStatus?.(`Random Chat: checking Home page ${page} of ${meta.pageCount}...`, true);

      try {
        const rendered = await loadRenderedRandomHomePage(page, meta.pageKey, meta.baseUrl);
        if (rendered.pageCount > meta.pageCount) {
          meta.pageCount = rendered.pageCount;
          randomHomeMeta = { ...meta, loadedAt: Date.now() };
        }
        const candidates = shuffledRandom(randomHomeEntriesFromCards(rendered.cards, rendered.url))
          .filter(entry => !seenBots.has(entry.id))
          .filter(entry => !randomEntryHideReason(entry));
        candidates.forEach(entry => seenBots.add(entry.id));
        if (candidates.length) return { ...candidates[secureRandomInt(candidates.length)], page, pageCount: meta.pageCount };
      } catch (error) {
        DS.runtimeLog?.("warn", "random-chat", "Random Home helper page failed", { page, error: error?.message || String(error) });
        // A single stale/failed pagination request should not kill the roulette.
        // Try a different rendered Home page before reporting a failure.
      }
    }
    return null;
  }

  function findRandomChatButtonHost() {
    const heading = [...document.querySelectorAll("h1, h2")].find(el => {
      const text = DS.normalize?.(el.textContent || "") || String(el.textContent || "").trim().toLowerCase();
      return text === "chats" || text === "chat";
    });
    if (heading?.parentElement) return heading.parentElement;

    const rows = DS.collectChatRows?.() || [];
    const host = findChatListHost(rows);
    return host?.parentElement || host || document.querySelector("main") || document.body;
  }

  function removeRandomChatButton() {
    document.getElementById("ds-qol-random-chat")?.remove();
  }

  function applyRandomChatButton() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.showRandomChatButton || !DS.isChatListPage()) {
      removeRandomChatButton();
      return;
    }

    let button = document.getElementById("ds-qol-random-chat");
    const host = findRandomChatButtonHost();
    if (!host) return;

    if (!button) {
      button = document.createElement("button");
      button.id = "ds-qol-random-chat";
      button.type = "button";
      button.className = "ds-qol-random-chat-button";
      button.textContent = "Random Chat";
      button.title = "Pick a random bot from a random SpicyChat Home page";
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        if (randomChatRunning) return;
        randomChatRunning = true;
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "Picking...";
        try {
          const choice = await chooseTrueRandomHomeBot();
          if (!choice?.href) {
            DS.setQuickStatus?.("Random Chat could not find an eligible bot after several random Home pages.");
            return;
          }
          DS.setQuickStatus?.(`Random Chat picked Home page ${choice.page}/${choice.pageCount}. Opening bot...`, true);
          location.href = choice.href;
        } catch (error) {
          randomHomeMeta = null;
          DS.setQuickStatus?.(`Random Chat failed: ${error?.message || "could not render SpicyChat Home"}`);
        } finally {
          randomChatRunning = false;
          if (button.isConnected) {
            button.disabled = false;
            button.textContent = originalText;
          }
        }
      });
    }

    if (!button.isConnected || button.parentElement !== host) host.appendChild(button);
    const exclusions = [];
    if (settings.randomChatIncludeOpened === false) exclusions.push("opened");
    if (settings.randomChatIncludeLater === false) exclusions.push("Later");
    if (settings.randomChatIncludeFavorites === false) exclusions.push("favorite-history");
    const scope = settings.randomChatUseLastHomeFilters === false ? "all Home results" : "your last Home filters when available";
    button.title = exclusions.length
      ? `Pick a random eligible bot from ${scope} (${exclusions.join(", ")} bots excluded)`
      : `Pick a random eligible bot from ${scope}`;
  }

  DS.applyRandomChatButton = applyRandomChatButton;

  DS.applyChatListTools = function applyChatListTools() {
    const { settings } = DS.state;
    applyRandomChatButton();

    if (!settings.enabled || !settings.showChatListTools || !DS.isChatListPage()) {
      DS.applyChatOrganizer?.();
      if (DS.state.chatListToolsWasActive) {
        DS.qsa(".ds-chat-row-hidden-by-search").forEach(row => row.classList.remove("ds-chat-row-hidden-by-search"));
        DS.qsa(".ds-chat-row-hidden-by-filter").forEach(row => row.classList.remove("ds-chat-row-hidden-by-filter"));
        unhideOldSortContainers();
      }
      DS.state.chatListToolsWasActive = false;
      return;
    }

    DS.state.chatListToolsWasActive = true;
    const rows = DS.collectChatRows();
    DS.applyChatListSearch(rows);
    DS.applyChatListFilters(rows);
    DS.sortChatRows(rows);
    DS.applyChatOrganizer?.();
    DS.updateQuickPanel?.();
  };
})();