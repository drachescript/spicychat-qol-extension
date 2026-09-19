(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isSupportedToolbarPage() {
    // Home/search/recommendation listings already get the native-sidebar
    // "Has Lorebook" control from lorebook-search-filter.js. Keep this
    // larger sort/filter toolbar on My Creations only so it can never become
    // a direct child of SpicyChat's app-shell grid and disturb the page layout.
    return !!DS.isMyCreationsChatbotsPage?.();
  }

  function listingScope() {
    if (!isSupportedToolbarPage()) return null;

    const search = document.querySelector("[data-testid='BotListToolbarV2-SearchInput']");
    const main = search?.closest?.("main, [role='main']") || null;
    if (main) return main;

    // Current My Creations builds do not expose a semantic <main>. The search
    // toolbar is inside the content column while the navigation lives in the
    // sibling column, so the nearest large content wrapper is a safe scope.
    let node = search?.parentElement || null;
    for (let i = 0; node && i < 8; i += 1, node = node.parentElement) {
      if (node.querySelector?.("[data-testid='BotListToolbarV2-Dropdowns']") &&
          !node.querySelector?.("nav, [role='navigation']")) {
        return node;
      }
    }

    return document.querySelector("[data-testid='creation-tab-chatbots']")?.closest?.("div.grow.flex.flex-col.relative") || null;
  }

  function hasLorebook(card) {
    return !!card?.querySelector?.("[aria-label='lorebook'][title='Lorebook attached'], [aria-label='lorebook']");
  }

  function getCardEntries() {
    const entries = [];
    const seen = new Set();
    const scope = listingScope();
    if (!scope) return entries;

    for (const item of DS.collectCards?.() || []) {
      const card = item?.card;
      if (!card || seen.has(card) || !scope.contains(card)) continue;
      if (card.closest?.("nav, [role='navigation']")) continue;
      seen.add(card);

      const target = DS.getBestHideTarget?.(card) || card;
      const parent = target?.parentElement;
      if (!target || !parent) continue;

      if (!target.dataset.dsLorebookOriginalIndex) {
        const siblings = [...parent.children];
        target.dataset.dsLorebookOriginalIndex = String(Math.max(0, siblings.indexOf(target)));
      }

      entries.push({ card, target, parent, lorebook: hasLorebook(card) });
    }

    return entries;
  }

  function restore(entries) {
    for (const entry of entries) {
      entry.target.classList.remove("ds-lorebook-filter-hidden");
      delete entry.target.dataset.dsLorebookFilterHidden;
    }
  }

  function restoreOrder(entries) {
    const byParent = new Map();
    for (const entry of entries) {
      if (!byParent.has(entry.parent)) byParent.set(entry.parent, []);
      byParent.get(entry.parent).push(entry);
    }

    for (const [parent, group] of byParent) {
      group
        .sort((a, b) => Number(a.target.dataset.dsLorebookOriginalIndex || 0) - Number(b.target.dataset.dsLorebookOriginalIndex || 0))
        .forEach(entry => parent.appendChild(entry.target));
    }
  }

  function sortEntries(entries, mode) {
    if (mode === "default") {
      restoreOrder(entries);
      return;
    }

    const byParent = new Map();
    for (const entry of entries) {
      if (!byParent.has(entry.parent)) byParent.set(entry.parent, []);
      byParent.get(entry.parent).push(entry);
    }

    for (const [parent, group] of byParent) {
      group.sort((a, b) => {
        if (a.lorebook !== b.lorebook) {
          if (mode === "lorebook-first") return a.lorebook ? -1 : 1;
          if (mode === "no-lorebook-first") return a.lorebook ? 1 : -1;
        }
        return Number(a.target.dataset.dsLorebookOriginalIndex || 0) - Number(b.target.dataset.dsLorebookOriginalIndex || 0);
      });
      group.forEach(entry => parent.appendChild(entry.target));
    }
  }

  function applyFilter(entries, mode) {
    restore(entries);
    for (const entry of entries) {
      const hidden = mode === "has" ? !entry.lorebook : mode === "none" ? entry.lorebook : false;
      if (!hidden) continue;
      entry.target.classList.add("ds-lorebook-filter-hidden");
      entry.target.dataset.dsLorebookFilterHidden = "1";
    }
  }

  function findToolbarPlacement(entries) {
    const scope = listingScope();
    if (!scope) return null;

    const dropdowns = scope.querySelector?.("[data-testid='BotListToolbarV2-Dropdowns']");
    const search = scope.querySelector?.("[data-testid='BotListToolbarV2-SearchInput']");
    const toolbarRow = search?.closest?.("div.flex.gap-md.justify-between")
      || search?.closest?.("div.flex")?.parentElement
      || null;

    // Put the QoL row after SpicyChat's own My Creations toolbar, never in the
    // root app-shell grid and never inside the navigation column.
    if (toolbarRow?.parentElement && scope.contains(toolbarRow.parentElement)) {
      return { host: toolbarRow.parentElement, before: toolbarRow.nextSibling };
    }

    if (dropdowns?.parentElement && scope.contains(dropdowns.parentElement)) {
      return { host: dropdowns.parentElement, before: dropdowns.nextSibling };
    }

    const grid = entries.find(entry => entry.parent)?.parent || null;
    if (grid?.parentElement && scope.contains(grid.parentElement)) {
      return { host: grid.parentElement, before: grid };
    }
    return null;
  }

  function ensureToolbar(entries) {
    let toolbar = document.getElementById("ds-lorebook-filter-toolbar");
    const placement = findToolbarPlacement(entries);
    if (!placement?.host) return null;

    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "ds-lorebook-filter-toolbar";
      toolbar.className = "ds-lorebook-filter-toolbar";
      DS.setSafeMarkup(toolbar, `
        <label>Lorebook
          <select id="ds-lorebook-filter-mode">
            <option value="all">All</option>
            <option value="has">Has Lorebook</option>
            <option value="none">No Lorebook</option>
          </select>
        </label>
        <label>Sort
          <select id="ds-lorebook-sort-mode">
            <option value="default">SpicyChat order</option>
            <option value="lorebook-first">Lorebook first</option>
            <option value="no-lorebook-first">No Lorebook first</option>
          </select>
        </label>
        <button type="button" id="ds-lorebook-needs" hidden>Needs Lorebook</button>
        <span id="ds-lorebook-count" class="ds-lorebook-count"></span>
      `);
      if (placement.before && placement.before.parentElement === placement.host) {
        placement.host.insertBefore(toolbar, placement.before);
      } else {
        placement.host.appendChild(toolbar);
      }

      toolbar.querySelector("#ds-lorebook-filter-mode")?.addEventListener("change", event => {
        DS.state.lorebookFilterMode = event.target.value || "all";
        DS.applyLorebookListingTools?.();
      });
      toolbar.querySelector("#ds-lorebook-sort-mode")?.addEventListener("change", event => {
        DS.state.lorebookSortMode = event.target.value || "default";
        DS.applyLorebookListingTools?.();
      });
      toolbar.querySelector("#ds-lorebook-needs")?.addEventListener("click", () => {
        DS.state.lorebookFilterMode = "none";
        const select = toolbar.querySelector("#ds-lorebook-filter-mode");
        if (select) select.value = "none";
        DS.applyLorebookListingTools?.();
      });
    }

    const filter = toolbar.querySelector("#ds-lorebook-filter-mode");
    const sort = toolbar.querySelector("#ds-lorebook-sort-mode");
    if (filter) filter.value = DS.state.lorebookFilterMode || "all";
    if (sort) sort.value = DS.state.lorebookSortMode || "default";

    const total = entries.length;
    const withLorebook = entries.filter(entry => entry.lorebook).length;
    const count = toolbar.querySelector("#ds-lorebook-count");
    if (count) count.textContent = `📖 ${withLorebook}/${total} loaded${total ? ` · ${total - withLorebook} without` : ""}`;

    const needs = toolbar.querySelector("#ds-lorebook-needs");
    if (needs) needs.hidden = !DS.isMyCreationsChatbotsPage?.();

    return toolbar;
  }

  function cleanup() {
    const entries = getCardEntries();
    restore(entries);
    restoreOrder(entries);
    document.getElementById("ds-lorebook-filter-toolbar")?.remove();

    // Clear stale markers from older builds that could accidentally tag app
    // navigation/layout nodes as listing cards. Do not reorder those nodes; a
    // normal page reload restores native order safely.
    document.querySelectorAll("[data-ds-lorebook-original-index]").forEach(node => {
      if (!node.closest?.("[data-testid='BotListToolbarV2-SearchInput']") &&
          node.closest?.("nav, [role='navigation']")) {
        node.removeAttribute("data-ds-lorebook-original-index");
      }
    });

    DS.state.lorebookFilterWasActive = false;
  }

  DS.cardHasLorebook = hasLorebook;

  DS.applyLorebookListingTools = function applyLorebookListingTools() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.showLorebookFilters || !isSupportedToolbarPage()) {
      if (DS.state.lorebookFilterWasActive) cleanup();
      return;
    }

    DS.state.lorebookFilterWasActive = true;
    DS.state.lorebookFilterMode ||= "all";
    DS.state.lorebookSortMode ||= "default";

    const entries = getCardEntries();
    ensureToolbar(entries);
    sortEntries(entries, DS.state.lorebookSortMode);
    applyFilter(entries, DS.state.lorebookFilterMode);
  };

  DS.removeLorebookListingTools = cleanup;
})();
