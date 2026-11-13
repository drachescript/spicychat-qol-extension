// Recovery snapshots, saved-store restoration, and unavailable bot preservation.
function removeBotIdsFromStore(storeValue, idSet) {
  const store = normalizeBotStore(storeValue);
  const ids = store.ids.filter(id => !idSet.has(id));
  const meta = { ...store.meta };
  for (const id of idSet) delete meta[id];
  return { ids, names: [], meta };
}

async function forgetDeletedBotFromQol(idValue) {
  await ensureSavedListsDataLoaded();
  const id = String(idValue || "").trim().toLowerCase();
  if (!BOT_ID_RE.test(id)) return false;

  const archive = normalizeBotArchive(botArchiveState).meta[id] || null;
  const availability = normalizeBotAvailability(botAvailabilityState).meta[id] || null;
  const name = cleanAuthoritativeBotName(archive?.fields?.name || archive?.name || availability?.name || "", id) || "this bot";
  const shortId = shortBotCharacterId(id);
  if (!confirm(
    `Forget ${name} (${shortId}) from QoL?\n\n` +
    "This removes its saved copy, Bot Status result/history, opened/Favorite/Later/Blocked/Not Interested/Organizer/Recently Seen records, recovery data and local Dislike/Less Like handled history. " +
    "The real SpicyChat conversation is NOT deleted. QoL keeps only the exact character UUID on a small forgotten-ID list so Load all and future scans do not immediately recreate it."
  )) return false;

  const ids = new Set([id]);
  blockedState = removeBotIdsFromStore(blockedState, ids);
  notInterestedState = removeBotIdsFromStore(notInterestedState, ids);
  favoriteBotState = removeBotIdsFromStore(favoriteBotState, ids);
  laterBotState = removeBotIdsFromStore(laterBotState, ids);

  currentOpened = uniqueClean(currentOpened).filter(value => String(value || "").toLowerCase() !== id);
  openedChatMetaState = { ...openedChatMetaState };
  delete openedChatMetaState[id];

  recentlySeenBotState = {
    entries: normalizeRecentlySeenStore(recentlySeenBotState).entries.filter(item => String(item.id || "").toLowerCase() !== id)
  };

  const organizer = normalizeBotOrganization(botOrganizationState);
  delete organizer.meta[id];
  botOrganizationState = organizer;

  const watch = normalizeCreatorBotWatchState(creatorBotWatchState);
  watch.recent = watch.recent.filter(item => String(item.id || "").toLowerCase() !== id);
  for (const creator of Object.values(watch.creators || {})) {
    creator.seenIds = uniqueClean(creator.seenIds || []).filter(value => String(value || "").toLowerCase() !== id);
    creator.baselineCount = creator.seenIds.length;
  }
  creatorBotWatchState = normalizeCreatorBotWatchState(watch);

  if (botAvailabilityState?.meta) delete botAvailabilityState.meta[id];
  botAvailabilityState = normalizeBotAvailability(botAvailabilityState);
  if (botArchiveState?.meta) delete botArchiveState.meta[id];
  botArchiveState = normalizeBotArchive(botArchiveState);
  if (botUnavailableRecoveryState?.meta) delete botUnavailableRecoveryState.meta[id];
  botUnavailableRecoveryState = normalizeBotUnavailableRecovery(botUnavailableRecoveryState);

  quickDislikeHistoryState = normalizeQuickDislikeHistory(quickDislikeHistoryState);
  if (quickDislikeHistoryState.bots) delete quickDislikeHistoryState.bots[id];
  quickLessLikeHistoryState = normalizeQuickLessLikeHistory(quickLessLikeHistoryState);
  if (quickLessLikeHistoryState.bots) delete quickLessLikeHistoryState.bots[id];

  quickDislikeBulkState = normalizeQuickDislikeBulkState({
    ...quickDislikeBulkState,
    pendingIds: (quickDislikeBulkState.pendingIds || []).filter(value => String(value || "").toLowerCase() !== id),
    failedIds: (quickDislikeBulkState.failedIds || []).filter(value => String(value || "").toLowerCase() !== id),
    currentId: String(quickDislikeBulkState.currentId || "").toLowerCase() === id ? "" : quickDislikeBulkState.currentId
  });
  const lessFailureMeta = { ...(quickLessLikeBulkState.failureMeta || {}) };
  delete lessFailureMeta[id];
  quickLessLikeBulkState = normalizeQuickLessLikeBulkState({
    ...quickLessLikeBulkState,
    pendingIds: (quickLessLikeBulkState.pendingIds || []).filter(value => String(value || "").toLowerCase() !== id),
    failedIds: (quickLessLikeBulkState.failedIds || []).filter(value => String(value || "").toLowerCase() !== id),
    failureMeta: lessFailureMeta,
    currentId: String(quickLessLikeBulkState.currentId || "").toLowerCase() === id ? "" : quickLessLikeBulkState.currentId
  });

  setBotStatusIgnoredIds([...botStatusIgnoredIdsState, id]);

  const stored = await storageGet([
    "settings",
    BOT_DISCOVERY_INDEX_KEY,
    CARD_TOKEN_CACHE_KEY,
    ARCHIVE_UPLOAD_STATE_KEY,
    ARCHIVE_CONTRIBUTION_STATE_KEY
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  settings.blockedBotIds = uniqueClean(settings.blockedBotIds || []).filter(value => String(value || "").toLowerCase() !== id && validBotId(value));
  settings.blockedBotNames = [];

  const discoveryRaw = stored[BOT_DISCOVERY_INDEX_KEY] && typeof stored[BOT_DISCOVERY_INDEX_KEY] === "object" ? stored[BOT_DISCOVERY_INDEX_KEY] : {};
  const discoveryMeta = discoveryRaw.meta && typeof discoveryRaw.meta === "object" ? { ...discoveryRaw.meta } : { ...discoveryRaw };
  delete discoveryMeta[id];
  const discoveryNext = discoveryRaw.meta && typeof discoveryRaw.meta === "object"
    ? { ...discoveryRaw, meta: discoveryMeta }
    : { meta: discoveryMeta };

  const tokenCache = stored[CARD_TOKEN_CACHE_KEY] && typeof stored[CARD_TOKEN_CACHE_KEY] === "object"
    ? { ...stored[CARD_TOKEN_CACHE_KEY] }
    : {};
  delete tokenCache[id];

  const uploadState = normalizeArchiveUploadState(stored[ARCHIVE_UPLOAD_STATE_KEY]);
  delete uploadState.fingerprints[id];
  const contributionState = normalizeArchiveContributionState(stored[ARCHIVE_CONTRIBUTION_STATE_KEY]);
  delete contributionState.fingerprints[id];

  botStatusStorageSelfWriteUntil = Date.now() + 8000;
  const ok = await storageSet({
    settings,
    [BLOCKED_BOTS_KEY]: blockedState,
    [NOT_INTERESTED_KEY]: notInterestedState,
    [FAVORITE_BOTS_KEY]: favoriteBotState,
    [LATER_BOTS_KEY]: laterBotState,
    [OPENED_KEY]: currentOpened,
    [OPENED_META_KEY]: openedChatMetaState,
    [RECENTLY_SEEN_BOTS_KEY]: recentlySeenBotState,
    [BOT_ORGANIZER_KEY]: botOrganizationState,
    [CREATOR_BOT_WATCH_KEY]: creatorBotWatchState,
    [BOT_AVAILABILITY_KEY]: botAvailabilityState,
    [BOT_ARCHIVE_KEY]: botArchiveState,
    [BOT_UNAVAILABLE_RECOVERY_KEY]: botUnavailableRecoveryState,
    [QUICK_DISLIKE_HISTORY_KEY]: quickDislikeHistoryState,
    [QUICK_DISLIKE_BULK_STATE_KEY]: quickDislikeBulkState,
    [QUICK_LESS_LIKE_HISTORY_KEY]: quickLessLikeHistoryState,
    [QUICK_LESS_LIKE_BULK_STATE_KEY]: quickLessLikeBulkState,
    [BOT_STATUS_IGNORED_KEY]: botStatusIgnoredIdsState,
    [BOT_DISCOVERY_INDEX_KEY]: discoveryNext,
    [CARD_TOKEN_CACHE_KEY]: tokenCache,
    [ARCHIVE_UPLOAD_STATE_KEY]: uploadState,
    [ARCHIVE_CONTRIBUTION_STATE_KEY]: contributionState
  });
  if (!ok) {
    showSettingsToast("Could not finish forgetting this bot. Reload Settings before trying again.");
    return false;
  }

  invalidateDuplicateCache();
  renderBotAvailability();
  renderSavedBotsHub();
  renderBotManager("blocked");
  renderBotManager("notInterested");
  renderBotManager("favorite");
  renderBotManager("later");
  renderBotManager("opened");
  refreshStorageUsageIfVisible();
  showSettingsToast(`Forgot ${name} from QoL. The SpicyChat conversation was left untouched.`);
  return true;
}

async function clearForgottenBotStatusIds() {
  const count = botStatusIgnoredIdsState.length;
  if (!count) return;
  if (!confirm(`Allow all ${count} forgotten character ID${count === 1 ? "" : "s"} to be tracked again? Their deleted QoL data is not restored, but future Load all / browsing / Bot Status scans may add them again.`)) return;
  setBotStatusIgnoredIds([]);
  await storageSet({ [BOT_STATUS_IGNORED_KEY]: [] });
  renderDeletedSavedBots();
  showSettingsToast("Forgotten-ID list cleared. Those bots can be tracked again if QoL sees them later.");
}

function recoveryBotStoreSnapshot(storeValue, id) {
  const store = storeValue && Array.isArray(storeValue.ids) && storeValue.meta && typeof storeValue.meta === "object"
    ? storeValue
    : normalizeBotStore(storeValue);
  return {
    present: store.ids.includes(id),
    record: store.meta?.[id] && typeof store.meta[id] === "object" ? { ...store.meta[id] } : null
  };
}

function buildUnavailableRecoveryCaptureContext() {
  const organizer = normalizeBotOrganization(botOrganizationState);
  const recent = normalizeRecentlySeenStore(recentlySeenBotState);
  const watch = normalizeCreatorBotWatchState(creatorBotWatchState);
  return {
    organizer,
    recentById: new Map(recent.entries.map(item => [item.id, item])),
    watch,
    watchRecentById: new Map(watch.recent.map(item => [item.id, item]))
  };
}

function captureUnavailableRecoveryEntry(idValue, availabilityEntry = {}, captureContext = null) {
  const id = String(idValue || "").trim();
  if (!BOT_ID_RE.test(id)) return null;

  const blocked = recoveryBotStoreSnapshot(blockedState, id);
  const notInterested = recoveryBotStoreSnapshot(notInterestedState, id);
  const favorite = recoveryBotStoreSnapshot(favoriteBotState, id);
  const later = recoveryBotStoreSnapshot(laterBotState, id);
  const context = captureContext || buildUnavailableRecoveryCaptureContext();
  const organizer = context.organizer || normalizeBotOrganization(botOrganizationState);
  const organizerRecord = organizer.meta?.[id] && typeof organizer.meta[id] === "object" ? { ...organizer.meta[id] } : null;
  const recentRecord = context.recentById?.get(id) || null;
  const watchRecord = context.watchRecentById?.get(id) || null;
  const openedMeta = openedChatMetaState?.[id] && typeof openedChatMetaState[id] === "object" ? { ...openedChatMetaState[id] } : null;
  const archive = botArchiveState?.meta?.[id] || null;
  const previous = botUnavailableRecoveryState?.meta?.[id] || null;

  const firstText = (...values) => values.map(value => String(value || "").trim()).find(Boolean) || "";
  const name = cleanAuthoritativeBotName(firstText(
    archive?.fields?.name, archive?.name, availabilityEntry?.name,
    favorite.record?.name, later.record?.name, blocked.record?.name, notInterested.record?.name,
    openedMeta?.name, recentRecord?.name, organizerRecord?.name, watchRecord?.name, previous?.name
  ), id);
  const creator = canonicalBotCreator(firstText(
    archive?.fields?.creator, archive?.creator, availabilityEntry?.creator,
    favorite.record?.creator, later.record?.creator, blocked.record?.creator, notInterested.record?.creator,
    openedMeta?.creator, recentRecord?.creator, organizerRecord?.creator, watchRecord?.creator, previous?.creator
  ));
  const image = canonicalBotImage(firstText(
    archive?.fields?.image, archive?.image, availabilityEntry?.image,
    favorite.record?.image, later.record?.image, blocked.record?.image, notInterested.record?.image,
    openedMeta?.image, recentRecord?.image, organizerRecord?.image, watchRecord?.image, previous?.image
  ));

  const recovery = {
    id,
    capturedAt: Date.now(),
    recoveredAt: 0,
    name: name || previous?.name || id,
    creator: creator || previous?.creator || "",
    image: image || previous?.image || "",
    profileUrl: String(
      archive?.profileUrl ||
      availabilityEntry?.profileUrl ||
      favorite.record?.profileUrl ||
      later.record?.profileUrl ||
      openedMeta?.profileUrl ||
      previous?.profileUrl ||
      `https://spicychat.ai/chatbot/${id}`
    ).trim(),
    sources: uniqueClean([
      ...(previous?.sources || []),
      ...(availabilityEntry?.sources || []),
      blocked.present ? "blocked" : "",
      notInterested.present ? "notInterested" : "",
      favorite.present ? "favorite" : "",
      later.present ? "later" : "",
      currentOpened.includes(id) ? "opened" : "",
      organizerRecord ? "organizer" : "",
      recentRecord ? "recent" : "",
      watchRecord ? "creatorWatch" : "",
      archive ? "archive" : ""
    ]),
    archiveAvailable: !!archive,
    memberships: {
      blocked: blocked.present,
      notInterested: notInterested.present,
      favorite: favorite.present,
      later: later.present,
      opened: currentOpened.includes(id),
      organizer: !!organizerRecord,
      recent: !!recentRecord,
      creatorWatch: !!watchRecord
    },
    records: {
      blocked: blocked.record,
      notInterested: notInterested.record,
      favorite: favorite.record,
      later: later.record,
      openedMeta,
      organizer: organizerRecord,
      recent: recentRecord ? { ...recentRecord } : null,
      creatorWatch: watchRecord ? { ...watchRecord } : null
    }
  };

  if (!botUnavailableRecoveryState || typeof botUnavailableRecoveryState !== "object") {
    botUnavailableRecoveryState = { version: 1, meta: {} };
  }
  if (!botUnavailableRecoveryState.meta || typeof botUnavailableRecoveryState.meta !== "object") {
    botUnavailableRecoveryState.meta = {};
  }
  botUnavailableRecoveryState.meta[id] = normalizeBotUnavailableRecovery({ meta: { [id]: recovery } }).meta[id];
  return botUnavailableRecoveryState.meta[id];
}

function restoreRecoveryBotStore(storeValue, id, membership, record) {
  if (!membership) return storeValue;
  const store = normalizeBotStore(storeValue);
  if (!store.ids.includes(id)) store.ids.push(id);
  store.ids = uniqueClean(store.ids);
  store.names = [];
  store.meta = { ...(store.meta || {}) };
  store.meta[id] = { ...(record && typeof record === "object" ? record : {}), ...(store.meta[id] || {}), id };
  return store;
}

function restoreUnavailableRecoveryEntryInMemory(idValue, { restoreBlocked = true } = {}) {
  const id = String(idValue || "").trim();
  if (!BOT_ID_RE.test(id)) return { restored: false, blocked: false };
  if (!botUnavailableRecoveryState || typeof botUnavailableRecoveryState !== "object") {
    botUnavailableRecoveryState = { version: 1, meta: {} };
  }
  if (!botUnavailableRecoveryState.meta || typeof botUnavailableRecoveryState.meta !== "object") {
    botUnavailableRecoveryState.meta = {};
  }
  const recovery = botUnavailableRecoveryState.meta[id];
  if (!recovery || Number(recovery.recoveredAt || 0) > 0) return { restored: false, blocked: false };

  const m = recovery.memberships || {};
  const r = recovery.records || {};
  if (restoreBlocked) blockedState = restoreRecoveryBotStore(blockedState, id, m.blocked, r.blocked);
  notInterestedState = restoreRecoveryBotStore(notInterestedState, id, m.notInterested, r.notInterested);
  favoriteBotState = restoreRecoveryBotStore(favoriteBotState, id, m.favorite, r.favorite);
  laterBotState = restoreRecoveryBotStore(laterBotState, id, m.later, r.later);

  if (m.opened && !currentOpened.includes(id)) currentOpened = uniqueClean([...currentOpened, id]);
  if (m.opened && r.openedMeta) openedChatMetaState = { ...openedChatMetaState, [id]: { ...r.openedMeta, id } };

  if (m.organizer) {
    const org = normalizeBotOrganization(botOrganizationState);
    org.meta = { ...(org.meta || {}), [id]: { ...(r.organizer || {}), ...(org.meta?.[id] || {}), id } };
    botOrganizationState = org;
  }

  if (m.recent && r.recent) {
    const recent = normalizeRecentlySeenStore(recentlySeenBotState);
    if (!recent.entries.some(item => item.id === id)) recent.entries.unshift({ ...r.recent, id });
    recentlySeenBotState = normalizeRecentlySeenStore(recent);
  }

  if (m.creatorWatch && r.creatorWatch) {
    const watch = normalizeCreatorBotWatchState(creatorBotWatchState);
    if (!watch.recent.some(item => item.id === id)) watch.recent.unshift({ ...r.creatorWatch, id });
    creatorBotWatchState = normalizeCreatorBotWatchState(watch);
  }

  const recoveredAt = Date.now();
  botUnavailableRecoveryState.meta[id] = { ...recovery, recoveredAt };
  const availability = botAvailabilityState?.meta?.[id];
  if (availability) {
    botAvailabilityState.meta[id] = {
      ...availability,
      recoverySources: [],
      recoveredAt,
      reason: `${availability.reason || "Available."} Local QoL memberships restored from unavailable-bot recovery.`
    };
  }

  return { restored: true, blocked: restoreBlocked && !!m.blocked };
}

function botStatusRecoveryStoragePayload({ restoreBlockedIds = [] } = {}) {
  const payload = {
    [BOT_UNAVAILABLE_RECOVERY_KEY]: botUnavailableRecoveryState,
    [BLOCKED_BOTS_KEY]: blockedState,
    [NOT_INTERESTED_KEY]: notInterestedState,
    [FAVORITE_BOTS_KEY]: favoriteBotState,
    [LATER_BOTS_KEY]: laterBotState,
    [OPENED_KEY]: currentOpened,
    [OPENED_META_KEY]: openedChatMetaState,
    [RECENTLY_SEEN_BOTS_KEY]: recentlySeenBotState,
    [BOT_ORGANIZER_KEY]: botOrganizationState,
    [CREATOR_BOT_WATCH_KEY]: creatorBotWatchState
  };
  return { payload, restoreBlockedIds: uniqueClean(restoreBlockedIds).filter(validBotId) };
}

function preserveUnavailableRecoveryCopy(idValue, availabilityEntry = {}) {
  const id = String(idValue || "").trim();
  if (!BOT_ID_RE.test(id)) return false;
  const existing = normalizeBotArchive(botArchiveState).meta[id] || null;
  const trusted = [
    favoriteBotState?.meta?.[id], laterBotState?.meta?.[id], blockedState?.meta?.[id],
    notInterestedState?.meta?.[id], botOrganizationState?.meta?.[id],
    ...normalizeRecentlySeenStore(recentlySeenBotState).entries.filter(item => item.id === id),
    ...normalizeCreatorBotWatchState(creatorBotWatchState).recent.filter(item => item.id === id)
  ].filter(Boolean);
  const opened = openedChatMetaState?.[id] || {};
  const first = key => trusted.map(item => item?.[key]).find(value => String(value || "").trim()) || "";
  const name = cleanAuthoritativeBotName(existing?.fields?.name || existing?.name || availabilityEntry?.name || first("name") || opened.name || "", id);
  const creator = String(existing?.fields?.creator || existing?.creator || availabilityEntry?.creator || first("creator") || opened.creator || "").replace(/\s+/g, " ").trim();
  const image = String(existing?.fields?.image || existing?.image || availabilityEntry?.image || first("image") || opened.image || "").trim();
  const description = String(existing?.fields?.description || first("description") || first("summary") || "").replace(/\s+/g, " ").trim();
  const fields = {
    ...(existing?.fields || {}),
    name: existing?.fields?.name || name,
    description: existing?.fields?.description || description,
    creator: existing?.fields?.creator || creator,
    image: existing?.fields?.image || image
  };
  const raw = {
    ...(existing || {}),
    id,
    name: name || existing?.name || id,
    creator,
    image,
    profileUrl: existing?.profileUrl || `https://spicychat.ai/chatbot/${id}`,
    chatUrls: uniqueClean([...(existing?.chatUrls || []), ...knownChatUrlsForBot(id)]).slice(0, 50),
    firstSavedAt: Number(existing?.firstSavedAt) || Date.now(),
    lastSavedAt: Date.now(),
    lastAvailableAt: Number(existing?.lastAvailableAt) || 0,
    source: existing?.source || "Unavailable bot recovery",
    fields
  };
  const normalized = normalizeBotArchive({ meta: { [id]: raw } }).meta[id];
  if (!normalized?.coverage?.length) return false;
  if (!botArchiveState || typeof botArchiveState !== "object") botArchiveState = { meta: {} };
  if (!botArchiveState.meta || typeof botArchiveState.meta !== "object") botArchiveState.meta = {};
  botArchiveState.meta[id] = mergeBotArchiveEntry(botArchiveState.meta[id], normalized);
  return true;
}

function blockedArchiveRemotePreservation(archiveEntry, availabilityEntry, uploadState, contributionState) {
  const archive = archiveEntry && typeof archiveEntry === "object" ? archiveEntry : null;
  const availability = availabilityEntry && typeof availabilityEntry === "object" ? availabilityEntry : null;
  const id = String(archive?.id || availability?.id || "").trim();
  if (!archive || !BOT_ID_RE.test(id) || !botStatusArchiveExportSourceAllowed(archive)) {
    return { safe: false, id, fingerprint: "", source: "" };
  }

  const record = archiveUploadSavedCopyRecord(archive, availability);
  const fingerprint = fastArchiveFingerprint(record);
  if (fingerprint && uploadState?.fingerprints?.[id] === fingerprint) {
    return { safe: true, id, fingerprint, source: "archive-import-queue" };
  }
  if (fingerprint && contributionState?.lastStatus === "approved" && contributionState?.fingerprints?.[id] === fingerprint) {
    return { safe: true, id, fingerprint, source: "public-archive-approved" };
  }
  return { safe: false, id, fingerprint, source: "" };
}

function compactUnavailableAvailabilityRecord(entryValue, recoveryEntry = null) {
  const entry = entryValue && typeof entryValue === "object" ? entryValue : {};
  const id = String(entry.id || "").trim();
  const now = Date.now();
  return normalizeBotAvailability({ meta: { [id]: {
    id,
    name: entry.name || recoveryEntry?.name || "",
    creator: entry.creator || recoveryEntry?.creator || "",
    image: entry.image || "",
    profileUrl: entry.profileUrl || recoveryEntry?.profileUrl || `https://spicychat.ai/chatbot/${id}`,
    chatUrl: entry.chatUrl || `https://spicychat.ai/chat/${id}`,
    sources: uniqueClean(["blocked", "remote-archive", ...(entry.sources || [])]).slice(0, 12),
    status: "unavailable",
    reason: String(entry.reason || "Confirmed unavailable.").slice(0, 500),
    httpStatus: Number(entry.httpStatus) || 0,
    checkedAt: Number(entry.checkedAt) || now,
    updateStatus: entry.updateStatus || "unchanged",
    updateDetectedAt: Number(entry.updateDetectedAt) || 0,
    baselineAcceptedAt: Number(entry.baselineAcceptedAt) || 0,
    unavailableEvidenceCount: Math.max(2, Number(entry.unavailableEvidenceCount) || 0),
    unavailableCandidateAt: Number(entry.unavailableCandidateAt) || 0,
    unavailableConfirmedAt: Number(entry.unavailableConfirmedAt) || Number(entry.checkedAt) || now,
    unavailableEvidenceType: String(entry.unavailableEvidenceType || "archive-cleanup").slice(0, 80),
    recoverySources: uniqueClean([...(entry.recoverySources || []), "remote-archive-cleanup"]),
    cleanupAppliedAt: Number(entry.cleanupAppliedAt) || now,
    recoveredAt: 0
  } } }).meta[id];
}

function compactBlockedBotTombstone(id, availabilityEntry = null, recoveryEntry = null) {
  const current = normalizeBotStore(blockedState);
  if (!current.ids.includes(id)) current.ids.push(id);
  current.ids = uniqueClean(current.ids).filter(validBotId);
  current.names = [];
  const old = current.meta?.[id] && typeof current.meta[id] === "object" ? current.meta[id] : {};
  const name = cleanAuthoritativeBotName(availabilityEntry?.name || recoveryEntry?.name || old.name || "", id) || id;
  current.meta = { ...(current.meta || {}), [id]: {
    id,
    name,
    creator: canonicalBotCreator(availabilityEntry?.creator || recoveryEntry?.creator || old.creator || ""),
    status: "unavailable",
    archiveRemotePreserved: true,
    compactedAt: Date.now()
  } };
  return current;
}

function compactBlockedRecoveryEntry(id, availabilityEntry, preservation) {
  const recoveryState = normalizeBotUnavailableRecovery(botUnavailableRecoveryState);
  const previous = recoveryState.meta[id] || {};
  const now = Date.now();
  recoveryState.meta[id] = normalizeBotUnavailableRecovery({ meta: { [id]: {
    id,
    capturedAt: Number(previous.capturedAt) || now,
    recoveredAt: 0,
    name: previous.name || availabilityEntry?.name || id,
    creator: previous.creator || availabilityEntry?.creator || "",
    image: "",
    profileUrl: previous.profileUrl || availabilityEntry?.profileUrl || `https://spicychat.ai/chatbot/${id}`,
    sources: uniqueClean([...(previous.sources || []), "blocked", "remote-archive"]),
    archiveAvailable: false,
    archiveRemotePreserved: true,
    archiveRemotePreservedAt: now,
    archiveRemotePreservationSource: preservation.source,
    localArchivePurgedAt: now,
    memberships: {
      ...(previous.memberships || {}),
      blocked: true
    },
    records: {
      blocked: null,
      notInterested: null,
      favorite: null,
      later: null,
      openedMeta: null,
      organizer: null,
      recent: null,
      creatorWatch: null
    }
  } } }).meta[id];
  botUnavailableRecoveryState = recoveryState;
  return recoveryState.meta[id];
}

