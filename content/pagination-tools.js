(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const FALLBACK_PAGE_KEY = "public_characters_alias/sort/_text_match(buckets: 3):desc,num_messages_24h:desc[page]";
  const ABSOLUTE_MAX_PAGE = 20000;
  const NATIVE_PAGE_SIZE = 48;
  const WINDOW_RADIUS = 4;
  const EDGE_WINDOW = 10;

  function pageLimit(settings = DS.state?.settings || {}) {
    return Math.max(100, Math.min(ABSOLUTE_MAX_PAGE, Number(settings.paginationMaxPage) || ABSOLUTE_MAX_PAGE));
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

  function currentPageFromUrl() {
    try {
      const url = new URL(location.href);
      for (const [key, raw] of url.searchParams.entries()) {
        if (!/\[page\]$/i.test(key)) continue;
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 1) return Math.floor(value);
      }
    } catch {}
    return 0;
  }

  function nativePageButtons(parent = document) {
    return [...parent.querySelectorAll("button[aria-label^='page-']")];
  }

  function currentPageFromButtons() {
    const buttons = nativePageButtons();
    const active = buttons.find(button => {
      const label = String(button.getAttribute("aria-label") || "");
      if (!/^page-\d+$/.test(label)) return false;
      const cls = String(button.className || "");
      return cls.includes("bg-blue-10") || button.getAttribute("aria-current") === "page";
    });
    if (!active) return 0;
    return Number(String(active.getAttribute("aria-label") || "").replace(/^page-/, "")) || 0;
  }

  function currentPage() {
    return currentPageFromUrl() || currentPageFromButtons() || 1;
  }

  function navigateToPage(page, settings = DS.state?.settings || {}) {
    const max = Math.min(ABSOLUTE_MAX_PAGE, pageLimit(settings));
    let target = Math.min(ABSOLUTE_MAX_PAGE, Math.max(1, Math.floor(Number(page) || 1)));
    if (settings.paginationHardCap !== false) target = Math.min(target, max);

    try {
      const url = new URL(location.href);
      const key = pageKeyForUrl(url);
      url.searchParams.set(key, String(target));
      location.assign(url.href);
    } catch {}
  }

  function resultCount() {
    const text = document.querySelector("[data-testid='search-stats'] .ais-Stats-text, .ais-Stats-text")?.textContent || "";
    const match = text.replace(/,/g, "").match(/(\d+)\s+results?\b/i);
    return match ? Number(match[1]) : 0;
  }

  function estimatedPageCount() {
    const count = resultCount();
    if (!count) return 0;
    return Math.min(ABSOLUTE_MAX_PAGE, Math.max(1, Math.ceil(count / NATIVE_PAGE_SIZE)));
  }

  function highestNativePage(parent) {
    return nativePageButtons(parent)
      .map(button => String(button.getAttribute("aria-label") || "").match(/^page-(\d+)$/)?.[1])
      .filter(Boolean)
      .reduce((max, raw) => Math.max(max, Number(raw) || 0), 0);
  }

  function paginatorParent() {
    const next = document.querySelector("button[aria-label='next-page']");
    const previous = document.querySelector("button[aria-label='previous-page']");
    if (!next?.parentElement || next.parentElement !== previous?.parentElement) return null;
    return next.parentElement;
  }

  function nativeNumericTemplate(parent, active = false) {
    const current = currentPage();
    const buttons = nativePageButtons(parent).filter(button => /^page-\d+$/.test(button.getAttribute("aria-label") || ""));
    if (!buttons.length) return null;
    if (active) {
      return buttons.find(button => Number(String(button.getAttribute("aria-label") || "").replace(/^page-/, "")) === current)
        || buttons.find(button => String(button.className || "").includes("bg-blue-10"))
        || buttons[0];
    }
    return buttons.find(button => !String(button.className || "").includes("bg-blue-10") && button.getAttribute("aria-current") !== "page") || buttons[0];
  }

  function setPageButtonText(button, page) {
    const label = String(page);
    button.setAttribute("aria-label", `page-${page}`);
    const textHost = button.querySelector("p, span");
    if (textHost) textHost.textContent = label;
    else button.textContent = label;
  }

  function makePageButton(parent, page, current, settings) {
    const template = nativeNumericTemplate(parent, page === current) || nativeNumericTemplate(parent, false);
    if (!template) return null;
    const button = template.cloneNode(true);
    button.removeAttribute("id");
    button.removeAttribute("disabled");
    button.removeAttribute("data-ds-pagination-owner");
    button.removeAttribute("data-ds-pagination-capped");
    button.classList.remove("ds-pagination-native-hidden", "ds-pagination-over-cap");
    button.dataset.dsPaginationQol = "1";
    setPageButtonText(button, page);

    if (page === current) {
      button.setAttribute("aria-current", "page");
      button.classList.add("ds-pagination-qol-current");
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
      }, true);
      return button;
    }

    button.removeAttribute("aria-current");
    button.classList.remove("ds-pagination-qol-current");
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      navigateToPage(page, settings);
    }, true);
    return button;
  }

  function makeJumpInput(settings, title = "Type a page from 1 to 20,000 and press Enter") {
    const form = document.createElement("form");
    form.className = "ds-pagination-jump-form";
    form.dataset.dsPaginationQol = "1";
    form.title = title;

    const input = document.createElement("input");
    input.className = "ds-pagination-jump-input";
    input.type = "number";
    input.min = "1";
    input.max = String(ABSOLUTE_MAX_PAGE);
    input.step = "1";
    input.inputMode = "numeric";
    input.placeholder = "…";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Jump to page 1 through 20,000");

    form.appendChild(input);
    form.addEventListener("submit", event => {
      event.preventDefault();
      event.stopPropagation();
      const requested = Math.floor(Number(input.value));
      if (!Number.isFinite(requested) || requested < 1 || requested > ABSOLUTE_MAX_PAGE) {
        input.setCustomValidity("Enter a page number from 1 to 20,000.");
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      navigateToPage(requested, { ...settings, paginationMaxPage: ABSOLUTE_MAX_PAGE });
    });
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") input.blur();
    });
    return form;
  }

  function usefulJumpPages(total, current) {
    const max = Math.min(ABSOLUTE_MAX_PAGE, Math.max(total || 0, current || 1, 1));
    const values = new Set([1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);
    if (total > 1) {
      values.add(Math.max(1, Math.round(total * 0.25)));
      values.add(Math.max(1, Math.round(total * 0.5)));
      values.add(Math.max(1, Math.round(total * 0.75)));
      values.add(total);
    }
    if (current > 1) values.add(current);
    return [...values].filter(page => page >= 1 && page <= max).sort((a, b) => a - b);
  }

  function makeQuickJumpMenu(total, current, settings) {
    const select = document.createElement("select");
    select.className = "ds-pagination-quick-menu";
    select.dataset.dsPaginationQol = "1";
    select.setAttribute("aria-label", "Quick page jump");
    select.title = "Jump to a useful page or choose a random page";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Jump…";
    select.appendChild(placeholder);

    const random = document.createElement("option");
    random.value = "random";
    random.textContent = "Random page";
    select.appendChild(random);

    usefulJumpPages(total, current).forEach(page => {
      const option = document.createElement("option");
      option.value = String(page);
      option.textContent = `Page ${page.toLocaleString()}`;
      select.appendChild(option);
    });

    select.addEventListener("change", () => {
      const value = select.value;
      if (!value) return;
      let target;
      if (value === "random") {
        const upper = Math.min(ABSOLUTE_MAX_PAGE, Math.max(1, total || pageLimit(settings)));
        target = 1 + Math.floor(Math.random() * upper);
      } else {
        target = Number(value);
      }
      select.value = "";
      navigateToPage(target, { ...settings, paginationMaxPage: ABSOLUTE_MAX_PAGE });
    });
    return select;
  }

  function pageTokens(current, total) {
    if (total <= 1) return [1];
    if (total <= EDGE_WINDOW + 2) return Array.from({ length: total }, (_, index) => index + 1);

    let start = Math.max(2, current - WINDOW_RADIUS);
    let end = Math.min(total - 1, current + WINDOW_RADIUS);

    // Near either edge, keep a wider contiguous block instead of collapsing to
    // just 3-5 useful numbers like SpicyChat's current paginator does.
    if (current <= WINDOW_RADIUS + 2) {
      start = 2;
      end = Math.min(total - 1, EDGE_WINDOW + 1);
    } else if (current >= total - WINDOW_RADIUS - 1) {
      end = total - 1;
      start = Math.max(2, total - EDGE_WINDOW);
    }

    const tokens = [1];
    if (start > 2) tokens.push("gap");
    for (let page = start; page <= end; page += 1) tokens.push(page);
    if (end < total - 1) tokens.push("gap");
    tokens.push(total);
    return tokens;
  }

  function restoreNativePagination(parent = paginatorParent()) {
    if (!parent) return;
    parent.querySelectorAll("[data-ds-pagination-qol='1']").forEach(node => node.remove());
    nativePageButtons(parent).forEach(button => button.classList.remove("ds-pagination-native-hidden"));
    delete parent.dataset.dsPaginationSignature;
  }

  function syncExpandedPagination(settings) {
    const parent = paginatorParent();
    if (!parent) return false;

    const current = currentPage();
    const estimated = estimatedPageCount();
    const nativeMax = highestNativePage(parent);
    const total = Math.min(
      ABSOLUTE_MAX_PAGE,
      Math.max(current, estimated || 0, nativeMax || 0, 1)
    );
    const signature = `${current}|${total}|${settings.paginationQuickJumpMenu ? 1 : 0}`;

    // If SpicyChat has not remounted the paginator and nothing material changed,
    // keep the existing nodes instead of rebuilding on every QoL runtime pass.
    if (
      parent.dataset.dsPaginationSignature === signature &&
      parent.querySelector("[data-ds-pagination-qol='1']")
    ) {
      nativePageButtons(parent).forEach(button => button.classList.add("ds-pagination-native-hidden"));
      return true;
    }

    restoreNativePagination(parent);
    const next = parent.querySelector("button[aria-label='next-page']");
    if (!next) return false;

    nativePageButtons(parent).forEach(button => button.classList.add("ds-pagination-native-hidden"));

    const tokens = pageTokens(current, total);
    for (const token of tokens) {
      let node;
      if (token === "gap") node = makeJumpInput(settings);
      else node = makePageButton(parent, token, current, settings);
      if (node) parent.insertBefore(node, next);
    }

    if (settings.paginationQuickJumpMenu) {
      parent.insertBefore(makeQuickJumpMenu(total, current, settings), next);
    }

    parent.dataset.dsPaginationSignature = signature;
    return true;
  }

  function removeTopJumpBox() {
    document.getElementById("ds-pagination-top-jump")?.remove();
  }

  function listingStatsHost() {
    const stats = document.querySelector("[data-testid='search-stats'], .ais-Stats");
    return stats?.parentElement || stats || null;
  }

  function ensureTopJumpBox(settings) {
    if (!settings.paginationTopJumpBox) {
      removeTopJumpBox();
      return;
    }

    const host = listingStatsHost();
    if (!host) {
      removeTopJumpBox();
      return;
    }

    let box = document.getElementById("ds-pagination-top-jump");
    if (!box) {
      box = document.createElement("form");
      box.id = "ds-pagination-top-jump";
      box.className = "ds-pagination-top-jump";

      const label = document.createElement("span");
      label.textContent = "Page";

      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = String(ABSOLUTE_MAX_PAGE);
      input.step = "1";
      input.inputMode = "numeric";
      input.setAttribute("aria-label", "Go to chatbot page");

      const go = document.createElement("button");
      go.type = "submit";
      go.textContent = "Go";

      box.append(label, input, go);
      box.addEventListener("submit", event => {
        event.preventDefault();
        const requested = Math.floor(Number(input.value));
        if (!Number.isFinite(requested) || requested < 1 || requested > ABSOLUTE_MAX_PAGE) {
          input.setCustomValidity("Enter a page number from 1 to 20,000.");
          input.reportValidity();
          return;
        }
        input.setCustomValidity("");
        navigateToPage(requested, { ...DS.state?.settings, paginationMaxPage: ABSOLUTE_MAX_PAGE });
      });
      input.addEventListener("input", () => input.setCustomValidity(""));
    }

    const input = box.querySelector("input");
    if (input && document.activeElement !== input) input.placeholder = String(currentPage());
    if (box.parentElement !== host) host.appendChild(box);
  }

  function restoreNextButton(button) {
    if (!button?.dataset?.dsPaginationCapped) return;
    button.disabled = button.dataset.dsPaginationOriginalDisabled === "1";
    if (button.dataset.dsPaginationOriginalAriaDisabled) {
      button.setAttribute("aria-disabled", button.dataset.dsPaginationOriginalAriaDisabled);
    } else {
      button.removeAttribute("aria-disabled");
    }
    button.removeAttribute("title");
    delete button.dataset.dsPaginationCapped;
    delete button.dataset.dsPaginationOriginalDisabled;
    delete button.dataset.dsPaginationOriginalAriaDisabled;
  }

  function capNextButton(button) {
    if (!button) return;
    if (!button.dataset.dsPaginationCapped) {
      button.dataset.dsPaginationOriginalDisabled = button.disabled ? "1" : "0";
      button.dataset.dsPaginationOriginalAriaDisabled = button.getAttribute("aria-disabled") || "";
    }
    button.dataset.dsPaginationCapped = "1";
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.title = "QoL pagination maximum reached";
  }

  function capCurrentUrlIfNeeded(settings) {
    if (settings.paginationHardCap === false) return false;
    const max = pageLimit(settings);
    const page = currentPageFromUrl() || currentPageFromButtons();
    if (!page || page <= max) return false;
    navigateToPage(max, settings);
    return true;
  }

  function applyHardCap(settings) {
    const max = pageLimit(settings);
    const activePage = currentPage();
    const next = document.querySelector("button[aria-label='next-page']");
    if (settings.paginationHardCap !== false && activePage >= max) capNextButton(next);
    else restoreNextButton(next);
  }

  function cleanup() {
    restoreNativePagination();
    removeTopJumpBox();
    document.querySelectorAll("button[data-ds-pagination-capped='1']").forEach(restoreNextButton);
  }

  DS.applyPaginationTools = function applyPaginationTools() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled) {
      cleanup();
      return;
    }

    ensureTopJumpBox(settings);

    const paginationButtons = document.querySelectorAll("button[aria-label='previous-page'], button[aria-label='next-page'], button[aria-label^='page-']");
    if (!paginationButtons.length) {
      restoreNativePagination();
      document.querySelectorAll("button[data-ds-pagination-capped='1']").forEach(restoreNextButton);
      return;
    }

    if (capCurrentUrlIfNeeded(settings)) return;
    applyHardCap(settings);
    syncExpandedPagination(settings);
  };

  DS.removePaginationTools = cleanup;
})();
