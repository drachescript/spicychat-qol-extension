(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const REFILL_BUTTON_CLASS = "ds-listing-refill-button";
  const REFILL_STOP_BUTTON_CLASS = "ds-listing-refill-stop";
  const EXTRA_GRID_CLASS = "ds-autofill-extra-grid";
  const EXTRA_CARD_ATTR = "data-ds-autofill-extra";
  const REFILL_FAVORITE_CLASS = "ds-refill-favorite-button";
  const REFILL_FAVORITE_FRAME_ID = "ds-listing-refill-favorite-frame";
  const LISTING_FILTER_STATS_CLASS = "ds-listing-filter-stats";
  const MAX_SERIALIZED_CARD_HTML = 500000;
  const REFILL_CANDIDATE_CACHE_TTL_MS = 20 * 60 * 1000;
  const REFILL_CANDIDATE_CACHE_MAX = 600;
  let refillFavoriteFrame = null;
  let refillFavoriteFrameUrl = "";
  let refillFavoriteFrameLoad = null;
  const FALLBACK_PAGE_KEY = "public_characters_alias/sort/_text_match(buckets: 3):desc,num_messages_24h:desc[page]";
  const LAST_HOME_DISCOVERY_URL_KEY = "dsLastHomeDiscoveryUrl";
  const LISTING_REFILL_WORKER = (() => {
    try { return new URLSearchParams(location.search || "").get("dsListingRefill") === "1"; }
    catch { return false; }
  })();
  if (LISTING_REFILL_WORKER) DS.state.listingRefillWorker = true;

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

  function mobileFillBlocked() {
    const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
    return !!env.android || window.innerWidth <= 760;
  }

  function resetRunStats() {
    DS.state.autoFillRunStats = {
      pages: 0,
      received: 0,
      appended: 0,
      duplicates: 0,
      filtered: 0,
      blockedRejected: 0,
      blockedBotRejected: 0,
      blockedCreatorRejected: 0,
      blockedWordRejected: 0,
      blockedTagRejected: 0,
      languageRejected: 0,
      openedRejected: 0,
      laterRejected: 0,
      notInterestedRejected: 0,
      otherRejected: 0,
      filterRejected: 0,
      smartFilterRejected: 0,
      postInsertRejected: 0,
      pagesWithNoSurvivors: 0,
      helperFailures: 0,
      helperReuses: 0,
      helperRecoveries: 0,
      helperGcClosed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheCandidatesStored: 0,
      cacheCandidatesUsed: 0,
      cacheCandidatesExpired: 0,
      metadataExtracted: 0,
      tagsRestored: 0,
      staleResponses: 0,
      nativeRejected: 0,
      domNodesCreated: 0,
      visibleAfter: 0,
      lastRejectReason: "",
      lastError: "",
      lastPage: 0,
      startedAt: Date.now()
    };
  }

  function runStats() {
    if (!DS.state.autoFillRunStats || typeof DS.state.autoFillRunStats !== "object") resetRunStats();
    return DS.state.autoFillRunStats;
  }

  function newRefillRunId() {
    return globalThis.crypto?.randomUUID?.() || `refill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function ensureRefillRunId() {
    if (!DS.state.autoFillRunId) DS.state.autoFillRunId = newRefillRunId();
    return DS.state.autoFillRunId;
  }

  async function releaseRefillPageWorker() {
    const runId = String(DS.state.autoFillRunId || "").trim();
    DS.state.autoFillRunId = "";
    if (!runId) return false;
    const response = await runtimeMessage({ type: "DS_LISTING_REFILL_RELEASE", runId });
    return !!response?.ok;
  }

  DS.stopListingAutoFill = function stopListingAutoFill() {
    if (!DS.state.autoFillRunning) return false;
    DS.state.autoFillStopRequested = true;
    DS.state.autoFillPausedByUser = true;
    DS.setQuickStatus?.("Stopping refill after the current page...", true);
    DS.updateQuickPanel?.();
    ensureListingRefillButton();
    return true;
  };

  function removeListingRefillButton() {
    document.querySelectorAll(`.${REFILL_BUTTON_CLASS}`).forEach(button => button.remove());
  }

  function removeRefillFavoriteFrame() {
    refillFavoriteFrame?.remove();
    refillFavoriteFrame = null;
    refillFavoriteFrameUrl = "";
    refillFavoriteFrameLoad = null;
  }

  function removeExtraCards() {
    document.querySelectorAll(`.${EXTRA_GRID_CLASS}`).forEach(grid => grid.remove());
    removeRefillFavoriteFrame();
  }

  function findListingToolbarHost() {
    const preferred = [...document.querySelectorAll("input")].find(input => {
      const placeholder = String(input.getAttribute("placeholder") || "").toLowerCase();
      if (!isVisible(input) || input.closest("#ds-qol-panel")) return false;
      return placeholder.includes("dive into") || placeholder.includes("search character") || placeholder.includes("search chatbot") || placeholder.includes("search bot");
    });
    if (!preferred) return null;
    let node = preferred.parentElement;
    for (let i = 0; node && i < 4; i++, node = node.parentElement) {
      if (node.children?.length >= 2 && /flex/.test(String(node.className || ""))) return node;
    }
    return preferred.parentElement?.parentElement || preferred.parentElement;
  }

  function ensureListingRefillButton() {
    const settings = DS.state?.settings || {};
    if (LISTING_REFILL_WORKER || !settings.enabled || !settings.showListingRefillButton || !isGoodPageForFill() || mobileFillBlocked()) {
      removeListingRefillButton();
      return;
    }

    let button = document.querySelector(`.${REFILL_BUTTON_CLASS}`);
    const host = findListingToolbarHost();
    if (!host) {
      removeListingRefillButton();
      return;
    }
    if (button && button.parentElement !== host) button.remove(), button = null;
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = REFILL_BUTTON_CLASS;
      button.textContent = "Refill";
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        if (DS.state.autoFillRunning) {
          DS.stopListingAutoFill?.();
          ensureListingRefillButton();
          return;
        }
        await DS.manualListingAutoFill?.();
        ensureListingRefillButton();
      });
      host.appendChild(button);
    }
    const status = DS.getListingAutoFillStatus?.() || {};
    button.classList.toggle(REFILL_STOP_BUTTON_CLASS, !!DS.state.autoFillRunning);
    button.textContent = DS.state.autoFillRunning
      ? (DS.state.autoFillStopRequested ? "Stopping..." : "Stop refill")
      : "Refill";
    button.title = DS.state.autoFillRunning
      ? "Finish the current helper page, then stop listing refill"
      : `Refill listing up to ${Number(settings.autoFillTargetCards || 50)} visible cards (${Number(status.visible || 0)} visible now)`;
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.classList?.contains("ds-hidden")) return false;
    if (el.dataset?.dsHidden === "1" && DS.state.settings.hiddenCardMode !== "dim") return false;

    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function rememberCurrentHomeDiscoveryUrl() {
    if (LISTING_REFILL_WORKER) return;
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return;
    try {
      const url = new URL(location.href);
      url.searchParams.delete("dsListingRefill");
      for (const key of [...url.searchParams.keys()]) {
        if (/\[page\]$/i.test(key)) url.searchParams.delete(key);
      }
      const next = url.href;
      if (DS.state.lastHomeDiscoveryUrl === next) return;
      DS.state.lastHomeDiscoveryUrl = next;
      DS.storageSet?.({ [LAST_HOME_DISCOVERY_URL_KEY]: next });
    } catch {}
  }

  function isGoodPageForFill() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (LISTING_REFILL_WORKER) return false;
    if (path === "/chat" || path === "/chats") return false;
    if (DS.isSingleChatPage?.()) return false;
    if (DS.isChatListPage?.()) return false;
    if (DS.isBotProfilePage?.()) return false;
    if (DS.isFavoriteBotsPage?.() && DS.state.settings.neverHideFavorites !== false) return false;
    // Do not show Fill now on unrelated pages such as Persona/editor screens.
    // A real refill target needs an actual bot-card grid or listing pagination.
    return !!cardGridInDocument(document) || !!paginationNextButton() || !!DS.findListingLoadMoreButton?.();
  }

  function uniqueTargets() {
    const cards = DS.collectCards?.() || [];
    const targets = new Set();

    for (const { card } of cards) {
      const target = DS.getBestHideTarget?.(card) || card;
      if (target) targets.add(target);
    }

    return [...targets];
  }

  function visibleCardCount() {
    return uniqueTargets().filter(isVisible).length;
  }

  function hiddenCardCount() {
    return uniqueTargets().filter(target => target.dataset?.dsHidden === "1" || target.classList?.contains("ds-hidden")).length;
  }

  function buttonText(button) {
    return DS.normalize([
      button.textContent || "",
      button.getAttribute("aria-label") || "",
      button.getAttribute("title") || ""
    ].join(" "));
  }

  DS.findListingLoadMoreButton = function findListingLoadMoreButton() {
    const buttons = DS.qsa("button")
      .filter(button => !button.closest("#ds-qol-panel"))
      .filter(button => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !button.disabled;
      });

    const exact = buttons.find(button => {
      const text = buttonText(button);
      const key = button.querySelector([
        "[data-translate-key='common:loadMore']",
        "[data-translate-key*='loadMore']",
        "[data-translate-key*='load_more']",
        "[data-translate-key*='showMore']"
      ].join(", "));

      return !!key || text === "load more" || text === "show more";
    });

    if (exact) return exact;

    return buttons.find(button => {
      const text = buttonText(button);
      return (
        text.includes("load more") ||
        text.includes("show more") ||
        text.includes("more bots") ||
        text.includes("more chats") ||
        text.includes("more characters")
      );
    }) || null;
  };

  function paginationNextButton() {
    const button = document.querySelector("button[aria-label='next-page']");
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return null;
    return button;
  }

  function pageKeyForUrl(url) {
    for (const key of url.searchParams.keys()) {
      if (/\[page\]$/i.test(key)) return key;
    }
    for (const key of url.searchParams.keys()) {
      if (!key.toLowerCase().includes("public_characters_alias")) continue;
      const bracket = key.indexOf("[");
      if (bracket > 0) return `${key.slice(0, bracket)}[page]`;
    }
    return FALLBACK_PAGE_KEY;
  }

  function canonicalListingSignature(urlLike = location.href) {
    let url;
    try { url = new URL(urlLike, location.href); }
    catch { return ""; }

    const entries = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (/\[page\]$/i.test(key)) continue;
      if (key === "dsListingRefill") continue;
      entries.push([key, value]);
    }

    entries.sort((left, right) => {
      const keyOrder = String(left[0]).localeCompare(String(right[0]));
      return keyOrder || String(left[1]).localeCompare(String(right[1]));
    });

    return JSON.stringify(entries);
  }

  function nativeTagRulesFromUrl(urlLike = location.href) {
    let url;
    try { url = new URL(urlLike, location.href); }
    catch { return { include: [], exclude: [] }; }

    const include = [];
    const exclude = [];
    for (const [key, rawValue] of url.searchParams.entries()) {
      if (!/\[refinementList\]\[tags\](?:\[\d+\])?$/i.test(key)) continue;
      const value = String(rawValue || "").trim();
      if (!value) continue;
      if (value.startsWith("-") && value.length > 1) exclude.push(value.slice(1));
      else include.push(value);
    }

    const unique = values => [...new Map(values
      .map(value => [String(value).trim().toLocaleLowerCase(), String(value).trim()])
      .filter(([key]) => key))
      .values()];

    return { include: unique(include), exclude: unique(exclude) };
  }

  function currentNativeTagRules() {
    return nativeTagRulesFromUrl(location.href);
  }

  function metadataTagSet(meta, wrapper) {
    const values = [];
    if (Array.isArray(meta?.tags)) values.push(...meta.tags);
    if (!values.length && wrapper) {
      values.push(...[...wrapper.querySelectorAll("button")]
        .filter(isNativeTagPillButton)
        .map(button => String(button.getAttribute("aria-label") || button.textContent || "").trim()));
    }
    return new Set(values.map(value => String(value || "").trim().toLocaleLowerCase()).filter(Boolean));
  }

  function nativeTagRejection(meta, wrapper, rules = currentNativeTagRules()) {
    const tags = metadataTagSet(meta, wrapper);
    if (!tags.size) return "";

    const excluded = (rules.exclude || []).find(tag => tags.has(String(tag).toLocaleLowerCase()));
    if (excluded) return `excluded tag "${excluded}"`;

    const includes = rules.include || [];
    if (includes.length && !includes.some(tag => tags.has(String(tag).toLocaleLowerCase()))) {
      return `missing included tag (${includes.join(" / ")})`;
    }
    return "";
  }

  function currentPage() {
    try {
      const url = new URL(location.href);
      for (const [key, raw] of url.searchParams.entries()) {
        if (!/\[page\]$/i.test(key)) continue;
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 1) return Math.floor(value);
      }
    } catch {}

    const active = [...document.querySelectorAll("button[aria-label^='page-']")].find(button => {
      const label = String(button.getAttribute("aria-label") || "");
      if (!/^page-\d+$/.test(label)) return false;
      const cls = String(button.className || "");
      return cls.includes("bg-blue-10") || button.getAttribute("aria-current") === "page";
    });
    return Number(String(active?.getAttribute("aria-label") || "").replace(/^page-/, "")) || 1;
  }

  function lastKnownPage() {
    return Math.max(1, ...[...document.querySelectorAll("button[aria-label^='page-']")]
      .map(button => Number(String(button.getAttribute("aria-label") || "").replace(/^page-/, "")))
      .filter(Number.isFinite));
  }

  function listingUrlForPage(page, sourceHref = location.href) {
    const url = new URL(sourceHref, location.href);
    url.searchParams.set(pageKeyForUrl(url), String(page));
    url.searchParams.delete("dsListingRefill");
    return url.href;
  }

  function botIdFromLink(link) {
    return DS.botIdFromHref?.(link?.href || "") || DS.chatIdFromHref?.(link?.href || "") || "";
  }

  function currentBotIds() {
    const ids = new Set();
    for (const anchor of document.querySelectorAll("a[href*='/chat/'], a[href*='/chatbot/']")) {
      const id = botIdFromLink(anchor);
      if (id) ids.add(id);
    }
    return ids;
  }

  function removeDuplicateExtraCards() {
    const extras = [...document.querySelectorAll(`[${EXTRA_CARD_ATTR}="1"]`)];
    if (!extras.length) return 0;

    // Refill cards can be appended before SpicyChat finishes mounting its own
    // next batch. If the native card later appears, prefer the native React card
    // (it keeps all of SpicyChat's handlers) and remove the temporary refill copy.
    const nativeIds = new Set();
    for (const anchor of document.querySelectorAll("a[href*='/chat/'], a[href*='/chatbot/']")) {
      if (anchor.closest?.(`[${EXTRA_CARD_ATTR}="1"]`)) continue;
      const id = botIdFromLink(anchor);
      if (id) nativeIds.add(id);
    }

    const seenExtraIds = new Set();
    let removed = 0;
    for (const extra of extras) {
      if (!extra.classList.contains("ds-autofill-extra-card")) extra.classList.add("ds-autofill-extra-card");
      const identity = extra.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
      const id = botIdFromLink(identity);
      if (!id) continue;
      if (nativeIds.has(id) || seenExtraIds.has(id)) {
        extra.remove();
        removed += 1;
        continue;
      }
      seenExtraIds.add(id);
    }

    document.querySelectorAll(`.${EXTRA_GRID_CLASS}`).forEach(grid => {
      if (!grid.querySelector(`[${EXTRA_CARD_ATTR}="1"]`)) grid.remove();
    });

    if (removed) {
      const stats = runStats();
      stats.duplicates = Number(stats.duplicates || 0) + removed;
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.listingDuplicateRefillCardsRemoved = Number(perf.listingDuplicateRefillCardsRemoved || 0) + removed;
      DS.bumpDomRevision?.();
    }
    return removed;
  }

  DS.removeDuplicateListingRefillCards = removeDuplicateExtraCards;

  function directBotLinksForGrid(grid) {
    return [...grid.querySelectorAll("a[href*='/chat/'], a[href*='/chatbot/']")].filter(anchor => {
      const href = String(anchor.getAttribute("href") || "");
      if (!/\/(?:chat|chatbot)\/[0-9a-f-]{20,}/i.test(href)) return false;
      // SpicyChat's page shell is itself a CSS grid and contains the entire
      // listing farther down. Only count links whose nearest grid is this one,
      // otherwise the outer app-shell grid can tie the real card grid and be
      // selected by mistake. Accept both chat and profile links so a card-layout
      // change that drops one of those anchors does not break Refill detection.
      return anchor.closest?.("div.grid") === grid;
    });
  }

  function cardGridInDocument(doc = document) {
    const grids = [...doc.querySelectorAll("div.grid")]
      .map(grid => ({ grid, links: directBotLinksForGrid(grid) }))
      .filter(entry => entry.links.length >= 3);
    grids.sort((a, b) => b.links.length - a.links.length);
    return grids[0]?.grid || null;
  }

  function extraGrid() {
    let grid = document.querySelector(`.${EXTRA_GRID_CLASS}`);
    if (grid) return grid;
    const nativeGrid = cardGridInDocument(document);
    if (!nativeGrid) return null;
    grid = document.createElement("div");
    grid.className = `${nativeGrid.className || "grid"} ${EXTRA_GRID_CLASS}`.trim();
    grid.style.cssText = nativeGrid.style.cssText;
    grid.dataset.dsAutofillSource = "pagination";
    nativeGrid.insertAdjacentElement("afterend", grid);
    return grid;
  }

  function normalizeCloneUrls(root, baseUrl) {
    root.querySelectorAll("a[href]").forEach(anchor => {
      try { anchor.href = new URL(anchor.getAttribute("href"), baseUrl).href; } catch {}
    });
    root.querySelectorAll("img[src]").forEach(img => {
      try { img.src = new URL(img.getAttribute("src"), baseUrl).href; } catch {}
      img.loading = "lazy";
      img.removeAttribute("srcset");
    });
  }

  function wrappersFromFetchedDocument(doc) {
    const grid = cardGridInDocument(doc);
    if (!grid) return [];
    const out = [];
    const seen = new Set();

    for (const anchor of grid.querySelectorAll("a[href*='/chat/'], a[href*='/chatbot/']")) {
      const href = String(anchor.getAttribute("href") || "");
      if (!/\/(?:chat|chatbot)\/[0-9a-f-]{20,}/i.test(href)) continue;
      const card = anchor.closest("div.relative.group.rounded-xl") || anchor.closest("div[class*='rounded-xl']");
      if (!card) continue;
      const wrapper = card.parentElement && card.parentElement.parentElement === grid ? card.parentElement : card;
      if (seen.has(wrapper)) continue;
      seen.add(wrapper);
      out.push(wrapper);
    }
    return out;
  }

  function isNativeTagPillButton(button) {
    if (!(button instanceof Element)) return false;
    if (button.getAttribute("aria-label") === "favorite") return false;
    const aria = String(button.getAttribute("aria-label") || "").trim();
    const text = String(button.textContent || "").replace(/\s+/g, " ").trim();
    const classText = String(button.className || "");
    const tagRow = button.closest("div.flex.flex-wrap.items-center.gap-1, div[class*='flex-wrap'][class*='max-h-9']");
    return !!(tagRow && aria && text && (classText.includes("cursor-default") || classText.includes("!cursor-default")));
  }

  function extractCardMetadata(wrapper, baseUrl = location.href) {
    const chat = wrapper?.querySelector?.("a[href*='/chat/']");
    const profile = wrapper?.querySelector?.("a[href*='/chatbot/']");
    const creator = wrapper?.querySelector?.("a[href*='/creator/']");
    const image = wrapper?.querySelector?.("img[src]");
    const id = botIdFromLink(chat || profile);
    const tags = [...(wrapper?.querySelectorAll?.("button") || [])]
      .filter(isNativeTagPillButton)
      .map(button => String(button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const uniqueTags = [...new Set(tags)];
    const titleLink = wrapper?.querySelector?.("a[aria-label^='chat-with-'][title], a[href*='/chat/'][title]");
    const descCandidates = [...(wrapper?.querySelectorAll?.("p") || [])]
      .filter(node => !node.closest("a[href*='/creator/']"))
      .filter(node => !node.closest("button"))
      .map(node => String(node.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const absolute = href => {
      try { return href ? new URL(href, baseUrl).href : ""; } catch { return String(href || ""); }
    };
    return {
      id,
      name: String(titleLink?.getAttribute("title") || titleLink?.textContent || "").replace(/\s+/g, " ").trim(),
      creator: String(creator?.textContent || "").replace(/\s+/g, " ").trim(),
      creatorUrl: absolute(creator?.getAttribute("href")),
      chatUrl: absolute(chat?.getAttribute("href")),
      profileUrl: absolute(profile?.getAttribute("href")),
      image: absolute(image?.getAttribute("src")),
      tags: uniqueTags.slice(0, 40),
      description: descCandidates.find(text => text.length > 2 && !uniqueTags.includes(text)) || ""
    };
  }

  function ensureTagPillsFromMetadata(root, meta) {
    const tags = Array.isArray(meta?.tags) ? meta.tags.filter(Boolean) : [];
    if (!root || !tags.length) return 0;
    const existing = [...root.querySelectorAll("button")].filter(isNativeTagPillButton);
    if (existing.length) return 0;

    // Find the normal SpicyChat tag row from the serialized card layout. If the
    // buttons were stripped by an older helper payload, fall back to the footer
    // column immediately above the stats row.
    let row = root.querySelector("div.flex.flex-wrap.items-center.gap-1.max-h-9.overflow-hidden, div[class*='flex-wrap'][class*='max-h-9']");
    if (!row) {
      const footer = [...root.querySelectorAll("div.flex.flex-col.mt-auto.gap-2, div[class*='mt-auto'][class*='gap-2']")][0];
      if (footer) {
        row = document.createElement("div");
        row.className = "flex flex-wrap items-center gap-1 max-h-9 overflow-hidden";
        footer.prepend(row);
      }
    }
    if (!row) return 0;

    let added = 0;
    for (const tag of tags) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "inline-flex items-center transition-colors duration-200 w-fit gap-1 h-[15px] px-1 bg-gray-6 border-0 dark:bg-gray-6 dark:border-0 rounded-[3px] !cursor-default";
      button.setAttribute("aria-label", tag);
      button.tabIndex = -1;
      const span = document.createElement("span");
      span.className = "font-sans text-decoration-skip-ink-none text-underline-position-from-font text-label-sm font-regular text-left text-gray-12 dark:text-white";
      span.textContent = tag;
      button.appendChild(span);
      row.appendChild(button);
      added++;
    }
    return added;
  }

  function findFavoriteActionButton(root) {
    if (!root?.querySelector) return null;
    const direct = root.querySelector("button[aria-label='favorite'], button[aria-label='unfavorite']");
    if (direct) return direct;

    // SpicyChat has changed the accessible label for this control before.
    // Fall back to the actual heart icon + Like/Unlike tooltip instead of
    // deleting an otherwise valid favorite control from a filled card.
    return [...root.querySelectorAll("button")].find(button => {
      if (!button.querySelector("svg.lucide-heart")) return false;
      const aria = DS.normalize?.(button.getAttribute("aria-label") || "") || "";
      const tooltip = DS.normalize?.(button.closest?.("[data-tooltip-content]")?.getAttribute?.("data-tooltip-content") || "") || "";
      return ["favorite", "unfavorite", "like", "unlike"].some(word => aria === word || tooltip === word);
    }) || null;
  }

  function favoriteButtonLooksActive(button) {
    if (!button) return false;
    const tooltip = DS.normalize?.(button.closest?.("[data-tooltip-content]")?.getAttribute?.("data-tooltip-content") || "") || "";
    const aria = DS.normalize?.(button.getAttribute?.("aria-label") || "") || "";
    const pressed = String(button.getAttribute?.("aria-pressed") || "").toLowerCase();
    const svg = button.querySelector?.("svg");
    const svgClass = String(svg?.getAttribute?.("class") || "");
    const inlineFill = String(svg?.style?.fill || "").toLowerCase();

    return (
      pressed === "true" ||
      aria === "unfavorite" ||
      aria === "unlike" ||
      tooltip.includes("unlike") ||
      tooltip.includes("remove favorite") ||
      svgClass.includes("text-red-9") ||
      svgClass.includes("fill-red-9") ||
      (!svgClass.includes("fill-transparent") && /(?:^|\s)fill-[^\s]+/.test(svgClass)) ||
      (!!inlineFill && !["none", "transparent"].includes(inlineFill))
    );
  }

  function setRefillFavoriteVisual(button, active, statusText = "") {
    if (!button) return;
    const activeValue = active ? "1" : "0";
    const pressedValue = active ? "true" : "false";
    const ariaValue = active ? "unfavorite" : "favorite";
    const tooltipValue = active ? "Unlike" : "Like";
    const titleValue = statusText || (active ? "Favorited on SpicyChat" : "Favorite this bot on SpicyChat");

    DS.setDatasetIfChanged?.(button, "dsRefillFavoriteActive", activeValue);
    DS.setAttributeIfChanged?.(button, "aria-pressed", pressedValue);
    DS.setAttributeIfChanged?.(button, "aria-label", ariaValue);

    const tooltip = button.closest?.("[data-tooltip-content]");
    if (tooltip) DS.setAttributeIfChanged?.(tooltip, "data-tooltip-content", tooltipValue);

    const svg = button.querySelector("svg");
    if (svg) {
      DS.setClassState?.(svg, "text-red-9", !!active);
      DS.setClassState?.(svg, "fill-red-9", !!active);
      DS.setClassState?.(svg, "text-white", !active);
      DS.setClassState?.(svg, "fill-transparent", !active);
      const fill = active ? "currentColor" : "transparent";
      if (svg.style.fill !== fill) svg.style.fill = fill;
    }
    if (button.title !== titleValue) button.title = titleValue;
  }

  async function rememberRefillFavoriteLocally(id, card, anchor) {
    if (!id || !DS.state.favoriteBots) return;
    const store = DS.state.favoriteBots;
    store.ids = Array.isArray(store.ids) ? store.ids : [];
    store.meta = store.meta && typeof store.meta === "object" ? store.meta : {};
    if (!store.ids.includes(id)) store.ids.push(id);
    DS.state.favoriteBotIdSet?.add(id);
    const previous = store.meta[id] || {};
    const meta = DS.makeBotMeta?.({ id, card, anchor }) || {};
    store.meta[id] = {
      ...previous,
      ...meta,
      savedAt: previous.savedAt || Date.now(),
      lastSeenAt: Date.now(),
      cardMetaCaptured: true
    };
    await DS.saveFavoriteBots?.(store);
  }

  function refillFavoriteCardInDocument(doc, botId) {
    const id = String(botId || "").trim();
    if (!id || !doc?.querySelectorAll) return null;
    for (const anchor of doc.querySelectorAll("a[href*='/chat/'], a[href*='/chatbot/']")) {
      if (botIdFromLink(anchor) !== id) continue;
      const card = anchor.closest("div.relative.group.rounded-xl") || anchor.closest("div[class*='rounded-xl']") || DS.getCardFromChatLink?.(anchor);
      if (findFavoriteActionButton(card)) return card;
    }
    return null;
  }

  function normalizeRefillFavoriteFrameUrl(sourceUrl) {
    try {
      const url = new URL(String(sourceUrl || ""), location.href);
      if (url.origin !== location.origin) return "";
      url.searchParams.set("dsListingRefill", "1");
      return url.href;
    } catch {
      return "";
    }
  }

  async function ensureRefillFavoriteFrame(sourceUrl) {
    const url = normalizeRefillFavoriteFrameUrl(sourceUrl);
    if (!url) throw new Error("invalid source page");

    if (refillFavoriteFrame?.isConnected && refillFavoriteFrameUrl === url) {
      if (refillFavoriteFrameLoad) await refillFavoriteFrameLoad;
      return refillFavoriteFrame;
    }

    removeRefillFavoriteFrame();
    const frame = document.createElement("iframe");
    frame.id = REFILL_FAVORITE_FRAME_ID;
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    Object.assign(frame.style, {
      position: "fixed",
      left: "-10000px",
      top: "-10000px",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
      border: "0"
    });
    refillFavoriteFrame = frame;
    refillFavoriteFrameUrl = url;
    refillFavoriteFrameLoad = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("favorite helper page timed out")), 12000);
      frame.addEventListener("load", () => {
        clearTimeout(timer);
        resolve(frame);
      }, { once: true });
      frame.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("favorite helper page could not load"));
      }, { once: true });
    });
    frame.src = url;
    (document.body || document.documentElement).appendChild(frame);
    await refillFavoriteFrameLoad;
    return frame;
  }

  async function syncRefillFavoriteInFrame({ sourceUrl, botId, active }) {
    const frame = await ensureRefillFavoriteFrame(sourceUrl);
    const started = Date.now();
    let card = null;
    let button = null;

    while (Date.now() - started < 10000) {
      let doc = null;
      try { doc = frame.contentDocument; } catch {}
      card = refillFavoriteCardInDocument(doc, botId);
      button = findFavoriteActionButton(card);
      if (card && button) break;
      await DS.sleep?.(160);
    }
    if (!card || !button) return { ok: false, status: "favorite-control-not-found" };

    const before = favoriteButtonLooksActive(button);
    if (before === !!active) return { ok: true, status: active ? "already-favorited" : "already-unfavorited" };

    try { button.click(); }
    catch { return { ok: false, status: "favorite-click-failed" }; }

    const changedAt = Date.now();
    while (Date.now() - changedAt < 7000) {
      await DS.sleep?.(140);
      let doc = null;
      try { doc = frame.contentDocument; } catch {}
      const currentCard = refillFavoriteCardInDocument(doc, botId) || card;
      const currentButton = findFavoriteActionButton(currentCard) || button;
      if (favoriteButtonLooksActive(currentButton) === !!active) {
        return { ok: true, status: active ? "favorited" : "unfavorited" };
      }
    }
    return { ok: false, status: active ? "favorite-timeout" : "unfavorite-timeout" };
  }

  function wireRefillFavoriteButton(root, id, sourceUrl) {
    const button = findFavoriteActionButton(root);
    if (!button) return;

    button.type = "button";
    button.classList.add(REFILL_FAVORITE_CLASS);
    button.dataset.dsRefillBotId = id;
    button.dataset.dsRefillSourceUrl = sourceUrl;
    const initialActive = favoriteButtonLooksActive(button);
    setRefillFavoriteVisual(button, initialActive);

    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (button.disabled) return;

      const previousActive = button.dataset.dsRefillFavoriteActive === "1";
      const targetActive = !previousActive;
      button.disabled = true;
      setRefillFavoriteVisual(button, targetActive, targetActive ? "Saving favorite…" : "Removing favorite…");

      try {
        const response = await syncRefillFavoriteInFrame({
          sourceUrl,
          botId: id,
          active: targetActive
        });

        if (response?.ok) {
          setRefillFavoriteVisual(
            button,
            targetActive,
            targetActive ? "Favorited on SpicyChat" : "Removed from SpicyChat Favorites"
          );
          if (targetActive) {
            const anchor = root.querySelector("a[href*='/chat/'], a[href*='/chatbot/']");
            await rememberRefillFavoriteLocally(id, root, anchor);
          }
          DS.setQuickStatus?.(targetActive ? "Bot favorited." : "Bot removed from Favorites.");
        } else {
          setRefillFavoriteVisual(button, previousActive, `Could not ${targetActive ? "favorite" : "unfavorite"}: ${response?.status || "helper failed"}`);
          DS.setQuickStatus?.(`Could not ${targetActive ? "favorite" : "unfavorite"} filled bot: ${response?.status || "helper failed"}`);
        }
      } catch (error) {
        setRefillFavoriteVisual(button, previousActive, `Could not ${targetActive ? "favorite" : "unfavorite"}: ${error?.message || "helper failed"}`);
        DS.setQuickStatus?.(`Could not update filled bot favorite: ${error?.message || "helper failed"}`);
      } finally {
        button.disabled = false;
      }
    }, true);
  }

  function workerCardForBotId(botId) {
    return refillFavoriteCardInDocument(document, botId);
  }

  async function runWorkerFavorite(botId) {
    const card = workerCardForBotId(botId);
    const button = findFavoriteActionButton(card);
    if (!card || !button) return { ok: false, status: "not-ready" };
    if (favoriteButtonLooksActive(button)) return { ok: true, status: "already-favorited" };

    DS.realClick?.(button, { scroll: false });
    const started = Date.now();
    while (Date.now() - started < 9000) {
      await DS.sleep?.(180);
      const currentCard = workerCardForBotId(botId) || card;
      const currentButton = findFavoriteActionButton(currentCard) || button;
      if (favoriteButtonLooksActive(currentButton)) return { ok: true, status: "favorited" };
    }
    return { ok: false, status: "favorite-timeout" };
  }

  function stripWorkerArtifacts(root) {
    const nodes = [root, ...root.querySelectorAll("*")];
    for (const node of nodes) {
      if (node.classList) {
        node.classList.remove("ds-hidden", "ds-card-dimmed", REFILL_BUTTON_CLASS);
        [...node.classList].filter(name => name.startsWith("ds-qol-")).forEach(name => node.classList.remove(name));
      }
      [...(node.attributes || [])].forEach(attr => {
        if (attr.name.startsWith("data-ds-")) node.removeAttribute(attr.name);
      });
    }
    root.querySelectorAll(".ds-card-block-button, .ds-listing-refill-button, [id^='ds-qol-']").forEach(el => el.remove());
  }

  function wrapperFromHtml(html) {
    const source = String(html || "").trim();
    if (!source || source.length > MAX_SERIALIZED_CARD_HTML) return null;

    // Helper-card HTML comes from a rendered SpicyChat page, but it still
    // crosses an extension-message boundary. Parse through Core's sanitized
    // DOMParser path instead of assigning dynamic HTML into a live template.
    const wrapper = DS.parseSafeMarkupFirstElement?.(source) || null;
    if (!wrapper) return null;

    // Do not append an arbitrary serialized element if SpicyChat/helper output
    // changes unexpectedly. A refill payload must still identify a bot card.
    const identityLink = wrapper.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
    if (!botIdFromLink(identityLink)) return null;
    return wrapper;
  }

  function refillHomeContext() {
    const path = String(location.pathname || "").replace(/\/+$/, "") || "/";
    return path === "/";
  }

  function hardBlockRefillReason(reason) {
    return /^(?:blocked bot(?: id)?|blocked word|blocked tag|blocked creator):?/i.test(String(reason || ""));
  }

  function rejectionBucket(reason, kind = "") {
    const value = String(reason || "").toLowerCase();
    if (/^blocked bot(?: id)?:/.test(value)) return "blockedBotRejected";
    if (/^blocked creator:/.test(value)) return "blockedCreatorRejected";
    if (/^blocked word:/.test(value)) return "blockedWordRejected";
    if (/^blocked tag:/.test(value) || /excluded tag|missing included tag/.test(value)) return "blockedTagRejected";
    if (/^language:/.test(value)) return "languageRejected";
    if (/opened chat/.test(value)) return "openedRejected";
    if (/saved for later/.test(value)) return "laterRejected";
    if (/not interested/.test(value)) return "notInterestedRejected";
    if (kind === "smart") return "smartFilterRejected";
    return "otherRejected";
  }

  function noteRefillRejection(stats, kind, reason) {
    stats.filtered = Number(stats.filtered || 0) + 1;
    stats.lastRejectReason = String(reason || kind || "filtered");
    if (kind === "blocked") stats.blockedRejected = Number(stats.blockedRejected || 0) + 1;
    else stats.filterRejected = Number(stats.filterRejected || 0) + 1;
    if (kind === "smart") stats.smartFilterRejected = Number(stats.smartFilterRejected || 0) + 1;
    const bucket = rejectionBucket(reason, kind);
    if (bucket !== "smartFilterRejected") stats[bucket] = Number(stats[bucket] || 0) + 1;
  }

  function classifyLiveHiddenReason(reason) {
    return rejectionBucket(String(reason || "").replace(/^card:/i, "").trim());
  }

  function liveListingFilterCounts() {
    const out = {
      total: 0, blockedBotRejected: 0, blockedCreatorRejected: 0, blockedWordRejected: 0,
      blockedTagRejected: 0, languageRejected: 0, openedRejected: 0, laterRejected: 0,
      notInterestedRejected: 0, smartFilterRejected: 0, otherRejected: 0
    };
    const seen = new Set();
    for (const target of document.querySelectorAll("[data-ds-hidden='1'], .ds-smart-filter-hidden")) {
      if (target.closest?.("#ds-qol-panel")) continue;
      const link = target.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
      if (!link) continue;
      const id = botIdFromLink(link);
      const key = id || target;
      if (seen.has(key)) continue;
      seen.add(key);
      out.total += 1;
      if (target.classList?.contains("ds-smart-filter-hidden") && !target.dataset?.dsReason) {
        out.smartFilterRejected += 1;
        continue;
      }
      const bucket = classifyLiveHiddenReason(target.dataset?.dsReason || "");
      out[bucket] = Number(out[bucket] || 0) + 1;
    }
    return out;
  }

  function removeListingFilterStats() {
    document.querySelectorAll(`.${LISTING_FILTER_STATS_CLASS}`).forEach(node => node.remove());
  }

  function updateListingFilterStats() {
    const settings = DS.state?.settings || {};
    if (LISTING_REFILL_WORKER || !settings.enabled || !settings.showListingFilterStats) {
      removeListingFilterStats();
      return;
    }
    const nativeText = document.querySelector("[data-testid='search-stats'] .ais-Stats-text, .ais-Stats .ais-Stats-text");
    if (!nativeText?.parentElement) { removeListingFilterStats(); return; }
    let badge = nativeText.parentElement.querySelector(`:scope > .${LISTING_FILTER_STATS_CLASS}`);
    if (!badge) {
      badge = document.createElement("span");
      badge.className = LISTING_FILTER_STATS_CLASS;
      badge.dataset.dsOwned = "1";
      badge.dataset.dsOwner = "qol";
      badge.dataset.dsFeature = "listing-refill-stats";
      nativeText.insertAdjacentElement("afterend", badge);
    }
    const live = liveListingFilterCounts();
    const stats = runStats();
    const total = live.total + Number(stats.filtered || 0);
    let text = ` · QoL: ${total} bot${total === 1 ? "" : "s"} blocked/filtered`;
    if (settings.showListingFilterStatsDetails) {
      const sum = key => Number(live[key] || 0) + Number(stats[key] || 0);
      const bots = sum("blockedBotRejected");
      const creators = sum("blockedCreatorRejected");
      const tagsWords = sum("blockedTagRejected") + sum("blockedWordRejected");
      const language = sum("languageRejected");
      const savedOpened = sum("openedRejected") + sum("laterRejected") + sum("notInterestedRejected");
      const smartOther = sum("smartFilterRejected") + sum("otherRejected");
      const parts = [
        bots ? `${bots} blocked bot${bots === 1 ? "" : "s"}` : "",
        creators ? `${creators} creator${creators === 1 ? "" : "s"}` : "",
        tagsWords ? `${tagsWords} tag/word` : "",
        language ? `${language} language` : "",
        savedOpened ? `${savedOpened} opened/saved` : "",
        smartOther ? `${smartOther} other` : ""
      ].filter(Boolean);
      if (parts.length) text += ` (${parts.join(", ")})`;
    }
    if (badge.textContent !== text) badge.textContent = text;
    badge.title = "QoL-hidden cards currently on this listing plus Listing Refill candidates rejected before insertion.";
  }

  DS.updateListingFilterStats = updateListingFilterStats;

  function refillDiagSnapshot(stats = runStats()) {
    return {
      received: Number(stats.received || 0), appended: Number(stats.appended || 0), duplicates: Number(stats.duplicates || 0),
      blockedRejected: Number(stats.blockedRejected || 0), blockedBotRejected: Number(stats.blockedBotRejected || 0),
      blockedCreatorRejected: Number(stats.blockedCreatorRejected || 0), blockedWordRejected: Number(stats.blockedWordRejected || 0),
      blockedTagRejected: Number(stats.blockedTagRejected || 0), languageRejected: Number(stats.languageRejected || 0),
      filterRejected: Number(stats.filterRejected || 0), smartFilterRejected: Number(stats.smartFilterRejected || 0),
      nativeRejected: Number(stats.nativeRejected || 0), postInsertRejected: Number(stats.postInsertRejected || 0),
      staleResponses: Number(stats.staleResponses || 0), helperFailures: Number(stats.helperFailures || 0),
      helperReuses: Number(stats.helperReuses || 0), helperRecoveries: Number(stats.helperRecoveries || 0),
      helperGcClosed: Number(stats.helperGcClosed || 0), cacheHits: Number(stats.cacheHits || 0),
      cacheMisses: Number(stats.cacheMisses || 0), cacheCandidatesStored: Number(stats.cacheCandidatesStored || 0),
      cacheCandidatesUsed: Number(stats.cacheCandidatesUsed || 0), cacheCandidatesExpired: Number(stats.cacheCandidatesExpired || 0),
      domNodesCreated: Number(stats.domNodesCreated || 0), visibleAfter: Number(stats.visibleAfter || 0)
    };
  }

  function emitListingRefillDiagnostic(page, before, outcome = "ok", error = "") {
    const after = refillDiagSnapshot();
    const delta = key => Math.max(0, Number(after[key] || 0) - Number(before?.[key] || 0));
    const received = delta("received");
    const inserted = delta("appended");
    const duplicatesRejected = delta("duplicates");
    const blockedRejected = delta("blockedRejected");
    const tagRejected = delta("blockedTagRejected");
    const filteredRejected = delta("filterRejected");
    const token = DS.diagOperationStart?.("listing-refill", "listing-refill", {
      page: Number(page || 0), outcome, received, inserted, blockedRejected, tagRejected,
      languageRejected: delta("languageRejected"), smartFilterRejected: delta("smartFilterRejected"),
      duplicatesRejected, postInsertRejected: delta("postInsertRejected"), helperReuses: delta("helperReuses"),
      helperRecoveries: delta("helperRecoveries"), helperGcClosed: delta("helperGcClosed"),
      cacheHits: delta("cacheHits"), cacheMisses: delta("cacheMisses"),
      cacheCandidatesStored: delta("cacheCandidatesStored"), cacheCandidatesUsed: delta("cacheCandidatesUsed"),
      visibleAfter: Number(after.visibleAfter || visibleCardCount()), error: error ? String(error).slice(0, 120) : ""
    });
    DS.diagOperationEnd?.(token, {
      outcome,
      counts: {
        scanned: received, changed: inserted,
        skipped: blockedRejected + filteredRejected + duplicatesRejected,
        errors: outcome === "error" ? 1 : 0
      }
    });
  }

  function preflightRefillCard(wrapper, link, meta, nativeRules) {
    const nativeReason = nativeTagRejection(meta, wrapper, nativeRules);
    if (nativeReason) return { kind: "native", reason: nativeReason };

    const cardReason = DS.shouldHideCard?.(wrapper, link, {
      discovery: true,
      home: refillHomeContext(),
      ignoreOpened: !!DS.smartFilterWantsOpened?.(),
      ignoreFavorite: !!DS.smartFilterWantsFavorites?.(),
      ignoreLater: !!DS.smartFilterWantsLater?.()
    }) || "";
    if (cardReason) {
      return { kind: hardBlockRefillReason(cardReason) ? "blocked" : "filter", reason: cardReason };
    }

    const smartReason = DS.getSmartFilterRefillRejection?.(wrapper, link) || "";
    if (smartReason) return { kind: "smart", reason: smartReason };
    return null;
  }

  function refillCandidateCacheStore() {
    if (!(DS.state.listingRefillCandidateCache instanceof Map)) {
      DS.state.listingRefillCandidateCache = new Map();
    }
    return DS.state.listingRefillCandidateCache;
  }

  function pruneRefillCandidateCache(now = Date.now()) {
    const store = refillCandidateCacheStore();
    const stats = runStats();
    let expired = 0;
    for (const [signature, bucket] of store.entries()) {
      const candidates = Array.isArray(bucket?.candidates) ? bucket.candidates : [];
      const fresh = candidates.filter(item => now - Number(item?.savedAt || 0) < REFILL_CANDIDATE_CACHE_TTL_MS);
      expired += Math.max(0, candidates.length - fresh.length);
      if (!fresh.length) store.delete(signature);
      else if (fresh.length !== candidates.length) store.set(signature, { ...bucket, candidates: fresh, updatedAt: now });
    }
    if (expired) stats.cacheCandidatesExpired = Number(stats.cacheCandidatesExpired || 0) + expired;

    let total = 0;
    const ordered = [...store.entries()].sort((a, b) => Number(a[1]?.updatedAt || 0) - Number(b[1]?.updatedAt || 0));
    for (const [, bucket] of ordered) total += Array.isArray(bucket?.candidates) ? bucket.candidates.length : 0;
    while (total > REFILL_CANDIDATE_CACHE_MAX && ordered.length) {
      const [signature, bucket] = ordered.shift();
      const count = Array.isArray(bucket?.candidates) ? bucket.candidates.length : 0;
      store.delete(signature);
      total -= count;
      stats.cacheCandidatesExpired = Number(stats.cacheCandidatesExpired || 0) + count;
    }
    return store;
  }

  function cacheRefillCandidates(signature, page, baseUrl, payloads) {
    const rows = (Array.isArray(payloads) ? payloads : [])
      .filter(item => item?.html)
      .map(item => ({
        html: item.html,
        meta: item.meta || null,
        page: Number(page) || 0,
        baseUrl: String(baseUrl || ""),
        savedAt: Date.now()
      }));
    if (!signature || !rows.length) return 0;

    const store = pruneRefillCandidateCache();
    const bucket = store.get(signature) || { candidates: [], updatedAt: 0 };
    bucket.candidates.push(...rows);
    bucket.updatedAt = Date.now();
    if (bucket.candidates.length > REFILL_CANDIDATE_CACHE_MAX) {
      bucket.candidates.splice(0, bucket.candidates.length - REFILL_CANDIDATE_CACHE_MAX);
    }
    store.set(signature, bucket);

    const stats = runStats();
    stats.cacheCandidatesStored = Number(stats.cacheCandidatesStored || 0) + rows.length;
    return rows.length;
  }

  async function appendCachedRefillCandidates() {
    const signature = canonicalListingSignature(location.href);
    const store = pruneRefillCandidateCache();
    const bucket = store.get(signature);
    const stats = runStats();
    if (!bucket?.candidates?.length) {
      stats.cacheMisses = Number(stats.cacheMisses || 0) + 1;
      return 0;
    }

    stats.cacheHits = Number(stats.cacheHits || 0) + 1;
    const target = Math.max(1, Math.min(200, Number(DS.state.settings?.autoFillTargetCards || 50)));
    const slots = Math.max(0, target - visibleCardCount());
    if (!slots) return 0;

    const host = extraGrid();
    if (!host) return 0;

    const known = currentBotIds();
    const rejectedIds = DS.state.autoFillRejectedBotIds instanceof Set
      ? DS.state.autoFillRejectedBotIds
      : (DS.state.autoFillRejectedBotIds = new Set());
    const requestTagRules = currentNativeTagRules();
    const inserted = [];
    let appended = 0;
    let scanned = 0;

    while (bucket.candidates.length && appended < slots) {
      const payload = bucket.candidates.shift();
      scanned += 1;
      if (!payload?.html) continue;
      if (Date.now() - Number(payload.savedAt || 0) >= REFILL_CANDIDATE_CACHE_TTL_MS) {
        stats.cacheCandidatesExpired = Number(stats.cacheCandidatesExpired || 0) + 1;
        continue;
      }

      const wrapper = wrapperFromHtml(payload.html);
      if (!wrapper) continue;
      const meta = payload.meta || extractCardMetadata(wrapper, payload.baseUrl || location.href);
      stripWorkerArtifacts(wrapper);

      const link = wrapper.querySelector("a[href*='/chat/'], a[href*='/chatbot/']");
      const id = botIdFromLink(link);
      if (!id) continue;
      if (known.has(id) || rejectedIds.has(id)) {
        stats.duplicates = Number(stats.duplicates || 0) + 1;
        continue;
      }

      const rejection = preflightRefillCard(wrapper, link, meta, requestTagRules);
      if (rejection) {
        rejectedIds.add(id);
        if (rejection.kind === "native") {
          stats.nativeRejected = Number(stats.nativeRejected || 0) + 1;
          noteRefillRejection(stats, "filter", rejection.reason);
        } else {
          noteRefillRejection(stats, rejection.kind, rejection.reason);
        }
        continue;
      }

      known.add(id);
      const clone = document.importNode(wrapper, true);
      clone.setAttribute(EXTRA_CARD_ATTR, "1");
      clone.classList.add("ds-autofill-extra-card");
      clone.dataset.dsAutofillPage = String(payload.page || 0);
      clone.dataset.dsAutofillSignature = signature;
      normalizeCloneUrls(clone, payload.baseUrl || location.href);

      const favoriteButton = findFavoriteActionButton(clone);
      clone.querySelectorAll("button").forEach(button => {
        if (button === favoriteButton || isNativeTagPillButton(button)) return;
        button.remove();
      });
      stats.tagsRestored += ensureTagPillsFromMetadata(clone, meta);
      clone.querySelectorAll("svg.lucide-ellipsis-vertical").forEach(svg => {
        const shell = svg.closest("div.relative");
        if (shell && !shell.querySelector("a[href]") && !shell.querySelector("button")) shell.remove();
        else svg.remove();
      });
      wireRefillFavoriteButton(clone, id, payload.baseUrl || location.href);

      stats.domNodesCreated = Number(stats.domNodesCreated || 0) + 1 + clone.querySelectorAll("*").length;
      host.appendChild(clone);
      inserted.push(clone);
      appended += 1;
      stats.appended = Number(stats.appended || 0) + 1;
      stats.cacheCandidatesUsed = Number(stats.cacheCandidatesUsed || 0) + 1;
    }

    bucket.updatedAt = Date.now();
    if (!bucket.candidates.length) store.delete(signature);
    else store.set(signature, bucket);

    if (!appended) {
      DS.runtimeLog?.("info", "listing-refill", "Cached refill candidates had no usable survivors", {
        scanned,
        remaining: bucket.candidates.length
      });
      return 0;
    }

    DS.bumpDomRevision?.();
    await DS.applyCardHiding?.({ force: true });
    await DS.applySmartFilterPresets?.();

    let postRejected = 0;
    for (const clone of inserted) {
      if (!clone?.isConnected) continue;
      const rejected = clone.dataset.dsHidden === "1" ||
        clone.classList.contains("ds-hidden") ||
        clone.classList.contains("ds-smart-filter-hidden");
      if (!rejected) continue;
      const reason = clone.dataset.dsReason || "post-insert safety filter";
      clone.remove();
      postRejected += 1;
      stats.postInsertRejected = Number(stats.postInsertRejected || 0) + 1;
      noteRefillRejection(stats, hardBlockRefillReason(reason) ? "blocked" : "filter", reason);
    }

    if (postRejected) {
      appended = Math.max(0, appended - postRejected);
      stats.appended = Math.max(0, Number(stats.appended || 0) - postRejected);
      DS.bumpDomRevision?.();
    }

    stats.visibleAfter = visibleCardCount();
    DS.applyCardBlockButtons?.();
    DS.updateLaterBotButtons?.();
    DS.updateCreatorFavoriteButtons?.();
    await DS.applyCardWorkflow?.();
    DS.applyCardDisplayNormalization?.();
    DS.updateQuickPanel?.();

    DS.runtimeLog?.("info", "listing-refill", "Reused cached refill candidates", {
      scanned,
      appended,
      remaining: bucket.candidates.length,
      signature
    });
    return appended;
  }

  async function appendNextPaginationPage(page) {
    const diagBefore = refillDiagSnapshot();
    let diagOutcome = "ok";
    let diagError = "";
    try {
    const requestSourceUrl = location.href;
    const requestSignature = canonicalListingSignature(requestSourceUrl);
    const requestTagRules = nativeTagRulesFromUrl(requestSourceUrl);
    const url = listingUrlForPage(page, requestSourceUrl);
    const runId = ensureRefillRunId();
    DS.setQuickStatus?.(`Auto-fill opening helper page ${page}...`, true);

    const response = await runtimeMessage({
      type: "DS_LISTING_REFILL_PAGE",
      url,
      expectedPage: page,
      runId
    });

    const stats = runStats();
    if (response?.reused) stats.helperReuses = Number(stats.helperReuses || 0) + 1;
    if (response?.recovered) stats.helperRecoveries = Number(stats.helperRecoveries || 0) + 1;
    if (Number(response?.gcClosed || 0) > 0) stats.helperGcClosed = Number(stats.helperGcClosed || 0) + Number(response.gcClosed || 0);

    const currentSignature = canonicalListingSignature(location.href);
    if (requestSignature !== currentSignature) {
      stats.staleResponses = Number(stats.staleResponses || 0) + 1;
      stats.lastRejectReason = "listing filters changed while helper page was loading";
      DS.runtimeLog?.("info", "listing-refill", "Discarded stale helper-page response", {
        page,
        requestSignature,
        currentSignature
      });
      return 0;
    }

    if (!response?.ok) {
      throw new Error(response?.error || response?.status || "helper page failed");
    }

    const payloads = (Array.isArray(response.cards) ? response.cards : [])
      .map(item => typeof item === "string" ? { html: item, meta: null } : { html: item?.html || "", meta: item?.meta || null })
      .filter(item => item.html);
    const wrappers = payloads
      .map(item => ({ wrapper: wrapperFromHtml(item.html), meta: item.meta, html: item.html }))
      .filter(item => item.wrapper);

    stats.pages += 1;
    stats.received += wrappers.length;
    stats.metadataExtracted += wrappers.filter(item => item.meta && typeof item.meta === "object").length;
    stats.lastPage = Number(page) || 0;
    stats.lastError = "";
    DS.state.autoFillHelperHasNext = response.hasNextPage !== false;
    if (response.hasNextPage === false) DS.state.autoFillReachedEnd = true;

    const host = extraGrid();
    if (!host || !wrappers.length) {
      if (wrappers.length === 0) stats.pagesWithNoSurvivors = Number(stats.pagesWithNoSurvivors || 0) + 1;
      return 0;
    }

    const target = Math.max(1, Math.min(200, Number(DS.state.settings?.autoFillTargetCards || 50)));
    const slots = Math.max(0, target - visibleCardCount());
    if (!slots) {
      cacheRefillCandidates(requestSignature, page, response.baseUrl || url, payloads);
      return 0;
    }

    const known = currentBotIds();
    const rejectedIds = DS.state.autoFillRejectedBotIds instanceof Set
      ? DS.state.autoFillRejectedBotIds
      : (DS.state.autoFillRejectedBotIds = new Set());
    const insertedThisPage = [];
    let appended = 0;

    for (let payloadIndex = 0; payloadIndex < wrappers.length; payloadIndex++) {
      if (appended >= slots) {
        cacheRefillCandidates(
          requestSignature,
          page,
          response.baseUrl || url,
          wrappers.slice(payloadIndex).map(item => ({ html: item.html, meta: item.meta }))
        );
        break;
      }
      const payload = wrappers[payloadIndex];

      const liveSignature = canonicalListingSignature(location.href);
      if (liveSignature !== requestSignature) {
        stats.staleResponses = Number(stats.staleResponses || 0) + 1;
        stats.lastRejectReason = "listing filters changed while helper cards were being inserted";
        DS.runtimeLog?.("info", "listing-refill", "Stopped stale helper-card insertion", {
          page,
          requestSignature,
          currentSignature: liveSignature
        });
        break;
      }

      const wrapper = payload.wrapper;
      const meta = payload.meta || extractCardMetadata(wrapper, response.baseUrl || url);
      stripWorkerArtifacts(wrapper);

      const link = wrapper.querySelector("a[href*='/chat/'], a[href*='/chatbot/']");
      const id = botIdFromLink(link);
      if (!id) continue;
      if (known.has(id) || rejectedIds.has(id)) {
        stats.duplicates = Number(stats.duplicates || 0) + 1;
        continue;
      }

      // Do not append first and let the normal card hider clean up afterward.
      // That pattern was particularly expensive on filtered Home pages because
      // every rejected helper card still became live DOM and triggered another
      // listing/filter pass. Detached helper cards now go through the same hard
      // block + discovery + language + Smart Filter rules before insertion.
      const rejection = preflightRefillCard(wrapper, link, meta, requestTagRules);
      if (rejection) {
        rejectedIds.add(id);
        if (rejection.kind === "native") {
          stats.nativeRejected = Number(stats.nativeRejected || 0) + 1;
          noteRefillRejection(stats, "filter", rejection.reason);
        } else {
          noteRefillRejection(stats, rejection.kind, rejection.reason);
        }
        DS.runtimeLog?.("info", "listing-refill", "Rejected helper card before live DOM insertion", {
          page,
          botId: id,
          kind: rejection.kind,
          reason: rejection.reason,
          tags: Array.isArray(meta?.tags) ? meta.tags.slice(0, 20) : []
        });
        continue;
      }

      known.add(id);

      const clone = document.importNode(wrapper, true);
      clone.setAttribute(EXTRA_CARD_ATTR, "1");
      clone.classList.add("ds-autofill-extra-card");
      clone.dataset.dsAutofillPage = String(page);
      clone.dataset.dsAutofillSignature = requestSignature;
      normalizeCloneUrls(clone, response.baseUrl || url);

      const favoriteButton = findFavoriteActionButton(clone);
      clone.querySelectorAll("button").forEach(button => {
        if (button === favoriteButton || isNativeTagPillButton(button)) return;
        button.remove();
      });
      stats.tagsRestored += ensureTagPillsFromMetadata(clone, meta);

      clone.querySelectorAll("svg.lucide-ellipsis-vertical").forEach(svg => {
        const shell = svg.closest("div.relative");
        if (shell && !shell.querySelector("a[href]") && !shell.querySelector("button")) shell.remove();
        else svg.remove();
      });

      wireRefillFavoriteButton(clone, id, response.baseUrl || url);
      stats.domNodesCreated = Number(stats.domNodesCreated || 0) + 1 + clone.querySelectorAll("*").length;
      host.appendChild(clone);
      insertedThisPage.push(clone);
      appended += 1;
      stats.appended = Number(stats.appended || 0) + 1;
    }

    if (!appended) {
      stats.pagesWithNoSurvivors = Number(stats.pagesWithNoSurvivors || 0) + 1;
      DS.runtimeLog?.("info", "listing-refill", "Helper page had no usable refill survivors", {
        page,
        received: wrappers.length,
        blockedRejected: stats.blockedRejected || 0,
        filterRejected: stats.filterRejected || 0,
        duplicates: stats.duplicates || 0
      });
      return 0;
    }

    // Safety pass: preflight should already reject anything hidden by current
    // rules. Run the normal card/smart filters once for parity, then immediately
    // remove a refill clone if a later/dynamic check still rejects it. Hidden
    // refill cards therefore do not accumulate in the live DOM.
    DS.bumpDomRevision?.();
    await DS.applyCardHiding?.({ force: true });
    await DS.applySmartFilterPresets?.();

    let postRejected = 0;
    for (const clone of insertedThisPage) {
      if (!clone?.isConnected) continue;
      const rejected = clone.dataset.dsHidden === "1" ||
        clone.classList.contains("ds-hidden") ||
        clone.classList.contains("ds-smart-filter-hidden");
      if (!rejected) continue;
      const reason = clone.dataset.dsReason || "post-insert safety filter";
      clone.remove();
      postRejected += 1;
      stats.postInsertRejected = Number(stats.postInsertRejected || 0) + 1;
      noteRefillRejection(stats, hardBlockRefillReason(reason) ? "blocked" : "filter", reason);
    }

    if (postRejected) {
      appended = Math.max(0, appended - postRejected);
      stats.appended = Math.max(0, Number(stats.appended || 0) - postRejected);
      DS.bumpDomRevision?.();
    }

    if (!appended) stats.pagesWithNoSurvivors = Number(stats.pagesWithNoSurvivors || 0) + 1;

    const afterVisible = visibleCardCount();
    stats.visibleAfter = afterVisible;
    DS.applyCardBlockButtons?.();
    DS.updateLaterBotButtons?.();
    DS.updateCreatorFavoriteButtons?.();
    await DS.applyCardWorkflow?.();
    DS.applyCardDisplayNormalization?.();
    DS.updateQuickPanel?.();
    DS.runtimeLog?.("info", "listing-refill", "Processed rendered helper-page cards", {
      page,
      received: wrappers.length,
      appended,
      visible: afterVisible,
      duplicates: stats.duplicates || 0,
      blockedRejected: stats.blockedRejected || 0,
      blockedBotRejected: stats.blockedBotRejected || 0,
      blockedCreatorRejected: stats.blockedCreatorRejected || 0,
      blockedWordRejected: stats.blockedWordRejected || 0,
      blockedTagRejected: stats.blockedTagRejected || 0,
      languageRejected: stats.languageRejected || 0,
      openedRejected: stats.openedRejected || 0,
      laterRejected: stats.laterRejected || 0,
      notInterestedRejected: stats.notInterestedRejected || 0,
      otherRejected: stats.otherRejected || 0,
      filterRejected: stats.filterRejected || 0,
      smartFilterRejected: stats.smartFilterRejected || 0,
      postInsertRejected: stats.postInsertRejected || 0,
      nativeRejected: stats.nativeRejected || 0,
      staleResponses: stats.staleResponses || 0,
      domNodesCreated: stats.domNodesCreated || 0,
      helperReuses: stats.helperReuses || 0
    });
    return appended;
    } catch (error) {
      diagOutcome = "error";
      diagError = error?.message || String(error);
      throw error;
    } finally {
      emitListingRefillDiagnostic(page, diagBefore, diagOutcome, diagError);
      updateListingFilterStats();
    }
  }

  DS.resetAutoFillIfUrlChanged = function resetAutoFillIfUrlChanged() {
    if (DS.state.autoFillUrl === location.href) return;
    const previousRunId = String(DS.state.autoFillRunId || "").trim();
    if (previousRunId) runtimeMessage({ type: "DS_LISTING_REFILL_RELEASE", runId: previousRunId });
    DS.state.autoFillRunId = "";
    DS.state.autoFillRejectedBotIds = new Set();
    DS.state.autoFillUrl = location.href;
    DS.state.autoFillClicks = 0;
    // The caller owns the running flag. Resetting it here allowed a route-state
    // refresh inside an active refill step to make a second refill look idle.
    DS.state.autoFillLastClickAt = 0;
    DS.state.autoFillNextPage = currentPage() + 1;
    DS.state.autoFillLoadedPages = [];
    DS.state.autoFillReachedEnd = false;
    DS.state.autoFillHelperHasNext = true;
    DS.state.autoFillStopRequested = false;
    DS.state.autoFillPausedByUser = false;
    resetRunStats();
    removeExtraCards();
  };

  DS.getListingAutoFillStatus = function getListingAutoFillStatus() {
    const stats = runStats();
    return {
      visible: visibleCardCount(),
      hidden: hiddenCardCount(),
      clicks: DS.state.autoFillClicks || 0,
      target: Math.max(1, Math.min(200, Number(DS.state.settings?.autoFillTargetCards || 50))),
      maxAttempts: Math.max(1, Math.min(30, Number(DS.state.settings?.autoFillMaxClicks || 8))),
      pagesLoaded: stats.pages || 0,
      received: stats.received || 0,
      appended: stats.appended || 0,
      duplicates: stats.duplicates || 0,
      filtered: stats.filtered || 0,
      blockedRejected: stats.blockedRejected || 0,
      blockedBotRejected: stats.blockedBotRejected || 0,
      blockedCreatorRejected: stats.blockedCreatorRejected || 0,
      blockedWordRejected: stats.blockedWordRejected || 0,
      blockedTagRejected: stats.blockedTagRejected || 0,
      languageRejected: stats.languageRejected || 0,
      openedRejected: stats.openedRejected || 0,
      laterRejected: stats.laterRejected || 0,
      notInterestedRejected: stats.notInterestedRejected || 0,
      otherRejected: stats.otherRejected || 0,
      filterRejected: stats.filterRejected || 0,
      smartFilterRejected: stats.smartFilterRejected || 0,
      postInsertRejected: stats.postInsertRejected || 0,
      pagesWithNoSurvivors: stats.pagesWithNoSurvivors || 0,
      helperFailures: stats.helperFailures || 0,
      helperReuses: stats.helperReuses || 0,
      helperRecoveries: stats.helperRecoveries || 0,
      helperGcClosed: stats.helperGcClosed || 0,
      metadataExtracted: stats.metadataExtracted || 0,
      tagsRestored: stats.tagsRestored || 0,
      staleResponses: stats.staleResponses || 0,
      nativeRejected: stats.nativeRejected || 0,
      domNodesCreated: stats.domNodesCreated || 0,
      visibleAfter: stats.visibleAfter || 0,
      lastRejectReason: stats.lastRejectReason || "",
      lastError: stats.lastError || "",
      lastPage: stats.lastPage || 0,
      running: !!DS.state.autoFillRunning,
      stopping: !!DS.state.autoFillStopRequested,
      paused: !!DS.state.autoFillPausedByUser,
      hasLoadMore: !!DS.findListingLoadMoreButton?.(),
      hasPagination: !!paginationNextButton(),
      mobileDisabled: mobileFillBlocked()
    };
  };

  async function waitForListingGrowth(beforeCount, timeoutMs = 4800) {
    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(result);
      };
      const observer = new MutationObserver(() => {
        const count = uniqueTargets().length;
        if (count > beforeCount) finish({ grew: true, count });
        else if (!DS.findListingLoadMoreButton?.()) finish({ grew: false, count });
      });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      const timer = setTimeout(() => {
        const count = uniqueTargets().length;
        finish({ grew: count > beforeCount, count });
      }, timeoutMs);
    });
  }

  async function runOneAutoFillStep({ manual = false } = {}) {
    const settings = DS.state.settings;
    DS.resetAutoFillIfUrlChanged?.();

    if (!settings.enabled) return false;
    if (DS.state.autoFillStopRequested) return false;
    if (!manual && DS.state.autoFillPausedByUser) return false;
    if (!manual && !settings.autoFillListings) return false;
    if (!isGoodPageForFill()) return false;
    if (mobileFillBlocked()) {
      if (manual) DS.setQuickStatus?.("Listing refill is disabled on phone/mobile for now.");
      return false;
    }

    const target = Math.max(1, Math.min(200, Number(settings.autoFillTargetCards || 50)));
    const maxClicks = Math.max(1, Math.min(30, Number(settings.autoFillMaxClicks || 8)));
    const visible = visibleCardCount();
    if (!manual && visible >= target) return false;

    // Reuse unused candidates from recently rendered page 2/page 3/etc. before
    // applying the page-attempt limit, because a cache hit does not open or
    // navigate another helper page. Every cached card is checked against the
    // *current* block/filter state before it is inserted.
    const cachedAppended = await appendCachedRefillCandidates();
    if (cachedAppended > 0) {
      DS.setQuickStatus?.(`Auto-fill reused ${cachedAppended} cached ${cachedAppended === 1 ? "bot" : "bots"}.`, true);
      return true;
    }

    if ((DS.state.autoFillClicks || 0) >= maxClicks) {
      if (manual) DS.setQuickStatus?.(`Auto-fill stopped at max attempts (${maxClicks}).`);
      return false;
    }

    const now = Date.now();
    if (now - Number(DS.state.autoFillLastClickAt || 0) < 300) return false;
    DS.state.autoFillLastClickAt = now;

    const loadMore = DS.findListingLoadMoreButton?.();
    if (loadMore) {
      const beforeTotal = uniqueTargets().length;
      DS.state.autoFillClicks = (DS.state.autoFillClicks || 0) + 1;
      DS.setQuickStatus?.(`Auto-fill loading more... ${DS.state.autoFillClicks}/${maxClicks}`, true);
      DS.realClick(loadMore, { scroll: manual });
      const result = await waitForListingGrowth(beforeTotal);
      await DS.applyCardHiding?.();
      DS.updateQuickPanel?.();
      if (!result.grew && manual) DS.setQuickStatus?.("Load More was clicked, but no new cards appeared.");
      return result.grew;
    }

    if (paginationNextButton() || Number(DS.state.autoFillNextPage || 0) > currentPage()) {
      if (DS.state.autoFillReachedEnd) {
        if (manual) DS.setQuickStatus?.("Auto-fill reached the last listing page.");
        return false;
      }

      const nextPage = Math.max(currentPage() + 1, Number(DS.state.autoFillNextPage || (currentPage() + 1)));
      DS.state.autoFillClicks = (DS.state.autoFillClicks || 0) + 1;
      DS.state.autoFillNextPage = nextPage + 1;
      DS.setQuickStatus?.(`Auto-fill fetching page ${nextPage}... ${DS.state.autoFillClicks}/${maxClicks}`, true);
      try {
        const appended = await appendNextPaginationPage(nextPage);
        DS.state.autoFillLoadedPages = [...new Set([...(DS.state.autoFillLoadedPages || []), nextPage])];
        if (!appended && manual) {
          const more = DS.state.autoFillHelperHasNext !== false && !DS.state.autoFillReachedEnd;
          DS.setQuickStatus?.(more
            ? `Page ${nextPage} had no new visible cards; continuing to the next page...`
            : `Page ${nextPage} had no new cards and appears to be the end of the listing.`);
        }
        // A successfully loaded page is progress even when every card on it is
        // duplicate/filtered. Older refill logic returned false here, causing
        // manual and automatic refill to stop after the first "empty" page.
        // Keep walking the server-side page sequence until target/max attempts
        // or until the helper page says there is no Next page.
        return appended > 0 || (DS.state.autoFillHelperHasNext !== false && !DS.state.autoFillReachedEnd);
      } catch (error) {
        runStats().helperFailures += 1;
        runStats().lastError = error?.message || String(error);
        runStats().lastPage = Number(nextPage) || 0;
        DS.runtimeLog?.("warn", "listing-refill", "Helper page failed", { page: nextPage, error: error?.message || String(error) });
        if (manual) DS.setQuickStatus?.(`Could not load listing page ${nextPage}: ${error?.message || "request failed"}`);
        return false;
      }
    }

    if (manual) DS.setQuickStatus?.("Auto-fill could not find more listing pages to load.");
    return false;
  }

  DS.applyListingAutoFill = async function applyListingAutoFill() {
    if (LISTING_REFILL_WORKER) return;
    if (document.hidden && DS.state?.settings?.pauseQolInHiddenTabs !== false) return;
    removeDuplicateExtraCards();
    rememberCurrentHomeDiscoveryUrl();
    ensureListingRefillButton();
    updateListingFilterStats();
    if (DS.state.autoFillRunning) return;
    if (!DS.state?.settings?.autoFillListings) return;

    DS.state.autoFillRunning = true;
    let continuing = false;
    try {
      const clicked = await runOneAutoFillStep({ manual: false });
      const target = Math.max(1, Math.min(200, Number(DS.state.settings.autoFillTargetCards || 50)));
      const maxClicks = Math.max(1, Math.min(30, Number(DS.state.settings.autoFillMaxClicks || 8)));
      continuing = !!(clicked && !DS.state.autoFillStopRequested && visibleCardCount() < target && (DS.state.autoFillClicks || 0) < maxClicks);
      if (continuing) {
        setTimeout(() => DS.applyListingAutoFill?.(), 320);
      } else {
        await releaseRefillPageWorker();
      }
    } finally {
      DS.state.autoFillRunning = false;
      DS.updateQuickPanel?.();
    }
  };

  DS.manualListingAutoFill = async function manualListingAutoFill() {
    if (LISTING_REFILL_WORKER) return;
    ensureListingRefillButton();
    if (DS.state.autoFillRunning) {
      DS.stopListingAutoFill?.();
      return;
    }
    if (mobileFillBlocked()) {
      DS.setQuickStatus?.("Listing refill is disabled on phone/mobile for now.");
      return;
    }

    DS.state.autoFillRunning = true;
    try {
      DS.resetAutoFillIfUrlChanged?.();
      await releaseRefillPageWorker();
      DS.state.autoFillRunId = newRefillRunId();
      DS.state.autoFillRejectedBotIds = new Set();
      DS.state.autoFillClicks = 0;
      DS.state.autoFillNextPage = currentPage() + 1;
      DS.state.autoFillReachedEnd = false;
      DS.state.autoFillHelperHasNext = true;
      DS.state.autoFillStopRequested = false;
      DS.state.autoFillPausedByUser = false;
      resetRunStats();
      removeExtraCards();
      await DS.applyCardHiding?.();

      const target = Math.max(1, Math.min(200, Number(DS.state.settings.autoFillTargetCards || 50)));
      const maxClicks = Math.max(1, Math.min(30, Number(DS.state.settings.autoFillMaxClicks || 8)));
      for (let i = 0; i < maxClicks && visibleCardCount() < target; i++) {
        if (DS.state.autoFillStopRequested) break;
        const clicked = await runOneAutoFillStep({ manual: true });
        if (!clicked || DS.state.autoFillStopRequested) break;
      }

      const stats = runStats();
      const stopped = !!DS.state.autoFillStopRequested;
      DS.setQuickStatus?.(stopped
        ? `Refill stopped: ${visibleCardCount()}/${target} visible. ${stats.appended || 0} added, ${stats.blockedRejected || 0} blocked + ${stats.filterRejected || 0} filtered before insert, ${stats.duplicates || 0} duplicates skipped.`
        : `Refill done: ${visibleCardCount()}/${target} visible. ${stats.appended || 0} added, ${stats.blockedRejected || 0} blocked + ${stats.filterRejected || 0} filtered before insert, ${stats.duplicates || 0} duplicates skipped.`);
    } finally {
      await releaseRefillPageWorker();
      DS.state.autoFillRejectedBotIds = new Set();
      DS.state.autoFillRunning = false;
      DS.state.autoFillStopRequested = false;
      ensureListingRefillButton();
      updateListingFilterStats();
      DS.updateQuickPanel?.();
    }
  };

  function isMyCreationsChatbotsPage() {
    const path = location.pathname.replace(/\/+$/, "");
    return path === "/my-creations/chatbots";
  }

  function findMyCreationsLoadMoreButton() {
    if (!isMyCreationsChatbotsPage()) return null;
    const exact = document.querySelector('button[data-testid="ChatbotMy-LoadMoreButton"]');
    if (exact && !exact.disabled && exact.getAttribute("aria-disabled") !== "true" && isVisible(exact)) return exact;

    const fallback = DS.findListingLoadMoreButton?.();
    if (!fallback || fallback.disabled || !isVisible(fallback)) return null;
    return fallback;
  }

  function myCreationsFingerprint() {
    if (!isMyCreationsChatbotsPage()) return "";
    const ids = [];
    for (const anchor of document.querySelectorAll("a[href*='/chat/'], a[href*='/chatbot/']")) {
      const id = botIdFromLink(anchor);
      if (!id || ids.includes(id)) continue;
      ids.push(id);
    }
    const head = ids.slice(0, 4).join(",");
    const tail = ids.slice(-2).join(",");
    return `${ids.length}|${head}|${tail}|${findMyCreationsLoadMoreButton() ? "more" : "end"}`;
  }

  function resetMyCreationsAutoLoadState() {
    DS.state.myCreationsAutoLoadRunning = false;
    DS.state.myCreationsAutoLoadLastFingerprint = "";
    DS.state.myCreationsAutoLoadLastPages = 0;
    DS.state.myCreationsAutoLoadLoadedPages = 0;
  }

  async function waitForMyCreationsGrowth(beforeCount, timeoutMs = 6500) {
    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(result);
      };
      const observer = new MutationObserver(() => {
        const count = currentBotIds().size;
        // SpicyChat can temporarily remove/disable Load More while its native
        // request is in flight. Do not mistake that loading state for the end
        // of the list; growth or the timeout decides the result.
        if (count > beforeCount) finish({ grew: true, count });
      });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      const timer = setTimeout(() => {
        const count = currentBotIds().size;
        finish({ grew: count > beforeCount, count });
      }, timeoutMs);
    });
  }

  DS.applyMyCreationsAutoLoad = async function applyMyCreationsAutoLoad() {
    if (LISTING_REFILL_WORKER) return;

    if (!isMyCreationsChatbotsPage()) {
      if (DS.state.myCreationsAutoLoadLastPath) resetMyCreationsAutoLoadState();
      DS.state.myCreationsAutoLoadLastPath = "";
      return;
    }

    DS.state.myCreationsAutoLoadLastPath = "/my-creations/chatbots";
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.autoLoadMyCreations) return;
    if (DS.state.myCreationsAutoLoadRunning) return;

    const pages = Math.max(1, Math.min(30, Number(settings.myCreationsAutoLoadPages) || 1));
    const beforeFingerprint = myCreationsFingerprint();
    if (
      beforeFingerprint &&
      DS.state.myCreationsAutoLoadLastFingerprint === beforeFingerprint &&
      Number(DS.state.myCreationsAutoLoadLastPages || 0) === pages
    ) return;

    DS.state.myCreationsAutoLoadRunning = true;
    DS.state.myCreationsAutoLoadLoadedPages = 0;
    try {
      for (let page = 0; page < pages; page++) {
        const button = findMyCreationsLoadMoreButton();
        if (!button) break;

        const beforeTotal = currentBotIds().size;
        DS.runtimeLog?.("info", "my-creations-auto-load", "Loading My Creations batch", {
          batch: page + 1,
          requested: pages,
          beforeTotal
        });
        DS.realClick?.(button, { scroll: false });
        const result = await waitForMyCreationsGrowth(beforeTotal, 6500);
        if (!result.grew) {
          DS.runtimeLog?.("warn", "my-creations-auto-load", "Load More produced no new My Creations cards", {
            batch: page + 1,
            requested: pages,
            beforeTotal,
            afterTotal: result.count
          });
          break;
        }

        DS.state.myCreationsAutoLoadLoadedPages = page + 1;
        // Give the native React list a short settle window before another click.
        await DS.sleep?.(180);
      }

      DS.state.myCreationsAutoLoadLastPages = pages;
      DS.state.myCreationsAutoLoadLastFingerprint = myCreationsFingerprint();
      if (DS.state.myCreationsAutoLoadLoadedPages) {
        DS.bumpDomRevision?.();
        DS.runtimeLog?.("info", "my-creations-auto-load", "My Creations auto-load complete", {
          loaded: DS.state.myCreationsAutoLoadLoadedPages,
          requested: pages,
          total: currentBotIds().size
        });
      }
    } finally {
      DS.state.myCreationsAutoLoadRunning = false;
    }
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "DS_LISTING_REFILL_FAVORITE_RUN") {
      if (!LISTING_REFILL_WORKER) {
        sendResponse({ ok: false, status: "not-worker" });
        return false;
      }
      runWorkerFavorite(message.botId)
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, status: "favorite-error", error: error?.message || String(error) }));
      return true;
    }

    if (message?.type !== "DS_LISTING_REFILL_EXTRACT") return false;
    if (!LISTING_REFILL_WORKER) {
      sendResponse({ ok: false, status: "not-worker" });
      return false;
    }

    const grid = cardGridInDocument(document);
    const wrappers = grid ? wrappersFromFetchedDocument(document) : [];
    if (!grid || wrappers.length < 1) {
      sendResponse({ ok: false, status: "not-ready" });
      return false;
    }

    const requested = Math.max(0, Number(message.expectedPage || 0) || 0);
    const actual = currentPage();
    if (requested && actual !== requested) {
      sendResponse({ ok: false, status: "page-mismatch", requestedPage: requested, actualPage: actual });
      return false;
    }

    sendResponse({
      ok: true,
      status: "ready",
      page: actual,
      lastPage: lastKnownPage(),
      // SpicyChat now exposes pagination in moving windows (for example only
      // ten page buttons at once), so lastKnownPage() is not a reliable end.
      // The actual Next button on the rendered helper page is authoritative.
      hasNextPage: !!paginationNextButton(),
      baseUrl: location.href,
      cards: wrappers.slice(0, 120).map(wrapper => {
        const clean = wrapper.cloneNode(true);
        stripWorkerArtifacts(clean);
        return {
          html: clean.outerHTML,
          meta: extractCardMetadata(clean, location.href)
        };
      })
    });
    return false;
  });

  DS.applyListingRefillButton = ensureListingRefillButton;
  DS.removeListingRefillButton = removeListingRefillButton;
})();
