(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  let bulkMode = false;
  let selectedIds = new Set();
  let filterCollection = "all";
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

  function parseConfiguredCollections() {
    return unique(String(DS.state.settings?.botCollections || "")
      .split(/[\n,]+/g));
  }

  async function saveConfiguredCollections(collections) {
    const next = unique(collections);
    const settings = { ...(DS.state.settings || {}), botCollections: next.join("\n") };
    DS.state.settings = settings;
    await DS.storageSet?.({ settings });
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
    await saveConfiguredCollections([...current, name]);
    await DS.recordLocalChange?.(`Created chatbot folder: ${name}`, { settings: beforeSettings }, { settings: { ...(DS.state.settings || {}) } });
    filterCollection = name;
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
    await saveStore(nextStore);
    await saveConfiguredCollections(current.filter(item => item !== folder));
    await DS.recordLocalChange?.(`Deleted chatbot folder: ${folder}`, { [DS.BOT_ORGANIZER_KEY]: beforeStore, settings: beforeSettings }, { [DS.BOT_ORGANIZER_KEY]: nextStore, settings: { ...(DS.state.settings || {}) } });
    filterCollection = "all";
    DS.scheduleRun?.({ priority: "slow", source: "bot-folder-delete" });
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

    return { meta: output };
  }

  function store() {
    DS.state.botOrganization = normalizeStore(DS.state.botOrganization);
    return DS.state.botOrganization;
  }

  async function saveStore(next = store()) {
    DS.state.botOrganization = normalizeStore(next);
    if (typeof DS.saveBotOrganization === "function") {
      await DS.saveBotOrganization(DS.state.botOrganization);
    } else {
      await DS.storageSet?.({ [DS.BOT_ORGANIZER_KEY || "botOrganization"]: DS.state.botOrganization });
    }
  }

  function cardCreator(card) {
    const link = card?.querySelector?.("a[href*='/creator/']");
    if (!link) return "";
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/creator\/([^/?#]+)/i);
    return match?.[1] ? `@${decodeURIComponent(match[1])}` : clean(link.textContent);
  }

  function entryFrom(card, anchor) {
    const id = DS.botIdFromHref?.(anchor?.href || "") || "";
    if (!id) return null;

    const base = DS.makeBotMeta?.({ id, card, anchor }) || {};
    return {
      id,
      card,
      anchor,
      name: clean(base.name || DS.getCardTitle?.(card) || id),
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
    if (!entry?.card || entry.card.querySelector(".ds-bot-organizer-button")) return;

    const button = makeOrganizeButton(entry);
    const inline = findInlineHost(entry.card);
    if (inline?.host) {
      inline.host.classList.remove("ds-bot-organizer-inline-host");
      inline.after.insertAdjacentElement("afterend", button);
      return;
    }

    if (getComputedStyle(entry.card).position === "static") entry.card.style.position = "relative";
    button.classList.add("ds-bot-organizer-button-floating");
    entry.card.appendChild(button);
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

    if (!settings.botOrganizerShowCardMeta || !hasLocalData(data)) {
      host?.remove();
      return;
    }

    if (!host) {
      host = document.createElement("div");
      host.className = "ds-bot-local-meta";
      const inline = findInlineHost(entry.card);
      if (inline?.host) inline.host.insertAdjacentElement("afterend", host);
      else entry.card.appendChild(host);
    }

    host.replaceChildren();

    if (data.status) host.appendChild(makeChip(STATUS_LABELS[data.status] || data.status, `ds-bot-status-${data.status}`));
    for (const collection of (data.collections || []).slice(0, 2)) host.appendChild(makeChip(`📁 ${collection}`));
    for (const tag of (data.tags || []).slice(0, 2)) host.appendChild(makeChip(`#${tag}`));

    if (data.note) {
      const note = document.createElement("span");
      note.className = "ds-bot-local-note";
      note.textContent = data.note;
      note.title = data.note;
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
    const collections = parseConfiguredCollections();
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

    if (collections.length) {
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
      empty.textContent = "Create folders here or in Settings → Saved Lists → Bot Organizer.";
      collectionBox.appendChild(empty);
    }
    body.appendChild(collectionBox);

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
      const chosenCollections = [...collectionBox.querySelectorAll("input[type='checkbox']:checked")]
        .map(input => input.value);
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
    if (filterCollection === "__unfoldered__") {
      if ((data.collections || []).length) return true;
    } else if (filterCollection !== "all" && !(data.collections || []).includes(filterCollection)) return true;
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
      entry.card.classList.toggle("ds-bot-org-filter-hidden", isFilteredOut(entry));
    }
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
    const collections = parseConfiguredCollections();
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

    const collections = parseConfiguredCollections();
    const isMyCreations = !!DS.isMyCreationsChatbotsPage?.();
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

    toolbar.append(collectionSelect);

    if (isMyCreations) {
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
          actionButton("Folder…", bulkAddCollection),
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
  document.addEventListener("click", event => {
    if (!bulkMode || !mobileBulkMode()) return;
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
  }, true);

  DS.removeBotOrganizer = function removeBotOrganizer() {
    closePopover();
    document.getElementById("ds-bot-organizer-toolbar")?.remove();
    document.getElementById("ds-bot-organizer-context-button")?.remove();
    for (const card of DS.qsa?.(".ds-bot-org-filter-hidden, .ds-bot-org-selected, [data-ds-bot-organizer-card]") || []) {
      card.classList.remove("ds-bot-org-filter-hidden", "ds-bot-org-selected", "ds-bot-org-mobile-bulk");
      delete card.dataset.dsBotOrganizerCard;
      delete card.dataset.dsBulkBotId;
    }
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
      if (DS.state.botOrganizerWasActive || document.getElementById("ds-bot-organizer-toolbar") || document.getElementById("ds-bot-organizer-context-button")) DS.removeBotOrganizer?.();
      return;
    }

    DS.state.botOrganizerWasActive = true;
    if (contextPage) {
      document.getElementById("ds-bot-organizer-toolbar")?.remove();
      ensureContextOrganizerButton();
      return;
    }

    document.getElementById("ds-bot-organizer-context-button")?.remove();
    const entries = collectEntries();
    ensureToolbar();
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
