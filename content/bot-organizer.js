// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  let bulkMode = false;
  let selectedIds = new Set();
  let filterCollection = "all";
  let explorerView = "root";
  let latestFolderPage = "";
  let newFolderScope = "";
  let filterStatus = "all";
  let filterQuery = "";
  let activePopoverId = "";

  const STATUS_LABELS = {
    "needs-work": "Needs work",
    testing: "Testing",
    finished: "Finished"
  };

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function displayText(value) {
    const raw = clean(value);
    return typeof DS.normalizeTextForDisplay === "function" ? DS.normalizeTextForDisplay(raw) : raw;
  }

  function unique(values) {
    return [...new Set((values || []).map(clean).filter(Boolean))];
  }

  // Folder locations affect only Favorites and My Creations. Home and
  // Recommendations still support local notes/tags, but not folder controls.
  function pageFolderScope() {
    if (DS.isFavoriteBotsPage?.()) return "favorites";
    if (DS.isMyCreationsChatbotsPage?.()) return "chatbots";
    return "";
  }

  function normalizeFolderScope(scope) {
    return ["favorites", "chatbots", "shared"].includes(scope) ? scope : "shared";
  }

  function visibleFolder(name) {
    const page = pageFolderScope();
    if (!page) return false;
    const folderScope = normalizeFolderScope(DS.state.botOrganization?.folderScopes?.[name]);
    return folderScope === "shared" || folderScope === page;
  }

  function visibleCollections() {
    return parseConfiguredCollections().filter(visibleFolder);
  }

  function visibleMemberCollections(data) {
    return unique(data?.collections).filter(visibleFolder);
  }

  function parseConfiguredCollections() {
    const settingsCollections = String(DS.state.settings?.botCollections || "").split(/[\n,]+/g);
    const storedCollections = Array.isArray(DS.state.botOrganization?.collections)
      ? DS.state.botOrganization.collections
      : [];
    return unique([...settingsCollections, ...storedCollections]);
  }

  async function saveConfiguredCollections(collections, scopeUpdates = {}) {
    const next = unique(collections);
    const settings = { ...(DS.state.settings || {}), botCollections: next.join("\n") };
    const organizer = normalizeStore(DS.state.botOrganization);
    organizer.collections = next;
    organizer.folderScopes = { ...(organizer.folderScopes || {}), ...scopeUpdates };
    for (const name of Object.keys(organizer.folderScopes)) {
      if (!next.includes(name)) delete organizer.folderScopes[name];
    }
    DS.state.settings = settings;
    DS.state.botOrganization = organizer;
    await Promise.all([
      DS.saveSettingsPatch?.({ botCollections: settings.botCollections }),
      DS.storageSet?.({ [DS.BOT_ORGANIZER_KEY || "botOrganization"]: organizer })
    ]);
    return next;
  }

  async function createFolder() {
    const current = parseConfiguredCollections();
    const raw = window.prompt("New chatbot folder name:", "");
    const name = clean(raw);
    if (!name) return;
    if (current.some(item => item.toLowerCase() === name.toLowerCase())) {
      window.alert("That folder already exists.");
      return;
    }
    const beforeSettings = { ...(DS.state.settings || {}) };
    await saveConfiguredCollections([...current, name], { [name]: normalizeFolderScope(newFolderScope || pageFolderScope()) });
    await DS.recordLocalChange?.(`Created chatbot folder: ${name}`, { settings: beforeSettings }, { settings: { ...(DS.state.settings || {}) } });
    const createdHere = visibleFolder(name);
    filterCollection = createdHere ? name : "all";
    explorerView = createdHere ? "folder" : "root";
    if (!createdHere) DS.setQuickStatus?.(`Created ${name} for another page. Open that page to see it.`);
    DS.scheduleRun?.({ priority: "slow", source: "bot-folder-create" });
  }

  async function renameCurrentFolder() {
    if (!filterCollection || filterCollection === "all" || filterCollection === "__unfoldered__") return;
    const current = parseConfiguredCollections();
    const oldName = current.find(item => item === filterCollection);
    if (!oldName) return;
    const beforeStore = JSON.parse(JSON.stringify(store()));
    const beforeSettings = { ...(DS.state.settings || {}) };
    const raw = window.prompt("Rename chatbot folder:", oldName);
    const nextName = clean(raw);
    if (!nextName || nextName === oldName) return;
    if (current.some(item => item !== oldName && item.toLowerCase() === nextName.toLowerCase())) {
      window.alert("That folder already exists.");
      return;
    }

    const nextStore = store();
    for (const data of Object.values(nextStore.meta || {})) {
      data.collections = unique((data.collections || []).map(item => item === oldName ? nextName : item));
      if ((data.collections || []).includes(nextName)) data.updatedAt = Date.now();
    }
    if (nextStore.folderScopes?.[oldName]) {
      nextStore.folderScopes[nextName] = nextStore.folderScopes[oldName];
      delete nextStore.folderScopes[oldName];
    }
    if (nextStore.folderCovers?.[oldName]) {
      nextStore.folderCovers[nextName] = nextStore.folderCovers[oldName];
      delete nextStore.folderCovers[oldName];
    }
    await saveStore(nextStore);
    await saveConfiguredCollections(current.map(item => item === oldName ? nextName : item));
    await DS.recordLocalChange?.(`Renamed chatbot folder: ${oldName} → ${nextName}`, { [DS.BOT_ORGANIZER_KEY]: beforeStore, settings: beforeSettings }, { [DS.BOT_ORGANIZER_KEY]: nextStore, settings: { ...(DS.state.settings || {}) } });
    filterCollection = nextName;
    DS.scheduleRun?.({ priority: "slow", source: "bot-folder-rename" });
  }

  async function deleteCurrentFolder() {
    if (!filterCollection || filterCollection === "all" || filterCollection === "__unfoldered__") return;
    const current = parseConfiguredCollections();
    const folder = current.find(item => item === filterCollection);
    if (!folder) return;
    if (!window.confirm(`Delete the local folder "${folder}"?\n\nThe chatbots themselves will NOT be deleted. They will only be removed from this QoL folder.`)) return;

    const beforeStore = JSON.parse(JSON.stringify(store()));
    const beforeSettings = { ...(DS.state.settings || {}) };
    const nextStore = store();
    for (const [id, data] of Object.entries(nextStore.meta || {})) {
      data.collections = unique((data.collections || []).filter(item => item !== folder));
      data.updatedAt = Date.now();
      if (!hasLocalData(data)) delete nextStore.meta[id];
    }
    delete nextStore.folderCovers?.[folder];
    delete nextStore.folderScopes?.[folder];
    await saveStore(nextStore);
    await saveConfiguredCollections(current.filter(item => item !== folder));
    await DS.recordLocalChange?.(`Deleted chatbot folder: ${folder}`, { [DS.BOT_ORGANIZER_KEY]: beforeStore, settings: beforeSettings }, { [DS.BOT_ORGANIZER_KEY]: nextStore, settings: { ...(DS.state.settings || {}) } });
    filterCollection = "all";
    DS.scheduleRun?.({ priority: "slow", source: "bot-folder-delete" });
  }

  // Small folder-cover records live alongside folder names in the existing
  // Bot Organizer storage/backup. Avatars are URLs; uploaded pictures are
  // resized thumbnails, never original uploads or copies of bot avatars.
  function normalizeFolderCover(raw) {
    if (!raw || typeof raw !== "object") return null;
    const mode = ["icon", "auto", "selected", "custom"].includes(raw.mode) ? raw.mode : "icon";
    const ids = unique(Array.isArray(raw.ids) ? raw.ids : []).slice(0, 2);
    const image = typeof raw.image === "string" && raw.image.length <= 55000 &&
      /^data:image\/(?:webp|jpeg|png);base64,[a-zA-Z0-9+/=]+$/.test(raw.image) ? raw.image : "";
    return { mode: mode === "custom" && !image ? "icon" : mode, ids, image, updatedAt: Number(raw.updatedAt) || 0 };
  }

  function normalizeFolderCovers(value) {
    const output = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return output;
    for (const [name, cover] of Object.entries(value)) {
      const key = clean(name);
      const normalized = normalizeFolderCover(cover);
      if (key && normalized) output[key] = normalized;
    }
    return output;
  }

  function normalizeFolderScopes(raw) {
    const scopes = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return scopes;
    for (const [name, scope] of Object.entries(raw)) {
      const key = clean(name);
      if (key) scopes[key] = normalizeFolderScope(scope);
    }
    return scopes;
  }

  function normalizeStore(value) {
    const source = value && typeof value === "object" ? value : {};
    const meta = source.meta && typeof source.meta === "object" ? source.meta : {};
    const output = {};

    for (const [id, raw] of Object.entries(meta)) {
      const key = clean(id);
      if (!key || !raw || typeof raw !== "object") continue;
      const status = Object.prototype.hasOwnProperty.call(STATUS_LABELS, raw.status) ? raw.status : "";
      output[key] = {
        id: key,
        name: clean(raw.name),
        image: clean(raw.image),
        creator: clean(raw.creator),
        chatUrl: clean(raw.chatUrl),
        profileUrl: clean(raw.profileUrl),
        collections: unique(raw.collections),
        tags: unique(raw.tags).slice(0, 40),
        note: clean(raw.note).slice(0, 1000),
        status,
        updatedAt: Number(raw.updatedAt) || 0
      };
    }

    return {
      collections: unique(source.collections),
      folderCovers: normalizeFolderCovers(source.folderCovers),
      folderScopes: normalizeFolderScopes(source.folderScopes),
      meta: output
    };
  }

  function store() {
    DS.state.botOrganization = normalizeStore(DS.state.botOrganization);
    return DS.state.botOrganization;
  }

  async function saveStore(next = store()) {
    const previous = DS.state.botOrganization;
    DS.state.botOrganization = normalizeStore(next);
    try {
      if (typeof DS.saveBotOrganization === "function") {
        const saved = await DS.saveBotOrganization(DS.state.botOrganization);
        if (saved === false) throw new Error("QoL could not save the folder changes.");
      } else {
        const saved = await DS.storageSet?.({ [DS.BOT_ORGANIZER_KEY || "botOrganization"]: DS.state.botOrganization });
        if (saved === false || saved === undefined) throw new Error("QoL could not save the folder changes.");
      }
    } catch (error) {
      // A caller may have already edited the live object, so reload the last
      // committed copy rather than reusing the possibly mutated reference.
      try {
        const key = DS.BOT_ORGANIZER_KEY || "botOrganization";
        const persisted = await DS.storageGet?.([key]);
        DS.state.botOrganization = normalizeStore(persisted?.[key]);
      } catch {
        DS.state.botOrganization = previous;
      }
      throw error;
    }
  }

  function cardCreator(card) {
    const link = card?.querySelector?.("a[href*='/creator/']");
    if (!link) return "";
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/creator\/([^/?#]+)/i);
    return match?.[1] ? `@${decodeURIComponent(match[1])}` : clean(link.textContent);
  }

  function cardTitle(card) {
    const links = [...(card?.querySelectorAll?.("a[aria-label^='chat-with-'][title], a[href*='/chat/'][title]") || [])];
    for (const link of links) {
      const title = clean(link.getAttribute("title"));
      if (title) return title;
    }
    return "";
  }

  function entryFrom(card, anchor) {
    const id = DS.botIdFromHref?.(anchor?.href || "") || "";
    if (!id) return null;

    const base = DS.makeBotMeta?.({ id, card, anchor }) || {};
    return {
      id,
      card,
      anchor,
      name: clean(cardTitle(card) || base.name || DS.getCardTitle?.(card) || id),
      image: clean(base.image || DS.getCardImageUrl?.(card) || ""),
      creator: clean(base.creator || cardCreator(card)),
      chatUrl: clean(base.chatUrl || anchor?.href || `${location.origin}/chat/${id}`),
      profileUrl: clean(base.profileUrl || `${location.origin}/chatbot/${id}`)
    };
  }

  function collectEntries() {
    const seen = new Set();
    const entries = [];
    for (const pair of DS.collectCards?.() || []) {
      const entry = entryFrom(pair.card, pair.anchor);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push(entry);
    }
    return entries;
  }

  function dataFor(id) {
    return store().meta[id] || { id, collections: [], tags: [], note: "", status: "" };
  }

  function hasLocalData(data) {
    return !!(
      data?.note ||
      data?.status ||
      (Array.isArray(data?.collections) && data.collections.length) ||
      (Array.isArray(data?.tags) && data.tags.length)
    );
  }

  function clearCardUi(card) {
    card?.querySelector?.(".ds-bot-organizer-button")?.remove();
    card?.querySelector?.(".ds-bot-local-meta")?.remove();
    card?.querySelector?.(".ds-bot-bulk-select")?.remove();
    card?.querySelectorAll?.(".ds-bot-organizer-inline-host")?.forEach(host => {
      host.classList.remove("ds-bot-organizer-inline-host");
    });
    card?.querySelectorAll?.(".ds-bot-organizer-meta-body")?.forEach(host => {
      host.classList.remove("ds-bot-organizer-meta-body");
    });
    card?.classList?.remove("ds-bot-org-filter-hidden", "ds-bot-org-selected", "ds-bot-org-mobile-bulk");
    if (card?.dataset) {
      delete card.dataset.dsBotOrganizerCard;
      delete card.dataset.dsBulkBotId;
    }
  }

  function findInlineHost(card) {
    const creator = card?.querySelector?.("a[href*='/creator/']");
    if (creator?.parentElement) return { host: creator.parentElement, after: creator };

    const title = card?.querySelector?.("a[aria-label^='chat-with-'], a[href*='/chatbot/']");
    if (title?.parentElement) return { host: title.parentElement, after: title };

    return null;
  }

  function findImageHost(card) {
    const chatLink = card?.querySelector?.("a[aria-label^='chat-with-']");
    const host = chatLink?.parentElement;
    if (host?.classList?.contains("relative") && host.classList.contains("aspect-square")) return host;
    return [...(card?.children || [])].find(node =>
      node instanceof Element &&
      node.classList.contains("relative") &&
      node.classList.contains("aspect-square")
    ) || null;
  }

  function findCardBody(card) {
    return [...(card?.children || [])].find(node =>
      node instanceof Element &&
      node.classList.contains("flex") &&
      node.classList.contains("flex-col") &&
      node.classList.contains("grow")
    ) || null;
  }

  function placeLocalMeta(card, host) {
    const body = findCardBody(card);
    if (!body || !host) return false;
    const footer = [...body.children].find(node =>
      node !== host && node.classList?.contains("mt-auto") && node.classList?.contains("flex-col")
    ) || null;
    if (host.parentElement !== body || host.nextElementSibling !== footer) body.insertBefore(host, footer);
    if (!body.classList.contains("ds-bot-organizer-meta-body")) body.classList.add("ds-bot-organizer-meta-body");
    return true;
  }

  function makeOrganizeButton(entry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-bot-organizer-button";
    button.dataset.dsBotId = entry.id;
    button.textContent = "▦";
    button.title = "Organize bot / folders";
    button.setAttribute("aria-label", `Organize ${entry.name || "bot"} / folders`);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openPopover(entry, button);
    });
    return button;
  }

  function ensureOrganizeButton(entry) {
    if (!entry?.card) return;

    let button = entry.card.querySelector(".ds-bot-organizer-button");
    if (!button) button = makeOrganizeButton(entry);

    const label = `Organize ${entry.name || "bot"} / folders`;
    if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);

    const imageHost = findImageHost(entry.card);
    if (imageHost) {
      button.classList.remove("ds-bot-organizer-button-floating");
      button.classList.add("ds-bot-organizer-button-image");
      if (button.parentElement !== imageHost) imageHost.appendChild(button);
      return;
    }

    button.classList.remove("ds-bot-organizer-button-image");
    if (getComputedStyle(entry.card).position === "static") entry.card.style.position = "relative";
    button.classList.add("ds-bot-organizer-button-floating");
    if (button.parentElement !== entry.card) entry.card.appendChild(button);
  }

  function makeChip(text, cls = "") {
    const chip = document.createElement("span");
    chip.className = `ds-bot-local-chip${cls ? ` ${cls}` : ""}`;
    chip.textContent = text;
    return chip;
  }

  function ensureLocalMeta(entry) {
    const settings = DS.state.settings || {};
    let host = entry.card.querySelector(".ds-bot-local-meta");
    const data = dataFor(entry.id);
    const body = findCardBody(entry.card);

    if (!settings.botOrganizerShowCardMeta || !hasLocalData(data)) {
      host?.remove();
      if (body?.classList.contains("ds-bot-organizer-meta-body")) body.classList.remove("ds-bot-organizer-meta-body");
      return;
    }

    if (!host) {
      host = document.createElement("div");
      host.className = "ds-bot-local-meta";
    }
    placeLocalMeta(entry.card, host);

    const visible = {
      status: data.status || "",
      collections: pageFolderScope() ? visibleMemberCollections(data).slice(0, 2) : [],
      tags: (data.tags || []).slice(0, 2),
      note: data.note || ""
    };
    const signature = JSON.stringify(visible);
    if (host.dataset.dsMetaSignature === signature) return;
    host.dataset.dsMetaSignature = signature;
    host.replaceChildren();

    if (visible.status) host.appendChild(makeChip(STATUS_LABELS[visible.status] || visible.status, `ds-bot-status-${visible.status}`));
    for (const collection of visible.collections) host.appendChild(makeChip(`📁 ${collection}`));
    for (const tag of visible.tags) host.appendChild(makeChip(`#${tag}`));

    if (visible.note) {
      const note = document.createElement("span");
      note.className = "ds-bot-local-note";
      note.textContent = visible.note;
      note.title = visible.note;
      host.appendChild(note);
    }
  }

  function mobileBulkMode() {
    try {
      return window.matchMedia?.("(pointer: coarse)")?.matches || window.innerWidth <= 760;
    } catch {
      return window.innerWidth <= 760;
    }
  }

  function toggleBulkEntry(entry) {
    if (!entry?.id) return;
    if (selectedIds.has(entry.id)) selectedIds.delete(entry.id);
    else selectedIds.add(entry.id);
    refreshSelectionUi();
  }

  function ensureBulkSelector(entry) {
    const card = entry.card;
    let button = card.querySelector(".ds-bot-bulk-select");

    if (!bulkMode) {
      button?.remove();
      card.classList.remove("ds-bot-org-selected", "ds-bot-org-mobile-bulk");
      delete card.dataset.dsBulkBotId;
      return;
    }

    if (!button) {
      if (getComputedStyle(card).position === "static") card.style.position = "relative";
      button = document.createElement("button");
      button.type = "button";
      button.className = "ds-bot-bulk-select";
      button.dataset.dsBotId = entry.id;
      button.setAttribute("aria-label", `Select ${entry.name || "bot"}`);
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleBulkEntry(entry);
      });
      card.appendChild(button);
    }

    card.dataset.dsBulkBotId = entry.id;
    const isMobileBulk = mobileBulkMode();
    card.classList.toggle("ds-bot-org-mobile-bulk", isMobileBulk);
    const wantedPosition = clean(DS.state?.settings?.botOrganizerMobileBulkSelectorPosition || "bottom-right");
    button.dataset.dsPosition = ["top-left", "top-right", "bottom-left", "bottom-right"].includes(wantedPosition) ? wantedPosition : "bottom-right";
    const selected = selectedIds.has(entry.id);
    button.textContent = selected ? "✓" : "";
    button.dataset.dsSelected = selected ? "1" : "0";
    card.classList.toggle("ds-bot-org-selected", selected);
  }

  function setNodeText(label, text) {
    const span = document.createElement("span");
    span.textContent = text;
    label.appendChild(span);
  }

  function labeledControl(text, control) {
    const label = document.createElement("label");
    label.className = "ds-bot-org-field";
    setNodeText(label, text);
    label.appendChild(control);
    return label;
  }

  function closePopover() {
    document.getElementById("ds-bot-organizer-popover")?.remove();
    activePopoverId = "";
  }

  function openPopover(entry, anchorButton) {
    closePopover();
    const current = dataFor(entry.id);
    const collections = visibleCollections();
    activePopoverId = entry.id;

    const panel = document.createElement("div");
    panel.id = "ds-bot-organizer-popover";
    panel.className = "ds-bot-organizer-popover";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", `Organize ${entry.name || "bot"}`);

    const header = document.createElement("div");
    header.className = "ds-bot-org-popover-head";
    const title = document.createElement("strong");
    title.textContent = displayText(entry.name || "Bot Organizer");
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Close";
    close.setAttribute("aria-label", "Close Bot Organizer");
    close.addEventListener("click", closePopover);
    header.append(title, close);

    const note = document.createElement("textarea");
    note.maxLength = 1000;
    note.rows = 3;
    note.value = current.note || "";
    note.placeholder = "Private QoL note";

    const tags = document.createElement("input");
    tags.type = "text";
    tags.value = (current.tags || []).join(", ");
    tags.placeholder = "tested, good greeting, needs lorebook";

    const body = document.createElement("div");
    body.className = "ds-bot-org-popover-body";
    body.append(labeledControl("Private note", note), labeledControl("Personal tags", tags));

    const collectionBox = document.createElement("fieldset");
    collectionBox.className = "ds-bot-org-collections";
    const legend = document.createElement("legend");
    legend.textContent = "Folders";
    collectionBox.appendChild(legend);

    if (pageFolderScope() && collections.length) {
      for (const collection of collections) {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = collection;
        checkbox.checked = (current.collections || []).includes(collection);
        label.append(checkbox, document.createTextNode(collection));
        collectionBox.appendChild(label);
      }
    } else {
      const empty = document.createElement("small");
      empty.textContent = pageFolderScope() ? "Create folders here or in Settings → Saved Lists → Bot Organizer." : "Folders are available on Favorites and My Creations.";
      collectionBox.appendChild(empty);
    }
    if (pageFolderScope()) body.appendChild(collectionBox);

    let statusSelect = null;
    if (DS.isMyCreationsChatbotsPage?.()) {
      statusSelect = document.createElement("select");
      const statusOptions = [
        ["", "No status"],
        ["needs-work", "Needs work"],
        ["testing", "Testing"],
        ["finished", "Finished"]
      ];
      for (const [value, labelText] of statusOptions) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = labelText;
        statusSelect.appendChild(option);
      }
      statusSelect.value = current.status || "";
      body.appendChild(labeledControl("Creator status", statusSelect));
    }

    const footer = document.createElement("div");
    footer.className = "ds-bot-org-popover-actions";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear local data";
    clear.addEventListener("click", async () => {
      const beforeStore = JSON.parse(JSON.stringify(store()));
      const next = store();
      delete next.meta[entry.id];
      await saveStore(next);
      await DS.recordLocalChange?.(`Cleared local bot data: ${entry.name || entry.id}`, { [DS.BOT_ORGANIZER_KEY]: beforeStore }, { [DS.BOT_ORGANIZER_KEY]: next });
      closePopover();
      DS.scheduleRun?.({ priority: "slow", source: "bot-organizer-clear" });
    });

    const save = document.createElement("button");
    save.type = "button";
    save.className = "ds-bot-org-primary";
    save.textContent = "Save";
    save.addEventListener("click", async () => {
      const beforeStore = JSON.parse(JSON.stringify(store()));
      const visible = visibleCollections();
      const selectedVisible = [...collectionBox.querySelectorAll("input[type='checkbox']:checked")].map(input => input.value);
      const chosenCollections = unique([
        ...(current.collections || []).filter(name => !visible.includes(name)),
        ...selectedVisible
      ]);
      const tagValues = unique(tags.value.split(/[,\n]+/g)).slice(0, 40);
      const next = store();
      next.meta[entry.id] = {
        ...current,
        id: entry.id,
        name: entry.name,
        image: entry.image,
        creator: entry.creator,
        chatUrl: entry.chatUrl,
        profileUrl: entry.profileUrl,
        collections: chosenCollections,
        tags: tagValues,
        note: clean(note.value).slice(0, 1000),
        status: statusSelect?.value || "",
        updatedAt: Date.now()
      };
      if (!hasLocalData(next.meta[entry.id])) delete next.meta[entry.id];
      await saveStore(next);
      await DS.recordLocalChange?.(`Updated private note/tags: ${entry.name || entry.id}`, { [DS.BOT_ORGANIZER_KEY]: beforeStore }, { [DS.BOT_ORGANIZER_KEY]: next });
      closePopover();
      DS.scheduleRun?.({ priority: "slow", source: "bot-organizer-save" });
    });
    footer.append(clear, save);

    panel.append(header, body, footer);
    document.body.appendChild(panel);

    const rect = anchorButton?.getBoundingClientRect?.();
    if (rect) {
      const mobile = window.matchMedia?.("(max-width: 700px)")?.matches;
      const width = 330;
      if (mobile) {
        // Keep Save/Cancel reachable above mobile/browser wrapper controls.
        panel.style.top = `${Math.max(8, Math.min(72, rect.top || 8))}px`;
      } else {
        const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left - width + rect.width));
        const top = Math.max(8, Math.min(window.innerHeight - 420, rect.bottom + 8));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
      }
    }
  }

  function isFilteredOut(entry) {
    const data = dataFor(entry.id);
    const onFolderPage = !!pageFolderScope();
    if (onFolderPage && DS.state.settings?.botOrganizerExplorerFolders && explorerView === "root") {
      if (visibleMemberCollections(data).length) return true;
    } else if (onFolderPage && filterCollection === "__unfoldered__") {
      if (visibleMemberCollections(data).length) return true;
    } else if (onFolderPage && filterCollection !== "all" && !(data.collections || []).includes(filterCollection)) return true;
    if (filterStatus !== "all") {
      if (filterStatus === "none") {
        if (data.status) return true;
      } else if (data.status !== filterStatus) return true;
    }
    if (filterQuery) {
      const haystack = [
        entry.name,
        entry.creator,
        data.note,
        ...(data.collections || []),
        ...(data.tags || [])
      ].join(" ").toLowerCase();
      if (!haystack.includes(filterQuery)) return true;
    }
    return false;
  }

  function applyFilters(entries) {
    for (const entry of entries) {
      // The SpicyChat grid item wraps the card. Hiding only the inner card
      // leaves an empty grid cell and makes a one-bot folder look stranded.
      const target = DS.getBestHideTarget?.(entry.card) || entry.card;
      if (target !== entry.card) entry.card.classList.remove("ds-bot-org-filter-hidden");
      target.classList.toggle("ds-bot-org-filter-hidden", isFilteredOut(entry));
    }
  }

  function explorerPage() {
    return !!(DS.isFavoriteBotsPage?.() || DS.isMyCreationsChatbotsPage?.());
  }

  function folderMembers(name, entries, meta) {
    const known = new Map();
    // Loaded avatar URLs take precedence. Saved URLs fill in when the bot is
    // not among the current listing cards (without fetching hidden pages).
    for (const [id, data] of Object.entries(meta || {})) {
      if ((data?.collections || []).includes(name)) known.set(id, {
        id, name: data.name || id, image: data.image || ""
      });
    }
    for (const entry of entries || []) {
      if (!known.has(entry.id)) continue;
      const previous = known.get(entry.id);
      known.set(entry.id, { id: entry.id, name: entry.name || previous.name, image: entry.image || previous.image });
    }
    return [...known.values()];
  }

  function createFolderCover(name, entries, meta, cover) {
    const icon = document.createElement("span");
    icon.className = "ds-bot-explorer-icon";
    icon.textContent = "📁";
    icon.setAttribute("aria-hidden", "true");
    if (!cover || cover.mode === "icon") return icon;
    const members = folderMembers(name, entries, meta);
    const memberById = new Map(members.map(item => [item.id, item]));
    const urls = cover.mode === "custom" ? [cover.image] :
      cover.mode === "selected" ? (cover.ids || []).map(id => memberById.get(id)?.image) :
      members.map(item => item.image);
    const images = urls.filter(url => typeof url === "string" &&
      (/^https:\/\//i.test(url) || /^data:image\/(?:webp|jpeg|png);base64,/i.test(url))).slice(0, 2);
    if (!images.length) return icon;
    const visuals = document.createElement("span");
    visuals.className = `ds-bot-explorer-cover${images.length === 2 ? " ds-bot-explorer-cover-pair" : ""}`;
    visuals.setAttribute("aria-hidden", "true");
    for (const url of images) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.src = url;
      visuals.appendChild(img);
    }
    return visuals;
  }

  async function resizedCoverData(file) {
    if (!file || !/^image\/(?:png|jpeg|webp|gif)$/i.test(file.type)) throw new Error("Choose a PNG, JPEG, WebP or GIF picture.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Picture exceeds the 8 MiB import limit.");
    const objectUrl = URL.createObjectURL(file);
    let bitmap;
    try {
      bitmap = new Image();
      bitmap.decoding = "async";
      bitmap.src = objectUrl;
      await new Promise((resolve, reject) => { bitmap.onload = resolve; bitmap.onerror = () => reject(new Error("Couldn't read that picture.")); });
      const canvas = document.createElement("canvas");
      // Fixed 160 x 96 cover. Downscaling before storage keeps archive/backup
      // payloads small and prevents large animated images running in tiles.
      canvas.width = 160;
      canvas.height = 96;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Image resizing isn't available in this browser.");
      const scale = Math.max(160 / bitmap.naturalWidth, 96 / bitmap.naturalHeight);
      const w = bitmap.naturalWidth * scale, h = bitmap.naturalHeight * scale;
      context.fillStyle = "#222";
      context.fillRect(0, 0, 160, 96);
      context.drawImage(bitmap, (160 - w) / 2, (96 - h) / 2, w, h);
      let result = canvas.toDataURL("image/webp", 0.72);
      if (!result.startsWith("data:image/webp;")) result = canvas.toDataURL("image/jpeg", 0.70);
      if (result.length > 55000) result = canvas.toDataURL("image/jpeg", 0.48);
      if (result.length > 55000) throw new Error("Picture cannot fit the folder cover storage limit.");
      return result;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function openFolderCoverEditor(name, entries) {
    document.getElementById("ds-bot-explorer-cover-editor")?.remove();
    const current = normalizeFolderCover(store().folderCovers?.[name]) || { mode: "icon", ids: [], image: "" };
    const members = folderMembers(name, entries, store().meta);
    const overlay = document.createElement("div");
    overlay.id = "ds-bot-explorer-cover-editor";
    overlay.className = "ds-bot-explorer-cover-overlay";
    const dialog = document.createElement("section");
    dialog.className = "ds-bot-explorer-cover-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", `Folder picture for ${name}`);
    const heading = document.createElement("h3");
    heading.textContent = `Folder picture: ${name}`;
    const label = (caption, control) => {
      const wrap = document.createElement("label");
      wrap.className = "ds-bot-explorer-cover-field";
      const title = document.createElement("span"); title.textContent = caption;
      wrap.append(title, control); return wrap;
    };
    const scope = document.createElement("select");
    scope.setAttribute("aria-label", "Folder location");
    for (const [value, title] of [["favorites", "Favorites"], ["chatbots", "My Chatbots"], ["shared", "Shared (both pages)"]]) {
      const option = document.createElement("option"); option.value = value; option.textContent = title; scope.append(option);
    }
    scope.value = normalizeFolderScope(store().folderScopes?.[name]);
    const mode = document.createElement("select");
    mode.setAttribute("aria-label", "Folder cover type");
    for (const [value, title] of [
      ["icon", "Normal folder icon"], ["auto", "First two bot pictures"],
      ["selected", "Choose up to two bots"], ["custom", "Upload my own picture"]
    ]) {
      const option = document.createElement("option"); option.value = value; option.textContent = title; mode.append(option);
    }
    mode.value = current.mode;
    const makeBotSelect = (index) => {
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Folder cover bot ${index + 1}`);
      const empty = document.createElement("option"); empty.value = ""; empty.textContent = index ? "No second bot" : "Select a bot";
      select.append(empty);
      for (const item of members) {
        const option = document.createElement("option"); option.value = item.id;
        option.textContent = item.name; select.append(option);
      }
      select.value = current.ids?.[index] || "";
      return select;
    };
    const first = makeBotSelect(0), second = makeBotSelect(1);
    const file = document.createElement("input"); file.type = "file"; file.accept = "image/png,image/jpeg,image/webp,image/gif";
    const note = document.createElement("small");
    note.textContent = "Bot images use existing avatar links. Uploaded covers are saved as small, static thumbnails in local QoL backups.";
    const status = document.createElement("small"); status.setAttribute("role", "status");
    let chosenImage = current.image || "";
    const existing = document.createElement("img");
    existing.className = "ds-bot-explorer-cover-preview";
    existing.alt = "Current custom folder cover";
    if (chosenImage) existing.src = chosenImage;
    const rows = [label("First bot", first), label("Second bot (optional)", second)];
    const fileRow = label("Picture", file);
    function updateFields() {
      rows.forEach(row => row.hidden = mode.value !== "selected");
      fileRow.hidden = mode.value !== "custom";
      existing.hidden = mode.value !== "custom" || !chosenImage;
    }
    mode.addEventListener("change", updateFields); updateFields();
    file.addEventListener("change", async () => {
      status.textContent = "Preparing thumbnail…";
      try {
        chosenImage = await resizedCoverData(file.files?.[0]);
        existing.src = chosenImage; updateFields();
        status.textContent = "Picture ready — click Save to keep it.";
      } catch (error) { status.textContent = error.message || "Unable to use picture."; }
    });
    const actions = document.createElement("div"); actions.className = "ds-bot-explorer-cover-actions";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel";
    const save = document.createElement("button"); save.type = "button"; save.textContent = "Save";
    const close = () => overlay.remove();
    cancel.addEventListener("click", close);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    save.addEventListener("click", async () => {
      const chosenMode = mode.value;
      const ids = unique([first.value, second.value]).slice(0, 2);
      if (chosenMode === "selected" && (!ids.length || ids.some(id => !members.some(item => item.id === id)))) {
        status.textContent = "Choose at least one bot in this folder."; return;
      }
      if (chosenMode === "custom" && !chosenImage) { status.textContent = "Upload a picture first."; return; }
      save.disabled = true;
      try {
        const previous = JSON.parse(JSON.stringify(store()));
        const next = store();
        const covers = { ...(next.folderCovers || {}) };
        if (chosenMode === "icon") delete covers[name];
        else covers[name] = normalizeFolderCover({
          mode: chosenMode,
          ids: chosenMode === "selected" ? ids : [],
          image: chosenMode === "custom" ? chosenImage : "",
          updatedAt: Date.now()
        });
        // Limit the total stored thumbnails. A large folder collection should
        // never silently generate multi-megabyte backups.
        const totalBytes = Object.values(covers).reduce((sum, item) => sum + (item?.image?.length || 0), 0);
        if (totalBytes > 1024 * 1024) throw new Error("Folder pictures exceed the 1 MiB total limit. Remove an old cover first.");
        next.folderCovers = covers;
        next.folderScopes = { ...(next.folderScopes || {}), [name]: normalizeFolderScope(scope.value) };
        await saveStore(next);
        await DS.recordLocalChange?.(`Updated folder cover: ${name}`, { [DS.BOT_ORGANIZER_KEY]: previous }, { [DS.BOT_ORGANIZER_KEY]: next });
        close();
        document.getElementById("ds-bot-organizer-explorer")?.removeAttribute("data-signature");
        const entries = collectEntries();
        renderFolderExplorer(entries);
        applyFilters(entries);
        document.getElementById("ds-bot-organizer-toolbar")?.removeAttribute("data-ds-toolbar-signature");
        DS.scheduleRun?.({ priority: "slow", source: "bot-folder-cover-or-location" });
      } catch (error) { status.textContent = error.message || "Failed to save picture."; }
      finally { save.disabled = false; }
    });
    actions.append(cancel, save);
    dialog.append(heading, label("Location", scope), label("Display", mode), ...rows, fileRow, existing, note, status, actions);
    overlay.append(dialog); document.body.append(overlay);
    mode.focus();
  }

  function renderFolderExplorer(entries) {
    const settings = DS.state.settings || {};
    const enabled = !!(settings.enabled && settings.enableBotOrganizer && settings.botOrganizerExplorerFolders && explorerPage());
    let panel = document.getElementById("ds-bot-organizer-explorer");
    if (!enabled) { panel?.remove(); explorerView = "root"; return; }
    const grid = entries[0]?.card?.parentElement?.parentElement;
    // Insert only beside the live native grid, never into React-owned card trees.
    if (!grid?.isConnected || !grid.classList?.contains("grid")) return;
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "ds-bot-organizer-explorer";
      panel.className = "ds-bot-organizer-explorer";
      panel.setAttribute("aria-label", "Private QoL bot folders");
    }
    if (panel.nextElementSibling !== grid) grid.parentElement.insertBefore(panel, grid);
    grid.classList.add("ds-bot-organizer-explorer-grid");
    const collections = visibleCollections();
    if (explorerView === "folder" && filterCollection !== "__unfoldered__" && !collections.includes(filterCollection)) explorerView = "root";
    const organizer = store();
    const storeMeta = organizer.meta || {};
    const covers = organizer.folderCovers || {};
    const counts = new Map(collections.map(name => [name, entries.filter(item => (storeMeta[item.id]?.collections || []).includes(name)).length]));
    const coverState = collections.map(name => {
      const cover = covers[name];
      const people = cover?.mode === "auto" ? folderMembers(name, entries, storeMeta).slice(0, 2).map(item => [item.id, item.image]) : [];
      return [name, cover?.mode || "icon", cover?.updatedAt || 0, normalizeFolderScope(organizer.folderScopes?.[name]), people];
    });
    const signature = JSON.stringify([explorerView, filterCollection, collections, [...counts], entries.length, coverState]);
    if (panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    panel.replaceChildren();
    const head = document.createElement("div");
    head.className = "ds-bot-explorer-head";
    const title = document.createElement("strong");
    title.textContent = explorerView === "folder" ? `Folders / ${filterCollection}` : explorerView === "all" ? "All bots" : pageFolderScope() === "favorites" ? "Favorites folders" : "My Chatbots folders";
    head.append(title);
    const nav = document.createElement("div");
    nav.className = "ds-bot-explorer-nav";
    const navButton = (label, view, collection = "all") => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label;
      b.disabled = explorerView === view && (view !== "folder" || filterCollection === collection);
      b.addEventListener("click", () => {
        explorerView = view; filterCollection = collection;
        document.getElementById("ds-bot-organizer-toolbar")?.removeAttribute("data-ds-toolbar-signature");
        applyFilters(collectEntries());
        renderFolderExplorer(collectEntries());
        DS.scheduleRun?.({ priority: "slow", source: "bot-folder-explorer-navigation" });
      });
      return b;
    };
    nav.append(navButton("← Folders", "root"), navButton("All bots", "all"), navButton("Unfoldered", "folder", "__unfoldered__"));
    head.append(nav);
    if (explorerView === "folder" && collections.includes(filterCollection)) {
      const configure = document.createElement("button"); configure.type = "button";
      configure.className = "ds-bot-explorer-cover-settings";
      configure.textContent = "Change folder picture";
      configure.addEventListener("click", () => openFolderCoverEditor(filterCollection, collectEntries()));
      head.append(configure);
    }
    panel.append(head);
    if (explorerView === "root") {
      const tiles = document.createElement("div"); tiles.className = "ds-bot-explorer-tiles";
      for (const name of collections) {
        const tile = document.createElement("div"); tile.className = "ds-bot-explorer-tile";
        const btn = document.createElement("button"); btn.type = "button"; btn.className = "ds-bot-explorer-folder";
        const folder = createFolderCover(name, entries, storeMeta, covers[name]);
        const text = document.createElement("span"); text.textContent = name;
        const count = document.createElement("small");
        const location = normalizeFolderScope(organizer.folderScopes?.[name]);
        count.textContent = `${counts.get(name) || 0} loaded · ${location === "shared" ? "Shared" : location === "favorites" ? "Favorites" : "My Chatbots"}`;
        btn.append(folder, text, count); btn.title = `Open ${name}`;
        btn.addEventListener("click", () => {
          explorerView = "folder"; filterCollection = name;
          applyFilters(collectEntries()); renderFolderExplorer(collectEntries());
          DS.scheduleRun?.({ priority: "slow", source: "bot-folder-explorer-open" });
        });
        const configure = document.createElement("button"); configure.type = "button";
        configure.className = "ds-bot-explorer-cover-settings";
        configure.textContent = "✎";
        configure.title = `Change folder picture for ${name}`;
        configure.setAttribute("aria-label", `Change folder picture for ${name}`);
        configure.addEventListener("click", () => openFolderCoverEditor(name, collectEntries()));
        tile.append(btn, configure); tiles.append(tile);
      }
      if (!collections.length) {
        const empty = document.createElement("small"); empty.textContent = "No private folders yet. Create one using the bottom organizer menu."; tiles.append(empty);
      }
      panel.append(tiles);
    }
    const help = document.createElement("small");
    help.className = "ds-bot-explorer-help";
    help.textContent = explorerView === "root" ? "Unfoldered bots below · folders are local to QoL" : "Showing loaded bots only · use the bottom toolbar to organize or move bots";
    panel.append(help);
  }

  function makeSelect(options, currentValue, aria) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", aria);
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = currentValue;
    return select;
  }

  function selectedEntries() {
    return collectEntries().filter(entry => selectedIds.has(entry.id));
  }

  function chooseCollection() {
    const collections = visibleCollections();
    if (!collections.length) {
      window.alert("Create at least one chatbot folder first.");
      return "";
    }
    const answer = window.prompt(`Folder name:\n${collections.join(", ")}`, collections[0]);
    const chosen = clean(answer);
    if (!chosen) return "";
    const exact = collections.find(item => item.toLowerCase() === chosen.toLowerCase());
    if (!exact) {
      window.alert("That folder is not configured yet.");
      return "";
    }
    return exact;
  }

  async function bulkAddCollection() {
    const collection = chooseCollection();
    if (!collection) return;
    const beforeStore = JSON.parse(JSON.stringify(store()));
    const next = store();
    for (const entry of selectedEntries()) {
      const current = dataFor(entry.id);
      next.meta[entry.id] = {
        ...current,
        ...entry,
        card: undefined,
        anchor: undefined,
        collections: unique([...(current.collections || []), collection]),
        updatedAt: Date.now()
      };
      delete next.meta[entry.id].card;
      delete next.meta[entry.id].anchor;
    }
    await saveStore(next);
    await DS.recordLocalChange?.(`Added ${selectedIds.size} bot${selectedIds.size === 1 ? "" : "s"} to folder: ${collection}`, { [DS.BOT_ORGANIZER_KEY]: beforeStore }, { [DS.BOT_ORGANIZER_KEY]: next });
    DS.scheduleRun?.({ priority: "slow", source: "bot-bulk-collection" });
  }

  async function bulkAddTag() {
    const tag = clean(window.prompt("Personal tag to add to selected bots:", ""));
    if (!tag) return;
    const beforeStore = JSON.parse(JSON.stringify(store()));
    const next = store();
    for (const entry of selectedEntries()) {
      const current = dataFor(entry.id);
      next.meta[entry.id] = {
        ...current,
        id: entry.id,
        name: entry.name,
        image: entry.image,
        creator: entry.creator,
        chatUrl: entry.chatUrl,
        profileUrl: entry.profileUrl,
        tags: unique([...(current.tags || []), tag]).slice(0, 40),
        updatedAt: Date.now()
      };
    }
    await saveStore(next);
    await DS.recordLocalChange?.(`Added personal tag: ${tag}`, { [DS.BOT_ORGANIZER_KEY]: beforeStore }, { [DS.BOT_ORGANIZER_KEY]: next });
    DS.scheduleRun?.({ priority: "slow", source: "bot-bulk-tag" });
  }

  async function bulkSetStatus() {
    if (!DS.isMyCreationsChatbotsPage?.()) return;
    const beforeStore = JSON.parse(JSON.stringify(store()));
    const raw = clean(window.prompt("Creator status: needs-work, testing, finished, or blank to clear", "testing")).toLowerCase();
    if (raw && !Object.prototype.hasOwnProperty.call(STATUS_LABELS, raw)) {
      window.alert("Use needs-work, testing, finished, or leave it blank.");
      return;
    }
    const next = store();
    for (const entry of selectedEntries()) {
      const current = dataFor(entry.id);
      next.meta[entry.id] = {
        ...current,
        id: entry.id,
        name: entry.name,
        image: entry.image,
        creator: entry.creator,
        chatUrl: entry.chatUrl,
        profileUrl: entry.profileUrl,
        status: raw,
        updatedAt: Date.now()
      };
      if (!hasLocalData(next.meta[entry.id])) delete next.meta[entry.id];
    }
    await saveStore(next);
    await DS.recordLocalChange?.(`Changed creator status for selected bots`, { [DS.BOT_ORGANIZER_KEY]: beforeStore }, { [DS.BOT_ORGANIZER_KEY]: next });
    DS.scheduleRun?.({ priority: "slow", source: "bot-bulk-status" });
  }

  async function bulkLater() {
    const entries = selectedEntries();
    if (!entries.length) return;
    const later = DS.state.laterBots || { ids: [], meta: {} };
    later.ids = unique([...(later.ids || []), ...entries.map(entry => entry.id)]);
    later.meta = later.meta && typeof later.meta === "object" ? later.meta : {};
    for (const entry of entries) {
      later.meta[entry.id] = {
        ...(later.meta[entry.id] || {}),
        id: entry.id,
        name: entry.name,
        image: entry.image,
        creator: entry.creator,
        chatUrl: entry.chatUrl,
        profileUrl: entry.profileUrl,
        savedAt: later.meta[entry.id]?.savedAt || Date.now()
      };
    }
    await DS.saveLaterBots?.(later);
    DS.setQuickStatus?.(`Saved ${entries.length} selected bot${entries.length === 1 ? "" : "s"} to Later.`);
  }

  async function bulkCopyLinks() {
    const links = selectedEntries().map(entry => entry.profileUrl || entry.chatUrl).filter(Boolean);
    if (!links.length) return;
    const text = links.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      DS.setQuickStatus?.(`Copied ${links.length} bot link${links.length === 1 ? "" : "s"}.`);
    } catch {
      window.prompt("Copy selected bot links:", text);
    }
  }

  function actionButton(text, handler, cls = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    if (cls) button.className = cls;
    button.addEventListener("click", handler);
    return button;
  }

  function ensureToolbar() {
    const settings = DS.state.settings || {};
    let toolbar = document.getElementById("ds-bot-organizer-toolbar");
    if (!settings.enabled || !settings.enableBotOrganizer) {
      toolbar?.remove();
      return null;
    }

    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "ds-bot-organizer-toolbar";
      toolbar.className = "ds-bot-organizer-toolbar";
      document.body.appendChild(toolbar);
    }

    const scope = pageFolderScope();
    const collections = visibleCollections();
    const isMyCreations = scope === "chatbots";
    const isFolderPage = !!scope;
    if (latestFolderPage !== scope) {
      latestFolderPage = scope;
      explorerView = "root";
      filterCollection = "all";
      newFolderScope = scope;
    }
    if (filterCollection !== "all" && filterCollection !== "__unfoldered__" && !collections.includes(filterCollection)) {
      filterCollection = "all";
    }

    // Do not rebuild this toolbar on every scheduler pass. Replacing its
    // children while a native <select> is open immediately closes that menu
    // (and also steals focus from the search box), which made the folder picker
    // look like it was opening and closing by itself. Only rebuild when the
    // controls that actually determine the toolbar structure change.
    const toolbarSignature = JSON.stringify({
      collections,
      isMyCreations,
      isFolderPage,
      scope,
      bulkTools: !!settings.botOrganizerBulkTools,
      bulkMode: !!bulkMode,
      filterCollection
    });
    if (toolbar.dataset.dsToolbarSignature === toolbarSignature && toolbar.childElementCount) {
      return toolbar;
    }
    toolbar.dataset.dsToolbarSignature = toolbarSignature;
    toolbar.replaceChildren();

    const collectionSelect = makeSelect(
      [["all", "All folders"], ["__unfoldered__", "Unfoldered"], ...collections.map(item => [item, item])],
      (filterCollection === "__unfoldered__" || collections.includes(filterCollection)) ? filterCollection : "all",
      "Filter by local chatbot folder"
    );
    filterCollection = collectionSelect.value;
    collectionSelect.addEventListener("change", () => {
      filterCollection = collectionSelect.value;
      explorerView = filterCollection === "all" ? "all" : "folder";
      renderFolderExplorer(collectEntries());
      applyFilters(collectEntries());
      DS.scheduleRun?.({ priority: "slow", source: "bot-folder-filter-change" });
    });

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search local notes/tags";
    search.value = filterQuery;
    search.setAttribute("aria-label", "Search bot organizer notes and tags");
    search.addEventListener("input", () => {
      filterQuery = clean(search.value).toLowerCase();
      applyFilters(collectEntries());
    });

    if (isFolderPage) toolbar.append(collectionSelect);

    if (isFolderPage) {
      const location = makeSelect([
        [scope, scope === "favorites" ? "New: Favorites" : "New: My Chatbots"],
        ["shared", "New: Shared"],
        [scope === "favorites" ? "chatbots" : "favorites", scope === "favorites" ? "New: My Chatbots" : "New: Favorites"]
      ], newFolderScope || scope, "New folder location");
      location.addEventListener("change", () => { newFolderScope = location.value; });
      toolbar.append(location);
      toolbar.appendChild(actionButton("+ Folder", createFolder));
      if (filterCollection !== "all" && filterCollection !== "__unfoldered__") {
        toolbar.append(
          actionButton("Rename folder", renameCurrentFolder),
          actionButton("Delete folder", deleteCurrentFolder, "ds-bot-org-danger")
        );
      }
    }

    toolbar.append(search);

    if (isMyCreations) {
      const statusSelect = makeSelect([
        ["all", "All statuses"],
        ["needs-work", "Needs work"],
        ["testing", "Testing"],
        ["finished", "Finished"],
        ["none", "No status"]
      ], filterStatus, "Filter by local creator status");
      statusSelect.addEventListener("change", () => {
        filterStatus = statusSelect.value;
        applyFilters(collectEntries());
      });
      toolbar.appendChild(statusSelect);
    } else {
      filterStatus = "all";
    }

    if (settings.botOrganizerBulkTools) {
      const toggle = actionButton(bulkMode ? "Exit bulk" : "Select bots", () => {
        bulkMode = !bulkMode;
        if (!bulkMode) selectedIds.clear();
        DS.scheduleRun?.({ priority: "slow", source: "bot-organizer-bulk-toggle" });
      }, bulkMode ? "ds-bot-org-primary" : "");
      toolbar.appendChild(toggle);

      if (bulkMode) {
        const selected = document.createElement("span");
        selected.className = "ds-bot-bulk-count";
        selected.dataset.dsSelectedCount = "1";
        selected.textContent = `${selectedIds.size} selected`;
        toolbar.append(
          selected,
          ...(isFolderPage ? [actionButton("Folder…", bulkAddCollection)] : []),
          actionButton("Tag…", bulkAddTag),
          actionButton("Later", bulkLater),
          actionButton("Copy links", bulkCopyLinks)
        );
        if (isMyCreations) toolbar.appendChild(actionButton("Status…", bulkSetStatus));
        toolbar.appendChild(actionButton("Clear", () => {
          selectedIds.clear();
          refreshSelectionUi();
        }));
      }
    }

    return toolbar;
  }

  function refreshSelectionUi() {
    const entries = collectEntries();
    for (const entry of entries) ensureBulkSelector(entry);
    const count = document.querySelector("#ds-bot-organizer-toolbar [data-ds-selected-count='1']");
    if (count) count.textContent = `${selectedIds.size} selected`;
  }

  function stableOrganizerListingRoute() {
    const page = DS.getPageState?.() || {};
    if (page.isSingleChatPage || page.isBotProfilePage || page.isBotEditor || page.isLorebookEditor || page.isPersonaPage || page.isChatListPage) return false;
    if (page.routeType === "listing" || page.routeType === "creator-listing") return true;
    if (page.isFavoriteBotsPage || page.isMyCreationsChatbotsPage) return true;
    const path = String(page.path || location.pathname || "");
    return /^\/(?:creator|recommended-bots|search|discover|trending)(?:\/|$)/i.test(path);
  }

  function currentPageEntry() {
    let id = "";
    const chatMatch = location.pathname.match(/^\/chat\/([^/?#]+)/i);
    const profileMatch = location.pathname.match(/^\/chatbot\/([^/?#]+)/i);
    id = decodeURIComponent(chatMatch?.[1] || profileMatch?.[1] || "");
    if (!id) return null;
    const profileAnchor = document.querySelector(`a[href*='/chatbot/${CSS.escape(id)}']`);
    const creatorAnchor = document.querySelector("a[aria-label='creator-profile'], a[href*='/creator/']");
    const h1 = document.querySelector("h1");
    const image = document.querySelector("a[aria-label='chatbot-profile'] img, main img[alt], [data-testid='PageStaticMetaTags'] ~ * img[alt]");
    return {
      id,
      name: clean(h1?.textContent || document.title.replace(/^Chat with\s+/i, "").replace(/\s+on Spicychat.*$/i, "") || id),
      image: clean(image?.src || ""),
      creator: clean(creatorAnchor?.textContent || ""),
      chatUrl: chatMatch ? location.href : `${location.origin}/chat/${id}`,
      profileUrl: profileMatch ? location.href : (profileAnchor?.href || `${location.origin}/chatbot/${id}`)
    };
  }

  function ensureContextOrganizerButton() {
    const settings = DS.state.settings || {};
    let button = document.getElementById("ds-bot-organizer-context-button");
    if (!settings.enabled || !settings.enableBotOrganizer || (!DS.isSingleChatPage?.() && !DS.isBotProfilePage?.())) {
      button?.remove();
      return;
    }
    const entry = currentPageEntry();
    if (!entry) return;
    if (button && button.dataset.dsBotId !== entry.id) { button.remove(); button = null; }
    if (!button) {
      button = makeOrganizeButton(entry);
      button.id = "ds-bot-organizer-context-button";
      button.classList.add("ds-bot-organizer-context-button");
    }
    button.dataset.dsBotId = entry.id;
    button.setAttribute("aria-label", `Private note / tags for ${entry.name || "bot"}`);
    button.title = "Private note / personal tags / folders";
    // Prefer the smallest stable title/action host. React often replaces the
    // larger chat/profile header wrapper; attaching two levels above the h1 made
    // this button disappear and reappear during those remounts.
    const profile = document.querySelector("a[aria-label='chatbot-profile'][href*='/chatbot/']");
    const title = profile?.querySelector?.("h1") || document.querySelector("h1");
    const chatActions = profile?.parentElement?.querySelector?.(":scope > .ds-chat-title-buttons");
    const host = chatActions || profile?.parentElement || title?.parentElement;
    if (!host) return;
    if (button.parentElement !== host) host.appendChild(button);
  }

  // On coarse/mobile pointers, bulk mode becomes a deliberate selection mode.
  // Tapping anywhere on the card selects it and native card actions (especially
  // the very-near Favorite heart on Firefox Android) cannot fire accidentally.
  let mobileBulkListenerAttached = false;
  function onMobileBulkSelectionClick(event) {
    if (!DS.state?.settings?.enabled || !DS.state?.settings?.enableBotOrganizer || !bulkMode || !mobileBulkMode()) return;
    if (event.target?.closest?.(".ds-bot-bulk-select, #ds-bot-organizer-toolbar, .ds-bot-organizer-popover")) return;
    const card = event.target?.closest?.("[data-ds-bulk-bot-id]");
    const id = clean(card?.dataset?.dsBulkBotId || "");
    if (!card || !id) return;

    // Let users inspect the bot while mobile bulk selection is active. Other
    // native card actions (especially Favorite/unfavorite) remain intercepted
    // so a selection tap cannot accidentally change the public Favorite state.
    if (DS.state?.settings?.botOrganizerMobileBulkAllowProfile !== false) {
      const profileControl = DS.findCardProfileButton?.(card);
      if (profileControl && (profileControl === event.target || profileControl.contains?.(event.target))) return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    toggleBulkEntry({ id, card });
  }
  function setMobileBulkListener(active) {
    if (active === mobileBulkListenerAttached) return;
    if (active) document.addEventListener("click", onMobileBulkSelectionClick, true);
    else document.removeEventListener("click", onMobileBulkSelectionClick, true);
    mobileBulkListenerAttached = active;
  }

  DS.removeBotOrganizer = function removeBotOrganizer() {
    setMobileBulkListener(false);
    closePopover();
    document.getElementById("ds-bot-organizer-toolbar")?.remove();
    document.getElementById("ds-bot-organizer-explorer")?.remove();
    document.getElementById("ds-bot-explorer-cover-editor")?.remove();
    document.querySelectorAll(".ds-bot-organizer-explorer-grid").forEach(grid => grid.classList.remove("ds-bot-organizer-explorer-grid"));
    document.getElementById("ds-bot-organizer-context-button")?.remove();
    for (const card of DS.qsa?.(".ds-bot-org-filter-hidden, .ds-bot-org-selected, [data-ds-bot-organizer-card]") || []) {
      card.classList.remove("ds-bot-org-filter-hidden", "ds-bot-org-selected", "ds-bot-org-mobile-bulk");
      delete card.dataset.dsBotOrganizerCard;
      delete card.dataset.dsBulkBotId;
    }
    for (const el of DS.qsa?.(".ds-bot-org-filter-hidden") || []) el.classList.remove("ds-bot-org-filter-hidden");
    for (const el of DS.qsa?.(".ds-bot-organizer-button, .ds-bot-local-meta, .ds-bot-bulk-select") || []) el.remove();
    bulkMode = false;
    selectedIds.clear();
    DS.state.botOrganizerWasActive = false;
  };

  DS.applyBotOrganizer = function applyBotOrganizer() {
    const settings = DS.state.settings || {};
    const contextPage = !!(DS.isSingleChatPage?.() || DS.isBotProfilePage?.());
    const hasCards = !!DS.qs?.("a[href*='/chat/'], a[href*='/chatbot/']");
    // Keep the organizer alive across temporary React listing remounts. During
    // those remounts every card can disappear for a moment; the old DOM-based
    // route test treated that as leaving the listing and closed the open folder
    // menu/removed the launcher before recreating it a moment later.
    const listing = !contextPage && (stableOrganizerListingRoute() || hasCards);
    if (!settings.enabled || !settings.enableBotOrganizer || (!listing && !contextPage)) {
      if (DS.state.botOrganizerWasActive || mobileBulkListenerAttached || document.querySelector("#ds-bot-organizer-toolbar, #ds-bot-organizer-context-button, #ds-bot-organizer-explorer, .ds-bot-org-filter-hidden, [data-ds-bot-organizer-card]")) DS.removeBotOrganizer?.();
      return;
    }

    DS.state.botOrganizerWasActive = true;
    // The capture listener is only needed while organizing listing cards.
    setMobileBulkListener(!contextPage);
    if (contextPage) {
      document.getElementById("ds-bot-organizer-toolbar")?.remove();
      ensureContextOrganizerButton();
      return;
    }

    document.getElementById("ds-bot-organizer-context-button")?.remove();
    const entries = collectEntries();
    ensureToolbar();
    renderFolderExplorer(entries);
    // An empty card array can be a transient React remount. Do not clear the
    // active fixed popover or reset its state; just wait for the cards to return.
    if (!entries.length) return;
    applyFilters(entries);

    for (const entry of entries) {
      entry.card.dataset.dsBotOrganizerCard = "1";
      ensureOrganizeButton(entry);
      ensureLocalMeta(entry);
      ensureBulkSelector(entry);
    }

    const loaded = new Set(entries.map(entry => entry.id));
    selectedIds = new Set([...selectedIds].filter(id => loaded.has(id)));
    refreshSelectionUi();
  };
})();

}
