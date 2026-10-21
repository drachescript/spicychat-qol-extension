// Feature-owned options helpers: saved-bot-managers. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function botEntriesFromStore(store, includeNames = true, kindlessOpenedStore = false) {
  const entries = [];
  const seen = new Set();
  const meta = store.meta || {};

  (store.ids || []).forEach((id, index) => {
    const item = meta[id] || {};
    const local = kindlessOpenedStore === true ? knownSavedBotProfile(id, item) : null;
    entries.push({
      type: "id",
      id,
      name: local?.name || bestKnownBotName(id, item.name) || (isPlaceholderBotName(item.name, id) ? "Unknown bot" : item.name) || id,
      title: local?.title || item.title || "",
      greeting: local?.greeting || item.greeting || "",
      image: local?.image || item.image || "",
      creator: local?.creator || item.creator || item.creatorName || item.creatorHandle || "",
      description: local?.description || item.description || "",
      profileUrl: item.profileUrl || (id ? `https://spicychat.ai/chatbot/${id}` : ""),
      chatUrl: item.chatUrl || (id ? `https://spicychat.ai/chat/${id}` : ""),
      savedAt: Number(item.savedAt || 0) || 0,
      index
    });
    seen.add(`id:${id}`);
  });

  if (includeNames) {
    (store.names || []).forEach((name, index) => {
      if (seen.has(`name:${name.toLowerCase()}`)) return;
      const item = meta[`name:${name}`] || meta[name] || {};
      entries.push({
        type: "name",
        id: "",
        name,
        image: "",
        profileUrl: "",
        chatUrl: "",
        savedAt: Number(item.savedAt || 0) || 0,
        index: (store.ids || []).length + index
      });
    });
  }

  return entries;
}

function managerElementId(kind, suffix) {
  const prefixes = {
    blocked: "blockedBot",
    notInterested: "notInterestedBot",
    later: "laterBot",
    favorite: "favoriteBot",
    opened: "openedBot"
  };

  return `${prefixes[kind] || prefixes.notInterested}${suffix}`;
}

function storeForManagerKind(kind) {
  if (kind === "opened") return openedStoreFromState();
  if (kind === "later") return laterBotState;
  if (kind === "favorite") return favoriteBotState;
  if (kind === "blocked") return blockedState;
  return notInterestedState;
}

function updateBotManagerSummary(kind, total, filtered, shown) {
  const summary = $(managerElementId(kind, "ManagerSummary"));
  if (!summary) return;

  if (!total) {
    summary.textContent = "0 saved";
    return;
  }

  if (filtered !== total) {
    summary.textContent = `${filtered} match${filtered === 1 ? "" : "es"} of ${total}, showing ${shown}`;
  } else {
    summary.textContent = `${total} saved, showing ${shown}`;
  }
}

function getBotManagerSearch(kind) {
  const input = $(managerElementId(kind, "Search"));
  return splitManagerSearchTerms(input?.value || botManagerUiState[kind]?.query || "");
}

function getBotSortMode(kind) {
  const settingKeys = {
    blocked: "blockedBotSortMode",
    later: "laterBotSortMode",
    favorite: "favoriteBotSortMode",
    opened: "openedBotSortMode"
  };
  const key = settingKeys[kind];
  if (!key) return "newest";

  const selected = value(key, DEFAULT_SETTINGS[key] || "newest");
  return ["newest", "oldest", "name-asc", "name-desc", "creator-asc", "creator-desc"].includes(selected)
    ? selected
    : "newest";
}

function sortBotManagerEntries(entries, kind) {
  if (!["blocked", "later", "favorite", "opened"].includes(kind)) return entries;

  const mode = getBotSortMode(kind);
  const copy = [...entries];
  const savedTime = entry => Number(entry.savedAt || 0) || 0;
  const originalIndex = entry => Number(entry.index || 0) || 0;
  const nameValue = entry => String(entry.name || entry.id || "").toLowerCase();

  if (mode === "oldest") {
    return copy.sort((a, b) => savedTime(a) - savedTime(b) || originalIndex(a) - originalIndex(b));
  }

  if (mode === "name-asc") {
    return copy.sort((a, b) => nameValue(a).localeCompare(nameValue(b)) || originalIndex(a) - originalIndex(b));
  }

  if (mode === "name-desc") {
    return copy.sort((a, b) => nameValue(b).localeCompare(nameValue(a)) || originalIndex(a) - originalIndex(b));
  }

  const creatorValue = entry => String(entry.creator || "").replace(/^@/, "").toLowerCase();
  if (mode === "creator-asc") {
    return copy.sort((a, b) => creatorValue(a).localeCompare(creatorValue(b)) || nameValue(a).localeCompare(nameValue(b)));
  }
  if (mode === "creator-desc") {
    return copy.sort((a, b) => creatorValue(b).localeCompare(creatorValue(a)) || nameValue(a).localeCompare(nameValue(b)));
  }

  return copy.sort((a, b) => savedTime(b) - savedTime(a) || originalIndex(b) - originalIndex(a));
}

function managerOrganizerMeta(entry) {
  const id = String(entry?.id || "").trim();
  return id ? (botOrganizationState?.meta?.[id] || {}) : {};
}

function refreshBotManagerFolderOptions(kind) {
  if (!["favorite", "later"].includes(kind)) return;
  const select = $(managerElementId(kind, "FolderFilter"));
  if (!select) return;

  const previous = String(select.value || loadedSettingsSnapshot?.[`${kind}BotFolderFilter`] || "all");
  const folders = new Set();
  Object.values(botOrganizationState?.meta || {}).forEach(meta => {
    uniqueClean(meta?.collections || []).forEach(folder => folders.add(folder));
  });

  const options = [
    ["all", "All folders"],
    ["__unfoldered__", "Unfoldered"],
    ...[...folders].sort((a, b) => a.localeCompare(b)).map(folder => [folder, folder])
  ];

  select.replaceChildren(...options.map(([value, label]) => makeElement("option", {
    text: label,
    attrs: { value }
  })));
  select.value = options.some(([value]) => value === previous) ? previous : "all";
}

function managerEntryBlocked(entry) {
  const id = String(entry?.id || "").trim();
  const name = String(entry?.name || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (id && (blockedState?.ids || []).includes(id)) return true;
  if (!name) return false;
  return (blockedState?.names || []).some(value => String(value || "").replace(/\s+/g, " ").trim().toLowerCase() === name);
}

function managerEntryOpened(entry) {
  const id = String(entry?.id || "").trim();
  return !!(id && currentOpened.includes(id) && !managerEntryBlocked(entry));
}

function managerExtraFilter(entry, kind) {
  const id = String(entry?.id || "").trim();

  if (kind === "blocked") {
    const dislikeFilter = value("blockedBotDislikeFilter", "all");
    const lessLikeFilter = value("blockedBotLessLikeFilter", "all");
    const dislikeHandled = !!quickDislikeHistoryEntry(id);
    const lessLikeHandled = !!quickLessLikeHistoryEntry(id);
    if (dislikeFilter === "handled" && !dislikeHandled) return false;
    if (dislikeFilter === "remaining" && dislikeHandled) return false;
    if (lessLikeFilter === "handled" && !lessLikeHandled) return false;
    if (lessLikeFilter === "remaining" && lessLikeHandled) return false;
    return true;
  }

  if (!["favorite", "later"].includes(kind)) return true;
  if (!id) return true;

  const relation = value(managerElementId(kind, "RelationFilter"), "all");
  if (kind === "favorite") {
    const inLater = (laterBotState?.ids || []).includes(id);
    if (relation === "later" && !inLater) return false;
    if (relation === "not-later" && inLater) return false;
  } else {
    const inFavorites = (favoriteBotState?.ids || []).includes(id);
    if (relation === "favorite" && !inFavorites) return false;
    if (relation === "not-favorite" && inFavorites) return false;
  }

  const folder = value(managerElementId(kind, "FolderFilter"), "all");
  if (folder !== "all") {
    const collections = uniqueClean(managerOrganizerMeta(entry)?.collections || []);
    if (folder === "__unfoldered__" && collections.length) return false;
    if (folder !== "__unfoldered__" && !collections.includes(folder)) return false;
  }

  const creatorQuery = String(value(managerElementId(kind, "CreatorFilter"), "") || "").replace(/^@/, "").trim().toLowerCase();
  if (creatorQuery) {
    const creator = String(entry.creator || "").replace(/^@/, "").toLowerCase();
    if (!creator.includes(creatorQuery)) return false;
  }

  const state = value(managerElementId(kind, "StateFilter"), "all");
  if (state === "blocked" && !managerEntryBlocked(entry)) return false;
  if (state === "opened" && !managerEntryOpened(entry)) return false;
  if (state === "unopened" && (managerEntryOpened(entry) || managerEntryBlocked(entry))) return false;
  if (state === "available" && managerEntryBlocked(entry)) return false;

  return true;
}

function getBotManagerEntries(kind, baseEntries = null) {
  const isBlocked = kind === "blocked";
  const entries = Array.isArray(baseEntries)
    ? baseEntries
    : botEntriesFromStore(storeForManagerKind(kind), isBlocked);
  const queryTerms = getBotManagerSearch(kind);

  const filtered = entries.filter(entry => {
    if (!managerExtraFilter(entry, kind)) return false;
    if (!queryTerms.length) return true;

    const organizer = managerOrganizerMeta(entry);
    const haystack = [
      entry.name,
      entry.id,
      entry.chatUrl,
      entry.profileUrl,
      entry.creator,
      entry.description,
      entry.type,
      ...(organizer.collections || []),
      ...(organizer.tags || []),
      organizer.note || "",
      organizer.status || ""
    ]
      .join(" ")
      .toLowerCase();

    return managerHaystackMatchesTerms(haystack, queryTerms);
  });

  return sortBotManagerEntries(filtered, kind);
}

function botManagerBulkSet(kind) {
  if (!botManagerBulkSelection[kind]) botManagerBulkSelection[kind] = new Set();
  return botManagerBulkSelection[kind];
}

function botManagerShownEntries(kind) {
  const entries = getBotManagerEntries(kind);
  const limit = Math.max(1, Math.min(5000, Number(botManagerUiState[kind]?.visible || 20) || 20));
  return entries.slice(0, limit);
}

function updateBotManagerBulkCount(kind) {
  if (!["blocked", "favorite", "later"].includes(kind)) return;
  const validIds = new Set(botEntriesFromStore(storeForManagerKind(kind), false).map(entry => String(entry.id || "")).filter(Boolean));
  const selected = botManagerBulkSet(kind);
  for (const id of [...selected]) if (!validIds.has(id)) selected.delete(id);
  const count = $(managerElementId(kind, "SelectedCount"));
  if (count) count.textContent = `${selected.size} selected`;
}

function botManagerEntryForId(kind, id) {
  return botEntriesFromStore(storeForManagerKind(kind), false).find(entry => entry.id === id) || { id, name: id };
}

function ensureOrganizerMetaForEntry(entry) {
  const id = String(entry?.id || "").trim();
  if (!id) return null;
  botOrganizationState = normalizeBotOrganization(botOrganizationState);
  const previous = botOrganizationState.meta[id] || {};
  botOrganizationState.meta[id] = {
    ...previous,
    id,
    name: entry.name || previous.name || id,
    image: entry.image || previous.image || "",
    creator: entry.creator || previous.creator || "",
    chatUrl: entry.chatUrl || previous.chatUrl || `https://spicychat.ai/chat/${id}`,
    profileUrl: entry.profileUrl || previous.profileUrl || `https://spicychat.ai/chatbot/${id}`,
    collections: uniqueClean(previous.collections || []),
    tags: uniqueClean(previous.tags || []).slice(0, 40),
    note: String(previous.note || "").replace(/\s+/g, " ").trim().slice(0, 1000),
    status: ["needs-work", "testing", "finished"].includes(previous.status) ? previous.status : "",
    updatedAt: Date.now()
  };
  return botOrganizationState.meta[id];
}

function organizerMetaHasContent(meta) {
  return !!(meta && (
    uniqueClean(meta.collections || []).length ||
    uniqueClean(meta.tags || []).length ||
    String(meta.note || "").trim() ||
    String(meta.status || "").trim()
  ));
}

function configuredBotFolders() {
  return uniqueClean(String($("botCollections")?.value || loadedSettingsSnapshot?.botCollections || "").split(/[\n,]+/g));
}

function chooseSavedManagerFolder(promptText = "Folder name") {
  const folders = configuredBotFolders();
  if (!folders.length) {
    showSettingsToast("Create at least one Bot Organizer folder first.");
    return "";
  }
  const raw = String(window.prompt(`${promptText}:\n${folders.join(", ")}`, folders[0]) || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const exact = folders.find(folder => folder.toLowerCase() === raw.toLowerCase());
  if (!exact) {
    showSettingsToast("That Bot Organizer folder is not configured.");
    return "";
  }
  return exact;
}

async function persistSavedManagerBulk(keys = []) {
  const payload = {};
  if (keys.includes("favorite")) {
    favoriteBotState = normalizeBotStore(favoriteBotState);
    payload[FAVORITE_BOTS_KEY] = favoriteBotState;
    dirtySavedStores.delete("favorite");
  }
  if (keys.includes("later")) {
    laterBotState = normalizeBotStore(laterBotState);
    payload[LATER_BOTS_KEY] = laterBotState;
    dirtySavedStores.delete("later");
  }
  if (keys.includes("organizer")) {
    botOrganizationState = normalizeBotOrganization(botOrganizationState);
    payload[BOT_ORGANIZER_KEY] = botOrganizationState;
  }
  if (Object.keys(payload).length) await storageSet(payload);
  refreshStorageUsageIfVisible();
}

async function applyBlockedBotBulkAction() {
  const actionSelect = $("blockedBotBulkAction");
  const action = String(actionSelect?.value || "");
  if (!action) { showSettingsToast("Choose a bulk action first."); return; }
  const selected = botManagerBulkSet("blocked");
  const entries = [...selected].map(id => botManagerEntryForId("blocked", id)).filter(entry => entry.id);
  if (!entries.length) { showSettingsToast("Select at least one blocked bot first."); return; }

  if (action === "copy-links") {
    const links = entries.map(entry => entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`);
    try { await navigator.clipboard.writeText(links.join("\n")); showSettingsToast(`Copied ${links.length} blocked bot profile link${links.length === 1 ? "" : "s"}.`); }
    catch { window.prompt("Copy selected blocked bot profile links:", links.join("\n")); }
  } else if (action === "unblock") {
    if (!window.confirm(`Unblock ${entries.length} selected bot${entries.length === 1 ? "" : "s"}?`)) return;
    blockedState = normalizeBotStore(blockedState);
    const ids = new Set(entries.map(entry => entry.id));
    await rememberAutoBlockWordExceptions([...ids]);
    blockedState.ids = blockedState.ids.filter(id => !ids.has(id));
    entries.forEach(entry => delete blockedState.meta[entry.id]);
    await storageSet({ [BLOCKED_BOTS_KEY]: blockedState });
    selected.clear();
    showSettingsToast(`Unblocked ${entries.length} bot${entries.length === 1 ? "" : "s"}.`);
  } else if (action === "dislike-selected") {
    if (actionSelect) actionSelect.value = "";
    await runBlockedBulkDislike("selected");
    return;
  } else if (action === "less-like-selected") {
    if (actionSelect) actionSelect.value = "";
    await runBlockedBulkLessLike("selected");
    return;
  }

  if (actionSelect) actionSelect.value = "";
  renderBotManager("blocked");
  renderSavedBotsHub();
}

async function applyBotManagerBulkAction(kind) {
  if (!["favorite", "later"].includes(kind)) return;
  const actionSelect = $(managerElementId(kind, "BulkAction"));
  const action = String(actionSelect?.value || "");
  if (!action) {
    showSettingsToast("Choose a bulk action first.");
    return;
  }

  const selected = botManagerBulkSet(kind);
  const entries = [...selected].map(id => botManagerEntryForId(kind, id)).filter(entry => entry.id);
  if (!entries.length) {
    showSettingsToast("Select at least one saved bot first.");
    return;
  }

  const ids = entries.map(entry => entry.id);
  const before = {
    favorite: cloneJson(favoriteBotState),
    later: cloneJson(laterBotState),
    organizer: cloneJson(botOrganizationState)
  };
  const changed = new Set();
  let message = "";

  if (action === "copy-links") {
    const links = entries.map(entry => entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`).filter(Boolean);
    try {
      await navigator.clipboard.writeText(links.join("\n"));
      showSettingsToast(`Copied ${links.length} bot profile link${links.length === 1 ? "" : "s"}.`);
    } catch {
      window.prompt("Copy selected bot profile links:", links.join("\n"));
    }
    if (actionSelect) actionSelect.value = "";
    return;
  }

  if (action === "add-later" || action === "remove-later") {
    if (kind !== "favorite") return;
    laterBotState = normalizeBotStore(laterBotState);
    const add = action === "add-later";
    for (const entry of entries) {
      if (add) {
        if (!laterBotState.ids.includes(entry.id)) laterBotState.ids.push(entry.id);
        laterBotState.meta[entry.id] = {
          ...(laterBotState.meta[entry.id] || {}),
          id: entry.id,
          name: entry.name || entry.id,
          image: entry.image || "",
          creator: entry.creator || "",
          description: entry.description || "",
          chatUrl: entry.chatUrl || `https://spicychat.ai/chat/${entry.id}`,
          profileUrl: entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`,
          savedAt: Number(laterBotState.meta[entry.id]?.savedAt) || Date.now()
        };
      } else {
        laterBotState.ids = laterBotState.ids.filter(id => id !== entry.id);
        delete laterBotState.meta[entry.id];
      }
    }
    changed.add("later");
    message = `${add ? "Added" : "Removed"} ${entries.length} bot${entries.length === 1 ? "" : "s"} ${add ? "to" : "from"} Later.`;
  } else if (["add-folder", "remove-folder"].includes(action)) {
    const folder = chooseSavedManagerFolder(action === "add-folder" ? "Folder to add" : "Folder to remove");
    if (!folder) return;
    const add = action === "add-folder";
    for (const entry of entries) {
      const meta = ensureOrganizerMetaForEntry(entry);
      if (!meta) continue;
      meta.collections = add
        ? uniqueClean([...(meta.collections || []), folder])
        : uniqueClean((meta.collections || []).filter(item => item !== folder));
      meta.updatedAt = Date.now();
      if (!organizerMetaHasContent(meta)) delete botOrganizationState.meta[entry.id];
    }
    changed.add("organizer");
    message = `${add ? "Added" : "Removed"} ${entries.length} bot${entries.length === 1 ? "" : "s"} ${add ? "to" : "from"} folder ${folder}.`;
  } else if (["add-tag", "remove-tag"].includes(action)) {
    const raw = String(window.prompt(action === "add-tag" ? "Personal tag to add:" : "Personal tag to remove:", "") || "").replace(/\s+/g, " ").trim();
    if (!raw) return;
    const add = action === "add-tag";
    for (const entry of entries) {
      const meta = ensureOrganizerMetaForEntry(entry);
      if (!meta) continue;
      meta.tags = add
        ? uniqueClean([...(meta.tags || []), raw]).slice(0, 40)
        : uniqueClean((meta.tags || []).filter(item => item.toLowerCase() !== raw.toLowerCase())).slice(0, 40);
      meta.updatedAt = Date.now();
      if (!organizerMetaHasContent(meta)) delete botOrganizationState.meta[entry.id];
    }
    changed.add("organizer");
    message = `${add ? "Added" : "Removed"} personal tag ${raw} ${add ? "on" : "from"} ${entries.length} bot${entries.length === 1 ? "" : "s"}.`;
  } else if (action === "remove-list") {
    const label = kind === "favorite" ? "favorite history" : "Later";
    if (!window.confirm(`Remove ${entries.length} selected bot${entries.length === 1 ? "" : "s"} from ${label}?`)) return;
    if (kind === "favorite") {
      favoriteBotState = normalizeBotStore(favoriteBotState);
      favoriteBotState.ids = favoriteBotState.ids.filter(id => !selected.has(id));
      ids.forEach(id => delete favoriteBotState.meta[id]);
      changed.add("favorite");
    } else {
      laterBotState = normalizeBotStore(laterBotState);
      laterBotState.ids = laterBotState.ids.filter(id => !selected.has(id));
      ids.forEach(id => delete laterBotState.meta[id]);
      changed.add("later");
    }
    selected.clear();
    message = `Removed ${entries.length} bot${entries.length === 1 ? "" : "s"} from ${label}.`;
  }

  await persistSavedManagerBulk([...changed]);
  renderBotManager("favorite");
  renderBotManager("later");
  if (actionSelect) actionSelect.value = "";
  if (!message) return;

  showSettingsToast(message, async () => {
    favoriteBotState = normalizeBotStore(before.favorite);
    laterBotState = normalizeBotStore(before.later);
    botOrganizationState = normalizeBotOrganization(before.organizer);
    await persistSavedManagerBulk(["favorite", "later", "organizer"]);
    renderBotManager("favorite");
    renderBotManager("later");
  });
}

function blockedQuickDislikeCounts() {
  const ids = uniqueClean(blockedState?.ids || []);
  let handled = 0, sent = 0, legacyUnknown = 0, unavailable = 0;
  ids.forEach(id => {
    const entry = quickDislikeHistoryEntry(id);
    if (!entry) return;
    handled++;
    if (entry.nativeEventConfirmed === true) sent++;
    else if (entry.fromBotStatus || entry.status === "unavailable-private-or-deleted") unavailable++;
    else legacyUnknown++;
  });
  return { total: ids.length, handled, sent, viaLessLike: 0, legacyUnknown, unavailable,
    remaining: Math.max(0, ids.length - handled), nameOnly: uniqueClean(blockedState?.names || []).length };
}

function updateBlockedDislikeStatus(text = "") {
  const status = $("blockedBotDislikeStatus");
  if (!status) return;
  const counts = blockedQuickDislikeCounts();
  const next = text || `${counts.handled} handled · ${counts.sent} Dislikes confirmed · ${counts.unavailable} unavailable/skipped · ${counts.legacyUnknown} other/legacy · ${counts.remaining} remaining`;
  if (status.textContent !== next) status.textContent = next;
  const shared = $("blockedBotNameOnlyStatus");
  if (shared) {
    const label = counts.nameOnly ? `${counts.nameOnly} name-only skipped` : "";
    if (shared.textContent !== label) shared.textContent = label;
  }
}

function blockedQuickLessLikeCounts() {
  const ids = uniqueClean(blockedState?.ids || []);
  let handled = 0;
  let unavailable = 0;
  ids.forEach(id => {
    const entry = quickLessLikeHistoryEntry(id);
    if (!entry) return;
    handled++;
    if (entry.status === "unavailable") unavailable++;
  });
  return {
    total: ids.length,
    handled, unavailable,
    remaining: Math.max(0, ids.length - handled),
    nameOnly: uniqueClean(blockedState?.names || []).length
  };
}

function updateBlockedLessLikeActionState() {
  const button = $("bulkLessLikeBlockedBots");
  if (!button || blockedBulkLessLikeRunning) return;
  const counts = blockedQuickLessLikeCounts();

  if (!counts.total) {
    button.textContent = "No blocked bots to process";
    button.disabled = true;
    button.title = "No blocked bot IDs are currently saved.";
    return;
  }

  if (!counts.remaining) {
    button.textContent = `All ${counts.total} blocked bots handled`;
    button.disabled = true;
    button.title = "Every blocked ID is already negatively rated or is confirmed unavailable; history and availability are counted separately.";
    return;
  }

  button.textContent = "Stop recommending remaining blocked bots";
  button.disabled = false;
  button.title = `${counts.remaining} blocked bot${counts.remaining === 1 ? "" : "s"} still need Stop recommending.`;
}

function updateBlockedLessLikeStatus(text = "") {
  const status = $("blockedBotLessLikeStatus");
  if (!status) return;
  const counts = blockedQuickLessLikeCounts();
  const next = text || `${counts.handled}/${counts.total} handled · ${counts.unavailable} unavailable/skipped · ${counts.remaining} remaining`;
  if (status.textContent !== next) status.textContent = next;
  const shared = $("blockedBotNameOnlyStatus");
  if (shared) {
    const label = counts.nameOnly ? `${counts.nameOnly} name-only skipped` : "";
    if (shared.textContent !== label) shared.textContent = label;
  }
  updateBlockedLessLikeActionState();
}
