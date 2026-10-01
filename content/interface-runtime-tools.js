(() => {
  "use strict";

  const DS = window.DragonScriptSpicyChatQol;
  if (!DS) return;

  const SORT_CONTROL_ID = "ds-listing-name-sort";
  const SORT_STORAGE_KEY = "dsListingNameSortMode";
  const VALID_SORT_MODES = new Set(["native", "az", "za"]);
  const BOT_LINK_RE = /\/(?:chat|chatbot)\/([0-9a-f-]{20,})(?:[/?#]|$)/i;
  const NOTIFICATION_RECHECK_MS = 1400;
  const NOTIFICATION_ATTEMPT_COOLDOWN_MS = 20000;

  const listingSortState = {
    routeKey: "",
    orderById: new Map(),
    nextOrder: 0,
    lastMode: "native",
    lastSignatureByGrid: new WeakMap()
  };

  function runtimeCounters() {
    return DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
  }

  function listingRouteKey() {
    return `${location.pathname || ""}${location.search || ""}`;
  }

  function isRealBotLink(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return false;
    return BOT_LINK_RE.test(anchor.getAttribute("href") || anchor.href || "");
  }

  function cardBotId(card) {
    const anchor = card?.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
    if (!anchor) return "";
    return (String(anchor.getAttribute("href") || anchor.href || "").match(BOT_LINK_RE)?.[1] || "").toLowerCase();
  }

  function cardName(card) {
    const candidates = [
      card?.querySelector?.("a[aria-label^='chat-with-'][title]"),
      card?.querySelector?.("a[href*='/chat/'][title]"),
      card?.querySelector?.("a[aria-label^='chat-with-']"),
      card?.querySelector?.("img[alt]")
    ].filter(Boolean);

    for (const node of candidates) {
      const text = String(node.getAttribute?.("title") || node.getAttribute?.("alt") || node.textContent || "").trim();
      if (text) return text;
    }
    return "";
  }

  function directBotCards(grid) {
    if (!(grid instanceof Element)) return [];
    return Array.from(grid.children).filter(child => {
      if (!(child instanceof Element)) return false;
      return Array.from(child.querySelectorAll("a[href*='/chat/'], a[href*='/chatbot/']")).some(isRealBotLink);
    });
  }

  function findListingGrids() {
    const root = document.querySelector("[data-testid='SearchClientCharacterListing']") || document.body;
    if (!root) return [];
    return Array.from(root.querySelectorAll(".grid")).filter(grid => directBotCards(grid).length > 0);
  }

  function currentSortMode() {
    try {
      const saved = sessionStorage.getItem(SORT_STORAGE_KEY) || "native";
      return VALID_SORT_MODES.has(saved) ? saved : "native";
    } catch {
      return listingSortState.lastMode || "native";
    }
  }

  function saveSortMode(mode) {
    const normalized = VALID_SORT_MODES.has(mode) ? mode : "native";
    listingSortState.lastMode = normalized;
    try { sessionStorage.setItem(SORT_STORAGE_KEY, normalized); } catch {}
    return normalized;
  }

  function resetRouteOrderIfNeeded() {
    const key = listingRouteKey();
    if (listingSortState.routeKey === key) return;
    listingSortState.routeKey = key;
    listingSortState.orderById.clear();
    listingSortState.nextOrder = 0;
    listingSortState.lastSignatureByGrid = new WeakMap();
  }

  function rememberNativeOrder(records) {
    for (const record of records) {
      const id = record.id;
      if (!id || listingSortState.orderById.has(id)) continue;
      listingSortState.orderById.set(id, listingSortState.nextOrder++);
    }
  }

  function sortGrid(grid, mode) {
    const cards = directBotCards(grid);
    if (cards.length < 2) return;

    // Build card metadata once. The old sort repeatedly queried every card for
    // its ID/name from inside the O(n log n) comparator, which was needlessly
    // expensive on large/refilled listings.
    const records = cards.map(card => ({ card, id: cardBotId(card), name: "" }));
    rememberNativeOrder(records);

    const currentSignature = `${mode}|${records.map(record => record.id).join(",")}`;
    if (listingSortState.lastSignatureByGrid.get(grid) === currentSignature) {
      const counters = runtimeCounters();
      counters.listingSortNoopSkips = Number(counters.listingSortNoopSkips || 0) + 1;
      return;
    }

    if (mode !== "native") {
      for (const record of records) record.name = cardName(record.card);
    }

    const sortedRecords = [...records].sort((a, b) => {
      if (mode === "native") {
        return Number(listingSortState.orderById.get(a.id) ?? Number.MAX_SAFE_INTEGER) - Number(listingSortState.orderById.get(b.id) ?? Number.MAX_SAFE_INTEGER);
      }
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
      if (cmp) return mode === "za" ? -cmp : cmp;
      return Number(listingSortState.orderById.get(a.id) ?? 0) - Number(listingSortState.orderById.get(b.id) ?? 0);
    });
    const sorted = sortedRecords.map(record => record.card);

    let changed = false;
    for (let index = 0; index < sorted.length; index++) {
      if (cards[index] !== sorted[index]) { changed = true; break; }
    }

    const finalSignature = `${mode}|${sortedRecords.map(record => record.id).join(",")}`;
    listingSortState.lastSignatureByGrid.set(grid, finalSignature);
    if (!changed) {
      const counters = runtimeCounters();
      counters.listingSortAlreadyOrdered = Number(counters.listingSortAlreadyOrdered || 0) + 1;
      return;
    }

    const cardSet = new Set(cards);
    let sortedIndex = 0;
    const fragment = document.createDocumentFragment();
    for (const child of Array.from(grid.children)) {
      fragment.appendChild(cardSet.has(child) ? sorted[sortedIndex++] : child);
    }
    grid.appendChild(fragment);

    const counters = runtimeCounters();
    counters.listingSortReorders = Number(counters.listingSortReorders || 0) + 1;
    counters.listingSortLastCount = cards.length;
    counters.listingSortMode = mode;
  }

  function findSortControlHost() {
    const listingRoot = document.querySelector("[data-testid='SearchClientCharacterListing']");
    if (!listingRoot) return null;

    const searchInput = listingRoot.querySelector("input[placeholder='Search tags']");
    if (searchInput) {
      const searchBlock = searchInput.closest(".p-2\\.5") || searchInput.parentElement?.parentElement || searchInput.parentElement;
      if (searchBlock instanceof Element) return searchBlock;
    }

    const stats = listingRoot.querySelector("[data-testid='search-stats']");
    return stats?.parentElement || listingRoot;
  }

  function ensureSortControl() {
    let wrap = document.getElementById(SORT_CONTROL_ID);
    const host = findSortControlHost();
    if (!host) return null;

    if (wrap && !wrap.isConnected) wrap = null;
    if (!wrap) {
      wrap = document.createElement("label");
      wrap.id = SORT_CONTROL_ID;
      wrap.dataset.dsOwned = "1";
      Object.assign(wrap.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginTop: "8px",
        fontSize: "12px",
        color: "inherit"
      });

      const text = document.createElement("span");
      text.textContent = "Bot order";
      text.style.whiteSpace = "nowrap";

      const select = document.createElement("select");
      select.setAttribute("aria-label", "QoL bot listing order");
      select.title = "Sort the bots currently loaded on this listing";
      Object.assign(select.style, {
        flex: "1 1 auto",
        minWidth: "0",
        borderRadius: "6px",
        border: "1px solid rgba(148,163,184,.35)",
        background: "rgba(31,41,55,.75)",
        color: "inherit",
        padding: "5px 7px",
        fontSize: "12px"
      });
      [
        ["native", "SpicyChat order"],
        ["az", "Name A → Z"],
        ["za", "Name Z → A"]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      });
      select.value = currentSortMode();
      select.addEventListener("change", () => {
        const mode = saveSortMode(select.value);
        resetRouteOrderIfNeeded();
        findListingGrids().forEach(grid => sortGrid(grid, mode));
        DS.scheduleRun?.({ priority: "slow", source: "listing-name-sort" });
      });

      wrap.append(text, select);
      host.appendChild(wrap);
    }

    const select = wrap.querySelector("select");
    if (select && select.value !== currentSortMode()) select.value = currentSortMode();
    return wrap;
  }

  DS.removeListingSortTools = function removeListingSortTools() {
    document.getElementById(SORT_CONTROL_ID)?.remove();
  };

  DS.applyListingSortTools = function applyListingSortTools() {
    if (DS.isSingleChatPage?.() || DS.isBotProfilePage?.()) {
      DS.removeListingSortTools?.();
      return;
    }
    const grids = findListingGrids();
    if (!grids.length) {
      DS.removeListingSortTools?.();
      return;
    }

    resetRouteOrderIfNeeded();
    const mode = currentSortMode();
    ensureSortControl();
    grids.forEach(grid => sortGrid(grid, mode));
    const counters = runtimeCounters();
    counters.listingSortMode = mode;
    counters.listingSortLoadedCards = grids.reduce((sum, grid) => sum + directBotCards(grid).length, 0);
  };

  DS.applyChatBackgroundControlPlacement = function applyChatBackgroundControlPlacement() {
    const bg = document.getElementById("ds-chat-background-control");
    if (!bg) return false;
    const actions = bg.parentElement;
    if (!actions) return false;
    const rating = Array.from(actions.children).find(child => {
      if (!(child instanceof Element)) return false;
      const button = child.matches?.("button") ? child : child.querySelector?.("button");
      const aria = String(button?.getAttribute?.("aria-label") || "").toLowerCase();
      return aria === "thumbsup-button" || aria.includes("thumbsup") || aria === "like" || aria === "rating";
    });
    if (!rating || rating === bg || bg.nextElementSibling === rating) return false;
    actions.insertBefore(bg, rating);
    return true;
  };

  function unreadBadge() {
    const candidates = Array.from(document.querySelectorAll(
      "a.announcekit-widget-badge, [data-announcekit-mode='badge'] a[href*='news.spicychat.ai']"
    ));
    return candidates.find(badge => {
      if (!(badge instanceof Element)) return false;
      if (badge.classList.contains("announcekit-widget-badge-hidden")) return false;
      const style = badge.getAttribute("style") || "";
      if (/visibility\s*:\s*hidden/i.test(style) || /display\s*:\s*none/i.test(style)) return false;
      return true;
    }) || null;
  }

  function notificationBadgeSignature(badge) {
    if (!badge) return "";
    const text = String(badge.textContent || "").replace(/\s+/g, "").slice(0, 32);
    const href = String(badge.getAttribute?.("href") || "");
    const cls = String(badge.className || "");
    return `${href}|${text}|${cls.includes("hidden") ? "hidden" : "shown"}`;
  }

  function nativeNotificationButton() {
    return document.querySelector("button[aria-label='notifications']");
  }

  function finishNotificationAttempt(signature) {
    const counters = runtimeCounters();
    const badge = unreadBadge();
    if (!badge) {
      counters.notificationAutoReadSuccesses = Number(counters.notificationAutoReadSuccesses || 0) + 1;
      DS.state.notificationAutoReadLastClearedSignature = signature;
      DS.runtimeLog?.("info", "notifications", "Background notification badge cleared");
    } else {
      counters.notificationAutoReadUncleared = Number(counters.notificationAutoReadUncleared || 0) + 1;
      DS.runtimeLog?.("warn", "notifications", "Notification button clicked but unread badge is still visible");
    }
    DS.state.notificationAutoReadPending = false;
  }

  DS.maybeAutoReadNotifications = function maybeAutoReadNotifications(source = "runtime") {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.autoReadNotifications || !document.hidden) return false;
    if (DS.state.notificationAutoReadPending) return false;

    const badge = unreadBadge();
    if (!badge) return false;
    const button = nativeNotificationButton();
    const counters = runtimeCounters();
    if (!button) {
      counters.notificationAutoReadMissingButtons = Number(counters.notificationAutoReadMissingButtons || 0) + 1;
      return false;
    }

    const signature = notificationBadgeSignature(badge);
    const now = Date.now();
    const lastAttemptAt = Number(DS.state.notificationAutoReadLastAttemptAt || 0);
    const lastSignature = String(DS.state.notificationAutoReadLastAttemptSignature || "");
    if (signature && signature === lastSignature && now - lastAttemptAt < NOTIFICATION_ATTEMPT_COOLDOWN_MS) return false;

    DS.state.notificationAutoReadPending = true;
    DS.state.notificationAutoReadLastAttemptAt = now;
    DS.state.notificationAutoReadLastAttemptSignature = signature;
    counters.notificationAutoReadAttempts = Number(counters.notificationAutoReadAttempts || 0) + 1;
    counters.notificationAutoReadLastSource = source;

    try {
      button.click();
      counters.notificationAutoReadClicks = Number(counters.notificationAutoReadClicks || 0) + 1;
      setTimeout(() => finishNotificationAttempt(signature), NOTIFICATION_RECHECK_MS);
      return true;
    } catch (error) {
      DS.state.notificationAutoReadPending = false;
      counters.notificationAutoReadFailures = Number(counters.notificationAutoReadFailures || 0) + 1;
      DS.runtimeLog?.("warn", "notifications", "Could not click native notification button", error);
      return false;
    }
  };

  DS.mutationsMayAffectNotifications = function mutationsMayAffectNotifications(mutations = []) {
    if (!Array.isArray(mutations) || !mutations.length) return false;
    const selector = "button[aria-label='notifications'], a.announcekit-widget-badge, [data-announcekit-mode='badge']";
    for (const mutation of mutations) {
      const nodes = [mutation.target, ...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(selector) || node.querySelector?.(selector)) return true;
      }
    }
    return false;
  };

  // Preserve the existing notification cleanup implementation, but prevent its
  // older experimental auto-read branch from racing this hardened background
  // path. Hide-button/tab-badge cleanup still runs exactly as before.
  const previousHandleNotifications = DS.handleNotifications;
  if (typeof previousHandleNotifications === "function") {
    DS.handleNotifications = async function handleNotificationsRc83() {
      const settings = DS.state?.settings || {};
      const auto = settings.autoReadNotifications === true;
      if (auto) settings.autoReadNotifications = false;
      try {
        await previousHandleNotifications.call(DS);
      } finally {
        if (auto) settings.autoReadNotifications = true;
      }
      if (auto) DS.maybeAutoReadNotifications?.("notification-cleanup-step");
    };
  }
})();
