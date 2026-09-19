(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const FALLBACK_PAGE_KEY = "public_characters_alias/sort/_text_match(buckets: 3):desc,num_messages_24h:desc[page]";

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
    const max = pageLimit(settings);
    let target = Math.max(1, Math.floor(Number(page) || 1));
    if (settings.paginationHardCap !== false) target = Math.min(target, max);

    try {
      const url = new URL(location.href);
      const key = pageKeyForUrl(url);
      url.searchParams.set(key, String(target));
      location.assign(url.href);
    } catch {}
  }

  function closeJumpForms() {
    document.querySelectorAll(".ds-pagination-jump-form").forEach(form => {
      const ownerId = form.getAttribute("data-owner-id");
      if (ownerId) {
        const owner = document.querySelector(`button[data-ds-pagination-owner='${CSS.escape(ownerId)}']`);
        if (owner) owner.hidden = false;
      }
      form.remove();
    });
  }

  function openJumpForm(button, settings) {
    if (!button?.isConnected) return;
    const existing = button.parentElement?.querySelector(".ds-pagination-jump-form");
    if (existing) {
      existing.querySelector("input")?.focus();
      return;
    }

    closeJumpForms();
    const max = pageLimit(settings);
    const ownerId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    button.dataset.dsPaginationOwner = ownerId;
    button.hidden = true;

    const form = document.createElement("form");
    form.className = "ds-pagination-jump-form";
    form.dataset.ownerId = ownerId;
    form.title = `Jump to page 1-${max.toLocaleString()}`;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = String(max);
    input.step = "1";
    input.inputMode = "numeric";
    input.placeholder = "Page";
    input.setAttribute("aria-label", `Jump to page, maximum ${max}`);

    const go = document.createElement("button");
    go.type = "submit";
    go.textContent = "Go";
    go.setAttribute("aria-label", "Go to page");

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "×";
    cancel.setAttribute("aria-label", "Cancel page jump");
    cancel.addEventListener("click", () => closeJumpForms());

    form.append(input, go, cancel);
    button.insertAdjacentElement("afterend", form);

    form.addEventListener("submit", event => {
      event.preventDefault();
      const requested = Math.floor(Number(input.value));
      if (!Number.isFinite(requested) || requested < 1) {
        input.setCustomValidity("Enter a page number of 1 or higher.");
        input.reportValidity();
        return;
      }
      if (settings.paginationHardCap !== false && requested > max) {
        input.setCustomValidity(`The configured maximum page is ${max.toLocaleString()}.`);
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      navigateToPage(requested, settings);
    });

    input.addEventListener("input", () => input.setCustomValidity(""));
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeJumpForms();
      }
    });

    requestAnimationFrame(() => input.focus());
  }

  function attachJumpButton(button, settings) {
    if (!button || button.__dsPaginationJumpHandler) return;
    const handler = event => {
      event.preventDefault();
      event.stopPropagation();
      openJumpForm(button, DS.state?.settings || settings);
    };
    button.__dsPaginationJumpHandler = handler;
    button.dataset.dsPaginationJumpReady = "1";
    button.title = "Jump to a page number";
    button.classList.add("ds-pagination-jump-button");
    button.addEventListener("click", handler, true);
  }

  function detachJumpButton(button) {
    const handler = button?.__dsPaginationJumpHandler;
    if (handler) button.removeEventListener("click", handler, true);
    if (button) {
      delete button.__dsPaginationJumpHandler;
      delete button.dataset.dsPaginationJumpReady;
      delete button.dataset.dsPaginationOwner;
      button.classList.remove("ds-pagination-jump-button");
      button.removeAttribute("title");
      button.hidden = false;
    }
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
    closeJumpForms();
    document.querySelectorAll("button[data-ds-pagination-jump-ready='1']").forEach(detachJumpButton);
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
      if (settings.paginationJumpInput !== false) attachJumpButton(button, settings);
      else detachJumpButton(button);
    });
  };

  DS.removePaginationTools = cleanup;
})();
