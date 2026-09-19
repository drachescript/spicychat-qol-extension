(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  let bulkMode = false;
  let selectedKeys = new Set();
  let folderFilter = "all";

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    return [...new Set((values || []).map(clean).filter(Boolean))];
  }

  function normalizeConversationKey(href) {
    try {
      const url = new URL(href, location.origin);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      if (!/^\/chat\/[^/]+/i.test(path)) return "";
      return path;
    } catch {
      return "";
    }
  }

  function normalizeStore(value) {
    const source = value && typeof value === "object" ? value : {};
    const meta = source.meta && typeof source.meta === "object" ? source.meta : {};
    const output = {};

    for (const [rawKey, raw] of Object.entries(meta)) {
      const key = clean(rawKey);
      if (!key || !raw || typeof raw !== "object") continue;
      const collections = unique(raw.collections);
      if (!collections.length) continue;
      output[key] = {
        key,
        title: clean(raw.title),
        url: clean(raw.url),
        botId: clean(raw.botId),
        collections,
        updatedAt: Number(raw.updatedAt) || 0
      };
    }

    return { meta: output };
  }

  function store() {
    DS.state.chatOrganization = normalizeStore(DS.state.chatOrganization);
    return DS.state.chatOrganization;
  }

  async function saveStore(next = store()) {
    DS.state.chatOrganization = normalizeStore(next);
    if (typeof DS.saveChatOrganization === "function") {
      await DS.saveChatOrganization(DS.state.chatOrganization);
    } else {
      await DS.storageSet?.({ [DS.CHAT_ORGANIZER_KEY || "chatOrganization"]: DS.state.chatOrganization });
    }
  }

  function configuredFolders() {
    return unique(String(DS.state.settings?.chatCollections || "").split(/[\n,]+/g));
  }

  async function saveConfiguredFolders(folders) {
    const next = unique(folders);
    const settings = { ...(DS.state.settings || {}), chatCollections: next.join("\n") };
    DS.state.settings = settings;
    await DS.storageSet?.({ settings });
    return next;
  }

  function findOrganizerHost(rows) {
    if (!rows.length) return null;
    const parents = [...new Set(rows.map(item => item.row?.parentElement).filter(Boolean))];
    if (parents.length === 1) return parents[0];

    let node = rows[0].row?.parentElement;
    while (node && node !== document.body && node.id !== "root") {
      if (rows.every(item => node.contains(item.row))) return node;
      node = node.parentElement;
    }
    return parents[0] || null;
  }

  function collectEntries() {
    const seen = new Set();
    const entries = [];
    for (const item of DS.collectChatRows?.() || []) {
      const href = item.anchor?.href || item.anchor?.getAttribute?.("href") || "";
      const key = normalizeConversationKey(href);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      entries.push({
        ...item,
        key,
        href,
        title: clean(DS.getChatRowTitle?.(item.row) || ""),
        botId: clean(DS.chatIdFromHref?.(href) || "")
      });
    }
    return entries;
  }

  function assignedFolders(entry) {
    const configured = new Set(configuredFolders());
    return unique(store().meta?.[entry.key]?.collections || []).filter(name => configured.has(name));
  }

  function matchesFolder(entry) {
    if (folderFilter === "all") return true;
    const folders = assignedFolders(entry);
    if (folderFilter === "__unfoldered__") return folders.length === 0;
    return folders.includes(folderFilter);
  }

  function isRowVisible(row) {
    if (!row?.isConnected) return false;
    return !row.classList.contains("ds-chat-row-hidden-by-search") &&
      !row.classList.contains("ds-chat-row-hidden-by-filter") &&
      !row.classList.contains("ds-chat-row-hidden-by-folder");
  }

  function updateSummary(entries) {
    const summary = document.getElementById("ds-qol-chat-filter-summary");
    if (!summary) return;
    const visible = entries.filter(item => isRowVisible(item.row)).length;
    summary.textContent = `Showing ${visible}/${entries.length}`;
  }

  function cleanupRowSelection(entries = collectEntries()) {
    for (const entry of entries) {
      entry.row.classList.remove("ds-chat-org-selected");
      entry.row.querySelector(":scope > .ds-chat-org-select")?.remove();
    }
  }

  function ensureSelectionButton(entry) {
    let button = entry.row.querySelector(":scope > .ds-chat-org-select");
    if (!bulkMode) {
      button?.remove();
      entry.row.classList.remove("ds-chat-org-selected");
      return;
    }

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "ds-chat-org-select";
      button.title = "Select this conversation";
      button.setAttribute("aria-label", `Select ${entry.title || "conversation"}`);
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (selectedKeys.has(entry.key)) selectedKeys.delete(entry.key);
        else selectedKeys.add(entry.key);
        applySelectionState(collectEntries());
      }, true);
      entry.row.appendChild(button);
    }

    const selected = selectedKeys.has(entry.key);
    button.textContent = selected ? "✓" : "";
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    entry.row.classList.toggle("ds-chat-org-selected", selected);
  }

  function applySelectionState(entries) {
    const liveKeys = new Set(entries.map(item => item.key));
    selectedKeys = new Set([...selectedKeys].filter(key => liveKeys.has(key)));
    entries.forEach(ensureSelectionButton);
    const count = document.querySelector("#ds-chat-organizer-toolbar [data-ds-chat-selected-count]");
    if (count) count.textContent = `${selectedKeys.size} selected`;
  }

  async function createFolder() {
    const current = configuredFolders();
    const raw = window.prompt("New chat folder name:", "");
    const name = clean(raw);
    if (!name) return;
    if (current.some(item => item.toLowerCase() === name.toLowerCase())) {
      window.alert("That chat folder already exists.");
      return;
    }
    await saveConfiguredFolders([...current, name]);
    folderFilter = name;
    DS.scheduleRun?.({ priority: "slow", source: "chat-folder-create" });
  }

  function chooseFolder(promptText, folders = configuredFolders()) {
    if (!folders.length) return "";
    if (folders.length === 1) return folders[0];
    const raw = window.prompt(`${promptText}\n\n${folders.join("\n")}`, folders[0]);
    const wanted = clean(raw);
    if (!wanted) return "";
    return folders.find(item => item.toLowerCase() === wanted.toLowerCase()) || "";
  }

  async function addSelectedToFolder(entries) {
    if (!selectedKeys.size) return;
    let folders = configuredFolders();
    if (!folders.length) {
      const raw = window.prompt("Create a chat folder first:", "");
      const name = clean(raw);
      if (!name) return;
      folders = await saveConfiguredFolders([name]);
    }
    const folder = chooseFolder("Add selected chats to which folder?", folders);
    if (!folder) return;

    const byKey = new Map(entries.map(item => [item.key, item]));
    const next = normalizeStore(store());
    for (const key of selectedKeys) {
      const entry = byKey.get(key);
      const previous = next.meta[key] || {};
      next.meta[key] = {
        key,
        title: entry?.title || previous.title || "",
        url: entry?.href || previous.url || "",
        botId: entry?.botId || previous.botId || "",
        collections: unique([...(previous.collections || []), folder]),
        updatedAt: Date.now()
      };
    }
    await saveStore(next);
    DS.setQuickStatus?.(`Added ${selectedKeys.size} chat${selectedKeys.size === 1 ? "" : "s"} to ${folder}.`);
    DS.scheduleRun?.({ priority: "slow", source: "chat-folder-add-selected" });
  }

  async function removeSelectedFromFolder(entries) {
    if (!selectedKeys.size) return;
    const folders = configuredFolders();
    const folder = folderFilter !== "all" && folderFilter !== "__unfoldered__"
      ? folderFilter
      : chooseFolder("Remove selected chats from which folder?", folders);
    if (!folder) return;

    const next = normalizeStore(store());
    let changed = 0;
    for (const key of selectedKeys) {
      const previous = next.meta[key];
      if (!previous?.collections?.includes(folder)) continue;
      previous.collections = unique(previous.collections.filter(item => item !== folder));
      previous.updatedAt = Date.now();
      changed += 1;
      if (!previous.collections.length) delete next.meta[key];
    }
    if (!changed) {
      DS.setQuickStatus?.(`None of the selected chats are in ${folder}.`);
      return;
    }
    await saveStore(next);
    DS.setQuickStatus?.(`Removed ${changed} chat${changed === 1 ? "" : "s"} from ${folder}.`);
    DS.scheduleRun?.({ priority: "slow", source: "chat-folder-remove-selected" });
  }

  async function renameCurrentFolder() {
    if (!folderFilter || folderFilter === "all" || folderFilter === "__unfoldered__") return;
    const folders = configuredFolders();
    const oldName = folderFilter;
    const raw = window.prompt("Rename chat folder:", oldName);
    const nextName = clean(raw);
    if (!nextName || nextName === oldName) return;
    if (folders.some(name => name !== oldName && name.toLowerCase() === nextName.toLowerCase())) {
      window.alert("That chat folder already exists.");
      return;
    }
    const next = normalizeStore(store());
    for (const item of Object.values(next.meta)) {
      if (!(item.collections || []).includes(oldName)) continue;
      item.collections = unique(item.collections.map(name => name === oldName ? nextName : name));
      item.updatedAt = Date.now();
    }
    await saveStore(next);
    await saveConfiguredFolders(folders.map(name => name === oldName ? nextName : name));
    folderFilter = nextName;
    DS.scheduleRun?.({ priority: "slow", source: "chat-folder-rename" });
  }

  async function deleteCurrentFolder() {
    if (!folderFilter || folderFilter === "all" || folderFilter === "__unfoldered__") return;
    const folder = folderFilter;
    if (!window.confirm(`Delete local chat folder "${folder}"?\n\nThe conversations themselves will not be deleted.`)) return;
    const next = normalizeStore(store());
    for (const [key, item] of Object.entries(next.meta)) {
      item.collections = unique((item.collections || []).filter(name => name !== folder));
      if (!item.collections.length) delete next.meta[key];
    }
    await saveStore(next);
    await saveConfiguredFolders(configuredFolders().filter(name => name !== folder));
    folderFilter = "all";
    DS.scheduleRun?.({ priority: "slow", source: "chat-folder-delete" });
  }

  function actionButton(label, handler, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(handler()).catch(error => DS.setQuickStatus?.(`Chat organizer: ${error?.message || error}`));
    });
    return button;
  }

  function buildToolbar(entries) {
    const host = findOrganizerHost(entries);
    if (!host?.parentElement) return null;

    let toolbar = document.getElementById("ds-chat-organizer-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "ds-chat-organizer-toolbar";
      toolbar.className = "ds-chat-organizer-toolbar";
    }

    if (!toolbar.isConnected || toolbar.nextElementSibling !== host) {
      host.parentElement.insertBefore(toolbar, host);
    }

    const folders = configuredFolders();
    if (folderFilter !== "all" && folderFilter !== "__unfoldered__" && !folders.includes(folderFilter)) folderFilter = "all";

    // Keep the injected toolbar stable across SpicyChat/MutationObserver passes.
    // Rebuilding a native <select> while it is open makes mobile browsers close it.
    const signature = `${folders.join("\u001f")}|${folderFilter}|${bulkMode ? "bulk" : "normal"}`;
    if (toolbar.dataset.dsSignature === signature && toolbar.childElementCount) {
      const count = toolbar.querySelector("[data-ds-chat-selected-count]");
      if (count) count.textContent = `${selectedKeys.size} selected`;
      return toolbar;
    }
    toolbar.dataset.dsSignature = signature;
    toolbar.replaceChildren();

    const select = document.createElement("select");
    select.setAttribute("aria-label", "Filter conversations by local chat folder");
    const options = [["all", "All chat folders"], ["__unfoldered__", "Unfoldered"], ...folders.map(name => [name, name])];
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = folderFilter;
    select.addEventListener("change", () => {
      folderFilter = select.value;
      DS.scheduleRun?.({ priority: "slow", source: "chat-folder-filter" });
    });
    toolbar.appendChild(select);

    toolbar.appendChild(actionButton("+ Folder", createFolder));

    const mode = actionButton(bulkMode ? "Done" : "Select chats", () => {
      bulkMode = !bulkMode;
      if (!bulkMode) selectedKeys.clear();
      DS.scheduleRun?.({ priority: "slow", source: "chat-organizer-bulk-toggle" });
    }, bulkMode ? "ds-chat-org-primary" : "");
    toolbar.appendChild(mode);

    if (folderFilter !== "all" && folderFilter !== "__unfoldered__") {
      toolbar.appendChild(actionButton("Rename folder", renameCurrentFolder));
      toolbar.appendChild(actionButton("Delete folder", deleteCurrentFolder, "ds-chat-org-danger"));
    }

    if (bulkMode) {
      const count = document.createElement("span");
      count.dataset.dsChatSelectedCount = "1";
      count.className = "ds-chat-org-count";
      count.textContent = `${selectedKeys.size} selected`;
      toolbar.appendChild(count);
      toolbar.appendChild(actionButton("Select visible", () => {
        for (const entry of collectEntries()) if (isRowVisible(entry.row)) selectedKeys.add(entry.key);
        applySelectionState(collectEntries());
      }));
      toolbar.appendChild(actionButton("Clear", () => {
        selectedKeys.clear();
        applySelectionState(collectEntries());
      }));
      toolbar.appendChild(actionButton("Folder…", () => addSelectedToFolder(collectEntries()), "ds-chat-org-primary"));
      toolbar.appendChild(actionButton("Remove folder…", () => removeSelectedFromFolder(collectEntries())));
    }

    return toolbar;
  }

  function removeOrganizer() {
    document.getElementById("ds-chat-organizer-toolbar")?.remove();
    for (const row of DS.qsa?.(".ds-chat-row-hidden-by-folder,.ds-chat-org-selected") || []) {
      row.classList.remove("ds-chat-row-hidden-by-folder", "ds-chat-org-selected");
    }
    for (const button of DS.qsa?.(".ds-chat-org-select") || []) button.remove();
    selectedKeys.clear();
    bulkMode = false;
  }

  DS.applyChatOrganizer = function applyChatOrganizer() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableChatOrganizer || !DS.isChatListPage?.()) {
      removeOrganizer();
      return;
    }

    const entries = collectEntries();
    if (!entries.length) {
      document.getElementById("ds-chat-organizer-toolbar")?.remove();
      return;
    }

    buildToolbar(entries);
    for (const entry of entries) {
      entry.row.classList.toggle("ds-chat-row-hidden-by-folder", !matchesFolder(entry));
    }
    applySelectionState(entries);
    updateSummary(entries);
  };

  DS.removeChatOrganizer = removeOrganizer;
})();
