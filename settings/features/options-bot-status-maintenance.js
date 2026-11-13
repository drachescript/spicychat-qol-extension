// Archived blocked-bot cleanup, compaction, and confirmed-unavailable cleanup.
async function blockedArchiveCleanupCandidates({ candidateIds = null, maxItems = Infinity } = {}) {
  await ensureSavedListsDataLoaded();
  await ensureSavedRecoveryDataLoaded();
  const blockedIds = new Set(normalizeBotStore(blockedState).ids.filter(validBotId));
  const requested = candidateIds == null
    ? null
    : new Set((Array.isArray(candidateIds) ? candidateIds : [candidateIds]).map(value => String(value || "").trim()).filter(validBotId));
  const availability = normalizeBotAvailability(botAvailabilityState).meta;
  const archives = normalizeBotArchive(botArchiveState).meta;
  const stored = await storageGet([ARCHIVE_UPLOAD_STATE_KEY, ARCHIVE_CONTRIBUTION_STATE_KEY]);
  const uploadState = normalizeArchiveUploadState(stored[ARCHIVE_UPLOAD_STATE_KEY]);
  const contributionState = normalizeArchiveContributionState(stored[ARCHIVE_CONTRIBUTION_STATE_KEY]);
  const safe = [];
  let waitingRemote = 0;
  let unavailableBlocked = 0;

  for (const id of blockedIds) {
    if (requested && !requested.has(id)) continue;
    const status = availability[id];
    const archive = archives[id];
    if (!isConfirmedUnavailableBotStatus(status) || !archive) continue;
    unavailableBlocked += 1;
    const preservation = blockedArchiveRemotePreservation(archive, status, uploadState, contributionState);
    if (!preservation.safe) {
      waitingRemote += 1;
      continue;
    }
    safe.push({ id, availability: status, archive, preservation });
    if (safe.length >= Math.max(1, Number(maxItems) || 1)) break;
  }
  return { safe, waitingRemote, unavailableBlocked };
}

async function refreshBlockedArchiveCleanupStatus() {
  const status = $("blockedArchiveCleanupStatus");
  if (!status) return;
  try {
    const result = await blockedArchiveCleanupCandidates({ maxItems: 5000 });
    if (!result.unavailableBlocked) {
      status.textContent = "No blocked deleted bots with local saved copies need cleanup.";
    } else if (result.safe.length) {
      status.textContent = `${result.safe.length.toLocaleString()} remotely preserved blocked cop${result.safe.length === 1 ? "y is" : "ies are"} ready to purge${result.waitingRemote ? ` · ${result.waitingRemote.toLocaleString()} waiting for confirmed Archive preservation` : ""}.`;
    } else {
      status.textContent = `${result.waitingRemote.toLocaleString()} blocked deleted cop${result.waitingRemote === 1 ? "y is" : "ies are"} still being kept locally until Archive preservation is confirmed.`;
    }
  } catch {
    status.textContent = "Cleanup status unavailable; local copies were left untouched.";
  }
}

async function cleanupArchivedBlockedBots({ automatic = false, maxItems = 25, candidateIds = null } = {}) {
  const status = $("blockedArchiveCleanupStatus");
  const result = await blockedArchiveCleanupCandidates({ candidateIds, maxItems });
  if (!result.safe.length) {
    if (!automatic && status) {
      status.textContent = result.waitingRemote
        ? `${result.waitingRemote.toLocaleString()} blocked deleted cop${result.waitingRemote === 1 ? "y is" : "ies are"} waiting for confirmed Archive preservation; nothing was deleted.`
        : "No remotely preserved blocked/deleted saved copies are ready to purge.";
    }
    return { cleaned: 0, waitingRemote: result.waitingRemote };
  }

  const ids = result.safe.map(item => item.id);
  if (!automatic) {
    const ok = confirm(
      `Delete the heavy local recovery cop${ids.length === 1 ? "y" : "ies"} for ${ids.length} blocked + confirmed unavailable bot${ids.length === 1 ? "" : "s"}?\n\n` +
      "QoL verified that the exact current saved snapshot was preserved remotely. The blocked IDs/tombstones stay on this device, so restored bots remain blocked."
    );
    if (!ok) return { cleaned: 0, waitingRemote: result.waitingRemote };
  }

  if (status) status.textContent = automatic ? `Cleaning ${ids.length} safely archived blocked cop${ids.length === 1 ? "y" : "ies"} in the background…` : `Cleaning ${ids.length} remotely preserved blocked cop${ids.length === 1 ? "y" : "ies"}…`;
  await nextOptionsIdleSlice(180);

  const removed = await removeLargeStorageRecords(BOT_ARCHIVE_KEY, ids);
  if (!removed?.ok) {
    if (status) status.textContent = "Local archive cleanup failed; no block records were changed.";
    return { cleaned: 0, waitingRemote: result.waitingRemote };
  }

  const availabilityUpdates = {};
  for (const item of result.safe) {
    delete botArchiveState?.meta?.[item.id];
    const recovery = compactBlockedRecoveryEntry(item.id, item.availability, item.preservation);
    blockedState = compactBlockedBotTombstone(item.id, item.availability, recovery);
    const compactAvailability = compactUnavailableAvailabilityRecord(item.availability, recovery);
    botAvailabilityState.meta[item.id] = compactAvailability;
    availabilityUpdates[item.id] = compactAvailability;
  }

  const stored = await storageGet(["settings"]);
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  settings.blockedBotIds = uniqueClean([...(settings.blockedBotIds || []), ...normalizeBotStore(blockedState).ids]).filter(validBotId);
  settings.blockedBotNames = [];

  botStatusStorageSelfWriteUntil = Date.now() + 8000;
  const [availabilitySaved, metadataSaved] = await Promise.all([
    runtimeMessage({ type: "DS_LARGE_STORAGE_MERGE", key: BOT_AVAILABILITY_KEY, entries: availabilityUpdates }),
    storageSet({
      settings,
      [BLOCKED_BOTS_KEY]: blockedState,
      [BOT_UNAVAILABLE_RECOVERY_KEY]: botUnavailableRecoveryState
    })
  ]);
  if (!availabilitySaved?.ok || !metadataSaved) {
    if (status) status.textContent = "Heavy copies were safely removed, but compact cleanup metadata could not be fully saved. Blocks remain intact.";
    return { cleaned: ids.length, waitingRemote: result.waitingRemote, partial: true };
  }

  invalidateDuplicateCache();
  if (!automatic) {
    renderBotAvailability({ skipRecoveryRerender: true });
    renderBotManager("blocked");
    refreshStorageUsageIfVisible();
  }
  if (status) status.textContent = `Cleaned ${ids.length.toLocaleString()} heavy local cop${ids.length === 1 ? "y" : "ies"}; blocked tombstones kept${result.waitingRemote ? ` · ${result.waitingRemote.toLocaleString()} still waiting for Archive preservation` : ""}.`;
  if (!automatic) showSettingsToast(`Storage cleanup finished: ${ids.length.toLocaleString()} archived blocked bot cop${ids.length === 1 ? "y" : "ies"} purged locally; blocks kept.`);
  return { cleaned: ids.length, waitingRemote: result.waitingRemote };
}

async function compactOlderBlockedBotData() {
  const status = $("blockedCompactStatus");
  const button = $("compactOldBlockedBotData");
  const ageDays = Math.max(0, Number($("blockedCompactAge")?.value || 0));
  const mode = String($("blockedCompactMode")?.value || "metadata");
  if (!["metadata", "remote", "discard"].includes(mode)) return;
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await Promise.all([ensureBlockingDataLoaded(), ensureSavedRecoveryDataLoaded()]);
    const blocked = normalizeBotStore(blockedState);
    const archives = normalizeBotArchive(botArchiveState).meta;
    const availability = normalizeBotAvailability(botAvailabilityState).meta;
    const minimumTime = ageDays ? Date.now() - ageDays * 86400000 : 0;
    const storage = await storageGet([ARCHIVE_UPLOAD_STATE_KEY, ARCHIVE_CONTRIBUTION_STATE_KEY]);
    const uploadState = normalizeArchiveUploadState(storage[ARCHIVE_UPLOAD_STATE_KEY]);
    const contributionState = normalizeArchiveContributionState(storage[ARCHIVE_CONTRIBUTION_STATE_KEY]);
    const candidates = [];
    for (const id of blocked.ids) {
      if (!validBotId(id)) continue;
      const meta = blocked.meta?.[id] || {};
      const archive = archives[id] || null;
      // A zero timestamp means the age is unknown; never guess that it is old.
      const recentAt = Math.max(0, ...[
        meta.lastSeenAt, meta.savedAt, meta.autoBlockedAt, meta.compactedAt,
        archive?.lastSavedAt, availability[id]?.checkedAt
      ].map(value => Number(value) || 0));
      if (minimumTime && (!recentAt || recentAt > minimumTime)) continue;
      const hasDetails = Object.keys(meta).some(key => !["id", "compactedAt"].includes(key));
      const preservation = archive ? blockedArchiveRemotePreservation(archive, availability[id], uploadState, contributionState) : null;
      const removableCopy = !!archive && (mode === "discard" || (mode === "remote" && preservation?.safe));
      if (!hasDetails && !removableCopy) continue;
      candidates.push({ id, hasDetails, removableCopy, archive, remoteVerified: !!preservation?.safe });
    }
    const metadataCount = candidates.filter(item => item.hasDetails).length;
    const copyCandidates = candidates.filter(item => item.removableCopy);
    const unverifiedCount = copyCandidates.filter(item => !item.remoteVerified).length;
    if (!candidates.length) {
      if (status) status.textContent = "No eligible older blocked records need compacting. Select All ages to include records without dates.";
      return;
    }
    const ageLabel = ageDays ? `not updated for ${ageDays}+ days` : "of any age";
    const summary = `Compact ${metadataCount} blocked metadata record(s) ${ageLabel}` +
      (mode === "metadata" ? ". Local saved copies will remain untouched." : ` and remove ${copyCandidates.length} saved local copy/copies.`) +
      "\n\nEvery blocked bot ID stays blocked. Native SpicyChat chats and completed Less Like/Dislike history are not deleted.";
    if (!confirm(summary)) return;
    if (mode === "discard" && unverifiedCount && !confirm(
      `DANGER: ${unverifiedCount} saved bot copy/copies have NO confirmed remote Archive preservation.\n\n` +
      "Deleting these copies may permanently lose their descriptions, greetings, snapshots and recovery details. " +
      "Export a QoL backup first. Proceed with permanent local deletion anyway?"
    )) return;
    if (status) status.textContent = `Compacting ${candidates.length} blocked record(s)…`;

    // Remove large copies first; if interrupted, all ID blocks are still durable.
    let copiesRemoved = 0;
    for (let i = 0; i < copyCandidates.length; i += 100) {
      const batch = copyCandidates.slice(i, i + 100).map(item => item.id);
      const removed = await removeLargeStorageRecords(BOT_ARCHIVE_KEY, batch);
      if (!removed?.ok) {
        if (status) status.textContent = `Stopped after ${copiesRemoved} saved copies. Storage reported: ${String(removed?.error || "write failed").slice(0, 160)}. All blocked IDs remain intact.`;
        return;
      }
      for (const id of batch) delete botArchiveState?.meta?.[id];
      copiesRemoved += batch.length;
      if (status) status.textContent = `${copiesRemoved} saved copies removed; saving the compact Blocked list…`;
    }

    // Re-read the live Blocked store to avoid re-adding an ID that another tab
    // deliberately unblocked while we were checking archive fingerprints.
    const fresh = await storageGet([BLOCKED_BOTS_KEY, "settings"]);
    const latest = normalizeBotStore(fresh[BLOCKED_BOTS_KEY]);
    const activeIds = new Set(latest.ids);
    const now = Date.now();
    let metaCompacted = 0;
    for (const item of candidates) {
      if (!activeIds.has(item.id)) continue;
      const previous = latest.meta?.[item.id];
      if (!previous || !Object.keys(previous).some(key => !["id", "compactedAt"].includes(key))) continue;
      latest.meta[item.id] = { id: item.id, compactedAt: now };
      metaCompacted += 1;
    }
    // Do not clear manually blocked name rules or reset the blocking settings.
    const saved = await storageSetVerified({ [BLOCKED_BOTS_KEY]: latest });
    if (!saved) {
      if (status) status.textContent = "Could not verify the compact Blocked list. Original ID block membership remains saved; reload before retrying.";
      return;
    }
    blockedState = latest;
    invalidateDuplicateCache();
    renderBotManager("blocked");
    refreshStorageUsageIfVisible();
    if (status) status.textContent = `Compacted ${metaCompacted} blocked record(s), removed ${copiesRemoved} saved copies. All ${latest.ids.length} blocked IDs were retained.`;
    showSettingsToast(`Blocked cleanup complete: ${metaCompacted} metadata records compacted, ${copiesRemoved} local saved copies removed; blocked IDs kept.`);
  } catch (error) {
    if (status) status.textContent = `Blocked cleanup failed: ${String(error?.message || error).slice(0, 180)}. No blocked IDs were intentionally removed.`;
    console.warn("[SpicyChat QoL] blocked metadata cleanup failed", error);
  } finally {
    if (button) button.disabled = false;
  }
}

async function cleanConfirmedUnavailableBots() {
  if (unavailableCleanupRunning) return;
  unavailableCleanupRunning = true;
  const action = $("cleanUnavailableBots");
  if (action) action.disabled = true;
  try {
    return await performConfirmedUnavailableCleanup();
  } finally {
    unavailableCleanupRunning = false;
    if (action) action.disabled = false;
  }
}

async function performConfirmedUnavailableCleanup() {
  // Cleanup acts on both live list membership and the verified recovery data.
  // Saved Lists loading alone does not guarantee the availability/archive
  // data is ready, especially when the Saved tab was opened only moments ago.
  await Promise.all([ensureSavedRecoveryDataLoaded(), ensureBlockingDataLoaded()]);
  // A confirmed unavailable status is intentionally retained after cleanup.
  // Do not offer the same already-quarantined ID again unless it was
  // confirmed unavailable *after* the previous cleanup or an active membership
  // has reappeared in the meantime.
  const availabilityEntries = Object.values(normalizeBotAvailability(botAvailabilityState).meta);
  const eligibleIds = new Set([
    ...normalizeBotStore(notInterestedState).ids,
    ...normalizeBotStore(favoriteBotState).ids,
    ...normalizeBotStore(laterBotState).ids,
    ...uniqueClean(currentOpened),
    ...Object.keys(normalizeBotOrganization(botOrganizationState).meta),
    ...normalizeRecentlySeenStore(recentlySeenBotState).entries.map(entry => entry.id),
    ...normalizeCreatorBotWatchState(creatorBotWatchState).recent.map(entry => entry.id)
  ]);
  const unavailable = availabilityEntries.filter(entry =>
    isConfirmedUnavailableBotStatus(entry) && validBotId(entry.id) &&
    (!Number(entry.cleanupAppliedAt || 0) ||
      Number(entry.unavailableConfirmedAt || 0) > Number(entry.cleanupAppliedAt || 0) ||
      eligibleIds.has(entry.id))
  );
  if (!unavailable.length) {
    showSettingsToast("No confirmed unavailable bots are waiting for cleanup.");
    return;
  }

  const ids = new Set(unavailable.map(entry => entry.id));
  if (!confirm(
    `Archive + clean ${ids.size} confirmed unavailable/deleted bot${ids.size === 1 ? "" : "s"} from active QoL lists?\n\n` +
    "QoL will save a recovery ledger first. Blocked IDs stay blocked; saved bot copies, old chat/history data, and recommendation-feedback history are kept. " +
    "If a cleaned bot becomes available again, QoL can restore the other memberships it removed."
  )) return;

  // Phase 1: build and VERIFY a compact recovery ledger before removing any ID
  // from an active store. This guarantees that even a bot with no rich archive
  // snapshot still keeps its UUID, list memberships and whatever local metadata
  // was recoverable.
  botUnavailableRecoveryState = normalizeBotUnavailableRecovery(botUnavailableRecoveryState);
  const recoveryCaptureContext = buildUnavailableRecoveryCaptureContext();
  let newArchiveCopies = 0;
  for (const entry of unavailable) {
    captureUnavailableRecoveryEntry(entry.id, entry, recoveryCaptureContext);
    if (!botArchiveState?.meta?.[entry.id] && preserveUnavailableRecoveryCopy(entry.id, entry)) {
      newArchiveCopies++;
      // The newly-created archive entry is useful to the ledger immediately.
      const recovery = botUnavailableRecoveryState.meta?.[entry.id];
      if (recovery) recovery.archiveAvailable = true;
    }
  }

  await nextOptionsIdleSlice(140);
  botStatusStorageSelfWriteUntil = Date.now() + 8000;
  const recoverySaved = await storageSetVerified({
    [BOT_UNAVAILABLE_RECOVERY_KEY]: botUnavailableRecoveryState
  });
  if (!recoverySaved) {
    showSettingsToast("Cleanup cancelled: the unavailable-bot recovery ledger could not be verified. No active IDs were removed.");
    return;
  }

  // Only write the very large archive when cleanup actually had to create a
  // missing recovery copy. Existing saved copies are left untouched.
  if (newArchiveCopies > 0) {
    await nextOptionsIdleSlice(180);
    botStatusStorageSelfWriteUntil = Date.now() + 8000;
    const archiveSaved = await storageSet({ [BOT_ARCHIVE_KEY]: botArchiveState });
    if (!archiveSaved) {
      showSettingsToast("Cleanup cancelled: new saved recovery copies could not be written. No active IDs were removed.");
      return;
    }
  }

  // Phase 2: remove only disposable active memberships. Blocked IDs are a
  // durable user decision and stay blocked even while the bot is unavailable.
  // In particular, Less Like / Dislike history is NEVER erased by cleanup.
  notInterestedState = removeBotIdsFromStore(notInterestedState, ids);
  favoriteBotState = removeBotIdsFromStore(favoriteBotState, ids);
  laterBotState = removeBotIdsFromStore(laterBotState, ids);

  currentOpened = uniqueClean(currentOpened).filter(id => !ids.has(id));
  openedChatMetaState = { ...openedChatMetaState };
  ids.forEach(id => delete openedChatMetaState[id]);

  recentlySeenBotState = {
    entries: normalizeRecentlySeenStore(recentlySeenBotState).entries.filter(item => !ids.has(item.id))
  };

  const org = normalizeBotOrganization(botOrganizationState);
  ids.forEach(id => delete org.meta[id]);
  botOrganizationState = org;

  const watch = normalizeCreatorBotWatchState(creatorBotWatchState);
  watch.recent = watch.recent.filter(item => !ids.has(item.id));
  // seenIds is historical evidence, not an active membership. Keep it so a
  // cleanup does not make QoL forget that the creator previously had this bot.
  creatorBotWatchState = watch;

  // Remove dead IDs from unfinished bulk queues so workers do not keep trying
  // them. Completed recommendation-feedback history is deliberately preserved.
  quickDislikeBulkState = filterBulkStateIds({
    ...quickDislikeBulkState,
    pendingIds: (quickDislikeBulkState.pendingIds || []).filter(id => !ids.has(id)),
    failedIds: (quickDislikeBulkState.failedIds || []).filter(id => !ids.has(id)),
    currentId: ids.has(quickDislikeBulkState.currentId) ? "" : quickDislikeBulkState.currentId
  }, normalizeQuickDislikeBulkState);
  quickLessLikeBulkState = filterBulkStateIds({
    ...quickLessLikeBulkState,
    pendingIds: (quickLessLikeBulkState.pendingIds || []).filter(id => !ids.has(id)),
    failedIds: (quickLessLikeBulkState.failedIds || []).filter(id => !ids.has(id)),
    currentId: ids.has(quickLessLikeBulkState.currentId) ? "" : quickLessLikeBulkState.currentId
  }, normalizeQuickLessLikeBulkState);

  const stored = await storageGet(["settings"]);
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  settings.blockedBotIds = uniqueClean([...(settings.blockedBotIds || []), ...normalizeBotStore(blockedState).ids]).filter(validBotId);
  settings.blockedBotNames = [];

  const availability = normalizeBotAvailability(botAvailabilityState);
  const archives = botArchiveState?.meta || {};
  const cleanedAt = Date.now();
  for (const id of ids) {
    const current = availability.meta[id];
    if (!current) continue;
    const recovery = botUnavailableRecoveryState.meta?.[id];
    availability.meta[id] = {
      ...current,
      recoverySources: uniqueClean([...(current.sources || []), ...(current.recoverySources || []), ...(recovery?.sources || [])]),
      sources: uniqueClean(["recovery", ...(archives[id] ? ["archive"] : [])]),
      reason: `${current.reason || "Confirmed unavailable."} Active QoL memberships quarantined; recovery ledger kept${archives[id] ? " with saved bot copy" : ""}.`,
      cleanupAppliedAt: cleanedAt,
      recoveredAt: 0
    };
  }
  botAvailabilityState = availability;

  // Keep this commit split from the archive/recovery-ledger phase and yield
  // before it. This prevents the old "serialize every giant store in one task"
  // behavior that caused repeated brief Options-page hangs.
  await nextOptionsIdleSlice(180);
  botStatusStorageSelfWriteUntil = Date.now() + 8000;
  const cleanedSaved = await storageSet({
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
    [QUICK_DISLIKE_BULK_STATE_KEY]: quickDislikeBulkState,
    [QUICK_LESS_LIKE_BULK_STATE_KEY]: quickLessLikeBulkState,
    [BOT_AVAILABILITY_KEY]: botAvailabilityState,
    [BOT_UNAVAILABLE_RECOVERY_KEY]: botUnavailableRecoveryState
  });

  if (!cleanedSaved) {
    showSettingsToast("Cleanup write failed. The verified recovery ledger was kept; reload before trying again.");
    return;
  }

  invalidateDuplicateCache();
  renderBotAvailability({ skipRecoveryRerender: true });
  setTimeout(() => {
    nextOptionsIdleSlice(240).then(() => {
      renderSavedBotInfo();
      renderSavedBotsHub();
      if (activeOptionsTab() === "blocking") {
        renderBotManager("blocked");
        renderBotManager("notInterested");
      }
      if (activeOptionsTab() === "saved") {
        renderBotManager("favorite");
        renderBotManager("later");
        renderBotManager("opened");
      }
      refreshStorageUsageIfVisible();
    }).catch(() => {});
  }, 120);

  showSettingsToast(
    `Cleaned ${ids.size} unavailable bot${ids.size === 1 ? "" : "s"} from other active lists; blocked IDs were kept. ` +
    `Recovery ledger saved${newArchiveCopies ? ` · ${newArchiveCopies} new saved cop${newArchiveCopies === 1 ? "y" : "ies"} recovered` : ""}.`
  );
}

