// Feature-owned options helpers: saved-store-merging. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeMetaStore(raw) {
  return raw && typeof raw === "object" ? { ...raw } : {};
}

function mergeMetaStores(...stores) {
  return stores.reduce((merged, store) => ({
    ...merged,
    ...normalizeMetaStore(store)
  }), {});
}

function mergeBotStores(...stores) {
  const normalized = stores.map(normalizeBotStore);

  return {
    ids: uniqueClean(normalized.flatMap(store => store.ids || [])),
    names: uniqueClean(normalized.flatMap(store => store.names || [])),
    meta: normalized.reduce((merged, store) => ({
      ...merged,
      ...(store.meta || {})
    }), {})
  };
}

function mergeCreatorStores(...stores) {
  const normalized = stores.map(normalizeCreatorStore);

  return {
    handles: uniqueClean(normalized.flatMap(store => store.handles || [])),
    meta: normalized.reduce((merged, store) => ({
      ...merged,
      ...(store.meta || {})
    }), {})
  };
}

function mergePersonas(...lists) {
  const seen = new Set();
  const merged = [];

  for (const list of lists) {
    if (!Array.isArray(list)) continue;

    for (const persona of list) {
      if (!persona || typeof persona !== "object") continue;

      const key = String(persona.id || persona.key || persona.name || JSON.stringify(persona)).trim();
      if (!key || seen.has(key)) continue;

      seen.add(key);
      merged.push(persona);
    }
  }

  return merged;
}

function mergeOocTemplateLists(...lists) {
  const seen = new Set();
  const merged = [];

  for (const list of lists) {
    for (const template of normalizeOocTemplates(list)) {
      const key = `${String(template.name || "").trim()}\n${String(template.text || "").trim()}`;
      if (seen.has(key)) continue;

      seen.add(key);
      merged.push(template);
    }
  }

  return normalizeOocTemplates(merged);
}

function normalizeGenerationProfiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([name, profile]) =>
      String(name || "").trim() && profile && typeof profile === "object" && !Array.isArray(profile)
    )
  );
}

function mergeGenerationProfiles(currentValue, importedValue) {
  const current = normalizeGenerationProfiles(currentValue);
  const imported = normalizeGenerationProfiles(importedValue);
  const merged = { ...current };

  for (const [originalName, profile] of Object.entries(imported)) {
    let name = originalName.trim();
    if (!merged[name]) {
      merged[name] = profile;
      continue;
    }

    if (JSON.stringify(merged[name]) === JSON.stringify(profile)) continue;

    const base = `${name} (imported)`;
    name = base;
    let number = 2;
    while (merged[name]) name = `${base} ${number++}`;
    merged[name] = profile;
  }

  return merged;
}

function normalizeReplyInstructionOverrides(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const entries = [];
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = String(rawKey || "").trim().slice(0, 160);
    const rawText = rawValue && typeof rawValue === "object" ? rawValue.text : rawValue;
    const text = String(rawText || "").replace(/\r\n/g, "\n").trim().slice(0, 2000);
    if (!key || !text) continue;
    entries.push([key, { text, updatedAt: Math.max(0, Number(rawValue?.updatedAt || 0) || 0) }]);
  }
  entries.sort((a, b) => Number(b[1].updatedAt || 0) - Number(a[1].updatedAt || 0));
  return Object.fromEntries(entries.slice(0, 100));
}

function mergeSettingsForImport(currentSettings, importedSettings) {
  const current = { ...DEFAULT_SETTINGS, ...(currentSettings || {}) };
  const imported = importedSettings && typeof importedSettings === "object" ? importedSettings : {};
  const next = { ...current, ...imported };

  [
    "includeTags",
    "excludeTags",
    "blockedTags",
    "blockedWords",
    "blockedCreators",
    "lorebookBlockedIds",
    "blockedBotIds",
    "blockedBotNames",
    "allowedLanguages"
  ].forEach(key => {
    next[key] = uniqueClean([
      ...(Array.isArray(current[key]) ? current[key] : []),
      ...(Array.isArray(imported[key]) ? imported[key] : [])
    ]);
  });

  next.oocTemplates = mergeOocTemplateLists(current.oocTemplates, imported.oocTemplates);
  next.botEditorSnippets = mergeBotEditorSnippetLists(current.botEditorSnippets, imported.botEditorSnippets);
  next.replyInstructionBotOverrides = {
    ...normalizeReplyInstructionOverrides(current.replyInstructionBotOverrides),
    ...normalizeReplyInstructionOverrides(imported.replyInstructionBotOverrides)
  };
  next.replyInstructionBotOverrides = normalizeReplyInstructionOverrides(next.replyInstructionBotOverrides);

  return next;
}

function openedEntryIsBlocked(idValue, meta = {}, store = blockedState) {
  const id = String(idValue || "").trim();
  const blocked = normalizeBotStore(store);
  if (id && blocked.ids.includes(id)) return true;

  const name = String(meta?.name || meta?.title || "")
    .toLowerCase()
    .replace(/\s+/g, " " )
    .trim();
  if (!name) return false;

  return (blocked.names || []).some(value => String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " " )
    .trim() === name);
}

function enforceBlockedPriorityOverOpenedState(options = {}) {
  const blocked = normalizeBotStore(options.blockedStore || blockedState);
  const meta = normalizeMetaStore(options.openedMeta || openedChatMetaState);
  const ids = uniqueClean(options.openedIds || currentOpened);
  const kept = [];
  let removed = 0;

  for (const id of ids) {
    if (openedEntryIsBlocked(id, meta[id], blocked)) {
      delete meta[id];
      removed++;
      continue;
    }
    kept.push(id);
  }

  if (!options.detached) {
    currentOpened = kept;
    openedChatMetaState = meta;
    if (removed && options.markDirty !== false) markSavedStoreDirty("opened");
    if ($("openedCount")) $("openedCount").textContent = `${currentOpened.length} stored`;
  }

  return { ids: kept, meta, removed };
}

// Profile copies discovered in the bot archive are already local and work for
// owned unlisted bots, unlike public-index-only status scans. Request only the
// currently visible unknown cards instead of loading thousands of backups.
const openedArchiveProfileCache = new Map();
const openedArchiveProfileLookedUp = new Set();
let openedArchiveProfilePending = false;

function knownSavedBotProfile(id, current = {}) {
  const archive = botArchiveState?.meta?.[id] || openedArchiveProfileCache.get(id) || {};
  const fields = archive.fields && typeof archive.fields === "object" ? archive.fields : {};
  const snapshot = botAvailabilityState?.meta?.[id]?.snapshot?.fields || {};
  const favorite = favoriteBotState?.meta?.[id] || {};
  const later = laterBotState?.meta?.[id] || {};
  const pick = (...values) => values.map(v => String(v || "").trim()).find(Boolean) || "";
  const realName = pick(...[current.name, fields.name, archive.name, snapshot.name, favorite.name, later.name].filter(v => !isPlaceholderBotName(v, id)));
  return {
    name: realName || "Unknown bot",
    title: pick(current.title, fields.title, snapshot.title, archive.title),
    creator: pick(fields.creator, archive.creator, snapshot.creator, current.creator, favorite.creator, later.creator),
    image: pick(fields.image, archive.image, current.image, snapshot.image, favorite.image, later.image),
    greeting: pick(current.greeting, fields.greeting, snapshot.greeting),
    description: pick(current.description, fields.description, snapshot.description, favorite.description),
  };
}

async function hydrateOpenedArchiveProfiles(entries) {
  if (openedArchiveProfilePending) return;
  const ids = (entries || []).map(row => String(row.id || ""))
    .filter(id => BOT_ID_RE.test(id) && !openedArchiveProfileLookedUp.has(id) && !botArchiveState?.meta?.[id])
    .slice(0, 20);
  if (!ids.length) return;
  ids.forEach(id => openedArchiveProfileLookedUp.add(id));
  openedArchiveProfilePending = true;
  try {
    const result = await runtimeMessage({ type: "DS_LARGE_STORAGE_GET_RECORDS", key: BOT_ARCHIVE_KEY, ids });
    if (!result?.ok) { ids.forEach(id => openedArchiveProfileLookedUp.delete(id)); return; }
    let updated = false;
    for (const id of ids) {
      const record = result.records?.[id];
      if (record && typeof record === "object") {
        openedArchiveProfileCache.set(id, record);
        updated = true;
      }
    }
    if (updated && activeOptionsTab() === "saved") renderBotManager("opened");
  } catch { ids.forEach(id => openedArchiveProfileLookedUp.delete(id)); }
  finally { openedArchiveProfilePending = false; }
}

function openedStoreFromState() {
  const clean = enforceBlockedPriorityOverOpenedState({ detached: true });
  return {
    ids: clean.ids,
    meta: clean.meta
  };
}

function isPlaceholderBotName(value, id = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (id && text.toLowerCase() === String(id).toLowerCase()) return true;
  const lower = text.toLowerCase();
  return [
    "for you", "recommended for you", "unknown bot", "unknown character", "unknown", "chatbot", "character", "bot", "spicychat",
    "chatbot under review", "character under review", "under review", "private chatbot", "deleted chatbot", "deleted",
    "unavailable", "not available", "404", "404 not found", "not found", "page not found", "error",
    "error loading chatbot", "failed to load chatbot",
    "create personalized ai characters chatbots", "create personalized ai characters chatbot"
  ].includes(lower) || /^(?:for you|recommended for you|chatbot under review|character under review|404(?: not found)?|not found|page not found)(?:\b|[.!…])/i.test(text) || /^create personalized ai characters chatbots?\b/i.test(text);
}

function cleanAuthoritativeBotName(value, id = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return isPlaceholderBotName(text, id) ? "" : text;
}

function localBotNameCandidates(id) {
  const key = String(id || "").trim();
  if (!key) return [];
  const availability = botAvailabilityState?.meta?.[key] || {};
  const archive = botArchiveState?.meta?.[key] || {};
  const recovery = botUnavailableRecoveryState?.meta?.[key] || {};
  const snapshot = normalizeBotSnapshot(availability.snapshot || availability.baseline || {});
  return [
    archive?.fields?.name,
    archive?.name,
    recovery?.records?.openedMeta?.name,
    recovery?.name,
    openedChatMetaState?.[key]?.name,
    laterBotState?.meta?.[key]?.name,
    favoriteBotState?.meta?.[key]?.name,
    notInterestedState?.meta?.[key]?.name,
    botOrganizationState?.meta?.[key]?.name,
    snapshot.fields?.name,
    availability.name
  ]
    .map(value => String(value || "").replace(/\s+/g, " ").trim())
    .filter(value => !isPlaceholderBotName(value, key));
}

function bestKnownBotName(id, currentName = "") {
  const current = String(currentName || "").replace(/\s+/g, " ").trim();
  if (!isPlaceholderBotName(current, id)) return current;
  return localBotNameCandidates(id)[0] || "";
}

function repairBlockedNamesFromLocalMetadata() {
  let repaired = 0;
  blockedState.meta = blockedState.meta || {};
  for (const id of blockedState.ids || []) {
    const item = blockedState.meta[id] || {};
    if (!isPlaceholderBotName(item.name, id)) continue;
    const name = bestKnownBotName(id, item.name);
    if (!name) continue;
    blockedState.meta[id] = { ...item, id, name };
    repaired++;
  }
  return repaired;
}

function knownChatUrlsForBot(idValue) {
  const id = String(idValue || "").trim();
  if (!BOT_ID_RE.test(id)) return [];
  const urls = [];
  const add = raw => {
    if (!raw) return;
    const values = [raw.chatUrl, ...(Array.isArray(raw.chatUrls) ? raw.chatUrls : [])];
    for (const value of values) {
      const url = String(value || "").trim();
      if (/^https:\/\/[^/]*spicychat\.ai\/chat\//i.test(url)) urls.push(url);
    }
  };
  add(openedChatMetaState?.[id]);
  add(blockedState?.meta?.[id]);
  add(notInterestedState?.meta?.[id]);
  add(favoriteBotState?.meta?.[id]);
  add(laterBotState?.meta?.[id]);
  add(botOrganizationState?.meta?.[id]);
  add(normalizeBotArchive(botArchiveState).meta[id]);
  for (const item of normalizeRecentlySeenStore(recentlySeenBotState).entries) if (item.id === id) add(item);
  for (const item of normalizeCreatorBotWatchState(creatorBotWatchState).recent) if (item.id === id) add(item);
  if (uniqueClean(currentOpened).includes(id) && !urls.length) urls.push(`https://spicychat.ai/chat/${id}`);
  return uniqueClean(urls).slice(0, 50);
}

function liveBotMetadataFields(result) {
  const archiveFields = result?.archiveSnapshot?.fields || {};
  const snapshotFields = result?.snapshot?.fields || {};
  const name = cleanAuthoritativeBotName(archiveFields.name || snapshotFields.name || result?.name || "", result?.id || "");
  return {
    name,
    creator: canonicalBotCreator(archiveFields.creator || snapshotFields.creator || result?.creator || ""),
    image: canonicalBotImage(archiveFields.image || snapshotFields.image || result?.image || ""),
    description: String(archiveFields.description || snapshotFields.description || archiveFields.title || snapshotFields.title || "").replace(/\s+/g, " ").trim()
  };
}

function mergeLiveMetaIntoRecord(raw, id, live, { clearChatPreviewDescription = false } = {}) {
  const current = raw && typeof raw === "object" ? raw : {};
  const next = { ...current, id };
  let changed = false;
  const set = (key, value) => {
    if (!value || String(next[key] || "") === String(value)) return;
    next[key] = value;
    changed = true;
  };
  set("name", live.name);
  set("creator", live.creator);
  set("image", live.image);
  if (live.description) {
    set("description", live.description);
    if (next.descriptionSource !== "bot-status-api") { next.descriptionSource = "bot-status-api"; changed = true; }
  } else if (clearChatPreviewDescription && current.cardMetaCaptured && current.description) {
    next.description = "";
    changed = true;
  }
  return { next, changed };
}

function buildBotStatusMetadataScanIndex() {
  return {
    blocked: new Set(Array.isArray(blockedState?.ids) ? blockedState.ids : []),
    notInterested: new Set(Array.isArray(notInterestedState?.ids) ? notInterestedState.ids : []),
    favorite: new Set(Array.isArray(favoriteBotState?.ids) ? favoriteBotState.ids : []),
    later: new Set(Array.isArray(laterBotState?.ids) ? laterBotState.ids : []),
    opened: new Set(uniqueClean(currentOpened)),
    recent: new Map((Array.isArray(recentlySeenBotState?.entries) ? recentlySeenBotState.entries : []).map((item, index) => [item?.id, index]).filter(([id]) => !!id)),
    watch: new Map((Array.isArray(creatorBotWatchState?.recent) ? creatorBotWatchState.recent : []).map((item, index) => [item?.id, index]).filter(([id]) => !!id))
  };
}

function applyAuthoritativeBotMetadata(result, scanIndex = null, dirtyKeys = null) {
  if (result?.status !== "available" || !BOT_ID_RE.test(String(result?.id || ""))) return false;
  const id = String(result.id);
  const live = liveBotMetadataFields(result);
  if (!live.name && !live.creator && !live.image && !live.description) return false;
  let changed = false;

  const markDirty = key => { if (dirtyKeys instanceof Set && key) dirtyKeys.add(key); };
  const updateStore = (store, indexedIds = null, storageKey = "") => {
    const normalized = store && Array.isArray(store.ids) && store.meta && typeof store.meta === "object"
      ? store
      : normalizeBotStore(store);
    const hasId = indexedIds instanceof Set ? indexedIds.has(id) : normalized.ids.includes(id);
    if (!hasId) return normalized;
    const merged = mergeLiveMetaIntoRecord(normalized.meta?.[id], id, live);
    if (merged.changed) { normalized.meta[id] = merged.next; changed = true; markDirty(storageKey); }
    return normalized;
  };
  blockedState = updateStore(blockedState, scanIndex?.blocked, BLOCKED_BOTS_KEY);
  notInterestedState = updateStore(notInterestedState, scanIndex?.notInterested, NOT_INTERESTED_KEY);
  favoriteBotState = updateStore(favoriteBotState, scanIndex?.favorite, FAVORITE_BOTS_KEY);
  laterBotState = updateStore(laterBotState, scanIndex?.later, LATER_BOTS_KEY);

  const openedHasId = scanIndex?.opened instanceof Set ? scanIndex.opened.has(id) : uniqueClean(currentOpened).includes(id);
  if (openedHasId) {
    const merged = mergeLiveMetaIntoRecord(openedChatMetaState?.[id], id, live, { clearChatPreviewDescription: true });
    if (merged.changed) { openedChatMetaState = { ...openedChatMetaState, [id]: merged.next }; changed = true; markDirty(OPENED_META_KEY); }
  }

  const organizer = botOrganizationState?.meta && typeof botOrganizationState.meta === "object"
    ? botOrganizationState
    : normalizeBotOrganization(botOrganizationState);
  if (organizer.meta?.[id]) {
    const merged = mergeLiveMetaIntoRecord(organizer.meta[id], id, live);
    if (merged.changed) { organizer.meta[id] = merged.next; botOrganizationState = organizer; changed = true; markDirty(BOT_ORGANIZER_KEY); }
  }

  if (scanIndex?.recent instanceof Map) {
    const index = scanIndex.recent.get(id);
    if (Number.isInteger(index) && recentlySeenBotState?.entries?.[index]?.id === id) {
      const merged = mergeLiveMetaIntoRecord(recentlySeenBotState.entries[index], id, live);
      if (merged.changed) { recentlySeenBotState.entries[index] = merged.next; changed = true; markDirty(RECENTLY_SEEN_BOTS_KEY); }
    }
  } else {
    const recent = normalizeRecentlySeenStore(recentlySeenBotState);
    let recentChanged = false;
    recent.entries = recent.entries.map(item => {
      if (item.id !== id) return item;
      const merged = mergeLiveMetaIntoRecord(item, id, live);
      if (merged.changed) recentChanged = true;
      return merged.next;
    });
    if (recentChanged) { recentlySeenBotState = recent; changed = true; markDirty(RECENTLY_SEEN_BOTS_KEY); }
  }

  if (scanIndex?.watch instanceof Map) {
    const index = scanIndex.watch.get(id);
    if (Number.isInteger(index) && creatorBotWatchState?.recent?.[index]?.id === id) {
      const merged = mergeLiveMetaIntoRecord(creatorBotWatchState.recent[index], id, live);
      if (merged.changed) { creatorBotWatchState.recent[index] = merged.next; changed = true; markDirty(CREATOR_BOT_WATCH_KEY); }
    }
  } else {
    const watch = normalizeCreatorBotWatchState(creatorBotWatchState);
    let watchChanged = false;
    watch.recent = watch.recent.map(item => {
      if (item.id !== id) return item;
      const merged = mergeLiveMetaIntoRecord(item, id, live);
      if (merged.changed) watchChanged = true;
      return merged.next;
    });
    if (watchChanged) { creatorBotWatchState = watch; changed = true; markDirty(CREATOR_BOT_WATCH_KEY); }
  }
  return changed;
}

function botStatusMetadataStoragePayload(dirtyKeys = null) {
  const candidates = {
    [BLOCKED_BOTS_KEY]: blockedState,
    [NOT_INTERESTED_KEY]: notInterestedState,
    [FAVORITE_BOTS_KEY]: favoriteBotState,
    [LATER_BOTS_KEY]: laterBotState,
    [OPENED_META_KEY]: openedChatMetaState,
    [RECENTLY_SEEN_BOTS_KEY]: recentlySeenBotState,
    [BOT_ORGANIZER_KEY]: botOrganizationState,
    [CREATOR_BOT_WATCH_KEY]: creatorBotWatchState
  };
  if (!(dirtyKeys instanceof Set)) return candidates;
  return Object.fromEntries(Object.entries(candidates).filter(([key]) => dirtyKeys.has(key)));
}

function normalizeRecentlySeenStore(value) {
  const source = value && typeof value === "object" ? value : {};
  const items = Array.isArray(source.entries) ? source.entries : [];
  const entries = [];
  const seen = new Set();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    entries.push({
      id,
      name: String(raw.name || id).replace(/\s+/g, " ").trim(),
      creator: String(raw.creator || "").replace(/\s+/g, " ").trim(),
      image: String(raw.image || "").trim(),
      description: String(raw.description || raw.summary || "").replace(/\s+/g, " ").trim().slice(0, 12000),
      chatUrl: String(raw.chatUrl || `https://spicychat.ai/chat/${id}`).trim(),
      profileUrl: String(raw.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim(),
      lastSeenAt: Number(raw.lastSeenAt) || 0,
      seenCount: Math.max(1, Number(raw.seenCount) || 1)
    });
  }
  entries.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return { entries };
}

function savedBotsHubBotId(idValue, raw = null) {
  const candidates = [idValue, raw?.id, raw?.chatbotId, raw?.characterId, raw?.profileUrl, raw?.chatUrl];
  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (!text) continue;
    if (SAVED_HUB_BOT_ID_RE.test(text)) return text;
    const match = text.match(/\/(?:chatbot|chat)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i);
    if (match?.[1]) return match[1];
  }
  return "";
}

function collectSavedBotsHubEntries() {
  const byId = new Map();
  const ensure = (idValue, raw = null) => {
    const id = savedBotsHubBotId(idValue, raw);
    // Organizer folders/tags are local metadata, not chatbot records. Older or
    // malformed organizer data can contain non-bot keys; never turn those into
    // fake /chatbot/<folder> cards in Saved Bots Hub.
    if (!id || botStatusIdIgnored(id)) return null;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: "",
        creator: "",
        image: "",
        description: "",
        profileUrl: `https://spicychat.ai/chatbot/${id}`,
        chatUrl: `https://spicychat.ai/chat/${id}`,
        sources: new Set(),
        savedAt: 0,
        lastSeenAt: 0,
        seenCount: 0,
        organizer: {}
      });
    }
    return byId.get(id);
  };

  const mergeMeta = (entry, raw = {}, source = "", time = 0) => {
    if (!entry) return;
    const item = raw && typeof raw === "object" ? raw : {};
    if (source) entry.sources.add(source);
    const candidateName = bestKnownBotName(entry.id, item.name || item.title || "");
    if (!entry.name && candidateName) entry.name = candidateName;
    if (!entry.creator) entry.creator = String(item.creator || item.creatorName || item.creatorHandle || "").replace(/\s+/g, " ").trim();
    if (!entry.image) entry.image = String(item.image || item.avatar || "").trim();
    if (!entry.description) entry.description = String(item.description || item.summary || "").replace(/\s+/g, " ").trim();
    if (item.profileUrl) entry.profileUrl = String(item.profileUrl).trim();
    if (item.chatUrl) entry.chatUrl = String(item.chatUrl).trim();
    entry.savedAt = Math.max(entry.savedAt, Number(time || item.savedAt || 0) || 0);
  };

  const favorites = normalizeBotStore(favoriteBotState);
  favorites.ids.forEach(id => mergeMeta(ensure(id, favorites.meta?.[id]), favorites.meta?.[id], "favorite"));

  const later = normalizeBotStore(laterBotState);
  later.ids.forEach(id => mergeMeta(ensure(id, later.meta?.[id]), later.meta?.[id], "later"));

  uniqueClean(currentOpened).forEach(id => mergeMeta(ensure(id, openedChatMetaState?.[id]), openedChatMetaState?.[id], "opened"));

  const blocked = normalizeBotStore(blockedState);
  blocked.ids.forEach(id => mergeMeta(ensure(id, blocked.meta?.[id]), blocked.meta?.[id], "blocked"));

  const notInterested = normalizeBotStore(notInterestedState);
  notInterested.ids.forEach(id => mergeMeta(ensure(id, notInterested.meta?.[id]), notInterested.meta?.[id], "notInterested"));

  const organizer = normalizeBotOrganization(botOrganizationState);
  Object.entries(organizer.meta || {}).forEach(([id, meta]) => {
    const entry = ensure(id, meta);
    mergeMeta(entry, meta, "organizer");
    if (entry) entry.organizer = meta || {};
  });

  const recent = normalizeRecentlySeenStore(recentlySeenBotState);
  recent.entries.forEach(item => {
    const entry = ensure(item.id, item);
    mergeMeta(entry, item, "recent", item.lastSeenAt);
    if (!entry) return;
    entry.lastSeenAt = Number(item.lastSeenAt) || 0;
    entry.seenCount = Math.max(entry.seenCount, Number(item.seenCount) || 0);
  });

  const creatorWatch = normalizeCreatorBotWatchState(creatorBotWatchState);
  creatorWatch.recent.forEach(item => {
    const entry = ensure(item.id, item);
    mergeMeta(entry, item, "creatorWatch", item.detectedAt);
  });

  return [...byId.values()].map(entry => {
    const org = organizer.meta?.[entry.id] || entry.organizer || {};
    if (entry.sources.has("blocked")) entry.sources.delete("opened");
    return {
      ...entry,
      name: entry.name || entry.id,
      organizer: org,
      sources: [...entry.sources],
      sortTime: Math.max(entry.lastSeenAt || 0, entry.savedAt || 0)
    };
  });
}

function savedBotsHubFilteredEntries() {
  const queryTerms = splitManagerSearchTerms($("savedBotsHubSearch")?.value || savedBotsHubUiState.query || "");
  const source = value("savedBotsHubSourceFilter", "all");
  const overlap = value("savedBotsHubOverlapFilter", "all");
  const sortMode = value("savedBotsHubSortMode", "recent");

  const filtered = collectSavedBotsHubEntries().filter(entry => {
    if (source !== "all" && !entry.sources.includes(source)) return false;
    if (overlap === "multiple" && entry.sources.length < 2) return false;
    if (overlap === "single" && entry.sources.length !== 1) return false;
    if (!queryTerms.length) return true;
    const org = entry.organizer || {};
    const haystack = displayNormalizedSavedText([
      entry.name, entry.id, entry.creator, entry.description,
      ...(entry.sources || []), ...(org.collections || []), ...(org.tags || []),
      org.note || "", org.status || ""
    ].join(" ")).toLowerCase();
    return managerHaystackMatchesTerms(haystack, queryTerms);
  });

  const name = entry => String(entry.name || entry.id || "").toLowerCase();
  const creator = entry => String(entry.creator || "").replace(/^@/, "").toLowerCase();
  if (sortMode === "seen") return filtered.sort((a, b) => (b.seenCount || 0) - (a.seenCount || 0) || (b.sortTime || 0) - (a.sortTime || 0));
  if (sortMode === "name-asc") return filtered.sort((a, b) => name(a).localeCompare(name(b)));
  if (sortMode === "name-desc") return filtered.sort((a, b) => name(b).localeCompare(name(a)));
  if (sortMode === "creator-asc") return filtered.sort((a, b) => creator(a).localeCompare(creator(b)) || name(a).localeCompare(name(b)));
  if (sortMode === "creator-desc") return filtered.sort((a, b) => creator(b).localeCompare(creator(a)) || name(a).localeCompare(name(b)));
  return filtered.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0) || name(a).localeCompare(name(b)));
}

function savedBotsHubSourceLabel(source) {
  return ({
    favorite: "Favorite",
    later: "Later",
    recent: "Recently Seen",
    organizer: "Organizer",
    opened: "Opened",
    blocked: "Blocked",
    notInterested: "Not Interested",
    creatorWatch: "Creator Watch"
  })[source] || source;
}

function savedBotsHubCard(entry) {
  const card = makeElement("div", { className: "bot-manager-card saved-bots-hub-card", dataset: { id: entry.id } });
  if (entry.image) {
    card.appendChild(makeDeferredManagerImage(entry.image));
  } else {
    card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: "?" }));
  }

  const main = makeElement("div", { className: "bot-manager-main" });
  const selectLabel = makeElement("label", { className: "bot-manager-select" });
  const selectInput = makeElement("input", { className: "saved-bots-hub-select", attrs: { type: "checkbox", "aria-label": `Select ${entry.name || entry.id}` } });
  selectInput.checked = savedBotsHubUiState.selected.has(entry.id);
  selectLabel.append(selectInput, document.createTextNode("Select"));
  main.appendChild(selectLabel);
  main.appendChild(makeElement("div", { className: "bot-manager-title", text: displayNormalizedSavedText(entry.name || entry.id) }));
  if (entry.creator) main.appendChild(makeElement("div", { className: "bot-manager-creator", text: displayNormalizedSavedText(entry.creator) }));
  main.appendChild(makeElement("div", { className: "bot-manager-id", text: entry.id }));

  const chipHost = makeElement("div", { className: "bot-manager-meta-chips" });
  (entry.sources || []).forEach(source => chipHost.appendChild(makeElement("span", { text: savedBotsHubSourceLabel(source) })));
  uniqueClean(entry.organizer?.collections || []).slice(0, 5).forEach(folder => chipHost.appendChild(makeElement("span", { text: `Folder: ${folder}` })));
  uniqueClean(entry.organizer?.tags || []).slice(0, 5).forEach(tag => chipHost.appendChild(makeElement("span", { text: `#${tag}` })));
  if (entry.organizer?.status) chipHost.appendChild(makeElement("span", { text: String(entry.organizer.status).replace(/-/g, " ") }));
  main.appendChild(chipHost);

  if (entry.lastSeenAt || entry.seenCount) {
    const seenParts = [];
    if (entry.seenCount) seenParts.push(`${entry.seenCount} visit${entry.seenCount === 1 ? "" : "s"}`);
    if (entry.lastSeenAt) seenParts.push(`last seen ${new Date(entry.lastSeenAt).toLocaleString()}`);
    main.appendChild(makeElement("div", { className: "saved-bots-hub-seen", text: seenParts.join(" · ") }));
  }
  if (entry.organizer?.note) main.appendChild(makeElement("div", { className: "bot-manager-note", text: entry.organizer.note }));

  const actions = makeElement("div", { className: "bot-manager-actions" });
  if (entry.chatUrl) actions.appendChild(makeElement("a", { text: "Open chat", attrs: { href: entry.chatUrl, target: "_blank", rel: "noopener noreferrer" } }));
  if (entry.profileUrl) actions.appendChild(makeElement("a", { text: "Open profile", attrs: { href: entry.profileUrl, target: "_blank", rel: "noopener noreferrer" } }));
  if ((entry.sources || []).includes("blocked")) actions.appendChild(makeElement("button", { className: "saved-bots-hub-unblock", text: "Unblock", attrs: { type: "button" } }));
  if ((entry.sources || []).includes("notInterested")) actions.appendChild(makeElement("button", { className: "saved-bots-hub-restore-interest", text: "Remove Not Interested", attrs: { type: "button" } }));
  const inLater = (laterBotState?.ids || []).includes(entry.id);
  actions.appendChild(makeElement("button", { className: "saved-bots-hub-later", text: inLater ? "Remove from Later" : "Add to Later", attrs: { type: "button" } }));
  actions.appendChild(makeElement("button", { className: "saved-bots-hub-copy", text: "Copy link", attrs: { type: "button" } }));
  main.appendChild(actions);
  card.appendChild(main);
  return card;
}

function updateSavedBotsHubSelectionUi() {
  const count = $("savedBotsHubSelectedCount");
  if (count) count.textContent = `${savedBotsHubUiState.selected.size} selected`;
  document.querySelectorAll(".saved-bots-hub-card").forEach(card => {
    const id = String(card.dataset.id || "").trim();
    const selected = !!id && savedBotsHubUiState.selected.has(id);
    card.classList.toggle("is-bulk-selected", selected);
    const input = card.querySelector(".saved-bots-hub-select");
    if (input) input.checked = selected;
  });
}

async function applySavedBotsHubBulkAction() {
  const action = value("savedBotsHubBulkAction", "");
  if (!action) return showSettingsToast("Choose a bulk organize action first.");
  const all = collectSavedBotsHubEntries();
  const byId = new Map(all.map(entry => [entry.id, entry]));
  const entries = [...savedBotsHubUiState.selected].map(id => byId.get(id)).filter(Boolean);
  if (!entries.length) return showSettingsToast("Select at least one known bot first.");

  if (action === "copy-links") {
    const links = entries.map(entry => entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`).filter(Boolean);
    try { await navigator.clipboard.writeText(links.join("\n")); showSettingsToast(`Copied ${links.length} profile link${links.length === 1 ? "" : "s"}.`); }
    catch { window.prompt("Copy selected bot profile links:", links.join("\n")); }
    if ($("savedBotsHubBulkAction")) $("savedBotsHubBulkAction").value = "";
    return;
  }

  const before = cloneJson(botOrganizationState);
  botOrganizationState = normalizeBotOrganization(botOrganizationState);
  let message = "";

  if (["add-folder", "remove-folder"].includes(action)) {
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
    message = `${add ? "Added" : "Removed"} ${entries.length} known bot${entries.length === 1 ? "" : "s"} ${add ? "to" : "from"} folder ${folder}.`;
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
    message = `${add ? "Added" : "Removed"} personal tag ${raw} ${add ? "on" : "from"} ${entries.length} known bot${entries.length === 1 ? "" : "s"}.`;
  } else {
    return;
  }

  await persistSavedManagerBulk(["organizer"]);
  if ($("savedBotsHubBulkAction")) $("savedBotsHubBulkAction").value = "";
  renderSavedBotsHub();
  renderBotManager("favorite");
  renderBotManager("later");
  showSettingsToast(message, async () => {
    botOrganizationState = normalizeBotOrganization(before);
    await persistSavedManagerBulk(["organizer"]);
    renderSavedBotsHub();
    renderBotManager("favorite");
    renderBotManager("later");
  });
}

function renderSavedBotsHub() {
  const host = $("savedBotsHubManager");
  if (!host) return;
  const all = collectSavedBotsHubEntries();
  const knownIds = new Set(all.map(entry => entry.id).filter(Boolean));
  for (const id of [...savedBotsHubUiState.selected]) if (!knownIds.has(id)) savedBotsHubUiState.selected.delete(id);
  const entries = savedBotsHubFilteredEntries();
  let limit = Number(savedBotsHubUiState.visible || 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  const shown = entries.slice(0, limit);

  const summary = $("savedBotsHubSummary");
  if (summary) summary.textContent = entries.length === all.length
    ? `${all.length} known, showing ${shown.length}`
    : `${entries.length} matches of ${all.length}, showing ${shown.length}`;

  const stats = $("savedBotsHubStats");
  if (stats) {
    const count = source => all.filter(entry => entry.sources.includes(source)).length;
    const overlaps = all.filter(entry => entry.sources.length > 1).length;
    stats.replaceChildren(
      makeElement("span", { text: `${all.length} unique` }),
      makeElement("span", { text: `${count("favorite")} Favorite` }),
      makeElement("span", { text: `${count("later")} Later` }),
      makeElement("span", { text: `${count("recent")} Recently Seen` }),
      makeElement("span", { text: `${count("organizer")} Organized` }),
      makeElement("span", { text: `${count("opened")} Opened` }),
      makeElement("span", { text: `${count("blocked")} Blocked` }),
      makeElement("span", { text: `${count("notInterested")} Not Interested` }),
      makeElement("span", { text: `${count("creatorWatch")} Creator Watch` }),
      makeElement("span", { text: `${overlaps} overlaps` })
    );
  }

  const showMore = $("savedBotsHubShowMore");
  const showLess = $("savedBotsHubShowLess");
  const collapse = $("savedBotsHubCollapse");
  if (showMore) {
    showMore.style.display = entries.length > shown.length ? "" : "none";
    showMore.textContent = `Show 10 more (${Math.max(0, entries.length - shown.length)} left)`;
  }
  if (showLess) showLess.style.display = shown.length > 10 || !savedBotsHubUiState.collapsed ? "" : "none";
  if (collapse) {
    collapse.style.display = entries.length > 10 ? "" : "none";
    collapse.textContent = limit <= 10 ? "Show 100" : "Collapse to 10";
  }

  if (!all.length) {
    setEmptyState(host, "No saved/known bots yet.");
    return;
  }
  if (!entries.length) {
    setEmptyState(host, "No bots match these hub filters.");
    return;
  }
  host.replaceChildren(...shown.map(savedBotsHubCard));

  host.querySelectorAll("input.saved-bots-hub-select").forEach(input => {
    input.addEventListener("change", () => {
      const id = String(input.closest(".saved-bots-hub-card")?.dataset.id || "").trim();
      if (!id) return;
      if (input.checked) savedBotsHubUiState.selected.add(id);
      else savedBotsHubUiState.selected.delete(id);
      updateSavedBotsHubSelectionUi();
    });
  });
  updateSavedBotsHubSelectionUi();

  host.querySelectorAll(".saved-bots-hub-unblock").forEach(button => {
    button.addEventListener("click", async () => {
      const id = String(button.closest(".saved-bots-hub-card")?.dataset.id || "").trim();
      if (!id) return;
      blockedState = normalizeBotStore(blockedState);
      await rememberAutoBlockWordExceptions([id]);
      blockedState.ids = blockedState.ids.filter(item => item !== id);
      delete blockedState.meta[id];
      await storageSet({ [BLOCKED_BOTS_KEY]: blockedState });
      renderBotManagers();
      renderSavedBotsHub();
    });
  });

  host.querySelectorAll(".saved-bots-hub-restore-interest").forEach(button => {
    button.addEventListener("click", async () => {
      const id = String(button.closest(".saved-bots-hub-card")?.dataset.id || "").trim();
      if (!id) return;
      notInterestedState = normalizeBotStore(notInterestedState);
      notInterestedState.ids = notInterestedState.ids.filter(item => item !== id);
      delete notInterestedState.meta[id];
      await storageSet({ [NOT_INTERESTED_KEY]: notInterestedState });
      renderBotManagers();
      renderSavedBotsHub();
    });
  });

  host.querySelectorAll(".saved-bots-hub-later").forEach(button => {
    button.addEventListener("click", async () => {
      const id = String(button.closest(".saved-bots-hub-card")?.dataset.id || "").trim();
      if (!id) return;
      const entry = all.find(item => item.id === id) || {};
      laterBotState = normalizeBotStore(laterBotState);
      const before = cloneJson(laterBotState);
      const inLater = laterBotState.ids.includes(id);
      if (inLater) {
        laterBotState.ids = laterBotState.ids.filter(item => item !== id);
        delete laterBotState.meta[id];
      } else {
        laterBotState.ids.push(id);
        laterBotState.meta[id] = {
          id,
          name: entry.name || id,
          image: entry.image || "",
          creator: entry.creator || "",
          description: entry.description || "",
          chatUrl: entry.chatUrl || `https://spicychat.ai/chat/${id}`,
          profileUrl: entry.profileUrl || `https://spicychat.ai/chatbot/${id}`,
          savedAt: Date.now()
        };
      }
      markSavedStoreDirty("later");
      await persistSavedManagerBulk(["later"]);
      renderSavedBotsHub();
      renderBotManager("favorite");
      renderBotManager("later");
      showSettingsToast(inLater ? "Removed from Later." : "Added to Later.", async () => {
        laterBotState = normalizeBotStore(before);
        markSavedStoreDirty("later");
        await persistSavedManagerBulk(["later"]);
        renderSavedBotsHub();
        renderBotManager("favorite");
        renderBotManager("later");
      });
    });
  });

  host.querySelectorAll(".saved-bots-hub-copy").forEach(button => {
    button.addEventListener("click", async () => {
      const id = String(button.closest(".saved-bots-hub-card")?.dataset.id || "").trim();
      const entry = all.find(item => item.id === id);
      const link = entry?.profileUrl || (id ? `https://spicychat.ai/chatbot/${id}` : "");
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        showSettingsToast("Profile link copied.");
      } catch {
        showSettingsToast("Could not copy the profile link.");
      }
    });
  });
}

function setupSavedBotsHubControls() {
  const search = $("savedBotsHubSearch");
  const refresh = debounceCallback(() => {
    savedBotsHubUiState.query = search?.value || "";
    savedBotsHubUiState.visible = 10;
    savedBotsHubUiState.collapsed = true;
    renderSavedBotsHub();
  });
  search?.addEventListener("input", refresh);

  ["savedBotsHubSourceFilter", "savedBotsHubOverlapFilter", "savedBotsHubSortMode"].forEach(id => {
    $(id)?.addEventListener("change", () => {
      savedBotsHubUiState.visible = 10;
      savedBotsHubUiState.collapsed = true;
      renderSavedBotsHub();
    });
  });
  $("savedBotsHubShowMore")?.addEventListener("click", () => {
    savedBotsHubUiState.visible = Math.min(5000, Number(savedBotsHubUiState.visible || 10) + 10);
    savedBotsHubUiState.collapsed = true;
    renderSavedBotsHub();
  });
  $("savedBotsHubShowLess")?.addEventListener("click", () => {
    savedBotsHubUiState.visible = 10;
    savedBotsHubUiState.collapsed = true;
    renderSavedBotsHub();
  });
  $("savedBotsHubCollapse")?.addEventListener("click", () => {
    savedBotsHubUiState.visible = Number(savedBotsHubUiState.visible || 10) <= 10 ? 100 : 10;
    savedBotsHubUiState.collapsed = savedBotsHubUiState.visible <= 10;
    renderSavedBotsHub();
  });
  $("savedBotsHubSelectShown")?.addEventListener("click", () => {
    const entries = savedBotsHubFilteredEntries().slice(0, Math.max(1, Number(savedBotsHubUiState.visible || 10)));
    entries.forEach(entry => savedBotsHubUiState.selected.add(entry.id));
    updateSavedBotsHubSelectionUi();
  });
  $("savedBotsHubSelectFiltered")?.addEventListener("click", () => {
    savedBotsHubFilteredEntries().forEach(entry => savedBotsHubUiState.selected.add(entry.id));
    updateSavedBotsHubSelectionUi();
  });
  $("savedBotsHubClearSelection")?.addEventListener("click", () => {
    savedBotsHubUiState.selected.clear();
    updateSavedBotsHubSelectionUi();
  });
  $("savedBotsHubApplyBulk")?.addEventListener("click", () => applySavedBotsHubBulkAction());
}
