(() => {
  "use strict";

  const DS = window.DragonScriptQoL = window.DragonScriptQoL || {};

  const FILTER_ID = "ds-lorebook-search-filter";
  const STYLE_ID = "ds-lorebook-search-filter-style";
  const HIDDEN_CLASS = "ds-lorebook-search-filter-hidden";
  const HIDDEN_ATTR = "data-ds-lorebook-search-hidden";
  const SESSION_KEY = "ds-qol-lorebook-search-only-v1";

  let observer = null;
  let observedRoot = null;
  let applyTimer = null;

  function listingRoot() {
    return document.querySelector("[data-testid='SearchClientCharacterListing']");
  }

  function searchTagsInput(root) {
    if (!root) return null;
    return [...root.querySelectorAll("input")].find(input => {
      const placeholder = String(input.getAttribute("placeholder") || "").trim().toLowerCase();
      return placeholder === "search tags" || placeholder.includes("search tag");
    }) || null;
  }

  function filterEnabled() {
    return !!DS.state?.settings?.showLorebookFilters;
  }

  function readActive() {
    try { return sessionStorage.getItem(SESSION_KEY) === "1"; }
    catch { return false; }
  }

  function writeActive(active) {
    try {
      if (active) sessionStorage.setItem(SESSION_KEY, "1");
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${HIDDEN_CLASS} { display: none !important; }
      #${FILTER_ID} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        border-top: 1px solid rgba(128,128,128,.22);
        border-bottom: 1px solid rgba(128,128,128,.14);
      }
      #${FILTER_ID} .ds-lorebook-search-filter-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        cursor: pointer;
        user-select: none;
      }
      #${FILTER_ID} .ds-lorebook-search-filter-checkbox {
        width: 16px;
        height: 16px;
        margin: 0;
        accent-color: #f5b942;
        cursor: pointer;
      }
      #${FILTER_ID} .ds-lorebook-search-filter-text {
        font-size: 14px;
        line-height: 1.2;
      }
      #${FILTER_ID} .ds-lorebook-search-filter-count {
        flex: none;
        font-size: 12px;
        opacity: .68;
        white-space: nowrap;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function fallbackCardFromAnchor(anchor) {
    if (!anchor) return null;
    return anchor.closest("div.relative.group.rounded-xl")
      || anchor.closest("div[class*='rounded-xl']")
      || DS.getCardFromChatLink?.(anchor)
      || null;
  }

  function listingCards(root) {
    if (!root) return [];
    const rows = [];
    const seenTargets = new Set();

    const collected = DS.collectCards?.() || [];
    for (const item of collected) {
      const card = item?.card || item;
      if (!card || !root.contains(card)) continue;
      const target = DS.getBestHideTarget?.(card) || card;
      if (!target || seenTargets.has(target)) continue;
      seenTargets.add(target);
      rows.push({ card, target });
    }

    if (rows.length) return rows;

    for (const anchor of root.querySelectorAll("a[href*='/chat/'], a[href*='/chatbot/']")) {
      const card = fallbackCardFromAnchor(anchor);
      if (!card || !root.contains(card)) continue;
      const target = DS.getBestHideTarget?.(card) || card;
      if (!target || seenTargets.has(target)) continue;
      seenTargets.add(target);
      rows.push({ card, target });
    }

    return rows;
  }

  function cardHasLorebook(card) {
    if (!card) return false;
    return !!card.querySelector([
      "[role='img'][aria-label='lorebook']",
      "[aria-label='lorebook']",
      "[title='Lorebook attached']"
    ].join(", "));
  }

  function updateCount(total, lorebook) {
    const count = document.querySelector(`#${FILTER_ID} .ds-lorebook-search-filter-count`);
    if (!count) return;
    const next = `${lorebook}/${total} loaded`;
    if (count.textContent !== next) count.textContent = next;
  }

  function applyCardFilter() {
    const root = listingRoot();
    if (!root || !filterEnabled()) {
      removeHiddenState();
      return;
    }

    const active = readActive();
    const cards = listingCards(root);
    let lorebookCount = 0;

    for (const { card, target } of cards) {
      const hasLorebook = cardHasLorebook(card);
      if (hasLorebook) lorebookCount += 1;
      const shouldHide = active && !hasLorebook;
      target.classList.toggle(HIDDEN_CLASS, shouldHide);
      if (shouldHide) target.setAttribute(HIDDEN_ATTR, "1");
      else target.removeAttribute(HIDDEN_ATTR);
    }

    updateCount(cards.length, lorebookCount);
  }

  function scheduleApply() {
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyTimer = null;
      applyCardFilter();
    }, 90);
  }

  function findInsertAnchor(root) {
    const input = searchTagsInput(root);
    if (!input) return null;

    const padded = input.closest("div.p-2\\.5");
    if (padded?.parentElement) return { parent: padded.parentElement, before: padded.nextSibling };

    let node = input.parentElement;
    for (let i = 0; node && i < 6; i += 1, node = node.parentElement) {
      const sibling = node.nextElementSibling;
      if (sibling?.querySelector?.("input[id^='include_'], input[id^='exclude_']")) {
        return { parent: node.parentElement, before: sibling };
      }
    }

    return input.parentElement?.parentElement
      ? { parent: input.parentElement.parentElement, before: null }
      : null;
  }

  function ensureControl() {
    const root = listingRoot();
    if (!root || !filterEnabled()) return null;

    const existing = document.getElementById(FILTER_ID);
    if (existing && root.contains(existing)) {
      const checkbox = existing.querySelector("input[type='checkbox']");
      if (checkbox) checkbox.checked = readActive();
      return existing;
    }
    existing?.remove();

    const anchor = findInsertAnchor(root);
    if (!anchor?.parent) return null;

    ensureStyle();

    const wrap = document.createElement("div");
    wrap.id = FILTER_ID;
    wrap.setAttribute("data-ds-qol", "lorebook-search-filter");

    const label = document.createElement("label");
    label.className = "ds-lorebook-search-filter-label";
    label.title = "Only show currently loaded bot cards that have a Lorebook attached";

    const checkbox = document.createElement("input");
    checkbox.className = "ds-lorebook-search-filter-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = readActive();
    checkbox.setAttribute("aria-label", "Only show bots with a Lorebook");

    const text = document.createElement("span");
    text.className = "ds-lorebook-search-filter-text";
    text.textContent = "Has Lorebook";

    const count = document.createElement("span");
    count.className = "ds-lorebook-search-filter-count";
    count.textContent = "0/0 loaded";

    label.append(checkbox, text);
    wrap.append(label, count);

    checkbox.addEventListener("change", () => {
      writeActive(checkbox.checked);
      applyCardFilter();
      DS.setQuickStatus?.(checkbox.checked
        ? "Showing loaded bots with a Lorebook."
        : "Lorebook-only search filter cleared.");
    });

    anchor.parent.insertBefore(wrap, anchor.before || null);
    return wrap;
  }

  function observeListing(root) {
    if (!root) return;
    if (observer && observedRoot === root) return;
    observer?.disconnect();
    observedRoot = root;
    observer = new MutationObserver(() => scheduleApply());
    observer.observe(root, { childList: true, subtree: true });
  }

  function removeHiddenState() {
    document.querySelectorAll(`.${HIDDEN_CLASS}, [${HIDDEN_ATTR}='1']`).forEach(node => {
      node.classList.remove(HIDDEN_CLASS);
      node.removeAttribute(HIDDEN_ATTR);
    });
  }

  DS.removeLorebookSearchFilter = function removeLorebookSearchFilter() {
    observer?.disconnect();
    observer = null;
    observedRoot = null;
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = null;
    document.getElementById(FILTER_ID)?.remove();
    removeHiddenState();
  };

  DS.applyLorebookSearchFilter = function applyLorebookSearchFilter() {
    if (!filterEnabled()) {
      DS.removeLorebookSearchFilter();
      return;
    }

    const root = listingRoot();
    if (!root) {
      DS.removeLorebookSearchFilter();
      return;
    }

    ensureControl();
    observeListing(root);
    applyCardFilter();
  };
})();
