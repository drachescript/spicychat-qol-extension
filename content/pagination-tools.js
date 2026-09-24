(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const FALLBACK_PAGE_KEY = "public_characters_alias/sort/_text_match(buckets: 3):desc,num_messages_24h:desc[page]";
  const ABSOLUTE_MAX_PAGE = 20000;
  const NATIVE_PAGE_SIZE = 48;

  function pageLimit(settings = DS.state?.settings || {}) {
    return Math.max(100, Math.min(20000, Number(settings.paginationMaxPage) || 20000));
  }

  function pageKeyForUrl(url) {
    for (const key of url.searchParams.keys()) {
      if (/\[page\]$/i.test(key)) return key;
    }

    // InstantSearch keeps filters/sorts under the same index prefix. If some
    // filter is already in the URL, reuse that prefix instead of assuming the
    // default sort key.
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

  function currentPageFromButtons() {
    const buttons = [...document.querySelectorAll("button[aria-label^='page-']")];
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

  function restoreJumpInputs() {
    document.querySelectorAll(".ds-pagination-jump-form").forEach(form => {
      const ownerId = form.getAttribute("data-owner-id");
      const button = ownerId
        ? document.querySelector(`button[data-ds-pagination-owner='${CSS.escape(ownerId)}']`)
        : null;
      if (button) {
        button.hidden = false;
        delete button.dataset.dsPaginationOwner;
      }
      form.remove();
    });
  }

  function ensureJumpInput(button) {
    if (!button?.isConnected) return;
    const ownerId = button.dataset.dsPaginationOwner;
    if (ownerId && document.querySelector(`.ds-pagination-jump-form[data-owner-id='${CSS.escape(ownerId)}']`)) {
      return;
    }

    const id = `jump-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    button.dataset.dsPaginationOwner = id;
    button.hidden = true;

    const form = document.createElement("form");
    form.className = "ds-pagination-jump-form";
    form.dataset.ownerId = id;
    form.title = "Type a page from 1 to 20,000 and press Enter";

    const input = document.createElement("input");
    input.className = "ds-pagination-jump-input";
    input.type = "number";
    input.min = "1";
    input.max = String(ABSOLUTE_MAX_PAGE);
    input.step = "1";
    input.inputMode = "numeric";
    input.placeholder = "...";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Jump to page 1 through 20,000");

    form.appendChild(input);
    button.insertAdjacentElement("afterend", form);

    form.addEventListener("submit", event => {
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

  function restoreEstimatedLastPage() {
    document.querySelectorAll(".ds-pagination-estimated-last").forEach(button => button.remove());
  }

  function syncEstimatedLastPage() {
    restoreEstimatedLastPage();
    const total = estimatedPageCount();
    if (total <= 10) return;

    const jump = document.querySelector(".ds-pagination-jump-form");
    const parent = jump?.parentElement;
    if (!parent) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-pagination-estimated-last";
    button.setAttribute("aria-label", `page-${total}`);
    button.title = `Estimated last page from ${resultCount().toLocaleString()} results`;
    button.textContent = total.toLocaleString();
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      navigateToPage(total, { ...DS.state?.settings, paginationMaxPage: ABSOLUTE_MAX_PAGE });
    }, true);
    jump.insertAdjacentElement("afterend", button);
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

    document.querySelectorAll("button[aria-label^='page-']").forEach(button => {
      const label = String(button.getAttribute("aria-label") || "");
      const match = label.match(/^page-(\d+)$/);
      if (!match) return;
      const page = Number(match[1]);
      button.classList.toggle("ds-pagination-over-cap", settings.paginationHardCap !== false && page > max);
    });

    const next = document.querySelector("button[aria-label='next-page']");
    if (settings.paginationHardCap !== false && activePage >= max) capNextButton(next);
    else restoreNextButton(next);
  }

  function cleanup() {
    restoreJumpInputs();
    restoreEstimatedLastPage();
    document.querySelectorAll(".ds-pagination-over-cap").forEach(button => button.classList.remove("ds-pagination-over-cap"));
    document.querySelectorAll("button[data-ds-pagination-capped='1']").forEach(restoreNextButton);
  }

  DS.applyPaginationTools = function applyPaginationTools() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled) {
      cleanup();
      return;
    }

    const paginationButtons = document.querySelectorAll("button[aria-label='previous-page'], button[aria-label='next-page'], button[aria-label^='page-']");
    if (!paginationButtons.length) {
      cleanup();
      return;
    }

    if (capCurrentUrlIfNeeded(settings)) return;
    applyHardCap(settings);

    document.querySelectorAll("button[aria-label='page-...']").forEach(button => {
      if (settings.paginationJumpInput !== false) ensureJumpInput(button);
      else if (button.dataset.dsPaginationOwner) restoreJumpInputs();
    });

    if (settings.paginationJumpInput !== false) syncEstimatedLastPage();
    else restoreEstimatedLastPage();
  };

  DS.removePaginationTools = cleanup;
})();
