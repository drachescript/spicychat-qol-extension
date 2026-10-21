// Feature-owned options helpers: lorebook-status. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeLorebookStatusRow(rawValue) {
  const raw = rawValue && typeof rawValue === "object" ? rawValue : {};
  const id = String(raw.id || raw.lorebookId || raw.lorebook_id || "").trim().toLowerCase();
  return {
    ...raw,
    id,
    name: String(raw.name || raw.title || id || "Lorebook").replace(/\s+/g, " ").trim(),
    creator: String(raw.creator || raw.creator_username || "").replace(/\s+/g, " ").trim(),
    description: String(raw.description || "").replace(/\s+/g, " ").trim(),
    tags: uniqueClean(Array.isArray(raw.tags) ? raw.tags : []),
    image: String(raw.image || raw.avatar_url || raw.avatarUrl || "").trim(),
    entryCount: Math.max(0, Number(raw.entryCount ?? raw.num_entries ?? raw.numEntries ?? 0) || 0),
    version: Math.max(0, Number(raw.version || 0) || 0),
    numAttachedCharacters: Math.max(0, Number(raw.numAttachedCharacters ?? raw.num_attached_characters ?? 0) || 0),
    firstSeen: Number(raw.firstSeen || raw.discoveredAt || 0) || 0,
    lastSeen: Number(raw.lastSeen || raw.discoveredAt || 0) || 0,
    checkedAt: Number(raw.checkedAt || 0) || 0,
    httpStatus: Math.max(0, Number(raw.httpStatus || 0) || 0),
    availabilityStatus: String(raw.availabilityStatus || (Number(raw.checkedAt || 0) ? "unknown" : "unchecked")).trim().toLowerCase(),
    availabilityReason: String(raw.availabilityReason || raw.checkReason || "").replace(/\s+/g, " ").trim(),
    checkSource: String(raw.checkSource || "").replace(/\s+/g, " ").trim(),
    publicConfirmedAt: Number(raw.publicConfirmedAt || 0) || 0,
    publicConfirmedCurrent: raw.publicConfirmedCurrent === true,
    recoveryCopy: raw.recoveryCopy && typeof raw.recoveryCopy === "object" ? raw.recoveryCopy : null,
    recoverySavedAt: Number(raw.recoverySavedAt || raw.recoveryCopy?.savedAt || 0) || 0,
    recoveryStatus: String(raw.recoveryStatus || "").trim(),
    recoveryError: String(raw.recoveryError || "").replace(/\s+/g, " ").trim(),
    history: Array.isArray(raw.history) ? raw.history.slice(-100) : [],
    profileUrl: String(raw.profileUrl || (id ? `https://spicychat.ai/lorebook/${id}` : "")).trim()
  };
}

function normalizeLorebookStatusStore(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawMeta = source.meta && typeof source.meta === "object" && !Array.isArray(source.meta) ? source.meta : source;
  const meta = {};
  for (const [rawId, rawValue] of Object.entries(rawMeta || {})) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) continue;
    const row = normalizeLorebookStatusRow({ ...rawValue, id: rawValue.id || rawId });
    if (row.id) meta[row.id] = row;
  }
  return { meta };
}

function lorebookStatusMergeStamp(value) {
  const row = normalizeLorebookStatusRow(value);
  return Math.max(
    Number(row.checkedAt || 0),
    Number(row.lastSeen || 0),
    Number(row.recoverySavedAt || 0),
    Number(row.publicConfirmedAt || 0),
    Number(row.firstSeen || 0)
  );
}

function mergeLorebookStatusStores(existingValue, incomingValue) {
  const existing = normalizeLorebookStatusStore(existingValue);
  const incoming = normalizeLorebookStatusStore(incomingValue);
  const meta = { ...existing.meta };

  for (const [id, incomingRow] of Object.entries(incoming.meta)) {
    const existingRow = meta[id];
    if (!existingRow) {
      meta[id] = incomingRow;
      continue;
    }

    const incomingIsNewer = lorebookStatusMergeStamp(incomingRow) >= lorebookStatusMergeStamp(existingRow);
    const newer = incomingIsNewer ? incomingRow : existingRow;
    const older = incomingIsNewer ? existingRow : incomingRow;
    const existingRecoveryAt = Number(existingRow.recoverySavedAt || existingRow.recoveryCopy?.savedAt || 0);
    const incomingRecoveryAt = Number(incomingRow.recoverySavedAt || incomingRow.recoveryCopy?.savedAt || 0);
    const recoveryCopy = incomingRecoveryAt >= existingRecoveryAt
      ? (incomingRow.recoveryCopy || existingRow.recoveryCopy)
      : (existingRow.recoveryCopy || incomingRow.recoveryCopy);

    const historySeen = new Set();
    const history = [...(existingRow.history || []), ...(incomingRow.history || [])]
      .filter(entry => {
        if (!entry || typeof entry !== "object") return false;
        const key = JSON.stringify([Number(entry.at || 0), entry.changes || [], entry.entryChanges || null]);
        if (historySeen.has(key)) return false;
        historySeen.add(key);
        return true;
      })
      .sort((a, b) => Number(a?.at || 0) - Number(b?.at || 0))
      .slice(-100);

    meta[id] = normalizeLorebookStatusRow({
      ...older,
      ...newer,
      firstSeen: Math.min(...[existingRow.firstSeen, incomingRow.firstSeen].map(Number).filter(value => value > 0)) || Number(newer.firstSeen || older.firstSeen || 0),
      lastSeen: Math.max(Number(existingRow.lastSeen || 0), Number(incomingRow.lastSeen || 0)),
      recoveryCopy: recoveryCopy || null,
      recoverySavedAt: Math.max(existingRecoveryAt, incomingRecoveryAt),
      history
    });
  }

  return { meta };
}

function lorebookHistoryCount(item) {
  return Array.isArray(item?.history) ? item.history.length : 0;
}

function lorebookStatusLabel(item) {
  const status = String(item?.availabilityStatus || (item?.checkedAt ? "unknown" : "unchecked"));
  if (status === "available") return "Available";
  if (status === "candidate") return "Unavailable candidate";
  if (status === "restricted") return "Private / restricted";
  if (status === "unknown") return "Unknown";
  return "Unchecked";
}

function lorebookCenterFilteredRows() {
  const query = String(value("lorebookCenterSearch", "") || "").trim().toLocaleLowerCase();
  const terms = query.split(",").map(part => part.trim()).filter(Boolean);
  const statusFilter = String(value("lorebookCenterStatusFilter", "all") || "all");
  const rows = lorebookCenterRows.filter(item => {
    const status = String(item?.availabilityStatus || (item?.checkedAt ? "unknown" : "unchecked"));
    if (statusFilter === "updated" && lorebookHistoryCount(item) <= 0) return false;
    if (["available", "candidate", "restricted", "unknown", "unchecked"].includes(statusFilter) && status !== statusFilter) return false;
    if (!terms.length) return true;
    const hay = [
      item?.name, item?.creator, item?.id, item?.description, item?.availabilityReason,
      ...(Array.isArray(item?.tags) ? item.tags : [])
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    return terms.every(term => hay.includes(term));
  });
  const mode = value("lorebookCenterSortMode", "newest");
  rows.sort((a, b) => {
    if (mode === "oldest") return Number(a?.lastSeen || 0) - Number(b?.lastSeen || 0);
    if (mode === "checked-newest") return Number(b?.checkedAt || 0) - Number(a?.checkedAt || 0);
    if (mode === "checked-oldest") return Number(a?.checkedAt || 0) - Number(b?.checkedAt || 0);
    if (mode === "name-asc") return String(a?.name || "").localeCompare(String(b?.name || ""));
    if (mode === "name-desc") return String(b?.name || "").localeCompare(String(a?.name || ""));
    if (mode === "creator-asc") return String(a?.creator || "").localeCompare(String(b?.creator || ""));
    if (mode === "creator-desc") return String(b?.creator || "").localeCompare(String(a?.creator || ""));
    if (mode === "changes") return lorebookHistoryCount(b) - lorebookHistoryCount(a) || Number(b?.lastSeen || 0) - Number(a?.lastSeen || 0);
    return Number(b?.lastSeen || 0) - Number(a?.lastSeen || 0);
  });
  return rows;
}

function lorebookStatusCounts() {
  const staleDays = Math.max(1, Number(value("lorebookStatusStaleDays", "7")) || 7);
  const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  const counts = { total: lorebookCenterRows.length, checked: 0, unchecked: 0, stale: 0, available: 0, candidate: 0, restricted: 0, unknown: 0, changed: 0 };
  for (const item of lorebookCenterRows) {
    const checkedAt = Number(item?.checkedAt || 0);
    const status = String(item?.availabilityStatus || (checkedAt ? "unknown" : "unchecked"));
    if (checkedAt) {
      counts.checked += 1;
      if (checkedAt <= staleCutoff) counts.stale += 1;
    } else counts.unchecked += 1;
    if (status !== "unchecked" && status in counts) counts[status] += 1;
    if (lorebookHistoryCount(item) > 0) counts.changed += 1;
  }
  return counts;
}

function setLorebookScanButtonsState() {
  const counts = lorebookStatusCounts();
  const scan = $("scanLorebookAvailability");
  const unchecked = $("scanUncheckedLorebookAvailability");
  const stale = $("scanStaleLorebookAvailability");
  const stop = $("stopLorebookAvailabilityScan");
  if (scan) scan.disabled = lorebookStatusScanRunning || counts.total === 0;
  if (unchecked) {
    unchecked.disabled = lorebookStatusScanRunning || counts.unchecked === 0;
    unchecked.textContent = counts.unchecked ? `Check unchecked Lorebooks (${counts.unchecked})` : "No unchecked Lorebooks";
  }
  if (stale) {
    stale.disabled = lorebookStatusScanRunning || counts.stale === 0;
    stale.textContent = counts.stale ? `Refresh stale Lorebooks (${counts.stale})` : "No stale Lorebooks";
  }
  if (stop) stop.disabled = !lorebookStatusScanRunning;
  const availabilitySummary = $("lorebookCenterAvailabilitySummary");
  if (availabilitySummary) {
    availabilitySummary.textContent = `${counts.available} available · ${counts.candidate} candidate · ${counts.restricted} restricted · ${counts.unknown} unknown`;
  }
}

function lorebookMeaningfulChanges(previousValue, currentValue) {
  const previous = normalizeLorebookStatusRow(previousValue);
  const current = normalizeLorebookStatusRow(currentValue);
  const fields = ["name", "creator", "description", "image", "entryCount", "visibility", "status", "version", "numAttachedCharacters", "updatedAt"];
  const changes = [];
  for (const field of fields) {
    const before = previous?.[field] ?? "";
    const after = current?.[field] ?? "";
    if (!String(before || "") || !String(after || "")) continue;
    if (String(before) !== String(after)) changes.push({ field, before, after });
  }
  const beforeTags = uniqueClean(previous.tags || []).sort();
  const afterTags = uniqueClean(current.tags || []).sort();
  if (beforeTags.length && afterTags.length && JSON.stringify(beforeTags) !== JSON.stringify(afterTags)) changes.push({ field: "tags", before: beforeTags, after: afterTags });
  return changes;
}

function lorebookRecoveryEntries(value) {
  const entries = value?.recoveryCopy?.entries;
  return Array.isArray(entries) ? entries.filter(entry => entry && typeof entry === "object") : [];
}

function lorebookEntryIdentity(entry, index = 0) {
  const id = String(entry?.id || "").trim();
  return id || `index:${index}`;
}

function lorebookEntrySignature(entry) {
  const keywords = uniqueClean(Array.isArray(entry?.keywords) ? entry.keywords : []).sort();
  const secondary = uniqueClean(Array.isArray(entry?.secondaryKeywords) ? entry.secondaryKeywords : []).sort();
  return JSON.stringify([
    entry?.version ?? "",
    entry?.updatedAt ?? "",
    entry?.name ?? "",
    keywords,
    secondary,
    entry?.content ?? "",
    entry?.priority ?? "",
    entry?.status ?? "",
    entry?.enabled !== false,
    entry?.constant === true,
    entry?.selective === true,
    entry?.caseSensitive === true,
    entry?.probability ?? null,
    entry?.depth ?? null,
    entry?.role ?? ""
  ]);
}

function lorebookRecoveryEntryChanges(previousValue, currentValue) {
  const beforeEntries = lorebookRecoveryEntries(previousValue);
  const afterEntries = lorebookRecoveryEntries(currentValue);

  const beforeMap = new Map(beforeEntries.map((entry, index) => [lorebookEntryIdentity(entry, index), entry]));
  const afterMap = new Map(afterEntries.map((entry, index) => [lorebookEntryIdentity(entry, index), entry]));
  const describe = (entry, id) => ({
    id,
    name: String(entry?.name || "").trim(),
    version: entry?.version ?? "",
    updatedAt: String(entry?.updatedAt || "").trim()
  });
  const added = [];
  const removed = [];
  const changed = [];

  for (const [id, entry] of afterMap) {
    const before = beforeMap.get(id);
    if (!before) {
      added.push(describe(entry, id));
      continue;
    }
    if (lorebookEntrySignature(before) !== lorebookEntrySignature(entry)) {
      changed.push({
        id,
        name: String(entry?.name || before?.name || "").trim(),
        beforeVersion: before?.version ?? "",
        afterVersion: entry?.version ?? "",
        beforeUpdatedAt: String(before?.updatedAt || "").trim(),
        afterUpdatedAt: String(entry?.updatedAt || "").trim()
      });
    }
  }
  for (const [id, entry] of beforeMap) {
    if (!afterMap.has(id)) removed.push(describe(entry, id));
  }

  if (!added.length && !removed.length && !changed.length) return null;
  return { added, removed, changed };
}

function lorebookEntryChangeSummary(entryChanges) {
  if (!entryChanges) return [];
  const changes = [];
  if (entryChanges.added?.length) changes.push({ field: "Entries added", before: "0", after: String(entryChanges.added.length) });
  if (entryChanges.removed?.length) changes.push({ field: "Entries removed", before: String(entryChanges.removed.length), after: "0" });
  if (entryChanges.changed?.length) changes.push({ field: "Entries changed", before: "0", after: String(entryChanges.changed.length) });
  return changes;
}

function reconcileLorebookStatus(previousValue, checkedValue) {
  const previous = normalizeLorebookStatusRow(previousValue || {});
  const checked = checkedValue && typeof checkedValue === "object" ? checkedValue : {};
  const id = String(checked.id || previous.id || "").trim().toLowerCase();
  const now = Number(checked.checkedAt || Date.now()) || Date.now();
  const live = checked.meta && typeof checked.meta === "object" ? checked.meta : {};
  const available = String(checked.availabilityStatus || "") === "available";
  const possibleRecovery = checked.recoveryCopy && typeof checked.recoveryCopy === "object" ? checked.recoveryCopy : null;
  const expectedEntries = Math.max(0, Number(checked.meta?.entryCount ?? previous.entryCount ?? 0) || 0);
  const hasNewRecovery = !!possibleRecovery && lorebookRecoveryIsComplete(possibleRecovery, expectedEntries);
  const recoveryAttempted = checked.recoveryAttempted === true || !!possibleRecovery;
  const publicConfirmed = checked.publicConfirmed === true;
  const nextRecovery = hasNewRecovery ? checked.recoveryCopy : previous.recoveryCopy;

  const next = normalizeLorebookStatusRow({
    ...previous,
    ...(available ? live : {}),
    id,
    profileUrl: previous.profileUrl || (id ? `https://spicychat.ai/lorebook/${id}` : ""),
    firstSeen: Number(previous.firstSeen || now),
    lastSeen: available ? now : Number(previous.lastSeen || now),
    checkedAt: now,
    httpStatus: Number(checked.httpStatus || 0) || 0,
    availabilityStatus: String(checked.availabilityStatus || "unknown"),
    availabilityReason: String(checked.reason || checked.availabilityReason || ""),
    checkSource: String(checked.checkSource || previous.checkSource || ""),
    publicConfirmedAt: publicConfirmed ? now : Number(previous.publicConfirmedAt || 0),
    publicConfirmedCurrent: publicConfirmed,
    recoveryCopy: nextRecovery || null,
    recoverySavedAt: hasNewRecovery ? now : Number(previous.recoverySavedAt || previous.recoveryCopy?.savedAt || 0),
    recoveryStatus: hasNewRecovery ? "saved" : (recoveryAttempted ? "failed" : String(previous.recoveryStatus || "")),
    recoveryError: hasNewRecovery ? "" : (recoveryAttempted ? (possibleRecovery ? "New recovery was incomplete; retained the previous complete copy." : String(checked.recoveryError || checked.reason || "Recovery copy refresh failed.")) : String(previous.recoveryError || ""))
  });

  const changes = available && previous.id ? lorebookMeaningfulChanges(previous, next) : [];
  const entryChanges = hasNewRecovery && previous.recoveryCopy ? lorebookRecoveryEntryChanges(previous, next) : null;
  changes.push(...lorebookEntryChangeSummary(entryChanges));

  if (changes.length || entryChanges) {
    next.history = [...(previous.history || []), { at: now, changes, entryChanges }].slice(-100);
  } else {
    next.history = [...(previous.history || [])].slice(-100);
  }
  return next;
}

function lorebookRecoveryIsComplete(copy, expected = 0) {
  if (!copy || !Array.isArray(copy.entries)) return false;
  const required = Math.max(0, Number(expected || 0) || 0);
  if (copy.entries.length < required) return false;
  return copy.entries.every(entry => entry && typeof entry === "object" && String(entry.content || entry.text || "").trim());
}

async function persistLorebookStatusEntries(entries) {
  const cleanEntries = {};
  for (const [id, item] of Object.entries(entries || {})) {
    if (!id || !item) continue;
    cleanEntries[id] = normalizeLorebookStatusRow(item);
  }
  if (!Object.keys(cleanEntries).length) return true;
  const response = await runtimeMessage({ type: "DS_LARGE_STORAGE_MERGE", key: LOREBOOK_STATUS_KEY, entries: cleanEntries });
  if (!response?.ok) throw new Error(`Lorebook records could not be saved: ${String(response?.error || "storage error")}`);
  // Verify copies came back from persistent IndexedDB, not merely the scan's
  // in-memory cache. This also catches incomplete compressed write/read paths.
  const withCopies = Object.values(cleanEntries).filter(row => row.recoveryCopy && Array.isArray(row.recoveryCopy.entries));
  if (withCopies.length) {
    const verify = await runtimeMessage({ type: "DS_LARGE_STORAGE_GET_RECORDS", key: LOREBOOK_STATUS_KEY, ids: withCopies.map(row => row.id) });
    if (!verify?.ok) throw new Error("Could not verify saved Lorebook entries after writing.");
    for (const row of withCopies) {
      const stored = verify.records?.[row.id]?.recoveryCopy;
      if (!stored || JSON.stringify(stored.entries) !== JSON.stringify(row.recoveryCopy.entries)) {
        throw new Error(`Saved Lorebook entry verification failed for ${row.name || row.id}.`);
      }
    }
  }
  return true;
}

async function checkLorebookAvailability(item, { keepHelper = false, forceOwnHelper = false, timeoutMs = 24000 } = {}) {
  const row = normalizeLorebookStatusRow(item);
  if (!row.id) {
    return {
      id: row.id,
      checkedAt: Date.now(),
      availabilityStatus: "unknown",
      httpStatus: 0,
      reason: "Missing Lorebook UUID.",
      recoveryAttempted: false
    };
  }
  try {
    const result = await runtimeMessageWithTimeout({
      type: "DS_LOREBOOK_STATUS_HELPER_CHECK",
      lorebookId: row.id,
      keepHelper: !!keepHelper,
      forceOwnHelper: !!forceOwnHelper
    }, timeoutMs);
    if (result?.__dsTimeout) {
      return {
        id: row.id,
        checkedAt: Date.now(),
        availabilityStatus: "unknown",
        httpStatus: 0,
        reason: "Lorebook Status helper timed out.",
        recoveryAttempted: true
      };
    }
    return {
      id: row.id,
      checkedAt: Date.now(),
      availabilityStatus: String(result?.status || "unknown"),
      httpStatus: Number(result?.httpStatus || 0) || 0,
      reason: String(result?.reason || ""),
      meta: result?.meta && typeof result.meta === "object" ? result.meta : null,
      recoveryCopy: result?.recoveryCopy && typeof result.recoveryCopy === "object" ? result.recoveryCopy : null,
      recoveryAttempted: result?.recoveryAttempted === true,
      recoveryAuthSource: String(result?.recoveryAuthSource || ""),
      checkSource: String(result?.checkSource || "Authenticated recovery API")
    };
  } catch (error) {
    return {
      id: row.id,
      checkedAt: Date.now(),
      availabilityStatus: "unknown",
      httpStatus: 0,
      reason: error?.message || "Lorebook Status helper failed.",
      recoveryAttempted: true
    };
  }
}

function combineLorebookPublicAndRecovery(previous, indexed, direct) {
  const publicFound = !!indexed?.found && !!indexed?.meta;
  const directAvailable = String(direct?.availabilityStatus || "") === "available";
  const publicMeta = publicFound ? indexed.meta : null;
  const directMeta = direct?.meta && typeof direct.meta === "object" ? direct.meta : null;
  const recoveryCopy = direct?.recoveryCopy && typeof direct.recoveryCopy === "object" ? direct.recoveryCopy : null;

  if (publicFound) {
    const entryCount = Array.isArray(recoveryCopy?.entries)
      ? recoveryCopy.entries.length
      : Math.max(0, Number(directMeta?.entryCount ?? publicMeta?.entryCount ?? previous?.entryCount ?? 0) || 0);
    const failedRecovery = direct?.recoveryAttempted === true && !recoveryCopy;
    const reason = recoveryCopy
      ? `Public index confirmed this Lorebook is available. Recovery copy saved with ${entryCount} entr${entryCount === 1 ? "y" : "ies"}.`
      : failedRecovery
        ? `Public index confirmed this Lorebook is available. Recovery refresh failed, so the previous saved copy was kept. ${String(direct?.reason || "").trim()}`.trim()
        : "Public index confirmed this Lorebook is currently discoverable.";
    return {
      id: previous.id,
      checkedAt: Date.now(),
      availabilityStatus: "available",
      httpStatus: Number(direct?.httpStatus || 0) || 0,
      checkSource: recoveryCopy ? `Public index + ${String(direct?.checkSource || "Recovery API")}` : "Public index",
      reason,
      meta: { ...publicMeta, ...(directAvailable ? directMeta : {}) },
      publicConfirmed: true,
      recoveryCopy,
      recoveryAttempted: direct?.recoveryAttempted === true,
      recoveryError: failedRecovery ? String(direct?.reason || "Recovery copy refresh failed.") : ""
    };
  }

  return {
    ...direct,
    id: previous.id,
    checkedAt: Number(direct?.checkedAt || Date.now()) || Date.now(),
    checkSource: String(direct?.checkSource || "Authenticated recovery API"),
    publicConfirmed: false
  };
}

function mergeLorebookRecoveryAttempts(primary, fallback) {
  if (fallback?.recoveryCopy) return fallback;
  if (primary?.recoveryCopy) return primary;
  if (!primary) return fallback;
  if (!fallback) return primary;
  const reasons = [
    String(primary?.reason || "").trim(),
    String(fallback?.reason || "").trim()
  ].filter(Boolean);
  return {
    ...primary,
    ...fallback,
    recoveryAttempted: primary?.recoveryAttempted === true || fallback?.recoveryAttempted === true,
    recoveryCopy: null,
    checkSource: [primary?.checkSource, fallback?.checkSource].filter(Boolean).join(" + ") || "Recovery",
    reason: reasons.join(" Auth fallback: ") || "Recovery copy refresh failed."
  };
}

async function runSingleLorebookStatusCheck(id, button = null) {
  const index = lorebookCenterRows.findIndex(item => String(item?.id || "") === String(id || ""));
  if (index < 0) return;
  const previous = lorebookCenterRows[index];
  if (button) { button.disabled = true; button.textContent = "Checking…"; }

  try {
    const publicResults = await checkPublicLorebookStatusBatch([previous]);
    const indexed = publicResults instanceof Map ? publicResults.get(previous.id) : null;
    let recovery = null;

    if (indexed?.found) {
      recovery = await checkPublicLorebookRecovery(indexed, { timeoutMs: 30000 });
      if (!recovery?.recoveryCopy) {
        const authenticated = await checkLorebookAvailability(previous, { keepHelper: false, forceOwnHelper: false, timeoutMs: 24000 });
        recovery = mergeLorebookRecoveryAttempts(recovery, authenticated);
      }
    } else {
      recovery = await checkLorebookAvailability(previous, { keepHelper: false, forceOwnHelper: false, timeoutMs: 24000 });
    }

    const checked = combineLorebookPublicAndRecovery(previous, indexed, recovery);
    const next = reconcileLorebookStatus(previous, checked);
    lorebookCenterRows[index] = next;
    await persistLorebookStatusEntries({ [next.id]: next });
  } finally {
    renderLorebookCenter();
  }
}

function renderLorebookCenter() {
  const statsEl = $("lorebookCenterStats");
  const host = $("lorebookCenterRecent");
  if (!host) return;

  const rows = lorebookCenterFilteredRows();
  const counts = lorebookStatusCounts();
  const blocked = linesToArray(value("lorebookBlockedIds", "")).length;
  if (statsEl) {
    const shown = Math.min(rows.length, lorebookCenterVisibleCount);
    const matches = rows.length !== counts.total ? ` · ${rows.length} matching` : "";
    statsEl.textContent = `${counts.total} tracked · ${counts.checked} checked · ${counts.changed} changed · ${blocked} blocked${matches} · showing ${shown}`;
  }
  setLorebookScanButtonsState();

  host.innerHTML = "";
  for (const item of rows.slice(0, lorebookCenterVisibleCount)) {
    const card = makeElement("div", { className: "bot-manager-card lorebook-manager-card" });
    card.dataset.id = item.id || "";
    if (item.image) card.appendChild(makeDeferredManagerImage(item.image));

    const main = makeElement("div", { className: "bot-manager-main" });
    main.appendChild(makeElement("div", { className: "bot-manager-title", text: item.name || item.id || "Lorebook" }));
    if (item.creator) main.appendChild(makeElement("div", { className: "bot-manager-creator", text: item.creator }));
    if (item.id) main.appendChild(makeElement("div", { className: "bot-manager-id", text: item.id }));

    const metaParts = [];
    if (Number(item.lastSeen || 0)) metaParts.push(`Last seen ${new Date(Number(item.lastSeen)).toLocaleString()}`);
    if (Number(item.checkedAt || 0)) metaParts.push(`Checked ${new Date(Number(item.checkedAt)).toLocaleString()}`);
    if (item.checkSource) metaParts.push(`via ${item.checkSource}`);
    if (item.updatedAt) metaParts.push(`Updated ${item.updatedAt}`);
    if (item.httpStatus) metaParts.push(`HTTP ${item.httpStatus}`);
    if (metaParts.length) main.appendChild(makeElement("div", { className: "bot-manager-creator", text: metaParts.join(" · ") }));
    if (item.description) main.appendChild(makeElement("div", { className: "bot-manager-description", text: item.description }));
    if (item.availabilityReason && item.availabilityStatus !== "available") main.appendChild(makeElement("div", { className: "bot-manager-description", text: item.availabilityReason }));
    if (item.recoveryStatus === "failed" && item.recoveryError) {
      const retained = item.recoveryCopy ? " Previous recovery copy kept." : "";
      main.appendChild(makeElement("div", { className: "bot-manager-description", text: `Recovery refresh failed.${retained} ${item.recoveryError}`.trim() }));
    }

    const chips = makeElement("div", { className: "bot-manager-meta-chips" });
    const chipValues = [lorebookStatusLabel(item)];
    if (item.visibility) chipValues.push(item.visibility);
    if (item.status && item.status !== item.visibility) chipValues.push(item.status);
    if (Number(item.entryCount || 0)) chipValues.push(`${Number(item.entryCount)} entries`);
    const storedEntries = lorebookRecoveryEntries(item);
    if (item.recoveryCopy) chipValues.push(`${storedEntries.length} stored entr${storedEntries.length === 1 ? "y" : "ies"}`);
    if (item.recoveryCopy && !lorebookRecoveryIsComplete(item.recoveryCopy, Number(item.entryCount || 0))) chipValues.push("Partial / review copy");
    if (Number(item.version || 0)) chipValues.push(`v${Number(item.version)}`);
    const historyCount = lorebookHistoryCount(item);
    if (historyCount) chipValues.push(`${historyCount} change${historyCount === 1 ? "" : "s"}`);
    chipValues.forEach(textValue => chips.appendChild(makeElement("span", { text: textValue })));
    main.appendChild(chips);

    const actions = makeElement("div", { className: "bot-manager-actions" });
    if (item.profileUrl || item.id) {
      const link = makeElement("a", { text: "Open Lorebook" });
      link.href = item.profileUrl || `https://spicychat.ai/lorebook/${encodeURIComponent(item.id)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.appendChild(link);
    }
    const checkButton = makeElement("button", { className: "lorebook-status-recheck", text: item.checkedAt ? "Recheck" : "Check now", attrs: { type: "button" } });
    actions.appendChild(checkButton);
    main.appendChild(actions);

    // Show the actual saved contents on demand. An entry-count badge alone
    // cannot demonstrate that keywords and text survived storage.
    if (storedEntries.length) {
      const details = makeElement("details", { className: "bot-history-details" });
      details.appendChild(makeElement("summary", { text: `Inspect stored entries (${storedEntries.length})` }));
      details.addEventListener("toggle", () => {
        if (!details.open || details.dataset.loaded) return;
        details.dataset.loaded = "1";
        for (const [index, entry] of storedEntries.entries()) {
          const block = makeElement("div", { className: "bot-history-snapshot" });
          block.appendChild(makeElement("div", { className: "bot-update-field", text: String(entry.name || `Entry ${index + 1}`) }));
          block.appendChild(makeElement("div", { className: "bot-update-before", text: `Keywords: ${[].concat(entry.keywords || []).join(", ") || "(none)"}` }));
          const content = makeElement("div", { className: "bot-update-after" });
          content.style.whiteSpace = "pre-wrap";
          content.textContent = String(entry.content || entry.text || "(no saved content)");
          block.appendChild(content);
          details.appendChild(block);
        }
      });
      main.appendChild(details);
    }

    if (historyCount) {
      const details = makeElement("details", { className: "bot-history-details" });
      details.appendChild(makeElement("summary", { text: `Change history (${historyCount})` }));
      [...item.history].reverse().slice(0, 25).forEach(entry => {
        const snapshot = makeElement("div", { className: "bot-history-snapshot" });
        const at = Number(entry?.at || 0) ? new Date(Number(entry.at)).toLocaleString() : "Unknown time";
        snapshot.appendChild(makeElement("div", { className: "bot-update-field", text: at }));
        (Array.isArray(entry?.changes) ? entry.changes : []).forEach(change => {
          const block = makeElement("div", { className: "bot-update-change" });
          block.appendChild(makeElement("div", { className: "bot-update-field", text: String(change?.field || "field") }));
          block.appendChild(makeElement("div", { className: "bot-update-before", text: `Before: ${shortenedDiffValue(change?.before)}` }));
          block.appendChild(makeElement("div", { className: "bot-update-after", text: `Now: ${shortenedDiffValue(change?.after)}` }));
          snapshot.appendChild(block);
        });
        const entryChanges = entry?.entryChanges && typeof entry.entryChanges === "object" ? entry.entryChanges : null;
        if (entryChanges) {
          const describeEntry = value => {
            const name = String(value?.name || "").trim();
            const id = String(value?.id || "").trim();
            const version = value?.version ?? value?.afterVersion ?? "";
            return `${name || id}${name && id ? ` · ${id}` : ""}${String(version || "") ? ` · v${version}` : ""}`;
          };
          if (entryChanges.added?.length) snapshot.appendChild(makeElement("div", { className: "bot-update-after", text: `Added: ${entryChanges.added.slice(0, 12).map(describeEntry).join(" | ")}${entryChanges.added.length > 12 ? ` | +${entryChanges.added.length - 12} more` : ""}` }));
          if (entryChanges.removed?.length) snapshot.appendChild(makeElement("div", { className: "bot-update-before", text: `Removed: ${entryChanges.removed.slice(0, 12).map(describeEntry).join(" | ")}${entryChanges.removed.length > 12 ? ` | +${entryChanges.removed.length - 12} more` : ""}` }));
          if (entryChanges.changed?.length) snapshot.appendChild(makeElement("div", { className: "bot-update-after", text: `Changed: ${entryChanges.changed.slice(0, 12).map(value => {
            const label = String(value?.name || value?.id || "").trim();
            const beforeVersion = String(value?.beforeVersion ?? "");
            const afterVersion = String(value?.afterVersion ?? "");
            return `${label}${beforeVersion || afterVersion ? ` · v${beforeVersion || "?"} → v${afterVersion || "?"}` : ""}`;
          }).join(" | ")}${entryChanges.changed.length > 12 ? ` | +${entryChanges.changed.length - 12} more` : ""}` }));
        }
        details.appendChild(snapshot);
      });
      main.appendChild(details);
    }

    card.appendChild(main);
    host.appendChild(card);
    checkButton.addEventListener("click", () => runSingleLorebookStatusCheck(item.id, checkButton).catch(() => showSettingsToast("Could not check that Lorebook.")));
  }

  if (!rows.length) {
    host.appendChild(makeElement("div", {
      className: "manager-empty-state",
      text: lorebookCenterRows.length
        ? "No tracked Lorebooks match this filter."
        : "No Lorebooks tracked yet. Encounter Lorebooks while tracking is enabled; loaded Public Lorebook cards are saved automatically."
    }));
  }

  const more = $("lorebookCenterShowMore");
  const less = $("lorebookCenterShowLess");
  const hundred = $("lorebookCenterCollapse");
  const canShowMore = rows.length > lorebookCenterVisibleCount;
  const canShowLess = rows.length > 0 && lorebookCenterVisibleCount > 20;
  const canShowHundred = rows.length > 20;
  if (more) {
    more.hidden = !canShowMore;
    more.style.display = canShowMore ? "" : "none";
    more.textContent = `Show 20 more${canShowMore ? ` (${rows.length - lorebookCenterVisibleCount} left)` : ""}`;
  }
  if (less) {
    less.hidden = !canShowLess;
    less.style.display = canShowLess ? "" : "none";
    less.textContent = "Show first 20";
  }
  if (hundred) {
    hundred.hidden = !canShowHundred;
    hundred.style.display = canShowHundred ? "" : "none";
    hundred.textContent = lorebookCenterVisibleCount >= Math.min(rows.length, 100) ? "Collapse to 20" : "Show 100";
  }
}

async function refreshLorebookCenter() {
  const statsEl = $("lorebookCenterStats");
  if (statsEl) statsEl.textContent = "Loading Lorebook history…";
  const response = await runtimeMessage({ type: "DS_LARGE_STORAGE_GET", keys: [LOREBOOK_STATUS_KEY] });
  const meta = response?.ok && response.data?.[LOREBOOK_STATUS_KEY]?.meta && typeof response.data[LOREBOOK_STATUS_KEY].meta === "object"
    ? response.data[LOREBOOK_STATUS_KEY].meta : {};
  lorebookCenterRows = Object.values(meta).filter(item => item && typeof item === "object").map(normalizeLorebookStatusRow).filter(item => item.id);
  renderLorebookCenter();
  return meta;
}

function lorebookStatusScanDelayMs() {
  const speed = String(value("lorebookStatusScanSpeed", "safe"));
  return Number(LOREBOOK_STATUS_SCAN_SPEED_DELAYS[speed] || LOREBOOK_STATUS_SCAN_SPEED_DELAYS.safe);
}

async function checkPublicLorebookStatusBatch(items) {
  const ids = (Array.isArray(items) ? items : []).map(item => String(item?.id || "").trim()).filter(Boolean).slice(0, 60);
  if (!ids.length) return new Map();
  try {
    const response = await runtimeMessageWithTimeout({ type: "DS_LOREBOOK_STATUS_PUBLIC_CHECK_BATCH", ids }, 15000);
    if (!response?.ok) return null;
    return new Map((Array.isArray(response.results) ? response.results : []).map(result => [String(result?.id || "").toLowerCase(), result]));
  } catch {
    return null;
  }
}

function publicLorebookRecoveryCopy(indexed, entries, source = "typesense:lorebook_entries_public") {
  const meta = indexed?.meta && typeof indexed.meta === "object" ? indexed.meta : {};
  const cleanEntries = Array.isArray(entries) ? entries.filter(entry => entry && typeof entry === "object") : [];
  return {
    schema: "spicychat-qol-lorebook-recovery-copy",
    version: 1,
    savedAt: Date.now(),
    source: String(source || "typesense:lorebook_entries_public"),
    lorebook: {
      id: String(meta.id || indexed?.id || "").trim().toLowerCase(),
      name: String(meta.name || ""),
      description: String(meta.description || ""),
      creator: String(meta.creator || ""),
      creatorId: String(meta.creatorId || ""),
      image: String(meta.image || ""),
      tags: uniqueClean(Array.isArray(meta.tags) ? meta.tags : []),
      visibility: String(meta.visibility || ""),
      status: String(meta.status || ""),
      entryCount: Math.max(0, Number(meta.entryCount ?? cleanEntries.length) || 0),
      version: Math.max(0, Number(meta.version || 0) || 0),
      numAttachedCharacters: Math.max(0, Number(meta.numAttachedCharacters || 0) || 0),
      createdAt: String(meta.createdAt || ""),
      updatedAt: String(meta.updatedAt || ""),
      isNsfw: meta.isNsfw === true,
      avatarIsNsfw: meta.avatarIsNsfw === true,
      profileUrl: String(meta.profileUrl || "")
    },
    entries: cleanEntries
  };
}

async function checkPublicLorebookRecovery(indexed, { timeoutMs = 30000 } = {}) {
  const id = String(indexed?.id || indexed?.meta?.id || "").trim().toLowerCase();
  const expectedCount = Math.max(0, Number(indexed?.meta?.entryCount || 0) || 0);
  if (!id || !indexed?.found) return null;
  try {
    const result = await runtimeMessageWithTimeout({
      type: "DS_LOREBOOK_PUBLIC_RECOVERY_FETCH",
      lorebookId: id,
      expectedCount
    }, timeoutMs);
    if (result?.__dsTimeout) {
      return {
        id, checkedAt: Date.now(), availabilityStatus: "available", httpStatus: 0,
        reason: "Public entry recovery timed out. The previous recovery copy was kept.",
        checkSource: "Public Lorebook entries", recoveryAttempted: true
      };
    }
    if (!result?.ok || result?.complete === false) {
      return {
        id, checkedAt: Date.now(), availabilityStatus: "available", httpStatus: 0,
        reason: String(result?.error || "Public entry recovery failed. The previous recovery copy was kept."),
        checkSource: "Public Lorebook entries", recoveryAttempted: true
      };
    }
    const recoveryCopy = publicLorebookRecoveryCopy(indexed, result.entries, result.source);
    return {
      id,
      checkedAt: Date.now(),
      availabilityStatus: "available",
      httpStatus: 200,
      reason: `Public entry recovery saved ${recoveryCopy.entries.length} entr${recoveryCopy.entries.length === 1 ? "y" : "ies"}.`,
      checkSource: "Public Lorebook entries",
      meta: indexed.meta || null,
      recoveryCopy,
      recoveryAttempted: true
    };
  } catch (error) {
    return {
      id, checkedAt: Date.now(), availabilityStatus: "available", httpStatus: 0,
      reason: `${error?.message || "Public entry recovery failed."} The previous recovery copy was kept.`,
      checkSource: "Public Lorebook entries", recoveryAttempted: true
    };
  }
}

async function runLorebookStatusScan({ mode = "all" } = {}) {
  if (lorebookStatusScanRunning) return;
  if (!lorebookCenterRows.length) await refreshLorebookCenter();
  const staleDays = Math.max(1, Number(value("lorebookStatusStaleDays", "7")) || 7);
  const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  let rows = [...lorebookCenterRows];
  if (mode === "unchecked") rows = rows.filter(item => Number(item.checkedAt || 0) <= 0);
  else if (mode === "stale") rows = rows.filter(item => Number(item.checkedAt || 0) > 0 && Number(item.checkedAt || 0) <= staleCutoff);
  rows.sort((a, b) => Number(a.checkedAt || 0) - Number(b.checkedAt || 0) || Number(a.lastSeen || 0) - Number(b.lastSeen || 0));

  const status = $("lorebookCenterScanStatus");
  if (!rows.length) {
    const message = mode === "unchecked" ? "No unchecked Lorebooks." : mode === "stale" ? `No Lorebooks are older than ${staleDays} day${staleDays === 1 ? "" : "s"}.` : "No tracked Lorebooks to scan.";
    if (status) status.textContent = message;
    renderLorebookCenter();
    return;
  }

  lorebookStatusScanRunning = true;
  lorebookStatusStopRequested = false;
  setLorebookScanButtonsState();

  const byId = new Map(lorebookCenterRows.map(item => [item.id, item]));
  const changedEntries = {};
  const publicById = new Map();
  const authQueue = [];
  let completed = 0;
  let available = 0;
  let candidate = 0;
  let restricted = 0;
  let unknown = 0;
  let recoverySaved = 0;
  let recoveryKept = 0;
  let publicRecoverySaved = 0;
  let authenticatedFallbacks = 0;

  const recordResult = async (previous, checked, { flush = false } = {}) => {
    const next = reconcileLorebookStatus(previous, checked);
    byId.set(next.id, next);
    changedEntries[next.id] = next;
    completed += 1;
    if (next.availabilityStatus === "available") available += 1;
    else if (next.availabilityStatus === "candidate") candidate += 1;
    else if (next.availabilityStatus === "restricted") restricted += 1;
    else unknown += 1;
    if (checked?.recoveryCopy) recoverySaved += 1;
    else if (checked?.recoveryAttempted && previous?.recoveryCopy) recoveryKept += 1;

    if (flush || Object.keys(changedEntries).length >= 50) {
      await persistLorebookStatusEntries(changedEntries);
      for (const id of Object.keys(changedEntries)) delete changedEntries[id];
    }
    return next;
  };

  try {
    // Phase 1: exact tracked UUID checks only. The scoped Lorebook key is read
    // from SpicyChat's current public application config instead of reusing the
    // character-search key.
    for (let offset = 0; offset < rows.length && !lorebookStatusStopRequested; offset += 60) {
      const batch = rows.slice(offset, offset + 60);
      if (status) status.textContent = `Checking tracked Lorebooks ${Math.min(offset + 1, rows.length)}–${Math.min(offset + batch.length, rows.length)} / ${rows.length} against the Public index…`;
      const indexResults = await checkPublicLorebookStatusBatch(batch);
      if (!(indexResults instanceof Map)) continue;
      for (const item of batch) {
        const indexed = indexResults.get(String(item.id || "").toLowerCase());
        if (indexed) publicById.set(String(item.id || "").toLowerCase(), indexed);
      }
    }

    if (lorebookStatusStopRequested) return;

    // Phase 2: public Lorebooks use the same public entry collection as the
    // Archive crawler. This avoids the authenticated /lorebooks/<id> endpoint
    // for data SpicyChat already exposes publicly and does not open a helper.
    for (let index = 0; index < rows.length && !lorebookStatusStopRequested; index += 1) {
      const item = rows[index];
      const previous = byId.get(item.id) || item;
      const indexed = publicById.get(previous.id);

      if (!indexed?.found) {
        authQueue.push({ previous, indexed: indexed || null, publicAttempt: null });
        continue;
      }

      if (status) status.textContent = `Public recovery copy ${index + 1} / ${rows.length}: ${previous.name || previous.id}`;
      const publicAttempt = await checkPublicLorebookRecovery(indexed, { timeoutMs: 30000 });
      if (publicAttempt?.recoveryCopy) {
        publicRecoverySaved += 1;
        await recordResult(previous, combineLorebookPublicAndRecovery(previous, indexed, publicAttempt));
      } else {
        // Keep the public availability result, but give the authenticated
        // request one chance to recover the copy before preserving the old one.
        authQueue.push({ previous, indexed, publicAttempt });
      }

      if (!lorebookStatusStopRequested && index + 1 < rows.length) {
        await waitForBotStatusPace(lorebookStatusScanDelayMs());
      }
    }

    if (lorebookStatusStopRequested) return;

    // Phase 3: only index misses or public-entry recovery failures need the
    // signed-in helper. One persistent helper is reused for the whole queue.
    if (authQueue.length) {
      if (status) status.textContent = `Preparing one signed-in helper for ${authQueue.length} Lorebook fallback check${authQueue.length === 1 ? "" : "s"}…`;
      const prepared = await prepareBotStatusHelper({ forceOwnHelper: true, timeoutMs: 22000 });

      if (!prepared?.ok || prepared?.ready === false) {
        try { await releaseBotStatusHelper(); } catch {}
        for (const queued of authQueue) {
          if (lorebookStatusStopRequested) break;
          const previous = byId.get(queued.previous.id) || queued.previous;
          const fallbackDirect = {
            id: previous.id,
            checkedAt: Date.now(),
            availabilityStatus: "unknown",
            httpStatus: 0,
            checkSource: "Authenticated recovery API",
            reason: "The signed-in Lorebook recovery helper could not be initialized.",
            recoveryAttempted: true
          };
          const recovery = mergeLorebookRecoveryAttempts(queued.publicAttempt, fallbackDirect);
          await recordResult(previous, combineLorebookPublicAndRecovery(previous, queued.indexed, recovery));
        }
      } else {
        for (let index = 0; index < authQueue.length; index += 1) {
          if (lorebookStatusStopRequested) break;
          const queued = authQueue[index];
          const previous = byId.get(queued.previous.id) || queued.previous;
          const publicLabel = queued.indexed?.found ? " · Public entry fallback" : "";
          if (status) status.textContent = `Authenticated fallback ${index + 1} / ${authQueue.length}${publicLabel}: ${previous.name || previous.id}`;

          const direct = await checkLorebookAvailability(previous, {
            keepHelper: true,
            forceOwnHelper: true,
            timeoutMs: 24000
          });
          authenticatedFallbacks += 1;
          const recovery = mergeLorebookRecoveryAttempts(queued.publicAttempt, direct);
          await recordResult(previous, combineLorebookPublicAndRecovery(previous, queued.indexed, recovery));

          if (!lorebookStatusStopRequested && index + 1 < authQueue.length) {
            await waitForBotStatusPace(lorebookStatusScanDelayMs());
          }
        }
      }
    }
  } finally {
    try { await releaseBotStatusHelper(); } catch {}
    lorebookCenterRows = [...byId.values()];
    if (Object.keys(changedEntries).length) {
      if (status) status.textContent = `Saving ${completed} completed Lorebook checks…`;
      await persistLorebookStatusEntries(changedEntries);
    }
    lorebookStatusScanRunning = false;
    renderLorebookCenter();
    if (status) {
      const recoveryText = recoverySaved || recoveryKept
        ? ` · ${recoverySaved} recovery ${recoverySaved === 1 ? "copy" : "copies"} saved${publicRecoverySaved ? ` (${publicRecoverySaved} public)` : ""}${recoveryKept ? ` · ${recoveryKept} previous ${recoveryKept === 1 ? "copy" : "copies"} kept` : ""}`
        : "";
      const fallbackText = authenticatedFallbacks ? ` · ${authenticatedFallbacks} authenticated fallback${authenticatedFallbacks === 1 ? "" : "s"}` : "";
      status.textContent = `${lorebookStatusStopRequested ? "Stopped" : "Finished"}: ${completed}/${rows.length} checked · ${available} available · ${candidate} candidate · ${restricted} restricted · ${unknown} unknown${recoveryText}${fallbackText}.`;
    }
    lorebookStatusStopRequested = false;
  }
}

async function exportLorebookHistory() {
  const response = await runtimeMessage({ type: "DS_LARGE_STORAGE_GET", keys: [LOREBOOK_STATUS_KEY] });
  const meta = response?.ok ? (response.data?.[LOREBOOK_STATUS_KEY]?.meta || {}) : {};
  downloadJsonFile({ schema: "spicychat-qol-lorebook-history", version: 2, exportedAt: new Date().toISOString(), lorebooks: meta }, `spicychat-qol-lorebook-history-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
}

function lorebookArchiveExportRecord(value) {
  const item = normalizeLorebookStatusRow(value);
  const recovery = item.recoveryCopy && typeof item.recoveryCopy === "object" ? item.recoveryCopy : null;
  const recoveryMeta = recovery?.lorebook && typeof recovery.lorebook === "object" ? recovery.lorebook : {};
  const entries = Array.isArray(recovery?.entries) ? recovery.entries : [];
  return {
    id: item.id,
    observedAt: item.checkedAt || item.lastSeen || 0,
    publicConfirmedAt: item.publicConfirmedAt || 0,
    publicConfirmedCurrent: item.publicConfirmedCurrent === true,
    recoverySavedAt: item.recoverySavedAt || 0,
    availabilityStatus: item.availabilityStatus || "unknown",
    meta: {
      id: item.id,
      name: String(recoveryMeta.name || item.name || ""),
      description: String(recoveryMeta.description || item.description || ""),
      creator: String(recoveryMeta.creator || item.creator || ""),
      creatorId: String(recoveryMeta.creatorId || item.creatorId || ""),
      image: String(recoveryMeta.image || item.image || ""),
      tags: uniqueClean(Array.isArray(recoveryMeta.tags) ? recoveryMeta.tags : item.tags || []),
      visibility: String(recoveryMeta.visibility || item.visibility || ""),
      status: String(recoveryMeta.status || item.status || ""),
      version: Number(recoveryMeta.version ?? item.version ?? 0) || 0,
      entryCount: Math.max(0, Number(recoveryMeta.entryCount ?? item.entryCount ?? entries.length) || 0),
      numAttachedCharacters: Math.max(0, Number(recoveryMeta.numAttachedCharacters ?? item.numAttachedCharacters ?? 0) || 0),
      createdAt: String(recoveryMeta.createdAt || item.createdAt || ""),
      updatedAt: String(recoveryMeta.updatedAt || item.updatedAt || ""),
      isNsfw: recoveryMeta.isNsfw === true || item.isNsfw === true,
      avatarIsNsfw: recoveryMeta.avatarIsNsfw === true || item.avatarIsNsfw === true,
      profileUrl: item.profileUrl || `https://spicychat.ai/lorebook/${item.id}`
    },
    recoveryAvailable: !!recovery && lorebookRecoveryIsComplete(recovery, Number(item.entryCount || 0)),
    entries
  };
}

function lorebookArchiveExportFilename(extension = "json.gz") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `spicychat-qol-lorebook-archive-${stamp}.${extension}`;
}

async function exportLorebookArchiveData() {
  const button = $("exportLorebookArchiveData");
  const statusEl = $("lorebookArchiveExportStatus");
  const setStatus = text => { if (statusEl) statusEl.textContent = text; };
  if (button?.disabled) return;
  if (button) button.disabled = true;

  try {
    setStatus("Preparing Lorebook archive export…");
    const response = await runtimeMessage({ type: "DS_LARGE_STORAGE_GET", keys: [LOREBOOK_STATUS_KEY] });
    const meta = response?.ok && response.data?.[LOREBOOK_STATUS_KEY]?.meta && typeof response.data[LOREBOOK_STATUS_KEY].meta === "object"
      ? response.data[LOREBOOK_STATUS_KEY].meta
      : {};
    const allRows = Object.values(meta).filter(item => item && typeof item === "object").map(normalizeLorebookStatusRow).filter(item => item.id);
    const rows = allRows.filter(item => item.availabilityStatus === "available" && item.publicConfirmedCurrent === true && Number(item.publicConfirmedAt || 0) > 0);
    const withRecovery = rows.filter(item => item.recoveryCopy).length;
    const excluded = allRows.length - rows.length;

    if (!rows.length) {
      setStatus("No currently public, index-confirmed Lorebooks to export.");
      showSettingsToast("No public Lorebook archive data is ready yet. Run a Lorebook Status scan first.");
      return;
    }

    const header = {
      schema: LOREBOOK_ARCHIVE_EXPORT_SCHEMA,
      version: LOREBOOK_ARCHIVE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      generatedBy: {
        product: "SpicyChat QoL",
        version: String(chrome.runtime?.getManifest?.().version || "0.2.33")
      },
      source: "qol-lorebook-status-export",
      semantics: {
        trackedUuidOnly: true,
        publicIndexConfirmationRequired: true,
        publicEntriesMayBeIncludedFromRecoveryCopy: true,
        privateRestrictedOrUnconfirmedLorebooksExcluded: true,
        currentArchiveStatusStillRequiresArchiveSideVerification: true
      },
      counts: {
        trackedLorebooksSeen: allRows.length,
        exportedPublicLorebooks: rows.length,
        withRecoveryCopy: withRecovery,
        withoutRecoveryCopy: rows.length - withRecovery,
        excludedPrivateRestrictedUnknownOrUnconfirmed: excluded
      }
    };

    if (typeof CompressionStream !== "function") {
      downloadJsonFile({ ...header, lorebooks: rows.map(lorebookArchiveExportRecord) }, lorebookArchiveExportFilename("json"));
      setStatus(`Exported ${rows.length} public Lorebook${rows.length === 1 ? "" : "s"} as JSON.`);
      return;
    }

    const encoder = new TextEncoder();
    const gzip = new CompressionStream("gzip");
    const blobPromise = new Response(gzip.readable).blob();
    const writer = gzip.writable.getWriter();
    const prefix = `${JSON.stringify(header).slice(0, -1)},\"lorebooks\":[`;
    await writer.write(encoder.encode(prefix));

    for (let index = 0; index < rows.length; index += 1) {
      await writer.write(encoder.encode(`${index ? "," : ""}${JSON.stringify(lorebookArchiveExportRecord(rows[index]))}`));
      if ((index + 1) % 25 === 0 || index + 1 === rows.length) {
        setStatus(`Compressing ${index + 1} / ${rows.length} public Lorebooks…`);
        await nextUiFrame();
      }
    }

    await writer.write(encoder.encode("]}"));
    await writer.close();
    const compressed = await blobPromise;
    downloadBlobFile(new Blob([compressed], { type: "application/gzip" }), lorebookArchiveExportFilename("json.gz"));
    setStatus(`Exported ${rows.length} public Lorebook${rows.length === 1 ? "" : "s"} · ${withRecovery} with recovery entries.`);
    showSettingsToast(`Lorebook archive export ready: ${rows.length} public Lorebook${rows.length === 1 ? "" : "s"}.`);
  } catch (error) {
    console.error("SpicyChat QoL Lorebook archive export failed", error);
    setStatus("Lorebook archive export failed.");
    showSettingsToast(`Could not create the Lorebook archive export: ${String(error?.message || error || "unknown error")}`);
  } finally {
    if (button) button.disabled = false;
  }
}

async function clearLorebookHistory() {
  if (!confirm("Clear QoL Lorebook status/history? This does not delete or modify any Lorebook on SpicyChat.")) return;
  const response = await runtimeMessage({ type: "DS_LARGE_STORAGE_REMOVE", keys: [LOREBOOK_STATUS_KEY] });
  if (!response?.ok) { showSettingsToast("Lorebook history could not be cleared."); return; }
  await refreshLorebookCenter();
  showSettingsToast("Lorebook status/history cleared.");
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
