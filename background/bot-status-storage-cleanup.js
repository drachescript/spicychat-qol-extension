/* Bot Status storage retention and maintenance, version 0.2.40.
 * Cleanup is explicit. Archive, creator backups and recovery records are never deleted. */
(() => {
  "use strict";
  const JOURNAL = "botStatusCleanupJournalV1";
  const DAY = 86400000;
  let confirmArmed = false;
  const PASSIVE = new Set(["discovered", "archive", "recent", "creatorWatch"]);
  const ACTIVE = new Set(["favorite", "later", "opened", "organizer"]);
  let running = false;
  let lastPreview = null;

  // Keep passive, blocked and archived bots available in explicit scopes, but
  // never enroll them in a general routine scan merely by being seen.
  const originalCollect = collectTrackedAvailabilityBots;
  collectTrackedAvailabilityBots = function (scope = "all") {
    const entries = originalCollect(scope);
    if (scope !== "all") return entries;
    return entries.filter(entry => {
      const sources = entry.sources || [];
      return !sources.includes("blocked") && !sources.includes("notInterested") &&
        sources.some(source => ACTIVE.has(source));
    });
  };

  // Backward-compatible storage: reconstruct the baseline for comparisons.
  const originalNormalize = normalizeBotAvailability;
  normalizeBotAvailability = function (value) {
    const meta = value?.meta;
    if (!meta || typeof meta !== "object") return originalNormalize(value);
    let restored = null;
    for (const [id, entry] of Object.entries(meta)) {
      if (entry?.baselineRef !== "snapshot" || !entry.snapshot) continue;
      if (!restored) restored = { ...meta };
      restored[id] = { ...entry, baseline: entry.snapshot };
    }
    return originalNormalize(restored ? { ...value, meta: restored } : value);
  };

  // Drop only truly identical copies on persistence. Distinct baselines remain.
  const originalStore = storageSet;
  storageSet = async function (values) {
    if (!Object.prototype.hasOwnProperty.call(values || {}, BOT_AVAILABILITY_KEY)) return originalStore(values);
    const input = values[BOT_AVAILABILITY_KEY];
    if (!input?.meta || typeof input.meta !== "object") return originalStore(values);
    const meta = {};
    for (const [id, entry] of Object.entries(input.meta)) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.baseline && entry.snapshot && JSON.stringify(entry.baseline) === JSON.stringify(entry.snapshot)) {
        const { baseline, ...rest } = entry;
        meta[id] = { ...rest, baselineRef: "snapshot" };
      } else {
        const { baselineRef, ...rest } = entry;
        meta[id] = rest;
      }
    }
    return originalStore({ ...values, [BOT_AVAILABILITY_KEY]: { ...input, meta } });
  };

  function protections() {
    return {
      favorite: new Set(normalizeBotStore(favoriteBotState).ids),
      later: new Set(normalizeBotStore(laterBotState).ids),
      blocked: new Set(normalizeBotStore(blockedState).ids),
      ignored: new Set(normalizeBotStore(notInterestedState).ids),
      opened: new Set(uniqueClean(currentOpened)),
      organized: new Set(Object.keys(normalizeBotOrganization(botOrganizationState).meta || {})),
      recovery: normalizeBotUnavailableRecovery(botUnavailableRecoveryState).meta || {},
      archive: normalizeBotArchive(botArchiveState).meta || {}
    };
  }
  function eligible(id, entry, sets, maxAge) {
    if (!BOT_ID_RE.test(id) || !entry || typeof entry !== "object") return false;
    if (sets.favorite.has(id) || sets.later.has(id) || sets.blocked.has(id) ||
        sets.ignored.has(id) || sets.opened.has(id) || sets.organized.has(id)) return false;
    if (sets.recovery[id] && !sets.recovery[id].recoveredAt) return false;
    const archive = sets.archive[id];
    if (archive && (archive.ownBot || archive.profileBackup || archive.manualBackups?.length ||
        archive.revisions?.length || archive.versions?.length)) return false;
    if (entry.changedFields?.length || entry.updateDetectedAt || entry.unavailableConfirmedAt ||
        entry.recoverySources?.length || entry.unavailableEvidenceCount) return false;
    const sources = Array.isArray(entry.sources) ? entry.sources : [];
    if (sources.some(source => ACTIVE.has(source) || source === "own" || source === "manual" || source === "recovery")) return false;
    if (!sources.some(source => PASSIVE.has(source))) return false;
    if (maxAge > 0) {
      const time = Number(entry.checkedAt || entry.lastSeen || entry.firstSeen || 0);
      if (!time || time > Date.now() - maxAge * DAY) return false;
    }
    return true;
  }

  async function preview(age) {
    await ensureSavedListsDataLoaded();
    await ensureSavedRecoveryDataLoaded();
    const sets = protections();
    const ids = [];
    let logicalBytes = 0, duplicated = 0, duplicateBytes = 0;
    const entries = Object.entries(botAvailabilityState.meta || {});
    for (let i = 0; i < entries.length; i++) {
      const [id, entry] = entries[i];
      if (eligible(id, entry, sets, age)) {
        ids.push(id);
        logicalBytes += JSON.stringify(entry).length;
      }
      if (entry?.baseline && entry?.snapshot && JSON.stringify(entry.baseline) === JSON.stringify(entry.snapshot)) {
        duplicateBytes += JSON.stringify(entry.baseline).length;
        duplicated++;
      }
      if (i && i % 400 === 0) await nextOptionsIdleSlice();
    }
    return { ids, logicalBytes, duplicated, duplicateBytes, total: entries.length, age };
  }
  const el = id => document.getElementById(id);
  const status = message => { if (el("botStatusCleanupStatus")) el("botStatusCleanupStatus").textContent = message; };
  async function showPreview() {
    if (running) return;
    confirmArmed = false;
    if (el("runBotStatusCleanup")) el("runBotStatusCleanup").textContent = "Run safe cleanup";
    running = true;
    try {
      status("Checking protected records and possible savings...");
      const age = Number(el("botStatusCleanupAge")?.value ?? 0);
      lastPreview = await preview(age);
      const journal = (await storageGet([JOURNAL]))[JOURNAL];
      const pending = Array.isArray(journal?.ids) ? journal.ids.length : 0;
      status(`${lastPreview.total.toLocaleString()} status records · ${lastPreview.ids.length.toLocaleString()} eligible passive records (~${(lastPreview.logicalBytes / 1048576).toFixed(2)} MiB logical JSON) · ${lastPreview.duplicated.toLocaleString()} identical snapshot pairs (~${(lastPreview.duplicateBytes / 1048576).toFixed(2)} MiB potential deduplication). ${pending ? pending.toLocaleString() + " pending cleanup records can be resumed." : "Nothing has been removed."} Estimates are uncompressed.`);
    } catch (error) { status(`Preview failed: ${error?.message || error}`); }
    finally { running = false; }
  }
  async function runCleanup() {
    if (running || botAvailabilityScanRunning) return;
    running = true;
    const button = el("runBotStatusCleanup");
    if (button) button.disabled = true;
    try {
      const saved = await storageGet([JOURNAL]);
      let journal = saved[JOURNAL];
      let measurementStarted = false;
      if (!Array.isArray(journal?.ids)) {
        const age = Number(el("botStatusCleanupAge")?.value ?? 0);
        const report = lastPreview?.age === age ? lastPreview : await preview(age);
        if (!report.ids.length) { status("Nothing eligible for cleanup. Snapshot deduplication applies on the next Bot Status save."); return; }
        if (!confirmArmed) {
          confirmArmed = true;
          status(`Ready to remove ${report.ids.length.toLocaleString()} passive Bot Status records. Export your complete QoL backup first. Click “Confirm cleanup” to proceed, or Preview to cancel.`);
          button.textContent = "Confirm cleanup";
          return;
        }
        confirmArmed = false;
        button.textContent = "Run safe cleanup";
        // Capture before the temporary cleanup journal is written, so the
        // storage delta does not count that journal as an apparent saving.
        try { await globalThis.dsQolStorageMetrics?.beforeOperation("Bot Status cleanup"); measurementStarted = true; } catch {}
        journal = { version: 1, ids: report.ids, completed: 0, startedAt: Date.now(), age };
        if (!await rawStorageSet({ [JOURNAL]: journal })) throw Error("Could not save cleanup checkpoint.");
      }
      // Resume sessions measure with their current checkpoint still present.
      if (!measurementStarted) {
        try { await globalThis.dsQolStorageMetrics?.beforeOperation("Bot Status cleanup"); } catch {}
      }
      let removed = 0;
      while (journal.ids.length) {
        const batch = journal.ids.slice(0, 250);
        const sets = protections();
        for (const id of batch) {
          if (eligible(id, botAvailabilityState.meta?.[id], sets, journal.age || 0)) {
            delete botAvailabilityState.meta[id];
            removed++;
          }
        }
        if (!await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState })) throw Error("Data write failed; checkpoint not advanced.");
        journal.ids.splice(0, batch.length);
        journal.completed += batch.length;
        if (!await rawStorageSet({ [JOURNAL]: journal })) throw Error("Checkpoint write failed; safe to retry.");
        status(`Processed ${journal.completed.toLocaleString()} candidates · ${removed.toLocaleString()} removed this session · ${journal.ids.length.toLocaleString()} remaining.`);
        await nextOptionsIdleSlice();
      }
      await storageRemove([JOURNAL]);
      lastPreview = null;
      invalidateDuplicateCache();
      renderBotAvailability();
      refreshStorageUsageIfVisible();
      status(`Cleanup finished. ${removed.toLocaleString()} passive records removed this session. Protected copies were preserved.`);
      try { await globalThis.dsQolStorageMetrics?.afterOperation("Bot Status cleanup"); } catch {}
    } catch (error) { status(`Paused: ${error?.message || error}. Click Run cleanup again to resume.`); }
    finally { running = false; if (button) button.disabled = false; }
  }
  const anchor = el("storageUsage");
  if (anchor) {
    const section = document.createElement("section");
    section.className = "bot-status-storage-cleanup";
    section.innerHTML = '<h3>Bot Status storage cleanup</h3>' +
      '<p class="hint">Preview old passive Bot Status records. Blocked bots, favorites, opened chats, own creations, manual revisions and recovery copies are protected. Bot Archive data is not deleted.</p>' +
      '<div class="button-row"><label>Passive age <select id="botStatusCleanupAge"><option value="0">Any age</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label><button id="previewBotStatusCleanup" type="button">Preview cleanup</button><button id="runBotStatusCleanup" type="button">Run safe cleanup</button></div>' +
      '<p class="hint" id="botStatusCleanupStatus">No cleanup has been run. Export a full backup first.</p>';
    anchor.parentNode.insertBefore(section, anchor);
    const dedup = document.createElement("button");
    dedup.type = "button";
    dedup.id = "deduplicateBotStatusSnapshots";
    dedup.textContent = "Deduplicate snapshots";
    el("previewBotStatusCleanup").parentElement.appendChild(dedup);
    dedup.addEventListener("click", async () => {
      if (running || botAvailabilityScanRunning) return;
      running = true;
      dedup.disabled = true;
      try {
        await ensureSavedRecoveryDataLoaded();
        try { await globalThis.dsQolStorageMetrics?.beforeOperation("Snapshot deduplication"); } catch {}
        status("Saving deduplicated Bot Status snapshots; please leave this page open...");
        if (!await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState })) throw Error("Storage write failed");
        status("Bot Status snapshots saved with identical baselines deduplicated. Archive, revisions and history were preserved.");
        try { await globalThis.dsQolStorageMetrics?.afterOperation("Snapshot deduplication"); } catch {}
        refreshStorageUsageIfVisible();
      } catch (error) { status(`Snapshot deduplication failed: ${error?.message || error}`); }
      finally { running = false; dedup.disabled = false; }
    });
    el("previewBotStatusCleanup").addEventListener("click", showPreview);
    el("runBotStatusCleanup").addEventListener("click", runCleanup);
    el("botStatusCleanupAge").addEventListener("change", () => {
      lastPreview = null;
      confirmArmed = false;
      el("runBotStatusCleanup").textContent = "Run safe cleanup";
    });
  }
})();
