(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function isLorebookEntriesPage() {
    return /^\/lorebook\/edit\/[^/]+\/entries\/?$/i.test(location.pathname);
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function findEntriesRoot() {
    const header = DS.qs("[data-testid='EntriesListServer-Header']");
    return header?.parentElement || null;
  }

  function findEntryText(row) {
    if (!row) return null;

    const clamped = DS.qsa("p", row)
      .filter(p => {
        const style = String(p.getAttribute("style") || "").toLowerCase();
        return style.includes("-webkit-line-clamp") && cleanText(p.textContent).length > 30;
      })
      .sort((a, b) => cleanText(b.textContent).length - cleanText(a.textContent).length)[0];

    if (clamped) return clamped;

    return DS.qsa("div[data-tooltip-content] > p", row)
      .filter(p => cleanText(p.textContent).length > 60)
      .sort((a, b) => cleanText(b.textContent).length - cleanText(a.textContent).length)[0] || null;
  }

  function findEntryRows() {
    const root = findEntriesRoot();
    if (!root) return [];

    return DS.qsa("button[type='button']", root)
      .filter(button => !button.dataset.testid)
      .filter(button => !!findEntryText(button));
  }

  function setExpanded(text, toggle, expanded) {
    text.classList.toggle("ds-lorebook-entry-text-expanded", expanded);
    text.dataset.dsLorebookEntryExpanded = expanded ? "1" : "0";
    toggle.dataset.dsExpanded = expanded ? "1" : "0";
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.textContent = expanded ? "Show less" : "Show full text";
  }

  function ensureToggle(row, text) {
    const tools = row.nextElementSibling?.classList?.contains("ds-lb-row-tools") ? row.nextElementSibling : null;
    let wrap = tools?.nextElementSibling?.classList?.contains("ds-lorebook-entry-toggle-wrap")
      ? tools.nextElementSibling
      : row.nextElementSibling?.classList?.contains("ds-lorebook-entry-toggle-wrap")
        ? row.nextElementSibling
        : null;

    if (
      wrap?.classList?.contains("ds-lorebook-entry-toggle-wrap") &&
      (wrap._dsLorebookRow !== row || wrap._dsLorebookText !== text)
    ) {
      wrap.remove();
      wrap = null;
    }

    if (!wrap?.classList?.contains("ds-lorebook-entry-toggle-wrap")) {
      wrap = document.createElement("div");
      wrap.className = "ds-lorebook-entry-toggle-wrap";
      wrap._dsLorebookRow = row;
      wrap._dsLorebookText = text;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ds-inline-expand-toggle ds-lorebook-entry-toggle";
      toggle.textContent = "Show full text";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Expand Lorebook entry text");
      wrap.appendChild(toggle);
      (tools || row).insertAdjacentElement("afterend", wrap);

      toggle.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const expanded = toggle.dataset.dsExpanded !== "1";
        setExpanded(text, toggle, expanded);
      });
    }

    const toggle = wrap.querySelector(".ds-lorebook-entry-toggle");
    if (!toggle) return null;

    setExpanded(text, toggle, text.dataset.dsLorebookEntryExpanded === "1");
    return wrap;
  }

  function cleanup() {
    DS.qsa(".ds-lorebook-entry-toggle-wrap").forEach(node => node.remove());
    DS.qsa(".ds-lorebook-entry-text-expanded").forEach(text => {
      text.classList.remove("ds-lorebook-entry-text-expanded");
      delete text.dataset.dsLorebookEntryExpanded;
    });
  }

  DS.applyLorebookEntryExpanders = function applyLorebookEntryExpanders() {
    const settings = DS.state.settings || {};
    const enabled = !!(
      settings.enabled &&
      settings.showLorebookEntryExpandButtons &&
      isLorebookEntriesPage()
    );

    if (!enabled) {
      cleanup();
      return;
    }

    const active = new Set();
    for (const row of findEntryRows()) {
      const text = findEntryText(row);
      if (!text) continue;
      const wrap = ensureToggle(row, text);
      if (wrap) active.add(wrap);
    }

    DS.qsa(".ds-lorebook-entry-toggle-wrap").forEach(wrap => {
      if (!active.has(wrap)) wrap.remove();
    });
  };
})();
