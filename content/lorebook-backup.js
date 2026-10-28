// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
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
  let lorebookWriteQueue = Promise.resolve();
  let listenersInstalled = false;
  let lastPanelAutoState = null;
  let helperRunning = false;
  let currentEditorFallbackQueue = Promise.resolve();
  const EXPORT_HELPER_PARAM = "dsQolLorebookExport";
  const EXPORT_TARGET_PARAM = "dsQolLorebookTarget";
  const EXPORT_JOB_PREFIX = "dsLorebookExportJob:";
  const IMPORT_SESSION_KEY = "dsQolPendingLorebookImportV1";
  let importRunning = false;
  const CLONE_KEY = "dsQolPendingPrivateLorebookCloneV1";
  const CLONE_PANEL_ID = "ds-qol-lorebook-json-clone";
  const CLONE_WRITE_KEY = "dsQolPrivateJsonCloneWriteV1";
  let cloneApiRun = false;
  let cloneEntriesAutoRunning = false;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let cloneInitializedFor = "";
  let cloneCoverBusy = false;
  let cloneTagBusy = false;
  const MERGE_KEY = "dsQolPendingLorebookJsonMergeV1";
  const MERGE_PANEL_ID = "ds-qol-lorebook-json-merge";

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
        lastFullBackupAt: Number(itemValue.lastFullBackupAt) || 0,
        lastFullBackupCount: Math.max(0, Number(itemValue.lastFullBackupCount) || 0),
        lastFullBackupValid: itemValue.lastFullBackupValid === true,
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

  function nativeLorebookEntryCount() {
    const header = document.querySelector("[data-testid='EntriesListServer-Header']");
    if (!header) return null;
    // The editor has two different numbers: its helper text says "up to
    // 5,000 entries", while the actual count says "250/5,000 entries".
    // Only read the real count element. The latter can mount *after* the
    // header, so treating the capacity as the count races React startup.
    const counter = header.querySelector('[data-translate-key="lorebook:entries.count"]') ||
      header.querySelector("[data-testid='EntriesList-SortDropdown']")?.parentElement?.querySelector("p");
    const text = String(counter?.textContent || "").replace(/\u00a0/g, " ").trim();
    const fraction = /^([\d,]+)\s*\/\s*([\d,]+)\s+entries\s*$/i.exec(text);
    const simple = !fraction && /^(?:([\d,]+)\s+entries|entries\s*\(\s*([\d,]+)\s*\))$/i.exec(text);
    const raw = fraction?.[1] || simple?.[1] || simple?.[2] || "";
    const count = raw ? Number(raw.replace(/,/g, "")) : null;
    return Number.isSafeInteger(count) && count >= 0 && count <= 5000 ? count : null;
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

  function entryData(entry) {
    return {
      key: String(entry?.key || ""),
      name: String(entry?.name || ""),
      keywords: Array.isArray(entry?.keywords) ? entry.keywords : [],
      keywordsComplete: !!entry?.keywordsComplete,
      hiddenKeywordCount: Number(entry?.hiddenKeywordCount) || 0,
      content: String(entry?.content || "")
    };
  }

  function entrySignature(entry) {
    return JSON.stringify(entryData(entry));
  }

  function mergeEntry(previous, incoming) {
    if (!previous) return incoming;
    const preferIncomingKeywords = incoming.keywordsComplete || !previous.keywordsComplete;
    const merged = {
      ...previous,
      ...incoming,
      keywords: preferIncomingKeywords && incoming.keywords.length ? incoming.keywords : previous.keywords,
      keywordsComplete: !!(previous.keywordsComplete || incoming.keywordsComplete),
      hiddenKeywordCount: incoming.keywordsComplete ? 0 : Math.max(Number(previous.hiddenKeywordCount) || 0, Number(incoming.hiddenKeywordCount) || 0),
      content: incoming.content || previous.content
    };
    // A fresh DOM capture is not a new edit. Preserve the meaningful timestamp.
    if (entrySignature(previous) === entrySignature(merged)) {
      merged.capturedAt = Number(previous.capturedAt) || Number(incoming.capturedAt) || Date.now();
    }
    return merged;
  }

  function meaningfulLorebook(item) {
    return JSON.stringify({
      name: item?.name || "",
      description: item?.description || "",
      tags: item?.tags || [],
      visibility: item?.visibility || "",
      image: item?.image || "",
      entries: Object.entries(item?.entries || {}).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, entryData(entry)])
    });
  }

  function queueLorebookWrite(work) {
    const next = lorebookWriteQueue.catch(() => {}).then(work);
    lorebookWriteQueue = next.catch(() => {});
    return next;
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

  function saveCapture(reason = "Lorebook editor") {
    // The full-export helper must be read-only. Its first React batch may
    // contain just 100 entries; never let an automatic snapshot commit that
    // partial state while a user-requested full save is running.
    if (manualFullSaveRunning || new URLSearchParams(location.search || "").get("dsQolLorebookBackupWorker") === "1") {
      return Promise.resolve(false);
    }
    // Capture synchronously: the editor/modal can disappear before storage is ready.
    const capture = currentCapture();
    if (!capture?.info?.id) return Promise.resolve(false);
    const signature = JSON.stringify({
      id: capture.info.id, page: capture.info.page, details: capture.details,
      entries: capture.entries.map(entryData) // never include capture timestamps
    });
    if (signature === lastSignature) return Promise.resolve(false);
    return queueLorebookWrite(async () => {
      if (signature === lastSignature) return false;
      const op = DS.diagOperationStart?.("lorebook-backup", "save", {
        reason, page: capture.info.page, entryCount: capture.entries.length,
        hasDetails: !!capture.details
      });
      const startedAt = performance.now();
      let readMs = 0;
      let writeMs = 0;
      let outcome = "failed";
      try {
        const result = await DS.storageGet?.([KEY]) || {};
        readMs = performance.now() - startedAt;
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
        // Only read the active editor name if this queued capture is still on its page.
        const stillHere = routeInfo()?.id === capture.info.id;
        const currentName = stillHere ? currentLorebookDisplayName() : "";
        if (currentName && (!next.name || next.name === capture.info.id)) next.name = currentName;
        if (!next.name) next.name = capture.info.id;

        if (store.meta[capture.info.id] && meaningfulLorebook(previous) === meaningfulLorebook(next)) {
          lastSignature = signature;
          outcome = "unchanged";
          return false;
        }
        // Changes captured by automatic/visible-only snapshots invalidate the
        // complete-copy label without throwing away the previous entries.
        next.lastFullBackupValid = false;
        const writeStartedAt = performance.now();
        const ok = !!(await DS.storageSet?.({ [KEY]: normalizeStore({ version: 1, meta: { ...store.meta, [capture.info.id]: next } }) }));
        writeMs = performance.now() - writeStartedAt;
        outcome = ok ? "ok" : "failed";
        if (ok) {
          lastSignature = signature;
          const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
          counters.lorebookBackupSaves = Number(counters.lorebookBackupSaves || 0) + 1;
        }
        return ok;
      } catch (error) {
        outcome = "error";
        throw error;
      } finally {
        DS.diagOperationEnd?.(op, {
          outcome, entryCount: capture.entries.length,
          meta: { readMs: Math.round(readMs), writeMs: Math.round(writeMs), totalMs: Math.round(performance.now() - startedAt) }
        });
      }
    });
  }

  function updateStoredEntries(id, entries, reason = "Full Lorebook export", options = {}) {
    if (!id || !Array.isArray(entries)) return Promise.resolve(false);
    return queueLorebookWrite(async () => {
      const op = DS.diagOperationStart?.("lorebook-backup", "update-entries", { entryCount: entries.length, reason });
      const startedAt = performance.now();
      let writeMs = 0;
      let outcome = "failed";
      try {
        const result = await DS.storageGet?.([KEY]) || {};
        const store = normalizeStore(result[KEY]);
        const previous = store.meta[id] || { id, name: currentLorebookDisplayName() || id, entries: {} };
        const next = {
          ...previous, id,
          firstSavedAt: Number(previous.firstSavedAt) || Date.now(),
          lastSavedAt: Date.now(), source: reason,
          entries: options.replace === true ? {} : { ...(previous.entries || {}) }
        };
        for (const entry of entries) {
          if (!entry?.name) continue;
          const incoming = {
            key: clean(entry.key || entry.name, 600).toLowerCase(),
            name: clean(entry.name, 500),
            keywords: unique(entry.keywords || [], 12),
            keywordsComplete: entry.keywordsComplete !== false,
            hiddenKeywordCount: entry.keywordsComplete === false ? Math.max(0, Number(entry.hiddenKeywordCount) || 0) : 0,
            content: clean(entry.content, 24000),
            capturedAt: Number(entry.capturedAt) || Date.now()
          };
          next.entries[incoming.key] = mergeEntry(next.entries[incoming.key], incoming);
        }
        if (!next.name) next.name = id;
        if (options.replace === true) {
          next.lastFullBackupAt = Date.now();
          next.lastFullBackupCount = entries.length;
          next.lastFullBackupValid = true;
        }
        if (store.meta[id] && meaningfulLorebook(previous) === meaningfulLorebook(next) &&
            previous.lastFullBackupValid === next.lastFullBackupValid) {
          outcome = "unchanged";
          return true;
        }
        const writeStartedAt = performance.now();
        const ok = !!(await DS.storageSet?.({ [KEY]: normalizeStore({ version: 1, meta: { ...store.meta, [id]: next } }) }));
        writeMs = performance.now() - writeStartedAt;
        outcome = ok ? "ok" : "failed";
        return ok;
      } catch (error) {
        outcome = "error";
        throw error;
      } finally {
        DS.diagOperationEnd?.(op, { outcome, entryCount: entries.length,
          meta: { writeMs: Math.round(writeMs), totalMs: Math.round(performance.now() - startedAt) } });
      }
    });
  }

  async function captureFullEntriesHere(exportToken = "", { persist = true } = {}) {
    const info = routeInfo();
    if (!info?.id || info.page !== "entries") return false;
    const op = DS.diagOperationStart?.("lorebook-backup", "capture-full-entries", { lorebookId: info.id, exportJob: !!exportToken });
    const capture = DS.captureLorebookEntriesFully;
    if (typeof capture !== "function") throw new Error("Lorebook entry crawler is not ready yet.");
    let result = null;
    let progressWrite = Promise.resolve();
    let lastProgressAt = 0;
    const onProgress = state => {
      const message = state?.message || "Reading Lorebook entries…";
      setStatus(message);
      if (exportToken && (Date.now() - lastProgressAt >= 900 || Number(state?.current || 0) === Number(state?.total || -1))) {
        lastProgressAt = Date.now();
        const progress = {
          status: "working", id: info.id, target: "entries",
          current: Number(state?.current) || 0,
          total: Number(state?.total) || 0,
          message, updatedAt: Date.now()
        };
        // Serialize progress writes: the final done+capture record must never
        // get overwritten by an earlier asynchronous progress update.
        progressWrite = progressWrite.catch(() => {}).then(() => setExportJob(exportToken, progress));
      }
    };
    try {
      result = await capture({ progress: onProgress });
    } catch (error) {
      // An owned Lorebook with zero entries is still a valid, complete backup.
      // Give the editor a short chance to finish mounting rows before treating
      // the explicit empty-list state as current truth.
      if (!/No Lorebook entries are loaded yet\./i.test(String(error?.message || error))) throw error;
      for (let attempt = 0; attempt < 5 && !captureListEntries().length; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (captureListEntries().length) {
        result = await capture({ progress: onProgress });
      } else {
        const header = document.querySelector("[data-testid='EntriesListServer-Header']");
        const root = header?.parentElement;
        const body = clean(root?.textContent, 1800);
        const headerText = clean(header?.textContent, 150);
        const explicitlyEmpty = /\b(?:no entries|no lorebook entries|nothing here|0 entries|entries\s*\(0\))\b/i.test(body) ||
          /^(?:entries\s*\(?0\)?|0\s*entries)$/i.test(headerText);
        if (!explicitlyEmpty) {
          throw new Error("No entries could be read, but the editor did not confirm that the Lorebook is empty. No backup was replaced.");
        }
        result = { id: info.id, entries: [], complete: true };
      }
    }
    await progressWrite;
    // A reused helper can navigate while the async crawler is running.
    // Never write rows collected for a route that has since changed.
    const liveInfo = routeInfo();
    if (!liveInfo || liveInfo.id.toLowerCase() !== info.id.toLowerCase() || liveInfo.page !== "entries") {
      throw new Error("Lorebook page changed during entry collection. No entries were replaced.");
    }
    if (result?.complete !== true || !Array.isArray(result.entries)) {
      throw new Error("Lorebook editor did not confirm a complete current entry list.");
    }
    // Independent guard before the destructive replace:true write. An editor
    // crawler bug must never turn a 100/109 page snapshot into a full backup.
    const displayedTotal = nativeLorebookEntryCount();
    if (displayedTotal !== null && displayedTotal !== result.entries.length) {
      throw new Error(`Only ${result.entries.length}/${displayedTotal} Lorebook entries were read. The last saved backup was kept unchanged.`);
    }
    if (displayedTotal === null && result.entries.length > 0) {
      throw new Error("Could not verify Lorebook entry count before replacing the local backup. Nothing was overwritten.");
    }
    // Helper tabs only collect data. The calling tab commits details + all
    // entries together after both editor captures have been verified.
    if (persist) {
      const ok = await updateStoredEntries(info.id, result.entries, "Full Lorebook export", { replace: true });
      DS.diagOperationEnd?.(op, { outcome: ok ? "ok" : "failed", entryCount: result.entries.length });
      if (!ok) throw new Error("Failed to save captured Lorebook entries.");
    } else {
      DS.diagOperationEnd?.(op, { outcome: "verified", entryCount: result.entries.length });
    }
    return exportToken || !persist ? result : true;
  }

  // Manual Save is a verified full backup on either editor tab. Unlike the
  // automatic snapshots, it must never silently stop at the first 100 rows.
  let manualFullSaveRunning = false;
  async function saveCompleteLorebookNow(reason = "Manual Lorebook backup") {
    const info = routeInfo();
    if (!info?.id) throw new Error("Open a Lorebook editor to save its backup.");
    if (manualFullSaveRunning) throw new Error("A full Lorebook backup is already running.");
    manualFullSaveRunning = true;
    const op = DS.diagOperationStart?.("lorebook-backup", "save-complete", { lorebookId: info.id, page: info.page });
    try {
      if (typeof DS.getCurrentOwnLorebookBackupData !== "function") {
        throw new Error("The full Lorebook reader is unavailable.");
      }
      setStatus("Collecting current Lorebook details and all entries…");
      // API-first; the existing editor fallback opens the two native tabs and
      // loads every additional 100-entry batch if the API is incomplete.
      const full = await DS.getCurrentOwnLorebookBackupData(info.id);
      if (!full?.lorebook || !Array.isArray(full.entries) ||
          full.completeness?.details !== true || full.completeness?.entries !== true ||
          full.completeness?.entryCountVerified !== true ||
          String(full.lorebook.id || "").toLowerCase() !== info.id.toLowerCase()) {
        throw new Error("SpicyChat did not verify complete details and entries. Your previous backup was kept.");
      }
      const expected = Number(full.lorebook.entryCount);
      if (!Number.isSafeInteger(expected) || expected < 0 || expected > 5000 || expected !== full.entries.length) {
        throw new Error(`SpicyChat returned ${full.entries.length} entries but reported ${full.lorebook.entryCount}. Previous backup kept.`);
      }
      const live = routeInfo();
      if (!live || live.id.toLowerCase() !== info.id.toLowerCase()) {
        throw new Error("Lorebook changed while saving. Previous backup kept.");
      }
      const nativeCount = live.page === "entries" ? nativeLorebookEntryCount() : null;
      if (nativeCount !== null && nativeCount !== expected) {
        throw new Error(`SpicyChat shows ${nativeCount} entries, but the full capture has ${expected}. Previous backup kept.`);
      }
      const entries = {};
      for (const row of full.entries) {
        const name = clean(row?.name, 500);
        if (!name) throw new Error("An entry had no name. Previous backup kept.");
        const key = entryKey(name);
        if (entries[key]) throw new Error(`Duplicate entry name: ${name}. Previous backup kept.`);
        entries[key] = {
          key, name, keywords: unique(row.keywords || [], 12),
          keywordsComplete: true, hiddenKeywordCount: 0,
          content: clean(row.content, 24000), capturedAt: Date.now()
        };
      }
      if (Object.keys(entries).length !== expected) throw new Error("Entry count changed while collecting. Previous backup kept.");
      setStatus(`Saving ${expected} verified Lorebook entries locally…`);
      const saved = await queueLorebookWrite(async () => {
        const raw = await DS.storageGet?.([KEY]) || {};
        const store = normalizeStore(raw[KEY]);
        const previous = store.meta[info.id] || {};
        const now = Date.now();
        const next = {
          ...previous, id: info.id, name: clean(full.lorebook.name, 500) || previous.name || info.id,
          description: clean(full.lorebook.description, 4000),
          tags: unique(full.lorebook.tags || [], 12),
          visibility: clean(full.lorebook.visibility, 40),
          image: clean(full.lorebook.image || full.lorebook.avatar_url || "", 3000),
          firstSavedAt: Number(previous.firstSavedAt) || now, lastSavedAt: now,
          source: reason, entries,
          lastFullBackupAt: now, lastFullBackupCount: expected, lastFullBackupValid: true
        };
        return !!(await DS.storageSet?.({ [KEY]: normalizeStore({ version: 1, meta: { ...store.meta, [info.id]: next } }) }));
      });
      if (!saved) throw new Error("Browser storage did not confirm the complete backup. Previous backup may still be available.");
      lastSignature = ""; // let the normal editor snapshot resume independently
      setStatus(`Saved full Lorebook backup: ${expected}/${expected} entries, including details and keywords.`);
      DS.diagOperationEnd?.(op, { outcome: "ok", entryCount: expected });
      return true;
    } catch (error) {
      DS.diagOperationEnd?.(op, { outcome: "failed" });
      setStatus(`Full backup failed: ${error?.message || String(error)}`);
      throw error;
    } finally {
      manualFullSaveRunning = false;
    }
  }

  function jobKey(token) { return `${EXPORT_JOB_PREFIX}${clean(token, 140)}`; }

  async function setExportJob(token, value) {
    if (!token) return false;
    return !!(await DS.storageSet?.({ [jobKey(token)]: value }));
  }

  async function getExportJob(token) {
    const result = await DS.storageGet?.([jobKey(token)]) || {};
    return result[jobKey(token)] || null;
  }

  async function removeExportJob(token) {
    if (!token) return;
    try { await chrome.storage.local.remove(jobKey(token)); } catch {}
  }

  async function requestEditorPageCapture(id, target, { statusPrefix = "" } = {}) {
    const safeId = clean(id, 200);
    if (!safeId || !["details", "entries"].includes(target)) return false;
    const token = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const path = target === "entries" ? `/lorebook/edit/${encodeURIComponent(safeId)}/entries` : `/lorebook/edit/${encodeURIComponent(safeId)}`;
    const url = new URL(path, location.origin);
    await setExportJob(token, { status: "pending", id: safeId, target, startedAt: Date.now() });
    const opened = await new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({
          type: "DS_LOREBOOK_EXPORT_HELPER",
          url: url.href,
          token,
          target,
          id: safeId
        }, response => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(response || { ok: false });
        });
      } catch (error) { resolve({ ok: false, error: error?.message || String(error) }); }
    });
    if (!opened?.ok) {
      await removeExportJob(token);
      throw new Error(opened?.error || "Could not open the Lorebook export helper tab.");
    }
    // Full editor exports must load all native pages, then open each entry to
    // collect complete keywords. A fixed 100-second timeout cut off even
    // healthy large Lorebooks. Keep a generous absolute ceiling but fail a
    // genuinely stalled helper after two minutes without fresh progress.
    const deadline = Date.now() + 30 * 60_000;
    let lastMessage = "";
    let lastUpdatedAt = 0;
    let lastActivityAt = Date.now();
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 600));
      const job = await getExportJob(token);
      const updatedAt = Number(job?.updatedAt || job?.startedAt || 0);
      if (updatedAt > lastUpdatedAt) { lastUpdatedAt = updatedAt; lastActivityAt = Date.now(); }
      if (job?.message && job.message !== lastMessage) {
        lastMessage = job.message;
        setStatus(`${statusPrefix}${job.message}`);
      }
      if (job?.status === "done") {
        await removeExportJob(token);
        if (!job.capture || job.id !== safeId || job.target !== target) {
          throw new Error(`Lorebook ${target} helper finished without a verified current capture.`);
        }
        return job.capture;
      }
      if (job?.status === "error") {
        await removeExportJob(token);
        throw new Error(job.error || "Lorebook export helper failed.");
      }
      if (Date.now() - lastActivityAt > 120_000) {
        await removeExportJob(token);
        throw new Error(`Lorebook ${target} helper stopped reporting progress; the last saved backup was kept.`);
      }
    }
    await removeExportJob(token);
    throw new Error(`Timed out while collecting Lorebook ${target}; the last saved backup was kept.`);
  }

  async function requestOppositePageCapture(info) {
    if (!info?.id) return false;
    const target = info.page === "entries" ? "details" : "entries";
    return requestEditorPageCapture(info.id, target);
  }

  // Release the dedicated helper once both editor captures have finished.
  // The background service serializes this with any pending helper requests,
  // and retains the existing idle timeout as a fallback if delivery fails.
  async function releaseEditorCaptureHelper(id) {
    try {
      return await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: "DS_LOREBOOK_EXPORT_HELPER_RELEASE", id }, response => {
          void chrome.runtime.lastError;
          resolve(response?.ok === true);
        });
      });
    } catch { return false; }
  }

  // Shared only while a verified live capture is in progress; never reuse a
  // historical backup or a previous complete result as if it were current.
  const liveLorebookCapturesInFlight = new Map();
  async function captureCurrentLorebookThroughEditors(lorebookId) {
    const id = clean(lorebookId, 200).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id)) throw new Error("Invalid Lorebook UUID.");
    if (liveLorebookCapturesInFlight.has(id)) return liveLorebookCapturesInFlight.get(id);
    const task = async () => {
      try {
      // This fallback used to read from the persistent Lorebook backup store,
      // accidentally merging an older entry into a supposedly fresh export.
      // Explicitly capture both pages now and assemble ONLY those results.
      const details = await requestEditorPageCapture(id, "details", { statusPrefix: "Bulk Lorebook backup: " });
      const entries = await requestEditorPageCapture(id, "entries", { statusPrefix: "Bulk Lorebook backup: " });
      if (!details || details.page !== "details" || details.id !== id || !details.data?.name) {
        throw new Error("Lorebook editor did not confirm fresh details; refusing historical data.");
      }
      if (!entries || entries.page !== "entries" || entries.id !== id || entries.complete !== true || !Array.isArray(entries.data)) {
        throw new Error("Lorebook editor did not confirm a complete fresh entry list.");
      }
      const payload = {
        ...details.data,
        id,
        entryCount: entries.data.length,
        entries: entries.data
      };
      return {
        schema: "spicychat-qol-lorebook-recovery-copy",
        version: 1,
        savedAt: Date.now(),
        fetchedAt: new Date().toISOString(),
        source: "current-live-editor",
        completeness: { details: true, entries: true, entryCountVerified: true },
        lorebook: {
          id, name: clean(payload.name, 500), description: clean(payload.description, 4000),
          creator: "", creatorId: "", image: clean(payload.image, 3000),
          tags: unique(payload.tags || [], 12), visibility: clean(payload.visibility, 40),
          status: "", version: 0, entryCount: payload.entryCount,
          numAttachedCharacters: 0, createdAt: "", updatedAt: "",
          isNsfw: false, avatarIsNsfw: false
        },
        entries: payload.entries.map((entry, index) => ({
          id: `editor:${index + 1}`, name: clean(entry?.name, 500),
          keywords: unique(entry?.keywords || [], 12), secondaryKeywords: [],
          content: clean(entry?.content, 24000), version: "", createdAt: "", updatedAt: "",
          priority: "", status: "", enabled: true, constant: false, selective: false,
          caseSensitive: false, probability: null, depth: null, role: "", isNsfw: false
        }))
      };
      } finally {
        // The background worker is no longer needed after the two verified
        // captures, including when a failed operation must be cleaned up.
        // Cleanup is best effort and never changes backup completeness.
        await releaseEditorCaptureHelper(id);
      }
    };
    const queued = currentEditorFallbackQueue.then(task, task);
    liveLorebookCapturesInFlight.set(id, queued);
    currentEditorFallbackQueue = queued.catch(() => {});
    try { return await queued; }
    finally { if (liveLorebookCapturesInFlight.get(id) === queued) liveLorebookCapturesInFlight.delete(id); }
  }

  DS.getCurrentOwnLorebookBackupDataFromEditor = captureCurrentLorebookThroughEditors;

  async function waitForExportHelperReady(target, expectedId = "", timeout = 30_000) {
    const startedAt = Date.now();
    const wantedId = clean(expectedId, 200).toLowerCase();
    while (Date.now() - startedAt < timeout) {
      const info = routeInfo();
      // During navigation, the old document may still receive a tab message.
      // Do not treat its already-mounted form or entry list as the new book.
      if (wantedId && info?.id && info.id.toLowerCase() !== wantedId) {
        return { retryable: true };
      }
      if (info?.id && info.page === target && (!wantedId || info.id.toLowerCase() === wantedId)) {
        if (target === "details" && document.querySelector("form")) return info;
        if (target === "entries" && document.querySelector("[data-testid='EntriesListServer-Header']")) return info;
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`The Lorebook ${target === "entries" ? "Entries" : "Details"} page did not become ready in time.`);
  }

  async function runExportHelperCommand(message) {
    const token = clean(message?.token, 140);
    const target = clean(message?.target, 20);
    const expectedId = clean(message?.id, 200);
    if (!token || !["details", "entries"].includes(target)) {
      return { ok: false, error: "Invalid Lorebook export helper request." };
    }
    helperRunning = true;
    document.documentElement.dataset.dsLorebookExportHelper = "1";
    try {
      const info = await waitForExportHelperReady(target, expectedId);
      if (info.retryable) {
        return { ok: false, retryable: true, error: "Lorebook helper is still navigating." };
      }
      await setExportJob(token, {
        status: "working",
        id: info.id,
        target,
        message: target === "entries" ? "Reading Lorebook entries…" : "Reading Lorebook details…",
        updatedAt: Date.now()
      });
      const detailsCapture = target === "details" ? currentCapture()?.details : null;
      if (target === "details" && !detailsCapture?.name) {
        throw new Error("The Lorebook Details editor has no current name; cannot verify the capture.");
      }
      const entriesCapture = target === "entries" ? await captureFullEntriesHere(token, { persist: false }) : null;
      const finalInfo = routeInfo();
      if (!finalInfo || finalInfo.page !== target || finalInfo.id.toLowerCase() !== info.id.toLowerCase()) {
        throw new Error("Lorebook page changed during export; the result was not marked complete.");
      }
      const capture = target === "entries"
        ? { id: info.id, page: "entries", complete: entriesCapture?.complete === true, data: entriesCapture?.entries || [] }
        : { id: info.id, page: "details", data: detailsCapture };
      if (!(await setExportJob(token, { status: "done", id: info.id, target, capture, finishedAt: Date.now() }))) {
        throw new Error("Current Lorebook capture could not be delivered to the exporter.");
      }
      return { ok: true };
    } catch (error) {
      const messageText = error?.message || String(error);
      await setExportJob(token, {
        status: "error",
        id: expectedId,
        target,
        error: messageText,
        finishedAt: Date.now()
      });
      return { ok: false, error: messageText };
    } finally {
      delete document.documentElement.dataset.dsLorebookExportHelper;
      helperRunning = false;
    }
  }

  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "DS_LOREBOOK_EXPORT_RUN") return false;
      runExportHelperCommand(message)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    });
  } catch {}

  async function maybeRunExportHelper(info) {
    if (helperRunning || !info?.id) return false;
    const params = new URLSearchParams(location.search || "");
    const token = clean(params.get(EXPORT_HELPER_PARAM), 140);
    const target = clean(params.get(EXPORT_TARGET_PARAM), 20);
    if (!token || !["details", "entries"].includes(target) || target !== info.page) return false;
    helperRunning = true;
    try {
      await new Promise(resolve => setTimeout(resolve, 900));
      const detailsCapture = target === "details" ? currentCapture()?.details : null;
      if (target === "details" && !detailsCapture?.name) {
        throw new Error("The Lorebook Details editor has no current name; cannot verify the capture.");
      }
      const entriesCapture = target === "entries" ? await captureFullEntriesHere(token, { persist: false }) : null;
      const capture = target === "entries"
        ? { id: info.id, page: "entries", complete: entriesCapture?.complete === true, data: entriesCapture?.entries || [] }
        : { id: info.id, page: "details", data: detailsCapture };
      if (!(await setExportJob(token, { status: "done", id: info.id, target, capture, finishedAt: Date.now() }))) {
        throw new Error("Current Lorebook capture could not be delivered to the exporter.");
      }
    } catch (error) {
      await setExportJob(token, { status: "error", id: info.id, target, error: error?.message || String(error), finishedAt: Date.now() });
    } finally {
      setTimeout(() => {
        try { chrome.runtime.sendMessage({ type: "DS_CLOSE_CURRENT_TAB" }, () => void chrome.runtime.lastError); } catch {}
      }, 250);
    }
    return true;
  }

  function safeFilename(value) {
    return (clean(value, 100) || "spicychat-lorebook").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90) || "spicychat-lorebook";
  }

  async function downloadJson(payload, filename) {
    const text = JSON.stringify(payload, null, 2);
    if (typeof DS.downloadTextFile === "function") {
      return DS.downloadTextFile(text, filename, "application/json;charset=utf-8", { requestPermission: false });
    }

    // Legacy fallback in case this module is loaded without the current Core.
    try {
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      (document.body || document.documentElement).appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { ok: true, method: "link" };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  function parseLorebookImportPayload(raw) {
    const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
    if (!payload) throw new Error("That file is not a JSON Lorebook backup.");
    const book = payload.lorebook && typeof payload.lorebook === "object" ? payload.lorebook : payload;
    const inputEntries = payload.entries ?? book.entries ?? [];
    if (!Array.isArray(inputEntries) && (!inputEntries || typeof inputEntries !== "object")) {
      throw new Error("The Lorebook entries have an unsupported format.");
    }
    const rawEntries = Array.isArray(inputEntries) ? inputEntries : Object.values(inputEntries);
    if (rawEntries.length > 5000) throw new Error("More than 5,000 entries; split this import into smaller files.");
    const entries = rawEntries.map((entry, index) => ({
      name: clean(entry?.name || `Imported entry ${index + 1}`, 500),
      content: clean(entry?.content, 24000),
      keywords: unique(Array.isArray(entry?.keywords) ? entry.keywords : String(entry?.keywords || "").split(/[,;\n]/g), 12)
    })).filter(entry => entry.name && entry.content);
    if (entries.length !== rawEntries.length) {
      throw new Error(`Only ${entries.length}/${rawEntries.length} entries had both name and content. Nothing imported.`);
    }
    const entryNames = entries.map(item => item.name.slice(0, 50).trim().toLocaleLowerCase());
    if (entryNames.length !== new Set(entryNames).size) {
      throw new Error("This backup has duplicate entry names (SpicyChat uses the first 50 characters). Rename those entries before importing.");
    }
    const image = clean(book.image || book.avatar_url || book.avatarUrl || "", 3000);
    const imageData = typeof payload.imageData === "string" ? payload.imageData :
      (typeof book.imageData === "string" ? book.imageData : "");
    if (imageData && (imageData.length > 3 * 1024 * 1024 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(imageData))) {
      throw new Error("The embedded Lorebook picture is not a supported PNG, JPEG or WebP under 2 MB.");
    }
    return {
      sourceId: clean(book.id, 200),
      name: clean(book.name || payload.name || "Imported Lorebook", 500),
      description: clean(book.description, 4000),
      visibility: clean(book.visibility, 40),
      tags: unique(Array.isArray(book.tags) ? book.tags : String(book.tags || "").split(/[,;\n]/g), 12),
      image, imageData, entries,
      completeness: payload.completeness && typeof payload.completeness === "object" ? {
        details: payload.completeness.details === true,
        entries: payload.completeness.entries === true,
        liveVerified: payload.completeness.liveVerified === true
      } : null
    };
  }

  function createCloneToken() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function cloneRecord() {
    try {
      const item = JSON.parse(sessionStorage.getItem(CLONE_KEY) || "null");
      if (!item || item.version !== 1 || !item.payload ||
          Date.now() - Number(item.startedAt || 0) > 7 * 24 * 60 * 60_000) return null;
      return item;
    } catch { return null; }
  }

  function clearClone() {
    try { sessionStorage.removeItem(CLONE_KEY); } catch {}
    document.getElementById(CLONE_PANEL_ID)?.remove();
    cloneInitializedFor = "";
  }

  function setNativeField(selector, value) {
    const input = document.querySelector(selector);
    if (!input || !value) return false;
    const prototype = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) return false;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function putCloneCoverInNativeUploader(file) {
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      throw new Error("Choose a PNG, JPEG or WebP picture smaller than 2 MB.");
    }
    const native = document.querySelector('input[type="file"][data-testid="AvatarCreate-UploadInput"]');
    if (!native) throw new Error("SpicyChat's picture uploader isn't mounted yet; try after the creation form loads.");
    const files = new DataTransfer();
    files.items.add(file);
    native.files = files.files;
    if (native.files?.[0]?.size !== file.size) throw new Error("SpicyChat did not accept the picture file.");
    native.dispatchEvent(new Event("input", { bubbles: true }));
    native.dispatchEvent(new Event("change", { bubbles: true }));
    // Only the real SpicyChat uploader can confirm the picture was uploaded;
    // never treat this file input event as a completed network upload.
    return true;
  }

  function fileFromEmbeddedCover(dataUrl) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl || "");
    if (!match) throw new Error("There is no embedded picture in this backup.");
    const bytes = atob(match[2]);
    if (bytes.length > 2 * 1024 * 1024) throw new Error("The embedded picture is larger than 2 MB.");
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
    return new File([out], "lorebook-cover." + (match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1]), { type: match[1] });
  }

  function nativeTagField() {
    const root = document.querySelector('[data-field-name="tags"]') || fieldContainerByLabel("Tags");
    const input = root && [...root.querySelectorAll("input")].find(node =>
      /add tags?/i.test(node.placeholder || "") || /tags?/i.test(node.getAttribute("aria-label") || ""));
    return root && input ? { root, input } : null;
  }

  function selectedNativeTags() {
    const field = nativeTagField();
    if (!field) return [];
    // Never read text from suggestion menus; selected pills have remove icons.
    return selectedChipTexts(field.root, 12);
  }

  // SpicyChat renders suggestions as either a listbox or labelled buttons.
  // The latter is used by QoL's existing bulk-tag helper. Never click a
  // non-unique match or any QoL-owned button.
  function nativeTagOption(name, input) {
    const desired = clean(name, 100).toLocaleLowerCase();
    if (!desired || /^(?:clear all tags|remove all|select all|add tags|none)$/i.test(desired)) return null;
    const field = nativeTagField();
    if (!field || input !== field.input || document.activeElement !== input) return null;
    const scopes = [
      ...document.querySelectorAll('[role="listbox"], [data-radix-popper-content-wrapper], [data-testid*="tag-options" i], [data-testid*="tag-dropdown" i]')
    ].filter(node => node.isConnected && node.getClientRects?.().length);
    // Without a named dropdown, native tag results can be portal-mounted as
    // buttons. Only use a unique exact value/aria-label match while the tags
    // input is focused. Text-only buttons outside a picker are never clicked.
    const nodes = scopes.length
      ? scopes.flatMap(scope => [...scope.querySelectorAll('button,[role="option"],[cmdk-item]')])
      : [...document.querySelectorAll('button[value],button[aria-label],[role="option"][data-value]')];
    const matches = [...new Set(nodes)].filter(node => {
      if (!node.isConnected || node.disabled || node.getAttribute('aria-disabled') === 'true' ||
          !node.getClientRects?.().length ||
          node.closest(`#${PANEL_ID},#${CLONE_PANEL_ID},#${MERGE_PANEL_ID},#ds-qol-panel`)) return false;
      if (node.closest('[data-field-name="tags"]') &&
          node.querySelector('svg.lucide-x,svg[class*="lucide-x"]')) return false;
      const raw = node.getAttribute('value') || node.getAttribute('data-value') ||
        node.getAttribute('aria-label') || (scopes.length ? node.textContent : '');
      return clean(raw, 100).toLocaleLowerCase() === desired;
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function nativeTagCount() {
    const root = nativeTagField()?.root;
    if (!root) return null;
    const markers = [...root.querySelectorAll('p,span,small')].map(node => clean(node.textContent, 30));
    const counts = markers.map(t => /^(\d{1,2})\s*\/\s*12$/.exec(t)).filter(Boolean);
    return counts.length === 1 ? Number(counts[0][1]) : null;
  }

  async function applyNativeLorebookTags(tags) {
    if (cloneTagBusy) throw new Error("A tag selection is already running.");
    if (!Array.isArray(tags) || tags.length > 12) throw new Error("Lorebooks allow at most 12 tags.");
    if (!nativeTagField()) throw new Error("SpicyChat's native Lorebook tag picker is not available.");
    cloneTagBusy = true;
    const missing = [], unverified = [], added = [];
    try {
      for (const tag of tags) {
        const key = tag.toLocaleLowerCase();
        if (selectedNativeTags().some(value => value.toLocaleLowerCase() === key)) continue;
        const before = nativeTagCount();
        if ((before ?? selectedNativeTags().length) >= 12) { missing.push(tag); continue; }
        // React may replace the input after every selected tag.
        const field = nativeTagField();
        if (!field) { unverified.push(tag); continue; }
        field.input.focus({ preventScroll: true });
        field.input.click();
        setNativeFieldValue(field.input, tag);
        let option = null;
        for (let wait = 0; wait < 10; wait++) {
          option = nativeTagOption(tag, field.input);
          if (option) break;
          await new Promise(resolve => setTimeout(resolve, 125));
        }
        if (!option) { missing.push(tag); if (field.input.isConnected) setNativeFieldValue(field.input, ''); continue; }
        // QoL's generic realClick dispatches events used by some native menus.
        if (typeof DS.realClick === 'function') DS.realClick(option);
        else option.click();
        await new Promise(resolve => setTimeout(resolve, 190));
        const after = nativeTagCount();
        const labelled = selectedNativeTags().some(value => value.toLocaleLowerCase() === key);
        if (labelled || (before !== null && after !== null && after === before + 1)) added.push(tag);
        else unverified.push(tag);
        const current = nativeTagField()?.input;
        if (current?.isConnected) setNativeFieldValue(current, '');
      }
      return { added, missing, unverified };
    } finally { cloneTagBusy = false; }
  }

  function setNativeFieldValue(input, value) {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("SpicyChat's native field could not be changed.");
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function nativeCoverStage(beforeSrc = "") {
    const field = document.querySelector('[data-field-name="avatar_url"]');
    const preview = field?.querySelector('img[src]');
    const source = preview?.getAttribute('src') || "";
    if (source && source !== beforeSrc) return "new-preview";
    if (document.querySelector('[data-testid*="crop" i], [class*="ReactCrop"], [class*="reactEasyCrop"]')) return "crop-editor";
    for (const dialog of document.querySelectorAll('[role="dialog"],[aria-modal="true"]')) {
      if (/crop|adjust image|edit image|position image/i.test(clean(dialog.textContent, 400))) return "crop-editor";
    }
    return "";
  }

  async function uploadPictureFromJson(payload) {
    if (cloneCoverBusy) throw new Error("The picture is already being prepared.");
    cloneCoverBusy = true;
    try {
      // Approved first-party hosts only, no cookies or imported remote URL fetches.
      const data = payload.imageData || await imageDataForBackup(payload.image);
      if (!data) throw new Error(`This backup has no usable embedded cover. ${lastCoverError || "The image CDN could not be read."} Choose the original picture file instead.`);
      const file = fileFromEmbeddedCover(data);
      const before = document.querySelector('[data-field-name="avatar_url"] img[src]')?.getAttribute('src') || "";
      putCloneCoverInNativeUploader(file);
      for (let attempt = 0; attempt < 28; attempt++) {
        const stage = nativeCoverStage(before);
        if (stage) return stage;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      throw new Error("SpicyChat did not confirm its picture editor or a new preview. The image may not have uploaded. Use the native file picker or crop editor before saving.");
    } finally { cloneCoverBusy = false; }
  }

  // Full private-copy mode uses the same signed image upload and authenticated
  // private Lorebook creation route as the tested Archive setup. It does not
  // depend on React accepting synthetic tag clicks or file-input events.
  const cloneGrantKey = token => `${CLONE_WRITE_KEY}:${token}`;
  const cloneStorage = {
    get: key => new Promise((resolve, reject) => chrome.storage.local.get(key, items =>
      chrome.runtime.lastError ? reject(Error(chrome.runtime.lastError.message)) : resolve(items?.[key]))),
    set: data => new Promise((resolve, reject) => chrome.storage.local.set(data, () =>
      chrome.runtime.lastError ? reject(Error(chrome.runtime.lastError.message)) : resolve())),
    remove: key => new Promise(resolve => chrome.storage.local.remove(key, () => resolve()))
  };

  const CHANGE_ME_PLACEHOLDER_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAwAAAAMACAMAAACkX/C8AAADAFBMVEVGRUWsq67GxsizsrRWVlZnZ2iIiImXl5h3dnc+PT1AQD7Q0dJAPj6enqC+vsBAPkB+foCgnqCAfoA+PkBgXmA+QD5eXmCeoKC+wMFfYGBgXl7AvsI/QECAf39fYF9/gH9/gIGAgH+gn5+/wL8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADOywY1AAABAHRSTlP///////////////////////////////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMxwlNQAALctJREFUeNrtnYmW8jiybnFqtIGc/qmquvtM9/3f8WJIEs+W8CRZe691VtepAhLk+BQRUih0OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwJLIElWl/BeMCySBNdkdIbIqRiuGB3Y++5usH5HpzjcVvwpGDuKJcJSy+oLytP9SAh0KKA7KWkWIBOGbfmn4FRNvW7PNxpC97zFaowMI1/bNuYzqxeB8bsbsX9i88RYtHilD+enmExVAWMZvL9O+aGS0N5SvALKmAFTzY69/6OILGHcIAWt8Qno97gGakhF9LzWIADaf/M/D9mwar1feOcDwH9BEQ7Cl/X/4Lur0T+hPZQ3iAwXAdmjfgKZ8y5AE2utGekQxhqcAmzGW05475ue/r3sEndiOl8uxmEnlPAfYKAJ6wv4HOJ26/q3KhNeyEcAy5O4e4LZg/z5PfC51u2yowicCgMWneqVNV4Ciu+p55t+zleUWs3EOgQoqh2BO6/9e6m+uuxeybfoXy5dLqfCigo/RddOydIh9Mpjd+jsLdVSllnmdQp1SBudKRNSy9LLe7vKfqa2GWaxfDK9SXl5i9Lta+TxLGZLdZKcGEnM0AFNQ7SX7c1iJSZfL0Y0zNmyUwXOT/0fX8qMMaMmlyLu+zLmZkxvcADwx+btW64cm3I4lWSqG4Pm8d6RSIThM91FL3AA4mv9QsU4EZtTnu4iEwCn46Td/EYP9D5RnIAFwsP/oa+8HfgISgCci6NiCaGn7D9FYHjH0U6i+mTOyZRTVl8gIfAD0k6vOo7cxLiK2NrF7zmgCDAkgTuu/8U+XGzjzlGFg3mxsIMUeMLQ39PAAMMT3CVwR9eRfD4Ui28qDEBSwo61TVc0GSIJhLGowuysjfuxu4wDg2yqU7Q1y9nemUJlrSs9jh3tsfEtzE/rFXEID3xO8va/0JLQqkhddblDRazrBOP9MW53bQFwPF2tJZ5WknrphYfyGvZ+tt4cTdpFKKGxiO+S13FBUlkdJjxN55u3ygHQFYAWl0unFvNQGfKO5ayC56Z8K+X4BCOKgnXt8x2tJE/KHzf4RBieQTvJL7tc+/4YTSGr6Tz7q7bjhDCew0+lfcEScrCjhYLfjaBTmfx0a05EX4QR2RcdRd5G9s/fZGxwKTg3sizOB7mh8KJrzA+woAGKCG3MConkHGSdn9uvj35n+O5yA4PbVNARAhtfnBCgRSSAEYumz1wloigT3ymMTgCXuoYnCIIDdRri36f8nY+EcLBIC7erJmuyDS1JGyR875nTR3ZsXYAg8EiYhCBYhTSdweDesFQAAAMQYxWpNvgvJJrvXTX2q3SBN7jv6gmXseecVJpQoeGzns443Z1RZ7hF/Mg4RhD/sZC7Ap+ByjRj4+UEtyyJhpaBlRBR+ulHNyIjMxAddlOJIf+l4tUxgyVnSmOJUIqAlBYACQkULjv2uIYByZnljTLD/pAa3eVqYIQmNRt83/PSiw5upH4xJUD4a+193gFFASBTNts+s/yzvA9gQCNj+eTgrJFkMcjDu+YPexiggYfvPWKJYh+ZG4ztDEoT9C5Y/N1IAPiA4x8zyz6Iogs3gqDkA7H9dBeADAssAWP5cXgGChCtYAWD/ayuAc6ebU9kDYFVig1UHYs5tKSwZ2doKqN03JQtGZFv0tZElh/VWVIDBAwQVlZpIr70oitv/HaKbRB9rz6RdQUxJsfWskUpZa/WFz/9c/kEpJaNUgMABgD/WXIO2KtHdXPaZXbvvsQoK/hF0+876CFuOqHf6r8Iz9p912z9XUkASmD77L6MiplTYN4Xqtf9SAOyrQrIO4LqZwaIKjAbRNt7sqyiLV0WPBsplFZXzgGEQe11BjHT9rZA3Q+91AhYBwKAF2agPfp1UNsxntAJQ2hhNBLcwuYq8CGUgB75VFkQqgPJaKgqyVhjn2A8jjQgg2oZG37k9Scyi9v8Ru63YfQqgomsa5y45z2R7F0CkGwHVzgTkAasMc6QhkN6/ANjMW2z23MH1F2MCOMcvALazl6FQe+j/ZkYEEOm1ZrVnI7hNdZEEeBctmYwQwwKINILeQXQaUwIc8km84cNp5uv0y1MCCPngm6FVxJrBc6hhptJlx4SBUqURAQysIkp7nQJC3WytHXOgqG/+BFjEkADra0Xn5fnrfjMZ2QruKwZS148OeLNVZfTLWi0BCDQBroQB5qeDH+t2AV0KkJU3hroBYkkDVkoAQu1LXw+DuyzAjpp/9znzRjvCQBVQV/ffWO2coUX47nX0nj6pMxdE9mHlsG5CDTBMDGlajKgIVgrbvR6q0XpRdu8SmRuXOL/qBjq6SIQ6B9CpO90EoGOHS9ydwJu0mR9CfNivfnG2SzhhKqCxV8kJ/0UCIBuL/d+cgLzGPiLz5vZe1ddEKEwf8C4IgpadVgJNAHsrHC4R/fkZ879FQgPnJ2MYCMtl2rOnVucgEwD9nIlPIsyKG5mxIbxkBhxmXLmF/ZfB4Fvoj4sgaAZq+ys2+G+4Jir40VAnDHjGAQ0z7pXZZgQZYlTTAJZCZ/CpIvAdAL2VAwh0KahaFkcMNOuMEqLLP/3czgFkQoWYBjx8tsADzJJWiYB3AHK9pQDCnGG/fSIlcfMowIR8BsxsZv1ZsM10zf2EM+ugM0lAaxvqWG44/4cqgNP1GknRKgeEKYMa6PfacA0o3K2mvLwGzRD/pMC2Agh1leVEg8SUFqmE2GgllCQTNscKsZkAzgw/bJ8FbycAKg0ggCWqreyfAAiCYKNaCFqPQDh58Bb7YKyyQxjIDayfS7X3blQyoglO+Vvwje//9X83CcCeufbB1P/sVQFXkzfaqhJrtTlnXgeHL++PrM6yKDBqn6A6tsYauc+pMFG2z212zVI683AEkSXAP5UiYXlqWUVG+J1Hzb+vebRybp8SVwJ8q+Y15Cz+OWVMga5zt5+hX/7pJoGoLpT/bmyKAjwDoLiO1Lm4ADHa3t+tiZaI6DZeybrthIQyIgGMZwFuBfLKYVchJgFwQHKCA4ipq8CoB3C+2mK8kaj4zKMcF1yA7+OPJ2yU4ws3v72j5n4Ov2IUAC7A05B25AC8zgfK/xPDGogoC450QtvOkGJ1ACP3n/ppWY5dpxpRcmTolZiAAxhJgb3zPzmWCseTBitcwLORREQ503nuCVuO5AERTQ5VF/CBie/SAaj5738fy6rjmR0Uh3h27wAGU2CR/ZwcOkR9HMxwZ4AjtT6bn/F8b7mIrQ6rKqID8biAnTsAZZZZsRlKhKM6EKNxAd4TadgzhSxr+M35bEo+ForWczW5rgIXEJcDiGWisB6tUKbca6/FwPbC7RrJQxQnTaq+jGZGTpF0yPOE9jrDKKeMyKDOymNlRlurVOjnR9kL8HYAIc//Xkd47USpjbmar1cEft6E7eD9ZACePSCm/S2XUOvrYL2Rb+EOGi7Ac2LdiwOYWgNvHKKtLx8Qdn0QV+eNUtn7D3qlwK8NlpyqNo+/FrJhKVZCfUYo6EjNpwGEWfOvZf9EMm+wEjqSAtugBeDTvud9+orTTrrlVsul/uAChgVwiORBjitArfrnws4CSIMHeY/EQ3pZ5PRo12fNSQQ9c9iMNNgxB5C7EcAMU7JHzh144xFDGuz0pAMvFvFqgjjDTKf3IoDCEgMNO3vz1TvqsB8BTNfyyevvhWxXhfxAACPRhTZG/z7sSADTn3Ou9iKAmgtAANFixXrbYIeRmui4BECXRATwlNWIvQjgZO+rw+/YEQJITwBfS6GCJqERU1ix7rq8V/Fp8KG1LNM8EoCIOYXsAcgtYQ0PINYUgM8qEAKANXIABAApewD3a03nSEq9Qi514gnB0h7A/YzKHFUdXgL4yW2kEJIA1q0FosYs1rAij+nSQx8BzFANekYAe0daG9E9yl4CmL4R4HcmEmOK0Px1XEckPCxSzHAizO7mRBh029PXMYB4Hl7mfid8Jia3uNYrHz9Y67ErzY7w7QFH1yrAyySnNsL060ERjUUpc11MNjJPXgDxdczzaQsx2Sa9IqBoUoDve2DNIXEF1Krd43l89wh/jc5we3QAj19lU3cBJkIBXFR7bUXoooCJRz+Uz/wfTbspyaV5XeFEPEsYudT3jrSjGpjmAoxjZ9Ayno4npayWNyVevFENce1bTN9cWauN+TrHv5QLGLknr/zDl++gdVQbKfVpL/GzMfG3ipHyt13MBYw4ACV57HFT9YURb+JIs0xuOrwEFPGAWa4Mu1FdUo94PWC4c8PTq5Mj660Rr6HLGNdul6AaPsfsCuUiQZDZqwOoxkBRXfdKBDToynpXhJ5z8yM7zjGvoOe2soaVcBpsd3NnghJD2wJPzXJje8DyLeLxktWlLNaAdrAYkIlBAfgf1h1JK2Iv/DQxbmAvGTnHXsg7eJ+p8N8NUEO7C+WfsnFvINkoa1gXHITP6MU8vCnsqYBB+7/+KRn7eHFvcKUSWsTfz2Ps9nivnzhyN6TYwaxZvf811b2wXSVCDu177Fxi2kN35arGEy0JVfsKAx3OyRgns1XjFXA7GC9VWTVONAay+1oIsGKeiuVPhzNgYgdzphGp1wPtqyIqdzq7JT7s2Kzg9DE7EEB1vJJcCN1bTaxxbBRhbK/apf1wbLnywfPfUwqwhxnA+aj8xcQ72yFIpTP3pqN6VzNGiklAbncVAXm1iri8VteOsEhlTebRcGsXJWTviR8K0HuaAKzw6d92P09cHubSujxWJvzev4OdsN2FAFM84OcO7N9PAJXDvOKJ95bviX/WOO+lFHJy0KCit/9sbfZQRqzTTgIeVnOO+4cUKtuE6A8TqrQF8Gj6F7cDKGS2FfspiEtyL/i+GR77RGa2sn8Rfw152hXR0prM6N8kAE8rIHK7kfup7UuYzRzADgzneuxBCC633Ecgu/5CUPR5sNRlEMD8jwBSXQoFQqCEkwDYAfqrvEewFQCJxkDP1TPMwd+MP2zuAsRmAuBWSAghC9hq/hcsH0IQQdA2AiAFhmAUQCUEJIzaQAHig/0jSFcB1M/EHjZIuV8FiKzv//Hd6u23/9/YUMz2Uu6f6p97VYCo/JPR5rkcWYjLW3vkQ/1Y3OjYrnb2UEB9T+Ba6GWzZ479Xi/+lZ19Qndl/4W02uiUBF3piLKnn12uBTVPuduqx/OK8L8toqtX3Fnua+a4HvJPKKc577MlmMyae8K/f3z/x5/adbegfNl7tWmQEQ0PYvZl/8lta1cPke8rsTdVATTnNGnPLgooJ/+Ggev6VvO+9r9Meg0S99UTrmWq93lcD/9ynx7qlV7iYmc9dOReZ8PRFHifbu8r3+075udwgFj2+ZZnr9uLJxxIJQswe24LLPVj9Wd4vvO7RuYrjd7d8UGZYIPEvffFLvf4inHxd9NnBMXlY9UOp0iZ3vGeBH9yZ/i3y2ZXU+KBVKpbU+4KfEIAAz7RpCeA1B53rilxa/pEkdoykEUAA6Rm/7WFsTTMIeWu2Pl/j6yDnpMTgErusryU74YavUsyvVNe6aWEfxK+HTAfu0tAJ3dpunTYBNnvD35L7Gmf5P1+sL59sOQEsPttoSEBqLf0HvdwD6Gf6Y1IaiFx4pcD2iEBJNnoIWUBpHiu2/QrIM2DvjqxRWCbuABkbyO5RA/6pmYQOvnOHmVhp2hcF1z6f5vmcCQsgPMhVaRS1lp9x9qy0DNPcyxUYs1ONb39oDYZJCaA9MpfAQEgAHARgE1LAFzwA4dql5wkLOKcWOkHuE+JWWICoL8lpCcAk/Y+GLSonAmzxf5/7vcBCHJguPL+uGNW/UpC8LfWUQYHACXy0fcuDZN4v/Z/1dg/3LD34qhUkkKplML84aGA2ykhFkUg1ShI3cqhAAAAAAAAAAAAAAAAAAAAACA6JGUfkC7WpNsGDbpnxLJJWCLFoNLc+gFm//Dc4YY6X/tDpnFESt87YmY8eLjNifceqSmcCJOPnrB0RYHanJjCMfHCbtQatCgwtOs4/MpDa8IrU7ogIF9XAJfk6qsNizG6PHPUL4OLXbgvTp0ur/Vw13KZTy6c19P+royDtcrh+w4yryRrV6ac0hHA0hfiSGvES53XrH+pQWrx+uKYh11eW36YYwxns8urhZY/nPLB7PX6YucPzj5Hx+HcHAcxMA7lDR6vt0sLXl9fXl9fv/7x9f6Pl38WHzOu2JxqAsh3LwCxjgBUy/rvD7/buOzr1392eLRSHG8vdvkFMrv/5XeHV5vrK49H8fuH82sHUsf8Mg6v3eOQ/af7bfbFgePLfNF6Xr0qe/cCKNYRgM2GHp9pG7l6CGR88n1ISzuI5cX91bmufI3cyf5LazTPjcMl5cwHBmKE+RSQlAAOFQEsdkGMysaeXivSqbxjVJefx8eLR9VS+yoj3qWQ/6rM0GM/cvxzR8dB2MO/h77v4HvlAiaRyb1fE1v1AB+L/IXTQbs8vnr8/l/V/zRq0xUBvOfuZjpq1Pl/alPs4Eef9OhLXcYha2Qm8sWZ2e70rgngkJAAFlnz+iUd5zDTa6djWUA1uTC5Y5zi8tF5/dXW2bV0fQvHcXi1z0VA4z8dAYz+2kXCH+H6ACvutqhlfmP313sIoDGhHo2PAIblMiIA9fpUML+FADQCmNH+3R/gJYq9W/rJengA6SEA0/ybgw/4ZI7uYfawAKz7MBx1dUnS/X0aAYTn7zyeezUkz+0yIZAULWMben3REMBgzvAQwL/a30J5jYOqLEl6vOsNAUxd89py/q9G2blaxAMU7TRUtJZdBh2GfsoD5H7jUAnMPN45n//WIqFSiINa8F5w2Rn/H4+jD3GCAP7t6iu++Mx9BDCw1DIgACn85gHxhABmfHharFUcsHcBdK57iOxstDZl1cCxby17ggAGV7wGjc1JAH8pJwE4jYO58CcTg9/JUQBiztsdTJaqAGY+AtSx7p3pa9PtvKyA7KgNekoA1Xl9eFkn810+Nx77TVlfOJJ3jsPvh4Btszoi6xbAMbNWXbAlSn394/V/Z5260hKAXEoAhRoveZBWTA+B6gL45fOFxmJn4/H6PgHksrUAehnoquqKWzFf53pOTQBlZNUl15krNpMVgJjXA2Ttx965CtW11WSX8ABmbM3F6R1HPfpzj1ltKWl40/v2Iqm7nYxy37VYQAAp3JtYFcCsR8Jsa6e3s/Y/r+yQZoclBdBXVXD2lYz1EUDL7/RlWupe0lr7fLXISv/IzJWUACoXZc8rgMx5AdG0TWOJfQDTl0FK37dIHw+QDVR8NKaiDke5gQBkYgIwywjAehTrXsOg2mAvIAD5Or7s7iiAzF0Av5Sr/ZfWbvV748fWBfC2tgDSuil+Vr1n7s+9zAKVrKV3CwigthYj/uXkAoxL4d6gABrlRCMbS29584CwWqbkf5usMEz04/fOOMCqsXY4tlCRn/r9xywCqG9G1Q6mHLV31KRHBJB/S7v2Z1+9z5dsIIAFF8ZDpKjs++n51tP0tFL1+QVg6ztN1mlt3ziU63S5vPP9W9SLmp4I4jcWQAJ9gaoHAmZMsoTzbutKAsgahihcKv2Nx/mrzlKIegT0xKEtBLCqAGbzAPUIyBabC0A1DLG+PZt5C6D9lu5aIDHRgLcVwMchASq/d7ZDdY2Mc+IakjpNF8CfRg7b2J9VnW8rjMf5k04BqHoGME0Ax9UFYFIQwMGI+VsAnGum8mNzAch2AG/GT1PVBCDMcBFRTQBvXb/jmdriugDWOaFemRGTEIDKxOw/V/iEMBNDIJfzAKZtiA6Tc10AtcP35XvqbiPr2lw2U/exxj3A6TS/QdwdQCIt83+aa3PoGe1f/jWxX0c9ZB9hfCqXXSlvNhpen+oCaJb1139Y9eP+dKbez6wp1gfisUB/52Kl8y9V2tvnn9O5MkLOW1FbP8n6hOcvfI+SDQsg70xJ3o9jKq2t4Qh5Un8NJMKd1aBiauMel4GYv59T2cI1lfsxbgaXz+pH88mpm51VAN1rMXJ0habhAVrns2pFFF0CqP6JY/dEMNLp1kUAx0UOLr7Rvvt5AVTt92i3FkDes+s1ukbfFEDrbEv1t3UIIK/m3sc/3fnXNZ24Nbn9inOspwCeG2JYUAB6aug7rwfIuut4/v5rbDOsLoD88KO1M6AGBTDmCXV3o9vK/pObALjcBwEMCMD21TKbMSNqCuDQ2EF+OT4cxxMC0OO7bG7JkMDmQhbA28YCyPoKOdXYybCWAFoHHL91U9RWgd46BNByMbK/WZw9IYCYBVALFJ7ZXntWAF21/QNm/mfEBbQF0Cxv+57Yi45iuBEBWIdCCwQQ5aJSraPaz40FUPsy2YA2pIsALoHLsXNH2F8AQ4UW0ksAJsfogqJmI2riBuhEAUjX+oWO93YKoLkj/HV1xqgAdOEhAOU1EAoBBCyAJ0rsihkFUPsujVjhNHIsoC6Aey7zfSNTzat0FMPVl0FbtbZ6LgHoEyYXFvY47fE0BHAc6KY4elix0XHnlJd8FdA0jwXkgwLo9U/X2reqX7iHJHLwqylvARxfOv5f7ncOUADu54EdBGD0MEOtEetzfPujxGDRRo8A6gL/KnMbFUB28EgCOgWQXb/y52ftF6gD8U9wyIlLFI3OcN9PuJy6T6dHLF3eMl2fxc3gGuhYl95mLN0ngEOzb7qtC+DPXQAjtUAffgK46OzqwCouNc8x/7mMdsb7lutlNv6fO+F+AJcw46+//nI75tUrgJauVF0Ap658ueN3lA1hXl9f/3IUwNtaliCTM39Vdkcxs0WT2WD25+sBJgjA+CXRylUAsrkjXN8JLro8Red5gEcRXF30RbcHWMH8r21CdGISKCvAyyrzmQ7d1a5MfKZS5XkBPH3JYpd++gVwaBWGdpZD26N7XbgKQgDyyxKylKqhH2eAZlpRaNQN++8F25kEoD0F0DgZNiCA3LpU6PuMg3LJARbHpHUe+G4n3wKY6WdLMe3BzdQVwvdqluaxgAEBdLb9bx9R8RgHBwGsOBVmSbkAM3cnmMJ07JWuLwBfB9BYqinM4GJW/wLT+dQzDs5LZ1sJYJk+gcFznrsbZCNAMBME8DpBAN4OoH4s4DQsgH7/ci66Y0ETvABMmgKYv0N0wzjsj6cFMMEDPFNSV7XzfFgA/Vu5WZ8G1SQBLB+WV+8LSmmD+eH45koCmlfsqpGVNyFq3Q3mSYKzZ8qJlLsAWoWhbQE0MoWhIKh2PGAjASTWGLeyCvotgLlO1zVmx6HQSonW87U+J2r6BPBcRV3mHAId2jvCrYXfon7q5divgFz+a/sQyCZ1R3a38Of63X9qtnH8f2o83Jl+RVItBKp9A3G7lPTKn/Ofs7lxvv6rHhcwLoBmaXR756PhAo694yvPXUUZKwvAiCzJZdAl7kRQQ+nlw8ak6XrCcwhAvby4FmWL7opqBwGo0UPqjb24Y88AK/EyLoDF9wGyNHPgcvtv/mtiWlUIRrYrt2x3H/U5BGCOziuQPcfmHQTQmWjXBHDS7XFom79xORG2uABSzYFL1ydmd33tVcK/LoluVQPSNtPU+00y9jhZANKjM3nttY8etLmDADr3GrLBcTheL0y+/dK3y3jIi/kfe7YjGiGQ7OYwU0l0qjnw5SmKhwLmy6i6VhnNfytVPjNldfZX79m+6R6gsRMx8hnd7dydBFDvhN1V9WO7Wv9oex2GyzgY0TT/ShjW0ST19cLX/9z+ab7GrjpLMwcuI9Alfrnp7vt0eZKvffuwp9lCoMxnAbH74LCbADq22xobfz0lqf9qNPbt+MnuZ0NncdwmSzMHriUBcwZ/2ZNLkMXki7Jz5eMAGtN49u9OAfRUdZ/a/X2GLs/wWop1F8Ac18jLVHPg8hGJJX669HzytjN+eeqmePPiXojc7Gf98nfuIYBWz9y2ADyL8h4Ze+6xl/F71hQgtYPGlbsiZ+y2XXg9+Yf15p218T4CkO5roB1xjOkQQHbo3Y9rFYa2ap+ajSSG7V/1CXO4kHVyIvyZbAqw2BZg7qGAihOfLgDvS8psR/eUU3UlNfOI9drFfx4KqG4U+AhgenesSgpwTsz+q95v1uvBC/coSPcFFc+EQProOTd2nl+vCkAMv/s4EnLJzFEB9flnTQGknAJU9wDFzD9evzg8+voGaT33G/NI1TvadYcA3G5nrL6jSwDDeYQaT0jN0XMaaIdyy4ZA1UkwvV5D8xeEVtZYxx994xB2dT4ezWDNSBGZ2++RHTN4JS4au6KxGkId33vGYXz6V+NrrC4nGZ4Lg5PdBmv++tkTIDvyGNvFAdrjwaousVRE5/gwO/5kNbIZG5TKBN9Td/F2eB8eh655V7vmDmLGOTC9HPhw+Kcq/3wBffU/ua4WHI/UwXiYbuXspfoOvN6do8B2BOPzKY8gv1ey+UH3S6Bn5dE1d5g+Z58Xi4KjwCxxY/xjOeOgyi3/Y7s0wnZPNvcqUaf45cvD1G76Vpl350zTDsO/whanT9FOry1LH7pmgT4Dlk6tjWaIWWTSKUD9OPQyVYdSaZOJSmXL0FWcxfWuznc3V5x/3etZ/97q2jnT57LDy8fopiDLT7Hubx+9XfTH2+UjqyIQmbG/D79GPrafd2vtHCG7TToCqq0BLFkHIss7iS9PTI3WMJ5yv06A7Vrr3LdzZt71Do9PcXxp+SJZjsLXOIy9K29wKJr/pph3BjwnaP+1VeBl/9KJG2jDjoGTTAGqx+EM1pBiDCwSXgS9ZZIpp0BQqYZJewoQOIBEYyCRtAP4XgfQEltIEvl1MFYlPATKWsw/XdR7exkYAAAAAAAAAAAAAAAAAAAAAAAiouCMUhWljdGKcUiGrrPQCaNvdy5oRiKVCe92PygP/Ib9ui0mkoNh+XwtLN7ydO3/8rwFCri6w0zc70sK2ylak10d1c/pF2Rd+7WU7UnkYJxw/YPeZKFHk/eGWEIQ9pbG8G3/mT2F7Ke+m7ZNPcJUbT1leq/x1X6XXNQvxQt5KlFp98PqEEAE90Q1mq5P+qL2td6dv7MbkXza/L8+9Ue4KV/KTdE7bSv8HsGtSwcm9DFoXXPapYCJ9l8qII/geeMBqiFhwDNCq13m8dleZr/swA1dD7KXqQTbauR/k26KPjYiYcauarbrIYp/nG4cfX+ZTqCTiTwnezWqg08MNCvqnI+famndHdq0ZC9mEIAI82nbjBSgFWA8BBCkC+i5Nujnj5mk1Jqs1cscqMAfdpb9xvabk0KQK8N27Hbd5xPg7hjIziKAIOfXagpMBNQRA4U4KHquPNM6fpCew/6PQdqXZg1oZFQCjIF6r0zxNDHlGq7PIwAd9lyX5q0YneQqC7pVvJnnptD+tf1kBHBSpMDdueGDj5gE4JVoZi+rCuBFvQU4lNVNgF8Y/vcTF4teGbmcAITM5/iUJQQgAowwqg4gw+yroaEQ4XpGPceG6/vLygIIcjkhS/1apN7p8SGA8HIjPYOdKY+yhdz5surIHAApcL99VASgoxKAWyI8XNy2hABCXGO0ga93bxsDhTs3jEQk1mFHOHtZWQBBrrEb6uD6JwcR7AZJMRaS/5ySAHcI4DQ5BwjTvBS7wG7h4UdkAhgtOxsrbXAUwL/G7P6v1wsiM4HOroZdYMf4MLAHODohZxMSYHcBCOlGDHPcmRR4aHh0ZAIYrjsbP93VygFiqm92H0YcgPP4xBUCjSTC46e70hCAYQ3U2QWENT4uOWn/IXTjfXbltEsBcBbY3QUEtkSgJ+w75Z8vCODLE+IAHKeIwHbJ3VYlsycT4HQE8AiB3jH27oUg8bVJGNgE4bYsr9+eSoDTEYDCAYwPUdkkzkS2Ezx0St6tvUnDtN/2KYDD59e5bzaB+6MgZVVw00PhujHbLuQ2Ly94gMoEV0ZBmqPw0WXnzxZguh5uT0UAlxlOEv5Eh7MHaCbCzt1N0hEA7FoA9cMB7v09hdMfRACwCb88ijOribB7f08EAAGT+1QnPxJh8/JCCASpCeB+St7vTY4C6Dp7VhSHN54RBBIC3RPh3Ku9p3BSnFDDyEPOw4KtBfBi3g6+F1y4CWD0UzKLBGDjEOjrOK7fBRfzCKD8IMosYXa8j+iq3LxsI4Bgr8UAX8o7Qs9h3PfpLQBhXiYJYNKh+AAVwO7vE2NmxLVuKgSXns/TqnMdDxBeQxR7LQBCA34YEc75+MgEIEJ8koISaC++7w4OoYHYKS4BhHU10r3tMZ3gnhq28tq8zbd5irgEcNQBbYypx+1vnALwEUBI50f7BGD8jfNPtoIHCKmnhhFB3/4WLEHdpdknAOVtp0KatARQbXiJAHwWgap9tNWPbb9MXw6gvO9zV3laHoB26E8vvNiAWoXmvQLwK3goFyidBHDaiwAMN4LNMXZbd0np9wB+Crj8jMKsIAATSkGQxQE8P+vWbpP6GaoAfIo+y3XAVQRgf4TxDGsB0Ds27Zd41lzAtmvIfSGQPJWxmldgkq8ggGA2wqo3H7ILMMkFbFvk2LcKdD368qZdF4DWEkAopRBKVJuBUqc9ZQLZdiO9GPAAB9fK59si4AoCOIe4AoQDeGoERSB5cJ8Avr6nSyL8FQIvL4AswPmLPYBnh1CEcWnMsABc2v/cZ0C3JHhC7UUwU21tEYMl0GddgAjizowRAYw3gPv+8ssKQAR0OVh1DYMl0KfTqOrtwZuVeBVjAhjrnVhpmTglBBL/Y619t72E1FXVBrOEsZc8+BJH5sEK4HAeToD/7SeAfKgtylveQ0DPrahmwBRCz5MHZ2ar/jf5uAAGE+HqBGhcMtf4G2MZ9oDnCoICWEt2EMCQAqoZYOEkgOhbIxIALRMEyWKT73ByEEB/TUQtAEhDAGwBLDSWG62muQjgUFiXdflJq0DRCEATAM0YBG0/mTgJoGcpqHFnRhICqE1aBEAzBkHnoAXQWRPRWJifVA0qIpyz2AKbcSVos/U0NwEUHQpozX8pCKB6DpIAaMYJZbP1hB4BtE8pmNFOndP2ASJ5YIIVoCVmlM0cQOEsgMtXfTk+1n86pr8UBPBoBUEANJMCsrIqaLvuetqjAZUymbjYat/XTUIA96gV+5/Pq1q7YTTpI4DD9SrQ3i+bhAAOslwINcQ/u1mI6hbAMxc+pyGA8sZz0t/dC0AiAEiBAgEAHmBFAXBNKiAABAD7E0BBCAQI4NkzwcKJzFhWYHaNVFbJtwQFwF2RcCj3hcXKZbaL5wCZ2x/0uCVm9TYy1nwYbsJbxRrF6vvsPfb4X7N5gNkF0DqIsDTmFn2x+bs4j+vz9NYCkCEL4Jita//cg7TyUK9ZazufAE6rCWDVJrmaE8DrCWD9jpNFjB5gzVVTzRHgbQSwkgJ6rDZ0Aax2XzBn4FekdnnYSsPdK4AibAGsdFOMpgnKmtRaDqwz3j1W+/p1P0CwAtCrNBKrngCmCcQay0DZ6n0n+wSQLySAIiIB1O0fB7D2kK+yGKp7BLBUCHSKRwD1iNSQAawSdK6tgPfZVll65vZGw6PTZywCqLljMuDVVoJWDjvVfJcRKafSHTXPKlC+sv2zC7ZJIrzChpiYbaOpu4t003LkX1HsA2D/W/Fz5ZHX8xXbaKeLvcxxhghoZftnAWizpaDs99J/rz1vH5+0rw4X8CodHUVY1XAS+99yKaiugKUfdisoPz7dqFf95RJL2eD3gbH/kBSw+PqbfTnOY/9lPatLqDJVAXZd++cEzurUF0MX34FR2UMBx2nxtax2ke4tIFZToqBs3flfYP8bYETlHuEVtoRt9mWS07uU3j9q+ATJ9x/0vi7YHoql7V9wD2QAClj5Knkp1YVZoq3rJ/2WTn/Qk7/lYfENAI39B0BtGlrlKcx6H++vX79m/4JrtQqo+F4KgAJRAI9hzYEn/w3uQSCAbcYd+9+QN7X9Ndpppl/YfxgUKrutBZGIrclJsf4ZChcFlFCJvsmw/w8jsX08WvYkYyN+g2E3mvpPAAAAAAAAAACArbheIcMwzIo1//fBsmcc6Iy7GuaeUrgAIx7M+lfI7H76p/VVRA9LPBr1vTEc87hUzj7G5ABo1TRz+EPReUyPq3ZalQlrMiqj/XNUZOv2S0kn/CcEii1gvfXMIgyaNJqC/s9Ru+yMpbtJ4b+g/23sCsBtTxhJ7H8XCiARmCGY5P6XiDx31oSpa3L4gyON6uE1FUAi4EfRdKOsKMftvgmD/LDMIJHz3lRApmgc5D5/CBaT45/DRDMRoDTIkWb4j/uMEdVWAD7AKf7/JPzf5ToGhSyOsIS2n1BWEAQ94TpZ/d9pGMRShrcACH/2FAYhACf+sPqzIyy1jE+7AM2A7YB/DJv53pNGmTydmf53QXHbFBPYv0fkaPU75r+j56np5Q0AANDyj5JcN9UnzxgcrGG5J03U15NPenfYnr8W/H9jEInxee+gmO7kJ+0HdVLJzv+V3X6ZqPlT8pYwtUOTCUpANs9LIIC0nn+z5F2mbf4IIHEBiJQkID9b5p+dsYmEQ6CkJCA/sw5wAIlh2zaQhASkzrp+OYXi6bkA0TUR7lwCF/MX6f1q6KR5XnL3XqDA/KGKMlmWkhdQnb/WEP2nnAh0xkHZz12GPx3+TmD+SKBrVtyjD2hnv5g/9KSFO1wUkQQ/4CwBs38BYP5QkcD+BVBf9+WAKAxIYJfn59XXsq8QLHxCk7xeHrZLAymbnQjMH7r5cbDn+xz5HrOU84tD6/NzmuYYMBQlmJ41IGm1tnFMnMqaj8x8MsvDU8mAsqptO+raKS0zNvDp86LTM3dawOyTamV5SCsZqnS14VJHWIJGzVB4ImgY/w2eG8xkXu0Smks0FIQGirwM2kzWVdhKDASzR0APCYggHMEl6M86rR8BwGz8zHopVxVPm1n/PePt/mo8OJiJITvLzFa10zYbRP3iwcE6prbNlxKDX4pDvjAfetDWtgk2siEBUO0A8+bBekMX0NnEWg5Yv8L8YXYrLDXQPemKlgCu1QhGf1qlnm3BLqVUymptTPeM3nnAV2QfWD8spgGrr+ufYwK4X816f+1FCtpetDAuhqvRf1t9beNBOniA4Es1YAd+4Nz0Ay3jNAPR+bk/OlfmXNNN4/R6Ky8RgW9Pw34dQW2CFtYhOMnG7p6WZnipqRVnyYcQMX5Y3xOY+9zcrDobWZ/s2aLVY++yzQ232yk2jB+2IL+JwHy0D5joEUvOtN+iTp8ADlxvByFiR225Q0/jb/rJyEIc4dGoLcsnBEB5P+zFBXTsHBdq7D3EOrATBQjr4zaufRyydwYVYoqCbGsvq9KQs/MtqsP0b6s82rLOAzGqoFrLMF6npqrnuu6bx1g+7EIKFy2URQ52cDL/ra6wtgn75Y0hAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgCX4/23kxly8ERawAAAAAElFTkSuQmCC";
  function automaticPlaceholderCoverData() {
    return CHANGE_ME_PLACEHOLDER_IMAGE;
  }
  async function getCloneGrant(token) {
    const current=await cloneStorage.get(cloneGrantKey(token));
    if (current?.token===token) return current;
    // Pre-fix imports kept one global grant. Read but never overwrite it.
    const legacy=await cloneStorage.get(CLONE_WRITE_KEY);
    return legacy?.token===token?legacy:null;
  }
  async function putCloneGrant(token,job) {
    return cloneStorage.set({[cloneGrantKey(token)]:job});
  }
  function md5Bytes(bytes) {
    const len = bytes.length, n = (((len + 8) >>> 6) + 1) << 6;
    const message = new Uint8Array(n); message.set(bytes); message[len] = 128;
    const view = new DataView(message.buffer);
    const bitLength = len * 8;
    view.setUint32(n-8, bitLength >>> 0, true); view.setUint32(n-4, Math.floor(bitLength / 4294967296), true);
    const shifts = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
    const constants = Array.from({length:64}, (_,i) => Math.floor(Math.abs(Math.sin(i+1))*4294967296) >>> 0);
    let a0=0x67452301, b0=0xefcdab89, c0=0x98badcfe, d0=0x10325476;
    for(let i=0;i<n;i+=64){
      let a=a0,b=b0,c=c0,d=d0;
      for(let j=0;j<64;j++){
        let f,g;
        if(j<16){f=(b&c)|(~b&d);g=j;}
        else if(j<32){f=(d&b)|(~d&c);g=(5*j+1)%16;}
        else if(j<48){f=b^c^d;g=(3*j+5)%16;}
        else {f=c^(b|~d);g=(7*j)%16;}
        const k=j<16?shifts[j%4]:j<32?shifts[4+j%4]:j<48?shifts[8+j%4]:shifts[12+j%4];
        const sum=(a+f+constants[j]+view.getUint32(i+g*4,true))>>>0;
        const rotated=((sum<<k)|(sum>>>(32-k)))>>>0;
        [a,b,c,d]=[d,(b+rotated)>>>0,b,c];
      }
      a0=(a0+a)>>>0;b0=(b0+b)>>>0;c0=(c0+c)>>>0;d0=(d0+d)>>>0;
    }
    return [a0,b0,c0,d0].map(x=>[0,8,16,24].map(n=>(x>>>n&255).toString(16).padStart(2,'0')).join('')).join('');
  }
  function validateSignedCloneUrl(raw) {
    if (typeof raw !== 'string' || raw.length > 10000) throw Error('The image upload URL was invalid.');
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !/(^|\.)(?:amazonaws\.com|cloudflarestorage\.com|googleapis\.com|nd-api\.com)$/.test(url.hostname)) {
      throw Error('SpicyChat returned an unrecognized signed-image host.');
    }
    return url.href;
  }
  async function signedCloneCoverUpload(dataUrl, api, report) {
    const file = fileFromEmbeddedCover(dataUrl);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 50 || bytes.length > 2 * 1024 * 1024) throw Error('Cover file size is invalid.');
    const validImage = (file.type === 'image/png' && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) ||
      (file.type === 'image/jpeg' && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) ||
      (file.type === 'image/webp' && String.fromCharCode(...bytes.subarray(0,4))==='RIFF' &&
        String.fromCharCode(...bytes.subarray(8,12))==='WEBP');
    if (!validImage) throw Error('The picture data does not match its PNG, JPEG or WebP file type.');
    const hash = md5Bytes(bytes);
    report('Asking SpicyChat for a secure image upload…');
    const signed = await api('/save-image','POST',{image_type:file.type,hash});
    const key = String(signed?.key||'');
    if (!/^avatars\/[a-z0-9._/-]{1,250}\.(?:png|jpg|jpeg|webp)$/i.test(key) || key.includes('..'))
      throw Error('SpicyChat returned an invalid new image reference.');
    // The image API may deduplicate an already uploaded hash and return the
    // existing key without another signed PUT URL. Never reuse a malformed URL.
    if (signed?.signed_url == null || signed.signed_url === '') {
      report('SpicyChat already has this picture. Reusing the image it returned.');
      return key;
    }
    const signedUrl = validateSignedCloneUrl(signed?.signed_url);
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),30000);
    try {
      report('Uploading the picture to SpicyChat…');
      const res=await fetch(signedUrl,{method:'PUT',headers:{'Content-Type':file.type},
        body:new Blob([bytes],{type:file.type}),credentials:'omit',redirect:'error',signal:controller.signal});
      if(!res.ok)throw Error('Image storage rejected the picture (HTTP '+res.status+').');
    } finally {clearTimeout(timeout);}
    return key;
  }
  function validCloneImageKey(value) {
    return /^avatars\/[a-z0-9._/-]{1,250}\.(?:png|jpg|jpeg|webp)$/i.test(String(value||'')) && !String(value).includes('..');
  }
  async function createCompletePrivateClone(record, report, chosenCover = null) {
    if (cloneApiRun) return;
    cloneApiRun = true;
    const update = async patch => {
      const before = await getCloneGrant(record.token);
      if (!before || before.token !== record.token) throw Error('Import permission expired or changed.');
      await putCloneGrant(record.token,{...before,...patch,updatedAt:Date.now()});
    };
    let created = false;
    try {
      const job = await getCloneGrant(record.token);
      if (!job || job.token !== record.token ||
        !['ready','failed'].includes(job.status) ||
        (job.status === 'failed' && !chosenCover) ||
        Date.now()-Number(job.createdAt)>5*60*1000) {
        throw Error('Import setup is no longer ready. Nothing was created. Restart the JSON import if needed.');
      }
      const payload=record.payload;
      // The optional private auth service loads after this feature script.
      // On slower devices give it a chance to finish initializing.
      let api=DS.privateLorebookAuth?.request;
      for(let i=0; typeof api !== 'function' && i<30; i++) {
        await new Promise(resolve=>setTimeout(resolve,200));
        api=DS.privateLorebookAuth?.request;
      }
      if (typeof api !== 'function') throw Error('The private Lorebook API is not available on this page.');
      report('Verifying your SpicyChat account…');
      const user=await api('/v2/users');
      const owner=String(user?.user?.id||'');
      if(!owner)throw Error('Your signed-in SpicyChat account could not be verified.');
      await update({status:'preparing'});
      let cover = '';
      if (settings().lorebookJsonCopyCover !== false) {
        const allowPlaceholderCover = settings().lorebookJsonAllowPlaceholderCover === true;
        const readChosenCover = async file => new Promise((resolve, reject) => {
          if (!['image/png','image/jpeg','image/webp'].includes(file.type) ||
              !file.size || file.size>2*1024*1024) return reject(Error('Choose a PNG, JPEG or WebP smaller than 2 MB.'));
          const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));
          reader.onerror=()=>reject(Error('Could not read the chosen cover file.'));
          reader.readAsDataURL(file);
        });
        let data = '';
        if (chosenCover) {
          data = await readChosenCover(chosenCover);
          report('Using your selected picture for this import.');
        } else {
          data = payload.imageData || await imageDataForBackup(payload.image);
        }
        if (data) {
          cover=await signedCloneCoverUpload(data,api,report);
        } else if (validCloneImageKey(payload.image) && UUID_RE.test(payload.sourceId)) {
          // Safe last resort: reuse the existing first-party image reference
          // only after confirming it belongs to this very account's private book.
          const source=await api(`/lorebooks/${payload.sourceId}?sortBy=priority&lastSortPriority=0`);
          if (source?.creator_user_id === owner && source?.visibility === 'private' &&
              String(source?.image||source?.avatar_url||'') === payload.image) {
            cover=payload.image;
            report('Cover CDN could not be downloaded. Using your verified existing private cover reference instead.');
          }
        }
        if (!cover && allowPlaceholderCover) {
          report("No usable cover could be transferred. Using QoL's temporary “Change Me” placeholder cover.");
          cover = await signedCloneCoverUpload(automaticPlaceholderCoverData(), api, report);
        }
        if (!cover) throw Error('Could not retrieve the cover for automatic import. '+
          (lastCoverError||'')+' Use the original picture file, enable the temporary placeholder option, or use the manual form. Nothing created.');
      } else if (chosenCover) {
        const file = chosenCover;
        if (!['image/png','image/jpeg','image/webp'].includes(file.type) || !file.size || file.size > 2*1024*1024)
          throw Error('Choose a PNG, JPEG or WebP smaller than 2 MB.');
        const chosenData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(Error('Could not read the selected cover.'));
          reader.readAsDataURL(file);
        });
        cover = await signedCloneCoverUpload(chosenData, api, report);
      } else if (settings().lorebookJsonAllowPlaceholderCover === true) {
        report('Original-cover transfer is disabled. Using the optional temporary “Change Me” cover.');
        cover = await signedCloneCoverUpload(automaticPlaceholderCoverData(), api, report);
      } else {
        throw Error('Original-cover transfer is off. Choose a picture, enable the temporary placeholder, or use the native creation form. Nothing created.');
      }
      if(window.__DSQ_TAB_GATE__?.paused)throw Error('QoL is disabled. Nothing created.');
      const check=await api('/v2/users');
      if(String(check?.user?.id||'')!==owner)throw Error('The signed-in account changed; no Lorebook was created.');
      const tags=settings().lorebookJsonCopyTags===false?[]:payload.tags;
      report('Creating one private Lorebook with the picture and '+tags.length+' tags…');
      // Mark submitting BEFORE the one non-idempotent POST. No auto retries.
      await update({status:'submitting'});
      const response=await api('/lorebooks','POST',{
        name:payload.name,description:payload.description,
        tags,avatar_url:cover,visibility:'private'
      });
      created=true;
      const id=String(response?.id||'');
      if(!UUID_RE.test(id)) throw Error('SpicyChat did not return a verifiable Lorebook ID. Check My Lorebooks before retrying.');
      await update({status:'verifying',lorebookId:id});
      const saved=await api(`/lorebooks/${id}?sortBy=priority&lastSortPriority=0`);
      if (saved?.creator_user_id!==owner || saved?.visibility!=='private' || String(saved?.id||'').toLowerCase()!==id.toLowerCase())
        throw Error('The new Lorebook could not be verified as yours and private. Check it manually before importing entries.');
      const savedTags=Array.isArray(saved?.tags)?saved.tags:[];
      const missingTags=tags.filter(tag=>!savedTags.some(value=>String(value).toLowerCase()===tag.toLowerCase()));
      const savedCover=String(saved?.image||saved?.avatar_url||'');
      const coverConfirmed=savedCover===cover;
      await update({status:'complete',lorebookId:id});
      sessionStorage.setItem(CLONE_KEY,JSON.stringify({...record,submittedAt:Date.now(),targetId:id}));
      if(missingTags.length || !coverConfirmed) {
        report('Private Lorebook created, but SpicyChat did not confirm '+
          [missingTags.length?`${missingTags.length} tag(s)`:null,!coverConfirmed?'the cover':null].filter(Boolean).join(' and ')+
          '. Opening its Entries page and keeping a note for review. Do not recreate it.');
        location.assign(`/lorebook/edit/${encodeURIComponent(id)}/entries`);
      } else {
        report('Private Lorebook created with its original cover and tags. Opening Entries…');
        location.assign(`/lorebook/edit/${encodeURIComponent(id)}/entries`);
      }
    } catch(error) {
      const job=await getCloneGrant(record.token).catch(()=>null);
      if(job?.token===record.token) {
        const uncertain=created || ['submitting','verifying'].includes(job.status);
        await update({status:uncertain?'verification-needed':'failed',error:String(error?.message||error)}).catch(()=>{});
        report((uncertain?'Creation may have succeeded; DO NOT retry until you check My Lorebooks. ':'')+
          String(error?.message||error));
      } else report(String(error?.message||error));
    } finally { cloneApiRun=false; }
  }
  function copyImportTags(tags) {
    const value = tags.join(', ');
    if (!value) return Promise.resolve(false);
    // Clipboard API requires permission in some Brave contexts. Preserve the
    // synchronous legacy fallback while still inside the user's click handler.
    const field=document.createElement('textarea');
    field.value=value;field.readOnly=true;
    field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(field);field.focus();field.select();
    let copied=false;
    try { copied=!!document.execCommand('copy'); } catch {} finally { field.remove(); }
    if (copied) return Promise.resolve(true);
    return navigator.clipboard?.writeText(value).then(()=>true,()=>false) || Promise.resolve(false);
  }

  function mergeRecord() {
    try {
      const item = JSON.parse(sessionStorage.getItem(MERGE_KEY) || "null");
      if (!item || item.version !== 1 || !UUID_RE.test(item.targetId) || !item.payload ||
          Date.now() - Number(item.startedAt || 0) > 30 * 60_000) return null;
      return item;
    } catch { return null; }
  }

  function clearMerge() {
    try { sessionStorage.removeItem(MERGE_KEY); } catch {}
    document.getElementById(MERGE_PANEL_ID)?.remove();
  }

  async function verifyPrivateImportTarget(id) {
    if (!UUID_RE.test(id)) throw new Error("Invalid destination Lorebook ID.");
    const api = DS.privateLorebookAuth?.request;
    if (typeof api !== "function") throw new Error("Authenticated Lorebook verification is unavailable.");
    const user = await api("/v2/users");
    const owner = String(user?.user?.id || "");
    const book = await api(`/lorebooks/${id}?sortBy=priority&lastSortPriority=0`);
    if (!owner || String(book?.id || "").toLowerCase() !== id.toLowerCase() ||
        String(book?.creator_user_id || "") !== owner || book?.visibility !== "private") {
      throw new Error("Only a private Lorebook owned by the current SpicyChat account can receive a full JSON merge.");
    }
    return book;
  }

  async function startExistingLorebookMerge(file) {
    const info = routeInfo();
    if (!info?.id || !UUID_RE.test(info.id)) throw new Error("Open an owned private Lorebook editor first.");
    const payload = parseLorebookImportPayload(await readJsonFile(file));
    await verifyPrivateImportTarget(info.id);
    if (!confirm(`Merge “${payload.name}” into your current PRIVATE Lorebook?\n\nQoL will not overwrite existing entries automatically. Name/description, tags, and cover remain separate choices, with a review before saving.`)) return false;
    try { sessionStorage.setItem(MERGE_KEY, JSON.stringify({version:1,targetId:info.id,startedAt:Date.now(),payload})); }
    catch { throw new Error("This JSON is too large for temporary session storage. No changes made."); }
    if (info.page === "entries") location.href = `/lorebook/edit/${encodeURIComponent(info.id)}`;
    else renderExistingLorebookMerge(info);
    return true;
  }

  function renderExistingLorebookMerge(info) {
    const rec = mergeRecord();
    if (!rec || !info || info.id !== rec.targetId || info.page !== "details") return false;
    if (document.getElementById(MERGE_PANEL_ID)) return true;
    const anchor = document.querySelector('form input[name="name"]')?.closest("form");
    if (!anchor?.parentElement) return false;
    const panel = document.createElement("section");
    panel.id = MERGE_PANEL_ID;
    panel.style.cssText = "padding:12px;margin:10px 0;border:1px solid #8192ac;border-radius:8px;font:13px/1.5 system-ui";
    const heading = document.createElement("strong");
    heading.textContent = `QoL: Merge JSON into this private Lorebook (${rec.payload.entries.length} entries)`;
    const status = document.createElement("p");
    status.textContent = "Current name, description, tags, and picture stay unchanged unless you choose an action below.";
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
    const makeButton = (label, fn) => {
      const btn = document.createElement("button"); btn.type = "button"; btn.textContent = label;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try { await verifyPrivateImportTarget(info.id); await fn(); }
        catch (error) { status.textContent = error?.message || String(error); }
        finally { btn.disabled = false; }
      }); controls.append(btn); return btn;
    };
    makeButton("Fill name & description", () => {
      if (!confirm("Replace the fields in the editor with the JSON name and description? You must still click SpicyChat's Save button.")) return;
      setNativeField('input[name="name"]', rec.payload.name);
      setNativeField('textarea[name="description"]', rec.payload.description);
      status.textContent = "Details filled. Review the native form and press SpicyChat Save before importing entries.";
    });
    if (rec.payload.tags.length) makeButton("Add missing tags", async () => {
      const result = await applyNativeLorebookTags(rec.payload.tags);
      status.textContent = formatNativeTagResult(result);
    });
    if (rec.payload.image || rec.payload.imageData) makeButton("Use cover from JSON", async () => {
      const stage = await uploadPictureFromJson(rec.payload);
      status.textContent = `SpicyChat ${stage === 'crop-editor' ? 'opened its crop editor' : 'showed a new picture preview'}. Finish the upload and review it before saving.`;
    });
    const picture = document.createElement("input");picture.type="file";picture.accept="image/png,image/jpeg,image/webp";
    picture.setAttribute("aria-label","Replacement Lorebook cover");
    picture.addEventListener("change",()=>{
      try { putCloneCoverInNativeUploader(picture.files?.[0]); status.textContent="Picture handed to the native uploader. Check the preview before saving."; }
      catch(error){status.textContent=error.message;}
    });controls.append(picture);
    makeButton("Continue to entry import", () => {
      if (!confirm("Did you finish and save any intended name, tags or picture changes in SpicyChat? Entry import will not save those fields.")) return;
      location.href = `/lorebook/edit/${encodeURIComponent(info.id)}/entries`;
    });
    makeButton("Cancel merge", () => { clearMerge(); });
    panel.append(heading,status,controls);anchor.parentElement.insertBefore(panel,anchor);
    return true;
  }

  function formatNativeTagResult(result) {
    const parts = [`${result.added.length} tag${result.added.length === 1 ? '' : 's'} selected`];
    if (result.missing.length) parts.push(`not found: ${result.missing.join(', ')}`);
    if (result.unverified.length) parts.push(`needs checking: ${result.unverified.join(', ')}`);
    return `${parts.join(' · ')}. Review the tags before saving.`;
  }

  function offerMergeEntries(info) {
    const record = mergeRecord();
    if (!record || info?.page !== "entries" || info.id !== record.targetId || document.getElementById(MERGE_PANEL_ID)) return;
    const box = document.createElement("section");box.id=MERGE_PANEL_ID;
    box.style.cssText = "padding:9px;border:1px solid #8192ac;border-radius:8px;margin:9px 0;font:13px/1.5 system-ui";
    const status = document.createElement("span");
    status.textContent = `JSON merge ready: ${record.payload.entries.length} entries. Existing entries will be kept by default.`;
    const choice = document.createElement("select");
    choice.setAttribute("aria-label","How to handle existing Lorebook entries");
    for (const [id,label] of [['skip','Keep existing entries (recommended)'],['merge','Merge matching entries'],['replace','Replace matching entries']]) {
      const opt=document.createElement("option");opt.value=id;opt.textContent=label;choice.append(opt);
    }
    const proceed=document.createElement("button");proceed.type="button";proceed.textContent="Import JSON entries";
    proceed.addEventListener("click",async()=>{
      const policy=choice.value;
      if (!confirm(`Import ${record.payload.entries.length} entries using “${choice.selectedOptions[0].textContent}”?\n\n${policy === 'skip' ? 'Existing entries are left unchanged.' : 'Matching entries may be changed. QoL must prepare a verified fresh JSON backup before continuing.'}`))return;
      proceed.disabled=true;
      try {
        await verifyPrivateImportTarget(info.id);
        if (policy !== "skip") {
          if (typeof DS.getCurrentOwnLorebookBackupData !== "function") throw new Error("Live Lorebook backup reader is unavailable. Nothing changed.");
          status.textContent = "Checking current entries before allowing changes to matching names…";
          const original = await DS.getCurrentOwnLorebookBackupData(info.id);
          if (!original?.completeness?.entries || original.completeness.entryCountVerified !== true ||
              !Array.isArray(original.entries)) throw new Error("A complete current Lorebook backup could not be verified. Nothing changed.");
          const backup = await downloadJson({format:"spicychat-qol-lorebook-before-merge",version:2,
            exportedAt:new Date().toISOString(),source:"verified-before-json-merge",lorebook:original.lorebook,
            entries:original.entries,completeness:original.completeness},
            `${safeFilename(original.lorebook?.name || "lorebook")}-before-json-merge.json`);
          if (!backup?.ok) throw new Error("Could not start downloading the safety backup. Nothing changed.");
          if (!confirm("A fresh safety backup download was started. Verify the JSON file actually saved to your device before changing matching entries. Continue?")) {
            status.textContent = "Import paused. Your JSON merge is still queued.";
            proceed.disabled=false;
            return;
          }
        }
        const ok=await runLorebookImport(record.payload,info,{confirmed:true,duplicatePolicy:policy});
        if (ok) clearMerge();
        else {status.textContent="Some entries failed. This merge remains queued; retry only after checking the destination.";proceed.disabled=false;}
      }catch(error){status.textContent=error?.message||String(error);proceed.disabled=false;}
    });
    const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Discard merge";cancel.addEventListener("click",clearMerge);
    box.append(status,choice,proceed,cancel);
    document.getElementById(PANEL_ID)?.insertAdjacentElement("afterend",box);
  }

  function renderCloneImportButton() {
    if (normalizedPath() !== "/lorebook/create") return false;
    const queued = cloneRecord();
    if (queued && new URLSearchParams(location.search).get("dsQolLorebookClone") === queued.token) return false;
    if (document.getElementById(CLONE_PANEL_ID)) return true;
    const form = document.querySelector('input[name="name"]')?.closest("form");
    if (!form?.parentElement) return false;
    const panel = document.createElement("section");
    panel.id = CLONE_PANEL_ID;
    panel.style.cssText = "padding:10px;margin:10px 0;border:1px solid #8192ac;border-radius:8px;font:13px/1.5 system-ui";
    const description = document.createElement("span");
    description.textContent = "Start a new private Lorebook from a QoL JSON backup: ";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    const choose = document.createElement("button");
    choose.type = "button";
    choose.textContent = "Choose Lorebook JSON";
    choose.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files?.[0] || null;
      input.value = "";
      if (!file) return;
      try { await startPrivateCloneFromJson(file); }
      catch (error) { description.textContent = `JSON import failed: ${error.message} `; }
    });
    panel.append(description,choose,input);
    form.parentElement.insertBefore(panel,form);
    return true;
  }

  // Clone workflow only runs on the actual native Create Lorebook page. The
  // user must review and submit SpicyChat's form: no covert POST or overwrite.
  function renderPrivateClonePreparation() {
    if (normalizedPath() !== "/lorebook/create") return false;
    const record = cloneRecord();
    const token = new URLSearchParams(location.search).get("dsQolLorebookClone");
    if (!record || record.token !== token) return false;
    const target = document.querySelector('[data-field-name="name"] input[name="name"],input[name="name"]');
    const description = document.querySelector('[data-field-name="description"] textarea[name="description"],textarea[name="description"]');
    if (!target || !description) return false;
    const data = record.payload;
    if (cloneInitializedFor !== token) {
      setNativeField('input[name="name"]', data.name);
      setNativeField('textarea[name="description"]', data.description);
      const privateButton = document.querySelector('[data-testid="LorebookVisibilityField-PrivateButton"]');
      if (privateButton?.getAttribute("aria-pressed") !== "true") privateButton?.click();
      cloneInitializedFor = token;
    }
    if (document.getElementById(CLONE_PANEL_ID)) return true;
    const panel = document.createElement("section");
    panel.id = CLONE_PANEL_ID;
    panel.style.cssText = "padding:12px;margin:12px 0;border:1px solid #8192ac;border-radius:8px;background:rgba(40,70,110,.12);font:13px/1.5 system-ui";
    const heading = document.createElement("strong");
    heading.textContent = "QoL: Create a private copy from JSON";
    const info = document.createElement("p");
    info.textContent = `Name and description filled in. ${data.entries.length} entries are ready for the new private Lorebook. ` +
      (settings().lorebookJsonPrivateAutoCreate !== false ? "QoL will create it after your import approval; QoL will continue importing entries on the new page." : "Manual mode: review and save the native form yourself.") +
      (data.completeness?.entries !== true ? " This file is not verified to contain every original entry." : "");
    const tags = document.createElement("p");
    tags.textContent = data.tags.length ? `JSON tags: ${data.tags.join(", ")}. ${settings().lorebookJsonPrivateAutoCreate !== false ? "Included automatically in full private-copy mode." : "Select manually in SpicyChat."}` : "No tags in this backup.";
    const status = document.createElement("p");
    status.setAttribute('role','status');
    status.textContent = data.imageData ? "An embedded cover is available to upload through SpicyChat." :
      (data.image ? "QoL can try downloading the cover from an approved SpicyChat image host. Otherwise choose a local file." : "Optional: choose a cover picture below.");
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center";
    const imageInput = document.createElement("input");
    imageInput.type = "file";
    imageInput.accept = "image/png,image/jpeg,image/webp";
    imageInput.setAttribute("aria-label", "Lorebook cover image");
    imageInput.addEventListener("change", () => {
      const file=imageInput.files?.[0];
      if (!file) {
        status.textContent = "No picture selected.";
        return;
      }
      const overrideNote = settings().lorebookJsonPreferSelectedCover === true
        ? " This picture will replace the JSON cover when you create the Lorebook."
        : " This picture will replace the JSON cover when you create the Lorebook.";
      status.textContent = "Local picture selected. QoL can upload it using SpicyChat's signed-image API." + overrideNote;
    });
    controls.append(imageInput);
    const complete = document.createElement('button');
    complete.type='button'; complete.textContent='Create private copy';
    complete.addEventListener('click', async () => {
      complete.disabled=true;
      try { await createCompletePrivateClone(record,message=>{status.textContent=message;},imageInput.files?.[0]||null); }
      finally {complete.disabled=false;}
    });
    controls.append(complete);
    if (data.tags.length) {
      const applyTags = document.createElement("button");
      applyTags.type = "button";
      applyTags.textContent = "Select JSON tags in SpicyChat";
      applyTags.addEventListener("click", async () => {
        applyTags.disabled = true;
        try { status.textContent = formatNativeTagResult(await applyNativeLorebookTags(data.tags)); }
        catch(error) { status.textContent = error.message; }
        finally { applyTags.disabled = false; }
      });
      controls.append(applyTags);
    }
    if (data.image || data.imageData) {
      const fromBackup=document.createElement("button");fromBackup.type="button";
      fromBackup.textContent="Upload cover from JSON";
      fromBackup.addEventListener("click",async()=>{
        fromBackup.disabled=true;
        try {
          const stage=await uploadPictureFromJson(data);
          status.textContent=`SpicyChat ${stage==='crop-editor'?'opened its crop editor':'showed a new preview'}. Complete any native upload/crop and check the cover before saving.`;
        }catch(error){status.textContent=error.message;}
        finally{fromBackup.disabled=false;}
      });
      controls.append(fromBackup);
    }
    let tagCopyFallback = null;
    if (data.tags.length) {
      tagCopyFallback=document.createElement('textarea');
      tagCopyFallback.readOnly=true; tagCopyFallback.value=data.tags.join(', ');
      tagCopyFallback.setAttribute('aria-label','Select to copy Lorebook tags');
      tagCopyFallback.rows=2;
      tagCopyFallback.style.cssText='display:block;width:100%;box-sizing:border-box;margin-top:8px;color:inherit;background:transparent;border:1px solid #8192ac;border-radius:5px;padding:6px';
      const copyTags = document.createElement("button");
      copyTags.type = "button";
      copyTags.textContent = "Copy tags";
      copyTags.addEventListener("click", async () => {
        const copied = await copyImportTags(data.tags);
        if (!copied) tagCopyFallback.select();
        status.textContent = copied ? "Tag names copied. Select matching tags in SpicyChat as needed." :
          "Clipboard blocked. The tag list is selected below so you can copy it with Ctrl+C.";
      });
      controls.append(copyTags);
    }
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel JSON import";
    cancel.addEventListener("click", () => { clearClone(); });
    controls.append(cancel);
    const after = document.createElement("p");
    const autoCreateNeedsReview = settings().lorebookJsonPreferSelectedCover === true;
    after.textContent = settings().lorebookJsonPrivateAutoCreate !== false
      ? (autoCreateNeedsReview
          ? "QoL is waiting for you to choose a picture (or leave the original cover). When ready, press Create private copy."
          : "QoL creates one private copy, transfers the approved details and entries, and opens its Entries tab. If creation cannot be verified, check My Lorebooks before retrying.")
      : "Manual mode: review the tags, cover and visibility, create the Lorebook using SpicyChat, then continue with the queued entry import.";
    panel.append(heading,info,tags,status,controls,after);
    if (tagCopyFallback) panel.insertBefore(tagCopyFallback, controls);
    if (settings().lorebookJsonPrivateAutoCreate !== false &&
        settings().lorebookJsonPreferSelectedCover !== true) {
      complete.textContent = 'Creating complete private copy…';
      complete.disabled = true;
      queueMicrotask(async () => {
        try { await createCompletePrivateClone(record,message=>{status.textContent=message;}); }
        finally {complete.disabled=false;complete.textContent='Create private copy';}
      });
    }
    const form = target.closest("form") || description.closest("form");
    if (form?.parentElement) form.parentElement.insertBefore(panel, form);
    else target.parentElement?.append(panel);
    return true;
  }

  async function startPrivateCloneFromJson(file) {
    const payload = parseLorebookImportPayload(await readJsonFile(file));
    if (!confirm(`Create a NEW private Lorebook from “${payload.name}” with ${payload.entries.length} entries?\n\n${settings().lorebookJsonPrivateAutoCreate !== false ? "QoL will create the private copy with its original tags and cover using SpicyChat's authenticated API, then import its entries after verifying the destination." : "QoL will fill the native form for your review; you choose the final Save/Create action."} Your existing Lorebooks won't be changed.${payload.completeness?.entries !== true ? "\n\nThis backup has not been verified as complete; some entries might be missing." : ""}`)) return false;
    if (settings().lorebookJsonPrivateAutoCreate !== false && payload.entries.some(entry =>
      entry.name.length > 50 || entry.content.length > 2000 || entry.keywords.length > 12 ||
      entry.keywords.some(k => k.length > 80))) {
      throw Error('One or more entries exceed SpicyChat’s native entry limits (50-character name, 2,000-character content, 12 keywords). No Lorebook was created.');
    }
    const token = createCloneToken();
    const record = { version: 1, token, startedAt: Date.now(), payload };
    if (payload.name.length > 25 || payload.description.length > 100) {
      throw Error('Lorebook name must be at most 25 characters and description at most 100 characters.');
    }
    try { sessionStorage.setItem(CLONE_KEY, JSON.stringify(record)); }
    catch { throw new Error("This Lorebook JSON is too large for the temporary browser session. No changes were made."); }
    // Explicit user-approved, short-lived write grant. Never include image
    // bytes or account tokens in extension storage.
    const expectedEntryHashes=await Promise.all(payload.entries.map(hashApprovedEntry));
    await putCloneGrant(token,{token,createdAt:Date.now(),status:'ready',
      name:payload.name,description:payload.description,tags:settings().lorebookJsonCopyTags===false?[]:payload.tags,
      expectedEntryHashes,entryProgress:{}});
    location.href = `/lorebook/create?dsQolLorebookClone=${encodeURIComponent(token)}`;
    return true;
  }

  function markNativeCloneSubmit(event) {
    const record = cloneRecord();
    if (!record || normalizedPath() !== "/lorebook/create" ||
        new URLSearchParams(location.search).get("dsQolLorebookClone") !== record.token) return;
    const button = event.target?.closest?.("button");
    const form = document.querySelector('input[name="name"]')?.closest("form");
    // SpicyChat's Create and Continue button is type="button" (React handles
    // submission). Its stable test ID is the reliable signal, not type=submit.
    if (!button || !form?.contains(button) ||
        (button.type !== "submit" && button.getAttribute("data-testid") !== "LorebookForm-DetailsTabSubmitButton")) return;
    if (document.querySelector('[data-testid="LorebookVisibilityField-PrivateButton"]')?.getAttribute("aria-pressed") !== "true") return;
    if (clean(form.querySelector('input[name="name"]')?.value,500) !== record.payload.name) return;
    try { sessionStorage.setItem(CLONE_KEY, JSON.stringify({...record, submittedAt: Date.now()})); }
    catch {}
  }
  document.addEventListener("click", markNativeCloneSubmit, true);

  function approvedEntry(entry) {
    return {name:String(entry?.name||'').trim(),content:String(entry?.content||'').trim(),
      keywords:Array.isArray(entry?.keywords)?entry.keywords.map(v=>String(v).trim()):[]};
  }
  async function hashApprovedEntry(entry) {
    const data=new TextEncoder().encode(JSON.stringify(approvedEntry(entry)));
    const hash=await crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function importVerifiedCloneEntries(record,info,report,{allowRecovery=false}={}) {
    if(cloneEntriesAutoRunning)return false;
    cloneEntriesAutoRunning=true;
    try {
      if(routeInfo()?.id!==info.id||info.page!=='entries'||record.targetId!==info.id)
        throw Error('Import destination changed. No entries sent.');
      const api=DS.privateLorebookAuth?.request;
      if(typeof api!=='function')throw Error('Private Lorebook authentication is not ready. Nothing imported.');
      const me=await api('/v2/users');
      const book=await api(`/lorebooks/${info.id}?sortBy=priority&lastSortPriority=0`);
      if(!me?.user?.id||book?.id?.toLowerCase()!==info.id.toLowerCase()||book.creator_user_id!==me.user.id||
        book.visibility!=='private'||book.name!==record.payload.name)throw Error('Destination ownership or name could not be verified.');
      let grant=await getCloneGrant(record.token);
      if(grant?.token!==record.token||grant?.status!=='complete'||grant?.lorebookId!==info.id){
        if(!allowRecovery || Date.now()-Number(record.submittedAt||0)>7*24*60*60*1000)
          throw Error('No matching creation record is available. Use Import into this Lorebook to approve recovery.');
        // User explicitly approved recovery on this verified private destination.
        // It cannot touch the source Lorebook or any other owned Lorebook.
        grant={token:record.token,createdAt:Date.now(),status:'complete',lorebookId:info.id,
          name:record.payload.name,description:record.payload.description,tags:record.payload.tags,
          expectedEntryHashes:await Promise.all(record.payload.entries.map(hashApprovedEntry)),entryProgress:{}};
        await putCloneGrant(record.token,grant);
      }
      if(!Array.isArray(grant.expectedEntryHashes) || Date.now()-Number(grant.createdAt)>=60*60*1000){
        // An expired or pre-fix permission can only be renewed by the user,
        // and only for this verified private target. Preserve uncertain POSTs.
        if(!allowRecovery)throw Error('Import permission expired. Use Import into this Lorebook to approve recovery.');
        grant={...grant,createdAt:Date.now(),
          expectedEntryHashes:grant.expectedEntryHashes||await Promise.all(record.payload.entries.map(hashApprovedEntry)),
          entryProgress:grant.entryProgress||{}};
        await putCloneGrant(record.token,grant);
      }
      for(let i=0;i<record.payload.entries.length;i++){
        if(routeInfo()?.id!==info.id)throw Error('Left the Lorebook during import.');
        const entry=approvedEntry(record.payload.entries[i]);
        if(!entry.name||entry.name.length>50||!entry.content||entry.content.length>2000||entry.keywords.length>12||
          entry.keywords.some(k=>!k||k.length>80))throw Error(`Entry ${i+1} exceeds SpicyChat's entry limits; import stopped safely.`);
        report(`Importing entries ${i+1}/${record.payload.entries.length}: ${entry.name}`);
        // The background writer verifies the approved entry digest, private
        // owner, complete current list and the saved POST response.
        const savedEntry=await api(`/lorebooks/${info.id}/entries`,'POST',entry);
        if(savedEntry?.verified!==true)throw Error('SpicyChat did not confirm the saved entry. Import paused for review.');
      }
      report(`Import complete: ${record.payload.entries.length} entries verified. Refreshing the page so SpicyChat shows the updated entries…`);
      clearClone();
      await cloneStorage.remove(cloneGrantKey(record.token));
      setTimeout(() => {
        try {
          if (routeInfo()?.id === info.id && routeInfo()?.page === 'entries' &&
              !document.querySelector('[role="dialog"][open], [data-state="open"][role="dialog"]') &&
              !document.querySelector('form input:focus, form textarea:focus, [contenteditable="true"]:focus')) {
            location.reload();
          }
        } catch {}
      }, 900);
      return true;
    } finally {cloneEntriesAutoRunning=false;}
  }
  function offerCloneEntries(info) {
    const record = cloneRecord();
    if (!record || info?.page !== "entries" || !UUID_RE.test(info.id)) return;
    if (!record.submittedAt || Date.now() - Number(record.submittedAt) > 7 * 24 * 60 * 60_000) return;
    if (record.targetId && record.targetId !== info.id) return;
    const payload = record.payload;
    if (payload.sourceId && payload.sourceId.toLowerCase() === info.id.toLowerCase()) return;
    if (document.getElementById(CLONE_PANEL_ID)) return;
    const banner = document.createElement("section");
    banner.id = CLONE_PANEL_ID;
    banner.style.cssText = "padding:9px;border:1px solid #8192ac;border-radius:8px;margin:9px 0;font:13px/1.5 system-ui";
    const title = document.createElement("span");
    title.textContent = `JSON import ready: ${payload.entries.length} entries for “${payload.name}”. Only continue if this is the NEW Lorebook you just created.`;
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Import into this Lorebook";
    add.style.margin = "0 8px";
    add.addEventListener("click", async () => {
      if (!confirm(`Import ${payload.entries.length} entries into this Lorebook? Existing entries with matching names will be skipped.`)) return;
      add.disabled = true;
      try {
        // Verify the freshly created target through its owner-scoped editor.
        // The user still chooses the destination; never import into the source.
        if (routeInfo()?.id !== info.id || !document.querySelector('[data-testid="EntriesListServer-Header"]')) throw new Error("Lorebook page changed.");
        const api = DS.privateLorebookAuth?.request;
        if (typeof api !== "function") throw new Error("Cannot verify the private Lorebook owner. No entries imported.");
        const account = await api("/v2/users");
        const owner = String(account?.user?.id || "");
        const book = await api(`/lorebooks/${info.id}?sortBy=priority&lastSortPriority=0`);
        if (!owner || String(book?.id || "").toLowerCase() !== info.id.toLowerCase() ||
            book?.creator_user_id !== owner || book?.visibility !== "private" ||
            clean(book?.name, 500) !== payload.name) {
          throw new Error("The new Lorebook isn't verified private, owned and named as expected. No entries imported.");
        }
        if (!record.targetId) {
          // Bind a verified target on first import. Never import this queued
          // clone into another Lorebook after a failed or interrupted run.
          sessionStorage.setItem(CLONE_KEY, JSON.stringify({...record, targetId: info.id}));
        }
        const grant=await getCloneGrant(record.token);
        if(record.targetId===info.id || (grant?.token===record.token&&grant?.status==='complete')) {
          await importVerifiedCloneEntries({...record,targetId:info.id},info,msg=>{title.textContent=msg;},{allowRecovery:true});
        } else if (await runLorebookImport(payload, info, { confirmed: true })) clearClone();
        else { title.textContent = "Some entries could not be imported; the JSON remains queued for review."; add.disabled = false; }
      } catch(error) { title.textContent = `Import stopped: ${error.message}. The JSON is still queued.`; add.disabled = false; }
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Discard queued import";
    cancel.addEventListener("click", clearClone);
    banner.append(title, add, cancel);
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.insertAdjacentElement("afterend", banner);
    if (settings().lorebookJsonAutoImportEntries !== false && record.targetId===info.id && !cloneEntriesAutoRunning) {
      add.disabled=true;
      queueMicrotask(async()=>{
        try {
          const grant=await getCloneGrant(record.token);
          if(grant?.token===record.token&&grant?.status==='complete' && Date.now()-Number(grant.createdAt)<60*60*1000) {
            title.textContent='Continuing the approved JSON import automatically…';
            await importVerifiedCloneEntries(record,info,msg=>{title.textContent=msg;});
          } else {title.textContent='The private copy is ready, but automatic entry permission expired or belongs to another job. Use Import into this Lorebook to approve recovery without creating a second Lorebook.';}
        } catch(e){title.textContent='Automatic entry import paused: '+String(e?.message||e)+'. Your JSON is still queued; no second Lorebook will be created.';}
        finally{add.disabled=false;}
      });
    }
  }

  function readJsonFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No Lorebook file was selected."));
      if (file.size > 8 * 1024 * 1024) return reject(new Error("Lorebook JSON exceeds 8 MB. Please split the entries or export a smaller copy."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The Lorebook file could not be read."));
      reader.onload = () => {
        try { resolve(JSON.parse(String(reader.result || ""))); }
        catch { reject(new Error("That file is not valid JSON.")); }
      };
      reader.readAsText(file);
    });
  }

  async function runLorebookImport(payload, info, { confirmed = false, duplicatePolicy = "skip" } = {}) {
    if (importRunning) return false;
    if (info?.page !== "entries") throw new Error("Open the Lorebook Entries tab before importing.");
    if (typeof DS.importLorebookEntryBatch !== "function") throw new Error("The Lorebook entry importer is not available on this page.");
    const count = payload.entries.length;
    const sourceName = payload.name || "this Lorebook";
    if (!confirmed && !confirm(`Import ${count} entr${count === 1 ? "y" : "ies"} from “${sourceName}” into this Lorebook?\n\nOnly the entries will be imported here. For a complete NEW Lorebook with details and cover, use “Create private copy”. Existing entries with the same name will be skipped.`)) {
      setStatus("Lorebook import cancelled.");
      return false;
    }

    if (!count) { setStatus("This file has no entries; nothing to import into this Lorebook."); return true; }
    importRunning = true;
    let cancelImportButton = document.getElementById("ds-lorebook-cancel-import");
    if (!cancelImportButton) {
      cancelImportButton = document.createElement("button");
      cancelImportButton.id = "ds-lorebook-cancel-import";
      cancelImportButton.type = "button";
      cancelImportButton.textContent = "Stop after current entry";
      cancelImportButton.title = "Stops before the next entry; an in-flight native save is allowed to finish.";
      cancelImportButton.addEventListener("click", () => {
        if (DS.cancelLorebookEntryImport?.()) {
          cancelImportButton.disabled = true;
          setStatus("Stopping import after the current entry…");
        }
      });
      document.querySelector(`#${PANEL_ID} .ds-lorebook-backup-actions`)?.appendChild(cancelImportButton);
    }
    try {
      setStatus(`Importing 0 / ${count} entries…`);
      const result = await DS.importLorebookEntryBatch(payload.entries, {
        duplicatePolicy: ["skip","merge","replace"].includes(duplicatePolicy) ? duplicatePolicy : "skip",
        onProgress(progress) {
          if (progress.stopped) {
            setStatus(progress.stopReason || "Import stopped. Confirm the last entry before resuming.");
          } else {
            setStatus(`Importing ${progress.completed} / ${progress.total} entries…`);
          }
        }
      });
      await saveCapture("Imported Lorebook JSON").catch(() => false);
      const parts = [];
      if (result.created) parts.push(`${result.created} added`);
      if (result.skipped) parts.push(`${result.skipped} already existed`);
      if (result.failed) parts.push(`${result.failed} failed`);
      if (result.replaced) parts.push(`${result.replaced} replaced`);
      if (result.merged) parts.push(`${result.merged} merged`);
      if (result.paused || result.cancelled) {
        setStatus(`${result.stopReason || "Import stopped."} ${result.completed}/${count} completed. Re-import with Skip existing to review and continue; uncertain writes must not be blindly retried.`);
      } else {
        setStatus(`Import finished: ${parts.join(" · ") || "no changes"}.`);
      }
      if (!result.paused && !result.cancelled && !result.failed && Number(result.created || result.replaced || result.merged || 0) > 0) {
        setStatus(`Import finished: ${parts.join(" · ")}. Refreshing the entries list…`);
        setTimeout(() => {
          try {
            if (routeInfo()?.id === info.id && routeInfo()?.page === 'entries' &&
                !document.querySelector('[role="dialog"][open], [data-state="open"][role="dialog"]') &&
                !document.querySelector('form input:focus, form textarea:focus, [contenteditable="true"]:focus')) {
              location.reload();
            }
          } catch {}
        }, 900);
      } else {
        setTimeout(() => refreshPanelStatus().catch(() => {}), 3500);
      }
      return !result.failed && !result.paused && !result.cancelled;
    } finally {
      document.getElementById("ds-lorebook-cancel-import")?.remove();
      importRunning = false;
    }
  }

  function storePendingLorebookImport(payload, info) {
    const record = {
      version: 1,
      targetId: info.id,
      queuedAt: Date.now(),
      payload
    };
    try { sessionStorage.setItem(IMPORT_SESSION_KEY, JSON.stringify(record)); }
    catch { throw new Error("The Lorebook import is too large to carry to the Entries tab in this browser session."); }
  }

  async function handleLorebookImportFile(file) {
    const info = routeInfo();
    if (!info?.id) throw new Error("Open a Lorebook editor before importing.");
    const payload = parseLorebookImportPayload(await readJsonFile(file));
    if (info.page === "entries") return runLorebookImport(payload, info);
    storePendingLorebookImport(payload, info);
    setStatus(`Loaded ${payload.entries.length} entries. Opening the Entries tab…`);
    location.href = `/lorebook/edit/${encodeURIComponent(info.id)}/entries`;
    return true;
  }

  function offerQueuedEntryImport(info) {
    if (importRunning || info?.page !== "entries" || !info?.id) return;
    let record = null;
    try { record = JSON.parse(sessionStorage.getItem(IMPORT_SESSION_KEY) || "null"); } catch {}
    if (!record || record.targetId !== info.id || !record.payload) return;
    if (Date.now() - Number(record.queuedAt || 0) > 15 * 60_000) {
      try { sessionStorage.removeItem(IMPORT_SESSION_KEY); } catch {}
      return;
    }
    if (document.getElementById("ds-qol-lorebook-entries-only-pending")) return;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const banner = document.createElement("section");
    banner.id = "ds-qol-lorebook-entries-only-pending";
    banner.style.cssText = "padding:9px;border:1px solid #8192ac;border-radius:8px;margin:9px 0;font:13px/1.5 system-ui";
    const msg = document.createElement("span");
    msg.textContent = `Entries-only import ready: ${record.payload.entries.length} entries. Existing names will be skipped.`;
    const start = document.createElement("button");start.type="button";start.textContent="Import entries";
    start.addEventListener("click",async()=>{
      start.disabled=true;
      try {
        if (routeInfo()?.id !== record.targetId) throw new Error("Destination Lorebook changed.");
        const ok = await runLorebookImport(record.payload, info);
        if (ok) {sessionStorage.removeItem(IMPORT_SESSION_KEY);banner.remove();}
        else {msg.textContent="Import not completed. Check existing entries before trying again.";start.disabled=false;}
      } catch(error) { msg.textContent=`Import stopped: ${error?.message||String(error)}. JSON is still queued.`;start.disabled=false; }
    });
    const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Discard";
    cancel.addEventListener("click",()=>{sessionStorage.removeItem(IMPORT_SESSION_KEY);banner.remove();});
    banner.append(msg,start,cancel);panel.insertAdjacentElement("afterend",banner);
  }

  async function downloadSavedCopy() {
    const info = routeInfo();
    if (!info?.id) return false;
    const stored = await DS.storageGet?.([KEY]) || {};
    const item = normalizeStore(stored[KEY]).meta[info.id];
    if (!item) throw new Error("There is no saved local copy yet. Use Save backup now or try the live download.");
    const entries = Object.values(item.entries || {});
    const fullySaved = item.lastFullBackupValid === true && item.lastFullBackupCount === entries.length;
    const response = await downloadJson({
      format: "spicychat-qol-lorebook-backup", version: 2,
      exportedAt: new Date().toISOString(), source: "last-local-copy",
      completeness: { details: fullySaved, entries: fullySaved, keywords: entries.every(entry => entry.keywordsComplete), entryCountVerified: fullySaved, liveVerified: false },
      warning: fullySaved
        ? "This complete local copy was verified when saved, but is not a fresh live export."
        : "This local copy may be incomplete or changed since the last verified full backup.",
      lorebook: item
    }, `${safeFilename(item.name)}-last-saved-lorebook.json`);
    if (!response?.ok) throw new Error(response?.error || "Could not start the saved-copy download.");
    setStatus("Saved local copy download started (not verified current). No helper tab needed.");
    return true;
  }

  // Best-effort self-contained cover from an approved first-party image host.
  // No cookies, Authorization header, private redirects or remote URL imports.
  let lastCoverError = "";
  function imageDataFromBackground(raw) {
    return new Promise(resolve => {
      try {
        if (!chrome?.runtime?.sendMessage) {
          lastCoverError = 'Background cover reader unavailable (extension worker not running).';
          return resolve('');
        }
        let finished = false;
        const timer = setTimeout(() => {
          if (finished) return;
          finished = true;
          lastCoverError = 'Background cover reader timed out.';
          resolve('');
        }, 20500);
        chrome.runtime.sendMessage({type:'DS_LOREBOOK_COVER_FETCH',url:raw},response => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          const runtimeError = chrome.runtime.lastError;
          const data = typeof response?.dataUrl === 'string' ? response.dataUrl : '';
          const valid = response?.ok && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(data)
            && data.length <= 3*1024*1024;
          if (!valid) lastCoverError = runtimeError ? 'Background cover reader could not be reached.' :
            String(response?.error || 'Background cover reader returned no valid image.').slice(0,240);
          else lastCoverError = '';
          resolve(valid ? data : '');
        });
      } catch { lastCoverError = 'Background cover reader failed to start.'; resolve(''); }
    });
  }

  async function imageDataForBackup(rawUrl) {
    lastCoverError = '';
    if (!rawUrl) return '';
    if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(rawUrl) && rawUrl.length <= 3 * 1024 * 1024) return rawUrl;
    let url;
    try {
      const normalized = String(rawUrl).trim();
      url = /^\/?avatars\/[a-zA-Z0-9._/-]{1,250}\.(?:png|jpe?g|webp)$/i.test(normalized) && !normalized.includes('..')
        ? new URL(normalized.replace(/^\//, ''), 'https://cdn.nd-api.com/')
        : new URL(normalized, location.origin);
    } catch { lastCoverError = 'Unrecognized cover reference.'; return ''; }
    const allowedHosts = new Set(['spicychat.ai', 'www.spicychat.ai', 'cdn.nd-api.com']);
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.username || url.password || url.port ||
        (url.search && url.search !== '?class=avatar256x256') || url.hash ||
        !/^\/avatars\/[a-zA-Z0-9._/-]{1,250}\.(?:png|jpe?g|webp)$/i.test(url.pathname) || url.pathname.includes('..')) {
      lastCoverError = 'Cover reference is not an approved SpicyChat avatar URL.';
      return '';
    }
    // The browser extension can read CDN files when page CORS blocks fetch.
    // Android's injected QoL runtime may not have chrome.runtime, so retain a
    // bounded page-fetch fallback rather than regressing those installations.
    const workerCopy = await imageDataFromBackground(url.href);
    if (workerCopy) return workerCopy;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);
    try {
      const pageUrl = new URL(url.href);
      const candidates = [pageUrl];
      if (!pageUrl.search) {
        const thumbnail = new URL(pageUrl.href);
        thumbnail.search = '?class=avatar256x256';
        candidates.push(thumbnail);
      }
      for (const candidate of candidates) {
        try {
          const response = await fetch(candidate.href, {
            method:'GET', credentials:'omit', mode:'cors', redirect:'error', signal:controller.signal
          });
          if (!response.ok || response.url && response.url !== candidate.href) continue;
          const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (!['image/png','image/jpeg','image/webp'].includes(type)) continue;
          if (Number(response.headers.get('content-length') || 0) > 2 * 1024 * 1024) continue;
          if (!response.body?.getReader) continue;
          const reader = response.body.getReader(), chunks = [];
          let bytesRead = 0, excess = false;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytesRead += value.byteLength;
            if (bytesRead > 2 * 1024 * 1024) { excess = true; await reader.cancel().catch(() => {}); break; }
            chunks.push(value);
          }
          if (excess || !bytesRead) continue;
          const bytes = new Uint8Array(bytesRead);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          const png = type === 'image/png' && bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value);
          const jpeg = type === 'image/jpeg' && bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
          const webp = type === 'image/webp' && bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0,4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8,12)) === 'WEBP';
          if (!png && !jpeg && !webp) continue;
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x6000) binary += String.fromCharCode(...bytes.subarray(i,i+0x6000));
          lastCoverError = '';
          return `data:${type};base64,${btoa(binary)}`;
        } catch { /* Page CORS may deny the CDN; the worker diagnostic remains. */ }
      }
    } catch { /* Keep the worker failure reason for the UI. */ }
    finally { clearTimeout(timer); }
    return '';
  }

  async function exportCurrent() {
    const info = routeInfo();
    if (!info?.id) return false;
    const op = DS.diagOperationStart?.("lorebook-backup", "export", { lorebookId: info.id, page: info.page });
    DS.diagUserAction?.("lorebook-backup", "export-json", { page: info.page });
    setStatus("Fetching the current Lorebook from SpicyChat…");
    try {
      if (typeof DS.getCurrentOwnLorebookBackupData !== "function") throw new Error("Live Lorebook reader is unavailable.");
      const maxWaitMs = 90_000;
      let timeout;
      const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("The current Lorebook couldn't be verified within 90 seconds. Try again later or use the last saved local copy.")), maxWaitMs);
      });
      let full;
      try { full = await Promise.race([DS.getCurrentOwnLorebookBackupData(info.id), timeoutPromise]); }
      finally { clearTimeout(timeout); }
      if (!full?.lorebook || full?.completeness?.details !== true || full?.completeness?.entries !== true ||
          full?.completeness?.entryCountVerified !== true || !Array.isArray(full.entries)) {
        throw new Error("SpicyChat did not confirm a complete current entry list. Use the last saved copy if needed.");
      }
      if (String(full.lorebook.id || "").toLowerCase() !== info.id.toLowerCase()) {
        throw new Error("The live response belongs to a different Lorebook. No file was exported.");
      }
      const expected = Number(full.lorebook.entryCount);
      if (Number.isSafeInteger(expected) && expected >= 0 && expected !== full.entries.length) {
        throw new Error(`Only ${full.entries.length} / ${expected} entries returned; refusing an incomplete export.`);
      }
      // The live API may omit its total or report only the first page. When
      // we're on this Lorebook's Entries editor, cross-check the native count.
      const displayedTotal = routeInfo()?.id === info.id && routeInfo()?.page === "entries"
        ? nativeLorebookEntryCount() : null;
      if (displayedTotal !== null && displayedTotal !== full.entries.length) {
        throw new Error(`SpicyChat shows ${displayedTotal} entries but the export contains ${full.entries.length}. No incomplete JSON was downloaded.`);
      }
      const item = {
        ...full.lorebook,
        image: full.lorebook.image || full.lorebook.avatar_url || "",
        entries: full.entries
      };
      setStatus("Verifying Lorebook cover picture (if available)…");
      const imageData = await imageDataForBackup(item.image || "");
      const download = await downloadJson({
        format: "spicychat-qol-lorebook-backup", version: 2,
        exportedAt: new Date().toISOString(), source: full.source || "current-live",
        completeness: { ...full.completeness, liveVerified: true, imageEmbedded: !!imageData },
        lorebook: item, entries: full.entries,
        ...(imageData ? { imageData } : {})
      }, `${safeFilename(item.name)}-lorebook-backup.json`);
      if (!download?.ok) throw new Error(download?.error || "Couldn't hand the Lorebook JSON to browser downloads.");
      setStatus(`Current Lorebook JSON download started (${full.entries.length} verified entries). ${imageData ? "The picture is embedded." : `Picture reference saved, but no image bytes: ${lastCoverError || "unavailable"} You can select the original picture file when importing.`}`);
      DS.diagOperationEnd?.(op, { outcome: "ok", entryCount: full.entries.length });
      return true;
    } catch (error) {
      DS.diagOperationEnd?.(op, { outcome: "failed" });
      setStatus(`Live download failed: ${error?.message || String(error)} You can download the last saved copy separately.`);
      throw error;
    }
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
    const nativeCount = info.page === "entries" ? nativeLorebookEntryCount() : null;
    const verified = item?.lastFullBackupValid === true && item.lastFullBackupCount === entryCount;
    const entryLabel = verified
      ? `${entryCount} entries saved locally (full copy verified ${relativeAge(item.lastFullBackupAt)})`
      : Number.isSafeInteger(nativeCount) && nativeCount > entryCount
        ? `${entryCount}/${nativeCount} entries saved locally (partial snapshot)`
        : `${entryCount} entr${entryCount === 1 ? "y" : "ies"} saved locally (not verified complete)`;
    setStatus([
      `Automatic backup: ${automatic ? "On" : "Off"}`,
      `Last backup: ${relativeAge(item?.lastSavedAt)}`,
      entryLabel
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
    save.title = "Save a verified local copy of the current Lorebook, including its details and ALL entries. Loads additional batches as needed.";
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await saveCompleteLorebookNow("Manual Lorebook backup");
      } catch (error) {
        console.error("[SpicyChat QoL] Full Lorebook save failed", error);
        // saveCompleteLorebookNow shows the detailed error in the panel.
      } finally {
        save.disabled = false;
      }
    });
    const exp = document.createElement("button");
    exp.type = "button";
    exp.textContent = "Download Lorebook (.json)";
    exp.addEventListener("click", async () => {
      exp.disabled = true;
      try {
        // Request the optional downloads permission before the long Lorebook
        // crawl consumes the original click. This makes Firefox/Opera exports
        // use the reliable extension download manager when permission is given.
        try { await DS.requestDownloadPermission?.(); } catch {}
        const ok = await exportCurrent();
        if (!ok) setStatus("No Lorebook backup was available yet.");
      } catch (error) {
        console.error("[SpicyChat QoL] Full Lorebook export failed", error);
        setStatus(`Export failed: ${error?.message || String(error)}`);
      } finally {
        exp.disabled = false;
      }
    });
    const info = routeInfo();
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json,application/json";
    importInput.hidden = true;
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0] || null;
      importInput.value = "";
      if (!file) return;
      try {
        setStatus("Reading Lorebook JSON…");
        await handleLorebookImportFile(file);
      } catch (error) {
        console.error("[SpicyChat QoL] Lorebook JSON import failed", error);
        setStatus(`Import failed: ${error?.message || String(error)}`);
      }
    });
    const imp = document.createElement("button");
    imp.type = "button";
    imp.textContent = "Import entries (.json)";
    imp.addEventListener("click", () => importInput.click());

    const history = document.createElement("button");
    history.type = "button";
    history.textContent = "History";
    history.addEventListener("click", () => openBackupHistory(info));
    const saved = document.createElement("button");
    saved.type = "button";
    saved.textContent = "Download last saved copy";
    saved.addEventListener("click", async () => {
      saved.disabled = true;
      try { await downloadSavedCopy(); }
      catch(error) { setStatus(`Saved-copy download failed: ${error.message}`); }
      finally { saved.disabled = false; }
    });
    const cloneInput = document.createElement("input");
    cloneInput.type = "file";
    cloneInput.accept = ".json,application/json";
    cloneInput.hidden = true;
    cloneInput.addEventListener("change", async () => {
      const file = cloneInput.files?.[0] || null;
      cloneInput.value = "";
      if (!file) return;
      try { await startPrivateCloneFromJson(file); }
      catch (error) { setStatus(`Could not prepare private copy: ${error.message}`); }
    });
    const mergeInput = document.createElement("input");
    mergeInput.type="file";mergeInput.accept=".json,application/json";mergeInput.hidden=true;
    mergeInput.addEventListener("change",async()=>{
      const file=mergeInput.files?.[0]||null;mergeInput.value="";if(!file)return;
      try{await startExistingLorebookMerge(file);}
      catch(error){setStatus(`JSON merge failed: ${error?.message||String(error)}`);}
    });
    const merge=document.createElement("button");merge.type="button";merge.textContent="Merge full JSON into this Lorebook";
    merge.title="For your own private Lorebook: choose name/description, tags, cover and entry merging separately";
    merge.addEventListener("click",()=>mergeInput.click());
    const clone = document.createElement("button");
    clone.type = "button";
    clone.textContent = "Create private copy (.json)";
    clone.title = "Create a new Lorebook from JSON; review name, tags, cover and visibility in SpicyChat before saving";
    clone.addEventListener("click", () => cloneInput.click());
    actions.append(save, exp, saved, imp, merge, clone, history);
    panel.append(copy, actions, importInput, cloneInput, mergeInput);

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

  function scheduleSave(delayMs = 2000) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      // A native editor save may still be settling; perform the low-priority
      // capture only when the browser is idle rather than during React remount.
      const resume = () => {
        if (!routeInfo() || !settings().enabled || !settings().lorebookBackupsEnabled) return;
        saveCapture("Lorebook editor idle backup").catch(() => {});
      };
      if (typeof requestIdleCallback === "function") requestIdleCallback(resume, { timeout: 1600 });
      else setTimeout(resume, 0);
    }, Math.max(600, Number(delayMs) || 2000));
  }

  function onInput(event) {
    if (!document.getElementById(PANEL_ID)) return;
    if (event.target?.closest?.(`#${PANEL_ID},#ds-qol-panel`)) return;
    if (!event.target?.closest?.("input,textarea,[contenteditable='true']")) return;
    scheduleSave();
  }

  function onClick(event) {
    if (event.target?.closest?.(`#${PANEL_ID},#ds-qol-panel`)) return;
    const button = event.target?.closest?.("button");
    if (!button) return;

    // The entry modal disappears immediately after Update. Capture it during
    // the click's capture phase so complete keyword data is not lost before
    // SpicyChat rerenders the list back to its collapsed 3 +N view.
    const action = clean(button.getAttribute("aria-label") || button.textContent, 40);
    const isSave = /^(update|create|save|add)$/i.test(action);
    // SpicyChat's entry Update button is in a portal at document.body, not
    // always inside a form or [role=dialog]. Confirm the actual open entry.
    const isEntrySave = isSave && !!captureOpenEntry();
    const isDetailsSave = isSave && !!button.closest("form") && routeInfo()?.page === "details";
    if (!isEntrySave && !isDetailsSave) return;
    // Capture synchronously at click time: the open entry may unmount before
    // the backup timer runs. The queued write remains serialized/deduplicated.
    saveCapture("Lorebook entry saved").catch(() => {});
    scheduleSave(2600);
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
    if (normalizedPath() === "/lorebook/create") {
      if (settings().enabled && settings().lorebookBackupToolsEnabled) {
        if (!renderPrivateClonePreparation()) renderCloneImportButton();
      }
      return;
    }
    const info = routeInfo();
    const cfg = settings();
    const shouldShow = !!(cfg.enabled && cfg.lorebookBackupToolsEnabled && info);
    if (!shouldShow) {
      if (DS.state.lorebookBackupWasActive || document.getElementById(PANEL_ID)) cleanup();
      return;
    }
    DS.state.lorebookBackupWasActive = true;
    maybeRunExportHelper(info).catch(() => {});

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
    if (info.page === "details") renderExistingLorebookMerge(info);
    if (info.page === "entries") {
      offerQueuedEntryImport(info);
      offerCloneEntries(info);
      offerMergeEntries(info);
    }
    if (lastPanelAutoState !== !!cfg.lorebookBackupsEnabled) refreshPanelStatus().catch(() => {});
  };

  DS.saveLorebookBackupNow = (reason = "Manual Lorebook backup") => saveCompleteLorebookNow(reason);
  DS.removeLorebookBackup = cleanup;
})();

}
