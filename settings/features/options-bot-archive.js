// Feature-owned options helpers: bot-archive. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeBotStore(store) {
  const raw = store && typeof store === "object" ? store : {};

  return {
    ids: uniqueClean(Array.isArray(raw.ids) ? raw.ids : []),
    names: uniqueClean(Array.isArray(raw.names) ? raw.names : []),
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {}
  };
}

function normalizeQuickDislikeHistory(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bots = source.bots && typeof source.bots === "object" ? source.bots : {};
  const normalized = {};
  Object.entries(bots).forEach(([id, value]) => {
    const botId = String(id || "").trim();
    const status = String(value?.status || "");
    if (!botId || !["disliked", "already-disliked", "already-rated-or-unavailable", "unavailable-private-or-deleted", "unavailable-creator-blocked", "dislike-event-pending"].includes(status)) return;
    normalized[botId] = {
      status,
      name: String(value?.name || "").slice(0, 160),
      handledAt: Number(value?.handledAt || value?.at || 0) || 0,
      crossHandledBy: value?.crossHandledBy === "less-like" ? "less-like" : "",
      ratingSource: ["dislike", "less-like"].includes(value?.ratingSource) ? value.ratingSource : "",
      ratingAt: Number(value?.ratingAt || 0) || 0,
      requestSent: value?.requestSent === true,
      nativeEventConfirmed: value?.nativeEventConfirmed === true
    };
  });
  return { version: 1, bots: normalized };
}

// A confirmed Bot Status result is enough to avoid a pointless feedback request.
// This is a derived, non-persistent skip: blocked IDs and their archive remain intact,
// and a later confirmed recovery automatically makes the ID eligible again.
function blockedFeedbackConfirmedUnavailable(id) {
  const botId = String(id || "").trim().toLowerCase();
  const entry = botAvailabilityState?.meta?.[botId];
  if (entry?.status === "unavailable") return entry;
  // Less Like's own completed unavailable result is usable evidence too.
  // Never preserve it as a permanent block after a newer confirmed recovery.
  const recorded = quickLessLikeHistoryState?.bots?.[botId];
  if (recorded?.status !== "unavailable") return null;
  if (entry?.status === "available" && Number(entry.checkedAt || 0) > Number(recorded.handledAt || 0)) return null;
  return { status: "unavailable", checkedAt: Number(recorded.handledAt || 0),
    reason: "Earlier Less Like confirmed unavailable", fromLessLike: true };
}

function blockedFeedbackRatedByLessLike(id) {
  const entry = quickLessLikeHistoryState?.bots?.[String(id || "").trim().toLowerCase()];
  return entry?.status === "less-liked" && entry?.stage !== "cross-feedback-dedupe" ? entry : null;
}

function quickDislikeHistoryEntry(id) {
  const botId = String(id || "").trim();
  if (!botId) return null;
  const entry = quickDislikeHistoryState?.bots?.[botId] || null;
  // A prior unavailable result must not block feedback after confirmed recovery.
  if (entry?.status === "unavailable-private-or-deleted" &&
      botAvailabilityState?.meta?.[botId]?.status === "available" &&
      Number(botAvailabilityState.meta[botId].checkedAt || 0) > Number(entry.handledAt || 0)) return null;
  if (!entry) {
    const unavailable = blockedFeedbackConfirmedUnavailable(botId);
    return unavailable ? { status: "unavailable-private-or-deleted", fromBotStatus: true,
      handledAt: Number(unavailable.checkedAt || 0), name: String(unavailable.name || "") } : null;
  }
  // Legacy "disliked" and "already-disliked" entries only prove a Recombee
  // rating. Do not count them as completed native chat Dislikes without the event.
  if (["disliked", "already-disliked"].includes(entry.status) && entry.nativeEventConfirmed !== true) return null;
  if (entry.status === "dislike-event-pending") return null;
  return entry;
}

function quickDislikeHistoryLabel(entry) {
  if (!entry) return "";
  if (entry.status === "disliked") return entry.nativeEventConfirmed ? "Dislike confirmed (rating + event)" : "Legacy rating only (Dislike unverified)";
  if (entry.status === "already-disliked") return "Already disliked (source not recorded)";
  if (entry.status === "already-rated-or-unavailable") return "Rating already set / unavailable";
  if (entry.status === "unavailable-private-or-deleted") return entry.fromBotStatus
    ? "Confirmed unavailable in Bot Status · no rating needed"
    : "Private/deleted/404 · cannot rate";
  if (entry.status === "unavailable-creator-blocked") return "Creator blocked · cannot rate";
  return "Handled";
}

function mergeQuickDislikeHistories(current, incoming) {
  const left = normalizeQuickDislikeHistory(current);
  const right = normalizeQuickDislikeHistory(incoming);
  const bots = { ...left.bots };
  Object.entries(right.bots).forEach(([id, entry]) => {
    const previous = bots[id];
    if (!previous || Number(entry.handledAt || 0) >= Number(previous.handledAt || 0)) bots[id] = entry;
  });
  return { version: 1, bots };
}

function normalizeQuickLessLikeHistory(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bots = source.bots && typeof source.bots === "object" ? source.bots : {};
  const normalized = {};
  Object.entries(bots).forEach(([id, value]) => {
    const botId = String(id || "").trim();
    const status = String(value?.status || "");
    if (!botId || !["less-liked", "unavailable"].includes(status)) return;
    normalized[botId] = {
      status,
      name: String(value?.name || "").slice(0, 160),
      handledAt: Number(value?.handledAt || value?.at || 0) || 0,
      stage: String(value?.stage || "").slice(0, 80),
      reason: String(value?.reason || "").slice(0, 300),
      httpStatus: Number(value?.httpStatus || 0) || 0
    };
  });
  return { version: 1, bots: normalized };
}

function quickLessLikeHistoryEntry(id) {
  const botId = String(id || "").trim().toLowerCase();
  if (!botId) return null;
  const entry = quickLessLikeHistoryState?.bots?.[botId] || null;
  if (entry?.status === "less-liked" && entry?.stage === "cross-feedback-dedupe") return null;
  if (entry?.status === "unavailable" && botAvailabilityState?.meta?.[botId]?.status === "available" &&
      Number(botAvailabilityState.meta[botId].checkedAt || 0) > Number(entry.handledAt || 0)) return null;
  if (entry) return entry;
  const unavailable = blockedFeedbackConfirmedUnavailable(botId);
  return unavailable ? { status: "unavailable", fromBotStatus: true,
    handledAt: Number(unavailable.checkedAt || 0), name: String(unavailable.name || "") } : null;
}

function quickLessLikeHistoryLabel(entry) {
  if (!entry) return "";
  if (entry.status === "less-liked") return "Stop recommending sent";
  if (entry.status === "unavailable") return entry.fromBotStatus
    ? "Confirmed unavailable in Bot Status · no rating needed"
    : "Unavailable / deleted · skipped";
  return "Handled";
}

function mergeQuickLessLikeHistories(current, incoming) {
  const left = normalizeQuickLessLikeHistory(current);
  const right = normalizeQuickLessLikeHistory(incoming);
  const bots = { ...left.bots };
  Object.entries(right.bots).forEach(([id, entry]) => {
    const previous = bots[id];
    if (!previous || Number(entry.handledAt || 0) >= Number(previous.handledAt || 0)) bots[id] = entry;
  });
  return { version: 1, bots };
}

function normalizeQuickDislikeBulkState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const status = ["idle", "running", "paused", "completed", "completed-with-failures", "interrupted"].includes(String(source.status || ""))
    ? String(source.status)
    : "idle";
  return {
    version: 1,
    status,
    pendingIds: uniqueClean(Array.isArray(source.pendingIds) ? source.pendingIds : []),
    failedIds: uniqueClean(Array.isArray(source.failedIds) ? source.failedIds : []),
    startedAt: Number(source.startedAt || 0) || 0,
    updatedAt: Number(source.updatedAt || 0) || 0,
    currentId: String(source.currentId || "").trim(),
    lastMode: ["remaining", "resume", "failed", "selected"].includes(String(source.lastMode || "")) ? String(source.lastMode) : "remaining",
    runId: String(source.runId || "").slice(0, 120),
    stopRequested: !!source.stopRequested
  };
}

function normalizeQuickLessLikeBulkState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const status = ["idle", "running", "paused", "completed", "completed-with-failures", "interrupted"].includes(String(source.status || ""))
    ? String(source.status)
    : "idle";
  const pacing = source.pacing && typeof source.pacing === "object" ? source.pacing : {};
  return {
    version: 2,
    status,
    pendingIds: uniqueClean(Array.isArray(source.pendingIds) ? source.pendingIds : []),
    failedIds: uniqueClean(Array.isArray(source.failedIds) ? source.failedIds : []),
    failureMeta: Object.fromEntries(Object.entries(source.failureMeta && typeof source.failureMeta === "object" ? source.failureMeta : {})
      .filter(([id]) => validBotId(id))
      .map(([id, value]) => [id, {
        status: String(value?.status || "failed").slice(0, 80),
        stage: String(value?.stage || "").slice(0, 80),
        reason: String(value?.reason || value?.error || "").slice(0, 300),
        httpStatus: Number(value?.httpStatus || 0) || 0,
        tokenAttempts: Number(value?.tokenAttempts || 0) || 0,
        networkAttempts: Number(value?.networkAttempts || 0) || 0,
        availabilityNetworkAttempts: Number(value?.availabilityNetworkAttempts || 0) || 0,
        availabilityConfirmed: !!value?.availabilityConfirmed,
        tokenSource: String(value?.tokenSource || "").slice(0, 80),
        requestSent: !!value?.requestSent,
        retryable: !!value?.retryable,
        retryAfterMs: Math.max(0, Number(value?.retryAfterMs || 0) || 0),
        throttleSignal: String(value?.throttleSignal || "").slice(0, 40),
        networkAmbiguous: !!value?.networkAmbiguous,
        feedbackTabsTried: Number(value?.feedbackTabsTried || 0) || 0,
        nativeSignedSamples: Number(value?.nativeSignedSamples || 0) || 0,
        workerRecovered: !!value?.workerRecovered,
        at: Number(value?.at || 0) || 0
      }])),
    startedAt: Number(source.startedAt || 0) || 0,
    updatedAt: Number(source.updatedAt || 0) || 0,
    currentId: String(source.currentId || "").trim(),
    lastMode: ["remaining", "resume", "failed", "selected"].includes(String(source.lastMode || "")) ? String(source.lastMode) : "remaining",
    runId: String(source.runId || "").slice(0, 120),
    jobId: String(source.jobId || source.runId || "").slice(0, 120),
    stopRequested: !!source.stopRequested,
    totalBots: Math.max(0, Number(source.totalBots || 0) || 0),
    nextQueuePosition: Math.max(0, Number(source.nextQueuePosition || 0) || 0),
    attempted: Math.max(0, Number(source.attempted || 0) || 0),
    succeeded: Math.max(0, Number(source.succeeded || 0) || 0),
    failedCount: Math.max(0, Number(source.failedCount || 0) || 0),
    retried: Math.max(0, Number(source.retried || 0) || 0),
    skipped: Math.max(0, Number(source.skipped || 0) || 0),
    pacing: {
      intervalMs: Math.max(0, Number(pacing.intervalMs || 0) || 0),
      successStreak: Math.max(0, Number(pacing.successStreak || 0) || 0),
      backoffLevel: Math.max(0, Number(pacing.backoffLevel || 0) || 0),
      state: String(pacing.state || "").slice(0, 80),
      http429: Math.max(0, Number(pacing.http429 || 0) || 0),
      http5xx: Math.max(0, Number(pacing.http5xx || 0) || 0),
      recentMedianMs: Math.max(0, Number(pacing.recentMedianMs || 0) || 0)
    }
  };
}

async function persistQuickLessLikeBulkState(nextState) {
  quickLessLikeBulkState = normalizeQuickLessLikeBulkState(nextState);
  quickLessLikeBulkState.updatedAt = Date.now();
  await storageSet({ [QUICK_LESS_LIKE_BULK_STATE_KEY]: quickLessLikeBulkState });
  updateBlockedLessLikeResumeControls();
  return quickLessLikeBulkState;
}

async function persistQuickDislikeBulkState(nextState) {
  quickDislikeBulkState = normalizeQuickDislikeBulkState(nextState);
  quickDislikeBulkState.updatedAt = Date.now();
  await storageSet({ [QUICK_DISLIKE_BULK_STATE_KEY]: quickDislikeBulkState });
  updateBlockedBulkResumeControls();
  return quickDislikeBulkState;
}

function cleanBotSnapshotText(value, max = 6000) {
  if (Array.isArray(value)) {
    return uniqueClean(value.map(item => typeof item === "string" ? item : item?.name || item?.label || item?.title || ""))
      .sort((a, b) => a.localeCompare(b))
      .join(", ")
      .slice(0, max);
  }
  if (value && typeof value === "object") {
    const nested = value.name || value.username || value.handle || value.title || value.url || value.src || "";
    return cleanBotSnapshotText(nested, max);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function canonicalBotImage(value) {
  const text = cleanBotSnapshotText(value, 2000);
  if (!text) return "";
  const cleanText = text.replace(/[?#].*$/, "");
  const avatarPath = cleanText
    .replace(/^https?:\/\/(?:www\.)?spicychat\.ai\/avatars\//i, "avatars/")
    .replace(/^https?:\/\/cdn\.nd-api\.com\/avatars\//i, "avatars/")
    .replace(/^\/+/, "");
  if (/^avatars\//i.test(avatarPath)) {
    return `https://cdn.nd-api.com/${avatarPath}`;
  }
  try {
    const url = new URL(text, "https://spicychat.ai");
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return cleanText;
  }
}

function canonicalBotCreator(value) {
  return cleanBotSnapshotText(value, 500).replace(/^@+\s*/, "");
}

function cleanBotArchiveText(value, max = 14000) {
  if (Array.isArray(value)) {
    return uniqueClean(value.map(item => cleanBotArchiveText(item, 1000)))
      .filter(Boolean)
      .join(", ")
      .slice(0, max);
  }
  if (value && typeof value === "object") {
    const nested = value.name || value.username || value.handle || value.title || value.url || value.src || "";
    return cleanBotArchiveText(nested, max);
  }
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function normalizeBotVersionTags(value) {
  const values = String(value || "")
    .split(/\s*,\s*/g)
    .map(tag => cleanBotArchiveText(tag, 120))
    .filter(Boolean);
  const deduped = [...new Map(values.map(tag => [tag.toLocaleLowerCase(), tag])).values()];
  deduped.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return deduped.join(", ");
}

function normalizeBotVersionContent(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const content = {};
  for (const field of BOT_VERSION_FIELDS) {
    if (field === "image") content[field] = canonicalBotImage(source[field] || "");
    else if (field === "tags") content[field] = normalizeBotVersionTags(source[field]);
    else content[field] = cleanBotArchiveText(source[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
  }
  const lorebookRaw = source.lorebook && typeof source.lorebook === "object" ? source.lorebook : {};
  content.lorebook = {
    id: cleanBotArchiveText(lorebookRaw.id || source.lorebookId || "", 240),
    name: cleanBotArchiveText(lorebookRaw.name || source.lorebookName || "", 500)
  };
  return content;
}

function normalizeBotVersionState(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    visibility: cleanBotArchiveText(source.visibility || "", 80),
    moderation: cleanBotArchiveText(source.moderation || "", 80),
    capturedAt: Number(source.capturedAt) || 0
  };
}

function normalizeBotVersion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const content = normalizeBotVersionContent(raw.content || raw.fields || raw);
  const hasContent = BOT_VERSION_FIELDS.some(field => String(content[field] || "")) || content.lorebook.id || content.lorebook.name;
  if (!hasContent) return null;
  return {
    id: cleanBotArchiveText(raw.id || "", 120),
    number: Math.max(1, Number(raw.number) || 1),
    capturedAt: Number(raw.capturedAt) || Number(raw.savedAt) || 0,
    source: cleanBotArchiveText(raw.source || "", 120),
    label: cleanBotArchiveText(raw.label || "", 160),
    content,
    state: normalizeBotVersionState(raw.state),
    changedFields: Array.isArray(raw.changedFields)
      ? [...new Set(raw.changedFields.map(field => cleanBotArchiveText(field, 80)).filter(Boolean))]
      : []
  };
}

function normalizeBotArchiveRevision(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rawFields = raw.fields && typeof raw.fields === "object" ? raw.fields : raw;
  const fields = {};
  for (const field of BOT_ARCHIVE_FIELDS) {
    fields[field] = field === "image"
      ? canonicalBotImage(rawFields[field] || raw.image || "")
      : cleanBotArchiveText(rawFields[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
  }
  const coverage = BOT_ARCHIVE_FIELDS.filter(field => fields[field]);
  if (!coverage.length) return null;
  return {
    id: cleanBotArchiveText(raw.id || "", 120),
    capturedAt: Number(raw.capturedAt) || Number(raw.savedAt) || 0,
    source: cleanBotArchiveText(raw.source || "", 120),
    label: cleanBotArchiveText(raw.label || "", 160),
    kind: cleanBotArchiveText(raw.kind || "auto", 40) || "auto",
    fields,
    coverage
  };
}

function normalizeBotManualBackup(raw) {
  const backup = normalizeBotArchiveRevision(raw);
  if (!backup) return null;
  return {
    ...backup,
    id: backup.id || `manual-${backup.capturedAt || Date.now()}`,
    kind: "manual",
    label: backup.label || "Manual backup"
  };
}

function normalizeBotArchive(value) {
  const source = value && typeof value === "object" ? value : {};
  const rawMeta = source.meta && typeof source.meta === "object" ? source.meta : source;
  const meta = {};
  for (const [rawId, raw] of Object.entries(rawMeta || {})) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(rawId || raw.id || "").trim();
    if (!id) continue;
    const rawFields = raw.fields && typeof raw.fields === "object" ? raw.fields : raw;
    const fields = {};
    for (const field of BOT_ARCHIVE_FIELDS) {
      fields[field] = field === "image"
        ? canonicalBotImage(rawFields[field] || raw.image || "")
        : cleanBotArchiveText(rawFields[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
    }
    const coverage = BOT_ARCHIVE_FIELDS.filter(field => fields[field]);
    meta[id] = {
      id,
      name: cleanBotArchiveText(raw.name || fields.name || id, 500),
      creator: cleanBotArchiveText(raw.creator || fields.creator || "", 500),
      image: canonicalBotImage(raw.image || fields.image || ""),
      profileUrl: String(raw.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim(),
      chatUrls: uniqueClean([...(Array.isArray(raw.chatUrls) ? raw.chatUrls : []), raw.chatUrl || ""])
        .map(value => String(value || "").trim()).filter(value => /^https:\/\/[^/]*spicychat\.ai\/chat\//i.test(value)).slice(0, 50),
      firstSavedAt: Number(raw.firstSavedAt) || Number(raw.savedAt) || Number(raw.capturedAt) || 0,
      lastSavedAt: Number(raw.lastSavedAt) || Number(raw.savedAt) || Number(raw.capturedAt) || 0,
      lastAvailableAt: Number(raw.lastAvailableAt) || Number(raw.lastSavedAt) || 0,
      source: cleanBotArchiveText(raw.source || "", 120),
      ownBot: !!raw.ownBot,
      profileBackup: !!raw.profileBackup,
      revisions: Array.isArray(raw.revisions) ? raw.revisions.map(normalizeBotArchiveRevision).filter(Boolean).slice(0, 50) : [],
      manualBackups: Array.isArray(raw.manualBackups) ? raw.manualBackups.map(normalizeBotManualBackup).filter(Boolean).sort((a, b) => b.capturedAt - a.capturedAt) : [],
      versions: Array.isArray(raw.versions) ? raw.versions.map(normalizeBotVersion).filter(Boolean).sort((a, b) => b.number - a.number || b.capturedAt - a.capturedAt).slice(0, 50) : [],
      versionState: normalizeBotVersionState(raw.versionState),
      fields,
      coverage
    };
  }
  return { meta };
}

function mergeBotArchiveEntry(previousValue, incomingValue) {
  const id = String(incomingValue?.id || previousValue?.id || "").trim();
  if (!id) return previousValue || null;
  const previous = normalizeBotArchive({ meta: { [id]: { ...(previousValue || {}), id } } }).meta[id] || null;
  const incoming = normalizeBotArchive({ meta: { [id]: { ...(incomingValue || {}), id } } }).meta[id] || null;
  if (!incoming) return previousValue || null;
  const fields = {};
  for (const field of BOT_ARCHIVE_FIELDS) fields[field] = incoming.fields?.[field] || previous?.fields?.[field] || "";
  return {
    id,
    name: incoming.name || previous?.name || fields.name || id,
    creator: incoming.creator || previous?.creator || fields.creator || "",
    image: incoming.image || previous?.image || fields.image || "",
    profileUrl: incoming.profileUrl || previous?.profileUrl || `https://spicychat.ai/chatbot/${id}`,
    chatUrls: uniqueClean([...(previous?.chatUrls || []), ...(incoming.chatUrls || [])]).slice(0, 50),
    firstSavedAt: Number(previous?.firstSavedAt) || Number(incoming.firstSavedAt) || Date.now(),
    lastSavedAt: Number(incoming.lastSavedAt) || Date.now(),
    lastAvailableAt: Number(incoming.lastAvailableAt) || Date.now(),
    source: incoming.source || previous?.source || "",
    ownBot: !!(incoming.ownBot || previous?.ownBot),
    profileBackup: !!(incoming.profileBackup || previous?.profileBackup),
    revisions: Array.isArray(incoming.revisions) && incoming.revisions.length ? incoming.revisions : (previous?.revisions || []),
    manualBackups: Array.isArray(incoming.manualBackups) && incoming.manualBackups.length ? incoming.manualBackups : (previous?.manualBackups || []),
    versions: Array.isArray(incoming.versions) && incoming.versions.length ? incoming.versions : (previous?.versions || []),
    versionState: Number(incoming.versionState?.capturedAt || 0) >= Number(previous?.versionState?.capturedAt || 0)
      ? normalizeBotVersionState(incoming.versionState)
      : normalizeBotVersionState(previous?.versionState),
    fields,
    coverage: BOT_ARCHIVE_FIELDS.filter(field => fields[field])
  };
}

function mergeBotArchives(current, incoming) {
  const left = normalizeBotArchive(current);
  const right = normalizeBotArchive(incoming);
  const meta = { ...left.meta };
  for (const [id, entry] of Object.entries(right.meta)) meta[id] = mergeBotArchiveEntry(meta[id], entry);
  return normalizeBotArchive({ meta });
}

function normalizeLorebookBackups(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawMeta = source.meta && typeof source.meta === "object" ? source.meta : (source.lorebooks && typeof source.lorebooks === "object" ? source.lorebooks : {});
  const meta = {};
  for (const [rawId, rawValue] of Object.entries(rawMeta || {})) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) continue;
    const id = String(rawValue.id || rawId || "").trim().slice(0, 200);
    if (!id) continue;
    const entries = {};
    for (const [rawKey, rawEntry] of Object.entries(rawValue.entries || {})) {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
      const name = cleanBotArchiveText(rawEntry.name || rawKey, 500);
      if (!name) continue;
      const key = cleanBotArchiveText(rawEntry.key || rawKey || name.toLowerCase(), 600).toLowerCase();
      entries[key] = {
        key, name,
        keywords: uniqueClean(Array.isArray(rawEntry.keywords) ? rawEntry.keywords : String(rawEntry.keywords || "").split(/\s*,\s*/g)).slice(0, 12),
        keywordsComplete: !!rawEntry.keywordsComplete,
        hiddenKeywordCount: Math.max(0, Number(rawEntry.hiddenKeywordCount) || 0),
        content: cleanBotArchiveText(rawEntry.content, 24000),
        capturedAt: Number(rawEntry.capturedAt) || 0
      };
    }
    meta[id] = {
      id,
      name: cleanBotArchiveText(rawValue.name || id, 500),
      description: cleanBotArchiveText(rawValue.description, 4000),
      tags: uniqueClean(Array.isArray(rawValue.tags) ? rawValue.tags : String(rawValue.tags || "").split(/\s*,\s*/g)).slice(0, 12),
      visibility: cleanBotArchiveText(rawValue.visibility, 40),
      image: cleanBotArchiveText(rawValue.image, 3000),
      firstSavedAt: Number(rawValue.firstSavedAt) || 0,
      lastSavedAt: Number(rawValue.lastSavedAt) || 0,
      source: cleanBotArchiveText(rawValue.source, 120),
      entries
    };
  }
  return { version: 1, meta };
}

function mergeLorebookBackups(current, incoming) {
  const left = normalizeLorebookBackups(current);
  const right = normalizeLorebookBackups(incoming);
  for (const [id, incomingBook] of Object.entries(right.meta)) {
    const previous = left.meta[id];
    if (!previous) { left.meta[id] = incomingBook; continue; }
    const entries = { ...(previous.entries || {}) };
    for (const [key, incomingEntry] of Object.entries(incomingBook.entries || {})) {
      const old = entries[key];
      if (!old) { entries[key] = incomingEntry; continue; }
      const useIncomingKeywords = incomingEntry.keywordsComplete || !old.keywordsComplete;
      entries[key] = {
        ...old, ...incomingEntry,
        keywords: useIncomingKeywords && incomingEntry.keywords?.length ? incomingEntry.keywords : old.keywords,
        keywordsComplete: !!(old.keywordsComplete || incomingEntry.keywordsComplete),
        hiddenKeywordCount: incomingEntry.keywordsComplete ? 0 : Math.max(Number(old.hiddenKeywordCount) || 0, Number(incomingEntry.hiddenKeywordCount) || 0),
        content: incomingEntry.content || old.content
      };
    }
    left.meta[id] = {
      ...previous, ...incomingBook,
      name: incomingBook.name || previous.name,
      description: incomingBook.description || previous.description,
      tags: incomingBook.tags?.length ? incomingBook.tags : previous.tags,
      visibility: incomingBook.visibility || previous.visibility,
      image: incomingBook.image || previous.image,
      firstSavedAt: Math.min(...[previous.firstSavedAt, incomingBook.firstSavedAt].filter(Number)) || 0,
      lastSavedAt: Math.max(Number(previous.lastSavedAt) || 0, Number(incomingBook.lastSavedAt) || 0),
      entries
    };
  }
  return normalizeLorebookBackups(left);
}

function saveArchiveSnapshotForBot(idValue, snapshotValue, meta = {}) {
  const id = String(idValue || "").trim();
  if (!id || !snapshotValue || typeof snapshotValue !== "object") return false;
  const normalized = normalizeBotArchive({ meta: { [id]: { ...snapshotValue, id, ...meta } } }).meta[id];
  if (!normalized?.coverage?.length) return false;
  // Bulk Bot Status scans can add thousands of copies. Normalizing the entire
  // archive before and after every single bot turns that into quadratic work.
  // Existing state is normalized once when loaded / when the scan begins;
  // only the one entry being changed needs normalization here.
  if (!botArchiveState || typeof botArchiveState !== "object") botArchiveState = { meta: {} };
  if (!botArchiveState.meta || typeof botArchiveState.meta !== "object") botArchiveState.meta = {};
  const previous = botArchiveState.meta[id] || null;
  const incoming = {
    ...normalized,
    id,
    profileUrl: meta.profileUrl || normalized.profileUrl || `https://spicychat.ai/chatbot/${id}`,
    source: meta.source || normalized.source || "Bot Status Center"
  };
  const comparable = value => {
    const entry = value && typeof value === "object" ? value : {};
    const fields = entry.fields && typeof entry.fields === "object" ? entry.fields : {};
    return JSON.stringify({
      name: cleanBotArchiveText(entry.name || fields.name || "", 500),
      creator: canonicalBotCreator(entry.creator || fields.creator || ""),
      image: canonicalBotImage(entry.image || fields.image || ""),
      profileUrl: String(entry.profileUrl || ""),
      coverage: [...(entry.coverage || [])].sort(),
      fields: Object.fromEntries(BOT_ARCHIVE_FIELDS.map(field => [field, field === "image" ? canonicalBotImage(fields[field]) : field === "creator" ? canonicalBotCreator(fields[field]) : cleanBotArchiveText(fields[field] || "", field === "personality" || field === "exampleDialogues" ? 18000 : 12000)]))
    });
  };
  if (previous && comparable(previous) === comparable(incoming)) {
    // A fresh availability check should not make every unchanged saved copy
    // look modified. Keep the content snapshot timestamps stable.
    return false;
  }

  let revisions = Array.isArray(previous?.revisions) ? [...previous.revisions] : [];
  if (previous?.fields) {
    const meaningfulProfileChanges = compareBotSnapshots(
      normalizeBotSnapshot({ fields: previous.fields }),
      normalizeBotSnapshot({ fields: incoming.fields })
    );
    if (meaningfulProfileChanges.length) {
      const revision = normalizeBotArchiveRevision({
        id: `status-${Number(previous.lastSavedAt || Date.now())}`,
        capturedAt: Number(previous.lastSavedAt) || Date.now(),
        source: previous.source || "Previous Bot Status snapshot",
        label: "Before detected profile change",
        kind: "profile",
        fields: previous.fields
      });
      if (revision) {
        const fingerprint = item => comparable({
          id,
          fields: item?.fields || {},
          name: item?.fields?.name || "",
          creator: item?.fields?.creator || "",
          image: item?.fields?.image || "",
          profileUrl: previous.profileUrl || "",
          coverage: item?.coverage || []
        });
        const revisionFingerprint = fingerprint(revision);
        revisions = [revision, ...revisions.filter(item => fingerprint(item) !== revisionFingerprint)].slice(0, 50);
      }
    }
  }

  botArchiveState.meta[id] = mergeBotArchiveEntry(previous, {
    ...incoming,
    revisions,
    lastSavedAt: Date.now(),
    lastAvailableAt: Date.now()
  });
  return true;
}

function normalizeBotSnapshot(value) {
  const raw = value && typeof value === "object" ? value : {};
  const fields = raw.fields && typeof raw.fields === "object" ? raw.fields : raw;
  const normalized = {};
  for (const field of BOT_SNAPSHOT_FIELDS) {
    normalized[field] = field === "image"
      ? canonicalBotImage(fields[field])
      : field === "creator"
        ? canonicalBotCreator(fields[field])
        : cleanBotSnapshotText(fields[field]);
  }
  const coverage = BOT_SNAPSHOT_FIELDS.filter(field => normalized[field]);
  const strongText = [normalized.description, normalized.greeting, normalized.personality, normalized.scenario]
    .filter(Boolean).join("\n");
  return {
    capturedAt: Number(raw.capturedAt) || 0,
    source: cleanBotSnapshotText(raw.source || "", 80),
    fields: normalized,
    coverage,
    strongTextLength: strongText.length
  };
}

function snapshotHasSignal(snapshot) {
  const snap = normalizeBotSnapshot(snapshot);
  return snap.coverage.length >= 2 || snap.strongTextLength >= 40;
}

function collapseComparisonDuplicateWords(value) {
  const text = cleanBotSnapshotText(value, 18000);
  if (!text) return "";

  const normalizeToken = token => String(token || "")
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

  // First remove immediate duplicate words. This is comparison-only cleanup:
  // saved profile text is never rewritten.
  const compactTokens = [];
  const compactKeys = [];
  let lastKey = "";
  for (const token of text.split(/\s+/g)) {
    const key = normalizeToken(token);
    if (key && key === lastKey) continue;
    compactTokens.push(token);
    compactKeys.push(key);
    lastKey = key;
  }

  // Also ignore accidental repeated phrases such as
  // "likes dragons and tea likes dragons and tea". These occasionally appear
  // in API/profile snapshots and should not manufacture a fake update.
  const out = [];
  for (let i = 0; i < compactTokens.length;) {
    let repeatedSpan = 0;
    const maxSpan = Math.min(8, Math.floor((compactTokens.length - i) / 2));
    for (let span = maxSpan; span >= 2; span--) {
      let same = true;
      let useful = false;
      for (let j = 0; j < span; j++) {
        const a = compactKeys[i + j];
        const b = compactKeys[i + span + j];
        if (a) useful = true;
        if (a !== b) { same = false; break; }
      }
      if (same && useful) { repeatedSpan = span; break; }
    }

    if (!repeatedSpan) {
      out.push(compactTokens[i]);
      i++;
      continue;
    }

    const phraseKeys = compactKeys.slice(i, i + repeatedSpan);
    out.push(...compactTokens.slice(i, i + repeatedSpan));
    i += repeatedSpan * 2;
    while (i + repeatedSpan <= compactTokens.length) {
      let same = true;
      for (let j = 0; j < repeatedSpan; j++) {
        if (compactKeys[i + j] !== phraseKeys[j]) { same = false; break; }
      }
      if (!same) break;
      i += repeatedSpan;
    }
  }

  return out.join(" ")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function botSnapshotComparableValue(field, value) {
  if (field === "image") return canonicalBotImage(value).toLocaleLowerCase();
  if (field === "creator") return canonicalBotCreator(value).toLocaleLowerCase();
  if (field === "tags") {
    return uniqueClean(String(value || "").split(/\s*,\s*|\n+/g))
      .map(tag => collapseComparisonDuplicateWords(tag).toLocaleLowerCase())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .join(",");
  }
  const text = collapseComparisonDuplicateWords(value);
  if (["name", "title"].includes(field)) return text.toLocaleLowerCase();
  return text;
}

function normalizeBotChange(change) {
  if (!change || typeof change !== "object") return null;
  const field = BOT_SNAPSHOT_FIELDS.includes(String(change.field || "")) ? String(change.field) : "";
  if (!field) return null;
  const normalizeValue = value => field === "image"
    ? canonicalBotImage(value)
    : field === "creator"
      ? canonicalBotCreator(value)
      : cleanBotSnapshotText(value);
  const before = normalizeValue(change.before);
  const after = normalizeValue(change.after);
  if (botSnapshotComparableValue(field, before) === botSnapshotComparableValue(field, after)) return null;
  return { field, before, after };
}

function normalizeBotAvailability(value) {
  const source = value && typeof value === "object" ? value : {};
  const rawMeta = source.meta && typeof source.meta === "object" ? source.meta : source;
  const meta = {};

  for (const [rawId, raw] of Object.entries(rawMeta || {})) {
    const id = String(rawId || raw?.id || "").trim();
    if (!id || !raw || typeof raw !== "object") continue;
    const status = BOT_AVAILABILITY_STATUSES.has(String(raw.status || "").toLowerCase())
      ? String(raw.status).toLowerCase()
      : "unknown";
    const rawUpdateStatus = BOT_UPDATE_STATUSES.has(String(raw.updateStatus || "").toLowerCase())
      ? String(raw.updateStatus).toLowerCase()
      : "current";
    const baseline = snapshotHasSignal(raw.baseline) ? normalizeBotSnapshot(raw.baseline) : null;
    const snapshot = snapshotHasSignal(raw.snapshot) ? normalizeBotSnapshot(raw.snapshot) : null;
    const changedFields = Array.isArray(raw.changedFields)
      ? raw.changedFields.map(normalizeBotChange).filter(Boolean)
      : [];
    const updateStatus = rawUpdateStatus;

    meta[id] = {
      id,
      name: String(raw.name || "").replace(/\s+/g, " ").trim(),
      image: canonicalBotImage(raw.image || snapshot?.fields?.image || baseline?.fields?.image || ""),
      creator: canonicalBotCreator(raw.creator || snapshot?.fields?.creator || baseline?.fields?.creator || ""),
      profileUrl: String(raw.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim(),
      chatUrl: String(raw.chatUrl || `https://spicychat.ai/chat/${id}`).trim(),
      sources: uniqueClean(Array.isArray(raw.sources) ? raw.sources : []),
      status,
      reason: String(raw.reason || "").replace(/\s+/g, " ").trim().slice(0, 500),
      httpStatus: Number(raw.httpStatus) || 0,
      checkedAt: Number(raw.checkedAt) || 0,
      baseline,
      snapshot,
      updateStatus,
      changedFields,
      updateDetectedAt: Number(raw.updateDetectedAt) || 0,
      baselineAcceptedAt: Number(raw.baselineAcceptedAt) || 0,
      unavailableEvidenceCount: Math.max(0, Number(raw.unavailableEvidenceCount) || 0),
      unavailableCandidateAt: Number(raw.unavailableCandidateAt) || 0,
      unavailableConfirmedAt: Number(raw.unavailableConfirmedAt) || 0,
      unavailableEvidenceType: String(raw.unavailableEvidenceType || "").slice(0, 80),
      recoverySources: uniqueClean(Array.isArray(raw.recoverySources) ? raw.recoverySources : []),
      cleanupAppliedAt: Number(raw.cleanupAppliedAt) || 0,
      recoveredAt: Number(raw.recoveredAt) || 0
    };
  }

  return { meta };
}

function normalizeBotUnavailableRecovery(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawMeta = source.meta && typeof source.meta === "object" && !Array.isArray(source.meta) ? source.meta : {};
  const meta = {};
  const recordObject = value => value && typeof value === "object" && !Array.isArray(value) ? value : null;

  for (const [rawId, rawValue] of Object.entries(rawMeta)) {
    const raw = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? rawValue : {};
    const id = String(raw.id || rawId || "").trim();
    if (!BOT_ID_RE.test(id)) continue;
    const memberships = raw.memberships && typeof raw.memberships === "object" ? raw.memberships : {};
    const records = raw.records && typeof raw.records === "object" ? raw.records : {};
    meta[id] = {
      id,
      capturedAt: Number(raw.capturedAt) || 0,
      recoveredAt: Number(raw.recoveredAt) || 0,
      name: String(raw.name || "").replace(/\s+/g, " ").trim(),
      creator: canonicalBotCreator(raw.creator || ""),
      image: canonicalBotImage(raw.image || ""),
      profileUrl: String(raw.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim(),
      sources: uniqueClean(Array.isArray(raw.sources) ? raw.sources : []),
      archiveAvailable: !!raw.archiveAvailable,
      archiveRemotePreserved: !!raw.archiveRemotePreserved,
      archiveRemotePreservedAt: Number(raw.archiveRemotePreservedAt) || 0,
      archiveRemotePreservationSource: String(raw.archiveRemotePreservationSource || "").slice(0, 80),
      localArchivePurgedAt: Number(raw.localArchivePurgedAt) || 0,
      memberships: {
        blocked: !!memberships.blocked,
        notInterested: !!memberships.notInterested,
        favorite: !!memberships.favorite,
        later: !!memberships.later,
        opened: !!memberships.opened,
        organizer: !!memberships.organizer,
        recent: !!memberships.recent,
        creatorWatch: !!memberships.creatorWatch
      },
      records: {
        blocked: recordObject(records.blocked),
        notInterested: recordObject(records.notInterested),
        favorite: recordObject(records.favorite),
        later: recordObject(records.later),
        openedMeta: recordObject(records.openedMeta),
        organizer: recordObject(records.organizer),
        recent: recordObject(records.recent),
        creatorWatch: recordObject(records.creatorWatch)
      }
    };
  }

  return { version: 1, meta };
}

function mergeBotUnavailableRecovery(current, incoming) {
  const left = normalizeBotUnavailableRecovery(current);
  const right = normalizeBotUnavailableRecovery(incoming);
  return { version: 1, meta: { ...left.meta, ...right.meta } };
}

function mergeBotAvailability(current, incoming) {
  const left = normalizeBotAvailability(current);
  const right = normalizeBotAvailability(incoming);
  return { meta: { ...left.meta, ...right.meta } };
}

function availabilitySourceLabel(source) {
  return ({
    favorite: "Favorites",
    later: "Later",
    blocked: "Blocked",
    notInterested: "Not Interested",
    recent: "Recently Seen",
    creatorWatch: "Followed creator detections",
    organizer: "Bot Organizer",
    opened: "Opened history",
    archive: "Saved bot archive",
    recovery: "Unavailable recovery"
  })[source] || source;
}

function collectTrackedAvailabilityBots(scope = "all") {
  const byId = new Map();
  const selected = source => scope === "all" || scope === source;

  const add = (idValue, raw = {}, source = "") => {
    const id = String(idValue || raw?.id || "").trim().toLowerCase();
    if (!BOT_ID_RE.test(id) || !selected(source) || botStatusIdIgnored(id)) return;
    const previous = byId.get(id) || {
      id,
      name: "",
      image: "",
      creator: "",
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      chatUrl: `https://spicychat.ai/chat/${id}`,
      sources: []
    };

    const candidate = raw && typeof raw === "object" ? raw : {};
    previous.name = previous.name || String(candidate.name || candidate.title || "").replace(/\s+/g, " ").trim();
    previous.image = previous.image || String(candidate.image || candidate.avatar || "").trim();
    previous.creator = previous.creator || String(candidate.creator || candidate.creatorName || candidate.creatorHandle || "").replace(/\s+/g, " ").trim();
    previous.profileUrl = String(candidate.profileUrl || previous.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim();
    previous.chatUrl = String(candidate.chatUrl || previous.chatUrl || `https://spicychat.ai/chat/${id}`).trim();
    previous.sources = uniqueClean([...(previous.sources || []), source]);
    byId.set(id, previous);
  };

  if (selected("favorite")) {
    const store = normalizeBotStore(favoriteBotState);
    store.ids.forEach(id => add(id, store.meta[id], "favorite"));
  }
  if (selected("later")) {
    const store = normalizeBotStore(laterBotState);
    store.ids.forEach(id => add(id, store.meta[id], "later"));
  }
  if (selected("blocked")) {
    const store = normalizeBotStore(blockedState);
    store.ids.forEach(id => add(id, store.meta[id], "blocked"));
  }
  if (selected("notInterested")) {
    const store = normalizeBotStore(notInterestedState);
    store.ids.forEach(id => add(id, store.meta[id], "notInterested"));
  }
  if (selected("recent")) {
    normalizeRecentlySeenStore(recentlySeenBotState).entries.forEach(item => add(item.id, item, "recent"));
  }
  if (selected("creatorWatch")) {
    normalizeCreatorBotWatchState(creatorBotWatchState).recent.forEach(item => add(item.id, item, "creatorWatch"));
  }
  if (selected("organizer")) {
    const store = normalizeBotOrganization(botOrganizationState);
    Object.entries(store.meta || {}).forEach(([id, meta]) => add(id, meta, "organizer"));
  }
  if (selected("opened")) {
    uniqueClean(currentOpened).forEach(id => add(id, openedChatMetaState?.[id], "opened"));
  }
  if (selected("archive")) {
    const store = normalizeBotArchive(botArchiveState);
    Object.entries(store.meta || {}).forEach(([id, meta]) => add(id, {
      id,
      name: meta.name || meta.fields?.name || "",
      creator: meta.creator || meta.fields?.creator || "",
      image: meta.image || meta.fields?.image || "",
      profileUrl: meta.profileUrl || `https://spicychat.ai/chatbot/${id}`
    }, "archive"));
  }
  if (selected("recovery")) {
    const recovery = normalizeBotUnavailableRecovery(botUnavailableRecoveryState);
    Object.entries(recovery.meta || {}).forEach(([id, meta]) => {
      if (Number(meta.recoveredAt || 0) > 0) return;
      add(id, {
        id,
        name: meta.name || "",
        creator: meta.creator || "",
        image: meta.image || "",
        profileUrl: meta.profileUrl || `https://spicychat.ai/chatbot/${id}`
      }, "recovery");
    });
  }

  return [...byId.values()].map(entry => ({
    ...entry,
    name: cleanAuthoritativeBotName(entry.name, entry.id) || ""
  }));
}

function botAvailabilityStatusLabel(status) {
  return ({
    available: "Available",
    unavailable: "Unavailable / deleted",
    restricted: "Private / restricted",
    unknown: "Unknown"
  })[status] || "Unknown";
}

function botAvailabilityVisibleText(html) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("script, style, noscript, svg").forEach(node => node.remove());
    const title = String(doc.title || "").replace(/\s+/g, " ").trim();
    const body = String(doc.body?.textContent || "").replace(/\s+/g, " ").trim();
    return { title, body: body.slice(0, 12000) };
  } catch {
    return { title: "", body: String(html || "").replace(/\s+/g, " ").trim().slice(0, 12000) };
  }
}

function readMetaContent(doc, selectors) {
  for (const selector of selectors) {
    const value = cleanBotSnapshotText(doc.querySelector(selector)?.getAttribute("content") || "", 6000);
    if (value) return value;
  }
  return "";
}

function botObjectIdMatches(obj, id) {
  const keys = ["id", "chatbotId", "chatbot_id", "characterId", "character_id", "uuid"];
  return keys.some(key => String(obj?.[key] || "").trim() === String(id));
}

function scoreBotJsonObject(obj, id) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return -1;
  let score = botObjectIdMatches(obj, id) ? 30 : 0;
  const keys = Object.keys(obj).map(key => key.toLowerCase());
  for (const token of ["name", "title", "description", "greeting", "personality", "scenario", "tags", "avatar", "image", "visibility", "creator"]) {
    if (keys.some(key => key.includes(token))) score += 2;
  }
  return score;
}

function findBestBotJsonObject(root, id) {
  let best = null;
  let bestScore = 0;
  let visited = 0;
  const stack = [{ value: root, depth: 0 }];
  while (stack.length && visited < 14000) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== "object" || depth > 14) continue;
    visited++;
    if (!Array.isArray(value)) {
      const score = scoreBotJsonObject(value, id);
      if (score > bestScore) {
        best = value;
        bestScore = score;
      }
    }
    const children = Array.isArray(value) ? value : Object.values(value);
    for (let i = Math.min(children.length, 160) - 1; i >= 0; i--) {
      const child = children[i];
      if (child && typeof child === "object") stack.push({ value: child, depth: depth + 1 });
    }
  }
  return bestScore >= 8 ? best : null;
}

function firstBotField(obj, aliases) {
  if (!obj || typeof obj !== "object") return "";
  const directKeys = Object.keys(obj);
  for (const alias of aliases) {
    const exact = directKeys.find(key => key.toLowerCase() === alias.toLowerCase());
    if (exact && obj[exact] != null) {
      const cleaned = cleanBotSnapshotText(obj[exact]);
      if (cleaned) return cleaned;
    }
  }
  return "";
}

function extractCreatorFromBotObject(obj) {
  const direct = firstBotField(obj, ["creatorName", "creatorHandle", "authorName", "username", "author", "creator"]);
  if (direct) return direct;
  for (const key of ["creator", "author", "user", "owner"]) {
    const nested = obj?.[key];
    if (nested && typeof nested === "object") {
      const value = firstBotField(nested, ["name", "username", "handle", "displayName"]);
      if (value) return value;
    }
  }
  return "";
}

function cleanBotProfileDisplayName(value) {
  return cleanBotSnapshotText(value, 500)
    .replace(/\s+-\s+Explore this AI Chatbot on Spicychat.*$/i, "")
    .replace(/\s+-\s+AI(?: Sex)? Chatbot(?:\s*\|\s*Spicychat)? .*$/i, "")
    .replace(/\s*[|\-–—]\s*Spicychat.*$/i, "")
    .trim();
}

function readableArchiveNode(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = String(node.tagName || "").toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "hr") return "\n---\n";
  const inner = [...node.childNodes].map(readableArchiveNode).join("");
  if (tag === "em" || tag === "i") return `*${inner.trim()}*`;
  return inner;
}

function extractVisibleProfileSection(doc, names) {
  const wanted = new Set((Array.isArray(names) ? names : [names]).map(name => String(name).toLowerCase()));
  for (const label of doc.querySelectorAll("p")) {
    const labelText = cleanBotArchiveText(label.textContent || "", 200).toLowerCase();
    if (!wanted.has(labelText)) continue;
    const section = label.parentElement;
    if (!section) continue;
    const candidate = [...section.children].find(child => child !== label && child.querySelector?.("p"));
    const body = candidate?.querySelector?.("p");
    if (!body) continue;
    const text = cleanBotArchiveText([...body.childNodes].map(readableArchiveNode).join("\n"), 18000);
    if (text) return text;
  }
  return "";
}

function extractJsonLdProfileMeta(doc, id) {
  const result = { description: "", creator: "", image: "" };
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = String(script.textContent || "").trim();
    if (!raw || raw.length > 500000) continue;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const url = String(item.url || "");
        const matchesBot = !id || url.includes(`/chatbot/${id}`) || String(item.name || "").trim() === cleanBotProfileDisplayName(doc.querySelector("h1")?.textContent || "");
        if (!matchesBot) continue;
        if (!result.description && item.description) result.description = cleanBotArchiveText(item.description, 5000);
        const author = item.author;
        if (!result.creator) result.creator = cleanBotArchiveText(typeof author === "string" ? author : author?.name || author?.username || "", 500);
        const image = item.image;
        if (!result.image) result.image = canonicalBotImage(typeof image === "string" ? image : image?.url || image?.contentUrl || "");
      }
    } catch {}
  }
  return result;
}

function extractVisibleProfileDescription(doc) {
  const tagsHost = doc.querySelector('[data-testid="TagSuggestion"]');
  const parent = tagsHost?.parentElement;
  if (!parent) return "";
  const children = [...parent.children];
  const start = children.indexOf(tagsHost);
  for (let i = start + 1; i < children.length; i++) {
    const child = children[i];
    if (child.matches?.("p")) {
      const text = cleanBotArchiveText(child.textContent || "", 5000);
      if (text) return text;
    }
  }
  return "";
}

function numericProfileStatFromIcon(doc, className) {
  for (const svg of doc.querySelectorAll(`svg.${className}`)) {
    const text = cleanBotArchiveText(svg.parentElement?.textContent || "", 100);
    if (/^[\d,.]+(?:\s*[kmb])?$/i.test(text) || /^\d+(?:\.\d+)?%$/.test(text)) return text;
  }
  return "";
}

function extractVisibleBotProfileData(doc, id, entry = {}) {
  const jsonLd = extractJsonLdProfileMeta(doc, id);
  const name = cleanBotProfileDisplayName(doc.querySelector("h1")?.textContent || "") ||
    cleanBotProfileDisplayName(doc.title || "") ||
    cleanBotArchiveText(entry.name || "", 500);
  const creator = cleanBotArchiveText(doc.querySelector('a[aria-label="creator-profile"]')?.textContent || jsonLd.creator || entry.creator || "", 500);
  const image = canonicalBotImage(
    doc.querySelector('img[alt="avatar image"]')?.getAttribute("src") ||
    readMetaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']) ||
    jsonLd.image ||
    entry.image ||
    ""
  );
  const tags = uniqueClean([...doc.querySelectorAll('[data-testid^="TagSuggestionItem-"], a[aria-label^="tag-"]')]
    .map(node => cleanBotArchiveText(node.textContent || "", 200))
    .filter(Boolean))
    .join(", ");
  const tokenText = cleanBotArchiveText(doc.querySelector('a[aria-label="tokens-info"]')?.textContent || "", 100)
    .replace(/\btokens?\b/i, "").trim();

  let visibility = "";
  for (const candidate of doc.querySelectorAll("span, p, div")) {
    const text = cleanBotArchiveText(candidate.textContent || "", 50).toLowerCase();
    if (["public", "unlisted", "private"].includes(text)) {
      visibility = text[0].toUpperCase() + text.slice(1);
      break;
    }
  }

  return {
    name,
    description: extractVisibleProfileDescription(doc) || jsonLd.description || "",
    greeting: extractVisibleProfileSection(doc, ["Greeting"]),
    personality: extractVisibleProfileSection(doc, ["Personality"]),
    scenario: extractVisibleProfileSection(doc, ["Scenario"]),
    exampleDialogues: extractVisibleProfileSection(doc, ["Example Dialogues", "Example Dialogue"]),
    tags,
    visibility,
    creator,
    image,
    messageCount: numericProfileStatFromIcon(doc, "lucide-message-square-text"),
    rating: numericProfileStatFromIcon(doc, "lucide-thumbs-up"),
    tokenCount: tokenText
  };
}

function extractBotArchiveSnapshot(html, id, entry = {}, stableSnapshot = null) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const visible = extractVisibleBotProfileData(doc, id, entry);
    const stable = stableSnapshot ? normalizeBotSnapshot(stableSnapshot).fields : {};
    const fields = {};
    for (const field of BOT_ARCHIVE_FIELDS) fields[field] = visible[field] || "";
    // Keep any field the signed-in user could actually retrieve during this
    // successful check. This never invents or unlocks hidden/private data; it
    // only backfills from the page/API snapshot that this same scan captured.
    for (const field of BOT_ARCHIVE_FIELDS) {
      if (!fields[field]) fields[field] = stable[field] || "";
    }
    return {
      id: String(id || "").trim(),
      name: fields.name || entry.name || "",
      creator: fields.creator || entry.creator || "",
      image: fields.image || entry.image || "",
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      source: "Bot Status Center profile scan",
      firstSavedAt: Date.now(),
      lastSavedAt: Date.now(),
      lastAvailableAt: Date.now(),
      fields
    };
  } catch {
    return null;
  }
}

function extractBotProfileSnapshot(html, id, entry = {}) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    let candidate = null;
    for (const script of doc.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__')) {
      const text = String(script.textContent || "").trim();
      if (!text || text.length > 3_000_000) continue;
      try {
        const parsed = JSON.parse(text);
        const found = findBestBotJsonObject(parsed, id);
        if (found && scoreBotJsonObject(found, id) > scoreBotJsonObject(candidate, id)) candidate = found;
      } catch {}
    }

    const metaName = cleanBotProfileDisplayName(readMetaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']));
    const metaDescription = readMetaContent(doc, ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]']);
    const metaImage = readMetaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']);
    const title = cleanBotProfileDisplayName(doc.title || "");
    const objectName = cleanBotProfileDisplayName(firstBotField(candidate, ["name", "title", "chatbotName", "characterName"]));
    const visible = extractVisibleBotProfileData(doc, id, entry);

    const fields = {
      name: objectName || visible.name || metaName || title || entry.name || "",
      title: firstBotField(candidate, ["title", "subtitle", "headline"]) || visible.title || "",
      description: firstBotField(candidate, ["description", "shortDescription", "short_description", "summary"]) || visible.description || metaDescription || "",
      greeting: firstBotField(candidate, ["greeting", "firstMessage", "first_message", "openingMessage", "opening_message", "initialMessage"]) || visible.greeting || "",
      personality: firstBotField(candidate, ["personality", "definition", "characterDefinition", "character_definition"]) || visible.personality || "",
      scenario: firstBotField(candidate, ["scenario", "context", "setting"]) || visible.scenario || "",
      exampleDialogues: firstBotField(candidate, ["exampleDialogues", "example_dialogues", "exampleDialogue", "example_dialogue", "mesExample", "mes_example", "examples"]) || visible.exampleDialogues || "",
      tags: firstBotField(candidate, ["tags", "tagNames", "tag_names", "categories"]) || visible.tags || "",
      visibility: firstBotField(candidate, ["visibility", "privacy", "publishStatus", "publish_status"]) || visible.visibility || "",
      creator: extractCreatorFromBotObject(candidate) || visible.creator || entry.creator || "",
      image: firstBotField(candidate, ["avatar", "avatarUrl", "avatar_url", "image", "imageUrl", "image_url", "thumbnail"]) || visible.image || metaImage || entry.image || ""
    };

    const normalized = normalizeBotSnapshot({ capturedAt: Date.now(), source: candidate ? "page data + metadata" : "page metadata", fields });
    return normalized;
  } catch {
    return normalizeBotSnapshot({
      capturedAt: Date.now(),
      source: "tracked metadata",
      fields: { name: entry.name || "", creator: entry.creator || "", image: entry.image || "" }
    });
  }
}

function compareBotSnapshots(baselineValue, currentValue) {
  const baseline = normalizeBotSnapshot(baselineValue);
  const current = normalizeBotSnapshot(currentValue);
  const changes = [];
  for (const field of BOT_SNAPSHOT_FIELDS) {
    const before = baseline.fields[field] || "";
    const after = current.fields[field] || "";
    // Only call a field changed when both scans could actually read it. This avoids
    // treating a temporarily missing field as a creator edit.
    if (!before || !after) continue;
    if (botSnapshotComparableValue(field, before) === botSnapshotComparableValue(field, after)) continue;
    changes.push({ field, before, after });
  }
  return changes;
}

function reconcileBotUpdate(previousValue, checkedValue) {
  const previous = previousValue && typeof previousValue === "object" ? previousValue : null;
  const checked = { ...checkedValue };
  const id = String(checked.id || previous?.id || "").trim();
  const archive = id ? (botArchiveState?.meta?.[id] || null) : null;
  const archiveFields = archive?.fields || {};
  const preservedName = [
    cleanAuthoritativeBotName(checked.name, id),
    cleanAuthoritativeBotName(previous?.name, id),
    cleanAuthoritativeBotName(archiveFields.name, id),
    cleanAuthoritativeBotName(archive?.name, id),
    ...localBotNameCandidates(id)
  ].find(Boolean) || "";
  checked.name = preservedName;
  checked.image = checked.image || previous?.image || archive?.image || archiveFields.image || "";
  checked.creator = checked.creator || previous?.creator || archive?.creator || archiveFields.creator || "";
  checked.profileUrl = checked.profileUrl || previous?.profileUrl || archive?.profileUrl || (id ? `https://spicychat.ai/chatbot/${id}` : "");
  checked.chatUrl = checked.chatUrl || previous?.chatUrl || archive?.chatUrls?.[0] || (id ? `https://spicychat.ai/chat/${id}` : "");
  const oldBaseline = previous?.baseline ? normalizeBotSnapshot(previous.baseline) : null;
  const snapshot = checked.snapshot && snapshotHasSignal(checked.snapshot) ? normalizeBotSnapshot(checked.snapshot) : null;

  checked.baseline = oldBaseline;
  checked.updateStatus = "current";
  // Keep the most recent meaningful change visible as history even after it has
  // been accepted automatically. The baseline itself advances below.
  checked.changedFields = Array.isArray(previous?.changedFields)
    ? previous.changedFields.map(normalizeBotChange).filter(Boolean)
    : [];
  checked.updateDetectedAt = Number(previous?.updateDetectedAt) || 0;
  checked.baselineAcceptedAt = Number(previous?.baselineAcceptedAt) || 0;
  checked.recoverySources = uniqueClean(previous?.recoverySources || []);
  checked.cleanupAppliedAt = Number(previous?.cleanupAppliedAt) || 0;
  checked.recoveredAt = Number(previous?.recoveredAt) || 0;

  // SpicyChat can return HTTP 200 with an empty object for an unavailable ID.
  // One empty result is only a candidate; require the same evidence on a later
  // independent check before making the record eligible for destructive cleanup.
  const candidate = checked.unavailableCandidate === true || String(checked.unavailableEvidenceType || "") === "api-empty-200";
  if (candidate) {
    const sameEvidence = String(previous?.unavailableEvidenceType || "") === "api-empty-200";
    const priorCount = sameEvidence ? Math.max(0, Number(previous?.unavailableEvidenceCount) || 0) : 0;
    const priorCheckedAt = Number(previous?.checkedAt) || 0;
    const independent = !priorCheckedAt || Number(checked.checkedAt || 0) > priorCheckedAt;
    const count = Math.min(99, priorCount + (independent ? 1 : 0));
    checked.unavailableEvidenceType = "api-empty-200";
    checked.unavailableEvidenceCount = count;
    checked.unavailableCandidateAt = Number(previous?.unavailableCandidateAt) || Number(checked.checkedAt) || Date.now();
    checked.unavailableConfirmedAt = Number(previous?.unavailableConfirmedAt) || 0;
    if (count >= 2) {
      checked.status = "unavailable";
      checked.unavailableConfirmedAt = Number(checked.checkedAt) || Date.now();
      checked.reason = `Confirmed unavailable after ${count} independent HTTP-200 empty-object checks.`;
    } else {
      checked.status = "unknown";
      checked.reason = "Unavailable candidate: Character API returned HTTP 200 with an empty object. Recheck on a later scan before cleanup.";
    }
    return checked;
  }

  if (["available", "restricted"].includes(String(checked.status || ""))) {
    checked.unavailableEvidenceCount = 0;
    checked.unavailableCandidateAt = 0;
    checked.unavailableConfirmedAt = 0;
    checked.unavailableEvidenceType = "";
  } else if (checked.status === "unavailable") {
    checked.unavailableEvidenceCount = Math.max(2, Number(previous?.unavailableEvidenceCount) || 0);
    checked.unavailableCandidateAt = Number(previous?.unavailableCandidateAt) || Number(checked.checkedAt) || Date.now();
    checked.unavailableConfirmedAt = Number(checked.checkedAt) || Date.now();
    checked.unavailableEvidenceType = String(checked.unavailableEvidenceType || previous?.unavailableEvidenceType || "explicit-unavailable");
  } else if (previous?.unavailableEvidenceCount) {
    // A transient/unknown check should not erase an earlier candidate, but it
    // also does not advance the confirmation count.
    checked.unavailableEvidenceCount = Number(previous.unavailableEvidenceCount) || 0;
    checked.unavailableCandidateAt = Number(previous.unavailableCandidateAt) || 0;
    checked.unavailableConfirmedAt = Number(previous.unavailableConfirmedAt) || 0;
    checked.unavailableEvidenceType = String(previous.unavailableEvidenceType || "");
  }

  if (checked.status !== "available" || !snapshot) return checked;
  if (!oldBaseline || !snapshotHasSignal(oldBaseline)) {
    checked.baseline = snapshot;
    checked.baselineAcceptedAt = Date.now();
    return checked;
  }

  const changes = compareBotSnapshots(oldBaseline, snapshot);
  const acceptedAt = Date.now();
  // Bot Status is observational: once the old copy/history has been preserved,
  // the newly observed live profile becomes the next comparison baseline
  // automatically. This removes the old manual "Accept update" bookkeeping.
  checked.baseline = snapshot;
  checked.baselineAcceptedAt = acceptedAt;
  if (changes.length) {
    checked.updateStatus = "updated";
    checked.changedFields = changes;
    checked.updateDetectedAt = acceptedAt;
  } else {
    checked.updateStatus = "current";
  }
  return checked;
}

function mergeBotArchiveSnapshotData(baseValue, helperValue, id, entry = {}) {
  const base = baseValue && typeof baseValue === "object" ? baseValue : null;
  const helper = helperValue && typeof helperValue === "object" ? helperValue : null;
  if (!base && !helper) return null;
  const fields = {};
  for (const field of BOT_ARCHIVE_FIELDS) {
    fields[field] = cleanBotArchiveText(helper?.fields?.[field] || base?.fields?.[field] || "", field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
  }
  return {
    ...(base || {}),
    ...(helper || {}),
    id,
    name: fields.name || helper?.name || base?.name || entry.name || id,
    creator: fields.creator || helper?.creator || base?.creator || entry.creator || "",
    image: fields.image || helper?.image || base?.image || entry.image || "",
    profileUrl: `https://spicychat.ai/chatbot/${id}`,
    source: helper ? "Bot Status Center character API" : (base?.source || "Bot Status Center character API"),
    firstSavedAt: Number(base?.firstSavedAt || helper?.firstSavedAt) || Date.now(),
    lastSavedAt: Date.now(),
    lastAvailableAt: Date.now(),
    fields
  };
}

async function hydrateBotStatusWithHelper(id, entry = {}, { keepHelper = false, forceOwnHelper = false, timeoutMs = 17000 } = {}) {
  if (!BOT_ID_RE.test(String(id || ""))) return null;
  try {
    const result = await runtimeMessageWithTimeout({
      type: "DS_BOT_STATUS_HELPER_CHECK",
      botId: id,
      botName: String(entry?.name || "").slice(0, 160),
      keepHelper: !!keepHelper,
      forceOwnHelper: !!forceOwnHelper
    }, timeoutMs);
    if (result?.__dsTimeout) {
      return { ok: false, status: "worker-timeout", httpStatus: 0, reason: "Bot Status worker did not answer this bot check in time." };
    }
    return result && typeof result === "object" ? result : null;
  } catch {
    return null;
  }
}

async function prepareBotStatusHelper({ forceOwnHelper = true, timeoutMs = 17000 } = {}) {
  try {
    const result = await runtimeMessageWithTimeout({
      type: "DS_BOT_STATUS_HELPER_PREPARE",
      forceOwnHelper: !!forceOwnHelper
    }, timeoutMs);
    if (result?.__dsTimeout) return { ok: false, ready: false, status: "worker-timeout" };
    return result && typeof result === "object" ? result : { ok: false, ready: false, status: "worker-no-response" };
  } catch {
    return { ok: false, ready: false, status: "worker-error" };
  }
}

async function releaseBotStatusHelper() {
  try { await runtimeMessage({ type: "DS_BOT_STATUS_HELPER_RELEASE" }); } catch {}
}

async function checkBotAvailability(entry, options = {}) {
  const id = String(entry?.id || "").trim();
  const base = {
    id,
    name: String(entry?.name || id).replace(/\s+/g, " ").trim(),
    image: String(entry?.image || "").trim(),
    creator: String(entry?.creator || "").replace(/\s+/g, " ").trim(),
    profileUrl: `https://spicychat.ai/chatbot/${id}`,
    chatUrl: String(entry?.chatUrl || `https://spicychat.ai/chat/${id}`).trim(),
    sources: uniqueClean(entry?.sources || []),
    checkedAt: Date.now(),
    httpStatus: 0,
    snapshot: null
  };

  if (!BOT_ID_RE.test(id)) return { ...base, status: "unknown", reason: "Missing or invalid bot ID." };

  // Bot Status Center is API-first now. A loaded SpicyChat page provides the
  // signed-in character API context, but it is never navigated to each bot.
  // The background worker borrows an existing SpicyChat page when possible and
  // only opens one persistent Home helper when no suitable page is available.
  const helper = await hydrateBotStatusWithHelper(id, entry, {
    keepHelper: !!options.keepHelper,
    forceOwnHelper: !!options.forceOwnHelper,
    timeoutMs: Number(options.timeoutMs || 17000)
  });
  const helperStatus = String(helper?.status || "");
  const helperHttp = Number(helper?.httpStatus || 0);
  base.httpStatus = helperHttp;

  if (helperStatus === "api-empty") {
    return {
      ...base,
      status: "unknown",
      unavailableCandidate: true,
      unavailableEvidenceType: "api-empty-200",
      reason: helper?.reason || "Character API returned HTTP 200 with an empty object; a later independent recheck is required before cleanup."
    };
  }
  if (helperStatus === "unavailable") {
    return { ...base, status: "unavailable", unavailableEvidenceType: "explicit-unavailable", reason: helper?.reason || (helperHttp ? `Character API returned HTTP ${helperHttp}.` : "Character API confirmed the chatbot is unavailable/deleted.") };
  }
  if (helperStatus === "restricted") {
    return { ...base, status: "restricted", reason: helper?.reason || (helperHttp ? `Character API returned HTTP ${helperHttp}.` : "Character API confirmed the chatbot is private/restricted.") };
  }
  if (helperStatus === "available" && helper?.archiveSnapshot) {
    const archiveSnapshot = mergeBotArchiveSnapshotData(null, helper.archiveSnapshot, id, entry);
    const helperFields = archiveSnapshot?.fields || {};
    const snapshot = normalizeBotSnapshot({
      capturedAt: Date.now(),
      source: "character API",
      fields: Object.fromEntries(BOT_SNAPSHOT_FIELDS.map(field => [field, helperFields[field] || ""]))
    });
    const liveName = cleanAuthoritativeBotName(helperFields.name || archiveSnapshot?.name || "", id);
    return {
      ...base,
      name: liveName || base.name,
      image: helperFields.image || archiveSnapshot?.image || base.image,
      creator: helperFields.creator || archiveSnapshot?.creator || base.creator,
      snapshot,
      archiveSnapshot,
      status: "available",
      reason: `Character API confirmed this bot and returned ${archiveSnapshot?.coverage?.length || 0} accessible field${(archiveSnapshot?.coverage?.length || 0) === 1 ? "" : "s"}.`
    };
  }

  if (options.bulkScan) {
    return {
      ...base,
      status: "unknown",
      reason: helper?.reason || "Character API did not return a confirmed result during the bulk scan."
    };
  }

  // If the API context is unavailable, a plain profile request is only allowed
  // to prove explicit deleted/private states. HTTP 200 or a generic React shell
  // is never enough to call a bot Available.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(base.profileUrl, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    base.httpStatus = helperHttp || Number(response.status) || 0;
    if (response.status === 404 || response.status === 410) {
      return { ...base, status: "unavailable", reason: `Profile returned HTTP ${response.status}.` };
    }
    if (response.status === 403) {
      return { ...base, status: "restricted", reason: "Profile returned HTTP 403." };
    }
    if (response.status === 429) {
      return { ...base, status: "unknown", reason: "SpicyChat rate-limited the check (HTTP 429)." };
    }
    if (!response.ok) {
      return { ...base, status: "unknown", reason: helper?.reason || `Profile check returned HTTP ${response.status}.` };
    }

    const finalUrl = String(response.url || "");
    if (/\/(login|signin|sign-in|auth)(?:[/?#]|$)/i.test(finalUrl)) {
      return { ...base, status: "unknown", reason: "SpicyChat authentication was not ready for this check." };
    }
    const html = await response.text();
    const visible = botAvailabilityVisibleText(html);
    const combined = `${visible.title}\n${visible.body}`.toLowerCase();
    const unavailablePhrases = [
      "chatbot not found", "character not found", "this chatbot is unavailable", "this character is unavailable",
      "chatbot is unavailable", "character is unavailable", "this chatbot has been deleted", "this character has been deleted",
      "couldn't find this chatbot", "could not find this chatbot", "page does not exist", "page doesn't exist"
    ];
    const restrictedPhrases = [
      "this chatbot is private", "this character is private", "private chatbot", "private character",
      "you do not have access", "you don't have access", "access denied", "not available in your region", "not available in your country"
    ];
    const unavailablePhrase = unavailablePhrases.find(phrase => combined.includes(phrase));
    if (unavailablePhrase || /(^|\s)404(?:\s|$)/.test(String(visible.title || "").toLowerCase())) {
      return { ...base, status: "unavailable", reason: unavailablePhrase ? `Page says “${unavailablePhrase}”.` : "Profile page title indicates 404/not found." };
    }
    const restrictedPhrase = restrictedPhrases.find(phrase => combined.includes(phrase));
    if (restrictedPhrase) return { ...base, status: "restricted", reason: `Page says “${restrictedPhrase}”.` };

    return {
      ...base,
      status: "unknown",
      reason: helper?.reason || "Character API did not confirm live bot data. A generic HTTP-200 profile shell is not treated as proof that the bot exists."
    };
  } catch (error) {
    return {
      ...base,
      status: "unknown",
      reason: error?.name === "AbortError"
        ? (helper?.reason || "Bot status check timed out.")
        : (helper?.reason || `Bot status check failed: ${String(error?.message || error || "network error").slice(0, 180)}`)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDuplicateText(value) {
  return cleanBotSnapshotText(value, 8000).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function fastStringHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function botDuplicateKeys(entry) {
  const snapshot = normalizeBotSnapshot(entry.snapshot || entry.baseline || {});
  const fields = snapshot.fields || {};
  const archive = entry.archive || null;
  const archived = archive?.fields || {};
  const rawName = fields.name || archived.name || archive?.name || entry.name || "";
  const name = isPlaceholderBotName(rawName, entry.id) ? "" : normalizeDuplicateText(rawName);
  const creator = normalizeDuplicateText(fields.creator || archived.creator || archive?.creator || entry.creator || "");
  const image = canonicalBotImage(fields.image || archived.image || archive?.image || entry.image || "").toLowerCase();
  const strongParts = [
    fields.description || archived.description,
    fields.greeting || archived.greeting,
    fields.personality || archived.personality,
    fields.scenario || archived.scenario
  ].map(normalizeDuplicateText).filter(Boolean);
  const strong = strongParts.join("\n");
  return {
    name,
    creator,
    image,
    strong,
    strongKey: strong.length >= 80 ? fastStringHash(strong) : "",
    coverage: snapshot.coverage?.length ? snapshot.coverage : (archive?.coverage || [])
  };
}

function addDuplicatePair(map, a, b, level, reasons) {
  if (!a?.id || !b?.id || a.id === b.id) return;
  const rank = { possible: 1, likely: 2, exact: 3 };
  const addOne = (from, to) => {
    const current = map.get(from.id) || new Map();
    const existing = current.get(to.id);
    // The UI only displays the first 20 matches. Bound the cached match set too
    // so a generic same-name/avatar bucket cannot create hundreds of thousands
    // of objects and freeze the Settings page. Existing matches may still be
    // upgraded from Possible -> Likely -> Exact.
    if (!existing && current.size >= 20) return;
    if (!existing || rank[level] > rank[existing.level]) {
      current.set(to.id, {
        id: to.id,
        name: to.name || to.id,
        level,
        reasons: uniqueClean(reasons)
      });
    } else if (existing) {
      existing.reasons = uniqueClean([...(existing.reasons || []), ...reasons]);
    }
    map.set(from.id, current);
  };
  addOne(a, b);
  addOne(b, a);
}

function forBoundedDuplicatePairs(group, callback, neighborLimit = 20) {
  if (!Array.isArray(group) || group.length < 2) return;
  const maxNeighbors = Math.max(1, Number(neighborLimit) || 20);
  for (let i = 0; i < group.length; i++) {
    const end = Math.min(group.length, i + 1 + maxNeighbors);
    for (let j = i + 1; j < end; j++) callback(group[i], group[j]);
  }
}

function computeBotDuplicateMatches(entries) {
  const result = new Map();
  const byStrong = new Map();
  const byImage = new Map();
  const byName = new Map();
  const keys = new Map();

  const bucket = (map, key, entry) => {
    if (!key) return;
    const list = map.get(key) || [];
    list.push(entry);
    map.set(key, list);
  };

  for (const entry of entries) {
    const key = botDuplicateKeys(entry);
    keys.set(entry.id, key);
    bucket(byStrong, key.strongKey, entry);
    bucket(byImage, key.image, entry);
    bucket(byName, key.name.length >= 3 ? key.name : "", entry);
  }

  for (const group of byStrong.values()) {
    forBoundedDuplicatePairs(group, (a, b) => {
      addDuplicatePair(result, a, b, "exact", ["matching captured profile text"]);
    });
  }

  for (const group of byImage.values()) {
    forBoundedDuplicatePairs(group, (a, b) => {
      const ak = keys.get(a.id), bk = keys.get(b.id);
      if (ak.name && ak.name === bk.name) {
        addDuplicatePair(result, a, b, "likely", ["matching name", "matching avatar/image"]);
      } else if (ak.strongKey && ak.strongKey === bk.strongKey) {
        addDuplicatePair(result, a, b, "exact", ["matching captured profile text", "matching avatar/image"]);
      } else {
        addDuplicatePair(result, a, b, "possible", ["matching avatar/image"]);
      }
    });
  }

  for (const group of byName.values()) {
    forBoundedDuplicatePairs(group, (a, b) => {
      const ak = keys.get(a.id), bk = keys.get(b.id);
      if (ak.creator && ak.creator === bk.creator && ak.image && ak.image === bk.image) {
        addDuplicatePair(result, a, b, "likely", ["matching name", "matching creator", "matching avatar/image"]);
      } else {
        addDuplicatePair(result, a, b, "possible", ["matching name"]);
      }
    });
  }

  const plain = new Map();
  for (const [id, matches] of result.entries()) {
    plain.set(id, [...matches.values()].sort((a, b) => ({ exact: 0, likely: 1, possible: 2 }[a.level] ?? 9) - ({ exact: 0, likely: 1, possible: 2 }[b.level] ?? 9) || a.name.localeCompare(b.name)));
  }
  return plain;
}

function botStatusCenterBaseEntries(scope = "all") {
  const tracked = collectTrackedAvailabilityBots(scope);
  const saved = normalizeBotAvailability(botAvailabilityState).meta;
  const archives = normalizeBotArchive(botArchiveState).meta;
  const byId = new Map();
  for (const item of tracked) {
    byId.set(item.id, {
      ...item,
      _scanEligible: true,
      status: "unknown",
      reason: item.sources?.includes("archive") ? "Saved local copy; availability has not been checked yet." : "Not checked yet.",
      checkedAt: 0,
      httpStatus: 0,
      updateStatus: "current",
      changedFields: [],
      archive: archives[item.id] || null
    });
  }
  for (const entry of Object.values(saved)) {
    if (botStatusIdIgnored(entry.id)) continue;
    const include = scope === "all" || (entry.sources || []).includes(scope) || byId.has(entry.id);
    if (!include) continue;
    const trackedEntry = byId.get(entry.id) || {};
    byId.set(entry.id, {
      ...trackedEntry,
      ...entry,
      name: cleanAuthoritativeBotName(entry.name, entry.id) || cleanAuthoritativeBotName(archives[entry.id]?.fields?.name, entry.id) || cleanAuthoritativeBotName(archives[entry.id]?.name, entry.id) || cleanAuthoritativeBotName(trackedEntry.name, entry.id) || bestKnownBotName(entry.id, ""),
      image: entry.image || trackedEntry.image || archives[entry.id]?.image || archives[entry.id]?.fields?.image || "",
      creator: entry.creator || trackedEntry.creator || "",
      sources: uniqueClean([...(trackedEntry.sources || []), ...(entry.sources || [])]),
      archive: archives[entry.id] || trackedEntry.archive || null
    });
  }
  for (const [id, archive] of Object.entries(archives)) {
    if (botStatusIdIgnored(id)) continue;
    const include = scope === "all" || scope === "archive" || byId.has(id);
    if (!include) continue;
    const current = byId.get(id) || {};
    byId.set(id, {
      id,
      ...current,
      name: cleanAuthoritativeBotName(current.name, id) || cleanAuthoritativeBotName(archive.fields?.name, id) || cleanAuthoritativeBotName(archive.name, id) || bestKnownBotName(id, ""),
      image: current.image || archive.image || archive.fields?.image || "",
      creator: current.creator || archive.creator || archive.fields?.creator || "",
      profileUrl: current.profileUrl || archive.profileUrl || `https://spicychat.ai/chatbot/${id}`,
      chatUrl: current.chatUrl || `https://spicychat.ai/chat/${id}`,
      sources: uniqueClean([...(current.sources || []), "archive"]),
      status: current.status || "unknown",
      reason: current.reason || "Saved local copy; availability has not been checked yet.",
      checkedAt: Number(current.checkedAt) || 0,
      httpStatus: Number(current.httpStatus) || 0,
      updateStatus: current.updateStatus || "current",
      changedFields: current.changedFields || [],
      archive
    });
  }
  return [...byId.values()];
}

function duplicateLevelForEntry(matches) {
  if (!matches?.length) return "";
  if (matches.some(match => match.level === "exact")) return "exact";
  if (matches.some(match => match.level === "likely")) return "likely";
  return "possible";
}

function botAvailabilityEntries(baseEntries = null, duplicateMatches = null) {
  const query = String($("botAvailabilitySearch")?.value || botAvailabilityUiState.query || "")
    .toLowerCase().replace(/\s+/g, " ").trim();
  const filter = String($("botAvailabilityStatusFilter")?.value || botAvailabilityUiState.status || "all");
  const scope = String($("botAvailabilityScope")?.value || "all");
  const base = Array.isArray(baseEntries) ? baseEntries : botStatusCenterBaseEntries(scope);
  const duplicates = duplicateMatches instanceof Map ? duplicateMatches : new Map();
  const priority = { unavailable: 0, restricted: 1, unknown: 2, available: 3 };
  const updatePriority = entry => (entry.changedFields || []).length ? 0 : 1;

  return base
    .map(entry => ({ ...entry, duplicateMatches: duplicates.get(entry.id) || [] }))
    .filter(entry => {
      if (filter === "all") return true;
      if (filter === "pending") return typeof botStatusPendingReviewIds !== "undefined" && botStatusPendingReviewIds.has(entry.id);
      if (filter === "updated") return (entry.changedFields || []).length > 0;
      if (filter === "archived") return !!entry.archive;
      if (filter === "unarchived") return !entry.archive;
      if (BOT_DUPLICATE_LEVELS.has(filter)) return entry.duplicateMatches.some(match => match.level === filter);
      return entry.status === filter;
    })
    .filter(entry => {
      if (!query) return true;
      const archived = entry.archive?.fields || {};
      return [entry.name, entry.id, entry.creator, ...(entry.sources || []), entry.reason, archived.description, archived.tags, archived.visibility, ...(entry.changedFields || []).map(change => `${change.field} ${change.before} ${change.after}`), ...(entry.duplicateMatches || []).map(match => `${match.name} ${match.level} ${(match.reasons || []).join(" ")}`)]
        .join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => updatePriority(a) - updatePriority(b) || (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || Number(b.checkedAt || 0) - Number(a.checkedAt || 0) || String(a.name || "").localeCompare(String(b.name || "")));
}

function shortenedDiffValue(value) {
  const text = cleanBotSnapshotText(value, 1200);
  return text.length > 360 ? `${text.slice(0, 357)}...` : text || "(empty)";
}

function botUpdateDetails(entry) {
  if (!(entry.changedFields || []).length) return null;
  const details = makeElement("details", { className: "bot-update-details" });
  const when = entry.updateDetectedAt ? ` · ${new Date(entry.updateDetectedAt).toLocaleString()}` : "";
  details.appendChild(makeElement("summary", { text: `Last detected change${entry.changedFields.length === 1 ? "" : "s"} (${entry.changedFields.length})${when}` }));
  for (const change of entry.changedFields) {
    const block = makeElement("div", { className: "bot-update-change" });
    block.appendChild(makeElement("div", { className: "bot-update-field", text: BOT_SNAPSHOT_LABELS[change.field] || change.field }));
    block.appendChild(makeElement("div", { className: "bot-update-before", text: `Before: ${shortenedDiffValue(change.before)}` }));
    block.appendChild(makeElement("div", { className: "bot-update-after", text: `Now: ${shortenedDiffValue(change.after)}` }));
    details.appendChild(block);
  }
  return details;
}

function botDuplicateDetails(entry) {
  const matches = entry.duplicateMatches || [];
  if (!matches.length) return null;
  const details = makeElement("details", { className: "bot-duplicate-details" });
  details.appendChild(makeElement("summary", { text: `${matches.length} possible duplicate/reupload match${matches.length === 1 ? "" : "es"}` }));
  for (const match of matches.slice(0, 20)) {
    const row = makeElement("div", { className: "bot-duplicate-match" });
    row.appendChild(makeElement("span", {
      className: "bot-duplicate-badge",
      text: match.level === "exact" ? "Exact" : match.level === "likely" ? "Likely" : "Possible",
      dataset: { level: match.level }
    }));
    row.appendChild(makeElement("a", {
      text: match.name || match.id,
      attrs: { href: `https://spicychat.ai/chatbot/${match.id}`, target: "_blank", rel: "noopener noreferrer" }
    }));
    if (match.reasons?.length) row.appendChild(makeElement("span", { className: "bot-duplicate-reason", text: match.reasons.join(" + ") }));
    details.appendChild(row);
  }
  return details;
}

function botArchiveReadableText(archiveValue) {
  const archive = archiveValue && typeof archiveValue === "object" ? archiveValue : null;
  if (!archive) return "";
  const fields = archive.fields || {};
  const lines = [];
  lines.push(fields.name || archive.name || archive.id || "Saved bot");
  if (fields.creator || archive.creator) lines.push(`Creator: ${fields.creator || archive.creator}`);
  if (archive.profileUrl) lines.push(`Profile: ${archive.profileUrl}`);
  if (archive.lastSavedAt) lines.push(`Saved locally: ${new Date(archive.lastSavedAt).toLocaleString()}`);
  if (archive.chatUrls?.length) {
    archive.chatUrls.forEach((url, index) => lines.push(`${archive.chatUrls.length > 1 ? `Old chat ${index + 1}` : "Old chat"}: ${url}`));
  }
  lines.push("");
  for (const field of BOT_ARCHIVE_FIELDS) {
    if (field === "name" || field === "creator") continue;
    const value = cleanBotArchiveText(fields[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
    if (!value) continue;
    lines.push(`${BOT_ARCHIVE_LABELS[field] || field}:`);
    lines.push(value);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function botArchiveDetails(entry) {
  const archive = entry.archive;
  if (!archive) return null;
  const details = makeElement("details", { className: "bot-update-details bot-archive-details" });
  const count = archive.coverage?.length || 0;
  details.appendChild(makeElement("summary", { text: `View saved local copy (${count} field${count === 1 ? "" : "s"})` }));
  // Recovery copies can contain very large Greeting/Personality/Example fields.
  // Keep that text out of the Options DOM until the user actually opens it.
  details.addEventListener("toggle", () => {
    if (!details.open || details.dataset.archiveLoaded === "1") return;
    const pre = makeElement("pre", { text: botArchiveReadableText(archive) });
    pre.style.whiteSpace = "pre-wrap";
    pre.style.overflowWrap = "anywhere";
    pre.style.margin = ".35rem 0 0";
    pre.style.font = "inherit";
    details.appendChild(pre);
    details.dataset.archiveLoaded = "1";
  });
  return details;
}

function botArchiveHistoryDetails(archiveValue) {
  const archive = archiveValue && typeof archiveValue === "object" ? archiveValue : null;
  const revisions = Array.isArray(archive?.revisions) ? archive.revisions.map(normalizeBotArchiveRevision).filter(Boolean) : [];
  if (!archive || !revisions.length) return null;

  const details = makeElement("details", { className: "bot-update-details bot-archive-history-details" });
  details.appendChild(makeElement("summary", { text: `Profile history (${revisions.length + 1} snapshots)` }));
  details.addEventListener("toggle", () => {
    if (!details.open || details.dataset.historyLoaded === "1") return;
    const snapshots = [
      ...revisions.map(item => ({
        capturedAt: Number(item.capturedAt || 0),
        source: item.source || item.label || "Saved profile",
        fields: item.fields || {}
      })),
      {
        capturedAt: Number(archive.lastSavedAt || 0),
        source: archive.source || "Current saved profile",
        fields: archive.fields || {}
      }
    ].sort((a, b) => Number(a.capturedAt || 0) - Number(b.capturedAt || 0));

    let previous = null;
    snapshots.forEach((snapshot, index) => {
      const wrap = makeElement("div", { className: "bot-history-snapshot" });
      const when = snapshot.capturedAt ? new Date(snapshot.capturedAt).toLocaleString() : "Unknown time";
      wrap.appendChild(makeElement("div", {
        className: "bot-update-field",
        text: `${index + 1}. ${when}${snapshot.source ? ` · ${snapshot.source}` : ""}`
      }));
      if (!previous) {
        wrap.appendChild(makeElement("div", { className: "bot-availability-meta", text: "Earliest saved profile snapshot." }));
      } else {
        const changes = compareBotSnapshots(
          normalizeBotSnapshot({ fields: previous.fields || {} }),
          normalizeBotSnapshot({ fields: snapshot.fields || {} })
        );
        if (!changes.length) {
          wrap.appendChild(makeElement("div", { className: "bot-availability-meta", text: "No meaningful profile-text changes after comparison cleanup." }));
        } else {
          changes.forEach(change => {
            const block = makeElement("div", { className: "bot-update-change" });
            block.appendChild(makeElement("div", { className: "bot-update-field", text: BOT_SNAPSHOT_LABELS[change.field] || change.field }));
            block.appendChild(makeElement("div", { className: "bot-update-before", text: `Before: ${shortenedDiffValue(change.before)}` }));
            block.appendChild(makeElement("div", { className: "bot-update-after", text: `Now: ${shortenedDiffValue(change.after)}` }));
            wrap.appendChild(block);
          });
        }
      }
      details.appendChild(wrap);
      previous = snapshot;
    });
    details.dataset.historyLoaded = "1";
  });
  return details;
}

function safeBotExportName(archiveValue) {
  const archive = archiveValue && typeof archiveValue === "object" ? archiveValue : {};
  return String(archive.name || archive.fields?.name || archive.id || "spicychat-bot")
    .replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90) || "spicychat-bot";
}
