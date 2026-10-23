// Feature-owned options helpers: storage-maintenance. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

async function renderLocalChangeHistory() {
  const host = $("localChangeHistory");
  if (!host) return;
  const result = await storageGet([LOCAL_CHANGE_HISTORY_KEY]);
  const history = Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY] : [];
  if (!history.length) {
    host.replaceChildren(makeElement("span", { className: "hint", text: "No recent local QoL changes." }));
    return;
  }
  host.replaceChildren(...history.slice(0, 12).map(entry => {
    const row = makeElement("div", { className: "local-change-row" });
    const text = makeElement("div", { className: "local-change-main" });
    text.append(makeElement("strong", { text: String(entry?.label || "QoL change") }));
    text.append(makeElement("span", { className: "hint", text: entry?.at ? new Date(entry.at).toLocaleString() : "" }));
    const button = makeElement("button", { text: entry?.undoable ? "Undo" : "Logged", attrs: { type: "button" } });
    button.disabled = !entry?.undoable;
    button.addEventListener("click", async () => {
      if (!entry?.undoable) return;
      const current = await storageGet([LOCAL_CHANGE_HISTORY_KEY]);
      const list = Array.isArray(current[LOCAL_CHANGE_HISTORY_KEY]) ? current[LOCAL_CHANGE_HISTORY_KEY] : [];
      const index = list.findIndex(item => item?.id === entry.id);
      if (index < 0) return;
      const target = list[index];
      if (!target.before || typeof target.before !== "object") return;
      const keys = Object.keys(target.before);
      const currentValues = await storageGet(keys);
      const stale = Object.entries(target.after || {}).some(([key, expected]) => JSON.stringify(currentValues[key]) !== JSON.stringify(expected));
      if (stale) { showSettingsToast("That data changed again after this entry, so QoL will not overwrite the newer state."); return; }
      await storageSet(target.before);
      list.splice(index, 1);
      await storageSet({ [LOCAL_CHANGE_HISTORY_KEY]: list });
      await load();
      showSettingsToast(`Undid: ${target.label || "QoL change"}`);
      renderLocalChangeHistory();
    });
    row.append(text, button);
    return row;
  }));
}

async function undoLatestLocalChange() {
  const result = await storageGet([LOCAL_CHANGE_HISTORY_KEY]);
  const history = Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY] : [];
  const index = history.findIndex(item => item?.undoable && item?.before && typeof item.before === "object");
  if (index < 0) return showSettingsToast("There is no recent undoable QoL change.");
  const entry = history[index];
  const keys = Object.keys(entry.before || {});
  const currentValues = await storageGet(keys);
  const stale = Object.entries(entry.after || {}).some(([key, expected]) => JSON.stringify(currentValues[key]) !== JSON.stringify(expected));
  if (stale) return showSettingsToast("The latest recorded data changed again, so QoL will not overwrite the newer state.");
  await storageSet(entry.before);
  history.splice(index, 1);
  await storageSet({ [LOCAL_CHANGE_HISTORY_KEY]: history });
  await load();
  showSettingsToast(`Undid: ${entry.label || "QoL change"}`);
  renderLocalChangeHistory();
}

async function clearLocalChangeHistoryFromOptions() {
  const result = await storageGet([LOCAL_CHANGE_HISTORY_KEY]);
  const history = Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY] : [];
  if (!history.length) return showSettingsToast("Recent-change history is already empty.");
  if (!confirm(`Clear ${history.length} recent QoL change${history.length === 1 ? "" : "s"}?`)) return;
  await storageSet({ [LOCAL_CHANGE_HISTORY_KEY]: [] });
  renderLocalChangeHistory();
  showSettingsToast("Recent QoL change history cleared.");
}

function countStoreItems(value, kind = "bot") {
  if (kind === "opened") return Array.isArray(value) ? value.length : 0;
  if (kind === "creator") return uniqueClean(value?.handles || []).length;
  if (kind === "persona") return Array.isArray(value) ? value.length : 0;
  if (kind === "ooc") return Array.isArray(value) ? value.length : 0;
  if (kind === "profiles") return value && typeof value === "object" ? Object.keys(value).length : 0;
  return uniqueClean([...(value?.ids || []), ...(value?.names || [])]).length;
}

async function deleteStorageDataset(id) {
  const def = STORAGE_DATASET_DEFS.find(item => item.id === id);
  if (!def) return;
  const deleteRead = await storageGetChecked(["settings", ...def.keys]);
  if (!deleteRead.ok) {
    showSettingsToast(`Delete cancelled: ${def.label} data could not be read safely.`);
    return;
  }
  const result = deleteRead.data;
  const count = def.count(result);
  if (!confirm(`Delete ${def.label} QoL data (${count})? This cannot be undone from QoL unless you have a backup.`)) return;

  const recoveryProtected = !["deeplKey", "soundscapeAudio", "chatBackgroundMedia"].includes(id);
  if (recoveryProtected) {
    try {
      await createRecoverySnapshot(`before deleting ${def.label}`);
    } catch {
      showSettingsToast(`Delete cancelled: recovery snapshot for ${def.label} could not be verified.`);
      return;
    }
  }

  let changed = false;
  if (id === "ooc") {
    const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}), oocTemplates: [] };
    changed = await storageSetVerified({ settings, [OOC_TEMPLATES_KEY]: [] });
  } else if (id === "settings") {
    changed = await storageRemoveVerified("settings");
  } else {
    changed = await storageRemoveVerified(def.keys);
  }

  if (!changed) {
    showSettingsToast(`Delete could not be verified${recoveryProtected ? "; the recovery snapshot was kept" : ""}.`);
    return;
  }

  await load();
  showSettingsToast(`${def.label} data deleted.`);
}

async function refreshStorageUsage() {
  const host = $("storageUsage");
  if (!host) return;

  const keys = [...new Set(STORAGE_DATASET_DEFS.flatMap(def => def.keys))];
  const result = await storageGet(keys);
  const bytes = await storageBytesInUse(null);
  host.replaceChildren();

  if (Number.isFinite(bytes)) {
    host.appendChild(makeElement("span", { className: "storage-chip", text: `chrome.storage.local: ${Math.max(0, bytes / 1024).toFixed(bytes >= 10240 ? 0 : 1)} KB` }));
  }

  await refreshRecoverySnapshotStatus();

  STORAGE_DATASET_DEFS.forEach(def => {
    const wrap = makeElement("span", { className: "storage-dataset" });
    wrap.appendChild(makeElement("span", { text: `${def.label}: ${def.count(result)}` }));
    const button = makeElement("button", { text: "Delete", attrs: { type: "button", "data-delete-storage-dataset": def.id } });
    button.addEventListener("click", () => deleteStorageDataset(def.id));
    wrap.appendChild(button);
    host.appendChild(wrap);
  });
}


// On-demand size breakdown. Read only key names and byte counts, never saved
// values. Avoid chrome.storage.local.get(null), which loads the whole database.
async function checkLocalStorageSizes() {
  const host = $("localStorageBreakdown");
  if (!host) return;
  host.textContent = "Checking how much space each category uses…";
  const area = chrome.storage?.local;
  if (typeof area?.getKeys !== "function" || typeof area?.getBytesInUse !== "function") {
    host.textContent = "This browser does not support checking individual storage sizes without reading saved content. Nothing was changed.";
    return;
  }
  try {
    const keys = await new Promise((resolve, reject) => {
      let finished = false;
      const done = value => { if (!finished) { finished = true; resolve(value); } };
      try {
        const result = area.getKeys(value => {
          if (chrome.runtime?.lastError) { if (!finished) { finished = true; reject(new Error(chrome.runtime.lastError.message)); } }
          else done(value);
        });
        if (result?.then) result.then(done, reject);
      } catch (error) { reject(error); }
    });
    if (!Array.isArray(keys)) throw new Error("Could not list saved storage keys");
    const groups = new Map([
      ["Settings", []],
      ["Saved lists and chat history", []],
      ["Backups and recovery", []],
      ["Memory and story notes", []],
      ["Caches and bot data", []],
      ["Other stored data", []]
    ]);
    function category(key) {
      const name = String(key || "").toLowerCase();
      if (name === "settings" || name.startsWith("dssettingv1:") || /setting|preference|config/.test(name)) return "Settings";
      if (/backup|recovery|snapshot/.test(name)) return "Backups and recovery";
      if (/memory|keeper|context|story.?notes/.test(name)) return "Memory and story notes";
      if (/opened|blocked|favorite|later|notinterested|not_interested|history|bookmark|organizer|followed|personas|presets/.test(name)) return "Saved lists and chat history";
      if (/cache|archive|bot|lorebook|index|diagnostic|scan|status|creator|token|presence/.test(name)) return "Caches and bot data";
      return "Other stored data";
    }
    for (const key of keys) groups.get(category(key)).push(key);
    const bytesFor = keysToCheck => new Promise((resolve, reject) => {
      let finished = false;
      const done = value => { if (!finished) { finished = true; resolve(Number(value) || 0); } };
      try {
        const result = area.getBytesInUse(keysToCheck, bytes => {
          if (chrome.runtime?.lastError) { if (!finished) { finished = true; reject(new Error(chrome.runtime.lastError.message)); } }
          else done(bytes);
        });
        if (result?.then) result.then(done, reject);
      } catch (error) { reject(error); }
    });
    const rows = [];
    for (const [name, groupKeys] of groups) {
      if (!groupKeys.length) continue;
      rows.push({ name, keys: groupKeys.length, bytes: await bytesFor(groupKeys) });
    }
    rows.sort((a, b) => b.bytes - a.bytes);
    const total = await bytesFor(null);
    const mb = size => `${(Math.max(0, size) / (1024 * 1024)).toFixed(2)} MB`;
    host.replaceChildren();
    host.appendChild(makeElement("p", { text: `chrome.storage.local: ${mb(total)} across ${keys.length} saved items.` }));
    for (const item of rows) host.appendChild(makeElement("div", { text: `${item.name}: ${mb(item.bytes)} (${item.keys} items)` }));
    host.appendChild(makeElement("p", { className: "hint", text: "Only sizes were checked. No saved content was opened, uploaded, changed or deleted. Compressed Support History and other IndexedDB data are not included in these sizes." }));
  } catch (error) {
    host.textContent = `Could not check storage sizes: ${error?.message || "browser did not respond"}. Nothing was changed.`;
  }
}

function pruneMeta(meta, allowedKeys) {
  const raw = meta && typeof meta === "object" ? meta : {};
  const allowed = new Set(allowedKeys.filter(Boolean));
  return Object.fromEntries(Object.entries(raw).filter(([key]) => allowed.has(key)));
}

function cleanedBotStore(raw, { keepNames = false } = {}) {
  const store = normalizeBotStore(raw);
  const ids = uniqueClean(store.ids);
  const names = keepNames ? uniqueClean(store.names) : [];
  const allowedMeta = [
    ...ids,
    ...names,
    ...names.map(name => `name:${name}`)
  ];
  return { ids, ...(keepNames ? { names } : {}), meta: pruneMeta(store.meta, allowedMeta) };
}

function normalizeChatBookmarksForCleanup(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const output = {};
  for (const [chatId, raw] of Object.entries(source)) {
    const id = String(chatId || "").trim();
    if (!id || !raw || typeof raw !== "object") continue;
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    const byMessage = new Map();
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const messageId = String(entry.messageId || entry.id || "").trim();
      if (!messageId) continue;
      const previous = byMessage.get(messageId);
      if (!previous || Number(entry.updatedAt || entry.createdAt || 0) >= Number(previous.updatedAt || previous.createdAt || 0)) byMessage.set(messageId, { ...entry, messageId });
    }
    if (byMessage.size) output[id] = { ...raw, entries: [...byMessage.values()] };
  }
  return output;
}

function orphanedMetaCount(meta, allowedKeys) {
  const raw = meta && typeof meta === "object" ? meta : {};
  const allowed = new Set((allowedKeys || []).filter(Boolean));
  return Object.keys(raw).filter(key => !allowed.has(key)).length;
}

async function checkOrphanedLocalData() {
  const status = $("cleanupStatus");
  if (status) status.textContent = "Checking local data...";
  const result = await storageGet([
    OPENED_KEY, OPENED_META_KEY, BLOCKED_BOTS_KEY, NOT_INTERESTED_KEY, FAVORITE_BOTS_KEY, LATER_BOTS_KEY,
    FAVORITE_CREATORS_KEY, FOLLOWED_CREATORS_KEY, PERSONAS_KEY, LEGACY_PERSONAS_KEY, PERSONA_ORG_KEY,
    SMART_FILTER_PRESETS_KEY, SMART_FILTER_PINNED_KEY, CHAT_BOOKMARKS_KEY, RECENTLY_SEEN_BOTS_KEY
  ]);
  let orphaned = 0;
  const details = [];
  const opened = uniqueClean(result[OPENED_KEY] || []);
  const openedOrphans = orphanedMetaCount(result[OPENED_META_KEY], opened);
  if (openedOrphans) { orphaned += openedOrphans; details.push(`${openedOrphans} opened-chat metadata`); }
  for (const [key, label, keepNames] of [[BLOCKED_BOTS_KEY, "blocked-bot metadata", true], [NOT_INTERESTED_KEY, "Not Interested metadata", false], [FAVORITE_BOTS_KEY, "favorite-bot metadata", false], [LATER_BOTS_KEY, "Later metadata", false]]) {
    const store = normalizeBotStore(result[key]);
    const allowed = [...store.ids, ...(keepNames ? store.names : []), ...(keepNames ? store.names.map(name => `name:${name}`) : [])];
    const count = orphanedMetaCount(result[key]?.meta, allowed);
    if (count) { orphaned += count; details.push(`${count} ${label}`); }
  }
  for (const [key, label] of [[FAVORITE_CREATORS_KEY, "favorite-creator metadata"], [FOLLOWED_CREATORS_KEY, "followed-creator metadata"]]) {
    const store = normalizeCreatorStore(result[key]);
    const count = orphanedMetaCount(result[key]?.meta, store.handles);
    if (count) { orphaned += count; details.push(`${count} ${label}`); }
  }
  const personas = mergePersonas([], Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY] : (result[LEGACY_PERSONAS_KEY] || []));
  const personaIds = personas.map(item => String(item?.id || "").trim()).filter(Boolean);
  const org = result[PERSONA_ORG_KEY] && typeof result[PERSONA_ORG_KEY] === "object" ? result[PERSONA_ORG_KEY] : {};
  const personaMetaOrphans = orphanedMetaCount(org.meta, personaIds);
  const personaOrderOrphans = uniqueClean(org.order || []).filter(id => !personaIds.includes(id)).length;
  if (personaMetaOrphans + personaOrderOrphans) { orphaned += personaMetaOrphans + personaOrderOrphans; details.push(`${personaMetaOrphans + personaOrderOrphans} Persona organization entries`); }
  const rawPins = Array.isArray(result[SMART_FILTER_PINNED_KEY]) ? result[SMART_FILTER_PINNED_KEY] : [];
  const cleanPins = normalizeSmartFilterPins(rawPins, result[SMART_FILTER_PRESETS_KEY]);
  if (rawPins.length !== cleanPins.length) { const n = rawPins.length - cleanPins.length; orphaned += n; details.push(`${n} Smart Filter pin${n === 1 ? "" : "s"}`); }
  const rawBookmarks = result[CHAT_BOOKMARKS_KEY] && typeof result[CHAT_BOOKMARKS_KEY] === "object" ? result[CHAT_BOOKMARKS_KEY] : {};
  const rawBookmarkCount = Object.values(rawBookmarks).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0);
  const cleanBookmarks = normalizeChatBookmarksForCleanup(rawBookmarks);
  const cleanBookmarkCount = Object.values(cleanBookmarks).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0);
  if (rawBookmarkCount > cleanBookmarkCount) { const n = rawBookmarkCount - cleanBookmarkCount; orphaned += n; details.push(`${n} malformed/duplicate bookmark${n === 1 ? "" : "s"}`); }
  if (status) status.textContent = orphaned ? `${orphaned} cleanup candidate${orphaned === 1 ? "" : "s"} found: ${details.join(" · ")}. Nothing was changed.` : "No supported orphaned/duplicate local-data records found. Nothing was changed.";
}

async function cleanLocalData() {
  const status = $("cleanupStatus");
  if (status) status.textContent = "Cleaning...";

  const cleanRead = await storageGetChecked([
    "settings",
    OPENED_KEY,
    OPENED_META_KEY,
    BLOCKED_BOTS_KEY,
    NOT_INTERESTED_KEY,
    PERSONAS_KEY,
    LEGACY_PERSONAS_KEY,
    PERSONA_ORG_KEY,
    OOC_TEMPLATES_KEY,
    FAVORITE_CREATORS_KEY,
    FOLLOWED_CREATORS_KEY,
    FAVORITE_BOTS_KEY,
    LATER_BOTS_KEY,
    BOT_ORGANIZER_KEY,
    CHAT_ORGANIZER_KEY,
    CHARACTER_QOL_PROFILES_KEY,
    BOT_AVAILABILITY_KEY,
    BOT_ARCHIVE_KEY,
    SAVED_TEXT_SNIPPETS_KEY,
    CONTEXT_KEEPER_DATA_KEY,
    STORY_DAY_TRACKER_KEY,
    CHAT_NUDGE_STORE_KEY,
    GENERATION_PROFILES_KEY,
    SMART_FILTER_PRESETS_KEY,
    SMART_FILTER_PINNED_KEY,
    BOT_EDITOR_DRAFT_HISTORY_KEY,
    CHAT_BOOKMARKS_KEY,
    RECENTLY_SEEN_BOTS_KEY
  ]);
  if (!cleanRead.ok) {
    if (status) status.textContent = "Cleanup cancelled: current QoL storage could not be read safely.";
    showSettingsToast("Cleanup cancelled because browser storage could not be read.");
    return;
  }
  const result = cleanRead.data;

  const beforeBytes = await storageBytesInUse(null);
  const opened = uniqueClean(result[OPENED_KEY] || []);
  const favoriteCreators = normalizeCreatorStore(result[FAVORITE_CREATORS_KEY]);
  favoriteCreators.meta = pruneMeta(favoriteCreators.meta, favoriteCreators.handles);
  const followedCreators = normalizeCreatorStore(result[FOLLOWED_CREATORS_KEY]);
  followedCreators.meta = pruneMeta(followedCreators.meta, followedCreators.handles);
  const personas = mergePersonas([], Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY] : (result[LEGACY_PERSONAS_KEY] || []));
  const personaIds = personas.map(persona => String(persona?.id || "").trim()).filter(Boolean);
  const rawPersonaOrg = result[PERSONA_ORG_KEY] && typeof result[PERSONA_ORG_KEY] === "object" ? result[PERSONA_ORG_KEY] : {};
  const cleanedPersonaOrg = {
    meta: pruneMeta(rawPersonaOrg.meta, personaIds),
    order: uniqueClean(Array.isArray(rawPersonaOrg.order) ? rawPersonaOrg.order : []).filter(id => personaIds.includes(id)),
    customOrder: !!rawPersonaOrg.customOrder
  };
  const currentSettings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };

  ["includeTags", "excludeTags", "blockedTags", "blockedWords", "blockedCreators", "lorebookBlockedIds", "blockedBotIds", "blockedBotNames", "allowedLanguages"]
    .forEach(key => { currentSettings[key] = uniqueClean(currentSettings[key] || []); });
  currentSettings.botEditorSnippets = normalizeBotEditorSnippets(currentSettings.botEditorSnippets);
  currentSettings.oocTemplates = normalizeOocTemplates(currentSettings.oocTemplates);

  const payload = {
    settings: currentSettings,
    [OPENED_KEY]: opened,
    [OPENED_META_KEY]: pruneMeta(result[OPENED_META_KEY], opened),
    [BLOCKED_BOTS_KEY]: cleanedBotStore(result[BLOCKED_BOTS_KEY], { keepNames: true }),
    [NOT_INTERESTED_KEY]: cleanedBotStore(result[NOT_INTERESTED_KEY]),
    [FAVORITE_CREATORS_KEY]: favoriteCreators,
    [FOLLOWED_CREATORS_KEY]: followedCreators,
    [FAVORITE_BOTS_KEY]: cleanedBotStore(result[FAVORITE_BOTS_KEY]),
    [LATER_BOTS_KEY]: cleanedBotStore(result[LATER_BOTS_KEY]),
    [BOT_ORGANIZER_KEY]: normalizeBotOrganization(result[BOT_ORGANIZER_KEY]),
    [CHAT_ORGANIZER_KEY]: normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]),
    [CHARACTER_QOL_PROFILES_KEY]: normalizeCharacterQolProfiles(result[CHARACTER_QOL_PROFILES_KEY]),
    [BOT_AVAILABILITY_KEY]: normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]),
    [BOT_ARCHIVE_KEY]: normalizeBotArchive(result[BOT_ARCHIVE_KEY]),
    [SAVED_TEXT_SNIPPETS_KEY]: Array.isArray(result[SAVED_TEXT_SNIPPETS_KEY]) ? result[SAVED_TEXT_SNIPPETS_KEY].filter(item => item && typeof item === "object" && String(item.text || "").trim()) : [],
    [CONTEXT_KEEPER_DATA_KEY]: result[CONTEXT_KEEPER_DATA_KEY] && typeof result[CONTEXT_KEEPER_DATA_KEY] === "object" ? result[CONTEXT_KEEPER_DATA_KEY] : {},
    [STORY_DAY_TRACKER_KEY]: result[STORY_DAY_TRACKER_KEY] && typeof result[STORY_DAY_TRACKER_KEY] === "object" ? result[STORY_DAY_TRACKER_KEY] : {},
    [PERSONAS_KEY]: personas,
    [PERSONA_ORG_KEY]: cleanedPersonaOrg,
    [OOC_TEMPLATES_KEY]: mergeOocTemplateLists([], result[OOC_TEMPLATES_KEY] || currentSettings.oocTemplates),
    [GENERATION_PROFILES_KEY]: normalizeGenerationProfiles(result[GENERATION_PROFILES_KEY]),
    [SMART_FILTER_PRESETS_KEY]: normalizeSmartFilterPresets(result[SMART_FILTER_PRESETS_KEY]),
    [SMART_FILTER_PINNED_KEY]: normalizeSmartFilterPins(result[SMART_FILTER_PINNED_KEY], result[SMART_FILTER_PRESETS_KEY]),
    [BOT_EDITOR_DRAFT_HISTORY_KEY]: normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]),
    [CHAT_BOOKMARKS_KEY]: normalizeChatBookmarksForCleanup(result[CHAT_BOOKMARKS_KEY]),
    [RECENTLY_SEEN_BOTS_KEY]: normalizeRecentlySeenStore(result[RECENTLY_SEEN_BOTS_KEY])
  };

  try {
    await createRecoverySnapshot("before local data cleanup", result);
  } catch {
    if (status) status.textContent = "Cleanup cancelled: recovery snapshot could not be verified.";
    showSettingsToast("Cleanup cancelled because the recovery snapshot could not be verified.");
    return;
  }
  const cleanupStored = await storageSetVerified(payload);
  if (!cleanupStored) {
    if (status) status.textContent = "Cleanup could not be verified. The recovery snapshot was kept.";
    showSettingsToast("Cleanup write could not be verified; recovery snapshot kept.");
    return;
  }
  const afterBytes = await storageBytesInUse(null);
  await load();

  const saved = Number.isFinite(beforeBytes) && Number.isFinite(afterBytes)
    ? Math.max(0, beforeBytes - afterBytes)
    : 0;
  if (status) {
    status.textContent = saved > 0
      ? `Cleanup finished. Removed duplicates/orphaned metadata and freed about ${(saved / 1024).toFixed(1)} KB.`
      : "Cleanup finished. Saved lists are normalized and no duplicate/orphan cleanup was needed.";
  }
  showSettingsToast("Local QoL data cleaned.");
}

function formatControlBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return "n/a";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value >= 10240 ? 0 : 1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 1 : 2)} MB`;
}
