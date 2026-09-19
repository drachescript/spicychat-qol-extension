(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const HIDDEN_CLASS = "ds-my-creations-filter-hidden";
  const ROOT_ID = "ds-my-creations-filter-root";
  const MENU_ID = "ds-my-creations-filter-menu";

  const DEFAULT_FILTERS = Object.freeze({
    visibility: "all",
    messages: "all",
    lorebook: "all",
    definition: "all",
    tokens: "all",
    recent: "all",
    workflow: "all",
    sort: "native"
  });

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseCompactNumber(value) {
    const text = clean(value).toLowerCase().replace(/,/g, "");
    const match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*([kmb])?$/i);
    if (!match) return null;
    let number = Number(match[1]);
    if (!Number.isFinite(number)) return null;
    const suffix = String(match[2] || "").toLowerCase();
    if (suffix === "k") number *= 1_000;
    else if (suffix === "m") number *= 1_000_000;
    else if (suffix === "b") number *= 1_000_000_000;
    return Math.round(number);
  }

  function numberNearIcon(card, iconClass) {
    const icon = card?.querySelector?.(`svg.${iconClass}`);
    if (!icon) return null;

    let node = icon.parentElement;
    for (let depth = 0; node && node !== card && depth < 5; depth++, node = node.parentElement) {
      const values = [...node.querySelectorAll("p, span")]
        .map(el => parseCompactNumber(el.textContent))
        .filter(value => value !== null);
      if (values.length) return values[0];
    }
    return null;
  }

  function localRecentMap() {
    const map = new Map();
    const push = (id, timestamp) => {
      const cleanId = clean(id);
      const time = Number(timestamp) || 0;
      if (!cleanId || !time) return;
      map.set(cleanId, Math.max(time, Number(map.get(cleanId)) || 0));
    };

    for (const item of DS.state?.recentlySeenBots?.entries || []) {
      push(item?.id, item?.lastSeenAt);
    }

    for (const [id, meta] of Object.entries(DS.state?.openedChatMeta || {})) {
      push(id, meta?.lastSeenAt || meta?.savedAt);
    }

    return map;
  }

  function botIdFromPair(item) {
    const href = item?.anchor?.href || "";
    return clean(DS.botIdFromHref?.(href) || DS.chatIdFromHref?.(href));
  }

  function visibility(card) {
    for (const el of card?.querySelectorAll?.("button[aria-label], [role='button'][aria-label]") || []) {
      const value = clean(el.getAttribute("aria-label")).toLowerCase();
      if (["public", "unlisted", "private"].includes(value)) return value;
    }
    return "unknown";
  }

  function definitionVisibility(card) {
    for (const el of card?.querySelectorAll?.("[data-tooltip-content]") || []) {
      const value = clean(el.getAttribute("data-tooltip-content")).toLowerCase();
      if (!value.includes("definition")) continue;
      if (value.includes("visible")) return "visible";
      if (value.includes("hidden")) return "hidden";
    }
    return "unknown";
  }

  function entries() {
    const seen = new Set();
    const recent = localRecentMap();
    return (DS.collectCards?.() || []).map((item, nativeIndex) => {
      const card = item?.card;
      if (!card || seen.has(card)) return null;
      seen.add(card);
      const target = DS.getBestHideTarget?.(card) || card;
      const id = botIdFromPair(item);
      const workflow = workflowInfo(id, card);
      return {
        id,
        card,
        target,
        nativeIndex,
        meta: {
          visibility: visibility(card),
          messages: DS.getExactBotMessageCount?.(id) ?? numberNearIcon(card, "lucide-message-square-text"),
          tokens: numberNearIcon(card, "lucide-blocks"),
          lorebook: !!DS.cardHasLorebook?.(card),
          definition: definitionVisibility(card),
          lastUsedAt: Number(recent.get(id)) || 0,
          name: clean(DS.getCardTitle?.(card) || card.querySelector?.("h2, h3, p")?.textContent || ""),
          ...workflow
        }
      };
    }).filter(Boolean);
  }

  function state() {
    if (!DS.state.myCreationsFilters) DS.state.myCreationsFilters = { ...DEFAULT_FILTERS };
    return DS.state.myCreationsFilters;
  }

  function isDefault(filters = state()) {
    return Object.keys(DEFAULT_FILTERS).every(key => (filters[key] || DEFAULT_FILTERS[key]) === DEFAULT_FILTERS[key]);
  }

  function messageMatches(value, mode) {
    if (mode === "all") return true;
    if (value === null) return mode === "unknown";
    if (mode === "0") return value === 0;
    if (mode === "1-9") return value >= 1 && value <= 9;
    if (mode === "10-49") return value >= 10 && value <= 49;
    if (mode === "50-99") return value >= 50 && value <= 99;
    if (mode === "100-499") return value >= 100 && value <= 499;
    if (mode === "500-999") return value >= 500 && value <= 999;
    if (mode === "1000+") return value >= 1000;
    return true;
  }

  function tokenMatches(value, mode) {
    if (mode === "all") return true;
    if (value === null) return mode === "unknown";
    if (mode === "0-999") return value >= 0 && value <= 999;
    if (mode === "1000-1999") return value >= 1000 && value <= 1999;
    if (mode === "2000-2399") return value >= 2000 && value <= 2399;
    if (mode === "2400+") return value >= 2400;
    return true;
  }

  function recentMatches(value, mode) {
    if (mode === "all") return true;
    const time = Number(value) || 0;
    if (mode === "seen") return time > 0;
    if (mode === "unseen") return time <= 0;
    if (!time) return false;
    const age = Date.now() - time;
    if (mode === "24h") return age <= 24 * 60 * 60 * 1000;
    if (mode === "7d") return age <= 7 * 24 * 60 * 60 * 1000;
    if (mode === "30d") return age <= 30 * 24 * 60 * 60 * 1000;
    return true;
  }

  function workflowInfo(id, card) {
    const organizer = DS.state?.botOrganization?.meta?.[id] || {};
    const localStatus = clean(organizer.status).toLowerCase();
    const auditStatus = clean(card?.querySelector?.(":scope > .ds-creation-audit-card")?.dataset?.status).toLowerCase();
    const auditIssue = auditStatus === "missing-core" || auditStatus === "check";
    const needsAttention = localStatus === "needs-work" || auditIssue;

    return {
      localStatus,
      auditStatus,
      auditIssue,
      needsAttention
    };
  }

  function workflowMatches(meta, mode) {
    if (!mode || mode === "all") return true;
    if (mode === "attention") return !!meta.needsAttention;
    if (mode === "audit") return !!meta.auditIssue;
    if (mode === "needs-work") return meta.localStatus === "needs-work";
    if (mode === "testing") return meta.localStatus === "testing";
    if (mode === "finished") return meta.localStatus === "finished";
    if (mode === "no-status") return !meta.localStatus;
    return true;
  }

  function compareNullableNumber(a, b, direction = "desc") {
    const aa = Number.isFinite(Number(a)) ? Number(a) : null;
    const bb = Number.isFinite(Number(b)) ? Number(b) : null;
    if (aa === null && bb === null) return 0;
    if (aa === null) return 1;
    if (bb === null) return -1;
    return direction === "asc" ? aa - bb : bb - aa;
  }

  function sortEntries(list, mode) {
    if (!mode || mode === "native") return [...list].sort((a, b) => a.nativeIndex - b.nativeIndex);
    return [...list].sort((a, b) => {
      if (mode === "recent") {
        const diff = compareNullableNumber(a.meta.lastUsedAt || null, b.meta.lastUsedAt || null, "desc");
        if (diff) return diff;
      } else if (mode === "messages-desc") {
        const diff = compareNullableNumber(a.meta.messages, b.meta.messages, "desc");
        if (diff) return diff;
      } else if (mode === "messages-asc") {
        const diff = compareNullableNumber(a.meta.messages, b.meta.messages, "asc");
        if (diff) return diff;
      } else if (mode === "tokens-desc") {
        const diff = compareNullableNumber(a.meta.tokens, b.meta.tokens, "desc");
        if (diff) return diff;
      } else if (mode === "tokens-asc") {
        const diff = compareNullableNumber(a.meta.tokens, b.meta.tokens, "asc");
        if (diff) return diff;
      } else if (mode === "name") {
        const diff = String(a.meta.name || "").localeCompare(String(b.meta.name || ""), undefined, { sensitivity: "base" });
        if (diff) return diff;
      }
      return a.nativeIndex - b.nativeIndex;
    });
  }

  function rememberOriginalOrder(target) {
    if (!target || target.dataset.dsMyCreationsOriginalOrder !== undefined) return;
    target.dataset.dsMyCreationsOriginalOrder = target.style.order || "";
  }

  function restoreOrder(list = entries()) {
    for (const entry of list) {
      const target = entry.target;
      if (!target) continue;
      if (target.dataset.dsMyCreationsOriginalOrder !== undefined) {
        target.style.order = target.dataset.dsMyCreationsOriginalOrder;
        delete target.dataset.dsMyCreationsOriginalOrder;
      } else {
        target.style.removeProperty("order");
      }
    }
  }

  function applyOrder(list, mode) {
    if (mode === "native") {
      restoreOrder(list);
      return;
    }
    const sorted = sortEntries(list, mode);
    sorted.forEach((entry, index) => {
      rememberOriginalOrder(entry.target);
      entry.target.style.order = String(index);
    });
  }

  function basicLoadedEntries() {
    const seen = new Set();
    return (DS.collectCards?.() || []).map(item => {
      const card = item?.card;
      if (!card || seen.has(card)) return null;
      seen.add(card);
      return {
        id: botIdFromPair(item),
        card,
        target: DS.getBestHideTarget?.(card) || card
      };
    }).filter(Boolean);
  }

  function matches(meta, filters = state()) {
    if (filters.visibility !== "all" && meta.visibility !== filters.visibility) return false;
    if (!messageMatches(meta.messages, filters.messages)) return false;
    if (filters.lorebook === "has" && !meta.lorebook) return false;
    if (filters.lorebook === "missing" && meta.lorebook) return false;
    if (filters.definition !== "all" && meta.definition !== filters.definition) return false;
    if (!tokenMatches(meta.tokens, filters.tokens)) return false;
    if (!recentMatches(meta.lastUsedAt, filters.recent)) return false;
    if (!workflowMatches(meta, filters.workflow)) return false;
    return true;
  }

  function restore(list = entries()) {
    for (const entry of list) entry.target.classList.remove(HIDDEN_CLASS);
  }

  function option(value, label) {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    return el;
  }

  function selectRow(label, key, options) {
    const row = document.createElement("label");
    row.className = "ds-my-creations-filter-row";
    const text = document.createElement("span");
    text.textContent = label;
    const select = document.createElement("select");
    select.dataset.dsFilterKey = key;
    for (const [value, title] of options) select.appendChild(option(value, title));
    row.append(text, select);
    return row;
  }

  function findToolbarHost() {
    return document.querySelector("[data-testid='BotListToolbarV2-Dropdowns']") ||
      document.querySelector("[data-testid='BotListToolbarV2-SearchInput']")?.closest("div.flex")?.parentElement ||
      null;
  }

  function ensureUi(total, matched, hasRecentActivity, hasAttention) {
    const host = findToolbarHost();
    if (!host) return null;
    host.classList.add("ds-my-creations-filter-host");

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "ds-my-creations-filter-root";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "ds-my-creations-filter-button";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-expanded", "false");
      const buttonLabel = document.createElement("span");
      buttonLabel.dataset.dsFilterButtonLabel = "1";
      buttonLabel.textContent = "QoL Filter: All";
      const buttonArrow = document.createElement("span");
      buttonArrow.setAttribute("aria-hidden", "true");
      buttonArrow.textContent = "⌄";
      button.append(buttonLabel, buttonArrow);

      const recentButton = document.createElement("button");
      recentButton.type = "button";
      recentButton.className = "ds-my-creations-recent-button";
      recentButton.dataset.dsRecentSort = "1";
      recentButton.textContent = "Recent";
      recentButton.title = "Sort loaded My Chatbots by the most recently used local bot history";

      const attentionButton = document.createElement("button");
      attentionButton.type = "button";
      attentionButton.className = "ds-my-creations-recent-button ds-my-creations-attention-button";
      attentionButton.dataset.dsAttentionFilter = "1";
      attentionButton.textContent = "Needs attention";
      attentionButton.title = "Show loaded bots marked Needs work locally or currently flagged by Creation Audit";

      const menu = document.createElement("div");
      menu.id = MENU_ID;
      menu.className = "ds-my-creations-filter-menu";
      menu.hidden = true;

      const heading = document.createElement("div");
      heading.className = "ds-my-creations-filter-heading";
      const strong = document.createElement("strong");
      strong.textContent = "My Creations filters";
      const note = document.createElement("span");
      note.textContent = "Filters combine · loaded cards only · Recent uses local history · Needs attention uses local status / Creation Audit";
      heading.append(strong, note);

      menu.append(
        heading,
        selectRow("Visibility", "visibility", [
          ["all", "All"], ["public", "Public"], ["unlisted", "Unlisted"], ["private", "Private"], ["unknown", "Unknown"]
        ]),
        selectRow("Message count", "messages", [
          ["all", "All"], ["0", "0"], ["1-9", "1–9"], ["10-49", "10–49"], ["50-99", "50–99"], ["100-499", "100–499"], ["500-999", "500–999"], ["1000+", "1,000+"], ["unknown", "Unknown"]
        ]),
        selectRow("Lorebook", "lorebook", [
          ["all", "All"], ["has", "Has Lorebook"], ["missing", "No Lorebook"]
        ]),
        selectRow("Definition", "definition", [
          ["all", "All"], ["visible", "Definition visible"], ["hidden", "Definition hidden"], ["unknown", "Unknown"]
        ]),
        selectRow("Card tokens", "tokens", [
          ["all", "All"], ["0-999", "0–999"], ["1000-1999", "1,000–1,999"], ["2000-2399", "2,000–2,399"], ["2400+", "2,400+"], ["unknown", "Unknown"]
        ]),
        selectRow("Recent use", "recent", [
          ["all", "All"], ["24h", "Last 24 hours"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["seen", "Seen locally"], ["unseen", "No local history"]
        ]),
        selectRow("Creator workflow", "workflow", [
          ["all", "All"], ["attention", "Needs attention"], ["audit", "Creation Audit issues"], ["needs-work", "Needs work"], ["testing", "Testing"], ["finished", "Finished"], ["no-status", "No local status"]
        ]),
        selectRow("Order", "sort", [
          ["native", "SpicyChat default"], ["recent", "Recently used"], ["messages-desc", "Most messages"], ["messages-asc", "Fewest messages"], ["tokens-desc", "Highest tokens"], ["tokens-asc", "Lowest tokens"], ["name", "Name A–Z"]
        ])
      );

      const footer = document.createElement("div");
      footer.className = "ds-my-creations-filter-footer";
      const count = document.createElement("span");
      count.dataset.dsFilterCount = "1";
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "ds-my-creations-filter-reset";
      reset.textContent = "Reset to All";
      footer.append(count, reset);
      menu.appendChild(footer);

      root.append(button, recentButton, attentionButton, menu);
      host.appendChild(root);

      button.addEventListener("click", event => {
        event.stopPropagation();
        menu.hidden = !menu.hidden;
        button.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
      });

      recentButton.addEventListener("click", event => {
        event.stopPropagation();
        const filters = state();
        filters.sort = filters.sort === "recent" ? "native" : "recent";
        DS.saveRememberedMyCreationsFilters?.(filters);
        DS.applyMyCreationsFilters?.();
      });

      attentionButton.addEventListener("click", event => {
        event.stopPropagation();
        const filters = state();
        filters.workflow = filters.workflow === "attention" ? "all" : "attention";
        DS.saveRememberedMyCreationsFilters?.(filters);
        DS.applyMyCreationsFilters?.();
      });

      menu.addEventListener("click", event => event.stopPropagation());
      menu.addEventListener("change", event => {
        const select = event.target.closest("select[data-ds-filter-key]");
        if (!select) return;
        const filters = state();
        filters[select.dataset.dsFilterKey] = select.value;
        DS.saveRememberedMyCreationsFilters?.(filters);
        DS.applyMyCreationsFilters?.();
      });

      reset.addEventListener("click", () => {
        DS.state.myCreationsFilters = { ...DEFAULT_FILTERS };
        DS.saveRememberedMyCreationsFilters?.(DS.state.myCreationsFilters);
        DS.applyMyCreationsFilters?.();
      });

      if (!DS.state.myCreationsFilterGlobalListeners) {
        DS.state.myCreationsFilterGlobalListeners = true;
        document.addEventListener("click", () => {
          const currentMenu = document.getElementById(MENU_ID);
          const currentRoot = document.getElementById(ROOT_ID);
          if (!currentMenu || currentMenu.hidden) return;
          currentMenu.hidden = true;
          currentRoot?.querySelector(".ds-my-creations-filter-button")?.setAttribute("aria-expanded", "false");
        });
        document.addEventListener("keydown", event => {
          if (event.key !== "Escape") return;
          const currentMenu = document.getElementById(MENU_ID);
          const currentRoot = document.getElementById(ROOT_ID);
          if (!currentMenu || currentMenu.hidden) return;
          currentMenu.hidden = true;
          currentRoot?.querySelector(".ds-my-creations-filter-button")?.setAttribute("aria-expanded", "false");
        });
      }
    } else if (root.parentElement !== host) {
      host.appendChild(root);
    }

    const filters = state();
    root.querySelectorAll("select[data-ds-filter-key]").forEach(select => {
      const key = select.dataset.dsFilterKey;
      select.value = filters[key] || DEFAULT_FILTERS[key];
    });

    const recentButton = root.querySelector("[data-ds-recent-sort]");
    if (recentButton) {
      const hasRecent = !!hasRecentActivity;
      recentButton.classList.toggle("is-active", filters.sort === "recent");
      recentButton.classList.toggle("is-empty", !hasRecent);
      recentButton.textContent = filters.sort === "recent" ? "Recent ✓" : "Recent";
      recentButton.title = hasRecent
        ? "Sort loaded My Chatbots by the most recently used local bot history"
        : "No local recent-use history is available yet. QoL uses Recently Seen and Opened-chat history when available.";
    }

    const attentionButton = root.querySelector("[data-ds-attention-filter]");
    if (attentionButton) {
      attentionButton.classList.toggle("is-active", filters.workflow === "attention");
      attentionButton.classList.toggle("is-empty", !hasAttention);
      attentionButton.textContent = filters.workflow === "attention" ? "Needs attention ✓" : "Needs attention";
      attentionButton.title = hasAttention
        ? "Show loaded bots marked Needs work locally or currently flagged by Creation Audit"
        : "No currently loaded bots are marked Needs work or flagged by Creation Audit.";
    }

    const activeCount = Object.keys(DEFAULT_FILTERS).filter(key => filters[key] !== DEFAULT_FILTERS[key]).length;
    const label = root.querySelector("[data-ds-filter-button-label]");
    if (label) label.textContent = activeCount ? `QoL Filter: ${activeCount} active` : "QoL Filter: All";
    const count = root.querySelector("[data-ds-filter-count]");
    if (count) count.textContent = `Showing ${matched}/${total}`;
    return root;
  }

  function cleanup() {
    const list = entries();
    restore(list);
    restoreOrder(list);
    document.getElementById(ROOT_ID)?.remove();
    DS.state.myCreationsFiltersWasActive = false;
  }

  DS.applyMyCreationsFilters = async function applyMyCreationsFilters() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableMyCreationsFilters || !DS.isMyCreationsChatbotsPage?.()) {
      if (DS.state.myCreationsFiltersWasActive) cleanup();
      return;
    }

    DS.state.myCreationsFiltersWasActive = true;
    if (settings.rememberMyCreationsView && !DS.state.myCreationsFiltersRememberedHydrated) {
      const remembered = await DS.getRememberedMyCreationsFilters?.();
      DS.state.myCreationsFilters = { ...DEFAULT_FILTERS, ...(remembered || {}) };
      DS.state.myCreationsFiltersRememberedHydrated = true;
    } else if (!settings.rememberMyCreationsView) {
      DS.state.myCreationsFiltersRememberedHydrated = false;
    }

    const filters = state();
    const staleFilteredState = !!document.querySelector(`.${HIDDEN_CLASS}, [data-ds-my-creations-original-order]`);

    // The default view is overwhelmingly the common case. Do not parse every
    // card's visibility/message/token/definition fields on every React mutation
    // just to conclude that all cards should remain visible in native order.
    if (isDefault(filters) && !staleFilteredState) {
      const list = basicLoadedEntries();
      const recent = localRecentMap();
      const organizer = DS.state?.botOrganization?.meta || {};
      const hasRecent = list.some(entry => Number(recent.get(entry.id)) > 0);
      const hasAttention = list.some(entry => {
        if (clean(organizer?.[entry.id]?.status).toLowerCase() === "needs-work") return true;
        const status = clean(entry.card?.querySelector?.(":scope > .ds-creation-audit-card")?.dataset?.status).toLowerCase();
        return status === "missing-core" || status === "check";
      });
      ensureUi(list.length, list.length, hasRecent, hasAttention);
      return;
    }

    const list = entries();
    restore(list);
    applyOrder(list, filters.sort || "native");

    let matched = 0;
    for (const entry of list) {
      if (matches(entry.meta, filters)) matched += 1;
      else entry.target.classList.add(HIDDEN_CLASS);
    }
    ensureUi(
      list.length,
      matched,
      list.some(entry => Number(entry.meta.lastUsedAt) > 0),
      list.some(entry => !!entry.meta.needsAttention)
    );
  };

  DS.removeMyCreationsFilters = cleanup;
})();
