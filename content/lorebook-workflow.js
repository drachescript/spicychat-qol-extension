(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const DRAFT_KEY = "lorebookEntryDrafts";
  const LINK_KEY = "chatbotLorebookLinks";
  const STYLE_ID = "ds-lorebook-workflow-style";
  const TOOLBAR_ID = "ds-lorebook-manager-toolbar";
  const MULTI_WORKSPACE_ID = "ds-lorebook-multi-workspace";
  const SORT_PREF_KEY = "ds-qol-lorebook-sort-preference";
  const DETAILS_SUPPRESS_PREFIX = "ds-qol-lorebook-details-manual:";
  const MAX_DRAFTS = 40;
  const analyzedEntries = new Map();

  let draftTimer = null;
  let lastDraftModal = null;
  let suppressDraftGuard = false;
  let listenersInstalled = false;
  let historyGuardInstalled = false;
  let lastSortSeen = "";
  let bulkBusy = false;
  let autoEntriesVisitId = "";
  let autoEntriesConsumed = false;
  let multiWorkspaceEntries = [];
  let multiWorkspaceSaving = false;
  let multiWorkspaceLorebookId = "";

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clean = (value, max = 24000) => String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
  const textOf = (node, max = 1000) => clean(node?.textContent || "", max);
  const unique = (values, max = 50) => [...new Set((values || []).map(v => clean(v, 120)).filter(Boolean))].slice(0, max);

  function settings() {
    return DS.state?.settings || {};
  }

  function normalizedPath() {
    return String(location.pathname || "").replace(/^\/[a-z]{2}(?=\/)/i, "").replace(/\/+$/, "") || "/";
  }

  function lorebookRoute() {
    const path = normalizedPath();
    let match = path.match(/^\/lorebook\/edit\/([^/]+)(?:\/(entries))?$/i) || path.match(/^\/lorebook\/([^/]+)\/edit(?:\/(entries))?$/i);
    if (!match) return null;
    return { id: clean(decodeURIComponent(match[1]), 200), page: match[2] ? "entries" : "details" };
  }

  function chatbotEditId() {
    const path = normalizedPath();
    const match = path.match(/^\/chatbot\/edit\/([^/]+)/i) || path.match(/^\/chatbot\/([^/]+)\/edit/i);
    return match ? clean(decodeURIComponent(match[1]), 200) : "";
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TOOLBAR_ID}{display:flex;gap:5px;align-items:center;flex-wrap:wrap;padding:4px 0;margin:2px 0 7px}
      #${TOOLBAR_ID} button{font:600 11px/1.15 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border:1px solid rgba(127,127,127,.32);border-radius:6px;padding:4px 7px;background:transparent;color:inherit;cursor:pointer}
      #${TOOLBAR_ID} button:disabled{opacity:.5;cursor:not-allowed}
      #${TOOLBAR_ID} .ds-lb-toolbar-actions{display:flex;gap:4px;align-items:center;flex-wrap:wrap;flex:1 1 100%}
      #${TOOLBAR_ID} .ds-lb-toolbar-actions[hidden]{display:none!important}
      #${TOOLBAR_ID} .ds-lb-manager-status{font-size:11px;opacity:.7;flex:1 1 180px;min-width:0}
      #${TOOLBAR_ID} .ds-lb-toolbar-toggle{white-space:nowrap}
      .ds-lb-row-tools{display:flex;gap:5px;align-items:center;padding:2px 10px 5px;font-size:11px;opacity:.82;min-height:20px;flex-wrap:wrap}
      .ds-lb-row-tools button{border:0;background:transparent;color:inherit;text-decoration:underline;cursor:pointer;padding:1px 2px;font:inherit}
      .ds-lb-row-tools [data-ds-lb-info]{font-size:11px}
      .ds-lb-row-tools .ds-lb-entry-warn{color:#f59e0b;font-weight:600}
      .ds-lb-row-tools .ds-lb-entry-bad{color:#ef4444;font-weight:600}
      .ds-lb-draft-banner{margin:0 18px 8px;padding:8px 10px;border:1px solid rgba(96,165,250,.45);border-radius:8px;background:rgba(59,130,246,.08);font-size:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .ds-lb-draft-banner button{border:1px solid rgba(127,127,127,.35);border-radius:6px;background:transparent;color:inherit;padding:4px 7px;cursor:pointer}
      .ds-lb-draft-status{font-size:12px;opacity:.72;margin-left:auto}
      .ds-lb-shortcut{margin-left:7px!important;white-space:nowrap}
      .ds-lb-duplicate-keyword{outline:1px solid rgba(245,158,11,.55);outline-offset:2px}
      #${MULTI_WORKSPACE_ID}{margin:8px 0 12px;padding:10px;border:1px solid rgba(96,165,250,.35);border-radius:10px;background:rgba(30,41,59,.18)}
      #${MULTI_WORKSPACE_ID}[hidden]{display:none!important}
      #${MULTI_WORKSPACE_ID} .ds-lb-multi-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
      #${MULTI_WORKSPACE_ID} .ds-lb-multi-head strong{margin-right:auto}
      #${MULTI_WORKSPACE_ID} button{font:600 11px/1.15 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border:1px solid rgba(127,127,127,.32);border-radius:6px;padding:5px 8px;background:transparent;color:inherit;cursor:pointer}
      #${MULTI_WORKSPACE_ID} button:disabled{opacity:.5;cursor:not-allowed}
      #${MULTI_WORKSPACE_ID} .ds-lb-multi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:8px}
      #${MULTI_WORKSPACE_ID} .ds-lb-multi-card{border:1px solid rgba(127,127,127,.24);border-radius:8px;padding:8px;display:grid;gap:6px;background:rgba(0,0,0,.12)}
      #${MULTI_WORKSPACE_ID} .ds-lb-multi-card[data-dirty="1"]{border-color:rgba(245,158,11,.55)}
      #${MULTI_WORKSPACE_ID} label{display:grid;gap:3px;font-size:11px;opacity:.9}
      #${MULTI_WORKSPACE_ID} input,#${MULTI_WORKSPACE_ID} textarea{width:100%;box-sizing:border-box;border:1px solid rgba(127,127,127,.32);border-radius:6px;background:rgba(0,0,0,.16);color:inherit;padding:6px 7px;font:12px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #${MULTI_WORKSPACE_ID} textarea{min-height:150px;resize:vertical}
      #${MULTI_WORKSPACE_ID} .ds-lb-multi-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
      #${MULTI_WORKSPACE_ID} .ds-lb-multi-state{font-size:11px;opacity:.72;margin-left:auto}
    `;
    document.documentElement.appendChild(style);
  }

  function setManagerStatus(message) {
    const node = document.querySelector(`#${TOOLBAR_ID} .ds-lb-manager-status`);
    if (node) node.textContent = message || "";
  }

  function saveSettingsPatch(patch) {
    const next = { ...(DS.state?.settings || {}), ...patch };
    if (DS.state) DS.state.settings = next;
    return DS.storageSet?.({ settings: next });
  }

  function installTabIntentListener() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("click", event => {
      const details = event.target?.closest?.("[data-testid='tab-lorebook']");
      const route = lorebookRoute();
      if (details && route?.id) {
        try { sessionStorage.setItem(`${DETAILS_SUPPRESS_PREFIX}${route.id}`, String(Date.now())); } catch {}
      }

      const menuItem = event.target?.closest?.("[data-ds-edit-lorebook-menu]");
      if (menuItem) {
        event.preventDefault();
        event.stopPropagation();
        openLorebookForChat(menuItem.dataset.dsChatbotId || "");
      }
    }, true);

    document.addEventListener("pointerdown", protectDraftOutsideClick, true);
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      const parts = entryModalParts();
      if (!parts || suppressDraftGuard || !isDraftDirty(parts)) return;
      event.preventDefault();
      event.stopPropagation();
      flashDraftStatus("Unsaved draft kept — use Cancel or Update when you are ready.");
    }, true);
  }

  function installHistoryGuard() {
    if (historyGuardInstalled) return;
    historyGuardInstalled = true;

    const suppressDetailsRedirect = () => {
      const route = lorebookRoute();
      if (!route?.id || route.page !== "details") return;
      try { sessionStorage.setItem(`${DETAILS_SUPPRESS_PREFIX}${route.id}`, String(Date.now())); } catch {}
    };

    // Browser Back/Forward from /entries to the Lorebook details page must not
    // immediately trigger the default-to-Entries redirect again. That produced
    // an apparent "starting to navigate" loop on Android/Firefox.
    window.addEventListener("popstate", () => {
      suppressDetailsRedirect();
      setTimeout(suppressDetailsRedirect, 0);
    }, true);

    try {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      if (nav?.type === "back_forward") suppressDetailsRedirect();
    } catch {}
  }

  function resetAutoEntriesVisit() {
    autoEntriesVisitId = "";
    autoEntriesConsumed = false;
  }

  function noteLorebookVisit(route = lorebookRoute()) {
    if (!route) {
      resetAutoEntriesVisit();
      return null;
    }
    if (autoEntriesVisitId !== route.id) {
      autoEntriesVisitId = route.id;
      autoEntriesConsumed = false;
    }
    if (route.page === "entries") autoEntriesConsumed = true;
    return route;
  }

  function maybeDefaultToEntries() {
    const route = noteLorebookVisit();
    if (!route || route.page !== "details" || !settings().lorebookDefaultEntriesTab) return;

    // This setting is a starting-tab preference, not a tab lock. Once QoL has
    // opened Entries for this Lorebook visit, the user must be free to switch
    // back to Details without being redirected again on every rerun.
    if (autoEntriesConsumed) return;

    let manualAt = 0;
    try { manualAt = Number(sessionStorage.getItem(`${DETAILS_SUPPRESS_PREFIX}${route.id}`)) || 0; } catch {}
    if (Date.now() - manualAt < 15000) {
      autoEntriesConsumed = true;
      return;
    }

    autoEntriesConsumed = true;
    const next = `${location.origin}/lorebook/edit/${encodeURIComponent(route.id)}/entries`;
    if (location.href !== next) location.replace(next);
  }

  async function applyPreferredSort() {
    const route = lorebookRoute();
    if (!route || route.page !== "entries" || !settings().lorebookRememberEntrySort) return;
    const host = document.querySelector("[data-testid='EntriesList-SortDropdown']");
    const btn = host?.querySelector("button");
    if (!btn) return;
    const current = clean(btn.getAttribute("aria-label") || btn.textContent, 80);
    if (current && current !== lastSortSeen) {
      if (lastSortSeen) {
        try { localStorage.setItem(SORT_PREF_KEY, current); } catch {}
      }
      lastSortSeen = current;
    }
    let wanted = "Name";
    try { wanted = clean(localStorage.getItem(SORT_PREF_KEY), 80) || "Name"; } catch {}
    if (/name|alphabet/i.test(current) && /name|alphabet/i.test(wanted)) return;
    if (current.toLowerCase() === wanted.toLowerCase()) return;
    if (btn.dataset.dsLorebookSortApplying === "1") return;
    btn.dataset.dsLorebookSortApplying = "1";
    try {
      btn.click();
      await sleep(60);
      const candidates = [...document.querySelectorAll("[role='option'],[role='menuitem'],button,li")].filter(node => node.offsetParent !== null && !node.closest(`#${TOOLBAR_ID}`));
      let target = candidates.find(node => textOf(node, 80).toLowerCase() === wanted.toLowerCase());
      if (!target && /name|alphabet/i.test(wanted)) target = candidates.find(node => /^(name|name a.?z|alphabetical|a.?z)$/i.test(textOf(node, 80)));
      if (target && target !== btn) {
        target.click();
        lastSortSeen = clean(target.textContent, 80) || wanted;
        try { localStorage.setItem(SORT_PREF_KEY, lastSortSeen); } catch {}
      } else {
        document.body.click();
      }
    } finally {
      setTimeout(() => { delete btn.dataset.dsLorebookSortApplying; }, 350);
    }
  }

  function findEntryRows() {
    const root = document.querySelector("[data-testid='EntriesListServer-Header']")?.parentElement;
    if (!root) return [];
    return [...root.querySelectorAll("button[type='button']")]
      .filter(button => button.offsetParent !== null)
      .filter(button => !button.dataset.testid)
      .filter(button => {
        if (button.closest(`#${TOOLBAR_ID},.ds-lb-row-tools,.ds-lorebook-entry-toggle-wrap`)) return false;
        const ps = [...button.querySelectorAll("p")];
        return ps.some(p => clean(p.textContent, 200).length > 0) && ps.some(p => clean(p.textContent, 5000).length > 30);
      });
  }

  function rowInfo(row) {
    if (!row) return null;
    const ps = [...row.querySelectorAll("p")];
    const name = clean(ps.find(p => /line-clamp-1/.test(String(p.className || "")) && clean(p.textContent, 100).length > 0)?.textContent || ps[0]?.textContent, 50);
    const contentNode = ps.filter(p => clean(p.textContent, 5000).length > 30).sort((a,b) => clean(b.textContent,5000).length-clean(a.textContent,5000).length)[0];
    const content = clean(contentNode?.textContent, 12000);
    const keywordLine = ps.find(p => /line-clamp-1/.test(String(p.className || "")) && p !== ps[0] && /,/.test(clean(p.textContent, 500)));
    const keywords = unique(String(keywordLine?.textContent || "").split(/\s*,\s*/g), 12);
    const hidden = Number(ps.find(p => /^\+\d+$/.test(clean(p.textContent, 20)))?.textContent?.replace("+", "")) || 0;
    return { name, content, keywords, hiddenKeywordCount: hidden, tokens: approxTokens(content) };
  }

  function approxTokens(content) {
    const text = clean(content, 24000);
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
  }

  function selectedRows() {
    return [...document.querySelectorAll(".ds-lb-row-tools input[data-ds-lb-select]:checked")].map(input => input._dsRow).filter(Boolean);
  }

  function ensureRowTools(row) {
    const cfg = settings();
    const selectionOn = cfg.lorebookEntrySelectionCheckbox !== false;
    const metricsOn = cfg.lorebookEntryShowTokenCount !== false ||
      cfg.lorebookEntryShowHiddenKeywordCount !== false ||
      cfg.lorebookEntryShowNoKeywordsWarning !== false ||
      cfg.lorebookEntryShowCharacterCount !== false;
    const actionsOn = cfg.lorebookEntryRenameButton !== false ||
      cfg.lorebookEntryCopyButton !== false ||
      cfg.lorebookEntryDuplicateButton !== false;

    let tools = row.nextElementSibling?.classList?.contains("ds-lb-row-tools") ? row.nextElementSibling : null;
    const toggleWrap = row.nextElementSibling?.classList?.contains("ds-lorebook-entry-toggle-wrap") ? row.nextElementSibling : null;
    if (!tools && toggleWrap?.nextElementSibling?.classList?.contains("ds-lb-row-tools")) tools = toggleWrap.nextElementSibling;

    if (!selectionOn && !metricsOn && !actionsOn) {
      tools?.remove();
      return null;
    }

    if (tools && tools._dsRow === row && row.nextElementSibling !== tools) {
      // Keep one stable sibling order shared with lorebook-entries.js:
      // native row -> manager tools -> expand/collapse control.
      row.insertAdjacentElement("afterend", tools);
    }

    if (!tools || tools._dsRow !== row) {
      tools = document.createElement("div");
      tools.className = "ds-lb-row-tools";
      tools._dsRow = row;
      const check = document.createElement("input");
      check.type = "checkbox";
      check.dataset.dsLbSelect = "1";
      check._dsRow = row;
      const label = document.createElement("span");
      label.dataset.dsLbInfo = "1";
      const rename = document.createElement("button"); rename.type = "button"; rename.textContent = "Rename"; rename.dataset.dsLbAction = "rename";
      const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "Copy"; copy.dataset.dsLbAction = "copy";
      const duplicate = document.createElement("button"); duplicate.type = "button"; duplicate.textContent = "Duplicate"; duplicate.dataset.dsLbAction = "duplicate";
      rename.addEventListener("click", () => quickRename(row));
      copy.addEventListener("click", () => copyRows([row]));
      duplicate.addEventListener("click", () => duplicateRows([row]));
      tools.append(check, label, rename, copy, duplicate);
      row.insertAdjacentElement("afterend", tools);
    }

    const check = tools.querySelector("input[data-ds-lb-select]");
    if (check) {
      check.hidden = !selectionOn;
      if (!selectionOn) check.checked = false;
    }
    const rename = tools.querySelector("[data-ds-lb-action='rename']");
    const copy = tools.querySelector("[data-ds-lb-action='copy']");
    const duplicate = tools.querySelector("[data-ds-lb-action='duplicate']");
    if (rename) rename.hidden = cfg.lorebookEntryRenameButton === false;
    if (copy) copy.hidden = cfg.lorebookEntryCopyButton === false;
    if (duplicate) duplicate.hidden = cfg.lorebookEntryDuplicateButton === false;

    const info = analyzedEntries.get(rowInfo(row)?.name) || rowInfo(row);
    const label = tools.querySelector("[data-ds-lb-info]");
    if (label && info) {
      const bits = [];
      const keys = info.keywords || [];
      const hiddenKeywordCount = Math.max(0, Number(info.hiddenKeywordCount) || 0);
      const contentLength = clean(info.content, 24000).length;
      if (cfg.lorebookEntryShowTokenCount !== false) bits.push(`≈${Number(info.tokens || approxTokens(info.content)).toLocaleString()} tokens`);
      if (cfg.lorebookEntryShowHiddenKeywordCount !== false && hiddenKeywordCount) bits.push(`+${hiddenKeywordCount} hidden keywords`);
      if (cfg.lorebookEntryShowNoKeywordsWarning !== false && !keys.length && !hiddenKeywordCount) bits.push("no keywords");
      if (cfg.lorebookEntryShowCharacterCount !== false && contentLength >= 1800) bits.push(`${contentLength.toLocaleString()}/2,000 chars`);
      label.textContent = bits.join(" · ");
      label.hidden = !bits.length;
      const bad = cfg.lorebookEntryShowCharacterCount !== false && contentLength > 2000;
      const warn = (cfg.lorebookEntryShowNoKeywordsWarning !== false && !keys.length && !hiddenKeywordCount) ||
        (cfg.lorebookEntryShowCharacterCount !== false && contentLength >= 1800);
      label.className = bad ? "ds-lb-entry-bad" : (warn ? "ds-lb-entry-warn" : "");
    } else if (label) {
      label.hidden = true;
      label.textContent = "";
    }
    return tools;
  }

  function ensureManagerToolbar() {
    const route = lorebookRoute();
    const cfg = settings();
    if (!route || route.page !== "entries" || !cfg.lorebookEntryManager) {
      document.getElementById(TOOLBAR_ID)?.remove();
      document.getElementById(MULTI_WORKSPACE_ID)?.remove();
      document.querySelectorAll(".ds-lb-row-tools").forEach(node => node.remove());
      multiWorkspaceEntries = [];
      multiWorkspaceLorebookId = "";
      return;
    }
    if (multiWorkspaceLorebookId && multiWorkspaceLorebookId !== route.id) {
      multiWorkspaceEntries = [];
      document.getElementById(MULTI_WORKSPACE_ID)?.remove();
    }
    multiWorkspaceLorebookId = route.id;
    if (!cfg.lorebookMultiEntryWorkspace) {
      document.getElementById(MULTI_WORKSPACE_ID)?.remove();
      multiWorkspaceEntries = [];
    }
    const header = document.querySelector("[data-testid='EntriesListServer-Header']");
    if (!header) return;

    const selectionOn = cfg.lorebookEntrySelectionCheckbox !== false;
    const actionDefs = [
      ["lorebookBulkSelectAll", "Select all", () => document.querySelectorAll(".ds-lb-row-tools input[data-ds-lb-select]").forEach(i => i.checked = true), true],
      ["lorebookBulkClear", "Clear", () => document.querySelectorAll(".ds-lb-row-tools input[data-ds-lb-select]").forEach(i => i.checked = false), true],
      ["lorebookBulkAnalyze", "Analyze entries", analyzeLoadedEntries, false],
      ["lorebookMultiEntryWorkspace", "Open selected", () => openRowsInWorkspace(selectedRows()), true],
      ["lorebookBulkExportSelected", "Export selected", () => exportRows(selectedRows()), true],
      ["lorebookBulkCopySelected", "Copy selected", () => copyRows(selectedRows()), true],
      ["lorebookBulkDuplicateSelected", "Duplicate selected", () => duplicateRows(selectedRows()), true],
      ["lorebookBulkAddKeyword", "Add keyword", () => bulkKeyword(true), true],
      ["lorebookBulkRemoveKeyword", "Remove keyword", () => bulkKeyword(false), true],
      ["lorebookBulkToggleEnabled", "Enable/disable", bulkToggleEnabled, true],
      ["lorebookBulkDeleteSelected", "Delete selected", bulkDelete, true],
      ["lorebookBulkFindKeyword", "Find keyword", findKeyword, false]
    ].filter(([key, , , needsSelection]) => cfg[key] !== false && (!needsSelection || selectionOn));

    const signature = JSON.stringify(actionDefs.map(item => item[0]));
    let toolbar = document.getElementById(TOOLBAR_ID);
    const previousExpanded = toolbar?.dataset.dsExpanded === "1";
    const previousStatus = toolbar?.querySelector(".ds-lb-manager-status")?.textContent || "";
    if (!toolbar || toolbar.dataset.dsConfigSignature !== signature) {
      toolbar?.remove();
      toolbar = document.createElement("div");
      toolbar.id = TOOLBAR_ID;
      toolbar.dataset.dsConfigSignature = signature;
      toolbar.dataset.dsExpanded = previousExpanded ? "1" : "0";

      if (actionDefs.length) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "ds-lb-toolbar-toggle";
        toggle.setAttribute("aria-expanded", previousExpanded ? "true" : "false");
        toggle.textContent = `Bulk actions (${actionDefs.length}) ${previousExpanded ? "▴" : "▾"}`;
        const actions = document.createElement("div");
        actions.className = "ds-lb-toolbar-actions";
        actions.hidden = !previousExpanded;
        for (const [, text, fn] of actionDefs) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = text;
          button.addEventListener("click", fn);
          actions.appendChild(button);
        }
        toggle.addEventListener("click", () => {
          const expanded = toolbar.dataset.dsExpanded !== "1";
          toolbar.dataset.dsExpanded = expanded ? "1" : "0";
          toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
          toggle.textContent = `Bulk actions (${actionDefs.length}) ${expanded ? "▴" : "▾"}`;
          actions.hidden = !expanded;
        });
        toolbar.append(toggle, actions);
      }

      const status = document.createElement("span");
      status.className = "ds-lb-manager-status";
      status.textContent = previousStatus || (selectionOn ? "Select entries for bulk actions." : "Entry tools enabled.");
      toolbar.append(status);
      header.insertAdjacentElement("afterend", toolbar);
    }

    const active = new Set();
    for (const row of findEntryRows()) {
      const tools = ensureRowTools(row);
      if (tools) active.add(tools);
    }
    document.querySelectorAll(".ds-lb-row-tools").forEach(node => { if (!active.has(node)) node.remove(); });
    if (cfg.lorebookMultiEntryWorkspace && multiWorkspaceEntries.length) renderMultiWorkspace();
  }

  function visibleEntryModal() {
    const content = [...document.querySelectorAll("textarea[name='content']")].find(node => node.offsetParent !== null);
    if (!content) return null;
    const form = content.closest("form") || content.parentElement;
    const name = [...document.querySelectorAll("input[name='name']")].find(node => node.offsetParent !== null && (form?.contains(node) || node.closest("form") === form));
    if (!name) return null;
    let root = form;
    for (let i = 0; root && i < 7; i += 1, root = root.parentElement) {
      if (root.querySelector("button[aria-label='Cancel'],button[aria-label='Update'],button[aria-label='Delete']")) break;
    }
    const keyword = [...form.querySelectorAll("input")].find(input => input !== name && /keyword|tag|maximum\s*12/i.test(String(input.placeholder || ""))) || [...form.querySelectorAll("input")].find(input => input !== name);
    return { root: root || form, form, name, keyword, content };
  }
  const entryModalParts = visibleEntryModal;

  function modalKeywords(parts) {
    if (!parts?.form) return [];
    return unique([...parts.form.querySelectorAll("button")].filter(button => button !== parts.root?.querySelector("button[aria-label='Clear all tags']"))
      .filter(button => button.querySelector("svg.lucide-x,svg[class*='lucide-x']"))
      .map(button => textOf(button, 100)), 12);
  }

  function modalData(parts) {
    return {
      name: clean(parts?.name?.value, 50),
      content: clean(parts?.content?.value, 24000),
      keywords: modalKeywords(parts)
    };
  }

  function signature(data) {
    return JSON.stringify([clean(data?.name, 50), clean(data?.content, 24000), unique(data?.keywords, 12)]);
  }

  const EMPTY_DRAFT_SIGNATURE = signature({ name: "", content: "", keywords: [] });

  function shortDraftHash(value) {
    const text = String(value || "");
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code + i;
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    return `${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`;
  }

  function draftBaseline(parts) {
    return String(parts?.root?.dataset?.dsDraftBaseline || "");
  }

  function draftKind(parts) {
    return draftBaseline(parts) === EMPTY_DRAFT_SIGNATURE ? "new" : "existing";
  }

  function newDraftInstance(parts) {
    if (!parts?.root) return "";
    if (!parts.root.dataset.dsDraftInstance) {
      const token = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      parts.root.dataset.dsDraftInstance = clean(token, 100);
    }
    return parts.root.dataset.dsDraftInstance;
  }

  function draftIdentity(parts) {
    const route = lorebookRoute();
    if (!route?.id || !parts) return "";
    if (!parts.root.dataset.dsDraftOriginalName) parts.root.dataset.dsDraftOriginalName = clean(parts.name.value, 50) || "__new__";
    const baseline = draftBaseline(parts) || signature(modalData(parts));
    if (baseline === EMPTY_DRAFT_SIGNATURE) return `${route.id}::new::${newDraftInstance(parts)}`;
    return `${route.id}::entry::${shortDraftHash(baseline)}`;
  }

  function legacyDraftIdentity(parts) {
    const route = lorebookRoute();
    if (!route?.id || !parts) return "";
    const originalName = parts.root.dataset.dsDraftOriginalName || clean(parts.name.value, 50) || "__new__";
    return `${route.id}::${originalName}`;
  }

  function isDraftDirty(parts) {
    if (!parts) return false;
    const current = signature(modalData(parts));
    const baseline = parts.root.dataset.dsDraftBaseline || current;
    return current !== baseline;
  }

  async function readDraftStore() {
    const result = await DS.storageGet?.([DRAFT_KEY]) || {};
    const raw = result[DRAFT_KEY];
    if (!raw || typeof raw !== "object") return { version: 2, drafts: {} };
    return { ...raw, version: Math.max(1, Number(raw.version) || 1), drafts: raw.drafts && typeof raw.drafts === "object" ? raw.drafts : {} };
  }

  function draftMeta(parts, id) {
    const route = lorebookRoute();
    return {
      id,
      lorebookId: route?.id || "",
      kind: draftKind(parts),
      baseline: draftBaseline(parts),
      originalName: parts?.root?.dataset?.dsDraftOriginalName || ""
    };
  }

  async function saveDraft(parts) {
    if (!parts || !settings().lorebookProtectEntryDrafts || suppressDraftGuard) return;
    const id = draftIdentity(parts);
    if (!id || !isDraftDirty(parts)) return;
    const store = await readDraftStore();
    const data = modalData(parts);
    store.version = 2;
    store.drafts[id] = { ...data, ...draftMeta(parts, id), savedAt: Date.now() };
    const rows = Object.values(store.drafts).sort((a,b) => Number(b.savedAt)-Number(a.savedAt)).slice(0, MAX_DRAFTS);
    store.drafts = Object.fromEntries(rows.map(row => [row.id, row]));
    await DS.storageSet?.({ [DRAFT_KEY]: store });
    flashDraftStatus(`Draft saved ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`);
  }

  async function clearDraft(id) {
    if (!id) return;
    const store = await readDraftStore();
    if (!store.drafts?.[id]) return;
    delete store.drafts[id];
    store.version = 2;
    await DS.storageSet?.({ [DRAFT_KEY]: store });
  }

  async function matchingDraft(store, parts, id) {
    if (!store?.drafts || !parts || !id) return null;
    if (store.drafts[id]) return { key: id, draft: store.drafts[id] };

    if (draftKind(parts) !== "existing") return null;
    const legacyId = legacyDraftIdentity(parts);
    const legacy = store.drafts[legacyId];
    if (!legacy || String(legacy.baseline || "") !== draftBaseline(parts)) return null;

    // Migrate the old name-only key so entries with the same name no longer share a draft.
    const migrated = { ...legacy, ...draftMeta(parts, id), id };
    delete store.drafts[legacyId];
    store.drafts[id] = migrated;
    store.version = 2;
    await DS.storageSet?.({ [DRAFT_KEY]: store });
    return { key: id, draft: migrated };
  }

  function draftMatchesLoadedEntry(draft) {
    const wantedName = clean(draft?.name, 50);
    const wantedContent = clean(draft?.content, 12000);
    if (!wantedName || !wantedContent) return false;
    return findEntryRows().some(row => {
      const info = rowInfo(row);
      return info && clean(info.name, 50) === wantedName && clean(info.content, 12000) === wantedContent;
    });
  }

  function recoverableNewDrafts(store, parts, currentId) {
    const route = lorebookRoute();
    if (!route?.id || draftKind(parts) !== "new") return [];
    const legacyNewId = `${route.id}::__new__`;
    return Object.entries(store?.drafts || {})
      .filter(([key, draft]) => key !== currentId && (
        (draft?.kind === "new" && draft?.lorebookId === route.id) ||
        key === legacyNewId
      ))
      .filter(([, draft]) => !draftMatchesLoadedEntry(draft))
      .map(([key, draft]) => ({ key, draft }))
      .sort((a, b) => Number(b.draft?.savedAt || 0) - Number(a.draft?.savedAt || 0));
  }

  async function adoptDraft(parts, currentId, fromKey, draft) {
    if (!parts || !currentId || !fromKey || !draft) return draft;
    if (fromKey === currentId) return draft;
    const store = await readDraftStore();
    const source = store.drafts?.[fromKey] || draft;
    if (!source) return draft;
    const migrated = { ...source, ...draftMeta(parts, currentId), id: currentId };
    delete store.drafts[fromKey];
    store.drafts[currentId] = migrated;
    store.version = 2;
    await DS.storageSet?.({ [DRAFT_KEY]: store });
    return migrated;
  }

  function scheduleDraftSave(parts) {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => saveDraft(parts).catch(() => {}), 450);
  }

  function flashDraftStatus(message) {
    const node = lastDraftModal?.root?.querySelector?.(".ds-lb-draft-status");
    if (node) node.textContent = message || "";
  }

  async function restoreDraft(parts, draft) {
    if (!parts || !draft) return;
    suppressDraftGuard = true;
    try {
      nativeSetValue(parts.name, draft.name || "");
      nativeSetValue(parts.content, draft.content || "");
      await setKeywords(parts, draft.keywords || []);
      flashDraftStatus("Local draft restored. Review it, then Update to save to SpicyChat.");
    } finally {
      suppressDraftGuard = false;
    }
  }

  async function ensureDraftProtection() {
    const parts = entryModalParts();
    if (!parts || !settings().lorebookProtectEntryDrafts) {
      lastDraftModal = null;
      return;
    }
    if (lastDraftModal?.root === parts.root && lastDraftModal?.form === parts.form && lastDraftModal?.name === parts.name && lastDraftModal?.content === parts.content) return;
    lastDraftModal = parts;
    parts.root.dataset.dsDraftBaseline = signature(modalData(parts));
    const id = draftIdentity(parts);

    const banner = document.createElement("div");
    banner.className = "ds-lb-draft-banner";
    const msg = document.createElement("span"); msg.textContent = "Lorebook draft protection is on.";
    const status = document.createElement("span"); status.className = "ds-lb-draft-status"; status.textContent = "Saved to SpicyChat";
    banner.append(msg, status);
    parts.form.insertAdjacentElement("beforebegin", banner);

    const store = await readDraftStore();
    const matched = await matchingDraft(store, parts, id);
    let previousNew = null;
    let previousNewPromptActive = false;

    const resetBanner = (statusText = "Saved to SpicyChat") => {
      banner.querySelectorAll("button").forEach(button => button.remove());
      msg.textContent = "Lorebook draft protection is on.";
      status.textContent = statusText;
      previousNewPromptActive = false;
    };

    if (matched?.draft && signature(matched.draft) !== signature(modalData(parts))) {
      const draft = matched.draft;
      msg.textContent = `A newer local draft for this entry from ${new Date(Number(draft.savedAt)||Date.now()).toLocaleString()} is available.`;
      const restore = document.createElement("button"); restore.type = "button"; restore.textContent = "Restore draft";
      const discard = document.createElement("button"); discard.type = "button"; discard.textContent = "Discard local draft";
      restore.addEventListener("click", () => restoreDraft(parts, draft));
      discard.addEventListener("click", async () => { await clearDraft(matched.key); resetBanner(); });
      banner.insertBefore(restore, status); banner.insertBefore(discard, status);
    } else if (draftKind(parts) === "new" && !isDraftDirty(parts)) {
      previousNew = recoverableNewDrafts(store, parts, id)[0] || null;
      if (previousNew?.draft) {
        const draft = previousNew.draft;
        const label = clean(draft.name, 50);
        msg.textContent = `Previous unsaved new-entry draft${label ? ` “${label}”` : ""} from ${new Date(Number(draft.savedAt)||Date.now()).toLocaleString()} is available.`;
        const restore = document.createElement("button"); restore.type = "button"; restore.textContent = "Restore previous draft";
        const separate = document.createElement("button"); separate.type = "button"; separate.textContent = "Start separate entry";
        const discard = document.createElement("button"); discard.type = "button"; discard.textContent = "Discard previous draft";
        restore.addEventListener("click", async () => {
          const adopted = await adoptDraft(parts, id, previousNew.key, draft);
          previousNew = null;
          resetBanner("Local draft restored — review it, then save to SpicyChat.");
          await restoreDraft(parts, adopted);
        });
        separate.addEventListener("click", () => { previousNew = null; resetBanner("Separate new-entry draft started."); });
        discard.addEventListener("click", async () => { await clearDraft(previousNew.key); previousNew = null; resetBanner(); });
        banner.insertBefore(restore, status); banner.insertBefore(separate, status); banner.insertBefore(discard, status);
        previousNewPromptActive = true;
      }
    }

    const onInput = () => {
      if (previousNewPromptActive) {
        previousNew = null;
        resetBanner("Unsaved changes");
      } else {
        flashDraftStatus("Unsaved changes");
      }
      scheduleDraftSave(parts);
    };
    parts.name.addEventListener("input", onInput);
    parts.content.addEventListener("input", onInput);
    parts.keyword?.addEventListener("input", onInput);
    parts.form.addEventListener("click", event => {
      if (event.target?.closest?.("button") && !event.target.closest("button[aria-label='Update'],button[aria-label='Create'],button[aria-label='Save']")) scheduleDraftSave(parts);
    });

    const submit = [...parts.root.querySelectorAll("button")].find(button => /^(update|create|save|add)$/i.test(textOf(button, 40)) || /^(update|create|save|add)$/i.test(String(button.getAttribute("aria-label") || "")));
    if (submit) submit.addEventListener("click", () => {
      const draftId = id;
      const oldRoot = parts.root;
      setTimeout(async () => {
        for (let i=0;i<30;i+=1) {
          if (!document.contains(oldRoot) || oldRoot.offsetParent === null) { await clearDraft(draftId); return; }
          await sleep(100);
        }
      }, 0);
    }, { once: true });
    const del = parts.root.querySelector("button[aria-label='Delete']");
    if (del) del.addEventListener("click", () => setTimeout(() => clearDraft(id), 800), { once: true });
  }

  function protectDraftOutsideClick(event) {
    if (!settings().lorebookProtectEntryDrafts || suppressDraftGuard) return;
    const parts = entryModalParts();
    if (!parts || !isDraftDirty(parts)) return;
    if (parts.root.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    scheduleDraftSave(parts);
    flashDraftStatus("Unsaved draft kept — click Cancel or Update instead of outside the editor.");
  }

  function nativeSetValue(input, value) {
    if (!input) return;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value ?? "") }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function setKeywords(parts, keywords) {
    if (!parts?.keyword) return;
    const clear = parts.form.querySelector("button[aria-label='Clear all tags']") || parts.root.querySelector("button[aria-label='Clear all tags']");
    if (clear && modalKeywords(parts).length) { clear.click(); await sleep(70); }
    for (const keyword of unique(keywords, 12)) {
      nativeSetValue(parts.keyword, keyword);
      parts.keyword.focus();
      parts.keyword.dispatchEvent(new KeyboardEvent("keydown", { bubbles:true, cancelable:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
      parts.keyword.dispatchEvent(new KeyboardEvent("keyup", { bubbles:true, cancelable:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
      await sleep(55);
    }
  }

  async function waitFor(check, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { const value = check(); if (value) return value; } catch {}
      await sleep(60);
    }
    throw new Error("SpicyChat did not open the Lorebook entry editor in time.");
  }

  async function openRow(row) {
    if (!row) throw new Error("Entry row is missing.");
    suppressDraftGuard = true;
    try { row.click(); } finally { suppressDraftGuard = false; }
    return waitFor(entryModalParts, 5000);
  }

  async function closeModal(parts) {
    const cancel = parts?.root?.querySelector("button[aria-label='Cancel']") || [...(parts?.root?.querySelectorAll("button")||[])].find(b => /^cancel$/i.test(textOf(b,30)));
    if (cancel) { suppressDraftGuard = true; cancel.click(); suppressDraftGuard = false; await sleep(100); }
  }

  async function captureRow(row) {
    const quick = rowInfo(row);
    if (analyzedEntries.has(quick?.name)) return analyzedEntries.get(quick.name);
    const parts = await openRow(row);
    const data = modalData(parts);
    data.tokens = approxTokens(data.content);
    analyzedEntries.set(data.name, data);
    await closeModal(parts);
    return data;
  }

  async function analyzeLoadedEntries() {
    if (bulkBusy) return;
    const rows = findEntryRows();
    if (!rows.length) return setManagerStatus("No entries are loaded.");
    bulkBusy = true;
    try {
      for (let i=0;i<rows.length;i+=1) {
        setManagerStatus(`Analyzing ${i+1}/${rows.length}…`);
        await captureRow(rows[i]);
      }
      const keywordOwners = new Map();
      for (const data of analyzedEntries.values()) for (const keyword of data.keywords || []) {
        const key = keyword.toLowerCase();
        const list = keywordOwners.get(key) || []; list.push(data.name); keywordOwners.set(key, list);
      }
      const duplicateKeys = new Set([...keywordOwners.entries()].filter(([,list]) => list.length > 1).map(([key]) => key));
      const duplicateCount = duplicateKeys.size;
      ensureManagerToolbar();
      for (const row of rows) {
        const data = analyzedEntries.get(rowInfo(row)?.name);
        const tools = row.nextElementSibling?.classList?.contains("ds-lb-row-tools") ? row.nextElementSibling : null;
        if (!tools || !data) continue;
        const hasDuplicate = (data.keywords || []).some(keyword => duplicateKeys.has(keyword.toLowerCase()));
        tools.classList.toggle("ds-lb-duplicate-keyword", hasDuplicate);
        const label = tools.querySelector("[data-ds-lb-info]");
        if (hasDuplicate && label && !/duplicate keyword/i.test(label.textContent)) label.textContent += " · duplicate keyword";
      }
      setManagerStatus(`Analyzed ${rows.length} entries · ${duplicateCount} keyword${duplicateCount===1?'':'s'} reused across entries.`);
    } catch (error) {
      setManagerStatus(error?.message || String(error));
    } finally { bulkBusy = false; }
  }

  function workspaceRowByName(name) {
    const wanted = clean(name, 50).toLowerCase();
    if (!wanted) return null;
    return findEntryRows().find(row => clean(rowInfo(row)?.name, 50).toLowerCase() === wanted) || null;
  }

  function workspaceKeywords(value) {
    return unique(String(value || "").split(/[\n,;]+/g), 12);
  }

  function removeWorkspaceEntry(entry) {
    multiWorkspaceEntries = multiWorkspaceEntries.filter(item => item !== entry);
    renderMultiWorkspace();
  }

  function workspaceDirtyCount() {
    return multiWorkspaceEntries.filter(item => item.dirty).length;
  }

  function renderMultiWorkspace() {
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar || !settings().lorebookMultiEntryWorkspace || !multiWorkspaceEntries.length) {
      document.getElementById(MULTI_WORKSPACE_ID)?.remove();
      return;
    }

    let panel = document.getElementById(MULTI_WORKSPACE_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = MULTI_WORKSPACE_ID;
      toolbar.insertAdjacentElement("afterend", panel);
    }
    panel.replaceChildren();

    const head = document.createElement("div");
    head.className = "ds-lb-multi-head";
    const title = document.createElement("strong");
    title.textContent = `Multi-entry workspace (${multiWorkspaceEntries.length})`;
    const saveAll = document.createElement("button");
    saveAll.type = "button";
    saveAll.textContent = workspaceDirtyCount() ? `Save changed (${workspaceDirtyCount()})` : "Save changed";
    saveAll.disabled = multiWorkspaceSaving || !workspaceDirtyCount();
    saveAll.addEventListener("click", () => saveAllWorkspaceEntries());
    const closeAll = document.createElement("button");
    closeAll.type = "button";
    closeAll.textContent = "Close all";
    closeAll.disabled = multiWorkspaceSaving;
    closeAll.addEventListener("click", () => {
      if (workspaceDirtyCount() && !confirm("Close the multi-entry workspace and discard unsaved workspace changes?")) return;
      multiWorkspaceEntries = [];
      renderMultiWorkspace();
    });
    head.append(title, saveAll, closeAll);

    const grid = document.createElement("div");
    grid.className = "ds-lb-multi-grid";
    for (const entry of multiWorkspaceEntries) {
      const card = document.createElement("article");
      card.className = "ds-lb-multi-card";
      card.dataset.dirty = entry.dirty ? "1" : "0";

      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Entry name";
      const name = document.createElement("input");
      name.type = "text";
      name.maxLength = 50;
      name.value = entry.name || "";
      name.addEventListener("input", () => { entry.name = clean(name.value, 50); entry.dirty = true; card.dataset.dirty = "1"; save.disabled = false; saveAll.disabled = false; saveAll.textContent = `Save changed (${workspaceDirtyCount()})`; });
      nameLabel.appendChild(name);

      const keywordsLabel = document.createElement("label");
      keywordsLabel.textContent = "Keywords (comma separated)";
      const keywords = document.createElement("input");
      keywords.type = "text";
      keywords.value = (entry.keywords || []).join(", ");
      keywords.addEventListener("input", () => { entry.keywords = workspaceKeywords(keywords.value); entry.dirty = true; card.dataset.dirty = "1"; save.disabled = false; saveAll.disabled = false; saveAll.textContent = `Save changed (${workspaceDirtyCount()})`; });
      keywordsLabel.appendChild(keywords);

      const contentLabel = document.createElement("label");
      contentLabel.textContent = "Content";
      const content = document.createElement("textarea");
      content.maxLength = 2000;
      content.value = entry.content || "";
      content.addEventListener("input", () => { entry.content = content.value.slice(0, 2000); entry.dirty = true; card.dataset.dirty = "1"; save.disabled = false; saveAll.disabled = false; saveAll.textContent = `Save changed (${workspaceDirtyCount()})`; state.textContent = `${entry.content.length.toLocaleString()}/2,000 chars`; });
      contentLabel.appendChild(content);

      const actions = document.createElement("div");
      actions.className = "ds-lb-multi-actions";
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Save entry";
      save.disabled = multiWorkspaceSaving || !entry.dirty;
      save.addEventListener("click", () => saveWorkspaceEntry(entry));
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.disabled = multiWorkspaceSaving;
      close.addEventListener("click", () => {
        if (entry.dirty && !confirm(`Close “${entry.name || entry.originalName}” and discard its unsaved workspace changes?`)) return;
        removeWorkspaceEntry(entry);
      });
      const state = document.createElement("span");
      state.className = "ds-lb-multi-state";
      state.textContent = `${String(entry.content || "").length.toLocaleString()}/2,000 chars`;
      actions.append(save, close, state);
      card.append(nameLabel, keywordsLabel, contentLabel, actions);
      grid.appendChild(card);
    }
    panel.append(head, grid);
  }

  async function openRowsInWorkspace(rows) {
    if (multiWorkspaceSaving) return;
    if (!settings().lorebookMultiEntryWorkspace) return setManagerStatus("Enable multi-entry editing in Creator Helpers first.");
    if (!rows?.length) return setManagerStatus("Select at least one entry first.");
    bulkBusy = true;
    try {
      for (let index = 0; index < rows.length; index += 1) {
        setManagerStatus(`Opening ${index + 1}/${rows.length} in multi-entry workspace…`);
        const data = await captureRow(rows[index]);
        const key = clean(data?.name, 50).toLowerCase();
        if (!key) continue;
        const existing = multiWorkspaceEntries.find(item => clean(item.originalName, 50).toLowerCase() === key);
        if (existing) continue;
        multiWorkspaceEntries.push({
          originalName: clean(data.name, 50),
          name: clean(data.name, 50),
          content: clean(data.content, 2000),
          keywords: unique(data.keywords || [], 12),
          dirty: false
        });
      }
      renderMultiWorkspace();
      setManagerStatus(`Opened ${multiWorkspaceEntries.length} entr${multiWorkspaceEntries.length === 1 ? "y" : "ies"} in the workspace.`);
    } catch (error) {
      setManagerStatus(error?.message || String(error));
    } finally {
      bulkBusy = false;
    }
  }

  async function saveWorkspaceEntry(entry, { rerender = true } = {}) {
    if (!entry || !entry.dirty || multiWorkspaceSaving) return true;
    multiWorkspaceSaving = true;
    if (rerender) renderMultiWorkspace();
    try {
      const row = workspaceRowByName(entry.originalName) || workspaceRowByName(entry.name);
      if (!row) throw new Error(`Could not find “${entry.originalName || entry.name}” in the loaded Lorebook entries.`);
      const parts = await openRow(row);
      nativeSetValue(parts.name, clean(entry.name, 50));
      nativeSetValue(parts.content, clean(entry.content, 2000));
      await setKeywords(parts, entry.keywords || []);
      await submitModal(parts);
      analyzedEntries.delete(entry.originalName);
      analyzedEntries.set(clean(entry.name, 50), {
        name: clean(entry.name, 50),
        content: clean(entry.content, 2000),
        keywords: unique(entry.keywords || [], 12),
        tokens: approxTokens(entry.content)
      });
      entry.originalName = clean(entry.name, 50);
      entry.dirty = false;
      setManagerStatus(`Saved “${entry.name}”.`);
      await sleep(120);
      return true;
    } catch (error) {
      setManagerStatus(`Could not save “${entry.name || entry.originalName}”: ${error?.message || error}`);
      return false;
    } finally {
      multiWorkspaceSaving = false;
      if (rerender) renderMultiWorkspace();
    }
  }

  async function saveAllWorkspaceEntries() {
    if (multiWorkspaceSaving) return;
    const dirty = multiWorkspaceEntries.filter(entry => entry.dirty);
    if (!dirty.length) return;
    let saved = 0;
    for (const entry of dirty) {
      const ok = await saveWorkspaceEntry(entry, { rerender: false });
      if (!ok) break;
      saved += 1;
    }
    renderMultiWorkspace();
    if (saved) setManagerStatus(`Saved ${saved} workspace entr${saved === 1 ? "y" : "ies"}.`);
  }

  async function quickRename(row) {
    const data = await captureRow(row).catch(() => rowInfo(row));
    const next = prompt("Rename Lorebook entry", data?.name || "");
    if (!next || clean(next,50) === data?.name) return;
    const parts = await openRow(row);
    nativeSetValue(parts.name, clean(next,50));
    await submitModal(parts);
    analyzedEntries.delete(data?.name);
    setManagerStatus(`Renamed “${data?.name || 'entry'}”.`);
  }

  async function submitModal(parts) {
    const button = [...(parts?.root?.querySelectorAll("button")||[])].find(b => !b.disabled && /^(update|create|save|add)$/i.test(textOf(b,40))) || parts?.root?.querySelector("button[aria-label='Update']");
    if (!button) throw new Error("Could not find SpicyChat's Update/Create button.");
    const old = parts.root;
    suppressDraftGuard = true; button.click(); suppressDraftGuard = false;
    await waitFor(() => !document.contains(old) || old.offsetParent === null, 6000);
    await sleep(90);
  }

  async function createNativeEntry(data) {
    const add = document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']");
    if (!add) throw new Error("Could not find Add Entry.");
    suppressDraftGuard = true; add.click(); suppressDraftGuard = false;
    const parts = await waitFor(entryModalParts, 5000);
    nativeSetValue(parts.name, clean(data.name,50));
    nativeSetValue(parts.content, clean(data.content,2000));
    await setKeywords(parts, data.keywords || []);
    await submitModal(parts);
  }

  async function copyRows(rows) {
    if (!rows?.length) return setManagerStatus("Select at least one entry first.");
    const out = [];
    for (let i=0;i<rows.length;i+=1) {
      const data = await captureRow(rows[i]);
      out.push(`${data.name}\nKeywords: ${(data.keywords||[]).join(', ')}\n\n${data.content}`);
    }
    try { await navigator.clipboard.writeText(out.join("\n\n---\n\n")); setManagerStatus(`Copied ${rows.length} entr${rows.length===1?'y':'ies'}.`); }
    catch { setManagerStatus("Clipboard access failed."); }
  }

  async function exportRows(rows) {
    if (!rows?.length) return setManagerStatus("Select at least one entry first.");
    const payload = [];
    for (const row of rows) payload.push(await captureRow(row));
    const blob = new Blob([JSON.stringify({format:"spicychat-qol-lorebook-selected",version:1,exportedAt:new Date().toISOString(),entries:payload}, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`lorebook-selected-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    setManagerStatus(`Exported ${payload.length} selected entr${payload.length===1?'y':'ies'}.`);
  }

  async function duplicateRows(rows) {
    if (bulkBusy) return;
    if (!rows?.length) return setManagerStatus("Select at least one entry first.");
    bulkBusy = true;
    try {
      for (let i=0;i<rows.length;i+=1) {
        setManagerStatus(`Duplicating ${i+1}/${rows.length}…`);
        const data = await captureRow(rows[i]);
        const suffix = " copy";
        const name = `${data.name.slice(0, 50-suffix.length)}${suffix}`;
        await createNativeEntry({...data,name});
      }
      setManagerStatus(`Duplicated ${rows.length} entr${rows.length===1?'y':'ies'}.`);
    } catch(error) { setManagerStatus(error?.message || String(error)); }
    finally { bulkBusy=false; }
  }

  async function bulkKeyword(add) {
    const rows = selectedRows(); if (!rows.length) return setManagerStatus("Select at least one entry first.");
    const keyword = clean(prompt(`${add?'Add':'Remove'} which keyword?`, ""),80); if (!keyword) return;
    bulkBusy=true;
    try {
      for (let i=0;i<rows.length;i+=1) {
        setManagerStatus(`${add?'Adding':'Removing'} keyword ${i+1}/${rows.length}…`);
        const parts=await openRow(rows[i]); const data=modalData(parts); let keys=unique(data.keywords,12);
        if (add) keys=unique([...keys,keyword],12); else keys=keys.filter(k=>k.toLowerCase()!==keyword.toLowerCase());
        await setKeywords(parts,keys); await submitModal(parts); analyzedEntries.delete(data.name);
      }
      setManagerStatus(`${add?'Added':'Removed'} “${keyword}” for ${rows.length} entr${rows.length===1?'y':'ies'}.`);
    } catch(error){setManagerStatus(error?.message||String(error));} finally{bulkBusy=false;}
  }

  async function bulkToggleEnabled() {
    const rows=selectedRows(); if(!rows.length)return setManagerStatus("Select at least one entry first.");
    const answer = clean(prompt("Type enable or disable for the selected entries", "enable"), 20).toLowerCase();
    if (!answer) return;
    if (!["enable","enabled","disable","disabled"].includes(answer)) return setManagerStatus("Type enable or disable.");
    const mode = answer.startsWith("enable");
    bulkBusy=true; let changed=0;
    try{
      for(let i=0;i<rows.length;i+=1){
        const parts=await openRow(rows[i]);
        const labels=[...parts.root.querySelectorAll("label")];
        let control=null;
        for(const label of labels){ if(/enabled|active/i.test(textOf(label,100))){ control=label.querySelector("input[type='checkbox'],button[role='switch']"); if(control)break; } }
        if(!control){ await closeModal(parts); if(i===0) return setManagerStatus("This SpicyChat entry editor does not expose an enable/disable control, so QoL cannot change it safely."); continue; }
        const current=control.matches("input")?control.checked:control.getAttribute("aria-checked")==="true";
        if(current!==mode) control.click();
        await submitModal(parts); changed+=1;
      }
      setManagerStatus(`${mode?'Enabled':'Disabled'} ${changed} entr${changed===1?'y':'ies'}.`);
    }catch(error){setManagerStatus(error?.message||String(error));}finally{bulkBusy=false;}
  }

  async function bulkDelete() {
    const rows=selectedRows(); if(!rows.length)return setManagerStatus("Select at least one entry first.");
    if(!confirm(`Delete ${rows.length} selected Lorebook entr${rows.length===1?'y':'ies'}? This uses SpicyChat's normal Delete action and cannot be undone by QoL.`))return;
    bulkBusy=true; let deleted=0;
    try{
      for(let i=0;i<rows.length;i+=1){
        setManagerStatus(`Deleting ${i+1}/${rows.length}…`);
        const parts=await openRow(rows[i]); const name=clean(parts.name.value,50);
        const del=parts.root.querySelector("button[aria-label='Delete']")||[...parts.root.querySelectorAll("button")].find(b=>/^delete$/i.test(textOf(b,30)));
        if(!del)throw new Error(`Could not find Delete for “${name}”.`);
        suppressDraftGuard=true; del.click(); suppressDraftGuard=false; await sleep(120);
        const visibleDeletes=[...document.querySelectorAll("button")].filter(b=>b.offsetParent!==null&&/^delete$/i.test(textOf(b,30)));
        const confirmDelete=visibleDeletes[visibleDeletes.length-1]; if(confirmDelete&&confirmDelete!==del){suppressDraftGuard=true;confirmDelete.click();suppressDraftGuard=false;}
        await sleep(180); analyzedEntries.delete(name); deleted+=1;
      }
      setManagerStatus(`Deleted ${deleted} entr${deleted===1?'y':'ies'}.`);
    }catch(error){setManagerStatus(error?.message||String(error));}finally{bulkBusy=false;}
  }

  function findKeyword() {
    const keyword=clean(prompt("Find Lorebook entries triggered by keyword", ""),80); if(!keyword)return;
    const input=document.querySelector("[data-testid='EntriesListServer-SearchInput']");
    if(input){nativeSetValue(input,keyword);input.focus();setManagerStatus(`Searching for “${keyword}”.`);} else setManagerStatus("Could not find SpicyChat's entry search box.");
  }

  async function localLorebookBackups() {
    const result=await DS.storageGet?.([DS.LOREBOOK_BACKUPS_KEY||"lorebookBackups"])||{};
    const store=result[DS.LOREBOOK_BACKUPS_KEY||"lorebookBackups"];
    return store?.meta && typeof store.meta==="object" ? store.meta : {};
  }

  async function resolveLorebookFromCard(card) {
    if(!card)return null;
    const direct=[...card.querySelectorAll("a[href*='/lorebook/']")][0];
    if(direct){const m=direct.href.match(/\/lorebook\/(?:edit\/)?([^/?#]+)/i);if(m)return{id:m[1],name:textOf(card.querySelector("p"),100)};}
    for(const node of [card,...card.querySelectorAll("*")]){
      for(const attr of [...(node.attributes||[])]){
        if(!/lorebook.*id|id.*lorebook/i.test(attr.name))continue;
        const m=String(attr.value).match(/[0-9a-f-]{20,}/i);if(m)return{id:m[0],name:textOf(card.querySelector("p"),100)};
      }
    }
    const ps=[...card.querySelectorAll("p")].map(p=>textOf(p,120)).filter(Boolean);
    const name=ps.find(v=>!/^(replace lorebook|\d+|@)/i.test(v))||"";
    const backups=await localLorebookBackups();
    const match=Object.values(backups).find(item=>clean(item?.name,120).toLowerCase()===name.toLowerCase());
    return match?{id:match.id,name:match.name}:{id:"",name};
  }

  async function rememberChatbotLorebookLink() {
    const chatbotId=chatbotEditId(); const card=document.querySelector("[data-testid='lorebook-card']");
    if(!chatbotId||!card)return;
    const lore=await resolveLorebookFromCard(card); if(!lore?.name&&!lore?.id)return;
    const result=await DS.storageGet?.([LINK_KEY])||{}; const store=result[LINK_KEY]&&typeof result[LINK_KEY]==="object"?result[LINK_KEY]:{};
    store[chatbotId]={chatbotId,lorebookId:lore.id||"",lorebookName:lore.name||"",updatedAt:Date.now()};
    await DS.storageSet?.({[LINK_KEY]:store});
  }

  async function ensureEditPageShortcut() {
    if(!settings().lorebookEditShortcuts)return document.querySelectorAll(".ds-lb-edit-page-shortcut").forEach(n=>n.remove());
    const card=document.querySelector("[data-testid='lorebook-card']"); if(!card)return;
    await rememberChatbotLorebookLink();
    if(card.parentElement?.querySelector(".ds-lb-edit-page-shortcut"))return;
    const lore=await resolveLorebookFromCard(card);
    const b=document.createElement("button");b.type="button";b.className="ds-lb-edit-page-shortcut ds-lb-shortcut";b.textContent="Edit Lorebook";
    b.addEventListener("click",()=>{if(lore?.id)location.href=`/lorebook/edit/${encodeURIComponent(lore.id)}/entries`;else location.href=`/my-creations/lorebooks${lore?.name?`?search=${encodeURIComponent(lore.name)}`:''}`;});
    const actions = [...(card.parentElement?.querySelectorAll("div") || [])].find(div => div !== card && /(?:^|\s)flex-row(?:\s|$)/.test(String(div.className || "")) && String(div.className || "").includes("gap-[7px]")) || card.nextElementSibling || card.parentElement;
    actions?.appendChild(b);  }

  function currentChatbotId() {
    const path=normalizedPath(); const m=path.match(/^\/chat\/([^/]+)/i); return m?clean(m[1],200):"";
  }

  async function openLorebookForChat(chatbotId) {
    const id=chatbotId||currentChatbotId();
    const result=await DS.storageGet?.([LINK_KEY])||{}; const row=result[LINK_KEY]?.[id];
    if(row?.lorebookId) return window.open(`/lorebook/edit/${encodeURIComponent(row.lorebookId)}/entries`,"_blank","noopener");
    if(row?.lorebookName) return window.open(`/my-creations/lorebooks?search=${encodeURIComponent(row.lorebookName)}`,"_blank","noopener");
    DS.setQuickStatus?.("Open this bot's Edit Chatbot page once so QoL can learn which Lorebook is attached.");
  }

  async function ensureChatMenuShortcut() {
    if(!settings().lorebookEditShortcuts)return document.querySelectorAll("[data-ds-edit-lorebook-menu]").forEach(n=>n.remove());
    const chatbotId=currentChatbotId(); if(!chatbotId)return;
    const menus=[...document.querySelectorAll("[role='menu'],[data-radix-menu-content],div")].filter(node=>node.offsetParent!==null&&[...node.querySelectorAll("button,a")].some(b=>/edit chatbot/i.test(textOf(b,80))));
    for(const menu of menus){
      if(menu.querySelector("[data-ds-edit-lorebook-menu]"))continue;
      const edit=[...menu.querySelectorAll("button,a")].find(b=>/edit chatbot/i.test(textOf(b,80))); if(!edit)continue;
      const clone=document.createElement(edit.tagName.toLowerCase()==="a"?"button":"button"); clone.type="button"; clone.className=edit.className; clone.textContent="Edit Lorebook"; clone.dataset.dsEditLorebookMenu="1"; clone.dataset.dsChatbotId=chatbotId;
      edit.insertAdjacentElement("afterend",clone);
    }
  }

  DS.handleLorebookWorkflowRouteChange = function handleLorebookWorkflowRouteChange(){
    const route = lorebookRoute();
    if (!route) {
      resetAutoEntriesVisit();
      return;
    }
    if (autoEntriesVisitId && autoEntriesVisitId !== route.id) resetAutoEntriesVisit();
  };

  DS.removeLorebookWorkflowTools = function removeLorebookWorkflowTools(){
    document.getElementById(TOOLBAR_ID)?.remove();
    document.querySelectorAll(".ds-lb-row-tools,.ds-lb-edit-page-shortcut,[data-ds-edit-lorebook-menu],.ds-lb-draft-banner").forEach(n=>n.remove());
  };

  DS.applyLorebookWorkflowTools = async function applyLorebookWorkflowTools(){
    ensureStyle(); installTabIntentListener(); installHistoryGuard(); maybeDefaultToEntries();
    await applyPreferredSort().catch(()=>{});
    ensureManagerToolbar();
    await ensureDraftProtection().catch(()=>{});
    await ensureEditPageShortcut().catch(()=>{});
    await ensureChatMenuShortcut().catch(()=>{});
  };
})();
