// Bot Status Center: saved-copy UI and control event wiring. Helpers load above.
function renderSavedBotInfo(renderOptions = {}) {
  const diagStarted = optionsDiagnosticState.active && typeof performance !== "undefined" ? performance.now() : 0;
  const host = $("savedBotInfoManager");
  if (!host || !savedRecoveryManagerCanRender("copies")) return;
  const started = performance.now();
  const query = String($("savedBotInfoSearch")?.value ?? savedBotInfoUiState.query ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  savedBotInfoUiState.query = query;
  const view = recoveryPresentationView();
  const { archives, availability } = view;
  if (!view.sortedCopies) {
    const indexStarted = performance.now();
    view.sortedCopies = Object.values(archives).filter(archive => !view.blockedIds.has(String(archive.id || "").toLowerCase()))
      .sort((a,b) => Number(b.lastSavedAt || 0) - Number(a.lastSavedAt || 0));
    optionsPhaseSample("copies:sort-index", performance.now() - indexStarted);
  }
  const visibleArchives = view.sortedCopies;
  const items = query ? visibleArchives.filter(archive => {
    const fields = archive.fields || {};
    return `${archive.id} ${archive.name || ""} ${archive.creator || ""} ${fields.title || ""} ${fields.description || ""}`.toLowerCase().includes(query);
  }) : visibleArchives;
  const total = visibleArchives.length;
  const blockedHidden = Math.max(0, view.snapshots[0].size - total);
  const sameNameCollisions = items.length ? botSameNameCollisionIndex(view) : new Map();
  optionsPhaseSample("copies:filter-sort-index", performance.now() - started);
  const limit = Math.max(10, Number(savedBotInfoUiState.visible || 10) || 10);
  const shown = items.slice(0, limit);
  if ($("savedBotInfoSummary")) {
    $("savedBotInfoSummary").textContent = `${total} saved cop${total === 1 ? "y" : "ies"}${blockedHidden ? ` · ${blockedHidden} blocked hidden` : ""}${query ? ` · ${items.length} matching` : ""} · showing ${shown.length}`;
  }
  const showMore = $("savedBotInfoShowMore");
  const showLess = $("savedBotInfoShowLess");
  const collapse = $("savedBotInfoCollapse");
  if (showMore) {
    showMore.style.display = items.length > shown.length ? "" : "none";
    showMore.textContent = `Show 10 more (${Math.max(0, items.length - shown.length)} left)`;
  }
  if (showLess) showLess.style.display = shown.length > 10 || !savedBotInfoUiState.collapsed ? "" : "none";
  if (collapse) {
    collapse.style.display = items.length > 10 ? "" : "none";
    collapse.textContent = limit <= 10 ? "Show 100" : "Collapse to 10";
  }
  if (!items.length) {
    setEmptyState(host, query ? "No saved recovery copies match that search." : "No saved bot recovery copies yet. Run Bot Status Center on saved bots or enable archive capture to build them.");
    if (diagStarted) optionsDiag("options-saved-bots", "render", { manager: "saved-copies", total, shown: 0, matching: 0, durationMs: Math.round((performance.now() - diagStarted) * 10) / 10 });
    return;
  }
  const domStarted = performance.now();
  const nodes = shown.map(archive => {
    const status = availability[archive.id] || null;
    const entry = {
      id: archive.id,
      name: archive.name || archive.fields?.name || archive.id,
      creator: archive.creator || archive.fields?.creator || "",
      image: archive.image || archive.fields?.image || "",
      profileUrl: archive.profileUrl || `https://spicychat.ai/chatbot/${archive.id}`,
      sources: ["archive"],
      checkedAt: Number(status?.checkedAt) || 0,
      status: status?.status || "unknown",
      reason: status?.reason || "Saved local recovery copy.",
      httpStatus: Number(status?.httpStatus) || 0,
      updateStatus: status?.updateStatus || "current",
      changedFields: status?.changedFields || [],
      archive,
      duplicateMatches: [],
      sameNameMatches: sameNameCollisions.get(archive.id) || []
    };
    const card = botAvailabilityCard(entry);
    card.querySelector(".bot-availability-recheck")?.remove();
    card.querySelector(".bot-availability-forget")?.remove();
    card.querySelector(".bot-update-accept")?.remove();
    return card;
  });
  optionsPhaseSample("copies:construct-cards", performance.now() - domStarted);
  const commitStarted = performance.now();
  host.replaceChildren(...nodes);
  optionsPhaseSample("copies:dom-commit", performance.now() - commitStarted);
  host.querySelectorAll(".bot-archive-copy").forEach(button => button.addEventListener("click", async () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = botArchiveState.meta[id];
    if (!archive) return;
    try { await navigator.clipboard.writeText(botArchiveReadableText(archive)); showSettingsToast("Saved bot copy copied to clipboard."); } catch {}
  }));
  host.querySelectorAll(".bot-archive-portable").forEach(button => button.addEventListener("click", () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = botArchiveState.meta[id];
    if (archive) downloadPortableBotProfile(archive);
  }));
  host.querySelectorAll(".bot-archive-download").forEach(button => button.addEventListener("click", () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = botArchiveState.meta[id];
    if (archive) downloadBotArchiveEntry(archive);
  }));
  host.querySelectorAll(".bot-archive-delete").forEach(button => button.addEventListener("click", async () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = botArchiveState.meta[id];
    if (!archive || !confirm(`Delete the saved local recovery copy of ${archive.name || id}?`)) return;
    delete botArchiveState.meta[id];
    botArchiveState = normalizeBotArchive(botArchiveState);
    await storageSet({ [BOT_ARCHIVE_KEY]: botArchiveState });
    renderSavedBotInfo();
    renderBotAvailability();
  }));
  optionsPhaseSample("copies:render", performance.now() - started);
  if (diagStarted) optionsDiag("options-saved-bots", "render", { manager: "saved-copies", total, shown: shown.length, matching: items.length, durationMs: Math.round((performance.now() - diagStarted) * 10) / 10 }, { critical: (performance.now() - diagStarted) >= 200 });
}

function isConfirmedUnavailableBotStatus(entry) {
  // Availability classification is authoritative here. First/temporary empty
  // responses stay "unknown"; only confirmed deletion/unavailability is
  // normalized to "unavailable". Re-checking a second evidence predicate in
  // the recovery renderer caused confirmed cards to disappear from the deleted
  // section even while Bot Status already labelled them unavailable.
  return !!entry && String(entry.status || "") === "unavailable";
}

function deletedSavedBotEntries(view = recoveryPresentationView()) {
  const { archives, availability, blockedIds } = view;
  if (!view.sortedDeleted) {
    const started = performance.now();
    view.sortedDeleted = Object.values(availability)
      .filter(entry => isConfirmedUnavailableBotStatus(entry) && archives[entry.id] && !blockedIds.has(String(entry.id || "").toLowerCase()))
      .map(entry => ({ ...entry, archive: archives[entry.id] }))
      .sort((a,b) => Number(b.checkedAt || 0) - Number(a.checkedAt || 0) || String(a.archive?.name || a.name || a.id).localeCompare(String(b.archive?.name || b.name || b.id)));
    optionsPhaseSample("deleted:sort-index", performance.now() - started);
  }
  const query = String($("deletedSavedBotSearch")?.value ?? deletedSavedBotsUiState.query ?? "")
    .toLowerCase().replace(/\s+/g, " ").trim();
  deletedSavedBotsUiState.query = query;
  return query ? view.sortedDeleted.filter(entry => {
    const fields = entry.archive?.fields || {};
    return `${entry.id} ${entry.name || ""} ${entry.creator || ""} ${fields.name || ""} ${fields.title || ""} ${fields.description || ""} ${fields.tags || ""}`.toLowerCase().includes(query);
  }) : view.sortedDeleted;
}

function deletedSavedBotCard(entry) {
  const archive = entry.archive;
  const fields = archive?.fields || {};
  const card = makeElement("div", { className: "bot-manager-card deleted-saved-bot-card", dataset: { id: entry.id } });
  const image = canonicalBotImage(archive?.image || fields.image || entry.image || "");
  if (image) card.appendChild(makeDeferredManagerImage(image));
  else card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: "?" }));

  const main = makeElement("div", { className: "bot-manager-main" });
  const recoveryName = cleanAuthoritativeBotName(fields.name, entry.id) || cleanAuthoritativeBotName(archive?.name, entry.id) || cleanAuthoritativeBotName(entry.name, entry.id) || bestKnownBotName(entry.id, "") || "Unknown bot";
  main.appendChild(makeElement("div", { className: "bot-manager-title", text: displayNormalizedSavedText(recoveryName) }));
  const creator = archive?.creator || fields.creator || entry.creator || "";
  main.appendChild(makeElement("div", {
    className: "bot-manager-creator",
    text: botIdentityDisplay(entry.id, creator),
    attrs: { title: `Character ID: ${entry.id}` }
  }));
  main.appendChild(makeElement("div", { className: "bot-manager-id", text: `Character ID: ${entry.id}` }));

  const badges = makeElement("div", { className: "bot-status-badges" });
  badges.appendChild(makeElement("span", { className: "bot-availability-status", text: "Unavailable / deleted", dataset: { status: "unavailable" } }));
  const count = archive?.coverage?.length || 0;
  badges.appendChild(makeElement("span", { className: "bot-update-badge", text: `Recovery copy · ${count} field${count === 1 ? "" : "s"}`, dataset: { status: "current" } }));
  main.appendChild(badges);
  appendSameNameCollisionInfo(main, badges, entry);

  const meta = [];
  if (archive?.lastAvailableAt) meta.push(`Last available: ${new Date(archive.lastAvailableAt).toLocaleString()}`);
  if (entry.checkedAt) meta.push(`Checked: ${new Date(entry.checkedAt).toLocaleString()}`);
  if (archive?.chatUrls?.length) meta.push(`${archive.chatUrls.length} old chat link${archive.chatUrls.length === 1 ? "" : "s"}`);
  if (meta.length) main.appendChild(makeElement("div", { className: "bot-availability-meta", text: meta.join(" · ") }));

  const description = fields.description || fields.title || "";
  if (description) main.appendChild(makeElement("div", { className: "bot-manager-description", text: displayNormalizedSavedText(description) }));
  const archiveDetails = botArchiveDetails({ archive });
  if (archiveDetails) main.appendChild(archiveDetails);
  const historyDetails = botArchiveHistoryDetails(archive);
  if (historyDetails) main.appendChild(historyDetails);

  if ((archive?.chatUrls || []).length > 1) {
    const chats = makeElement("details", { className: "bot-update-details bot-archive-details" });
    chats.appendChild(makeElement("summary", { text: `Old chats (${archive.chatUrls.length})` }));
    const links = makeElement("div", { className: "bot-manager-actions" });
    archive.chatUrls.slice(0, 50).forEach((url, index) => links.appendChild(makeElement("a", {
      text: `Open chat ${index + 1}`,
      attrs: { href: url, target: "_blank", rel: "noopener noreferrer" }
    })));
    chats.appendChild(links);
    main.appendChild(chats);
  }

  const actions = makeElement("div", { className: "bot-manager-actions" });
  if (archive?.chatUrls?.length) actions.appendChild(makeElement("a", { text: "Open old chat", attrs: { href: archive.chatUrls[0], target: "_blank", rel: "noopener noreferrer" } }));
  actions.appendChild(makeElement("button", { className: "deleted-bot-recheck", text: "Check again", attrs: { type: "button" } }));
  actions.appendChild(makeElement("button", { className: "deleted-bot-forget-qol", text: "Forget from QoL", attrs: { type: "button", title: "Remove this exact character ID and its local QoL data; the real SpicyChat chat is untouched." } }));
  actions.appendChild(makeElement("button", { className: "bot-archive-copy", text: "Copy saved bot", attrs: { type: "button" } }));
  actions.appendChild(makeElement("button", { className: "bot-archive-portable", text: "Importable JSON", attrs: { type: "button", title: "Character Card JSON that QoL can import back into SpicyChat" } }));
  actions.appendChild(makeElement("button", { className: "bot-archive-download", text: "Archive JSON", attrs: { type: "button", title: "Exact QoL saved-copy record" } }));
  main.appendChild(actions);
  card.appendChild(main);
  return card;
}

function renderDeletedSavedBots(renderOptions = {}) {
  const diagStarted = optionsDiagnosticState.active && typeof performance !== "undefined" ? performance.now() : 0;
  const host = $("deletedSavedBotManager");
  if (!host || !savedRecoveryManagerCanRender("deleted")) return;
  const started = performance.now();
  const view = recoveryPresentationView();
  const all = deletedSavedBotEntries(view);
  const totalRecoverable = view.sortedDeleted.length;
  const sameNameCollisions = all.length ? botSameNameCollisionIndex(view) : new Map();
  optionsPhaseSample("deleted:filter-sort-index", performance.now() - started);
  const limit = Math.max(10, Number(deletedSavedBotsUiState.visible || 10) || 10);
  const shown = all.slice(0, limit);
  if ($("deletedSavedBotSummary")) {
    $("deletedSavedBotSummary").textContent = `${totalRecoverable} recoverable deleted bot${totalRecoverable === 1 ? "" : "s"}${deletedSavedBotsUiState.query ? ` · ${all.length} matching` : ""}`;
  }
  const showMore = $("deletedSavedBotShowMore");
  const showLess = $("deletedSavedBotShowLess");
  const collapse = $("deletedSavedBotCollapse");
  if (showMore) {
    showMore.style.display = all.length > shown.length ? "" : "none";
    showMore.textContent = `Show 10 more (${Math.max(0, all.length - shown.length)} left)`;
  }
  if (showLess) showLess.style.display = shown.length > 10 || !deletedSavedBotsUiState.collapsed ? "" : "none";
  if (collapse) {
    collapse.style.display = all.length > 10 ? "" : "none";
    collapse.textContent = limit <= 10 ? "Show 100" : "Collapse to 10";
  }
  const forgottenWrap = $("forgottenBotStatusIdsWrap");
  const forgottenCount = $("forgottenBotStatusIdsCount");
  if (forgottenWrap) forgottenWrap.hidden = botStatusIgnoredIdsState.length === 0;
  if (forgottenCount) forgottenCount.textContent = `${botStatusIgnoredIdsState.length} forgotten character ID${botStatusIgnoredIdsState.length === 1 ? "" : "s"}`;
  if (!all.length) {
    setEmptyState(host, deletedSavedBotsUiState.query ? "No deleted recovery copies match that search." : "No confirmed deleted/unavailable bots with recovery copies yet.");
    if (diagStarted) optionsDiag("options-saved-bots", "render", { manager: "deleted-recovery", total: totalRecoverable, shown: 0, matching: 0, durationMs: Math.round((performance.now() - diagStarted) * 10) / 10 });
    return;
  }
  const domStarted = performance.now();
  const cards = shown.map(entry => deletedSavedBotCard({ ...entry, sameNameMatches: sameNameCollisions.get(entry.id) || [] }));
  optionsPhaseSample("deleted:construct-cards", performance.now() - domStarted);
  const commitStarted = performance.now();
  host.replaceChildren(...cards);
  optionsPhaseSample("deleted:dom-commit", performance.now() - commitStarted);

  host.querySelectorAll(".deleted-bot-recheck").forEach(button => button.addEventListener("click", async () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const previous = normalizeBotAvailability(botAvailabilityState).meta[id] || null;
    if (!id) return;
    button.disabled = true;
    button.textContent = "Checking...";
    const rawResult = await checkBotAvailability({ ...(previous || {}), id, sources: uniqueClean([...(previous?.sources || []), "archive"]) });
    const result = reconcileBotUpdate(previous, rawResult);
    botAvailabilityState.meta[id] = result;
    const metadataRepaired = applyAuthoritativeBotMetadata(rawResult);
    if (rawResult.status === "available" && rawResult.archiveSnapshot) {
      saveArchiveSnapshotForBot(id, rawResult.archiveSnapshot, {
        name: result.name,
        creator: result.creator,
        image: result.image,
        profileUrl: result.profileUrl,
        chatUrls: knownChatUrlsForBot(id),
        source: "Bot Status Center"
      });
    }
    botAvailabilityState = normalizeBotAvailability(botAvailabilityState);
    await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState, [BOT_ARCHIVE_KEY]: botArchiveState, ...(metadataRepaired ? botStatusMetadataStoragePayload() : {}) });
    renderBotAvailability();
    showSettingsToast(result.status === "available" ? "Bot is available again." : `Bot status: ${botAvailabilityStatusLabel(result.status)}.`);
  }));
  host.querySelectorAll(".deleted-bot-forget-qol").forEach(button => button.addEventListener("click", async () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    if (!id) return;
    button.disabled = true;
    try { await forgetDeletedBotFromQol(id); }
    finally { if (button.isConnected) button.disabled = false; }
  }));
  host.querySelectorAll(".bot-archive-copy").forEach(button => button.addEventListener("click", async () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = botArchiveState.meta[id];
    if (!archive) return;
    try { await navigator.clipboard.writeText(botArchiveReadableText(archive)); showSettingsToast("Saved bot copy copied to clipboard."); } catch {}
  }));
  host.querySelectorAll(".bot-archive-portable").forEach(button => button.addEventListener("click", () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = botArchiveState.meta[id];
    if (archive) downloadPortableBotProfile(archive);
  }));
  host.querySelectorAll(".bot-archive-download").forEach(button => button.addEventListener("click", () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = botArchiveState.meta[id];
    if (archive) downloadBotArchiveEntry(archive);
  }));
  optionsPhaseSample("deleted:render", performance.now() - started);
  if (diagStarted) optionsDiag("options-saved-bots", "render", { manager: "deleted-recovery", total: totalRecoverable, shown: shown.length, matching: all.length, durationMs: Math.round((performance.now() - diagStarted) * 10) / 10 }, { critical: (performance.now() - diagStarted) >= 200 });
}

async function clearBotAvailabilityResults() {
  try { await ensureSavedRecoveryDataLoaded(); } catch { showSettingsToast("Could not load status records. Nothing was cleared."); return; }
  const count = Object.keys(normalizeBotAvailability(botAvailabilityState).meta).length;
  if (!count) {
    showSettingsToast("There is no bot status history to clear.");
    return;
  }
  if (!confirm(`Clear status/update history for ${count} bot${count === 1 ? "" : "s"}? This does not remove bots from Favorites, Later, Bot Organizer, opened history, or Saved bot copies.`)) return;
  botAvailabilityState = { meta: {} };
  invalidateDuplicateCache();
  await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState });
  renderBotAvailability();
  refreshStorageUsageIfVisible();
  showSettingsToast("Bot status history cleared. Your tracked bot lists and saved bot copies were left alone.");
}

async function clearBotArchive() {
  try { await ensureSavedRecoveryDataLoaded(); } catch { showSettingsToast("Could not load recovery records. Nothing was cleared."); return; }
  const count = Object.keys(botArchiveState.meta).length;
  if (!count) {
    showSettingsToast("There are no saved bot copies to clear.");
    return;
  }
  if (!confirm(`Delete all ${count} saved local bot cop${count === 1 ? "y" : "ies"}? Bot Status Center history and your Favorites/Later/Organizer lists will remain.`)) return;
  botArchiveState = { meta: {} };
  invalidateDuplicateCache();
  await storageSet({ [BOT_ARCHIVE_KEY]: botArchiveState });
  renderBotAvailability();
  refreshStorageUsageIfVisible();
  showSettingsToast("Saved bot copies cleared.");
}

function setupBotAvailabilityControls() {
  setupBotAvatarLookup();
  // On-demand worker counters (no bot IDs or private card text). Existing
  // scan pacing/stop/resume controls remain unchanged.
  const pendingHint = $("botStatusPendingQueueSummary");
  if (pendingHint && !$("botStatusReviewOutOfScopePending")) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = "botStatusReviewOutOfScopePending";
    button.hidden = true;
    button.textContent = "Why held";
    button.title = "Show why some saved checks were automatically held outside their original scan scope. Nothing is deleted.";
    button.addEventListener("click", () => reviewAndRemoveIneligibleBotStatusPending().catch(() =>
      showSettingsToast("Could not read the automatically held Bot Status IDs. Saved queues were not changed.")));
    pendingHint.insertAdjacentElement("afterend", button);
    const panel = document.createElement('div');
    panel.id = 'botStatusHeldDetails';
    panel.className = 'sub-card';
    panel.hidden = true;
    const header = document.createElement('div');
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = 'Close held review';
    close.addEventListener('click', () => { panel.hidden = true; });
    header.append(close);
    const list = document.createElement('div');
    list.id = 'botStatusHeldDetailsList';
    panel.append(header, list);
    button.insertAdjacentElement('afterend', panel);
  }
  const scanStatus = $("botAvailabilityScanStatus");
  if (scanStatus && !document.getElementById("ds-bot-status-worker-stats")) {
    const workerStats = document.createElement("button");
    workerStats.type = "button";
    workerStats.id = "ds-bot-status-worker-stats";
    workerStats.textContent = "Worker stats";
    workerStats.title = "Show local request, cached and rate-limit totals for this worker session";
    workerStats.style.marginInlineStart = "8px";
    workerStats.addEventListener("click", async () => {
      const result = await runtimeMessage({ type: "DS_BOT_STATUS_HELPER_STATS" }).catch(() => null);
      if (!result?.ok) { showSettingsToast("Bot Status worker statistics aren't available."); return; }
      const label = `Requests ${result.requested || 0} · unique ${result.uniqueTargets || 0} · checked ${result.checked || 0} · cached ${result.cached || 0} · deduplicated ${result.coalesced || 0} · retries ${result.retryAttempts || 0} · in flight ${result.outstanding || 0} · failed ${result.failed || 0}` +
        (result.checked ? ` · slowest ${Math.round(result.slowestCheckMs || 0)}ms` : "") +
        (result.rateLimited ? ` · rate limits ${result.rateLimited}` : "") +
        (result.cooldownMs > 0 ? ` · cooldown ${Math.ceil(result.cooldownMs / 1000)}s` : "");
      showSettingsToast(label);
    });
    scanStatus.insertAdjacentElement("afterend", workerStats);
  }
  const maintenanceCard = document.querySelector(".bot-status-maintenance-card");
  maintenanceCard?.addEventListener("toggle", () => {
    if (maintenanceCard.open) refreshBlockedArchiveCleanupStatus().catch(() => {});
  });
  // A scan click also works before the viewport-driven preparation has finished.
  // Do not race a second queue reconciliation or silently discard load errors.
  const startScan = async options => {
    try {
      if (botAvailabilityScanRunning) return;
      if (!await loadAndRenderSavedRecoveryManagers("manual", "status") || !savedRecoverySectionOpen()) return;
      await runBotAvailabilityScan(options);
    } catch (error) {
      const message = `Could not prepare or run Bot Status: ${String(error?.message || error)}. Review saved checkpoints before retrying.`;
      if ($("botAvailabilityScanStatus")) $("botAvailabilityScanStatus").textContent = message;
      showSettingsToast(message);
    }
  };
  for (const [id, options] of [
    ["scanBotAvailability", { mode: "all" }], ["scanUncheckedBotAvailability", { mode: "unchecked" }],
    ["scanUnknownBotAvailability", { mode: "unknown" }], ["resumePausedBotAvailability", { resume: true, queue: "main" }],
    ["resumePausedStaleBotAvailability", { resume: true, queue: "stale" }], ["scanUnmonitoredBotAvailability", { mode: "outside" }],
    ["scanStaleBotAvailability", { mode: "stale" }], ["recheckDeletedSavedBots", { mode: "archived" }]
  ]) $(id)?.addEventListener("click", () => startScan(options));
  $("cleanUnavailableBots")?.addEventListener("click", () => cleanConfirmedUnavailableBots().catch(error => {
    const detail = String(error?.message || "Unexpected failure").slice(0, 180);
    console.warn("[SpicyChat QoL] unavailable-bot cleanup failed", error);
    showSettingsToast(`Could not clean unavailable bots: ${detail}. Check the recovery ledger before retrying.`);
  }));
  $("cleanArchivedBlockedBotsNow")?.addEventListener("click", () => cleanupArchivedBlockedBots({ automatic: false, maxItems: 5000 }).catch(() => showSettingsToast("Could not clean archived blocked bots.")));
  $("compactOldBlockedBotData")?.addEventListener("click", () => compactOlderBlockedBotData());
  $("savedBotInfoSearch")?.addEventListener("input", event => {
    savedBotInfoUiState.query = event?.target?.value || "";
    savedBotInfoUiState.visible = 10;
    savedBotInfoUiState.collapsed = true;
    renderSavedBotInfo();
  });
  $("savedBotInfoShowMore")?.addEventListener("click", () => {
    savedBotInfoUiState.visible = Math.min(5000, Number(savedBotInfoUiState.visible || 10) + 10);
    savedBotInfoUiState.collapsed = true;
    renderSavedBotInfo();
  });
  $("savedBotInfoShowLess")?.addEventListener("click", () => {
    savedBotInfoUiState.visible = 10;
    savedBotInfoUiState.collapsed = true;
    renderSavedBotInfo();
  });
  $("savedBotInfoCollapse")?.addEventListener("click", () => {
    if (Number(savedBotInfoUiState.visible || 10) <= 10) {
      const archiveCount = Object.keys(botArchiveState.meta).length;
      savedBotInfoUiState.visible = Math.min(100, archiveCount);
      savedBotInfoUiState.collapsed = false;
    } else {
      savedBotInfoUiState.visible = 10;
      savedBotInfoUiState.collapsed = true;
    }
    renderSavedBotInfo();
  });
  $("clearForgottenBotStatusIds")?.addEventListener("click", () => clearForgottenBotStatusIds().catch(() => showSettingsToast("Could not clear the forgotten-ID list.")));
  $("deletedSavedBotSearch")?.addEventListener("input", () => {
    deletedSavedBotsUiState.visible = 10;
    deletedSavedBotsUiState.collapsed = true;
    renderDeletedSavedBots();
  });
  $("deletedSavedBotShowMore")?.addEventListener("click", () => {
    deletedSavedBotsUiState.visible = Math.min(5000, Number(deletedSavedBotsUiState.visible || 10) + 10);
    deletedSavedBotsUiState.collapsed = true;
    renderDeletedSavedBots();
  });
  $("deletedSavedBotShowLess")?.addEventListener("click", () => {
    deletedSavedBotsUiState.visible = 10;
    deletedSavedBotsUiState.collapsed = true;
    renderDeletedSavedBots();
  });
  $("deletedSavedBotCollapse")?.addEventListener("click", () => {
    if (Number(deletedSavedBotsUiState.visible || 10) <= 10) {
      deletedSavedBotsUiState.visible = Math.min(100, deletedSavedBotEntries().length);
      deletedSavedBotsUiState.collapsed = false;
    } else {
      deletedSavedBotsUiState.visible = 10;
      deletedSavedBotsUiState.collapsed = true;
    }
    renderDeletedSavedBots();
  });
  $("stopBotAvailabilityScan")?.addEventListener("click", () => {
    botAvailabilityStopRequested = true;
    const status = $("botAvailabilityScanStatus");
    if (status) status.textContent = "Stopping after the current check...";
  });
  $("clearBotAvailabilityResults")?.addEventListener("click", clearBotAvailabilityResults);
  $("clearBotArchive")?.addEventListener("click", clearBotArchive);
  $("exportBotStatusArchiveJsonGz")?.addEventListener("click", downloadBotStatusArchiveJsonGz);
  $("testBotStatusArchiveEndpoint")?.addEventListener("click", testArchiveUploadEndpoint);
  $("sendBotStatusArchiveChanged")?.addEventListener("click", () => sendBotStatusArchiveToArchive({ forceAll: false }));
  $("sendBotStatusArchiveAll")?.addEventListener("click", () => sendBotStatusArchiveToArchive({ forceAll: true }));
  $("enableBotStatusArchiveContribution")?.addEventListener("change", event => setArchiveContributionEnabled(!!event.target.checked).catch(() => {}));
  $("submitBotStatusArchiveChanged")?.addEventListener("click", () => sendBotStatusArchiveContribution({ forceAll: false }));
  $("submitBotStatusArchiveAll")?.addEventListener("click", () => sendBotStatusArchiveContribution({ forceAll: true }));
  const persistArchiveConfig = debounceCallback(() => saveArchiveUploadConfig({ quiet: true }).catch(() => {}), 350);
  $("botStatusArchiveEndpoint")?.addEventListener("change", persistArchiveConfig);
  $("botStatusArchiveToken")?.addEventListener("input", persistArchiveConfig);
  $("botStatusScanSpeed")?.addEventListener("change", () => { save().catch(() => {}); updateBotStatusScanEstimate(); });
  for (const id of ["botStatusMaxBots", "botStatusMaxMinutes"]) {
    $(id)?.addEventListener("change", () => { save().catch(() => {}); updateBotStatusScanEstimate(); });
    $(id)?.addEventListener("input", updateBotStatusScanEstimate);
  }
  // The saved scan rate/estimate is loaded when Saved Bots becomes active.
  $("botStatusStaleDays")?.addEventListener("change", () => { save().catch(() => {}); renderBotAvailability({ skipRecoveryRerender: true }); });
  $("botAvailabilityScope")?.addEventListener("change", () => {
    invalidateDuplicateCache();
    botAvailabilityUiState.visible = 10;
    botAvailabilityUiState.collapsed = true;
    renderBotAvailability({ skipRecoveryRerender: true });
  });
  $("botAvailabilityStatusFilter")?.addEventListener("change", async event => {
    botAvailabilityUiState.status = event.target.value || "all";
    botAvailabilityUiState.visible = 10;
    botAvailabilityUiState.collapsed = true;
    if (!savedRecoveryDataLoaded || !savedRecoveryActivated.has("status")) {
      await loadAndRenderSavedRecoveryManagers("manual", "status");
    }
    if (!savedRecoveryDataLoaded || !savedRecoveryActivated.has("status")) return;
    if (BOT_DUPLICATE_LEVELS.has(botAvailabilityUiState.status) && !botDuplicateCacheReady) {
      const scope = String($("botAvailabilityScope")?.value || "all");
      await nextUiFrame();
      const base = botStatusCenterBaseEntries(scope);
      botDuplicateMatchesCache = computeBotDuplicateMatches(base);
      botDuplicateCacheScope = scope;
      botDuplicateCacheReady = true;
      renderBotAvailability({ baseEntries: base, skipRecoveryRerender: true });
      return;
    }
    renderBotAvailability({ skipRecoveryRerender: true });
  });
  const renderAvailabilitySearch = debounceCallback(event => {
    botAvailabilityUiState.query = event?.target?.value || $("botAvailabilitySearch")?.value || "";
    botAvailabilityUiState.visible = 10;
    botAvailabilityUiState.collapsed = true;
    renderBotAvailability({ skipRecoveryRerender: true });
  });
  $("botAvailabilitySearch")?.addEventListener("input", renderAvailabilitySearch);
  $("botAvailabilityShowMore")?.addEventListener("click", () => {
    botAvailabilityUiState.collapsed = true;
    botAvailabilityUiState.visible = Math.min(5000, Number(botAvailabilityUiState.visible || 10) + 10);
    renderBotAvailability({ skipRecoveryRerender: true });
  });
  $("botAvailabilityShowLess")?.addEventListener("click", () => {
    botAvailabilityUiState.visible = 10;
    botAvailabilityUiState.collapsed = true;
    renderBotAvailability({ skipRecoveryRerender: true });
  });
  $("botAvailabilityCollapse")?.addEventListener("click", () => {
    const current = Number(botAvailabilityUiState.visible || 10);
    if (current <= 10) {
      botAvailabilityUiState.collapsed = false;
      botAvailabilityUiState.visible = Math.min(100, botStatusCenterBaseEntries(String($("botAvailabilityScope")?.value || "all")).length);
    } else {
      botAvailabilityUiState.collapsed = true;
      botAvailabilityUiState.visible = 10;
    }
    renderBotAvailability({ skipRecoveryRerender: true });
  });
}
