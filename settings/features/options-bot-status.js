// Feature-owned options helpers: bot-status. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

// Unfinished scan work is separate from checkedAt and previous availability results.
// Kept as a lightweight cache of the durable resume queue for the review UI.
let botStatusPendingReviewIds = new Set();

function shortBotCharacterId(value) {
  const id = String(value || "").trim();
  if (!BOT_ID_RE.test(id)) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function botIdentityDisplay(idValue, creatorValue = "") {
  const id = String(idValue || "").trim();
  const creator = displayNormalizedSavedText(String(creatorValue || "").trim());
  const shortId = shortBotCharacterId(id);
  return creator ? `${creator} · ${shortId}` : `ID ${shortId}`;
}

function botSameNameCollisionIndex() {
  // This index is presentation-only. Availability, cleanup, restore and archive
  // state stay keyed by the exact character UUID; names are never used to join
  // or transfer status between bots.
  const availability = normalizeBotAvailability(botAvailabilityState).meta;
  const archives = normalizeBotArchive(botArchiveState).meta;
  const recovery = normalizeBotUnavailableRecovery(botUnavailableRecoveryState).meta;
  const groups = new Map();
  const ids = new Set([
    ...Object.keys(availability || {}),
    ...Object.keys(archives || {}),
    ...Object.keys(recovery || {})
  ]);

  const normalizeName = value => String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  for (const id of ids) {
    if (!BOT_ID_RE.test(id)) continue;
    const status = availability[id] || {};
    const archive = archives[id] || {};
    const recovered = recovery[id] || {};
    const fields = archive.fields || {};
    const name = cleanAuthoritativeBotName(status.name, id)
      || cleanAuthoritativeBotName(fields.name, id)
      || cleanAuthoritativeBotName(archive.name, id)
      || cleanAuthoritativeBotName(recovered.name, id)
      || "";
    const key = normalizeName(name);
    if (key.length < 2) continue;
    const creator = canonicalBotCreator(
      status.creator || archive.creator || fields.creator || recovered.creator || ""
    );
    const deletedRecovery = String(status.status || "") === "unavailable" && !!archives[id];
    const item = {
      id,
      name,
      creator,
      status: String(status.status || "unknown"),
      checkedAt: Number(status.checkedAt || 0),
      deletedRecovery,
      sectionLabel: deletedRecovery
        ? "Deleted / recovery"
        : (String(status.status || "") === "available"
            ? "Available"
            : (String(status.status || "") === "restricted"
                ? "Private / restricted"
                : "Saved / status"))
    };
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const byId = new Map();
  for (const group of groups.values()) {
    const unique = group.filter((item, index, list) => list.findIndex(other => other.id === item.id) === index);
    if (unique.length < 2) continue;

    // A shared display name by itself is not useful signal. Normal names such
    // as Chelsea/Mary can have many unrelated live bots. Only surface the
    // collision when it helps explain a recovery/status ambiguity: one UUID is
    // confirmed unavailable/deleted while another UUID with the same name is
    // still not unavailable (usually Available).
    const unavailable = unique.filter(item => item.deletedRecovery || item.status === "unavailable");
    const otherStates = unique.filter(item => !(item.deletedRecovery || item.status === "unavailable"));
    if (!unavailable.length || !otherStates.length) continue;

    for (const item of unavailable) {
      byId.set(item.id, otherStates.filter(other => other.id !== item.id));
    }
    for (const item of otherStates) {
      byId.set(item.id, unavailable.filter(other => other.id !== item.id));
    }
  }
  return byId;
}

function appendSameNameCollisionInfo(main, badgeRow, entry) {
  const matches = Array.isArray(entry?.sameNameMatches) ? entry.sameNameMatches.filter(match => match?.id && match.id !== entry.id) : [];
  if (!matches.length) return;

  badgeRow?.appendChild(makeElement("span", {
    className: "bot-update-badge bot-same-name-badge",
    text: "Same name · different ID",
    dataset: { status: "current" },
    attrs: { title: "Another character ID uses this name in a different availability/recovery state." }
  }));

  const visible = matches.slice(0, 3).map(match => {
    const creator = displayNormalizedSavedText(match.creator || "Unknown creator");
    return `${creator} · ${shortBotCharacterId(match.id)} · ${match.sectionLabel || botAvailabilityStatusLabel(match.status)}`;
  });
  const extra = matches.length > visible.length ? ` · +${matches.length - visible.length} more` : "";
  main.appendChild(makeElement("div", {
    className: "bot-availability-meta",
    text: `Same-name bot${matches.length === 1 ? "" : "s"}: ${visible.join(" · ")}${extra}`
  }));
}

function botAvailabilityCard(entry) {
  const card = makeElement("div", { className: "bot-manager-card", dataset: { id: entry.id } });
  const cardImage = canonicalBotImage(entry.image || entry.archive?.image || entry.archive?.fields?.image || "");
  if (cardImage) {
    card.appendChild(makeDeferredManagerImage(cardImage));
  } else {
    card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: "?" }));
  }

  const main = makeElement("div", { className: "bot-manager-main" });
  main.appendChild(makeElement("div", { className: "bot-manager-title", text: displayNormalizedSavedText(entry.name || entry.id || "Unknown bot") }));
  main.appendChild(makeElement("div", {
    className: "bot-manager-creator",
    text: botIdentityDisplay(entry.id, entry.creator),
    attrs: { title: `Character ID: ${entry.id}` }
  }));
  main.appendChild(makeElement("div", { className: "bot-manager-id", text: `Character ID: ${entry.id}` }));

  const badgeRow = makeElement("div", { className: "bot-status-badges" });
  badgeRow.appendChild(makeElement("span", {
    className: "bot-availability-status",
    text: entry.checkedAt ? botAvailabilityStatusLabel(entry.status) : "Not checked",
    dataset: { status: entry.checkedAt ? entry.status : "unknown" }
  }));
  if (botStatusPendingReviewIds.has(entry.id)) {
    badgeRow.appendChild(makeElement("span", {
      className: "bot-update-badge",
      text: "Pending recheck",
      dataset: { status: "current" },
      attrs: { title: "This bot is in the saved Resume scan queue. Its last checked status has been preserved." }
    }));
  }
  if ((entry.changedFields || []).length) {
    badgeRow.appendChild(makeElement("span", { className: "bot-update-badge", text: "Change history", dataset: { status: "updated" } }));
  }
  if (entry.archive) {
    const archiveFields = entry.archive.coverage?.length || 0;
    badgeRow.appendChild(makeElement("span", { className: "bot-update-badge", text: `Saved copy · ${archiveFields} field${archiveFields === 1 ? "" : "s"}`, dataset: { status: "current" } }));
    if (entry.archive.ownBot) {
      const revisions = Array.isArray(entry.archive.revisions) ? entry.archive.revisions.length : 0;
      badgeRow.appendChild(makeElement("span", { className: "bot-update-badge", text: `Own bot${revisions ? ` · ${revisions} revision${revisions === 1 ? "" : "s"}` : ""}`, dataset: { status: "current" } }));
    }
  }
  const dupLevel = duplicateLevelForEntry(entry.duplicateMatches);
  if (dupLevel) {
    badgeRow.appendChild(makeElement("span", {
      className: "bot-duplicate-badge",
      text: dupLevel === "exact" ? "Exact duplicate match" : dupLevel === "likely" ? "Likely duplicate" : "Possible duplicate",
      dataset: { level: dupLevel }
    }));
  }
  main.appendChild(badgeRow);
  appendSameNameCollisionInfo(main, badgeRow, entry);

  const sources = (entry.sources || []).map(availabilitySourceLabel).filter(Boolean).join(", ");
  const checked = entry.checkedAt ? new Date(entry.checkedAt).toLocaleString() : "never";
  const http = entry.httpStatus ? ` · HTTP ${entry.httpStatus}` : "";
  main.appendChild(makeElement("div", {
    className: "bot-availability-meta",
    text: `${sources ? `Tracked in: ${sources} · ` : ""}Checked: ${checked}${http}`
  }));
  if (entry.reason) main.appendChild(makeElement("div", { className: "bot-manager-description", text: entry.reason }));
  const updateDetails = botUpdateDetails(entry);
  if (updateDetails) main.appendChild(updateDetails);
  const archiveDetails = botArchiveDetails(entry);
  if (archiveDetails) main.appendChild(archiveDetails);
  const historyDetails = botArchiveHistoryDetails(entry.archive);
  if (historyDetails) main.appendChild(historyDetails);
  const duplicateDetails = botDuplicateDetails(entry);
  if (duplicateDetails) main.appendChild(duplicateDetails);

  const actions = makeElement("div", { className: "bot-manager-actions" });
  actions.appendChild(makeElement("a", { text: "Open profile", attrs: { href: entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`, target: "_blank", rel: "noopener noreferrer" } }));
  actions.appendChild(makeElement("button", { className: "bot-availability-recheck", text: entry.checkedAt ? "Recheck" : "Check now", attrs: { type: "button" } }));
  if (entry.archive) {
    actions.appendChild(makeElement("button", { className: "bot-archive-copy", text: "Copy saved bot", attrs: { type: "button" } }));
    actions.appendChild(makeElement("button", { className: "bot-archive-portable", text: "Importable JSON", attrs: { type: "button", title: "Character Card JSON that QoL can import back into SpicyChat" } }));
    actions.appendChild(makeElement("button", { className: "bot-archive-download", text: "Archive JSON", attrs: { type: "button", title: "Exact QoL saved-copy record" } }));
    actions.appendChild(makeElement("button", { className: "bot-archive-delete", text: "Delete saved copy", attrs: { type: "button" } }));
  }
  if (entry.checkedAt) actions.appendChild(makeElement("button", { className: "bot-availability-forget", text: "Forget history", attrs: { type: "button" } }));
  main.appendChild(actions);
  card.appendChild(main);
  return card;
}

function renderBotAvailability(renderOptions = {}) {
  const sameNameCollisions = renderOptions?.sameNameCollisions instanceof Map
    ? renderOptions.sameNameCollisions
    : botSameNameCollisionIndex();
  if (!renderOptions?.skipRecoveryRerender) {
    renderSavedBotInfo({ sameNameCollisions });
    renderDeletedSavedBots({ sameNameCollisions });
  }
  const host = $("botAvailabilityManager");
  if (!host) return;

  const scope = String($("botAvailabilityScope")?.value || "all");
  const statusFilter = String($("botAvailabilityStatusFilter")?.value || botAvailabilityUiState.status || "all");
  // The resume queue is durable and may contain bots that are no longer in
  // the selected routine scope. Never make these IDs disappear from review.
  const scopeForReview = statusFilter === "pending" ? "all" : scope;
  const suppliedBase = Array.isArray(renderOptions?.baseEntries) ? renderOptions.baseEntries : null;
  const base = suppliedBase && statusFilter !== "pending" ? suppliedBase : botStatusCenterBaseEntries(scopeForReview);
  if (statusFilter === "pending") {
    const knownIds = new Set(base.map(entry => entry.id));
    const archives = normalizeBotArchive(botArchiveState).meta;
    const checked = normalizeBotAvailability(botAvailabilityState).meta;
    for (const id of botStatusPendingReviewIds) {
      if (knownIds.has(id)) continue;
      const history = checked[id] || {};
      const archive = archives[id] || {};
      base.push({
        id, name: cleanAuthoritativeBotName(history.name, id) || cleanAuthoritativeBotName(archive.fields?.name || archive.name, id) || `Bot ${shortBotCharacterId(id)}`,
        image: history.image || archive.image || archive.fields?.image || "",
        creator: history.creator || archive.creator || archive.fields?.creator || "",
        profileUrl: history.profileUrl || archive.profileUrl || `https://spicychat.ai/chatbot/${id}`,
        status: history.status || "unknown", checkedAt: Number(history.checkedAt || 0),
        reason: history.reason || "Saved in an unfinished scan, but no longer in the tracked list.",
        sources: history.sources || [], archive: archives[id] || null,
        _scanEligible: false, changedFields: history.changedFields || []
      });
    }
  }
  const duplicates = botDuplicateCacheReady && botDuplicateCacheScope === scope
    ? botDuplicateMatchesCache
    : new Map();
  const entries = botAvailabilityEntries(base, duplicates)
    .map(entry => ({ ...entry, sameNameMatches: sameNameCollisions.get(entry.id) || [] }));
  const duplicateBots = botDuplicateCacheReady && botDuplicateCacheScope === scope
    ? [...duplicates.values()].filter(matches => matches.length).length
    : null;
  const updatedCount = base.filter(entry => (entry.changedFields || []).length > 0).length;
  const checkedCount = base.filter(entry => Number(entry.checkedAt) > 0).length;
  const archivedCount = base.filter(entry => !!entry.archive).length;
  const unavailableCandidateCount = base.filter(entry => Number(entry.unavailableEvidenceCount || 0) === 1 && entry.status !== "unavailable").length;
  const confirmedUnavailableCount = base.filter(entry => entry.status === "unavailable").length;
  const staleDays = Math.max(1, Number(value("botStatusStaleDays", "7")) || 7);
  const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  // All-known is a history view, not the routine scan queue. In particular,
  // archive/discovered/blocked-only records remain visible but cannot silently
  // enroll themselves for monitoring. Button counts must match the real queue.
  // The base builder already collected the real scan queue. Reuse its flags
  // instead of normalizing thousands of saved bots a second time each paint.
  const eligibleEntries = base.filter(entry => entry._scanEligible === true);
  const uncheckedCount = eligibleEntries.filter(entry => Number(entry.checkedAt || 0) <= 0).length;
  const pendingRecheckCount = botStatusPendingReviewIds.size;
  const notMonitoredCount = base.length - eligibleEntries.length;
  const uncheckedNotMonitoredCount = base.filter(entry => entry._scanEligible !== true && Number(entry.checkedAt || 0) <= 0).length;
  const checkedUnknownCount = eligibleEntries.filter(entry => Number(entry.checkedAt || 0) > 0 && String(entry.status || "") === "unknown").length;
  // A prebuilt Set avoids repeated O(number of blocked bots) array scans for
  // every known bot when large Bot Status views are refreshed.
  const manualBlockedIds = new Set(normalizeBotStore(blockedState).ids.map(id => String(id || "").toLowerCase()));
  const excludedBlockedUncheckedCount = base.filter(entry => entry._scanEligible !== true && Number(entry.checkedAt || 0) <= 0 && manualBlockedIds.has(String(entry.id || "").toLowerCase())).length;
  const manualOutsideCount = base.filter(entry => entry._scanEligible !== true && Number(entry.checkedAt || 0) <= 0 && !manualBlockedIds.has(String(entry.id || "").toLowerCase()) && !botStatusIdIgnored(entry.id)).length;
  const staleCount = eligibleEntries.filter(entry => Number(entry.checkedAt || 0) > 0 && Number(entry.checkedAt || 0) <= staleCutoff).length;
  let limit = Math.max(10, Number(botAvailabilityUiState.visible || 10) || 10);
  const shown = entries.slice(0, limit);

  const summary = $("botAvailabilitySummary");
  if (summary) {
    const matches = entries.length !== base.length ? ` · ${entries.length} matching` : "";
    const duplicateText = duplicateBots == null ? "" : ` · ${duplicateBots} duplicate matches`;
    const monitoredChecked = eligibleEntries.length - uncheckedCount;
    summary.textContent = `${base.length} known · ${pendingRecheckCount ? `${pendingRecheckCount} pending rechecks · ` : ""}${eligibleEntries.length} routinely monitored (${monitoredChecked} checked, ${uncheckedCount} unchecked, ${checkedUnknownCount} unresolved/Unknown)${notMonitoredCount ? ` · ${notMonitoredCount} outside routine scans (${uncheckedNotMonitoredCount} unchecked; ${excludedBlockedUncheckedCount} blocked/excluded)` : ""} · ${archivedCount} saved copies · ${updatedCount} with change history${duplicateText}${matches}`;
    const manualButton = $("scanUnmonitoredBotAvailability");
    if (manualButton && !botAvailabilityScanRunning) { manualButton.disabled = manualOutsideCount === 0; manualButton.textContent = manualOutsideCount ? `Check outside routine scope (${manualOutsideCount})` : "No unblocked outside-scope bots"; manualButton.title = "One-time manual scan only. Blocked bots remain excluded."; }
  }
  const unknownButton = $("scanUnknownBotAvailability");
  if (unknownButton && !botAvailabilityScanRunning) {
    unknownButton.disabled = checkedUnknownCount === 0;
    unknownButton.textContent = checkedUnknownCount ? `Recheck unresolved results (${checkedUnknownCount})` : "No checked Unknown results";
    unknownButton.title = "Manual recheck of checked but inconclusive results in the routine scope; respects scan limits and pause controls.";
  }
  const uncheckedButton = $("scanUncheckedBotAvailability");
  if (uncheckedButton && !botAvailabilityScanRunning) {
    uncheckedButton.disabled = uncheckedCount === 0;
    uncheckedButton.textContent = uncheckedCount ? `Check unchecked bots (${uncheckedCount})` : "No unchecked bots in scan scope";
  }
  const staleButton = $("scanStaleBotAvailability");
  if (staleButton && !botAvailabilityScanRunning) {
    staleButton.disabled = staleCount === 0;
    staleButton.textContent = staleCount ? `Refresh stale bots (${staleCount})` : "No stale bots";
  }
  const unavailableSummary = $("botAvailabilityUnavailableSummary");
  if (unavailableSummary) {
    unavailableSummary.textContent = unavailableCandidateCount || confirmedUnavailableCount
      ? `Unavailable candidates: ${unavailableCandidateCount} · Confirmed unavailable: ${confirmedUnavailableCount}${unavailableCandidateCount ? ` · Needs recheck: ${unavailableCandidateCount}` : ""}`
      : "";
  }

  const showMore = $("botAvailabilityShowMore");
  const showLess = $("botAvailabilityShowLess");
  const collapse = $("botAvailabilityCollapse");
  if (showMore) {
    showMore.style.display = entries.length > shown.length ? "" : "none";
    showMore.textContent = `Show 10 more (${Math.max(0, entries.length - shown.length)} left)`;
  }
  if (showLess) showLess.style.display = shown.length > 10 || !botAvailabilityUiState.collapsed ? "" : "none";
  if (collapse) {
    collapse.style.display = entries.length > 10 ? "" : "none";
    collapse.textContent = limit <= 10 ? "Show 100" : "Collapse to 10";
  }

  if (!base.length) {
    setEmptyState(host, "No locally tracked bots found in this scope yet.");
    return;
  }
  if (!entries.length) {
    setEmptyState(host, "No tracked bots match this filter.");
    return;
  }

  host.replaceChildren(...shown.map(botAvailabilityCard));
  host.querySelectorAll(".bot-availability-recheck").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const previous = botAvailabilityState?.meta?.[id] || null;
      const tracked = collectTrackedAvailabilityBots("all").find(item => item.id === id) || previous || { id };
      button.disabled = true;
      button.textContent = "Checking...";
      const rawResult = await checkBotAvailability({ ...tracked, ...(previous || {}), sources: uniqueClean([...(previous?.sources || []), ...(tracked?.sources || [])]) });
      const result = reconcileBotUpdate(previous, rawResult);
      botAvailabilityState.meta[id] = result;
      const metadataRepaired = applyAuthoritativeBotMetadata(rawResult);
      let archiveChanged = false;
      if (rawResult.status === "available" && rawResult.archiveSnapshot) {
        archiveChanged = saveArchiveSnapshotForBot(id, rawResult.archiveSnapshot, {
          name: result.name,
          creator: result.creator,
          image: result.image,
          profileUrl: result.profileUrl,
          chatUrls: knownChatUrlsForBot(id),
          source: "Bot Status Center"
        });
      }
      const restored = result.status === "available"
        ? restoreUnavailableRecoveryEntryInMemory(id)
        : { restored: false, blocked: false };
      invalidateDuplicateCache();
      botStatusStorageSelfWriteUntil = Date.now() + 5000;
      const payload = {
        [BOT_AVAILABILITY_KEY]: botAvailabilityState,
        ...(archiveChanged ? { [BOT_ARCHIVE_KEY]: botArchiveState } : {}),
        ...(metadataRepaired ? botStatusMetadataStoragePayload() : {})
      };
      if (restored.restored) {
        Object.assign(payload, botStatusRecoveryStoragePayload({ restoreBlockedIds: restored.blocked ? [id] : [] }).payload);
        if (restored.blocked) {
          const stored = await storageGet(["settings"]);
          const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
          settings.blockedBotIds = uniqueClean([...(settings.blockedBotIds || []), id]).filter(validBotId);
          settings.blockedBotNames = [];
          payload.settings = settings;
        }
      }
      await storageSet(payload);
      renderBotAvailability({ skipRecoveryRerender: true });
      setTimeout(() => refreshStorageUsageIfVisible(), 120);
    });
  });
  host.querySelectorAll(".bot-archive-copy").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const archive = normalizeBotArchive(botArchiveState).meta[id];
      if (!archive) return;
      const text = botArchiveReadableText(archive);
      try {
        await navigator.clipboard.writeText(text);
        showSettingsToast("Saved bot copy copied to clipboard.");
      } catch {
        const box = $("settingsJson");
        if (box) {
          box.value = text;
          setActiveTab("data");
          box.focus();
          box.select();
        }
      }
    });
  });
  host.querySelectorAll(".bot-archive-portable").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const archive = normalizeBotArchive(botArchiveState).meta[id];
      if (!archive) return;
      downloadPortableBotProfile(archive);
      showSettingsToast("Importable bot profile JSON downloaded.");
    });
  });
  host.querySelectorAll(".bot-archive-download").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const archive = normalizeBotArchive(botArchiveState).meta[id];
      if (!archive) return;
      downloadBotArchiveEntry(archive);
    });
  });
  host.querySelectorAll(".bot-archive-delete").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      const archive = normalizeBotArchive(botArchiveState).meta[id];
      if (!id || !archive) return;
      const name = archive.name || archive.fields?.name || id;
      if (!confirm(`Delete the saved local copy of ${name}? Status history and other tracked lists are not affected.`)) return;
      delete botArchiveState.meta[id];
      botArchiveState = normalizeBotArchive(botArchiveState);
      invalidateDuplicateCache();
      await storageSet({ [BOT_ARCHIVE_KEY]: botArchiveState });
      renderBotAvailability();
      refreshStorageUsageIfVisible();
      showSettingsToast("Saved bot copy deleted.");
    });
  });
  host.querySelectorAll(".bot-availability-forget").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.closest(".bot-manager-card")?.dataset.id || "";
      if (!id) return;
      delete botAvailabilityState.meta[id];
      botAvailabilityState = normalizeBotAvailability(botAvailabilityState);
      invalidateDuplicateCache();
      await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState });
      renderBotAvailability();
      refreshStorageUsageIfVisible();
    });
  });
}

async function noteBotStatusRunEvent(event, detail = {}) {
  try {
    await runtimeMessage({ type: "DS_BOT_STATUS_RUN_EVENT", event, detail });
  } catch {}
}

function botStatusScanDelayMs() {
  const speed = String(value("botStatusScanSpeed", "safe"));
  return Number(BOT_STATUS_SCAN_SPEED_DELAYS[speed] || BOT_STATUS_SCAN_SPEED_DELAYS.safe);
}

async function waitForBotStatusPace(delayMs) {
  const waitMs = Math.max(0, Math.min(10000, Math.round(Number(delayMs || 0))));
  if (!waitMs) return true;
  try {
    const response = await runtimeMessage({ type: "DS_BOT_STATUS_PACE_WAIT", delayMs: waitMs });
    if (response?.ok) return true;
  } catch {}
  // Old/background-mismatched builds still get a safe fallback. The normal
  // v0.2.27 path is owned by the extension service worker so hidden Options
  // timer throttling cannot stretch a ~1s scan delay into multi-minute gaps.
  await new Promise(resolve => setTimeout(resolve, waitMs));
  return false;
}

async function waitForRecommendationPace(delayMs) {
  const waitMs = Math.max(0, Math.min(30000, Math.round(Number(delayMs || 0))));
  if (!waitMs) return true;
  try {
    const response = await runtimeMessage({ type: "DS_RECOMMENDATION_PACE_WAIT", delayMs: waitMs });
    if (response?.ok) return true;
  } catch {}
  // Compatibility fallback only. Retry/backoff waits are intentionally kept
  // conservative even on older/mismatched backgrounds.
  await new Promise(resolve => setTimeout(resolve, waitMs));
  return false;
}

async function waitForRecommendationSteadyPace(delayMs) {
  const waitMs = Math.max(0, Math.min(30000, Math.round(Number(delayMs || 0))));
  if (!waitMs) return true;

  // v0.2.29 hotfix: Chromium can delay *the hidden Options continuation itself*
  // for several minutes even when the timer was moved into the service worker.
  // A bulk queue already serializes on a real network response, so when Settings
  // is backgrounded we use request/response time as the steady-state pacing and
  // reserve explicit waits for retries/throttle backoff. This removes the
  // observed 6-8 minute gaps without turning failures into rapid retries.
  if (document.hidden || (typeof document.hasFocus === "function" && !document.hasFocus())) return true;

  return waitForRecommendationPace(waitMs);
}

function botStatusPositiveLimit(id, max) {
  const raw = String(value(id, "") || "").trim();
  if (!raw) return 0;
  return Math.min(max, Math.max(0, Math.floor(Number(raw) || 0)));
}

function botStatusDuration(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const hours = Math.floor(mins / 60);
  return hours ? `${hours}h ${mins % 60}m` : `${mins}m ${seconds % 60}s`;
}

function botStatusStartingRateMs() {
  return botStatusPreviousScanRateMs > 0 ? botStatusPreviousScanRateMs : Math.max(900, botStatusScanDelayMs() + 650);
}

function updateBotStatusScanEstimate() {
  const info = $("botStatusScanEstimate");
  if (!info || botAvailabilityScanRunning) return;
  const maxBots = botStatusPositiveLimit("botStatusMaxBots", 100000);
  const minutes = botStatusPositiveLimit("botStatusMaxMinutes", 1440);
  const capText = `${maxBots ? `${maxBots.toLocaleString()} bots` : "all bots"} / ${minutes ? `${minutes} min` : "unlimited time"}`;
  info.textContent = `Limits: ${capText}. Stops at whichever comes first; a check already in progress finishes safely. ETA uses actual scan speed once running.`;
}

function sortBotStatusRefreshQueue(entries, availability, archives) {
  return [...entries].sort((a, b) => {
    const av = availability[a.id] || {};
    const bv = availability[b.id] || {};
    const priority = (entry, state) => {
      if (Number(state.unavailableEvidenceCount || 0) > 0 && state.status !== "unavailable") return 0;
      if (state.status === "restricted") return 1;
      if (!archives[entry.id]) return 2;
      return 3;
    };
    return priority(a, av) - priority(b, bv) || Number(av.checkedAt || 0) - Number(bv.checkedAt || 0) || String(a.name || a.id).localeCompare(String(b.name || b.id));
  });
}

function isBotStatusAccessFailure(result) {
  if (!result || result.status !== "unknown") return false;
  const http = Number(result.httpStatus || 0);
  if (http === 401 || http === 429) return true;
  const reason = String(result.reason || "");
  return /\b(?:cors|unauthori[sz]ed|expired token|invalid token|401|login required|authentication was not ready|failed to fetch|networkerror|network error|network request failed|ERR_BLOCKED_BY_CLIENT)\b/i.test(reason);
}

// All unfinished scans must keep both the next page of selected bots and any
// unselected tail left by a configured max-bots limit. This also applies to
// the FIRST run, not only to Resume. IDs are saved, not entire bot profiles.
function botStatusPendingIds(entries, nextIndex, deferredIds = [], omittedIds = [], keepLast = false) {
  const unfinished = [
    ...deferredIds,
    ...entries.slice(Math.max(0, nextIndex)).map(entry => entry.id),
    ...omittedIds
  ];
  const pending = [...new Set(unfinished.filter(validBotId))];
  // Until all completed records are saved, keep the last item recoverable.
  if (keepLast && !pending.length && entries.length && validBotId(entries[entries.length - 1].id)) {
    pending.push(entries[entries.length - 1].id);
  }
  return pending;
}

async function botStatusPausedQueue() {
  try {
    const value = (await storageGet([BOT_STATUS_PAUSED_QUEUE_KEY]))?.[BOT_STATUS_PAUSED_QUEUE_KEY];
    return value && Array.isArray(value.ids) ? value : null;
  } catch { return null; }
}

const BOT_STATUS_LAST_RUN_FEEDBACK_KEY = "botStatusLastRunFeedbackV1";

function formatBotStatusLastRunFeedback(report) {
  if (!report || !Number.isFinite(Number(report.at))) return "No Bot Status run has been recorded yet.";
  const checked = Math.max(0, Number(report.checked || 0));
  const pending = Math.max(0, Number(report.pending || 0));
  const deferred = Math.max(0, Number(report.deferred || 0));
  const changed = Math.max(0, Number(report.changed || 0));
  const recovered = Math.max(0, Number(report.recovered || 0));
  const unknown = Math.max(0, Number(report.unknown || 0));
  const parts = [`Last scan ${new Date(Number(report.at)).toLocaleString()}`, `${checked} checks completed`];
  if (pending) parts.push(`${pending} pending (Resume available)`);
  if (deferred) parts.push(`${deferred} deferred after network/auth problems`);
  if (unknown) parts.push(`${unknown} inconclusive`);
  if (changed) parts.push(`${changed} updated`);
  if (recovered) parts.push(`${recovered} recovered`);
  if (report.saveVerified === false) parts.push("Save verification failed — check previous checkpoints");
  return parts.join(" · ") + ".";
}

async function refreshBotStatusLastRunFeedback() {
  const host = $("botStatusLastRunSummary");
  if (!host) return;
  try {
    const report = (await storageGet([BOT_STATUS_LAST_RUN_FEEDBACK_KEY]))?.[BOT_STATUS_LAST_RUN_FEEDBACK_KEY];
    host.textContent = formatBotStatusLastRunFeedback(report);
  } catch { host.textContent = "Last scan summary unavailable; existing saved results were not changed."; }
}

async function refreshBotStatusPauseButton() {
  const state = await botStatusPausedQueue();
  botStatusPendingReviewIds = new Set((state?.ids || []).filter(validBotId));
  const count = botStatusPendingReviewIds.size;
  const button = $("resumePausedBotAvailability");
  if (button) {
    button.disabled = botAvailabilityScanRunning || !count;
    button.hidden = !count;
    button.textContent = count
      ? `${state?.phase === "running" ? "Resume interrupted scan" : "Resume pending rechecks"} (${count})`
      : "Resume pending rechecks";
  }
  const hint = $("botStatusPendingQueueSummary");
  if (hint) hint.textContent = count
    ? `${count} IDs still queued. These are pending rechecks, not necessarily never-checked bots. Their previous status remains intact. New scans won't overwrite this queue.`
    : "No pending rechecks. Unchecked means no completed historical check.";
}

async function runBotAvailabilityScan(options = {}) {
  await ensureSavedListsDataLoaded();
  await ensureSavedRecoveryDataLoaded();
  if (botAvailabilityScanRunning) return;
  const pausedQueue = options?.resume ? await botStatusPausedQueue() : null;
  if (!options?.resume) {
    const unfinished = await botStatusPausedQueue();
    if (unfinished?.ids?.length) {
      // Never let a new scan overwrite a partially completed queue. Those
      // IDs can have valid previous statuses, so don't zero checkedAt either.
      const resumeNow = confirm(`${unfinished.ids.length} Bot Status rechecks are still pending.\n\nOK: Resume those IDs first.\nCancel: Keep the queue untouched and don't start a new scan.\n\nExisting availability results remain intact.`);
      if (resumeNow) await runBotAvailabilityScan({ resume: true });
      else await refreshBotStatusPauseButton();
      return;
    }
  }
  if (options?.resume && !(pausedQueue?.ids?.length)) {
    showSettingsToast("No paused Bot Status scan was saved.");
    await refreshBotStatusPauseButton();
    return;
  }
  const requestedScope = options?.resume ? String(pausedQueue.scope || "all") : String($("botAvailabilityScope")?.value || "all");
  const mode = options?.resume ? String(pausedQueue.mode || "all") : (options?.mode || (options?.uncheckedOnly === true ? "unchecked" : "all"));
  const scope = mode === "archived" ? "archived" : mode === "outside" ? "all" : requestedScope;
  const existingAvailability = normalizeBotAvailability(botAvailabilityState).meta;
  const archives = normalizeBotArchive(botArchiveState).meta;
  const blockedIds = new Set(normalizeBotStore(blockedState).ids.map(id => String(id || "").toLowerCase()));
  const archivedBlockedSkipped = mode === "archived"
    ? Object.values(existingAvailability).filter(entry => isConfirmedUnavailableBotStatus(entry) && archives[entry.id] && blockedIds.has(String(entry.id || "").toLowerCase())).length
    : 0;
  const allEntries = mode === "outside"
    ? botStatusCenterBaseEntries("all").filter(entry => !entry._scanEligible && !blockedIds.has(String(entry.id || "").toLowerCase()) && !botStatusIdIgnored(entry.id))
    : mode === "archived"
    ? Object.values(existingAvailability)
        .filter(entry => isConfirmedUnavailableBotStatus(entry) && archives[entry.id] && !blockedIds.has(String(entry.id || "").toLowerCase()))
        .map(entry => {
          const archive = archives[entry.id] || {};
          const fields = archive.fields || {};
          return {
            ...entry,
            id: entry.id,
            name: cleanAuthoritativeBotName(fields.name || archive.name || entry.name || "", entry.id) || entry.id,
            creator: archive.creator || fields.creator || entry.creator || "",
            image: archive.image || fields.image || entry.image || "",
            profileUrl: archive.profileUrl || entry.profileUrl || `https://spicychat.ai/chatbot/${entry.id}`,
            sources: uniqueClean([...(entry.sources || []), "archive"])
          };
        })
    : collectTrackedAvailabilityBots(scope);
  const staleDays = Math.max(1, Number(value("botStatusStaleDays", "7")) || 7);
  const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  let entries = mode === "outside"
    ? allEntries.filter(entry => Number(existingAvailability[entry.id]?.checkedAt || 0) <= 0)
    : mode === "unchecked"
    ? allEntries.filter(entry => Number(existingAvailability[entry.id]?.checkedAt || 0) <= 0)
    : mode === "unknown"
    ? allEntries.filter(entry => Number(existingAvailability[entry.id]?.checkedAt || 0) > 0 && existingAvailability[entry.id]?.status === "unknown")
    : mode === "stale"
      ? allEntries.filter(entry => Number(existingAvailability[entry.id]?.checkedAt || 0) > 0 && Number(existingAvailability[entry.id]?.checkedAt || 0) <= staleCutoff)
      : allEntries;
  entries = sortBotStatusRefreshQueue(entries, existingAvailability, archives);
  if (options?.resume) {
    const pending = new Set(pausedQueue.ids.filter(validBotId));
    const order = new Map(pausedQueue.ids.map((id, position) => [id, position]));
    entries = allEntries.filter(entry => pending.has(entry.id))
      .sort((a,b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  }
  // IDs that are no longer in the source scope must remain in the durable
  // queue for review, rather than disappearing from a resumed run.
  const unresolvablePendingIds = options?.resume
    ? pausedQueue.ids.filter(validBotId).filter(id => !entries.some(entry => entry.id === id))
    : [];
  const totalCandidates = entries.length;
  const maxBots = botStatusPositiveLimit("botStatusMaxBots", 100000);
  const maxMinutes = botStatusPositiveLimit("botStatusMaxMinutes", 1440);
  const maximumRuntimeMs = maxMinutes ? maxMinutes * 60 * 1000 : 0;
  const omittedByBotLimit = [
    ...(maxBots && entries.length > maxBots ? entries.slice(maxBots).map(item => item.id) : []),
    ...unresolvablePendingIds
  ];
  if (maxBots && entries.length > maxBots) entries = entries.slice(0, maxBots);

  const status = $("botAvailabilityScanStatus");
  const archivedStatus = mode === "archived" ? $("deletedSavedBotRecheckStatus") : null;
  if (!entries.length) {
    if (unresolvablePendingIds.length) {
      const message = `${unresolvablePendingIds.length} saved pending IDs are no longer in the current scan scope. The queue was preserved. Check whether those bots were blocked, excluded or removed from tracked lists before retrying.`;
      if (status) status.textContent = message;
      if (archivedStatus) archivedStatus.textContent = message;
      await refreshBotStatusPauseButton();
      showSettingsToast(message);
      return;
    }
    const message = mode === "archived"
      ? (archivedBlockedSkipped
          ? `No unblocked archived bots need rechecking. ${archivedBlockedSkipped} blocked bot${archivedBlockedSkipped === 1 ? " was" : "s were"} left alone.`
          : "No archived/deleted recovery copies need rechecking.")
      : mode === "outside"
        ? "No unchecked, unblocked bots outside routine monitoring. Blocked bots are excluded from this one-time scan."
      : mode === "unchecked"
        ? "No unchecked tracked bots in this scope."
      : mode === "unknown"
        ? "No checked Unknown results in this scope. Unchecked blocked bots stay outside routine scans."
        : mode === "stale"
          ? `No tracked bots in this scope are older than ${staleDays} day${staleDays === 1 ? "" : "s"}.`
          : "No locally tracked bots found in that scope.";
    if (status) status.textContent = message;
    if (archivedStatus) archivedStatus.textContent = message;
    showSettingsToast(message);
    renderBotAvailability();
    return;
  }

  botAvailabilityScanRunning = true;
  botAvailabilityStopRequested = false;
  const scanButton = $("scanBotAvailability");
  const uncheckedButton = $("scanUncheckedBotAvailability");
  const unknownButton = $("scanUnknownBotAvailability");
  const staleButton = $("scanStaleBotAvailability");
  const archivedButton = $("recheckDeletedSavedBots");
  const outsideButton = $("scanUnmonitoredBotAvailability");
  const stopButton = $("stopBotAvailabilityScan");
  if (scanButton) scanButton.disabled = true;
  if (uncheckedButton) uncheckedButton.disabled = true;
  if (unknownButton) unknownButton.disabled = true;
  if (staleButton) staleButton.disabled = true;
  if (archivedButton) archivedButton.disabled = true;
  if (outsideButton) outsideButton.disabled = true;
  if (stopButton) stopButton.disabled = false;
  for (const id of ["botStatusMaxBots", "botStatusMaxMinutes"]) { if ($(id)) $(id).disabled = true; }
  const progressBar = $("botStatusScanProgress");
  if (progressBar) { progressBar.hidden = false; progressBar.max = Math.max(1, entries.length); progressBar.value = 0; }

  let completed = 0;
  let changesPreserved = 0;
  let unknownCount = 0;
  let candidateCount = 0;
  let archiveChangedCount = 0;
  let recoveredCount = 0;
  let stillUnavailableCount = 0;
  let restrictedCount = 0;
  let retryLaterCount = 0;
  let recoveryStateDirty = false;
  const recoveredBlockedIds = new Set();
  const availabilityChangedIds = new Set();
  const archiveChangedIds = new Set();
  const checkpointSavedIds = new Set();
  let checkpointCount = 0;
  let finalResultsSaved = true;
  const checkpointEvery = BOT_STATUS_PROGRESS_EVERY;
  async function saveScanCheckpoint(force = false) {
    const pending = [...availabilityChangedIds].filter(id => !checkpointSavedIds.has(id));
    if (!pending.length || (!force && pending.length < checkpointEvery)) return true;
    const availabilityUpdates = Object.fromEntries(pending.map(id => [id, botAvailabilityState.meta?.[id]]).filter(([, v]) => !!v));
    const archiveUpdates = Object.fromEntries(pending.filter(id => archiveChangedIds.has(id)).map(id => [id, botArchiveState.meta?.[id]]).filter(([, v]) => !!v));
    const saved = await runtimeMessage({ type: "DS_BOT_STATUS_PERSIST_DELTA", availabilityUpdates, archiveUpdates });
    if (!saved?.ok) return false;
    pending.forEach(id => checkpointSavedIds.add(id));
    checkpointCount += pending.length;
    return true;
  }
  const metadataDirtyKeys = new Set();
  let terminalMessage = "";
  let timeLimitReached = false;
  let scanStartedAt = 0;
  let scanLastCheckAt = 0;
  let lastProgressPaintAt = 0;
  let adaptiveDelay = botStatusScanDelayMs();
  let consecutiveAccessFailures = 0;
  const deferredAccessIds = [];
  let accessPauseTriggered = false;
  let nextScanIndex = 0;
  let lastQueueCheckpointAt = 0;
  let lastQueueCheckpointCompleted = 0;
  const runStartedAt = Date.now();
  // The persisted queue is written only AFTER its completed records have been
  // saved. If the tab disappears between those writes, a few bots might be
  // checked again, but no completed result is skipped or lost from the queue.
  async function saveScanProgress(nextIndex, { force = false } = {}) {
    const now = Date.now();
    if (!force && completed - lastQueueCheckpointCompleted < BOT_STATUS_PROGRESS_EVERY && now - lastQueueCheckpointAt < BOT_STATUS_PROGRESS_MS) return true;
    if (!(await saveScanCheckpoint(true))) return false;
    // Do not drop bots deferred by the configured limit on a fresh run.
    const pending = botStatusPendingIds(entries, nextIndex, deferredAccessIds, omittedByBotLimit, true);
    // Keep the last completed ID until final persistence has succeeded.
    try {
      const queueSaved = await storageSet({ [BOT_STATUS_PAUSED_QUEUE_KEY]: {
        version: 1, mode, scope, ids: pending, phase: "running",
        updatedAt: now, startedAt: runStartedAt,
        completed, total: entries.length, reason: "Saved progress"
      } });
      if (!queueSaved) return false;
    } catch (error) {
      console.warn("[SpicyChat QoL] Could not save Bot Status resume queue", error);
      return false;
    }
    lastQueueCheckpointAt = now;
    lastQueueCheckpointCompleted = completed;
    return true;
  }
  const runDeadline = maximumRuntimeMs ? runStartedAt + maximumRuntimeMs : Infinity;

  await noteBotStatusRunEvent("bot-status-run-start", { mode, scope, count: entries.length, totalCandidates, maxBots, maxMinutes, speed: String(value("botStatusScanSpeed", "safe")), staleDays });
  try {
    if (!(await saveScanProgress(0, { force: true }))) {
      terminalMessage = "Could not save a recoverable Bot Status scan queue. No checks were started; check extension storage and try again.";
      return;
    }
    const preparingText = mode === "archived"
      ? `Preparing to recheck ${entries.length} archived bot${entries.length === 1 ? "" : "s"}${archivedBlockedSkipped ? ` · ${archivedBlockedSkipped} blocked skipped` : ""}…`
      : mode === "unchecked"
        ? `Preparing to check ${entries.length} unchecked bot${entries.length === 1 ? "" : "s"}…`
        : mode === "stale"
          ? `Preparing to refresh ${entries.length} stale bot${entries.length === 1 ? "" : "s"}…`
          : "Preparing one background Bot Status helper on SpicyChat Home…";
    const initialEta = botStatusDuration(entries.length * botStatusStartingRateMs());
    const queueText = `${preparingText} · initial estimate ~${initialEta}${maxMinutes ? ` · time cap ${maxMinutes}m` : ""}${totalCandidates > entries.length ? ` · ${totalCandidates - entries.length} deferred by bot limit` : ""}`;
    if (status) status.textContent = queueText;
    if (archivedStatus) archivedStatus.textContent = queueText;
    const prepared = await prepareBotStatusHelper({ forceOwnHelper: true, timeoutMs: 17000 });
    if (!prepared?.ok || prepared?.ready === false) {
      terminalMessage = "Could not initialize the Bot Status helper. No bots were changed; try the scan again after SpicyChat Home is signed in.";
      return;
    }

    botAvailabilityState = normalizeBotAvailability(botAvailabilityState);
    botArchiveState = normalizeBotArchive(botArchiveState);
    const metadataIndex = buildBotStatusMetadataScanIndex();
    scanStartedAt = Date.now();

    for (let scanIndex = 0; scanIndex < entries.length; scanIndex += 1) {
      nextScanIndex = scanIndex;
      const entry = entries[scanIndex];
      if (botAvailabilityStopRequested) break;
      if (Date.now() >= runDeadline) { timeLimitReached = true; break; }
      const now = Date.now();
      if ((status || archivedStatus) && (now - lastProgressPaintAt >= 400 || completed === 0)) {
        const perBotMs = completed >= 3 ? Math.max(1, (now - scanStartedAt) / completed) : botStatusStartingRateMs();
        const eta = botStatusDuration((entries.length - completed) * perBotMs);
        const progressText = mode === "archived"
          ? `Rechecking ${completed + 1} / ${entries.length} · ${recoveredCount} restored · ${stillUnavailableCount} still unavailable · ${restrictedCount} private/restricted · ${retryLaterCount} retry later`
          : `Checking ${completed + 1} / ${entries.length}: ${entry.name || entry.id}`;
        const timing = ` · elapsed ${botStatusDuration(now - runStartedAt)} · ETA ~${eta}${maxMinutes ? ` · time left ${botStatusDuration(Math.max(0, runDeadline - now))}` : ""}`;
        if (status) status.textContent = progressText + timing;
        if (archivedStatus) archivedStatus.textContent = progressText + timing;
        lastProgressPaintAt = now;
      }
      const previous = botAvailabilityState?.meta?.[entry.id] || null;
      const rawResult = await checkBotAvailability(
        { ...entry, ...(previous || {}), sources: uniqueClean([...(previous?.sources || []), ...(entry.sources || [])]) },
        { keepHelper: true, forceOwnHelper: true, bulkScan: true, timeoutMs: 17000 }
      );
      if (isBotStatusAccessFailure(rawResult)) {
        // A temporary auth/CORS outage must never replace an earlier
        // confirmed Available/Unavailable result with an Unknown check.
        deferredAccessIds.push(entry.id);
        nextScanIndex = scanIndex + 1;
        // Do not run more checks through a 429 cooldown. Save the queue and
        // let the user explicitly Resume after SpicyChat accepts requests.
        consecutiveAccessFailures = Number(rawResult?.httpStatus) === 429
          ? BOT_STATUS_ACCESS_FAILURE_PAUSE_AT : consecutiveAccessFailures + 1;
        if (consecutiveAccessFailures < BOT_STATUS_ACCESS_FAILURE_PAUSE_AT && !(await saveScanProgress(nextScanIndex))) {
          terminalMessage = "Paused because Bot Status progress could not be saved. Previously saved results and the last checkpoint remain available.";
          break;
        }
        if (consecutiveAccessFailures >= BOT_STATUS_ACCESS_FAILURE_PAUSE_AT) {
          // Commit even a partial result batch BEFORE replacing the saved
          // queue with just the failures and the unprocessed tail.
          if (!(await saveScanCheckpoint(true))) {
            terminalMessage = "Paused on an authentication/network failure, but the latest results could not be saved. The previous durable checkpoint remains recoverable.";
            break;
          }
          const remaining = botStatusPendingIds(entries, scanIndex + 1, deferredAccessIds, omittedByBotLimit);
          const payload = { version: 1, mode, scope, ids: remaining, phase: "paused", completed, total: entries.length, updatedAt: Date.now(), reason: rawResult.reason || `HTTP ${rawResult.httpStatus || 401}` };
          const pausedSaved = await storageSet({ [BOT_STATUS_PAUSED_QUEUE_KEY]: payload });
          if (!pausedSaved) console.warn("[SpicyChat QoL] Could not save paused Bot Status queue; earlier checkpoint remains available");
          accessPauseTriggered = !!pausedSaved;
          terminalMessage = pausedSaved
            ? (Number(rawResult?.httpStatus) === 429
                ? `Paused after SpicyChat rate-limited the scan (HTTP 429). ${remaining.length} bots saved for Resume; existing results were preserved.`
                : `Paused after ${consecutiveAccessFailures} consecutive authentication/network failures. ${remaining.length} unprocessed bots saved for Resume; existing results were preserved.`)
            : "Paused after authentication/network failures. Could not replace the saved resume queue; try resuming the earlier checkpoint.";
          if (status) status.textContent = terminalMessage;
          break;
        }
        if (status) status.textContent = `Temporary auth/network failure ${consecutiveAccessFailures}/${BOT_STATUS_ACCESS_FAILURE_PAUSE_AT}. Skipping ${entry.id} without changing its previous Bot Status result.`;
        await waitForBotStatusPace(Math.max(750,botStatusScanDelayMs()));
        continue;
      }
      consecutiveAccessFailures = 0;
      const result = reconcileBotUpdate(previous, rawResult);
      if (result.updateStatus === "updated" && Number(result.updateDetectedAt || 0) > Number(previous?.updateDetectedAt || 0)) changesPreserved++;
      if (result.status === "unknown") unknownCount++;
      if (Number(result.unavailableEvidenceCount || 0) === 1 && result.status !== "unavailable") candidateCount++;
      if (mode === "archived") {
        if (result.status === "unavailable") stillUnavailableCount++;
        else if (result.status === "restricted") restrictedCount++;
        else if (result.status !== "available") retryLaterCount++;
      }
      botAvailabilityState.meta[result.id] = result;
      availabilityChangedIds.add(result.id);
      if (applyAuthoritativeBotMetadata(rawResult, metadataIndex, metadataDirtyKeys)) botStatusMetadataDirty = true;
      const blockedFromRecovery = metadataIndex?.blocked instanceof Set && metadataIndex.blocked.has(result.id);
      if (rawResult.status === "available" && rawResult.archiveSnapshot && !blockedFromRecovery) {
        const archiveChanged = saveArchiveSnapshotForBot(result.id, rawResult.archiveSnapshot, {
          name: result.name,
          creator: result.creator,
          image: result.image,
          profileUrl: result.profileUrl,
          chatUrls: knownChatUrlsForBot(result.id),
          source: "Bot Status Center"
        });
        if (archiveChanged) { archiveChangedCount++; archiveChangedIds.add(result.id); }
      }
      if (result.status === "available") {
        const restored = restoreUnavailableRecoveryEntryInMemory(result.id, { restoreBlocked: mode !== "archived" });
        if (restored.restored) {
          recoveryStateDirty = true;
          recoveredCount++;
          if (restored.blocked) recoveredBlockedIds.add(result.id);
        }
      }
      completed++;
      nextScanIndex = scanIndex + 1;
      scanLastCheckAt = Date.now();
      if (completed % checkpointEvery === 0 || scanLastCheckAt - lastQueueCheckpointAt >= BOT_STATUS_PROGRESS_MS) {
        if (!await saveScanProgress(nextScanIndex, { force: true })) {
          terminalMessage = `Paused after ${completed} checks: could not save the latest checkpoint. Retrying the final save...`;
          break;
        }
        if (status) status.dataset.dsSavedCheckpoints = String(checkpointCount);
        // Update this lightweight count without rebuilding thousands of cards.
        const summary = $("botAvailabilitySummary");
        if (summary) summary.textContent = `${completed} checked this run · ${checkpointCount} durably checkpointed · ${entries.length - completed} remaining (the full counts refresh when this run ends)`;
      }
      if (progressBar) progressBar.value = completed;

      if (completed < entries.length && Date.now() >= runDeadline) { timeLimitReached = true; break; }
      if (!botAvailabilityStopRequested && completed < entries.length) {
        const http = Number(result.httpStatus || 0);
        const transientServerFailure = http === 429 || http >= 500;
        if (transientServerFailure) adaptiveDelay = Math.min(8000, Math.max(1500, adaptiveDelay * 2));
        else adaptiveDelay = Math.max(botStatusScanDelayMs(), Math.round(adaptiveDelay * 0.85));
        // Time limits are soft for the in-flight check, but never start another
        // check after the deadline or spend longer than necessary pacing.
        const remainingTime = runDeadline - Date.now();
        if (remainingTime <= 0) { timeLimitReached = true; break; }
        await waitForBotStatusPace(Math.min(adaptiveDelay, remainingTime));
      }
    }
  } finally {
    await releaseBotStatusHelper();
    invalidateDuplicateCache();
    if (completed > 0) {
      // Keep the scan's hot in-memory state as-is. Re-normalizing the entire
      // 6k+ availability table and ~4k rich recovery archive here was a major
      // source of the brief "page stopped responding" stalls at scan finish.
      botStatusStorageSelfWriteUntil = Date.now() + 8000;

      if (status) status.textContent = `Saving ${completed} completed Bot Status checks…`;
      await nextOptionsIdleSlice(120);

      // Persist only the IDs this run touched. The service worker merges the
      // delta into the large availability/archive stores so the Options page
      // does not structured-clone and serialize 6k+ status rows / 4k rich bot
      // copies on its UI thread. Fall back to the old full write if messaging
      // ever fails so scan results remain crash-safe.
      // Only flush records not already safely checkpointed.
      const availabilityUpdates = Object.fromEntries(
        [...availabilityChangedIds].filter(id => !checkpointSavedIds.has(id))
          .map(id => [id, botAvailabilityState.meta?.[id]])
          .filter(([, entry]) => !!entry)
      );
      const archiveUpdates = Object.fromEntries(
        [...archiveChangedIds].filter(id => !checkpointSavedIds.has(id))
          .map(id => [id, botArchiveState.meta?.[id]])
          .filter(([, entry]) => !!entry)
      );
      const deltaSaved = Object.keys(availabilityUpdates).length || Object.keys(archiveUpdates).length
        ? await runtimeMessage({ type: "DS_BOT_STATUS_PERSIST_DELTA", availabilityUpdates, archiveUpdates })
        : { ok: true };

      if (!deltaSaved?.ok) {
        const availabilitySaved = await storageSet({ [BOT_AVAILABILITY_KEY]: botAvailabilityState });
        let archiveSaved = true;
        if (archiveChangedCount > 0) {
          await nextOptionsIdleSlice(140);
          archiveSaved = await storageSet({ [BOT_ARCHIVE_KEY]: botArchiveState });
        }
        if (!availabilitySaved || !archiveSaved) finalResultsSaved = false;
      }

      if (botStatusMetadataDirty || recoveryStateDirty) {
        await nextOptionsIdleSlice(140);
        if (status) status.textContent = recoveryStateDirty
          ? "Saving recovered QoL memberships…"
          : "Saving repaired saved-bot details…";
        const payload = botStatusMetadataDirty ? botStatusMetadataStoragePayload(metadataDirtyKeys) : {};
        if (recoveryStateDirty) {
          Object.assign(payload, botStatusRecoveryStoragePayload({ restoreBlockedIds: [...recoveredBlockedIds] }).payload);
          if (recoveredBlockedIds.size) {
            const stored = await storageGet(["settings"]);
            const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
            settings.blockedBotIds = uniqueClean([...(settings.blockedBotIds || []), ...recoveredBlockedIds]).filter(validBotId);
            settings.blockedBotNames = [];
            payload.settings = settings;
          }
        }
        if (!await storageSet(payload)) finalResultsSaved = false;
      }
    }
    // Only advance/clear the resume queue after the final result and recovery
    // writes above complete. On a page crash, the most recent saved queue is
    // still available and may safely recheck the unfinished tail.
    if (!accessPauseTriggered && finalResultsSaved) {
      const outstanding = new Set(botStatusPendingIds(entries, nextScanIndex, deferredAccessIds, omittedByBotLimit));
      try {
        const finalQueueSaved = await storageSet({ [BOT_STATUS_PAUSED_QUEUE_KEY]: outstanding.size ? {
          version: 1, mode, scope, ids: [...outstanding], phase: "paused",
          updatedAt: Date.now(), startedAt: runStartedAt,
          completed, total: entries.length,
          reason: botAvailabilityStopRequested ? "Stopped" : timeLimitReached ? "Time limit" : omittedByBotLimit.length ? "Bot limit reached" : "Retry skipped checks"
        } : null });
        if (!finalQueueSaved) throw new Error("Could not persist Bot Status resume queue");
        if (outstanding.size && !terminalMessage) terminalMessage = `${completed} Bot Status checks saved. ${outstanding.size} still pending; use Resume paused scan.`;
      } catch (error) {
        finalResultsSaved = false;
        terminalMessage = "Could not verify the saved Resume queue. Earlier checkpoints were kept; do not assume the scan is complete.";
        console.warn("[SpicyChat QoL] Could not finalize Bot Status resume queue", error);
      }
    }
    botStatusMetadataDirty = false;
    botAvailabilityScanRunning = false;
    if (scanButton) scanButton.disabled = false;
    if (uncheckedButton) uncheckedButton.disabled = false;
    if (unknownButton) unknownButton.disabled = false;
    if (staleButton) staleButton.disabled = false;
    if (archivedButton) archivedButton.disabled = false;
    if (outsideButton) outsideButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
    for (const id of ["botStatusMaxBots", "botStatusMaxMinutes"]) { if ($(id)) $(id).disabled = false; }
    if (progressBar) { progressBar.value = completed; progressBar.hidden = true; }
    if (completed >= 3 && scanStartedAt) {
      // Exclude bulk persistence and final render time from the saved rate.
      const avg = Math.max(100, Math.round((scanLastCheckAt - scanStartedAt) / completed));
      botStatusPreviousScanRateMs = avg;
      rawStorageSet({ [BOT_STATUS_LAST_RATE_KEY]: avg }).catch(() => {});
    }
    const countLimitReached = maxBots > 0 && totalCandidates > entries.length && completed === entries.length;
    const stopMessage = timeLimitReached
      ? `Time limit reached after ${completed} / ${entries.length} selected checks (${totalCandidates} initially eligible). Completed checks saved.`
      : countLimitReached
        ? `Bot limit reached: checked ${completed} of ${totalCandidates} eligible bots. Completed checks saved.`
        : "";
    const finalStatusText = terminalMessage || (botAvailabilityStopRequested
      ? `Stopped after ${completed} / ${entries.length}. Completed status/update checks were saved.`
      : stopMessage ? stopMessage
      : mode === "archived"
        ? `${completed} checked · ${recoveredCount} restored · ${stillUnavailableCount} still unavailable · ${restrictedCount} private/restricted · ${retryLaterCount} retry later${archivedBlockedSkipped ? ` · ${archivedBlockedSkipped} blocked left alone` : ""}.`
        : `${mode === "unchecked" ? `Finished ${completed} unchecked bot${completed === 1 ? "" : "s"}` : mode === "stale" ? `Refreshed ${completed} stale bot${completed === 1 ? "" : "s"}` : `Finished ${completed} bot${completed === 1 ? "" : "s"}`}. ${changesPreserved ? `${changesPreserved} profile change${changesPreserved === 1 ? "" : "s"} preserved in history. ` : ""}${recoveredCount ? `${recoveredCount} previously unavailable bot${recoveredCount === 1 ? " was" : "s were"} recovered and restored. ` : ""}${candidateCount ? `${candidateCount} unavailable candidate${candidateCount === 1 ? " needs" : "s need"} another check. ` : ""}${unknownCount ? `${unknownCount} temporary/unknown check${unknownCount === 1 ? "" : "s"}; they were left untouched.` : "Status and saved bot details updated."}`);
    const safeStatusText = finalResultsSaved ? finalStatusText
      : `${finalStatusText} Save/queue verification failed; review the last durable checkpoint before running another scan.`;
    if (status) status.textContent = safeStatusText;
    if (archivedStatus) archivedStatus.textContent = safeStatusText;
    await noteBotStatusRunEvent("bot-status-run-complete", {
      mode, scope, completed, requested: entries.length, totalCandidates, maxBots, maxMinutes,
      stopped: !!botAvailabilityStopRequested || timeLimitReached || countLimitReached,
      stopReason: botAvailabilityStopRequested ? "manual" : timeLimitReached ? "time" : countLimitReached ? "count" : "complete",
      changesPreserved, unknownCount, candidateCount, archiveChangedCount, recoveredCount,
      stillUnavailableCount, restrictedCount, retryLaterCount, archivedBlockedSkipped,
      durationMs: Date.now() - runStartedAt
    });
    botAvailabilityStopRequested = false;
    await refreshBotStatusPauseButton();
    // The persisted resume queue remains authoritative; never use a guessed
    // value to label an interrupted or limited scan as complete.
    const pauseState = await botStatusPausedQueue();
    const pendingCount = Array.isArray(pauseState?.ids) ? pauseState.ids.length : 0;
    const feedback = {
      at: Date.now(), mode, checked: completed,
      pending: pendingCount,
      deferred: deferredAccessIds.length,
      changed: changesPreserved,
      recovered: recoveredCount,
      unknown: unknownCount,
      saveVerified: finalResultsSaved
    };
    await storageSet({ [BOT_STATUS_LAST_RUN_FEEDBACK_KEY]: feedback });
    const feedbackEl = $("botStatusLastRunSummary");
    if (feedbackEl) feedbackEl.textContent = formatBotStatusLastRunFeedback(feedback);

    // Auto-clean only the blocked IDs touched by this scan, and only after an
    // exact remotely-preserved archive fingerprint is confirmed. Keep this as
    // idle/background work so scan completion stays responsive.
    const blockedCleanupCandidateIds = [...availabilityChangedIds];
    if (blockedCleanupCandidateIds.length) {
      setTimeout(() => {
        nextOptionsIdleSlice(500)
          .then(() => cleanupArchivedBlockedBots({ automatic: true, maxItems: 25, candidateIds: blockedCleanupCandidateIds }))
          .catch(() => {});
      }, 350);
    }

    // Paint the light Bot Status view first. Recovery/archive managers and
    // storage-size accounting are deferred so they cannot all rebuild in the
    // same task immediately after a large scan commits.
    renderBotAvailability({ skipRecoveryRerender: true });
    setTimeout(() => {
      nextOptionsIdleSlice(240).then(() => {
        renderSavedBotInfo();
        renderDeletedSavedBots();
        refreshArchiveTransferUi().catch(() => {});
        refreshStorageUsageIfVisible();
      }).catch(() => {});
    }, 120);
  }
}

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

function renderSavedBotInfo(renderOptions = {}) {
  const diagStarted = optionsDiagnosticState.active && typeof performance !== "undefined" ? performance.now() : 0;
  const host = $("savedBotInfoManager");
  if (!host) return;
  const query = String($("savedBotInfoSearch")?.value || savedBotInfoUiState.query || "").toLowerCase().replace(/\s+/g, " ").trim();
  savedBotInfoUiState.query = query;
  const archives = normalizeBotArchive(botArchiveState).meta;
  const availability = normalizeBotAvailability(botAvailabilityState).meta;
  const sameNameCollisions = renderOptions?.sameNameCollisions instanceof Map
    ? renderOptions.sameNameCollisions
    : botSameNameCollisionIndex();
  const blockedIds = new Set(normalizeBotStore(blockedState).ids);
  const visibleArchives = Object.values(archives).filter(archive => !blockedIds.has(archive.id));
  const items = visibleArchives
    .filter(archive => {
      if (!query) return true;
      const fields = archive.fields || {};
      return `${archive.id} ${archive.name || ""} ${archive.creator || ""} ${fields.title || ""} ${fields.description || ""}`.toLowerCase().includes(query);
    })
    .sort((a, b) => Number(b.lastSavedAt || 0) - Number(a.lastSavedAt || 0));
  const total = visibleArchives.length;
  const blockedHidden = Math.max(0, Object.keys(archives).length - total);
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
  host.replaceChildren(...nodes);
  host.querySelectorAll(".bot-archive-copy").forEach(button => button.addEventListener("click", async () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = normalizeBotArchive(botArchiveState).meta[id];
    if (!archive) return;
    try { await navigator.clipboard.writeText(botArchiveReadableText(archive)); showSettingsToast("Saved bot copy copied to clipboard."); } catch {}
  }));
  host.querySelectorAll(".bot-archive-portable").forEach(button => button.addEventListener("click", () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = normalizeBotArchive(botArchiveState).meta[id];
    if (archive) downloadPortableBotProfile(archive);
  }));
  host.querySelectorAll(".bot-archive-download").forEach(button => button.addEventListener("click", () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = normalizeBotArchive(botArchiveState).meta[id];
    if (archive) downloadBotArchiveEntry(archive);
  }));
  host.querySelectorAll(".bot-archive-delete").forEach(button => button.addEventListener("click", async () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = normalizeBotArchive(botArchiveState).meta[id];
    if (!archive || !confirm(`Delete the saved local recovery copy of ${archive.name || id}?`)) return;
    delete botArchiveState.meta[id];
    botArchiveState = normalizeBotArchive(botArchiveState);
    await storageSet({ [BOT_ARCHIVE_KEY]: botArchiveState });
    renderSavedBotInfo();
    renderBotAvailability();
  }));
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

function deletedSavedBotEntries() {
  const availability = normalizeBotAvailability(botAvailabilityState).meta;
  const archives = normalizeBotArchive(botArchiveState).meta;
  const blockedIds = new Set(normalizeBotStore(blockedState).ids.map(id => String(id || "").toLowerCase()));
  const query = String($("deletedSavedBotSearch")?.value || deletedSavedBotsUiState.query || "")
    .toLowerCase().replace(/\s+/g, " ").trim();
  deletedSavedBotsUiState.query = query;
  return Object.values(availability)
    .filter(entry => isConfirmedUnavailableBotStatus(entry) && archives[entry.id] && !blockedIds.has(String(entry.id || "").toLowerCase()))
    .map(entry => ({ ...entry, archive: archives[entry.id] }))
    .filter(entry => {
      if (!query) return true;
      const fields = entry.archive?.fields || {};
      return `${entry.id} ${entry.name || ""} ${entry.creator || ""} ${fields.name || ""} ${fields.title || ""} ${fields.description || ""} ${fields.tags || ""}`.toLowerCase().includes(query);
    })
    .sort((a, b) => Number(b.checkedAt || 0) - Number(a.checkedAt || 0) || String(a.archive?.name || a.name || a.id).localeCompare(String(b.archive?.name || b.name || b.id)));
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
  if (!host) return;
  const sameNameCollisions = renderOptions?.sameNameCollisions instanceof Map
    ? renderOptions.sameNameCollisions
    : botSameNameCollisionIndex();
  const all = deletedSavedBotEntries()
    .map(entry => ({ ...entry, sameNameMatches: sameNameCollisions.get(entry.id) || [] }));
  const archives = normalizeBotArchive(botArchiveState).meta;
  const blockedIds = new Set(normalizeBotStore(blockedState).ids.map(id => String(id || "").toLowerCase()));
  const totalRecoverable = Object.values(normalizeBotAvailability(botAvailabilityState).meta)
    .filter(entry => isConfirmedUnavailableBotStatus(entry) && archives[entry.id] && !blockedIds.has(String(entry.id || "").toLowerCase())).length;
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
  host.replaceChildren(...shown.map(deletedSavedBotCard));

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
    const archive = normalizeBotArchive(botArchiveState).meta[id];
    if (!archive) return;
    try { await navigator.clipboard.writeText(botArchiveReadableText(archive)); showSettingsToast("Saved bot copy copied to clipboard."); } catch {}
  }));
  host.querySelectorAll(".bot-archive-portable").forEach(button => button.addEventListener("click", () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = normalizeBotArchive(botArchiveState).meta[id];
    if (archive) downloadPortableBotProfile(archive);
  }));
  host.querySelectorAll(".bot-archive-download").forEach(button => button.addEventListener("click", () => {
    const id = button.closest(".bot-manager-card")?.dataset.id || "";
    const archive = normalizeBotArchive(botArchiveState).meta[id];
    if (archive) downloadBotArchiveEntry(archive);
  }));
  if (diagStarted) optionsDiag("options-saved-bots", "render", { manager: "deleted-recovery", total: totalRecoverable, shown: shown.length, matching: all.length, durationMs: Math.round((performance.now() - diagStarted) * 10) / 10 }, { critical: (performance.now() - diagStarted) >= 200 });
}

async function clearBotAvailabilityResults() {
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
  const count = Object.keys(normalizeBotArchive(botArchiveState).meta).length;
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
  // On-demand worker counters (no bot IDs or private card text). Existing
  // scan pacing/stop/resume controls remain unchanged.
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
      const label = `Requests ${result.requested || 0} · checked ${result.checked || 0} · cached ${result.cached || 0} · deduplicated ${result.coalesced || 0} · failed ${result.failed || 0}` +
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
  $("scanBotAvailability")?.addEventListener("click", () => runBotAvailabilityScan({ mode: "all" }));
  $("scanUncheckedBotAvailability")?.addEventListener("click", () => runBotAvailabilityScan({ mode: "unchecked" }));
  $("scanUnknownBotAvailability")?.addEventListener("click", () => runBotAvailabilityScan({ mode: "unknown" }));
  $("resumePausedBotAvailability")?.addEventListener("click", () => runBotAvailabilityScan({ resume: true }));
  void refreshBotStatusPauseButton().then(() => renderBotAvailability({ skipRecoveryRerender: true })).catch(() => {});
  $("scanUnmonitoredBotAvailability")?.addEventListener("click", () => runBotAvailabilityScan({ mode: "outside" }));
  $("scanStaleBotAvailability")?.addEventListener("click", () => runBotAvailabilityScan({ mode: "stale" }));
  $("recheckDeletedSavedBots")?.addEventListener("click", () => runBotAvailabilityScan({ mode: "archived" }));
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
      const archiveCount = Object.keys(normalizeBotArchive(botArchiveState).meta).length;
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
  refreshBotStatusLastRunFeedback().catch(() => {});
  storageGet([BOT_STATUS_LAST_RATE_KEY]).then(result => {
    const rate = Number(result?.[BOT_STATUS_LAST_RATE_KEY] || 0);
    if (rate >= 100 && rate <= 120000) botStatusPreviousScanRateMs = rate;
    updateBotStatusScanEstimate();
  }).catch(() => {});
  updateBotStatusScanEstimate();
  $("botStatusStaleDays")?.addEventListener("change", () => { save().catch(() => {}); renderBotAvailability(); });
  $("botAvailabilityScope")?.addEventListener("change", () => {
    invalidateDuplicateCache();
    botAvailabilityUiState.visible = 10;
    botAvailabilityUiState.collapsed = true;
    renderBotAvailability();
  });
  $("botAvailabilityStatusFilter")?.addEventListener("change", async event => {
    botAvailabilityUiState.status = event.target.value || "all";
    botAvailabilityUiState.visible = 10;
    botAvailabilityUiState.collapsed = true;
    if (BOT_DUPLICATE_LEVELS.has(botAvailabilityUiState.status) && !botDuplicateCacheReady) {
      const scope = String($("botAvailabilityScope")?.value || "all");
      await nextUiFrame();
      const availabilitySnapshot = normalizeBotAvailability(botAvailabilityState);
      const base = botStatusCenterBaseEntries(scope);
      botDuplicateMatchesCache = computeBotDuplicateMatches(base);
      botDuplicateCacheScope = scope;
      botDuplicateCacheReady = true;
      botAvailabilityState = availabilitySnapshot;
      renderBotAvailability({ baseEntries: base, skipRecoveryRerender: true });
      return;
    }
    renderBotAvailability();
  });
  const renderAvailabilitySearch = debounceCallback(event => {
    botAvailabilityUiState.query = event?.target?.value || $("botAvailabilitySearch")?.value || "";
    botAvailabilityUiState.visible = 10;
    botAvailabilityUiState.collapsed = true;
    renderBotAvailability();
  });
  $("botAvailabilitySearch")?.addEventListener("input", renderAvailabilitySearch);
  $("botAvailabilityShowMore")?.addEventListener("click", () => {
    botAvailabilityUiState.collapsed = true;
    botAvailabilityUiState.visible = Math.min(5000, Number(botAvailabilityUiState.visible || 10) + 10);
    renderBotAvailability();
  });
  $("botAvailabilityShowLess")?.addEventListener("click", () => {
    botAvailabilityUiState.visible = 10;
    botAvailabilityUiState.collapsed = true;
    renderBotAvailability();
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
    renderBotAvailability();
  });
}
