(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const KEY = DS.LOREBOOK_BACKUPS_KEY || "lorebookBackups";
  const PANEL_ID = "ds-lorebook-backup-tools";
  const STYLE_ID = "ds-lorebook-backup-style";
  let activeId = "";
  let saveTimer = null;
  let initialTimer = null;
  let lastSignature = "";
  let listenersInstalled = false;
  let lastPanelAutoState = null;

  function clean(value, max = 24000) {
    return String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, max);
  }

  function unique(values, max = 50) {
    return [...new Set((values || []).map(value => clean(value, 300)).filter(Boolean))].slice(0, max);
  }

  function normalizedPath() {
    return String(location.pathname || "").replace(/^\/[a-z]{2}(?=\/)/i, "").replace(/\/+$/, "") || "/";
  }

  function routeInfo() {
    const path = normalizedPath();
    const isEditPage = path === "/lorebook/edit" ||
      path.startsWith("/lorebook/edit/") ||
      /^\/lorebook\/[^/]+\/edit(?:\/|$)/i.test(path);
    if (!isEditPage) return null;

    let match = path.match(/^\/lorebook\/edit\/([^/]+)/i) || path.match(/^\/lorebook\/([^/]+)\/edit(?:\/|$)/i);
    let id = match ? clean(decodeURIComponent(match[1]), 200) : "";

    if (!id) {
      const params = new URLSearchParams(location.search || "");
      id = clean(params.get("id") || params.get("lorebookId"), 200);
    }

    if (!id) {
      const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
      try {
        const canonicalPath = new URL(canonical, location.href).pathname.replace(/^\/[a-z]{2}(?=\/)/i, "");
        match = canonicalPath.match(/^\/lorebook\/edit\/([^/]+)/i) || canonicalPath.match(/^\/lorebook\/([^/]+)\/edit(?:\/|$)/i);
        if (match) id = clean(decodeURIComponent(match[1]), 200);
      } catch {}
    }

    const page = /(?:^|\/)entries(?:\/|$)/i.test(path) ? "entries" : "details";
    return { id, page };
  }

  function settings() {
    return DS.state?.settings || {};
  }

  function normalizeStore(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const meta = {};
    for (const [idValue, itemValue] of Object.entries(source.meta || source.lorebooks || {})) {
      const id = clean(itemValue?.id || idValue, 200);
      if (!id || !itemValue || typeof itemValue !== "object") continue;
      const entries = {};
      for (const [keyValue, entryValue] of Object.entries(itemValue.entries || {})) {
        if (!entryValue || typeof entryValue !== "object") continue;
        const name = clean(entryValue.name || keyValue, 500);
        if (!name) continue;
        const key = clean(entryValue.key || keyValue || name.toLowerCase(), 600).toLowerCase();
        entries[key] = {
          key,
          name,
          keywords: unique(Array.isArray(entryValue.keywords) ? entryValue.keywords : String(entryValue.keywords || "").split(/\s*,\s*/g), 12),
          keywordsComplete: !!entryValue.keywordsComplete,
          hiddenKeywordCount: Math.max(0, Number(entryValue.hiddenKeywordCount) || 0),
          content: clean(entryValue.content, 24000),
          capturedAt: Number(entryValue.capturedAt) || 0
        };
      }
      meta[id] = {
        id,
        name: clean(itemValue.name || id, 500),
        description: clean(itemValue.description, 4000),
        tags: unique(Array.isArray(itemValue.tags) ? itemValue.tags : String(itemValue.tags || "").split(/\s*,\s*/g), 12),
        visibility: clean(itemValue.visibility, 40),
        image: clean(itemValue.image, 3000),
        firstSavedAt: Number(itemValue.firstSavedAt) || 0,
        lastSavedAt: Number(itemValue.lastSavedAt) || 0,
        source: clean(itemValue.source, 120),
        entries
      };
    }
    return { version: 1, meta };
  }

  function selectedChipTexts(root, max = 12) {
    if (!root) return [];
    return unique([...root.querySelectorAll("button")].filter(button => {
      if (button.closest(`#${PANEL_ID},#ds-qol-panel`)) return false;
      return !!button.querySelector("svg.lucide-x,svg[class*='lucide-x']");
    }).map(button => clean(button.textContent, 300)).filter(Boolean), max);
  }

  function fieldContainerByLabel(labelText) {
    const wanted = String(labelText || "").toLowerCase();
    const label = [...document.querySelectorAll("label,p,span,strong")].find(node => clean(node.textContent, 100).toLowerCase() === wanted);
    if (!label) return null;
    let root = label.parentElement;
    for (let i = 0; root && i < 5; i += 1, root = root.parentElement) {
      if (root.querySelector("input,textarea,button")) return root;
    }
    return label.parentElement;
  }

  function selectedVisibility() {
    for (const button of document.querySelectorAll("button")) {
      if (button.closest(`#${PANEL_ID},#ds-qol-panel`)) continue;
      const label = clean(button.textContent, 60).toLowerCase();
      if (!["public", "private", "unlisted"].includes(label)) continue;
      const cls = String(button.className || "");
      const selected = button.getAttribute("aria-pressed") === "true" || button.dataset.selected === "true" || button.dataset.state === "active" || /(?:^|\s)(?:bg-black|dark:bg-white|bg-blue-10)(?:\s|$)/.test(cls);
      if (selected) return label[0].toUpperCase() + label.slice(1);
    }
    return "";
  }

  function currentImage() {
    const upload = document.querySelector("input[type='file'][accept*='image'],input[data-testid*='UploadInput']");
    let root = upload?.parentElement;
    for (let depth = 0; root && depth < 5; depth += 1, root = root.parentElement) {
      const image = [...root.querySelectorAll("img")].find(img => clean(img.getAttribute("src"), 3000));
      if (image) return clean(image.getAttribute("src"), 3000);
    }
    return "";
  }

  function currentLorebookDisplayName() {
    const inputName = clean(document.querySelector("input[name='name']")?.value, 500);
    if (inputName) return inputName;
    const pageName = [...document.querySelectorAll("p.text-label-lg.font-medium.text-gray-11")]
      .map(node => clean(node.textContent, 500))
      .find(value => value && !/^(?:details|entries)$/i.test(value));
    return pageName || "";
  }

  function captureDetails() {
    const name = clean(document.querySelector("input[name='name']")?.value, 500);
    const description = clean(document.querySelector("textarea[name='description']")?.value, 4000);
    const tagInput = [...document.querySelectorAll("input")].find(input => /add tags/i.test(String(input.placeholder || "")));
    let tagRoot = tagInput?.parentElement;
    for (let i = 0; tagRoot && i < 4; i += 1, tagRoot = tagRoot.parentElement) {
      const tags = selectedChipTexts(tagRoot, 12);
      if (tags.length) return { name, description, tags, visibility: selectedVisibility(), image: currentImage() };
    }
    return { name, description, tags: selectedChipTexts(fieldContainerByLabel("Tags"), 12), visibility: selectedVisibility(), image: currentImage() };
  }

  function entryKey(name) {
    return clean(name, 500).toLowerCase();
  }

  function captureListEntries() {
    const out = [];
    for (const button of document.querySelectorAll("button.w-full.flex.items-start.justify-between")) {
      if (button.closest(`#${PANEL_ID},#ds-qol-panel`)) continue;
      const titleNode = button.querySelector("p.text-label-md.line-clamp-1, [data-tooltip-content] > p.text-label-md");
      const name = clean(titleNode?.textContent, 500);
      if (!name || !button.querySelector("[data-tooltip-content]")) continue;
      const tooltipValues = [...button.querySelectorAll("[data-tooltip-content]")].map(node => clean(node.getAttribute("data-tooltip-content"), 24000)).filter(Boolean);
      const content = tooltipValues.filter(value => value !== name).sort((a, b) => b.length - a.length)[0] || "";
      const keywordLine = [...button.querySelectorAll("p")].map(node => clean(node.textContent, 1000)).find(value => value && value !== name && value !== content && /,/.test(value) && !/^\+\d+$/.test(value)) || "";
      const hiddenText = [...button.querySelectorAll("p")].map(node => clean(node.textContent, 40)).find(value => /^\+\d+$/.test(value)) || "";
      const hiddenKeywordCount = Math.max(0, Number(hiddenText.replace("+", "")) || 0);
      out.push({
        key: entryKey(name),
        name,
        keywords: unique(keywordLine.split(/\s*,\s*/g), 12),
        keywordsComplete: hiddenKeywordCount === 0,
        hiddenKeywordCount,
        content,
        capturedAt: Date.now()
      });
    }
    return out;
  }

  function captureOpenEntry() {
    const update = document.querySelector("button[aria-label='Update']");
    const contentField = document.querySelector("textarea[name='content']");
    const nameField = contentField ? [...document.querySelectorAll("input[name='name']")].find(input => input.offsetParent !== null || input.value) : null;
    if (!update || !contentField || !nameField) return null;
    let modal = update.parentElement;
    for (let i = 0; modal && i < 8; i += 1, modal = modal.parentElement) {
      if (modal.contains(contentField) && modal.contains(nameField)) break;
    }
    const keywordInput = modal?.querySelector("input[placeholder*='tag' i],input[placeholder*='keyword' i],input[placeholder*='Maximum 12' i]")
      || [...(modal?.querySelectorAll("input") || [])].find(input => input !== nameField && input.type !== "hidden" && input.type !== "file");
    let keywordRoot = keywordInput?.parentElement;
    let keywords = [];
    for (let i = 0; keywordRoot && i < 4; i += 1, keywordRoot = keywordRoot.parentElement) {
      keywords = selectedChipTexts(keywordRoot, 12);
      if (keywords.length) break;
    }
    const name = clean(nameField.value, 500);
    if (!name) return null;
    return {
      key: entryKey(name),
      name,
      keywords,
      keywordsComplete: true,
      hiddenKeywordCount: 0,
      content: clean(contentField.value, 24000),
      capturedAt: Date.now()
    };
  }

  function mergeEntry(previous, incoming) {
    if (!previous) return incoming;
    const preferIncomingKeywords = incoming.keywordsComplete || !previous.keywordsComplete;
    return {
      ...previous,
      ...incoming,
      keywords: preferIncomingKeywords && incoming.keywords.length ? incoming.keywords : previous.keywords,
      keywordsComplete: !!(previous.keywordsComplete || incoming.keywordsComplete),
      hiddenKeywordCount: incoming.keywordsComplete ? 0 : Math.max(Number(previous.hiddenKeywordCount) || 0, Number(incoming.hiddenKeywordCount) || 0),
      content: incoming.content || previous.content
    };
  }

  function currentCapture() {
    const info = routeInfo();
    if (!info) return null;
    const entries = info.page === "entries" ? captureListEntries() : [];
    const open = info.page === "entries" ? captureOpenEntry() : null;
    if (open) {
      const index = entries.findIndex(entry => entry.key === open.key);
      if (index >= 0) entries[index] = mergeEntry(entries[index], open);
      else entries.push(open);
    }
    return {
      info,
      details: info.page === "details" ? captureDetails() : null,
      entries
    };
  }

  async function saveCapture(reason = "Lorebook editor") {
    const capture = currentCapture();
    if (!capture?.info?.id) return false;
    const signature = JSON.stringify({ details: capture.details, entries: capture.entries });
    if (signature && signature === lastSignature) return false;

    const result = await DS.storageGet?.([KEY]) || {};
    const store = normalizeStore(result[KEY]);
    const previous = store.meta[capture.info.id] || { id: capture.info.id, entries: {} };
    const next = {
      ...previous,
      id: capture.info.id,
      firstSavedAt: Number(previous.firstSavedAt) || Date.now(),
      lastSavedAt: Date.now(),
      source: reason,
      entries: { ...(previous.entries || {}) }
    };

    if (capture.details) {
      if (capture.details.name) next.name = capture.details.name;
      next.description = capture.details.description;
      next.tags = capture.details.tags;
      if (capture.details.visibility) next.visibility = capture.details.visibility;
      if (capture.details.image) next.image = capture.details.image;
    }
    for (const entry of capture.entries) next.entries[entry.key] = mergeEntry(next.entries[entry.key], entry);
    const currentName = currentLorebookDisplayName();
    if (currentName && (!next.name || next.name === capture.info.id)) next.name = currentName;
    if (!next.name) next.name = clean(document.querySelector("h1")?.textContent || capture.info.id, 500) || capture.info.id;

    const ok = !!(await DS.storageSet?.({ [KEY]: normalizeStore({ version: 1, meta: { ...store.meta, [capture.info.id]: next } }) }));
    if (ok) {
      lastSignature = signature;
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.lorebookBackupSaves = Number(counters.lorebookBackupSaves || 0) + 1;
    }
    return ok;
  }

  function safeFilename(value) {
    return (clean(value, 100) || "spicychat-lorebook").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90) || "spicychat-lorebook";
  }

  function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function exportCurrent() {
    await saveCapture("Manual Lorebook backup");
    const info = routeInfo();
    if (!info?.id) return false;
    const result = await DS.storageGet?.([KEY]) || {};
    const item = normalizeStore(result[KEY]).meta[info.id];
    if (!item) return false;
    downloadJson({
      format: "spicychat-qol-lorebook-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      lorebook: item
    }, `${safeFilename(item.name)}-lorebook-backup.json`);
    return true;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:6px 0;padding:5px 7px;border:1px solid rgba(148,163,184,.24);border-radius:8px;background:rgba(31,41,55,.09);font:12px/1.25 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #${PANEL_ID} .ds-lorebook-backup-copy{display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 280px}
      #${PANEL_ID} .ds-lorebook-backup-copy strong{display:inline;white-space:nowrap;font-size:12px}
      #${PANEL_ID} .ds-lorebook-backup-copy small{opacity:.72;min-width:0}
      #${PANEL_ID} .ds-lorebook-backup-actions{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}
      #${PANEL_ID} button{appearance:none;border:1px solid rgba(148,163,184,.32);border-radius:6px;background:rgba(55,65,81,.58);color:inherit;padding:4px 7px;cursor:pointer;font:600 11px/1.15 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #${PANEL_ID} button:hover{background:rgba(75,85,99,.82)}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setStatus(value) {
    const node = document.querySelector(`#${PANEL_ID} [data-role='status']`);
    if (node) node.textContent = value;
  }

  function relativeAge(timestamp) {
    const time = Number(timestamp) || 0;
    if (!time) return "not saved yet";
    const delta = Math.max(0, Date.now() - time);
    if (delta < 60_000) return "just now";
    const minutes = Math.floor(delta / 60_000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  async function refreshPanelStatus(message = "") {
    const info = routeInfo();
    if (!info) return;
    const automatic = !!settings().lorebookBackupsEnabled;
    lastPanelAutoState = automatic;
    if (message) {
      setStatus(message);
      return;
    }
    const result = await DS.storageGet?.([KEY]) || {};
    const item = normalizeStore(result[KEY]).meta[info.id] || null;
    const entryCount = Object.keys(item?.entries || {}).length;
    setStatus([
      `Automatic backup: ${automatic ? "On" : "Off"}`,
      `Last backup: ${relativeAge(item?.lastSavedAt)}`,
      `${entryCount} entr${entryCount === 1 ? "y" : "ies"}`
    ].join(" · "));
  }

  function openBackupHistory(info) {
    if (!info?.id) return;
    DS.openOptionsTarget?.("bot-tools", { lorebookBackup: info.id });
  }

  function buildPanel() {
    ensureStyle();
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.dataset.dsLorebookBackup = "1";
    const copy = document.createElement("div");
    copy.className = "ds-lorebook-backup-copy";
    const title = document.createElement("strong");
    title.textContent = "QoL Lorebook Backup";
    const status = document.createElement("small");
    status.dataset.role = "status";
    status.textContent = "Checking local backup…";
    copy.append(title, status);
    const actions = document.createElement("div");
    actions.className = "ds-lorebook-backup-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save backup now";
    save.addEventListener("click", async () => {
      save.disabled = true;
      setStatus("Saving Lorebook backup…");
      const ok = await saveCapture("Manual Lorebook backup");
      if (ok) await refreshPanelStatus();
      else setStatus("Nothing changed; the latest local copy is already current.");
      save.disabled = false;
    });
    const exp = document.createElement("button");
    exp.type = "button";
    exp.textContent = "Export Lorebook JSON";
    exp.addEventListener("click", async () => {
      exp.disabled = true;
      const ok = await exportCurrent();
      setStatus(ok ? "Lorebook backup JSON downloaded." : "No Lorebook backup was available yet.");
      exp.disabled = false;
    });
    const info = routeInfo();
    const history = document.createElement("button");
    history.type = "button";
    history.textContent = "History";
    history.addEventListener("click", () => openBackupHistory(info));
    actions.append(save, exp, history);
    panel.append(copy, actions);

    const route = routeInfo();
    const entriesHeader = document.querySelector("[data-testid='EntriesListServer-Header']");
    const detailsForm = document.querySelector("form");
    const anchor = route?.page === "entries" ? entriesHeader : detailsForm;
    // Wait for SpicyChat's actual editor UI instead of inserting before #root.
    // The old body fallback could make this helper span the whole page while
    // React was still rendering, which is why the backup bar looked enormous.
    if (!anchor?.parentElement) return null;
    if (route?.page === "entries") anchor.insertAdjacentElement("afterend", panel);
    else anchor.parentElement.insertBefore(panel, anchor);
    refreshPanelStatus().catch(() => {});
    return panel;
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveCapture("Lorebook editor idle backup").catch(() => {});
    }, 1800);
  }

  function onInput(event) {
    if (!document.getElementById(PANEL_ID)) return;
    if (event.target?.closest?.(`#${PANEL_ID},#ds-qol-panel`)) return;
    scheduleSave();
  }

  function onClick(event) {
    if (event.target?.closest?.(`#${PANEL_ID},#ds-qol-panel`)) return;
    const button = event.target?.closest?.("button");
    if (!button) return;

    // The entry modal disappears immediately after Update. Capture it during
    // the click's capture phase so complete keyword data is not lost before
    // SpicyChat rerenders the list back to its collapsed 3 +N view.
    if (/^(update|create|save|add)$/i.test(clean(button.getAttribute("aria-label") || button.textContent, 40))) {
      saveCapture("Lorebook entry saved").catch(() => {});
    }
    scheduleSave();
  }

  function installListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("click", onClick, true);
  }

  function removeListeners() {
    if (!listenersInstalled) return;
    listenersInstalled = false;
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("change", onInput, true);
    document.removeEventListener("click", onClick, true);
  }

  function cleanup() {
    if (saveTimer) clearTimeout(saveTimer);
    if (initialTimer) clearTimeout(initialTimer);
    saveTimer = null;
    initialTimer = null;
    removeListeners();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    activeId = "";
    lastSignature = "";
    lastPanelAutoState = null;
    DS.state.lorebookBackupWasActive = false;
  }

  DS.applyLorebookBackup = function applyLorebookBackup() {
    const info = routeInfo();
    const cfg = settings();
    const shouldShow = !!(cfg.enabled && cfg.lorebookBackupToolsEnabled && info);
    if (!shouldShow) {
      if (DS.state.lorebookBackupWasActive || document.getElementById(PANEL_ID)) cleanup();
      return;
    }
    DS.state.lorebookBackupWasActive = true;

    if (cfg.lorebookBackupsEnabled) installListeners();
    else {
      if (saveTimer) clearTimeout(saveTimer);
      if (initialTimer) clearTimeout(initialTimer);
      saveTimer = null;
      initialTimer = null;
      removeListeners();
    }

    const activeRoute = `${info.id}:${info.page}`;
    if (activeId !== activeRoute) {
      activeId = activeRoute;
      lastSignature = "";
      if (initialTimer) clearTimeout(initialTimer);
      if (cfg.lorebookBackupsEnabled) {
        initialTimer = setTimeout(async () => {
          initialTimer = null;
          const saved = await saveCapture("Lorebook editor opened").catch(() => false);
          if (saved) refreshPanelStatus().catch(() => {});
        }, 700);
      }
    }
    if (!document.getElementById(PANEL_ID)) buildPanel();
    if (lastPanelAutoState !== !!cfg.lorebookBackupsEnabled) refreshPanelStatus().catch(() => {});
  };

  DS.saveLorebookBackupNow = (reason = "Manual Lorebook backup") => saveCapture(reason);
  DS.removeLorebookBackup = cleanup;
})();
