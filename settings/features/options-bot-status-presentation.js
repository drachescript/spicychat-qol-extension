// Bot Status identity, avatar lookup, status cards and status list rendering.
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

// A bot's UUID is not generally the same as its avatar file UUID. Keep source
// provenance explicit: saved/observed URL, supplied CDN URL, or an unverified guess.
function botAvatarLookupId(raw) {
  const input = String(raw || "").trim();
  const match = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const id = match ? match[0].toLowerCase() : "";
  return id && BOT_ID_RE.test(id) ? id : "";
}

function botAvatarDirectCdnUrl(input) {
  try {
    const url = new URL(String(input || "").trim());
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "cdn.nd-api.com" ||
        !/^\/avatars\/[0-9a-f-]{36}\.(?:gif|png|webp|jpe?g)$/i.test(url.pathname)) return "";
    if (!BOT_ID_RE.test(url.pathname.match(/[0-9a-f-]{36}/i)?.[0] || "")) return "";
    return url.href;
  } catch { return ""; }
}

function botAvatarObservedUrl(value) {
  const url = canonicalBotImage(value);
  if (!/^https:\/\//i.test(url) || /(?:fallback[-_]?avatar|default[-_]?avatar|placeholder|no[-_]?avatar)/i.test(url)) return "";
  return url;
}

// Consult only data that QoL already holds. No requests, image downloads,
// storage writes or bot scans are started by the lookup.
function botAvatarKnownSource(id) {
  const archive = normalizeBotArchive(botArchiveState).meta[id] || {};
  const status = normalizeBotAvailability(botAvailabilityState).meta[id] || {};
  const recovered = normalizeBotUnavailableRecovery(botUnavailableRecoveryState).meta[id] || {};
  const savedStores = [
    ["Favorites", favoriteBotState?.meta?.[id]?.image],
    ["Later", laterBotState?.meta?.[id]?.image],
    ["Blocked", blockedState?.meta?.[id]?.image],
    ["Not Interested", notInterestedState?.meta?.[id]?.image],
    ["Opened", openedChatMetaState?.[id]?.image],
    ["Bot Organizer", botOrganizationState?.meta?.[id]?.image],
    ["Recently Seen", recentlySeenBotState?.entries?.find(item => item?.id === id)?.image],
    ["Creator Watch", creatorBotWatchState?.recent?.find(item => item?.id === id)?.image]
  ];
  const candidates = [
    ["Saved bot copy", archive.fields?.image],
    ["Saved bot copy", archive.image],
    ["Bot Status", status.image],
    ["Unavailable bot details", recovered.image],
    ...savedStores,
    ...[...(Array.isArray(archive.revisions) ? archive.revisions : [])].reverse()
      .map(item => ["Older saved bot copy", item?.fields?.image || item?.image])
  ];
  for (const [source, raw] of candidates) {
    const url = botAvatarObservedUrl(raw);
    if (url) return { url, saved: true, source, type: "known" };
  }
  return null;
}

function botAvatarLookupUrl(id, extension = "gif") {
  if (!BOT_ID_RE.test(String(id || ""))) return { url: "", saved: false, source: "", type: "invalid" };
  const known = botAvatarKnownSource(id);
  if (known) return known;
  const ext = ["gif", "png", "webp", "jpg"].includes(extension) ? extension : "gif";
  return {
    url: `https://cdn.nd-api.com/avatars/${id}.${ext}?class=avatar256x256`,
    saved: false, source: "Generated from bot ID", type: "guess"
  };
}

function botAvatarResolveInput(input, extension = "gif") {
  const direct = botAvatarDirectCdnUrl(input);
  if (direct) return { url: direct, saved: false, source: "Pasted CDN link", type: "provided" };
  return botAvatarLookupUrl(botAvatarLookupId(input), extension);
}

function setupBotAvatarLookup() {
  const input = $("botAvatarLookupInput");
  const format = $("botAvatarLookupFormat");
  const output = $("botAvatarLookupResult");
  const status = $("botAvatarLookupStatus");
  if (!input || !format || !output || !status) return;
  const update = () => {
    const result = botAvatarResolveInput(input.value, format.value);
    format.disabled = result.type === "known" || result.type === "provided";
    if (!result.url) {
      output.hidden = true;
      output.removeAttribute("href");
      output.textContent = "";
      status.textContent = input.value.trim() ? "Enter a valid bot UUID, bot URL or CDN avatar URL." : "";
      return "";
    }
    output.href = result.url;
    output.textContent = result.url;
    output.hidden = false;
    if (result.type === "known") {
      status.textContent = `Known avatar URL from ${result.source}. The original file may no longer be accessible; QoL has not checked it live.`;
    } else if (result.type === "provided") {
      status.textContent = "Original CDN URL supplied by you. QoL has not checked whether it is still accessible.";
    } else {
      status.textContent = "Guessed URL from bot ID — NOT a recovered image. Avatar file IDs can differ, and the CDN may return AccessDenied. Try another format if needed.";
    }
    return result.url;
  };
  input.addEventListener("input", update);
  format.addEventListener("change", update);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      const url = update();
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    }
  });
  $("botAvatarLookupOpen")?.addEventListener("click", () => {
    const url = update();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });
  $("botAvatarLookupCopy")?.addEventListener("click", async () => {
    const url = update();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showSettingsToast("Avatar link copied.");
    } catch {
      status.textContent = "Could not copy the link automatically; select and copy the link below.";
    }
  });
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
  if (cardImage) {
    actions.appendChild(makeElement("a", { text: "Open avatar", attrs: { href: cardImage, target: "_blank", rel: "noopener noreferrer", title: "Open the last known avatar URL (no image is saved by QoL)" } }));
    const copyAvatar = makeElement("button", { text: "Copy avatar link", attrs: { type: "button", title: "Copy this saved avatar URL without downloading the image" } });
    copyAvatar.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(cardImage);
        showSettingsToast("Avatar link copied.");
      } catch { showSettingsToast("Could not copy avatar link automatically; open the link to copy it."); }
    });
    actions.appendChild(copyAvatar);
  }
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

