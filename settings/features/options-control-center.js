// Feature-owned options helpers: control-center. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function jumpToOptionsSearch(tabName, query = "") {
  setActiveTab(tabName);
  setSettingsSearchExpanded(true, { focus: !!query });
  if (!query) return;
  const input = $("settingsSearch");
  if (!input) return;
  input.value = query;
  input.focus();
  window.setTimeout(() => input.dispatchEvent(new Event("input", { bubbles: true })), 10);
}

async function renderCreatorWorkspace() {
  const summary = $("creatorWorkspaceSummary");
  const relations = $("creatorRelationshipView");
  if (!summary || !relations) return;
  const result = await storageGet([BOT_ARCHIVE_KEY, LOREBOOK_BACKUPS_KEY, BOT_EDITOR_DRAFT_HISTORY_KEY, CHATBOT_LOREBOOK_LINKS_KEY, "settings"]);
  const bots = normalizeBotArchive(result[BOT_ARCHIVE_KEY]).meta;
  const books = normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]).meta;
  const drafts = normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]).entries;
  const links = result[CHATBOT_LOREBOOK_LINKS_KEY] && typeof result[CHATBOT_LOREBOOK_LINKS_KEY] === "object" ? result[CHATBOT_LOREBOOK_LINKS_KEY] : {};
  const cfg = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  const botList = Object.values(bots);
  const bookList = Object.values(books);
  const ownBots = botList.filter(bot => bot.ownBot);
  const versionCount = ownBots.reduce((n, bot) => n + (Array.isArray(bot.versions) ? bot.versions.length : 0), 0);
  const revisionCount = ownBots.reduce((n, bot) => n + (Array.isArray(bot.revisions) ? bot.revisions.length : 0), 0);
  const draftCount = Object.values(drafts).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0);
  const staleBots = cfg.botBackupToolsEnabled && cfg.botArchiveOwnEditorBackups ? ownBots.filter(bot => Number(bot.lastSavedAt || 0) && Date.now() - Number(bot.lastSavedAt) > CREATOR_BACKUP_STALE_MS).length : 0;
  const staleBooks = cfg.lorebookBackupToolsEnabled && cfg.lorebookBackupsEnabled ? bookList.filter(book => Number(book.lastSavedAt || 0) && Date.now() - Number(book.lastSavedAt) > CREATOR_BACKUP_STALE_MS).length : 0;
  const cards = [
    ["Own bot backups", ownBots.length, `${versionCount} recorded bot version${versionCount === 1 ? "" : "s"} · ${revisionCount} safety revision${revisionCount === 1 ? "" : "s"}${staleBots ? ` · ${staleBots} stale` : ""}`],
    ["Lorebook backups", bookList.length, `${bookList.reduce((n, book) => n + Object.keys(book.entries || {}).length, 0)} saved entries${staleBooks ? ` · ${staleBooks} stale` : ""}`],
    ["Editor drafts", draftCount, `${Object.keys(drafts).length} bot/draft workspace${Object.keys(drafts).length === 1 ? "" : "s"}`],
    ["Known bot ↔ Lorebook links", Object.keys(links).length, "Learned when attached Lorebooks are visible on Edit Chatbot"]
  ];
  summary.replaceChildren(...cards.map(([label, count, detail]) => makeElement("div", { className: "control-summary-card" }, [
    makeElement("strong", { text: `${label}: ${count}` }), makeElement("small", { text: detail })
  ])));

  const relationRows = Object.values(links).filter(row => row && typeof row === "object").sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 12);
  if (!relationRows.length) {
    relations.replaceChildren(makeElement("span", { className: "hint", text: "No bot ↔ Lorebook relationships learned yet. Open an attached Lorebook card on Edit Chatbot once and QoL can remember the connection locally." }));
    return;
  }
  relations.replaceChildren(makeElement("strong", { text: "Recent bot ↔ Lorebook relationships" }), ...relationRows.map(row => {
    const bot = bots[row.chatbotId];
    const book = books[row.lorebookId];
    const wrap = makeElement("div", { className: "creator-relation-row" });
    const text = makeElement("span", { text: `${bot?.name || row.chatbotId || "Chatbot"} → ${book?.name || row.lorebookName || row.lorebookId || "Lorebook"}` });
    const open = makeElement("button", { text: "Open Lorebook", attrs: { type: "button" } });
    open.addEventListener("click", () => {
      if (row.lorebookId) window.open(`https://spicychat.ai/lorebook/edit/${encodeURIComponent(row.lorebookId)}/entries`, "_blank", "noopener");
      else window.open(`https://spicychat.ai/my-creations/lorebooks?search=${encodeURIComponent(row.lorebookName || "")}`, "_blank", "noopener");
    });
    wrap.append(text, open);
    return wrap;
  }));
}

async function collectDataHealth({ lightweight = false } = {}) {
  const backupKeys = lightweight
    ? BACKUP_STORAGE_KEYS.filter(key => !LARGE_STORAGE_KEYS.has(key) && ![SOUNDSCAPE_AUDIO_KEY, CHAT_BACKGROUNDS_KEY].includes(key))
    : BACKUP_STORAGE_KEYS;
  const keys = [...new Set([...backupKeys, RECOVERY_SNAPSHOT_META_KEY, CHATBOT_LOREBOOK_LINKS_KEY, LOCAL_CHANGE_HISTORY_KEY, CARD_TOKEN_CACHE_KEY])];
  const [checkedValue, totalBytesValue, largeStatsValue] = await Promise.all([
    lightweight
      ? promiseWithValueTimeout(storageGetChecked(keys), 3200, { ok: false, data: {}, error: "Lightweight local-data check timed out." })
      : storageGetChecked(keys),
    lightweight ? promiseWithValueTimeout(storageBytesInUse(null), 1800, null) : storageBytesInUse(null),
    lightweight ? promiseWithValueTimeout(readLargeStorageStats(), 2200, null) : readLargeStorageStats().catch(() => ({}))
  ]);
  const checked = checkedValue && typeof checkedValue === "object" ? checkedValue : { ok: false, data: {}, error: "Local-data check unavailable." };
  const totalBytes = Number(totalBytesValue);
  const largeStats = largeStatsValue && typeof largeStatsValue === "object" ? largeStatsValue : {};
  const largeHealthCount = key => {
    if (!largeStatsValue || typeof largeStatsValue !== "object" || !Object.prototype.hasOwnProperty.call(largeStats, key)) return null;
    const value = Number(largeStats[key]);
    return Number.isFinite(value) ? value : null;
  };
  const rows = [];
  const result = checked.data && typeof checked.data === "object" ? checked.data : {};
  rows.push({
    state: checked.ok ? "ok" : "warn",
    label: "Browser storage",
    detail: checked.ok
      ? `Readable${Number.isFinite(totalBytes) ? ` · ${formatControlBytes(totalBytes)} in chrome.storage.local` : " · size check timed out"}.`
      : `${checked.error || "Could not read the lightweight local-data summary."} Other health checks continued.`
  });
  rows.push({
    state: largeStatsValue ? "ok" : "warn",
    label: "Large-data IndexedDB",
    detail: largeStatsValue
      ? `${Number(largeStats[BOT_AVAILABILITY_KEY] || 0)} availability records · ${Number(largeStats[BOT_ARCHIVE_KEY] || 0)} archive records · ${Number(largeStats[LOREBOOK_STATUS_KEY] || 0)} Lorebook status records.`
      : "Count check timed out; the rest of Data Health continued without loading the large stores."
  });

  if (lightweight) {
    rows.push({ state: "ok", label: "Backup schema", detail: `Schema v${BACKUP_FORMAT_VERSION} supported; the combined support report skips the expensive full backup round-trip.` });
  } else {
    try {
      const payload = buildExportPayload(new Set(LIGHTWEIGHT_BACKUP_SCOPE_IDS), result);
      const roundTrip = JSON.parse(JSON.stringify(payload));
      const validation = validateBackupObject(roundTrip);
      rows.push({ state: validation.ok ? "ok" : "bad", label: "Backup schema", detail: validation.ok ? `Current local data produces a valid schema v${BACKUP_FORMAT_VERSION} backup.` : validation.warnings.join(" · ") });
    } catch (error) {
      rows.push({ state: "bad", label: "Backup schema", detail: error?.message || String(error) });
    }
  }

  let snapshotMeta = normalizeRecoverySnapshotMeta(result[RECOVERY_SNAPSHOT_META_KEY]);
  if (!snapshotMeta) {
    snapshotMeta = lightweight
      ? await promiseWithValueTimeout(readRecoverySnapshotMeta(), 1200, null)
      : await readRecoverySnapshotMeta().catch(() => null);
  }
  rows.push({ state: "ok", label: "Recovery snapshot", detail: snapshotMeta
    ? (snapshotMeta.createdAt ? `Available from ${creatorBackupDate(snapshotMeta.createdAt)} (${snapshotMeta.reason || "manual snapshot"}).` : "Available (legacy snapshot; details load on demand).")
    : "None saved. This is normal until a protected import/cleanup or manual snapshot creates one." });

  let cleanupCandidates = 0;
  const opened = uniqueClean(result[OPENED_KEY] || []);
  cleanupCandidates += orphanedMetaCount(result[OPENED_META_KEY], opened);
  for (const [key, keepNames] of [[BLOCKED_BOTS_KEY, true], [NOT_INTERESTED_KEY, false], [FAVORITE_BOTS_KEY, false], [LATER_BOTS_KEY, false]]) {
    const store = normalizeBotStore(result[key]);
    const allowed = [...store.ids, ...(keepNames ? store.names : []), ...(keepNames ? store.names.map(name => `name:${name}`) : [])];
    cleanupCandidates += orphanedMetaCount(result[key]?.meta, allowed);
  }
  rows.push({ state: cleanupCandidates ? "warn" : "ok", label: "Supported orphan check", detail: cleanupCandidates ? `${cleanupCandidates} orphaned metadata record${cleanupCandidates === 1 ? "" : "s"} can be reviewed/cleaned in Data & Backup.` : "No supported orphaned metadata records found." });

  const lorebooks = normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]);
  const badLorebookEntries = Object.values(lorebooks.meta).reduce((n, book) => n + Object.values(book.entries || {}).filter(entry => !entry.name).length, 0);
  if (lightweight) {
    const botCopyCount = largeHealthCount(BOT_ARCHIVE_KEY);
    const lorebookStatusCount = largeHealthCount(LOREBOOK_STATUS_KEY);
    const largeBackupSummary = botCopyCount == null || lorebookStatusCount == null
      ? "IndexedDB bot-copy / tracked-Lorebook counts unavailable"
      : `${botCopyCount} bot copies and ${lorebookStatusCount} tracked Lorebook status records in IndexedDB`;
    rows.push({ state: badLorebookEntries ? "warn" : "ok", label: "Creator backups", detail: badLorebookEntries
      ? `${largeBackupSummary}; ${badLorebookEntries} malformed Lorebook entr${badLorebookEntries === 1 ? "y" : "ies"}.`
      : `${largeBackupSummary}, plus ${Object.keys(lorebooks.meta).length} Lorebook backups; deep bot-copy validation is skipped in the combined support report.` });
  } else {
    const botArchive = normalizeBotArchive(result[BOT_ARCHIVE_KEY]);
    const badArchives = Object.values(botArchive.meta).filter(bot => !bot.coverage?.length).length;
    rows.push({ state: badArchives || badLorebookEntries ? "warn" : "ok", label: "Creator backups", detail: badArchives || badLorebookEntries ? `${badArchives} empty bot archive${badArchives === 1 ? "" : "s"}; ${badLorebookEntries} malformed Lorebook entr${badLorebookEntries === 1 ? "y" : "ies"}.` : `${Object.keys(botArchive.meta).length} bot copies and ${Object.keys(lorebooks.meta).length} Lorebook backups normalize cleanly.` });
  }

  if (Number.isFinite(totalBytes) && totalBytes > 20 * 1024 * 1024) rows.push({ state: "warn", label: "Storage size", detail: `QoL is using ${formatControlBytes(totalBytes)}. Use the breakdown below before deleting anything.` });
  const warnings = rows.filter(row => row.state === "warn").length;
  const errors = rows.filter(row => row.state === "bad").length;
  const summaryText = `${errors ? `${errors} error${errors === 1 ? "" : "s"}` : "No errors"}; ${warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "no warnings"}; ${Number.isFinite(totalBytes) ? formatControlBytes(totalBytes) : "unknown size"} local QoL storage.`;
  return { ok: !errors, rows, summaryText };
}

function renderHealthRows(health, host = $("controlHealthResults")) {
  if (!host) return;
  host.replaceChildren(...(health?.rows || []).map(row => makeElement("div", { className: "control-health-row", dataset: { state: row.state || "ok" } }, [
    makeElement("strong", { text: row.label || "Check" }), makeElement("div", { text: row.detail || "" })
  ])));
}

async function renderControlStorageBreakdown() {
  const host = $("controlStorageBreakdown");
  if (!host) return;
  const rows = [];
  for (const def of STORAGE_DATASET_DEFS) {
    const bytes = await storageBytesInUse(def.keys);
    if (!Number.isFinite(bytes) || bytes <= 0) continue;
    rows.push({ label: def.label, bytes });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  const shown = rows.slice(0, 12);
  if (!shown.length) {
    host.replaceChildren(makeElement("span", { className: "hint", text: "Per-dataset storage size is not available in this browser." }));
    return;
  }
  host.replaceChildren(...shown.map(row => makeElement("div", { className: "control-storage-card" }, [makeElement("strong", { text: row.label }), makeElement("small", { text: formatControlBytes(row.bytes) })])));
}

async function runFullDataHealth() {
  const host = $("controlHealthResults");
  if (host) host.replaceChildren(makeElement("span", { className: "hint", text: "Checking local QoL data…" }));
  const health = await collectDataHealth();
  renderHealthRows(health, host);
  await renderControlStorageBreakdown();
  return health;
}

async function runMigrationDryRun() {
  const host = $("controlHealthResults");
  try {
    const result = await readBackupSourceData();
    const payload = buildExportPayload(new Set(LIGHTWEIGHT_BACKUP_SCOPE_IDS), result);
    const serialized = JSON.stringify(payload);
    const parsed = JSON.parse(serialized);
    const validation = validateBackupObject(parsed);
    const row = { state: validation.ok ? "ok" : "bad", label: "Migration dry-run", detail: validation.ok ? `Passed without writing anything · ${formatControlBytes(new Blob([serialized]).size)} serialized · ${validation.entries.length} supported categories.` : validation.warnings.join(" · ") };
    if (host) host.prepend(makeElement("div", { className: "control-health-row", dataset: { state: row.state } }, [makeElement("strong", { text: row.label }), makeElement("div", { text: row.detail })]));
  } catch (error) {
    if (host) host.prepend(makeElement("div", { className: "control-health-row", dataset: { state: "bad" } }, [makeElement("strong", { text: "Migration dry-run" }), makeElement("div", { text: error?.message || String(error) })]));
  }
}
