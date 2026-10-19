// Feature-owned options helpers: bulk-feedback. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function optionsLooksMobile() {
  if (navigator.userAgentData?.mobile) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigator.userAgent || ""));
}

function isRepeatedAuthOrCorsError(response) {
  if (!response || response.ok === true) return false;
  const codes = [response.httpStatus, response.availabilityHttpStatus, response.ratingHttpStatus].map(Number);
  if (codes.includes(401)) return true;
  const reason = [response.status, response.error, response.reason, response.message].filter(Boolean).join(" ");
  return /\b(cors|unauthori[sz]ed|401|invalid token|expired token|failed to fetch|networkerror|network error|network request failed)\b/i.test(reason);
}

function quickDislikeResponseIsTransient(response) {
  const status = String(response?.status || (response ? "failed" : "worker-error"));
  return !response?.ok && BULK_DISLIKE_TRANSIENT_STATUSES.has(status);
}

async function runQuickDislikeWithBackoff(payload, label = "") {
  let response = null;
  for (let attempt = 0; attempt <= BULK_DISLIKE_RETRY_LIMIT; attempt += 1) {
    if (navigator.onLine === false) return { ok: false, status: "offline-paused" };
    if (attempt > 0) {
      const wait = Math.min(8000, BULK_DISLIKE_RETRY_BASE_MS * (2 ** (attempt - 1)));
      updateBlockedDislikeStatus(`Retrying ${label || payload.botName || payload.botId} in ${(wait / 1000).toFixed(wait >= 2000 ? 0 : 1)}s · attempt ${attempt + 1}/${BULK_DISLIKE_RETRY_LIMIT + 1}`);
      await new Promise(resolve => setTimeout(resolve, wait));
      if (navigator.onLine === false) return { ok: false, status: "offline-paused" };
    }
    try {
      response = await runtimeMessage({ ...payload, retryAttempt: attempt });
    } catch (error) {
      response = { ok: false, status: "worker-error", error: String(error?.message || error || "Quick Dislike feedback helper failed") };
    }
    if (!quickDislikeResponseIsTransient(response) || attempt >= BULK_DISLIKE_RETRY_LIMIT) return response || { ok: false, status: "worker-error" };
  }
  return response || { ok: false, status: "worker-error" };
}

function applyQuickDislikeResponseToLocalHistory(id, name, response) {
  const botId = String(id || "").trim();
  if (!botId || !response?.ok) return false;
  let status = String(response.status || "");
  if (status === "already-handled") status = String(response.rememberedStatus || "");
  if (!["disliked", "already-disliked", "already-rated-or-unavailable", "unavailable-private-or-deleted", "unavailable-creator-blocked", "dislike-event-pending"].includes(status)) return false;
  quickDislikeHistoryState = normalizeQuickDislikeHistory(quickDislikeHistoryState);
  const previous = quickDislikeHistoryState.bots[botId] || {};
  const repeated = response.status === "already-handled" && previous.status === status;
  quickDislikeHistoryState.bots[botId] = {
    status,
    name: String(name || previous.name || "").slice(0, 160),
    handledAt: Number(response.handledAt || 0) || Number(previous.handledAt || 0) || Date.now(),
    crossHandledBy: response.crossHandledBy === "less-like" ? "less-like" : (repeated ? previous.crossHandledBy || "" : ""),
    ratingSource: ["less-like", "dislike"].includes(response.ratingSource) ? response.ratingSource : (repeated ? previous.ratingSource || "" : (status === "disliked" ? "dislike" : "")),
    ratingAt: Number(response.ratingAt || 0) || (repeated ? Number(previous.ratingAt || 0) : 0),
    requestSent: status === "disliked" && (response.requestSent === true || (repeated && previous.requestSent === true)),
    nativeEventConfirmed: status === "disliked" && (response.nativeEventConfirmed === true || (repeated && previous.nativeEventConfirmed === true))
  };
  return true;
}

async function refreshQuickDislikeHistoryState() {
  const result = await storageGet([QUICK_DISLIKE_HISTORY_KEY, QUICK_DISLIKE_BULK_STATE_KEY, QUICK_LESS_LIKE_HISTORY_KEY]);
  quickDislikeHistoryState = normalizeQuickDislikeHistory(result[QUICK_DISLIKE_HISTORY_KEY]);
  quickLessLikeHistoryState = normalizeQuickLessLikeHistory(result[QUICK_LESS_LIKE_HISTORY_KEY]);
  quickDislikeBulkState = normalizeQuickDislikeBulkState(result[QUICK_DISLIKE_BULK_STATE_KEY]);
  updateBlockedBulkResumeControls();
  return quickDislikeHistoryState;
}

function blockedBulkCandidateIds(mode = "remaining") {
  const allBlocked = uniqueClean(blockedState?.ids || []);
  const stillEligible = id => allBlocked.includes(id) && !quickDislikeHistoryEntry(id);
  if (mode === "selected") return [...botManagerBulkSet("blocked")].filter(stillEligible);
  if (mode === "resume") {
    const stored = uniqueClean([quickDislikeBulkState.currentId, ...(quickDislikeBulkState.pendingIds || [])]);
    return stored.filter(stillEligible);
  }
  if (mode === "failed") return uniqueClean(quickDislikeBulkState.failedIds || []).filter(stillEligible);
  return allBlocked.filter(stillEligible);
}

function updateBlockedBulkResumeControls() {
  const resume = $("resumeBlockedDislikeRun");
  const retry = $("retryFailedBlockedDislikes");
  if (!resume || !retry) return;
  const resumeCount = blockedBulkCandidateIds("resume").length;
  const failedCount = blockedBulkCandidateIds("failed").length;
  const interrupted = ["running", "paused", "interrupted"].includes(quickDislikeBulkState?.status);
  resume.hidden = !(interrupted && resumeCount);
  resume.textContent = resumeCount ? `Resume unfinished (${resumeCount})` : "Resume unfinished";
  retry.hidden = !failedCount;
  retry.textContent = failedCount ? `Retry last failed (${failedCount})` : "Retry last failed";
}

async function runBlockedBulkDislike(mode = "remaining") {
  const button = $("bulkDislikeBlockedBots");
  const clearButton = $("clearBlockedDislikeHistory");

  if (blockedBulkDislikeRunning) {
    blockedBulkDislikeStopRequested = true;
    const runId = activeBlockedBulkDislikeRunId || quickDislikeBulkState?.runId || "";
    if (button) button.textContent = "Stopping after current bot...";
    updateBlockedDislikeStatus("Stopping after the current bot...");
    if (runId) await runtimeMessage({ type: "DS_QUICK_DISLIKE_CANCEL_BULK", bulkRunId: runId });
    await persistQuickDislikeBulkState({
      ...quickDislikeBulkState,
      status: "paused",
      runId,
      stopRequested: true
    });
    return;
  }

  if (optionsLooksMobile()) {
    showSettingsToast("Bulk Dislike is desktop-browser only for now.");
    return;
  }

  // Mark the run active before any async setup so a second click cannot race
  // this call and accidentally start a second bulk loop.
  blockedBulkDislikeRunning = true;
  blockedBulkDislikeStopRequested = false;
  const runId = `blocked-dislike-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  activeBlockedBulkDislikeRunId = runId;
  if (button) button.textContent = "Stop after current bot";
  if (clearButton) clearButton.disabled = true;

  let disliked = 0;
  let alreadySet = 0;
  let alreadyDisliked = 0;
    let sentRequests = 0;
  let creatorBlocked = 0;
  let unavailable = 0;
  let failed = 0;
  let processed = 0;
  let consecutiveWorkerFailures = 0;
  let consecutiveAccessFailures = 0;
  let autoPausedAfterFailures = false;
  const failedIds = [];
  let candidates = [];
  let startedAt = Date.now();

  try {
    await ensureBlockingDataLoaded();
    await refreshQuickDislikeHistoryState();
    if (blockedBulkDislikeStopRequested) return;

    candidates = blockedBulkCandidateIds(mode);
    if (!candidates.length) {
      updateBlockedDislikeStatus();
      const message = mode === "failed"
        ? "There are no failed blocked-bot dislikes left to retry."
        : mode === "resume"
          ? "There is no unfinished Bulk Dislike run to resume."
          : mode === "selected"
            ? "Select at least one unhandled blocked bot first."
            : ((blockedState?.ids || []).length ? "No blocked bots remain eligible for Dislike. Less Like history does not count as Dislike, and legacy unverified ratings can be retried." : "No blocked bot IDs are available to rate.");
      showSettingsToast(message);
      return;
    }

    startedAt = mode === "resume" && quickDislikeBulkState.startedAt ? quickDislikeBulkState.startedAt : Date.now();
    await persistQuickDislikeBulkState({
      version: 1,
      status: "running",
      pendingIds: candidates,
      failedIds: mode === "failed" ? [] : uniqueClean(quickDislikeBulkState.failedIds || []),
      startedAt,
      currentId: "",
      lastMode: mode,
      runId,
      stopRequested: false
    });

    for (let index = 0; index < candidates.length; index += 1) {
      if (blockedBulkDislikeStopRequested || quickDislikeBulkState?.stopRequested) break;
      const id = candidates[index];
      if (quickDislikeHistoryEntry(id) || !(blockedState?.ids || []).includes(id)) continue;
      processed += 1;
      const meta = blockedState?.meta?.[id] || {};
      const name = String(meta.name || id);
      await persistQuickDislikeBulkState({
        ...quickDislikeBulkState,
        status: "running",
        currentId: id,
        pendingIds: candidates.slice(index),
        runId,
        stopRequested: false
      });
      updateBlockedDislikeStatus(`Processing ${processed}/${candidates.length} · ${name}`);

      const response = await runQuickDislikeWithBackoff({
        type: "DS_QUICK_DISLIKE_BOT",
        botId: id,
        botName: name,
        chatUrl: meta.chatUrl || `https://spicychat.ai/chat/${id}`,
        bulkRunId: runId
      }, name);

      // If connectivity drops, keep the current bot and everything after it
      // pending instead of turning an offline period into a wall of failures.
      if (response?.status === "offline-paused") {
        blockedBulkDislikeStopRequested = true;
        await persistQuickDislikeBulkState({
          ...quickDislikeBulkState,
          status: "paused",
          currentId: "",
          pendingIds: candidates.slice(index),
          runId,
          stopRequested: true
        });
        updateBlockedDislikeStatus("Bulk Dislike paused because the browser is offline. Resume when the connection is back.");
        break;
      }

      // A canceled request means Stop won the race before this item began.
      // Leave it unhandled and resume from this item later.
      if (response?.status === "bulk-canceled") {
        blockedBulkDislikeStopRequested = true;
        await persistQuickDislikeBulkState({
          ...quickDislikeBulkState,
          status: "paused",
          currentId: "",
          pendingIds: candidates.slice(index),
          runId,
          stopRequested: true
        });
        break;
      }

      if (isRepeatedAuthOrCorsError(response)) {
        consecutiveAccessFailures += 1;
        if (consecutiveAccessFailures >= BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD) {
          autoPausedAfterFailures = true;
          blockedBulkDislikeStopRequested = true;
          await persistQuickDislikeBulkState({
            ...quickDislikeBulkState, status: "paused", currentId: "",
            pendingIds: candidates.slice(index), runId, stopRequested: true
          });
          updateBlockedDislikeStatus("Bulk Dislike paused after 3 consecutive 401/CORS errors. The remaining queue is saved for Resume.");
          break;
        }
      } else consecutiveAccessFailures = 0;

      const remembered = applyQuickDislikeResponseToLocalHistory(id, name, response);
      const status = response?.status === "already-handled" ? response?.rememberedStatus : response?.status;
      if (remembered && status === "disliked" && response?.nativeEventConfirmed === true) {
        disliked += 1;
        if (response?.nativeEventConfirmed === true) sentRequests += 1;
      } else if (remembered && status === "already-disliked") {
        alreadyDisliked += 1;
      }
      else if (remembered && status === "already-rated-or-unavailable") alreadySet += 1;
      else if (remembered && status === "unavailable-creator-blocked") creatorBlocked += 1;
      else if (remembered && status === "unavailable-private-or-deleted") unavailable += 1;
      else { failed += 1; failedIds.push(id); }

      if (remembered) {
        consecutiveWorkerFailures = 0;
      } else {
        consecutiveWorkerFailures += 1;
        if (consecutiveWorkerFailures >= BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD) {
          autoPausedAfterFailures = true;
          blockedBulkDislikeStopRequested = true;
        }
      }

      await refreshQuickDislikeHistoryState();
      if (quickDislikeBulkState?.stopRequested) blockedBulkDislikeStopRequested = true;
      await persistQuickDislikeBulkState({
        ...quickDislikeBulkState,
        status: blockedBulkDislikeStopRequested ? "paused" : "running",
        currentId: "",
        pendingIds: candidates.slice(index + 1),
        failedIds: uniqueClean([...(quickDislikeBulkState.failedIds || []), ...failedIds]),
        runId,
        stopRequested: blockedBulkDislikeStopRequested
      });

      const counts = blockedQuickDislikeCounts();
      updateBlockedDislikeStatus(`${processed}/${candidates.length} checked · ${sentRequests} Dislikes confirmed · ${alreadyDisliked} already disliked/legacy · ${alreadySet} other rated · ${creatorBlocked} creator blocked · ${unavailable} unavailable · ${failed} failed · ${counts.remaining} remaining`);

      if (blockedBulkDislikeStopRequested) break;
      if (index < candidates.length - 1) {
        const delay = Math.min(10000, Math.max(250, Number(value("blockedBulkDislikeDelayMs", "750")) || 750));
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } finally {
    const stopped = blockedBulkDislikeStopRequested || !!quickDislikeBulkState?.stopRequested;
    blockedBulkDislikeRunning = false;
    blockedBulkDislikeStopRequested = false;
    activeBlockedBulkDislikeRunId = "";

    if (runId) {
      await runtimeMessage({ type: "DS_QUICK_DISLIKE_RELEASE_BULK", bulkRunId: runId }).catch?.(() => null);
    }
    await refreshQuickDislikeHistoryState();
    const unfinished = stopped ? blockedBulkCandidateIds("resume") : [];
    const finalFailed = uniqueClean([...(quickDislikeBulkState.failedIds || []), ...failedIds]).filter(id => !quickDislikeHistoryEntry(id));
    await persistQuickDislikeBulkState({
      ...quickDislikeBulkState,
      status: stopped && unfinished.length ? "paused" : (finalFailed.length ? "completed-with-failures" : "completed"),
      currentId: "",
      pendingIds: stopped ? unfinished : [],
      failedIds: finalFailed,
      startedAt,
      runId: "",
      stopRequested: false
    });
    if (button) button.textContent = "Dislike remaining blocked bots";
    if (clearButton) clearButton.disabled = false;
    renderBotManager("blocked");
    updateBlockedDislikeStatus();

    if (candidates.length) {
      showSettingsToast(autoPausedAfterFailures
        ? `Bulk Dislike paused after ${BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD} consecutive failures (including 401/CORS). Remaining bots were kept for Resume.`
        : stopped
          ? `Bulk Dislike stopped. ${sentRequests} Dislikes confirmed, ${alreadyDisliked} already disliked/legacy, ${alreadySet} other rated, ${creatorBlocked} creator blocked, ${unavailable} unavailable, ${failed} failed.`
          : `Bulk Dislike finished. ${sentRequests} Dislikes confirmed, ${alreadyDisliked} already disliked/legacy, ${alreadySet} other rated, ${creatorBlocked} creator blocked, ${unavailable} unavailable, ${failed} failed.`);
    }
  }
}

async function bulkDislikeBlockedBots() {
  return runBlockedBulkDislike("remaining");
}

async function resetQuickDislikeLocalHistory() {
  quickDislikeHistoryState = { version: 1, bots: {} };
  quickDislikeBulkState = { version: 1, status: "idle", pendingIds: [], failedIds: [], startedAt: 0, updatedAt: Date.now(), currentId: "", lastMode: "remaining" };
  await storageSet({ [QUICK_DISLIKE_HISTORY_KEY]: quickDislikeHistoryState, [QUICK_DISLIKE_BULK_STATE_KEY]: quickDislikeBulkState });
  renderBotManager("blocked");
  updateBlockedBulkResumeControls();
  updateBlockedDislikeStatus();
}

async function resetAndRedoBlockedDislikes() {
  if (blockedBulkDislikeRunning) {
    showSettingsToast("Stop Bulk Dislike before resetting and redoing the history.");
    return;
  }
  await ensureBlockingDataLoaded();
  const blockedCount = blockedQuickDislikeCounts().total || 0;
  if (!blockedCount) {
    showSettingsToast("There are no blocked bots to reprocess.");
    return;
  }
  if (!window.confirm(`Clear local Dislike history and recheck blocked bots without an existing Less Like rating or confirmed unavailable status? This does NOT undo or repeat the shared negative rating for bots already handled by Less Like.`)) return;
  await resetQuickDislikeLocalHistory();
  showSettingsToast("Dislike history reset. Only bots not already rated by Less Like or confirmed unavailable will be processed.");
  await runBlockedBulkDislike("remaining");
}

async function clearBlockedDislikeHistory() {
  if (blockedBulkDislikeRunning) {
    showSettingsToast("Stop Bulk Dislike before clearing its handled history.");
    return;
  }
  await ensureBlockingDataLoaded();
  const counts = blockedQuickDislikeCounts();
  const totalHistory = Object.keys(quickDislikeHistoryState?.bots || {}).length;
  if (!totalHistory) {
    showSettingsToast("There is no handled dislike history to clear.");
    return;
  }
  if (!window.confirm(`Forget Quick/Bulk Dislike history for ${totalHistory} bot${totalHistory === 1 ? "" : "s"}? This does NOT undo SpicyChat's negative ratings. Bots previously handled by Less Like will remain covered and will not get another rating request.`)) return;
  await resetQuickDislikeLocalHistory();
  showSettingsToast("Dislike history cleared locally. Existing Less Like ratings still count as handled; no duplicate rating will be sent.");
}

function quickLessLikeFailureMeta(response) {
  return {
    status: String(response?.status || "failed").slice(0, 80),
    stage: String(response?.stage || "").slice(0, 80),
    reason: String(response?.reason || response?.error || "").slice(0, 300),
    httpStatus: Number(response?.httpStatus || 0) || 0,
    tokenAttempts: Number(response?.tokenAttempts || 0) || 0,
    networkAttempts: Number(response?.networkAttempts || 0) || 0,
    availabilityNetworkAttempts: Number(response?.availabilityNetworkAttempts || 0) || 0,
    availabilityConfirmed: !!response?.availabilityConfirmed,
    tokenSource: String(response?.tokenSource || "").slice(0, 80),
    requestSent: !!response?.requestSent,
    retryable: !!response?.retryable,
    retryAfterMs: Math.max(0, Number(response?.retryAfterMs || 0) || 0),
    throttleSignal: String(response?.throttleSignal || "").slice(0, 40),
    networkAmbiguous: !!response?.networkAmbiguous,
    feedbackTabsTried: Number(response?.feedbackTabsTried || 0) || 0,
    nativeSignedSamples: Number(response?.nativeSignedSamples || 0) || 0,
    workerRecovered: !!response?.workerRecovered,
    at: Date.now()
  };
}

function quickLessLikeFailureSummary(meta) {
  const status = String(meta?.status || "").trim();
  const stage = String(meta?.stage || "").trim();
  const reason = String(meta?.reason || "").trim();
  const bits = [];
  if (status) bits.push(status);
  if (stage && stage !== status) bits.push(stage);
  let text = bits.join("/");
  if (reason) text += `${text ? " — " : ""}${reason.slice(0, 140)}`;
  return text || "unknown Less Like failure";
}

function quickLessLikeHttpStatuses(response) {
  return [
    Number(response?.ratingHttpStatus || 0) || 0,
    Number(response?.availabilityHttpStatus || 0) || 0,
    Number(response?.httpStatus || 0) || 0
  ].filter(Boolean);
}

function quickLessLikeRetryDecision(response) {
  if (!response || response.ok) return { retryable: false, kind: "success", httpStatus: 0 };
  const status = String(response?.status || "failed");
  const statuses = quickLessLikeHttpStatuses(response);
  const http429 = statuses.find(value => value === 429) || 0;
  const http5xx = statuses.find(value => value >= 500 && value <= 599) || 0;

  // A confirmed missing bot is a terminal availability result, not a failed
  // request. Do not waste another API round-trip re-confirming the same 404.
  if (status === "bot-not-found" && response?.availabilityConfirmed) {
    return { retryable: false, kind: "unavailable", httpStatus: Number(response?.httpStatus || 0) || 0 };
  }

  // Explicit server responses are safe to retry: the server told us the write
  // did not succeed. This is intentionally different from an ambiguous fetch
  // exception after a POST may already have left the browser.
  if (http429) return { retryable: true, kind: "429", httpStatus: http429 };
  if (http5xx) return { retryable: true, kind: "5xx", httpStatus: http5xx };

  const mayHaveSentRating = !!response?.requestSent || Number(response?.networkAttempts || 0) > 0;
  if (mayHaveSentRating) {
    return { retryable: false, kind: "ambiguous-post", httpStatus: Number(response?.httpStatus || 0) || 0 };
  }

  if (response?.retryable === true || BULK_LESS_LIKE_TRANSIENT_STATUSES.has(status)) {
    return {
      retryable: true,
      kind: /network|timeout|offline/i.test(status) ? "network" : "transient",
      httpStatus: Number(response?.httpStatus || 0) || 0
    };
  }

  return { retryable: false, kind: "terminal", httpStatus: Number(response?.httpStatus || 0) || 0 };
}

function quickLessLikeResponseIsTransient(response) {
  return quickLessLikeRetryDecision(response).retryable;
}

function quickLessLikeMedian(values) {
  const nums = (Array.isArray(values) ? values : [])
    .map(Number)
    .filter(value => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (!nums.length) return 0;
  const middle = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[middle] : (nums[middle - 1] + nums[middle]) / 2;
}

function createQuickLessLikePacing(startIntervalMs, restored = {}) {
  const configured = Number(startIntervalMs || 0) || 750;
  const restoredInterval = Number(restored?.intervalMs || 0) || 0;
  const intervalMs = Math.min(
    BULK_LESS_LIKE_PACING.maxIntervalMs,
    Math.max(BULK_LESS_LIKE_PACING.minIntervalMs, restoredInterval || configured)
  );
  return {
    intervalMs,
    successStreak: Math.max(0, Number(restored?.successStreak || 0) || 0),
    backoffLevel: Math.max(0, Number(restored?.backoffLevel || 0) || 0),
    state: String(restored?.state || "warming").slice(0, 80) || "warming",
    http429: Math.max(0, Number(restored?.http429 || 0) || 0),
    http5xx: Math.max(0, Number(restored?.http5xx || 0) || 0),
    recentLatencies: [],
    recentMedianMs: Math.max(0, Number(restored?.recentMedianMs || 0) || 0)
  };
}

function snapshotQuickLessLikePacing(pacing) {
  return {
    intervalMs: Math.round(Number(pacing?.intervalMs || 0)),
    successStreak: Math.max(0, Number(pacing?.successStreak || 0) || 0),
    backoffLevel: Math.max(0, Number(pacing?.backoffLevel || 0) || 0),
    state: String(pacing?.state || "adaptive").slice(0, 80),
    http429: Math.max(0, Number(pacing?.http429 || 0) || 0),
    http5xx: Math.max(0, Number(pacing?.http5xx || 0) || 0),
    recentMedianMs: Math.round(Number(pacing?.recentMedianMs || 0) || 0)
  };
}

function noteQuickLessLikeAttemptOutcome(pacing, response) {
  if (!pacing) return;
  const decision = quickLessLikeRetryDecision(response);
  const ratingMs = Number(response?.ratingMs || 0) || 0;
  if (ratingMs > 0) {
    pacing.recentLatencies.push(ratingMs);
    if (pacing.recentLatencies.length > BULK_LESS_LIKE_PACING.latencyWindowSize) pacing.recentLatencies.shift();
    pacing.recentMedianMs = quickLessLikeMedian(pacing.recentLatencies);
  }

  if (decision.kind === "429") {
    pacing.http429 += 1;
    pacing.successStreak = 0;
    pacing.backoffLevel = Math.min(8, pacing.backoffLevel + 1);
    pacing.intervalMs = Math.min(
      BULK_LESS_LIKE_PACING.maxIntervalMs,
      Math.max(pacing.intervalMs + BULK_LESS_LIKE_PACING.transientStepUpMs, Math.ceil(pacing.intervalMs * BULK_LESS_LIKE_PACING.throttleMultiplier))
    );
    pacing.state = "throttled (429)";
    return;
  }

  if (decision.kind === "5xx") {
    pacing.http5xx += 1;
    pacing.successStreak = 0;
    pacing.backoffLevel = Math.min(8, pacing.backoffLevel + 1);
    pacing.intervalMs = Math.min(
      BULK_LESS_LIKE_PACING.maxIntervalMs,
      Math.max(pacing.intervalMs + BULK_LESS_LIKE_PACING.transientStepUpMs, Math.ceil(pacing.intervalMs * BULK_LESS_LIKE_PACING.serverErrorMultiplier))
    );
    pacing.state = "server backoff (5xx)";
    return;
  }

  if (["network", "ambiguous-post"].includes(decision.kind) || /network|timeout/i.test(String(response?.status || ""))) {
    pacing.successStreak = 0;
    pacing.backoffLevel = Math.min(8, pacing.backoffLevel + 1);
    pacing.intervalMs = Math.min(BULK_LESS_LIKE_PACING.maxIntervalMs, pacing.intervalMs + BULK_LESS_LIKE_PACING.transientStepUpMs);
    pacing.state = decision.kind === "ambiguous-post" ? "cautious after ambiguous POST" : "network backoff";
    return;
  }

  const ratingStatus = Number(response?.ratingHttpStatus || response?.httpStatus || 0) || 0;
  const successfulRating = !!response?.ok && String(response?.status || "") === "less-liked" && ratingStatus >= 200 && ratingStatus <= 299;
  if (successfulRating) {
    pacing.backoffLevel = 0;
    pacing.successStreak += 1;
    pacing.state = pacing.intervalMs > BULK_LESS_LIKE_PACING.minIntervalMs ? "adaptive warm-up" : "adaptive steady";
    if (pacing.successStreak >= BULK_LESS_LIKE_PACING.successWindow) {
      pacing.successStreak = 0;
      pacing.intervalMs = Math.max(BULK_LESS_LIKE_PACING.minIntervalMs, pacing.intervalMs - BULK_LESS_LIKE_PACING.successStepDownMs);
      pacing.state = pacing.intervalMs > BULK_LESS_LIKE_PACING.minIntervalMs ? "adaptive faster" : "adaptive steady";
    }
    return;
  }

  if (response?.ok) {
    // Unavailable/already-handled outcomes are not evidence that the rating
    // endpoint can safely be driven faster, but they also are not throttle signals.
    pacing.state = pacing.intervalMs > BULK_LESS_LIKE_PACING.minIntervalMs ? "adaptive" : "adaptive steady";
  } else {
    pacing.successStreak = 0;
  }
}

function quickLessLikeRetryBackoffMs(response, retryIndex) {
  const requested = Math.max(0, Number(response?.retryAfterMs || 0) || 0);
  const exponential = Math.min(
    BULK_LESS_LIKE_PACING.retryMaxMs,
    BULK_LESS_LIKE_PACING.retryBaseMs * (2 ** Math.max(0, Number(retryIndex || 0)))
  );
  return Math.min(BULK_LESS_LIKE_PACING.retryMaxMs, Math.max(requested, exponential));
}

async function waitQuickLessLikeDelay(ms) {
  let remaining = Math.max(0, Number(ms || 0));
  while (remaining > 0) {
    if (blockedBulkLessLikeStopRequested || quickLessLikeBulkState?.stopRequested) return false;
    const slice = Math.min(150, remaining);
    await new Promise(resolve => setTimeout(resolve, slice));
    remaining -= slice;
  }
  return !(blockedBulkLessLikeStopRequested || quickLessLikeBulkState?.stopRequested);
}

function formatQuickLessLikeDuration(ms) {
  const totalSeconds = Math.max(0, Math.round((Number(ms || 0) || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function renderQuickLessLikeJobStats(stats, pacing, { force = false, note = "" } = {}) {
  if (!stats) return;
  const now = Date.now();
  if (!force && now - Number(stats.lastUiAt || 0) < BULK_LESS_LIKE_PACING.uiUpdateEveryMs) return;
  stats.lastUiAt = now;
  const elapsedMs = Math.max(0, now - Number(stats.startedAt || now));
  const queuePosition = Math.max(0, Number(stats.queuePosition || 0));
  const total = Math.max(0, Number(stats.total || 0));
  const remaining = Math.max(0, total - queuePosition);
  const perItemMs = queuePosition > 0 ? elapsedMs / queuePosition : 0;
  const etaMs = queuePosition >= 3 && perItemMs > 0 ? remaining * perItemMs : 0;
  const duplicateText = Number(stats.duplicates || 0) ? ` (${stats.duplicates} dup)` : "";
  const overall = blockedQuickLessLikeCounts();
  const parts = [
    `${queuePosition}/${total} queue`,
    `${Number(stats.attempted || 0)} attempted`,
    `${Number(stats.succeeded || 0)} succeeded`,
    `${Number(stats.failed || 0)} failed`,
    `${Number(stats.retried || 0)} retried`,
    `${Number(stats.skipped || 0)} skipped${duplicateText}`,
    `${overall.handled}/${overall.total} total handled`,
    `${overall.remaining} total remaining`,
    `${formatQuickLessLikeDuration(elapsedMs)} elapsed`,
    etaMs ? `ETA ${formatQuickLessLikeDuration(etaMs)}` : "ETA —",
    `${Math.round(Number(pacing?.intervalMs || 0))} ms interval`,
    String(pacing?.state || "adaptive"),
    "batch cooldown none",
    `POST med ${Math.round(Number(pacing?.recentMedianMs || 0)) || "—"} ms`,
    `429 ${Number(pacing?.http429 || 0)}`,
    `5xx ${Number(pacing?.http5xx || 0)}`
  ];
  if (note) parts.unshift(note);
  updateBlockedLessLikeStatus(parts.join(" · "));
}

async function runQuickLessLikeWithBackoff(payload, label = "", pacing = null, stats = null) {
  let response = null;
  for (let attempt = 0; attempt <= BULK_LESS_LIKE_PACING.retryLimit; attempt += 1) {
    if (navigator.onLine === false) return { ok: false, status: "offline-paused" };
    if (blockedBulkLessLikeStopRequested || quickLessLikeBulkState?.stopRequested) return { ok: false, status: "bulk-canceled" };

    if (attempt > 0) {
      if (stats) stats.retried += 1;
      const wait = quickLessLikeRetryBackoffMs(response, attempt - 1);
      if (pacing) pacing.state = `retry backoff ${formatQuickLessLikeDuration(wait)}`;
      renderQuickLessLikeJobStats(stats, pacing, {
        force: true,
        note: `Retrying ${label || payload.botName || payload.botId} · attempt ${attempt + 1}/${BULK_LESS_LIKE_PACING.retryLimit + 1}`
      });
      if (!(await waitQuickLessLikeDelay(wait))) return { ok: false, status: "bulk-canceled" };
      if (navigator.onLine === false) return { ok: false, status: "offline-paused" };
      if (pacing) pacing.state = "adaptive";
    }

    try {
      response = await runtimeMessage({ ...payload, retryAttempt: attempt });
    } catch (error) {
      response = {
        ok: false,
        status: "worker-error",
        stage: "runtime-message",
        retryable: true,
        requestSent: false,
        reason: String(error?.message || error || "Less Like API feedback failed")
      };
    }

    noteQuickLessLikeAttemptOutcome(pacing, response);
    const decision = quickLessLikeRetryDecision(response);
    if (!decision.retryable || attempt >= BULK_LESS_LIKE_PACING.retryLimit) {
      return response || { ok: false, status: "worker-error" };
    }
  }
  return response || { ok: false, status: "worker-error" };
}

function applyQuickLessLikeResponseToLocalHistory(id, name, response) {
  const botId = String(id || "").trim();
  if (!botId || !response?.ok) return "";
  const status = response.status === "already-handled" ? String(response.rememberedStatus || "") : String(response.status || "");
  if (!["less-liked", "unavailable"].includes(status)) return "";
  quickLessLikeHistoryState = normalizeQuickLessLikeHistory(quickLessLikeHistoryState);
  quickLessLikeHistoryState.bots[botId] = {
    status,
    name: String(name || quickLessLikeHistoryState.bots[botId]?.name || "").slice(0, 160),
    handledAt: Number(response.handledAt || 0) || Date.now(),
    stage: String(response.stage || "").slice(0, 80),
    reason: String(response.reason || "").slice(0, 300),
    httpStatus: Number(response.httpStatus || 0) || 0
  };
  return status;
}

async function refreshQuickLessLikeHistoryState() {
  const result = await storageGet([QUICK_LESS_LIKE_HISTORY_KEY, QUICK_LESS_LIKE_BULK_STATE_KEY]);
  quickLessLikeHistoryState = normalizeQuickLessLikeHistory(result[QUICK_LESS_LIKE_HISTORY_KEY]);
  quickLessLikeBulkState = normalizeQuickLessLikeBulkState(result[QUICK_LESS_LIKE_BULK_STATE_KEY]);
  updateBlockedLessLikeResumeControls();
  return quickLessLikeHistoryState;
}

function buildBlockedLessLikeCandidates(mode = "remaining") {
  const blockedRaw = Array.isArray(blockedState?.ids) ? blockedState.ids : [];
  const blockedSet = new Set(blockedRaw.map(id => String(id || "").trim().toLowerCase()).filter(validBotId));
  let raw = blockedRaw;
  if (mode === "selected") raw = [...botManagerBulkSet("blocked")];
  else if (mode === "resume") raw = [quickLessLikeBulkState.currentId, ...(quickLessLikeBulkState.pendingIds || [])];
  else if (mode === "failed") raw = quickLessLikeBulkState.failedIds || [];

  const ids = [];
  const seen = new Set();
  let duplicates = 0;
  let skipped = 0;
  for (const value of raw) {
    const id = String(value || "").trim().toLowerCase();
    if (!id) continue;
    if (seen.has(id)) { duplicates += 1; continue; }
    seen.add(id);
    if (!validBotId(id) || !blockedSet.has(id) || quickLessLikeHistoryEntry(id)) { skipped += 1; continue; }
    ids.push(id);
  }
  return { ids, duplicates, skipped };
}

function blockedLessLikeCandidateIds(mode = "remaining") {
  return buildBlockedLessLikeCandidates(mode).ids;
}

function updateBlockedLessLikeResumeControls() {
  const resume = $("resumeBlockedLessLikeRun");
  const retry = $("retryFailedBlockedLessLikes");
  if (!resume || !retry) return;
  const resumeCount = blockedLessLikeCandidateIds("resume").length;
  const failedCount = blockedLessLikeCandidateIds("failed").length;
  const interrupted = ["running", "paused", "interrupted"].includes(quickLessLikeBulkState?.status);
  resume.hidden = !(interrupted && resumeCount);
  resume.textContent = resumeCount ? `Resume unfinished (${resumeCount})` : "Resume unfinished";
  retry.hidden = !failedCount;
  retry.textContent = failedCount ? `Retry last failed (${failedCount})` : "Retry last failed";
}

async function runBlockedBulkLessLike(mode = "remaining") {
  const button = $("bulkLessLikeBlockedBots");
  const clearButton = $("clearBlockedLessLikeHistory");

  if (blockedBulkLessLikeRunning) {
    blockedBulkLessLikeStopRequested = true;
    const runId = activeBlockedBulkLessLikeRunId || quickLessLikeBulkState?.runId || "";
    if (button) button.textContent = "Stopping after current bot...";
    updateBlockedLessLikeStatus("Stopping after the current bot...");
    if (runId) await runtimeMessage({ type: "DS_QUICK_LESS_LIKE_CANCEL_BULK", bulkRunId: runId });
    await persistQuickLessLikeBulkState({ ...quickLessLikeBulkState, status: "paused", runId, stopRequested: true });
    return;
  }

  if (optionsLooksMobile()) {
    showSettingsToast("Bulk Stop recommending is desktop-browser only for now.");
    return;
  }

  blockedBulkLessLikeRunning = true;
  blockedBulkLessLikeStopRequested = false;
  const previousJobId = String(quickLessLikeBulkState?.jobId || "").trim();
  const jobId = mode === "resume" && previousJobId
    ? previousJobId
    : `blocked-less-like-job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const runId = `blocked-less-like-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  activeBlockedBulkLessLikeRunId = runId;
  if (button) button.textContent = "Stop after current bot";
  if (clearButton) clearButton.disabled = true;

  let updated = 0;
  let unavailable = 0;
  let failed = 0;
  let processed = 0;
  let consecutiveWorkerFailures = 0;
  let consecutiveAccessFailures = 0;
  let autoPausedAfterFailures = false;
  const failedIds = [];
  const setFailure = (id, response) => {
    quickLessLikeBulkState = normalizeQuickLessLikeBulkState(quickLessLikeBulkState);
    quickLessLikeBulkState.failureMeta = { ...(quickLessLikeBulkState.failureMeta || {}), [id]: quickLessLikeFailureMeta(response) };
  };
  const clearFailure = id => {
    quickLessLikeBulkState = normalizeQuickLessLikeBulkState(quickLessLikeBulkState);
    if (quickLessLikeBulkState.failureMeta?.[id]) {
      quickLessLikeBulkState.failureMeta = { ...quickLessLikeBulkState.failureMeta };
      delete quickLessLikeBulkState.failureMeta[id];
    }
  };

  let candidates = [];
  let candidateInfo = { ids: [], duplicates: 0, skipped: 0 };
  let startedAt = Date.now();
  const activeStartedAt = Date.now();
  let availabilityDirty = false;
  let lessLikeFeedbackTabId = 0;
  let lessLikeRunTelemetryStarted = false;
  let nextQueueIndex = 0;
  let lastCheckpointAt = 0;
  let lastCheckpointProcessed = 0;
  let pacing = null;
  let stats = null;

  const checkpoint = async ({ force = false, status = "running", currentId = "", nextIndex = nextQueueIndex, stopRequested = false } = {}) => {
    if (!candidates.length) return false;
    const now = Date.now();
    const dueByItems = processed - lastCheckpointProcessed >= BULK_LESS_LIKE_PACING.checkpointEveryItems;
    const dueByTime = now - lastCheckpointAt >= BULK_LESS_LIKE_PACING.checkpointEveryMs;
    if (!force && !dueByItems && !dueByTime) return false;
    const safeNext = Math.max(0, Math.min(candidates.length, Number(nextIndex || 0)));
    quickLessLikeBulkState = normalizeQuickLessLikeBulkState({
      ...quickLessLikeBulkState,
      version: 2,
      status,
      pendingIds: candidates.slice(safeNext),
      failedIds: uniqueClean([...(quickLessLikeBulkState.failedIds || []), ...failedIds]),
      failureMeta: quickLessLikeBulkState.failureMeta,
      startedAt,
      currentId,
      lastMode: mode,
      runId,
      jobId,
      stopRequested,
      totalBots: candidates.length,
      nextQueuePosition: safeNext,
      attempted: Number(stats?.attempted || 0),
      succeeded: Number(stats?.succeeded || 0),
      failedCount: Number(stats?.failed || 0),
      retried: Number(stats?.retried || 0),
      skipped: Number(stats?.skipped || 0),
      pacing: snapshotQuickLessLikePacing(pacing)
    });
    await persistQuickLessLikeBulkState(quickLessLikeBulkState);
    lastCheckpointAt = Date.now();
    lastCheckpointProcessed = processed;
    return true;
  };

  try {
    await ensureSavedListsDataLoaded();
    await refreshQuickLessLikeHistoryState();
    if (blockedBulkLessLikeStopRequested) return;

    candidateInfo = buildBlockedLessLikeCandidates(mode);
    candidates = candidateInfo.ids;
    if (!candidates.length) {
      updateBlockedLessLikeStatus();
      const message = mode === "failed"
        ? "There are no failed Stop recommending actions left to retry."
        : mode === "resume"
          ? "There is no unfinished Stop recommending run to resume."
          : mode === "selected"
            ? "Select at least one blocked bot that has not been processed by Stop recommending yet."
            : ((blockedState?.ids || []).length ? "All blocked bot IDs already have Stop recommending history." : "No blocked bot IDs are available.");
      showSettingsToast(message);
      return;
    }

    const restoredPacing = mode === "resume" ? (quickLessLikeBulkState?.pacing || {}) : {};
    const configuredStartMs = Math.min(
      BULK_LESS_LIKE_PACING.maxIntervalMs,
      Math.max(BULK_LESS_LIKE_PACING.minIntervalMs, Number(value("blockedBulkDislikeDelayMs", "750")) || 750)
    );
    pacing = createQuickLessLikePacing(configuredStartMs, restoredPacing);
    startedAt = mode === "resume" && quickLessLikeBulkState.startedAt ? quickLessLikeBulkState.startedAt : Date.now();
    stats = {
      jobId,
      total: candidates.length,
      queuePosition: 0,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      skipped: Number(candidateInfo.skipped || 0) + Number(candidateInfo.duplicates || 0),
      duplicates: Number(candidateInfo.duplicates || 0),
      startedAt: activeStartedAt,
      lastUiAt: 0
    };

    await persistQuickLessLikeBulkState({
      version: 2,
      status: "running",
      pendingIds: candidates,
      failedIds: mode === "failed" ? [] : uniqueClean(quickLessLikeBulkState.failedIds || []),
      failureMeta: { ...(quickLessLikeBulkState.failureMeta || {}) },
      startedAt,
      currentId: "",
      lastMode: mode,
      runId,
      jobId,
      stopRequested: false,
      totalBots: candidates.length,
      nextQueuePosition: 0,
      attempted: 0,
      succeeded: 0,
      failedCount: 0,
      retried: 0,
      skipped: stats.skipped,
      pacing: snapshotQuickLessLikePacing(pacing)
    });
    lastCheckpointAt = Date.now();

    updateBlockedLessLikeStatus("Preparing one background recommendation helper…");
    const helperPrepareStartedAt = performance.now?.() || Date.now();
    const helperReady = await runtimeMessage({ type: "DS_QUICK_LESS_LIKE_PREPARE_BULK", bulkRunId: runId, jobId });
    const helperReadyMs = Math.max(0, (performance.now?.() || Date.now()) - helperPrepareStartedAt);
    lessLikeFeedbackTabId = Number(helperReady?.tabId || 0);
    if (!helperReady?.ready) {
      blockedBulkLessLikeStopRequested = true;
      await checkpoint({ force: true, status: "paused", currentId: "", nextIndex: 0, stopRequested: true });
      const helperStatus = String(helperReady?.status || "recommendation-worker-not-ready");
      updateBlockedLessLikeStatus(helperStatus === "recommendation-worker-closed"
        ? "Stop recommending paused: the recommendation helper tab was closed. Click Resume to recreate it."
        : "Stop recommending paused: SpicyChat Home did not expose a ready recommendation/auth context. Click Resume to try the helper again.");
      return;
    }

    pacing.state = "adaptive warm-up";
    renderQuickLessLikeJobStats(stats, pacing, { force: true, note: "Recommendation helper ready" });
    if (lessLikeFeedbackTabId) {
      await runtimeMessage({
        type: "DS_QUICK_LESS_LIKE_RUN_TIMING",
        feedbackTabId: lessLikeFeedbackTabId,
        runId,
        phase: "start",
        timing: {
          helperReadyMs: Math.round(helperReadyMs * 10) / 10,
          configuredDelayMs: configuredStartMs,
          currentIntervalMs: Math.round(pacing.intervalMs),
          minIntervalMs: BULK_LESS_LIKE_PACING.minIntervalMs
        },
        meta: {
          jobId,
          mode,
          queued: candidates.length,
          duplicatesSkipped: candidateInfo.duplicates,
          preSkipped: candidateInfo.skipped,
          workerStatus: String(helperReady?.status || "")
        }
      }).catch?.(() => null);
      lessLikeRunTelemetryStarted = true;
    }

    for (let index = 0; index < candidates.length; index += 1) {
      nextQueueIndex = index;
      if (blockedBulkLessLikeStopRequested || quickLessLikeBulkState?.stopRequested) break;
      const id = candidates[index];

      // A stale resume checkpoint can contain items already committed to the
      // per-success Less Like history. Skip them instead of issuing the rating
      // again; this is the crash/reload de-duplication safety net.
      if (quickLessLikeHistoryEntry(id) || !(blockedState?.ids || []).includes(id)) {
        processed += 1;
        stats.skipped += 1;
        stats.queuePosition = index + 1;
        nextQueueIndex = index + 1;
        await checkpoint({ nextIndex: nextQueueIndex });
        renderQuickLessLikeJobStats(stats, pacing);
        continue;
      }

      processed += 1;
      stats.queuePosition = index + 1;
      const meta = blockedState?.meta?.[id] || {};
      const name = String(meta.name || "").trim();
      quickLessLikeBulkState.currentId = id;
      quickLessLikeBulkState.nextQueuePosition = index;
      quickLessLikeBulkState.pacing = snapshotQuickLessLikePacing(pacing);
      renderQuickLessLikeJobStats(stats, pacing, { note: `Processing ${name || id}` });
      const itemStartedAt = performance.now?.() || Date.now();

      if (!BOT_ID_RE.test(id)) {
        failed += 1;
        stats.failed += 1;
        stats.skipped += 1;
        failedIds.push(id);
        setFailure(id, { status: "invalid-bot", stage: "local-validation", reason: "Saved record has no valid SpicyChat bot ID." });
        nextQueueIndex = index + 1;
        await checkpoint({ nextIndex: nextQueueIndex });
        renderQuickLessLikeJobStats(stats, pacing);
        continue;
      }

      stats.attempted += 1;
      const response = await runQuickLessLikeWithBackoff({
        type: "DS_QUICK_LESS_LIKE_BOT",
        botId: id,
        botName: name,
        bulkRunId: runId,
        jobId
      }, name || id, pacing, stats);

      if (isRepeatedAuthOrCorsError(response)) {
        consecutiveAccessFailures += 1;
        if (consecutiveAccessFailures >= BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD) {
          blockedBulkLessLikeStopRequested = true;
          autoPausedAfterFailures = true;
          await checkpoint({ force: true, status: "paused", currentId: "", nextIndex: index, stopRequested: true });
          updateBlockedLessLikeStatus("Less Like paused after 3 consecutive 401/CORS errors. The current item and remaining queue were preserved for Resume.");
          break;
        }
      } else consecutiveAccessFailures = 0;

      if (["recommendation-worker-closed", "recommendation-worker-not-ready", "recommendation-worker-wrong-page", "recommendation-worker-navigation-failed", "recommendation-worker-create-failed", "recommendation-worker-error"].includes(String(response?.status || ""))) {
        blockedBulkLessLikeStopRequested = true;
        await checkpoint({ force: true, status: "paused", currentId: "", nextIndex: index, stopRequested: true });
        updateBlockedLessLikeStatus(response?.status === "recommendation-worker-closed"
          ? "Stop recommending paused: the recommendation helper tab was closed. Click Resume to recreate it."
          : "Stop recommending paused: the recommendation helper is not ready. Click Resume to reload SpicyChat Home and continue.");
        break;
      }
      if (response?.status === "spicychat-tab-required") {
        blockedBulkLessLikeStopRequested = true;
        await checkpoint({ force: true, status: "paused", currentId: "", nextIndex: index, stopRequested: true });
        updateBlockedLessLikeStatus("Stop recommending paused: the recommendation helper could not be created. Click Resume to try again.");
        break;
      }
      if (response?.status === "offline-paused") {
        blockedBulkLessLikeStopRequested = true;
        await checkpoint({ force: true, status: "paused", currentId: "", nextIndex: index, stopRequested: true });
        updateBlockedLessLikeStatus("Stop recommending paused because the browser is offline. Resume when the connection is back.");
        break;
      }
      if (response?.status === "bulk-canceled") {
        blockedBulkLessLikeStopRequested = true;
        await checkpoint({ force: true, status: "paused", currentId: "", nextIndex: index, stopRequested: true });
        break;
      }

      if (response?.availabilityConfirmed) {
        const previousAvailability = normalizeBotAvailability(botAvailabilityState).meta[id] || {};
        const directStatus = response?.status === "unavailable" ? "unavailable" : "available";
        botAvailabilityState.meta[id] = {
          ...previousAvailability,
          id,
          name: name || previousAvailability.name || id,
          profileUrl: `https://spicychat.ai/chatbot/${id}`,
          sources: uniqueClean([...(previousAvailability.sources || []), "blocked"]),
          checkedAt: Date.now(),
          httpStatus: Number(response?.httpStatus || 0) || 0,
          status: directStatus,
          reason: directStatus === "available"
            ? "Less Like preflight confirmed this bot through SpicyChat's character API."
            : (response?.reason || "SpicyChat's character API confirmed this bot is unavailable.")
        };
        availabilityDirty = true;
        if (processed % BULK_LESS_LIKE_PACING.availabilityCheckpointEvery === 0) {
          await storageSet({ [BOT_AVAILABILITY_KEY]: normalizeBotAvailability(botAvailabilityState) });
          availabilityDirty = false;
        }
      }

      const handledStatus = applyQuickLessLikeResponseToLocalHistory(id, name, response);
      const remembered = !!handledStatus;
      if (handledStatus === "less-liked") {
        updated += 1;
        stats.succeeded += 1;
        clearFailure(id);
      } else if (handledStatus === "unavailable") {
        unavailable += 1;
        stats.skipped += 1;
        clearFailure(id);
      } else {
        failed += 1;
        stats.failed += 1;
        failedIds.push(id);
        setFailure(id, response);
      }

      if (remembered) consecutiveWorkerFailures = 0;
      else if (quickLessLikeResponseIsTransient(response)) {
        consecutiveWorkerFailures += 1;
        if (consecutiveWorkerFailures >= BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD) {
          autoPausedAfterFailures = true;
          blockedBulkLessLikeStopRequested = true;
        }
      } else {
        consecutiveWorkerFailures = 0;
      }

      nextQueueIndex = index + 1;
      quickLessLikeBulkState.currentId = "";
      quickLessLikeBulkState.nextQueuePosition = nextQueueIndex;
      quickLessLikeBulkState.attempted = stats.attempted;
      quickLessLikeBulkState.succeeded = stats.succeeded;
      quickLessLikeBulkState.failedCount = stats.failed;
      quickLessLikeBulkState.retried = stats.retried;
      quickLessLikeBulkState.skipped = stats.skipped;
      quickLessLikeBulkState.pacing = snapshotQuickLessLikePacing(pacing);
      if (quickLessLikeBulkState?.stopRequested) blockedBulkLessLikeStopRequested = true;
      await checkpoint({
        // A failed/ambiguous action must be checkpointed immediately so a
        // browser crash cannot silently move it back into the automatic resume
        // queue. Successful actions are protected separately by the compact
        // per-success journal written by the background worker.
        force: blockedBulkLessLikeStopRequested || !remembered,
        status: blockedBulkLessLikeStopRequested ? "paused" : "running",
        currentId: "",
        nextIndex: nextQueueIndex,
        stopRequested: blockedBulkLessLikeStopRequested
      });

      renderQuickLessLikeJobStats(stats, pacing);
      const itemBeforeDelayMs = Math.max(0, (performance.now?.() || Date.now()) - itemStartedAt);
      if (response?.feedbackTabId) {
        runtimeMessage({
          type: "DS_QUICK_LESS_LIKE_CLIENT_TIMING",
          feedbackTabId: Number(response.feedbackTabId || 0),
          botId: id,
          timing: {
            configuredDelayMs: configuredStartMs,
            currentIntervalMs: Math.round(pacing.intervalMs),
            pacingState: String(pacing.state || ""),
            itemBeforeDelayMs: Math.round(itemBeforeDelayMs * 10) / 10,
            workerReadyMs: Number(response.workerReadyMs || 0),
            coordinatorWaitMs: Number(response.coordinatorWaitMs || 0),
            feedbackMs: Number(response.feedbackMs || response.elapsedMs || 0),
            availabilityMs: Number(response.availabilityMs || 0),
            ratingMs: Number(response.ratingMs || 0),
            userLookupMs: Number(response.userLookupMs || 0),
            requestElapsedMs: Number(response.elapsedMs || 0),
            historyPersistMs: Number(response.historyPersistMs || 0),
            backgroundTotalMs: Number(response.totalMs || 0),
            recentMedianRequestMs: Number(pacing.recentMedianMs || 0),
            retries: Number(response.retryAttempt || 0),
            http429: pacing.http429,
            http5xx: pacing.http5xx,
            status: String(response.status || "")
          }
        }).catch?.(() => null);
      }

      if (blockedBulkLessLikeStopRequested) break;
      if (index < candidates.length - 1 && pacing.intervalMs > 0) {
        pacing.state = pacing.intervalMs > BULK_LESS_LIKE_PACING.minIntervalMs ? "adaptive pacing" : "adaptive steady";
        if (!(await waitQuickLessLikeDelay(pacing.intervalMs))) {
          blockedBulkLessLikeStopRequested = true;
          break;
        }
      }
    }
  } finally {
    if (availabilityDirty) {
      try { await storageSet({ [BOT_AVAILABILITY_KEY]: normalizeBotAvailability(botAvailabilityState) }); } catch {}
      availabilityDirty = false;
    }

    const stopped = blockedBulkLessLikeStopRequested || !!quickLessLikeBulkState?.stopRequested;
    if (stopped && candidates.length && stats && pacing) {
      try {
        await checkpoint({ force: true, status: "paused", currentId: "", nextIndex: nextQueueIndex, stopRequested: true });
      } catch {}
    }

    blockedBulkLessLikeRunning = false;
    blockedBulkLessLikeStopRequested = false;
    activeBlockedBulkLessLikeRunId = "";
    if (lessLikeRunTelemetryStarted && lessLikeFeedbackTabId) {
      await runtimeMessage({
        type: "DS_QUICK_LESS_LIKE_RUN_TIMING",
        feedbackTabId: lessLikeFeedbackTabId,
        runId,
        phase: "end",
        timing: {
          totalRunMs: Math.max(0, Date.now() - activeStartedAt),
          currentIntervalMs: Math.round(Number(pacing?.intervalMs || 0)),
          recentMedianRequestMs: Math.round(Number(pacing?.recentMedianMs || 0))
        },
        meta: {
          jobId,
          processed,
          attempted: Number(stats?.attempted || 0),
          sent: updated,
          unavailable,
          failed,
          retried: Number(stats?.retried || 0),
          skipped: Number(stats?.skipped || 0),
          duplicates: Number(stats?.duplicates || 0),
          http429: Number(pacing?.http429 || 0),
          http5xx: Number(pacing?.http5xx || 0),
          stopped: !!stopped
        }
      }).catch?.(() => null);
    }
    if (runId) await runtimeMessage({ type: "DS_QUICK_LESS_LIKE_RELEASE_BULK", bulkRunId: runId }).catch?.(() => null);

    const localFailureMeta = { ...(quickLessLikeBulkState.failureMeta || {}) };
    await refreshQuickLessLikeHistoryState();
    quickLessLikeBulkState.failureMeta = localFailureMeta;
    const remainingFromQueue = stopped
      ? candidates.slice(Math.max(0, Math.min(candidates.length, nextQueueIndex))).filter(id => !quickLessLikeHistoryEntry(id) && (blockedState?.ids || []).includes(id))
      : [];
    const finalFailed = uniqueClean([...(quickLessLikeBulkState.failedIds || []), ...failedIds]).filter(id => !quickLessLikeHistoryEntry(id));
    const finalFailedSet = new Set(finalFailed);
    const finalFailureMeta = Object.fromEntries(Object.entries(quickLessLikeBulkState.failureMeta || {}).filter(([id]) => finalFailedSet.has(id)));
    await persistQuickLessLikeBulkState({
      ...quickLessLikeBulkState,
      version: 2,
      status: stopped && remainingFromQueue.length ? "paused" : (finalFailed.length ? "completed-with-failures" : "completed"),
      currentId: "",
      pendingIds: stopped ? remainingFromQueue : [],
      failedIds: finalFailed,
      failureMeta: finalFailureMeta,
      startedAt,
      runId: "",
      jobId,
      stopRequested: false,
      totalBots: candidates.length,
      nextQueuePosition: stopped ? Math.max(0, Math.min(candidates.length, nextQueueIndex)) : candidates.length,
      attempted: Number(stats?.attempted || 0),
      succeeded: Number(stats?.succeeded || 0),
      failedCount: Number(stats?.failed || 0),
      retried: Number(stats?.retried || 0),
      skipped: Number(stats?.skipped || 0),
      pacing: snapshotQuickLessLikePacing(pacing)
    });
    if (clearButton) clearButton.disabled = false;
    renderBotManager("blocked");
    updateBlockedLessLikeActionState();
    if (stats && pacing) renderQuickLessLikeJobStats(stats, pacing, { force: true, note: stopped ? "Paused" : "Finished" });
    else updateBlockedLessLikeStatus();
    if (candidates.length) {
      showSettingsToast(autoPausedAfterFailures
        ? `Stop recommending paused after ${BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD} consecutive transient failures (including authentication/CORS). Remaining bots were kept for Resume.`
        : stopped
          ? `Stop recommending stopped. ${updated} sent, ${unavailable} unavailable, ${failed} failed.`
          : `Stop recommending finished. ${updated} sent, ${unavailable} unavailable, ${failed} failed.`);
    }
  }
}

async function bulkLessLikeBlockedBots() {
  return runBlockedBulkLessLike("remaining");
}

async function resetQuickLessLikeLocalHistory() {
  quickLessLikeHistoryState = { version: 1, bots: {} };
  quickLessLikeBulkState = { version: 2, status: "idle", pendingIds: [], failedIds: [], failureMeta: {}, startedAt: 0, updatedAt: Date.now(), currentId: "", lastMode: "remaining", totalBots: 0, nextQueuePosition: 0, attempted: 0, succeeded: 0, failedCount: 0, retried: 0, skipped: 0, pacing: {} };
  await storageSet({ [QUICK_LESS_LIKE_HISTORY_KEY]: quickLessLikeHistoryState, [QUICK_LESS_LIKE_BULK_STATE_KEY]: quickLessLikeBulkState });
  renderBotManager("blocked");
  updateBlockedLessLikeResumeControls();
  updateBlockedLessLikeStatus();
}

async function resetAndRedoBlockedLessLikes() {
  if (blockedBulkLessLikeRunning) {
    showSettingsToast("Stop the current Stop recommending run before resetting its history.");
    return;
  }
  await ensureBlockingDataLoaded();
  const blockedCount = blockedQuickLessLikeCounts().total || 0;
  if (!blockedCount) { showSettingsToast("There are no blocked bots to reprocess."); return; }
  if (!window.confirm(`Reset the local Stop recommending handled log, then send Less Like This again for all ${blockedCount} currently blocked bot${blockedCount === 1 ? "" : "s"}? This does not undo earlier SpicyChat recommendation feedback first.`)) return;
  await resetQuickLessLikeLocalHistory();
  showSettingsToast("Stop recommending history reset. Starting a fresh pass over all blocked bots…");
  await runBlockedBulkLessLike("remaining");
}

async function clearBlockedLessLikeHistory() {
  if (blockedBulkLessLikeRunning) {
    showSettingsToast("Stop the current Stop recommending run before clearing its handled history.");
    return;
  }
  await ensureBlockingDataLoaded();
  const counts = blockedQuickLessLikeCounts();
  const totalHistory = Object.keys(quickLessLikeHistoryState?.bots || {}).length;
  if (!totalHistory) { showSettingsToast("There is no Stop recommending history to clear."); return; }
  if (!window.confirm(`Forget Stop recommending history for ${totalHistory} bot${totalHistory === 1 ? "" : "s"}? ${counts.handled} of them are currently blocked. This does not undo feedback already sent to SpicyChat.`)) return;
  await resetQuickLessLikeLocalHistory();
  showSettingsToast("Stop recommending history cleared. Those bots can be processed again.");
}
